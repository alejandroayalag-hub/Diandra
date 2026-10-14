const { pool, app, resetDb } = require('../helpers');
const request = require('supertest');

beforeAll(resetDb);
afterAll(() => pool.end());

test('GET /api/health responde ok', async () => {
  const res = await request(app).get('/api/health');
  expect(res.status).toBe(200);
  expect(res.body).toEqual({ ok: true });
});

test('id no numérico responde 400, no 500', async () => {
  const jwt = require('jsonwebtoken');
  const t = jwt.sign({ id: 1, role: 'admin' }, process.env.JWT_SECRET);
  const res = await request(app).get('/api/formatos/abc/descargar').set('Authorization', `Bearer ${t}`);
  expect(res.status).toBe(400);
});
