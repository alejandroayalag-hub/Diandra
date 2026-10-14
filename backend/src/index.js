const app = require('./app');
const runMigrations = require('./db/migrate');

const PORT = process.env.PORT || 3015;

runMigrations()
  .then(() => {
    app.listen(PORT, () => console.log(`Backend DIANDRA corriendo en puerto ${PORT}`));
  })
  .catch(err => {
    console.error('Error en migraciones:', err);
    process.exit(1);
  });
