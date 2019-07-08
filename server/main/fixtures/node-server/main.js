var http = require("http");

fs = require('fs');
fs.readFile('./main/fixtures/node-server/index.html', function (err, html) {
    if (err) {
        throw err;
    }
    http.createServer(function(request, response) {
        if (request.url == '/') {
            response.writeHeader(200, {"Content-Type": "text/html"});
            response.write(html, function() {
                response.end();
            });
        }
        else if ((request.url).startsWith('/static')) {
            fs.readFile('./main' +request.url, function(err, file) {
                if (err) {
                    console.log('testing')
                    throw err;
                }
                response.write(file, function() {
                   response.end();
                });
            })
        } else if (request.url == '/edddata/') {
            fs.readFile('./main/fixtures/node-server/EDDData.json', function(err, file) {
                if (err) {
                    throw err;
                }
                response.writeHeader(200, {"Content-Type": "application/json"});
                response.write(file, function() {
                    response.end()
                });
            })
        } else if (request.url == '/favicon.ico' || request.url == '/spinner-big.gif') {
        } else if (request.url == '/measurements/1924/') {
             fs.readFile('./main/fixtures/node-server/1924.json', function(err, file) {
                if (err) {
                    throw err;
                }
                response.writeHeader(200, {"Content-Type": "application/json"});
                response.write(file, function() {
                    response.end()
                });
            })
        } else if (request.url == '/measurements/1930/') {
             fs.readFile('./main/fixtures/node-server/1930.json', function(err, file) {
                if (err) {
                    throw err;
                }
                response.writeHeader(200, {"Content-Type": "application/json"});
                response.write(file, function() {
                    response.end()
                });
            })
        }
        else if (request.url == '/measurements/1929/') {
             fs.readFile('./main/fixtures/node-server/1930.json', function(err, file) {
                if (err) {
                    throw err;
                }
                response.writeHeader(200, {"Content-Type": "application/json"});
                response.write(file, function() {
                    response.end()
                });
            })
        }
    }).listen(8081);
});



console.log('Setting up node server to begin taking and comparing screenshots');
