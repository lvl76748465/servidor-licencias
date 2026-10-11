const express = require('express');
const { Pool } = require('pg');
const crypto = require('crypto');

const app = express();
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const adminPassword = process.env.ADMIN_PASSWORD;

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

app.get('/estado-db', async (req, res) => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS licencias (
        id BIGSERIAL PRIMARY KEY,
        clave_hash TEXT UNIQUE NOT NULL,
        vence_en TIMESTAMPTZ NOT NULL,
        creada_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    res.json({ baseDeDatos: 'conectada', tabla: 'lista' });
  } catch {
    res.status(500).json({ error: 'Error de base de datos' });
  }
});

app.listen(process.env.PORT || 3001, '0.0.0.0', () => {
  console.log('Servidor iniciado');
});
