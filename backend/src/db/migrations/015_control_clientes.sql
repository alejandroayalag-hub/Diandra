-- Fase 3: control de clientes — cobranza de honorarios, documentos del mes y bitácora.
-- empresas.monto_facturacion = honorario mensual de Diana (cargos calculados al vuelo, ver lib/honorarios).
ALTER TABLE empresas
  ADD COLUMN cobro_desde VARCHAR(7) CHECK (cobro_desde ~ '^\d{4}-(0[1-9]|1[0-2])$');   -- NULL = mes de alta

CREATE TABLE honorario_pagos (
  id          SERIAL PRIMARY KEY,
  empresa_id  INTEGER NOT NULL REFERENCES empresas(id),
  monto       NUMERIC(12,2) NOT NULL CHECK (monto > 0),
  fecha_pago  DATE NOT NULL,
  forma_pago  VARCHAR(30),
  nota        TEXT,
  created_by  INTEGER REFERENCES usuarios(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_honorario_pagos_empresa ON honorario_pagos(empresa_id);

CREATE TABLE documentos_requeridos (
  id          SERIAL PRIMARY KEY,
  empresa_id  INTEGER NOT NULL REFERENCES empresas(id),
  nombre      VARCHAR(150) NOT NULL,
  activo      BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (empresa_id, nombre)
);

CREATE TABLE documentos_recibidos (
  id              SERIAL PRIMARY KEY,
  requerido_id    INTEGER NOT NULL REFERENCES documentos_requeridos(id),
  periodo         VARCHAR(7) NOT NULL CHECK (periodo ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  fecha_recibido  DATE NOT NULL,
  archivo         VARCHAR(300),            -- relativa a UPLOADS_DIR, opcional
  nombre_original VARCHAR(300),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (requerido_id, periodo)
);

CREATE TABLE bitacora (
  id          SERIAL PRIMARY KEY,
  empresa_id  INTEGER NOT NULL REFERENCES empresas(id),
  periodo     VARCHAR(7) NOT NULL CHECK (periodo ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  texto       TEXT NOT NULL CHECK (btrim(texto) <> ''),
  usuario_id  INTEGER REFERENCES usuarios(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_bitacora_empresa_periodo ON bitacora(empresa_id, periodo);
