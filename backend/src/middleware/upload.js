const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { UPLOADS_DIR } = require('../lib/archivos');

const storage = multer.diskStorage({
  destination(req, file, cb) {
    if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    cb(null, UPLOADS_DIR);
  },
  filename(req, file, cb) {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  },
});

const allowedMimes = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

const fileFilter = (req, file, cb) => {
  const allowed = ['.pdf', '.jpg', '.jpeg', '.png', '.docx', '.doc'];
  const ext = path.extname(file.originalname).toLowerCase();
  // Validar extensión Y mimetype — la extensión sola es falsificable.
  if (allowed.includes(ext) && allowedMimes.has(file.mimetype)) cb(null, true);
  else cb(new Error('Tipo de archivo no permitido. Use PDF, imagen o Word.'));
};

module.exports = multer({ storage, fileFilter, limits: { fileSize: 20 * 1024 * 1024 } });
