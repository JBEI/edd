/// <reference path="../../../../typescript/typescript-declarations.d.ts" />
/// <reference path="Utl.d.ts" />
/// <reference path="EDDDataInterface.d.ts" />
/// <reference path="StudyCarbonBalance.d.ts" />
declare module CarbonBalance {
    class Summation {
        lineDataByID: {
            [lineID: number]: LineData;
        };
        lastTimeInSeconds: number;
        private _validAssaysByLineID;
        private _validMeasurementsByAssayID;
        private _opticalDensityMeasurementIDByLineID;
        private _assayMeasurementDataByID;
        private _debugLineID;
        private _debugTimeStamp;
        private _debugOutput;
        private _debugOutputIndent;
        static create(biomassCalculation: number): Summation;
        static generateDebugText(biomassCalculation: number, debugLineID: number, debugTimeStamp: number): string;
        mergeAllLineSamples(lineData: any): MergedLineSamples;
        getLineDataByID(lineID: number): LineData;
        private init(biomassCalculation);
        private _writeDebugLine(shouldWrite, val);
        private _writeDebugLineWithHeader(shouldWrite, header, val);
        private _numStr(value);
        private _doesMeasurementContainCarbon(measure);
        private _calculateCmMolPerLiter(measurementID, timeStamp, integralsByMeasurementID, biomassCalculation, dOut);
        private _isOpticalDensityMeasurement(measurementType);
        private _integrateAssayMeasurements(biomassCalculation);
        private _getMeasurementTimestampsSorted(measurementID);
        private _buildSortedMeasurementsForAssayMetabolite(line, measurementID, integralsByMeasurementID, biomassCalculation);
        private _calculateCarbonDeltas(sortedMeasurements, line, measurement, biomassCalculation);
        private _calcTimeDelta(fromTimeStamp, toTimeStamp);
        private _fitOnSortedTimeline(timeStamp, timeline);
        private _calculateOpticalDensityFactor(line, timeStamp, writeDebugInfo);
        private _getOpticalDensityMeasurementForLine(lineID);
        private _precalculateValidLists();
    }
    interface AssayLookup {
        [id: number]: AssayData;
    }
    interface TimelineLookup {
        [id: number]: MetaboliteTimeline;
    }
    class LineData {
        assaysByID: AssayLookup;
        private _lineID;
        constructor(lineID: number);
        getLineID(): number;
        filterAssaysByTimeStamp(timeStamp: number): AssayData[];
        getInOutSumAtTime(timeStamp: number): InOutSum;
    }
    class MergedLineSamples {
        mergedLineSamples: MergedLineSample[];
        metaboliteTimelines: MetaboliteTimeline[];
    }
    class MergedLineSample {
        timeStamp: number;
        totalCarbonIn: number;
        totalCarbonOut: number;
        constructor(timeStamp: number);
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
        timelinesByMeasurementId: TimelineLookup;
        assayId: number;
        constructor(assayID: number);
        getTimeSamplesByTimeStamp(timeStamp: number): any[];
    }
    class MetaboliteTimeline {
        assay: AssayData;
        timeSamples: TimeSample[];
        measureId: number;
        constructor(assay: AssayData, measurementID: number);
        interpolateCarbonDelta(timeStamp: number): number;
        findSampleByTimeStamp(timeStamp: number): TimeSample;
    }
    class TimeSample {
        timeStamp: number;
        carbonValue: number;
        carbonDelta: number;
        isInput(): boolean;
        isOutput(): boolean;
        absDelta(): number;
    }
    class TimelineMerger {
        static mergeAllLineSamples(lineData: LineData): MergedLineSamples;
        private static _isPrimaryAssay(assay);
    }
}
