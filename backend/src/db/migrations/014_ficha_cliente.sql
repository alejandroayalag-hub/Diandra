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
