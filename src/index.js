// src/index.js
require('dotenv').config();               // переменные окружения

const express = require('express');
const cors    = require('cors');
const path    = require('path');

const routes  = require('./routes');

console.log('TG_BOT_TOKEN =', process.env.TG_BOT_TOKEN);
console.log('TG_CHAT_ID   =', process.env.TG_CHAT_ID);

const app  = express();
const PORT = process.env.PORT || 3000;

/* ───────── middlewares ───────── */
app.use(cors());
app.use(express.json());

/* раздаём загруженные картинки */
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

/* API-роуты */
app.use('/api', routes);

/* health-check */
app.get('/', (_req, res) =>
  res.send('✅ S-Coin backend работает!')
);

/* start */
app.listen(PORT, () => {
  console.log(`🚀  Сервер запущен на порту ${PORT}`);
});
