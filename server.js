const express = require('express');
const { Pool } = require('pg');
const crypto = require('crypto');
const session = require('express-session');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

if (!process.env.ADMIN_PASSWORD ||
    !process.env.DATABASE_URL ||
    !process.env.SESSION_SECRET) {
  throw new Error('Faltan variables de entorno requeridas.');
}

app.set('trust proxy', 1);
app.use(express.json({ limit: '10kb' }));
app.use(express.static(path.join(__dirname, 'public')));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true'
    ? { rejectUnauthorized: false }
    : undefined
});

app.use(session({
  name: 'licencias.sid',
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: 'auto',
    sameSite: 'lax',
    maxAge: 2 * 60 * 60 * 1000
  }
}));

async function prepararDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS licencias (
      id BIGSERIAL PRIMARY KEY,
      clave_hash TEXT UNIQUE NOT NULL,
      vence_en TIMESTAMPTZ NOT NULL,
      creada_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

function hashClave(clave) {
  return crypto.createHash('sha256')
    .update(clave.trim())
    .digest('hex');
}

function requiereSesion(req, res, next) {
  if (req.session && req.session.admin === true) {
    return next();
  }
  return res.status(401).json({ error: 'Debes iniciar sesión.' });
}

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/estado-db', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true });
  } catch (error) {
    console.error('Error de base de datos:', error.message);
    res.status(500).json({ ok: false });
  }
});

app.post('/api/login', (req, res, next) => {
  const { password } = req.body || {};

  if (typeof password !== 'string' ||
      password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({
      error: 'Contraseña incorrecta.'
    });
  }

  req.session.regenerate((error) => {
    if (error) return next(error);

    req.session.admin = true;
    req.session.save((saveError) => {
      if (saveError) return next(saveError);
      res.json({ ok: true });
    });
  });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('licencias.sid');
    res.json({ ok: true });
  });
});

// Crear una licencia desde el panel.
app.post('/api/licencias', requiereSesion, async (req, res) => {
  try {
    const { cantidad, unidad } = req.body || {};
    const n = Number(cantidad);

    if (!Number.isInteger(n) || n < 1 || n > 3650) {
      return res.status(400).json({
        error: 'Duración inválida.'
      });
    }

    let milisegundos;
    if (unidad === 'horas') {
      milisegundos = n * 60 * 60 * 1000;
    } else if (unidad === 'dias') {
      milisegundos = n * 24 * 60 * 60 * 1000;
    } else {
      return res.status(400).json({
        error: 'La unidad debe ser horas o dias.'
      });
    }

    const clave = 'LIC-' + crypto.randomBytes(18).toString('hex');
    const vence = new Date(Date.now() + milisegundos);
    const hash = hashClave(clave);

    const resultado = await pool.query(
      `INSERT INTO licencias (clave_hash, vence_en)
       VALUES ($1, $2)
       RETURNING id, vence_en, creada_en`,
      [hash, vence]
    );

    res.status(201).json({
      clave,
      licencia: resultado.rows[0]
    });
  } catch (error) {
    console.error('Error creando licencia:', error.message);
    res.status(500).json({ error: 'No se pudo crear la licencia.' });
  }
});

// Listar licencias: nunca se devuelven las claves originales.
app.get('/api/licencias', requiereSesion, async (req, res) => {
  try {
    const resultado = await pool.query(`
      SELECT id, vence_en, creada_en
      FROM licencias
      ORDER BY creada_en DESC
      LIMIT 100
    `);

    res.json(resultado.rows);
  } catch (error) {
    console.error('Error listando licencias:', error.message);
    res.status(500).json({ error: 'No se pudieron cargar las licencias.' });
  }
});

// Endpoint público que consulta tu app de iPhone.
app.post('/api/validar', async (req, res) => {
  try {
    const { clave } = req.body || {};

    if (typeof clave !== 'string' ||
        clave.trim().length < 8 ||
        clave.length > 200) {
      return res.status(400).json({
        valida: false,
        mensaje: 'Clave inválida.'
      });
    }

    const resultado = await pool.query(
      `SELECT vence_en
       FROM licencias
       WHERE clave_hash = $1
       LIMIT 1`,
      [hashClave(clave)]
    );

    if (resultado.rows.length === 0) {
      return res.json({
        valida: false,
        mensaje: 'Licencia no encontrada.'
      });
    }

    const vence = new Date(resultado.rows[0].vence_en);

    if (vence.getTime() <= Date.now()) {
      return res.json({
        valida: false,
        mensaje: 'Licencia vencida.'
      });
    }

    res.json({
      valida: true,
      vence_en: vence.toISOString()
    });
  } catch (error) {
    console.error('Error validando licencia:', error.message);
    res.status(500).json({
      valida: false,
      mensaje: 'Error temporal del servidor.'
    });
  }
});

app.use((error, req, res, next) => {
  console.error('Error interno:', error.message);
  if (res.headersSent) return next(error);
  res.status(500).json({ error: 'Error interno del servidor.' });
});

prepararDB()
  .then(() => {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Servidor iniciado en puerto ${PORT}`);
    });
  })
  .catch((error) => {
    console.error('No se pudo preparar la base de datos:', error.message);
    process.exit(1);
  });
