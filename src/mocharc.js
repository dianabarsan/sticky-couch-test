module.exports = {
  allowUncaught: false,
  color: true,
  checkLeaks: true,
  fullTrace: true,
  asyncOnly: true,
  spec: [
    'src/**/*.js',
  ],
  timeout: 135 * 1000, //API takes a little long to start up
  reporter: 'spec',
  require: [ 'src/hooks.js' ],
  captureFile: 'results.txt',
  exit: true,
};
