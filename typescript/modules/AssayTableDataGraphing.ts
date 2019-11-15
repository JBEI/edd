import * as d3 from "d3";
import * as $ from "jquery";
import { GraphParams, GraphValue, GraphView } from "./EDDGraphingTools";
import * as Utl from "./Utl";

export class EDDATDGraphing {
    graphDiv: JQuery;

    constructor(graphDiv) {
        this.graphDiv = graphDiv;
    }

    clearAllSets(): void {
        d3.selectAll("svg").remove();
    }

    addNewSet(newSet: GraphValue[][]): void {
        // data for graphs
        const graphSet: GraphParams = {
            "values": Utl.chainArrays(newSet),
            "width": 750,
            "height": 220,
        };
        // create respective graphs
        const view = new GraphView($(".linechart", this.graphDiv)[0]);
        view.buildLineGraph(graphSet);
    }
}
