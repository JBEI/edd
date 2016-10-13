exports.config = {
  seleniumAddress: 'http://localhost:4444/wd/hub',

  specs: [
    '*-spec.js',
  ],

  capabilities: {
    'browserName': 'chrome'
  },
  baseUrl: 'http://localhost:8000',
  params: {
    'url': 'https://192.168.99.100/',
    'username': 'unprivileged_user',
    'password': 'insecure_pwd_ok_for_local_testing'
  }
};
