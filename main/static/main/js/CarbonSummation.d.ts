/// <reference path="typescript-declarations.d.ts" />
/// <reference path="Utl.d.ts" />
/// <reference path="EDDDataInterface.d.ts" />
/// <reference path="StudyCarbonBalance.d.ts" />
declare module CarbonBalance {
    class Summation {
        static create(biomassCalculation: number): Summation;
        static generateDebugText(biomassCalculation: number, debugLineID: number, debugTimeStamp: string): string;
        private init(biomassCalculation);
        private _writeDebugLine(shouldWrite, val);
        private _writeDebugLineWithHeader(shouldWrite, header, val);
        private _numStr(value);
        mergeAllLineSamples(lineData: any): MergedLineSamples;
        getLineDataByID(lineID: number): LineData;
        private _doesMeasurementContainCarbon(measurementID, needMolarMassByMeasurementTypeID);
        private _calculateCmMolPerLiter(measurementID, timeStamp, integralsByMeasurementID, biomassCalculation, dOut);
        private _isOpticalDensityMeasurement(measurementType);
        private _integrateAssayMeasurements(biomassCalculation);
        private _getMeasurementLineID(measurement);
        private _getMeasurementTimestampsSorted(measurementID);
        private _buildSortedMeasurementsForAssayMetabolite(line, measurementID, integralsByMeasurementID, biomassCalculation);
        private _calculateCarbonDeltas(sortedMeasurements, line, measurement, biomassCalculation);
        private _calcTimeDelta(fromTimeStamp, toTimeStamp);
        private _fitOnSortedTimeline(timeStamp, timeline);
        private _calculateOpticalDensityFactor(line, timeStamp, writeDebugInfo);
        private _getOpticalDensityMeasurementForLine(lineID);
        private _precalculateValidLists();
        private _validAssaysByLineID;
        private _validMeasurementsByAssayID;
        private _opticalDensityMeasurementIDByLineID;
        lineDataByID: {
            [x: number]: LineData;
        };
        lastTimeInSeconds: number;
        private _assayMeasurementDataByID;
        private _debugLineID;
        private _debugTimeStamp;
        private _debugOutput;
        private _debugOutputIndent;
    }
    class LineData {
        assaysByID: any;
        private _lineID;
        constructor(lineID: number);
        getLineID(): number;
        filterAssaysByTimeStamp(timeStamp: string): any;
        getInOutSumAtTime(timeStamp: string): InOutSum;
    }
    class MergedLineSamples {
        mergedLineSamples: MergedLineSample[];
        metaboliteTimelines: MetaboliteTimeline[];
    }
    class MergedLineSample {
        constructor(timeStamp: string);
        timeStamp: string;
        totalCarbonIn: number;
        totalCarbonOut: number;
    }
    class InOutSum {
        totalIn: number;
        totalOut: number;
        measurements: InOutSumMeasurement[];
        constructor(totalIn: number, totalOut: number, measurements: InOutSumMeasurement[]);
    }
    class InOutSumMeasurement {
        timeline: MetaboliteTimeline;
        carbonDelta: number;
        absDelta(): number;
    }
    class AssayData {
        assayID: number;
        timelinesByMeasurementId: {
            [x: number]: MetaboliteTimeline;
        };
        constructor(assayID: number);
        getTimeSamplesByTimeStamp(timeStamp: string): any[];
    }
    class MetaboliteTimeline {
        assay: AssayData;
        measurementID: number;
        timeSamples: TimeSample[];
        constructor(assay: AssayData, measurementID: number);
        interpolateCarbonDelta(timeStamp: string): number;
        findSampleByTimeStamp(timeStamp: string): any;
    }
    class TimeSample {
        timeStamp: string;
        carbonValue: number;
        carbonDelta: number;
        isInput(): boolean;
        isOutput(): boolean;
        absDelta(): number;
    }
    class TimelineMerger {
        static mergeAllLineSamples(lineData: any): MergedLineSamples;
        private static _isPrimaryAssay(assay);
    }
}
