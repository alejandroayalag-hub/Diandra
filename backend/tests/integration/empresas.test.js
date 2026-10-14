const { pool, resetDb, api, crearEmpresa } = require('../helpers');

beforeEach(resetDb);
afterAll(() => pool.end());

const datos = {
  razon_social: 'Abarrotes Uruapan SA de CV', rfc: 'aur010101ab1', registro_patronal: 'Y1234567890',
  representante_legal: 'María Gómez', domicilio: 'Av. Juárez 10', colonia: 'Centro', cp: '60000',
  ciudad: 'Uruapan', giro: 'Comercio',
};

describe('/api/empresas', () => {
  test('crea empresa y normaliza RFC a mayúsculas', async () => {
    const res = await api().post('/api/empresas').send(datos);
    expect(res.status).toBe(201);
    expect(res.body.rfc).toBe('AUR010101AB1');
    expect(res.body.activo).toBe(true);
  });

  test('rechaza RFC inválido con 400', async () => {
    const res = await api().post('/api/empresas').send({ ...datos, rfc: 'XX' });
    expect(res.status).toBe(400);
  });

  test('rechaza sin razón social con 400', async () => {
    const res = await api().post('/api/empresas').send({ ...datos, razon_social: '' });
    expect(res.status).toBe(400);
  });

  test('RFC duplicado responde 409', async () => {
    await api().post('/api/empresas').send(datos);
    const res = await api().post('/api/empresas').send(datos);
    expect(res.status).toBe(409);
  });

  test('lista con conteo de empleados activos', async () => {
    const e = await crearEmpresa();
    await pool.query(
      "INSERT INTO empleados (empresa_id, nombre, apellido_paterno, email) VALUES ($1,'A','B','a@b.mx')", [e.id]);
    const res = await api().get('/api/empresas');
    expect(res.status).toBe(200);
    expect(res.body[0].empleados_activos).toBe(1);
  });

  test('actualiza y desactiva sin borrar', async () => {
    const e = await crearEmpresa();
    const up = await api().put(`/api/empresas/${e.id}`).send({ giro: 'Servicios', rfc: e.rfc, razon_social: e.razon_social });
    expect(up.status).toBe(200);
    expect(up.body.giro).toBe('Servicios');
    const off = await api().patch(`/api/empresas/${e.id}/activo`).send({ activo: false });
    expect(off.status).toBe(200);
    expect(off.body.activo).toBe(false);
    const { rows } = await pool.query('SELECT count(*)::int AS n FROM empresas');
    expect(rows[0].n).toBe(1);
  });

  test('rol distinto de admin/rh no puede crear', async () => {
    const res = await api(null, 'consulta').post('/api/empresas').send(datos);
    expect(res.status).toBe(403);
  });
});

describe('middleware de empresa activa', () => {
  test('sin header → 400 EMPRESA_REQUERIDA', async () => {
    const res = await api().get('/api/empleados');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('EMPRESA_REQUERIDA');
  });

  test('header basura → 400', async () => {
    const res = await api('1abc').get('/api/empleados');
    expect(res.status).toBe(400);
  });

  test('empresa inexistente → 404 EMPRESA_INVALIDA', async () => {
    const res = await api(999).get('/api/empleados');
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('EMPRESA_INVALIDA');
  });

  test('empresa inactiva → 404', async () => {
    const e = await crearEmpresa({ activo: false });
    const res = await api(e.id).get('/api/empleados');
    expect(res.status).toBe(404);
  });
});
