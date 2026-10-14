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

const baja = (empresaId, empleadoId, extra = {}) => api(empresaId).post('/api/salidas').send({
  empleadoId, fechaSalida: '2026-10-01', tipoSalida: 'renuncia', razonSalida: 'Personal', ...extra });

test('crea salida con empresa activa aunque el body traiga otra', async () => {
  const res = await baja(A.id, empA.id, { empresaId: B.id });
  expect(res.status).toBe(201);
  expect(res.body.empresa_id).toBe(A.id);
  const { rows } = await pool.query('SELECT count(*)::int n FROM documentos_salida WHERE salida_id = $1', [res.body.id]);
  expect(rows[0].n).toBe(5);
});

test('no se da de baja a empleado de otra empresa', async () => {
  expect((await baja(A.id, empB.id)).status).toBe(404);
});

test('salidas de otra empresa no se listan ni se tocan', async () => {
  const sB = (await baja(B.id, empB.id)).body;
  expect((await api(A.id).get('/api/salidas')).body).toEqual([]);
  expect((await api(A.id).get(`/api/salidas/${sB.id}`)).status).toBe(404);
  expect((await api(A.id).put(`/api/salidas/${sB.id}`).send({ razonSalida: 'X' })).status).toBe(404);
  expect((await api(A.id).delete(`/api/salidas/${sB.id}`)).status).toBe(404);
  expect((await api(A.id).get(`/api/salidas/empleado/${empB.id}`)).body).toEqual([]);
  expect((await api(A.id).get('/api/salidas/estado/pendiente')).body).toEqual([]);
  expect((await api(A.id).get(`/api/documentosSalida/${sB.id}`)).status).toBe(404);
  expect((await api(A.id).get('/api/documentosSalida')).body).toEqual([]);
});

test('escaneado: ruta relativa, completar todo inactiva al empleado, otra empresa → 404', async () => {
  const s = (await baja(A.id, empA.id)).body;
  const docs = (await api(A.id).get(`/api/documentosSalida/${s.id}`)).body;
  for (const d of docs) {
    expect((await api(A.id).post(`/api/documentosSalida/${s.id}/${d.tipo_documento}/generar-template`)).status).toBe(200);
  }
  expect((await api(B.id).post(`/api/documentosSalida/${docs[0].id}/subir-escaneado`)
    .attach('archivo', pdf, { filename: 'x.pdf', contentType: 'application/pdf' })).status).toBe(404);
  for (const d of docs) {
    const up = await api(A.id).post(`/api/documentosSalida/${d.id}/subir-escaneado`)
      .attach('archivo', pdf, { filename: 'x.pdf', contentType: 'application/pdf' });
    expect(up.status).toBe(200);
    expect(path.isAbsolute(up.body.documento_url)).toBe(false);
  }
  expect((await api(A.id).get(`/api/documentosSalida/${docs[0].id}/descargar-escaneado`)).status).toBe(200);
  expect((await api(B.id).get(`/api/documentosSalida/${docs[0].id}/descargar-escaneado`)).status).toBe(404);
  const { rows } = await pool.query('SELECT estado FROM empleados WHERE id = $1', [empA.id]);
  expect(rows[0].estado).toBe('inactivo');
});
