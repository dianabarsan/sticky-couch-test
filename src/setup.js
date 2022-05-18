const request = require('request-promise-native');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const ddoc = require('../ddocs/main');
const { main, getUserDb } = require('./db');

const { COUCH_URL, COMPOSE_FILE, LOGS_DIR, auth } = require('./constants');

const dockerComposeCmd = (...params) => {
  return new Promise((resolve, reject) => {
    const cmd = spawn('docker-compose', [ '-f', COMPOSE_FILE, ...params ]);
    const output = [];
    const log = (data, error) => {
      data = data.toString();
      output.push(data);
      error ? console.error(data) : console.log(data);
    };

    cmd.on('error', (err) => {
      console.error(err);
      reject(err);
    });
    cmd.stdout.on('data', log);
    cmd.stderr.on('data', log);

    cmd.on('close', () => resolve(output));
  });
};

const createUser = async (username, server) => {
  await request.post({
    url: `${COUCH_URL}/_users`,
    auth,
    json: true,
    body: {
      _id: `org.couchdb.user:${username}`,
      name: username,
      type: 'user',
      roles: [],
      password: auth.password,
    }
  });
  await getUserDb(username, server);
};

const waitForCluster = async () => {
  const retryTimeout = () => new Promise(resolve => setTimeout(resolve, 1000));
  console.log('waiting for cluster to be ready');

  do {
    try {
      const membership = await request.get({ url: `${COUCH_URL}/_membership`, json: true, auth });
      if (membership.all_nodes.length < 3 || membership.cluster_nodes.length < 3) {
        throw new Error('Cluster not ready');
      }

      const cluster = await request.get({ uri: `${COUCH_URL}/_cluster_setup`, auth, json: true });
      if (cluster.state === 'cluster_enabled' || cluster.state === 'cluster_finished') {
        return;
      }

      throw new Error('Cluster not ready');
    } catch (err) {
      await retryTimeout();
    }
  } while (true);
}

const startContainers = async () => {
  await dockerComposeCmd('up', '-d', '--build');
  await waitForCluster();
};

const stopContainers = async () => {
  await saveLogs();
  return await dockerComposeCmd('down', '--remove-orphans', '--volumes');
};

const setupDb = async () => {
  try {
    await main.put(ddoc);
  } catch (err) {
    console.error('cant put ddoc');
    throw err;
  }

  try {
    await createUser('one', 'couchdb1');
    await createUser('two', 'couchdb2');
    await createUser('three', 'couchdb3');
  } catch (err) {
    console.error('cant create user', err);
    throw err;
  }
};

const getDockerLogs = (container) => {
  const logFile = path.resolve(LOGS_DIR, `${container}.log`);
  const logWriteStream = fs.createWriteStream(logFile, { flags: 'w' });

  return new Promise((resolve, reject) => {
    const cmd = spawn('docker', ['logs', container]);

    cmd.on('error', (err) => {
      console.error('Error while collecting container logs', err);
      reject(err);
    });
    cmd.stdout.pipe(logWriteStream, { end: false });
    cmd.stderr.pipe(logWriteStream, { end: false });

    cmd.on('close', () => {
      resolve();
      logWriteStream.end();
    });
  });
};

const getHaproxyLogs = () => {
  return new Promise((resolve, reject) => {
    const cmd = spawn('docker', ['logs', 'haproxy-stick']);
    const lines = [];

    cmd.on('error', (err) => {
      console.error('Error while collecting container logs', err);
      reject(err);
    });
    cmd.stdout.on('data', data => lines.push(data.toString()));
    cmd.stderr.on('data', data => lines.push(data.toString()));

    cmd.on('close', () => {
      // May 18 11:52:53 haproxy haproxy[25]: 172.30.0.1,couchdb3,three,201,PUT,/main/doc_2_29,three,'{"_id":"doc_2_29","value":29}',386,10,71
      const format = /^[^,]+,([^,]+),([^,]+)/;
      const parsed = lines.map(line => {
        const match = line.match(format) || [];
        return {
          server: match[1],
          user: match[2],
        };
      });

      resolve(parsed);
    });
  });
};


const saveLogs = async () => {
  try {
    await fs.promises.mkdir(LOGS_DIR);
  } catch (err) {}

  await getDockerLogs('couchdb.1-stick');
  await getDockerLogs('couchdb.2-stick');
  await getDockerLogs('couchdb.3-stick');
  await getDockerLogs('haproxy-stick');
};

module.exports = {
  startContainers,
  stopContainers,
  setupDb,
  getHaproxyLogs,
};
