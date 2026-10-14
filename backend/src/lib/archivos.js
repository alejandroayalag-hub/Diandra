const path = require('path');

// ponytail: rutas en BD relativas a UPLOADS_DIR — mover la app de carpeta no rompe archivos (lección RHATA 2026-10-13).
const UPLOADS_DIR = path.resolve(process.env.UPLOADS_DIR || path.join(__dirname, '..', '..', 'uploads'));

function relativa(abs) {
  return path.relative(UPLOADS_DIR, path.resolve(abs));
}

function absoluta(rel) {
  const abs = path.resolve(UPLOADS_DIR, rel);
  if (abs !== UPLOADS_DIR && !abs.startsWith(UPLOADS_DIR + path.sep)) {
    throw Object.assign(new Error('Ruta de archivo inválida'), { status: 400 });
  }
  return abs;
}

module.exports = { UPLOADS_DIR, relativa, absoluta };
