const fs = require('fs');
const { pool, resetDb, api, crearEmpresa } = require('../helpers');
const { absoluta } = require('../../src/lib/archivos');

beforeEach(resetDb);
afterEach(() => jest.restoreAllMocks());
afterAll(() => pool.end());

const fijarHoy = (f) => jest.spyOn(Date, 'now').mockReturnValue(new Date(`${f}T18:00:00Z`).getTime());

async function crearObligacion(empresaId, extra = {}) {
  const o = { descripcion: 'Pago definitivo mensual de IVA', periodicidad: 'mensual', dia: 17, mes: null, alta: '2026-10-14', ...extra };
  const { rows } = await pool.query(
    `INSERT INTO empresa_obligaciones (empresa_id, descripcion, periodicidad, dia, mes, fecha_inicio, created_at)
     VALUES ($1,$2,$3,$4,$5,'2022-01-01',$6) RETURNING id`,
    [empresaId, o.descripcion, o.periodicidad, o.dia, o.mes, `${o.alta} 12:00:00`]);
  return rows[0].id;
}

const presentar = (obId, periodo, extra = {}) => {
  const r = api().post(`/api/obligaciones/${obId}/cumplimientos`).field('periodo', periodo);
  if (extra.fecha) r.field('fecha_presentacion', extra.fecha);
  if (extra.acuse) r.attach('acuse', extra.acuse, 'acuse.pdf');
  return r;
};

describe('calendario', () => {
  test('estados y vencidas anteriores a "desde"; lo presentado desaparece', async () => {
    fijarHoy('2026-11-20');
    const e = await crearEmpresa();
    const ob = await crearObligacion(e.id);
    const url = '/api/obligaciones/calendario?desde=2026-11-01&hasta=2026-12-31';
    let r = await api().get(url);
    expect(r.status).toBe(200);
    expect(r.body.map(i => [i.periodo, i.fecha_vence, i.estado])).toEqual([
      ['2026-09', '2026-10-19', 'vencida'], ['2026-10', '2026-11-17', 'vencida'], ['2026-11', '2026-12-17', 'pendiente'],
    ]);
    expect(r.body[0].razon_social).toBe(e.razon_social);

    expect((await presentar(ob, '2026-09', { fecha: '2026-10-18' })).status).toBe(201);
    r = await api().get(url);
    expect(r.body.map(i => i.periodo)).toEqual(['2026-10', '2026-11']);
  });

  test('sin parámetros usa mes actual y siguiente', async () => {
    fijarHoy('2026-10-20');
    const e = await crearEmpresa();
    await crearObligacion(e.id);
    const r = await api().get('/api/obligaciones/calendario');
    expect(r.body.map(i => i.periodo)).toEqual(['2026-09', '2026-10']);   // vence 19-oct y 17-nov
  });

  test('excluye clientes inactivos, obligaciones manuales e inactivas; filtra por empresa', async () => {
    fijarHoy('2026-11-20');
    const a = await crearEmpresa();
    const b = await crearEmpresa({ activo: false });
    await crearObligacion(a.id);
    await crearObligacion(a.id, { descripcion: 'Rara', periodicidad: 'manual', dia: null });
    await crearObligacion(b.id);
    const inactiva = await crearObligacion(a.id, { descripcion: 'Vieja' });
    await pool.query('UPDATE empresa_obligaciones SET activa = false WHERE id = $1', [inactiva]);
    const otra = await crearEmpresa();
    await crearObligacion(otra.id);

    const todas = await api().get('/api/obligaciones/calendario?desde=2026-11-01&hasta=2026-11-30');
    expect(new Set(todas.body.map(i => i.empresa_id))).toEqual(new Set([a.id, otra.id]));
    expect(todas.body.every(i => i.descripcion === 'Pago definitivo mensual de IVA')).toBe(true);
    const solo = await api().get(`/api/obligaciones/calendario?desde=2026-11-01&hasta=2026-11-30&empresa_id=${a.id}`);
    expect(solo.body.every(i => i.empresa_id === a.id)).toBe(true);
  });

  test('fechas o empresa inválidas → 400', async () => {
    expect((await api().get('/api/obligaciones/calendario?desde=ayer')).status).toBe(400);
    expect((await api().get('/api/obligaciones/calendario?desde=2026-12-01&hasta=2026-11-01')).status).toBe(400);
    expect((await api().get('/api/obligaciones/calendario?empresa_id=abc')).status).toBe(400);
  });
});

test('resumen cuenta vencidas y las de esta semana', async () => {
  fijarHoy('2026-12-12');
  const e = await crearEmpresa();
  await crearObligacion(e.id);
  const r = await api().get('/api/obligaciones/resumen');
  expect(r.body).toEqual({ vencidas: 2, esta_semana: 1 });   // sep y oct vencidas; nov vence 17-dic
});

describe('cumplimientos', () => {
  test('con acuse: descarga, deshacer borra registro y archivo', async () => {
    fijarHoy('2026-11-20');
    const e = await crearEmpresa();
    const ob = await crearObligacion(e.id);
    const c = await presentar(ob, '2026-10', { acuse: Buffer.from('%PDF-1.4 acuse') });
    expect(c.status).toBe(201);
    expect(c.body.fecha_presentacion).toBe('2026-11-20');   // default hoy
    const dl = await api().get(`/api/obligaciones/cumplimientos/${c.body.id}/acuse`);
    expect(dl.status).toBe(200);
    const ruta = absoluta(c.body.acuse);
    expect(fs.existsSync(ruta)).toBe(true);
    expect((await api().delete(`/api/obligaciones/cumplimientos/${c.body.id}`)).status).toBe(204);
    expect(fs.existsSync(ruta)).toBe(false);
    expect((await api().delete(`/api/obligaciones/cumplimientos/${c.body.id}`)).status).toBe(404);
  });

  test('mismo periodo dos veces → 409 y el acuse del intento no queda en disco', async () => {
    const e = await crearEmpresa();
    const ob = await crearObligacion(e.id);
    await presentar(ob, '2026-10');
    const antes = fs.readdirSync(process.env.UPLOADS_DIR).length;
    const r = await presentar(ob, '2026-10', { acuse: Buffer.from('%PDF-1.4 x') });
    expect(r.status).toBe(409);
    expect(fs.readdirSync(process.env.UPLOADS_DIR).length).toBe(antes);
  });

  test('periodo inválido, fecha inválida, obligación inexistente o id basura', async () => {
    const e = await crearEmpresa();
    const ob = await crearObligacion(e.id);
    expect((await presentar(ob, '2026-13')).status).toBe(400);
    expect((await presentar(ob, '2026-B1')).status).toBe(400);
    expect((await presentar(ob, '2026-10', { fecha: '20/10/2026' })).status).toBe(400);
    expect((await presentar(99999, '2026-10')).status).toBe(404);
    expect((await api().post('/api/obligaciones/abc/cumplimientos').field('periodo', '2026-10')).status).toBe(400);
  });

  test('acuse inexistente → 404; rol consulta no registra', async () => {
    const e = await crearEmpresa();
    const ob = await crearObligacion(e.id);
    const c = await presentar(ob, '2026-10');
    expect((await api().get(`/api/obligaciones/cumplimientos/${c.body.id}/acuse`)).status).toBe(404);
    const r = await api(null, 'consulta').post(`/api/obligaciones/${ob}/cumplimientos`).field('periodo', '2026-11');
    expect(r.status).toBe(403);
  });
});
