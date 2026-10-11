const express = require('express');
const crypto = require('crypto');

const app = express();
app.use(express.json());

const licencias = new Map();

app.get('/', (req, res) => {
  res.send('Servidor de licencias activo');
});

app.post('/crear-licencia', (req, res) => {
  const horas = Number(req.body.horas);

  if (!Number.isFinite(horas) || horas <= 0 || horas > 8760) {
    return res.status(400).json({
      error: 'Indica una duración válida en horas (máximo 8760)'
    });
  }

  const clave = crypto.randomBytes(16).toString('hex');
  const vence = Date.now() + horas * 60 * 60 * 1000;

  licencias.set(clave, vence);

  res.json({
    clave,
    vence: new Date(vence).toISOString()
  });
});

app.post('/validar-licencia', (req, res) => {
  const { clave } = req.body;
  const vence = licencias.get(clave);

  if (!vence || Date.now() >= vence) {
    return res.status(401).json({ valida: false });
  }

  res.json({
    valida: true,
    vence: new Date(vence).toISOString()
  });
});

app.listen(process.env.PORT || 3001, '0.0.0.0', () => {
  console.log('Servidor iniciado');
});
