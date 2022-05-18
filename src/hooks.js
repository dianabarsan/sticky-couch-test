const setup = require('./setup');

module.exports.mochaHooks = {
  beforeAll: async () => {
    await setup.startContainers();
    await setup.setupDb();
  },

  afterAll: async () => {
    await setup.stopContainers();
  }
};
