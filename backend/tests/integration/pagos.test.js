const path = require('path');
const { pool, resetDb, api, crearEmpresa, crearEmpleado } = require('../helpers');

const pdf = Buffer.from('%PDF-1.4\n%prueba\n');
let A, B, empA, empB;

beforeEach(async () => {
  await resetDb();
  A = await crearEmpresa(); B = await crearEmpresa();
  empA = await crearEmpleado(A.id); empB = await crearEmpleado(B.id);
});
afterAll(() => pool.end());

const importar = (empresaId, registros, semana = 16) => api(empresaId).post('/api/pagos/importar')
  .field('semana', String(semana)).field('anio', '2026').field('registros', JSON.stringify(registros))
  .attach('pdf', pdf, { filename: 'p.pdf', contentType: 'application/pdf' });

test('importa semana con ruta relativa y empresa activa', async () => {
  const res = await importar(A.id, [{ nombre_pdf: 'PEREZ JUAN', monto: 100, empleado_id: empA.id }]);
  expect(res.status).toBe(201);
  expect(res.body.empresa_id).toBe(A.id);
  expect(path.isAbsolute(res.body.ruta)).toBe(false);
});

test('misma semana en dos empresas se permite; repetida en la misma → 409', async () => {
  expect((await importar(A.id, [])).status).toBe(201);
  expect((await importar(B.id, [])).status).toBe(201);
  expect((await importar(A.id, [])).status).toBe(409);
});

test('empleado_id de otra empresa en el JSON se descarta', async () => {
  const sem = (await importar(A.id, [{ nombre_pdf: 'X', monto: 50, empleado_id: empB.id }])).body;
  const { rows } = await pool.query('SELECT empleado_id FROM pagos WHERE semana_pago_id = $1', [sem.id]);
  expect(rows[0].empleado_id).toBeNull();
});

test('semanas, detalle, descarga y borrado de otra empresa → 404 / no visibles', async () => {
  const semB = (await importar(B.id, [{ nombre_pdf: 'Y', monto: 10, empleado_id: empB.id }])).body;
  expect((await api(A.id).get('/api/pagos/semanas')).body).toEqual([]);
  expect((await api(A.id).get(`/api/pagos/semana/${semB.id}`)).status).toBe(404);
  expect((await api(A.id).get(`/api/pagos/semana/${semB.id}/descargar`)).status).toBe(404);
  expect((await api(A.id).delete(`/api/pagos/semana/${semB.id}`)).status).toBe(404);
  expect((await api(A.id).get(`/api/pagos/empleado/${empB.id}`)).status).toBe(404);
  expect((await api(B.id).get(`/api/pagos/semana/${semB.id}/descargar`)).status).toBe(200);
});

test('importar con registro inválido hace rollback y la semana se puede reimportar', async () => {
  const mala = await importar(A.id, [{ nombre_pdf: null, monto: 10 }]);
  expect(mala.status).toBeGreaterThanOrEqual(400);
  expect(mala.status).toBeLessThan(500);
  const { rows } = await pool.query('SELECT 1 FROM semanas_pago WHERE empresa_id = $1', [A.id]);
  expect(rows).toHaveLength(0);
  expect((await importar(A.id, [{ nombre_pdf: 'OK', monto: 10 }])).status).toBe(201);
});

test('registros con JSON inválido → 400', async () => {
  const res = await api(A.id).post('/api/pagos/importar')
    .field('semana', '3').field('anio', '2026').field('registros', '{no-json')
    .attach('pdf', pdf, { filename: 'p.pdf', contentType: 'application/pdf' });
  expect(res.status).toBe(400);
});
