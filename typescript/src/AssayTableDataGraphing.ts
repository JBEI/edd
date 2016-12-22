/// <reference path="typescript-declarations.d.ts" />
/// <reference path="EDDGraphingTools.ts" />

var EDDATDGraphing:any;

EDDATDGraphing = {

	Setup:function() {

		EDDATDGraphing.graphDiv = $("#graphDiv");

	},


	clearAllSets:function() {

		d3.selectAll("svg").remove();
	},
	

	addNewSet:function(newSet) {

        var barAssayObj  = EDDGraphingTools.concatAssays(newSet);

        //data for graphs
        //data for graphs
        var graphSet = {
            barAssayObj: EDDGraphingTools.concatAssays(newSet),
            create_x_axis: EDDGraphingTools.createXAxis,
            create_right_y_axis: EDDGraphingTools.createRightYAxis,
            create_y_axis: EDDGraphingTools.createLeftYAxis,
            x_axis: EDDGraphingTools.make_x_axis,
            y_axis: EDDGraphingTools.make_right_y_axis,
            individualData: newSet,
            assayMeasurements: barAssayObj,
            color: d3.scale.category10(),
            width: 750,
            height: 220
        };
        //create respective graphs
        EDDGraphingTools.createMultiLineGraph(graphSet, EDDGraphingTools.createSvg('.linechart'));

		if (!newSet.label) {
			$('#debug').text('Failed to fetch series.');
			return;
		}
	},
};


window.addEventListener('load', EDDATDGraphing.Setup, false);
