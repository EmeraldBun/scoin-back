// src/index.js
const express = require('express');
const dotenv = require('dotenv');
const routes = require('./routes');
const cors = require('cors');




// Загрузка переменных окружения из .env
dotenv.config();

const app = express();

app.use(cors()); // ← обязательно до всех routes
app.use(express.json());

// Обязательно для разбора JSON в теле запроса
app.use(express.json());

// Подключаем все маршруты под префиксом /api
app.use('/api', routes);

app.use('/uploads', express.static('uploads'))

// Проверка что сервер жив
app.get('/', (req, res) => {
  res.send('✅ S-Coin backend работает!');
});

// Запуск сервера
app.listen(process.env.PORT, () => {
  console.log(`🚀 Сервер запущен на порту ${process.env.PORT}`);
});

