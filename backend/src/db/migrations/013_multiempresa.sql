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
