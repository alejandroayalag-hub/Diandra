const request = require('supertest');
const { pool, app, resetDb, api, crearEmpresa, crearEmpleado } = require('../helpers');
const CheckadaModel = require('../../src/models/checada');

let A, B, empA, empB, relojA, relojB;
beforeEach(async () => {
  await resetDb();
  A = await crearEmpresa(); B = await crearEmpresa();
  empA = await crearEmpleado(A.id); empB = await crearEmpleado(B.id);
  relojA = await CheckadaModel.crearDispositivo(A.id, { nombre: 'Reloj A' });
  relojB = await CheckadaModel.crearDispositivo(B.id, { nombre: 'Reloj B' });
});
afterAll(() => pool.end());

test('dispositivos y mapeos solo de la empresa activa', async () => {
  await api(A.id).post('/api/checadas/mappings').send({ dispositivo_id: relojA.id, empleado_id: empA.id, uid_checador: 1 });
  await api(B.id).post('/api/checadas/mappings').send({ dispositivo_id: relojB.id, empleado_id: empB.id, uid_checador: 1 });
  expect((await api(A.id).get('/api/checadas/dispositivos')).body.map(d => d.id)).toEqual([relojA.id]);
  expect((await api(A.id).get('/api/checadas/mappings')).body.map(m => m.empleado_id)).toEqual([empA.id]);
});

test('no se mapea empleado de A a reloj de B ni viceversa', async () => {
  expect((await api(A.id).post('/api/checadas/mappings').send({ dispositivo_id: relojB.id, empleado_id: empA.id, uid_checador: 5 })).status).toBe(404);
  expect((await api(A.id).post('/api/checadas/mappings').send({ dispositivo_id: relojA.id, empleado_id: empB.id, uid_checador: 5 })).status).toBe(404);
});

test('borrar mapeo de otra empresa → 404', async () => {
  const m = (await api(B.id).post('/api/checadas/mappings').send({ dispositivo_id: relojB.id, empleado_id: empB.id, uid_checador: 2 })).body;
  expect((await api(A.id).delete(`/api/checadas/mappings/${m.id}`)).status).toBe(404);
});

test('agente sincroniza solo empleados de la empresa del reloj', async () => {
  await pool.query('INSERT INTO checador_empleados (dispositivo_id, empleado_id, uid_checador) VALUES ($1,$2,9)', [relojA.id, empB.id]);
  await pool.query('INSERT INTO checador_empleados (dispositivo_id, empleado_id, uid_checador) VALUES ($1,$2,1)', [relojA.id, empA.id]);
  const res = await request(app).post('/api/checadas/sync').set('x-api-key', relojA.api_key).send({ registros: [
    { uid_checador: 1, timestamp: '2026-10-13T08:00:00Z', tipo: 'entrada' },
    { uid_checador: 9, timestamp: '2026-10-13T08:01:00Z', tipo: 'entrada' },
  ] });
  expect(res.body.insertadas).toBe(1);
  const mapeos = await request(app).get('/api/checadas/mappings/agente').set('x-api-key', relojA.api_key);
  expect(mapeos.body.map(m => m.id)).toEqual([empA.id]);
});

test('checadas de empleado de otra empresa → 404', async () => {
  expect((await api(A.id).get(`/api/checadas/empleado/${empB.id}`)).status).toBe(404);
});
