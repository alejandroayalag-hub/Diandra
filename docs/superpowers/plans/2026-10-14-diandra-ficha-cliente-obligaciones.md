# DIANDRA Fase 2 — Ficha de cliente y obligaciones fiscales — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cada empresa cliente de Diana tiene ficha de identificación (persona física/moral, contacto, acta, CSF, facturación) y sus obligaciones fiscales, leídas de la CSF, aparecen en un calendario donde se marcan presentadas con acuse.

**Architecture:** Se extiende la tabla `empresas` (cliente = empresa) y se agregan `empresa_documentos`, `empresa_obligaciones` y `obligacion_cumplimientos`. Dos libs puras: `csf.js` (texto de CSF → obligaciones con regla) y `vencimientos.js` (regla → vencimientos calculados al vuelo, estados, calendario). Rutas del despacho bajo `/api/empresas/:id/...` y `/api/obligaciones` (sin `X-Empresa-Id`). Frontend: ficha en secciones y una página `/obligaciones`.

**Tech Stack:** Node 20, Express 5, pg 8, multer 2, pdf-parse 1.1.1 (ya instalado), jest 29 + supertest 7 contra Postgres real (`diandra_test`, puerto 5445), React 19 + Vite + Tailwind, axios.

**Spec:** `~/diandra/docs/superpowers/specs/2026-10-14-diandra-ficha-cliente-obligaciones-design.md`

## Global Constraints

- Repo `~/diandra/`. Pruebas backend: `docker compose up -d` en `~/diandra`, luego `cd ~/diandra/backend && npm test` (jest `--runInBand`).
- Rutas de archivo en BD **relativas a `UPLOADS_DIR`**, siempre vía `relativa()` / `absoluta()` de `src/lib/archivos.js`.
- Fechas de negocio como texto `'YYYY-MM-DD'`. Desde SQL se seleccionan con `::text` (nunca objetos `Date` de pg, para evitar corrimientos de zona). "Hoy" = zona `America/Mexico_City`.
- Empresas y obligaciones nunca se borran: solo se desactivan (`activo` / `activa = false`).
- Escritura solo roles `admin` y `rh` (`requireRole('admin', 'rh')`); lectura cualquier usuario autenticado.
- Rutas nuevas no usan `X-Empresa-Id`: el id del cliente va en la URL (`/api/empresas/:id/...`), igual que `/api/empresas`.
- Ningún archivo real de cliente (CSF, acta) entra a git. Las pruebas usan texto y PDFs sintéticos con RFC ficticio.
- No agregar dependencias nuevas.
- Textos de UI en español; marca "DIANDRA".

## Review Focus

1. **CSF de otro cliente subida por error.** Se espera un aviso claro, no obligaciones ajenas confirmadas en silencio. Se compara el RFC del cliente contra el texto de la CSF (Task 3, test "aviso si el RFC no coincide"; Task 4, test de ruta).
2. **Obligación dada de alta hoy pero vigente desde hace años en la CSF.** No deben aparecer cientos de "vencidas". El inicio efectivo es la fecha de alta en el sistema (Task 2, test "no genera vencimientos anteriores al alta").
3. **Vencimiento que cae en sábado/domingo o día 31 en un mes corto.** Se recorre al lunes o al último día del mes (Task 2, tests de fin de semana y de febrero).
4. **Doble clic en "Presentada" / mismo periodo dos veces.** Se responde 409 y el acuse subido no queda huérfano (Task 5, test 409 + archivo borrado).
5. **Subir una CSF nueva cuando Diana ya editó las obligaciones.** No se pierden sus ediciones ni el historial: las existentes conservan su regla; las que desaparecen se desactivan, no se borran (Task 4, test de reemplazo/desactivación).

---

## File Structure

Backend (`~/diandra/backend/`):
- Create `src/db/migrations/014_ficha_cliente.sql` — columnas de ficha + 3 tablas.
- Modify `src/models/empresa.js` — campos de ficha, `EmpresaDocumentoModel`.
- Modify `src/routes/empresas.js` — validación de ficha, documentos, CSF, obligaciones del cliente.
- Create `src/lib/vencimientos.js` — reglas → vencimientos, estado, calendario, validaciones (puro).
- Create `src/lib/csf.js` — texto de CSF → obligaciones; `leerCsf(buffer, rfc)`.
- Create `src/models/obligacion.js` — obligaciones y cumplimientos.
- Create `src/routes/obligaciones.js` — calendario, resumen, cumplimientos.
- Modify `src/app.js` — montar `/api/obligaciones`.
- Tests: modify `tests/integration/empresas.test.js`; create `tests/unit/vencimientos.test.js`, `tests/unit/csf.test.js`, `tests/fixtures/pdf.js`, `tests/fixtures/csf.js`, `tests/integration/clienteDocumentos.test.js`, `tests/integration/obligaciones.test.js`.

Frontend (`~/diandra/frontend/src/`):
- Modify `api/empresas.js`, `api/documentos.js` (extraer `abrirArchivo`); create `api/obligaciones.js`.
- Create `components/DocumentoCliente.jsx`, `components/ObligacionesCliente.jsx`.
- Rewrite `pages/EmpresaFormPage.jsx` (ficha en secciones).
- Create `pages/ObligacionesPage.jsx`.
- Modify `App.jsx` (nav, ruta, banner de resumen), `pages/EmpresasPage.jsx` (título "Clientes").

---

### Task 1: Migración y campos de ficha en empresas

**Files:**
- Create: `backend/src/db/migrations/014_ficha_cliente.sql`
- Modify: `backend/src/models/empresa.js`
- Modify: `backend/src/routes/empresas.js` (función `validar`)
- Test: `backend/tests/integration/empresas.test.js`

**Interfaces:**
- Produces: tablas `empresa_documentos`, `empresa_obligaciones`, `obligacion_cumplimientos` (esquema abajo); columnas nuevas de `empresas`: `tipo_persona`, `contacto_nombre`, `contacto_telefono`, `contacto_whatsapp`, `monto_facturacion`, `condiciones_pago`.

- [ ] **Step 1: Write the failing tests** — agregar al final de `tests/integration/empresas.test.js`:

```js
describe('ficha de cliente', () => {
  const ficha = {
    ...datos, tipo_persona: 'moral', contacto_nombre: 'Luis Ruiz', contacto_telefono: '4521234567',
    contacto_whatsapp: '4527654321', monto_facturacion: '3500.50', condiciones_pago: 'Mensual, primeros 5 días',
  };

  test('guarda y devuelve los campos de la ficha', async () => {
    const res = await api().post('/api/empresas').send(ficha);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      tipo_persona: 'moral', contacto_nombre: 'Luis Ruiz', contacto_whatsapp: '4527654321',
      monto_facturacion: '3500.50', condiciones_pago: 'Mensual, primeros 5 días',
    });
  });

  test('persona moral con RFC de 13 caracteres → 400', async () => {
    const res = await api().post('/api/empresas').send({ ...ficha, rfc: 'GOMA800101AB1' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/12/);
  });

  test('persona física con RFC de 12 caracteres → 400', async () => {
    const res = await api().post('/api/empresas').send({ ...ficha, tipo_persona: 'fisica' });
    expect(res.status).toBe(400);
  });

  test('tipo de persona inválido → 400', async () => {
    const res = await api().post('/api/empresas').send({ ...ficha, tipo_persona: 'otra' });
    expect(res.status).toBe(400);
  });

  test('monto negativo → 400; monto 0 se guarda como 0; vacío como null', async () => {
    expect((await api().post('/api/empresas').send({ ...ficha, monto_facturacion: '-5' })).status).toBe(400);
    const cero = await api().post('/api/empresas').send({ ...ficha, monto_facturacion: 0 });
    expect(cero.body.monto_facturacion).toBe('0.00');
    const vacio = await api().put(`/api/empresas/${cero.body.id}`).send({ ...ficha, monto_facturacion: '' });
    expect(vacio.body.monto_facturacion).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd ~/diandra/backend && npx jest tests/integration/empresas.test.js`
Expected: FAIL (`tipo_persona` undefined / la columna no existe).

- [ ] **Step 3: Write the migration** — `backend/src/db/migrations/014_ficha_cliente.sql`:

```sql
-- Fase 2: ficha de cliente (cliente = empresa) y obligaciones fiscales de la CSF.
ALTER TABLE empresas
  ADD COLUMN tipo_persona      VARCHAR(10) CHECK (tipo_persona IN ('fisica', 'moral')),
  ADD COLUMN contacto_nombre   VARCHAR(200),
  ADD COLUMN contacto_telefono VARCHAR(20),
  ADD COLUMN contacto_whatsapp VARCHAR(20),
  ADD COLUMN monto_facturacion NUMERIC(12,2) CHECK (monto_facturacion >= 0),
  ADD COLUMN condiciones_pago  TEXT;

CREATE TABLE empresa_documentos (
  id              SERIAL PRIMARY KEY,
  empresa_id      INTEGER NOT NULL REFERENCES empresas(id),
  tipo            VARCHAR(10) NOT NULL CHECK (tipo IN ('acta', 'csf')),
  archivo         VARCHAR(300) NOT NULL,   -- relativa a UPLOADS_DIR
  nombre_original VARCHAR(300),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_empresa_documentos_empresa ON empresa_documentos(empresa_id);

CREATE TABLE empresa_obligaciones (
  id                SERIAL PRIMARY KEY,
  empresa_id        INTEGER NOT NULL REFERENCES empresas(id),
  descripcion       TEXT NOT NULL,
  vencimiento_texto TEXT,
  periodicidad      VARCHAR(12) NOT NULL CHECK (periodicidad IN ('mensual', 'bimestral', 'trimestral', 'anual', 'manual')),
  dia               SMALLINT CHECK (dia BETWEEN 1 AND 31),
  mes               SMALLINT CHECK (mes BETWEEN 1 AND 12),
  fecha_inicio      DATE,
  fecha_fin         DATE,
  activa            BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (empresa_id, descripcion)
);

CREATE TABLE obligacion_cumplimientos (
  id                 SERIAL PRIMARY KEY,
  obligacion_id      INTEGER NOT NULL REFERENCES empresa_obligaciones(id),
  periodo            VARCHAR(7) NOT NULL,   -- '2026-09' | '2026-B5' | '2026-T3' | '2026'
  fecha_presentacion DATE NOT NULL,
  acuse              VARCHAR(300),          -- relativa a UPLOADS_DIR, opcional
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (obligacion_id, periodo)
);
```

- [ ] **Step 4: Update the model** — en `backend/src/models/empresa.js` reemplazar `CAMPOS` y los `data[c] || null`:

```js
const CAMPOS = ['razon_social', 'nombre_comercial', 'rfc', 'registro_patronal', 'representante_legal',
  'domicilio', 'colonia', 'cp', 'ciudad', 'giro',
  'tipo_persona', 'contacto_nombre', 'contacto_telefono', 'contacto_whatsapp', 'monto_facturacion', 'condiciones_pago'];

// '' y undefined → NULL; 0 se conserva (monto_facturacion puede ser 0).
const valor = v => (v === '' || v === undefined ? null : v);
```

En `create`: `const values = CAMPOS.map(c => valor(data[c]));`
En `update`: `[...fields.map(f => valor(data[f])), id]`

- [ ] **Step 5: Update validation** — en `backend/src/routes/empresas.js` reemplazar `validar`:

```js
function validar(body) {
  if (!String(body.razon_social || '').trim()) return 'La razón social es obligatoria';
  const rfc = normalizarRfc(body.rfc);
  if (!rfc) return 'RFC inválido (12 caracteres persona moral, 13 persona física)';
  if (body.tipo_persona && !['fisica', 'moral'].includes(body.tipo_persona)) return 'Tipo de persona inválido';
  if (body.tipo_persona === 'moral' && rfc.length !== 12) return 'Persona moral: el RFC lleva 12 caracteres';
  if (body.tipo_persona === 'fisica' && rfc.length !== 13) return 'Persona física: el RFC lleva 13 caracteres';
  const monto = body.monto_facturacion;
  if (monto !== undefined && monto !== null && monto !== '' && !(Number(monto) >= 0)) return 'Monto de facturación inválido';
  return null;
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd ~/diandra/backend && npm test`
Expected: PASS, toda la suite (55 previas + 5 nuevas).

- [ ] **Step 7: Commit**

```bash
cd ~/diandra && git add backend/src/db/migrations/014_ficha_cliente.sql backend/src/models/empresa.js backend/src/routes/empresas.js backend/tests/integration/empresas.test.js
git commit -m "feat: campos de ficha de cliente y tablas de obligaciones"
```

---

### Task 2: Cálculo de vencimientos (lib pura)

**Files:**
- Create: `backend/src/lib/vencimientos.js`
- Test: `backend/tests/unit/vencimientos.test.js`

**Interfaces:**
- Consumes: objetos obligación `{ id, empresa_id, razon_social?, descripcion, periodicidad, dia, mes, fecha_inicio, fecha_fin, alta }`, con todas las fechas como `'YYYY-MM-DD'` o `null`. `alta` = `created_at::date`.
- Produces:
  - `vencimientos(ob, hasta) → [{ periodo, fecha_vence }]`
  - `estado(fechaVence, presentada, hoy) → 'presentada' | 'vencida' | 'proxima' | 'pendiente'`
  - `armarCalendario(obligaciones, cumplimientos, { desde, hasta, hoy }) → [{ obligacion_id, empresa_id, razon_social, descripcion, periodo, fecha_vence, estado, cumplimiento_id, fecha_presentacion, tiene_acuse }]`. Los cumplimientos son `{ id, obligacion_id, periodo, fecha_presentacion, acuse }`.
  - `validarObligaciones(lista) → string | null`
  - `periodoValido(periodicidad, periodo) → boolean`
  - `hoyMx() → 'YYYY-MM-DD'`, `sumarDias(fecha, n)`, `finDeMes(fecha, mesesAdelante)`
  - `PERIODICIDADES` (array)

- [ ] **Step 1: Write the failing tests** — `backend/tests/unit/vencimientos.test.js`:

```js
const {
  vencimientos, estado, armarCalendario, validarObligaciones, periodoValido, sumarDias, finDeMes,
} = require('../../src/lib/vencimientos');

const base = { id: 1, empresa_id: 1, razon_social: 'ACME', descripcion: 'IVA mensual', periodicidad: 'mensual',
  dia: 17, mes: null, fecha_inicio: '2022-01-01', fecha_fin: null, alta: '2026-10-14' };

describe('vencimientos', () => {
  test('mensual día 17: desde el alta, sábado 17-oct se recorre al lunes 19', () => {
    expect(vencimientos(base, '2026-12-31')).toEqual([
      { periodo: '2026-09', fecha_vence: '2026-10-19' },
      { periodo: '2026-10', fecha_vence: '2026-11-17' },
      { periodo: '2026-11', fecha_vence: '2026-12-17' },
    ]);
  });

  test('no genera vencimientos anteriores al alta aunque la CSF diga 2014', () => {
    const r = vencimientos({ ...base, fecha_inicio: '2014-07-28' }, '2026-10-31');
    expect(r).toEqual([{ periodo: '2026-09', fecha_vence: '2026-10-19' }]);
  });

  test('día 31: último día del mes; febrero 2027 domingo 28 → lunes 1-mar', () => {
    const r = vencimientos({ ...base, dia: 31, alta: '2027-01-01' }, '2027-03-05');
    expect(r).toEqual([
      { periodo: '2026-12', fecha_vence: '2027-02-01' },   // 31-ene-2027 es domingo
      { periodo: '2027-01', fecha_vence: '2027-03-01' },
    ]);
  });

  test('fecha_inicio posterior al alta: empieza en el periodo de inicio', () => {
    const r = vencimientos({ ...base, fecha_inicio: '2026-11-01' }, '2026-12-31');
    expect(r).toEqual([{ periodo: '2026-11', fecha_vence: '2026-12-17' }]);
  });

  test('fecha_fin corta los periodos posteriores', () => {
    const r = vencimientos({ ...base, fecha_fin: '2026-10-31' }, '2027-03-31');
    expect(r.map(v => v.periodo)).toEqual(['2026-09', '2026-10']);
  });

  test('bimestral: bimestre sep-oct vence 17-nov', () => {
    const r = vencimientos({ ...base, periodicidad: 'bimestral' }, '2026-12-31');
    expect(r).toEqual([{ periodo: '2026-B5', fecha_vence: '2026-11-17' }]);
  });

  test('trimestral: trimestre jul-sep vence 17-oct (sábado) → 19-oct', () => {
    const r = vencimientos({ ...base, periodicidad: 'trimestral' }, '2026-12-31');
    expect(r).toEqual([{ periodo: '2026-T3', fecha_vence: '2026-10-19' }]);
  });

  test('anual persona moral: ejercicio 2026 vence 31-mar-2027', () => {
    const r = vencimientos({ ...base, periodicidad: 'anual', dia: 31, mes: 3 }, '2027-12-31');
    expect(r).toEqual([{ periodo: '2026', fecha_vence: '2027-03-31' }]);
  });

  test('anual persona física: abril día 31 → 30-abr', () => {
    const r = vencimientos({ ...base, periodicidad: 'anual', dia: 31, mes: 4 }, '2027-12-31');
    expect(r).toEqual([{ periodo: '2026', fecha_vence: '2027-04-30' }]);
  });

  test('manual o sin día: no genera nada', () => {
    expect(vencimientos({ ...base, periodicidad: 'manual', dia: null }, '2027-12-31')).toEqual([]);
    expect(vencimientos({ ...base, dia: null }, '2027-12-31')).toEqual([]);
    expect(vencimientos({ ...base, periodicidad: 'anual', mes: null }, '2027-12-31')).toEqual([]);
  });
});

describe('estado', () => {
  test('presentada gana; vencida si ya pasó; próxima ≤ 7 días; si no, pendiente', () => {
    expect(estado('2026-10-01', true, '2026-11-01')).toBe('presentada');
    expect(estado('2026-10-31', false, '2026-11-01')).toBe('vencida');
    expect(estado('2026-11-01', false, '2026-11-01')).toBe('proxima');
    expect(estado('2026-11-08', false, '2026-11-01')).toBe('proxima');
    expect(estado('2026-11-09', false, '2026-11-01')).toBe('pendiente');
  });
});

describe('armarCalendario', () => {
  const cumpl = [{ id: 5, obligacion_id: 1, periodo: '2026-09', fecha_presentacion: '2026-10-15', acuse: 'a.pdf' }];

  test('incluye lo vencido anterior a "desde" pero no lo ya presentado', () => {
    const r = armarCalendario([base], cumpl, { desde: '2026-11-01', hasta: '2026-12-31', hoy: '2026-11-20' });
    expect(r.map(i => [i.periodo, i.estado])).toEqual([['2026-10', 'vencida'], ['2026-11', 'pendiente']]);
  });

  test('marca presentada con datos del cumplimiento', () => {
    const r = armarCalendario([base], cumpl, { desde: '2026-10-01', hasta: '2026-10-31', hoy: '2026-10-20' });
    expect(r).toEqual([expect.objectContaining({
      periodo: '2026-09', estado: 'presentada', cumplimiento_id: 5, fecha_presentacion: '2026-10-15', tiene_acuse: true,
    })]);
  });

  test('ordena por fecha y luego por cliente', () => {
    const otra = { ...base, id: 2, empresa_id: 2, razon_social: 'AAA' };
    const r = armarCalendario([base, otra], [], { desde: '2026-11-01', hasta: '2026-11-30', hoy: '2026-11-01' });
    expect(r.map(i => i.razon_social)).toEqual(['AAA', 'ACME']);
  });
});

describe('validaciones y fechas', () => {
  test('validarObligaciones', () => {
    expect(validarObligaciones([{ descripcion: 'IVA', periodicidad: 'mensual', dia: 17 }])).toBeNull();
    expect(validarObligaciones([{ descripcion: 'Rara', periodicidad: 'manual' }])).toBeNull();
    expect(validarObligaciones('x')).toMatch(/lista/);
    expect(validarObligaciones([{ descripcion: ' ', periodicidad: 'mensual', dia: 17 }])).toMatch(/descripción/);
    expect(validarObligaciones([{ descripcion: 'IVA', periodicidad: 'diaria', dia: 1 }])).toMatch(/Periodicidad/);
    expect(validarObligaciones([{ descripcion: 'IVA', periodicidad: 'mensual', dia: 32 }])).toMatch(/Día/);
    expect(validarObligaciones([{ descripcion: 'Anual', periodicidad: 'anual', dia: 31 }])).toMatch(/Mes/);
    expect(validarObligaciones([
      { descripcion: 'IVA', periodicidad: 'mensual', dia: 17 }, { descripcion: 'IVA ', periodicidad: 'mensual', dia: 17 },
    ])).toMatch(/repetida/);
  });

  test('periodoValido', () => {
    expect(periodoValido('mensual', '2026-09')).toBe(true);
    expect(periodoValido('mensual', '2026-13')).toBe(false);
    expect(periodoValido('bimestral', '2026-B6')).toBe(true);
    expect(periodoValido('trimestral', '2026-T5')).toBe(false);
    expect(periodoValido('anual', '2026')).toBe(true);
    expect(periodoValido('manual', '2026')).toBe(false);
    expect(periodoValido('mensual', undefined)).toBe(false);
  });

  test('sumarDias y finDeMes', () => {
    expect(sumarDias('2026-12-28', 7)).toBe('2027-01-04');
    expect(finDeMes('2026-12-15', 0)).toBe('2026-12-31');
    expect(finDeMes('2026-12-15', 2)).toBe('2027-02-28');
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `cd ~/diandra/backend && npx jest tests/unit/vencimientos.test.js`
Expected: FAIL "Cannot find module '../../src/lib/vencimientos'".

- [ ] **Step 3: Implement** — `backend/src/lib/vencimientos.js`:

```js
// Vencimientos calculados al vuelo a partir de la regla de cada obligación.
// Todas las fechas son texto 'YYYY-MM-DD' y se operan en UTC: sin zonas horarias de por medio.

const PERIODICIDADES = ['mensual', 'bimestral', 'trimestral', 'anual', 'manual'];
const MESES_POR_PERIODO = { mensual: 1, bimestral: 2, trimestral: 3, anual: 12 };
const PERIODO_RE = {
  mensual: /^\d{4}-(0[1-9]|1[0-2])$/, bimestral: /^\d{4}-B[1-6]$/, trimestral: /^\d{4}-T[1-4]$/, anual: /^\d{4}$/,
};

const iso = d => d.toISOString().slice(0, 10);
const utc = (anio, mes0, dia) => new Date(Date.UTC(anio, mes0, dia)); // Date.UTC normaliza meses > 11
const partes = f => [Number(f.slice(0, 4)), Number(f.slice(5, 7)) - 1, Number(f.slice(8, 10))];

// ponytail: Date.now() (no new Date()) para que las pruebas fijen "hoy" con jest.spyOn(Date, 'now').
const hoyMx = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(Date.now());
const sumarDias = (f, n) => { const [a, m, d] = partes(f); return iso(utc(a, m, d + n)); };
const finDeMes = (f, mesesAdelante) => { const [a, m] = partes(f); return iso(utc(a, m + mesesAdelante + 1, 0)); };

// Día N del mes (o el último si no existe); sábado/domingo → lunes.
// ponytail: sin días festivos oficiales; agregar tabla de inhábiles si Diana la necesita.
function fechaVence(anio, mes0, dia) {
  const ultimo = utc(anio, mes0 + 1, 0).getUTCDate();
  const f = utc(anio, mes0, Math.min(dia, ultimo));
  const dow = f.getUTCDay();
  if (dow === 6) f.setUTCDate(f.getUTCDate() + 2);
  if (dow === 0) f.setUTCDate(f.getUTCDate() + 1);
  return iso(f);
}

function etiqueta(periodicidad, anio, idx) {
  if (periodicidad === 'mensual') return `${anio}-${String(idx + 1).padStart(2, '0')}`;
  if (periodicidad === 'bimestral') return `${anio}-B${idx + 1}`;
  if (periodicidad === 'trimestral') return `${anio}-T${idx + 1}`;
  return String(anio);
}

// Periodos cuyo vencimiento cae entre el alta en el sistema y `hasta`.
// El alta como inicio evita cientos de "vencidas" de clientes con años en el SAT.
function vencimientos(ob, hasta) {
  const n = MESES_POR_PERIODO[ob.periodicidad];
  if (!n || !ob.dia || (n === 12 && !ob.mes)) return [];
  // Un periodo de antes de (año de alta − 1) no puede vencer después del alta.
  const anioInicio = Math.max(Number((ob.fecha_inicio || ob.alta).slice(0, 4)), Number(ob.alta.slice(0, 4)) - 1);
  const out = [];
  for (let anio = anioInicio; ; anio++) {
    for (let idx = 0; idx < 12 / n; idx++) {
      const mes0 = idx * n;
      const inicioPeriodo = iso(utc(anio, mes0, 1));
      const finPeriodo = iso(utc(anio, mes0 + n, 0));
      const vence = n === 12 ? fechaVence(anio + 1, ob.mes - 1, ob.dia) : fechaVence(anio, mes0 + n, ob.dia);
      if (vence > hasta) return out;
      if (ob.fecha_fin && inicioPeriodo > ob.fecha_fin) return out;
      if (ob.fecha_inicio && finPeriodo < ob.fecha_inicio) continue;
      if (vence < ob.alta) continue;
      out.push({ periodo: etiqueta(ob.periodicidad, anio, idx), fecha_vence: vence });
    }
  }
}

function estado(fechaVence, presentada, hoy) {
  if (presentada) return 'presentada';
  if (fechaVence < hoy) return 'vencida';
  if (fechaVence <= sumarDias(hoy, 7)) return 'proxima';
  return 'pendiente';
}

// Vencimientos en [desde, hasta] más todo lo vencido sin presentar, ordenados por fecha y cliente.
function armarCalendario(obligaciones, cumplimientos, { desde, hasta, hoy }) {
  const hechos = new Map(cumplimientos.map(c => [`${c.obligacion_id}|${c.periodo}`, c]));
  const out = [];
  for (const ob of obligaciones) {
    for (const v of vencimientos(ob, hasta)) {
      const c = hechos.get(`${ob.id}|${v.periodo}`);
      const est = estado(v.fecha_vence, !!c, hoy);
      if (v.fecha_vence < desde && est !== 'vencida') continue;
      out.push({
        obligacion_id: ob.id, empresa_id: ob.empresa_id, razon_social: ob.razon_social, descripcion: ob.descripcion,
        periodo: v.periodo, fecha_vence: v.fecha_vence, estado: est,
        cumplimiento_id: c ? c.id : null, fecha_presentacion: c ? c.fecha_presentacion : null, tiene_acuse: !!(c && c.acuse),
      });
    }
  }
  return out.sort((a, b) => a.fecha_vence.localeCompare(b.fecha_vence) || String(a.razon_social).localeCompare(String(b.razon_social)));
}

const entero = (v, min, max) => Number.isInteger(Number(v)) && Number(v) >= min && Number(v) <= max && v !== null && v !== '';

function validarObligaciones(lista) {
  if (!Array.isArray(lista)) return 'obligaciones debe ser una lista';
  const vistas = new Set();
  for (const o of lista) {
    const d = String((o && o.descripcion) || '').trim();
    if (!d) return 'Cada obligación necesita descripción';
    if (vistas.has(d)) return `Obligación repetida: ${d}`;
    vistas.add(d);
    if (!PERIODICIDADES.includes(o.periodicidad)) return `Periodicidad inválida en "${d}"`;
    if (o.periodicidad !== 'manual' && !entero(o.dia, 1, 31)) return `Día de vencimiento inválido en "${d}"`;
    if (o.periodicidad === 'anual' && !entero(o.mes, 1, 12)) return `Mes de vencimiento inválido en "${d}"`;
  }
  return null;
}

const periodoValido = (periodicidad, periodo) => !!(PERIODO_RE[periodicidad] && PERIODO_RE[periodicidad].test(String(periodo || '')));

module.exports = {
  PERIODICIDADES, vencimientos, estado, armarCalendario, validarObligaciones, periodoValido, hoyMx, sumarDias, finDeMes,
};
```

- [ ] **Step 4: Run to verify pass**

Run: `cd ~/diandra/backend && npx jest tests/unit/vencimientos.test.js`
Expected: PASS. Si falla una fecha esperada, verifica el día de la semana con `node -e 'console.log(new Date("2027-01-31T00:00:00Z").getUTCDay())'` antes de tocar la lógica: el test documenta la regla.

- [ ] **Step 5: Commit**

```bash
cd ~/diandra && git add backend/src/lib/vencimientos.js backend/tests/unit/vencimientos.test.js
git commit -m "feat: cálculo de vencimientos de obligaciones fiscales"
```

---

### Task 3: Lectura de CSF (lib)

**Files:**
- Create: `backend/src/lib/csf.js`
- Create: `backend/tests/fixtures/csf.js` (líneas de texto como las entrega pdf-parse en una CSF real, con RFC ficticio)
- Create: `backend/tests/fixtures/pdf.js` (generador de PDF mínimo con texto)
- Test: `backend/tests/unit/csf.test.js`

**Interfaces:**
- Produces:
  - `parseCsfText(texto) → [{ descripcion, vencimiento_texto, periodicidad, dia, mes, fecha_inicio, fecha_fin }]` (fechas `'YYYY-MM-DD'` o `null`)
  - `clasificar(vencimientoTexto) → { periodicidad, dia, mes }`
  - `leerCsf(buffer, rfcCliente) → Promise<{ obligaciones, aviso }>` (`aviso`: string o `null`; nunca lanza error por un PDF ilegible)
  - Fixtures: `CSF_LINEAS` (array de strings, RFC `AUR010101AB1`), `pdfConLineas(lineas) → Buffer`

Contexto: en la CSF real, pdf-parse pega palabras ("Amástardareldía17delmesinmediato") y pega la descripción con el vencimiento ("…salariosAmástardar…"). La fecha de inicio va en su propia línea. Las obligaciones terminan en "Sus datos personales…" (también pegado: "Susdatospersonales").

- [ ] **Step 1: Create fixtures**

`backend/tests/fixtures/csf.js`:

```js
// Texto como lo devuelve pdf-parse para una CSF real (estructura copiada de una de septiembre 2026; datos ficticios).
const CSF_LINEAS = [
  'CONSTANCIA DE SITUACIÓN FISCAL',
  'Página 2 de 3',
  'Regímenes:',
  'RégimenFecha InicioFecha Fin',
  'Régimen General de Ley Personas Morales01/01/2022',
  'Obligaciones:',
  'Descripción de la Obligación Descripción VencimientoFecha InicioFecha Fin',
  'Declaración de proveedores de IVAA mástardarelúltimodíadelmesinmediato',
  'posterioral periodoquecorresponda.',
  '28/07/2014',
  'Entero de retenciones mensuales de ISR por sueldos y salariosAmástardareldía17delmesinmediato',
  'posterioral periodoquecorresponda.',
  '28/07/2014',
  'Pago provisional mensual de ISR personas morales régimen',
  'general',
  'Amástardareldía17delmesinmediato',
  'posterioral periodoquecorresponda.',
  '01/01/2022',
  'Declaración anual de ISR del ejercicio Personas morales.Dentrodelostresmesessiguientesalcierre',
  'delejercicio.',
  '01/01/2022',
  'Pago definitivo mensual de IVA.Amástardareldía17delmesinmediato',
  'posterioral periodoquecorresponda.',
  '01/01/2022 31/12/2030',
  'Susdatospersonalessonincorporadosy protegidosenlossistemasdelSAT',
  'CadenaOriginalSello:',
  '||2026/09/01 17:55:35|AUR010101AB1|CONSTANCIA DE SITUACIÓN FISCAL',
];

module.exports = { CSF_LINEAS };
```

`backend/tests/fixtures/pdf.js`:

```js
// PDF mínimo de una página (Helvetica, WinAnsi) con un renglón por línea, para probar subidas de CSF.
function pdfConLineas(lineas) {
  const esc = s => s.replace(/[\\()]/g, m => `\\${m}`);
  const stream = `BT /F1 6 Tf 12 TL 20 820 Td\n${lineas.map(l => `(${esc(l)}) '`).join('\n')}\nET`;
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = objs.map((o, i) => {
    const off = Buffer.byteLength(pdf, 'latin1');
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
    return off;
  });
  const xref = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

module.exports = { pdfConLineas };
```

- [ ] **Step 2: Write the failing tests** — `backend/tests/unit/csf.test.js`:

```js
const { parseCsfText, clasificar, leerCsf } = require('../../src/lib/csf');
const { CSF_LINEAS } = require('../fixtures/csf');
const { pdfConLineas } = require('../fixtures/pdf');

describe('parseCsfText', () => {
  test('lee las 5 obligaciones de una CSF real de persona moral', () => {
    const r = parseCsfText(CSF_LINEAS.join('\n'));
    expect(r.map(o => [o.descripcion, o.periodicidad, o.dia, o.mes, o.fecha_inicio, o.fecha_fin])).toEqual([
      ['Declaración de proveedores de IVA', 'mensual', 31, null, '2014-07-28', null],
      ['Entero de retenciones mensuales de ISR por sueldos y salarios', 'mensual', 17, null, '2014-07-28', null],
      ['Pago provisional mensual de ISR personas morales régimen general', 'mensual', 17, null, '2022-01-01', null],
      ['Declaración anual de ISR del ejercicio Personas morales', 'anual', 31, 3, '2022-01-01', null],
      ['Pago definitivo mensual de IVA', 'mensual', 17, null, '2022-01-01', '2030-12-31'],
    ]);
    expect(r[1].vencimiento_texto).toMatch(/^Amástardareldía17/);
  });

  test('sin sección de obligaciones → []', () => {
    expect(parseCsfText('CONSTANCIA\nRégimen 01/01/2022')).toEqual([]);
  });

  test('renglón sin vencimiento reconocible → descripción completa y manual', () => {
    const r = parseCsfText('Obligaciones:\nAviso de algo raro.Conformealaley.\n01/01/2022\nSus datos personales');
    expect(r).toEqual([{ descripcion: 'Aviso de algo raro.Conformealaley', vencimiento_texto: '',
      periodicidad: 'manual', dia: null, mes: null, fecha_inicio: '2022-01-01', fecha_fin: null }]);
  });
});

describe('clasificar', () => {
  test.each([
    ['A más tardar el día 17 del mes inmediato posterior al bimestre que corresponda.', 'bimestral', 17, null],
    ['A más tardar el día 17 del mes inmediato posterior al trimestre.', 'trimestral', 17, null],
    ['Se presenta en el mes de abril del ejercicio siguiente.', 'anual', 31, 4],
    ['A más tardar el 31 de marzo del ejercicio siguiente.', 'anual', 31, 3],
    ['Dentrodelostresmesessiguientesalcierredelejercicio.', 'anual', 31, 3],
    ['Amástardarelúltimodíadelmesinmediatoposterioral periodo', 'mensual', 31, null],
    ['Cuando se realice el acto.', 'manual', null, null],
  ])('%s', (texto, periodicidad, dia, mes) => {
    expect(clasificar(texto)).toEqual({ periodicidad, dia, mes });
  });
});

describe('leerCsf', () => {
  test('lee un PDF con texto y no avisa si el RFC coincide', async () => {
    const r = await leerCsf(pdfConLineas(CSF_LINEAS), 'AUR010101AB1');
    expect(r.aviso).toBeNull();
    expect(r.obligaciones).toHaveLength(5);
  });

  test('aviso si el RFC no coincide', async () => {
    const r = await leerCsf(pdfConLineas(CSF_LINEAS), 'XYZ010101AB1');
    expect(r.aviso).toMatch(/XYZ010101AB1/);
    expect(r.obligaciones).toHaveLength(5);
  });

  test('PDF sin texto (escaneado) → aviso, sin error', async () => {
    const r = await leerCsf(pdfConLineas([]), 'AUR010101AB1');
    expect(r).toEqual({ obligaciones: [], aviso: expect.stringMatching(/texto legible/) });
  });

  test('archivo que no es PDF → aviso, sin error', async () => {
    const r = await leerCsf(Buffer.from('no soy pdf'), 'AUR010101AB1');
    expect(r).toEqual({ obligaciones: [], aviso: expect.stringMatching(/No se pudo leer/) });
  });
});
```

- [ ] **Step 3: Run to verify fail**

Run: `cd ~/diandra/backend && npx jest tests/unit/csf.test.js`
Expected: FAIL "Cannot find module '../../src/lib/csf'".

- [ ] **Step 4: Implement** — `backend/src/lib/csf.js`:

```js
const pdfParse = require('pdf-parse');

// La CSF del SAT, leída con pdf-parse, pega palabras ("Amástardareldía17delmesinmediato") y une la
// descripción con el vencimiento ("…salariosAmástardar…"). Por eso la clasificación usa texto sin espacios.

const MESES = { enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8,
  septiembre: 9, octubre: 10, noviembre: 11, diciembre: 12 };
const MANUAL = { periodicidad: 'manual', dia: null, mes: null };
// Inicio del texto de vencimiento, con espacios opcionales entre palabras.
const INICIO_VENC = /A\s*m[aá]s\s*tardar|Dentro\s*de|Se\s*presenta|En\s*el\s*mes/i;
const FILA = /(.+?)\s*(\d{2})\/(\d{2})\/(\d{4})(?:\s*(\d{2})\/(\d{2})\/(\d{4}))?/g;
const RUIDO = /Descripci[oó]n\s*de\s*la\s*Obligaci[oó]n|P[aá]gina\s*\[?\d+\]?\s*de\s*\[?\d+/i;

function clasificar(vencimiento) {
  const t = vencimiento.toLowerCase().replace(/\s+/g, '');
  if (t.includes('ejercicio')) {
    const nombre = Object.keys(MESES).find(m => t.includes(m));
    const mes = nombre ? MESES[nombre] : t.includes('tresmeses') ? 3 : null;
    if (!mes) return { ...MANUAL };
    const dia = nombre && Number((t.match(new RegExp(`(\\d{1,2})de${nombre}`)) || [])[1]);
    return { periodicidad: 'anual', dia: dia || 31, mes };
  }
  if (t.includes('mesinmediatoposterior')) {
    const dia = /[uú]ltimod[ií]a/.test(t) ? 31 : Number((t.match(/d[ií]a(\d{1,2})/) || [])[1]);
    if (!dia) return { ...MANUAL };
    const periodicidad = t.includes('bimestre') ? 'bimestral' : t.includes('trimestre') ? 'trimestral' : 'mensual';
    return { periodicidad, dia, mes: null };
  }
  return { ...MANUAL };
}

function parseCsfText(texto) {
  const ini = texto.search(/Obligaciones:/i);
  if (ini < 0) return [];
  let seccion = texto.slice(ini).replace(/^Obligaciones:/i, '');
  const fin = seccion.search(/Sus\s*datos\s*personales|Cadena\s*Original/i);
  if (fin >= 0) seccion = seccion.slice(0, fin);
  const plano = seccion.split('\n').filter(l => !RUIDO.test(l)).join(' ').replace(/\s+/g, ' ');

  return [...plano.matchAll(FILA)].map(m => {
    const fila = m[1].trim();
    const corte = fila.search(INICIO_VENC);
    const descripcion = (corte > 0 ? fila.slice(0, corte) : fila).trim().replace(/\.$/, '');
    const vencimiento = corte > 0 ? fila.slice(corte).trim() : '';
    return {
      descripcion, vencimiento_texto: vencimiento, ...clasificar(vencimiento),
      fecha_inicio: `${m[4]}-${m[3]}-${m[2]}`, fecha_fin: m[5] ? `${m[7]}-${m[6]}-${m[5]}` : null,
    };
  });
}

// Nunca lanza por un PDF malo: devuelve aviso para que Diana capture a mano.
async function leerCsf(buffer, rfcCliente) {
  let texto;
  try {
    texto = (await pdfParse(buffer)).text || '';
  } catch {
    return { obligaciones: [], aviso: 'No se pudo leer el PDF. Captura las obligaciones a mano.' };
  }
  if (!texto.trim()) {
    return { obligaciones: [], aviso: 'La CSF no tiene texto legible (¿es escaneada?). Descarga la del portal del SAT o captura a mano.' };
  }
  const obligaciones = parseCsfText(texto);
  const avisos = [];
  if (!obligaciones.length) avisos.push('No se encontraron obligaciones en la CSF; captúralas a mano.');
  if (rfcCliente && !texto.replace(/\s+/g, '').toUpperCase().includes(rfcCliente.toUpperCase())) {
    avisos.push(`Esta CSF no parece ser del RFC del cliente (${rfcCliente}). Revisa el archivo antes de confirmar.`);
  }
  return { obligaciones, aviso: avisos.join(' ') || null };
}

module.exports = { parseCsfText, clasificar, leerCsf };
```

- [ ] **Step 5: Run to verify pass**

Run: `cd ~/diandra/backend && npx jest tests/unit/csf.test.js`
Expected: PASS. Si falla un test de `leerCsf` con el PDF sintético, imprime el texto (`console.log((await require('pdf-parse')(pdfConLineas(CSF_LINEAS))).text)`) y corrige el generador del fixture. El parser se ajusta solo si el texto difiere de lo que da la CSF real.

- [ ] **Step 6: Validate against the real CSF (local only, never commit it)**

Run:
```bash
cd ~/diandra/backend && node -e '
const { leerCsf } = require("./src/lib/csf");
leerCsf(require("fs").readFileSync(process.env.HOME + "/Downloads/Csf_ASM1407281I5-Septiembre 2026.pdf"), "ASM1407281I5")
  .then(r => console.log(JSON.stringify(r, null, 1)));'
```
Expected: 5 obligaciones (proveedores IVA mensual 31; retenciones ISR sueldos mensual 17; pago provisional ISR PM mensual 17; anual ISR PM anual 31/3; IVA definitivo mensual 17) y `aviso: null`.

- [ ] **Step 7: Commit**

```bash
cd ~/diandra && git add backend/src/lib/csf.js backend/tests/unit/csf.test.js backend/tests/fixtures/
git commit -m "feat: lectura de obligaciones desde la CSF"
```

---

### Task 4: Documentos del cliente, subida de CSF y confirmación de obligaciones

**Files:**
- Modify: `backend/src/models/empresa.js` (agregar `EmpresaDocumentoModel`)
- Create: `backend/src/models/obligacion.js`
- Modify: `backend/src/routes/empresas.js`
- Test: `backend/tests/integration/clienteDocumentos.test.js`

**Interfaces:**
- Consumes: `leerCsf(buffer, rfc)` (Task 3), `validarObligaciones(lista)` (Task 2).
- Produces:
  - `EmpresaDocumentoModel.create(empresaId, tipo, archivo, nombreOriginal)`, `.porEmpresa(empresaId)` (el más reciente primero), `.findById(empresaId, id)`.
  - `ObligacionModel` (`module.exports = ObligacionModel`): `porEmpresa(empresaId)`, `comparar(empresaId, leidas) → { nuevas, existentes, desaparecidas }`, `reemplazar(empresaId, lista) → activas`, `findById(id)`, `paraCalendario(empresaId|null)`, `cumplimientosDe(ids)`, `crearCumplimiento(obligacionId, periodo, fecha, acuse)`, `findCumplimiento(id)`, `borrarCumplimiento(id)`. Los dos últimos y los de calendario se usan en Task 5. Las obligaciones salen con las columnas de `COLS` (fechas como texto y `alta`).
  - HTTP:
    - `GET /api/empresas/:id/documentos` → `[{ id, empresa_id, tipo, archivo, nombre_original, created_at }]`
    - `POST /api/empresas/:id/documentos` multipart `tipo` (`acta`|`csf`) + `archivo` → 201 `{ documento }` (acta) o `{ documento, nuevas, existentes, desaparecidas, aviso }` (csf)
    - `GET /api/empresas/:id/documentos/:docId/download`
    - `GET /api/empresas/:id/obligaciones` → activas
    - `PUT /api/empresas/:id/obligaciones` `{ obligaciones: [...] }` → activas después de reemplazar

- [ ] **Step 1: Write the failing tests** — `backend/tests/integration/clienteDocumentos.test.js`:

```js
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
```

Nota: `crearEmpresa` del helper ya acepta `{ rfc }`.

- [ ] **Step 2: Run to verify fail**

Run: `cd ~/diandra/backend && npx jest tests/integration/clienteDocumentos.test.js`
Expected: FAIL (404 en las rutas nuevas).

- [ ] **Step 3: Add EmpresaDocumentoModel** — al final de `backend/src/models/empresa.js`, antes de `module.exports`:

```js
const EmpresaDocumentoModel = {
  async create(empresaId, tipo, archivo, nombreOriginal) {
    const { rows } = await pool.query(
      'INSERT INTO empresa_documentos (empresa_id, tipo, archivo, nombre_original) VALUES ($1,$2,$3,$4) RETURNING *',
      [empresaId, tipo, archivo, nombreOriginal]);
    return rows[0];
  },

  async porEmpresa(empresaId) {
    const { rows } = await pool.query(
      'SELECT * FROM empresa_documentos WHERE empresa_id = $1 ORDER BY created_at DESC, id DESC', [empresaId]);
    return rows;
  },

  async findById(empresaId, id) {
    const { rows } = await pool.query('SELECT * FROM empresa_documentos WHERE empresa_id = $1 AND id = $2', [empresaId, id]);
    return rows[0] || null;
  },
};
```

Cambiar el export: `module.exports = { EmpresaModel, EmpresaDocumentoModel, normalizarRfc };`

- [ ] **Step 4: Create ObligacionModel** — `backend/src/models/obligacion.js`:

```js
const pool = require('../db/pool');

// Fechas como texto 'YYYY-MM-DD' (ver lib/vencimientos). `alta` = día en que se dio de alta en el sistema.
const COLS = `o.id, o.empresa_id, o.descripcion, o.vencimiento_texto, o.periodicidad, o.dia, o.mes,
  o.fecha_inicio::text AS fecha_inicio, o.fecha_fin::text AS fecha_fin, o.activa, o.created_at::date::text AS alta`;

const ObligacionModel = {
  async porEmpresa(empresaId) {
    const { rows } = await pool.query(
      `SELECT ${COLS} FROM empresa_obligaciones o WHERE o.empresa_id = $1 AND o.activa ORDER BY o.descripcion`, [empresaId]);
    return rows;
  },

  // Lo leído de una CSF contra lo activo, por descripción. No modifica nada.
  async comparar(empresaId, leidas) {
    const actuales = await this.porEmpresa(empresaId);
    const actualesPorDesc = new Set(actuales.map(o => o.descripcion));
    const leidasPorDesc = new Set(leidas.map(o => o.descripcion));
    return {
      nuevas: leidas.filter(o => !actualesPorDesc.has(o.descripcion)),
      existentes: actuales.filter(o => leidasPorDesc.has(o.descripcion)),
      desaparecidas: actuales.filter(o => !leidasPorDesc.has(o.descripcion)),
    };
  },

  // Upsert por descripción; las que no vienen se desactivan (conservan sus cumplimientos).
  // ponytail: una obligación reactivada conserva su alta original; si estuvo inactiva meses, esos periodos salen como vencidos.
  async reemplazar(empresaId, lista) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const o of lista) {
        await client.query(
          `INSERT INTO empresa_obligaciones (empresa_id, descripcion, vencimiento_texto, periodicidad, dia, mes, fecha_inicio, fecha_fin)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
           ON CONFLICT (empresa_id, descripcion) DO UPDATE SET
             vencimiento_texto = EXCLUDED.vencimiento_texto, periodicidad = EXCLUDED.periodicidad, dia = EXCLUDED.dia,
             mes = EXCLUDED.mes, fecha_inicio = EXCLUDED.fecha_inicio, fecha_fin = EXCLUDED.fecha_fin, activa = true`,
          [empresaId, o.descripcion.trim(), o.vencimiento_texto || null, o.periodicidad,
            o.periodicidad === 'manual' ? null : Number(o.dia), o.periodicidad === 'anual' ? Number(o.mes) : null,
            o.fecha_inicio || null, o.fecha_fin || null]);
      }
      await client.query(
        'UPDATE empresa_obligaciones SET activa = false WHERE empresa_id = $1 AND NOT (descripcion = ANY($2::text[]))',
        [empresaId, lista.map(o => o.descripcion.trim())]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
    return this.porEmpresa(empresaId);
  },

  async findById(id) {
    const { rows } = await pool.query(`SELECT ${COLS} FROM empresa_obligaciones o WHERE o.id = $1`, [id]);
    return rows[0] || null;
  },

  // Obligaciones con fecha calculable de clientes activos (todos o uno).
  async paraCalendario(empresaId) {
    const { rows } = await pool.query(
      `SELECT ${COLS}, e.razon_social FROM empresa_obligaciones o JOIN empresas e ON e.id = o.empresa_id
       WHERE o.activa AND e.activo AND o.periodicidad <> 'manual' AND ($1::int IS NULL OR o.empresa_id = $1)`,
      [empresaId]);
    return rows;
  },

  async cumplimientosDe(ids) {
    const { rows } = await pool.query(
      `SELECT id, obligacion_id, periodo, fecha_presentacion::text AS fecha_presentacion, acuse
       FROM obligacion_cumplimientos WHERE obligacion_id = ANY($1::int[])`, [ids]);
    return rows;
  },

  async crearCumplimiento(obligacionId, periodo, fecha, acuse) {
    const { rows } = await pool.query(
      `INSERT INTO obligacion_cumplimientos (obligacion_id, periodo, fecha_presentacion, acuse) VALUES ($1,$2,$3,$4)
       RETURNING id, obligacion_id, periodo, fecha_presentacion::text AS fecha_presentacion, acuse`,
      [obligacionId, periodo, fecha, acuse]);
    return rows[0];
  },

  async findCumplimiento(id) {
    const { rows } = await pool.query('SELECT * FROM obligacion_cumplimientos WHERE id = $1', [id]);
    return rows[0] || null;
  },

  async borrarCumplimiento(id) {
    const { rows } = await pool.query('DELETE FROM obligacion_cumplimientos WHERE id = $1 RETURNING *', [id]);
    return rows[0] || null;
  },
};

module.exports = ObligacionModel;
```

- [ ] **Step 5: Add routes** — en `backend/src/routes/empresas.js`, reemplazar las líneas de `require` del inicio por:

```js
const fs = require('fs');
const path = require('path');
const router = require('express').Router();
const requireRole = require('../middleware/requireRole');
const upload = require('../middleware/upload');
const { relativa, absoluta } = require('../lib/archivos');
const { leerCsf } = require('../lib/csf');
const { validarObligaciones } = require('../lib/vencimientos');
const { EmpresaModel, EmpresaDocumentoModel, normalizarRfc } = require('../models/empresa');
const ObligacionModel = require('../models/obligacion');

// Síncrono: al responder, el archivo rechazado ya no está en disco.
const borrarSubido = (file) => { if (file) fs.rmSync(file.path, { force: true }); };
const ID_RE = /^\d+$/;
```

y antes de `module.exports = router;` agregar:

```js
router.get('/:id/documentos', async (req, res) => res.json(await EmpresaDocumentoModel.porEmpresa(req.params.id)));

router.post('/:id/documentos', requireRole('admin', 'rh'), upload.single('archivo'), async (req, res) => {
  const fallar = (status, error) => { borrarSubido(req.file); res.status(status).json({ error }); };
  if (!req.file) return fallar(400, 'Falta el archivo');
  if (!ID_RE.test(req.params.id)) return fallar(400, 'Parámetro inválido');
  const { tipo } = req.body;
  if (!['acta', 'csf'].includes(tipo)) return fallar(400, 'tipo debe ser acta o csf');
  if (tipo === 'csf' && path.extname(req.file.originalname).toLowerCase() !== '.pdf') return fallar(400, 'La CSF debe ser PDF');
  const empresa = await EmpresaModel.findById(req.params.id);
  if (!empresa) return fallar(404, 'Empresa no encontrada');

  const documento = await EmpresaDocumentoModel.create(empresa.id, tipo, relativa(req.file.path), req.file.originalname);
  if (tipo === 'acta') return res.status(201).json({ documento });
  const { obligaciones, aviso } = await leerCsf(fs.readFileSync(req.file.path), empresa.rfc);
  res.status(201).json({ documento, ...(await ObligacionModel.comparar(empresa.id, obligaciones)), aviso });
});

router.get('/:id/documentos/:docId/download', async (req, res) => {
  const doc = await EmpresaDocumentoModel.findById(req.params.id, req.params.docId);
  if (!doc) return res.status(404).json({ error: 'Documento no encontrado' });
  const ruta = absoluta(doc.archivo);
  if (!fs.existsSync(ruta)) return res.status(404).json({ error: 'El archivo ya no existe en el servidor. Por favor vuelve a subirlo.' });
  res.download(ruta, doc.nombre_original || path.basename(ruta));
});

router.get('/:id/obligaciones', async (req, res) => res.json(await ObligacionModel.porEmpresa(req.params.id)));

router.put('/:id/obligaciones', requireRole('admin', 'rh'), async (req, res) => {
  const lista = req.body.obligaciones;
  const error = validarObligaciones(lista);
  if (error) return res.status(400).json({ error });
  const empresa = await EmpresaModel.findById(req.params.id);
  if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada' });
  res.json(await ObligacionModel.reemplazar(empresa.id, lista));
});
```

- [ ] **Step 6: Run to verify pass**

Run: `cd ~/diandra/backend && npm test`
Expected: PASS, toda la suite.

- [ ] **Step 7: Commit**

```bash
cd ~/diandra && git add backend/src/models/empresa.js backend/src/models/obligacion.js backend/src/routes/empresas.js backend/tests/integration/clienteDocumentos.test.js
git commit -m "feat: documentos del cliente, lectura de CSF y confirmación de obligaciones"
```

---

### Task 5: Calendario, resumen y cumplimientos

**Files:**
- Create: `backend/src/routes/obligaciones.js`
- Modify: `backend/src/app.js`
- Test: `backend/tests/integration/obligaciones.test.js`

**Interfaces:**
- Consumes: `ObligacionModel.paraCalendario / cumplimientosDe / findById / crearCumplimiento / findCumplimiento / borrarCumplimiento` (Task 4); `armarCalendario, hoyMx, sumarDias, finDeMes, periodoValido` (Task 2).
- Produces HTTP:
  - `GET /api/obligaciones/calendario?desde&hasta&empresa_id` → items de `armarCalendario`. Default: `desde` = 1º del mes actual; `hasta` = fin del mes siguiente.
  - `GET /api/obligaciones/resumen` → `{ vencidas, esta_semana }`
  - `POST /api/obligaciones/:id/cumplimientos` multipart `periodo`, `fecha_presentacion` (opcional; default hoy), `acuse` (archivo opcional) → 201
  - `DELETE /api/obligaciones/cumplimientos/:id` → 204
  - `GET /api/obligaciones/cumplimientos/:id/acuse` → descarga

- [ ] **Step 1: Write the failing tests** — `backend/tests/integration/obligaciones.test.js`:

```js
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
```

- [ ] **Step 2: Run to verify fail**

Run: `cd ~/diandra/backend && npx jest tests/integration/obligaciones.test.js`
Expected: FAIL (404, la ruta no existe).

- [ ] **Step 3: Implement** — `backend/src/routes/obligaciones.js`:

```js
const fs = require('fs');
const path = require('path');
const router = require('express').Router();
const requireRole = require('../middleware/requireRole');
const upload = require('../middleware/upload');
const { relativa, absoluta } = require('../lib/archivos');
const ObligacionModel = require('../models/obligacion');
const { armarCalendario, hoyMx, sumarDias, finDeMes, periodoValido } = require('../lib/vencimientos');

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
const ID_RE = /^\d+$/;
// Síncrono: al responder, el archivo rechazado ya no está en disco.
const borrarSubido = (file) => { if (file) fs.rmSync(file.path, { force: true }); };

async function calendario(empresaId, desde, hasta, hoy) {
  const obligaciones = await ObligacionModel.paraCalendario(empresaId);
  const cumplimientos = await ObligacionModel.cumplimientosDe(obligaciones.map(o => o.id));
  return armarCalendario(obligaciones, cumplimientos, { desde, hasta, hoy });
}

router.get('/calendario', async (req, res) => {
  const hoy = hoyMx();
  const desde = req.query.desde || `${hoy.slice(0, 7)}-01`;
  const hasta = req.query.hasta || finDeMes(hoy, 1);
  if (!FECHA_RE.test(desde) || !FECHA_RE.test(hasta) || desde > hasta) {
    return res.status(400).json({ error: 'Rango de fechas inválido (AAAA-MM-DD, desde ≤ hasta)' });
  }
  const { empresa_id: empresaId } = req.query;
  if (empresaId && !ID_RE.test(empresaId)) return res.status(400).json({ error: 'empresa_id inválido' });
  res.json(await calendario(empresaId ? Number(empresaId) : null, desde, hasta, hoy));
});

router.get('/resumen', async (req, res) => {
  const hoy = hoyMx();
  const items = await calendario(null, hoy, sumarDias(hoy, 7), hoy);
  res.json({
    vencidas: items.filter(i => i.estado === 'vencida').length,
    esta_semana: items.filter(i => i.estado === 'proxima').length,
  });
});

router.post('/:id/cumplimientos', requireRole('admin', 'rh'), upload.single('acuse'), async (req, res) => {
  const fallar = (status, error) => { borrarSubido(req.file); res.status(status).json({ error }); };
  if (!ID_RE.test(req.params.id)) return fallar(400, 'Parámetro inválido');
  const ob = await ObligacionModel.findById(req.params.id);
  if (!ob) return fallar(404, 'Obligación no encontrada');
  const { periodo } = req.body;
  const fecha = req.body.fecha_presentacion || hoyMx();
  if (!periodoValido(ob.periodicidad, periodo)) return fallar(400, 'Periodo inválido para esta obligación');
  if (!FECHA_RE.test(fecha)) return fallar(400, 'Fecha de presentación inválida (AAAA-MM-DD)');
  try {
    res.status(201).json(await ObligacionModel.crearCumplimiento(ob.id, periodo, fecha, req.file ? relativa(req.file.path) : null));
  } catch (err) {
    borrarSubido(req.file);
    throw err;   // 23505 → 409 por errorHandler
  }
});

router.delete('/cumplimientos/:id', requireRole('admin', 'rh'), async (req, res) => {
  const c = await ObligacionModel.borrarCumplimiento(req.params.id);
  if (!c) return res.status(404).json({ error: 'Cumplimiento no encontrado' });
  if (c.acuse) fs.unlink(absoluta(c.acuse), () => {});
  res.status(204).end();
});

router.get('/cumplimientos/:id/acuse', async (req, res) => {
  const c = await ObligacionModel.findCumplimiento(req.params.id);
  if (!c || !c.acuse) return res.status(404).json({ error: 'Este cumplimiento no tiene acuse' });
  const ruta = absoluta(c.acuse);
  if (!fs.existsSync(ruta)) return res.status(404).json({ error: 'El archivo ya no existe en el servidor. Por favor vuelve a subirlo.' });
  res.download(ruta, `acuse-${c.periodo}${path.extname(ruta)}`);
});

module.exports = router;
```

- [ ] **Step 4: Mount** — en `backend/src/app.js`, debajo de la línea de `/api/empresas`:

```js
app.use('/api/obligaciones', authMiddleware, require('./routes/obligaciones'));   // del despacho, sin X-Empresa-Id
```

- [ ] **Step 5: Run to verify pass**

Run: `cd ~/diandra/backend && npm test`
Expected: PASS, toda la suite.

- [ ] **Step 6: Commit**

```bash
cd ~/diandra && git add backend/src/routes/obligaciones.js backend/src/app.js backend/tests/integration/obligaciones.test.js
git commit -m "feat: calendario de obligaciones, resumen y cumplimientos con acuse"
```

---

### Task 6: Frontend — ficha de cliente

**Files:**
- Modify: `frontend/src/api/empresas.js`
- Modify: `frontend/src/api/documentos.js` (extraer `abrirArchivo`)
- Create: `frontend/src/components/DocumentoCliente.jsx`
- Create: `frontend/src/components/ObligacionesCliente.jsx`
- Rewrite: `frontend/src/pages/EmpresaFormPage.jsx`

**Interfaces:**
- Consumes: endpoints de Task 1 y Task 4.
- Produces: `abrirArchivo(url, filename)` en `api/documentos.js` (se usa también en Task 7).

No hay pruebas automáticas de frontend en este repo. La verificación es `npm run lint`, `npm run build` y la prueba manual del Step 7.

- [ ] **Step 1: API** — agregar a `frontend/src/api/empresas.js`:

```js
export const getDocumentosCliente = (id) => api.get(`/empresas/${id}/documentos`).then(r => r.data);
export const subirDocumentoCliente = (id, tipo, archivo) => {
  const fd = new FormData();
  fd.append('tipo', tipo);
  fd.append('archivo', archivo);
  return api.post(`/empresas/${id}/documentos`, fd).then(r => r.data);
};
export const getObligacionesCliente = (id) => api.get(`/empresas/${id}/obligaciones`).then(r => r.data);
export const guardarObligacionesCliente = (id, obligaciones) =>
  api.put(`/empresas/${id}/obligaciones`, { obligaciones }).then(r => r.data);
```

En `frontend/src/api/documentos.js`, renombrar el cuerpo de `abrirDocumento` a una función genérica:
- cambiar `export const abrirDocumento = async (id, filename) => {` por `export const abrirArchivo = async (url, filename) => {`
- dentro, cambiar ``api.get(`/documentos/${id}/download`, { responseType: 'blob' })`` por `api.get(url, { responseType: 'blob' })`. Si la variable local `url` del blob choca de nombre, renómbrala a `blobUrl` en sus 4 usos.
- al final agregar: ``export const abrirDocumento = (id, filename) => abrirArchivo(`/documentos/${id}/download`, filename);``

- [ ] **Step 2: DocumentoCliente** — `frontend/src/components/DocumentoCliente.jsx`:

```jsx
import { useEffect, useState } from 'react';
import { getDocumentosCliente, subirDocumentoCliente } from '../api/empresas';
import { abrirArchivo } from '../api/documentos';

const fecha = (f) => new Date(f).toLocaleDateString('es-MX');

// Archivo vigente (el más reciente) de un tipo + historial; subir uno nuevo no borra los anteriores.
export default function DocumentoCliente({ empresaId, tipo, accept = '.pdf,.jpg,.jpeg,.png', onSubido }) {
  const [docs, setDocs] = useState([]);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState('');

  const cargar = () => getDocumentosCliente(empresaId)
    .then(d => setDocs(d.filter(x => x.tipo === tipo)))
    .catch(() => setError('No se pudieron cargar los documentos.'));
  useEffect(() => { cargar(); }, [empresaId, tipo]); // eslint-disable-line react-hooks/exhaustive-deps, react-hooks/set-state-in-effect

  async function subir(ev) {
    const archivo = ev.target.files[0];
    ev.target.value = '';
    if (!archivo) return;
    setSubiendo(true); setError('');
    try {
      const r = await subirDocumentoCliente(empresaId, tipo, archivo);
      await cargar();
      onSubido?.(r);
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo subir el archivo.');
    } finally {
      setSubiendo(false);
    }
  }

  const abrir = (d) => abrirArchivo(`/empresas/${empresaId}/documentos/${d.id}/download`, d.nombre_original || 'documento.pdf');
  const [vigente, ...anteriores] = docs;

  return (
    <div className="text-sm">
      {vigente ? (
        <p>Vigente: <button type="button" onClick={() => abrir(vigente)} className="text-blue-700 underline">{vigente.nombre_original}</button>
          <span className="text-gray-500"> · {fecha(vigente.created_at)}</span></p>
      ) : <p className="text-gray-500">Sin archivo.</p>}
      {anteriores.length > 0 && (
        <details className="mt-1 text-gray-600">
          <summary className="cursor-pointer">Anteriores ({anteriores.length})</summary>
          <ul className="ml-4 list-disc">
            {anteriores.map(d => (
              <li key={d.id}><button type="button" onClick={() => abrir(d)} className="underline">{d.nombre_original}</button> · {fecha(d.created_at)}</li>
            ))}
          </ul>
        </details>
      )}
      <label className={`inline-block mt-2 text-blue-700 hover:underline ${subiendo ? 'opacity-50' : 'cursor-pointer'}`}>
        {subiendo ? 'Subiendo…' : vigente ? 'Subir versión nueva' : 'Subir archivo'}
        <input type="file" accept={accept} onChange={subir} disabled={subiendo} className="hidden" />
      </label>
      {error && <p className="text-red-600 mt-1">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 3: ObligacionesCliente** — `frontend/src/components/ObligacionesCliente.jsx`:

```jsx
import { useEffect, useState } from 'react';
import { getObligacionesCliente, guardarObligacionesCliente } from '../api/empresas';

const PERIODICIDADES = ['mensual', 'bimestral', 'trimestral', 'anual', 'manual'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function describir(o) {
  if (o.periodicidad === 'manual') return 'Sin fecha automática';
  if (o.periodicidad === 'anual') return `Anual · ${o.dia === 31 ? 'último día' : `día ${o.dia}`} de ${MESES[o.mes - 1]} del año siguiente`;
  return `${o.periodicidad[0].toUpperCase()}${o.periodicidad.slice(1)} · ${o.dia === 31 ? 'último día' : `día ${o.dia}`} del mes siguiente`;
}

const input = 'border border-gray-300 rounded px-2 py-1 text-sm';

// Lista de obligaciones activas; `revision` (respuesta de subir CSF) abre la tabla para confirmar.
export default function ObligacionesCliente({ empresaId, revision, onCerrar }) {
  const [actuales, setActuales] = useState([]);
  const [filas, setFilas] = useState(null);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    getObligacionesCliente(empresaId).then(setActuales).catch(() => setError('No se pudieron cargar las obligaciones.'));
  }, [empresaId]);

  useEffect(() => {
    if (!revision) return;
    setFilas([ // eslint-disable-line react-hooks/set-state-in-effect
      ...revision.nuevas.map(o => ({ ...o, incluir: true, nota: 'nueva' })),
      ...revision.existentes.map(o => ({ ...o, incluir: true })),
      ...revision.desaparecidas.map(o => ({ ...o, incluir: false, nota: 'ya no aparece en la CSF' })),
    ]);
  }, [revision]);

  const cambiar = (i, k, v) => setFilas(fs => fs.map((f, j) => (j === i ? { ...f, [k]: v } : f)));
  const cerrar = () => { setFilas(null); setError(''); onCerrar?.(); };

  async function guardar() {
    const lista = filas.filter(f => f.incluir).map(f => ({
      descripcion: f.descripcion, vencimiento_texto: f.vencimiento_texto, periodicidad: f.periodicidad,
      dia: f.dia === '' ? null : f.dia, mes: f.mes === '' ? null : f.mes, fecha_inicio: f.fecha_inicio, fecha_fin: f.fecha_fin,
    }));
    setGuardando(true); setError('');
    try {
      setActuales(await guardarObligacionesCliente(empresaId, lista));
      cerrar();
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudieron guardar las obligaciones.');
    } finally {
      setGuardando(false);
    }
  }

  if (!filas) {
    return (
      <div className="text-sm mt-3">
        {actuales.length === 0 ? <p className="text-gray-500">Sin obligaciones. Sube la CSF o agrégalas a mano.</p> : (
          <ul className="divide-y border rounded">
            {actuales.map(o => (
              <li key={o.id} className="px-3 py-2"><span className="font-medium">{o.descripcion}</span>
                <span className="text-gray-500"> · {describir(o)}</span></li>
            ))}
          </ul>
        )}
        <button type="button" onClick={() => setFilas(actuales.map(o => ({ ...o, incluir: true })))} className="mt-2 text-blue-700 hover:underline">
          {actuales.length ? 'Editar obligaciones' : 'Agregar a mano'}
        </button>
        {error && <p className="text-red-600 mt-1">{error}</p>}
      </div>
    );
  }

  return (
    <div className="text-sm mt-3 border rounded p-3 bg-gray-50">
      {revision?.aviso && <p className="mb-2 bg-amber-50 border border-amber-200 text-amber-900 rounded px-3 py-2">{revision.aviso}</p>}
      <p className="mb-2 text-gray-700">Revisa lo leído y confirma. Solo se guardan las marcadas.</p>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead><tr className="text-left text-gray-600"><th className="p-1">Incluir</th><th className="p-1">Obligación</th><th className="p-1">Periodicidad</th><th className="p-1">Día</th><th className="p-1">Mes</th></tr></thead>
          <tbody>
            {filas.map((f, i) => (
              <tr key={f.id ?? `n${i}`} className="align-top border-t">
                <td className="p-1"><input type="checkbox" checked={f.incluir} onChange={e => cambiar(i, 'incluir', e.target.checked)} aria-label="Incluir" /></td>
                <td className="p-1">
                  {f.id || f.vencimiento_texto !== undefined
                    ? <span className="font-medium">{f.descripcion}</span>
                    : <input value={f.descripcion} onChange={e => cambiar(i, 'descripcion', e.target.value)} placeholder="Descripción" className={`${input} w-full`} />}
                  {f.nota && <span className="ml-2 text-xs text-amber-700">({f.nota})</span>}
                  {f.vencimiento_texto && <div className="text-xs text-gray-500">{f.vencimiento_texto}</div>}
                </td>
                <td className="p-1">
                  <select value={f.periodicidad} onChange={e => cambiar(i, 'periodicidad', e.target.value)} className={input}>
                    {PERIODICIDADES.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </td>
                <td className="p-1">
                  <input type="number" min="1" max="31" value={f.dia ?? ''} disabled={f.periodicidad === 'manual'}
                    onChange={e => cambiar(i, 'dia', e.target.value === '' ? '' : Number(e.target.value))} className={`${input} w-16`} />
                </td>
                <td className="p-1">
                  {f.periodicidad === 'anual' && (
                    <select value={f.mes ?? ''} onChange={e => cambiar(i, 'mes', e.target.value === '' ? '' : Number(e.target.value))} className={input}>
                      <option value="">—</option>
                      {MESES.map((m, k) => <option key={m} value={k + 1}>{m}</option>)}
                    </select>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-500 mt-1">Día 31 = último día del mes.</p>
      {error && <p className="text-red-600 mt-2">{error}</p>}
      <div className="mt-3 flex gap-3">
        <button type="button" onClick={() => setFilas(fs => [...fs, { descripcion: '', periodicidad: 'mensual', dia: 17, mes: '', incluir: true }])}
          className="text-blue-700 hover:underline">+ Agregar obligación</button>
        <button type="button" disabled={guardando} onClick={guardar}
          className="bg-blue-700 text-white px-3 py-1.5 rounded hover:bg-blue-800 disabled:opacity-50">{guardando ? 'Guardando…' : 'Confirmar obligaciones'}</button>
        <button type="button" onClick={cerrar} className="text-gray-600">Cancelar</button>
      </div>
    </div>
  );
}
```

Nota: la descripción solo es editable en filas agregadas a mano: no tienen `id` ni `vencimiento_texto`. Las leídas de la CSF traen `vencimiento_texto` (aunque sea `''`).

- [ ] **Step 4: Rewrite EmpresaFormPage** — `frontend/src/pages/EmpresaFormPage.jsx`:

```jsx
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { createEmpresa, getEmpresa, updateEmpresa } from '../api/empresas';
import { getEmpresaActiva, setEmpresaActiva } from '../empresaActiva';
import DocumentoCliente from '../components/DocumentoCliente';
import ObligacionesCliente from '../components/ObligacionesCliente';

const CAMPOS = ['tipo_persona', 'razon_social', 'rfc', 'representante_legal', 'registro_patronal', 'giro',
  'contacto_nombre', 'contacto_telefono', 'contacto_whatsapp',
  'nombre_comercial', 'domicilio', 'colonia', 'cp', 'ciudad', 'monto_facturacion', 'condiciones_pago'];
const RFC_RE = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/;
const inputCls = 'mt-1 w-full border border-gray-300 rounded px-3 py-2 text-sm';

function Seccion({ titulo, children }) {
  return (
    <section className="border-t border-gray-200 pt-4 mt-5">
      <h2 className="text-sm font-semibold text-gray-800 uppercase tracking-wide mb-3">{titulo}</h2>
      {children}
    </section>
  );
}

export default function EmpresaFormPage({ onCambio }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState(Object.fromEntries(CAMPOS.map(k => [k, ''])));
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [errorCarga, setErrorCarga] = useState('');
  const [revisionCsf, setRevisionCsf] = useState(null);

  useEffect(() => {
    if (id) getEmpresa(id).then(e => setForm(Object.fromEntries(CAMPOS.map(k => [k, e[k] ?? '']))))
      .catch(() => setErrorCarga('No se pudo cargar el cliente.'));
  }, [id]);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));
  const campo = (k, label, props = {}) => (
    <label className="text-sm text-gray-700">{label}
      <input value={form[k]} onChange={set(k)} {...props} className={inputCls} />
    </label>
  );

  async function guardar(ev) {
    ev.preventDefault();
    const rfc = form.rfc.trim().toUpperCase();
    if (!form.tipo_persona) return setError('Elige persona física o moral.');
    if (!form.razon_social.trim()) return setError('El nombre de la empresa es obligatorio.');
    if (!RFC_RE.test(rfc)) return setError('RFC inválido.');
    if (form.tipo_persona === 'moral' && rfc.length !== 12) return setError('Persona moral: el RFC lleva 12 caracteres.');
    if (form.tipo_persona === 'fisica' && rfc.length !== 13) return setError('Persona física: el RFC lleva 13 caracteres.');
    setError(''); setGuardando(true);
    try {
      const datos = { ...form, rfc };
      const empresa = id ? await updateEmpresa(id, datos) : await createEmpresa(datos);
      if (!getEmpresaActiva()) setEmpresaActiva(empresa); // primer cliente queda seleccionado
      onCambio?.();
      navigate(id ? '/empresas' : `/empresas/${empresa.id}/editar`); // al crear, queda en la ficha para subir documentos
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo guardar.');
    } finally {
      setGuardando(false);
    }
  }

  if (errorCarga) return <p className="text-red-600">{errorCarga}</p>;

  const wa = form.contacto_whatsapp.replace(/\D/g, '');
  const sinId = <p className="text-sm text-gray-500">Guarda el cliente para poder subir documentos.</p>;

  return (
    <form onSubmit={guardar} className="bg-white border rounded p-6 max-w-3xl">
      <h1 className="text-xl font-bold text-gray-800">{id ? 'Ficha de cliente' : 'Nuevo cliente'}</h1>

      <Seccion titulo="Tipo de persona">
        <div className="flex gap-6 text-sm">
          {[['fisica', 'Persona física'], ['moral', 'Persona moral']].map(([v, l]) => (
            <label key={v} className="flex items-center gap-2">
              <input type="radio" name="tipo_persona" value={v} checked={form.tipo_persona === v} onChange={set('tipo_persona')} />{l}
            </label>
          ))}
        </div>
      </Seccion>

      <Seccion titulo="Empresa">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {campo('razon_social', 'Nombre o razón social *')}
          {campo('rfc', 'RFC *')}
          {campo('representante_legal', 'Representante legal')}
          {campo('registro_patronal', 'Registro patronal IMSS')}
          {campo('giro', 'Giro')}
        </div>
      </Seccion>

      <Seccion titulo="Contacto en la empresa">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {campo('contacto_nombre', 'Nombre')}
          {campo('contacto_telefono', 'Teléfono', { type: 'tel' })}
          <div>
            {campo('contacto_whatsapp', 'WhatsApp', { type: 'tel' })}
            {wa.length === 10 && <a href={`https://wa.me/52${wa}`} target="_blank" rel="noreferrer" className="text-xs text-green-700 hover:underline">Abrir WhatsApp</a>}
          </div>
        </div>
      </Seccion>

      {form.tipo_persona === 'moral' && (
        <Seccion titulo="Acta constitutiva">
          {id ? <DocumentoCliente empresaId={id} tipo="acta" /> : sinId}
        </Seccion>
      )}

      <Seccion titulo="Nombre comercial y domicilio">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {campo('nombre_comercial', 'Nombre comercial')}
          {campo('domicilio', 'Calle y número')}
          {campo('colonia', 'Colonia')}
          {campo('cp', 'Código postal')}
          {campo('ciudad', 'Ciudad')}
        </div>
      </Seccion>

      <Seccion titulo="Constancia de situación fiscal y obligaciones">
        {id ? (
          <>
            <DocumentoCliente empresaId={id} tipo="csf" accept=".pdf" onSubido={setRevisionCsf} />
            <ObligacionesCliente empresaId={id} revision={revisionCsf} onCerrar={() => setRevisionCsf(null)} />
          </>
        ) : sinId}
      </Seccion>

      <Seccion titulo="Facturación">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {campo('monto_facturacion', 'Monto de facturación acordado (MXN)', { type: 'number', min: '0', step: '0.01' })}
          <label className="text-sm text-gray-700 sm:col-span-2">Condiciones de pago
            <textarea value={form.condiciones_pago} onChange={set('condiciones_pago')} rows={3} className={inputCls} />
          </label>
        </div>
      </Seccion>

      {error && <p className="text-red-600 text-sm mt-4">{error}</p>}
      <div className="mt-5 flex gap-3">
        <button disabled={guardando} className="bg-blue-700 text-white px-4 py-2 rounded text-sm hover:bg-blue-800 disabled:opacity-50">
          {guardando ? 'Guardando…' : 'Guardar'}
        </button>
        <button type="button" onClick={() => navigate('/empresas')} className="text-gray-600 text-sm">Cancelar</button>
      </div>
      {id && <p className="text-xs text-gray-500 mt-2">Los documentos y obligaciones se guardan por separado, al subirlos o confirmarlos.</p>}
    </form>
  );
}
```

- [ ] **Step 5: Lint and build**

Run: `cd ~/diandra/frontend && npm run lint && npm run build`
Expected: sin errores. Si aparece un warning nuevo de `react-hooks`, usa el mismo estilo de `eslint-disable-line` que `App.jsx`.

- [ ] **Step 6: Commit**

```bash
cd ~/diandra && git add frontend/src/api frontend/src/components/DocumentoCliente.jsx frontend/src/components/ObligacionesCliente.jsx frontend/src/pages/EmpresaFormPage.jsx
git commit -m "feat(frontend): ficha de cliente con acta, CSF y obligaciones"
```

- [ ] **Step 7: Manual check** (local: backend `cd ~/diandra/backend && npm run dev`, frontend `cd ~/diandra/frontend && npm run dev`)

Crear cliente persona moral con RFC `ASM1407281I5` → al guardar queda en la ficha → subir `~/Downloads/Csf_ASM1407281I5-Septiembre 2026.pdf` → la tabla muestra 5 obligaciones sin aviso → confirmar → la lista muestra las 5 con su regla. Cambiar a persona física → desaparece la sección del acta. **No commitear la CSF.**

---

### Task 7: Frontend — página de obligaciones, banner y "Clientes"

**Files:**
- Create: `frontend/src/api/obligaciones.js`
- Create: `frontend/src/pages/ObligacionesPage.jsx`
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/pages/EmpresasPage.jsx`

**Interfaces:**
- Consumes: endpoints de Task 5; `abrirArchivo` (Task 6); `getEmpresas`.

- [ ] **Step 1: API** — `frontend/src/api/obligaciones.js`:

```js
import api from './client';

export const getCalendario = (params) => api.get('/obligaciones/calendario', { params }).then(r => r.data);
export const getResumenObligaciones = () => api.get('/obligaciones/resumen').then(r => r.data);
export const registrarCumplimiento = (obligacionId, periodo, fecha, acuse) => {
  const fd = new FormData();
  fd.append('periodo', periodo);
  fd.append('fecha_presentacion', fecha);
  if (acuse) fd.append('acuse', acuse);
  return api.post(`/obligaciones/${obligacionId}/cumplimientos`, fd).then(r => r.data);
};
export const deshacerCumplimiento = (id) => api.delete(`/obligaciones/cumplimientos/${id}`);
```

- [ ] **Step 2: Page** — `frontend/src/pages/ObligacionesPage.jsx`:

```jsx
import { useCallback, useEffect, useState } from 'react';
import { getCalendario, registrarCumplimiento, deshacerCumplimiento } from '../api/obligaciones';
import { getEmpresas } from '../api/empresas';
import { abrirArchivo } from '../api/documentos';

const ESTADOS = {
  vencida: ['Vencida', 'bg-red-100 text-red-800'],
  proxima: ['Vence pronto', 'bg-amber-100 text-amber-800'],
  pendiente: ['Pendiente', 'bg-gray-100 text-gray-700'],
  presentada: ['Presentada', 'bg-green-100 text-green-800'],
};
const hoy = () => new Date().toLocaleDateString('en-CA');
const fmt = (f) => new Date(`${f}T12:00:00`).toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const inputCls = 'border border-gray-300 rounded px-2 py-1 text-sm';

export default function ObligacionesPage() {
  const [empresas, setEmpresas] = useState([]);
  const [filtro, setFiltro] = useState({ empresa_id: '', desde: '', hasta: '' });
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const [captura, setCaptura] = useState(null); // { key, fecha, acuse }
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(() => {
    const params = Object.fromEntries(Object.entries(filtro).filter(([, v]) => v));
    getCalendario(params).then(r => { setItems(r); setError(''); })
      .catch(err => setError(err.response?.data?.error || 'No se pudo cargar el calendario.'));
  }, [filtro]);

  useEffect(() => { getEmpresas().then(e => setEmpresas(e.filter(x => x.activo))).catch(() => {}); }, []);
  useEffect(() => { cargar(); }, [cargar]); // eslint-disable-line react-hooks/set-state-in-effect

  const key = (i) => `${i.obligacion_id}|${i.periodo}`;

  async function presentar(i) {
    setGuardando(true);
    try {
      await registrarCumplimiento(i.obligacion_id, i.periodo, captura.fecha, captura.acuse);
      setCaptura(null);
      cargar();
    } catch (err) {
      alert(err.response?.data?.error || 'No se pudo registrar.');
    } finally {
      setGuardando(false);
    }
  }

  async function deshacer(i) {
    if (!confirm(`¿Deshacer la presentación de "${i.descripcion}" (${i.periodo})? Se borra el acuse.`)) return;
    try { await deshacerCumplimiento(i.cumplimiento_id); cargar(); } catch { alert('No se pudo deshacer.'); }
  }

  const setF = (k) => (e) => setFiltro(f => ({ ...f, [k]: e.target.value }));

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-800 mb-4">Obligaciones fiscales</h1>
      <div className="flex flex-wrap gap-3 items-end mb-4 text-sm">
        <label>Cliente<br />
          <select value={filtro.empresa_id} onChange={setF('empresa_id')} className={inputCls}>
            <option value="">Todos</option>
            {empresas.map(e => <option key={e.id} value={e.id}>{e.razon_social}</option>)}
          </select>
        </label>
        <label>Desde<br /><input type="date" value={filtro.desde} onChange={setF('desde')} className={inputCls} /></label>
        <label>Hasta<br /><input type="date" value={filtro.hasta} onChange={setF('hasta')} className={inputCls} /></label>
        <span className="text-gray-500">Sin fechas: este mes y el siguiente. Lo vencido sin presentar siempre aparece.</span>
      </div>
      {error && <p className="text-red-600 text-sm mb-3">{error}</p>}
      {items === null ? <p className="text-gray-500">Cargando…</p> : items.length === 0 ? (
        <p className="text-gray-500">No hay obligaciones en este rango. Se dan de alta desde la ficha de cada cliente (CSF).</p>
      ) : (
        <div className="bg-white border rounded overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-600">
              <tr><th className="p-2">Vence</th><th className="p-2">Cliente</th><th className="p-2">Obligación</th><th className="p-2">Periodo</th><th className="p-2">Estado</th><th className="p-2"></th></tr>
            </thead>
            <tbody>
              {items.map(i => {
                const [label, cls] = ESTADOS[i.estado];
                const capturando = captura?.key === key(i);
                return (
                  <tr key={key(i)} className="border-t align-top">
                    <td className="p-2 whitespace-nowrap">{fmt(i.fecha_vence)}</td>
                    <td className="p-2">{i.razon_social}</td>
                    <td className="p-2">{i.descripcion}</td>
                    <td className="p-2 whitespace-nowrap">{i.periodo}</td>
                    <td className="p-2"><span className={`px-2 py-0.5 rounded text-xs ${cls}`}>{label}</span>
                      {i.fecha_presentacion && <div className="text-xs text-gray-500 mt-1">el {fmt(i.fecha_presentacion)}</div>}</td>
                    <td className="p-2 whitespace-nowrap">
                      {i.estado === 'presentada' ? (
                        <div className="flex gap-3">
                          {i.tiene_acuse && <button onClick={() => abrirArchivo(`/obligaciones/cumplimientos/${i.cumplimiento_id}/acuse`, `acuse-${i.periodo}.pdf`)} className="text-blue-700 hover:underline">Acuse</button>}
                          <button onClick={() => deshacer(i)} className="text-gray-500 hover:text-red-600">Deshacer</button>
                        </div>
                      ) : capturando ? (
                        <div className="flex flex-col gap-1">
                          <input type="date" value={captura.fecha} onChange={e => setCaptura(c => ({ ...c, fecha: e.target.value }))} className={inputCls} aria-label="Fecha de presentación" />
                          <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e => setCaptura(c => ({ ...c, acuse: e.target.files[0] }))} className="text-xs" aria-label="Acuse (opcional)" />
                          <div className="flex gap-2">
                            <button disabled={guardando || !captura.fecha} onClick={() => presentar(i)} className="bg-green-700 text-white px-2 py-1 rounded text-xs disabled:opacity-50">{guardando ? 'Guardando…' : 'Guardar'}</button>
                            <button onClick={() => setCaptura(null)} className="text-gray-600 text-xs">Cancelar</button>
                          </div>
                        </div>
                      ) : (
                        <button onClick={() => setCaptura({ key: key(i), fecha: hoy(), acuse: null })} className="text-green-700 hover:underline">Marcar presentada</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: App.jsx** — cambios en `frontend/src/App.jsx`:

1. Imports, junto a los demás:
```jsx
import ObligacionesPage from './pages/ObligacionesPage';
import { getResumenObligaciones } from './api/obligaciones';
```
2. Dentro de `Layout`, después de `const [errorEmpresas, setErrorEmpresas] = useState('');`:
```jsx
  const [resumen, setResumen] = useState(null);
  useEffect(() => { getResumenObligaciones().then(setResumen).catch(() => setResumen(null)); }, [location.pathname]); // eslint-disable-line react-hooks/set-state-in-effect
```
3. Reemplazar
```jsx
  const enEmpresas = location.pathname.startsWith('/empresas');
  const bloqueado = !activa && !enEmpresas;
```
por
```jsx
  // Clientes y obligaciones son del despacho: no requieren empresa activa.
  const enEmpresas = /^\/(empresas|obligaciones)/.test(location.pathname);
  const bloqueado = !activa && !enEmpresas;
```
4. Reemplazar `<NavLink to="/empresas" className={linkCls}>Empresas</NavLink>` por:
```jsx
          <NavLink to="/obligaciones" className={linkCls}>Obligaciones</NavLink>
          <NavLink to="/empresas" className={linkCls}>Clientes</NavLink>
```
5. Debajo del bloque `{errorEmpresas && ...}`:
```jsx
      {resumen && (resumen.vencidas > 0 || resumen.esta_semana > 0) && (
        <NavLink to="/obligaciones" className="block bg-amber-50 border-b border-amber-100 px-6 py-1.5 text-sm text-amber-900 hover:bg-amber-100">
          Obligaciones:{' '}
          {resumen.vencidas > 0 && <strong className="text-red-700">{resumen.vencidas} vencida{resumen.vencidas > 1 ? 's' : ''}</strong>}
          {resumen.vencidas > 0 && resumen.esta_semana > 0 && ' · '}
          {resumen.esta_semana > 0 && <strong>{resumen.esta_semana} vence{resumen.esta_semana > 1 ? 'n' : ''} esta semana</strong>}
        </NavLink>
      )}
```
6. En `<Routes>` del Layout, junto a las de `/empresas`:
```jsx
            <Route path="/obligaciones" element={<ObligacionesPage />} />
```

- [ ] **Step 4: EmpresasPage** — en `frontend/src/pages/EmpresasPage.jsx` cambiar el título `Empresas cliente` por `Clientes`, y el texto del botón de alta (si dice "Nueva empresa") por `Nuevo cliente`:

Run: `cd ~/diandra/frontend && grep -n "Nueva empresa\|Empresas cliente\|No se pudieron cargar las empresas" src/pages/EmpresasPage.jsx`, editar esas líneas.

- [ ] **Step 5: Lint and build**

Run: `cd ~/diandra/frontend && npm run lint && npm run build`
Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
cd ~/diandra && git add frontend/src/api/obligaciones.js frontend/src/pages/ObligacionesPage.jsx frontend/src/App.jsx frontend/src/pages/EmpresasPage.jsx
git commit -m "feat(frontend): calendario de obligaciones, banner de vencimientos y menú Clientes"
```

- [ ] **Step 7: Manual check** (local, con el cliente de Task 6)

`/obligaciones` sin empresa activa → carga sin pedir empresa. Se ven los vencimientos (ej. IVA sept 2026 → lun 19-oct). "Marcar presentada" con acuse → estado Presentada → "Acuse" abre el archivo → "Deshacer" lo regresa. Filtro por cliente funciona. El banner ámbar aparece cuando hay obligaciones de la semana o vencidas.

---

### Task 8: Deploy y verificación en producción

**Files:** ninguno (operación).

- [ ] **Step 1: Full test suite**

Run: `cd ~/diandra/backend && npm test`
Expected: PASS, toda la suite.

- [ ] **Step 2: Deploy**

Run: `cd ~/diandra && ./deploy.sh`
Expected: termina con "✓ Deploy completado". La migración `014_ficha_cliente.sql` se aplica al reiniciar (`src/index.js` corre `runMigrations`). Confirmar en el log:
```bash
ssh -i ~/.ssh/id_ed25519 -o IdentitiesOnly=yes root@62.238.3.136 "sudo -u apps pm2 logs diandra-backend --lines 30 --nostream | grep -i migraci"
```
Expected: `Migración aplicada: 014_ficha_cliente.sql`.

- [ ] **Step 3: Smoke test in prod** (http://62.238.3.136:8098, admin de [[credentials]])

Abrir un cliente existente → elegir tipo de persona → guardar → subir la CSF → confirmar obligaciones → `/obligaciones` muestra vencimientos. Si se usó un cliente de prueba, desactivarlo después (no se borran).

- [ ] **Step 4: Update memory** — en `~/.claude/projects/-home-alejandroayalag/memory/project_diandra.md`, agregar la Fase 2 en producción (fecha, rutas, que la CSF se lee con pdf-parse sobre texto sin espacios) y quitar "Fase 2" de pendientes.
