require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const bcrypt = require('bcryptjs'); // usamos bcryptjs para evitar compilaciones nativas

const app = express();
app.use(cors());
app.use(express.json());

// Manejo global de errores no atrapados para que no se "muera" sin aviso
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

// Validación simple de email
const isEmail = (e) => /^\S+@\S+\.\S+$/.test(e);

// Pool de conexión
const db = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || '',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || '',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// Testear conexión al arrancar
async function testDbConnection() {
  try {
    const conn = await db.getConnection();
    await conn.ping(); // verifica que responde
    console.log('✅ Conectado a la base de datos MySQL (ping exitoso)');
    conn.release();
  } catch (err) {
    console.error('❌ Error inicial conectando a MySQL:', err.message || err);
  }
}

// Verifica reCAPTCHA (v2 o v3), usa fetch global de Node 18+
async function verifyRecaptcha(token) {
  if (!token) return false;
  const secret = process.env.RECAPTCHA_SECRET_KEY;
  if (!secret) return false;

  const params = new URLSearchParams({ secret, response: token });
  const resp = await fetch('https://www.google.com/recaptcha/api/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  const data = await resp.json();

  const threshold = parseFloat(process.env.RECAPTCHA_THRESHOLD || '0.5');
  if (!data.success) return false;
  if (typeof data.score !== 'undefined') {
    return data.score >= threshold;
  }
  return true;
}

// Esquemas y mapeos
const tableSchemas = {
  messages: {
    required: ['name', 'email', 'message'],
    transform: (body) => ({
      name: body.name,
      email: body.email,
      phone: body.phone || null,
      message: body.message,
      terms_accepted: body.accepted_terms ? 1 : 0,
    }),
    insertQuery: `INSERT INTO messages (name, email, phone, message, terms_accepted) VALUES (?, ?, ?, ?, ?)`,
    valuesFrom: (obj) => [
      obj.name,
      obj.email,
      obj.phone,
      obj.message,
      obj.terms_accepted,
    ],
  },
  users: {
    required: ['name', 'email', 'password'],
    transform: async (body) => {
      if (typeof body.password !== 'string' || body.password.length < 6) {
        throw new Error('Password debe tener al menos 6 caracteres');
      }
      const hashed = bcrypt.hashSync(body.password, 10);
      return {
        name: body.name,
        email: body.email,
        password: hashed,
      };
    },
    insertQuery: `INSERT INTO users (name, email, password) VALUES (?, ?, ?)`,
    valuesFrom: (obj) => [obj.name, obj.email, obj.password],
  },
};

async function insertIntoTable(schemaKey, body) {
  const schema = tableSchemas[schemaKey];
  if (!schema) throw new Error(`Schema no definido para tabla: ${schemaKey}`);

  for (const field of schema.required) {
    if (
      typeof body[field] === 'undefined' ||
      body[field] === null ||
      (typeof body[field] === 'string' && body[field].trim() === '')
    ) {
      throw new Error(`Falta el campo requerido: ${field}`);
    }
  }

  if (body.email && !isEmail(body.email)) {
    throw new Error('Email con formato inválido');
  }

  const transformed =
    typeof schema.transform === 'function'
      ? await schema.transform(body)
      : body;

  const values = schema.valuesFrom(transformed);
  const [result] = await db.query(schema.insertQuery, values);
  return { insertId: result.insertId };
}

// Health check rápido
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// Endpoint contacto
app.post('/api/contact', async (req, res) => {
  const { token } = req.body;

  if (!token) {
    return res.status(400).json({ error: 'No se proporcionó reCAPTCHA' });
  }

  try {
    const ok = await verifyRecaptcha(token);
    if (!ok) {
      return res.status(403).json({ error: 'Falló la verificación de reCAPTCHA' });
    }

    const result = await insertIntoTable('messages', req.body);
    return res
      .status(201)
      .json({ message: 'Mensaje enviado correctamente', id: result.insertId });
  } catch (err) {
    console.error('Error en /api/contact:', err.message || err);
    return res.status(400).json({ error: err.message || 'Error interno' });
  }
});

// Registro de usuario
app.post('/api/register', async (req, res) => {
  const { email, name } = req.body;

  try {
    if (!email || !name || !req.body.password) {
      return res.status(400).json({ error: 'Faltan campos obligatorios' });
    }
    if (!isEmail(email)) {
      return res.status(400).json({ error: 'Email inválido' });
    }

    const [rows] = await db.query('SELECT id FROM users WHERE email = ?', [
      email,
    ]);
    if (rows.length > 0) {
      return res.status(409).json({ error: 'El email ya está registrado' });
    }

    const result = await insertIntoTable('users', req.body);
    return res
      .status(201)
      .json({ message: 'Usuario creado correctamente', id: result.insertId });
  } catch (err) {
    console.error('Error en /api/register:', err.message || err);
    return res.status(400).json({ error: err.message || 'Error interno' });
  }
});

// Genérico (opcional) para insertar en tablas permitidas
app.post('/api/insert/:table', async (req, res) => {
  const table = req.params.table;
  if (!['messages', 'users'].includes(table)) {
    return res.status(404).json({ error: 'Tabla no permitida' });
  }
  try {
    const result = await insertIntoTable(table, req.body);
    return res
      .status(201)
      .json({ message: `Insertado en ${table}`, id: result.insertId });
  } catch (err) {
    console.error(`Error en /api/insert/${table}:`, err.message || err);
    return res.status(400).json({ error: err.message || 'Error interno' });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, async () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
  await testDbConnection();
});
