const PouchDB = require('pouchdb-core');
PouchDB.plugin(require('pouchdb-adapter-http'));
PouchDB.plugin(require('pouchdb-mapreduce'));

const { COUCH_URL, DBNAME, auth } = require('./constants');

const getFetchFn = (server, username = auth.username) => (url, opts) => {
  opts.headers.set('cookie', `SRVNAME=${server};` );
  opts.headers.set('user', username);
  return PouchDB.fetch(url, opts);
};

const main = new PouchDB(`${COUCH_URL}/${DBNAME}`, { auth, fetch: getFetchFn('couchdb2') });
const userDbs = {};
const getUserDb = (username, server) => {
  if (userDbs[username]) {
    return userDbs[username];
  }

  const fetch = getFetchFn(server, username);
  const db =  new PouchDB(`${COUCH_URL}/${DBNAME}`, { fetch, auth: { username, password: auth.password } });
  userDbs[username] = db;
  return db;
};

module.exports = {
  main,
  getUserDb,
};
