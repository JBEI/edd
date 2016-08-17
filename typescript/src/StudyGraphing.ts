/// <reference path="../typings/d3/d3.d.ts"/>;
/// <reference path="GraphHelperMethods.ts" />

var StudyDGraphing:any;

declare var createLineGraph;
declare var createMultiLineGraph;
declare var createGroupedBarGraph;

StudyDGraphing = {

	Setup:function(graphdiv) {

		if (graphdiv) {
			this.graphDiv = $("#" + graphdiv);
		} else {
			this.graphDiv = $("#graphDiv");
        }
	},

	clearAllSets:function() {

        var divs =  this.graphDiv.siblings();

        if ($(divs[1]).find( "svg" ).length == 0 ){
             d3.selectAll("svg").remove();
        }
        else {
            for (var div = 1; div < divs.length; div++) {
                $(divs[div]).find("svg").remove()
            }
        }
	},

	addNewSet:function(newSet) {
        var buttonArr = StudyDGraphing.getButtonElement(this.graphDiv);
        var selector = StudyDGraphing.getSelectorElement(this.graphDiv);
        //line chart
        $(buttonArr[0]).click(function(event) {
            event.preventDefault();
                  d3.select(selector[1]).style('display', 'block');
                  d3.select(selector[2]).style('display', 'none');
                  d3.select(selector[3]).style('display', 'none');
                  d3.select(selector[4]).style('display', 'none');
            $('label.btn').removeClass('active');
            $(this).addClass('active');
            return false
        });
        //bar chart grouped by time
        $(buttonArr[1]).click(function(event) {
            event.preventDefault();
                  d3.select(selector[1]).style('display', 'none');
                  d3.select(selector[2]).style('display', 'block');
                  d3.select(selector[3]).style('display', 'none');
                  d3.select(selector[4]).style('display', 'none');
            $('label.btn').removeClass('active');
            $(this).addClass('active');
            return false
        });
        //bar chart grouped by assay
        $(buttonArr[2]).click(function(event) {
            event.preventDefault();
                  d3.select(selector[1]).style('display', 'none');
                  d3.select(selector[2]).style('display', 'none');
                  d3.select(selector[3]).style('display', 'block');
                  d3.select(selector[4]).style('display', 'none');
            $('label.btn').removeClass('active');
            $(this).addClass('active');
            return false;
        });
        //bar chart grouped by measurement
        $(buttonArr[3]).click(function(event) {
            event.preventDefault();
                  d3.select(selector[1]).style('display', 'none');
                  d3.select(selector[2]).style('display', 'none');
                  d3.select(selector[3]).style('display', 'none');
                  d3.select(selector[4]).style('display', 'block');
            $('label.btn').removeClass('active');
            $(this).addClass('active');
            return false;
        });

        var data = EDDData; // main data
        var barAssayObj  = GraphHelperMethods.sortBarData(newSet);
        var x_units = GraphHelperMethods.findX_Units(barAssayObj);
        var y_units = GraphHelperMethods.findY_Units(barAssayObj);

        //data for graphs
        var graphSet = {
            barAssayObj: GraphHelperMethods.sortBarData(newSet),
            labels: GraphHelperMethods.names(data),
            create_x_axis: GraphHelperMethods.createXAxis,
            create_right_y_axis: GraphHelperMethods.createRightYAxis,
            create_y_axis: GraphHelperMethods.createLeftYAxis,
            x_axis: GraphHelperMethods.make_x_axis,
            y_axis: GraphHelperMethods.make_right_y_axis,
            individualData: newSet,
            assayMeasurements: barAssayObj,
            color: d3.scale.category10(),
            width: 750,
            height: 220
        };
        //create respective graphs
        createMultiLineGraph(graphSet, GraphHelperMethods.createLineSvg(selector[1]));
        createGroupedBarGraph(graphSet, GraphHelperMethods.createSvg(selector[2]), 'x');
        createGroupedBarGraph(graphSet, GraphHelperMethods.createSvg(selector[3]), 'name');
        createGroupedBarGraph(graphSet, GraphHelperMethods.createSvg(selector[4]), 'measurement');

        var rects = d3.selectAll('.groupedMeasurement rect')[0];
        StudyDGraphing.svgWidth(selector[4], rects);
		if (!newSet.label) {
			$('#debug').text('Failed to fetch series.');
			return;
		}
	},

    /* this function takes in element and returns an array of selectors
    * [<div id=​"linechart">​</div>​, <div id=​"timeBar">​</div>​, <div id=​"single">​</div>​,
    * <div id=​"groupedAssay">​</div>​]
    */
    getButtonElement:function (element) {
        if (($(element).siblings().siblings()).size() < 8) {
            return $(element.siblings()[0]).find("label")
        } else {
            return $(element.siblings()[1]).find("label")
        }
    },

    // this function takes in the graphDiv element and returns an array of 4 buttons
    getSelectorElement:function (element) {
        return element.siblings().siblings()
    },

    findOtherValues:function (element) {
        var otherElements = [],
            values = ['.linechart', '.single', '.groupedAssay', '.timeBar', '.groupedMeasurement'];
        _.each(values, function(value) {
            if (value != element) {
                otherElements.push(value);
            }
        });
        return otherElements;
    },

    /* this function takes in an element  selector and an array of svg rects and returns
     * returns message or nothing.
     */
    svgWidth: function(selector, rectArray) {
        _.each(rectArray, function(rectElem:any) {
            if (rectElem.getBoundingClientRect() != 0) {
                return
            }
        });
         d3.select(selector).append("text").text('Too much data. Please filter')
    }
};