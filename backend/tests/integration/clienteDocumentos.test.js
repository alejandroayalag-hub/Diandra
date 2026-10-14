const fs = require('fs');
const path = require('path');
const { pool, resetDb, api, crearEmpresa } = require('../helpers');
const { pdfConLineas } = require('../fixtures/pdf');
const { CSF_LINEAS } = require('../fixtures/csf');

beforeEach(resetDb);
afterAll(() => pool.end());

const csfPdf = () => pdfConLineas(CSF_LINEAS);   // RFC AUR010101AB1
const subir = (empresaId, tipo, buf, nombre = 'csf.pdf', role) =>
  api(null, role).post(`/api/empresas/${empresaId}/documentos`).field('tipo', tipo).attach('archivo', buf, nombre);

describe('documentos del cliente', () => {
  test('sube acta, la lista y la descarga', async () => {
    const e = await crearEmpresa();
    const up = await subir(e.id, 'acta', pdfConLineas(['ACTA']), 'acta.pdf');
    expect(up.status).toBe(201);
    expect(up.body.documento).toMatchObject({ tipo: 'acta', nombre_original: 'acta.pdf' });
    expect(path.isAbsolute(up.body.documento.archivo)).toBe(false);
    const lista = await api().get(`/api/empresas/${e.id}/documentos`);
    expect(lista.body).toHaveLength(1);
    const dl = await api().get(`/api/empresas/${e.id}/documentos/${up.body.documento.id}/download`);
    expect(dl.status).toBe(200);
  });

  test('documento de otra empresa → 404', async () => {
    const a = await crearEmpresa();
    const b = await crearEmpresa();
    const up = await subir(a.id, 'acta', pdfConLineas(['ACTA']), 'acta.pdf');
    expect((await api().get(`/api/empresas/${b.id}/documentos/${up.body.documento.id}/download`)).status).toBe(404);
  });

  test('tipo inválido → 400; CSF que no es PDF → 400; empresa inexistente → 404', async () => {
    const e = await crearEmpresa();
    expect((await subir(e.id, 'otro', csfPdf())).status).toBe(400);
    const png = await api().post(`/api/empresas/${e.id}/documentos`).field('tipo', 'csf')
      .attach('archivo', Buffer.from('x'), { filename: 'csf.png', contentType: 'image/png' });
    expect(png.status).toBe(400);
    expect((await subir(99999, 'acta', csfPdf())).status).toBe(404);
  });

  test('rol consulta no puede subir', async () => {
    const e = await crearEmpresa();
    expect((await subir(e.id, 'acta', csfPdf(), 'a.pdf', 'consulta')).status).toBe(403);
  });
});

describe('CSF → obligaciones', () => {
  test('subir CSF propone obligaciones sin guardarlas; RFC coincide → sin aviso', async () => {
    const e = await crearEmpresa({ rfc: 'AUR010101AB1' });
    const r = await subir(e.id, 'csf', csfPdf());
    expect(r.status).toBe(201);
    expect(r.body.aviso).toBeNull();
    expect(r.body.nuevas).toHaveLength(5);
    expect(r.body.existentes).toEqual([]);
    expect((await api().get(`/api/empresas/${e.id}/obligaciones`)).body).toEqual([]);
  });

  test('CSF de otro RFC → aviso', async () => {
    const e = await crearEmpresa({ rfc: 'XYZ010101AB1' });
    const r = await subir(e.id, 'csf', csfPdf());
    expect(r.body.aviso).toMatch(/XYZ010101AB1/);
  });

  test('confirmar guarda; reemplazar conserva ediciones y desactiva las que faltan', async () => {
    const e = await crearEmpresa({ rfc: 'AUR010101AB1' });
    const { body } = await subir(e.id, 'csf', csfPdf());
    const conf = await api().put(`/api/empresas/${e.id}/obligaciones`).send({ obligaciones: body.nuevas });
    expect(conf.status).toBe(200);
    expect(conf.body).toHaveLength(5);
    expect(conf.body[0]).toHaveProperty('alta');

    // Diana corrige el día de una y quita otra.
    const editadas = conf.body.filter(o => o.descripcion !== 'Pago definitivo mensual de IVA')
      .map(o => (o.descripcion === 'Declaración de proveedores de IVA' ? { ...o, dia: 30 } : o));
    const r2 = await api().put(`/api/empresas/${e.id}/obligaciones`).send({ obligaciones: editadas });
    expect(r2.body).toHaveLength(4);
    expect(r2.body.find(o => o.descripcion === 'Declaración de proveedores de IVA').dia).toBe(30);
    const { rows } = await pool.query('SELECT count(*)::int AS n FROM empresa_obligaciones WHERE NOT activa');
    expect(rows[0].n).toBe(1);

    // Nueva CSF: la quitada reaparece como "nueva"; la editada sigue como existente con día 30.
    const otra = await subir(e.id, 'csf', csfPdf());
    expect(otra.body.nuevas.map(o => o.descripcion)).toEqual(['Pago definitivo mensual de IVA']);
    expect(otra.body.existentes.find(o => o.descripcion === 'Declaración de proveedores de IVA').dia).toBe(30);
  });

  test('validación de obligaciones → 400', async () => {
    const e = await crearEmpresa();
    const r = await api().put(`/api/empresas/${e.id}/obligaciones`)
      .send({ obligaciones: [{ descripcion: 'Anual', periodicidad: 'anual', dia: 31 }] });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/Mes/);
  });

  test('PUT obligaciones de empresa inexistente → 404', async () => {
    const r = await api().put('/api/empresas/99999/obligaciones').send({ obligaciones: [] });
    expect(r.status).toBe(404);
  });
});

test('archivo rechazado no deja basura en uploads', async () => {
  const antes = fs.readdirSync(process.env.UPLOADS_DIR).length;
  await subir(99999, 'acta', csfPdf());
  expect(fs.readdirSync(process.env.UPLOADS_DIR).length).toBe(antes);
});
