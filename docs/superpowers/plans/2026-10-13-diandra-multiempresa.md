# DIANDRA RH Multiempresa — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fork de RHATA (`~/rhata`) en `~/diandra` convertido a multiempresa: el despacho de Diana Andrade gestiona el RH de los empleados de varias empresas cliente sin que se crucen datos, desplegado en http://62.238.3.136:8098.

**Architecture:** Express 5 + PostgreSQL (backend) y React 19 + Vite + Tailwind (frontend), igual que RHATA. Se agrega la tabla `empresas` y `empresa_id` en las tablas raíz. Un middleware fija `req.empresaId` desde el header `X-Empresa-Id`, y cada modelo recibe `empresaId` como primer parámetro y filtra con él (las tablas hijas hacen JOIN con su padre). Los archivos se guardan con rutas relativas a `UPLOADS_DIR`.

**Tech Stack:** Node 20, Express 5, pg 8, multer 2, docxtemplater + pizzip, jest 29 + supertest 7 contra Postgres 16 real (Docker), React 19, react-router-dom, axios, Vite.

**Spec:** `~/diandra/docs/superpowers/specs/2026-10-13-diandra-multiempresa-design.md`

## Global Constraints

- Carpeta local `~/diandra/`; servidor `/home/apps/diandra/` (owner `apps`).
- Puertos: backend **3015**, Postgres **5445** (local y servidor, servidor bound `127.0.0.1`), nginx **8098**.
- Nombres: PM2 `diandra-backend`, contenedor `diandra-postgres-1`, DB `diandra`, user `diandra_user`, DB de pruebas `diandra_test`.
- Marca "DIANDRA"; admin `admin@diandra.com`. Ningún texto "ATA" / "Grupo ATA" / "RH-ATA" ni el logo `logo-ata.png`.
- `empresa_id` siempre sale de `req.empresaId` (header validado) o del dispositivo checador; **nunca del body ni de la query**.
- Un id que existe pero pertenece a otra empresa responde **404**, no 403.
- La BD guarda rutas de archivo **relativas a `UPLOADS_DIR`**; se resuelven con `src/lib/archivos.js`.
- Empresas no se borran: solo `activo = false`.
- Ningún secreto en git: contraseña de la DB y `JWT_SECRET` solo en archivos `.env` del servidor (`openssl rand -hex 24`), y un `.env` existente nunca se sobrescribe.
- Se conserva el endurecimiento de RHATA: rate limit en `/api/auth`, `trust proxy 1`, `/uploads` estático solo imágenes, CORS por env, errorHandler sin detalle en 500 y validación de mimetype.
- Test runner: **jest + supertest** (ya instalados en RHATA). El spec decía `node --test`; se usa jest para no agregar otra herramienta. Las pruebas corren con `--runInBand` contra `diandra_test`.
- Contratos: se conserva la ruta existente de RHATA `POST /api/contratos/generar/:empleadoId` (el frontend ya la usa), no la `POST /api/contratos/:empleadoId` del spec.

## Review Focus

1. **Ids no numéricos o basura** (`/api/empleados/abc`, `X-Empresa-Id: 1abc`): responder 400 o 404, nunca 500. Lo cubren el mapeo de pg `22P02` en el errorHandler (Task 1) y el test del middleware (Task 2).
2. **Dos empresas generan el contrato de empleados con el mismo nombre**: no se puede sobrescribir el `.docx` de otra empresa. El nombre del archivo lleva el id del empleado y un timestamp (Task 5, test "nombres de contrato no colisionan").
3. **Mismo CURP/RFC de empleado en el mismo cliente**: responder 409 claro, no 500. En otro cliente sí se permite (Task 4).
4. **Importar pagos con `empleado_id` de otra empresa en el JSON del cliente**: el backend lo descarta (queda NULL) y no liga el pago (Task 6).
5. **Mapear en el checador un empleado de la empresa A a un reloj de la empresa B**: 404 en el panel; el agente no registra checadas cruzadas (Task 7).

Fuera de alcance, ya existente en RHATA: los archivos de Cultura que no son imágenes (PDF) no abren desde `/uploads`, porque el estático solo sirve imágenes. Se deja igual.

---

## File Structure

**Backend (`~/diandra/backend/`)**
- `src/app.js` (nuevo): arma la app Express y la exporta, sin `listen`. Se usa en las pruebas.
- `src/index.js` (modificado): corre migraciones y luego `app.listen`.
- `src/lib/archivos.js` (nuevo): `UPLOADS_DIR`, `relativa(abs)`, `absoluta(rel)`.
- `src/middleware/empresa.js` (nuevo): valida `X-Empresa-Id` y fija `req.empresaId`.
- `src/middleware/errorHandler.js` (modificado): mapea códigos de error de pg.
- `src/db/migrations/013_multiempresa.sql` (nuevo).
- `src/models/empresa.js` y `src/routes/empresas.js` (nuevos).
- Modelos, controladores y rutas existentes (modificados): todos reciben `empresaId`.
- `scripts/create-admin.js` (modificado) y `scripts/create-dispositivo.js` (nuevo).
- `tests/setupEnv.js`, `tests/helpers.js` (nuevos) y `tests/integration/*.test.js` (nuevos).
- `tests/models`, `tests/controllers`, `tests/routes` (se **borran**: fijan firmas de una sola empresa con el pool mockeado y no pueden detectar cruces entre empresas; los reemplazan las pruebas de integración).

**Frontend (`~/diandra/frontend/src/`)**
- `empresaActiva.js` (nuevo): lee y escribe la empresa activa en `localStorage`.
- `api/empresas.js` (nuevo) y `api/client.js` (modificado: header y manejo de error de empresa).
- `pages/EmpresasPage.jsx` y `pages/EmpresaFormPage.jsx` (nuevos).
- `App.jsx`, `pages/LoginPage.jsx`, `pages/EmpleadoDetallePage.jsx`, `pages/CulturePage.jsx`, `api/culturas.js`, `components/GeneradorContratoModal.jsx` e `index.html` (modificados).

**Raíz:** `docker-compose.yml`, `deploy.sh`, `.gitignore`.

---

### Task 1: Fork, marca de backend/infra y arnés de pruebas

**Files:**
- Create: `~/diandra/backend/src/app.js`, `~/diandra/backend/tests/setupEnv.js`, `~/diandra/backend/tests/helpers.js`, `~/diandra/backend/tests/integration/health.test.js`
- Modify: `backend/src/index.js`, `backend/src/middleware/errorHandler.js`, `backend/package.json`, `backend/.env.example`, `backend/scripts/create-admin.js`, `docker-compose.yml`, `frontend/vite.config.js`, `agente-checador/index.js`, `agente-checador/package.json`, `agente-checador/servicio.js`
- Delete: `backend/tests/models/`, `backend/tests/controllers/`, `backend/tests/routes/`

**Interfaces:**
- Produces: `require('src/app')` → app de Express sin listen. `tests/helpers.js` exporta `{ pool, app, resetDb, api, crearEmpresa, crearEmpleado }` (las firmas están abajo; `crearEmpresa` funciona hasta Task 2).

- [ ] **Step 1: Copiar RHATA sin artefactos**

```bash
cd ~ && rsync -a --exclude='.git' --exclude='node_modules' --exclude='uploads' --exclude='dist' \
  --exclude='.env' --exclude='docs' --exclude='.superpowers' rhata/ diandra/
cd ~/diandra && ls
```
Expected: `agente-checador backend deploy.sh docker-compose.yml docs frontend` (`docs` es el del spec, que ya existía).

- [ ] **Step 2: Borrar las pruebas mockeadas de una sola empresa**

```bash
cd ~/diandra/backend && rm -rf tests/models tests/controllers tests/routes
```

- [ ] **Step 3: docker-compose con variable para la contraseña**

`~/diandra/docker-compose.yml`:
```yaml
services:
  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_DB: diandra
      POSTGRES_USER: diandra_user
      # ponytail: en servidor viene de /home/apps/diandra/.env; el default solo sirve en local.
      POSTGRES_PASSWORD: ${DIANDRA_DB_PASSWORD:-diandra_local}
    ports:
      - "127.0.0.1:5445:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

volumes:
  pgdata:
```

- [ ] **Step 4: `.env.example` y `.env` local**

`~/diandra/backend/.env.example`:
```
PORT=3015
DB_HOST=localhost
DB_PORT=5445
DB_NAME=diandra
DB_USER=diandra_user
DB_PASSWORD=diandra_local
UPLOADS_DIR=./uploads
JWT_SECRET=cambia_este_secreto
CORS_ORIGIN=http://localhost:5173
```
```bash
cd ~/diandra/backend && [ -f .env ] || cp .env.example .env
```

- [ ] **Step 5: Separar `app.js` de `index.js`**

`~/diandra/backend/src/app.js`:
```js
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const errorHandler = require('./middleware/errorHandler');
const authMiddleware = require('./middleware/auth');
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

app.use('/api/empleados', authMiddleware, require('./routes/empleados'));
app.use('/api/documentos', authMiddleware, require('./routes/documentos'));
app.use('/api/contratos', authMiddleware, require('./routes/contratos'));
app.use('/api/pagos',     authMiddleware, require('./routes/pagos'));
app.use('/api/formatos',  authMiddleware, require('./routes/formatos'));
app.use('/api/checadas', require('./routes/checadas'));
app.use('/api/salidas', authMiddleware, require('./routes/salidas'));
app.use('/api/documentosSalida', authMiddleware, require('./routes/documentosSalida'));
app.use('/api/culturas', authMiddleware, require('./routes/culturas'));

app.use(errorHandler);

module.exports = app;
```

`app.js` necesita `src/lib/archivos.js`, que formalmente es de Task 3. Créalo ahora con este contenido; Task 3 le agrega las pruebas y lo usa:

`~/diandra/backend/src/lib/archivos.js`:
```js
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
```

`~/diandra/backend/src/index.js` (reemplazar completo):
```js
const app = require('./app');
const runMigrations = require('./db/migrate');

const PORT = process.env.PORT || 3015;

runMigrations()
  .then(() => {
    app.listen(PORT, () => console.log(`Backend DIANDRA corriendo en puerto ${PORT}`));
  })
  .catch(err => {
    console.error('Error en migraciones:', err);
    process.exit(1);
  });
```

- [ ] **Step 6: errorHandler con códigos de pg**

`~/diandra/backend/src/middleware/errorHandler.js` (reemplazar completo):
```js
// Errores de Postgres que son culpa de la petición, no del servidor.
const PG_ERRORES = {
  '22P02': [400, 'Parámetro inválido'],   // texto donde va un entero
  '23505': [409, 'Ya existe un registro con esos datos'],
  '23503': [400, 'Referencia inválida'],
};

function errorHandler(err, req, res, next) {
  const pg = PG_ERRORES[err.code];
  const status = pg ? pg[0] : (err.status || 500);
  if (status >= 500) console.error(err.stack);
  // No filtrar detalle interno en 500; los errores de negocio traen status<500 + mensaje seguro.
  const message = pg ? pg[1] : status >= 500 ? 'Error interno del servidor' : (err.message || 'Error');
  res.status(status).json({ error: message });
}

module.exports = errorHandler;
```

- [ ] **Step 7: Configuración de jest y arnés**

En `~/diandra/backend/package.json`, cambiar `"name": "backend"` por `"name": "diandra-backend"`, cambiar el script `"test": "jest"` por `"test": "jest --runInBand"` y agregar al final del objeto raíz:
```json
  "jest": {
    "testEnvironment": "node",
    "setupFiles": ["<rootDir>/tests/setupEnv.js"]
  }
```

`~/diandra/backend/tests/setupEnv.js`:
```js
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.DB_HOST = process.env.DB_HOST || 'localhost';
process.env.DB_PORT = process.env.DB_PORT || '5445';
process.env.DB_NAME = 'diandra_test';
process.env.DB_USER = process.env.DB_USER || 'diandra_user';
process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'diandra_local';
process.env.JWT_SECRET = 'test-secret';
process.env.UPLOADS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'diandra-uploads-'));
```
`dotenv` no pisa variables ya definidas, así que estos valores ganan sobre `backend/.env`.

`~/diandra/backend/tests/helpers.js`:
```js
const request = require('supertest');
const jwt = require('jsonwebtoken');
const pool = require('../src/db/pool');
const runMigrations = require('../src/db/migrate');
const app = require('../src/app');

let rfcSeq = 0;

async function resetDb() {
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await runMigrations();
  // usuario id=1 para FKs created_by
  await pool.query("INSERT INTO usuarios (email, password, nombre) VALUES ('t@test.mx', 'x', 'Test')");
}

function api(empresaId, role = 'admin') {
  const token = jwt.sign({ id: 1, email: 't@test.mx', nombre: 'Test', role }, process.env.JWT_SECRET);
  const wrap = (metodo) => (url) => {
    const r = request(app)[metodo](url).set('Authorization', `Bearer ${token}`);
    return empresaId ? r.set('X-Empresa-Id', String(empresaId)) : r;
  };
  return { get: wrap('get'), post: wrap('post'), put: wrap('put'), patch: wrap('patch'), delete: wrap('delete') };
}

async function crearEmpresa(datos = {}) {
  rfcSeq += 1;
  const { rows } = await pool.query(
    `INSERT INTO empresas (razon_social, rfc, representante_legal, domicilio, colonia, cp, ciudad, giro, activo)
     VALUES ($1,$2,$3,'Calle 1','Centro','58000','Uruapan','Comercio',$4) RETURNING *`,
    [datos.razon_social || `Empresa ${rfcSeq}`, datos.rfc || `EMP${String(rfcSeq).padStart(6, '0')}AA${rfcSeq % 10}`,
     datos.representante_legal || 'Rep Legal', datos.activo ?? true]
  );
  return rows[0];
}

async function crearEmpleado(empresaId, extra = {}) {
  const n = Math.floor(Math.random() * 1e8);
  const { rows } = await pool.query(
    `INSERT INTO empleados (empresa_id, nombre, apellido_paterno, apellido_materno, curp, rfc, email, puesto)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'Auxiliar') RETURNING *`,
    [empresaId, extra.nombre || 'Juan', extra.apellido_paterno || 'Pérez', extra.apellido_materno || 'López',
     extra.curp || `CURP${String(n).padStart(14, '0')}`.slice(0, 18), extra.rfc || `RFC${String(n).padStart(10, '0')}`.slice(0, 13),
     `e${n}@test.mx`]
  );
  return rows[0];
}

module.exports = { pool, app, resetDb, api, crearEmpresa, crearEmpleado };
```

- [ ] **Step 8: Prueba de humo del arnés**

`~/diandra/backend/tests/integration/health.test.js`:
```js
const { pool, app, resetDb } = require('../helpers');
const request = require('supertest');

beforeAll(resetDb);
afterAll(() => pool.end());

test('GET /api/health responde ok', async () => {
  const res = await request(app).get('/api/health');
  expect(res.status).toBe(200);
  expect(res.body).toEqual({ ok: true });
});

test('id no numérico responde 400, no 500', async () => {
  const jwt = require('jsonwebtoken');
  const t = jwt.sign({ id: 1, role: 'admin' }, process.env.JWT_SECRET);
  const res = await request(app).get('/api/formatos/abc/descargar').set('Authorization', `Bearer ${t}`);
  expect(res.status).toBe(400);
});
```

- [ ] **Step 9: Levantar Postgres local, crear la DB de pruebas e instalar**

```bash
cd ~/diandra && docker compose up -d
until docker compose exec -T postgres pg_isready -U diandra_user; do sleep 1; done
docker compose exec -T postgres createdb -U diandra_user diandra_test
cd backend && npm install && cd ../frontend && npm install
```
Expected: `accepting connections` y npm sin errores.

- [ ] **Step 10: Correr la prueba de humo**

Run: `cd ~/diandra/backend && npx jest tests/integration/health.test.js`
Expected: PASS en 2 tests. (Con el errorHandler original de RHATA, el segundo test falla con `Expected: 400, Received: 500`. Ese es el comportamiento que corrige el Step 6.)

- [ ] **Step 11: Marca en backend, agente y vite**

```bash
cd ~/diandra
sed -i "s/admin@grupoata.com/admin@diandra.com/g" backend/scripts/create-admin.js
sed -i 's/Agente RH-ATA iniciado/Agente DIANDRA iniciado/' agente-checador/index.js
sed -i 's/Agente local ZKTeco K30 → RH ATA/Agente local ZKTeco K30 → DIANDRA/' agente-checador/package.json
sed -i "s/RH-ATA Checador/DIANDRA Checador/; s/Sincroniza asistencia del reloj ZKTeco con RH ATA/Sincroniza asistencia del reloj ZKTeco con DIANDRA/" agente-checador/servicio.js
sed -i "s#http://localhost:3001#http://localhost:3015#g" frontend/vite.config.js
grep -rn "ATA\|3001" backend/src backend/scripts agente-checador frontend/vite.config.js --include=*.js --include=*.json | grep -v node_modules
```
Expected: sin resultados de marca (aún quedan `logo-ata` en el frontend; los quita Task 11).

`create-admin.js` todavía crea `Admin123!` fijo. Cámbialo para que genere la contraseña. Reemplazar `~/diandra/backend/scripts/create-admin.js` completo:
```js
require('dotenv').config();
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const pool = require('../src/db/pool');

async function main() {
  const password = process.argv[2] || crypto.randomBytes(12).toString('base64url');
  const hash = await bcrypt.hash(password, 10);
  const { rowCount } = await pool.query(
    "INSERT INTO usuarios (email, password, nombre, role) VALUES ($1, $2, $3, 'admin') ON CONFLICT (email) DO NOTHING",
    ['admin@diandra.com', hash, 'Administrador']
  );
  console.log(rowCount ? `Admin creado: admin@diandra.com / ${password}` : 'admin@diandra.com ya existía, no se cambió');
  process.exit(0);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
```

- [ ] **Step 12: Revisar secretos y commitear**

```bash
cd ~/diandra && grep -rnE "rhata_pass|0e57100|JWT_SECRET=.{20,}|password.*=.*['\"][^'\"]{8,}" --exclude-dir=node_modules --exclude-dir=docs . || echo "sin secretos"
cat >> .gitignore <<'EOF'
.env
EOF
git add -A && git status --short | head -30
git commit -m "chore: fork de RHATA como DIANDRA con arnés de pruebas de integración

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
Expected: `sin secretos`. `git status` no lista `.env`, `node_modules` ni `uploads`.

---

### Task 2: Empresas — migración, modelo, rutas y middleware de empresa activa

**Files:**
- Create: `backend/src/db/migrations/013_multiempresa.sql`, `backend/src/models/empresa.js`, `backend/src/routes/empresas.js`, `backend/src/middleware/empresa.js`, `backend/tests/integration/empresas.test.js`
- Modify: `backend/src/app.js`

**Interfaces:**
- Consumes: `tests/helpers.js` (Task 1).
- Produces:
  - `EmpresaModel.findAll() → Empresa[]` (incluye `empleados_activos`), `findById(id) → Empresa|null`, `create(data) → Empresa`, `update(id, data) → Empresa|null`, `setActivo(id, bool) → Empresa|null`.
  - `normalizarRfc(rfc) → string|null` (null si no es válido).
  - Middleware `empresa` → `req.empresaId: number`. Responde 400 `{ code: 'EMPRESA_REQUERIDA' }` o 404 `{ code: 'EMPRESA_INVALIDA' }`.

- [ ] **Step 1: Escribir la prueba que falla**

`~/diandra/backend/tests/integration/empresas.test.js`:
```js
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
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd ~/diandra/backend && npx jest tests/integration/empresas.test.js`
Expected: FAIL. `crearEmpresa` truena con `relation "empresas" does not exist`.

- [ ] **Step 3: Migración**

`~/diandra/backend/src/db/migrations/013_multiempresa.sql`:
```sql
-- Multiempresa: las empresas cliente del despacho
CREATE TABLE IF NOT EXISTS empresas (
  id                  SERIAL PRIMARY KEY,
  razon_social        VARCHAR(200) NOT NULL,
  nombre_comercial    VARCHAR(200),
  rfc                 VARCHAR(13) NOT NULL UNIQUE,
  registro_patronal   VARCHAR(20),
  representante_legal VARCHAR(200),
  domicilio           VARCHAR(300),
  colonia             VARCHAR(150),
  cp                  VARCHAR(10),
  ciudad              VARCHAR(100),
  giro                VARCHAR(200),
  activo              BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tablas raíz: empresa_id obligatorio. DIANDRA arranca con BD vacía, NOT NULL directo es seguro.
ALTER TABLE empleados ADD COLUMN empresa_id INTEGER NOT NULL REFERENCES empresas(id);
ALTER TABLE empleados DROP CONSTRAINT IF EXISTS empleados_curp_key;
ALTER TABLE empleados DROP CONSTRAINT IF EXISTS empleados_rfc_key;
ALTER TABLE empleados ADD CONSTRAINT empleados_empresa_curp_key UNIQUE (empresa_id, curp);
ALTER TABLE empleados ADD CONSTRAINT empleados_empresa_rfc_key UNIQUE (empresa_id, rfc);
CREATE INDEX idx_empleados_empresa_id ON empleados(empresa_id);

ALTER TABLE semanas_pago ADD COLUMN empresa_id INTEGER NOT NULL REFERENCES empresas(id);
ALTER TABLE semanas_pago DROP CONSTRAINT IF EXISTS semanas_pago_semana_anio_key;
ALTER TABLE semanas_pago ADD CONSTRAINT semanas_pago_empresa_semana_anio_key UNIQUE (empresa_id, semana, anio);
CREATE INDEX idx_semanas_pago_empresa_id ON semanas_pago(empresa_id);

ALTER TABLE checador_dispositivos ADD COLUMN empresa_id INTEGER NOT NULL REFERENCES empresas(id);
CREATE INDEX idx_checador_dispositivos_empresa_id ON checador_dispositivos(empresa_id);

ALTER TABLE salidas ALTER COLUMN empresa_id SET NOT NULL;
ALTER TABLE salidas ADD CONSTRAINT salidas_empresa_fk FOREIGN KEY (empresa_id) REFERENCES empresas(id);

ALTER TABLE cultura_empresa ADD CONSTRAINT cultura_empresa_empresa_fk FOREIGN KEY (empresa_id) REFERENCES empresas(id);
```

- [ ] **Step 4: Modelo**

`~/diandra/backend/src/models/empresa.js`:
```js
const pool = require('../db/pool');

const CAMPOS = ['razon_social', 'nombre_comercial', 'rfc', 'registro_patronal', 'representante_legal',
  'domicilio', 'colonia', 'cp', 'ciudad', 'giro'];

// Persona moral (3 letras) o física (4 letras) + fecha AAMMDD + homoclave de 3.
const RFC_RE = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/;

function normalizarRfc(rfc) {
  const v = String(rfc || '').trim().toUpperCase();
  return RFC_RE.test(v) ? v : null;
}

const SELECT = `
  SELECT e.*, (SELECT count(*)::int FROM empleados em WHERE em.empresa_id = e.id AND em.estado = 'activo') AS empleados_activos
  FROM empresas e`;

const EmpresaModel = {
  async findAll() {
    const { rows } = await pool.query(`${SELECT} ORDER BY e.activo DESC, e.razon_social`);
    return rows;
  },

  async findById(id) {
    const { rows } = await pool.query(`${SELECT} WHERE e.id = $1`, [id]);
    return rows[0] || null;
  },

  async create(data) {
    const values = CAMPOS.map(c => data[c] || null);
    const { rows } = await pool.query(
      `INSERT INTO empresas (${CAMPOS.join(', ')}) VALUES (${CAMPOS.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING *`,
      values
    );
    return rows[0];
  },

  async update(id, data) {
    const fields = CAMPOS.filter(c => c in data);
    if (!fields.length) return this.findById(id);
    const set = fields.map((f, i) => `${f} = $${i + 1}`).join(', ');
    const { rows } = await pool.query(
      `UPDATE empresas SET ${set} WHERE id = $${fields.length + 1} RETURNING *`,
      [...fields.map(f => data[f] || null), id]
    );
    return rows[0] || null;
  },

  async setActivo(id, activo) {
    const { rows } = await pool.query('UPDATE empresas SET activo = $1 WHERE id = $2 RETURNING *', [activo, id]);
    return rows[0] || null;
  },
};

module.exports = { EmpresaModel, normalizarRfc };
```

`estado` viene de la migración 010 (`activo`/`inactivo`), y es el campo que usa la UI de Activos/Inactivos.

- [ ] **Step 5: Rutas**

`~/diandra/backend/src/routes/empresas.js`:
```js
const router = require('express').Router();
const requireRole = require('../middleware/requireRole');
const { EmpresaModel, normalizarRfc } = require('../models/empresa');

function validar(body) {
  if (!String(body.razon_social || '').trim()) return 'La razón social es obligatoria';
  if (!normalizarRfc(body.rfc)) return 'RFC inválido (12 caracteres persona moral, 13 persona física)';
  return null;
}

router.get('/', async (req, res) => res.json(await EmpresaModel.findAll()));

router.get('/:id', async (req, res) => {
  const empresa = await EmpresaModel.findById(req.params.id);
  if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada' });
  res.json(empresa);
});

router.post('/', requireRole('admin', 'rh'), async (req, res) => {
  const error = validar(req.body);
  if (error) return res.status(400).json({ error });
  const empresa = await EmpresaModel.create({ ...req.body, rfc: normalizarRfc(req.body.rfc) });
  res.status(201).json(empresa);
});

router.put('/:id', requireRole('admin', 'rh'), async (req, res) => {
  const error = validar(req.body);
  if (error) return res.status(400).json({ error });
  const empresa = await EmpresaModel.update(req.params.id, { ...req.body, rfc: normalizarRfc(req.body.rfc) });
  if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada' });
  res.json(empresa);
});

router.patch('/:id/activo', requireRole('admin', 'rh'), async (req, res) => {
  if (typeof req.body.activo !== 'boolean') return res.status(400).json({ error: 'activo debe ser true o false' });
  const empresa = await EmpresaModel.setActivo(req.params.id, req.body.activo);
  if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada' });
  res.json(empresa);
});

module.exports = router;
```
Express 5 pasa al errorHandler los rechazos de handlers async, así que no hace falta `try/catch`.

- [ ] **Step 6: Middleware de empresa**

`~/diandra/backend/src/middleware/empresa.js`:
```js
const pool = require('../db/pool');

module.exports = async function empresaMiddleware(req, res, next) {
  const raw = req.get('X-Empresa-Id');
  if (!raw || !/^\d+$/.test(raw)) {
    return res.status(400).json({ error: 'Selecciona una empresa', code: 'EMPRESA_REQUERIDA' });
  }
  const { rows } = await pool.query('SELECT id FROM empresas WHERE id = $1 AND activo = true', [Number(raw)]);
  if (!rows.length) {
    return res.status(404).json({ error: 'Empresa no encontrada o inactiva', code: 'EMPRESA_INVALIDA' });
  }
  req.empresaId = rows[0].id;
  next();
};
```

- [ ] **Step 7: Montar en `app.js`**

En `~/diandra/backend/src/app.js`, agregar debajo de `const authMiddleware = ...`:
```js
const empresaMiddleware = require('./middleware/empresa');
```
Reemplazar el bloque de rutas protegidas (desde `app.use('/api/empleados'` hasta `app.use('/api/culturas'`) por:
```js
app.use('/api/empresas', authMiddleware, require('./routes/empresas'));
app.use('/api/empleados', authMiddleware, empresaMiddleware, require('./routes/empleados'));
app.use('/api/documentos', authMiddleware, require('./routes/documentos'));   // /tipos es compartido; el router aplica empresa al resto
app.use('/api/contratos', authMiddleware, empresaMiddleware, require('./routes/contratos'));
app.use('/api/pagos', authMiddleware, empresaMiddleware, require('./routes/pagos'));
app.use('/api/formatos', authMiddleware, require('./routes/formatos'));       // catálogo compartido del despacho
app.use('/api/checadas', require('./routes/checadas'));                       // agente por api_key; el panel aplica auth+empresa en el router
app.use('/api/salidas', authMiddleware, empresaMiddleware, require('./routes/salidas'));
app.use('/api/documentosSalida', authMiddleware, empresaMiddleware, require('./routes/documentosSalida'));
app.use('/api/culturas', authMiddleware, empresaMiddleware, require('./routes/culturas'));
```

- [ ] **Step 8: Correr las pruebas**

Run: `cd ~/diandra/backend && npx jest tests/integration/empresas.test.js`
Expected: PASS en 11 tests.

- [ ] **Step 9: Commit**

```bash
cd ~/diandra && git add -A backend && git commit -m "feat: empresas cliente y middleware de empresa activa

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Rutas de archivo relativas a UPLOADS_DIR

**Files:**
- Create: `backend/tests/integration/archivos.test.js`
- Modify: `backend/src/middleware/upload.js` (`src/lib/archivos.js` ya existe desde Task 1)

**Interfaces:**
- Produces: `const { UPLOADS_DIR, relativa, absoluta } = require('../lib/archivos')`.
  - `relativa('/abs/uploads/x.pdf') → 'x.pdf'`.
  - `absoluta('x.pdf') → '/abs/uploads/x.pdf'`; lanza `{status: 400}` si la ruta sale de `UPLOADS_DIR`.

- [ ] **Step 1: Prueba que falla**

`~/diandra/backend/tests/integration/archivos.test.js`:
```js
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
```

- [ ] **Step 2: Correr y ver que falla**

Run: `cd ~/diandra/backend && npx jest tests/integration/archivos.test.js`
Expected: FAIL en "multer guarda dentro de UPLOADS_DIR", porque `upload.js` aún usa `__dirname/../../uploads`.

- [ ] **Step 3: `upload.js` usa UPLOADS_DIR**

En `~/diandra/backend/src/middleware/upload.js`, agregar debajo de `const fs = require('fs');`:
```js
const { UPLOADS_DIR } = require('../lib/archivos');
```
Reemplazar las líneas
```js
    const dir = path.join(__dirname, '..', '..', 'uploads');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
```
por
```js
    if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    cb(null, UPLOADS_DIR);
```

- [ ] **Step 4: Correr las pruebas**

Run: `npx jest tests/integration/archivos.test.js`
Expected: PASS en 4 tests.

- [ ] **Step 5: Commit**

```bash
cd ~/diandra && git add -A backend && git commit -m "feat: rutas de archivo relativas a UPLOADS_DIR

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Empleados por empresa

**Files:**
- Modify: `backend/src/models/empleado.js` (reemplazar), `backend/src/controllers/empleadosController.js` (reemplazar)
- Create: `backend/tests/integration/empleados.test.js`

**Interfaces:**
- Consumes: `req.empresaId` (Task 2), `relativa/absoluta` (Task 3), helpers.
- Produces: `EmpleadoModel.findAll(empresaId, {estado})`, `findById(empresaId, id)`, `create(empresaId, data)`, `update(empresaId, id, data)`, `delete(empresaId, id) → boolean`. Las usan Tasks 5 a 9.

- [ ] **Step 1: Prueba que falla**

`~/diandra/backend/tests/integration/empleados.test.js`:
```js
const fs = require('fs');
const path = require('path');
const { pool, resetDb, api, crearEmpresa, crearEmpleado } = require('../helpers');
const { UPLOADS_DIR } = require('../../src/lib/archivos');

let A, B, empA, empB;
beforeEach(async () => {
  await resetDb();
  A = await crearEmpresa(); B = await crearEmpresa();
  empA = await crearEmpleado(A.id, { nombre: 'Ana' });
  empB = await crearEmpleado(B.id, { nombre: 'Beto' });
});
afterAll(() => pool.end());

const nuevo = { nombre: 'Carla', apellido_paterno: 'Ruiz', curp: 'RUCC900101MMNZRR01', rfc: 'RUCC900101AB1',
  fecha_ingreso: '2026-01-15', email: 'carla@test.mx' };

test('lista solo empleados de la empresa activa', async () => {
  const res = await api(A.id).get('/api/empleados');
  expect(res.status).toBe(200);
  expect(res.body.map(e => e.id)).toEqual([empA.id]);
});

test('GET/PUT/DELETE de empleado de otra empresa → 404', async () => {
  expect((await api(A.id).get(`/api/empleados/${empB.id}`)).status).toBe(404);
  expect((await api(A.id).put(`/api/empleados/${empB.id}`).send({ puesto: 'X' })).status).toBe(404);
  expect((await api(A.id).delete(`/api/empleados/${empB.id}`)).status).toBe(404);
  const { rows } = await pool.query('SELECT puesto FROM empleados WHERE id = $1', [empB.id]);
  expect(rows[0].puesto).toBe('Auxiliar');
});

test('create ignora empresa_id del body', async () => {
  const res = await api(A.id).post('/api/empleados').send({ ...nuevo, empresa_id: B.id });
  expect(res.status).toBe(201);
  expect(res.body.empresa_id).toBe(A.id);
});

test('mismo CURP en otra empresa se permite; en la misma → 409', async () => {
  expect((await api(A.id).post('/api/empleados').send(nuevo)).status).toBe(201);
  expect((await api(B.id).post('/api/empleados').send(nuevo)).status).toBe(201);
  expect((await api(A.id).post('/api/empleados').send({ ...nuevo, email: 'otra@test.mx' })).status).toBe(409);
});

test('foto se guarda con ruta relativa y foto de otra empresa → 404', async () => {
  const png = Buffer.from('89504e470d0a1a0a', 'hex');
  const res = await api(A.id).post(`/api/empleados/${empA.id}/foto`).attach('foto', png, { filename: 'f.png', contentType: 'image/png' });
  expect(res.status).toBe(200);
  expect(path.isAbsolute(res.body.foto)).toBe(false);
  expect(fs.existsSync(path.join(UPLOADS_DIR, res.body.foto))).toBe(true);
  const otra = await api(A.id).post(`/api/empleados/${empB.id}/foto`).attach('foto', png, { filename: 'f.png', contentType: 'image/png' });
  expect(otra.status).toBe(404);
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `cd ~/diandra/backend && npx jest tests/integration/empleados.test.js`
Expected: FAIL. La lista trae empleados de las dos empresas y el create truena con `null value in column "empresa_id"`, que llega como 500.

- [ ] **Step 3: Modelo**

`~/diandra/backend/src/models/empleado.js` (reemplazar completo):
```js
const pool = require('../db/pool');

// Lista explícita de campos editables — evita inyectar empresa_id, updated_at, id, created_at, etc.
const EDITABLES = [
  'nombre', 'apellido_paterno', 'apellido_materno', 'curp', 'rfc',
  'fecha_nacimiento', 'fecha_ingreso', 'puesto', 'departamento',
  'telefono', 'email', 'direccion', 'nombre_beneficiario', 'observaciones',
  'estatus', 'estado', 'foto',
  'contacto_emergencia_nombre', 'contacto_emergencia_telefono',
];

const EmpleadoModel = {
  async findAll(empresaId, { estado } = {}) {
    const params = [empresaId];
    let query = 'SELECT * FROM empleados WHERE empresa_id = $1';
    if (estado) {
      params.push(estado);
      query += ` AND estado = $${params.length}`;
    }
    query += ' ORDER BY apellido_paterno, nombre';
    const { rows } = await pool.query(query, params);
    return rows;
  },

  async findById(empresaId, id) {
    const { rows } = await pool.query('SELECT * FROM empleados WHERE empresa_id = $1 AND id = $2', [empresaId, id]);
    return rows[0] || null;
  },

  async create(empresaId, data) {
    const {
      nombre, apellido_paterno, apellido_materno, curp, rfc,
      fecha_nacimiento, fecha_ingreso, puesto, departamento,
      telefono, email, direccion, nombre_beneficiario, observaciones, estatus, estado,
    } = data;
    const { rows } = await pool.query(
      `INSERT INTO empleados
        (empresa_id, nombre, apellido_paterno, apellido_materno, curp, rfc,
         fecha_nacimiento, fecha_ingreso, puesto, departamento,
         telefono, email, direccion, nombre_beneficiario, observaciones, estatus, estado)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       RETURNING *`,
      [empresaId, nombre, apellido_paterno, apellido_materno, curp || null, rfc || null,
       fecha_nacimiento || null, fecha_ingreso, puesto || null, departamento || null,
       telefono || null, email, direccion || null,
       nombre_beneficiario || null, observaciones || null, estatus || 'activo', estado || 'activo']
    );
    return rows[0];
  },

  async update(empresaId, id, data) {
    const fields = Object.keys(data).filter(k => EDITABLES.includes(k));
    if (!fields.length) return this.findById(empresaId, id);
    const values = fields.map(f => data[f] || null);
    const set = fields.map((f, i) => `${f} = $${i + 1}`).join(', ');
    const { rows } = await pool.query(
      `UPDATE empleados SET ${set}, updated_at = NOW()
       WHERE empresa_id = $${fields.length + 1} AND id = $${fields.length + 2} RETURNING *`,
      [...values, empresaId, id]
    );
    return rows[0] || null;
  },

  async delete(empresaId, id) {
    const { rowCount } = await pool.query('DELETE FROM empleados WHERE empresa_id = $1 AND id = $2', [empresaId, id]);
    return rowCount > 0;
  },
};

module.exports = EmpleadoModel;
```

- [ ] **Step 4: Controlador**

`~/diandra/backend/src/controllers/empleadosController.js` (reemplazar completo):
```js
const fs = require('fs');
const EmpleadoModel = require('../models/empleado');
const { relativa, absoluta } = require('../lib/archivos');

exports.getAll = async (req, res) => {
  const { estado } = req.query;
  if (estado && !['activo', 'inactivo'].includes(estado)) {
    return res.status(400).json({ error: "estado debe ser 'activo' o 'inactivo'" });
  }
  res.json(await EmpleadoModel.findAll(req.empresaId, { estado }));
};

exports.getOne = async (req, res) => {
  const empleado = await EmpleadoModel.findById(req.empresaId, req.params.id);
  if (!empleado) return res.status(404).json({ error: 'Empleado no encontrado' });
  res.json(empleado);
};

exports.create = async (req, res) => {
  const { curp, rfc, fecha_ingreso, email } = req.body;
  if (!curp || !rfc || !fecha_ingreso || !email)
    return res.status(400).json({ error: 'CURP, RFC, Fecha de ingreso y Email son obligatorios' });
  res.status(201).json(await EmpleadoModel.create(req.empresaId, req.body));
};

exports.update = async (req, res) => {
  const empleado = await EmpleadoModel.update(req.empresaId, req.params.id, req.body);
  if (!empleado) return res.status(404).json({ error: 'Empleado no encontrado' });
  res.json(empleado);
};

exports.remove = async (req, res) => {
  const borrado = await EmpleadoModel.delete(req.empresaId, req.params.id);
  if (!borrado) return res.status(404).json({ error: 'Empleado no encontrado' });
  res.status(204).end();
};

exports.uploadFoto = async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No se recibió imagen' });
  const empleado = await EmpleadoModel.findById(req.empresaId, req.params.id);
  if (!empleado) {
    fs.unlinkSync(req.file.path);
    return res.status(404).json({ error: 'Empleado no encontrado' });
  }
  if (empleado.foto && fs.existsSync(absoluta(empleado.foto))) fs.unlinkSync(absoluta(empleado.foto));
  res.json(await EmpleadoModel.update(req.empresaId, req.params.id, { foto: relativa(req.file.path) }));
};
```

- [ ] **Step 5: Correr las pruebas**

Run: `npx jest tests/integration/empleados.test.js`
Expected: PASS en 5 tests.

- [ ] **Step 6: Commit**

```bash
cd ~/diandra && git add -A backend && git commit -m "feat: empleados aislados por empresa

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Documentos, formatos y contratos

**Files:**
- Modify: `backend/src/models/documento.js` (reemplazar), `backend/src/controllers/documentosController.js` (reemplazar), `backend/src/routes/documentos.js`, `backend/src/routes/formatos.js`, `backend/src/routes/contratos.js` (reemplazar)
- Create: `backend/tests/integration/documentos.test.js`

**Interfaces:**
- Consumes: `EmpleadoModel.findById(empresaId, id)` (Task 4), `EmpresaModel.findById(id)` (Task 2), `relativa/absoluta` (Task 3).
- Produces:
  - `DocumentoModel.findByEmpleado(empresaId, empleadoId)`, `findById(empresaId, id)`, `upsert({empleado_id, tipo_documento_id, filename, ruta, estatus})` (sin empresa: el caller ya validó al empleado), `delete(empresaId, id) → {ruta}|null`, `findTipos()`.
  - `POST /api/contratos/generar/:empleadoId` → 201 con el documento. Los datos del patrón vacíos se llenan con los de la empresa.

- [ ] **Step 1: Prueba que falla**

`~/diandra/backend/tests/integration/documentos.test.js`:
```js
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
```

- [ ] **Step 2: Correr y ver que falla**

Run: `cd ~/diandra/backend && npx jest tests/integration/documentos.test.js`
Expected: FAIL. Se descarga el documento de B con el header de A (200) y la ruta es absoluta.

- [ ] **Step 3: Modelo**

`~/diandra/backend/src/models/documento.js` (reemplazar completo):
```js
const pool = require('../db/pool');

// documentos hereda la empresa del empleado.
const DocumentoModel = {
  async findByEmpleado(empresaId, empleadoId) {
    const { rows } = await pool.query(
      `SELECT d.*, td.nombre AS tipo_nombre
       FROM documentos d
       JOIN tipos_documento td ON td.id = d.tipo_documento_id
       JOIN empleados e ON e.id = d.empleado_id
       WHERE e.empresa_id = $1 AND d.empleado_id = $2
       ORDER BY td.nombre`,
      [empresaId, empleadoId]
    );
    return rows;
  },

  async findById(empresaId, id) {
    const { rows } = await pool.query(
      `SELECT d.*, td.nombre AS tipo_nombre
       FROM documentos d
       JOIN tipos_documento td ON td.id = d.tipo_documento_id
       JOIN empleados e ON e.id = d.empleado_id
       WHERE e.empresa_id = $1 AND d.id = $2`,
      [empresaId, id]
    );
    return rows[0] || null;
  },

  // El caller debe haber validado que empleado_id es de la empresa activa.
  async upsert({ empleado_id, tipo_documento_id, filename, ruta, estatus }) {
    const { rows } = await pool.query(
      `INSERT INTO documentos (empleado_id, tipo_documento_id, filename, ruta, estatus)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (empleado_id, tipo_documento_id)
       DO UPDATE SET filename = EXCLUDED.filename, ruta = EXCLUDED.ruta,
                     estatus = EXCLUDED.estatus, updated_at = NOW()
       RETURNING *`,
      [empleado_id, tipo_documento_id, filename, ruta, estatus || 'completo']
    );
    return rows[0];
  },

  async delete(empresaId, id) {
    const { rows } = await pool.query(
      `DELETE FROM documentos d USING empleados e
       WHERE e.id = d.empleado_id AND e.empresa_id = $1 AND d.id = $2
       RETURNING d.ruta`,
      [empresaId, id]
    );
    return rows[0] || null;
  },

  async findTipos() {
    const { rows } = await pool.query('SELECT * FROM tipos_documento ORDER BY nombre');
    return rows;
  },
};

module.exports = DocumentoModel;
```

- [ ] **Step 4: Controlador**

`~/diandra/backend/src/controllers/documentosController.js` (reemplazar completo):
```js
const fs = require('fs');
const DocumentoModel = require('../models/documento');
const EmpleadoModel = require('../models/empleado');
const { relativa, absoluta } = require('../lib/archivos');

exports.getTipos = async (req, res) => res.json(await DocumentoModel.findTipos());

exports.getByEmpleado = async (req, res) => {
  const empleado = await EmpleadoModel.findById(req.empresaId, req.params.empleadoId);
  if (!empleado) return res.status(404).json({ error: 'Empleado no encontrado' });
  res.json(await DocumentoModel.findByEmpleado(req.empresaId, empleado.id));
};

exports.upload = async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No se recibió archivo' });
  const { empleado_id, tipo_documento_id, estatus } = req.body;
  const empleado = await EmpleadoModel.findById(req.empresaId, empleado_id);
  if (!empleado) {
    fs.unlinkSync(req.file.path);
    return res.status(404).json({ error: 'Empleado no encontrado' });
  }
  const doc = await DocumentoModel.upsert({
    empleado_id: empleado.id,
    tipo_documento_id,
    filename: req.file.originalname,
    ruta: relativa(req.file.path),
    estatus,
  });
  res.status(201).json(doc);
};

exports.remove = async (req, res) => {
  const doc = await DocumentoModel.delete(req.empresaId, req.params.id);
  if (!doc) return res.status(404).json({ error: 'Documento no encontrado' });
  if (fs.existsSync(absoluta(doc.ruta))) fs.unlinkSync(absoluta(doc.ruta));
  res.status(204).end();
};

exports.download = async (req, res) => {
  const doc = await DocumentoModel.findById(req.empresaId, req.params.id);
  if (!doc) return res.status(404).json({ error: 'Documento no encontrado' });
  const ruta = absoluta(doc.ruta);
  if (!fs.existsSync(ruta)) return res.status(404).json({ error: 'El archivo ya no existe en el servidor. Por favor vuelve a subirlo.' });
  res.download(ruta, doc.filename);
};
```

- [ ] **Step 5: Router de documentos (tipos compartido, resto con empresa)**

`~/diandra/backend/src/routes/documentos.js` (reemplazar completo):
```js
const router = require('express').Router();
const ctrl = require('../controllers/documentosController');
const upload = require('../middleware/upload');
const empresa = require('../middleware/empresa');

router.get('/tipos', ctrl.getTipos);   // catálogo compartido del despacho
router.use(empresa);                    // todo lo de abajo es por empresa
router.get('/empleado/:empleadoId', ctrl.getByEmpleado);
router.post('/upload', upload.single('archivo'), ctrl.upload);
router.get('/:id/download', ctrl.download);
router.delete('/:id', ctrl.remove);

module.exports = router;
```

El middleware de empresa corre antes que multer en `/upload`. Si la empresa no es válida, el archivo ni siquiera se escribe.

- [ ] **Step 6: Formatos con rutas relativas**

En `~/diandra/backend/src/routes/formatos.js`:
- Agregar debajo de `const pool = require('../db/pool');`:
```js
const { UPLOADS_DIR, relativa, absoluta } = require('../lib/archivos');
```
- Reemplazar `const DIR_FORMATOS = path.join(__dirname, '..', '..', 'uploads', 'formatos');` por:
```js
const DIR_FORMATOS = path.join(UPLOADS_DIR, 'formatos');
```
- En `POST /:tipoId`, reemplazar `const ruta = req.file.path;` por:
```js
    const ruta = relativa(req.file.path);
```
- En `GET /:tipoId/descargar`, reemplazar `const ruta = path.resolve(rows[0].formato_ruta);` por:
```js
    const ruta = absoluta(rows[0].formato_ruta);
```
- En `DELETE /:tipoId`, reemplazar
```js
    if (rows[0]?.formato_ruta && fs.existsSync(rows[0].formato_ruta))
      fs.unlinkSync(rows[0].formato_ruta);
```
por
```js
    if (rows[0]?.formato_ruta && fs.existsSync(absoluta(rows[0].formato_ruta)))
      fs.unlinkSync(absoluta(rows[0].formato_ruta));
```
(El `UPDATE ... RETURNING formato_ruta` regresa el valor nuevo, NULL. Es un bug que ya trae RHATA: el archivo nunca se borra. Para arreglarlo, lee la ruta antes del UPDATE. Reemplaza el cuerpo del `try` de `DELETE /:tipoId` por:)
```js
    const { rows: prev } = await pool.query('SELECT formato_ruta FROM tipos_documento WHERE id=$1', [req.params.tipoId]);
    await pool.query('UPDATE tipos_documento SET formato_ruta=NULL WHERE id=$1', [req.params.tipoId]);
    if (prev[0]?.formato_ruta && fs.existsSync(absoluta(prev[0].formato_ruta)))
      fs.unlinkSync(absoluta(prev[0].formato_ruta));
    res.status(204).end();
```

- [ ] **Step 7: Contratos con datos de la empresa**

`~/diandra/backend/src/routes/contratos.js` (reemplazar completo):
```js
const router = require('express').Router();
const path = require('path');
const fs = require('fs');
const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');
const pool = require('../db/pool');
const DocumentoModel = require('../models/documento');
const EmpleadoModel = require('../models/empleado');
const { EmpresaModel } = require('../models/empresa');
const { UPLOADS_DIR, relativa } = require('../lib/archivos');

const CAMPOS = [
  'nombre_trabajador', 'estado_civil', 'sabe_leer_escribir', 'edad', 'lugar_origen', 'curp', 'profesion',
  'domicilio_trabajador', 'colonia', 'codigo_postal', 'telefono', 'email', 'nss',
  'nombre_patron', 'razon_social', 'direccion_empresa', 'colonia_empresa', 'cp_empresa', 'ciudad', 'giro_empresa',
  'puesto', 'dir_trabajo', 'colonia_trabajo', 'cp_trabajo', 'hora_entrada', 'hora_salida',
  'descanso_inicio', 'descanso_fin', 'salario_diario', 'lugar_pago', 'nombre_capacitador',
  'descripcion_obra', 'habilidades_desarrollar', 'metodo_evaluacion', 'duracion_prueba',
  'nombre_beneficiario', 'fecha_inicio_dia', 'fecha_inicio_mes', 'fecha_inicio_anio',
  'lugar_firma', 'fecha_firma_dia', 'fecha_firma_mes', 'fecha_firma_anio',
];

// Lo que el usuario no capture se toma de la empresa activa.
function defaultsDeEmpresa(empresa) {
  return {
    nombre_patron: empresa.representante_legal,
    razon_social: empresa.razon_social,
    direccion_empresa: empresa.domicilio,
    colonia_empresa: empresa.colonia,
    cp_empresa: empresa.cp,
    ciudad: empresa.ciudad,
    giro_empresa: empresa.giro,
  };
}

router.post('/generar/:empleadoId', async (req, res) => {
  const empleado = await EmpleadoModel.findById(req.empresaId, req.params.empleadoId);
  if (!empleado) return res.status(404).json({ error: 'Empleado no encontrado' });
  const empresa = await EmpresaModel.findById(req.empresaId);
  const defaults = defaultsDeEmpresa(empresa);
  const datos = req.body;

  const render = Object.fromEntries(CAMPOS.map(c => [c, datos[c] || defaults[c] || '']));
  render.obligaciones = (datos.obligaciones || []).map(o => ({ texto: o }));
  render.prohibiciones = (datos.prohibiciones || []).map(p => ({ texto: p }));

  const templatePath = path.join(__dirname, '..', 'templates', 'contrato_individual.docx');
  const doc = new Docxtemplater(new PizZip(fs.readFileSync(templatePath, 'binary')), { paragraphLoop: true, linebreaks: true });
  doc.render(render);
  const buf = doc.getZip().generate({ type: 'nodebuffer' });

  const dir = path.join(UPLOADS_DIR, 'contratos');
  fs.mkdirSync(dir, { recursive: true });
  // ponytail: id + timestamp — dos empresas con "Juan Pérez" no se pisan el archivo.
  const ruta = path.join(dir, `contrato_${empleado.id}_${Date.now()}.docx`);
  fs.writeFileSync(ruta, buf);

  const { rows: tipoRows } = await pool.query("SELECT id FROM tipos_documento WHERE nombre = 'Contrato de trabajo'");
  if (!tipoRows[0]) return res.status(500).json({ error: 'Tipo "Contrato de trabajo" no encontrado en la base de datos' });

  const nombre = (datos.nombre_trabajador || `${empleado.nombre} ${empleado.apellido_paterno}`).replace(/\s+/g, '_');
  const docRecord = await DocumentoModel.upsert({
    empleado_id: empleado.id,
    tipo_documento_id: tipoRows[0].id,
    filename: `contrato_${nombre}.docx`,
    ruta: relativa(ruta),
    estatus: 'completo',
  });
  res.status(201).json(docRecord);
});

module.exports = router;
```

- [ ] **Step 8: Correr las pruebas**

Run: `npx jest tests/integration/documentos.test.js`
Expected: PASS en 9 tests.

- [ ] **Step 9: Commit**

```bash
cd ~/diandra && git add -A backend && git commit -m "feat: documentos, formatos y contratos por empresa

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Pagos por empresa

**Files:**
- Modify: `backend/src/models/pago.js` (reemplazar), `backend/src/routes/pagos.js`
- Create: `backend/tests/integration/pagos.test.js`

**Interfaces:**
- Consumes: `EmpleadoModel.findById` (Task 4), `relativa/absoluta` (Task 3).
- Produces: `PagoModel.crearSemana(empresaId, {...})`, `findSemanas(empresaId)`, `findSemanaById(empresaId, id)`, `semanaExiste(empresaId, semana, anio)`, `insertarPagos(registros)`, `findByEmpleado(empresaId, empleadoId)`, `findBySemana(empresaId, semanaId)`, `deleteSemana(empresaId, id)`, `empleadosDeEmpresa(empresaId, ids) → Set<number>`.

- [ ] **Step 1: Prueba que falla**

`~/diandra/backend/tests/integration/pagos.test.js`:
```js
const path = require('path');
const { pool, resetDb, api, crearEmpresa, crearEmpleado } = require('../helpers');

const pdf = Buffer.from('%PDF-1.4\n%prueba\n');
let A, B, empA, empB;

beforeEach(async () => {
  await resetDb();
  A = await crearEmpresa(); B = await crearEmpresa();
  empA = await crearEmpleado(A.id); empB = await crearEmpleado(B.id);
});
afterAll(() => pool.end());

const importar = (empresaId, registros, semana = 16) => api(empresaId).post('/api/pagos/importar')
  .field('semana', String(semana)).field('anio', '2026').field('registros', JSON.stringify(registros))
  .attach('pdf', pdf, { filename: 'p.pdf', contentType: 'application/pdf' });

test('importa semana con ruta relativa y empresa activa', async () => {
  const res = await importar(A.id, [{ nombre_pdf: 'PEREZ JUAN', monto: 100, empleado_id: empA.id }]);
  expect(res.status).toBe(201);
  expect(res.body.empresa_id).toBe(A.id);
  expect(path.isAbsolute(res.body.ruta)).toBe(false);
});

test('misma semana en dos empresas se permite; repetida en la misma → 409', async () => {
  expect((await importar(A.id, [])).status).toBe(201);
  expect((await importar(B.id, [])).status).toBe(201);
  expect((await importar(A.id, [])).status).toBe(409);
});

test('empleado_id de otra empresa en el JSON se descarta', async () => {
  const sem = (await importar(A.id, [{ nombre_pdf: 'X', monto: 50, empleado_id: empB.id }])).body;
  const { rows } = await pool.query('SELECT empleado_id FROM pagos WHERE semana_pago_id = $1', [sem.id]);
  expect(rows[0].empleado_id).toBeNull();
});

test('semanas, detalle, descarga y borrado de otra empresa → 404 / no visibles', async () => {
  const semB = (await importar(B.id, [{ nombre_pdf: 'Y', monto: 10, empleado_id: empB.id }])).body;
  expect((await api(A.id).get('/api/pagos/semanas')).body).toEqual([]);
  expect((await api(A.id).get(`/api/pagos/semana/${semB.id}`)).status).toBe(404);
  expect((await api(A.id).get(`/api/pagos/semana/${semB.id}/descargar`)).status).toBe(404);
  expect((await api(A.id).delete(`/api/pagos/semana/${semB.id}`)).status).toBe(404);
  expect((await api(A.id).get(`/api/pagos/empleado/${empB.id}`)).status).toBe(404);
  expect((await api(B.id).get(`/api/pagos/semana/${semB.id}/descargar`)).status).toBe(200);
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `cd ~/diandra/backend && npx jest tests/integration/pagos.test.js`
Expected: FAIL. `null value in column "empresa_id" of relation "semanas_pago"` llega como 500.

- [ ] **Step 3: Modelo**

`~/diandra/backend/src/models/pago.js` (reemplazar completo):
```js
const pool = require('../db/pool');

// semanas_pago es tabla raíz; pagos hereda empresa por su semana.
const PagoModel = {
  async crearSemana(empresaId, { semana, anio, filename, ruta, total_registros }) {
    const { rows } = await pool.query(
      `INSERT INTO semanas_pago (empresa_id, semana, anio, filename, ruta, total_registros)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [empresaId, semana, anio, filename, ruta, total_registros]
    );
    return rows[0];
  },

  async findSemanas(empresaId) {
    const { rows } = await pool.query(
      'SELECT * FROM semanas_pago WHERE empresa_id = $1 ORDER BY anio DESC, semana DESC', [empresaId]);
    return rows;
  },

  async findSemanaById(empresaId, id) {
    const { rows } = await pool.query('SELECT * FROM semanas_pago WHERE empresa_id = $1 AND id = $2', [empresaId, id]);
    return rows[0] || null;
  },

  async semanaExiste(empresaId, semana, anio) {
    const { rows } = await pool.query(
      'SELECT id FROM semanas_pago WHERE empresa_id = $1 AND semana = $2 AND anio = $3', [empresaId, semana, anio]);
    return rows[0] || null;
  },

  // ids de empleados que sí son de la empresa — para descartar ids ajenos que mande el cliente.
  async empleadosDeEmpresa(empresaId, ids) {
    if (!ids.length) return new Set();
    const { rows } = await pool.query(
      'SELECT id FROM empleados WHERE empresa_id = $1 AND id = ANY($2::int[])', [empresaId, ids]);
    return new Set(rows.map(r => r.id));
  },

  // El caller garantiza semana_pago_id y empleado_id de la empresa activa.
  async insertarPagos(registros) {
    if (!registros.length) return [];
    const values = registros.map((r, i) => {
      const base = i * 6;
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6})`;
    }).join(', ');
    const params = registros.flatMap(r => [
      r.semana_pago_id, r.empleado_id || null, r.nombre_pdf, r.cuenta || null, r.monto || null, r.autorizado || null,
    ]);
    const { rows } = await pool.query(
      `INSERT INTO pagos (semana_pago_id, empleado_id, nombre_pdf, cuenta, monto, autorizado)
       VALUES ${values} RETURNING *`,
      params
    );
    return rows;
  },

  async findByEmpleado(empresaId, empleadoId) {
    const { rows } = await pool.query(
      `SELECT p.*, sp.semana, sp.anio, sp.filename AS pdf_filename
       FROM pagos p
       JOIN semanas_pago sp ON sp.id = p.semana_pago_id
       WHERE sp.empresa_id = $1 AND p.empleado_id = $2
       ORDER BY sp.anio DESC, sp.semana DESC`,
      [empresaId, empleadoId]
    );
    return rows;
  },

  async findBySemana(empresaId, semanaId) {
    const { rows } = await pool.query(
      `SELECT p.*, e.nombre, e.apellido_paterno, e.apellido_materno
       FROM pagos p
       JOIN semanas_pago sp ON sp.id = p.semana_pago_id
       LEFT JOIN empleados e ON e.id = p.empleado_id
       WHERE sp.empresa_id = $1 AND p.semana_pago_id = $2
       ORDER BY p.nombre_pdf`,
      [empresaId, semanaId]
    );
    return rows;
  },

  async deleteSemana(empresaId, id) {
    const { rows } = await pool.query(
      'DELETE FROM semanas_pago WHERE empresa_id = $1 AND id = $2 RETURNING *', [empresaId, id]);
    return rows[0] || null;
  },
};

module.exports = PagoModel;
```

- [ ] **Step 4: Rutas**

En `~/diandra/backend/src/routes/pagos.js`:

a) Reemplazar las importaciones y el `upload` (desde `const router` hasta `const upload = ...`) por:
```js
const router = require('express').Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const pool = require('../db/pool');
const PagoModel = require('../models/pago');
const EmpleadoModel = require('../models/empleado');
const { UPLOADS_DIR, relativa, absoluta } = require('../lib/archivos');

const PAGOS_DIR = path.join(UPLOADS_DIR, 'pagos');
const upload = multer({ dest: PAGOS_DIR });
```

b) Reemplazar la función `buscarEmpleados` por:
```js
async function buscarEmpleados(empresaId) {
  const { rows } = await pool.query(
    `SELECT id, nombre, apellido_paterno, apellido_materno FROM empleados
     WHERE empresa_id = $1 AND estatus = 'activo'`,
    [empresaId]
  );
  return rows.map(e => ({
    id: e.id,
    nombreNormalizado: normalizarNombre(`${e.apellido_paterno} ${e.apellido_materno || ''} ${e.nombre}`),
    display: `${e.apellido_paterno} ${e.apellido_materno || ''}, ${e.nombre}`.trim(),
  }));
}
```

c) En `POST /parsear`, reemplazar `const empleados = await buscarEmpleados();` por:
```js
    const empleados = await buscarEmpleados(req.empresaId);
```

d) Reemplazar todo el handler `POST /importar` por:
```js
router.post('/importar', upload.single('pdf'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No se recibió archivo PDF' });

    const { semana, anio, registros: registrosJson } = req.body;
    if (!semana || !anio) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'Semana y año son requeridos' });
    }

    if (await PagoModel.semanaExiste(req.empresaId, semana, anio)) {
      fs.unlinkSync(req.file.path);
      return res.status(409).json({ error: `La semana ${semana}/${anio} ya fue importada` });
    }

    const registros = JSON.parse(registrosJson || '[]');
    const validos = await PagoModel.empleadosDeEmpresa(
      req.empresaId, registros.map(r => Number(r.empleado_id)).filter(Number.isInteger));

    fs.mkdirSync(PAGOS_DIR, { recursive: true });
    const filename = `pagos_e${req.empresaId}_s${semana}_${anio}_${Date.now()}.pdf`;
    const ruta = path.join(PAGOS_DIR, filename);
    fs.renameSync(req.file.path, ruta);

    const semanaRecord = await PagoModel.crearSemana(req.empresaId, {
      semana: parseInt(semana),
      anio: parseInt(anio),
      filename,
      ruta: relativa(ruta),
      total_registros: registros.length,
    });

    await PagoModel.insertarPagos(registros.map(r => ({
      semana_pago_id: semanaRecord.id,
      empleado_id: validos.has(Number(r.empleado_id)) ? Number(r.empleado_id) : null,
      nombre_pdf: r.nombre_pdf,
      cuenta: r.cuenta || null,
      monto: r.monto || null,
      autorizado: r.autorizado || null,
    })));

    res.status(201).json(semanaRecord);
  } catch (err) {
    if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    next(err);
  }
});
```

e) Reemplazar los handlers desde `// GET /api/pagos/semanas` hasta antes de `module.exports` por:
```js
// GET /api/pagos/semanas
router.get('/semanas', async (req, res) => res.json(await PagoModel.findSemanas(req.empresaId)));

// GET /api/pagos/semana/:id
router.get('/semana/:id', async (req, res) => {
  const semana = await PagoModel.findSemanaById(req.empresaId, req.params.id);
  if (!semana) return res.status(404).json({ error: 'No encontrado' });
  res.json(await PagoModel.findBySemana(req.empresaId, semana.id));
});

// GET /api/pagos/semana/:id/descargar
router.get('/semana/:id/descargar', async (req, res) => {
  const semana = await PagoModel.findSemanaById(req.empresaId, req.params.id);
  if (!semana) return res.status(404).json({ error: 'No encontrado' });
  res.download(absoluta(semana.ruta), semana.filename);
});

// GET /api/pagos/empleado/:id
router.get('/empleado/:id', async (req, res) => {
  const empleado = await EmpleadoModel.findById(req.empresaId, req.params.id);
  if (!empleado) return res.status(404).json({ error: 'Empleado no encontrado' });
  res.json(await PagoModel.findByEmpleado(req.empresaId, empleado.id));
});

// DELETE /api/pagos/semana/:id
router.delete('/semana/:id', async (req, res) => {
  const semana = await PagoModel.deleteSemana(req.empresaId, req.params.id);
  if (!semana) return res.status(404).json({ error: 'No encontrado' });
  if (fs.existsSync(absoluta(semana.ruta))) fs.unlinkSync(absoluta(semana.ruta));
  res.status(204).end();
});
```

- [ ] **Step 5: Correr las pruebas**

Run: `npx jest tests/integration/pagos.test.js`
Expected: PASS en 4 tests.

- [ ] **Step 6: Commit**

```bash
cd ~/diandra && git add -A backend && git commit -m "feat: pagos semanales por empresa

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Checador por empresa

**Files:**
- Modify: `backend/src/models/checada.js` (reemplazar), `backend/src/controllers/checadasController.js` (reemplazar), `backend/src/routes/checadas.js` (reemplazar)
- Create: `backend/scripts/create-dispositivo.js`, `backend/tests/integration/checador.test.js`

**Interfaces:**
- Consumes: `EmpleadoModel.findById` (Task 4), middleware `empresa` (Task 2).
- Produces: `CheckadaModel.findByEmpleado(empresaId, empleadoId, {desde, hasta})`, `syncBatch(dispositivo, registros)` (recibe el objeto dispositivo con `empresa_id`), `getDispositivo(apiKey)`, `getDispositivoDeEmpresa(empresaId, id)`, `getMappings(dispositivo)`, `upsertMapping(dispositivoId, empleadoId, uid)`, `deleteMapping(empresaId, id) → boolean`, `getAllMappings(empresaId)`, `getAllDispositivos(empresaId)`, `crearDispositivo(empresaId, {nombre, ubicacion, ip}) → {…, api_key}`.

- [ ] **Step 1: Prueba que falla**

`~/diandra/backend/tests/integration/checador.test.js`:
```js
const request = require('supertest');
const { pool, app, resetDb, api, crearEmpresa, crearEmpleado } = require('../helpers');
const CheckadaModel = require('../../src/models/checada');

let A, B, empA, empB, relojA, relojB;
beforeEach(async () => {
  await resetDb();
  A = await crearEmpresa(); B = await crearEmpresa();
  empA = await crearEmpleado(A.id); empB = await crearEmpleado(B.id);
  relojA = await CheckadaModel.crearDispositivo(A.id, { nombre: 'Reloj A' });
  relojB = await CheckadaModel.crearDispositivo(B.id, { nombre: 'Reloj B' });
});
afterAll(() => pool.end());

test('dispositivos y mapeos solo de la empresa activa', async () => {
  await api(A.id).post('/api/checadas/mappings').send({ dispositivo_id: relojA.id, empleado_id: empA.id, uid_checador: 1 });
  await api(B.id).post('/api/checadas/mappings').send({ dispositivo_id: relojB.id, empleado_id: empB.id, uid_checador: 1 });
  expect((await api(A.id).get('/api/checadas/dispositivos')).body.map(d => d.id)).toEqual([relojA.id]);
  expect((await api(A.id).get('/api/checadas/mappings')).body.map(m => m.empleado_id)).toEqual([empA.id]);
});

test('no se mapea empleado de A a reloj de B ni viceversa', async () => {
  expect((await api(A.id).post('/api/checadas/mappings').send({ dispositivo_id: relojB.id, empleado_id: empA.id, uid_checador: 5 })).status).toBe(404);
  expect((await api(A.id).post('/api/checadas/mappings').send({ dispositivo_id: relojA.id, empleado_id: empB.id, uid_checador: 5 })).status).toBe(404);
});

test('borrar mapeo de otra empresa → 404', async () => {
  const m = (await api(B.id).post('/api/checadas/mappings').send({ dispositivo_id: relojB.id, empleado_id: empB.id, uid_checador: 2 })).body;
  expect((await api(A.id).delete(`/api/checadas/mappings/${m.id}`)).status).toBe(404);
});

test('agente sincroniza solo empleados de la empresa del reloj', async () => {
  // mapeo cruzado insertado a mano (simula dato corrupto): el sync no debe registrarlo
  await pool.query('INSERT INTO checador_empleados (dispositivo_id, empleado_id, uid_checador) VALUES ($1,$2,9)', [relojA.id, empB.id]);
  await pool.query('INSERT INTO checador_empleados (dispositivo_id, empleado_id, uid_checador) VALUES ($1,$2,1)', [relojA.id, empA.id]);
  const res = await request(app).post('/api/checadas/sync').set('x-api-key', relojA.api_key).send({ registros: [
    { uid_checador: 1, timestamp: '2026-10-13T08:00:00Z', tipo: 'entrada' },
    { uid_checador: 9, timestamp: '2026-10-13T08:01:00Z', tipo: 'entrada' },
  ] });
  expect(res.body.insertadas).toBe(1);
  const mapeos = await request(app).get('/api/checadas/mappings/agente').set('x-api-key', relojA.api_key);
  expect(mapeos.body.map(m => m.id)).toEqual([empA.id]);
});

test('checadas de empleado de otra empresa → 404', async () => {
  expect((await api(A.id).get(`/api/checadas/empleado/${empB.id}`)).status).toBe(404);
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `cd ~/diandra/backend && npx jest tests/integration/checador.test.js`
Expected: FAIL con `CheckadaModel.crearDispositivo is not a function`.

- [ ] **Step 3: Modelo**

`~/diandra/backend/src/models/checada.js` (reemplazar completo):
```js
const crypto = require('crypto');
const pool = require('../db/pool');

// checador_dispositivos es raíz; mapeos y checadas heredan por empleado/dispositivo.
const CheckadaModel = {
  async findByEmpleado(empresaId, empleadoId, { desde, hasta } = {}) {
    let query = `
      SELECT c.*, d.nombre AS dispositivo_nombre, d.ubicacion
      FROM checadas c
      JOIN checador_dispositivos d ON d.id = c.dispositivo_id
      WHERE d.empresa_id = $1 AND c.empleado_id = $2
    `;
    const params = [empresaId, empleadoId];
    if (desde) { params.push(desde); query += ` AND c.timestamp >= $${params.length}`; }
    if (hasta) { params.push(hasta); query += ` AND c.timestamp <= $${params.length}`; }
    query += ' ORDER BY c.timestamp DESC';
    const { rows } = await pool.query(query, params);
    return rows;
  },

  async syncBatch(dispositivo, registros) {
    const insertadas = [];
    for (const r of registros) {
      // Solo mapeos a empleados de la misma empresa que el reloj
      const { rows: [mapa] } = await pool.query(
        `SELECT ce.empleado_id FROM checador_empleados ce
         JOIN empleados e ON e.id = ce.empleado_id
         WHERE ce.dispositivo_id = $1 AND ce.uid_checador = $2 AND e.empresa_id = $3`,
        [dispositivo.id, r.uid_checador, dispositivo.empresa_id]
      );
      if (!mapa) continue;
      const { rows: [checada] } = await pool.query(
        `INSERT INTO checadas (empleado_id, dispositivo_id, timestamp, tipo, uid_checador)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (dispositivo_id, uid_checador, timestamp) DO NOTHING
         RETURNING *`,
        [mapa.empleado_id, dispositivo.id, r.timestamp, r.tipo || 'desconocido', r.uid_checador]
      );
      if (checada) insertadas.push(checada);
    }
    return insertadas;
  },

  async getDispositivo(apiKey) {
    const { rows: [d] } = await pool.query(
      'SELECT * FROM checador_dispositivos WHERE api_key = $1 AND activo = true', [apiKey]);
    return d || null;
  },

  async getDispositivoDeEmpresa(empresaId, id) {
    const { rows: [d] } = await pool.query(
      'SELECT * FROM checador_dispositivos WHERE empresa_id = $1 AND id = $2', [empresaId, id]);
    return d || null;
  },

  async getMappings(dispositivo) {
    const { rows } = await pool.query(
      `SELECT ce.uid_checador, e.id, e.nombre, e.apellido_paterno, e.apellido_materno
       FROM checador_empleados ce
       JOIN empleados e ON e.id = ce.empleado_id
       WHERE ce.dispositivo_id = $1 AND e.empresa_id = $2`,
      [dispositivo.id, dispositivo.empresa_id]
    );
    return rows;
  },

  // El caller valida que dispositivo y empleado son de la empresa activa.
  async upsertMapping(dispositivoId, empleadoId, uidChecador) {
    const { rows: [r] } = await pool.query(
      `INSERT INTO checador_empleados (dispositivo_id, empleado_id, uid_checador)
       VALUES ($1,$2,$3)
       ON CONFLICT (dispositivo_id, uid_checador) DO UPDATE SET empleado_id = EXCLUDED.empleado_id
       RETURNING *`,
      [dispositivoId, empleadoId, uidChecador]
    );
    return r;
  },

  async deleteMapping(empresaId, id) {
    const { rowCount } = await pool.query(
      `DELETE FROM checador_empleados ce USING checador_dispositivos d
       WHERE d.id = ce.dispositivo_id AND d.empresa_id = $1 AND ce.id = $2`,
      [empresaId, id]
    );
    return rowCount > 0;
  },

  async getAllMappings(empresaId) {
    const { rows } = await pool.query(
      `SELECT ce.id, ce.uid_checador,
              e.id AS empleado_id, e.nombre, e.apellido_paterno, e.apellido_materno, e.puesto,
              d.id AS dispositivo_id, d.nombre AS dispositivo_nombre, d.ubicacion
       FROM checador_empleados ce
       JOIN empleados e ON e.id = ce.empleado_id
       JOIN checador_dispositivos d ON d.id = ce.dispositivo_id
       WHERE d.empresa_id = $1
       ORDER BY d.nombre, ce.uid_checador`,
      [empresaId]
    );
    return rows;
  },

  async getAllDispositivos(empresaId) {
    const { rows } = await pool.query(
      'SELECT id, nombre, ubicacion, ip, activo FROM checador_dispositivos WHERE empresa_id = $1 ORDER BY nombre',
      [empresaId]
    );
    return rows;
  },

  async crearDispositivo(empresaId, { nombre, ubicacion, ip }) {
    const apiKey = crypto.randomBytes(32).toString('hex'); // 64 chars = VARCHAR(64)
    const { rows: [d] } = await pool.query(
      `INSERT INTO checador_dispositivos (empresa_id, nombre, ubicacion, ip, api_key)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [empresaId, nombre, ubicacion || null, ip || null, apiKey]
    );
    return d;
  },
};

module.exports = CheckadaModel;
```

- [ ] **Step 4: Controlador**

`~/diandra/backend/src/controllers/checadasController.js` (reemplazar completo):
```js
const CheckadaModel = require('../models/checada');
const EmpleadoModel = require('../models/empleado');

async function dispositivoPorApiKey(req, res) {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey) { res.status(401).json({ error: 'Falta x-api-key' }); return null; }
  const dispositivo = await CheckadaModel.getDispositivo(apiKey);
  if (!dispositivo) { res.status(401).json({ error: 'Dispositivo no autorizado' }); return null; }
  return dispositivo;
}

// Llamado por el agente local con su api_key
exports.sync = async (req, res) => {
  const dispositivo = await dispositivoPorApiKey(req, res);
  if (!dispositivo) return;
  const { registros } = req.body;
  if (!Array.isArray(registros) || registros.length === 0) return res.status(400).json({ error: 'Sin registros' });
  const insertadas = await CheckadaModel.syncBatch(dispositivo, registros);
  res.json({ ok: true, insertadas: insertadas.length });
};

exports.getMappings = async (req, res) => {
  const dispositivo = await dispositivoPorApiKey(req, res);
  if (!dispositivo) return;
  res.json(await CheckadaModel.getMappings(dispositivo));
};

// Panel web (auth + empresa)
exports.getByEmpleado = async (req, res) => {
  const empleado = await EmpleadoModel.findById(req.empresaId, req.params.empleadoId);
  if (!empleado) return res.status(404).json({ error: 'Empleado no encontrado' });
  const { desde, hasta } = req.query;
  res.json(await CheckadaModel.findByEmpleado(req.empresaId, empleado.id, { desde, hasta }));
};

exports.upsertMapping = async (req, res) => {
  const { dispositivo_id, empleado_id, uid_checador } = req.body;
  if (!dispositivo_id || !empleado_id || uid_checador == null)
    return res.status(400).json({ error: 'Faltan campos: dispositivo_id, empleado_id, uid_checador' });
  const dispositivo = await CheckadaModel.getDispositivoDeEmpresa(req.empresaId, dispositivo_id);
  const empleado = await EmpleadoModel.findById(req.empresaId, empleado_id);
  if (!dispositivo || !empleado) return res.status(404).json({ error: 'Dispositivo o empleado no encontrado' });
  res.status(201).json(await CheckadaModel.upsertMapping(dispositivo.id, empleado.id, uid_checador));
};

exports.getAllMappings = async (req, res) => res.json(await CheckadaModel.getAllMappings(req.empresaId));

exports.deleteMapping = async (req, res) => {
  const borrado = await CheckadaModel.deleteMapping(req.empresaId, req.params.id);
  if (!borrado) return res.status(404).json({ error: 'Mapeo no encontrado' });
  res.status(204).end();
};

exports.getDispositivos = async (req, res) => res.json(await CheckadaModel.getAllDispositivos(req.empresaId));
```

- [ ] **Step 5: Rutas**

`~/diandra/backend/src/routes/checadas.js` (reemplazar completo):
```js
const router = require('express').Router();
const ctrl = require('../controllers/checadasController');
const auth = require('../middleware/auth');
const empresa = require('../middleware/empresa');

// Rutas para el agente local (autenticadas por x-api-key; la empresa sale del dispositivo)
router.post('/sync', ctrl.sync);
router.get('/mappings/agente', ctrl.getMappings);

// Panel web: JWT + empresa activa
const panel = [auth, empresa];
router.get('/dispositivos', panel, ctrl.getDispositivos);
router.get('/mappings', panel, ctrl.getAllMappings);
router.post('/mappings', panel, ctrl.upsertMapping);
router.delete('/mappings/:id', panel, ctrl.deleteMapping);
router.get('/empleado/:empleadoId', panel, ctrl.getByEmpleado);

module.exports = router;
```

- [ ] **Step 6: Script para dar de alta relojes**

`~/diandra/backend/scripts/create-dispositivo.js`:
```js
// Uso: node scripts/create-dispositivo.js <empresaId> "<nombre>" ["<ubicacion>"] ["<ip>"]
// ponytail: alta de relojes por script — agregar UI cuando Diana tenga más de un par de relojes.
require('dotenv').config();
const pool = require('../src/db/pool');
const CheckadaModel = require('../src/models/checada');

async function main() {
  const [empresaId, nombre, ubicacion, ip] = process.argv.slice(2);
  if (!/^\d+$/.test(empresaId || '') || !nombre) {
    console.error('Uso: node scripts/create-dispositivo.js <empresaId> "<nombre>" ["<ubicacion>"] ["<ip>"]');
    process.exit(1);
  }
  const { rows } = await pool.query('SELECT razon_social FROM empresas WHERE id = $1', [empresaId]);
  if (!rows.length) { console.error(`Empresa ${empresaId} no existe`); process.exit(1); }
  const d = await CheckadaModel.crearDispositivo(Number(empresaId), { nombre, ubicacion, ip });
  console.log(`Reloj "${d.nombre}" para ${rows[0].razon_social}. API_KEY del agente: ${d.api_key}`);
  process.exit(0);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
```

- [ ] **Step 7: Correr las pruebas**

Run: `npx jest tests/integration/checador.test.js`
Expected: PASS en 5 tests.

- [ ] **Step 8: Commit**

```bash
cd ~/diandra && git add -A backend && git commit -m "feat: checador por empresa y script de alta de relojes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Salidas y documentos de salida por empresa

**Files:**
- Modify: `backend/src/models/salida.js` (reemplazar), `backend/src/models/documentoSalida.js`, `backend/src/controllers/salidasController.js` (reemplazar), `backend/src/controllers/documentosSalidaController.js`
- Create: `backend/tests/integration/salidas.test.js`

**Interfaces:**
- Consumes: `EmpleadoModel.findById/update(empresaId, …)` (Task 4), `relativa/absoluta` (Task 3).
- Produces:
  - `SalidaModel.findAll(empresaId, {estado, empleadoId})`, `findById(empresaId, id)`, `create(empresaId, data)`, `update(empresaId, id, data)`, `delete(empresaId, id)`, `findByEmpleadoId(empresaId, empleadoId)`, `findByEstado(empresaId, estado)`.
  - `DocumentoSalidaModel.findAll(empresaId, filters)`, `findById(empresaId, id)`. `create`, `update(id, …)`, `delete(id)` y `findBySalidaId(salidaId)` quedan sin empresa y solo se llaman después de validar la salida o el documento.

- [ ] **Step 1: Prueba que falla**

`~/diandra/backend/tests/integration/salidas.test.js`:
```js
const path = require('path');
const { pool, resetDb, api, crearEmpresa, crearEmpleado } = require('../helpers');

const pdf = Buffer.from('%PDF-1.4\n%prueba\n');
let A, B, empA, empB;
beforeEach(async () => {
  await resetDb();
  A = await crearEmpresa(); B = await crearEmpresa();
  empA = await crearEmpleado(A.id); empB = await crearEmpleado(B.id);
});
afterAll(() => pool.end());

const baja = (empresaId, empleadoId, extra = {}) => api(empresaId).post('/api/salidas').send({
  empleadoId, fechaSalida: '2026-10-01', tipoSalida: 'renuncia', razonSalida: 'Personal', ...extra });

test('crea salida con empresa activa aunque el body traiga otra', async () => {
  const res = await baja(A.id, empA.id, { empresaId: B.id });
  expect(res.status).toBe(201);
  expect(res.body.empresa_id).toBe(A.id);
  const { rows } = await pool.query('SELECT count(*)::int n FROM documentos_salida WHERE salida_id = $1', [res.body.id]);
  expect(rows[0].n).toBe(5);
});

test('no se da de baja a empleado de otra empresa', async () => {
  expect((await baja(A.id, empB.id)).status).toBe(404);
});

test('salidas de otra empresa no se listan ni se tocan', async () => {
  const sB = (await baja(B.id, empB.id)).body;
  expect((await api(A.id).get('/api/salidas')).body).toEqual([]);
  expect((await api(A.id).get(`/api/salidas/${sB.id}`)).status).toBe(404);
  expect((await api(A.id).put(`/api/salidas/${sB.id}`).send({ razonSalida: 'X' })).status).toBe(404);
  expect((await api(A.id).delete(`/api/salidas/${sB.id}`)).status).toBe(404);
  expect((await api(A.id).get(`/api/salidas/empleado/${empB.id}`)).body).toEqual([]);
  expect((await api(A.id).get('/api/salidas/estado/pendiente')).body).toEqual([]);
  expect((await api(A.id).get(`/api/documentosSalida/${sB.id}`)).status).toBe(404);
  expect((await api(A.id).get('/api/documentosSalida')).body).toEqual([]);
});

test('escaneado: ruta relativa, completar todo inactiva al empleado, otra empresa → 404', async () => {
  const s = (await baja(A.id, empA.id)).body;
  const docs = (await api(A.id).get(`/api/documentosSalida/${s.id}`)).body;
  for (const d of docs) {
    expect((await api(A.id).post(`/api/documentosSalida/${s.id}/${d.tipo_documento}/generar-template`)).status).toBe(200);
  }
  expect((await api(B.id).post(`/api/documentosSalida/${docs[0].id}/subir-escaneado`)
    .attach('archivo', pdf, { filename: 'x.pdf', contentType: 'application/pdf' })).status).toBe(404);
  for (const d of docs) {
    const up = await api(A.id).post(`/api/documentosSalida/${d.id}/subir-escaneado`)
      .attach('archivo', pdf, { filename: 'x.pdf', contentType: 'application/pdf' });
    expect(up.status).toBe(200);
    expect(path.isAbsolute(up.body.documento_url)).toBe(false);
  }
  expect((await api(A.id).get(`/api/documentosSalida/${docs[0].id}/descargar-escaneado`)).status).toBe(200);
  expect((await api(B.id).get(`/api/documentosSalida/${docs[0].id}/descargar-escaneado`)).status).toBe(404);
  const { rows } = await pool.query('SELECT estado FROM empleados WHERE id = $1', [empA.id]);
  expect(rows[0].estado).toBe('inactivo');
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `cd ~/diandra/backend && npx jest tests/integration/salidas.test.js`
Expected: FAIL. El primer test responde 400 porque falta `empresaId` en el body, y los demás ven salidas de otra empresa.

- [ ] **Step 3: Modelo de salidas**

`~/diandra/backend/src/models/salida.js` (reemplazar completo):
```js
const pool = require('../db/pool');

const EDITABLES = ['fecha_salida', 'tipo_salida', 'razon_salida', 'salario_pendiente', 'estado', 'documentos_firmados'];

const SalidaModel = {
  async findAll(empresaId, filters = {}) {
    const params = [empresaId];
    let query = 'SELECT * FROM salidas WHERE empresa_id = $1';
    if (filters.empleadoId) { params.push(filters.empleadoId); query += ` AND empleado_id = $${params.length}`; }
    if (filters.estado) { params.push(filters.estado); query += ` AND estado = $${params.length}`; }
    query += ' ORDER BY fecha_salida DESC';
    const { rows } = await pool.query(query, params);
    return rows;
  },

  async findById(empresaId, id) {
    const { rows } = await pool.query('SELECT * FROM salidas WHERE empresa_id = $1 AND id = $2', [empresaId, id]);
    return rows[0] || null;
  },

  async create(empresaId, data) {
    const {
      empleadoId, fechaSalida, tipoSalida, razonSalida,
      salarioPendiente = 0, estado = 'pendiente', documentosFirmados = false, createdBy,
    } = data;
    const { rows } = await pool.query(
      `INSERT INTO salidas
        (empleado_id, empresa_id, fecha_salida, tipo_salida, razon_salida,
         salario_pendiente, estado, documentos_firmados, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [empleadoId, empresaId, fechaSalida, tipoSalida, razonSalida, salarioPendiente, estado, documentosFirmados, createdBy]
    );
    return rows[0];
  },

  async update(empresaId, id, data) {
    const updates = {};
    Object.keys(data).forEach((key) => {
      const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase(); // camelCase → snake_case
      if (EDITABLES.includes(snakeKey)) updates[snakeKey] = data[key];
    });
    const fields = Object.keys(updates);
    if (!fields.length) return this.findById(empresaId, id);
    const set = fields.map((f, i) => `${f} = $${i + 1}`).join(', ');
    const { rows } = await pool.query(
      `UPDATE salidas SET ${set}, updated_at = NOW()
       WHERE empresa_id = $${fields.length + 1} AND id = $${fields.length + 2} RETURNING *`,
      [...fields.map(f => updates[f]), empresaId, id]
    );
    return rows[0] || null;
  },

  async delete(empresaId, id) {
    await pool.query('DELETE FROM salidas WHERE empresa_id = $1 AND id = $2', [empresaId, id]);
  },

  async findByEmpleadoId(empresaId, empleadoId) {
    return this.findAll(empresaId, { empleadoId });
  },

  async findByEstado(empresaId, estado) {
    return this.findAll(empresaId, { estado });
  },
};

module.exports = SalidaModel;
```

- [ ] **Step 4: Modelo de documentos de salida (lecturas con empresa)**

En `~/diandra/backend/src/models/documentoSalida.js`, reemplazar los métodos `findAll` y `findById` por:
```js
  async findAll(empresaId, filters = {}) {
    const params = [empresaId];
    let query = `SELECT ds.* FROM documentos_salida ds JOIN salidas s ON s.id = ds.salida_id WHERE s.empresa_id = $1`;
    if (filters.salidaId) { params.push(filters.salidaId); query += ` AND ds.salida_id = $${params.length}`; }
    if (filters.tipoDocumento) { params.push(filters.tipoDocumento); query += ` AND ds.tipo_documento = $${params.length}`; }
    if (filters.estado) { params.push(filters.estado); query += ` AND ds.estado = $${params.length}`; }
    query += ' ORDER BY ds.created_at DESC';
    const { rows } = await pool.query(query, params);
    return rows;
  },

  async findById(empresaId, id) {
    const { rows } = await pool.query(
      `SELECT ds.* FROM documentos_salida ds JOIN salidas s ON s.id = ds.salida_id
       WHERE s.empresa_id = $1 AND ds.id = $2`,
      [empresaId, id]
    );
    return rows[0] || null;
  },
```
En `update`, cambiar `if (Object.keys(updates).length === 0) { return this.findById(id); }` por:
```js
    if (Object.keys(updates).length === 0) {
      const { rows } = await pool.query('SELECT * FROM documentos_salida WHERE id = $1', [id]);
      return rows[0] || null;
    }
```
Borrar los métodos `findByTipoDocumento` y `findByEstado`: no tienen filtro de empresa y ningún controlador los usa. Agregar arriba de `const DocumentoSalidaModel = {`:
```js
// create/update/delete/findBySalidaId no filtran empresa: el caller valida la salida o el documento antes.
```

- [ ] **Step 5: Controlador de salidas**

`~/diandra/backend/src/controllers/salidasController.js` (reemplazar completo):
```js
const SalidaModel = require('../models/salida');
const EmpleadoModel = require('../models/empleado');
const DocumentoSalidaModel = require('../models/documentoSalida');
const { tiposDocumentoParaSalida } = require('../constants/documentosSalida');

const TIPOS_SALIDA = ['renuncia', 'despido', 'jubilacion', 'otro'];
const ESTADOS_SALIDA = ['pendiente', 'en_proceso', 'completado'];
const estadoInvalido = (res) =>
  res.status(400).json({ error: `estado inválido. Valores permitidos: ${ESTADOS_SALIDA.join(', ')}` });

exports.getAllSalidas = async (req, res) => {
  const { estado, empleadoId } = req.query;
  if (estado && !ESTADOS_SALIDA.includes(estado)) return estadoInvalido(res);
  res.json(await SalidaModel.findAll(req.empresaId, { estado, empleadoId }));
};

exports.getSalidaById = async (req, res) => {
  const salida = await SalidaModel.findById(req.empresaId, req.params.salidaId);
  if (!salida) return res.status(404).json({ error: 'Salida no encontrada' });
  const documentos = await DocumentoSalidaModel.findBySalidaId(salida.id);
  res.json({ ...salida, documentos });
};

exports.getSalidasByEmpleado = async (req, res) =>
  res.json(await SalidaModel.findByEmpleadoId(req.empresaId, req.params.empleadoId));

exports.createSalida = async (req, res) => {
  const { empleadoId, fechaSalida, tipoSalida, razonSalida, salarioPendiente } = req.body;
  if (!empleadoId || !fechaSalida || !tipoSalida || !razonSalida) {
    return res.status(400).json({ error: 'Campos requeridos: empleadoId, fechaSalida, tipoSalida, razonSalida' });
  }
  if (!TIPOS_SALIDA.includes(tipoSalida)) {
    return res.status(400).json({ error: `tipoSalida inválido. Valores permitidos: ${TIPOS_SALIDA.join(', ')}` });
  }
  const empleado = await EmpleadoModel.findById(req.empresaId, empleadoId);
  if (!empleado) return res.status(404).json({ error: 'Empleado no encontrado' });
  if (empleado.estado === 'inactivo') {
    return res.status(400).json({ error: 'No se puede crear salida de empleado inactivo' });
  }

  const salida = await SalidaModel.create(req.empresaId, {
    empleadoId: empleado.id, fechaSalida, tipoSalida, razonSalida,
    salarioPendiente: salarioPendiente || 0, createdBy: req.user?.id,
  });

  // Documentos vacíos; renuncia vs aviso rescisorio depende del tipoSalida
  await Promise.all(tiposDocumentoParaSalida(tipoSalida).map((tipoDocumento) =>
    DocumentoSalidaModel.create({ salidaId: salida.id, tipoDocumento, createdBy: req.user?.id })));

  res.status(201).json(salida);
};

exports.updateSalida = async (req, res) => {
  const { tipoSalida, estado } = req.body;
  if (tipoSalida && !TIPOS_SALIDA.includes(tipoSalida)) {
    return res.status(400).json({ error: `tipoSalida inválido. Valores permitidos: ${TIPOS_SALIDA.join(', ')}` });
  }
  if (estado && !ESTADOS_SALIDA.includes(estado)) return estadoInvalido(res);
  const salida = await SalidaModel.update(req.empresaId, req.params.salidaId, req.body);
  if (!salida) return res.status(404).json({ error: 'Salida no encontrada' });
  res.json(salida);
};

exports.deleteSalida = async (req, res) => {
  const salida = await SalidaModel.findById(req.empresaId, req.params.salidaId);
  if (!salida) return res.status(404).json({ error: 'Salida no encontrada' });
  if (salida.estado !== 'pendiente') {
    return res.status(400).json({ error: 'Solo se pueden eliminar salidas en estado pendiente' });
  }
  await SalidaModel.delete(req.empresaId, salida.id); // documentos_salida cae por ON DELETE CASCADE
  res.status(204).end();
};

exports.getSalidasByEstado = async (req, res) => {
  if (!ESTADOS_SALIDA.includes(req.params.estado)) return estadoInvalido(res);
  res.json(await SalidaModel.findByEstado(req.empresaId, req.params.estado));
};
```

- [ ] **Step 6: Controlador de documentos de salida**

En `~/diandra/backend/src/controllers/documentosSalidaController.js`:

a) Agregar debajo de `const path = require('path');`:
```js
const { relativa, absoluta } = require('../lib/archivos');
```
b) `obtenerDocumentos`: cambiar `SalidaModel.findById(salidaId)` por `SalidaModel.findById(req.empresaId, salidaId)`.
c) `obtenerDocumentoPorId`: cambiar `DocumentoSalidaModel.findById(req.params.documentoId)` por `DocumentoSalidaModel.findById(req.empresaId, req.params.documentoId)`.
d) `getAllDocumentos`: cambiar `DocumentoSalidaModel.findAll(filters)` por `DocumentoSalidaModel.findAll(req.empresaId, filters)`.
e) `generarTemplate`: cambiar `SalidaModel.findById(salidaId)` por `SalidaModel.findById(req.empresaId, salidaId)` y `EmpleadoModel.findById(salida.empleado_id)` por `EmpleadoModel.findById(req.empresaId, salida.empleado_id)`.
f) `subirEscaneado`: cambiar `DocumentoSalidaModel.findById(req.params.documentoId)` por `DocumentoSalidaModel.findById(req.empresaId, req.params.documentoId)`; `documentoUrl: req.file.path,` por `documentoUrl: relativa(req.file.path),`; las dos llamadas `SalidaModel.update(documento.salida_id, …)` por `SalidaModel.update(req.empresaId, documento.salida_id, …)`, y `EmpleadoModel.update(salidaActualizada.empleado_id, { estado: 'inactivo' })` por `EmpleadoModel.update(req.empresaId, salidaActualizada.empleado_id, { estado: 'inactivo' })`. Al inicio del handler, si el documento no existe, borra el archivo subido: reemplazar `if (!documento) return res.status(404).json({ error: 'Documento no encontrado' });` (el de `subirEscaneado`) por:
```js
    if (!documento) {
      fs.unlinkSync(req.file.path);
      return res.status(404).json({ error: 'Documento no encontrado' });
    }
```
g) `descargarEscaneado`: cambiar `DocumentoSalidaModel.findById(req.params.documentoId)` por `DocumentoSalidaModel.findById(req.empresaId, req.params.documentoId)`; `fs.existsSync(documento.documento_url)` por `fs.existsSync(absoluta(documento.documento_url))`, y `res.download(path.resolve(documento.documento_url), safeName)` por `res.download(absoluta(documento.documento_url), safeName)`.
h) `eliminarEscaneado`: cambiar `DocumentoSalidaModel.findById(req.params.documentoId)` por `DocumentoSalidaModel.findById(req.empresaId, req.params.documentoId)`; `fs.existsSync(documento.documento_url)` por `fs.existsSync(absoluta(documento.documento_url))`; `fs.unlinkSync(documento.documento_url)` por `fs.unlinkSync(absoluta(documento.documento_url))`, y `SalidaModel.update(documento.salida_id, { estado: 'en_proceso' })` por `SalidaModel.update(req.empresaId, documento.salida_id, { estado: 'en_proceso' })`.

Verificar que no quede ninguna llamada sin empresa:
```bash
cd ~/diandra/backend && grep -nP "(SalidaModel|EmpleadoModel)\.(findById|update)\((?!req\.empresaId)" src/controllers/documentosSalidaController.js; grep -nP "DocumentoSalidaModel\.(findById|findAll)\((?!req\.empresaId)" src/controllers/*.js
```
Expected: sin resultados.

- [ ] **Step 7: Correr las pruebas**

Run: `npx jest tests/integration/salidas.test.js`
Expected: PASS en 4 tests.

- [ ] **Step 8: Commit**

```bash
cd ~/diandra && git add -A backend && git commit -m "feat: salidas y documentos de salida por empresa

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Cultura por empresa

**Files:**
- Modify: `backend/src/models/culturaEmpresa.js`, `backend/src/controllers/culturasController.js`, `backend/src/routes/culturas.js`
- Create: `backend/tests/integration/culturas.test.js`

**Interfaces:**
- Produces: `GET /api/culturas` (activos de la empresa del header; reemplaza a `GET /api/culturas/empresa/:empresaId`). `CulturaEmpresaModel.findById(empresaId, id)`, `update(empresaId, id, data)`, `delete(empresaId, id)`, `addArchivo(empresaId, id, archivo)`, `removeArchivo(empresaId, id, archivoId)`. `findActiveByEmpresaId`, `findByEmpresaId` y `findByEmpresaIdAndTipo` no cambian. Las usa Task 11.

- [ ] **Step 1: Prueba que falla**

`~/diandra/backend/tests/integration/culturas.test.js`:
```js
const path = require('path');
const { pool, resetDb, api, crearEmpresa } = require('../helpers');

let A, B;
beforeEach(async () => { await resetDb(); A = await crearEmpresa(); B = await crearEmpresa(); });
afterAll(() => pool.end());

const crear = (empresaId, extra = {}) =>
  api(empresaId).post('/api/culturas').send({ tipo: 'mision', titulo: 'Misión', ...extra });

test('crea en la empresa activa ignorando empresaId del body y lista solo esa', async () => {
  const res = await crear(A.id, { empresaId: B.id });
  expect(res.status).toBe(201);
  expect(res.body.empresa_id).toBe(A.id);
  expect((await api(B.id).get('/api/culturas')).body).toEqual([]);
  expect((await api(A.id).get('/api/culturas')).body).toHaveLength(1);
});

test('misma misión en dos empresas se permite', async () => {
  expect((await crear(A.id)).status).toBe(201);
  expect((await crear(B.id)).status).toBe(201);
});

test('ver, editar, borrar y subir archivo a cultura de otra empresa → 404', async () => {
  const cB = (await crear(B.id)).body;
  expect((await api(A.id).get(`/api/culturas/${cB.id}`)).status).toBe(404);
  expect((await api(A.id).put(`/api/culturas/${cB.id}`).send({ titulo: 'X' })).status).toBe(404);
  expect((await api(A.id).delete(`/api/culturas/${cB.id}`)).status).toBe(404);
  const png = Buffer.from('89504e470d0a1a0a', 'hex');
  expect((await api(A.id).post(`/api/culturas/${cB.id}/archivos`).attach('archivo', png, { filename: 'a.png', contentType: 'image/png' })).status).toBe(404);
});

test('archivo de cultura con ruta relativa', async () => {
  const c = (await crear(A.id)).body;
  const png = Buffer.from('89504e470d0a1a0a', 'hex');
  const res = await api(A.id).post(`/api/culturas/${c.id}/archivos`).attach('archivo', png, { filename: 'a.png', contentType: 'image/png' });
  expect(res.status).toBe(201);
  expect(path.isAbsolute(res.body.archivos[0].url)).toBe(false);
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `cd ~/diandra/backend && npx jest tests/integration/culturas.test.js`
Expected: FAIL. `GET /api/culturas` responde 404 (la ruta no existe) y el create exige `empresaId` en el body.

- [ ] **Step 3: Modelo**

En `~/diandra/backend/src/models/culturaEmpresa.js`:

a) Reemplazar `findById` por:
```js
  async findById(empresaId, id) {
    const { rows } = await pool.query('SELECT * FROM cultura_empresa WHERE empresa_id = $1 AND id = $2', [empresaId, id]);
    return rows[0] || null;
  },
```
b) En `update`, cambiar la firma `async update(id, data) {` por `async update(empresaId, id, data) {`; `return this.findById(id);` por `return this.findById(empresaId, id);`, y el UPDATE final por:
```js
    const { rows } = await pool.query(
      `UPDATE cultura_empresa SET ${set}, updated_at = NOW()
       WHERE empresa_id = $${fields.length + 1} AND id = $${fields.length + 2} RETURNING *`,
      [...values, empresaId, id]
    );
```
c) Reemplazar `delete` por:
```js
  async delete(empresaId, id) {
    await pool.query('DELETE FROM cultura_empresa WHERE empresa_id = $1 AND id = $2', [empresaId, id]);
  },
```
d) En `addArchivo` y `removeArchivo`, cambiar las firmas a `async addArchivo(empresaId, id, archivo) {` y `async removeArchivo(empresaId, id, archivoId) {`; `const current = await this.findById(id);` por `const current = await this.findById(empresaId, id);`, y en ambos UPDATE `WHERE id = $2` por `WHERE id = $2 AND empresa_id = $3`, agregando `empresaId` al final del arreglo de parámetros (`[JSON.stringify(updatedArchivos), id, empresaId]`).
e) Borrar `findAll`, `findByTipo` y `findByActivo`: no filtran empresa y el controlador no los usa.

- [ ] **Step 4: Controlador**

En `~/diandra/backend/src/controllers/culturasController.js`:

a) Agregar debajo de `const CulturaEmpresaModel = require('../models/culturaEmpresa');`:
```js
const { relativa, absoluta } = require('../lib/archivos');
```
b) Reemplazar `getCulturasByEmpresa` por:
```js
// GET /api/culturas
exports.getCulturas = async (req, res) =>
  res.json(await CulturaEmpresaModel.findActiveByEmpresaId(req.empresaId));
```
c) En `getCulturaById`, `updateCultura`, `deleteCultura`, `subirArchivo` y `eliminarArchivo`, cada `CulturaEmpresaModel.findById(X)` pasa a `CulturaEmpresaModel.findById(req.empresaId, X)`; `CulturaEmpresaModel.update(req.params.culturaId, req.body)` pasa a `CulturaEmpresaModel.update(req.empresaId, req.params.culturaId, req.body)`; `CulturaEmpresaModel.delete(req.params.culturaId)` pasa a `CulturaEmpresaModel.delete(req.empresaId, req.params.culturaId)`; `addArchivo(req.params.culturaId, archivo)` pasa a `addArchivo(req.empresaId, req.params.culturaId, archivo)`, y `removeArchivo(culturaId, archivoId)` pasa a `removeArchivo(req.empresaId, culturaId, archivoId)`.
d) En `createCultura`, reemplazar desde `const { empresaId, tipo, titulo, descripcion } = req.body;` hasta el `if (!empresaId || !tipo || !titulo) {...}` por:
```js
    const empresaId = req.empresaId;
    const { tipo, titulo, descripcion } = req.body;

    if (!tipo || !titulo) {
      return res.status(400).json({ error: 'Campos requeridos: tipo, titulo' });
    }
```
e) En `subirArchivo`, cambiar `url: req.file.path,` por `url: relativa(req.file.path),`. Si la cultura no existe, borra el archivo subido: reemplazar `if (!cultura) return res.status(404).json({ error: 'Cultura no encontrada' });` (el de `subirArchivo`) por:
```js
    if (!cultura) {
      fs.unlinkSync(req.file.path);
      return res.status(404).json({ error: 'Cultura no encontrada' });
    }
```
f) En `eliminarArchivo`, cambiar `if (archivo.url && fs.existsSync(archivo.url)) { fs.unlinkSync(archivo.url); }` por:
```js
    if (archivo.url && fs.existsSync(absoluta(archivo.url))) {
      fs.unlinkSync(absoluta(archivo.url));
    }
```

- [ ] **Step 5: Rutas**

En `~/diandra/backend/src/routes/culturas.js`, reemplazar
```js
// GET /api/culturas/empresa/:empresaId
router.get('/empresa/:empresaId', ctrl.getCulturasByEmpresa);
```
por
```js
// GET /api/culturas — elementos activos de la empresa activa
router.get('/', ctrl.getCulturas);
```

- [ ] **Step 6: Correr la suite completa**

Run: `cd ~/diandra/backend && npm test`
Expected: PASS en todas las suites (health, empresas, archivos, empleados, documentos, pagos, checador, salidas y culturas), 0 fallas.

- [ ] **Step 7: Revisar que no queden rutas absolutas ni consultas sin empresa**

```bash
cd ~/diandra/backend && grep -rn "req.file.path" src | grep -v "relativa(req.file.path)\|unlinkSync(req.file.path)\|existsSync(req.file.path)\|readFileSync(req.file.path)\|renameSync(req.file.path"
grep -rn "path.join(__dirname, '..', '..', 'uploads'" src
```
Expected: sin resultados en los dos comandos.

- [ ] **Step 8: Commit**

```bash
cd ~/diandra && git add -A backend && git commit -m "feat: cultura por empresa

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Frontend — empresa activa, selector y página de Empresas

**Files:**
- Create: `frontend/src/empresaActiva.js`, `frontend/src/api/empresas.js`, `frontend/src/pages/EmpresasPage.jsx`, `frontend/src/pages/EmpresaFormPage.jsx`
- Modify: `frontend/src/api/client.js`, `frontend/src/App.jsx` (reemplazar)

**Interfaces:**
- Consumes: `GET/POST/PUT /api/empresas`, `PATCH /api/empresas/:id/activo` (Task 2). Códigos `EMPRESA_REQUERIDA` / `EMPRESA_INVALIDA`.
- Produces: `getEmpresaActiva() → {id, razon_social}|null`, `setEmpresaActiva(empresa)`, `clearEmpresaActiva()`; `getEmpresas()`, `getEmpresa(id)`, `createEmpresa(data)`, `updateEmpresa(id, data)`, `setEmpresaActivo(id, bool)`. Las usa Task 11.

- [ ] **Step 1: Empresa activa en localStorage**

`~/diandra/frontend/src/empresaActiva.js`:
```js
const KEY = 'empresaActiva';

export function getEmpresaActiva() {
  try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; }
}

export function setEmpresaActiva(empresa) {
  localStorage.setItem(KEY, JSON.stringify({ id: empresa.id, razon_social: empresa.razon_social }));
}

export function clearEmpresaActiva() {
  localStorage.removeItem(KEY);
}
```

- [ ] **Step 2: API de empresas**

`~/diandra/frontend/src/api/empresas.js`:
```js
import api from './client';

export const getEmpresas = () => api.get('/empresas').then(r => r.data);
export const getEmpresa = (id) => api.get(`/empresas/${id}`).then(r => r.data);
export const createEmpresa = (data) => api.post('/empresas', data).then(r => r.data);
export const updateEmpresa = (id, data) => api.put(`/empresas/${id}`, data).then(r => r.data);
export const setEmpresaActivo = (id, activo) => api.patch(`/empresas/${id}/activo`, { activo }).then(r => r.data);
```

- [ ] **Step 3: Header y errores de empresa en el cliente**

`~/diandra/frontend/src/api/client.js` (reemplazar completo):
```js
import axios from 'axios';
import { getEmpresaActiva, clearEmpresaActiva } from '../empresaActiva';

const api = axios.create({ baseURL: '/api' });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  const empresa = getEmpresaActiva();
  if (empresa) config.headers['X-Empresa-Id'] = empresa.id;
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('nombre');
      window.location.href = '/login';
    }
    const code = err.response?.data?.code;
    if (code === 'EMPRESA_REQUERIDA' || code === 'EMPRESA_INVALIDA') {
      clearEmpresaActiva();
      window.location.href = '/empresas';
    }
    return Promise.reject(err);
  }
);

export default api;
```

- [ ] **Step 4: Lista de empresas**

`~/diandra/frontend/src/pages/EmpresasPage.jsx`:
```jsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getEmpresas, setEmpresaActivo } from '../api/empresas';
import { getEmpresaActiva, clearEmpresaActiva } from '../empresaActiva';

export default function EmpresasPage({ onCambio }) {
  const [empresas, setEmpresas] = useState(null);
  const [error, setError] = useState('');

  const cargar = () => getEmpresas().then(setEmpresas).catch(() => setError('No se pudieron cargar las empresas.'));
  useEffect(() => { cargar(); }, []);

  async function toggle(e) {
    const accion = e.activo ? 'desactivar' : 'activar';
    if (!window.confirm(`¿Seguro que deseas ${accion} ${e.razon_social}? Sus datos se conservan.`)) return;
    await setEmpresaActivo(e.id, !e.activo);
    if (e.activo && getEmpresaActiva()?.id === e.id) clearEmpresaActiva();
    await cargar();
    onCambio?.();
  }

  if (error) return <p className="text-red-600">{error}</p>;
  if (!empresas) return <p className="text-gray-500">Cargando…</p>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-gray-800">Empresas cliente</h1>
        <Link to="/empresas/nueva" className="bg-blue-700 text-white px-3 py-1.5 rounded text-sm hover:bg-blue-800">+ Nueva empresa</Link>
      </div>
      {empresas.length === 0 ? (
        <div className="bg-white border rounded p-8 text-center">
          <p className="text-gray-700 mb-3">Da de alta tu primer cliente para empezar.</p>
          <Link to="/empresas/nueva" className="text-blue-700 hover:underline">Dar de alta empresa</Link>
        </div>
      ) : (
        <table className="w-full bg-white border rounded text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr><th className="p-2">Razón social</th><th className="p-2">RFC</th><th className="p-2">Empleados activos</th><th className="p-2">Estado</th><th className="p-2"></th></tr>
          </thead>
          <tbody>
            {empresas.map(e => (
              <tr key={e.id} className="border-t">
                <td className="p-2">{e.razon_social}</td>
                <td className="p-2 font-mono">{e.rfc}</td>
                <td className="p-2">{e.empleados_activos}</td>
                <td className="p-2">{e.activo ? 'Activa' : 'Inactiva'}</td>
                <td className="p-2 text-right space-x-3">
                  <Link to={`/empresas/${e.id}/editar`} className="text-blue-700 hover:underline">Editar</Link>
                  <button onClick={() => toggle(e)} className={e.activo ? 'text-red-600 hover:underline' : 'text-green-700 hover:underline'}>
                    {e.activo ? 'Desactivar' : 'Activar'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Formulario de empresa**

`~/diandra/frontend/src/pages/EmpresaFormPage.jsx`:
```jsx
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { createEmpresa, getEmpresa, updateEmpresa } from '../api/empresas';
import { getEmpresaActiva, setEmpresaActiva } from '../empresaActiva';

const CAMPOS = [
  ['razon_social', 'Razón social *'], ['nombre_comercial', 'Nombre comercial'], ['rfc', 'RFC *'],
  ['registro_patronal', 'Registro patronal IMSS'], ['representante_legal', 'Representante legal'],
  ['domicilio', 'Calle y número'], ['colonia', 'Colonia'], ['cp', 'Código postal'], ['ciudad', 'Ciudad'], ['giro', 'Giro'],
];
const RFC_RE = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/;

export default function EmpresaFormPage({ onCambio }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState(Object.fromEntries(CAMPOS.map(([k]) => [k, ''])));
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (id) getEmpresa(id).then(e => setForm(Object.fromEntries(CAMPOS.map(([k]) => [k, e[k] || '']))));
  }, [id]);

  async function guardar(ev) {
    ev.preventDefault();
    const rfc = form.rfc.trim().toUpperCase();
    if (!form.razon_social.trim()) return setError('La razón social es obligatoria.');
    if (!RFC_RE.test(rfc)) return setError('RFC inválido: 12 caracteres para persona moral, 13 para persona física.');
    setError(''); setGuardando(true);
    try {
      const empresa = id ? await updateEmpresa(id, { ...form, rfc }) : await createEmpresa({ ...form, rfc });
      if (!getEmpresaActiva()) setEmpresaActiva(empresa); // primer cliente queda seleccionado
      onCambio?.();
      navigate('/empresas');
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo guardar.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form onSubmit={guardar} className="bg-white border rounded p-6 max-w-2xl">
      <h1 className="text-xl font-bold text-gray-800 mb-4">{id ? 'Editar empresa' : 'Nueva empresa cliente'}</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {CAMPOS.map(([k, label]) => (
          <label key={k} className="text-sm text-gray-700">
            {label}
            <input value={form[k]} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))}
              className="mt-1 w-full border border-gray-300 rounded px-3 py-2 text-sm" />
          </label>
        ))}
      </div>
      {error && <p className="text-red-600 text-sm mt-3">{error}</p>}
      <div className="mt-5 flex gap-3">
        <button disabled={guardando} className="bg-blue-700 text-white px-4 py-2 rounded text-sm hover:bg-blue-800 disabled:opacity-50">
          {guardando ? 'Guardando…' : 'Guardar'}
        </button>
        <button type="button" onClick={() => navigate('/empresas')} className="text-gray-600 text-sm">Cancelar</button>
      </div>
    </form>
  );
}
```

- [ ] **Step 6: Layout con selector, nombre de la empresa y bloqueo sin empresa**

`~/diandra/frontend/src/App.jsx` (reemplazar completo):
```jsx
import { useCallback, useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, NavLink, useNavigate, useLocation } from 'react-router-dom';
import EmpleadosPage from './pages/EmpleadosPage';
import EmpleadoDetallePage from './pages/EmpleadoDetallePage';
import EmpleadoFormPage from './pages/EmpleadoFormPage';
import MapeoChecadorPage from './pages/MapeoChecadorPage';
import PagosPage from './pages/PagosPage';
import FormatosPage from './pages/FormatosPage';
import SalidaDetailPage from './pages/SalidaDetailPage';
import CulturePage from './pages/CulturePage';
import CultureElementDetailPage from './pages/CultureElementDetailPage';
import EmpresasPage from './pages/EmpresasPage';
import EmpresaFormPage from './pages/EmpresaFormPage';
import LoginPage from './pages/LoginPage';
import ProtectedRoute from './components/ProtectedRoute';
import { getEmpresas } from './api/empresas';
import { getEmpresaActiva, setEmpresaActiva, clearEmpresaActiva } from './empresaActiva';

const linkCls = ({ isActive }) => isActive ? 'text-blue-700 font-medium text-sm' : 'text-gray-600 hover:text-blue-700 text-sm';

function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const nombre = localStorage.getItem('nombre');
  const [empresas, setEmpresas] = useState(null);
  const [activa, setActiva] = useState(getEmpresaActiva());

  const cargarEmpresas = useCallback(async () => {
    const lista = (await getEmpresas()).filter(e => e.activo);
    setEmpresas(lista);
    let actual = getEmpresaActiva();
    if (actual && !lista.some(e => e.id === actual.id)) { clearEmpresaActiva(); actual = null; }
    if (!actual && lista.length === 1) { setEmpresaActiva(lista[0]); actual = getEmpresaActiva(); }
    setActiva(actual);
    if (lista.length === 0 && !location.pathname.startsWith('/empresas')) navigate('/empresas/nueva');
  }, [location.pathname, navigate]);

  useEffect(() => { cargarEmpresas(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function cambiarEmpresa(id) {
    const e = empresas.find(x => x.id === Number(id));
    if (!e) return;
    setEmpresaActiva(e);
    setActiva(getEmpresaActiva());
    navigate('/');
  }

  function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('nombre');
    navigate('/login');
  }

  const enEmpresas = location.pathname.startsWith('/empresas');
  const bloqueado = !activa && !enEmpresas;

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 px-6 py-2 flex flex-wrap items-center gap-4 shadow-sm">
        <div className="flex flex-col leading-tight">
          <span className="font-bold text-gray-800 text-base tracking-wide">DIANDRA</span>
          <span className="text-xs text-gray-500 uppercase tracking-widest">Recursos Humanos</span>
        </div>
        <div className={`ml-6 flex gap-4 flex-1 ${activa ? '' : 'pointer-events-none opacity-40'}`}>
          <NavLink to="/" end className={linkCls}>Empleados</NavLink>
          <NavLink to="/pagos" className={linkCls}>Pagos</NavLink>
          <NavLink to="/checador/mapeo" className={linkCls}>Checador</NavLink>
          <NavLink to="/formatos" className={linkCls}>Formatos</NavLink>
          <NavLink to="/cultura" className={linkCls}>Cultura</NavLink>
        </div>
        <div className="flex items-center gap-3">
          <NavLink to="/empresas" className={linkCls}>Empresas</NavLink>
          <select aria-label="Empresa activa" value={activa?.id || ''} onChange={e => cambiarEmpresa(e.target.value)}
            className="border border-gray-300 rounded px-2 py-1 text-sm max-w-56">
            <option value="" disabled>Elige empresa…</option>
            {(empresas || []).map(e => <option key={e.id} value={e.id}>{e.razon_social}</option>)}
          </select>
          <span className="text-sm text-gray-500">{nombre}</span>
          <button onClick={logout} className="text-xs text-red-500 hover:text-red-700 border border-red-200 rounded px-2 py-1">
            Cerrar sesión
          </button>
        </div>
      </nav>
      {activa && !enEmpresas && (
        <div className="bg-blue-50 border-b border-blue-100 px-6 py-1.5 text-sm text-blue-900">
          Empresa: <strong>{activa.razon_social}</strong>
        </div>
      )}
      <main className="max-w-6xl mx-auto p-6" key={activa?.id || 'sin-empresa'}>
        {bloqueado ? (
          <p className="text-gray-700">Elige una empresa en el selector de arriba para continuar.</p>
        ) : (
          <Routes>
            <Route path="/" element={<EmpleadosPage />} />
            <Route path="/empleados/nuevo" element={<EmpleadoFormPage />} />
            <Route path="/empleados/:id" element={<EmpleadoDetallePage />} />
            <Route path="/empleados/:id/editar" element={<EmpleadoFormPage />} />
            <Route path="/pagos" element={<PagosPage />} />
            <Route path="/checador/mapeo" element={<MapeoChecadorPage />} />
            <Route path="/formatos" element={<FormatosPage />} />
            <Route path="/salidas/:id" element={<SalidaDetailPage />} />
            <Route path="/cultura" element={<CulturePage />} />
            <Route path="/cultura/:culturaId" element={<CultureElementDetailPage />} />
            <Route path="/empresas" element={<EmpresasPage onCambio={cargarEmpresas} />} />
            <Route path="/empresas/nueva" element={<EmpresaFormPage onCambio={cargarEmpresas} />} />
            <Route path="/empresas/:id/editar" element={<EmpresaFormPage onCambio={cargarEmpresas} />} />
          </Routes>
        )}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/*" element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        } />
      </Routes>
    </BrowserRouter>
  );
}
```
`key={activa?.id}` en `<main>` remonta la página al cambiar de empresa, para que no quede en pantalla un expediente de la empresa anterior.

- [ ] **Step 7: Build**

Run: `cd ~/diandra/frontend && npm run build`
Expected: `✓ built`. Si `LoginPage.jsx` todavía importa `logo-ata.png`, el build pasa igual porque el archivo existe; lo quita Task 11.

- [ ] **Step 8: Prueba manual en local**

```bash
cd ~/diandra/backend && npm run dev   # en otra terminal: cd ~/diandra/frontend && npx vite
node scripts/create-admin.js Prueba123!   # una vez, DB local "diandra"
```
En http://localhost:5173, entrar con `admin@diandra.com / Prueba123!` y verificar:
1. Sin empresas, redirige a "Nueva empresa cliente".
2. Al dar de alta la empresa A, el selector la muestra y aparece la franja "Empresa: A".
3. Al dar de alta B y cambiar el selector a B, la lista de empleados queda vacía.
4. Al desactivar B desde Empresas, desaparece del selector.

- [ ] **Step 9: Commit**

```bash
cd ~/diandra && git add -A frontend && git commit -m "feat(frontend): empresa activa, selector y alta de empresas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Frontend — pantallas existentes, contrato precargado y marca

**Files:**
- Modify: `frontend/src/pages/EmpleadoDetallePage.jsx`, `frontend/src/components/GeneradorContratoModal.jsx`, `frontend/src/pages/CulturePage.jsx`, `frontend/src/api/culturas.js`, `frontend/src/pages/LoginPage.jsx`, `frontend/index.html`
- Delete: `frontend/src/assets/logo-ata.png`

**Interfaces:**
- Consumes: `getEmpresa(id)` y `getEmpresaActiva()` (Task 10), `GET /api/culturas` (Task 9), `POST /api/contratos/generar/:empleadoId` (Task 5).

- [ ] **Step 1: Cultura sin empresa fija**

En `~/diandra/frontend/src/api/culturas.js`, reemplazar la línea de `getCulturasByEmpresa` por:
```js
export const getCulturas = () => api.get('/culturas').then(r => r.data);
```
En `~/diandra/frontend/src/pages/CulturePage.jsx`:
- Cambiar `import { getCulturasByEmpresa, createCultura, deleteCultura } from '../api/culturas';` por `import { getCulturas, createCultura, deleteCultura } from '../api/culturas';`.
- Borrar la línea `const EMPRESA_ID = 1;`.
- Cambiar `getCulturasByEmpresa(EMPRESA_ID)` por `getCulturas()`.
- Cambiar `createCultura({ empresaId: EMPRESA_ID, ...form })` por `createCultura(form)`.

- [ ] **Step 2: Detalle de empleado — sin EMPRESA_ID ni app externa de contratos**

En `~/diandra/frontend/src/pages/EmpleadoDetallePage.jsx`:
- Borrar las líneas `const CONTRATOS_URL = …;` y `const EMPRESA_ID = 1;`.
- Agregar al bloque de imports:
```jsx
import GeneradorContratoModal from '../components/GeneradorContratoModal';
```
- Agregar junto a los demás `useState` del componente (debajo de `const [showBajaModal, setShowBajaModal] = useState(false);`):
```jsx
  const [showContrato, setShowContrato] = useState(false);
```
- En `handleSubmitBaja`, borrar la línea `empresaId: EMPRESA_ID,`.
- Reemplazar el `<a href={CONTRATOS_URL} …>📄 Generar contrato</a>` del header por:
```jsx
          <button onClick={() => setShowContrato(true)}
            className="bg-blue-700 text-white px-3 py-1.5 rounded text-sm hover:bg-blue-800 flex items-center gap-1">
            📄 Generar contrato
          </button>
```
- Reemplazar el `<a href={CONTRATOS_URL} …>Re-generar</a>` por:
```jsx
                            <button onClick={() => setShowContrato(true)}
                              className="text-purple-600 text-xs hover:underline border border-purple-300 rounded px-2 py-0.5">
                              Re-generar
                            </button>
```
- Reemplazar el `<a href={CONTRATOS_URL} …>Generar contrato</a>` de la fila de documentos por:
```jsx
                          <button onClick={() => setShowContrato(true)}
                            className="text-sm text-purple-700 hover:underline font-medium">
                            Generar contrato
                          </button>
```
- Justo antes del `</div>` que cierra el JSX que regresa el componente, agregar:
```jsx
      {showContrato && (
        <GeneradorContratoModal
          empleado={empleado}
          onClose={() => setShowContrato(false)}
          onSuccess={() => { getDocumentos(id).then(setDocumentos); }}
        />
      )}
```
- Verificar:
```bash
cd ~/diandra/frontend && grep -n "CONTRATOS_URL\|EMPRESA_ID\|4001" src/pages/*.jsx
```
Expected: sin resultados.

- [ ] **Step 3: Modal de contrato con datos del patrón precargados**

En `~/diandra/frontend/src/components/GeneradorContratoModal.jsx`:
- Cambiar `import { useState } from 'react';` por `import { useEffect, useState } from 'react';`.
- Agregar debajo de `import { generarContrato } from '../api/documentos';`:
```jsx
import { getEmpresa } from '../api/empresas';
import { getEmpresaActiva } from '../empresaActiva';
```
- Justo después de la declaración `const [prohibiciones, setProhibiciones] = useState(['']);`, agregar:
```jsx
  // Datos del patrón desde la empresa activa; editables por si algún contrato los requiere distintos.
  useEffect(() => {
    const activa = getEmpresaActiva();
    if (!activa) return;
    getEmpresa(activa.id).then(e => setForm(f => ({
      ...f,
      nombre_patron:     f.nombre_patron     || e.representante_legal || '',
      razon_social:      f.razon_social      || e.razon_social        || '',
      direccion_empresa: f.direccion_empresa || e.domicilio           || '',
      colonia_empresa:   f.colonia_empresa   || e.colonia             || '',
      cp_empresa:        f.cp_empresa        || e.cp                  || '',
      ciudad:            f.ciudad            || e.ciudad              || '',
      giro_empresa:      f.giro_empresa      || e.giro                || '',
    })));
  }, []);
```

- [ ] **Step 4: Marca en login y título**

En `~/diandra/frontend/src/pages/LoginPage.jsx`:
- Borrar la línea `import logoAta from '../assets/logo-ata.png';`.
- Reemplazar
```jsx
          <img src={logoAta} alt="Grupo ATA" className="h-16 object-contain mb-2" />
          <h1 className="font-bold text-gray-800 text-lg">Recursos Humanos</h1>
          <p className="text-xs text-gray-400 uppercase tracking-widest">Grupo ATA</p>
```
por
```jsx
          <h1 className="font-bold text-gray-800 text-2xl tracking-wide">DIANDRA</h1>
          <p className="text-xs text-gray-400 uppercase tracking-widest">Recursos Humanos</p>
```
- Cambiar `placeholder="admin@grupoata.com"` por `placeholder="correo@diandra.com"`.

En `~/diandra/frontend/index.html`, cambiar `<html lang="en">` por `<html lang="es">` y `<title>frontend</title>` por `<title>DIANDRA · Recursos Humanos</title>`.

```bash
cd ~/diandra/frontend && rm src/assets/logo-ata.png
grep -rniE "grupo ata|grupoata|logo-ata|logoAta|RH-ATA|\bATA\b" src index.html
```
Expected: sin resultados.

- [ ] **Step 5: Build y prueba manual**

Run: `cd ~/diandra/frontend && npm run build`
Expected: `✓ built`, sin errores.

Con backend y vite corriendo (Task 10, Step 8), verificar:
1. En el expediente de un empleado, "Generar contrato" abre el modal y en el paso 2 aparecen ya llenos el representante legal, la razón social y el domicilio de la empresa activa.
2. Al terminar el modal, el contrato aparece en Documentos y se descarga.
3. "Dar de baja colaborador" crea la salida y abre su checklist.
4. En Cultura, un elemento creado en A no aparece al cambiar a B.
5. El login dice "DIANDRA" y no hay logo de ATA.

- [ ] **Step 6: Commit**

```bash
cd ~/diandra && git add -A frontend && git commit -m "feat(frontend): contrato con datos de la empresa, cultura por empresa y marca DIANDRA

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Deploy en Hetzner

**Files:**
- Modify: `~/diandra/deploy.sh` (reemplazar)
- Server: `/home/apps/diandra/`, `/etc/nginx/sites-enabled/diandra`, ufw, PM2

**Interfaces:**
- Consumes: todo lo anterior. SSH siempre como `ssh -i ~/.ssh/id_ed25519 -o IdentitiesOnly=yes root@62.238.3.136`.

Estos pasos tocan el servidor de producción que comparten todos los proyectos. Cada comando de servidor necesita la aprobación del usuario en el momento.

- [ ] **Step 1: deploy.sh**

`~/diandra/deploy.sh` (reemplazar completo):
```bash
#!/bin/bash
set -e

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
SERVER="root@62.238.3.136"
SSH="ssh -i $HOME/.ssh/id_ed25519 -o IdentitiesOnly=yes"

echo "→ Construyendo frontend..."
cd "$ROOT_DIR/frontend"
npm run build

echo "→ Sincronizando backend (sin tocar uploads)..."
rsync -az --delete --chown=apps:apps -e "$SSH" \
  --exclude='uploads/' \
  --exclude='node_modules/' \
  --exclude='.env' \
  --exclude='tests/' \
  "$ROOT_DIR/backend/" $SERVER:/home/apps/diandra/backend/

echo "→ Sincronizando frontend dist..."
rsync -az --delete --chown=apps:apps -e "$SSH" \
  "$ROOT_DIR/frontend/dist/" $SERVER:/home/apps/diandra/frontend/dist/

echo "→ Instalando dependencias y reiniciando..."
$SSH $SERVER "cd /home/apps/diandra/backend && sudo -u apps npm install --omit=dev --silent && sudo -u apps pm2 restart diandra-backend"

echo "→ Verificando..."
sleep 2
$SSH $SERVER "sudo -u apps pm2 show diandra-backend | grep -E 'status|restarts'"
curl -fsS http://62.238.3.136:8098/api/health && echo

echo "✓ Deploy completado"
```
```bash
chmod +x ~/diandra/deploy.sh
```

- [ ] **Step 2: Carpeta, secretos y Postgres en el servidor**

```bash
ssh -i ~/.ssh/id_ed25519 -o IdentitiesOnly=yes root@62.238.3.136 'set -e
mkdir -p /home/apps/diandra/backend/uploads /home/apps/diandra/frontend/dist
cd /home/apps/diandra
if [ ! -f .env ]; then echo "DIANDRA_DB_PASSWORD=$(openssl rand -hex 24)" > .env; chmod 600 .env; fi
DBP=$(grep DIANDRA_DB_PASSWORD .env | cut -d= -f2)
if [ ! -f backend/.env ]; then
  cat > backend/.env <<EOF
PORT=3015
DB_HOST=localhost
DB_PORT=5445
DB_NAME=diandra
DB_USER=diandra_user
DB_PASSWORD=$DBP
UPLOADS_DIR=/home/apps/diandra/backend/uploads
JWT_SECRET=$(openssl rand -hex 24)
CORS_ORIGIN=http://62.238.3.136:8098
EOF
  chmod 600 backend/.env
fi
chown -R apps:apps /home/apps/diandra
ls -la /home/apps/diandra /home/apps/diandra/backend'
scp -i ~/.ssh/id_ed25519 -o IdentitiesOnly=yes ~/diandra/docker-compose.yml root@62.238.3.136:/home/apps/diandra/docker-compose.yml
ssh -i ~/.ssh/id_ed25519 -o IdentitiesOnly=yes root@62.238.3.136 'cd /home/apps/diandra && docker compose -p diandra up -d && sleep 3 && docker ps --filter name=diandra-postgres-1 --format "{{.Names}} {{.Ports}}"'
```
Expected: `diandra-postgres-1 127.0.0.1:5445->5432/tcp`. Ningún secreto se imprime en la salida.

- [ ] **Step 3: Primer sync de código y alta en PM2**

```bash
cd ~/diandra/frontend && npm run build
rsync -az --chown=apps:apps -e "ssh -i ~/.ssh/id_ed25519 -o IdentitiesOnly=yes" --exclude='uploads/' --exclude='node_modules/' --exclude='.env' --exclude='tests/' ~/diandra/backend/ root@62.238.3.136:/home/apps/diandra/backend/
rsync -az --chown=apps:apps -e "ssh -i ~/.ssh/id_ed25519 -o IdentitiesOnly=yes" ~/diandra/frontend/dist/ root@62.238.3.136:/home/apps/diandra/frontend/dist/
ssh -i ~/.ssh/id_ed25519 -o IdentitiesOnly=yes root@62.238.3.136 'cd /home/apps/diandra/backend && sudo -u apps npm install --omit=dev --silent && sudo -u apps pm2 start src/index.js --name diandra-backend && sudo -u apps pm2 save && sleep 2 && curl -s localhost:3015/api/health && sudo -u apps pm2 logs diandra-backend --lines 20 --nostream'
```
Expected: `{"ok":true}` y en el log `Migración aplicada: 013_multiempresa.sql` y `Backend DIANDRA corriendo en puerto 3015`.

- [ ] **Step 4: Nginx y firewall**

```bash
ssh -i ~/.ssh/id_ed25519 -o IdentitiesOnly=yes root@62.238.3.136 'set -e
[ -e /etc/nginx/sites-enabled/diandra ] && { echo "ya existe, revisar a mano"; exit 1; }
cat > /etc/nginx/sites-enabled/diandra <<'"'"'EOF'"'"'
server {
    listen 8098;
    server_name _;

    client_max_body_size 25M;

    root /home/apps/diandra/frontend/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api {
        proxy_pass http://localhost:3015;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 60s;
    }

    location /uploads {
        proxy_pass http://localhost:3015;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
EOF
nginx -t && systemctl reload nginx
ufw allow 8098/tcp'
curl -s -o /dev/null -w "front %{http_code}\n" http://62.238.3.136:8098/
curl -s http://62.238.3.136:8098/api/health
curl -s -o /dev/null -w "rhata %{http_code}\n" http://62.238.3.136/
```
Expected: `front 200`, `{"ok":true}`, `rhata 200`. RHATA no se ve afectada porque DIANDRA escucha en el 8098, sin `default_server`.

- [ ] **Step 5: Admin**

```bash
ssh -i ~/.ssh/id_ed25519 -o IdentitiesOnly=yes root@62.238.3.136 'cd /home/apps/diandra/backend && sudo -u apps node scripts/create-admin.js'
```
Expected: `Admin creado: admin@diandra.com / <contraseña>`. Guarda la contraseña en `~/.claude/projects/-home-alejandroayalag/memory/credentials.md` (fila DIANDRA) y entrégala al usuario. No va al repo.

- [ ] **Step 6: Probar deploy.sh de punta a punta**

Run: `cd ~/diandra && ./deploy.sh`
Expected: termina con `{"ok":true}` y `✓ Deploy completado`. Después, comprueba que `uploads/` sigue en el servidor: `ssh … 'ls -la /home/apps/diandra/backend/uploads'`.

- [ ] **Step 7: Prueba de humo en producción**

Con la API y la contraseña del Step 5:
```bash
B=http://62.238.3.136:8098/api
T=$(curl -s -X POST $B/auth/login -H 'Content-Type: application/json' -d '{"email":"admin@diandra.com","password":"<CONTRASEÑA>"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')
E=$(curl -s -X POST $B/empresas -H "Authorization: Bearer $T" -H 'Content-Type: application/json' -d '{"razon_social":"PRUEBA SMOKE","rfc":"PSM010101AB1"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["id"])')
curl -s -o /dev/null -w "empleados %{http_code}\n" -H "Authorization: Bearer $T" -H "X-Empresa-Id: $E" $B/empleados
curl -s -o /dev/null -w "sin empresa %{http_code}\n" -H "Authorization: Bearer $T" $B/empleados
curl -s -X PATCH $B/empresas/$E/activo -H "Authorization: Bearer $T" -H 'Content-Type: application/json' -d '{"activo":false}' > /dev/null
```
Expected: `empleados 200` y `sin empresa 400`. La empresa de prueba queda inactiva y no aparece en el selector.

Luego, en el navegador (http://62.238.3.136:8098), da de alta una empresa real de prueba, un empleado, sube un documento y descárgalo, y genera un contrato. Lo que creaste de prueba, desactívalo o bórralo al terminar.

- [ ] **Step 8: Memoria y registro**

- `project_diandra.md`: estado "fase 1 en producción", URL, rutas del servidor y pendientes (repo GitHub, dominio + HTTPS, respaldo de `uploads/`, logo, fase 2).
- `credentials.md`: fila DIANDRA (`admin@diandra.com` y contraseña). La de la DB y `JWT_SECRET` no se anotan, solo viven en el servidor.
- `~/proyectos.csv`: URL de producción y admin en la fila diandra.

- [ ] **Step 9: Commit**

```bash
cd ~/diandra && git add -A && git commit -m "chore: deploy.sh de DIANDRA para Hetzner

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
