const pool = require('../db/pool');

const CulturaEmpresaModel = {
  async findById(empresaId, id) {
    const { rows } = await pool.query('SELECT * FROM cultura_empresa WHERE empresa_id = $1 AND id = $2', [empresaId, id]);
    return rows[0] || null;
  },

  async create(data) {
    const {
      empresaId,
      tipo,
      titulo,
      descripcion = '',
      archivos = [],
      orden = 0,
      activo = true,
      createdBy,
    } = data;

    const { rows } = await pool.query(
      `INSERT INTO cultura_empresa
        (empresa_id, tipo, titulo, descripcion, archivos, orden, activo, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        empresaId,
        tipo,
        titulo,
        descripcion,
        JSON.stringify(archivos),
        orden,
        activo,
        createdBy || null,
      ]
    );
    return rows[0];
  },

  async update(empresaId, id, data) {
    // Lista explícita de campos editables
    const EDITABLES = [
      'titulo',
      'descripcion',
      'archivos',
      'orden',
      'activo',
    ];

    const updates = {};
    Object.keys(data).forEach((key) => {
      // Convertir camelCase a snake_case
      const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
      if (EDITABLES.includes(snakeKey)) {
        // Convertir archivos a JSON string si es array
        if (snakeKey === 'archivos' && Array.isArray(data[key])) {
          updates[snakeKey] = JSON.stringify(data[key]);
        } else {
          updates[snakeKey] = data[key];
        }
      }
    });

    if (Object.keys(updates).length === 0) {
      return this.findById(empresaId, id);
    }

    const fields = Object.keys(updates);
    const values = fields.map((f) => updates[f]);
    const set = fields.map((f, i) => `${f} = $${i + 1}`).join(', ');

    const { rows } = await pool.query(
      `UPDATE cultura_empresa SET ${set}, updated_at = NOW()
       WHERE empresa_id = $${fields.length + 1} AND id = $${fields.length + 2} RETURNING *`,
      [...values, empresaId, id]
    );
    return rows[0] || null;
  },

  async delete(empresaId, id) {
    await pool.query('DELETE FROM cultura_empresa WHERE empresa_id = $1 AND id = $2', [empresaId, id]);
  },

  async findByEmpresaId(empresaId) {
    const { rows } = await pool.query(
      'SELECT * FROM cultura_empresa WHERE empresa_id = $1 ORDER BY orden ASC, created_at DESC',
      [empresaId]
    );
    return rows;
  },

  async findByEmpresaIdAndTipo(empresaId, tipo) {
    const { rows } = await pool.query(
      'SELECT * FROM cultura_empresa WHERE empresa_id = $1 AND tipo = $2',
      [empresaId, tipo]
    );
    return rows[0] || null;
  },

  async findActiveByEmpresaId(empresaId) {
    const { rows } = await pool.query(
      'SELECT * FROM cultura_empresa WHERE empresa_id = $1 AND activo = true ORDER BY orden ASC, created_at DESC',
      [empresaId]
    );
    return rows;
  },

  async addArchivo(empresaId, id, archivo) {
    // Fetch current archivos
    const current = await this.findById(empresaId, id);
    if (!current) return null;

    const archivos = Array.isArray(current.archivos)
      ? current.archivos
      : JSON.parse(current.archivos || '[]');
    const updatedArchivos = [...archivos, archivo];

    const { rows } = await pool.query(
      `UPDATE cultura_empresa SET archivos = $1, updated_at = NOW() WHERE id = $2 AND empresa_id = $3 RETURNING *`,
      [JSON.stringify(updatedArchivos), id, empresaId]
    );
    return rows[0] || null;
  },

  async removeArchivo(empresaId, id, archivoId) {
    // Fetch current archivos
    const current = await this.findById(empresaId, id);
    if (!current) return null;

    const archivos = Array.isArray(current.archivos)
      ? current.archivos
      : JSON.parse(current.archivos || '[]');
    const updatedArchivos = archivos.filter((a) => a.id !== archivoId);

    const { rows } = await pool.query(
      `UPDATE cultura_empresa SET archivos = $1, updated_at = NOW() WHERE id = $2 AND empresa_id = $3 RETURNING *`,
      [JSON.stringify(updatedArchivos), id, empresaId]
    );
    return rows[0] || null;
  },
};

module.exports = CulturaEmpresaModel;
