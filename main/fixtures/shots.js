
var CLASSIDS = ['blank', '#lineGraph', '#barGraphByMeasurement', '#barGraphByLine', '#barGraphByTime'],
    SCREENSHOT_WIDTH = 1280,
    SCREENSHOT_HEIGHT = 900,

    page = require("webpage").create();
    page.viewportSize = {width:SCREENSHOT_WIDTH, height:SCREENSHOT_HEIGHT};

function run(i) {
    if (i < 0) {
        return phantom.exit();
    }
    page.open('http://127.0.0.1:8081/', function (status) {
        page.onLoadFinished = function () {
            console.log('page loaded');
            console.log(i);
            if (i === 1) {
                page.evaluate(function () {
                    document.querySelector('#lineGraphButton').click();
                })
            }
            if (i === 2 ) {
                page.evaluate(function () {
                document.querySelector('#barGraphButton').click();
                document.querySelector('#measurementBarGraphButton').click();
                });
            } else if (i === 3) {
                page.evaluate(function () {
                    document.querySelector('#barGraphButton').click();
                    document.querySelector('#lineBarGraphButton').click();
                });
            } else if (i === 4) {
                page.evaluate(function () {
                document.querySelector('#barGraphButton').click();
                document.querySelector('#timeBarGraphButton').click();
            });
            }

            var clipRect = {
                "bottom": 1251.1875,
                "height": 902,
                "left": 15,
                "right": 1265,
                "top": 349.1875,
                "width": 1250
            };

            page.clipRect = {
                top: clipRect.top,
                left: clipRect.left,
                bottom: clipRect.bottom,
                width: clipRect.width,
                height: clipRect.height
            };

            var filename = CLASSIDS[i].slice(1) + '.png';
            console.log('file name ' + filename);

            setTimeout(function () {
                page.render('main/fixtures/newshots/' + filename);
                console.log('hopefully printed something');
            }, 2000);

        };
        setTimeout(function() {
    run(i - 1);
}, 3000)

    })
}
run(4);
