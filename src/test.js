const { expect } = require('chai');

const db = require('./db');
const setup = require('./setup');
const LIMIT = 10;
const NBR = 200;
const WAIT_BETWEEN_SAVES = 50;

const difference = (array1, array2) => {
  return array1.filter(item => !array2.includes(item));
};

const getChanges = async (userDb, since = 0, pending) => {
  pending.splice(0, pending.length);

  const viewResults = await userDb.query('main/main');
  const docIds = viewResults.rows.map(row => row.id);
  const response = await userDb.changes({
    limit: LIMIT,
    doc_ids: docIds,
    since: since,
    batch_size: docIds.length + 1,
  });

  const receivedIds = response.results.map(result => result.id);
  receivedIds.push(...pending);
  pending.splice(0, pending.length);

  return {
    receivedIds,
    lastSeq: response.last_seq,
  };
};

const listenForChanges = (username, docIds, view = 'by_id') => {
  const userDb = db.getUserDb(username);

  const receivedDocs = [];
  const continuous = userDb.changes({ live: true, since: 'now' });

  const promise = new Promise((resolve, reject) => {
    continuous.on('change', async (change) => {
      const opts = {
        startkey: [change.id],
        endkey: [change.id, {}],
        include_docs: true
      };
      const viewResults = await userDb.query(`main/${view}`, opts );
      const docs = viewResults.rows.map(row => row.doc);
      if (!docs.length) {
        reject(new Error(`Failed after ${receivedDocs.length} docs, missing doc ${JSON.stringify(change)} ${JSON.stringify(viewResults)}`));
      }
      receivedDocs.push(docs[0]._id);
      const diff = difference(docIds, receivedDocs);
      if (!diff.length) {
        resolve();
      }
    });
  });

  return () => promise;
};

const getChangesForDocs = async (username, docIds) => {
  const userDb = db.getUserDb(username);

  const pending = [];
  const continuous = db.main
    .changes({
      live: true,
      include_docs: true,
      since: 'now',
    })
    .on('change', (change) => {
      pending.push(change.id);
    });

  const receivedIds = [];
  let since = 0;
  let retries = 100000000;
  let missing;
  do {
    retries--;

    const response = await getChanges(userDb, since, pending);
    receivedIds.push(...response.receivedIds);
    since = response.lastSeq;
    missing = difference(docIds, receivedIds);
  } while (retries && missing.length);

  continuous.cancel();
  return missing;
};

const saveDocs = async (username, docs) => {
  const userDb = db.getUserDb(username);

  for (const doc of docs) {
    await userDb.put(doc);
    if (WAIT_BETWEEN_SAVES) {
      await new Promise((r) => setTimeout(r, WAIT_BETWEEN_SAVES));
    }
  }
};

const uniq = array => [...new Set(array)];
const getServersByUser = (parsedLogs, user) => parsedLogs
  .filter(parsed => parsed.user === user)
  .map(parsed => parsed.server);

describe('user should get changes other users push to other nodes', () => {
  it('should get all changes as an "offline" user when other users push to other nodes', async () => {
    const docs1 = Array.from({ length: NBR }).map((_, idx) => ({ _id: `doc_1_${idx}`, value: idx }));
    const docs2 = Array.from({ length: NBR }).map((_, idx) => ({ _id: `doc_2_${idx}`, value: idx }));

    const allDocsIds = [
      ...docs1.map(doc => doc._id),
      ...docs2.map(doc => doc._id),
    ];

    const result = await Promise.all([
      getChangesForDocs('one', allDocsIds),
      saveDocs('two', docs1),
      saveDocs('three', docs2),
    ]);

    console.log(result[0]);
    expect(result[0].length).to.equal(0);
  });

  it('should index regular view', async () => {
    const docs1 = Array.from({ length: NBR }).map((_, idx) => ({ _id: `doc_3_${idx}`, value: idx }));
    const docs2 = Array.from({ length: NBR }).map((_, idx) => ({ _id: `doc_4_${idx}`, value: idx }));

    const allDocsIds = [
      ...docs1.map(doc => doc._id),
      ...docs2.map(doc => doc._id),
    ];

    const promiseFn = listenForChanges('one', allDocsIds, 'main');
    await Promise.all([
      promiseFn(),
      saveDocs('two', docs1),
      saveDocs('three', docs2),
    ]);
  });

  it('should index linked documents view', async () => {
    const docs1 = Array.from({ length: NBR }).map((_, idx) => ({ _id: `doc_5_${idx}`, value: idx }));
    const docs2 = Array.from({ length: NBR }).map((_, idx) => ({ _id: `doc_6_${idx}`, value: idx }));

    const allDocsIds = [
      ...docs1.map(doc => doc._id),
      ...docs2.map(doc => doc._id),
    ];

    const promiseFn = listenForChanges('one', allDocsIds, 'by_id');
    await Promise.all([
      promiseFn(),
      saveDocs('two', docs1),
      saveDocs('three', docs2),
    ]);
  });

  it('sessions should be sticky', async () => {
    const parsedLogs = await setup.getHaproxyLogs();

    const adminSrv = uniq(getServersByUser(parsedLogs, 'admin'));
    const oneSrv = uniq(getServersByUser(parsedLogs, 'one'));
    const twoSrv = uniq(getServersByUser(parsedLogs, 'two'));
    const threeSrv = uniq(getServersByUser(parsedLogs, 'three'));

    expect(adminSrv.length).to.equal(1);
    expect(oneSrv.length).to.equal(1);
    expect(twoSrv.length).to.equal(1);
    expect(threeSrv.length).to.equal(1);

    expect(uniq([adminSrv[0], oneSrv[0], twoSrv[1], threeSrv[2]]).length).to.equal(3);
  });
});
