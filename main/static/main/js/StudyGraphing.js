var StudyDGraphing;
StudyDGraphing = {
    Setup: function (graphdiv) {
        //define svg space
        if (graphdiv) {
            this.graphDiv = $("#" + graphdiv);
        }
        else {
            this.graphDiv = $("#graphDiv");
        }
        // this.div = d3.select("body").append("div")
        // .attr("class", "tooltip")
        // .style("opacity", 0);
        //
        // this.margin = {top: 20, right: 150, bottom: 30, left: 40},
        // this.width = 1000 - this.margin.left - this.margin.right,
        // this.height = 270 - this.margin.top - this.margin.bottom;
        // this.color = d3.scale.category10();
    },
    clearAllSets: function () {
        d3.selectAll("svg").remove();
    },
    addNewSet: function (newSet) {
        d3.select('#chart')
            .on('click', function () {
            d3.select('#bar').style('display', 'block');
            d3.select('#container').style('display', 'none');
            d3.select('#metrics').style('display', 'none');
            d3.select('#single').style('display', 'none');
            d3.select('#groupedAssay').style('display', 'none');
        });
        d3.select('#chart1')
            .on('click', function () {
            d3.select('#bar').style('display', 'none');
            d3.select('#container').style('display', 'none');
            d3.select('#metrics').style('display', 'block');
            d3.select('#single').style('display', 'none');
            d3.select('#groupedAssay').style('display', 'none');
        });
        d3.select('#chart2')
            .on('click', function () {
            d3.select('#bar').style('display', 'none');
            d3.select('#container').style('display', 'block');
            d3.select('#metrics').style('display', 'none');
            d3.select('#single').style('display', 'none');
            d3.select('#groupedAssay').style('display', 'none');
        });
        d3.select('#chart3')
            .on('click', function () {
            d3.select('#bar').style('display', 'none');
            d3.select('#container').style('display', 'none');
            d3.select('#metrics').style('display', 'none');
            d3.select('#single').style('display', 'block');
            d3.select('#groupedAssay').style('display', 'none');
        });
        d3.select('#chart4')
            .on('click', function () {
            d3.select('#bar').style('display', 'none');
            d3.select('#container').style('display', 'none');
            d3.select('#metrics').style('display', 'none');
            d3.select('#single').style('display', 'none');
            d3.select('#groupedAssay').style('display', 'block');
        });
        //taking single line of data and add it. only 1 line. 
        var data = EDDData; // main data
        var labels = names(data); // names of proteins..
        var lineAssayObj = transformLineData(data, labels); //returns an array of array of
        // objects
        var barAssayObj = sortBarData(newSet);
        var yvals = yvalues(data.AssayMeasurements); //an array of y values
        var xvals = xvalues(data.AssayMeasurements);
        var ysorted = sortValues(yvals);
        var xsorted = sortValues(xvals);
        var minValue = ysorted[ysorted.length - 1];
        var maxValue = ysorted[0];
        var minXvalue = xsorted[xsorted.length - 1];
        var maxXvalue = xsorted[0];
        var size = objectSize(data.AssayMeasurements); // number of assays
        var arraySize = arrSize(data.AssayMeasurements); // number of data points
        createLineGraph(barAssayObj, minValue, maxValue, labels, minXvalue, maxXvalue);
        createAssayGraph(barAssayObj, minValue, maxValue, labels, size, arraySize);
        createBarLineGraph(barAssayObj, minValue, maxValue, labels, size, arraySize);
        createTimeGraph(barAssayObj, minValue, maxValue, minXvalue, maxXvalue, labels, size, arraySize);
        createSideBySide(newSet, minValue, maxValue, labels, minXvalue, maxXvalue);
        if (!newSet.label) {
            $('#debug').text('Failed to fetch series.');
            return;
        }
    }
};
