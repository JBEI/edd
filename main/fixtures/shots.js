
var CLASSIDS = ['.linechart', '.barAssay', '.barTime', '.barMeasurement'],
    BUTTONIDS = ['.line', '.groupByProteinBar', '.groupByTimeBar', '.groupByMeasurementBar'],
    SCREENSHOT_WIDTH = 1280,
    SCREENSHOT_HEIGHT = 900,
    LOAD_WAIT_TIME = 5000,
    page = require("webpage").create();

var renderPage = function(page, elementId, buttonId){

  var clipRect = page.evaluate(function(buttonId, elementId) {
        if (buttonId != '.line') {
            document.querySelector('.active').click();
            document.querySelector(buttonId).click();
        } else {
            document.querySelector(buttonId).click();
        }
        return document.querySelector(elementId).getBoundingClientRect();
    }, buttonId, elementId);
    
    console.log("this is the clipRect " + JSON.stringify(clipRect));
    
    page.clipRect = {
                top:    clipRect.top,
                left:   clipRect.left,
                bottom: clipRect.bottom,
                width:  clipRect.width,
                height: clipRect.height
        };
    var filename = elementId.slice(1) + '.png';
    page.render('main/fixtures/newshots/' + filename);
    console.log("rendered:", filename);
};



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

    page.open('http://127.0.0.1:8081/');

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
