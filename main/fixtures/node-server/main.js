var http = require("http");

fs = require('fs');
fs.readFile('index.html', function (err, html) {
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
            fs.readFile('../../../main' +request.url, function(err, file) {
                console.log("FILE: " + request.url);
                if (err) {
                    throw err;
                }
                response.write(file, function() {
                   response.end();
                });
            })
        } else if (request.url == '/edddata/') {
            fs.readFile('EDDData.json', function(err, file) {
                console.log("FILE: " + request.url);
                if (err) {
                    throw err;
                }
                response.writeHeader(200, {"Content-Type": "application/json"});
                response.write(file, function() {
                    response.end()
                });
            })
        } else if (request.url == '/favicon.ico') {
            console.log('skipping' + request.url);
        } else if (request.url == '/measurements/1924/') {
             fs.readFile('1924.json', function(err, file) {
                console.log("FILE: " + request.url);
                if (err) {
                    throw err;
                }
                response.writeHeader(200, {"Content-Type": "application/json"});
                response.write(file, function() {
                    response.end()
                });
            })
        } else if (request.url == '/measurements/1930/') {
             fs.readFile('1930.json', function(err, file) {
                console.log("FILE: " + request.url);
                if (err) {
                    throw err;
                }
                response.writeHeader(200, {"Content-Type": "application/json"});
                response.write(file, function() {
                    response.end()
                });
            })
        }
        else {
            console.log('missing data: ' + request.url)
        }
    }).listen(8081);
});

// Console will print the message
console.log('Server running at http://127.0.0.1:8081/');
