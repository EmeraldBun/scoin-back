// src/db.js
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
})


pool.connect()
  .then(() => console.log('📦 Подключено к базе данных PostgreSQL'))
  .catch((err) => console.error('❌ Ошибка подключения к БД', err));

module.exports = pool;
