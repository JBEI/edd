/// <reference path="typescript-declarations.d.ts" />
/// <reference path="GraphHelperMethods.ts" />

var EDDATDGraphing:any;

declare var createMultiLineGraph;

EDDATDGraphing = {

	Setup:function() {

		EDDATDGraphing.graphDiv = $("#graphDiv");

	},


	clearAllSets:function() {

		d3.selectAll("svg").remove();
	},
	

	addNewSet:function(newSet) {

        var barAssayObj  = GraphHelperMethods.concatAssays(newSet);

        //data for graphs
        //data for graphs
        var graphSet = {
            barAssayObj: GraphHelperMethods.concatAssays(newSet),
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
        createMultiLineGraph(graphSet, GraphHelperMethods.createSvg('.linechart'));

		if (!newSet.label) {
			$('#debug').text('Failed to fetch series.');
			return;
		}
	},
};


window.addEventListener('load', EDDATDGraphing.Setup, false);