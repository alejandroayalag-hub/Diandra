require('dotenv').config();
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const pool = require('../src/db/pool');

async function main() {
  const password = process.argv[2] || crypto.randomBytes(12).toString('base64url');
  const hash = await bcrypt.hash(password, 10);
  const { rowCount } = await pool.query(
    "INSERT INTO usuarios (email, password, nombre, role) VALUES ($1, $2, $3, 'admin') ON CONFLICT (email) DO NOTHING",
    ['admin@diandra.com', hash, 'Administrador']
  );
  console.log(rowCount ? `Admin creado: admin@diandra.com / ${password}` : 'admin@diandra.com ya existía, no se cambió');
  process.exit(0);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
