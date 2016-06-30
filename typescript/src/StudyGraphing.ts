var StudyDGraphing:any;

declare var createLineGraph;
declare var createAssayGraph;
declare var createTimeGraph;
declare var createBarTimeGraphByLine;
declare var objectSize;
declare var yvalues;
declare var xvalues;
declare var sortValues;
declare var sortBarData;
declare var labels;
declare var arrSize;
declare var createSideBySide;
declare var names;
declare var transformSingleLineItem;
declare var findAllXValues;

StudyDGraphing = {

	Setup:function(graphdiv) {
		//define svg space

		if (graphdiv) {
			this.graphDiv = $("#" + graphdiv);
		} else {
			this.graphDiv = $("#graphDiv");
        }
        // this.graphOptions.yaxes = [];
	},

	clearAllSets:function() {
		d3.selectAll("svg").remove();
	},

	addNewSet:function(newSet) {

        d3.select('#chart1')
              .on('click', function() {
                      d3.select('#container').style('display', 'none');
                      d3.select('#metrics').style('display', 'block');
                      d3.select('#single').style('display', 'none');
                      d3.select('#groupedAssay').style('display', 'none');
        });

            d3.select('#chart2')
            .on('click', function() {
                    d3.select('#container').style('display', 'block');
                    d3.select('#metrics').style('display', 'none');
                    d3.select('#single').style('display', 'none');
                    d3.select('#groupedAssay').style('display', 'none');
        })
        d3.select('#chart3')
            .on('click', function() {
                    d3.select('#container').style('display', 'none');
                    d3.select('#metrics').style('display', 'none');
                    d3.select('#single').style('display', 'block');
                    d3.select('#groupedAssay').style('display', 'none');
        })
        d3.select('#chart4')
            .on('click', function() {
                    d3.select('#container').style('display', 'none');
                    d3.select('#metrics').style('display', 'none');
                    d3.select('#single').style('display', 'none');
                    d3.select('#groupedAssay').style('display', 'block');
        })

        var data = EDDData; // main data
        var labels = names(data); // names of proteins..
        var barAssayObj  = sortBarData(newSet);
        var yvals = yvalues(data.AssayMeasurements); //an array of y values
        var xvals = xvalues(data.AssayMeasurements);
        var allXvals = findAllXValues(xvals);
        var ysorted = sortValues(yvals) ;
        var xsorted = sortValues(xvals);
        var minValue = ysorted[ysorted.length - 1];
        var maxValue = ysorted[0];
        var minXvalue = xsorted[xsorted.length - 1];
        var maxXvalue = xsorted[0];
        var size = objectSize(data.AssayMeasurements); // number of assays
        var arraySize = arrSize(data.AssayMeasurements); // number of data points

		 createLineGraph(barAssayObj, minValue, maxValue, labels, minXvalue, maxXvalue);
		 createAssayGraph(barAssayObj);
         createTimeGraph(barAssayObj, labels, size);
         createSideBySide(newSet, labels);
		
		if (!newSet.label) {
			$('#debug').text('Failed to fetch series.');
			return;
		}
	}
};


