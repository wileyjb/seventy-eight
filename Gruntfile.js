module.exports = function(grunt) {
  grunt.loadNpmTasks('grunt-jasmine-node');
  grunt.loadNpmTasks('grunt-istanbul');
  grunt.loadNpmTasks('grunt-env');
  
  // Project configuration.
  grunt.initConfig({
    pkg: grunt.file.readJSON('package.json'),
    env: {
      coverage: {
        APP_DIR_FOR_CODE_COVERAGE: '../test/coverage/instrument/src/'
      }
    },
    instrument: {
      files: 'src/**/*.js',
      options: {
        lazy: true,
        basePath: 'test/coverage/instrument/'
      }
    },
    jasmine_node: {
      specNameMatcher: 'spec'
    },
    storeCoverage: {
      options: {
        dir: 'test/coverage/reports'
      }
    },
    makeReport: {
      src: 'test/coverage/reports/**/*.json',
      options: {
        type: 'lcov',
        dir: 'test/coverage/reports',
        print: 'detail'
      }
    }
  });

  grunt.registerTask('local', 'load local configs', function() {
    require('./local/process.env');
  });

  grunt.registerTask('setup', 'load local configs', function() {
    var done = this.async();
    var setup = require('./test/setup');
    setup.then(done);
  });

  grunt.registerTask('teardown', 'load local configs', function() {
    var done = this.async();
    var setup = require('./test/teardown');
    setup.then(done);
  });

  grunt.registerTask('test', ['local', 'setup', 'jasmine_node', 'teardown']);

  grunt.registerTask('test_integration', ['setup', 'jasmine_node', 'teardown']);

  grunt.registerTask('coverage', ['env:coverage', 'instrument', 'test', 'storeCoverage', 'makeReport']);

};