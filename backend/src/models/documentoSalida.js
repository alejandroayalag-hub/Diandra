const pool = require('../db/pool');

// create/update/delete/findBySalidaId no filtran empresa: el caller valida la salida o el documento antes.
const DocumentoSalidaModel = {
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

  async create(data) {
    const {
      salidaId,
      tipoDocumento,
      templateContenido,
      templateFechaGeneracion,
      templateUrl,
      documentoUrl,
      documentoNombre,
      documentoFechaCarga,
      documentoTamano,
      documentoTieneHuella,
      documentoTieneFirma,
      estado = 'template_generado',
      createdBy,
    } = data;

    const { rows } = await pool.query(
      `INSERT INTO documentos_salida
        (salida_id, tipo_documento, template_contenido, template_fecha_generacion, template_url,
         documento_url, documento_nombre, documento_fecha_carga, documento_tamano,
         documento_tiene_huella, documento_tiene_firma, estado, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING *`,
      [
        salidaId,
        tipoDocumento,
        templateContenido || null,
        templateFechaGeneracion || null,
        templateUrl || null,
        documentoUrl || null,
        documentoNombre || null,
        documentoFechaCarga || null,
        documentoTamano || null,
        documentoTieneHuella !== undefined ? documentoTieneHuella : null,
        documentoTieneFirma !== undefined ? documentoTieneFirma : null,
        estado,
        createdBy || null,
      ]
    );
    return rows[0];
  },

  async update(id, data) {
    // Lista explícita de campos editables
    const EDITABLES = [
      'template_contenido',
      'template_fecha_generacion',
      'template_url',
      'documento_url',
      'documento_nombre',
      'documento_fecha_carga',
      'documento_tamano',
      'documento_tiene_huella',
      'documento_tiene_firma',
      'estado',
    ];

    const updates = {};
    Object.keys(data).forEach((key) => {
      // Convertir camelCase a snake_case
      const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
      if (EDITABLES.includes(snakeKey)) {
        updates[snakeKey] = data[key];
      }
    });

    if (Object.keys(updates).length === 0) {
      const { rows } = await pool.query('SELECT * FROM documentos_salida WHERE id = $1', [id]);
      return rows[0] || null;
    }

    const fields = Object.keys(updates);
    const values = fields.map((f) => updates[f]);
    const set = fields.map((f, i) => `${f} = $${i + 1}`).join(', ');

    const { rows } = await pool.query(
      `UPDATE documentos_salida SET ${set}, updated_at = NOW() WHERE id = $${fields.length + 1} RETURNING *`,
      [...values, id]
    );
    return rows[0] || null;
  },

  async delete(id) {
    await pool.query('DELETE FROM documentos_salida WHERE id = $1', [id]);
  },

  async findBySalidaId(salidaId) {
    const { rows } = await pool.query(
      'SELECT * FROM documentos_salida WHERE salida_id = $1 ORDER BY created_at DESC',
      [salidaId]
    );
    return rows;
  },
};

module.exports = DocumentoSalidaModel;
