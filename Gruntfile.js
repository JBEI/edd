module.exports = function(grunt) {

	grunt.loadNpmTasks('grunt-typescript');
	grunt.loadNpmTasks("grunt-contrib-watch");
	grunt.loadNpmTasks('grunt-contrib-copy');

	grunt.initConfig({
	    typescript: {
	      buildDev: {
	        src: ['./typescript/build/*.ts'],
	        dest: './typescript/build/',
	        options: {
			  rootDir: './typescript/build/',
			  target: 'es5',
			  declaration: false,
	          sourceMap: true,
   	          removeComments: false,
	        }
	      },
	      buildProd: {
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
		copy: {
		  prep: {
		    cwd: './typescript/src/',      // set working folder / root to copy
		    src: '**/*',                               // copy all files and subfolders
		    dest: './typescript/build/', // destination folder
		    expand: true                               // required when using cwd
		  },
		  merge: {
		    cwd: './typescript/build/',
		    src: '**/*',
		    dest: './static/main/js/',
		    expand: true
		  }
		},
		watch: {
		    scripts: {
		        files: ['./typescript/src/*.ts'],                 // the watched files
		        tasks: ["copy:prep", "typescript:buildDev", "copy:merge"],  // the task(s) to run
		        options: {
		            spawn: false // makes the watch task faster
		        }
		    }
		}
	});


    var production = grunt.option('production');
    var watch = grunt.option('watch');

    if (production) {
    	// One-time production build
	  	grunt.registerTask('default', ["copy:prep", "typescript:buildProd", "copy:merge"]);
    } else if (watch) {
    	// Dev build and watch for changes
	  	grunt.registerTask('default', ["copy:prep", "typescript:buildDev", "copy:merge", 'watch']);
    } else {
    	// Standard one-time dev build
	  	grunt.registerTask('default', ["copy:prep", "typescript:buildDev", "copy:merge"]);
    }
};



