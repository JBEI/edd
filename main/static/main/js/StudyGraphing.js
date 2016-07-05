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
        // this.graphOptions.yaxes = [];
    },
    clearAllSets: function () {
        d3.selectAll("svg").remove();
    },
    addNewSet: function (newSet) {
        d3.select('#groupByTimeBar')
            .on('click', function () {
            d3.select('#linechart').style('display', 'none');
            d3.select('#timeBar').style('display', 'block');
            d3.select('#single').style('display', 'none');
            d3.select('#groupedAssay').style('display', 'none');
        });
        d3.select('#line')
            .on('click', function () {
            d3.select('#linechart').style('display', 'block');
            d3.select('#timeBar').style('display', 'none');
            d3.select('#single').style('display', 'none');
            d3.select('#groupedAssay').style('display', 'none');
        });
        d3.select('singleBar')
            .on('click', function () {
            d3.select('#linechart').style('display', 'none');
            d3.select('#timeBar').style('display', 'none');
            d3.select('#single').style('display', 'block');
            d3.select('#groupedAssay').style('display', 'none');
        });
        d3.select('#groupByProteinBar')
            .on('click', function () {
            d3.select('#linechart').style('display', 'none');
            d3.select('#timeBar').style('display', 'none');
            d3.select('#single').style('display', 'none');
            d3.select('#groupedAssay').style('display', 'block');
        });
        var data = EDDData; // main data
        var labels = names(data); // names of proteins..
        var barAssayObj = sortBarData(newSet);
        var size = objectSize(data.AssayMeasurements); // number of assays
        createLineGraph(barAssayObj);
        createAssayGraph(barAssayObj);
        createTimeGraph(barAssayObj, labels, size);
        createSideBySide(newSet, labels);
        if (!newSet.label) {
            $('#debug').text('Failed to fetch series.');
            return;
        }
    }
};
