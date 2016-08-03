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
            var originalHash = ['e7e30a6399026842efba2a9fc47455fb',
                                '8d352252ea759d86063396bad715b799',
                                'f52d467fbcd49b0fdd4ff1a817ad05f7',
                                'bb8442da463044321604e86a40eae7fa',
                                '198ad0f5cd34435eca033ef01275e7da'];
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
