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

       // d3.selectAll("svg").remove();

	addNewSet:function(newSet) {
        var buttons = StudyDGraphing.getButtonElement(this.graphDiv);
        var selector = StudyDGraphing.getSelectorElement(this.graphDiv);
        //ar chart grouped by time
        d3.select(buttons[1])
              .on('click', function() {
                  event.preventDefault();
                      d3.select(selector[1]).style('display', 'none');
                      d3.select(selector[2]).style('display', 'block');
                      d3.select(selector[3]).style('display', 'none');
                      d3.select(selector[4]).style('display', 'none');
                  return false
        });
        //line chart
        d3.select(buttons[0])
            .on('click', function() {
                event.preventDefault();
                      d3.select(selector[1]).style('display', 'block');
                      d3.select(selector[2]).style('display', 'none');
                      d3.select(selector[3]).style('display', 'none');
                      d3.select(selector[4]).style('display', 'none');
                return false
        });
        //bar charts for each line entry
        d3.select(buttons[2])
            .on('click', function() {
                event.preventDefault();
                      d3.select(selector[1]).style('display', 'none');
                      d3.select(selector[2]).style('display', 'none');
                      d3.select(selector[3]).style('display', 'block');
                      d3.select(selector[4]).style('display', 'none');
                return false;
        });
        //bar chart grouped by assay
        d3.select(buttons[3])
            .on('click', function() {
                event.preventDefault();
                      d3.select(selector[1]).style('display', 'none');
                      d3.select(selector[2]).style('display', 'none');
                      d3.select(selector[3]).style('display', 'none');
                      d3.select(selector[4]).style('display', 'block');
                return false;
        });

        var data = EDDData; // main data
        var labels = names(data); // names of proteins..
        var barAssayObj  = sortBarData(newSet);

        //create respective graphs
        createLineGraph(barAssayObj, selector[1], legend, make_x_axis, make_y_axis);
        createTimeGraph(barAssayObj, selector[2], legend, make_x_axis, make_y_axis);
        createSideBySide(newSet, labels, selector[3]);
        createAssayGraph(barAssayObj, selector[4]);
		
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
    }

};


