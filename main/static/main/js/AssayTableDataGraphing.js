/// <reference path="typescript-declarations.d.ts" />
/// <reference path="GraphHelperMethods.ts" />
var EDDATDGraphing;
EDDATDGraphing = {
    Setup: function () {
        EDDATDGraphing.graphDiv = $("#graphDiv");
    },
    clearAllSets: function () {
        d3.selectAll("svg").remove();
    },
    addNewSet: function (newSet) {
        var data = EDDData; // main data
        var barAssayObj = GraphHelperMethods.sortBarData(newSet);
        var x_units = GraphHelperMethods.findX_Units(barAssayObj);
        var y_units = GraphHelperMethods.findY_Units(barAssayObj);
        //data for graphs
        var graphSet = {
            barAssayObj: GraphHelperMethods.sortBarData(newSet),
            labels: GraphHelperMethods.names(data),
            y_unit: GraphHelperMethods.displayUnit(y_units),
            x_unit: GraphHelperMethods.displayUnit(x_units),
            create_x_axis: GraphHelperMethods.createXAxis,
            create_y_axis: GraphHelperMethods.createYAxis,
            x_axis: GraphHelperMethods.make_x_axis,
            y_axis: GraphHelperMethods.make_y_axis,
            individualData: newSet,
            assayMeasurements: barAssayObj,
            legend: GraphHelperMethods.legend,
            color: d3.scale.category10(),
            width: 750,
            height: 220
        };
        //create respective graphs
        createLineGraph(graphSet, GraphHelperMethods.createSvg('.linechart'));
        if (!newSet.label) {
            $('#debug').text('Failed to fetch series.');
            return;
        }
    },
};
window.addEventListener('load', EDDATDGraphing.Setup, false);
