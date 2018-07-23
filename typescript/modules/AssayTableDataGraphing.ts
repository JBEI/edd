import * as $ from "jquery";
import * as d3 from "d3";
import {
    GraphParams,
    GraphValue,
    GraphView,
} from "./EDDGraphingTools";
import * as Utl from "./Utl";

export class EDDATDGraphing {

    graphDiv: JQuery;

    constructor() {
        this.graphDiv = $("#graphDiv");
    }

    clearAllSets(): void {
        d3.selectAll("svg").remove();
    }

    addNewSet(newSet: GraphValue[][]): void {
        // data for graphs
        let graphSet: GraphParams = {
            values: Utl.chainArrays(newSet),
            width: 750,
            height: 220,
        };
        // create respective graphs
        let view = new GraphView($('.linechart')[0]);
        view.buildLineGraph(graphSet);
    }
};


window.addEventListener('load', this.graphDiv, false);
