
phantom.addCookie({
    'name': 'sessionid',
    'value': '3msg90gtxs2u0vglhb8fzyzubrwe3lt4',
    'domain': '192.168.99.100'
})

var page = require('webpage').create();

page.open("http://192.168.99.100/study/30/", function (status) {
    if (status !== 'success') {
        console.log('Unable to load the address!');
    } else {
        var classIds = ['linechart', 'single', 'groupedAssay', 'timeBar'];

        var buttonIds = ['line', 'singleBar', 'groupByProteinBar', 'groupByTimeBar'];
window.setTimeout(function () {
        for (var i = 0; i < buttonIds.length; i++) {


console.log(buttonIds[i]);
                page.viewportSize = { width: 1440, height: 900 };

                var clipRect = page.evaluate(function(){
                    document.querySelector(buttonIds[i]).click()
                    return document.querySelector(classIds[i]).getBoundingClientRect();
                });

                page.clipRect = {
                top:    clipRect.top,
                left:   clipRect.left,
                bottom: clipRect.bottom,
                width:  clipRect.width,
                height: clipRect.height
                };

                page.render('screenshots/' + classIds[i]);
                

        }
     }, 1000);
    }
});

/*
    requires: phantomjs, async
    usage: phantomjs capture.js
*/
// var async = require('async'),
//     sizes = [
//         [320, 480],
//         [320, 568],
//         [600, 1024],
//         [1024, 768],
//         [1280, 800],
//         [1440, 900]
//     ];
//
// function capture(sizes, callback) {
//     var page = require('webpage').create();
//     page.viewportSize = {
//         width: sizes[0],
//         height: sizes[1]
//     };
//     page.zoomFactor = 1;
//     page.open('http://daker.me', function (status) {
//         var filename = sizes[0] + 'x' + sizes[1] + '.png';
//         page.render('./screenshots/' + filename);
//         page.close();
//         callback.apply();
//     });
// }
//
// async.eachSeries(sizes, capture, function (e) {
//     if (e) console.log(e);
//     console.log('done!');
//     phantom.exit();
// });
