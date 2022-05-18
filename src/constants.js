const path = require('path');
const PORT = process.env.HAPROXY_PORT || 5984;

module.exports = {
  PORT: PORT,
  DBNAME: 'main',
  auth: {
    username: process.env.COUCHDB_USER || 'admin',
    password: process.env.COUCHDB_PASSWORD || 'pass',
  },
  COUCH_URL: `http://localhost:${PORT}`,
  COMPOSE_FILE: path.resolve(__dirname, '..', 'docker-compose.yml'),
  LOGS_DIR: path.resolve(__dirname, '..', 'logs'),
};
