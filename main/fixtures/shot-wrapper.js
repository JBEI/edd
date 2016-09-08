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
                       'main/fixtures/newshots/linechart.png',
                       'main/fixtures/newshots/timeBar.png',
                       'main/fixtures/newshots/groupedMeasurement.png'];

            // original hash values from main/fixtures/originalshots
            var originalHash = ['9edf3944c54ee83a142e09d6cf757994',
                                '23426bc1cd40afd793b6466c88e09386',
                                '62e8746b4399016dae9938a39f089b4f',
                                '79772182eeb799c2a888e071e6e781f6'];
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
                    console.log('Image changed!m   d: '  + arr[index].slice(23) + ', newHash: ' + newHash[index])
                }
            }
            process.exit(1);
        }
    })
};
