/// <reference path="typescript-declarations.d.ts" />
/// <reference path="Utl.d.ts" />
/// <reference path="CarbonSummation.d.ts" />
declare module CarbonBalance {
    class ImbalancedTimeSample {
        iTimeSample: number;
        normalizedError: number;
        constructor(iTimeSample: number, normalizedError: number);
    }
    class Display {
        calculateCarbonBalances(metabolicMapID: number, biomassCalculation: number): void;
        getDebugTextForTime(metabolicMapID: number, biomassCalculation: number, lineID: number, timeStamp: number): string;
        getNumberOfImbalances(): number;
        private _normalizedErrorThreshold;
        private _calcNormalizedError(carbonIn, carbonOut);
        private _getTimeSamplesForLine(lineID, imbalancedOnly);
        createCBGraphForLine(lineID: any, parent: any): void;
        removeAllCBGraphs(): void;
        private POPUP_HEIGHT;
        private POPUP_SVG_HEIGHT;
        private _getMetaboliteNameByMeasurementID(measurementID);
        private _printCarbonBalanceList(header, list, showSum);
        private _generateDebugTextForPopup(lineID, timeStamp, balance);
        private _generateBiomassCalculationDebugText(biomass_calculation_info);
        private _generateBiomassCalculationDebugTextForList(theList);
        private _getPreviousMergedTimestamp(lineID, timeStamp);
        private _generatePopupTitleForImbalance(lineID, timeStamp);
        private _generatePopupDisplayForImbalance(lineID, timeStamp, event, api);
        private _createTextWithDropShadow(svg, x, y, text, font, fontSize, mainColor, shadowColor);
        private _addSummaryLabels(svg, balance, inputsBar, outputsBar, topPos, topPosValue, bottomPos, bottomPosValue);
        private _drawTShape(svg, centerX, y, width, height, text, font, fontSize, textOnBottom);
        private _checkLineSampleBalance(lineID, timeStamp);
        private _metabolicMapID;
        private _biomassCalculation;
        static graphDiv: any;
        allCBGraphs: any[];
        mergedTimelinesByLineID: {
            [x: number]: MergedLineSamples;
        };
        carbonSum: Summation;
    }
}
