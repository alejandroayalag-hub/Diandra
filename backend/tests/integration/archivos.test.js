const path = require('path');
const { UPLOADS_DIR, relativa, absoluta } = require('../../src/lib/archivos');
const upload = require('../../src/middleware/upload');

test('UPLOADS_DIR sale del env', () => {
  expect(UPLOADS_DIR).toBe(path.resolve(process.env.UPLOADS_DIR));
});

test('relativa y absoluta son inversas', () => {
  const abs = path.join(UPLOADS_DIR, 'pagos', 'a.pdf');
  expect(relativa(abs)).toBe(path.join('pagos', 'a.pdf'));
  expect(absoluta(relativa(abs))).toBe(abs);
});

test('absoluta rechaza salir de uploads', () => {
  expect(() => absoluta('../../etc/passwd')).toThrow('Ruta de archivo inválida');
  expect(() => absoluta('/etc/passwd')).toThrow('Ruta de archivo inválida');
});

test('multer guarda dentro de UPLOADS_DIR', (done) => {
  upload.storage.getDestination({}, {}, (err, dir) => {
    expect(err).toBeNull();
    expect(dir).toBe(UPLOADS_DIR);
    done();
  });
});
