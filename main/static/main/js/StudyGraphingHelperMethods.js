/// <reference path="../typings/d3/d3.d.ts"/>;
var StudyHelper;
StudyHelper = {
    /** this function takes in element and returns an array of selectors
     * [<div id=​"linechart">​</div>​, <div id=​"timeBar">​</div>​, <div id=​"single">​</div>​,
     * <div id=​"barAssay">​</div>​]
     */
    getButtonElement: function (element) {
        return $(element.siblings(':first')).find("label");
    },
    /**
     * this function takes in the graphDiv element and returns an array of 4 buttons
     */
    getSelectorElement: function (element) {
        if ($(element).prop('id') != 'maingraph') {
            var selector = element.siblings().eq(1);
            return $(selector).children();
        }
        else {
            return element.siblings().addBack();
        }
    },
    /** this function takes in an element  selector and an array of svg rects and returns
     * returns message or nothing.
     */
    svgWidth: function (selector, rectArray) {
        $('.tooMuchData').remove();
        $('.noData').remove();
        var sum = 0;
        _.each(rectArray, function (rectElem) {
            if (rectElem.getAttribute("width") != 0) {
                sum++;
            }
        });
        if (sum === 0) {
            $(selector).prepend("<p class=' tooMuchData'>Too many data points to display- please " +
                "filter</p>");
        }
    },
    /** this function takes in the EDDData.MeasurementTypes object and returns the measurement type
     *  that has the most data points - options are based on family p, m, -, etc.
     */
    measurementType: function (types) {
        var proteomics = {};
        for (var type in types) {
            if (proteomics.hasOwnProperty(types[type].family)) {
                proteomics[types[type].family]++;
            }
            else {
                proteomics[types[type].family] = 0;
            }
        }
        for (var key in proteomics) {
            var max = 0;
            var maxType;
            if (proteomics[key] > max) {
                max = proteomics[key];
                maxType = key;
            }
        }
        return maxType;
    },
    /** this function takes in the selected button and an array of button selectors and activates
     *  or deactivates buttons.
     */
    barGraphActiveButton: function (selectedButton, buttons) {
        var barButton = buttons[1];
        $(buttons).removeClass('active');
        $(barButton).addClass('active');
        $(selectedButton).addClass('active');
    },
    /**
     * this function takes in the selector object and selector type and displays or hides the graph
     */
    displayGraph: function (selectors, selector) {
        for (var key in selectors) {
            if (key === selector) {
                d3.select(selectors[key]).style('display', 'block');
            }
            else {
                d3.select(selectors[key]).style('display', 'none');
            }
        }
    },
    /**
     * this function takes in the event, selector type, rect obj, selector object and
     * handles the button event.
     */
    buttonEventHandler: function (newSet, event, rect, selector, selectors, buttonArr) {
        event.preventDefault();
        if (newSet.length === 0) {
            $(selectors[selector]).prepend("<p class='noData'>No data selected - please " +
                "filter</p>");
            $('.tooMuchData').remove();
        }
        else {
            $('.noData').remove();
            StudyHelper.svgWidth(selectors[selector], rect);
        }
        StudyHelper.displayGraph(selectors, selector);
        StudyHelper.barGraphActiveButton(this, buttonArr);
        return false;
    },
    /**
     * this function takes in the type of measurement, selectors obj, selector type and
     * button obj and shows the measurement graph is the main type is proteomic
     */
    showProteomicGraph: function (type, selectors, selector, buttons) {
        if (type === 'p') {
            d3.select(selectors['line']).style('display', 'none');
            d3.select(selectors['bar-measurement']).style('display', 'block');
            $('label.btn').removeClass('active');
            var rects = d3.selectAll('.groupedMeasurement rect')[0];
            StudyHelper.svgWidth(selectors[selector], rects);
            var button = $('.groupByMeasurementBar')[0];
            $(buttons['bar-time']).removeClass('hidden');
            $(buttons['bar-line']).removeClass('hidden');
            $(buttons['bar-measurement']).removeClass('hidden');
            $(button).addClass('active');
            $(buttons['bar-empty']).addClass('active');
        }
    }
};
