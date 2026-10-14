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
