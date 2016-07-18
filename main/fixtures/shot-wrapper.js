var path = require( "path" );
var execFile = require( "child_process" ).execFile;
var phantomPath = require( "phantomjs" ).path;
var phantomscript = path.resolve( path.join( __dirname, "shots.js" ) );
var md5File = require('md5-file')

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
                       'main/fixtures/newshots/timeBar.png'];

            // original hash values from main/fixtures/originalshots
            var originalHash = ['d6d3bbc3981d4cc782653aa91cfa920a',
                                '294bbd84b8276e8b696e9b307a7409b0',
                                '480184f1c8f23a8df887297ec6dac253',
                                'b25f14a9358025f2d18820391d5b294a'];
            //new hash values created from newshots
            var newHash = [];

            for (var i in arr) {
                newHash.push(md5File.sync(arr[i]))
            }

            for (var index in newHash) {
                if (newHash[index] == originalHash[index]) {
                    console.log('success: ' + arr[index].slice(23))
                }
                else {
                    console.log('fail: '  + arr[index].slice(23))
                }
            }
        }
    })
};
