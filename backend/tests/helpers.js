const request = require('supertest');
const jwt = require('jsonwebtoken');
const pool = require('../src/db/pool');
const runMigrations = require('../src/db/migrate');
const app = require('../src/app');

let rfcSeq = 0;

async function resetDb() {
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await runMigrations();
  // usuario id=1 para FKs created_by
  await pool.query("INSERT INTO usuarios (email, password, nombre) VALUES ('t@test.mx', 'x', 'Test')");
}

function api(empresaId, role = 'admin') {
  const token = jwt.sign({ id: 1, email: 't@test.mx', nombre: 'Test', role }, process.env.JWT_SECRET);
  const wrap = (metodo) => (url) => {
    const r = request(app)[metodo](url).set('Authorization', `Bearer ${token}`);
    return empresaId ? r.set('X-Empresa-Id', String(empresaId)) : r;
  };
  return { get: wrap('get'), post: wrap('post'), put: wrap('put'), patch: wrap('patch'), delete: wrap('delete') };
}

async function crearEmpresa(datos = {}) {
  rfcSeq += 1;
  const { rows } = await pool.query(
    `INSERT INTO empresas (razon_social, rfc, representante_legal, domicilio, colonia, cp, ciudad, giro, activo)
     VALUES ($1,$2,$3,'Calle 1','Centro','58000','Uruapan','Comercio',$4) RETURNING *`,
    [datos.razon_social || `Empresa ${rfcSeq}`, datos.rfc || `EMP${String(rfcSeq).padStart(6, '0')}AA${rfcSeq % 10}`,
     datos.representante_legal || 'Rep Legal', datos.activo ?? true]
  );
  return rows[0];
}

async function crearEmpleado(empresaId, extra = {}) {
  const n = Math.floor(Math.random() * 1e8);
  const { rows } = await pool.query(
    `INSERT INTO empleados (empresa_id, nombre, apellido_paterno, apellido_materno, curp, rfc, email, puesto)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'Auxiliar') RETURNING *`,
    [empresaId, extra.nombre || 'Juan', extra.apellido_paterno || 'Pérez', extra.apellido_materno || 'López',
     extra.curp || `CURP${String(n).padStart(14, '0')}`.slice(0, 18), extra.rfc || `RFC${String(n).padStart(10, '0')}`.slice(0, 13),
     `e${n}@test.mx`]
  );
  return rows[0];
}

module.exports = { pool, app, resetDb, api, crearEmpresa, crearEmpleado };
