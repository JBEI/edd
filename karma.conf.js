// Karma configuration
// Generated on Tue Jul 12 2016 15:36:02 GMT-0700 (PDT)

module.exports = function(config) {
  config.set({

    // base path that will be used to resolve all patterns (eg. files, exclude)
    basePath: '',


    // frameworks to use
    // available frameworks: https://npmjs.org/browse/keyword/karma-adapter
    frameworks: ['jasmine'],


    // list of files / patterns to load in the browser
    files: [

     'main/static/main/js/GraphHelperMethods.js',
      'main/static/main/js/StudyGraphing.js',
      'main/static/main/js/test/*.js',

      'main/static/main/js/lib/underscore/underscore.js',
    ],



    // enable / disable watching file and executing tests whenever any file changes
    autoWatch: true,


    // start these browsers
    // available browser launchers: https://npmjs.org/browse/keyword/karma-launcher
    browsers: ['PhantomJS']
  })
}
