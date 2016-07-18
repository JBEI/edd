var path = require( "path" );
var execFile = require( "child_process" ).execFile;
var phantomPath = require( "phantomjs" ).path;
var phantomscript = path.resolve( path.join( __dirname, "shots.js" ) );
var md5File = require('md5-file/promise')

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
            md5File('newshots/linechart.png').then(function(hash) {
            if (hash != '294bbd84b8276e8b696e9b307a7409b0') {
                console.log('FAIL');
            }
            else {
                console.log('great success!');
            }
            })
        }
    })
};

