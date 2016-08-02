var path = require( "path" );
var execFile = require( "child_process" ).execFile;
var phantomPath = require( "phantomjs" ).path;
var phantomscript = path.resolve( path.join( __dirname, "shots.js" ) );
var md5File = require('md5-file');

exports.takeShot = function(cb){
    execFile( phantomPath, [
            phantomscript
    ],
    function( err, stdout, stderr ){
        if( err ){
            throw err;
        }

        if( stderr ){
            console.error( stderr );
        }
        if( stdout ) {
            //where the new captured screenshots are saved
            var arr = ['main/fixtures/newshots/groupedAssay.png',
                       'main/fixtures/newshots/linechart.png',
                       'main/fixtures/newshots/single.png',
                       'main/fixtures/newshots/timeBar.png',
                       'main/fixtures/newshots/groupedMeasurement.png'];

            // original hash values from main/fixtures/originalshots
            var originalHash = ['83ee2c402f6901ec378d34a212ca7058',
                                '575388bb060b856c618fc0669f6729f6',
                                '2437c217c4c65cbc493e473f181300bd',
                                '573908f6c11dee1d721363bba7155a4d',
                                '22e50c27d91a87c36b3fef85bcedec07'];
            //new hash values created from newshots
            var newHash = [];

            for (var i in arr) {
                newHash.push(md5File.sync(arr[i]))
            }

            for (var index in newHash) {
                if (newHash[index] == originalHash[index]) {
                    console.log('success: ' + arr[index].slice(23) + 'newHash' + newHash[index])
                }
                else {
                    console.log('fail: '  + arr[index].slice(23) + 'newHash' + newHash[index])
                }
            }
            process.exit(1);
        }
    })
};
