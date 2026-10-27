-- Agenda del despacho. Los vencimientos fiscales no se guardan aquí: salen al vuelo de empresa_obligaciones.
CREATE TABLE agenda_eventos (
  id          SERIAL PRIMARY KEY,
  fecha       DATE NOT NULL,
  hora        TIME,
  titulo      VARCHAR(200) NOT NULL CHECK (btrim(titulo) <> ''),
  tipo        VARCHAR(12) NOT NULL DEFAULT 'otro' CHECK (tipo IN ('cita', 'llamada', 'entrega', 'impuestos', 'otro')),
  empresa_id  INTEGER REFERENCES empresas(id),
  notas       TEXT,
  created_by  INTEGER REFERENCES usuarios(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_agenda_eventos_fecha ON agenda_eventos(fecha);
