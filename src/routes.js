const express = require('express')
const bcrypt = require('bcryptjs') // вместо bcrypt
const jwt = require('jsonwebtoken')
const pool = require('./db')
const router = express.Router()
const SECRET = process.env.JWT_SECRET || 'scoin-secret'
const path = require('path')
const multer = require('multer')
const auth = require('./authMiddleware');


// Папка для загрузки
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9)
    const ext = path.extname(file.originalname)
    cb(null, `avatar-${unique}${ext}`)
  }
})
const upload = multer({ storage })


// 👉 Регистрация (только для админа)
router.post('/register', async (req, res) => {
  let { login, password, name, is_admin, role } = req.body
role = role || 'Холодник' // значение по умолчанию
  try {
    const hashed = await bcrypt.hash(password, 10)
    const result = await pool.query(
      'INSERT INTO users (login, password_hash, name, is_admin, role) VALUES ($1, $2, $3, $4, $5) RETURNING id, name, balance, role',
      [login, hashed, name, is_admin || false, role]
    )
    res.status(201).json({ user: result.rows[0] })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Ошибка регистрации' })
  }
})

// 🔐 Логин
router.post('/login', async (req, res) => {
  const { login, password } = req.body

  try {
    const userResult = await pool.query('SELECT * FROM users WHERE login = $1', [login])
    const user = userResult.rows[0]

    if (!user) return res.status(400).json({ error: 'Пользователь не найден' })

    const isMatch = await bcrypt.compare(password, user.password_hash)
    if (!isMatch) return res.status(401).json({ error: 'Неверный пароль' })

    const token = jwt.sign({ id: user.id, is_admin: user.is_admin }, process.env.JWT_SECRET, { expiresIn: '7d' })

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        balance: user.balance,
        is_admin: user.is_admin,
        avatar_url: user.avatar_url,
        role: user.role
      }
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Ошибка входа' })
  }
})


// 👥 Получить всех пользователей (для админки)
router.get('/users', auth, async (req, res) => {
  try {
    const result = await pool.query('SELECT id, name, balance, avatar_url, role FROM users ORDER BY created_at DESC')
    res.json(result.rows) // 👈 важно: именно массив, как ждёт фронт
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Ошибка получения пользователей' })
  }
})

// 💸 Начисление коинов
router.post('/users/:id/coins', auth, async (req, res) => {
  const userId = req.params.id
  const { amount } = req.body
  try {
    await pool.query('UPDATE users SET balance = balance + $1 WHERE id = $2', [amount, userId])
    await pool.query(
      'INSERT INTO transactions (user_id, amount, reason) VALUES ($1, $2, $3)',
      [userId, amount, 'Начисление вручную']
    )
    res.json({ message: 'Коины начислены' })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Ошибка начисления' })
  }
})

// 📦 Получить товары
router.get('/items', auth, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM items ORDER BY created_at DESC')
    res.json(result.rows) // 👈 опять же, просто массив
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Ошибка при получении товаров' })
  }
})

// ➕ Добавить товар
router.post('/items', auth, async (req, res) => {
  const { name, price, description, image_url } = req.body
  try {
    await pool.query(
      'INSERT INTO items (name, price, description, image_url) VALUES ($1, $2, $3, $4)',
      [name, price, description, image_url]
    )
    res.json({ message: 'Товар добавлен' })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Ошибка при добавлении товара' })
  }
})

// ❌ Удалить товар
router.delete('/items/:id', auth, async (req, res) => {
  try {
    await pool.query('DELETE FROM items WHERE id = $1', [req.params.id])
    res.json({ message: 'Удалено' })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Ошибка удаления товара' })
  }
})

// 🛒 Покупка товара
router.post('/buy', auth, async (req, res) => {
  const { item_id } = req.body;
  const user_id = req.user.id;

  const axios = require('axios'); // убедись, что установлен: npm install axios
  const TELEGRAM_TOKEN = process.env.TG_BOT_TOKEN;
  const CHAT_ID = process.env.TG_CHAT_ID;

  try {
    const itemRes = await pool.query('SELECT * FROM items WHERE id = $1', [item_id]);
    const item = itemRes.rows[0];

    if (!item) return res.status(404).json({ error: 'Товар не найден' });

    const userRes = await pool.query('SELECT * FROM users WHERE id = $1', [user_id]);
    const user = userRes.rows[0];

    if (user.balance < item.price) {
      return res.status(400).json({ error: 'Недостаточно S-Coin' });
    }

    await pool.query('BEGIN');

    await pool.query('UPDATE users SET balance = balance - $1 WHERE id = $2', [item.price, user_id]);
    await pool.query('INSERT INTO purchases (user_id, item_id) VALUES ($1, $2)', [user_id, item_id]);
    await pool.query(
      'INSERT INTO transactions (user_id, amount, reason) VALUES ($1, $2, $3)',
      [user_id, -item.price, `Покупка: ${item.name}`]
    );

    // 🔔 Отправка уведомления в Telegram
    await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      chat_id: CHAT_ID,
      text: `${user.login} купил ${item.name}`
    });

    await pool.query('COMMIT');

    res.json({ message: 'Покупка успешна' });
  } catch (err) {
    await pool.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Ошибка покупки' });
  }
});

// 📦 История покупок
router.get('/my-purchases', auth, async (req, res) => {
  const user_id = req.user.id

  try {
    const result = await pool.query(`
      SELECT i.name, i.price, i.image_url, p.created_at
      FROM purchases p
      JOIN items i ON p.item_id = i.id
      WHERE p.user_id = $1
      ORDER BY p.created_at DESC
    `, [user_id])

    res.json(result.rows)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Ошибка получения покупок' })
  }
})

router.post('/register', auth, async (req, res) => {
  console.log(req.body) // для отладки

  try {
    const { login, password, name, is_admin } = req.body

    // корректное приведение is_admin
    const isAdmin = is_admin === true || is_admin === 'true' || is_admin === 'on'

    const hashed = await bcrypt.hash(password, 10)

    await pool.query(
      'INSERT INTO users (login, password_hash, name, is_admin, role) VALUES ($1, $2, $3, $4, $5)',
      [login, hashed, name, is_admin, role]
    )

    res.sendStatus(201)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Ошибка регистрации' })
  }
})


router.delete('/users/:id', auth, async (req, res) => {
  try {
    const id = req.params.id
    await pool.query('DELETE FROM users WHERE id = $1', [id])
    res.sendStatus(204)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Ошибка удаления' })
  }
})

router.patch('/users/:id', auth, async (req, res) => {
  const { name, avatar_url } = req.body
  const userId = parseInt(req.params.id, 10)

  if (req.user.id !== userId && !req.user.is_admin) {
    return res.status(403).json({ error: 'Forbidden' })
  }

  try {
    const result = await pool.query(
      'UPDATE users SET name = $1, avatar_url = $2 WHERE id = $3 RETURNING id, name, balance, avatar_url',
      [name, avatar_url, userId]
    )

    if (result.rowCount === 0) return res.status(404).json({ error: 'User not found' })

    res.json({ user: result.rows[0] })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Ошибка обновления профиля' })
  }
})


// 📄 Профиль
router.get('/me', auth, async (req, res) => {
  const userId = req.user.id
  try {
    const user = await pool.query('SELECT id, login, name, balance, is_admin, avatar_url, role FROM users WHERE id = $1', [userId])
    res.json(user.rows[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Ошибка загрузки профиля' })
  }
})

// ✏️ Обновление имени
router.patch('/users/:id', auth, async (req, res) => {
  const { id } = req.params
  const { name } = req.body

  try {
    const result = await pool.query(
      'UPDATE users SET name = $1 WHERE id = $2 RETURNING id, name, balance, is_admin, role',
      [name, id]
    )
    res.json(result.rows[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Ошибка обновления имени' })
  }
})

// 🔒 Обновление пароля
router.patch('/users/:id/password', auth, async (req, res) => {
  const { id } = req.params
  const { currentPassword, newPassword } = req.body

  try {
    const userRes = await pool.query('SELECT password_hash FROM users WHERE id = $1', [id])
    const user = userRes.rows[0]

    const isMatch = await bcrypt.compare(currentPassword, user.password_hash)
    if (!isMatch) return res.status(401).json({ error: 'Неверный текущий пароль' })

    const newHash = await bcrypt.hash(newPassword, 10)
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, id])

    res.json({ message: 'Пароль обновлён' })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Ошибка смены пароля' })
  }
})

module.exports = router
