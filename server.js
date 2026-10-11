const express = require('express');
const app = express();

app.get('/', (req, res) => {
  res.send('Servidor de licencias activo');
});

app.listen(process.env.PORT || 3001, '0.0.0.0', () => {
  console.log('Servidor iniciado');
});
