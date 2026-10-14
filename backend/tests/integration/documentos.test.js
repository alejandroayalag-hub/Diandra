const fs = require('fs');
const path = require('path');
const { pool, resetDb, api, crearEmpresa, crearEmpleado } = require('../helpers');
const { UPLOADS_DIR } = require('../../src/lib/archivos');

const pdf = Buffer.from('%PDF-1.4\n%prueba\n');
let A, B, empA, empB, tipoId;

beforeEach(async () => {
  await resetDb();
  A = await crearEmpresa({ representante_legal: 'Rep A', razon_social: 'Empresa A' });
  B = await crearEmpresa({ representante_legal: 'Rep B', razon_social: 'Empresa B' });
  empA = await crearEmpleado(A.id, { nombre: 'Juan', apellido_paterno: 'Pérez' });
  empB = await crearEmpleado(B.id, { nombre: 'Juan', apellido_paterno: 'Pérez' });
  tipoId = (await pool.query("SELECT id FROM tipos_documento WHERE nombre <> 'Contrato de trabajo' LIMIT 1")).rows[0].id;
});
afterAll(() => pool.end());

const subir = (empresaId, empleadoId) => api(empresaId).post('/api/documentos/upload')
  .field('empleado_id', String(empleadoId)).field('tipo_documento_id', String(tipoId))
  .attach('archivo', pdf, { filename: 'ine.pdf', contentType: 'application/pdf' });

test('tipos de documento no requieren empresa', async () => {
  const res = await api().get('/api/documentos/tipos');
  expect(res.status).toBe(200);
  expect(res.body.length).toBe(17);
});

test('subir guarda ruta relativa y se descarga', async () => {
  const up = await subir(A.id, empA.id);
  expect(up.status).toBe(201);
  expect(path.isAbsolute(up.body.ruta)).toBe(false);
  const dl = await api(A.id).get(`/api/documentos/${up.body.id}/download`);
  expect(dl.status).toBe(200);
});

test('no se sube documento a empleado de otra empresa', async () => {
  const res = await subir(A.id, empB.id);
  expect(res.status).toBe(404);
  expect((await pool.query('SELECT count(*)::int n FROM documentos')).rows[0].n).toBe(0);
});

test('listar, descargar y borrar documento de otra empresa → 404', async () => {
  const docB = (await subir(B.id, empB.id)).body;
  expect((await api(A.id).get(`/api/documentos/empleado/${empB.id}`)).status).toBe(404);
  expect((await api(A.id).get(`/api/documentos/${docB.id}/download`)).status).toBe(404);
  expect((await api(A.id).delete(`/api/documentos/${docB.id}`)).status).toBe(404);
  expect(fs.existsSync(path.join(UPLOADS_DIR, docB.ruta))).toBe(true);
});

test('formatos: ruta relativa y descarga', async () => {
  const up = await api().post(`/api/formatos/${tipoId}`).attach('archivo', pdf, { filename: 'f.pdf', contentType: 'application/pdf' });
  expect(up.status).toBe(200);
  expect(up.body.formato_ruta).toBe(path.join('formatos', `formato_${tipoId}.pdf`));
  expect((await api().get(`/api/formatos/${tipoId}/descargar`)).status).toBe(200);
});

describe('contratos', () => {
  test('llena datos del patrón desde la empresa', async () => {
    const res = await api(A.id).post(`/api/contratos/generar/${empA.id}`).send({ nombre_trabajador: 'Juan Pérez' });
    expect(res.status).toBe(201);
    const PizZip = require('pizzip');
    const xml = new PizZip(fs.readFileSync(path.join(UPLOADS_DIR, res.body.ruta))).file('word/document.xml').asText();
    expect(xml).toContain('Rep A');
    expect(xml).toContain('Empresa A');
  });

  test('empleado de otra empresa → 404', async () => {
    expect((await api(A.id).post(`/api/contratos/generar/${empB.id}`).send({})).status).toBe(404);
  });

  test('nombres de contrato no colisionan entre empresas', async () => {
    const a = await api(A.id).post(`/api/contratos/generar/${empA.id}`).send({ nombre_trabajador: 'Juan Pérez' });
    const b = await api(B.id).post(`/api/contratos/generar/${empB.id}`).send({ nombre_trabajador: 'Juan Pérez' });
    expect(a.body.ruta).not.toBe(b.body.ruta);
    expect(fs.existsSync(path.join(UPLOADS_DIR, a.body.ruta))).toBe(true);
  });
});

test('upload de .txt → 400', async () => {
  const res = await api(A.id).post('/api/documentos/upload')
    .field('empleado_id', String(empA.id)).field('tipo_documento_id', String(tipoId))
    .attach('archivo', Buffer.from('hola'), { filename: 'a.txt', contentType: 'text/plain' });
  expect(res.status).toBe(400);
});

describe('formatos: tipoId', () => {
  test('tipoId no numérico → 400 y no escribe fuera de UPLOADS_DIR/formatos', async () => {
    const antes = fs.readdirSync(UPLOADS_DIR).sort();
    const res = await api(A.id).post('/api/formatos/..%2F..%2Fx')
      .attach('archivo', pdf, { filename: 'f.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(400);
    expect(fs.readdirSync(UPLOADS_DIR).sort()).toEqual(antes);
    expect(fs.existsSync(path.join(UPLOADS_DIR, '..', 'x.pdf'))).toBe(false);
  });
});
