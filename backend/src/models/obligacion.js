const pool = require('../db/pool');

// Fechas como texto 'YYYY-MM-DD' (ver lib/vencimientos). `alta` = día en que se dio de alta en el sistema.
const COLS = `o.id, o.empresa_id, o.descripcion, o.vencimiento_texto, o.periodicidad, o.dia, o.mes,
  o.fecha_inicio::text AS fecha_inicio, o.fecha_fin::text AS fecha_fin, o.activa, (o.created_at AT TIME ZONE 'America/Mexico_City')::date::text AS alta`;

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
    const leidasPorDesc = new Map(leidas.map(o => [o.descripcion, o]));
    return {
      nuevas: leidas.filter(o => !actualesPorDesc.has(o.descripcion)),
      // Vigencia y texto salen de la CSF recién leída (puede traer fecha nueva); el resto, de lo ya guardado.
      existentes: actuales.filter(o => leidasPorDesc.has(o.descripcion)).map(o => {
        const l = leidasPorDesc.get(o.descripcion);
        return { ...o, fecha_inicio: l.fecha_inicio ?? null, fecha_fin: l.fecha_fin ?? null, vencimiento_texto: l.vencimiento_texto ?? null };
      }),
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
