module.exports = function(grunt) {

    grunt.loadNpmTasks('grunt-typescript');
    grunt.loadNpmTasks('grunt-contrib-watch');
    grunt.loadNpmTasks('grunt-contrib-copy');
    grunt.loadNpmTasks('grunt-contrib-clean');
    grunt.loadNpmTasks('grunt-exec');
    grunt.loadNpmTasks('grunt-insert-timestamp');
    grunt.loadNpmTasks('grunt-contrib-uglify');

    grunt.initConfig({
    	clean: {
    		build: ["./typescript/build/"]
        },
        insert_timestamp: {
            js: {
                options: {
                    prepend: true,
                    append: false,
                    // An alternative to the datetime option:  A function to call to return a Date object.
                    datetimefunc: function (fileList) {
                      var fs = require('fs');
                      var mostRecentMTime = 0;
                      // Find the most recently modified timestamp of specified files
                      fileList.forEach(function(filepath) {
                        statsObj = fs.statSync(filepath);
                        mTime = statsObj.mtime.getTime();
                        if (mTime > mostRecentMTime) { mostRecentMTime = mTime }
                      });
                      return new Date(mostRecentMTime);
                    },
                    // Uses default output of `Date()`
                    format: false,
                    template: '// File last modified on: {timestamp}  ',
                    insertNewlines: true
                },
                files: [{
                    // Use dynamic extend name
                    expand: true,
                    // Source dir
                    cwd: './typescript/build/',
                    // Match files
                    src: ['**/*.ts'],
                    // Output files
                    dest: './typescript/build/'
                }]
            }
        },
        typescript: {
            dev: {
                src: ['./typescript/build/*.ts'],
                dest: './typescript/build/',
                options: {
                    rootDir: './typescript/build/',
                    target: 'es5',
                    declaration: false,
                    inlineSourceMap: true,
                    inlineSources: true,
                    removeComments: false,
                }
            },
            commit: {
                src: ['./typescript/build/*.ts'],
                dest: './typescript/build/',
                options: {
                    rootDir: './typescript/build/',
                    target: 'es5',
                    declaration: false,
                    sourceMap: false,
                    removeComments: false,
                }
            },
            prod: {
                src: ['./typescript/build/*.ts'],
                dest: './typescript/build/',
                options: {
                    rootDir: './typescript/build/',
                    target: 'es5',
                    declaration: false,
                    sourceMap: false,
                    removeComments: true,
                }
            }
        },
        uglify: {
            options: {
                mangle: false
            },
            prod: {
                files: [{
                    expand: true,
                    cwd: './typescript/build/',
                    src: '**/*.js',
                    dest: './typescript/build/'
                }]
            }
        },
        copy: {
            prep: {
                cwd: './typescript/src/',    // set working folder / root to copy
                src: '**/*',                 // copy all files and subfolders
                dest: './typescript/build/', // destination folder
                expand: true                 // required when using cwd
            },
            mergeDev: {
                cwd: './typescript/build/',
                src: ['**/*.js'],
                dest: './main/static/main/js/',
                expand: true
            },
            mergeProd: {
                cwd: './typescript/build/',
                src: '**/*.js',
                dest: './main/static/main/js/',
                expand: true
            }
        },
        exec: {
            collect: {
                command: 'docker-compose exec appserver python manage.py collectstatic --noinput',
                stdout: true
            }
        },
        watch: {
            scripts: {
                files: ['./typescript/src/*.ts'],                 // the watched files
                tasks: ["clean:build", "copy:prep", "insert_timestamp:js", "typescript:dev", "copy:mergeDev", "exec:collect"],  // the task(s) to run
                options: {
                    spawn: false // makes the watch task faster
                }
            }
        }
    });


    var production = grunt.option('production');
    var commit = grunt.option('commit');
    var watch = grunt.option('watch');

    if (production) {
        // One-time production build
        grunt.registerTask('default', ["clean:build", "copy:prep", "typescript:prod", "uglify:prod", "copy:mergeProd", "exec:collect"]);
    } else if (watch) {
        // Dev build and watch for changes
        grunt.registerTask('default', ["clean:build", "copy:prep", "insert_timestamp:js", "typescript:dev", "copy:mergeDev", "exec:collect", 'watch']);
    } else if (commit) {
        // Dev build and watch for changes
        grunt.registerTask('default', ["clean:build", "copy:prep", "typescript:commit", "copy:mergeDev", "exec:collect"]);
    } else {
        // Standard one-time dev build
        grunt.registerTask('default', ["clean:build", "copy:prep", "insert_timestamp:js", "typescript:dev", "copy:mergeDev", "exec:collect"]);
    }
};



