var CLASSIDS = ['.linechart', '.single', '.groupedAssay', '.timeBar'],
    BUTTONIDS = ['.line', '.singleBar', '.groupByProteinBar', '.groupByTimeBar'];
    SCREENSHOT_WIDTH = 1280; 
    SCREENSHOT_HEIGHT = 900; 
    LOAD_WAIT_TIME = 5000; 
    page = require("webpage").create();

phantom.addCookie({
    'name': 'sessionid',
    'value': '3msg90gtxs2u0vglhb8fzyzubrwe3lt4',
    'domain': '192.168.99.100'
})

var renderPage = function(page, elementId, buttonId){

  var clipRect = page.evaluate(function(buttonId, elementId) {
        document.querySelector(buttonId).click();
        return document.querySelector(elementId).getBoundingClientRect();
    }, buttonId, elementId);
    
    console.log("this is the clipRect " + JSON.stringify(clipRect));
    
    page.clipRect = {
                top:    clipRect.top,
                left:   clipRect.left,
                bottom: clipRect.bottom,
                width:  clipRect.width - 300,
                height: clipRect.height
        };
    var filename = elementId.slice(1) + '.png';
    page.render('newshots/' + filename);
    console.log("rendered:", filename);
}



var exitIfLast = function(index,array){
    console.log(array.length - index-1, "more screenshots to go!")
    console.log("~~~~~~~~~~~~~~")
    if (index == array.length-1){
        console.log("exiting phantomjs")
        phantom.exit();
    }
};

var takeScreenshot = function(elementId, buttonId){

    console.log("opening with: ", elementId);
    console.log('button ', buttonId);

    page.viewportSize = {width:SCREENSHOT_WIDTH, height:SCREENSHOT_HEIGHT};

    page.open('http://192.168.99.100/study/30/');

    console.log("waiting for page to load...");

    page.onLoadFinished = function() {
        setTimeout(function(){
            console.log("that's long enough");
            renderPage(page, elementId, buttonId);
            exitIfLast(index,CLASSIDS);
            index++;
            takeScreenshot(CLASSIDS[index], BUTTONIDS[index]);
        },LOAD_WAIT_TIME)
    }

};

var index = 0; 

takeScreenshot(CLASSIDS[index], BUTTONIDS[index]);
