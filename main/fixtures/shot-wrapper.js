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
            var originalHash = ['dbafafa82f734b9056742038b83980af',
                                '75e5c192b28f7886775c42e35bae177a',
                                '8d33e364790f911825b442d7fb13d404',
                                '57ee7b6d7ca9e70b570446d74dacb18b'];
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
        }
    })
};
