var path = require( "path" );
var execFile = require( "child_process" ).execFile;
var phantomPath = "./node_modules/phantomjs/bin/phantomjs"
var phantomscript = path.resolve( path.join( __dirname, "shots.js" ) );

exports.takeShot = function(cb){
    execFile( phantomPath, [
            phantomscript,
    ],
    function( err, stdout, stderr ){
        if( err ){
            throw err;
        }

        if( stderr ){
            console.error( stderr );
        }

        if( stdout ){
            console.log( stdout );
        }
        if( cb ){
            cb();
        }
    });
};
