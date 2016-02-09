// Compiled to JS on: Mon Jan 25 2016 15:26:24  
/// <reference path="typescript-declarations.d.ts" />
/// <reference path="Utl.ts" />
/// <reference path="EDDDataInterface.ts" />
/// <reference path="StudyCarbonBalance.ts" />
var CarbonBalance;
(function (CarbonBalance) {
    'use strict';
    // This is the client-side container for carbon balance data.
    // It combs through lines/assays/measurements to build a structure that is easy
    // to pull from when displaying carbon balance data.
    //
    // This is purely a data class, NOT a display class.
    var Summation = (function () {
        function Summation() {
            // Data for each line of type Summation.LineData.
            this.lineDataByID = {};
            // The highest time value that any TimeSample has.
            this.lastTimeInSeconds = 0;
            // Precalculated lookups to speed things up.
            // An array of non-disabled assays for each line.
            this._validAssaysByLineID = {};
            // An array of non-disabled measurements for each assay.
            this._validMeasurementsByAssayID = {};
            // Lookup the OD measurement for each line.
            this._opticalDensityMeasurementIDByLineID = {};
            this._debugLineID = 0;
            // Auto tab on debug output.
            this._debugOutputIndent = 0;
        }
        // Use this to create a summation object.
        Summation.create = function (biomassCalculation) {
            var sum = new Summation();
            sum.init(biomassCalculation);
            return sum;
        };
        // Use this to generate some debug text that describes all the calculations.
        Summation.generateDebugText = function (biomassCalculation, debugLineID, debugTimeStamp) {
            // Create a Summation object but tell it to generate debug info while it does its
            // timestamps.
            var sum = new Summation();
            sum._debugLineID = debugLineID;
            sum._debugTimeStamp = debugTimeStamp;
            sum._debugOutput = "";
            sum.init(biomassCalculation);
            // Return its debug info.
            return sum._debugOutput;
        };
        // This just wraps the call to TimelineMerger.mergeAllLineSamples.
        Summation.prototype.mergeAllLineSamples = function (lineData) {
            return TimelineMerger.mergeAllLineSamples(lineData);
        };
        Summation.prototype.getLineDataByID = function (lineID) {
            return this.lineDataByID[lineID];
        };
        // Internally, this is how we init the Summation object regardless of whether it's used
        // later or whether it's just used to get some debug text.
        Summation.prototype.init = function (biomassCalculation) {
            var _this = this;
            var integralsByMeasurementID;
            this._precalculateValidLists();
            // Convert to a hash on timestamp (x value)
            this._assayMeasurementDataByID = {};
            $.each(EDDData.AssayMeasurements, function (id, measure) {
                var out = _this._assayMeasurementDataByID[id] = {};
                $.each(measure.values, function (i, point) {
                    // only do mapping for (x,y) points, won't make sense with higher dimensions
                    if (point[0].length === 1 && point[1].length === 1) {
                        out[point[0][0]] = point[1][0];
                    }
                });
            });
            // We need to prepare integrals of any mol/L/hr
            integralsByMeasurementID = this._integrateAssayMeasurements(biomassCalculation);
            // Iterate over lines.
            $.each(EDDData.Lines, function (lineId, line) {
                var out, anySamplesAdded = false;
                if (!line.active) {
                    return;
                }
                out = new LineData(line.id);
                _this._validAssaysByLineID[line.id].forEach(function (assayId) {
                    var assay = EDDData.Assays[assayId], protocol = EDDData.Protocols[assay.pid], name = [line.name, protocol.name, assay.name].join('-'), outAssay = new AssayData(assayId), valid = 0;
                    _this._writeDebugLine(line.id === _this._debugLineID, "Assay " + name);
                    _this._debugOutputIndent++;
                    _this._validMeasurementsByAssayID[assayId].forEach(function (measureId) {
                        var measure = EDDData.AssayMeasurements[measureId], timeline;
                        if (!_this._doesMeasurementContainCarbon(measure)) {
                            return;
                        }
                        _this._writeDebugLine(line.id === _this._debugLineID, EDDData.MetaboliteTypes[measure.type].name);
                        _this._debugOutputIndent++;
                        valid++;
                        // Create MetaboliteTimeline output structure
                        timeline = new MetaboliteTimeline(outAssay, measureId);
                        outAssay.timelinesByMeasurementId[measureId] = timeline;
                        // Build a sorted list of timestamp/measurement
                        timeline.timeSamples = _this._buildSortedMeasurementsForAssayMetabolite(out, measureId, integralsByMeasurementID, biomassCalculation);
                        // Keep track of the last sample's time
                        if (timeline.timeSamples) {
                            anySamplesAdded = true;
                            _this.lastTimeInSeconds = Math.max(_this.lastTimeInSeconds, timeline.timeSamples.slice(-1)[0].timeStamp);
                        }
                        _this._writeDebugLine(line.id === _this._debugLineID, "");
                        _this._debugOutputIndent--;
                    });
                    // store the assay
                    out.assaysByID[assayId] = outAssay;
                    _this._writeDebugLine(line.id === _this._debugLineID, "");
                    _this._debugOutputIndent--;
                });
                if (anySamplesAdded) {
                    _this.lineDataByID[line.id] = out;
                }
            });
        };
        // Append the string to our _debugOutput string if shouldWrite=true.
        // (Having shouldWrite there makes it easier to do a one-line debug output that includes
        // the check of whether it should write).
        Summation.prototype._writeDebugLine = function (shouldWrite, val) {
            if (!shouldWrite) {
                return;
            }
            var indent = [];
            // keep adding indents until reach length of _debugOutputIndent
            /* tslint:disable:curly */
            while (this._debugOutputIndent && this._debugOutputIndent > indent.push('    '))
                ;
            /* tslint:enable:curly */
            this._debugOutput += indent.join('') + val + "\n";
        };
        Summation.prototype._writeDebugLineWithHeader = function (shouldWrite, header, val) {
            var str = Utl.JS.padStringLeft("[" + header + "] ", 30);
            this._writeDebugLine(shouldWrite, str + val);
        };
        // Convert a number to a string for debug output. If all the code uses this, then
        // all the number formatting will be consistent.
        Summation.prototype._numStr = function (value) {
            return parseFloat(value).toFixed(5);
        };
        // This is used in a first pass on a measurement to decide if we should scan its
        // measurements. If you update this, update calculateCmolPerLiter (and vice-versa).
        Summation.prototype._doesMeasurementContainCarbon = function (measure) {
            var mtype = EDDData.MetaboliteTypes[measure.type];
            if (!mtype) {
                return false;
            }
            // OD measurements use the biomass factor to estimate the amount of carbon created
            // or destroyed. There's no guarantee we hae a valid biomass factor, but we definitely
            // know there is carbon here.
            if (this._isOpticalDensityMeasurement(mtype)) {
                return true;
            }
            var uRecord = EDDData.UnitTypes[measure.y_units];
            var units = uRecord ? uRecord.name : '';
            var carbonCount = mtype.cc; // # carbons per mole
            if (units === '' || units === 'n/a' || !carbonCount) {
                return false;
            }
            else if (units === 'g/L') {
                // g/L is fine if we have a molar mass so we can convert g->mol
                return !!mtype.mm;
            }
            else {
                // Anything using mols is fine as well.
                return (units === 'mol/L/hr' ||
                    units === 'uM' ||
                    units === 'mM' ||
                    units === 'mol/L' ||
                    units === 'Cmol/L');
            }
        };
        // Do unit conversions in order to get a Cmol/L value.
        // ** NOTE: This is "C-moles", which is CARBON mol/L (as opposed to CENTI mol/L).
        Summation.prototype._calculateCmMolPerLiter = function (measurementID, timeStamp, integralsByMeasurementID, biomassCalculation, dOut) {
            // A measurement is the time series data for ONE metabolite
            // measurement.values contains all the meaty stuff - a 3-dimensional array with:
            // first index selecting point value;
            // second index 0 for x, 1 for y;
            // third index subscripted values;
            // e.g. measurement.values[2][0][1] is the x1 value of the third measurement value
            var measurement = EDDData.AssayMeasurements[measurementID], measurementType = EDDData.MetaboliteTypes[measurement.type], uRecord = EDDData.UnitTypes[measurement.y_units], units = uRecord ? uRecord.name : '', carbonCount = measurementType.cc, // # carbons per mole
            finalValue = 0, isValid = false, isOpticalDensity = this._isOpticalDensityMeasurement(measurementType), value = this._assayMeasurementDataByID[measurementID][timeStamp];
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
            }
            else if (units === 'mol/L/hr') {
                var integrals = integralsByMeasurementID[measurementID];
                if (integrals) {
                    finalValue = integrals[timeStamp] * 1000;
                    isValid = (typeof finalValue !== 'undefined');
                }
            }
            else if (units === '' || units === 'n/a' || !carbonCount) {
            }
            else {
                // Check for various conversions that we might need to do.
                if (dOut) {
                    this._writeDebugLine(true, timeStamp + "h");
                    this._debugOutputIndent++;
                    this._writeDebugLineWithHeader(true, "raw value", this._numStr(value) + " " + units);
                }
                if (value === 0) {
                    // Don't bother with all this work (and debug output) if the value is 0.
                    finalValue = value;
                    isValid = true;
                }
                else if (typeof value !== 'undefined') {
                    // Convert uM to mol/L. Note: even though it's not written as uM/L, these
                    // quantities should be treated as per-liter.
                    if (units === 'uM') {
                        value = value / 1000;
                        units = 'mMol/L';
                        this._writeDebugLineWithHeader(dOut, "convert", " / 1000 = " + this._numStr(value) + " mol/L");
                    }
                    // Do molar mass conversions.
                    if (units === 'g/L') {
                        if (!measurementType.mm) {
                            // We should never get in here.
                            this._writeDebugLine(dOut, "Trying to calculate carbon for a g/L " +
                                "metabolite with an unspecified molar mass! " +
                                "(The code should never get here).");
                        }
                        else {
                            // (g/L) * (mol/g) = (mol/L)
                            value = value * 1000 / measurementType.mm;
                            this._writeDebugLineWithHeader(dOut, "divide by molar mass", [" * 1000 /", measurementType.mm, "g/mol =",
                                this._numStr(value), "mMol/L"].join(' '));
                            units = 'mMol/L';
                        }
                    }
                    // Convert mMol/L to CmMol/L.
                    // ** NOTE: This is "C-moles", which is CARBON mol/L
                    // (as opposed to CENTI mol/L).
                    if (units === 'mMol/L') {
                        value *= carbonCount;
                        this._writeDebugLineWithHeader(dOut, "multiply by carbon count", " * " + carbonCount + " = " + this._numStr(value) + " CmMol/L");
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
        };
        Summation.prototype._isOpticalDensityMeasurement = function (measurementType) {
            return measurementType.name === 'Optical Density';
        };
        // Returns a hash of assayMeasurementID->{time->integral} for any mol/L/hr measurements.
        Summation.prototype._integrateAssayMeasurements = function (biomassCalculation) {
            var _this = this;
            var integralsByMeasurementID = {};
            $.each(EDDData.AssayMeasurements, function (measureId, measure) {
                var mtype = EDDData.MetaboliteTypes[measure.type], carbonCount, uRecord, units, integral = {}, data, prevTime, total;
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
                data = _this._assayMeasurementDataByID[measureId];
                total = 0;
                _this._getMeasurementTimestampsSorted(measureId).forEach(function (time) {
                    var value = data[time], dt;
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
        };
        // Returns an array of timestamps for this assay sorted by time.
        Summation.prototype._getMeasurementTimestampsSorted = function (measurementID) {
            var data = this._assayMeasurementDataByID[measurementID];
            if (!data) {
                console.log('Warning: No sorted timestamp array for measurement ' + measurementID);
                return [];
            }
            // jQuery map gives object indexes as string, so need to parseFloat before sorting
            return $.map(data, function (value, time) { return parseFloat(time); }).sort();
        };
        // Go through all measurements in this metabolite, figure out the carbon count, and 
        // return a sorted list of {timeStamp, value} objects. values are in Cmol/L.
        Summation.prototype._buildSortedMeasurementsForAssayMetabolite = function (line, measurementID, integralsByMeasurementID, biomassCalculation) {
            var _this = this;
            var measurement = EDDData.AssayMeasurements[measurementID], sortedMeasurements = [];
            this._getMeasurementTimestampsSorted(measurementID).forEach(function (time, i, a) {
                var writeDebugOutput = false, result, sample;
                if (_this._debugTimeStamp && line.getLineID() === _this._debugLineID) {
                    // debug if current OR next time is the debug time
                    if (time === _this._debugTimeStamp ||
                        (i + 1 < a.length && a[i + 1] === _this._debugTimeStamp)) {
                        writeDebugOutput = true;
                    }
                }
                result = _this._calculateCmMolPerLiter(measurementID, time, integralsByMeasurementID, biomassCalculation, writeDebugOutput);
                if (!result.isValid) {
                    return;
                }
                sample = new TimeSample();
                sample.timeStamp = time;
                sample.carbonValue = result.value;
                sortedMeasurements.push(sample);
            });
            return this._calculateCarbonDeltas(sortedMeasurements, line, measurement, biomassCalculation);
        };
        // Go through the TimeSamples and calculate their carbonDelta value.
        Summation.prototype._calculateCarbonDeltas = function (sortedMeasurements, line, measurement, biomassCalculation) {
            var _this = this;
            var mtype = EDDData.MetaboliteTypes[measurement.type], isOpticalDensity = this._isOpticalDensityMeasurement(mtype), assay = EDDData.Assays[measurement.assay], lineRec = EDDData.Lines[assay.lid], protocol = EDDData.Protocols[assay.pid], name = [lineRec.name, protocol.name, assay.name].join('-');
            // loop from second element, and use the index of shorter array to get previous
            sortedMeasurements.slice(1).forEach(function (sample, i) {
                var prev = sortedMeasurements[i], deltaTime = _this._calcTimeDelta(prev.timeStamp, sample.timeStamp), writeDebugInfo, growthRate, deltaCarbon, odFactor, cmMolPerLPerH, cmMolPerGdwPerH;
                writeDebugInfo = (_this._debugTimeStamp
                    && line.getLineID() === _this._debugLineID
                    && sample.timeStamp === _this._debugTimeStamp);
                if (isOpticalDensity) {
                    // If this is the OD measurement, then we'll use the biomass factor
                    growthRate = (Math.log(sample.carbonValue / prev.carbonValue) / deltaTime);
                    sample.carbonDelta = biomassCalculation * growthRate;
                    if (writeDebugInfo) {
                        _this._writeDebugLine(true, "Biomass Calculation for " + name);
                        _this._debugOutputIndent++;
                        _this._writeDebugLineWithHeader(true, "raw OD at " + prev.timeStamp + "h", _this._numStr(prev.carbonValue));
                        _this._writeDebugLineWithHeader(true, "raw OD at " + sample.timeStamp + "h", _this._numStr(sample.carbonValue));
                        _this._writeDebugLineWithHeader(true, "growth rate", "log(" +
                            _this._numStr(sample.carbonValue) + " / " +
                            _this._numStr(prev.carbonValue) +
                            ") / " + _this._numStr(deltaTime) + "h = " +
                            _this._numStr(growthRate));
                        _this._writeDebugLineWithHeader(true, "biomass factor", " * " + _this._numStr(biomassCalculation) + " = " +
                            _this._numStr(sample.carbonDelta) + " CmMol/gdw/hr");
                        _this._writeDebugLine(true, "");
                        _this._debugOutputIndent--;
                    }
                }
                else {
                    // Gather terms.
                    deltaCarbon = (sample.carbonValue - prev.carbonValue);
                    odFactor = _this._calculateOpticalDensityFactor(line, prev.timeStamp, writeDebugInfo);
                    // CmMol/L -> CmMol/L/hr
                    cmMolPerLPerH = (deltaCarbon / deltaTime);
                    // CmMol/L/hr * L/gdw -> CmMol/gdw/hr
                    cmMolPerGdwPerH = cmMolPerLPerH / odFactor;
                    sample.carbonDelta = cmMolPerGdwPerH;
                    // Write some debug output for what we just did.
                    if (writeDebugInfo) {
                        _this._writeDebugLine(true, "Convert to CmMol/gdw/hr");
                        _this._debugOutputIndent++;
                        _this._writeDebugLineWithHeader(true, "delta from " + prev.timeStamp + "h to " + sample.timeStamp + "h", _this._numStr(sample.carbonValue) + " CmMol/L - " +
                            _this._numStr(prev.carbonValue) + " CmMol/L = " +
                            _this._numStr(deltaCarbon) + " CmMol/L");
                        _this._writeDebugLineWithHeader(true, "delta time", " / " + _this._numStr(deltaTime) + "h = " +
                            _this._numStr(cmMolPerLPerH) + " CmMol/L/h");
                        _this._writeDebugLineWithHeader(true, "apply OD", " / " + _this._numStr(odFactor) + " L/gdw = " +
                            _this._numStr(cmMolPerGdwPerH) + " CmMol/gdw/h");
                        _this._debugOutputIndent--;
                    }
                }
            });
            return sortedMeasurements;
        };
        // Calculate the difference between two timestamps.
        Summation.prototype._calcTimeDelta = function (fromTimeStamp, toTimeStamp) {
            return (toTimeStamp) - (fromTimeStamp);
        };
        // Find where timeStamp fits in the timeline and interpolate.
        // Returns the index of the timeline and the interpolation amount.
        Summation.prototype._fitOnSortedTimeline = function (timeStamp, timeline) {
            // if timeStamp is after last entry in timeline, return last entry
            var inter = {
                "index": timeline.length - 2,
                "t": 1
            };
            timeline.some(function (time, i) {
                var prev;
                if (timeStamp <= time) {
                    if (i) {
                        inter.index = i - 1;
                        prev = timeline[inter.index];
                        inter.t = (timeStamp - prev) / (time - prev);
                    }
                    else {
                        inter.index = 0;
                        inter.t = 0;
                    }
                    return true;
                }
                return false;
            });
            return inter;
        };
        // Given a line and a timestamp, this function linearly interpolates as necessary to come
        // up with an OD value, then it multiplies by a magic number to arrive at a gdw/L factor
        // that can be factored into measurements.
        Summation.prototype._calculateOpticalDensityFactor = function (line, timeStamp, writeDebugInfo) {
            // Get the OD measurements.
            var odMeasureID = this._getOpticalDensityMeasurementForLine(line.getLineID()), 
            // Linearly interpolate on the OD measurement to get the desired factor.
            sortedTime = this._getMeasurementTimestampsSorted(odMeasureID), interpInfo = this._fitOnSortedTimeline(timeStamp, sortedTime), 
            // This is the (linearly interpolated) OD600 measurement.
            data = this._assayMeasurementDataByID[odMeasureID], t = interpInfo.t, data1 = data[sortedTime[interpInfo.index]], data2 = data[sortedTime[interpInfo.index + 1]], odMeasurement = data1 + (data2 - data1) * t, 
            // A magic factor to give us gdw/L for an OD600 measurement.
            // TODO: This can be customized in assay metadata so we should allow for that here.
            odMagicFactor = 0.65, finalValue = odMeasurement * odMagicFactor, 
            // declaring variables only assigned when writing debug logs
            measure, assay, lineRec, protocol, name;
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
                    this._writeDebugLineWithHeader(true, "raw value at " + sortedTime[interpInfo.index] + "h", this._numStr(data1));
                }
                if (t !== 0) {
                    this._writeDebugLineWithHeader(true, "raw value at " + sortedTime[interpInfo.index + 1] + "h", this._numStr(data2));
                }
                if (t !== 0 && t !== 1) {
                    this._writeDebugLineWithHeader(true, "interpolate " + (t * 100).toFixed(2) + "%", this._numStr(data1) + " + (" + this._numStr(data2) + " - " +
                        this._numStr(data1) + ")" + " * " + this._numStr(t) + " = " +
                        this._numStr(odMeasurement) + " L/gdw");
                }
                this._writeDebugLineWithHeader(true, "empirical factor", " * " + this._numStr(odMagicFactor) + " = " +
                    this._numStr(finalValue) + " L/gdw");
                this._writeDebugLine(true, "");
                this._debugOutputIndent--;
            }
            return finalValue;
        };
        // Returns the assay measurement that represents OD for the specified line.
        Summation.prototype._getOpticalDensityMeasurementForLine = function (lineID) {
            var odMeasureID = this._opticalDensityMeasurementIDByLineID[lineID];
            if (typeof odMeasureID !== 'undefined') {
                return odMeasureID;
            }
            else {
                console.log("Warning! Unable to find OD measurement for " +
                    EDDData.Lines[lineID].name);
                return -1;
            }
        };
        // This calculates the _validAssaysByLineID and _validMeasurementsByAssayID lists,
        // which reduces clutter in all our looping code.
        Summation.prototype._precalculateValidLists = function () {
            var _this = this;
            $.each(EDDData.Lines, function (key, line) {
                if (line.active) {
                    _this._validAssaysByLineID[line.id] = [];
                }
            });
            $.each(EDDData.Assays, function (key, assay) {
                var list = _this._validAssaysByLineID[assay.lid];
                if (assay.active && list) {
                    list.push(assay.id);
                    _this._validMeasurementsByAssayID[assay.id] = [];
                }
            });
            $.each(EDDData.AssayMeasurements, function (key, measure) {
                var list = _this._validMeasurementsByAssayID[measure.assay], type = EDDData.MeasurementTypes[measure.type], assay = EDDData.Assays[measure.assay];
                if (list) {
                    list.push(measure.id);
                    if (type && _this._isOpticalDensityMeasurement(type)) {
                        _this._opticalDensityMeasurementIDByLineID[assay.lid] = measure.id;
                    }
                }
            });
        };
        return Summation;
    })();
    CarbonBalance.Summation = Summation;
    // Class definition for elements in Summation.lineDataByID
    var LineData = (function () {
        function LineData(lineID) {
            this.assaysByID = {};
            this._lineID = lineID;
        }
        LineData.prototype.getLineID = function () {
            return this._lineID;
        };
        // Return a list of AssayData structures that only
        // contain metabolite data for the specified time stamp.
        // (This will not return assays that don't have any metabolite data for this time stamp.)
        LineData.prototype.filterAssaysByTimeStamp = function (timeStamp) {
            var filteredAssays = [];
            // jQuery each callback always gives string back for keys
            $.each(this.assaysByID, function (akey, assay) {
                var timelines = {}, numAdded = 0, outAssay;
                $.each(assay.timelinesByMeasurementId, function (tkey, timeline) {
                    var sample = timeline.findSampleByTimeStamp(timeStamp), measurement;
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
        };
        // Sum up all the in/out values across all metabolites at the specified timestamp.
        LineData.prototype.getInOutSumAtTime = function (timeStamp) {
            // Grab all the measurements.
            var measurements = [], totalIn = 0, totalOut = 0;
            $.each(this.assaysByID, function (key, assay) {
                $.each(assay.timelinesByMeasurementId, function (key, timeline) {
                    var inout = new InOutSumMeasurement();
                    inout.timeline = assay.timelinesByMeasurementId[timeline.measureId];
                    inout.carbonDelta = inout.timeline.interpolateCarbonDelta(timeStamp);
                    if (inout.carbonDelta > 0) {
                        totalOut += inout.carbonDelta;
                    }
                    else {
                        totalIn -= inout.carbonDelta;
                    }
                    measurements.push(inout);
                });
            });
            return new InOutSum(totalIn, totalOut, measurements);
        };
        return LineData;
    })();
    CarbonBalance.LineData = LineData;
    // This represents a baked-down version of the LineData/AssayData, where we've
    // summed up carbon data for all assays at each time point.
    var MergedLineSamples = (function () {
        function MergedLineSamples() {
            // Ordered by time stamp, these are the merged samples with carbon in/out data.
            this.mergedLineSamples = [];
            // This is a list of all timelines that were sampled to build the sums in mergedLineSamples.
            this.metaboliteTimelines = [];
        }
        return MergedLineSamples;
    })();
    CarbonBalance.MergedLineSamples = MergedLineSamples;
    var MergedLineSample = (function () {
        function MergedLineSample(timeStamp) {
            this.totalCarbonIn = 0;
            this.totalCarbonOut = 0;
            this.timeStamp = timeStamp;
        }
        return MergedLineSample;
    })();
    CarbonBalance.MergedLineSample = MergedLineSample;
    var InOutSum = (function () {
        function InOutSum(totalIn, totalOut, measurements) {
            this.totalIn = totalIn;
            this.totalOut = totalOut;
            this.measurements = measurements;
        }
        return InOutSum;
    })();
    CarbonBalance.InOutSum = InOutSum;
    var InOutSumMeasurement = (function () {
        function InOutSumMeasurement() {
        }
        InOutSumMeasurement.prototype.absDelta = function () {
            return Math.abs(this.carbonDelta);
        };
        return InOutSumMeasurement;
    })();
    CarbonBalance.InOutSumMeasurement = InOutSumMeasurement;
    var AssayData = (function () {
        function AssayData(assayID) {
            this.timelinesByMeasurementId = {};
            this.assayId = assayID;
        }
        // Return a list of [measurementID, TimeSample] objects, one for each
        // measurement that has a sample at the specified time stamp.
        AssayData.prototype.getTimeSamplesByTimeStamp = function (timeStamp) {
            return $.map(this.timelinesByMeasurementId, function (timeline) {
                var sample = timeline.findSampleByTimeStamp(timeStamp);
                if (sample) {
                    return {
                        "measurementID": timeline.measureId,
                        "timeSample": sample
                    };
                }
            });
        };
        return AssayData;
    })();
    CarbonBalance.AssayData = AssayData;
    var MetaboliteTimeline = (function () {
        function MetaboliteTimeline(assay, measurementID) {
            this.timeSamples = [];
            // Of type Summation.TimeSample. Sorted by timeStamp.
            // Note that sample 0's carbonDelta will be 0 since it has no previous measurement.
            this.assay = assay;
            this.measureId = measurementID;
        }
        // This is the easiest function to call to get the carbon delta at a specific time.
        // If this timeline doesn't have a sample at that position, it'll interpolate between
        // the nearest two.
        MetaboliteTimeline.prototype.interpolateCarbonDelta = function (timeStamp) {
            var prev, delta;
            if (this.timeSamples.length === 0) {
                return 0;
            }
            // If the time stamp is before all our samples, just return our first sample's
            // carbon delta.
            prev = this.timeSamples[0];
            if (timeStamp <= prev.timeStamp) {
                return this.timeSamples[0].carbonDelta;
            }
            this.timeSamples.some(function (sample) {
                if (sample.timeStamp === timeStamp) {
                    delta = sample.carbonDelta;
                    return true;
                }
                if (timeStamp >= prev.timeStamp && timeStamp <= sample.timeStamp) {
                    delta = Utl.JS.remapValue(timeStamp, prev.timeStamp, sample.timeStamp, prev.carbonDelta, sample.carbonDelta);
                    return true;
                }
                prev = sample;
            });
            if (delta === undefined) {
                // The time stamp they passed in must be past all our samples.
                return this.timeSamples.slice(-1)[0].carbonDelta;
            }
            return delta;
        };
        // Return a TimeSample or null.
        MetaboliteTimeline.prototype.findSampleByTimeStamp = function (timeStamp) {
            var matched;
            matched = this.timeSamples.filter(function (sample) { return sample.timeStamp === timeStamp; });
            if (matched.length) {
                return matched[0];
            }
            return null;
        };
        return MetaboliteTimeline;
    })();
    CarbonBalance.MetaboliteTimeline = MetaboliteTimeline;
    // Data for a single line for a single point in time.
    var TimeSample = (function () {
        function TimeSample() {
            // in hours
            this.timeStamp = 0;
            // ** NOTE: CmMol here means carbon milli-moles.
            // CmMol/L of carbon at this timestamp
            this.carbonValue = 0;
            // CmMol/gdw/hr
            // delta between this carbon value and the previous one (0 for the first entry):
            // -- POSITIVE means output (in that the organism outputted this metabolite for the time
            //      span in question)
            // -- NEGATIVE means input  (in that the organism reduced the amount of this metabolite
            //      for the time span)
            this.carbonDelta = 0;
        }
        TimeSample.prototype.isInput = function () {
            return this.carbonDelta <= 0;
        };
        TimeSample.prototype.isOutput = function () {
            return this.carbonDelta > 0;
        };
        // Return the absolute value of carbonDelta. You'll need to use isInput() or isOutput()
        // to know which it represents.
        TimeSample.prototype.absDelta = function () {
            return Math.abs(this.carbonDelta);
        };
        return TimeSample;
    })();
    CarbonBalance.TimeSample = TimeSample;
    // Step 1 is where CarbonBalance.Summation builds a timeline for each line->assay->metabolite.
    // Step 2 is where this class merges all the assay->metabolite timelines into one timeline
    // for each line.
    var TimelineMerger = (function () {
        function TimelineMerger() {
        }
        // Take the input LineData and sum up all measurements across all assays/metabolites
        // into a list of {timeStamp, totalCarbonIn, totalCarbonOut} objects (sorted by timeStamp).
        TimelineMerger.mergeAllLineSamples = function (lineData) {
            var mergedLineSamples = new MergedLineSamples(), 
            // First, build a list of timestamps from "primary assays" (i.e. non-RAMOS assays).
            // object is being used as a set
            validTimeStamps = {}, mergedSamples = {};
            $.each(lineData.assaysByID, function (akey, assay) {
                $.each(assay.timelinesByMeasurementId, function (tkey, timeline) {
                    mergedLineSamples.metaboliteTimelines.push(timeline);
                    if (TimelineMerger._isPrimaryAssay(assay)) {
                        timeline.timeSamples.forEach(function (sample) {
                            validTimeStamps[sample.timeStamp] = sample.timeStamp;
                        });
                    }
                });
            });
            $.each(validTimeStamps, function (key, timeStamp) {
                var outSample, timelines;
                if (timeStamp === 0) {
                    return;
                }
                outSample = new MergedLineSample(timeStamp);
                mergedSamples[timeStamp] = outSample;
                timelines = mergedLineSamples.metaboliteTimelines;
                timelines.forEach(function (timeline) {
                    var carbonDelta = timeline.interpolateCarbonDelta(timeStamp);
                    if (carbonDelta > 0) {
                        outSample.totalCarbonOut += carbonDelta;
                    }
                    else {
                        outSample.totalCarbonIn -= carbonDelta;
                    }
                });
            });
            // sort the samples by timestamp
            mergedLineSamples.mergedLineSamples = $.map(mergedSamples, function (sample) { return sample; }).sort(function (a, b) {
                return a.timeStamp - b.timeStamp;
            });
            return mergedLineSamples;
        };
        // Returns true if this is a "primary" assay, which means that we'll use it to generate
        // carbon balance time samples. A non-primary assay is something that generates a ton of
        // samples like RAMOS.
        TimelineMerger._isPrimaryAssay = function (assay) {
            var serverAssayData = EDDData.Assays[assay.assayId], protocol = EDDData.Protocols[serverAssayData.pid];
            // TODO: Fragile
            return (protocol.name !== 'O2/CO2');
        };
        return TimelineMerger;
    })();
    CarbonBalance.TimelineMerger = TimelineMerger;
})(CarbonBalance || (CarbonBalance = {})); // end module CarbonBalance
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiQ2FyYm9uU3VtbWF0aW9uLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiQ2FyYm9uU3VtbWF0aW9uLnRzIl0sIm5hbWVzIjpbIkNhcmJvbkJhbGFuY2UiLCJDYXJib25CYWxhbmNlLlN1bW1hdGlvbiIsIkNhcmJvbkJhbGFuY2UuU3VtbWF0aW9uLmNvbnN0cnVjdG9yIiwiQ2FyYm9uQmFsYW5jZS5TdW1tYXRpb24uY3JlYXRlIiwiQ2FyYm9uQmFsYW5jZS5TdW1tYXRpb24uZ2VuZXJhdGVEZWJ1Z1RleHQiLCJDYXJib25CYWxhbmNlLlN1bW1hdGlvbi5tZXJnZUFsbExpbmVTYW1wbGVzIiwiQ2FyYm9uQmFsYW5jZS5TdW1tYXRpb24uZ2V0TGluZURhdGFCeUlEIiwiQ2FyYm9uQmFsYW5jZS5TdW1tYXRpb24uaW5pdCIsIkNhcmJvbkJhbGFuY2UuU3VtbWF0aW9uLl93cml0ZURlYnVnTGluZSIsIkNhcmJvbkJhbGFuY2UuU3VtbWF0aW9uLl93cml0ZURlYnVnTGluZVdpdGhIZWFkZXIiLCJDYXJib25CYWxhbmNlLlN1bW1hdGlvbi5fbnVtU3RyIiwiQ2FyYm9uQmFsYW5jZS5TdW1tYXRpb24uX2RvZXNNZWFzdXJlbWVudENvbnRhaW5DYXJib24iLCJDYXJib25CYWxhbmNlLlN1bW1hdGlvbi5fY2FsY3VsYXRlQ21Nb2xQZXJMaXRlciIsIkNhcmJvbkJhbGFuY2UuU3VtbWF0aW9uLl9pc09wdGljYWxEZW5zaXR5TWVhc3VyZW1lbnQiLCJDYXJib25CYWxhbmNlLlN1bW1hdGlvbi5faW50ZWdyYXRlQXNzYXlNZWFzdXJlbWVudHMiLCJDYXJib25CYWxhbmNlLlN1bW1hdGlvbi5fZ2V0TWVhc3VyZW1lbnRUaW1lc3RhbXBzU29ydGVkIiwiQ2FyYm9uQmFsYW5jZS5TdW1tYXRpb24uX2J1aWxkU29ydGVkTWVhc3VyZW1lbnRzRm9yQXNzYXlNZXRhYm9saXRlIiwiQ2FyYm9uQmFsYW5jZS5TdW1tYXRpb24uX2NhbGN1bGF0ZUNhcmJvbkRlbHRhcyIsIkNhcmJvbkJhbGFuY2UuU3VtbWF0aW9uLl9jYWxjVGltZURlbHRhIiwiQ2FyYm9uQmFsYW5jZS5TdW1tYXRpb24uX2ZpdE9uU29ydGVkVGltZWxpbmUiLCJDYXJib25CYWxhbmNlLlN1bW1hdGlvbi5fY2FsY3VsYXRlT3B0aWNhbERlbnNpdHlGYWN0b3IiLCJDYXJib25CYWxhbmNlLlN1bW1hdGlvbi5fZ2V0T3B0aWNhbERlbnNpdHlNZWFzdXJlbWVudEZvckxpbmUiLCJDYXJib25CYWxhbmNlLlN1bW1hdGlvbi5fcHJlY2FsY3VsYXRlVmFsaWRMaXN0cyIsIkNhcmJvbkJhbGFuY2UuTGluZURhdGEiLCJDYXJib25CYWxhbmNlLkxpbmVEYXRhLmNvbnN0cnVjdG9yIiwiQ2FyYm9uQmFsYW5jZS5MaW5lRGF0YS5nZXRMaW5lSUQiLCJDYXJib25CYWxhbmNlLkxpbmVEYXRhLmZpbHRlckFzc2F5c0J5VGltZVN0YW1wIiwiQ2FyYm9uQmFsYW5jZS5MaW5lRGF0YS5nZXRJbk91dFN1bUF0VGltZSIsIkNhcmJvbkJhbGFuY2UuTWVyZ2VkTGluZVNhbXBsZXMiLCJDYXJib25CYWxhbmNlLk1lcmdlZExpbmVTYW1wbGVzLmNvbnN0cnVjdG9yIiwiQ2FyYm9uQmFsYW5jZS5NZXJnZWRMaW5lU2FtcGxlIiwiQ2FyYm9uQmFsYW5jZS5NZXJnZWRMaW5lU2FtcGxlLmNvbnN0cnVjdG9yIiwiQ2FyYm9uQmFsYW5jZS5Jbk91dFN1bSIsIkNhcmJvbkJhbGFuY2UuSW5PdXRTdW0uY29uc3RydWN0b3IiLCJDYXJib25CYWxhbmNlLkluT3V0U3VtTWVhc3VyZW1lbnQiLCJDYXJib25CYWxhbmNlLkluT3V0U3VtTWVhc3VyZW1lbnQuY29uc3RydWN0b3IiLCJDYXJib25CYWxhbmNlLkluT3V0U3VtTWVhc3VyZW1lbnQuYWJzRGVsdGEiLCJDYXJib25CYWxhbmNlLkFzc2F5RGF0YSIsIkNhcmJvbkJhbGFuY2UuQXNzYXlEYXRhLmNvbnN0cnVjdG9yIiwiQ2FyYm9uQmFsYW5jZS5Bc3NheURhdGEuZ2V0VGltZVNhbXBsZXNCeVRpbWVTdGFtcCIsIkNhcmJvbkJhbGFuY2UuTWV0YWJvbGl0ZVRpbWVsaW5lIiwiQ2FyYm9uQmFsYW5jZS5NZXRhYm9saXRlVGltZWxpbmUuY29uc3RydWN0b3IiLCJDYXJib25CYWxhbmNlLk1ldGFib2xpdGVUaW1lbGluZS5pbnRlcnBvbGF0ZUNhcmJvbkRlbHRhIiwiQ2FyYm9uQmFsYW5jZS5NZXRhYm9saXRlVGltZWxpbmUuZmluZFNhbXBsZUJ5VGltZVN0YW1wIiwiQ2FyYm9uQmFsYW5jZS5UaW1lU2FtcGxlIiwiQ2FyYm9uQmFsYW5jZS5UaW1lU2FtcGxlLmNvbnN0cnVjdG9yIiwiQ2FyYm9uQmFsYW5jZS5UaW1lU2FtcGxlLmlzSW5wdXQiLCJDYXJib25CYWxhbmNlLlRpbWVTYW1wbGUuaXNPdXRwdXQiLCJDYXJib25CYWxhbmNlLlRpbWVTYW1wbGUuYWJzRGVsdGEiLCJDYXJib25CYWxhbmNlLlRpbWVsaW5lTWVyZ2VyIiwiQ2FyYm9uQmFsYW5jZS5UaW1lbGluZU1lcmdlci5jb25zdHJ1Y3RvciIsIkNhcmJvbkJhbGFuY2UuVGltZWxpbmVNZXJnZXIubWVyZ2VBbGxMaW5lU2FtcGxlcyIsIkNhcmJvbkJhbGFuY2UuVGltZWxpbmVNZXJnZXIuX2lzUHJpbWFyeUFzc2F5Il0sIm1hcHBpbmdzIjoiQUFBQSxnREFBZ0Q7QUFDaEQscURBQXFEO0FBQ3JELCtCQUErQjtBQUMvQiw0Q0FBNEM7QUFDNUMsOENBQThDO0FBRTlDLElBQU8sYUFBYSxDQXU3Qm5CO0FBdjdCRCxXQUFPLGFBQWEsRUFBQyxDQUFDO0lBQ2xCQSxZQUFZQSxDQUFDQTtJQXNCYkEsNkRBQTZEQTtJQUM3REEsK0VBQStFQTtJQUMvRUEsb0RBQW9EQTtJQUNwREEsRUFBRUE7SUFDRkEsb0RBQW9EQTtJQUNwREE7UUFBQUM7WUFFSUMsaURBQWlEQTtZQUNqREEsaUJBQVlBLEdBQStCQSxFQUFFQSxDQUFDQTtZQUM5Q0Esa0RBQWtEQTtZQUNsREEsc0JBQWlCQSxHQUFVQSxDQUFDQSxDQUFDQTtZQUU3QkEsNENBQTRDQTtZQUM1Q0EsaURB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QUFpQkEsQ0FBQ0E7UUFDN0JBLENBQUNBO1FBRURGLHVGQUF1RkE7UUFDdkZBLHdGQUF3RkE7UUFDeEZBLHNCQUFzQkE7UUFDUEEsOEJBQWVBLEdBQTlCQSxVQUErQkEsS0FBZUE7WUFDMUNHLElBQUlBLGVBQWVBLEdBQWVBLE9BQU9BLENBQUNBLE1BQU1BLENBQUNBLEtBQUtBLENBQUNBLE9BQU9BLENBQUNBLEVBQzNEQSxRQUFRQSxHQUFPQSxPQUFPQSxDQUFDQSxTQUFTQSxDQUFDQSxlQUFlQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtZQUMxREEsZ0JBQWdCQTtZQUNoQkEsTUFBTUEsQ0FBQ0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsSUFBSUEsS0FBS0EsUUFBUUEsQ0FBQ0EsQ0FBQ0E7UUFDeENBLENBQUNBO1FBQ0xILHFCQUFDQTtJQUFEQSxDQUFDQSxBQTFERGpELElBMERDQTtJQTFEWUEsNEJBQWNBLGlCQTBEMUJBLENBQUFBO0FBRUxBLENBQUNBLEVBdjdCTSxhQUFhLEtBQWIsYUFBYSxRQXU3Qm5CLENBQUMsMkJBQTJCIiwic291cmNlc0NvbnRlbnQiOlsiLy8gQ29tcGlsZWQgdG8gSlMgb246IE1vbiBKYW4gMjUgMjAxNiAxNToyNjoyNCAgXG4vLy8gPHJlZmVyZW5jZSBwYXRoPVwidHlwZXNjcmlwdC1kZWNsYXJhdGlvbnMuZC50c1wiIC8+XG4vLy8gPHJlZmVyZW5jZSBwYXRoPVwiVXRsLnRzXCIgLz5cbi8vLyA8cmVmZXJlbmNlIHBhdGg9XCJFREREYXRhSW50ZXJmYWNlLnRzXCIgLz5cbi8vLyA8cmVmZXJlbmNlIHBhdGg9XCJTdHVkeUNhcmJvbkJhbGFuY2UudHNcIiAvPlxuXG5tb2R1bGUgQ2FyYm9uQmFsYW5jZSB7XG4gICAgJ3VzZSBzdHJpY3QnO1xuXG4gICAgaW50ZXJmYWNlIFZhbGlkYXRlZFZhbHVlIHtcbiAgICAgICAgaXNWYWxpZDpib29sZWFuO1xuICAgICAgICB2YWx1ZTpudW1iZXI7XG4gICAgfVxuXG4gICAgLy8gdmFsdWVzIGJ5IHRpbWUgc2VyaWVzXG4gICAgaW50ZXJmYWNlIEludGVncmFsIHtcbiAgICAgICAgW3RpbWU6bnVtYmVyXTogbnVtYmVyO1xuICAgIH1cblxuICAgIC8vIHN0b3JlIHRpbWUgc2VyaWVzIGJ5IG1lYXN1cmVtZW50IElEIChvciBzaW1pbGFyIElEKVxuICAgIGludGVyZmFjZSBJbnRlZ3JhbExvb2t1cCB7XG4gICAgICAgIFtpZDpudW1iZXJdOiBJbnRlZ3JhbDtcbiAgICB9XG5cbiAgICAvLyBzdG9yZSBhIGxpc3Qgb2YgSURzIHJlYWNoYWJsZSBmcm9tIGFub3RoZXIgSURcbiAgICBpbnRlcmZhY2UgSURMb29rdXAge1xuICAgICAgICBbaWQ6bnVtYmVyXTogbnVtYmVyW107XG4gICAgfVxuXG4gICAgLy8gVGhpcyBpcyB0aGUgY2xpZW50LXNpZGUgY29udGFpbmVyIGZvciBjYXJib24gYmFsYW5jZSBkYXRhLlxuICAgIC8vIEl0IGNvbWJzIHRocm91Z2ggbGluZXMvYXNzYXlzL21lYXN1cmVtZW50cyB0byBidWlsZCBhIHN0cnVjdHVyZSB0aGF0IGlzIGVhc3lcbiAgICAvLyB0byBwdWxsIGZyb20gd2hlbiBkaXNwbGF5aW5nIGNhcmJvbiBiYWxhbmNlIGRhdGEuXG4gICAgLy9cbiAgICAvLyBUaGlzIGlzIHB1cmVseSBhIGRhdGEgY2xhc3MsIE5PVCBhIGRpc3BsYXkgY2xhc3MuXG4gICAgZXhwb3J0IGNsYXNzIFN1bW1hdGlvbiB7XG5cbiAgICAgICAgLy8gRGF0YSBmb3IgZWFjaCBsaW5lIG9mIHR5cGUgU3VtbWF0aW9uLkxpbmVEYXRhLlxuICAgICAgICBsaW5lRGF0YUJ5SUQ6IHtbbGluZUlEOm51bWJlcl06TGluZURhdGF9ID0ge307XG4gICAgICAgIC8vIFRoZSBoaWdoZXN0IHRpbWUgdmFsdWUgdGhhdCBhbnkgVGltZVNhbXBsZSBoYXMuXG4gICAgICAgIGxhc3RUaW1lSW5TZWNvbmRzOm51bWJlciA9IDA7XG5cbiAgICAgICAgLy8gUHJlY2FsY3VsYXRlZCBsb29rdXBzIHRvIHNwZWVkIHRoaW5ncyB1cC5cbiAgICAgICAgLy8gQW4gYXJyYXkgb2Ygbm9uLWRpc2FibGVkIGFzc2F5cyBmb3IgZWFjaCBsaW5lLlxuICAgICAgICBwcml2YXRlIF92YWxpZEFzc2F5c0J5TGluZUlEOklETG9va3VwID0gPElETG9va3VwPnt9O1xuICAgICAgICAvLyBBbiBhcnJheSBvZiBub24tZGlzYWJsZWQgbWVhc3VyZW1lbnRzIGZvciBlYWNoIGFzc2F5LlxuICAgICAgICBwcml2YXRlIF92YWxpZE1lYXN1cmVtZW50c0J5QXNzYXlJRDpJRExvb2t1cCA9IDxJRExvb2t1cD57fTtcbiAgICAgICAgLy8gTG9va3VwIHRoZSBPRCBtZWFzdXJlbWVudCBmb3IgZWFjaCBsaW5lLlxuICAgICAgICBwcml2YXRlIF9vcHRpY2FsRGVuc2l0eU1lYXN1cmVtZW50SURCeUxpbmVJRDp7W2xpbmVJRDpudW1iZXJdOm51bWJlcn0gPSB7fTtcblxuICAgICAgICAvLyBUaGlzIGlzIGZyb20gY29udmVydGluZyB0aGUgYXNzYXkgbWVhc3VyZW1lbnQgbGlzdCBnaXZlbiB0byB1cyBpbnRvIGEgaGFzaCBieSB0aW1lc3RhbXAuXG4gICAgICAgIHByaXZhdGUgX2Fzc2F5TWVhc3VyZW1lbnREYXRhQnlJRDpJbnRlZ3JhbExvb2t1cDtcbiAgICAgICAgcHJpdmF0ZSBfZGVidWdMaW5lSUQ6bnVtYmVyID0gMDtcbiAgICAgICAgLy8gSWYgdGhpcyBpcyBzZXQsIHRoZW4gd2UnbGwgYmUgZW1pdHRpbmcgZGVidWcgSFRNTCB0byBfZGVidWdPdXRwdXQuXG4gICAgICAgIHByaXZhdGUgX2RlYnVnVGltZVN0YW1wOm51bWJlcjtcbiAgICAgICAgcHJpdmF0ZSBfZGVidWdPdXRwdXQ6c3RyaW5nO1xuICAgICAgICAvLyBBdXRvIHRhYiBvbiBkZWJ1ZyBvdXRwdXQuXG4gICAgICAgIHByaXZhdGUgX2RlYnVnT3V0cHV0SW5kZW50Om51bWJlciA9IDA7XG5cblxuICAgICAgICAvLyBVc2UgdGhpcyB0byBjcmVhdGUgYSBzdW1tYXRpb24gb2JqZWN0LlxuICAgICAgICBzdGF0aWMgY3JlYXRlKGJpb21hc3NDYWxjdWxhdGlvbjpudW1iZXIpOlN1bW1hdGlvbiB7XG5cbiAgICAgICAgICAgIHZhciBzdW06U3VtbWF0aW9uID0gbmV3IFN1bW1hdGlvbigpO1xuICAgICAgICAgICAgc3VtLmluaXQoYmlvbWFzc0NhbGN1bGF0aW9uKTtcbiAgICAgICAgICAgIHJldHVybiBzdW07XG4gICAgICAgIH1cblxuXG4gICAgICAgIC8vIFVzZSB0aGlzIHRvIGdlbmVyYXRlIHNvbWUgZGVidWcgdGV4dCB0aGF0IGRlc2NyaWJlcyBhbGwgdGhlIGNhbGN1bGF0aW9ucy5cbiAgICAgICAgc3RhdGljIGdlbmVyYXRlRGVidWdUZXh0KGJpb21hc3NDYWxjdWxhdGlvbjpudW1iZXIsXG4gICAgICAgICAgICAgICAgZGVidWdMaW5lSUQ6bnVtYmVyLFxuICAgICAgICAgICAgICAgIGRlYnVnVGltZVN0YW1wOm51bWJlcik6c3RyaW5nIHtcblxuICAgICAgICAgICAgLy8gQ3JlYXRlIGEgU3VtbWF0aW9uIG9iamVjdCBidXQgdGVsbCBpdCB0byBnZW5lcmF0ZSBkZWJ1ZyBpbmZvIHdoaWxlIGl0IGRvZXMgaXRzXG4gICAgICAgICAgICAvLyB0aW1lc3RhbXBzLlxuICAgICAgICAgICAgdmFyIHN1bTpTdW1tYXRpb24gPSBuZXcgU3VtbWF0aW9uKCk7XG4gICAgICAgICAgICBzdW0uX2RlYnVnTGluZUlEID0gZGVidWdMaW5lSUQ7XG4gICAgICAgICAgICBzdW0uX2RlYnVnVGltZVN0YW1wID0gZGVidWdUaW1lU3RhbXA7XG4gICAgICAgICAgICBzdW0uX2RlYnVnT3V0cHV0ID0gXCJcIjtcbiAgICAgICAgICAgIHN1bS5pbml0KGJpb21hc3NDYWxjdWxhdGlvbik7XG5cbiAgICAgICAgICAgIC8vIFJldHVybiBpdHMgZGVidWcgaW5mby5cbiAgICAgICAgICAgIHJldHVybiBzdW0uX2RlYnVnT3V0cHV0O1xuICAgICAgICB9XG5cblxuICAgICAgICAvLyBUaGlzIGp1c3Qgd3JhcHMgdGhlIGNhbGwgdG8gVGltZWxpbmVNZXJnZXIubWVyZ2VBbGxMaW5lU2FtcGxlcy5cbiAgICAgICAgbWVyZ2VBbGxMaW5lU2FtcGxlcyhsaW5lRGF0YTphbnkpOk1lcmdlZExpbmVTYW1wbGVzIHtcbiAgICAgICAgICAgIHJldHVybiBUaW1lbGluZU1lcmdlci5tZXJnZUFsbExpbmVTYW1wbGVzKGxpbmVEYXRhKTtcbiAgICAgICAgfVxuXG5cbiAgICAgICAgZ2V0TGluZURhdGFCeUlEKGxpbmVJRDpudW1iZXIpOkxpbmVEYXRhIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmxpbmVEYXRhQnlJRFtsaW5lSURdO1xuICAgICAgICB9XG5cblxuICAgICAgICAvLyBJbnRlcm5hbGx5LCB0aGlzIGlzIGhvdyB3ZSBpbml0IHRoZSBTdW1tYXRpb24gb2JqZWN0IHJlZ2FyZGxlc3Mgb2Ygd2hldGhlciBpdCdzIHVzZWRcbiAgICAgICAgLy8gbGF0ZXIgb3Igd2hldGhlciBpdCdzIGp1c3QgdXNlZCB0byBnZXQgc29tZSBkZWJ1ZyB0ZXh0LlxuICAgICAgICBwcml2YXRlIGluaXQoYmlvbWFzc0NhbGN1bGF0aW9uOm51bWJlcik6dm9pZCB7XG4gICAgICAgICAgICB2YXIgaW50ZWdyYWxzQnlNZWFzdXJlbWVudElEOkludGVncmFsTG9va3VwO1xuXG4gICAgICAgICAgICB0aGlzLl9wcmVjYWxjdWxhdGVWYWxpZExpc3RzKCk7XG4gICAgICAgICAgICAvLyBDb252ZXJ0IHRvIGEgaGFzaCBvbiB0aW1lc3RhbXAgKHggdmFsdWUpXG4gICAgICAgICAgICB0aGlzLl9hc3NheU1lYXN1cmVtZW50RGF0YUJ5SUQgPSB7fTtcbiAgICAgICAgICAgICQuZWFjaChFREREYXRhLkFzc2F5TWVhc3VyZW1lbnRzLCAoaWQ6c3RyaW5nLCBtZWFzdXJlOkFzc2F5TWVhc3VyZW1lbnRSZWNvcmQpOnZvaWQgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBvdXQ6SW50ZWdyYWwgPSB0aGlzLl9hc3NheU1lYXN1cmVtZW50RGF0YUJ5SURbaWRdID0gPEludGVncmFsPnt9O1xuICAgICAgICAgICAgICAgICQuZWFjaChtZWFzdXJlLnZhbHVlcywgKGk6bnVtYmVyLCBwb2ludDpudW1iZXJbXVtdKTp2b2lkID0+IHtcbiAgICAgICAgICAgICAgICAgICAgLy8gb25seSBkbyBtYXBwaW5nIGZvciAoeCx5KSBwb2ludHMsIHdvbid0IG1ha2Ugc2Vuc2Ugd2l0aCBoaWdoZXIgZGltZW5zaW9uc1xuICAgICAgICAgICAgICAgICAgICBpZiAocG9pbnRbMF0ubGVuZ3RoID09PSAxICYmIHBvaW50WzFdLmxlbmd0aCA9PT0gMSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgb3V0W3BvaW50WzBdWzBdXSA9IHBvaW50WzFdWzBdO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgLy8gV2UgbmVlZCB0byBwcmVwYXJlIGludGVncmFscyBvZiBhbnkgbW9sL0wvaHJcbiAgICAgICAgICAgIGludGVncmFsc0J5TWVhc3VyZW1lbnRJRCA9IHRoaXMuX2ludGVncmF0ZUFzc2F5TWVhc3VyZW1lbnRzKGJpb21hc3NDYWxjdWxhdGlvbik7XG5cbiAgICAgICAgICAgIC8vIEl0ZXJhdGUgb3ZlciBsaW5lcy5cbiAgICAgICAgICAgICQuZWFjaChFREREYXRhLkxpbmVzLCAobGluZUlkOnN0cmluZywgbGluZTpMaW5lUmVjb3JkKTp2b2lkID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgb3V0OkxpbmVEYXRhLCBhbnlTYW1wbGVzQWRkZWQ6Ym9vbGVhbiA9IGZhbHNlO1xuICAgICAgICAgICAgICAgIGlmICghbGluZS5hY3RpdmUpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBvdXQgPSBuZXcgTGluZURhdGEobGluZS5pZCk7XG4gICAgICAgICAgICAgICAgdGhpcy5fdmFsaWRBc3NheXNCeUxpbmVJRFtsaW5lLmlkXS5mb3JFYWNoKChhc3NheUlkOm51bWJlcik6dm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBhc3NheTpBc3NheVJlY29yZCA9IEVERERhdGEuQXNzYXlzW2Fzc2F5SWRdLFxuICAgICAgICAgICAgICAgICAgICAgICAgcHJvdG9jb2w6YW55ID0gRURERGF0YS5Qcm90b2NvbHNbYXNzYXkucGlkXSxcbiAgICAgICAgICAgICAgICAgICAgICAgIG5hbWU6c3RyaW5nID0gW2xpbmUubmFtZSwgcHJvdG9jb2wubmFtZSwgYXNzYXkubmFtZV0uam9pbignLScpLFxuICAgICAgICAgICAgICAgICAgICAgICAgb3V0QXNzYXk6QXNzYXlEYXRhID0gbmV3IEFzc2F5RGF0YShhc3NheUlkKSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhbGlkOm51bWJlciA9IDA7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX3dyaXRlRGVidWdMaW5lKGxpbmUuaWQgPT09IHRoaXMuX2RlYnVnTGluZUlELCBcIkFzc2F5IFwiICsgbmFtZSk7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX2RlYnVnT3V0cHV0SW5kZW50Kys7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX3ZhbGlkTWVhc3VyZW1lbnRzQnlBc3NheUlEW2Fzc2F5SWRdLmZvckVhY2goKG1lYXN1cmVJZDpudW1iZXIpOnZvaWQgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgdmFyIG1lYXN1cmU6QXNzYXlNZWFzdXJlbWVudFJlY29yZCA9IEVERERhdGEuQXNzYXlNZWFzdXJlbWVudHNbbWVhc3VyZUlkXSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aW1lbGluZTpNZXRhYm9saXRlVGltZWxpbmU7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoIXRoaXMuX2RvZXNNZWFzdXJlbWVudENvbnRhaW5DYXJib24obWVhc3VyZSkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl93cml0ZURlYnVnTGluZShsaW5lLmlkID09PSB0aGlzLl9kZWJ1Z0xpbmVJRCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBFREREYXRhLk1ldGFib2xpdGVUeXBlc1ttZWFzdXJlLnR5cGVdLm5hbWUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fZGVidWdPdXRwdXRJbmRlbnQrKztcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhbGlkKys7XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBDcmVhdGUgTWV0YWJvbGl0ZVRpbWVsaW5lIG91dHB1dCBzdHJ1Y3R1cmVcbiAgICAgICAgICAgICAgICAgICAgICAgIHRpbWVsaW5lID0gbmV3IE1ldGFib2xpdGVUaW1lbGluZShvdXRBc3NheSwgbWVhc3VyZUlkKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIG91dEFzc2F5LnRpbWVsaW5lc0J5TWVhc3VyZW1lbnRJZFttZWFzdXJlSWRdID0gdGltZWxpbmU7XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBCdWlsZCBhIHNvcnRlZCBsaXN0IG9mIHRpbWVzdGFtcC9tZWFzdXJlbWVudFxuICAgICAgICAgICAgICAgICAgICAgICAgdGltZWxpbmUudGltZVNhbXBsZXMgPSB0aGlzLl9idWlsZFNvcnRlZE1lYXN1cmVtZW50c0ZvckFzc2F5TWV0YWJvbGl0ZShcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBvdXQsIG1lYXN1cmVJZCwgaW50ZWdyYWxzQnlNZWFzdXJlbWVudElELCBiaW9tYXNzQ2FsY3VsYXRpb24pO1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gS2VlcCB0cmFjayBvZiB0aGUgbGFzdCBzYW1wbGUncyB0aW1lXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAodGltZWxpbmUudGltZVNhbXBsZXMpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBhbnlTYW1wbGVzQWRkZWQgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMubGFzdFRpbWVJblNlY29uZHMgPSBNYXRoLm1heCh0aGlzLmxhc3RUaW1lSW5TZWNvbmRzLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aW1lbGluZS50aW1lU2FtcGxlcy5zbGljZSgtMSlbMF0udGltZVN0YW1wKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX3dyaXRlRGVidWdMaW5lKGxpbmUuaWQgPT09IHRoaXMuX2RlYnVnTGluZUlELCBcIlwiKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX2RlYnVnT3V0cHV0SW5kZW50LS07XG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICAvLyBzdG9yZSB0aGUgYXNzYXlcbiAgICAgICAgICAgICAgICAgICAgb3V0LmFzc2F5c0J5SURbYXNzYXlJZF0gPSBvdXRBc3NheTtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fd3JpdGVEZWJ1Z0xpbmUobGluZS5pZCA9PT0gdGhpcy5fZGVidWdMaW5lSUQsIFwiXCIpO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLl9kZWJ1Z091dHB1dEluZGVudC0tO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIGlmIChhbnlTYW1wbGVzQWRkZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5saW5lRGF0YUJ5SURbbGluZS5pZF0gPSBvdXQ7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgfVxuXG5cbiAgICAgICAgLy8gQXBwZW5kIHRoZSBzdHJpbmcgdG8gb3VyIF9kZWJ1Z091dHB1dCBzdHJpbmcgaWYgc2hvdWxkV3JpdGU9dHJ1ZS5cbiAgICAgICAgLy8gKEhhdmluZyBzaG91bGRXcml0ZSB0aGVyZSBtYWtlcyBpdCBlYXNpZXIgdG8gZG8gYSBvbmUtbGluZSBkZWJ1ZyBvdXRwdXQgdGhhdCBpbmNsdWRlc1xuICAgICAgICAvLyB0aGUgY2hlY2sgb2Ygd2hldGhlciBpdCBzaG91bGQgd3JpdGUpLlxuICAgICAgICBwcml2YXRlIF93cml0ZURlYnVnTGluZShzaG91bGRXcml0ZTpib29sZWFuLCB2YWw6c3RyaW5nKTp2b2lkIHtcbiAgICAgICAgICAgIGlmICghc2hvdWxkV3JpdGUpIHtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB2YXIgaW5kZW50OnN0cmluZ1tdID0gW107XG4gICAgICAgICAgICAvLyBrZWVwIGFkZGluZyBpbmRlbnRzIHVudGlsIHJlYWNoIGxlbmd0aCBvZiBfZGVidWdPdXRwdXRJbmRlbnRcbiAgICAgICAgICAgIC8qIHRzbGludDpkaXNhYmxlOmN1cmx5ICovXG4gICAgICAgICAgICB3aGlsZSAodGhpcy5fZGVidWdPdXRwdXRJbmRlbnQgJiYgdGhpcy5fZGVidWdPdXRwdXRJbmRlbnQgPiBpbmRlbnQucHVzaCgnICAgICcpKTtcbiAgICAgICAgICAgIC8qIHRzbGludDplbmFibGU6Y3VybHkgKi9cbiAgICAgICAgICAgIHRoaXMuX2RlYnVnT3V0cHV0ICs9IGluZGVudC5qb2luKCcnKSArIHZhbCArIFwiXFxuXCI7XG4gICAgICAgIH1cblxuXG4gICAgICAgIHByaXZhdGUgX3dyaXRlRGVidWdMaW5lV2l0aEhlYWRlcihzaG91bGRXcml0ZTpib29sZWFuLCBoZWFkZXI6c3RyaW5nLCB2YWw6c3RyaW5nKTp2b2lkIHtcbiAgICAgICAgICAgIHZhciBzdHI6c3RyaW5nID0gVXRsLkpTLnBhZFN0cmluZ0xlZnQoXCJbXCIgKyBoZWFkZXIgKyBcIl0gXCIsIDMwKTtcbiAgICAgICAgICAgIHRoaXMuX3dyaXRlRGVidWdMaW5lKHNob3VsZFdyaXRlLCBzdHIgKyB2YWwpO1xuICAgICAgICB9XG5cblxuICAgICAgICAvLyBDb252ZXJ0IGEgbnVtYmVyIHRvIGEgc3RyaW5nIGZvciBkZWJ1ZyBvdXRwdXQuIElmIGFsbCB0aGUgY29kZSB1c2VzIHRoaXMsIHRoZW5cbiAgICAgICAgLy8gYWxsIHRoZSBudW1iZXIgZm9ybWF0dGluZyB3aWxsIGJlIGNvbnNpc3RlbnQuXG4gICAgICAgIHByaXZhdGUgX251bVN0cih2YWx1ZTphbnkpOnN0cmluZyB7XG4gICAgICAgICAgICByZXR1cm4gcGFyc2VGbG9hdCh2YWx1ZSkudG9GaXhlZCg1KTtcbiAgICAgICAgfVxuXG5cbiAgICAgICAgLy8gVGhpcyBpcyB1c2VkIGluIGEgZmlyc3QgcGFzcyBvbiBhIG1lYXN1cmVtZW50IHRvIGRlY2lkZSBpZiB3ZSBzaG91bGQgc2NhbiBpdHNcbiAgICAgICAgLy8gbWVhc3VyZW1lbnRzLiBJZiB5b3UgdXBkYXRlIHRoaXMsIHVwZGF0ZSBjYWxjdWxhdGVDbW9sUGVyTGl0ZXIgKGFuZCB2aWNlLXZlcnNhKS5cbiAgICAgICAgcHJpdmF0ZSBfZG9lc01lYXN1cmVtZW50Q29udGFpbkNhcmJvbihtZWFzdXJlOkFzc2F5TWVhc3VyZW1lbnRSZWNvcmQpOmJvb2xlYW4ge1xuICAgICAgICAgICAgdmFyIG10eXBlOk1ldGFib2xpdGVUeXBlUmVjb3JkID0gRURERGF0YS5NZXRhYm9saXRlVHlwZXNbbWVhc3VyZS50eXBlXTtcbiAgICAgICAgICAgIGlmICghbXR5cGUpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIE9EIG1lYXN1cmVtZW50cyB1c2UgdGhlIGJpb21hc3MgZmFjdG9yIHRvIGVzdGltYXRlIHRoZSBhbW91bnQgb2YgY2FyYm9uIGNyZWF0ZWRcbiAgICAgICAgICAgIC8vIG9yIGRlc3Ryb3llZC4gVGhlcmUncyBubyBndWFyYW50ZWUgd2UgaGFlIGEgdmFsaWQgYmlvbWFzcyBmYWN0b3IsIGJ1dCB3ZSBkZWZpbml0ZWx5XG4gICAgICAgICAgICAvLyBrbm93IHRoZXJlIGlzIGNhcmJvbiBoZXJlLlxuICAgICAgICAgICAgaWYgKHRoaXMuX2lzT3B0aWNhbERlbnNpdHlNZWFzdXJlbWVudChtdHlwZSkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHZhciB1UmVjb3JkOmFueSA9IEVERERhdGEuVW5pdFR5cGVzW21lYXN1cmUueV91bml0c107XG4gICAgICAgICAgICB2YXIgdW5pdHM6c3RyaW5nID0gdVJlY29yZCA/IHVSZWNvcmQubmFtZSA6ICcnO1xuICAgICAgICAgICAgdmFyIGNhcmJvbkNvdW50Om51bWJlciA9IG10eXBlLmNjOyAvLyAjIGNhcmJvbnMgcGVyIG1vbGVcblxuICAgICAgICAgICAgaWYgKHVuaXRzID09PSAnJyB8fCB1bml0cyA9PT0gJ24vYScgfHwgIWNhcmJvbkNvdW50KSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgfSBlbHNlIGlmICh1bml0cyA9PT0gJ2cvTCcpIHtcbiAgICAgICAgICAgICAgICAvLyBnL0wgaXMgZmluZSBpZiB3ZSBoYXZlIGEgbW9sYXIgbWFzcyBzbyB3ZSBjYW4gY29udmVydCBnLT5tb2xcbiAgICAgICAgICAgICAgICByZXR1cm4gISFtdHlwZS5tbTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgLy8gQW55dGhpbmcgdXNpbmcgbW9scyBpcyBmaW5lIGFzIHdlbGwuXG4gICAgICAgICAgICAgICAgcmV0dXJuICh1bml0cyA9PT0gJ21vbC9ML2hyJyB8fFxuICAgICAgICAgICAgICAgICAgICB1bml0cyA9PT0gJ3VNJyB8fFxuICAgICAgICAgICAgICAgICAgICB1bml0cyA9PT0gJ21NJyB8fFxuICAgICAgICAgICAgICAgICAgICB1bml0cyA9PT0gJ21vbC9MJyB8fFxuICAgICAgICAgICAgICAgICAgICB1bml0cyA9PT0gJ0Ntb2wvTCcpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gRG8gdW5pdCBjb252ZXJzaW9ucyBpbiBvcmRlciB0byBnZXQgYSBDbW9sL0wgdmFsdWUuXG4gICAgICAgIC8vICoqIE5PVEU6IFRoaXMgaXMgXCJDLW1vbGVzXCIsIHdoaWNoIGlzIENBUkJPTiBtb2wvTCAoYXMgb3Bwb3NlZCB0byBDRU5USSBtb2wvTCkuXG4gICAgICAgIHByaXZhdGUgX2NhbGN1bGF0ZUNtTW9sUGVyTGl0ZXIobWVhc3VyZW1lbnRJRDpudW1iZXIsXG4gICAgICAgICAgICAgICAgdGltZVN0YW1wOm51bWJlcixcbiAgICAgICAgICAgICAgICBpbnRlZ3JhbHNCeU1lYXN1cmVtZW50SUQ6SW50ZWdyYWxMb29rdXAsXG4gICAgICAgICAgICAgICAgYmlvbWFzc0NhbGN1bGF0aW9uOm51bWJlcixcbiAgICAgICAgICAgICAgICBkT3V0OmJvb2xlYW4pOlZhbGlkYXRlZFZhbHVlIHtcbiAgICAgICAgICAgIC8vIEEgbWVhc3VyZW1lbnQgaXMgdGhlIHRpbWUgc2VyaWVzIGRhdGEgZm9yIE9ORSBtZXRhYm9saXRlXG4gICAgICAgICAgICAvLyBtZWFzdXJlbWVudC52YWx1ZXMgY29udGFpbnMgYWxsIHRoZSBtZWF0eSBzdHVmZiAtIGEgMy1kaW1lbnNpb25hbCBhcnJheSB3aXRoOlxuICAgICAgICAgICAgLy8gZmlyc3QgaW5kZXggc2VsZWN0aW5nIHBvaW50IHZhbHVlO1xuICAgICAgICAgICAgLy8gc2Vjb25kIGluZGV4IDAgZm9yIHgsIDEgZm9yIHk7XG4gICAgICAgICAgICAvLyB0aGlyZCBpbmRleCBzdWJzY3JpcHRlZCB2YWx1ZXM7XG4gICAgICAgICAgICAvLyBlLmcuIG1lYXN1cmVtZW50LnZhbHVlc1syXVswXVsxXSBpcyB0aGUgeDEgdmFsdWUgb2YgdGhlIHRoaXJkIG1lYXN1cmVtZW50IHZhbHVlXG4gICAgICAgICAgICB2YXIgbWVhc3VyZW1lbnQ6QXNzYXlNZWFzdXJlbWVudFJlY29yZCA9IEVERERhdGEuQXNzYXlNZWFzdXJlbWVudHNbbWVhc3VyZW1lbnRJRF0sXG4gICAgICAgICAgICAgICAgbWVhc3VyZW1lbnRUeXBlOk1ldGFib2xpdGVUeXBlUmVjb3JkID0gRURERGF0YS5NZXRhYm9saXRlVHlwZXNbbWVhc3VyZW1lbnQudHlwZV0sXG4gICAgICAgICAgICAgICAgdVJlY29yZDpVbml0VHlwZSA9IEVERERhdGEuVW5pdFR5cGVzW21lYXN1cmVtZW50LnlfdW5pdHNdLFxuICAgICAgICAgICAgICAgIHVuaXRzOnN0cmluZyA9IHVSZWNvcmQgPyB1UmVjb3JkLm5hbWUgOiAnJyxcbiAgICAgICAgICAgICAgICBjYXJib25Db3VudDpudW1iZXIgPSBtZWFzdXJlbWVudFR5cGUuY2MsIC8vICMgY2FyYm9ucyBwZXIgbW9sZVxuICAgICAgICAgICAgICAgIGZpbmFsVmFsdWU6bnVtYmVyID0gMCxcbiAgICAgICAgICAgICAgICBpc1ZhbGlkOmJvb2xlYW4gPSBmYWxzZSxcbiAgICAgICAgICAgICAgICBpc09wdGljYWxEZW5zaXR5OmJvb2xlYW4gPSB0aGlzLl9pc09wdGljYWxEZW5zaXR5TWVhc3VyZW1lbnQobWVhc3VyZW1lbnRUeXBlKSxcbiAgICAgICAgICAgICAgICB2YWx1ZTpudW1iZXIgPSB0aGlzLl9hc3NheU1lYXN1cmVtZW50RGF0YUJ5SURbbWVhc3VyZW1lbnRJRF1bdGltZVN0YW1wXTtcblxuICAgICAgICAgICAgLy8gRmlyc3QsIGlzIHRoaXMgbWVhc3VyZW1lbnQgc29tZXRoaW5nIHRoYXQgd2UgY2FyZSBhYm91dD9cbiAgICAgICAgICAgIC8vXG4gICAgICAgICAgICAvLyBXZSdsbCB0aHJvdyBvdXQgYW55dGhpbmcgdGhhdCBoYXMgbXVsdGlwbGUgbnVtYmVycyBwZXIgc2FtcGxlLiBSaWdodCBub3csIHdlJ3JlXG4gICAgICAgICAgICAvLyBvbmx5IGhhbmRsaW5nIG9uZS1kaW1lbnNpb25hbCBudW1lcmljIHNhbXBsZXMuXG4gICAgICAgICAgICAvL1xuICAgICAgICAgICAgLy8gV2UnbGwgYWxzbyB0aHJvdyBvdXQgYW55dGhpbmcgd2l0aG91dCBhIGNhcmJvbiBjb3VudCwgbGlrZSBDTzIvTzIgcmF0aW9zLlxuICAgICAgICAgICAgaWYgKGlzT3B0aWNhbERlbnNpdHkpIHtcbiAgICAgICAgICAgICAgICAvLyBPRCB3aWxsIGJlIHVzZWQgZGlyZWN0bHkgaW4gX2NhbGN1bGF0ZUNhcmJvbkRlbHRhcyB0byBnZXQgYSBncm93dGggcmF0ZS5cbiAgICAgICAgICAgICAgICBmaW5hbFZhbHVlID0gdmFsdWU7XG4gICAgICAgICAgICAgICAgaXNWYWxpZCA9IHRydWU7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHVuaXRzID09PSAnbW9sL0wvaHInKSB7XG4gICAgICAgICAgICAgICAgdmFyIGludGVncmFsczpJbnRlZ3JhbCA9IGludGVncmFsc0J5TWVhc3VyZW1lbnRJRFttZWFzdXJlbWVudElEXTtcbiAgICAgICAgICAgICAgICBpZiAoaW50ZWdyYWxzKSB7XG4gICAgICAgICAgICAgICAgICAgIGZpbmFsVmFsdWUgPSBpbnRlZ3JhbHNbdGltZVN0YW1wXSAqIDEwMDA7XG4gICAgICAgICAgICAgICAgICAgIGlzVmFsaWQgPSAodHlwZW9mIGZpbmFsVmFsdWUgIT09ICd1bmRlZmluZWQnKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHVuaXRzID09PSAnJyB8fCB1bml0cyA9PT0gJ24vYScgfHwgIWNhcmJvbkNvdW50KSB7XG4gICAgICAgICAgICAgICAgLy8gaXNWYWxpZCB3aWxsIHN0YXkgZmFsc2UuXG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIC8vIENoZWNrIGZvciB2YXJpb3VzIGNvbnZlcnNpb25zIHRoYXQgd2UgbWlnaHQgbmVlZCB0byBkby5cbiAgICAgICAgICAgICAgICBpZiAoZE91dCkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLl93cml0ZURlYnVnTGluZSh0cnVlLCB0aW1lU3RhbXAgKyBcImhcIik7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX2RlYnVnT3V0cHV0SW5kZW50Kys7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX3dyaXRlRGVidWdMaW5lV2l0aEhlYWRlcih0cnVlLCBcInJhdyB2YWx1ZVwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fbnVtU3RyKHZhbHVlKSArIFwiIFwiICsgdW5pdHMpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAodmFsdWUgPT09IDApIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gRG9uJ3QgYm90aGVyIHdpdGggYWxsIHRoaXMgd29yayAoYW5kIGRlYnVnIG91dHB1dCkgaWYgdGhlIHZhbHVlIGlzIDAuXG4gICAgICAgICAgICAgICAgICAgIGZpbmFsVmFsdWUgPSB2YWx1ZTtcbiAgICAgICAgICAgICAgICAgICAgaXNWYWxpZCA9IHRydWU7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmICh0eXBlb2YgdmFsdWUgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIENvbnZlcnQgdU0gdG8gbW9sL0wuIE5vdGU6IGV2ZW4gdGhvdWdoIGl0J3Mgbm90IHdyaXR0ZW4gYXMgdU0vTCwgdGhlc2VcbiAgICAgICAgICAgICAgICAgICAgLy8gcXVhbnRpdGllcyBzaG91bGQgYmUgdHJlYXRlZCBhcyBwZXItbGl0ZXIuXG4gICAgICAgICAgICAgICAgICAgIGlmICh1bml0cyA9PT0gJ3VNJykge1xuICAgICAgICAgICAgICAgICAgICAgICAgdmFsdWUgPSB2YWx1ZSAvIDEwMDA7XG4gICAgICAgICAgICAgICAgICAgICAgICB1bml0cyA9ICdtTW9sL0wnO1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fd3JpdGVEZWJ1Z0xpbmVXaXRoSGVhZGVyKGRPdXQsIFwiY29udmVydFwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiIC8gMTAwMCA9IFwiICsgdGhpcy5fbnVtU3RyKHZhbHVlKSArIFwiIG1vbC9MXCIpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIC8vIERvIG1vbGFyIG1hc3MgY29udmVyc2lvbnMuXG4gICAgICAgICAgICAgICAgICAgIGlmICh1bml0cyA9PT0gJ2cvTCcpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICghbWVhc3VyZW1lbnRUeXBlLm1tKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gV2Ugc2hvdWxkIG5ldmVyIGdldCBpbiBoZXJlLlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX3dyaXRlRGVidWdMaW5lKGRPdXQsIFwiVHJ5aW5nIHRvIGNhbGN1bGF0ZSBjYXJib24gZm9yIGEgZy9MIFwiICtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJtZXRhYm9saXRlIHdpdGggYW4gdW5zcGVjaWZpZWQgbW9sYXIgbWFzcyEgXCIgK1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcIihUaGUgY29kZSBzaG91bGQgbmV2ZXIgZ2V0IGhlcmUpLlwiKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gKGcvTCkgKiAobW9sL2cpID0gKG1vbC9MKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhbHVlID0gdmFsdWUgKiAxMDAwIC8gbWVhc3VyZW1lbnRUeXBlLm1tO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX3dyaXRlRGVidWdMaW5lV2l0aEhlYWRlcihkT3V0LCBcImRpdmlkZSBieSBtb2xhciBtYXNzXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFsgXCIgKiAxMDAwIC9cIiwgbWVhc3VyZW1lbnRUeXBlLm1tLCBcImcvbW9sID1cIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fbnVtU3RyKHZhbHVlKSwgXCJtTW9sL0xcIiBdLmpvaW4oJyAnKSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdW5pdHMgPSAnbU1vbC9MJztcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAvLyBDb252ZXJ0IG1Nb2wvTCB0byBDbU1vbC9MLlxuICAgICAgICAgICAgICAgICAgICAvLyAqKiBOT1RFOiBUaGlzIGlzIFwiQy1tb2xlc1wiLCB3aGljaCBpcyBDQVJCT04gbW9sL0xcbiAgICAgICAgICAgICAgICAgICAgLy8gKGFzIG9wcG9zZWQgdG8gQ0VOVEkgbW9sL0wpLlxuICAgICAgICAgICAgICAgICAgICBpZiAodW5pdHMgPT09ICdtTW9sL0wnKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB2YWx1ZSAqPSBjYXJib25Db3VudDtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX3dyaXRlRGVidWdMaW5lV2l0aEhlYWRlcihkT3V0LCBcIm11bHRpcGx5IGJ5IGNhcmJvbiBjb3VudFwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiICogXCIgKyBjYXJib25Db3VudCArIFwiID0gXCIgKyB0aGlzLl9udW1TdHIodmFsdWUpICsgXCIgQ21Nb2wvTFwiKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHVuaXRzID0gJ0NtTW9sL0wnO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIC8vIEFyZSB3ZSBpbiBvdXIgZGVzaXJlZCBvdXRwdXQgZm9ybWF0IChDbW9sL0wpP1xuICAgICAgICAgICAgICAgICAgICBpZiAodW5pdHMgPT09ICdDbU1vbC9MJykge1xuICAgICAgICAgICAgICAgICAgICAgICAgIGZpbmFsVmFsdWUgPSB2YWx1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgICBpc1ZhbGlkID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAoZE91dCkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLl9kZWJ1Z091dHB1dEluZGVudC0tO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLl93cml0ZURlYnVnTGluZSh0cnVlLCBcIlwiKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyBSZXR1cm4gYSByZXN1bHQuXG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIGlzVmFsaWQ6IGlzVmFsaWQsXG4gICAgICAgICAgICAgICAgdmFsdWU6IGZpbmFsVmFsdWVcbiAgICAgICAgICAgIH07XG4gICAgICAgIH1cblxuXG4gICAgICAgIHByaXZhdGUgX2lzT3B0aWNhbERlbnNpdHlNZWFzdXJlbWVudChtZWFzdXJlbWVudFR5cGU6TWVhc3VyZW1lbnRUeXBlUmVjb3JkKTpib29sZWFuIHtcbiAgICAgICAgICAgIHJldHVybiBtZWFzdXJlbWVudFR5cGUubmFtZSA9PT0gJ09wdGljYWwgRGVuc2l0eSc7XG4gICAgICAgIH1cblxuXG4gICAgICAgIC8vIFJldHVybnMgYSBoYXNoIG9mIGFzc2F5TWVhc3VyZW1lbnRJRC0+e3RpbWUtPmludGVncmFsfSBmb3IgYW55IG1vbC9ML2hyIG1lYXN1cmVtZW50cy5cbiAgICAgICAgcHJpdmF0ZSBfaW50ZWdyYXRlQXNzYXlNZWFzdXJlbWVudHMoYmlvbWFzc0NhbGN1bGF0aW9uOm51bWJlcik6SW50ZWdyYWxMb29rdXAge1xuICAgICAgICAgICAgdmFyIGludGVncmFsc0J5TWVhc3VyZW1lbnRJRDpJbnRlZ3JhbExvb2t1cCA9IHt9O1xuXG4gICAgICAgICAgICAkLmVhY2goRURERGF0YS5Bc3NheU1lYXN1cmVtZW50cyxcbiAgICAgICAgICAgICAgICAgICAgKG1lYXN1cmVJZDpudW1iZXIsIG1lYXN1cmU6QXNzYXlNZWFzdXJlbWVudFJlY29yZCk6dm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIG10eXBlOk1ldGFib2xpdGVUeXBlUmVjb3JkID0gRURERGF0YS5NZXRhYm9saXRlVHlwZXNbbWVhc3VyZS50eXBlXSxcbiAgICAgICAgICAgICAgICAgICAgY2FyYm9uQ291bnQ6bnVtYmVyLFxuICAgICAgICAgICAgICAgICAgICB1UmVjb3JkOlVuaXRUeXBlLFxuICAgICAgICAgICAgICAgICAgICB1bml0czpzdHJpbmcsXG4gICAgICAgICAgICAgICAgICAgIGludGVncmFsOkludGVncmFsID0ge30sXG4gICAgICAgICAgICAgICAgICAgIGRhdGE6SW50ZWdyYWwsXG4gICAgICAgICAgICAgICAgICAgIHByZXZUaW1lOm51bWJlcixcbiAgICAgICAgICAgICAgICAgICAgdG90YWw6bnVtYmVyO1xuICAgICAgICAgICAgICAgIGlmICghbXR5cGUpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjYXJib25Db3VudCA9IG10eXBlLmNjO1xuICAgICAgICAgICAgICAgIHVSZWNvcmQgPSBFREREYXRhLlVuaXRUeXBlc1ttZWFzdXJlLnlfdW5pdHNdO1xuICAgICAgICAgICAgICAgIHVuaXRzID0gdVJlY29yZCA/IHVSZWNvcmQubmFtZSA6ICcnO1xuICAgICAgICAgICAgICAgIC8vIFNlZSAnT3B0aWNhbCBEZW5zaXR5IE5vdGUnIGJlbG93LlxuICAgICAgICAgICAgICAgIGlmICh1bml0cyAhPT0gJ21vbC9ML2hyJyB8fCAhY2FyYm9uQ291bnQpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpbnRlZ3JhbHNCeU1lYXN1cmVtZW50SURbbWVhc3VyZUlkXSA9IGludGVncmFsO1xuICAgICAgICAgICAgICAgIC8vIHN1bSBvdmVyIGFsbCBkYXRhXG4gICAgICAgICAgICAgICAgZGF0YSA9IHRoaXMuX2Fzc2F5TWVhc3VyZW1lbnREYXRhQnlJRFttZWFzdXJlSWRdO1xuICAgICAgICAgICAgICAgIHRvdGFsID0gMDtcbiAgICAgICAgICAgICAgICB0aGlzLl9nZXRNZWFzdXJlbWVudFRpbWVzdGFtcHNTb3J0ZWQobWVhc3VyZUlkKS5mb3JFYWNoKCh0aW1lOm51bWJlcik6dm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHZhciB2YWx1ZTpudW1iZXIgPSBkYXRhW3RpbWVdLCBkdDpudW1iZXI7XG4gICAgICAgICAgICAgICAgICAgIGlmICghcHJldlRpbWUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHByZXZUaW1lID0gdGltZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBkdCA9IHRpbWUgLSBwcmV2VGltZTtcbiAgICAgICAgICAgICAgICAgICAgLy8gVE9ETyBzaG91bGQgdmFsdWUgYmVsb3cgYmUgZHYgPSBkYXRhW3RpbWVdIC0gZGF0YVtwcmV2VGltZV0gPz9cbiAgICAgICAgICAgICAgICAgICAgdG90YWwgKz0gZHQgKiB2YWx1ZSAqIGNhcmJvbkNvdW50O1xuICAgICAgICAgICAgICAgICAgICBpbnRlZ3JhbFt0aW1lXSA9IHRvdGFsO1xuICAgICAgICAgICAgICAgICAgICBwcmV2VGltZSA9IHRpbWU7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHJldHVybiBpbnRlZ3JhbHNCeU1lYXN1cmVtZW50SUQ7XG4gICAgICAgIH1cblxuXG4gICAgICAgIC8vIFJldHVybnMgYW4gYXJyYXkgb2YgdGltZXN0YW1wcyBmb3IgdGhpcyBhc3NheSBzb3J0ZWQgYnkgdGltZS5cbiAgICAgICAgcHJpdmF0ZSBfZ2V0TWVhc3VyZW1lbnRUaW1lc3RhbXBzU29ydGVkKG1lYXN1cmVtZW50SUQ6bnVtYmVyKTpudW1iZXJbXSB7XG4gICAgICAgICAgICB2YXIgZGF0YTpJbnRlZ3JhbCA9IHRoaXMuX2Fzc2F5TWVhc3VyZW1lbnREYXRhQnlJRFttZWFzdXJlbWVudElEXTtcbiAgICAgICAgICAgIGlmICghZGF0YSkge1xuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKCdXYXJuaW5nOiBObyBzb3J0ZWQgdGltZXN0YW1wIGFycmF5IGZvciBtZWFzdXJlbWVudCAnICsgbWVhc3VyZW1lbnRJRCk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIFtdO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy8galF1ZXJ5IG1hcCBnaXZlcyBvYmplY3QgaW5kZXhlcyBhcyBzdHJpbmcsIHNvIG5lZWQgdG8gcGFyc2VGbG9hdCBiZWZvcmUgc29ydGluZ1xuICAgICAgICAgICAgcmV0dXJuICQubWFwKGRhdGEsICh2YWx1ZTpudW1iZXIsIHRpbWU6c3RyaW5nKTpudW1iZXIgPT4gcGFyc2VGbG9hdCh0aW1lKSkuc29ydCgpO1xuICAgICAgICB9XG5cblxuICAgICAgICAvLyBHbyB0aHJvdWdoIGFsbCBtZWFzdXJlbWVudHMgaW4gdGhpcyBtZXRhYm9saXRlLCBmaWd1cmUgb3V0IHRoZSBjYXJib24gY291bnQsIGFuZCBcbiAgICAgICAgLy8gcmV0dXJuIGEgc29ydGVkIGxpc3Qgb2Yge3RpbWVTdGFtcCwgdmFsdWV9IG9iamVjdHMuIHZhbHVlcyBhcmUgaW4gQ21vbC9MLlxuICAgICAgICBwcml2YXRlIF9idWlsZFNvcnRlZE1lYXN1cmVtZW50c0ZvckFzc2F5TWV0YWJvbGl0ZShsaW5lOkxpbmVEYXRhLFxuICAgICAgICAgICAgICAgIG1lYXN1cmVtZW50SUQ6bnVtYmVyLFxuICAgICAgICAgICAgICAgIGludGVncmFsc0J5TWVhc3VyZW1lbnRJRDpJbnRlZ3JhbExvb2t1cCxcbiAgICAgICAgICAgICAgICBiaW9tYXNzQ2FsY3VsYXRpb246bnVtYmVyKTpUaW1lU2FtcGxlW10ge1xuICAgICAgICAgICAgdmFyIG1lYXN1cmVtZW50OkFzc2F5TWVhc3VyZW1lbnRSZWNvcmQgPSBFREREYXRhLkFzc2F5TWVhc3VyZW1lbnRzW21lYXN1cmVtZW50SURdLFxuICAgICAgICAgICAgICAgIHNvcnRlZE1lYXN1cmVtZW50czpUaW1lU2FtcGxlW10gPSBbXTtcblxuICAgICAgICAgICAgdGhpcy5fZ2V0TWVhc3VyZW1lbnRUaW1lc3RhbXBzU29ydGVkKG1lYXN1cmVtZW50SUQpLmZvckVhY2goXG4gICAgICAgICAgICAgICAgICAgICh0aW1lOm51bWJlciwgaTpudW1iZXIsIGE6bnVtYmVyW10pOnZvaWQgPT4ge1xuICAgICAgICAgICAgICAgIHZhciB3cml0ZURlYnVnT3V0cHV0OmJvb2xlYW4gPSBmYWxzZSxcbiAgICAgICAgICAgICAgICAgICAgcmVzdWx0OlZhbGlkYXRlZFZhbHVlLFxuICAgICAgICAgICAgICAgICAgICBzYW1wbGU6VGltZVNhbXBsZTtcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5fZGVidWdUaW1lU3RhbXAgJiYgbGluZS5nZXRMaW5lSUQoKSA9PT0gdGhpcy5fZGVidWdMaW5lSUQpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gZGVidWcgaWYgY3VycmVudCBPUiBuZXh0IHRpbWUgaXMgdGhlIGRlYnVnIHRpbWVcbiAgICAgICAgICAgICAgICAgICAgaWYgKHRpbWUgPT09IHRoaXMuX2RlYnVnVGltZVN0YW1wIHx8XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgKGkgKyAxIDwgYS5sZW5ndGggJiYgYVtpICsgMV0gPT09IHRoaXMuX2RlYnVnVGltZVN0YW1wKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgd3JpdGVEZWJ1Z091dHB1dCA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmVzdWx0ID0gdGhpcy5fY2FsY3VsYXRlQ21Nb2xQZXJMaXRlcihtZWFzdXJlbWVudElELCB0aW1lLFxuICAgICAgICAgICAgICAgICAgICBpbnRlZ3JhbHNCeU1lYXN1cmVtZW50SUQsIGJpb21hc3NDYWxjdWxhdGlvbiwgd3JpdGVEZWJ1Z091dHB1dCk7XG4gICAgICAgICAgICAgICAgaWYgKCFyZXN1bHQuaXNWYWxpZCkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHNhbXBsZSA9IG5ldyBUaW1lU2FtcGxlKCk7XG4gICAgICAgICAgICAgICAgc2FtcGxlLnRpbWVTdGFtcCA9IHRpbWU7XG4gICAgICAgICAgICAgICAgc2FtcGxlLmNhcmJvblZhbHVlID0gcmVzdWx0LnZhbHVlO1xuICAgICAgICAgICAgICAgIHNvcnRlZE1lYXN1cmVtZW50cy5wdXNoKHNhbXBsZSk7XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX2NhbGN1bGF0ZUNhcmJvbkRlbHRhcyhzb3J0ZWRNZWFzdXJlbWVudHMsIGxpbmUsIG1lYXN1cmVtZW50LFxuICAgICAgICAgICAgICAgIGJpb21hc3NDYWxjdWxhdGlvbik7XG4gICAgICAgIH1cblxuXG4gICAgICAgIC8vIEdvIHRocm91Z2ggdGhlIFRpbWVTYW1wbGVzIGFuZCBjYWxjdWxhdGUgdGhlaXIgY2FyYm9uRGVsdGEgdmFsdWUuXG4gICAgICAgIHByaXZhdGUgX2NhbGN1bGF0ZUNhcmJvbkRlbHRhcyhzb3J0ZWRNZWFzdXJlbWVudHM6VGltZVNhbXBsZVtdLFxuICAgICAgICAgICAgICAgIGxpbmU6TGluZURhdGEsXG4gICAgICAgICAgICAgICAgbWVhc3VyZW1lbnQ6QXNzYXlNZWFzdXJlbWVudFJlY29yZCxcbiAgICAgICAgICAgICAgICBiaW9tYXNzQ2FsY3VsYXRpb246bnVtYmVyKTpUaW1lU2FtcGxlW10ge1xuICAgICAgICAgICAgdmFyIG10eXBlOk1ldGFib2xpdGVUeXBlUmVjb3JkID0gRURERGF0YS5NZXRhYm9saXRlVHlwZXNbbWVhc3VyZW1lbnQudHlwZV0sXG4gICAgICAgICAgICAgICAgaXNPcHRpY2FsRGVuc2l0eTpib29sZWFuID0gdGhpcy5faXNPcHRpY2FsRGVuc2l0eU1lYXN1cmVtZW50KG10eXBlKSxcbiAgICAgICAgICAgICAgICBhc3NheTpBc3NheVJlY29yZCA9IEVERERhdGEuQXNzYXlzW21lYXN1cmVtZW50LmFzc2F5XSxcbiAgICAgICAgICAgICAgICBsaW5lUmVjOkxpbmVSZWNvcmQgPSBFREREYXRhLkxpbmVzW2Fzc2F5LmxpZF0sXG4gICAgICAgICAgICAgICAgcHJvdG9jb2w6YW55ID0gRURERGF0YS5Qcm90b2NvbHNbYXNzYXkucGlkXSxcbiAgICAgICAgICAgICAgICBuYW1lOnN0cmluZyA9IFtsaW5lUmVjLm5hbWUsIHByb3RvY29sLm5hbWUsIGFzc2F5Lm5hbWVdLmpvaW4oJy0nKTtcblxuICAgICAgICAgICAgLy8gbG9vcCBmcm9tIHNlY29uZCBlbGVtZW50LCBhbmQgdXNlIHRoZSBpbmRleCBvZiBzaG9ydGVyIGFycmF5IHRvIGdldCBwcmV2aW91c1xuICAgICAgICAgICAgc29ydGVkTWVhc3VyZW1lbnRzLnNsaWNlKDEpLmZvckVhY2goKHNhbXBsZTpUaW1lU2FtcGxlLCBpOm51bWJlcik6dm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIHByZXY6VGltZVNhbXBsZSA9IHNvcnRlZE1lYXN1cmVtZW50c1tpXSxcbiAgICAgICAgICAgICAgICAgICAgZGVsdGFUaW1lOm51bWJlciA9IHRoaXMuX2NhbGNUaW1lRGVsdGEocHJldi50aW1lU3RhbXAsIHNhbXBsZS50aW1lU3RhbXApLFxuICAgICAgICAgICAgICAgICAgICB3cml0ZURlYnVnSW5mbzpib29sZWFuLCBncm93dGhSYXRlOm51bWJlciwgZGVsdGFDYXJib246bnVtYmVyLFxuICAgICAgICAgICAgICAgICAgICBvZEZhY3RvcjpudW1iZXIsIGNtTW9sUGVyTFBlckg6bnVtYmVyLCBjbU1vbFBlckdkd1Blckg6bnVtYmVyO1xuXG4gICAgICAgICAgICAgICAgd3JpdGVEZWJ1Z0luZm8gPSAodGhpcy5fZGVidWdUaW1lU3RhbXBcbiAgICAgICAgICAgICAgICAgICAgJiYgbGluZS5nZXRMaW5lSUQoKSA9PT0gdGhpcy5fZGVidWdMaW5lSURcbiAgICAgICAgICAgICAgICAgICAgJiYgc2FtcGxlLnRpbWVTdGFtcCA9PT0gdGhpcy5fZGVidWdUaW1lU3RhbXApO1xuICAgICAgICAgICAgICAgIGlmIChpc09wdGljYWxEZW5zaXR5KSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIElmIHRoaXMgaXMgdGhlIE9EIG1lYXN1cmVtZW50LCB0aGVuIHdlJ2xsIHVzZSB0aGUgYmlvbWFzcyBmYWN0b3JcbiAgICAgICAgICAgICAgICAgICAgZ3Jvd3RoUmF0ZSA9IChNYXRoLmxvZyhzYW1wbGUuY2FyYm9uVmFsdWUgLyBwcmV2LmNhcmJvblZhbHVlKSAvIGRlbHRhVGltZSk7XG4gICAgICAgICAgICAgICAgICAgIHNhbXBsZS5jYXJib25EZWx0YSA9IGJpb21hc3NDYWxjdWxhdGlvbiAqIGdyb3d0aFJhdGU7XG4gICAgICAgICAgICAgICAgICAgIGlmICh3cml0ZURlYnVnSW5mbykge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fd3JpdGVEZWJ1Z0xpbmUodHJ1ZSwgXCJCaW9tYXNzIENhbGN1bGF0aW9uIGZvciBcIiArIG5hbWUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fZGVidWdPdXRwdXRJbmRlbnQrKztcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX3dyaXRlRGVidWdMaW5lV2l0aEhlYWRlcih0cnVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwicmF3IE9EIGF0IFwiICsgcHJldi50aW1lU3RhbXAgKyBcImhcIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9udW1TdHIocHJldi5jYXJib25WYWx1ZSkpO1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fd3JpdGVEZWJ1Z0xpbmVXaXRoSGVhZGVyKHRydWUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJyYXcgT0QgYXQgXCIgKyBzYW1wbGUudGltZVN0YW1wICsgXCJoXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fbnVtU3RyKHNhbXBsZS5jYXJib25WYWx1ZSkpO1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fd3JpdGVEZWJ1Z0xpbmVXaXRoSGVhZGVyKHRydWUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJncm93dGggcmF0ZVwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwibG9nKFwiICtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fbnVtU3RyKHNhbXBsZS5jYXJib25WYWx1ZSkgKyBcIiAvIFwiICtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fbnVtU3RyKHByZXYuY2FyYm9uVmFsdWUpICtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBcIikgLyBcIiArIHRoaXMuX251bVN0cihkZWx0YVRpbWUpICsgXCJoID0gXCIgK1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX251bVN0cihncm93dGhSYXRlKSk7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl93cml0ZURlYnVnTGluZVdpdGhIZWFkZXIodHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBcImJpb21hc3MgZmFjdG9yXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgXCIgKiBcIiArIHRoaXMuX251bVN0cihiaW9tYXNzQ2FsY3VsYXRpb24pICsgXCIgPSBcIiArXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fbnVtU3RyKHNhbXBsZS5jYXJib25EZWx0YSkgKyBcIiBDbU1vbC9nZHcvaHJcIik7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl93cml0ZURlYnVnTGluZSh0cnVlLCBcIlwiKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX2RlYnVnT3V0cHV0SW5kZW50LS07XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAvLyBHYXRoZXIgdGVybXMuXG4gICAgICAgICAgICAgICAgICAgIGRlbHRhQ2FyYm9uID0gKHNhbXBsZS5jYXJib25WYWx1ZSAtIHByZXYuY2FyYm9uVmFsdWUpO1xuICAgICAgICAgICAgICAgICAgICBvZEZhY3RvciA9IHRoaXMuX2NhbGN1bGF0ZU9wdGljYWxEZW5zaXR5RmFjdG9yKGxpbmUsIHByZXYudGltZVN0YW1wLFxuICAgICAgICAgICAgICAgICAgICAgICAgd3JpdGVEZWJ1Z0luZm8pO1xuICAgICAgICAgICAgICAgICAgICAvLyBDbU1vbC9MIC0+IENtTW9sL0wvaHJcbiAgICAgICAgICAgICAgICAgICAgY21Nb2xQZXJMUGVySCA9IChkZWx0YUNhcmJvbiAvIGRlbHRhVGltZSk7XG4gICAgICAgICAgICAgICAgICAgIC8vIENtTW9sL0wvaHIgKiBML2dkdyAtPiBDbU1vbC9nZHcvaHJcbiAgICAgICAgICAgICAgICAgICAgY21Nb2xQZXJHZHdQZXJIID0gY21Nb2xQZXJMUGVySCAvIG9kRmFjdG9yO1xuICAgICAgICAgICAgICAgICAgICBzYW1wbGUuY2FyYm9uRGVsdGEgPSBjbU1vbFBlckdkd1Blckg7XG4gICAgICAgICAgICAgICAgICAgIC8vIFdyaXRlIHNvbWUgZGVidWcgb3V0cHV0IGZvciB3aGF0IHdlIGp1c3QgZGlkLlxuICAgICAgICAgICAgICAgICAgICBpZiAod3JpdGVEZWJ1Z0luZm8pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX3dyaXRlRGVidWdMaW5lKHRydWUsIFwiQ29udmVydCB0byBDbU1vbC9nZHcvaHJcIik7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9kZWJ1Z091dHB1dEluZGVudCsrO1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fd3JpdGVEZWJ1Z0xpbmVXaXRoSGVhZGVyKHRydWUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJkZWx0YSBmcm9tIFwiICsgcHJldi50aW1lU3RhbXAgKyBcImggdG8gXCIgKyBzYW1wbGUudGltZVN0YW1wICsgXCJoXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fbnVtU3RyKHNhbXBsZS5jYXJib25WYWx1ZSkgKyBcIiBDbU1vbC9MIC0gXCIgK1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX251bVN0cihwcmV2LmNhcmJvblZhbHVlKSArIFwiIENtTW9sL0wgPSBcIiArXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fbnVtU3RyKGRlbHRhQ2FyYm9uKSArIFwiIENtTW9sL0xcIik7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl93cml0ZURlYnVnTGluZVdpdGhIZWFkZXIodHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBcImRlbHRhIHRpbWVcIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBcIiAvIFwiICsgdGhpcy5fbnVtU3RyKGRlbHRhVGltZSkgKyBcImggPSBcIiArXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fbnVtU3RyKGNtTW9sUGVyTFBlckgpICsgXCIgQ21Nb2wvTC9oXCIpO1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fd3JpdGVEZWJ1Z0xpbmVXaXRoSGVhZGVyKHRydWUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJhcHBseSBPRFwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiIC8gXCIgKyB0aGlzLl9udW1TdHIob2RGYWN0b3IpICsgXCIgTC9nZHcgPSBcIiArXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fbnVtU3RyKGNtTW9sUGVyR2R3UGVySCkgKyBcIiBDbU1vbC9nZHcvaFwiKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX2RlYnVnT3V0cHV0SW5kZW50LS07XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgcmV0dXJuIHNvcnRlZE1lYXN1cmVtZW50cztcbiAgICAgICAgfVxuXG5cbiAgICAgICAgLy8gQ2FsY3VsYXRlIHRoZSBkaWZmZXJlbmNlIGJldHdlZW4gdHdvIHRpbWVzdGFtcHMuXG4gICAgICAgIHByaXZhdGUgX2NhbGNUaW1lRGVsdGEoZnJvbVRpbWVTdGFtcDpudW1iZXIsIHRvVGltZVN0YW1wOm51bWJlcik6bnVtYmVyIHtcbiAgICAgICAgICAgIHJldHVybiAodG9UaW1lU3RhbXApIC0gKGZyb21UaW1lU3RhbXApO1xuICAgICAgICB9XG5cblxuICAgICAgICAvLyBGaW5kIHdoZXJlIHRpbWVTdGFtcCBmaXRzIGluIHRoZSB0aW1lbGluZSBhbmQgaW50ZXJwb2xhdGUuXG4gICAgICAgIC8vIFJldHVybnMgdGhlIGluZGV4IG9mIHRoZSB0aW1lbGluZSBhbmQgdGhlIGludGVycG9sYXRpb24gYW1vdW50LlxuICAgICAgICBwcml2YXRlIF9maXRPblNvcnRlZFRpbWVsaW5lKHRpbWVTdGFtcDpudW1iZXIsIHRpbWVsaW5lOm51bWJlcltdKTphbnkge1xuICAgICAgICAgICAgLy8gaWYgdGltZVN0YW1wIGlzIGFmdGVyIGxhc3QgZW50cnkgaW4gdGltZWxpbmUsIHJldHVybiBsYXN0IGVudHJ5XG4gICAgICAgICAgICB2YXIgaW50ZXI6YW55ID0ge1xuICAgICAgICAgICAgICAgIFwiaW5kZXhcIjogdGltZWxpbmUubGVuZ3RoIC0gMixcbiAgICAgICAgICAgICAgICBcInRcIjogMVxuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIHRpbWVsaW5lLnNvbWUoKHRpbWU6bnVtYmVyLCBpOm51bWJlcik6Ym9vbGVhbiA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIHByZXY6bnVtYmVyO1xuICAgICAgICAgICAgICAgIGlmICh0aW1lU3RhbXAgPD0gdGltZSkge1xuICAgICAgICAgICAgICAgICAgICBpZiAoaSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgaW50ZXIuaW5kZXggPSBpIC0gMTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHByZXYgPSB0aW1lbGluZVtpbnRlci5pbmRleF07XG4gICAgICAgICAgICAgICAgICAgICAgICBpbnRlci50ID0gKHRpbWVTdGFtcCAtIHByZXYpIC8gKHRpbWUgLSBwcmV2KTtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGludGVyLmluZGV4ID0gMDtcbiAgICAgICAgICAgICAgICAgICAgICAgIGludGVyLnQgPSAwO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHJldHVybiBpbnRlcjtcbiAgICAgICAgfVxuXG5cbiAgICAgICAgLy8gR2l2ZW4gYSBsaW5lIGFuZCBhIHRpbWVzdGFtcCwgdGhpcyBmdW5jdGlvbiBsaW5lYXJseSBpbnRlcnBvbGF0ZXMgYXMgbmVjZXNzYXJ5IHRvIGNvbWVcbiAgICAgICAgLy8gdXAgd2l0aCBhbiBPRCB2YWx1ZSwgdGhlbiBpdCBtdWx0aXBsaWVzIGJ5IGEgbWFnaWMgbnVtYmVyIHRvIGFycml2ZSBhdCBhIGdkdy9MIGZhY3RvclxuICAgICAgICAvLyB0aGF0IGNhbiBiZSBmYWN0b3JlZCBpbnRvIG1lYXN1cmVtZW50cy5cbiAgICAgICAgcHJpdmF0ZSBfY2FsY3VsYXRlT3B0aWNhbERlbnNpdHlGYWN0b3IobGluZTpMaW5lRGF0YSxcbiAgICAgICAgICAgICAgICB0aW1lU3RhbXA6bnVtYmVyLFxuICAgICAgICAgICAgICAgIHdyaXRlRGVidWdJbmZvOmJvb2xlYW4pOm51bWJlciB7XG4gICAgICAgICAgICAvLyBHZXQgdGhlIE9EIG1lYXN1cmVtZW50cy5cbiAgICAgICAgICAgIHZhciBvZE1lYXN1cmVJRDpudW1iZXIgPSB0aGlzLl9nZXRPcHRpY2FsRGVuc2l0eU1lYXN1cmVtZW50Rm9yTGluZShsaW5lLmdldExpbmVJRCgpKSxcbiAgICAgICAgICAgICAgICAvLyBMaW5lYXJseSBpbnRlcnBvbGF0ZSBvbiB0aGUgT0QgbWVhc3VyZW1lbnQgdG8gZ2V0IHRoZSBkZXNpcmVkIGZhY3Rvci5cbiAgICAgICAgICAgICAgICBzb3J0ZWRUaW1lOm51bWJlcltdID0gdGhpcy5fZ2V0TWVhc3VyZW1lbnRUaW1lc3RhbXBzU29ydGVkKG9kTWVhc3VyZUlEKSxcbiAgICAgICAgICAgICAgICBpbnRlcnBJbmZvOmFueSA9IHRoaXMuX2ZpdE9uU29ydGVkVGltZWxpbmUodGltZVN0YW1wLCBzb3J0ZWRUaW1lKSxcbiAgICAgICAgICAgICAgICAvLyBUaGlzIGlzIHRoZSAobGluZWFybHkgaW50ZXJwb2xhdGVkKSBPRDYwMCBtZWFzdXJlbWVudC5cbiAgICAgICAgICAgICAgICBkYXRhOkludGVncmFsID0gdGhpcy5fYXNzYXlNZWFzdXJlbWVudERhdGFCeUlEW29kTWVhc3VyZUlEXSxcbiAgICAgICAgICAgICAgICB0Om51bWJlciA9IGludGVycEluZm8udCxcbiAgICAgICAgICAgICAgICBkYXRhMTpudW1iZXIgPSBkYXRhW3NvcnRlZFRpbWVbaW50ZXJwSW5mby5pbmRleF1dLFxuICAgICAgICAgICAgICAgIGRhdGEyOm51bWJlciA9IGRhdGFbc29ydGVkVGltZVtpbnRlcnBJbmZvLmluZGV4ICsgMV1dLFxuICAgICAgICAgICAgICAgIG9kTWVhc3VyZW1lbnQ6bnVtYmVyID0gZGF0YTEgKyAoZGF0YTIgLSBkYXRhMSkgKiB0LFxuICAgICAgICAgICAgICAgIC8vIEEgbWFnaWMgZmFjdG9yIHRvIGdpdmUgdXMgZ2R3L0wgZm9yIGFuIE9ENjAwIG1lYXN1cmVtZW50LlxuICAgICAgICAgICAgICAgIC8vIFRPRE86IFRoaXMgY2FuIGJlIGN1c3RvbWl6ZWQgaW4gYXNzYXkgbWV0YWRhdGEgc28gd2Ugc2hvdWxkIGFsbG93IGZvciB0aGF0IGhlcmUuXG4gICAgICAgICAgICAgICAgb2RNYWdpY0ZhY3RvcjpudW1iZXIgPSAwLjY1LFxuICAgICAgICAgICAgICAgIGZpbmFsVmFsdWU6bnVtYmVyID0gb2RNZWFzdXJlbWVudCAqIG9kTWFnaWNGYWN0b3IsXG4gICAgICAgICAgICAgICAgLy8gZGVjbGFyaW5nIHZhcmlhYmxlcyBvbmx5IGFzc2lnbmVkIHdoZW4gd3JpdGluZyBkZWJ1ZyBsb2dzXG4gICAgICAgICAgICAgICAgbWVhc3VyZTpBc3NheU1lYXN1cmVtZW50UmVjb3JkLCBhc3NheTpBc3NheVJlY29yZCwgbGluZVJlYzpMaW5lUmVjb3JkLFxuICAgICAgICAgICAgICAgIHByb3RvY29sOmFueSwgbmFtZTpzdHJpbmc7XG5cbiAgICAgICAgICAgIC8vIFNwaXQgb3V0IG91ciBjYWxjdWxhdGlvbnMgaWYgcmVxdWVzdGVkLlxuICAgICAgICAgICAgaWYgKHdyaXRlRGVidWdJbmZvKSB7XG4gICAgICAgICAgICAgICAgbWVhc3VyZSA9IEVERERhdGEuQXNzYXlNZWFzdXJlbWVudHNbb2RNZWFzdXJlSURdO1xuICAgICAgICAgICAgICAgIGFzc2F5ID0gRURERGF0YS5Bc3NheXNbbWVhc3VyZS5hc3NheV07XG4gICAgICAgICAgICAgICAgbGluZVJlYyA9IEVERERhdGEuTGluZXNbYXNzYXkubGlkXTtcbiAgICAgICAgICAgICAgICBwcm90b2NvbCA9IEVERERhdGEuUHJvdG9jb2xzW2Fzc2F5LnBpZF07XG4gICAgICAgICAgICAgICAgbmFtZSA9IFtsaW5lUmVjLm5hbWUsIHByb3RvY29sLm5hbWUsIGFzc2F5Lm5hbWVdLmpvaW4oJy0nKTtcbiAgICAgICAgICAgICAgICB0aGlzLl93cml0ZURlYnVnTGluZSh0cnVlLCBcIkdldHRpbmcgb3B0aWNhbCBkZW5zaXR5IGZyb20gXCIgKyBuYW1lKTtcbiAgICAgICAgICAgICAgICB0aGlzLl9kZWJ1Z091dHB1dEluZGVudCsrO1xuICAgICAgICAgICAgICAgIGlmICh0ICE9PSAxKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX3dyaXRlRGVidWdMaW5lV2l0aEhlYWRlcih0cnVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgXCJyYXcgdmFsdWUgYXQgXCIgKyBzb3J0ZWRUaW1lW2ludGVycEluZm8uaW5kZXhdICsgXCJoXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9udW1TdHIoZGF0YTEpKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYgKHQgIT09IDApIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fd3JpdGVEZWJ1Z0xpbmVXaXRoSGVhZGVyKHRydWUsXG4gICAgICAgICAgICAgICAgICAgICAgICBcInJhdyB2YWx1ZSBhdCBcIiArIHNvcnRlZFRpbWVbaW50ZXJwSW5mby5pbmRleCArIDFdICsgXCJoXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9udW1TdHIoZGF0YTIpKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYgKHQgIT09IDAgJiYgdCAhPT0gMSkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLl93cml0ZURlYnVnTGluZVdpdGhIZWFkZXIodHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIFwiaW50ZXJwb2xhdGUgXCIgKyAodCAqIDEwMCkudG9GaXhlZCgyKSArIFwiJVwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fbnVtU3RyKGRhdGExKSArIFwiICsgKFwiICsgdGhpcy5fbnVtU3RyKGRhdGEyKSArIFwiIC0gXCIgK1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fbnVtU3RyKGRhdGExKSArIFwiKVwiICsgXCIgKiBcIiArIHRoaXMuX251bVN0cih0KSArIFwiID0gXCIgK1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fbnVtU3RyKG9kTWVhc3VyZW1lbnQpICsgXCIgTC9nZHdcIik7XG4gICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHRoaXMuX3dyaXRlRGVidWdMaW5lV2l0aEhlYWRlcih0cnVlLFxuICAgICAgICAgICAgICAgICAgICBcImVtcGlyaWNhbCBmYWN0b3JcIixcbiAgICAgICAgICAgICAgICAgICAgXCIgKiBcIiArIHRoaXMuX251bVN0cihvZE1hZ2ljRmFjdG9yKSArIFwiID0gXCIgK1xuICAgICAgICAgICAgICAgICAgICB0aGlzLl9udW1TdHIoZmluYWxWYWx1ZSkgKyBcIiBML2dkd1wiKTtcbiAgICAgICAgICAgICAgICB0aGlzLl93cml0ZURlYnVnTGluZSh0cnVlLCBcIlwiKTtcbiAgICAgICAgICAgICAgICB0aGlzLl9kZWJ1Z091dHB1dEluZGVudC0tO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4gZmluYWxWYWx1ZTtcbiAgICAgICAgfVxuXG5cbiAgICAgICAgLy8gUmV0dXJucyB0aGUgYXNzYXkgbWVhc3VyZW1lbnQgdGhhdCByZXByZXNlbnRzIE9EIGZvciB0aGUgc3BlY2lmaWVkIGxpbmUuXG4gICAgICAgIHByaXZhdGUgX2dldE9wdGljYWxEZW5zaXR5TWVhc3VyZW1lbnRGb3JMaW5lKGxpbmVJRDpudW1iZXIpOm51bWJlciB7XG4gICAgICAgICAgICB2YXIgb2RNZWFzdXJlSUQ6bnVtYmVyID0gdGhpcy5fb3B0aWNhbERlbnNpdHlNZWFzdXJlbWVudElEQnlMaW5lSURbbGluZUlEXTtcbiAgICAgICAgICAgIGlmICh0eXBlb2Ygb2RNZWFzdXJlSUQgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG9kTWVhc3VyZUlEO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhcIldhcm5pbmchIFVuYWJsZSB0byBmaW5kIE9EIG1lYXN1cmVtZW50IGZvciBcIiArXG4gICAgICAgICAgICAgICAgICAgIEVERERhdGEuTGluZXNbbGluZUlEXS5uYW1lKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gLTE7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuXG4gICAgICAgIC8vIFRoaXMgY2FsY3VsYXRlcyB0aGUgX3ZhbGlkQXNzYXlzQnlMaW5lSUQgYW5kIF92YWxpZE1lYXN1cmVtZW50c0J5QXNzYXlJRCBsaXN0cyxcbiAgICAgICAgLy8gd2hpY2ggcmVkdWNlcyBjbHV0dGVyIGluIGFsbCBvdXIgbG9vcGluZyBjb2RlLlxuICAgICAgICBwcml2YXRlIF9wcmVjYWxjdWxhdGVWYWxpZExpc3RzKCk6dm9pZCB7XG4gICAgICAgICAgICAkLmVhY2goRURERGF0YS5MaW5lcywgKGtleTpzdHJpbmcsIGxpbmU6TGluZVJlY29yZCk6dm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKGxpbmUuYWN0aXZlKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX3ZhbGlkQXNzYXlzQnlMaW5lSURbbGluZS5pZF0gPSBbXTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICQuZWFjaChFREREYXRhLkFzc2F5cywgKGtleTpzdHJpbmcsIGFzc2F5OkFzc2F5UmVjb3JkKTp2b2lkID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgbGlzdDpudW1iZXJbXSA9IHRoaXMuX3ZhbGlkQXNzYXlzQnlMaW5lSURbYXNzYXkubGlkXTtcbiAgICAgICAgICAgICAgICBpZiAoYXNzYXkuYWN0aXZlICYmIGxpc3QpIHtcbiAgICAgICAgICAgICAgICAgICAgbGlzdC5wdXNoKGFzc2F5LmlkKTtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fdmFsaWRNZWFzdXJlbWVudHNCeUFzc2F5SURbYXNzYXkuaWRdID0gW107XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAkLmVhY2goRURERGF0YS5Bc3NheU1lYXN1cmVtZW50cywgKGtleTpzdHJpbmcsXG4gICAgICAgICAgICAgICAgICAgIG1lYXN1cmU6QXNzYXlNZWFzdXJlbWVudFJlY29yZCk6dm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIGxpc3Q6bnVtYmVyW10gPSB0aGlzLl92YWxpZE1lYXN1cmVtZW50c0J5QXNzYXlJRFttZWFzdXJlLmFzc2F5XSxcbiAgICAgICAgICAgICAgICAgICAgdHlwZTpNZWFzdXJlbWVudFR5cGVSZWNvcmQgPSBFREREYXRhLk1lYXN1cmVtZW50VHlwZXNbbWVhc3VyZS50eXBlXSxcbiAgICAgICAgICAgICAgICAgICAgYXNzYXk6QXNzYXlSZWNvcmQgPSBFREREYXRhLkFzc2F5c1ttZWFzdXJlLmFzc2F5XTtcbiAgICAgICAgICAgICAgICBpZiAobGlzdCkge1xuICAgICAgICAgICAgICAgICAgICBsaXN0LnB1c2gobWVhc3VyZS5pZCk7XG4gICAgICAgICAgICAgICAgICAgIGlmICh0eXBlICYmIHRoaXMuX2lzT3B0aWNhbERlbnNpdHlNZWFzdXJlbWVudCh0eXBlKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fb3B0aWNhbERlbnNpdHlNZWFzdXJlbWVudElEQnlMaW5lSURbYXNzYXkubGlkXSA9IG1lYXN1cmUuaWQ7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGV4cG9ydCBpbnRlcmZhY2UgQXNzYXlMb29rdXAge1xuICAgICAgICBbaWQ6bnVtYmVyXTogQXNzYXlEYXRhO1xuICAgIH1cblxuICAgIGV4cG9ydCBpbnRlcmZhY2UgVGltZWxpbmVMb29rdXAge1xuICAgICAgICBbaWQ6bnVtYmVyXTogTWV0YWJvbGl0ZVRpbWVsaW5lO1xuICAgIH1cblxuICAgIC8vIENsYXNzIGRlZmluaXRpb24gZm9yIGVsZW1lbnRzIGluIFN1bW1hdGlvbi5saW5lRGF0YUJ5SURcbiAgICBleHBvcnQgY2xhc3MgTGluZURhdGEge1xuICAgICAgICBhc3NheXNCeUlEOkFzc2F5TG9va3VwID0gPEFzc2F5TG9va3VwPnt9O1xuICAgICAgICBwcml2YXRlIF9saW5lSUQ6bnVtYmVyO1xuXG4gICAgICAgIGNvbnN0cnVjdG9yKGxpbmVJRDpudW1iZXIpIHtcbiAgICAgICAgICAgIHRoaXMuX2xpbmVJRCA9IGxpbmVJRDtcbiAgICAgICAgfVxuXG4gICAgICAgIGdldExpbmVJRCgpOm51bWJlciB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5fbGluZUlEO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gUmV0dXJuIGEgbGlzdCBvZiBBc3NheURhdGEgc3RydWN0dXJlcyB0aGF0IG9ubHlcbiAgICAgICAgLy8gY29udGFpbiBtZXRhYm9saXRlIGRhdGEgZm9yIHRoZSBzcGVjaWZpZWQgdGltZSBzdGFtcC5cbiAgICAgICAgLy8gKFRoaXMgd2lsbCBub3QgcmV0dXJuIGFzc2F5cyB0aGF0IGRvbid0IGhhdmUgYW55IG1ldGFib2xpdGUgZGF0YSBmb3IgdGhpcyB0aW1lIHN0YW1wLilcbiAgICAgICAgZmlsdGVyQXNzYXlzQnlUaW1lU3RhbXAodGltZVN0YW1wOm51bWJlcik6QXNzYXlEYXRhW10ge1xuICAgICAgICAgICAgdmFyIGZpbHRlcmVkQXNzYXlzOkFzc2F5RGF0YVtdID0gW107XG4gICAgICAgICAgICAvLyBqUXVlcnkgZWFjaCBjYWxsYmFjayBhbHdheXMgZ2l2ZXMgc3RyaW5nIGJhY2sgZm9yIGtleXNcbiAgICAgICAgICAgICQuZWFjaCh0aGlzLmFzc2F5c0J5SUQsIChha2V5OnN0cmluZywgYXNzYXk6QXNzYXlEYXRhKTp2b2lkID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgdGltZWxpbmVzOlRpbWVsaW5lTG9va3VwID0gPFRpbWVsaW5lTG9va3VwPnt9LFxuICAgICAgICAgICAgICAgICAgICBudW1BZGRlZDpudW1iZXIgPSAwLFxuICAgICAgICAgICAgICAgICAgICBvdXRBc3NheTpBc3NheURhdGE7XG4gICAgICAgICAgICAgICAgJC5lYWNoKGFzc2F5LnRpbWVsaW5lc0J5TWVhc3VyZW1lbnRJZCxcbiAgICAgICAgICAgICAgICAgICAgICAgICh0a2V5OnN0cmluZywgdGltZWxpbmU6TWV0YWJvbGl0ZVRpbWVsaW5lKTp2b2lkID0+IHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIHNhbXBsZTphbnkgPSB0aW1lbGluZS5maW5kU2FtcGxlQnlUaW1lU3RhbXAodGltZVN0YW1wKSxcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lYXN1cmVtZW50Ok1ldGFib2xpdGVUaW1lbGluZTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHNhbXBsZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgbWVhc3VyZW1lbnQgPSBuZXcgTWV0YWJvbGl0ZVRpbWVsaW5lKGFzc2F5LCB0aW1lbGluZS5tZWFzdXJlSWQpO1xuICAgICAgICAgICAgICAgICAgICAgICAgbWVhc3VyZW1lbnQudGltZVNhbXBsZXMucHVzaChzYW1wbGUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgdGltZWxpbmVzW3RpbWVsaW5lLm1lYXN1cmVJZF0gPSBtZWFzdXJlbWVudDtcbiAgICAgICAgICAgICAgICAgICAgICAgICsrbnVtQWRkZWQ7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICBpZiAobnVtQWRkZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgb3V0QXNzYXkgPSBuZXcgQXNzYXlEYXRhKGFzc2F5LmFzc2F5SWQpO1xuICAgICAgICAgICAgICAgICAgICBvdXRBc3NheS50aW1lbGluZXNCeU1lYXN1cmVtZW50SWQgPSB0aW1lbGluZXM7XG4gICAgICAgICAgICAgICAgICAgIGZpbHRlcmVkQXNzYXlzLnB1c2gob3V0QXNzYXkpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgcmV0dXJuIGZpbHRlcmVkQXNzYXlzO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gU3VtIHVwIGFsbCB0aGUgaW4vb3V0IHZhbHVlcyBhY3Jvc3MgYWxsIG1ldGFib2xpdGVzIGF0IHRoZSBzcGVjaWZpZWQgdGltZXN0YW1wLlxuICAgICAgICBnZXRJbk91dFN1bUF0VGltZSh0aW1lU3RhbXA6bnVtYmVyKTpJbk91dFN1bSB7XG4gICAgICAgICAgICAvLyBHcmFiIGFsbCB0aGUgbWVhc3VyZW1lbnRzLlxuICAgICAgICAgICAgdmFyIG1lYXN1cmVtZW50czpJbk91dFN1bU1lYXN1cmVtZW50W10gPSBbXSxcbiAgICAgICAgICAgICAgICB0b3RhbEluOm51bWJlciA9IDAsXG4gICAgICAgICAgICAgICAgdG90YWxPdXQ6bnVtYmVyID0gMDtcbiAgICAgICAgICAgICQuZWFjaCh0aGlzLmFzc2F5c0J5SUQsIChrZXk6c3RyaW5nLCBhc3NheTpBc3NheURhdGEpOnZvaWQgPT4ge1xuICAgICAgICAgICAgICAgICQuZWFjaChhc3NheS50aW1lbGluZXNCeU1lYXN1cmVtZW50SWQsIChrZXk6c3RyaW5nLFxuICAgICAgICAgICAgICAgICAgICAgICAgdGltZWxpbmU6TWV0YWJvbGl0ZVRpbWVsaW5lKTp2b2lkID0+IHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIGlub3V0OkluT3V0U3VtTWVhc3VyZW1lbnQgPSBuZXcgSW5PdXRTdW1NZWFzdXJlbWVudCgpO1xuICAgICAgICAgICAgICAgICAgICBpbm91dC50aW1lbGluZSA9IGFzc2F5LnRpbWVsaW5lc0J5TWVhc3VyZW1lbnRJZFt0aW1lbGluZS5tZWFzdXJlSWRdO1xuICAgICAgICAgICAgICAgICAgICBpbm91dC5jYXJib25EZWx0YSA9IGlub3V0LnRpbWVsaW5lLmludGVycG9sYXRlQ2FyYm9uRGVsdGEodGltZVN0YW1wKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGlub3V0LmNhcmJvbkRlbHRhID4gMCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdG90YWxPdXQgKz0gaW5vdXQuY2FyYm9uRGVsdGE7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0b3RhbEluIC09IGlub3V0LmNhcmJvbkRlbHRhO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIG1lYXN1cmVtZW50cy5wdXNoKGlub3V0KTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgcmV0dXJuIG5ldyBJbk91dFN1bSh0b3RhbEluLCB0b3RhbE91dCwgbWVhc3VyZW1lbnRzKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8vIFRoaXMgcmVwcmVzZW50cyBhIGJha2VkLWRvd24gdmVyc2lvbiBvZiB0aGUgTGluZURhdGEvQXNzYXlEYXRhLCB3aGVyZSB3ZSd2ZVxuICAgIC8vIHN1bW1lZCB1cCBjYXJib24gZGF0YSBmb3IgYWxsIGFzc2F5cyBhdCBlYWNoIHRpbWUgcG9pbnQuXG4gICAgZXhwb3J0IGNsYXNzIE1lcmdlZExpbmVTYW1wbGVzIHtcbiAgICAgICAgLy8gT3JkZXJlZCBieSB0aW1lIHN0YW1wLCB0aGVzZSBhcmUgdGhlIG1lcmdlZCBzYW1wbGVzIHdpdGggY2FyYm9uIGluL291dCBkYXRhLlxuICAgICAgICBtZXJnZWRMaW5lU2FtcGxlczpNZXJnZWRMaW5lU2FtcGxlW10gPSBbXTtcblxuICAgICAgICAvLyBUaGlzIGlzIGEgbGlzdCBvZiBhbGwgdGltZWxpbmVzIHRoYXQgd2VyZSBzYW1wbGVkIHRvIGJ1aWxkIHRoZSBzdW1zIGluIG1lcmdlZExpbmVTYW1wbGVzLlxuICAgICAgICBtZXRhYm9saXRlVGltZWxpbmVzOk1ldGFib2xpdGVUaW1lbGluZVtdID0gW107XG4gICAgfVxuXG4gICAgZXhwb3J0IGNsYXNzIE1lcmdlZExpbmVTYW1wbGUge1xuICAgICAgICB0aW1lU3RhbXA6bnVtYmVyO1xuICAgICAgICB0b3RhbENhcmJvbkluOm51bWJlciA9IDA7XG4gICAgICAgIHRvdGFsQ2FyYm9uT3V0Om51bWJlciA9IDA7XG5cbiAgICAgICAgY29uc3RydWN0b3IodGltZVN0YW1wOm51bWJlcikge1xuICAgICAgICAgICAgdGhpcy50aW1lU3RhbXAgPSB0aW1lU3RhbXA7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBleHBvcnQgY2xhc3MgSW5PdXRTdW0ge1xuICAgICAgICB0b3RhbEluOm51bWJlcjtcbiAgICAgICAgdG90YWxPdXQ6bnVtYmVyO1xuICAgICAgICBtZWFzdXJlbWVudHM6SW5PdXRTdW1NZWFzdXJlbWVudFtdO1xuXG4gICAgICAgIGNvbnN0cnVjdG9yKHRvdGFsSW46bnVtYmVyLCB0b3RhbE91dDpudW1iZXIsIG1lYXN1cmVtZW50czpJbk91dFN1bU1lYXN1cmVtZW50W10pIHtcbiAgICAgICAgICAgIHRoaXMudG90YWxJbiA9IHRvdGFsSW47XG4gICAgICAgICAgICB0aGlzLnRvdGFsT3V0ID0gdG90YWxPdXQ7XG4gICAgICAgICAgICB0aGlzLm1lYXN1cmVtZW50cyA9IG1lYXN1cmVtZW50cztcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGV4cG9ydCBjbGFzcyBJbk91dFN1bU1lYXN1cmVtZW50IHtcbiAgICAgICAgdGltZWxpbmU6TWV0YWJvbGl0ZVRpbWVsaW5lO1xuICAgICAgICBjYXJib25EZWx0YTpudW1iZXI7XG5cbiAgICAgICAgYWJzRGVsdGEoKTpudW1iZXIge1xuICAgICAgICAgICAgcmV0dXJuIE1hdGguYWJzKHRoaXMuY2FyYm9uRGVsdGEpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZXhwb3J0IGNsYXNzIEFzc2F5RGF0YSB7XG4gICAgICAgIHRpbWVsaW5lc0J5TWVhc3VyZW1lbnRJZDpUaW1lbGluZUxvb2t1cCA9IDxUaW1lbGluZUxvb2t1cD57fTtcbiAgICAgICAgYXNzYXlJZDpudW1iZXI7XG5cbiAgICAgICAgY29uc3RydWN0b3IoYXNzYXlJRDpudW1iZXIpIHtcbiAgICAgICAgICAgIHRoaXMuYXNzYXlJZCA9IGFzc2F5SUQ7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBSZXR1cm4gYSBsaXN0IG9mIFttZWFzdXJlbWVudElELCBUaW1lU2FtcGxlXSBvYmplY3RzLCBvbmUgZm9yIGVhY2hcbiAgICAgICAgLy8gbWVhc3VyZW1lbnQgdGhhdCBoYXMgYSBzYW1wbGUgYXQgdGhlIHNwZWNpZmllZCB0aW1lIHN0YW1wLlxuICAgICAgICBnZXRUaW1lU2FtcGxlc0J5VGltZVN0YW1wKHRpbWVTdGFtcDpudW1iZXIpIDogYW55W10ge1xuICAgICAgICAgICAgcmV0dXJuICQubWFwKHRoaXMudGltZWxpbmVzQnlNZWFzdXJlbWVudElkLCAodGltZWxpbmU6TWV0YWJvbGl0ZVRpbWVsaW5lKTphbnkgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBzYW1wbGU6VGltZVNhbXBsZSA9IHRpbWVsaW5lLmZpbmRTYW1wbGVCeVRpbWVTdGFtcCh0aW1lU3RhbXApO1xuICAgICAgICAgICAgICAgIGlmIChzYW1wbGUpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIFwibWVhc3VyZW1lbnRJRFwiOiB0aW1lbGluZS5tZWFzdXJlSWQsXG4gICAgICAgICAgICAgICAgICAgICAgICBcInRpbWVTYW1wbGVcIjogc2FtcGxlXG4gICAgICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBleHBvcnQgY2xhc3MgTWV0YWJvbGl0ZVRpbWVsaW5lIHtcbiAgICAgICAgYXNzYXk6QXNzYXlEYXRhO1xuICAgICAgICB0aW1lU2FtcGxlczpUaW1lU2FtcGxlW10gPSBbXTtcbiAgICAgICAgbWVhc3VyZUlkOm51bWJlcjtcblxuICAgICAgICBjb25zdHJ1Y3Rvcihhc3NheTpBc3NheURhdGEsIG1lYXN1cmVtZW50SUQ6bnVtYmVyKSB7XG4gICAgICAgICAgICAvLyBPZiB0eXBlIFN1bW1hdGlvbi5UaW1lU2FtcGxlLiBTb3J0ZWQgYnkgdGltZVN0YW1wLlxuICAgICAgICAgICAgLy8gTm90ZSB0aGF0IHNhbXBsZSAwJ3MgY2FyYm9uRGVsdGEgd2lsbCBiZSAwIHNpbmNlIGl0IGhhcyBubyBwcmV2aW91cyBtZWFzdXJlbWVudC5cbiAgICAgICAgICAgIHRoaXMuYXNzYXkgPSBhc3NheTtcbiAgICAgICAgICAgIHRoaXMubWVhc3VyZUlkID0gbWVhc3VyZW1lbnRJRDtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFRoaXMgaXMgdGhlIGVhc2llc3QgZnVuY3Rpb24gdG8gY2FsbCB0byBnZXQgdGhlIGNhcmJvbiBkZWx0YSBhdCBhIHNwZWNpZmljIHRpbWUuXG4gICAgICAgIC8vIElmIHRoaXMgdGltZWxpbmUgZG9lc24ndCBoYXZlIGEgc2FtcGxlIGF0IHRoYXQgcG9zaXRpb24sIGl0J2xsIGludGVycG9sYXRlIGJldHdlZW5cbiAgICAgICAgLy8gdGhlIG5lYXJlc3QgdHdvLlxuICAgICAgICBpbnRlcnBvbGF0ZUNhcmJvbkRlbHRhKHRpbWVTdGFtcDpudW1iZXIpOm51bWJlciB7XG4gICAgICAgICAgICB2YXIgcHJldjpUaW1lU2FtcGxlLCBkZWx0YTpudW1iZXI7XG4gICAgICAgICAgICBpZiAodGhpcy50aW1lU2FtcGxlcy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gMDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIC8vIElmIHRoZSB0aW1lIHN0YW1wIGlzIGJlZm9yZSBhbGwgb3VyIHNhbXBsZXMsIGp1c3QgcmV0dXJuIG91ciBmaXJzdCBzYW1wbGUnc1xuICAgICAgICAgICAgLy8gY2FyYm9uIGRlbHRhLlxuICAgICAgICAgICAgcHJldiA9IHRoaXMudGltZVNhbXBsZXNbMF07XG4gICAgICAgICAgICBpZiAodGltZVN0YW1wIDw9IHByZXYudGltZVN0YW1wKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMudGltZVNhbXBsZXNbMF0uY2FyYm9uRGVsdGE7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLnRpbWVTYW1wbGVzLnNvbWUoKHNhbXBsZTpUaW1lU2FtcGxlKTpib29sZWFuID0+IHtcbiAgICAgICAgICAgICAgICBpZiAoc2FtcGxlLnRpbWVTdGFtcCA9PT0gdGltZVN0YW1wKSB7XG4gICAgICAgICAgICAgICAgICAgIGRlbHRhID0gc2FtcGxlLmNhcmJvbkRlbHRhO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYgKHRpbWVTdGFtcCA+PSBwcmV2LnRpbWVTdGFtcCAmJiB0aW1lU3RhbXAgPD0gc2FtcGxlLnRpbWVTdGFtcCkge1xuICAgICAgICAgICAgICAgICAgICBkZWx0YSA9IFV0bC5KUy5yZW1hcFZhbHVlKHRpbWVTdGFtcCwgcHJldi50aW1lU3RhbXAsIHNhbXBsZS50aW1lU3RhbXAsXG4gICAgICAgICAgICAgICAgICAgICAgICBwcmV2LmNhcmJvbkRlbHRhLCBzYW1wbGUuY2FyYm9uRGVsdGEpO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcHJldiA9IHNhbXBsZTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgaWYgKGRlbHRhID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICAvLyBUaGUgdGltZSBzdGFtcCB0aGV5IHBhc3NlZCBpbiBtdXN0IGJlIHBhc3QgYWxsIG91ciBzYW1wbGVzLlxuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLnRpbWVTYW1wbGVzLnNsaWNlKC0xKVswXS5jYXJib25EZWx0YTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBkZWx0YTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFJldHVybiBhIFRpbWVTYW1wbGUgb3IgbnVsbC5cbiAgICAgICAgZmluZFNhbXBsZUJ5VGltZVN0YW1wKHRpbWVTdGFtcDpudW1iZXIpOlRpbWVTYW1wbGUge1xuICAgICAgICAgICAgdmFyIG1hdGNoZWQ6VGltZVNhbXBsZVtdO1xuICAgICAgICAgICAgbWF0Y2hlZCA9IHRoaXMudGltZVNhbXBsZXMuZmlsdGVyKFxuICAgICAgICAgICAgICAgIChzYW1wbGU6VGltZVNhbXBsZSk6Ym9vbGVhbiA9PiBzYW1wbGUudGltZVN0YW1wID09PSB0aW1lU3RhbXApO1xuICAgICAgICAgICAgaWYgKG1hdGNoZWQubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG1hdGNoZWRbMF07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgfVxuXG4gICAgfVxuXG4gICAgLy8gRGF0YSBmb3IgYSBzaW5nbGUgbGluZSBmb3IgYSBzaW5nbGUgcG9pbnQgaW4gdGltZS5cbiAgICBleHBvcnQgY2xhc3MgVGltZVNhbXBsZSB7XG4gICAgICAgIC8vIGluIGhvdXJzXG4gICAgICAgIHRpbWVTdGFtcDpudW1iZXIgPSAwO1xuICAgICAgICAvLyAqKiBOT1RFOiBDbU1vbCBoZXJlIG1lYW5zIGNhcmJvbiBtaWxsaS1tb2xlcy5cbiAgICAgICAgLy8gQ21Nb2wvTCBvZiBjYXJib24gYXQgdGhpcyB0aW1lc3RhbXBcbiAgICAgICAgY2FyYm9uVmFsdWU6bnVtYmVyID0gMDtcbiAgICAgICAgLy8gQ21Nb2wvZ2R3L2hyXG4gICAgICAgIC8vIGRlbHRhIGJldHdlZW4gdGhpcyBjYXJib24gdmFsdWUgYW5kIHRoZSBwcmV2aW91cyBvbmUgKDAgZm9yIHRoZSBmaXJzdCBlbnRyeSk6XG4gICAgICAgIC8vIC0tIFBPU0lUSVZFIG1lYW5zIG91dHB1dCAoaW4gdGhhdCB0aGUgb3JnYW5pc20gb3V0cHV0dGVkIHRoaXMgbWV0YWJvbGl0ZSBmb3IgdGhlIHRpbWVcbiAgICAgICAgLy8gICAgICBzcGFuIGluIHF1ZXN0aW9uKVxuICAgICAgICAvLyAtLSBORUdBVElWRSBtZWFucyBpbnB1dCAgKGluIHRoYXQgdGhlIG9yZ2FuaXNtIHJlZHVjZWQgdGhlIGFtb3VudCBvZiB0aGlzIG1ldGFib2xpdGVcbiAgICAgICAgLy8gICAgICBmb3IgdGhlIHRpbWUgc3BhbilcbiAgICAgICAgY2FyYm9uRGVsdGE6bnVtYmVyID0gMDtcblxuICAgICAgICBpc0lucHV0KCkgOiBib29sZWFuIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmNhcmJvbkRlbHRhIDw9IDA7XG4gICAgICAgIH1cblxuICAgICAgICBpc091dHB1dCgpIDogYm9vbGVhbiB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5jYXJib25EZWx0YSA+IDA7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBSZXR1cm4gdGhlIGFic29sdXRlIHZhbHVlIG9mIGNhcmJvbkRlbHRhLiBZb3UnbGwgbmVlZCB0byB1c2UgaXNJbnB1dCgpIG9yIGlzT3V0cHV0KClcbiAgICAgICAgLy8gdG8ga25vdyB3aGljaCBpdCByZXByZXNlbnRzLlxuICAgICAgICBhYnNEZWx0YSgpIDogbnVtYmVyIHtcbiAgICAgICAgICAgIHJldHVybiBNYXRoLmFicyh0aGlzLmNhcmJvbkRlbHRhKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGludGVyZmFjZSBNZXJnZWRMaW5lVGltZUxvb2t1cCB7XG4gICAgICAgIFtpbmRleDpudW1iZXJdOiBNZXJnZWRMaW5lU2FtcGxlO1xuICAgIH1cblxuICAgIC8vIFN0ZXAgMSBpcyB3aGVyZSBDYXJib25CYWxhbmNlLlN1bW1hdGlvbiBidWlsZHMgYSB0aW1lbGluZSBmb3IgZWFjaCBsaW5lLT5hc3NheS0+bWV0YWJvbGl0ZS5cbiAgICAvLyBTdGVwIDIgaXMgd2hlcmUgdGhpcyBjbGFzcyBtZXJnZXMgYWxsIHRoZSBhc3NheS0+bWV0YWJvbGl0ZSB0aW1lbGluZXMgaW50byBvbmUgdGltZWxpbmVcbiAgICAvLyBmb3IgZWFjaCBsaW5lLlxuICAgIGV4cG9ydCBjbGFzcyBUaW1lbGluZU1lcmdlciB7XG5cbiAgICAgICAgLy8gVGFrZSB0aGUgaW5wdXQgTGluZURhdGEgYW5kIHN1bSB1cCBhbGwgbWVhc3VyZW1lbnRzIGFjcm9zcyBhbGwgYXNzYXlzL21ldGFib2xpdGVzXG4gICAgICAgIC8vIGludG8gYSBsaXN0IG9mIHt0aW1lU3RhbXAsIHRvdGFsQ2FyYm9uSW4sIHRvdGFsQ2FyYm9uT3V0fSBvYmplY3RzIChzb3J0ZWQgYnkgdGltZVN0YW1wKS5cbiAgICAgICAgcHVibGljIHN0YXRpYyBtZXJnZUFsbExpbmVTYW1wbGVzKGxpbmVEYXRhOkxpbmVEYXRhKTpNZXJnZWRMaW5lU2FtcGxlcyB7XG4gICAgICAgICAgICB2YXIgbWVyZ2VkTGluZVNhbXBsZXM6TWVyZ2VkTGluZVNhbXBsZXMgPSBuZXcgTWVyZ2VkTGluZVNhbXBsZXMoKSxcbiAgICAgICAgICAgICAgICAvLyBGaXJzdCwgYnVpbGQgYSBsaXN0IG9mIHRpbWVzdGFtcHMgZnJvbSBcInByaW1hcnkgYXNzYXlzXCIgKGkuZS4gbm9uLVJBTU9TIGFzc2F5cykuXG4gICAgICAgICAgICAgICAgLy8gb2JqZWN0IGlzIGJlaW5nIHVzZWQgYXMgYSBzZXRcbiAgICAgICAgICAgICAgICB2YWxpZFRpbWVTdGFtcHM6e1tpOm51bWJlcl06bnVtYmVyfSA9IHt9LFxuICAgICAgICAgICAgICAgIG1lcmdlZFNhbXBsZXM6TWVyZ2VkTGluZVRpbWVMb29rdXAgPSA8TWVyZ2VkTGluZVRpbWVMb29rdXA+e307XG5cbiAgICAgICAgICAgICQuZWFjaChsaW5lRGF0YS5hc3NheXNCeUlELCAoYWtleTpzdHJpbmcsIGFzc2F5OkFzc2F5RGF0YSk6dm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgJC5lYWNoKGFzc2F5LnRpbWVsaW5lc0J5TWVhc3VyZW1lbnRJZCxcbiAgICAgICAgICAgICAgICAgICAgICAgICh0a2V5OnN0cmluZywgdGltZWxpbmU6TWV0YWJvbGl0ZVRpbWVsaW5lKTp2b2lkID0+IHtcbiAgICAgICAgICAgICAgICAgICAgbWVyZ2VkTGluZVNhbXBsZXMubWV0YWJvbGl0ZVRpbWVsaW5lcy5wdXNoKHRpbWVsaW5lKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKFRpbWVsaW5lTWVyZ2VyLl9pc1ByaW1hcnlBc3NheShhc3NheSkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRpbWVsaW5lLnRpbWVTYW1wbGVzLmZvckVhY2goKHNhbXBsZTpUaW1lU2FtcGxlKTp2b2lkID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YWxpZFRpbWVTdGFtcHNbc2FtcGxlLnRpbWVTdGFtcF0gPSBzYW1wbGUudGltZVN0YW1wO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgJC5lYWNoKHZhbGlkVGltZVN0YW1wcywgKGtleTpzdHJpbmcsIHRpbWVTdGFtcDpudW1iZXIpOnZvaWQgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBvdXRTYW1wbGU6TWVyZ2VkTGluZVNhbXBsZSwgdGltZWxpbmVzOk1ldGFib2xpdGVUaW1lbGluZVtdO1xuICAgICAgICAgICAgICAgIGlmICh0aW1lU3RhbXAgPT09IDApIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBvdXRTYW1wbGUgPSBuZXcgTWVyZ2VkTGluZVNhbXBsZSh0aW1lU3RhbXApO1xuICAgICAgICAgICAgICAgIG1lcmdlZFNhbXBsZXNbdGltZVN0YW1wXSA9IG91dFNhbXBsZTtcbiAgICAgICAgICAgICAgICB0aW1lbGluZXMgPSBtZXJnZWRMaW5lU2FtcGxlcy5tZXRhYm9saXRlVGltZWxpbmVzO1xuICAgICAgICAgICAgICAgIHRpbWVsaW5lcy5mb3JFYWNoKCh0aW1lbGluZTpNZXRhYm9saXRlVGltZWxpbmUpOnZvaWQgPT4ge1xuICAgICAgICAgICAgICAgICAgICB2YXIgY2FyYm9uRGVsdGE6bnVtYmVyID0gdGltZWxpbmUuaW50ZXJwb2xhdGVDYXJib25EZWx0YSh0aW1lU3RhbXApO1xuICAgICAgICAgICAgICAgICAgICBpZiAoY2FyYm9uRGVsdGEgPiAwKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBvdXRTYW1wbGUudG90YWxDYXJib25PdXQgKz0gY2FyYm9uRGVsdGE7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBvdXRTYW1wbGUudG90YWxDYXJib25JbiAtPSBjYXJib25EZWx0YTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAvLyBzb3J0IHRoZSBzYW1wbGVzIGJ5IHRpbWVzdGFtcFxuICAgICAgICAgICAgbWVyZ2VkTGluZVNhbXBsZXMubWVyZ2VkTGluZVNhbXBsZXMgPSAkLm1hcChcbiAgICAgICAgICAgICAgICBtZXJnZWRTYW1wbGVzLFxuICAgICAgICAgICAgICAgIChzYW1wbGU6TWVyZ2VkTGluZVNhbXBsZSk6TWVyZ2VkTGluZVNhbXBsZSA9PiBzYW1wbGVcbiAgICAgICAgICAgICkuc29ydCgoYTpNZXJnZWRMaW5lU2FtcGxlLCBiOk1lcmdlZExpbmVTYW1wbGUpOm51bWJlciA9PiB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGEudGltZVN0YW1wIC0gYi50aW1lU3RhbXA7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHJldHVybiBtZXJnZWRMaW5lU2FtcGxlcztcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFJldHVybnMgdHJ1ZSBpZiB0aGlzIGlzIGEgXCJwcmltYXJ5XCIgYXNzYXksIHdoaWNoIG1lYW5zIHRoYXQgd2UnbGwgdXNlIGl0IHRvIGdlbmVyYXRlXG4gICAgICAgIC8vIGNhcmJvbiBiYWxhbmNlIHRpbWUgc2FtcGxlcy4gQSBub24tcHJpbWFyeSBhc3NheSBpcyBzb21ldGhpbmcgdGhhdCBnZW5lcmF0ZXMgYSB0b24gb2ZcbiAgICAgICAgLy8gc2FtcGxlcyBsaWtlIFJBTU9TLlxuICAgICAgICBwcml2YXRlIHN0YXRpYyBfaXNQcmltYXJ5QXNzYXkoYXNzYXk6QXNzYXlEYXRhKTpib29sZWFuIHtcbiAgICAgICAgICAgIHZhciBzZXJ2ZXJBc3NheURhdGE6QXNzYXlSZWNvcmQgPSBFREREYXRhLkFzc2F5c1thc3NheS5hc3NheUlkXSxcbiAgICAgICAgICAgICAgICBwcm90b2NvbDphbnkgPSBFREREYXRhLlByb3RvY29sc1tzZXJ2ZXJBc3NheURhdGEucGlkXTtcbiAgICAgICAgICAgIC8vIFRPRE86IEZyYWdpbGVcbiAgICAgICAgICAgIHJldHVybiAocHJvdG9jb2wubmFtZSAhPT0gJ08yL0NPMicpO1xuICAgICAgICB9XG4gICAgfVxuXG59IC8vIGVuZCBtb2R1bGUgQ2FyYm9uQmFsYW5jZVxuIl19