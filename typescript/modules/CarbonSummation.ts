import { Utl } from "./Utl"
import "underscore"

export module CarbonBalance2 {
    'use strict';

    interface ValidatedValue {
        isValid: boolean;
        value: number;
    }

    // values by time series
    interface Integral {
        [time: number]: number;
    }

    // store time series by measurement ID (or similar ID)
    interface IntegralLookup {
        [id: number]: Integral;
    }

    // store a list of IDs reachable from another ID
    interface IDLookup {
        [id: number]: number[];
    }

    // This is the client-side container for carbon balance data.
    // It combs through lines/assays/measurements to build a structure that is easy
    // to pull from when displaying carbon balance data.
    //
    // This is purely a data class, NOT a display class.
    export class Summation {

        // Data for each line of type Summation.LineData.
        lineDataByID: { [lineID: number]: LineData } = {};
        // The highest time value that any TimeSample has.
        lastTimeInSeconds: number = 0;

        // Precalculated lookups to speed things up.
        // An array of non-disabled assays for each line.
        private _validAssaysByLineID: IDLookup = <IDLookup>{};
        // An array of non-disabled measurements for each assay.
        private _validMeasurementsByAssayID: IDLookup = <IDLookup>{};
        // Lookup the OD measurement for each line.
        private _opticalDensityMeasurementIDByLineID: { [lineID: number]: number } = {};

        // This is from converting the assay measurement list given to us into a hash by timestamp.
        private _assayMeasurementDataByID: IntegralLookup;
        private _debugLineID: number = 0;
        // If this is set, then we'll be emitting debug HTML to _debugOutput.
        private _debugTimeStamp: number;
        private _debugOutput: string;
        // Auto tab on debug output.
        private _debugOutputIndent: number = 0;


        // Use this to create a summation object.
        static create(biomassCalculation: number): Summation {

            var sum: Summation = new Summation();
            sum.init(biomassCalculation);
            return sum;
        }


        // Use this to generate some debug text that describes all the calculations.
        static generateDebugText(biomassCalculation: number,
            debugLineID: number,
            debugTimeStamp: number): string {

            // Create a Summation object but tell it to generate debug info while it does its
            // timestamps.
            var sum: Summation = new Summation();
            sum._debugLineID = debugLineID;
            sum._debugTimeStamp = debugTimeStamp;
            sum._debugOutput = "";
            sum.init(biomassCalculation);

            // Return its debug info.
            return sum._debugOutput;
        }


        // This just wraps the call to TimelineMerger.mergeAllLineSamples.
        mergeAllLineSamples(lineData: any): MergedLineSamples {
            return TimelineMerger.mergeAllLineSamples(lineData);
        }


        getLineDataByID(lineID: number): LineData {
            return this.lineDataByID[lineID];
        }


        // Internally, this is how we init the Summation object regardless of whether it's used
        // later or whether it's just used to get some debug text.
        private init(biomassCalculation: number): void {
            var integralsByMeasurementID: IntegralLookup;

            this._precalculateValidLists();
            // Convert to a hash on timestamp (x value)
            this._assayMeasurementDataByID = {};
            $.each(EDDData.AssayMeasurements, (id: string, measure: AssayMeasurementRecord): void => {
                var out: Integral = this._assayMeasurementDataByID[id] = <Integral>{};
                $.each(measure.values, (i: number, point: number[][]): void => {
                    // only do mapping for (x,y) points, won't make sense with higher dimensions
                    if (point[0].length === 1 && point[1].length === 1) {
                        out[point[0][0]] = point[1][0];
                    }
                });
            });

            // We need to prepare integrals of any mol/L/hr
            integralsByMeasurementID = this._integrateAssayMeasurements(biomassCalculation);

            // Iterate over lines.
            $.each(EDDData.Lines, (lineId: string, line: LineRecord): void => {
                var out: LineData, anySamplesAdded: boolean = false;
                if (!line.active) {
                    return;
                }
                out = new LineData(line.id);
                this._validAssaysByLineID[line.id].forEach((assayId: number): void => {
                    var assay: AssayRecord = EDDData.Assays[assayId],
                        protocol: any = EDDData.Protocols[assay.pid],
                        name: string = [line.name, protocol.name, assay.name].join('-'),
                        outAssay: AssayData = new AssayData(assayId),
                        valid: number = 0;
                    this._writeDebugLine(line.id === this._debugLineID, "Assay " + name);
                    this._debugOutputIndent++;
                    this._validMeasurementsByAssayID[assayId].forEach((measureId: number): void => {
                        var measure: AssayMeasurementRecord = EDDData.AssayMeasurements[measureId],
                            timeline: MetaboliteTimeline;
                        if (!this._doesMeasurementContainCarbon(measure)) {
                            return;
                        }
                        this._writeDebugLine(line.id === this._debugLineID,
                            EDDData.MetaboliteTypes[measure.type].name);
                        this._debugOutputIndent++;
                        valid++;
                        // Create MetaboliteTimeline output structure
                        timeline = new MetaboliteTimeline(outAssay, measureId);
                        outAssay.timelinesByMeasurementId[measureId] = timeline;
                        // Build a sorted list of timestamp/measurement
                        timeline.timeSamples = this._buildSortedMeasurementsForAssayMetabolite(
                            out, measureId, integralsByMeasurementID, biomassCalculation);
                        // Keep track of the last sample's time
                        if (timeline.timeSamples) {
                            anySamplesAdded = true;
                            this.lastTimeInSeconds = Math.max(this.lastTimeInSeconds,
                                timeline.timeSamples.slice(-1)[0].timeStamp);
                        }
                        this._writeDebugLine(line.id === this._debugLineID, "");
                        this._debugOutputIndent--;
                    });
                    // store the assay
                    out.assaysByID[assayId] = outAssay;
                    this._writeDebugLine(line.id === this._debugLineID, "");
                    this._debugOutputIndent--;
                });
                if (anySamplesAdded) {
                    this.lineDataByID[line.id] = out;
                }
            });

        }


        // Append the string to our _debugOutput string if shouldWrite=true.
        // (Having shouldWrite there makes it easier to do a one-line debug output that includes
        // the check of whether it should write).
        private _writeDebugLine(shouldWrite: boolean, val: string): void {
            if (!shouldWrite) {
                return;
            }
            var indent: string[] = [];
            // keep adding indents until reach length of _debugOutputIndent
            /* tslint:disable:curly */
            while (this._debugOutputIndent && this._debugOutputIndent > indent.push('    '));
            /* tslint:enable:curly */
            this._debugOutput += indent.join('') + val + "\n";
        }


        private _writeDebugLineWithHeader(shouldWrite: boolean, header: string, val: string): void {
            var str: string = Utl.JS.padStringLeft("[" + header + "] ", 30);
            this._writeDebugLine(shouldWrite, str + val);
        }


        // Convert a number to a string for debug output. If all the code uses this, then
        // all the number formatting will be consistent.
        private _numStr(value: any): string {
            return parseFloat(value).toFixed(5);
        }


        // This is used in a first pass on a measurement to decide if we should scan its
        // measurements. If you update this, update calculateCmolPerLiter (and vice-versa).
        private _doesMeasurementContainCarbon(measure: AssayMeasurementRecord): boolean {
            var mtype: MetaboliteTypeRecord = EDDData.MetaboliteTypes[measure.type];
            if (!mtype) {
                return false;
            }

            // OD measurements use the biomass factor to estimate the amount of carbon created
            // or destroyed. There's no guarantee we hae a valid biomass factor, but we definitely
            // know there is carbon here.
            if (this._isOpticalDensityMeasurement(mtype)) {
                return true;
            }
            var uRecord: any = EDDData.UnitTypes[measure.y_units];
            var units: string = uRecord ? uRecord.name : '';
            var carbonCount: number = mtype.cc; // # carbons per mole

            if (units === '' || units === 'n/a' || !carbonCount) {
                return false;
            } else if (units === 'g/L') {
                // g/L is fine if we have a molar mass so we can convert g->mol
                return !!mtype.mm;
            } else {
                // Anything using mols is fine as well.
                return (units === 'mol/L/hr' ||
                    units === 'uM' ||
                    units === 'mM' ||
                    units === 'mol/L' ||
                    units === 'Cmol/L');
            }
        }

        // Do unit conversions in order to get a Cmol/L value.
        // ** NOTE: This is "C-moles", which is CARBON mol/L (as opposed to CENTI mol/L).
        private _calculateCmMolPerLiter(measurementID: number,
            timeStamp: number,
            integralsByMeasurementID: IntegralLookup,
            biomassCalculation: number,
            dOut: boolean): ValidatedValue {
            // A measurement is the time series data for ONE metabolite
            // measurement.values contains all the meaty stuff - a 3-dimensional array with:
            // first index selecting point value;
            // second index 0 for x, 1 for y;
            // third index subscripted values;
            // e.g. measurement.values[2][0][1] is the x1 value of the third measurement value
            var measurement: AssayMeasurementRecord = EDDData.AssayMeasurements[measurementID],
                measurementType: MetaboliteTypeRecord = EDDData.MetaboliteTypes[measurement.type],
                uRecord: UnitType = EDDData.UnitTypes[measurement.y_units],
                units: string = uRecord ? uRecord.name : '',
                carbonCount: number = measurementType.cc, // # carbons per mole
                finalValue: number = 0,
                isValid: boolean = false,
                isOpticalDensity: boolean = this._isOpticalDensityMeasurement(measurementType),
                value: number = this._assayMeasurementDataByID[measurementID][timeStamp];

            // First, is this measurement something that we care about?
            //
            // We'll throw out anything that has multiple numbers per sample. Right now, we're
            // only handling one-dimensional numeric samples.
            //
            // We'll also throw out anything without a carbon count, like CO2/O2 ratios.
            if (isOpticalDensity) {
                // OD will be used directly in _calculateCarbonDeltas to get a growth rate.
                finalValue = value;
                isValid = true;
            } else if (units === 'mol/L/hr') {
                var integrals: Integral = integralsByMeasurementID[measurementID];
                if (integrals) {
                    finalValue = integrals[timeStamp] * 1000;
                    isValid = (typeof finalValue !== 'undefined');
                }
            } else if (units === '' || units === 'n/a' || !carbonCount) {
                // isValid will stay false.
            } else {
                // Check for various conversions that we might need to do.
                if (dOut) {
                    this._writeDebugLine(true, timeStamp + "h");
                    this._debugOutputIndent++;
                    this._writeDebugLineWithHeader(true, "raw value",
                        this._numStr(value) + " " + units);
                }
                if (value === 0) {
                    // Don't bother with all this work (and debug output) if the value is 0.
                    finalValue = value;
                    isValid = true;
                } else if (typeof value !== 'undefined') {
                    // Convert uM to mol/L. Note: even though it's not written as uM/L, these
                    // quantities should be treated as per-liter.
                    if (units === 'uM') {
                        value = value / 1000;
                        units = 'mMol/L';
                        this._writeDebugLineWithHeader(dOut, "convert",
                            " / 1000 = " + this._numStr(value) + " mol/L");
                    }
                    // Do molar mass conversions.
                    if (units === 'g/L') {
                        if (!measurementType.mm) {
                            // We should never get in here.
                            this._writeDebugLine(dOut, "Trying to calculate carbon for a g/L " +
                                "metabolite with an unspecified molar mass! " +
                                "(The code should never get here).");
                        } else {
                            // (g/L) * (mol/g) = (mol/L)
                            value = value * 1000 / measurementType.mm;
                            this._writeDebugLineWithHeader(dOut, "divide by molar mass",
                                [" * 1000 /", measurementType.mm, "g/mol =",
                                    this._numStr(value), "mMol/L"].join(' '));
                            units = 'mMol/L';
                        }
                    }
                    // Convert mMol/L to CmMol/L.
                    // ** NOTE: This is "C-moles", which is CARBON mol/L
                    // (as opposed to CENTI mol/L).
                    if (units === 'mMol/L') {
                        value *= carbonCount;
                        this._writeDebugLineWithHeader(dOut, "multiply by carbon count",
                            " * " + carbonCount + " = " + this._numStr(value) + " CmMol/L");
                        units = 'CmMol/L';
                    }
                    // Are we in our desired output format (Cmol/L)?
                    if (units === 'CmMol/L') {
                        finalValue = value;
                        isValid = true;
                    }
                }
                if (dOut) {
                    this._debugOutputIndent--;
                    this._writeDebugLine(true, "");
                }
            }
            // Return a result.
            return {
                isValid: isValid,
                value: finalValue
            };
        }


        private _isOpticalDensityMeasurement(measurementType: MeasurementTypeRecord): boolean {
            return measurementType.name === 'Optical Density';
        }


        // Returns a hash of assayMeasurementID->{time->integral} for any mol/L/hr measurements.
        private _integrateAssayMeasurements(biomassCalculation: number): IntegralLookup {
            var integralsByMeasurementID: IntegralLookup = {};

            $.each(EDDData.AssayMeasurements,
                (measureId: any, measure: AssayMeasurementRecord): void => {
                    var mtype: MetaboliteTypeRecord = EDDData.MetaboliteTypes[measure.type],
                        carbonCount: number,
                        uRecord: UnitType,
                        units: string,
                        integral: Integral = {},
                        data: Integral,
                        prevTime: number,
                        total: number;
                    if (!mtype) {
                        return;
                    }
                    carbonCount = mtype.cc;
                    uRecord = EDDData.UnitTypes[measure.y_units];
                    units = uRecord ? uRecord.name : '';
                    // See 'Optical Density Note' below.
                    if (units !== 'mol/L/hr' || !carbonCount) {
                        return;
                    }
                    integralsByMeasurementID[measureId] = integral;
                    // sum over all data
                    data = this._assayMeasurementDataByID[measureId];
                    total = 0;
                    this._getMeasurementTimestampsSorted(measureId).forEach((time: number): void => {
                        var value: number = data[time], dt: number;
                        if (!prevTime) {
                            prevTime = time;
                            return;
                        }
                        dt = time - prevTime;
                        // TODO should value below be dv = data[time] - data[prevTime] ??
                        total += dt * value * carbonCount;
                        integral[time] = total;
                        prevTime = time;
                    });
                });
            return integralsByMeasurementID;
        }


        // Returns an array of timestamps for this assay sorted by time.
        private _getMeasurementTimestampsSorted(measurementID: number): number[] {
            var data: Integral = this._assayMeasurementDataByID[measurementID];
            if (!data) {
                console.log('Warning: No sorted timestamp array for measurement ' + measurementID);
                return [];
            }
            // jQuery map gives object indexes as string, so need to parseFloat before sorting
            return $.map(data, (value: number, time: string): number => parseFloat(time)).sort();
        }


        // Go through all measurements in this metabolite, figure out the carbon count, and
        // return a sorted list of {timeStamp, value} objects. values are in Cmol/L.
        private _buildSortedMeasurementsForAssayMetabolite(line: LineData,
            measurementID: number,
            integralsByMeasurementID: IntegralLookup,
            biomassCalculation: number): TimeSample[] {
            var measurement: AssayMeasurementRecord = EDDData.AssayMeasurements[measurementID],
                sortedMeasurements: TimeSample[] = [];

            this._getMeasurementTimestampsSorted(measurementID).forEach(
                (time: number, i: number, a: number[]): void => {
                    var writeDebugOutput: boolean = false,
                        result: ValidatedValue,
                        sample: TimeSample;
                    if (this._debugTimeStamp && line.getLineID() === this._debugLineID) {
                        // debug if current OR next time is the debug time
                        if (time === this._debugTimeStamp ||
                            (i + 1 < a.length && a[i + 1] === this._debugTimeStamp)) {
                            writeDebugOutput = true;
                        }
                    }
                    result = this._calculateCmMolPerLiter(measurementID, time,
                        integralsByMeasurementID, biomassCalculation, writeDebugOutput);
                    if (!result.isValid) {
                        return;
                    }
                    sample = new TimeSample();
                    sample.timeStamp = time;
                    sample.carbonValue = result.value;
                    sortedMeasurements.push(sample);
                });

            return this._calculateCarbonDeltas(sortedMeasurements, line, measurement,
                biomassCalculation);
        }


        // Go through the TimeSamples and calculate their carbonDelta value.
        private _calculateCarbonDeltas(sortedMeasurements: TimeSample[],
            line: LineData,
            measurement: AssayMeasurementRecord,
            biomassCalculation: number): TimeSample[] {
            var mtype: MetaboliteTypeRecord = EDDData.MetaboliteTypes[measurement.type],
                isOpticalDensity: boolean = this._isOpticalDensityMeasurement(mtype),
                assay: AssayRecord = EDDData.Assays[measurement.assay],
                lineRec: LineRecord = EDDData.Lines[assay.lid],
                protocol: any = EDDData.Protocols[assay.pid],
                name: string = [lineRec.name, protocol.name, assay.name].join('-');

            // loop from second element, and use the index of shorter array to get previous
            sortedMeasurements.slice(1).forEach((sample: TimeSample, i: number): void => {
                var prev: TimeSample = sortedMeasurements[i],
                    deltaTime: number = this._calcTimeDelta(prev.timeStamp, sample.timeStamp),
                    writeDebugInfo: boolean, growthRate: number, deltaCarbon: number,
                    odFactor: number, cmMolPerLPerH: number, cmMolPerGdwPerH: number;

                writeDebugInfo = (this._debugTimeStamp
                    && line.getLineID() === this._debugLineID
                    && sample.timeStamp === this._debugTimeStamp);
                if (isOpticalDensity) {
                    // If this is the OD measurement, then we'll use the biomass factor
                    growthRate = (Math.log(sample.carbonValue / prev.carbonValue) / deltaTime);
                    sample.carbonDelta = biomassCalculation * growthRate;
                    if (writeDebugInfo) {
                        this._writeDebugLine(true, "Biomass Calculation for " + name);
                        this._debugOutputIndent++;
                        this._writeDebugLineWithHeader(true,
                            "raw OD at " + prev.timeStamp + "h",
                            this._numStr(prev.carbonValue));
                        this._writeDebugLineWithHeader(true,
                            "raw OD at " + sample.timeStamp + "h",
                            this._numStr(sample.carbonValue));
                        this._writeDebugLineWithHeader(true,
                            "growth rate",
                            "log(" +
                            this._numStr(sample.carbonValue) + " / " +
                            this._numStr(prev.carbonValue) +
                            ") / " + this._numStr(deltaTime) + "h = " +
                            this._numStr(growthRate));
                        this._writeDebugLineWithHeader(true,
                            "biomass factor",
                            " * " + this._numStr(biomassCalculation) + " = " +
                            this._numStr(sample.carbonDelta) + " CmMol/gdw/hr");
                        this._writeDebugLine(true, "");
                        this._debugOutputIndent--;
                    }
                } else {
                    // Gather terms.
                    deltaCarbon = (sample.carbonValue - prev.carbonValue);
                    odFactor = this._calculateOpticalDensityFactor(line, prev.timeStamp,
                        writeDebugInfo);
                    // CmMol/L -> CmMol/L/hr
                    cmMolPerLPerH = (deltaCarbon / deltaTime);
                    // CmMol/L/hr * L/gdw -> CmMol/gdw/hr
                    cmMolPerGdwPerH = cmMolPerLPerH / odFactor;
                    sample.carbonDelta = cmMolPerGdwPerH;
                    // Write some debug output for what we just did.
                    if (writeDebugInfo) {
                        this._writeDebugLine(true, "Convert to CmMol/gdw/hr");
                        this._debugOutputIndent++;
                        this._writeDebugLineWithHeader(true,
                            "delta from " + prev.timeStamp + "h to " + sample.timeStamp + "h",
                            this._numStr(sample.carbonValue) + " CmMol/L - " +
                            this._numStr(prev.carbonValue) + " CmMol/L = " +
                            this._numStr(deltaCarbon) + " CmMol/L");
                        this._writeDebugLineWithHeader(true,
                            "delta time",
                            " / " + this._numStr(deltaTime) + "h = " +
                            this._numStr(cmMolPerLPerH) + " CmMol/L/h");
                        this._writeDebugLineWithHeader(true,
                            "apply OD",
                            " / " + this._numStr(odFactor) + " L/gdw = " +
                            this._numStr(cmMolPerGdwPerH) + " CmMol/gdw/h");
                        this._debugOutputIndent--;
                    }
                }
            });

            return sortedMeasurements;
        }


        // Calculate the difference between two timestamps.
        private _calcTimeDelta(fromTimeStamp: number, toTimeStamp: number): number {
            return (toTimeStamp) - (fromTimeStamp);
        }


        // Find where timeStamp fits in the timeline and interpolate.
        // Returns the index of the timeline and the interpolation amount.
        private _fitOnSortedTimeline(timeStamp: number, timeline: number[]): any {
            // if timeStamp is after last entry in timeline, return last entry
            var inter: any = {
                "index": timeline.length - 2,
                "t": 1
            };
            timeline.some((time: number, i: number): boolean => {
                var prev: number;
                if (timeStamp <= time) {
                    if (i) {
                        inter.index = i - 1;
                        prev = timeline[inter.index];
                        inter.t = (timeStamp - prev) / (time - prev);
                    } else {
                        inter.index = 0;
                        inter.t = 0;
                    }
                    return true;
                }
                return false;
            });
            return inter;
        }


        // Given a line and a timestamp, this function linearly interpolates as necessary to come
        // up with an OD value, then it multiplies by a magic number to arrive at a gdw/L factor
        // that can be factored into measurements.
        private _calculateOpticalDensityFactor(line: LineData,
            timeStamp: number,
            writeDebugInfo: boolean): number {
            // Get the OD measurements.
            var odMeasureID: number = this._getOpticalDensityMeasurementForLine(line.getLineID()),
                // Linearly interpolate on the OD measurement to get the desired factor.
                sortedTime: number[] = this._getMeasurementTimestampsSorted(odMeasureID),
                interpInfo: any = this._fitOnSortedTimeline(timeStamp, sortedTime),
                // This is the (linearly interpolated) OD600 measurement.
                data: Integral = this._assayMeasurementDataByID[odMeasureID],
                t: number = interpInfo.t,
                data1: number = data[sortedTime[interpInfo.index]],
                data2: number = data[sortedTime[interpInfo.index + 1]],
                odMeasurement: number = data1 + (data2 - data1) * t,
                // A magic factor to give us gdw/L for an OD600 measurement.
                // TODO: This can be customized in assay metadata so we should allow for that here.
                odMagicFactor: number = 0.65,
                finalValue: number = odMeasurement * odMagicFactor,
                // declaring variables only assigned when writing debug logs
                measure: AssayMeasurementRecord, assay: AssayRecord, lineRec: LineRecord,
                protocol: any, name: string;

            // Spit out our calculations if requested.
            if (writeDebugInfo) {
                measure = EDDData.AssayMeasurements[odMeasureID];
                assay = EDDData.Assays[measure.assay];
                lineRec = EDDData.Lines[assay.lid];
                protocol = EDDData.Protocols[assay.pid];
                name = [lineRec.name, protocol.name, assay.name].join('-');
                this._writeDebugLine(true, "Getting optical density from " + name);
                this._debugOutputIndent++;
                if (t !== 1) {
                    this._writeDebugLineWithHeader(true,
                        "raw value at " + sortedTime[interpInfo.index] + "h",
                        this._numStr(data1));
                }
                if (t !== 0) {
                    this._writeDebugLineWithHeader(true,
                        "raw value at " + sortedTime[interpInfo.index + 1] + "h",
                        this._numStr(data2));
                }
                if (t !== 0 && t !== 1) {
                    this._writeDebugLineWithHeader(true,
                        "interpolate " + (t * 100).toFixed(2) + "%",
                        this._numStr(data1) + " + (" + this._numStr(data2) + " - " +
                        this._numStr(data1) + ")" + " * " + this._numStr(t) + " = " +
                        this._numStr(odMeasurement) + " L/gdw");
                }

                this._writeDebugLineWithHeader(true,
                    "empirical factor",
                    " * " + this._numStr(odMagicFactor) + " = " +
                    this._numStr(finalValue) + " L/gdw");
                this._writeDebugLine(true, "");
                this._debugOutputIndent--;
            }

            return finalValue;
        }


        // Returns the assay measurement that represents OD for the specified line.
        private _getOpticalDensityMeasurementForLine(lineID: number): number {
            var odMeasureID: number = this._opticalDensityMeasurementIDByLineID[lineID];
            if (typeof odMeasureID !== 'undefined') {
                return odMeasureID;
            } else {
                console.log("Warning! Unable to find OD measurement for " +
                    EDDData.Lines[lineID].name);
                return -1;
            }
        }


        // This calculates the _validAssaysByLineID and _validMeasurementsByAssayID lists,
        // which reduces clutter in all our looping code.
        private _precalculateValidLists(): void {
            $.each(EDDData.Lines, (key: string, line: LineRecord): void => {
                if (line.active) {
                    this._validAssaysByLineID[line.id] = [];
                }
            });
            $.each(EDDData.Assays, (key: string, assay: AssayRecord): void => {
                var list: number[] = this._validAssaysByLineID[assay.lid];
                if (assay.active && list) {
                    list.push(assay.id);
                    this._validMeasurementsByAssayID[assay.id] = [];
                }
            });
            $.each(EDDData.AssayMeasurements, (key: string,
                measure: AssayMeasurementRecord): void => {
                var list: number[] = this._validMeasurementsByAssayID[measure.assay],
                    type: MeasurementTypeRecord = EDDData.MeasurementTypes[measure.type],
                    assay: AssayRecord = EDDData.Assays[measure.assay];
                if (list) {
                    list.push(measure.id);
                    if (type && this._isOpticalDensityMeasurement(type)) {
                        this._opticalDensityMeasurementIDByLineID[assay.lid] = measure.id;
                    }
                }
            });
        }
    }

    export interface AssayLookup {
        [id: number]: AssayData;
    }

    export interface TimelineLookup {
        [id: number]: MetaboliteTimeline;
    }

    // Class definition for elements in Summation.lineDataByID
    export class LineData {
        assaysByID: AssayLookup = <AssayLookup>{};
        private _lineID: number;

        constructor(lineID: number) {
            this._lineID = lineID;
        }

        getLineID(): number {
            return this._lineID;
        }

        // Return a list of AssayData structures that only
        // contain metabolite data for the specified time stamp.
        // (This will not return assays that don't have any metabolite data for this time stamp.)
        filterAssaysByTimeStamp(timeStamp: number): AssayData[] {
            var filteredAssays: AssayData[] = [];
            // jQuery each callback always gives string back for keys
            $.each(this.assaysByID, (akey: string, assay: AssayData): void => {
                var timelines: TimelineLookup = <TimelineLookup>{},
                    numAdded: number = 0,
                    outAssay: AssayData;
                $.each(assay.timelinesByMeasurementId,
                    (tkey: string, timeline: MetaboliteTimeline): void => {
                        var sample: any = timeline.findSampleByTimeStamp(timeStamp),
                            measurement: MetaboliteTimeline;
                        if (sample) {
                            measurement = new MetaboliteTimeline(assay, timeline.measureId);
                            measurement.timeSamples.push(sample);
                            timelines[timeline.measureId] = measurement;
                            ++numAdded;
                        }
                    });
                if (numAdded) {
                    outAssay = new AssayData(assay.assayId);
                    outAssay.timelinesByMeasurementId = timelines;
                    filteredAssays.push(outAssay);
                }
            });
            return filteredAssays;
        }

        // Sum up all the in/out values across all metabolites at the specified timestamp.
        getInOutSumAtTime(timeStamp: number): InOutSum {
            // Grab all the measurements.
            var measurements: InOutSumMeasurement[] = [],
                totalIn: number = 0,
                totalOut: number = 0;
            $.each(this.assaysByID, (key: string, assay: AssayData): void => {
                $.each(assay.timelinesByMeasurementId, (key: string,
                    timeline: MetaboliteTimeline): void => {
                    var inout: InOutSumMeasurement = new InOutSumMeasurement();
                    inout.timeline = assay.timelinesByMeasurementId[timeline.measureId];
                    inout.carbonDelta = inout.timeline.interpolateCarbonDelta(timeStamp);
                    if (inout.carbonDelta > 0) {
                        totalOut += inout.carbonDelta;
                    } else {
                        totalIn -= inout.carbonDelta;
                    }
                    measurements.push(inout);
                });
            });
            return new InOutSum(totalIn, totalOut, measurements);
        }
    }

    // This represents a baked-down version of the LineData/AssayData, where we've
    // summed up carbon data for all assays at each time point.
    export class MergedLineSamples {
        // Ordered by time stamp, these are the merged samples with carbon in/out data.
        mergedLineSamples: MergedLineSample[] = [];

        // This is a list of all timelines that were sampled to build the sums in mergedLineSamples.
        metaboliteTimelines: MetaboliteTimeline[] = [];
    }

    export class MergedLineSample {
        timeStamp: number;
        totalCarbonIn: number = 0;
        totalCarbonOut: number = 0;

        constructor(timeStamp: number) {
            this.timeStamp = timeStamp;
        }
    }

    export class InOutSum {
        totalIn: number;
        totalOut: number;
        measurements: InOutSumMeasurement[];

        constructor(totalIn: number, totalOut: number, measurements: InOutSumMeasurement[]) {
            this.totalIn = totalIn;
            this.totalOut = totalOut;
            this.measurements = measurements;
        }
    }

    export class InOutSumMeasurement {
        timeline: MetaboliteTimeline;
        carbonDelta: number;

        absDelta(): number {
            return Math.abs(this.carbonDelta);
        }
    }

    export class AssayData {
        timelinesByMeasurementId: TimelineLookup = <TimelineLookup>{};
        assayId: number;

        constructor(assayID: number) {
            this.assayId = assayID;
        }

        // Return a list of [measurementID, TimeSample] objects, one for each
        // measurement that has a sample at the specified time stamp.
        getTimeSamplesByTimeStamp(timeStamp: number): any[] {
            return $.map(this.timelinesByMeasurementId, (timeline: MetaboliteTimeline): any => {
                var sample: TimeSample = timeline.findSampleByTimeStamp(timeStamp);
                if (sample) {
                    return {
                        "measurementID": timeline.measureId,
                        "timeSample": sample
                    };
                }
            });
        }
    }

    export class MetaboliteTimeline {
        assay: AssayData;
        timeSamples: TimeSample[] = [];
        measureId: number;

        constructor(assay: AssayData, measurementID: number) {
            // Of type Summation.TimeSample. Sorted by timeStamp.
            // Note that sample 0's carbonDelta will be 0 since it has no previous measurement.
            this.assay = assay;
            this.measureId = measurementID;
        }

        // This is the easiest function to call to get the carbon delta at a specific time.
        // If this timeline doesn't have a sample at that position, it'll interpolate between
        // the nearest two.
        interpolateCarbonDelta(timeStamp: number): number {
            var prev: TimeSample, delta: number;
            if (this.timeSamples.length === 0) {
                return 0;
            }
            // If the time stamp is before all our samples, just return our first sample's
            // carbon delta.
            prev = this.timeSamples[0];
            if (timeStamp <= prev.timeStamp) {
                return this.timeSamples[0].carbonDelta;
            }
            this.timeSamples.some((sample: TimeSample): boolean => {
                if (sample.timeStamp === timeStamp) {
                    delta = sample.carbonDelta;
                    return true;
                }
                if (timeStamp >= prev.timeStamp && timeStamp <= sample.timeStamp) {
                    delta = Utl.JS.remapValue(timeStamp, prev.timeStamp, sample.timeStamp,
                        prev.carbonDelta, sample.carbonDelta);
                    return true;
                }
                prev = sample;
            });
            if (delta === undefined) {
                // The time stamp they passed in must be past all our samples.
                return this.timeSamples.slice(-1)[0].carbonDelta;
            }
            return delta;
        }

        // Return a TimeSample or null.
        findSampleByTimeStamp(timeStamp: number): TimeSample {
            var matched: TimeSample[];
            matched = this.timeSamples.filter(
                (sample: TimeSample): boolean => sample.timeStamp === timeStamp);
            if (matched.length) {
                return matched[0];
            }
            return null;
        }

    }

    // Data for a single line for a single point in time.
    export class TimeSample {
        // in hours
        timeStamp: number = 0;
        // ** NOTE: CmMol here means carbon milli-moles.
        // CmMol/L of carbon at this timestamp
        carbonValue: number = 0;
        // CmMol/gdw/hr
        // delta between this carbon value and the previous one (0 for the first entry):
        // -- POSITIVE means output (in that the organism outputted this metabolite for the time
        //      span in question)
        // -- NEGATIVE means input  (in that the organism reduced the amount of this metabolite
        //      for the time span)
        carbonDelta: number = 0;

        isInput(): boolean {
            return this.carbonDelta <= 0;
        }

        isOutput(): boolean {
            return this.carbonDelta > 0;
        }

        // Return the absolute value of carbonDelta. You'll need to use isInput() or isOutput()
        // to know which it represents.
        absDelta(): number {
            return Math.abs(this.carbonDelta);
        }
    }

    interface MergedLineTimeLookup {
        [index: number]: MergedLineSample;
    }

    // Step 1 is where CarbonBalance.Summation builds a timeline for each line->assay->metabolite.
    // Step 2 is where this class merges all the assay->metabolite timelines into one timeline
    // for each line.
    export class TimelineMerger {

        // Take the input LineData and sum up all measurements across all assays/metabolites
        // into a list of {timeStamp, totalCarbonIn, totalCarbonOut} objects (sorted by timeStamp).
        public static mergeAllLineSamples(lineData: LineData): MergedLineSamples {
            var mergedLineSamples: MergedLineSamples = new MergedLineSamples(),
                // First, build a list of timestamps from "primary assays" (i.e. non-RAMOS assays).
                // object is being used as a set
                validTimeStamps: { [i: number]: number } = {},
                mergedSamples: MergedLineTimeLookup = <MergedLineTimeLookup>{};

            $.each(lineData.assaysByID, (akey: string, assay: AssayData): void => {
                $.each(assay.timelinesByMeasurementId,
                    (tkey: string, timeline: MetaboliteTimeline): void => {
                        mergedLineSamples.metaboliteTimelines.push(timeline);
                        if (TimelineMerger._isPrimaryAssay(assay)) {
                            timeline.timeSamples.forEach((sample: TimeSample): void => {
                                validTimeStamps[sample.timeStamp] = sample.timeStamp;
                            });
                        }
                    });
            });
            $.each(validTimeStamps, (key: string, timeStamp: number): void => {
                var outSample: MergedLineSample, timelines: MetaboliteTimeline[];
                if (timeStamp === 0) {
                    return;
                }
                outSample = new MergedLineSample(timeStamp);
                mergedSamples[timeStamp] = outSample;
                timelines = mergedLineSamples.metaboliteTimelines;
                timelines.forEach((timeline: MetaboliteTimeline): void => {
                    var carbonDelta: number = timeline.interpolateCarbonDelta(timeStamp);
                    if (carbonDelta > 0) {
                        outSample.totalCarbonOut += carbonDelta;
                    } else {
                        outSample.totalCarbonIn -= carbonDelta;
                    }
                });
            });
            // sort the samples by timestamp
            mergedLineSamples.mergedLineSamples = $.map(
                mergedSamples,
                (sample: MergedLineSample): MergedLineSample => sample
            ).sort((a: MergedLineSample, b: MergedLineSample): number => {
                return a.timeStamp - b.timeStamp;
            });
            return mergedLineSamples;
        }

        // Returns true if this is a "primary" assay, which means that we'll use it to generate
        // carbon balance time samples. A non-primary assay is something that generates a ton of
        // samples like RAMOS.
        private static _isPrimaryAssay(assay: AssayData): boolean {
            var serverAssayData: AssayRecord = EDDData.Assays[assay.assayId],
                protocol: any = EDDData.Protocols[serverAssayData.pid];
            // TODO: Fragile
            return (protocol.name !== 'O2/CO2');
        }
    }

} // end module CarbonBalance
