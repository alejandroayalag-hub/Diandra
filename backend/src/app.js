const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const errorHandler = require('./middleware/errorHandler');
const authMiddleware = require('./middleware/auth');
const empresaMiddleware = require('./middleware/empresa');
const { UPLOADS_DIR } = require('./lib/archivos');

const app = express();

app.set('trust proxy', 1); // detrás de nginx
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://62.238.3.136:8098' }));
app.use(express.json());

// ponytail: solo imágenes públicas (fotos de perfil, <img> sin header auth).
// Los PDF/DOC (contratos, IMSS, finiquitos) NO se sirven aquí — solo por sus rutas /api/* autenticadas.
app.use('/uploads', (req, res, next) => {
  if (/\.(png|jpe?g|gif|webp)$/i.test(req.path)) return next();
  res.status(404).end();
}, express.static(UPLOADS_DIR));

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });
app.use('/api/auth', loginLimiter, require('./routes/auth'));
app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use('/api/empresas', authMiddleware, require('./routes/empresas'));
app.use('/api/empleados', authMiddleware, empresaMiddleware, require('./routes/empleados'));
app.use('/api/obligaciones', authMiddleware, require('./routes/obligaciones'));   // del despacho, sin X-Empresa-Id
app.use('/api/agenda', authMiddleware, require('./routes/agenda'));               // del despacho, sin X-Empresa-Id
app.use('/api/control', authMiddleware, require('./routes/control'));             // del despacho, sin X-Empresa-Id
app.use('/api/documentos', authMiddleware, require('./routes/documentos'));   // /tipos es compartido; el router aplica empresa al resto
app.use('/api/contratos', authMiddleware, empresaMiddleware, require('./routes/contratos'));
app.use('/api/pagos', authMiddleware, empresaMiddleware, require('./routes/pagos'));
app.use('/api/formatos', authMiddleware, require('./routes/formatos'));       // catálogo compartido del despacho
app.use('/api/checadas', require('./routes/checadas'));                       // agente por api_key; el panel aplica auth+empresa en el router
app.use('/api/salidas', authMiddleware, empresaMiddleware, require('./routes/salidas'));
app.use('/api/documentosSalida', authMiddleware, empresaMiddleware, require('./routes/documentosSalida'));
app.use('/api/culturas', authMiddleware, empresaMiddleware, require('./routes/culturas'));

app.use(errorHandler);

module.exports = app;
