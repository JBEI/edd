/// <reference path="../typings/d3/d3.d.ts"/>;
var StudyHelper;
StudyHelper = {
    /* this function takes in an element, graph options, and selector element and
         *  is the event handler for the hide y-axis checkbox on the line graph.
         */
    toggleLine: function (element, graphSet, selector) {
        if ($(element + ' [type="checkbox"]').attr('checked') != 'checked') {
            $(element + ' [type="checkbox"]').attr('checked', 'checked');
            d3.select(element + ' svg').remove();
            createMultiLineGraph(graphSet, GraphHelperMethods.createNoAxisSvg(selector[1]));
            d3.selectAll(element + ' .y.axis').remove();
            d3.selectAll('.icon').remove();
        }
        else {
            $(element + ' [type="checkbox"]').removeAttr('checked');
            d3.select(element + ' svg').remove();
            createMultiLineGraph(graphSet, GraphHelperMethods.createSvg(selector[1]));
        }
    },
    /* this function takes in an element, graph options, and selector element and
    *  renders the graph with our without the y-axis
    */
    isCheckedLine: function (element, graphSet, selector) {
        if ($(element + ' [type="checkbox"]').attr('checked') === 'checked') {
            createMultiLineGraph(graphSet, GraphHelperMethods.createNoAxisSvg(selector[1]));
            d3.selectAll(element + ' .y.axis').remove();
            d3.selectAll('.icon').remove();
        }
        else if ($(element + ' [type="checkbox"]').attr('checked') != 'checked') {
            createMultiLineGraph(graphSet, GraphHelperMethods.createSvg(selector[1]));
        }
    },
    /* this function takes in an element, graph options, and selector element and
    *  is the event handler for the hide y-axis checkbox on the bar graphs
    */
    toggle: function (element, graphSet, selector, type) {
        if ($(element + ' [type="checkbox"]').attr('checked') != 'checked') {
            $(element + ' [type="checkbox"]').attr('checked', 'checked');
            d3.select(element + ' svg').remove();
            createGroupedBarGraph(graphSet, GraphHelperMethods.createNoAxisSvg(selector), type);
            d3.selectAll(element + ' .y.axis').remove();
            d3.selectAll('.icon').remove();
        }
        else {
            $(element + ' [type="checkbox"]').removeAttr('checked');
            d3.select(element + ' svg').remove();
            createGroupedBarGraph(graphSet, GraphHelperMethods.createSvg(selector), type);
        }
    },
    /* this function takes in an element, graph options, and selector element and
    *  renders the graph with our without the y-axis
    */
    isChecked: function (element, graphSet, selector, type) {
        if ($(element + ' [type="checkbox"]').attr('checked') === 'checked') {
            createGroupedBarGraph(graphSet, GraphHelperMethods.createNoAxisSvg(selector), type);
            d3.selectAll(element + ' .y.axis').remove();
            d3.selectAll('.icon').remove();
        }
        else if ($(element + ' [type="checkbox"]').attr('checked') != 'checked') {
            createGroupedBarGraph(graphSet, GraphHelperMethods.createSvg(selector), type);
        }
    },
    /* this function takes in element and returns an array of selectors
    * [<div id=​"linechart">​</div>​, <div id=​"timeBar">​</div>​, <div id=​"single">​</div>​,
    * <div id=​"barAssay">​</div>​]
    */
    getButtonElement: function (element) {
        if (($(element).siblings().siblings()).size() < 8) {
            return $(element.siblings()[0]).find("label");
        }
        else {
            return $(element.siblings()[1]).find("label");
        }
    },
    // this function takes in the graphDiv element and returns an array of 4 buttons
    getSelectorElement: function (element) {
        return element.siblings().siblings();
    },
    findOtherValues: function (element) {
        var otherElements = [], values = ['.linechart', '.barAssay', '.barTime', '.barMeasurement'];
        _.each(values, function (value) {
            if (value != element) {
                otherElements.push(value);
            }
        });
        return otherElements;
    },
    /* this function takes in an element  selector and an array of svg rects and returns
     * returns message or nothing.
     */
    svgWidth: function (selector, rectArray) {
        $('.tooMuchData').remove();
        var sum = 0;
        _.each(rectArray, function (rectElem) {
            if (rectElem.getAttribute("width") != 0) {
                sum++;
            }
        });
        if (sum === 0) {
            $(selector).prepend("<p class=' tooMuchData'>Too much data to display- please filter" +
                " </p>");
        }
    },
    /* this function takes in an element  selector and an array of svg rects and returns
    * returns message or nothing.
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
    /* this function takes in the selected button and an array of button selectors and activates
    *  or deactivates buttons.
    */
    barGraphActiveButton: function (selectedButton, buttons) {
        var barButton = buttons[1];
        if ($(barButton).hasClass('active')) {
            $(buttons[0]).removeClass('active');
        }
        _.each(buttons, function (button) {
            if (selectedButton != button) {
                $(button).removeClass('active');
            }
        });
        $(barButton).addClass('active');
        $(selectedButton).addClass('active');
    },
    /*
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
    /*
     * this function takes in the event, selector type, rect obj, selector object and
     * handles the button event.
     */
    buttonEventHandler: function (event, rect, selector, selectors, buttonArr) {
        event.preventDefault();
        StudyHelper.svgWidth(selectors[selector], rect);
        StudyHelper.displayGraph(selectors, selector);
        StudyHelper.barGraphActiveButton(this, buttonArr);
        return false;
    },
    /*
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
