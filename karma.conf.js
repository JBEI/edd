// Karma configuration
// Generated on Tue Jul 12 2016 15:36:02 GMT-0700 (PDT)

module.exports = function(config) {
  config.set({

    // base path that will be used to resolve all patterns (eg. files, exclude)
    basePath: '.',

    // frameworks to use
    // available frameworks: https://npmjs.org/browse/keyword/karma-adapter
    frameworks: ['jasmine'],


    // list of files / patterns to load in the browser
    files: [
      'main/static/main/js/lib/d3/d3.min.js',
      'main/static/main/js/lib/filedrop-min.js',
      'main/static/main/js/lib/jquery/jquery.js',
      'main/static/main/js/lib/jquery-ui/jquery-ui.min.js',
      'main/static/main/js/lib/jasmine/jasmine-jquery.js',
      'main/static/main/js/EDDGraphingTools.js',
      'main/static/main/js/Utl.js',
      'main/static/main/js/DataGrid.js',
      'main/static/main/js/Study-Lines.js',
      'main/static/main/js/Study-Data.js',
      'main/static/main/js/Import.js',
      'main/static/main/js/AssayTableDataGraphing.js',
      'main/static/main/js/EDDEditableElement.js',
      'main/static/main/js/test/*.js',
      'main/static/main/js/lib/underscore/underscore.js',
      'main/static/main/js/Study-Create.js',
       // JSON fixture
      { pattern:  'main/static/main/js/test/EDDData.json',
        watched:  true,
        served:   true,
        included: false },
        { pattern:  'main/static/main/js/test/SpecRunner.html',
        watched:  true,
        served:   true,
        included: false }
    ],

    proxies: {
      '/edddata/': '/base/main/static/main/js/test/EDDData.json',
      '/study/10/assaydata/': '/base/main/static/main/js/test/assay.json'
    },

    // enable / disable watching file and executing tests whenever any file changes
    autoWatch: true,

    // start these browsers
    // available browser launchers: https://npmjs.org/browse/keyword/karma-launcher

  })
};
