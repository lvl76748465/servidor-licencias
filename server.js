const express = require('express');
const { Pool } = require('pg');
const crypto = require('crypto');

const app = express();
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

app.get('/', (req, res) => {
  res.send('Servidor de licencias activo');
});

app.get('/estado-db', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ baseDeDatos: 'conectada' });
  } catch {
    res.status(500).json({ baseDeDatos: 'error' });
  }
});

app.listen(process.env.PORT || 3001, '0.0.0.0', () => {
  console.log('Servidor iniciado');
});
