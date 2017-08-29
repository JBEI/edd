import * as $ from "jquery"
import * as d3 from "d3"
import {EDDGraphingTools} from "./EDDGraphingTools";

export class EDDATDGraphing {

    graphDiv: JQuery;

    constructor() {
        this.graphDiv = $("#graphDiv")
    }

    clearAllSets():void {
        d3.selectAll("svg").remove();
    }

    addNewSet(newSet):void {
        let eddGraphing = new EDDGraphingTools();
        var barAssayObj  = eddGraphing.concatAssays(newSet);

        //data for graphs
        //data for graphs
        var graphSet = {
            barAssayObj: eddGraphing.concatAssays(newSet),
            create_x_axis: eddGraphing.createXAxis,
            create_right_y_axis: eddGraphing.createRightYAxis,
            create_y_axis: eddGraphing.createLeftYAxis,
            x_axis: eddGraphing.make_x_axis,
            y_axis: eddGraphing.make_right_y_axis,
            individualData: newSet,
            assayMeasurements: barAssayObj,
            color: d3.scaleOrdinal(d3.schemeCategory10),
            width: 750,
            height: 220
        };
        //create respective graphs
        eddGraphing.createMultiLineGraph(graphSet, eddGraphing.createSvg('.linechart'));

        if (!newSet.label) {
            $('#debug').text('Failed to fetch series.');
            return;
        }
    }
};


window.addEventListener('load', this.graphDiv, false);
