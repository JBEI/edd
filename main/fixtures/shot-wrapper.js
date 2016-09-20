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
            var arr = ['main/fixtures/newshots/barAssay.png',
                       'main/fixtures/newshots/barMeasurement.png',
                       'main/fixtures/newshots/linechart.png',
                       'main/fixtures/newshots/barTime.png'];

            // original hash values from main/fixtures/originalshots
            var originalHash = ['24a15d9a5d739c6dde7d2dbcb5695e02',
                                '47adb70698d5c41c5abcf6319cdb6281',
                                '7b0cbf2a6079c0135e62ade28f88e1b2',
                                '0881c5ee6f544e122846230c48752a37'];
            //new hash values created from newshots
            var newHash = [];

            for (var i in arr) {
                newHash.push(md5File.sync(arr[i]))
            }

            for (var index in newHash) {
                if (newHash[index] == originalHash[index]) {
                    console.log('Match: ' + arr[index].slice(23) + 'newHash' + newHash[index])
                }
                else {
                    console.log('Image changed!   '  + arr[index].slice(23) + ' , newHash: ' + newHash[index])
                }
            }
            process.exit(1);
        }
    })
};
