exports.config = {
  seleniumAddress: 'http://localhost:4444/wd/hub',

  specs: [
    '*-spec.js',
  ],

  capabilities: {
    'browserName': 'chrome'
  },

  baseUrl: 'http://localhost:8000'
};
