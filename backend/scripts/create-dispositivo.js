// Uso: node scripts/create-dispositivo.js <empresaId> "<nombre>" ["<ubicacion>"] ["<ip>"]
// ponytail: alta de relojes por script — agregar UI cuando Diana tenga más de un par de relojes.
require('dotenv').config();
const pool = require('../src/db/pool');
const CheckadaModel = require('../src/models/checada');

async function main() {
  const [empresaId, nombre, ubicacion, ip] = process.argv.slice(2);
  if (!/^\d+$/.test(empresaId || '') || !nombre) {
    console.error('Uso: node scripts/create-dispositivo.js <empresaId> "<nombre>" ["<ubicacion>"] ["<ip>"]');
    process.exit(1);
  }
  const { rows } = await pool.query('SELECT razon_social FROM empresas WHERE id = $1', [empresaId]);
  if (!rows.length) { console.error(`Empresa ${empresaId} no existe`); process.exit(1); }
  const d = await CheckadaModel.crearDispositivo(Number(empresaId), { nombre, ubicacion, ip });
  console.log(`Reloj "${d.nombre}" para ${rows[0].razon_social}. API_KEY del agente: ${d.api_key}`);
  process.exit(0);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
