const fs = require('fs');
const { pool, resetDb, api, crearEmpresa } = require('../helpers');
const { absoluta } = require('../../src/lib/archivos');

beforeEach(resetDb);
afterEach(() => jest.restoreAllMocks());
afterAll(() => pool.end());

const fijarHoy = (f) => jest.spyOn(Date, 'now').mockReturnValue(new Date(`${f}T18:00:00Z`).getTime());
const PDF = Buffer.from('%PDF-1.4\n%%EOF');

async function cliente(extra = {}) {
  const e = await crearEmpresa();
  await pool.query('UPDATE empresas SET monto_facturacion = $1, cobro_desde = $2, registro_patronal = $3 WHERE id = $4',
    [extra.honorario ?? 1000, extra.desde ?? '2026-08', extra.patronal ?? null, e.id]);
  return e;
}

test('resumen: saldo, documentos por defecto, obligaciones y notas del mes', async () => {
  fijarHoy('2026-10-20');
  const a = await cliente();
  const b = await cliente({ patronal: 'Y1234567890' });
  await crearEmpresa({ activo: false });
  await pool.query(
    `INSERT INTO empresa_obligaciones (empresa_id, descripcion, periodicidad, dia, created_at)
     VALUES ($1, 'IVA mensual', 'mensual', 17, '2026-09-01 12:00')`, [a.id]);

  expect((await api().post(`/api/control/${a.id}/pagos`).send({ monto: 1500, fecha_pago: '2026-09-05' })).status).toBe(201);
  expect((await api().post(`/api/control/${a.id}/bitacora`).send({ periodo: '2026-10', texto: 'Declaración lista' })).status).toBe(201);

  const r = await api().get('/api/control?periodo=2026-10');
  expect(r.status).toBe(200);
  const fa = r.body.clientes.find(c => c.empresa_id === a.id);
  const fb = r.body.clientes.find(c => c.empresa_id === b.id);
  expect(r.body.clientes).toHaveLength(2);   // inactivo fuera
  expect(fa).toMatchObject({ saldo: 1500, estado_mes: 'pendiente', docs_total: 3, docs_recibidos: 0,
    obligaciones_total: 1, obligaciones_presentadas: 0, notas: 1 });   // sep vence 19-oct, ya vencida
  expect(fb).toMatchObject({ saldo: 3000, docs_total: 5 });           // con registro patronal: + Nómina e IMSS
  expect(r.body.totales).toEqual({ por_cobrar: 4500, con_documentos_pendientes: 2, obligaciones_vencidas: 1 });

  expect((await api().get('/api/control?periodo=2026-13')).status).toBe(400);
});

test('detalle: pagos FIFO, recibir documento con archivo, deshacer, editar lista', async () => {
  fijarHoy('2026-10-20');
  const a = await cliente();
  await api().post(`/api/control/${a.id}/pagos`).send({ monto: 2500, fecha_pago: '2026-10-01', forma_pago: 'Transferencia' });
  let d = (await api().get(`/api/control/${a.id}?periodo=2026-09`)).body;
  expect(d.cuenta.meses.map(m => m.estado)).toEqual(['pagado', 'pagado', 'parcial']);
  expect(d.cuenta).toMatchObject({ saldo: 500, estado_mes: 'pagado' });
  expect(d.pagos[0]).toMatchObject({ forma_pago: 'Transferencia', registro: 'Test' });

  const xml = d.documentos.find(x => x.nombre === 'XML emitidos');
  const sub = await api().post(`/api/control/${a.id}/documentos/${xml.requerido_id}/recibido`)
    .field('periodo', '2026-09').attach('archivo', PDF, 'xml.pdf');
  expect(sub.status).toBe(201);
  const ruta = absoluta((await pool.query('SELECT archivo FROM documentos_recibidos WHERE id = $1', [sub.body.id])).rows[0].archivo);
  expect(fs.existsSync(ruta)).toBe(true);
  expect((await api().get(`/api/control/recibidos/${sub.body.id}/archivo`)).status).toBe(200);
  expect((await api().post(`/api/control/${a.id}/documentos/${xml.requerido_id}/recibido`).field('periodo', '2026-09')).status).toBe(409);

  d = (await api().get(`/api/control/${a.id}?periodo=2026-09`)).body;
  expect(d.documentos.find(x => x.nombre === 'XML emitidos')).toMatchObject({ tiene_archivo: true, fecha_recibido: '2026-10-20' });

  expect((await api().delete(`/api/control/recibidos/${sub.body.id}`)).status).toBe(204);
  await new Promise(r => setTimeout(r, 50));
  expect(fs.existsSync(ruta)).toBe(false);

  const lista = await api().put(`/api/control/${a.id}/documentos-requeridos`).send({ nombres: ['XML emitidos', ' Pólizas ', ''] });
  expect(lista.body.map(x => x.nombre)).toEqual(['XML emitidos', 'Pólizas']);
  d = (await api().get(`/api/control/${a.id}?periodo=2026-10`)).body;
  expect(d.documentos.map(x => x.nombre)).toEqual(['XML emitidos', 'Pólizas']);   // no re-siembra defaults
});

test('validaciones y permisos', async () => {
  const a = await cliente();
  expect((await api().post(`/api/control/${a.id}/pagos`).send({ monto: 0, fecha_pago: '2026-10-01' })).status).toBe(400);
  expect((await api().post(`/api/control/${a.id}/pagos`).send({ monto: 10, fecha_pago: 'ayer' })).status).toBe(400);
  expect((await api().post('/api/control/9999/pagos').send({ monto: 10, fecha_pago: '2026-10-01' })).status).toBe(404);
  expect((await api().post(`/api/control/${a.id}/bitacora`).send({ periodo: '2026-10', texto: '  ' })).status).toBe(400);
  expect((await api(null, 'consulta').post(`/api/control/${a.id}/pagos`).send({ monto: 10, fecha_pago: '2026-10-01' })).status).toBe(403);
  expect((await api().get('/api/control/abc')).status).toBe(400);
  expect((await api().put(`/api/empresas/${a.id}`).send({ razon_social: 'X', rfc: a.rfc, cobro_desde: '2026-1' })).status).toBe(400);
});
