# DIANDRA Fase 2 — Ficha de cliente y calendario de obligaciones fiscales

Fecha: 2026-10-14 · Estado: aprobado en chat

## Objetivo

Diana (contadora) lleva varias empresas cliente. Cada una ya puede tener módulo RH (Fase 1).
Ahora cada cliente necesita una **ficha de identificación** y un **calendario de obligaciones
fiscales** derivado de su Constancia de Situación Fiscal (CSF), para que ninguna obligación
se pase de fecha.

Éxito: Diana ve de un vistazo qué obligaciones vencen (de todos sus clientes), las marca como
presentadas y guarda el acuse.

## Decisiones

1. **Cliente = empresa.** Un solo registro: la ficha extiende la tabla `empresas` existente.
   Un cliente sin empleados simplemente tiene RH vacío.
2. **Obligaciones se leen automáticamente de la CSF** (PDF descargado del SAT, con capa de texto).
   Diana revisa lo leído y confirma. PDF escaneado → aviso + captura manual.
3. **Atender = marcar presentada + acuse opcional.** Sin recordatorios por correo (no hay SMTP).
4. **Vencimientos calculados al vuelo**, no materializados. Solo se guardan obligaciones (con regla)
   y cumplimientos.

## Ficha de cliente (orden del formulario)

1. Tipo de persona: física / moral
2. Nombre de la empresa (`razon_social`, existe) + RFC (existe)
3. Contacto en la empresa: nombre, teléfono, WhatsApp
4. Acta constitutiva (archivo; solo se muestra para persona moral)
5. Nombre comercial (existe) y domicilio (existen: domicilio, colonia, cp, ciudad)
6. CSF (archivo) → obligaciones leídas → revisión → confirmar
7. Monto de facturación acordado (numérico, MXN) y condiciones de pago (texto libre)

Campos de Fase 1 (registro patronal, representante legal, giro) se conservan en la ficha.

## Datos

Migración `014_ficha_cliente.sql`:

```sql
ALTER TABLE empresas
  ADD COLUMN tipo_persona      VARCHAR(10) CHECK (tipo_persona IN ('fisica','moral')),
  ADD COLUMN contacto_nombre   VARCHAR(200),
  ADD COLUMN contacto_telefono VARCHAR(20),
  ADD COLUMN contacto_whatsapp VARCHAR(20),
  ADD COLUMN monto_facturacion NUMERIC(12,2),
  ADD COLUMN condiciones_pago  TEXT;

CREATE TABLE empresa_documentos (
  id          SERIAL PRIMARY KEY,
  empresa_id  INTEGER NOT NULL REFERENCES empresas(id),
  tipo        VARCHAR(10) NOT NULL CHECK (tipo IN ('acta','csf')),
  archivo     VARCHAR(300) NOT NULL,      -- relativa a UPLOADS_DIR
  nombre_original VARCHAR(300),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE empresa_obligaciones (
  id            SERIAL PRIMARY KEY,
  empresa_id    INTEGER NOT NULL REFERENCES empresas(id),
  descripcion   TEXT NOT NULL,
  vencimiento_texto TEXT,
  periodicidad  VARCHAR(12) NOT NULL CHECK (periodicidad IN ('mensual','bimestral','trimestral','anual','manual')),
  dia           SMALLINT,                 -- día de vencimiento
  mes           SMALLINT,                 -- solo anual: mes de vencimiento del ejercicio siguiente
  fecha_inicio  DATE,                     -- de la CSF
  fecha_fin     DATE,
  activa        BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (empresa_id, descripcion)
);

CREATE TABLE obligacion_cumplimientos (
  id              SERIAL PRIMARY KEY,
  obligacion_id   INTEGER NOT NULL REFERENCES empresa_obligaciones(id),
  periodo         VARCHAR(7) NOT NULL,    -- '2026-09' mensual, '2026-B5' bimestral, '2026-T3', '2026' anual
  fecha_presentacion DATE NOT NULL,
  acuse           VARCHAR(300),           -- relativa a UPLOADS_DIR, opcional
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (obligacion_id, periodo)
);
```

Historial de documentos: se guardan todos; el vigente es el más reciente por tipo.
Obligaciones solo se desactivan, nunca se borran (conservan cumplimientos).

## Lectura de CSF (`backend/src/lib/csf.js`)

- `pdf-parse` (ya instalado) → texto.
- Ubicar la sección "Obligaciones:" y separar filas (descripción, descripción vencimiento,
  fecha inicio, fecha fin). El formato exacto se ajusta con una CSF real.
- Clasificar vencimiento por regex:
  - "mes inmediato posterior" + "bimestre" → bimestral, día N
  - "mes inmediato posterior" + "trimestre" → trimestral, día N
  - "mes inmediato posterior" → mensual, día N
  - "<mes> del (año|ejercicio) siguiente" → anual, día N (o último del mes), mes M
  - otro → `manual`
- `pdf-parse` pega palabras en la CSF real ("Amástardareldía17delmesinmediato") y une descripción con
  vencimiento ("…salariosAmástardar…"): la clasificación trabaja sobre texto en minúsculas sin espacios y
  el corte descripción/vencimiento busca "A más tardar" / "Dentro de" / "Se presenta" / "En el mes" con
  espacios opcionales. Annual de personas morales: "Dentro de los tres meses siguientes al cierre del
  ejercicio" → anual, 31 de marzo.
- Problemas de lectura no bloquean: la respuesta trae `aviso` (sin texto legible / sin obligaciones /
  RFC de la CSF distinto al del cliente) y Diana captura o corrige a mano. El documento sí se guarda.
- Función pura `parseCsfText(texto) → [{descripcion, vencimiento_texto, periodicidad, dia, mes, fecha_inicio, fecha_fin}]`, testeada aparte.

Flujo:
1. `POST /api/empresas/:id/csf` (multipart) → guarda documento, devuelve obligaciones leídas
   comparadas con las actuales: `{documento, nuevas, existentes, desaparecidas, aviso}`. No modifica obligaciones.
2. `PUT /api/empresas/:id/obligaciones` con la lista confirmada (editada por Diana) →
   upsert por descripción; las que no vengan se desactivan.

## Cálculo de vencimientos (`backend/src/lib/vencimientos.js`)

Función pura `vencimientos(obligacion, desde, hasta) → [{periodo, fecha_vence}]`.

- Inicio efectivo: el mayor entre `fecha_inicio` y `created_at` de la obligación
  (evita cientos de "vencidas" históricas). Fin: `fecha_fin` si existe.
- Mensual: periodo mes M vence día N del mes M+1. Bimestral: bimestres ene-feb…; vence día N del
  mes siguiente al cierre. Trimestral análogo. Anual: ejercicio A vence día N del mes M de A+1.
- Si el día no existe en el mes → último día del mes. Sábado/domingo → siguiente lunes.
  `ponytail:` no considera días festivos oficiales; agregar tabla de inhábiles si hace falta.
- `manual`: no genera vencimientos automáticos (se muestra en la ficha como "fecha manual").
  Ponytail: en v1 no se capturan fechas manuales; agregar si Diana tiene obligaciones así.

Estado de cada vencimiento: `presentada` (hay cumplimiento), `vencida` (fecha < hoy),
`proxima` (≤ 7 días), `pendiente`.

Endpoints:
- `GET /api/obligaciones/calendario?desde&hasta&empresa_id` → vencimientos de todos los clientes
  activos (o uno), con estado. Default: mes actual ± lo vencido sin presentar.
- `GET /api/obligaciones/resumen` → `{vencidas, esta_semana}` para el inicio.
- `POST /api/obligaciones/:id/cumplimientos` (multipart, acuse opcional) `{periodo, fecha_presentacion}`.
- `DELETE /api/obligaciones/cumplimientos/:id` (deshacer).
- `GET /api/obligaciones/cumplimientos/:id/acuse` → descarga.

Estas rutas son del despacho (no usan `X-Empresa-Id`), igual que `/api/empresas`.
Roles: lectura todos; escritura admin y rh (como empresas).

## Frontend

- `EmpresaFormPage` → "Ficha de cliente" en secciones según el orden de arriba. Acta y CSF se
  suben después de crear el cliente (necesitan id); en alta nueva se muestra el aviso "guarda
  para subir documentos".
- Revisión de CSF: tabla editable (periodicidad, día, mes, incluir sí/no) → "Confirmar obligaciones".
- Nueva `ObligacionesPage` (`/obligaciones`, en nav): lista agrupada por fecha de vencimiento,
  filtros cliente/mes, badges de estado, botón "Presentada" → modal fecha + acuse; descarga de acuse.
- Banner en inicio: "N vencidas · M vencen esta semana" → liga a `/obligaciones`.
- La lista de empresas (`EmpresasPage`) se titula "Clientes".

## Pruebas

- `csf.test.js`: `parseCsfText` con el texto de una CSF real (anonimizada) + casos de regex.
- `vencimientos.test.js`: mensual/bimestral/anual, día 31 en febrero, fin de semana → lunes,
  inicio efectivo, fecha_fin.
- Rutas (supertest): subir CSF, confirmar obligaciones (upsert + desactivación), calendario con
  estados, registrar/deshacer cumplimiento, validaciones 400/404.

## Fuera de alcance

Recordatorios por correo/WhatsApp, días festivos, portal del cliente, cobranza de la facturación
acordada, fechas manuales para obligaciones no reconocidas.
