module.exports = function(grunt) {

	grunt.loadNpmTasks('grunt-typescript');

	grunt.initConfig({
	    typescript: {
	      base: {
	        src: ['./typescript/*.ts'],
	        dest: './main/static/main/js/',
	        options: {
			  rootDir: './typescript',
	          sourceMap: true,
              declaration: true,
	          removeComments: false 
	        }
	      }
	    }
	});

  	grunt.registerTask('default', 'typescript');

};


