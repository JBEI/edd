/*
 * grunt-insert-timestamp
 * https://github.com/cr0ybot/grunt-insert-timestamp
 *
 * Copyright (c) 2015 Cory Hughart
 * Licensed under the MIT license.
 */

'use strict';

module.exports = function(grunt) {

  // Please see the Grunt documentation for more information regarding task
  // creation: http://gruntjs.com/creating-tasks

  grunt.registerMultiTask('insert_timestamp', 'Insert a timestamp into a file.', function() {
    // Helper modules
    var stringTemplate = require('string-template');

    // Merge task-specific and/or target-specific options with these defaults.
    var options = this.options({
      prepend: true,
      append: false,
      format: 'yyyy-mm-dd HH:MM:ss o',
      template: '/* {timestamp} */',
      datetime: new Date(),
      insertNewlines: true
    });

    // Iterate over all specified file groups.
    this.files.forEach(function(file) {
      // Concat specified files.
      var src = file.src.filter(function(filepath) {
        // Warn on and remove invalid source files (if nonull was set).
        if (!grunt.file.exists(filepath)) {
          grunt.log.warn('Source file "' + filepath + '" not found.');
          return false;
        } else {
          return true;
        }
      }).map(function(filepath) {
        // Read file source.
        return grunt.file.read(filepath);
      }).join('');

      // Handle options.
      var d = options.datetime,
          f = options.format,
          timestamp = (f && (typeof f === 'string' || f instanceof String)) ? grunt.template.date(d, f) : grunt.template.date(d),
          comment = stringTemplate(options.template, {
      	    timestamp: timestamp
          }),
          n = options.insertNewlines ? '\n' : '',
          output = src;

      if (options.prepend) { output = comment + n + output; }
      if (options.append) { output = output + n + comment; }

      // Write the destination file.
      grunt.file.write(file.dest, output);

      // Print a success message.
      grunt.log.writeln('File "' + file.dest + '" timestamped.');
    });
  });

};
