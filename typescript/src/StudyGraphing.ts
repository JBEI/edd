var StudyDGraphing:any;

declare var createLineGraph;
declare var createAssayGraph;
declare var createTimeGraph;
declare var sortBarData;
declare var labels;
declare var createSideBySide;
declare var names;
declare var transformSingleLineItem;
declare var legend;
declare var make_y_axis;
declare var make_x_axis;
declare var findY_Units;
declare var findX_Units;
declare var displayUnit;

StudyDGraphing = {

	Setup:function(graphdiv) {

		if (graphdiv) {
			this.graphDiv = $("#" + graphdiv);
		} else {
			this.graphDiv = $("#graphDiv");
        }
	},

	clearAllSets:function() {
        //
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

       // d3.selectAll("svg").remove();

	addNewSet:function(newSet) {
        var buttonArr = StudyDGraphing.getButtonElement(this.graphDiv);
        var buttons = StudyDGraphing.convertObjectToArr(buttonArr);
        var selector = StudyDGraphing.getSelectorElement(this.graphDiv);

        //ar chart grouped by time
        d3.select(buttons["timeBar"])
              .on('click', function() {
                  event.preventDefault();
                      d3.select(selector[1]).style('display', 'none');
                      d3.select(selector[2]).style('display', 'block');
                      d3.select(selector[3]).style('display', 'none');
                      d3.select(selector[4]).style('display', 'none');
                  return false
        });
        //line chart
        d3.select(buttons["linechart"])
            .on('click', function() {
                event.preventDefault();
                      d3.select(selector[1]).style('display', 'block');
                      d3.select(selector[2]).style('display', 'none');
                      d3.select(selector[3]).style('display', 'none');
                      d3.select(selector[4]).style('display', 'none');
                return false
        });
        //bar charts for each line entry
        d3.select(buttons["single"])
            .on('click', function() {
                event.preventDefault();
                      d3.select(selector[1]).style('display', 'none');
                      d3.select(selector[2]).style('display', 'none');
                      d3.select(selector[3]).style('display', 'block');
                      d3.select(selector[4]).style('display', 'none');
                return false;
        });
        //bar chart grouped by assay
        d3.select(buttons["groupedAssay"])
            .on('click', function() {
                event.preventDefault();
                      d3.select(selector[1]).style('display', 'none');
                      d3.select(selector[2]).style('display', 'none');
                      d3.select(selector[3]).style('display', 'none');
                      d3.select(selector[4]).style('display', 'block');
                return false;
        });

        var data = EDDData; // main data
        var barAssayObj  = sortBarData(newSet);
        var x_units = findX_Units(barAssayObj);
        var y_units = findY_Units(barAssayObj);
        //data for graphs
        var graphSet = {
            barAssayObj: sortBarData(newSet),
            labels: names(data),
            y_unit: displayUnit(y_units),
            x_unit: displayUnit(x_units),
            x_axis: make_x_axis,
            y_axis: make_y_axis,
            individualData: newSet,
            assayMeasurements: barAssayObj,
            legend: legend
        };
        //create respective graphs
        createLineGraph(graphSet, selector[1]);
        createTimeGraph(graphSet, selector[2]);
        createSideBySide(graphSet, selector[3]);
        createAssayGraph(graphSet, selector[4]);
		
		if (!newSet.label) {
			$('#debug').text('Failed to fetch series.');
			return;
		}
	},

    /* this function takes in element and returns an array of selectors
    * [<div id=​"linechart">​</div>​, <div id=​"timeBar">​</div>​, <div id=​"single">​</div>​,
    * <div id=​"groupedAssay">​</div>​]
    */

    //make this return an object with keys and values. or take second argument..
    getButtonElement:function (element) {
        if (($(element).siblings().siblings()).size() < 7) {
            return $(element.siblings()[0]).find("button")
        } else {
            return $(element.siblings()[1]).find("button")
        }
    },

    // takes in graphDiv and returns array of 4 buttons
    getSelectorElement:function (element) {
        return element.siblings().siblings()
    },

    convertObjectToArr:function (arr) {
        var rv = {};
        for (var i = 0; i < arr.length; ++i) {
            var key = arr[i].value;
            rv[key] = arr[i];
        }
        return rv;
    },

};


