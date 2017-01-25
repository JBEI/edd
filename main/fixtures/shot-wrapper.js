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
            var arr = ['main/fixtures/newshots/lineGraph.png',
                       'main/fixtures/newshots/barGraphByMeasurement.png',
                       'main/fixtures/newshots/barGraphByLine.png',
                       'main/fixtures/newshots/barGraphByTime.png'];

            // original hash values from main/fixtures/originalshots
            var originalHash = ['3749634f906c96c529420bca6a520b66',
                                'ff920032a15fd14ebdc779eba31f5a04',
                                '8c4ae2dfd9875061ce681d2936211077',
                                '280db12668a0e75d4438f1003e5a58bd'];
            //new hash values created from newshots
            var newHash = [];

            for (var i = 0; i < arr.length; i++) {
                newHash.push(md5File.sync(arr[i]))
            }

            for (var index = 0; index < newHash.length; index++) {
                if (newHash[index] == originalHash[index]) {
                    console.log('Match:   ' + arr[index].slice(23) + 'newHash' + newHash[index])
                }
                else {
                    console.log('Image changed!   '  + arr[index].slice(23) + ' , newHash: ' + newHash[index])
                }
            }
            process.exit(1);
        }
    })
};
