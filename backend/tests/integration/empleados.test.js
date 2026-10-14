const fs = require('fs');
const path = require('path');
const { pool, resetDb, api, crearEmpresa, crearEmpleado } = require('../helpers');
const { UPLOADS_DIR } = require('../../src/lib/archivos');

let A, B, empA, empB;
beforeEach(async () => {
  await resetDb();
  A = await crearEmpresa(); B = await crearEmpresa();
  empA = await crearEmpleado(A.id, { nombre: 'Ana' });
  empB = await crearEmpleado(B.id, { nombre: 'Beto' });
});
afterAll(() => pool.end());

const nuevo = { nombre: 'Carla', apellido_paterno: 'Ruiz', curp: 'RUCC900101MMNZRR01', rfc: 'RUCC900101AB1',
  fecha_ingreso: '2026-01-15', email: 'carla@test.mx' };

test('lista solo empleados de la empresa activa', async () => {
  const res = await api(A.id).get('/api/empleados');
  expect(res.status).toBe(200);
  expect(res.body.map(e => e.id)).toEqual([empA.id]);
});

test('GET/PUT/DELETE de empleado de otra empresa → 404', async () => {
  expect((await api(A.id).get(`/api/empleados/${empB.id}`)).status).toBe(404);
  expect((await api(A.id).put(`/api/empleados/${empB.id}`).send({ puesto: 'X' })).status).toBe(404);
  expect((await api(A.id).delete(`/api/empleados/${empB.id}`)).status).toBe(404);
  const { rows } = await pool.query('SELECT puesto FROM empleados WHERE id = $1', [empB.id]);
  expect(rows[0].puesto).toBe('Auxiliar');
});

test('create ignora empresa_id del body', async () => {
  const res = await api(A.id).post('/api/empleados').send({ ...nuevo, empresa_id: B.id });
  expect(res.status).toBe(201);
  expect(res.body.empresa_id).toBe(A.id);
});

test('mismo CURP en otra empresa se permite; en la misma → 409', async () => {
  expect((await api(A.id).post('/api/empleados').send(nuevo)).status).toBe(201);
  expect((await api(B.id).post('/api/empleados').send(nuevo)).status).toBe(201);
  expect((await api(A.id).post('/api/empleados').send({ ...nuevo, email: 'otra@test.mx' })).status).toBe(409);
});

test('foto se guarda con ruta relativa y foto de otra empresa → 404', async () => {
  const png = Buffer.from('89504e470d0a1a0a', 'hex');
  const res = await api(A.id).post(`/api/empleados/${empA.id}/foto`).attach('foto', png, { filename: 'f.png', contentType: 'image/png' });
  expect(res.status).toBe(200);
  expect(path.isAbsolute(res.body.foto)).toBe(false);
  expect(fs.existsSync(path.join(UPLOADS_DIR, res.body.foto))).toBe(true);
  const otra = await api(A.id).post(`/api/empleados/${empB.id}/foto`).attach('foto', png, { filename: 'f.png', contentType: 'image/png' });
  expect(otra.status).toBe(404);
});

test('PUT ignora foto del body (no se puede apuntar a archivos ajenos)', async () => {
  const res = await api(A.id).put(`/api/empleados/${empA.id}`).send({ foto: 'contratos/ajeno.pdf', puesto: 'Jefe' });
  expect(res.status).toBe(200);
  expect(res.body.puesto).toBe('Jefe');
  expect(res.body.foto).toBeNull();
});

test('errores de BD por datos del cliente → 400 (telefono largo, nombre vacío)', async () => {
  const largo = await api(A.id).put(`/api/empleados/${empA.id}`).send({ telefono: 'x'.repeat(30) });
  expect(largo.status).toBe(400);
  const vacio = await api(A.id).put(`/api/empleados/${empA.id}`).send({ nombre: '' });
  expect(vacio.status).toBe(400);
});
