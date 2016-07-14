
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
        window.setTimeout(function () {


            page.viewportSize = { width: 1440, height: 900 };

            var clipRect = page.evaluate(function(){
                document.querySelector('.groupByTimeBar').click()
                return document.querySelector('.timeBar').getBoundingClientRect();
            });

            page.clipRect = {
            top:    clipRect.top,
            left:   clipRect.left,
            bottom: clipRect.bottom,
            width:  clipRect.width,
            height: clipRect.height
            };

            page.render('screenshots/capture.png');
            phantom.exit();
        }, 200);
    }
});
