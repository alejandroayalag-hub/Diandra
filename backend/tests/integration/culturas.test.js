const path = require('path');
const { pool, resetDb, api, crearEmpresa } = require('../helpers');

let A, B;
beforeEach(async () => { await resetDb(); A = await crearEmpresa(); B = await crearEmpresa(); });
afterAll(() => pool.end());

const crear = (empresaId, extra = {}) =>
  api(empresaId).post('/api/culturas').send({ tipo: 'mision', titulo: 'Misión', ...extra });

test('crea en la empresa activa ignorando empresaId del body y lista solo esa', async () => {
  const res = await crear(A.id, { empresaId: B.id });
  expect(res.status).toBe(201);
  expect(res.body.empresa_id).toBe(A.id);
  expect((await api(B.id).get('/api/culturas')).body).toEqual([]);
  expect((await api(A.id).get('/api/culturas')).body).toHaveLength(1);
});

test('misma misión en dos empresas se permite', async () => {
  expect((await crear(A.id)).status).toBe(201);
  expect((await crear(B.id)).status).toBe(201);
});

test('ver, editar, borrar y subir archivo a cultura de otra empresa → 404', async () => {
  const cB = (await crear(B.id)).body;
  expect((await api(A.id).get(`/api/culturas/${cB.id}`)).status).toBe(404);
  expect((await api(A.id).put(`/api/culturas/${cB.id}`).send({ titulo: 'X' })).status).toBe(404);
  expect((await api(A.id).delete(`/api/culturas/${cB.id}`)).status).toBe(404);
  const png = Buffer.from('89504e470d0a1a0a', 'hex');
  expect((await api(A.id).post(`/api/culturas/${cB.id}/archivos`).attach('archivo', png, { filename: 'a.png', contentType: 'image/png' })).status).toBe(404);
});

test('archivo de cultura con ruta relativa', async () => {
  const c = (await crear(A.id)).body;
  const png = Buffer.from('89504e470d0a1a0a', 'hex');
  const res = await api(A.id).post(`/api/culturas/${c.id}/archivos`).attach('archivo', png, { filename: 'a.png', contentType: 'image/png' });
  expect(res.status).toBe(201);
  expect(path.isAbsolute(res.body.archivos[0].url)).toBe(false);
});
