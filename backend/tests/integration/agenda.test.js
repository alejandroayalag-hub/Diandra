const { pool, resetDb, api, crearEmpresa } = require('../helpers');

beforeEach(resetDb);
afterEach(() => jest.restoreAllMocks());
afterAll(() => pool.end());

const fijarHoy = (f) => jest.spyOn(Date, 'now').mockReturnValue(new Date(`${f}T18:00:00Z`).getTime());
const RANGO = '/api/agenda?desde=2026-11-01&hasta=2026-11-30';

test('crear, listar con vencimientos del rango, editar y borrar', async () => {
  fijarHoy('2026-11-10');
  const e = await crearEmpresa();
  await pool.query(
    `INSERT INTO empresa_obligaciones (empresa_id, descripcion, periodicidad, dia, created_at)
     VALUES ($1, 'IVA mensual', 'mensual', 17, '2026-09-01 12:00')`, [e.id]);

  const c = await api().post('/api/agenda').send({ fecha: '2026-11-12', hora: '10:30', titulo: ' Revisión ', tipo: 'cita', empresa_id: e.id });
  expect(c.status).toBe(201);
  expect(c.body).toMatchObject({ fecha: '2026-11-12', hora: '10:30', titulo: 'Revisión', razon_social: e.razon_social });
  await api().post('/api/agenda').send({ fecha: '2026-11-12', titulo: 'Todo el día' });
  await api().post('/api/agenda').send({ fecha: '2026-12-01', titulo: 'Fuera de rango' });

  let r = await api().get(RANGO);
  expect(r.status).toBe(200);
  expect(r.body.eventos.map(x => [x.titulo, x.hora, x.tipo])).toEqual([['Todo el día', null, 'otro'], ['Revisión', '10:30', 'cita']]);
  // sep vence 19-oct (fuera del rango, no aparece aunque esté vencida); oct vence 17-nov
  expect(r.body.vencimientos.map(v => [v.periodo, v.fecha_vence, v.estado])).toEqual([['2026-10', '2026-11-17', 'proxima']]);

  const u = await api().put(`/api/agenda/${c.body.id}`).send({ fecha: '2026-11-13', titulo: 'Revisión', tipo: 'llamada', empresa_id: '' });
  expect(u.body).toMatchObject({ fecha: '2026-11-13', hora: null, tipo: 'llamada', empresa_id: null });

  expect((await api().delete(`/api/agenda/${c.body.id}`)).status).toBe(204);
  expect((await api().delete(`/api/agenda/${c.body.id}`)).status).toBe(404);
});

test('validaciones y permisos', async () => {
  expect((await api().get('/api/agenda?desde=2026-11-30&hasta=2026-11-01')).status).toBe(400);
  expect((await api().get('/api/agenda?desde=2026-01-01&hasta=2026-06-01')).status).toBe(400);
  expect((await api().post('/api/agenda').send({ fecha: '2026-11-01', titulo: '  ' })).status).toBe(400);
  expect((await api().post('/api/agenda').send({ fecha: '2026-11-01', titulo: 'X', hora: '25:00' })).status).toBe(400);
  expect((await api().post('/api/agenda').send({ fecha: '2026-11-01', titulo: 'X', tipo: 'fiesta' })).status).toBe(400);
  expect((await api().post('/api/agenda').send({ fecha: '2026-11-01', titulo: 'X', empresa_id: 999 })).status).toBe(400);
  expect((await api(null, 'consulta').post('/api/agenda').send({ fecha: '2026-11-01', titulo: 'X' })).status).toBe(403);
  expect((await api().put('/api/agenda/999').send({ fecha: '2026-11-01', titulo: 'X' })).status).toBe(404);
});
