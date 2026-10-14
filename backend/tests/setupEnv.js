const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.DB_HOST = process.env.DB_HOST || 'localhost';
process.env.DB_PORT = process.env.DB_PORT || '5445';
process.env.DB_NAME = 'diandra_test';
process.env.DB_USER = process.env.DB_USER || 'diandra_user';
process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'diandra_local';
process.env.JWT_SECRET = 'test-secret';
process.env.UPLOADS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'diandra-uploads-'));
