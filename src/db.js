const { Pool } = require('pg');
require('dotenv').config();

const isProd = process.env.NODE_ENV === 'production';

const pool = new Pool(
  isProd
    ? {                           // Render / Railway
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
      }
    : {                           // локально
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME
      }
);

pool.on('connect', () => console.log('📦  PostgreSQL connected'));
pool.on('error',   e  => console.error('❌  DB error', e));

module.exports = pool;
