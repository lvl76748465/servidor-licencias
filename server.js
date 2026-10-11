const express = require('express');
const session = require('express-session');
const { Pool } = require('pg');
const crypto = require('crypto');

const app = express();

app.set('trust proxy', 1);
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

if (!process.env.ADMIN_PASSWORD || !process.env.SESSION_SECRET) {
  throw new Error('Faltan ADMIN_PASSWORD o SESSION_SECRET en Render');
}

app.use(session({
  name: 'admin.sid',
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: true,
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

function soloAdmin(req, res, next) {
  if (req.session && req.session.admin === true) {
    return next();
  }
  return res.status(401).json({ error: 'Inicia sesión primero' });
}

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

app.post('/api/login', (req, res, next) => {
  const password = req.body?.password;

  if (typeof password !== 'string' ||
      password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Contraseña incorrecta' });
  }

  req.session.regenerate(err => {
    if (err) return next(err);

    req.session.admin = true;
    req.session.save(err => {
      if (err) return next(err);
      res.json({ ok: true });
    });
  });
});

app.post('/api/logout', (req, res, next) => {
  req.session.destroy(err => {
    if (err) return next(err);
    res.clearCookie('admin.sid');
    res.json({ ok: true });
  });
});

app.get('/api/licencias', soloAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, vence_en, creada_en
      FROM licencias
      ORDER BY creada_en DESC
      LIMIT 100
    `);
    res.json(result.rows);
  } catch {
    res.status(500).json({ error: 'Error al consultar licencias' });
  }
});

app.post('/api/licencias', soloAdmin, async (req, res) => {
  const { duracion, unidad } = req.body || {};
  const cantidad = Number(duracion);

  if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > 8760) {
    return res.status(400).json({ error: 'Duración no válida' });
  }

  if (!['horas', 'dias'].includes(unidad)) {
    return res.status(400).json({ error: 'Unidad no válida' });
  }

  const horas = unidad === 'dias' ? cantidad * 24 : cantidad;

  try {
    const clave = crypto.randomBytes(24).toString('hex');
    const hash = crypto.createHash('sha256').update(clave).digest('hex');

    const result = await pool.query(`
      INSERT INTO licencias (clave_hash, vence_en)
      VALUES ($1, NOW() + ($2 * INTERVAL '1 hour'))
      RETURNING id, vence_en, creada_en
    `, [hash, horas]);

    res.status(201).json({
      licencia: clave,
      ...result.rows[0]
    });
  } catch {
    res.status(500).json({ error: 'No se pudo crear la licencia' });
  }
});

app.get('/estado-db', async (req, res) => {
  try {
    await prepararDB();
    res.json({ baseDeDatos: 'conectada', tabla: 'lista' });
  } catch {
    res.status(500).json({ error: 'Error de base de datos' });
  }
});

const port = process.env.PORT || 3001;

prepararDB()
  .then(() => {
    app.listen(port, '0.0.0.0', () => {
      console.log('Servidor iniciado');
    });
  })
  .catch(err => {
    console.error('No se pudo preparar la base de datos:', err.message);
    process.exit(1);
  });
