// Compiled to JS on: Thu Feb 18 2016 16:47:14  
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiQ2FyYm9uU3VtbWF0aW9uLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL0NhcmJvblN1bW1hdGlvbi50cyJdLCJuYW1lcyI6WyJDYXJib25CYWxhbmNlIiwiQ2FyYm9uQmFsYW5jZS5TdW1tYXRpb24iLCJDYXJib25CYWxhbmNlLlN1bW1hdGlvbi5jb25zdHJ1Y3RvciIsIkNhcmJvbkJhbGFuY2UuU3VtbWF0aW9uLmNyZWF0ZSIsIkNhcmJvbkJhbGFuY2UuU3VtbWF0aW9uLmdlbmVyYXRlRGVidWdUZXh0IiwiQ2FyYm9uQmFsYW5jZS5TdW1tYXRpb24ubWVyZ2VBbGxMaW5lU2FtcGxlcyIsIkNhcmJvbkJhbGFuY2UuU3VtbWF0aW9uLmdldExpbmVEYXRhQnlJRCIsIkNhcmJvbkJhbGFuY2UuU3VtbWF0aW9uLmluaXQiLCJDYXJib25CYWxhbmNlLlN1bW1hdGlvbi5fd3JpdGVEZWJ1Z0xpbmUiLCJDYXJib25CYWxhbmNlLlN1bW1hdGlvbi5fd3JpdGVEZWJ1Z0xpbmVXaXRoSGVhZGVyIiwiQ2FyYm9uQmFsYW5jZS5TdW1tYXRpb24uX251bVN0ciIsIkNhcmJvbkJhbGFuY2UuU3VtbWF0aW9uLl9kb2VzTWVhc3VyZW1lbnRDb250YWluQ2FyYm9uIiwiQ2FyYm9uQmFsYW5jZS5TdW1tYXRpb24uX2NhbGN1bGF0ZUNtTW9sUGVyTGl0ZXIiLCJDYXJib25CYWxhbmNlLlN1bW1hdGlvbi5faXNPcHRpY2FsRGVuc2l0eU1lYXN1cmVtZW50IiwiQ2FyYm9uQmFsYW5jZS5TdW1tYXRpb24uX2ludGVncmF0ZUFzc2F5TWVhc3VyZW1lbnRzIiwiQ2FyYm9uQmFsYW5jZS5TdW1tYXRpb24uX2dldE1lYXN1cmVtZW50VGltZXN0YW1wc1NvcnRlZCIsIkNhcmJvbkJhbGFuY2UuU3VtbWF0aW9uLl9idWlsZFNvcnRlZE1lYXN1cmVtZW50c0ZvckFzc2F5TWV0YWJvbGl0ZSIsIkNhcmJvbkJhbGFuY2UuU3VtbWF0aW9uLl9jYWxjdWxhdGVDYXJib25EZWx0YXMiLCJDYXJib25CYWxhbmNlLlN1bW1hdGlvbi5fY2FsY1RpbWVEZWx0YSIsIkNhcmJvbkJhbGFuY2UuU3VtbWF0aW9uLl9maXRPblNvcnRlZFRpbWVsaW5lIiwiQ2FyYm9uQmFsYW5jZS5TdW1tYXRpb24uX2NhbGN1bGF0ZU9wdGljYWxEZW5zaXR5RmFjdG9yIiwiQ2FyYm9uQmFsYW5jZS5TdW1tYXRpb24uX2dldE9wdGljYWxEZW5zaXR5TWVhc3VyZW1lbnRGb3JMaW5lIiwiQ2FyYm9uQmFsYW5jZS5TdW1tYXRpb24uX3ByZWNhbGN1bGF0ZVZhbGlkTGlzdHMiLCJDYXJib25CYWxhbmNlLkxpbmVEYXRhIiwiQ2FyYm9uQmFsYW5jZS5MaW5lRGF0YS5jb25zdHJ1Y3RvciIsIkNhcmJvbkJhbGFuY2UuTGluZURhdGEuZ2V0TGluZUlEIiwiQ2FyYm9uQmFsYW5jZS5MaW5lRGF0YS5maWx0ZXJBc3NheXNCeVRpbWVTdGFtcCIsIkNhcmJvbkJhbGFuY2UuTGluZURhdGEuZ2V0SW5PdXRTdW1BdFRpbWUiLCJDYXJib25CYWxhbmNlLk1lcmdlZExpbmVTYW1wbGVzIiwiQ2FyYm9uQmFsYW5jZS5NZXJnZWRMaW5lU2FtcGxlcy5jb25zdHJ1Y3RvciIsIkNhcmJvbkJhbGFuY2UuTWVyZ2VkTGluZVNhbXBsZSIsIkNhcmJvbkJhbGFuY2UuTWVyZ2VkTGluZVNhbXBsZS5jb25zdHJ1Y3RvciIsIkNhcmJvbkJhbGFuY2UuSW5PdXRTdW0iLCJDYXJib25CYWxhbmNlLkluT3V0U3VtLmNvbnN0cnVjdG9yIiwiQ2FyYm9uQmFsYW5jZS5Jbk91dFN1bU1lYXN1cmVtZW50IiwiQ2FyYm9uQmFsYW5jZS5Jbk91dFN1bU1lYXN1cmVtZW50LmNvbnN0cnVjdG9yIiwiQ2FyYm9uQmFsYW5jZS5Jbk91dFN1bU1lYXN1cmVtZW50LmFic0RlbHRhIiwiQ2FyYm9uQmFsYW5jZS5Bc3NheURhdGEiLCJDYXJib25CYWxhbmNlLkFzc2F5RGF0YS5jb25zdHJ1Y3RvciIsIkNhcmJvbkJhbGFuY2UuQXNzYXlEYXRhLmdldFRpbWVTYW1wbGVzQnlUaW1lU3RhbXAiLCJDYXJib25CYWxhbmNlLk1ldGFib2xpdGVUaW1lbGluZSIsIkNhcmJvbkJhbGFuY2UuTWV0YWJvbGl0ZVRpbWVsaW5lLmNvbnN0cnVjdG9yIiwiQ2FyYm9uQmFsYW5jZS5NZXRhYm9saXRlVGltZWxpbmUuaW50ZXJwb2xhdGVDYXJib25EZWx0YSIsIkNhcmJvbkJhbGFuY2UuTWV0YWJvbGl0ZVRpbWVsaW5lLmZpbmRTYW1wbGVCeVRpbWVTdGFtcCIsIkNhcmJvbkJhbGFuY2UuVGltZVNhbXBsZSIsIkNhcmJvbkJhbGFuY2UuVGltZVNhbXBsZS5jb25zdHJ1Y3RvciIsIkNhcmJvbkJhbGFuY2UuVGltZVNhbXBsZS5pc0lucHV0IiwiQ2FyYm9uQmFsYW5jZS5UaW1lU2FtcGxlLmlzT3V0cHV0IiwiQ2FyYm9uQmFsYW5jZS5UaW1lU2FtcGxlLmFic0RlbHRhIiwiQ2FyYm9uQmFsYW5jZS5UaW1lbGluZU1lcmdlciIsIkNhcmJvbkJhbGFuY2UuVGltZWxpbmVNZXJnZXIuY29uc3RydWN0b3IiLCJDYXJib25CYWxhbmNlLlRpbWVsaW5lTWVyZ2VyLm1lcmdlQWxsTGluZVNhbXBsZXMiLCJDYXJib25CYWxhbmNlLlRpbWVsaW5lTWVyZ2VyLl9pc1ByaW1hcnlBc3NheSJdLCJtYXBwaW5ncyI6IkFBQUEscURBQXFEO0FBQ3JELCtCQUErQjtBQUMvQiw0Q0FBNEM7QUFDNUMsOENBQThDO0FBRTlDLElBQU8sYUFBYSxDQXU3Qm5CO0FBdjdCRCxXQUFPLGFBQWEsRUFBQyxDQUFDO0lBQ2xCQSxZQUFZQSxDQUFDQTtJQXNCYkEsNkRBQTZEQTtJQUM3REEsK0VBQStFQTtJQUMvRUEsb0RBQW9EQTtJQUNwREEsRUFBRUE7SUFDRkEsb0RBQW9EQTtJQUNwREE7UUFBQUM7WUFFSUMsaURBQWlEQTtZQUNqREEsaUJBQVlBLEdBQStCQSxFQUFFQSxDQUFDQTtZQUM5Q0Esa0RBQWtEQTtZQUNsREEsc0JBQWlCQSxHQUFVQSxDQUFDQSxDQUFDQTtZQUU3QkEsNENBQTRDQTtZQUM1Q0EsaURBQWlEQTtZ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Q0FBQ0E7UUFDN0JBLENBQUNBO1FBRURGLHVGQUF1RkE7UUFDdkZBLHdGQUF3RkE7UUFDeEZBLHNCQUFzQkE7UUFDUEEsOEJBQWVBLEdBQTlCQSxVQUErQkEsS0FBZUE7WUFDMUNHLElBQUlBLGVBQWVBLEdBQWVBLE9BQU9BLENBQUNBLE1BQU1BLENBQUNBLEtBQUtBLENBQUNBLE9BQU9BLENBQUNBLEVBQzNEQSxRQUFRQSxHQUFPQSxPQUFPQSxDQUFDQSxTQUFTQSxDQUFDQSxlQUFlQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtZQUMxREEsZ0JBQWdCQTtZQUNoQkEsTUFBTUEsQ0FBQ0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsSUFBSUEsS0FBS0EsUUFBUUEsQ0FBQ0EsQ0FBQ0E7UUFDeENBLENBQUNBO1FBQ0xILHFCQUFDQTtJQUFEQSxDQUFDQSxBQTFERGpELElBMERDQTtJQTFEWUEsNEJBQWNBLGlCQTBEMUJBLENBQUFBO0FBRUxBLENBQUNBLEVBdjdCTSxhQUFhLEtBQWIsYUFBYSxRQXU3Qm5CLENBQUMsMkJBQTJCIiwic291cmNlc0NvbnRlbnQiOlsiLy8vIDxyZWZlcmVuY2UgcGF0aD1cInR5cGVzY3JpcHQtZGVjbGFyYXRpb25zLmQudHNcIiAvPlxuLy8vIDxyZWZlcmVuY2UgcGF0aD1cIlV0bC50c1wiIC8+XG4vLy8gPHJlZmVyZW5jZSBwYXRoPVwiRURERGF0YUludGVyZmFjZS50c1wiIC8+XG4vLy8gPHJlZmVyZW5jZSBwYXRoPVwiU3R1ZHlDYXJib25CYWxhbmNlLnRzXCIgLz5cblxubW9kdWxlIENhcmJvbkJhbGFuY2Uge1xuICAgICd1c2Ugc3RyaWN0JztcblxuICAgIGludGVyZmFjZSBWYWxpZGF0ZWRWYWx1ZSB7XG4gICAgICAgIGlzVmFsaWQ6Ym9vbGVhbjtcbiAgICAgICAgdmFsdWU6bnVtYmVyO1xuICAgIH1cblxuICAgIC8vIHZhbHVlcyBieSB0aW1lIHNlcmllc1xuICAgIGludGVyZmFjZSBJbnRlZ3JhbCB7XG4gICAgICAgIFt0aW1lOm51bWJlcl06IG51bWJlcjtcbiAgICB9XG5cbiAgICAvLyBzdG9yZSB0aW1lIHNlcmllcyBieSBtZWFzdXJlbWVudCBJRCAob3Igc2ltaWxhciBJRClcbiAgICBpbnRlcmZhY2UgSW50ZWdyYWxMb29rdXAge1xuICAgICAgICBbaWQ6bnVtYmVyXTogSW50ZWdyYWw7XG4gICAgfVxuXG4gICAgLy8gc3RvcmUgYSBsaXN0IG9mIElEcyByZWFjaGFibGUgZnJvbSBhbm90aGVyIElEXG4gICAgaW50ZXJmYWNlIElETG9va3VwIHtcbiAgICAgICAgW2lkOm51bWJlcl06IG51bWJlcltdO1xuICAgIH1cblxuICAgIC8vIFRoaXMgaXMgdGhlIGNsaWVudC1zaWRlIGNvbnRhaW5lciBmb3IgY2FyYm9uIGJhbGFuY2UgZGF0YS5cbiAgICAvLyBJdCBjb21icyB0aHJvdWdoIGxpbmVzL2Fzc2F5cy9tZWFzdXJlbWVudHMgdG8gYnVpbGQgYSBzdHJ1Y3R1cmUgdGhhdCBpcyBlYXN5XG4gICAgLy8gdG8gcHVsbCBmcm9tIHdoZW4gZGlzcGxheWluZyBjYXJib24gYmFsYW5jZSBkYXRhLlxuICAgIC8vXG4gICAgLy8gVGhpcyBpcyBwdXJlbHkgYSBkYXRhIGNsYXNzLCBOT1QgYSBkaXNwbGF5IGNsYXNzLlxuICAgIGV4cG9ydCBjbGFzcyBTdW1tYXRpb24ge1xuXG4gICAgICAgIC8vIERhdGEgZm9yIGVhY2ggbGluZSBvZiB0eXBlIFN1bW1hdGlvbi5MaW5lRGF0YS5cbiAgICAgICAgbGluZURhdGFCeUlEOiB7W2xpbmVJRDpudW1iZXJdOkxpbmVEYXRhfSA9IHt9O1xuICAgICAgICAvLyBUaGUgaGlnaGVzdCB0aW1lIHZhbHVlIHRoYXQgYW55IFRpbWVTYW1wbGUgaGFzLlxuICAgICAgICBsYXN0VGltZUluU2Vjb25kczpudW1iZXIgPSAwO1xuXG4gICAgICAgIC8vIFByZWNhbGN1bGF0ZWQgbG9va3VwcyB0byBzcGVlZCB0aGluZ3MgdXAuXG4gICAgICAgIC8vIEFuIGFycmF5IG9mIG5vbi1kaXNhYmxlZCBhc3NheXMgZm9yIGVhY2ggbGluZS5cbiAgICAgICAgcHJpdmF0ZSBfdmFsaWRBc3NheXNCeUxpbmVJRDpJRExvb2t1cCA9IDxJRExvb2t1cD57fTtcbiAgICAgICAgLy8gQW4gYXJyYXkgb2Ygbm9uLWRpc2FibGVkIG1lYXN1cmVtZW50cyBmb3IgZWFjaCBhc3NheS5cbiAgICAgICAgcHJpdmF0ZSBfdmFsaWRNZWFzdXJlbWVudHNCeUFzc2F5SUQ6SURMb29rdXAgPSA8SURMb29rdXA+e307XG4gICAgICAgIC8vIExvb2t1cCB0aGUgT0QgbWVhc3VyZW1lbnQgZm9yIGVhY2ggbGluZS5cbiAgICAgICAgcHJpdmF0ZSBfb3B0aWNhbERlbnNpdHlNZWFzdXJlbWVudElEQnlMaW5lSUQ6e1tsaW5lSUQ6bnVtYmVyXTpudW1iZXJ9ID0ge307XG5cbiAgICAgICAgLy8gVGhpcyBpcyBmcm9tIGNvbnZlcnRpbmcgdGhlIGFzc2F5IG1lYXN1cmVtZW50IGxpc3QgZ2l2ZW4gdG8gdXMgaW50byBhIGhhc2ggYnkgdGltZXN0YW1wLlxuICAgICAgICBwcml2YXRlIF9hc3NheU1lYXN1cmVtZW50RGF0YUJ5SUQ6SW50ZWdyYWxMb29rdXA7XG4gICAgICAgIHByaXZhdGUgX2RlYnVnTGluZUlEOm51bWJlciA9IDA7XG4gICAgICAgIC8vIElmIHRoaXMgaXMgc2V0LCB0aGVuIHdlJ2xsIGJlIGVtaXR0aW5nIGRlYnVnIEhUTUwgdG8gX2RlYnVnT3V0cHV0LlxuICAgICAgICBwcml2YXRlIF9kZWJ1Z1RpbWVTdGFtcDpudW1iZXI7XG4gICAgICAgIHByaXZhdGUgX2RlYnVnT3V0cHV0OnN0cmluZztcbiAgICAgICAgLy8gQXV0byB0YWIgb24gZGVidWcgb3V0cHV0LlxuICAgICAgICBwcml2YXRlIF9kZWJ1Z091dHB1dEluZGVudDpudW1iZXIgPSAwO1xuXG5cbiAgICAgICAgLy8gVXNlIHRoaXMgdG8gY3JlYXRlIGEgc3VtbWF0aW9uIG9iamVjdC5cbiAgICAgICAgc3RhdGljIGNyZWF0ZShiaW9tYXNzQ2FsY3VsYXRpb246bnVtYmVyKTpTdW1tYXRpb24ge1xuXG4gICAgICAgICAgICB2YXIgc3VtOlN1bW1hdGlvbiA9IG5ldyBTdW1tYXRpb24oKTtcbiAgICAgICAgICAgIHN1bS5pbml0KGJpb21hc3NDYWxjdWxhdGlvbik7XG4gICAgICAgICAgICByZXR1cm4gc3VtO1xuICAgICAgICB9XG5cblxuICAgICAgICAvLyBVc2UgdGhpcyB0byBnZW5lcmF0ZSBzb21lIGRlYnVnIHRleHQgdGhhdCBkZXNjcmliZXMgYWxsIHRoZSBjYWxjdWxhdGlvbnMuXG4gICAgICAgIHN0YXRpYyBnZW5lcmF0ZURlYnVnVGV4dChiaW9tYXNzQ2FsY3VsYXRpb246bnVtYmVyLFxuICAgICAgICAgICAgICAgIGRlYnVnTGluZUlEOm51bWJlcixcbiAgICAgICAgICAgICAgICBkZWJ1Z1RpbWVTdGFtcDpudW1iZXIpOnN0cmluZyB7XG5cbiAgICAgICAgICAgIC8vIENyZWF0ZSBhIFN1bW1hdGlvbiBvYmplY3QgYnV0IHRlbGwgaXQgdG8gZ2VuZXJhdGUgZGVidWcgaW5mbyB3aGlsZSBpdCBkb2VzIGl0c1xuICAgICAgICAgICAgLy8gdGltZXN0YW1wcy5cbiAgICAgICAgICAgIHZhciBzdW06U3VtbWF0aW9uID0gbmV3IFN1bW1hdGlvbigpO1xuICAgICAgICAgICAgc3VtLl9kZWJ1Z0xpbmVJRCA9IGRlYnVnTGluZUlEO1xuICAgICAgICAgICAgc3VtLl9kZWJ1Z1RpbWVTdGFtcCA9IGRlYnVnVGltZVN0YW1wO1xuICAgICAgICAgICAgc3VtLl9kZWJ1Z091dHB1dCA9IFwiXCI7XG4gICAgICAgICAgICBzdW0uaW5pdChiaW9tYXNzQ2FsY3VsYXRpb24pO1xuXG4gICAgICAgICAgICAvLyBSZXR1cm4gaXRzIGRlYnVnIGluZm8uXG4gICAgICAgICAgICByZXR1cm4gc3VtLl9kZWJ1Z091dHB1dDtcbiAgICAgICAgfVxuXG5cbiAgICAgICAgLy8gVGhpcyBqdXN0IHdyYXBzIHRoZSBjYWxsIHRvIFRpbWVsaW5lTWVyZ2VyLm1lcmdlQWxsTGluZVNhbXBsZXMuXG4gICAgICAgIG1lcmdlQWxsTGluZVNhbXBsZXMobGluZURhdGE6YW55KTpNZXJnZWRMaW5lU2FtcGxlcyB7XG4gICAgICAgICAgICByZXR1cm4gVGltZWxpbmVNZXJnZXIubWVyZ2VBbGxMaW5lU2FtcGxlcyhsaW5lRGF0YSk7XG4gICAgICAgIH1cblxuXG4gICAgICAgIGdldExpbmVEYXRhQnlJRChsaW5lSUQ6bnVtYmVyKTpMaW5lRGF0YSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5saW5lRGF0YUJ5SURbbGluZUlEXTtcbiAgICAgICAgfVxuXG5cbiAgICAgICAgLy8gSW50ZXJuYWxseSwgdGhpcyBpcyBob3cgd2UgaW5pdCB0aGUgU3VtbWF0aW9uIG9iamVjdCByZWdhcmRsZXNzIG9mIHdoZXRoZXIgaXQncyB1c2VkXG4gICAgICAgIC8vIGxhdGVyIG9yIHdoZXRoZXIgaXQncyBqdXN0IHVzZWQgdG8gZ2V0IHNvbWUgZGVidWcgdGV4dC5cbiAgICAgICAgcHJpdmF0ZSBpbml0KGJpb21hc3NDYWxjdWxhdGlvbjpudW1iZXIpOnZvaWQge1xuICAgICAgICAgICAgdmFyIGludGVncmFsc0J5TWVhc3VyZW1lbnRJRDpJbnRlZ3JhbExvb2t1cDtcblxuICAgICAgICAgICAgdGhpcy5fcHJlY2FsY3VsYXRlVmFsaWRMaXN0cygpO1xuICAgICAgICAgICAgLy8gQ29udmVydCB0byBhIGhhc2ggb24gdGltZXN0YW1wICh4IHZhbHVlKVxuICAgICAgICAgICAgdGhpcy5fYXNzYXlNZWFzdXJlbWVudERhdGFCeUlEID0ge307XG4gICAgICAgICAgICAkLmVhY2goRURERGF0YS5Bc3NheU1lYXN1cmVtZW50cywgKGlkOnN0cmluZywgbWVhc3VyZTpBc3NheU1lYXN1cmVtZW50UmVjb3JkKTp2b2lkID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgb3V0OkludGVncmFsID0gdGhpcy5fYXNzYXlNZWFzdXJlbWVudERhdGFCeUlEW2lkXSA9IDxJbnRlZ3JhbD57fTtcbiAgICAgICAgICAgICAgICAkLmVhY2gobWVhc3VyZS52YWx1ZXMsIChpOm51bWJlciwgcG9pbnQ6bnVtYmVyW11bXSk6dm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgICAgIC8vIG9ubHkgZG8gbWFwcGluZyBmb3IgKHgseSkgcG9pbnRzLCB3b24ndCBtYWtlIHNlbnNlIHdpdGggaGlnaGVyIGRpbWVuc2lvbnNcbiAgICAgICAgICAgICAgICAgICAgaWYgKHBvaW50WzBdLmxlbmd0aCA9PT0gMSAmJiBwb2ludFsxXS5sZW5ndGggPT09IDEpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIG91dFtwb2ludFswXVswXV0gPSBwb2ludFsxXVswXTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIC8vIFdlIG5lZWQgdG8gcHJlcGFyZSBpbnRlZ3JhbHMgb2YgYW55IG1vbC9ML2hyXG4gICAgICAgICAgICBpbnRlZ3JhbHNCeU1lYXN1cmVtZW50SUQgPSB0aGlzLl9pbnRlZ3JhdGVBc3NheU1lYXN1cmVtZW50cyhiaW9tYXNzQ2FsY3VsYXRpb24pO1xuXG4gICAgICAgICAgICAvLyBJdGVyYXRlIG92ZXIgbGluZXMuXG4gICAgICAgICAgICAkLmVhY2goRURERGF0YS5MaW5lcywgKGxpbmVJZDpzdHJpbmcsIGxpbmU6TGluZVJlY29yZCk6dm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIG91dDpMaW5lRGF0YSwgYW55U2FtcGxlc0FkZGVkOmJvb2xlYW4gPSBmYWxzZTtcbiAgICAgICAgICAgICAgICBpZiAoIWxpbmUuYWN0aXZlKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgb3V0ID0gbmV3IExpbmVEYXRhKGxpbmUuaWQpO1xuICAgICAgICAgICAgICAgIHRoaXMuX3ZhbGlkQXNzYXlzQnlMaW5lSURbbGluZS5pZF0uZm9yRWFjaCgoYXNzYXlJZDpudW1iZXIpOnZvaWQgPT4ge1xuICAgICAgICAgICAgICAgICAgICB2YXIgYXNzYXk6QXNzYXlSZWNvcmQgPSBFREREYXRhLkFzc2F5c1thc3NheUlkXSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHByb3RvY29sOmFueSA9IEVERERhdGEuUHJvdG9jb2xzW2Fzc2F5LnBpZF0sXG4gICAgICAgICAgICAgICAgICAgICAgICBuYW1lOnN0cmluZyA9IFtsaW5lLm5hbWUsIHByb3RvY29sLm5hbWUsIGFzc2F5Lm5hbWVdLmpvaW4oJy0nKSxcbiAgICAgICAgICAgICAgICAgICAgICAgIG91dEFzc2F5OkFzc2F5RGF0YSA9IG5ldyBBc3NheURhdGEoYXNzYXlJZCksXG4gICAgICAgICAgICAgICAgICAgICAgICB2YWxpZDpudW1iZXIgPSAwO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLl93cml0ZURlYnVnTGluZShsaW5lLmlkID09PSB0aGlzLl9kZWJ1Z0xpbmVJRCwgXCJBc3NheSBcIiArIG5hbWUpO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLl9kZWJ1Z091dHB1dEluZGVudCsrO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLl92YWxpZE1lYXN1cmVtZW50c0J5QXNzYXlJRFthc3NheUlkXS5mb3JFYWNoKChtZWFzdXJlSWQ6bnVtYmVyKTp2b2lkID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciBtZWFzdXJlOkFzc2F5TWVhc3VyZW1lbnRSZWNvcmQgPSBFREREYXRhLkFzc2F5TWVhc3VyZW1lbnRzW21lYXN1cmVJZF0sXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGltZWxpbmU6TWV0YWJvbGl0ZVRpbWVsaW5lO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCF0aGlzLl9kb2VzTWVhc3VyZW1lbnRDb250YWluQ2FyYm9uKG1lYXN1cmUpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fd3JpdGVEZWJ1Z0xpbmUobGluZS5pZCA9PT0gdGhpcy5fZGVidWdMaW5lSUQsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgRURERGF0YS5NZXRhYm9saXRlVHlwZXNbbWVhc3VyZS50eXBlXS5uYW1lKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX2RlYnVnT3V0cHV0SW5kZW50Kys7XG4gICAgICAgICAgICAgICAgICAgICAgICB2YWxpZCsrO1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gQ3JlYXRlIE1ldGFib2xpdGVUaW1lbGluZSBvdXRwdXQgc3RydWN0dXJlXG4gICAgICAgICAgICAgICAgICAgICAgICB0aW1lbGluZSA9IG5ldyBNZXRhYm9saXRlVGltZWxpbmUob3V0QXNzYXksIG1lYXN1cmVJZCk7XG4gICAgICAgICAgICAgICAgICAgICAgICBvdXRBc3NheS50aW1lbGluZXNCeU1lYXN1cmVtZW50SWRbbWVhc3VyZUlkXSA9IHRpbWVsaW5lO1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gQnVpbGQgYSBzb3J0ZWQgbGlzdCBvZiB0aW1lc3RhbXAvbWVhc3VyZW1lbnRcbiAgICAgICAgICAgICAgICAgICAgICAgIHRpbWVsaW5lLnRpbWVTYW1wbGVzID0gdGhpcy5fYnVpbGRTb3J0ZWRNZWFzdXJlbWVudHNGb3JBc3NheU1ldGFib2xpdGUoXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgb3V0LCBtZWFzdXJlSWQsIGludGVncmFsc0J5TWVhc3VyZW1lbnRJRCwgYmlvbWFzc0NhbGN1bGF0aW9uKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIEtlZXAgdHJhY2sgb2YgdGhlIGxhc3Qgc2FtcGxlJ3MgdGltZVxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHRpbWVsaW5lLnRpbWVTYW1wbGVzKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYW55U2FtcGxlc0FkZGVkID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmxhc3RUaW1lSW5TZWNvbmRzID0gTWF0aC5tYXgodGhpcy5sYXN0VGltZUluU2Vjb25kcyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGltZWxpbmUudGltZVNhbXBsZXMuc2xpY2UoLTEpWzBdLnRpbWVTdGFtcCk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl93cml0ZURlYnVnTGluZShsaW5lLmlkID09PSB0aGlzLl9kZWJ1Z0xpbmVJRCwgXCJcIik7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9kZWJ1Z091dHB1dEluZGVudC0tO1xuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgLy8gc3RvcmUgdGhlIGFzc2F5XG4gICAgICAgICAgICAgICAgICAgIG91dC5hc3NheXNCeUlEW2Fzc2F5SWRdID0gb3V0QXNzYXk7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX3dyaXRlRGVidWdMaW5lKGxpbmUuaWQgPT09IHRoaXMuX2RlYnVnTGluZUlELCBcIlwiKTtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fZGVidWdPdXRwdXRJbmRlbnQtLTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICBpZiAoYW55U2FtcGxlc0FkZGVkKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMubGluZURhdGFCeUlEW2xpbmUuaWRdID0gb3V0O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgIH1cblxuXG4gICAgICAgIC8vIEFwcGVuZCB0aGUgc3RyaW5nIHRvIG91ciBfZGVidWdPdXRwdXQgc3RyaW5nIGlmIHNob3VsZFdyaXRlPXRydWUuXG4gICAgICAgIC8vIChIYXZpbmcgc2hvdWxkV3JpdGUgdGhlcmUgbWFrZXMgaXQgZWFzaWVyIHRvIGRvIGEgb25lLWxpbmUgZGVidWcgb3V0cHV0IHRoYXQgaW5jbHVkZXNcbiAgICAgICAgLy8gdGhlIGNoZWNrIG9mIHdoZXRoZXIgaXQgc2hvdWxkIHdyaXRlKS5cbiAgICAgICAgcHJpdmF0ZSBfd3JpdGVEZWJ1Z0xpbmUoc2hvdWxkV3JpdGU6Ym9vbGVhbiwgdmFsOnN0cmluZyk6dm9pZCB7XG4gICAgICAgICAgICBpZiAoIXNob3VsZFdyaXRlKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdmFyIGluZGVudDpzdHJpbmdbXSA9IFtdO1xuICAgICAgICAgICAgLy8ga2VlcCBhZGRpbmcgaW5kZW50cyB1bnRpbCByZWFjaCBsZW5ndGggb2YgX2RlYnVnT3V0cHV0SW5kZW50XG4gICAgICAgICAgICAvKiB0c2xpbnQ6ZGlzYWJsZTpjdXJseSAqL1xuICAgICAgICAgICAgd2hpbGUgKHRoaXMuX2RlYnVnT3V0cHV0SW5kZW50ICYmIHRoaXMuX2RlYnVnT3V0cHV0SW5kZW50ID4gaW5kZW50LnB1c2goJyAgICAnKSk7XG4gICAgICAgICAgICAvKiB0c2xpbnQ6ZW5hYmxlOmN1cmx5ICovXG4gICAgICAgICAgICB0aGlzLl9kZWJ1Z091dHB1dCArPSBpbmRlbnQuam9pbignJykgKyB2YWwgKyBcIlxcblwiO1xuICAgICAgICB9XG5cblxuICAgICAgICBwcml2YXRlIF93cml0ZURlYnVnTGluZVdpdGhIZWFkZXIoc2hvdWxkV3JpdGU6Ym9vbGVhbiwgaGVhZGVyOnN0cmluZywgdmFsOnN0cmluZyk6dm9pZCB7XG4gICAgICAgICAgICB2YXIgc3RyOnN0cmluZyA9IFV0bC5KUy5wYWRTdHJpbmdMZWZ0KFwiW1wiICsgaGVhZGVyICsgXCJdIFwiLCAzMCk7XG4gICAgICAgICAgICB0aGlzLl93cml0ZURlYnVnTGluZShzaG91bGRXcml0ZSwgc3RyICsgdmFsKTtcbiAgICAgICAgfVxuXG5cbiAgICAgICAgLy8gQ29udmVydCBhIG51bWJlciB0byBhIHN0cmluZyBmb3IgZGVidWcgb3V0cHV0LiBJZiBhbGwgdGhlIGNvZGUgdXNlcyB0aGlzLCB0aGVuXG4gICAgICAgIC8vIGFsbCB0aGUgbnVtYmVyIGZvcm1hdHRpbmcgd2lsbCBiZSBjb25zaXN0ZW50LlxuICAgICAgICBwcml2YXRlIF9udW1TdHIodmFsdWU6YW55KTpzdHJpbmcge1xuICAgICAgICAgICAgcmV0dXJuIHBhcnNlRmxvYXQodmFsdWUpLnRvRml4ZWQoNSk7XG4gICAgICAgIH1cblxuXG4gICAgICAgIC8vIFRoaXMgaXMgdXNlZCBpbiBhIGZpcnN0IHBhc3Mgb24gYSBtZWFzdXJlbWVudCB0byBkZWNpZGUgaWYgd2Ugc2hvdWxkIHNjYW4gaXRzXG4gICAgICAgIC8vIG1lYXN1cmVtZW50cy4gSWYgeW91IHVwZGF0ZSB0aGlzLCB1cGRhdGUgY2FsY3VsYXRlQ21vbFBlckxpdGVyIChhbmQgdmljZS12ZXJzYSkuXG4gICAgICAgIHByaXZhdGUgX2RvZXNNZWFzdXJlbWVudENvbnRhaW5DYXJib24obWVhc3VyZTpBc3NheU1lYXN1cmVtZW50UmVjb3JkKTpib29sZWFuIHtcbiAgICAgICAgICAgIHZhciBtdHlwZTpNZXRhYm9saXRlVHlwZVJlY29yZCA9IEVERERhdGEuTWV0YWJvbGl0ZVR5cGVzW21lYXN1cmUudHlwZV07XG4gICAgICAgICAgICBpZiAoIW10eXBlKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBPRCBtZWFzdXJlbWVudHMgdXNlIHRoZSBiaW9tYXNzIGZhY3RvciB0byBlc3RpbWF0ZSB0aGUgYW1vdW50IG9mIGNhcmJvbiBjcmVhdGVkXG4gICAgICAgICAgICAvLyBvciBkZXN0cm95ZWQuIFRoZXJlJ3Mgbm8gZ3VhcmFudGVlIHdlIGhhZSBhIHZhbGlkIGJpb21hc3MgZmFjdG9yLCBidXQgd2UgZGVmaW5pdGVseVxuICAgICAgICAgICAgLy8ga25vdyB0aGVyZSBpcyBjYXJib24gaGVyZS5cbiAgICAgICAgICAgIGlmICh0aGlzLl9pc09wdGljYWxEZW5zaXR5TWVhc3VyZW1lbnQobXR5cGUpKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB2YXIgdVJlY29yZDphbnkgPSBFREREYXRhLlVuaXRUeXBlc1ttZWFzdXJlLnlfdW5pdHNdO1xuICAgICAgICAgICAgdmFyIHVuaXRzOnN0cmluZyA9IHVSZWNvcmQgPyB1UmVjb3JkLm5hbWUgOiAnJztcbiAgICAgICAgICAgIHZhciBjYXJib25Db3VudDpudW1iZXIgPSBtdHlwZS5jYzsgLy8gIyBjYXJib25zIHBlciBtb2xlXG5cbiAgICAgICAgICAgIGlmICh1bml0cyA9PT0gJycgfHwgdW5pdHMgPT09ICduL2EnIHx8ICFjYXJib25Db3VudCkge1xuICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAodW5pdHMgPT09ICdnL0wnKSB7XG4gICAgICAgICAgICAgICAgLy8gZy9MIGlzIGZpbmUgaWYgd2UgaGF2ZSBhIG1vbGFyIG1hc3Mgc28gd2UgY2FuIGNvbnZlcnQgZy0+bW9sXG4gICAgICAgICAgICAgICAgcmV0dXJuICEhbXR5cGUubW07XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIC8vIEFueXRoaW5nIHVzaW5nIG1vbHMgaXMgZmluZSBhcyB3ZWxsLlxuICAgICAgICAgICAgICAgIHJldHVybiAodW5pdHMgPT09ICdtb2wvTC9ocicgfHxcbiAgICAgICAgICAgICAgICAgICAgdW5pdHMgPT09ICd1TScgfHxcbiAgICAgICAgICAgICAgICAgICAgdW5pdHMgPT09ICdtTScgfHxcbiAgICAgICAgICAgICAgICAgICAgdW5pdHMgPT09ICdtb2wvTCcgfHxcbiAgICAgICAgICAgICAgICAgICAgdW5pdHMgPT09ICdDbW9sL0wnKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIERvIHVuaXQgY29udmVyc2lvbnMgaW4gb3JkZXIgdG8gZ2V0IGEgQ21vbC9MIHZhbHVlLlxuICAgICAgICAvLyAqKiBOT1RFOiBUaGlzIGlzIFwiQy1tb2xlc1wiLCB3aGljaCBpcyBDQVJCT04gbW9sL0wgKGFzIG9wcG9zZWQgdG8gQ0VOVEkgbW9sL0wpLlxuICAgICAgICBwcml2YXRlIF9jYWxjdWxhdGVDbU1vbFBlckxpdGVyKG1lYXN1cmVtZW50SUQ6bnVtYmVyLFxuICAgICAgICAgICAgICAgIHRpbWVTdGFtcDpudW1iZXIsXG4gICAgICAgICAgICAgICAgaW50ZWdyYWxzQnlNZWFzdXJlbWVudElEOkludGVncmFsTG9va3VwLFxuICAgICAgICAgICAgICAgIGJpb21hc3NDYWxjdWxhdGlvbjpudW1iZXIsXG4gICAgICAgICAgICAgICAgZE91dDpib29sZWFuKTpWYWxpZGF0ZWRWYWx1ZSB7XG4gICAgICAgICAgICAvLyBBIG1lYXN1cmVtZW50IGlzIHRoZSB0aW1lIHNlcmllcyBkYXRhIGZvciBPTkUgbWV0YWJvbGl0ZVxuICAgICAgICAgICAgLy8gbWVhc3VyZW1lbnQudmFsdWVzIGNvbnRhaW5zIGFsbCB0aGUgbWVhdHkgc3R1ZmYgLSBhIDMtZGltZW5zaW9uYWwgYXJyYXkgd2l0aDpcbiAgICAgICAgICAgIC8vIGZpcnN0IGluZGV4IHNlbGVjdGluZyBwb2ludCB2YWx1ZTtcbiAgICAgICAgICAgIC8vIHNlY29uZCBpbmRleCAwIGZvciB4LCAxIGZvciB5O1xuICAgICAgICAgICAgLy8gdGhpcmQgaW5kZXggc3Vic2NyaXB0ZWQgdmFsdWVzO1xuICAgICAgICAgICAgLy8gZS5nLiBtZWFzdXJlbWVudC52YWx1ZXNbMl1bMF1bMV0gaXMgdGhlIHgxIHZhbHVlIG9mIHRoZSB0aGlyZCBtZWFzdXJlbWVudCB2YWx1ZVxuICAgICAgICAgICAgdmFyIG1lYXN1cmVtZW50OkFzc2F5TWVhc3VyZW1lbnRSZWNvcmQgPSBFREREYXRhLkFzc2F5TWVhc3VyZW1lbnRzW21lYXN1cmVtZW50SURdLFxuICAgICAgICAgICAgICAgIG1lYXN1cmVtZW50VHlwZTpNZXRhYm9saXRlVHlwZVJlY29yZCA9IEVERERhdGEuTWV0YWJvbGl0ZVR5cGVzW21lYXN1cmVtZW50LnR5cGVdLFxuICAgICAgICAgICAgICAgIHVSZWNvcmQ6VW5pdFR5cGUgPSBFREREYXRhLlVuaXRUeXBlc1ttZWFzdXJlbWVudC55X3VuaXRzXSxcbiAgICAgICAgICAgICAgICB1bml0czpzdHJpbmcgPSB1UmVjb3JkID8gdVJlY29yZC5uYW1lIDogJycsXG4gICAgICAgICAgICAgICAgY2FyYm9uQ291bnQ6bnVtYmVyID0gbWVhc3VyZW1lbnRUeXBlLmNjLCAvLyAjIGNhcmJvbnMgcGVyIG1vbGVcbiAgICAgICAgICAgICAgICBmaW5hbFZhbHVlOm51bWJlciA9IDAsXG4gICAgICAgICAgICAgICAgaXNWYWxpZDpib29sZWFuID0gZmFsc2UsXG4gICAgICAgICAgICAgICAgaXNPcHRpY2FsRGVuc2l0eTpib29sZWFuID0gdGhpcy5faXNPcHRpY2FsRGVuc2l0eU1lYXN1cmVtZW50KG1lYXN1cmVtZW50VHlwZSksXG4gICAgICAgICAgICAgICAgdmFsdWU6bnVtYmVyID0gdGhpcy5fYXNzYXlNZWFzdXJlbWVudERhdGFCeUlEW21lYXN1cmVtZW50SURdW3RpbWVTdGFtcF07XG5cbiAgICAgICAgICAgIC8vIEZpcnN0LCBpcyB0aGlzIG1lYXN1cmVtZW50IHNvbWV0aGluZyB0aGF0IHdlIGNhcmUgYWJvdXQ/XG4gICAgICAgICAgICAvL1xuICAgICAgICAgICAgLy8gV2UnbGwgdGhyb3cgb3V0IGFueXRoaW5nIHRoYXQgaGFzIG11bHRpcGxlIG51bWJlcnMgcGVyIHNhbXBsZS4gUmlnaHQgbm93LCB3ZSdyZVxuICAgICAgICAgICAgLy8gb25seSBoYW5kbGluZyBvbmUtZGltZW5zaW9uYWwgbnVtZXJpYyBzYW1wbGVzLlxuICAgICAgICAgICAgLy9cbiAgICAgICAgICAgIC8vIFdlJ2xsIGFsc28gdGhyb3cgb3V0IGFueXRoaW5nIHdpdGhvdXQgYSBjYXJib24gY291bnQsIGxpa2UgQ08yL08yIHJhdGlvcy5cbiAgICAgICAgICAgIGlmIChpc09wdGljYWxEZW5zaXR5KSB7XG4gICAgICAgICAgICAgICAgLy8gT0Qgd2lsbCBiZSB1c2VkIGRpcmVjdGx5IGluIF9jYWxjdWxhdGVDYXJib25EZWx0YXMgdG8gZ2V0IGEgZ3Jvd3RoIHJhdGUuXG4gICAgICAgICAgICAgICAgZmluYWxWYWx1ZSA9IHZhbHVlO1xuICAgICAgICAgICAgICAgIGlzVmFsaWQgPSB0cnVlO1xuICAgICAgICAgICAgfSBlbHNlIGlmICh1bml0cyA9PT0gJ21vbC9ML2hyJykge1xuICAgICAgICAgICAgICAgIHZhciBpbnRlZ3JhbHM6SW50ZWdyYWwgPSBpbnRlZ3JhbHNCeU1lYXN1cmVtZW50SURbbWVhc3VyZW1lbnRJRF07XG4gICAgICAgICAgICAgICAgaWYgKGludGVncmFscykge1xuICAgICAgICAgICAgICAgICAgICBmaW5hbFZhbHVlID0gaW50ZWdyYWxzW3RpbWVTdGFtcF0gKiAxMDAwO1xuICAgICAgICAgICAgICAgICAgICBpc1ZhbGlkID0gKHR5cGVvZiBmaW5hbFZhbHVlICE9PSAndW5kZWZpbmVkJyk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIGlmICh1bml0cyA9PT0gJycgfHwgdW5pdHMgPT09ICduL2EnIHx8ICFjYXJib25Db3VudCkge1xuICAgICAgICAgICAgICAgIC8vIGlzVmFsaWQgd2lsbCBzdGF5IGZhbHNlLlxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAvLyBDaGVjayBmb3IgdmFyaW91cyBjb252ZXJzaW9ucyB0aGF0IHdlIG1pZ2h0IG5lZWQgdG8gZG8uXG4gICAgICAgICAgICAgICAgaWYgKGRPdXQpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fd3JpdGVEZWJ1Z0xpbmUodHJ1ZSwgdGltZVN0YW1wICsgXCJoXCIpO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLl9kZWJ1Z091dHB1dEluZGVudCsrO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLl93cml0ZURlYnVnTGluZVdpdGhIZWFkZXIodHJ1ZSwgXCJyYXcgdmFsdWVcIixcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX251bVN0cih2YWx1ZSkgKyBcIiBcIiArIHVuaXRzKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYgKHZhbHVlID09PSAwKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIERvbid0IGJvdGhlciB3aXRoIGFsbCB0aGlzIHdvcmsgKGFuZCBkZWJ1ZyBvdXRwdXQpIGlmIHRoZSB2YWx1ZSBpcyAwLlxuICAgICAgICAgICAgICAgICAgICBmaW5hbFZhbHVlID0gdmFsdWU7XG4gICAgICAgICAgICAgICAgICAgIGlzVmFsaWQgPSB0cnVlO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAodHlwZW9mIHZhbHVlICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgICAgICAgICAgICAgICAvLyBDb252ZXJ0IHVNIHRvIG1vbC9MLiBOb3RlOiBldmVuIHRob3VnaCBpdCdzIG5vdCB3cml0dGVuIGFzIHVNL0wsIHRoZXNlXG4gICAgICAgICAgICAgICAgICAgIC8vIHF1YW50aXRpZXMgc2hvdWxkIGJlIHRyZWF0ZWQgYXMgcGVyLWxpdGVyLlxuICAgICAgICAgICAgICAgICAgICBpZiAodW5pdHMgPT09ICd1TScpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhbHVlID0gdmFsdWUgLyAxMDAwO1xuICAgICAgICAgICAgICAgICAgICAgICAgdW5pdHMgPSAnbU1vbC9MJztcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX3dyaXRlRGVidWdMaW5lV2l0aEhlYWRlcihkT3V0LCBcImNvbnZlcnRcIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBcIiAvIDEwMDAgPSBcIiArIHRoaXMuX251bVN0cih2YWx1ZSkgKyBcIiBtb2wvTFwiKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAvLyBEbyBtb2xhciBtYXNzIGNvbnZlcnNpb25zLlxuICAgICAgICAgICAgICAgICAgICBpZiAodW5pdHMgPT09ICdnL0wnKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoIW1lYXN1cmVtZW50VHlwZS5tbSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIFdlIHNob3VsZCBuZXZlciBnZXQgaW4gaGVyZS5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl93cml0ZURlYnVnTGluZShkT3V0LCBcIlRyeWluZyB0byBjYWxjdWxhdGUgY2FyYm9uIGZvciBhIGcvTCBcIiArXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwibWV0YWJvbGl0ZSB3aXRoIGFuIHVuc3BlY2lmaWVkIG1vbGFyIG1hc3MhIFwiICtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCIoVGhlIGNvZGUgc2hvdWxkIG5ldmVyIGdldCBoZXJlKS5cIik7XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIChnL0wpICogKG1vbC9nKSA9IChtb2wvTClcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YWx1ZSA9IHZhbHVlICogMTAwMCAvIG1lYXN1cmVtZW50VHlwZS5tbTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl93cml0ZURlYnVnTGluZVdpdGhIZWFkZXIoZE91dCwgXCJkaXZpZGUgYnkgbW9sYXIgbWFzc1wiLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBbIFwiICogMTAwMCAvXCIsIG1lYXN1cmVtZW50VHlwZS5tbSwgXCJnL21vbCA9XCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX251bVN0cih2YWx1ZSksIFwibU1vbC9MXCIgXS5qb2luKCcgJykpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHVuaXRzID0gJ21Nb2wvTCc7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgLy8gQ29udmVydCBtTW9sL0wgdG8gQ21Nb2wvTC5cbiAgICAgICAgICAgICAgICAgICAgLy8gKiogTk9URTogVGhpcyBpcyBcIkMtbW9sZXNcIiwgd2hpY2ggaXMgQ0FSQk9OIG1vbC9MXG4gICAgICAgICAgICAgICAgICAgIC8vIChhcyBvcHBvc2VkIHRvIENFTlRJIG1vbC9MKS5cbiAgICAgICAgICAgICAgICAgICAgaWYgKHVuaXRzID09PSAnbU1vbC9MJykge1xuICAgICAgICAgICAgICAgICAgICAgICAgdmFsdWUgKj0gY2FyYm9uQ291bnQ7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl93cml0ZURlYnVnTGluZVdpdGhIZWFkZXIoZE91dCwgXCJtdWx0aXBseSBieSBjYXJib24gY291bnRcIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBcIiAqIFwiICsgY2FyYm9uQ291bnQgKyBcIiA9IFwiICsgdGhpcy5fbnVtU3RyKHZhbHVlKSArIFwiIENtTW9sL0xcIik7XG4gICAgICAgICAgICAgICAgICAgICAgICB1bml0cyA9ICdDbU1vbC9MJztcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAvLyBBcmUgd2UgaW4gb3VyIGRlc2lyZWQgb3V0cHV0IGZvcm1hdCAoQ21vbC9MKT9cbiAgICAgICAgICAgICAgICAgICAgaWYgKHVuaXRzID09PSAnQ21Nb2wvTCcpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICBmaW5hbFZhbHVlID0gdmFsdWU7XG4gICAgICAgICAgICAgICAgICAgICAgICAgaXNWYWxpZCA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYgKGRPdXQpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fZGVidWdPdXRwdXRJbmRlbnQtLTtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fd3JpdGVEZWJ1Z0xpbmUodHJ1ZSwgXCJcIik7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy8gUmV0dXJuIGEgcmVzdWx0LlxuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBpc1ZhbGlkOiBpc1ZhbGlkLFxuICAgICAgICAgICAgICAgIHZhbHVlOiBmaW5hbFZhbHVlXG4gICAgICAgICAgICB9O1xuICAgICAgICB9XG5cblxuICAgICAgICBwcml2YXRlIF9pc09wdGljYWxEZW5zaXR5TWVhc3VyZW1lbnQobWVhc3VyZW1lbnRUeXBlOk1lYXN1cmVtZW50VHlwZVJlY29yZCk6Ym9vbGVhbiB7XG4gICAgICAgICAgICByZXR1cm4gbWVhc3VyZW1lbnRUeXBlLm5hbWUgPT09ICdPcHRpY2FsIERlbnNpdHknO1xuICAgICAgICB9XG5cblxuICAgICAgICAvLyBSZXR1cm5zIGEgaGFzaCBvZiBhc3NheU1lYXN1cmVtZW50SUQtPnt0aW1lLT5pbnRlZ3JhbH0gZm9yIGFueSBtb2wvTC9ociBtZWFzdXJlbWVudHMuXG4gICAgICAgIHByaXZhdGUgX2ludGVncmF0ZUFzc2F5TWVhc3VyZW1lbnRzKGJpb21hc3NDYWxjdWxhdGlvbjpudW1iZXIpOkludGVncmFsTG9va3VwIHtcbiAgICAgICAgICAgIHZhciBpbnRlZ3JhbHNCeU1lYXN1cmVtZW50SUQ6SW50ZWdyYWxMb29rdXAgPSB7fTtcblxuICAgICAgICAgICAgJC5lYWNoKEVERERhdGEuQXNzYXlNZWFzdXJlbWVudHMsXG4gICAgICAgICAgICAgICAgICAgIChtZWFzdXJlSWQ6bnVtYmVyLCBtZWFzdXJlOkFzc2F5TWVhc3VyZW1lbnRSZWNvcmQpOnZvaWQgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBtdHlwZTpNZXRhYm9saXRlVHlwZVJlY29yZCA9IEVERERhdGEuTWV0YWJvbGl0ZVR5cGVzW21lYXN1cmUudHlwZV0sXG4gICAgICAgICAgICAgICAgICAgIGNhcmJvbkNvdW50Om51bWJlcixcbiAgICAgICAgICAgICAgICAgICAgdVJlY29yZDpVbml0VHlwZSxcbiAgICAgICAgICAgICAgICAgICAgdW5pdHM6c3RyaW5nLFxuICAgICAgICAgICAgICAgICAgICBpbnRlZ3JhbDpJbnRlZ3JhbCA9IHt9LFxuICAgICAgICAgICAgICAgICAgICBkYXRhOkludGVncmFsLFxuICAgICAgICAgICAgICAgICAgICBwcmV2VGltZTpudW1iZXIsXG4gICAgICAgICAgICAgICAgICAgIHRvdGFsOm51bWJlcjtcbiAgICAgICAgICAgICAgICBpZiAoIW10eXBlKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY2FyYm9uQ291bnQgPSBtdHlwZS5jYztcbiAgICAgICAgICAgICAgICB1UmVjb3JkID0gRURERGF0YS5Vbml0VHlwZXNbbWVhc3VyZS55X3VuaXRzXTtcbiAgICAgICAgICAgICAgICB1bml0cyA9IHVSZWNvcmQgPyB1UmVjb3JkLm5hbWUgOiAnJztcbiAgICAgICAgICAgICAgICAvLyBTZWUgJ09wdGljYWwgRGVuc2l0eSBOb3RlJyBiZWxvdy5cbiAgICAgICAgICAgICAgICBpZiAodW5pdHMgIT09ICdtb2wvTC9ocicgfHwgIWNhcmJvbkNvdW50KSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaW50ZWdyYWxzQnlNZWFzdXJlbWVudElEW21lYXN1cmVJZF0gPSBpbnRlZ3JhbDtcbiAgICAgICAgICAgICAgICAvLyBzdW0gb3ZlciBhbGwgZGF0YVxuICAgICAgICAgICAgICAgIGRhdGEgPSB0aGlzLl9hc3NheU1lYXN1cmVtZW50RGF0YUJ5SURbbWVhc3VyZUlkXTtcbiAgICAgICAgICAgICAgICB0b3RhbCA9IDA7XG4gICAgICAgICAgICAgICAgdGhpcy5fZ2V0TWVhc3VyZW1lbnRUaW1lc3RhbXBzU29ydGVkKG1lYXN1cmVJZCkuZm9yRWFjaCgodGltZTpudW1iZXIpOnZvaWQgPT4ge1xuICAgICAgICAgICAgICAgICAgICB2YXIgdmFsdWU6bnVtYmVyID0gZGF0YVt0aW1lXSwgZHQ6bnVtYmVyO1xuICAgICAgICAgICAgICAgICAgICBpZiAoIXByZXZUaW1lKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBwcmV2VGltZSA9IHRpbWU7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgZHQgPSB0aW1lIC0gcHJldlRpbWU7XG4gICAgICAgICAgICAgICAgICAgIC8vIFRPRE8gc2hvdWxkIHZhbHVlIGJlbG93IGJlIGR2ID0gZGF0YVt0aW1lXSAtIGRhdGFbcHJldlRpbWVdID8/XG4gICAgICAgICAgICAgICAgICAgIHRvdGFsICs9IGR0ICogdmFsdWUgKiBjYXJib25Db3VudDtcbiAgICAgICAgICAgICAgICAgICAgaW50ZWdyYWxbdGltZV0gPSB0b3RhbDtcbiAgICAgICAgICAgICAgICAgICAgcHJldlRpbWUgPSB0aW1lO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICByZXR1cm4gaW50ZWdyYWxzQnlNZWFzdXJlbWVudElEO1xuICAgICAgICB9XG5cblxuICAgICAgICAvLyBSZXR1cm5zIGFuIGFycmF5IG9mIHRpbWVzdGFtcHMgZm9yIHRoaXMgYXNzYXkgc29ydGVkIGJ5IHRpbWUuXG4gICAgICAgIHByaXZhdGUgX2dldE1lYXN1cmVtZW50VGltZXN0YW1wc1NvcnRlZChtZWFzdXJlbWVudElEOm51bWJlcik6bnVtYmVyW10ge1xuICAgICAgICAgICAgdmFyIGRhdGE6SW50ZWdyYWwgPSB0aGlzLl9hc3NheU1lYXN1cmVtZW50RGF0YUJ5SURbbWVhc3VyZW1lbnRJRF07XG4gICAgICAgICAgICBpZiAoIWRhdGEpIHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZygnV2FybmluZzogTm8gc29ydGVkIHRpbWVzdGFtcCBhcnJheSBmb3IgbWVhc3VyZW1lbnQgJyArIG1lYXN1cmVtZW50SUQpO1xuICAgICAgICAgICAgICAgIHJldHVybiBbXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIC8vIGpRdWVyeSBtYXAgZ2l2ZXMgb2JqZWN0IGluZGV4ZXMgYXMgc3RyaW5nLCBzbyBuZWVkIHRvIHBhcnNlRmxvYXQgYmVmb3JlIHNvcnRpbmdcbiAgICAgICAgICAgIHJldHVybiAkLm1hcChkYXRhLCAodmFsdWU6bnVtYmVyLCB0aW1lOnN0cmluZyk6bnVtYmVyID0+IHBhcnNlRmxvYXQodGltZSkpLnNvcnQoKTtcbiAgICAgICAgfVxuXG5cbiAgICAgICAgLy8gR28gdGhyb3VnaCBhbGwgbWVhc3VyZW1lbnRzIGluIHRoaXMgbWV0YWJvbGl0ZSwgZmlndXJlIG91dCB0aGUgY2FyYm9uIGNvdW50LCBhbmQgXG4gICAgICAgIC8vIHJldHVybiBhIHNvcnRlZCBsaXN0IG9mIHt0aW1lU3RhbXAsIHZhbHVlfSBvYmplY3RzLiB2YWx1ZXMgYXJlIGluIENtb2wvTC5cbiAgICAgICAgcHJpdmF0ZSBfYnVpbGRTb3J0ZWRNZWFzdXJlbWVudHNGb3JBc3NheU1ldGFib2xpdGUobGluZTpMaW5lRGF0YSxcbiAgICAgICAgICAgICAgICBtZWFzdXJlbWVudElEOm51bWJlcixcbiAgICAgICAgICAgICAgICBpbnRlZ3JhbHNCeU1lYXN1cmVtZW50SUQ6SW50ZWdyYWxMb29rdXAsXG4gICAgICAgICAgICAgICAgYmlvbWFzc0NhbGN1bGF0aW9uOm51bWJlcik6VGltZVNhbXBsZVtdIHtcbiAgICAgICAgICAgIHZhciBtZWFzdXJlbWVudDpBc3NheU1lYXN1cmVtZW50UmVjb3JkID0gRURERGF0YS5Bc3NheU1lYXN1cmVtZW50c1ttZWFzdXJlbWVudElEXSxcbiAgICAgICAgICAgICAgICBzb3J0ZWRNZWFzdXJlbWVudHM6VGltZVNhbXBsZVtdID0gW107XG5cbiAgICAgICAgICAgIHRoaXMuX2dldE1lYXN1cmVtZW50VGltZXN0YW1wc1NvcnRlZChtZWFzdXJlbWVudElEKS5mb3JFYWNoKFxuICAgICAgICAgICAgICAgICAgICAodGltZTpudW1iZXIsIGk6bnVtYmVyLCBhOm51bWJlcltdKTp2b2lkID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgd3JpdGVEZWJ1Z091dHB1dDpib29sZWFuID0gZmFsc2UsXG4gICAgICAgICAgICAgICAgICAgIHJlc3VsdDpWYWxpZGF0ZWRWYWx1ZSxcbiAgICAgICAgICAgICAgICAgICAgc2FtcGxlOlRpbWVTYW1wbGU7XG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuX2RlYnVnVGltZVN0YW1wICYmIGxpbmUuZ2V0TGluZUlEKCkgPT09IHRoaXMuX2RlYnVnTGluZUlEKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIGRlYnVnIGlmIGN1cnJlbnQgT1IgbmV4dCB0aW1lIGlzIHRoZSBkZWJ1ZyB0aW1lXG4gICAgICAgICAgICAgICAgICAgIGlmICh0aW1lID09PSB0aGlzLl9kZWJ1Z1RpbWVTdGFtcCB8fFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIChpICsgMSA8IGEubGVuZ3RoICYmIGFbaSArIDFdID09PSB0aGlzLl9kZWJ1Z1RpbWVTdGFtcCkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHdyaXRlRGVidWdPdXRwdXQgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJlc3VsdCA9IHRoaXMuX2NhbGN1bGF0ZUNtTW9sUGVyTGl0ZXIobWVhc3VyZW1lbnRJRCwgdGltZSxcbiAgICAgICAgICAgICAgICAgICAgaW50ZWdyYWxzQnlNZWFzdXJlbWVudElELCBiaW9tYXNzQ2FsY3VsYXRpb24sIHdyaXRlRGVidWdPdXRwdXQpO1xuICAgICAgICAgICAgICAgIGlmICghcmVzdWx0LmlzVmFsaWQpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBzYW1wbGUgPSBuZXcgVGltZVNhbXBsZSgpO1xuICAgICAgICAgICAgICAgIHNhbXBsZS50aW1lU3RhbXAgPSB0aW1lO1xuICAgICAgICAgICAgICAgIHNhbXBsZS5jYXJib25WYWx1ZSA9IHJlc3VsdC52YWx1ZTtcbiAgICAgICAgICAgICAgICBzb3J0ZWRNZWFzdXJlbWVudHMucHVzaChzYW1wbGUpO1xuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9jYWxjdWxhdGVDYXJib25EZWx0YXMoc29ydGVkTWVhc3VyZW1lbnRzLCBsaW5lLCBtZWFzdXJlbWVudCxcbiAgICAgICAgICAgICAgICBiaW9tYXNzQ2FsY3VsYXRpb24pO1xuICAgICAgICB9XG5cblxuICAgICAgICAvLyBHbyB0aHJvdWdoIHRoZSBUaW1lU2FtcGxlcyBhbmQgY2FsY3VsYXRlIHRoZWlyIGNhcmJvbkRlbHRhIHZhbHVlLlxuICAgICAgICBwcml2YXRlIF9jYWxjdWxhdGVDYXJib25EZWx0YXMoc29ydGVkTWVhc3VyZW1lbnRzOlRpbWVTYW1wbGVbXSxcbiAgICAgICAgICAgICAgICBsaW5lOkxpbmVEYXRhLFxuICAgICAgICAgICAgICAgIG1lYXN1cmVtZW50OkFzc2F5TWVhc3VyZW1lbnRSZWNvcmQsXG4gICAgICAgICAgICAgICAgYmlvbWFzc0NhbGN1bGF0aW9uOm51bWJlcik6VGltZVNhbXBsZVtdIHtcbiAgICAgICAgICAgIHZhciBtdHlwZTpNZXRhYm9saXRlVHlwZVJlY29yZCA9IEVERERhdGEuTWV0YWJvbGl0ZVR5cGVzW21lYXN1cmVtZW50LnR5cGVdLFxuICAgICAgICAgICAgICAgIGlzT3B0aWNhbERlbnNpdHk6Ym9vbGVhbiA9IHRoaXMuX2lzT3B0aWNhbERlbnNpdHlNZWFzdXJlbWVudChtdHlwZSksXG4gICAgICAgICAgICAgICAgYXNzYXk6QXNzYXlSZWNvcmQgPSBFREREYXRhLkFzc2F5c1ttZWFzdXJlbWVudC5hc3NheV0sXG4gICAgICAgICAgICAgICAgbGluZVJlYzpMaW5lUmVjb3JkID0gRURERGF0YS5MaW5lc1thc3NheS5saWRdLFxuICAgICAgICAgICAgICAgIHByb3RvY29sOmFueSA9IEVERERhdGEuUHJvdG9jb2xzW2Fzc2F5LnBpZF0sXG4gICAgICAgICAgICAgICAgbmFtZTpzdHJpbmcgPSBbbGluZVJlYy5uYW1lLCBwcm90b2NvbC5uYW1lLCBhc3NheS5uYW1lXS5qb2luKCctJyk7XG5cbiAgICAgICAgICAgIC8vIGxvb3AgZnJvbSBzZWNvbmQgZWxlbWVudCwgYW5kIHVzZSB0aGUgaW5kZXggb2Ygc2hvcnRlciBhcnJheSB0byBnZXQgcHJldmlvdXNcbiAgICAgICAgICAgIHNvcnRlZE1lYXN1cmVtZW50cy5zbGljZSgxKS5mb3JFYWNoKChzYW1wbGU6VGltZVNhbXBsZSwgaTpudW1iZXIpOnZvaWQgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBwcmV2OlRpbWVTYW1wbGUgPSBzb3J0ZWRNZWFzdXJlbWVudHNbaV0sXG4gICAgICAgICAgICAgICAgICAgIGRlbHRhVGltZTpudW1iZXIgPSB0aGlzLl9jYWxjVGltZURlbHRhKHByZXYudGltZVN0YW1wLCBzYW1wbGUudGltZVN0YW1wKSxcbiAgICAgICAgICAgICAgICAgICAgd3JpdGVEZWJ1Z0luZm86Ym9vbGVhbiwgZ3Jvd3RoUmF0ZTpudW1iZXIsIGRlbHRhQ2FyYm9uOm51bWJlcixcbiAgICAgICAgICAgICAgICAgICAgb2RGYWN0b3I6bnVtYmVyLCBjbU1vbFBlckxQZXJIOm51bWJlciwgY21Nb2xQZXJHZHdQZXJIOm51bWJlcjtcblxuICAgICAgICAgICAgICAgIHdyaXRlRGVidWdJbmZvID0gKHRoaXMuX2RlYnVnVGltZVN0YW1wXG4gICAgICAgICAgICAgICAgICAgICYmIGxpbmUuZ2V0TGluZUlEKCkgPT09IHRoaXMuX2RlYnVnTGluZUlEXG4gICAgICAgICAgICAgICAgICAgICYmIHNhbXBsZS50aW1lU3RhbXAgPT09IHRoaXMuX2RlYnVnVGltZVN0YW1wKTtcbiAgICAgICAgICAgICAgICBpZiAoaXNPcHRpY2FsRGVuc2l0eSkge1xuICAgICAgICAgICAgICAgICAgICAvLyBJZiB0aGlzIGlzIHRoZSBPRCBtZWFzdXJlbWVudCwgdGhlbiB3ZSdsbCB1c2UgdGhlIGJpb21hc3MgZmFjdG9yXG4gICAgICAgICAgICAgICAgICAgIGdyb3d0aFJhdGUgPSAoTWF0aC5sb2coc2FtcGxlLmNhcmJvblZhbHVlIC8gcHJldi5jYXJib25WYWx1ZSkgLyBkZWx0YVRpbWUpO1xuICAgICAgICAgICAgICAgICAgICBzYW1wbGUuY2FyYm9uRGVsdGEgPSBiaW9tYXNzQ2FsY3VsYXRpb24gKiBncm93dGhSYXRlO1xuICAgICAgICAgICAgICAgICAgICBpZiAod3JpdGVEZWJ1Z0luZm8pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX3dyaXRlRGVidWdMaW5lKHRydWUsIFwiQmlvbWFzcyBDYWxjdWxhdGlvbiBmb3IgXCIgKyBuYW1lKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX2RlYnVnT3V0cHV0SW5kZW50Kys7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl93cml0ZURlYnVnTGluZVdpdGhIZWFkZXIodHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBcInJhdyBPRCBhdCBcIiArIHByZXYudGltZVN0YW1wICsgXCJoXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fbnVtU3RyKHByZXYuY2FyYm9uVmFsdWUpKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX3dyaXRlRGVidWdMaW5lV2l0aEhlYWRlcih0cnVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwicmF3IE9EIGF0IFwiICsgc2FtcGxlLnRpbWVTdGFtcCArIFwiaFwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX251bVN0cihzYW1wbGUuY2FyYm9uVmFsdWUpKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX3dyaXRlRGVidWdMaW5lV2l0aEhlYWRlcih0cnVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiZ3Jvd3RoIHJhdGVcIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBcImxvZyhcIiArXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX251bVN0cihzYW1wbGUuY2FyYm9uVmFsdWUpICsgXCIgLyBcIiArXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX251bVN0cihwcmV2LmNhcmJvblZhbHVlKSArXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgXCIpIC8gXCIgKyB0aGlzLl9udW1TdHIoZGVsdGFUaW1lKSArIFwiaCA9IFwiICtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9udW1TdHIoZ3Jvd3RoUmF0ZSkpO1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fd3JpdGVEZWJ1Z0xpbmVXaXRoSGVhZGVyKHRydWUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJiaW9tYXNzIGZhY3RvclwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiICogXCIgKyB0aGlzLl9udW1TdHIoYmlvbWFzc0NhbGN1bGF0aW9uKSArIFwiID0gXCIgK1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX251bVN0cihzYW1wbGUuY2FyYm9uRGVsdGEpICsgXCIgQ21Nb2wvZ2R3L2hyXCIpO1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fd3JpdGVEZWJ1Z0xpbmUodHJ1ZSwgXCJcIik7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9kZWJ1Z091dHB1dEluZGVudC0tO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gR2F0aGVyIHRlcm1zLlxuICAgICAgICAgICAgICAgICAgICBkZWx0YUNhcmJvbiA9IChzYW1wbGUuY2FyYm9uVmFsdWUgLSBwcmV2LmNhcmJvblZhbHVlKTtcbiAgICAgICAgICAgICAgICAgICAgb2RGYWN0b3IgPSB0aGlzLl9jYWxjdWxhdGVPcHRpY2FsRGVuc2l0eUZhY3RvcihsaW5lLCBwcmV2LnRpbWVTdGFtcCxcbiAgICAgICAgICAgICAgICAgICAgICAgIHdyaXRlRGVidWdJbmZvKTtcbiAgICAgICAgICAgICAgICAgICAgLy8gQ21Nb2wvTCAtPiBDbU1vbC9ML2hyXG4gICAgICAgICAgICAgICAgICAgIGNtTW9sUGVyTFBlckggPSAoZGVsdGFDYXJib24gLyBkZWx0YVRpbWUpO1xuICAgICAgICAgICAgICAgICAgICAvLyBDbU1vbC9ML2hyICogTC9nZHcgLT4gQ21Nb2wvZ2R3L2hyXG4gICAgICAgICAgICAgICAgICAgIGNtTW9sUGVyR2R3UGVySCA9IGNtTW9sUGVyTFBlckggLyBvZEZhY3RvcjtcbiAgICAgICAgICAgICAgICAgICAgc2FtcGxlLmNhcmJvbkRlbHRhID0gY21Nb2xQZXJHZHdQZXJIO1xuICAgICAgICAgICAgICAgICAgICAvLyBXcml0ZSBzb21lIGRlYnVnIG91dHB1dCBmb3Igd2hhdCB3ZSBqdXN0IGRpZC5cbiAgICAgICAgICAgICAgICAgICAgaWYgKHdyaXRlRGVidWdJbmZvKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl93cml0ZURlYnVnTGluZSh0cnVlLCBcIkNvbnZlcnQgdG8gQ21Nb2wvZ2R3L2hyXCIpO1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fZGVidWdPdXRwdXRJbmRlbnQrKztcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX3dyaXRlRGVidWdMaW5lV2l0aEhlYWRlcih0cnVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiZGVsdGEgZnJvbSBcIiArIHByZXYudGltZVN0YW1wICsgXCJoIHRvIFwiICsgc2FtcGxlLnRpbWVTdGFtcCArIFwiaFwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX251bVN0cihzYW1wbGUuY2FyYm9uVmFsdWUpICsgXCIgQ21Nb2wvTCAtIFwiICtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9udW1TdHIocHJldi5jYXJib25WYWx1ZSkgKyBcIiBDbU1vbC9MID0gXCIgK1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX251bVN0cihkZWx0YUNhcmJvbikgKyBcIiBDbU1vbC9MXCIpO1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fd3JpdGVEZWJ1Z0xpbmVXaXRoSGVhZGVyKHRydWUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJkZWx0YSB0aW1lXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgXCIgLyBcIiArIHRoaXMuX251bVN0cihkZWx0YVRpbWUpICsgXCJoID0gXCIgK1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX251bVN0cihjbU1vbFBlckxQZXJIKSArIFwiIENtTW9sL0wvaFwiKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX3dyaXRlRGVidWdMaW5lV2l0aEhlYWRlcih0cnVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiYXBwbHkgT0RcIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBcIiAvIFwiICsgdGhpcy5fbnVtU3RyKG9kRmFjdG9yKSArIFwiIEwvZ2R3ID0gXCIgK1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX251bVN0cihjbU1vbFBlckdkd1BlckgpICsgXCIgQ21Nb2wvZ2R3L2hcIik7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9kZWJ1Z091dHB1dEluZGVudC0tO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIHJldHVybiBzb3J0ZWRNZWFzdXJlbWVudHM7XG4gICAgICAgIH1cblxuXG4gICAgICAgIC8vIENhbGN1bGF0ZSB0aGUgZGlmZmVyZW5jZSBiZXR3ZWVuIHR3byB0aW1lc3RhbXBzLlxuICAgICAgICBwcml2YXRlIF9jYWxjVGltZURlbHRhKGZyb21UaW1lU3RhbXA6bnVtYmVyLCB0b1RpbWVTdGFtcDpudW1iZXIpOm51bWJlciB7XG4gICAgICAgICAgICByZXR1cm4gKHRvVGltZVN0YW1wKSAtIChmcm9tVGltZVN0YW1wKTtcbiAgICAgICAgfVxuXG5cbiAgICAgICAgLy8gRmluZCB3aGVyZSB0aW1lU3RhbXAgZml0cyBpbiB0aGUgdGltZWxpbmUgYW5kIGludGVycG9sYXRlLlxuICAgICAgICAvLyBSZXR1cm5zIHRoZSBpbmRleCBvZiB0aGUgdGltZWxpbmUgYW5kIHRoZSBpbnRlcnBvbGF0aW9uIGFtb3VudC5cbiAgICAgICAgcHJpdmF0ZSBfZml0T25Tb3J0ZWRUaW1lbGluZSh0aW1lU3RhbXA6bnVtYmVyLCB0aW1lbGluZTpudW1iZXJbXSk6YW55IHtcbiAgICAgICAgICAgIC8vIGlmIHRpbWVTdGFtcCBpcyBhZnRlciBsYXN0IGVudHJ5IGluIHRpbWVsaW5lLCByZXR1cm4gbGFzdCBlbnRyeVxuICAgICAgICAgICAgdmFyIGludGVyOmFueSA9IHtcbiAgICAgICAgICAgICAgICBcImluZGV4XCI6IHRpbWVsaW5lLmxlbmd0aCAtIDIsXG4gICAgICAgICAgICAgICAgXCJ0XCI6IDFcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICB0aW1lbGluZS5zb21lKCh0aW1lOm51bWJlciwgaTpudW1iZXIpOmJvb2xlYW4gPT4ge1xuICAgICAgICAgICAgICAgIHZhciBwcmV2Om51bWJlcjtcbiAgICAgICAgICAgICAgICBpZiAodGltZVN0YW1wIDw9IHRpbWUpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGludGVyLmluZGV4ID0gaSAtIDE7XG4gICAgICAgICAgICAgICAgICAgICAgICBwcmV2ID0gdGltZWxpbmVbaW50ZXIuaW5kZXhdO1xuICAgICAgICAgICAgICAgICAgICAgICAgaW50ZXIudCA9ICh0aW1lU3RhbXAgLSBwcmV2KSAvICh0aW1lIC0gcHJldik7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpbnRlci5pbmRleCA9IDA7XG4gICAgICAgICAgICAgICAgICAgICAgICBpbnRlci50ID0gMDtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICByZXR1cm4gaW50ZXI7XG4gICAgICAgIH1cblxuXG4gICAgICAgIC8vIEdpdmVuIGEgbGluZSBhbmQgYSB0aW1lc3RhbXAsIHRoaXMgZnVuY3Rpb24gbGluZWFybHkgaW50ZXJwb2xhdGVzIGFzIG5lY2Vzc2FyeSB0byBjb21lXG4gICAgICAgIC8vIHVwIHdpdGggYW4gT0QgdmFsdWUsIHRoZW4gaXQgbXVsdGlwbGllcyBieSBhIG1hZ2ljIG51bWJlciB0byBhcnJpdmUgYXQgYSBnZHcvTCBmYWN0b3JcbiAgICAgICAgLy8gdGhhdCBjYW4gYmUgZmFjdG9yZWQgaW50byBtZWFzdXJlbWVudHMuXG4gICAgICAgIHByaXZhdGUgX2NhbGN1bGF0ZU9wdGljYWxEZW5zaXR5RmFjdG9yKGxpbmU6TGluZURhdGEsXG4gICAgICAgICAgICAgICAgdGltZVN0YW1wOm51bWJlcixcbiAgICAgICAgICAgICAgICB3cml0ZURlYnVnSW5mbzpib29sZWFuKTpudW1iZXIge1xuICAgICAgICAgICAgLy8gR2V0IHRoZSBPRCBtZWFzdXJlbWVudHMuXG4gICAgICAgICAgICB2YXIgb2RNZWFzdXJlSUQ6bnVtYmVyID0gdGhpcy5fZ2V0T3B0aWNhbERlbnNpdHlNZWFzdXJlbWVudEZvckxpbmUobGluZS5nZXRMaW5lSUQoKSksXG4gICAgICAgICAgICAgICAgLy8gTGluZWFybHkgaW50ZXJwb2xhdGUgb24gdGhlIE9EIG1lYXN1cmVtZW50IHRvIGdldCB0aGUgZGVzaXJlZCBmYWN0b3IuXG4gICAgICAgICAgICAgICAgc29ydGVkVGltZTpudW1iZXJbXSA9IHRoaXMuX2dldE1lYXN1cmVtZW50VGltZXN0YW1wc1NvcnRlZChvZE1lYXN1cmVJRCksXG4gICAgICAgICAgICAgICAgaW50ZXJwSW5mbzphbnkgPSB0aGlzLl9maXRPblNvcnRlZFRpbWVsaW5lKHRpbWVTdGFtcCwgc29ydGVkVGltZSksXG4gICAgICAgICAgICAgICAgLy8gVGhpcyBpcyB0aGUgKGxpbmVhcmx5IGludGVycG9sYXRlZCkgT0Q2MDAgbWVhc3VyZW1lbnQuXG4gICAgICAgICAgICAgICAgZGF0YTpJbnRlZ3JhbCA9IHRoaXMuX2Fzc2F5TWVhc3VyZW1lbnREYXRhQnlJRFtvZE1lYXN1cmVJRF0sXG4gICAgICAgICAgICAgICAgdDpudW1iZXIgPSBpbnRlcnBJbmZvLnQsXG4gICAgICAgICAgICAgICAgZGF0YTE6bnVtYmVyID0gZGF0YVtzb3J0ZWRUaW1lW2ludGVycEluZm8uaW5kZXhdXSxcbiAgICAgICAgICAgICAgICBkYXRhMjpudW1iZXIgPSBkYXRhW3NvcnRlZFRpbWVbaW50ZXJwSW5mby5pbmRleCArIDFdXSxcbiAgICAgICAgICAgICAgICBvZE1lYXN1cmVtZW50Om51bWJlciA9IGRhdGExICsgKGRhdGEyIC0gZGF0YTEpICogdCxcbiAgICAgICAgICAgICAgICAvLyBBIG1hZ2ljIGZhY3RvciB0byBnaXZlIHVzIGdkdy9MIGZvciBhbiBPRDYwMCBtZWFzdXJlbWVudC5cbiAgICAgICAgICAgICAgICAvLyBUT0RPOiBUaGlzIGNhbiBiZSBjdXN0b21pemVkIGluIGFzc2F5IG1ldGFkYXRhIHNvIHdlIHNob3VsZCBhbGxvdyBmb3IgdGhhdCBoZXJlLlxuICAgICAgICAgICAgICAgIG9kTWFnaWNGYWN0b3I6bnVtYmVyID0gMC42NSxcbiAgICAgICAgICAgICAgICBmaW5hbFZhbHVlOm51bWJlciA9IG9kTWVhc3VyZW1lbnQgKiBvZE1hZ2ljRmFjdG9yLFxuICAgICAgICAgICAgICAgIC8vIGRlY2xhcmluZyB2YXJpYWJsZXMgb25seSBhc3NpZ25lZCB3aGVuIHdyaXRpbmcgZGVidWcgbG9nc1xuICAgICAgICAgICAgICAgIG1lYXN1cmU6QXNzYXlNZWFzdXJlbWVudFJlY29yZCwgYXNzYXk6QXNzYXlSZWNvcmQsIGxpbmVSZWM6TGluZVJlY29yZCxcbiAgICAgICAgICAgICAgICBwcm90b2NvbDphbnksIG5hbWU6c3RyaW5nO1xuXG4gICAgICAgICAgICAvLyBTcGl0IG91dCBvdXIgY2FsY3VsYXRpb25zIGlmIHJlcXVlc3RlZC5cbiAgICAgICAgICAgIGlmICh3cml0ZURlYnVnSW5mbykge1xuICAgICAgICAgICAgICAgIG1lYXN1cmUgPSBFREREYXRhLkFzc2F5TWVhc3VyZW1lbnRzW29kTWVhc3VyZUlEXTtcbiAgICAgICAgICAgICAgICBhc3NheSA9IEVERERhdGEuQXNzYXlzW21lYXN1cmUuYXNzYXldO1xuICAgICAgICAgICAgICAgIGxpbmVSZWMgPSBFREREYXRhLkxpbmVzW2Fzc2F5LmxpZF07XG4gICAgICAgICAgICAgICAgcHJvdG9jb2wgPSBFREREYXRhLlByb3RvY29sc1thc3NheS5waWRdO1xuICAgICAgICAgICAgICAgIG5hbWUgPSBbbGluZVJlYy5uYW1lLCBwcm90b2NvbC5uYW1lLCBhc3NheS5uYW1lXS5qb2luKCctJyk7XG4gICAgICAgICAgICAgICAgdGhpcy5fd3JpdGVEZWJ1Z0xpbmUodHJ1ZSwgXCJHZXR0aW5nIG9wdGljYWwgZGVuc2l0eSBmcm9tIFwiICsgbmFtZSk7XG4gICAgICAgICAgICAgICAgdGhpcy5fZGVidWdPdXRwdXRJbmRlbnQrKztcbiAgICAgICAgICAgICAgICBpZiAodCAhPT0gMSkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLl93cml0ZURlYnVnTGluZVdpdGhIZWFkZXIodHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIFwicmF3IHZhbHVlIGF0IFwiICsgc29ydGVkVGltZVtpbnRlcnBJbmZvLmluZGV4XSArIFwiaFwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fbnVtU3RyKGRhdGExKSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmICh0ICE9PSAwKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX3dyaXRlRGVidWdMaW5lV2l0aEhlYWRlcih0cnVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgXCJyYXcgdmFsdWUgYXQgXCIgKyBzb3J0ZWRUaW1lW2ludGVycEluZm8uaW5kZXggKyAxXSArIFwiaFwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fbnVtU3RyKGRhdGEyKSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmICh0ICE9PSAwICYmIHQgIT09IDEpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fd3JpdGVEZWJ1Z0xpbmVXaXRoSGVhZGVyKHRydWUsXG4gICAgICAgICAgICAgICAgICAgICAgICBcImludGVycG9sYXRlIFwiICsgKHQgKiAxMDApLnRvRml4ZWQoMikgKyBcIiVcIixcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX251bVN0cihkYXRhMSkgKyBcIiArIChcIiArIHRoaXMuX251bVN0cihkYXRhMikgKyBcIiAtIFwiICtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX251bVN0cihkYXRhMSkgKyBcIilcIiArIFwiICogXCIgKyB0aGlzLl9udW1TdHIodCkgKyBcIiA9IFwiICtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX251bVN0cihvZE1lYXN1cmVtZW50KSArIFwiIEwvZ2R3XCIpO1xuICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICB0aGlzLl93cml0ZURlYnVnTGluZVdpdGhIZWFkZXIodHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgXCJlbXBpcmljYWwgZmFjdG9yXCIsXG4gICAgICAgICAgICAgICAgICAgIFwiICogXCIgKyB0aGlzLl9udW1TdHIob2RNYWdpY0ZhY3RvcikgKyBcIiA9IFwiICtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fbnVtU3RyKGZpbmFsVmFsdWUpICsgXCIgTC9nZHdcIik7XG4gICAgICAgICAgICAgICAgdGhpcy5fd3JpdGVEZWJ1Z0xpbmUodHJ1ZSwgXCJcIik7XG4gICAgICAgICAgICAgICAgdGhpcy5fZGVidWdPdXRwdXRJbmRlbnQtLTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIGZpbmFsVmFsdWU7XG4gICAgICAgIH1cblxuXG4gICAgICAgIC8vIFJldHVybnMgdGhlIGFzc2F5IG1lYXN1cmVtZW50IHRoYXQgcmVwcmVzZW50cyBPRCBmb3IgdGhlIHNwZWNpZmllZCBsaW5lLlxuICAgICAgICBwcml2YXRlIF9nZXRPcHRpY2FsRGVuc2l0eU1lYXN1cmVtZW50Rm9yTGluZShsaW5lSUQ6bnVtYmVyKTpudW1iZXIge1xuICAgICAgICAgICAgdmFyIG9kTWVhc3VyZUlEOm51bWJlciA9IHRoaXMuX29wdGljYWxEZW5zaXR5TWVhc3VyZW1lbnRJREJ5TGluZUlEW2xpbmVJRF07XG4gICAgICAgICAgICBpZiAodHlwZW9mIG9kTWVhc3VyZUlEICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgICAgICAgICAgIHJldHVybiBvZE1lYXN1cmVJRDtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coXCJXYXJuaW5nISBVbmFibGUgdG8gZmluZCBPRCBtZWFzdXJlbWVudCBmb3IgXCIgK1xuICAgICAgICAgICAgICAgICAgICBFREREYXRhLkxpbmVzW2xpbmVJRF0ubmFtZSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIC0xO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cblxuICAgICAgICAvLyBUaGlzIGNhbGN1bGF0ZXMgdGhlIF92YWxpZEFzc2F5c0J5TGluZUlEIGFuZCBfdmFsaWRNZWFzdXJlbWVudHNCeUFzc2F5SUQgbGlzdHMsXG4gICAgICAgIC8vIHdoaWNoIHJlZHVjZXMgY2x1dHRlciBpbiBhbGwgb3VyIGxvb3BpbmcgY29kZS5cbiAgICAgICAgcHJpdmF0ZSBfcHJlY2FsY3VsYXRlVmFsaWRMaXN0cygpOnZvaWQge1xuICAgICAgICAgICAgJC5lYWNoKEVERERhdGEuTGluZXMsIChrZXk6c3RyaW5nLCBsaW5lOkxpbmVSZWNvcmQpOnZvaWQgPT4ge1xuICAgICAgICAgICAgICAgIGlmIChsaW5lLmFjdGl2ZSkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLl92YWxpZEFzc2F5c0J5TGluZUlEW2xpbmUuaWRdID0gW107XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAkLmVhY2goRURERGF0YS5Bc3NheXMsIChrZXk6c3RyaW5nLCBhc3NheTpBc3NheVJlY29yZCk6dm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIGxpc3Q6bnVtYmVyW10gPSB0aGlzLl92YWxpZEFzc2F5c0J5TGluZUlEW2Fzc2F5LmxpZF07XG4gICAgICAgICAgICAgICAgaWYgKGFzc2F5LmFjdGl2ZSAmJiBsaXN0KSB7XG4gICAgICAgICAgICAgICAgICAgIGxpc3QucHVzaChhc3NheS5pZCk7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX3ZhbGlkTWVhc3VyZW1lbnRzQnlBc3NheUlEW2Fzc2F5LmlkXSA9IFtdO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgJC5lYWNoKEVERERhdGEuQXNzYXlNZWFzdXJlbWVudHMsIChrZXk6c3RyaW5nLFxuICAgICAgICAgICAgICAgICAgICBtZWFzdXJlOkFzc2F5TWVhc3VyZW1lbnRSZWNvcmQpOnZvaWQgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBsaXN0Om51bWJlcltdID0gdGhpcy5fdmFsaWRNZWFzdXJlbWVudHNCeUFzc2F5SURbbWVhc3VyZS5hc3NheV0sXG4gICAgICAgICAgICAgICAgICAgIHR5cGU6TWVhc3VyZW1lbnRUeXBlUmVjb3JkID0gRURERGF0YS5NZWFzdXJlbWVudFR5cGVzW21lYXN1cmUudHlwZV0sXG4gICAgICAgICAgICAgICAgICAgIGFzc2F5OkFzc2F5UmVjb3JkID0gRURERGF0YS5Bc3NheXNbbWVhc3VyZS5hc3NheV07XG4gICAgICAgICAgICAgICAgaWYgKGxpc3QpIHtcbiAgICAgICAgICAgICAgICAgICAgbGlzdC5wdXNoKG1lYXN1cmUuaWQpO1xuICAgICAgICAgICAgICAgICAgICBpZiAodHlwZSAmJiB0aGlzLl9pc09wdGljYWxEZW5zaXR5TWVhc3VyZW1lbnQodHlwZSkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX29wdGljYWxEZW5zaXR5TWVhc3VyZW1lbnRJREJ5TGluZUlEW2Fzc2F5LmxpZF0gPSBtZWFzdXJlLmlkO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBleHBvcnQgaW50ZXJmYWNlIEFzc2F5TG9va3VwIHtcbiAgICAgICAgW2lkOm51bWJlcl06IEFzc2F5RGF0YTtcbiAgICB9XG5cbiAgICBleHBvcnQgaW50ZXJmYWNlIFRpbWVsaW5lTG9va3VwIHtcbiAgICAgICAgW2lkOm51bWJlcl06IE1ldGFib2xpdGVUaW1lbGluZTtcbiAgICB9XG5cbiAgICAvLyBDbGFzcyBkZWZpbml0aW9uIGZvciBlbGVtZW50cyBpbiBTdW1tYXRpb24ubGluZURhdGFCeUlEXG4gICAgZXhwb3J0IGNsYXNzIExpbmVEYXRhIHtcbiAgICAgICAgYXNzYXlzQnlJRDpBc3NheUxvb2t1cCA9IDxBc3NheUxvb2t1cD57fTtcbiAgICAgICAgcHJpdmF0ZSBfbGluZUlEOm51bWJlcjtcblxuICAgICAgICBjb25zdHJ1Y3RvcihsaW5lSUQ6bnVtYmVyKSB7XG4gICAgICAgICAgICB0aGlzLl9saW5lSUQgPSBsaW5lSUQ7XG4gICAgICAgIH1cblxuICAgICAgICBnZXRMaW5lSUQoKTpudW1iZXIge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX2xpbmVJRDtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFJldHVybiBhIGxpc3Qgb2YgQXNzYXlEYXRhIHN0cnVjdHVyZXMgdGhhdCBvbmx5XG4gICAgICAgIC8vIGNvbnRhaW4gbWV0YWJvbGl0ZSBkYXRhIGZvciB0aGUgc3BlY2lmaWVkIHRpbWUgc3RhbXAuXG4gICAgICAgIC8vIChUaGlzIHdpbGwgbm90IHJldHVybiBhc3NheXMgdGhhdCBkb24ndCBoYXZlIGFueSBtZXRhYm9saXRlIGRhdGEgZm9yIHRoaXMgdGltZSBzdGFtcC4pXG4gICAgICAgIGZpbHRlckFzc2F5c0J5VGltZVN0YW1wKHRpbWVTdGFtcDpudW1iZXIpOkFzc2F5RGF0YVtdIHtcbiAgICAgICAgICAgIHZhciBmaWx0ZXJlZEFzc2F5czpBc3NheURhdGFbXSA9IFtdO1xuICAgICAgICAgICAgLy8galF1ZXJ5IGVhY2ggY2FsbGJhY2sgYWx3YXlzIGdpdmVzIHN0cmluZyBiYWNrIGZvciBrZXlzXG4gICAgICAgICAgICAkLmVhY2godGhpcy5hc3NheXNCeUlELCAoYWtleTpzdHJpbmcsIGFzc2F5OkFzc2F5RGF0YSk6dm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIHRpbWVsaW5lczpUaW1lbGluZUxvb2t1cCA9IDxUaW1lbGluZUxvb2t1cD57fSxcbiAgICAgICAgICAgICAgICAgICAgbnVtQWRkZWQ6bnVtYmVyID0gMCxcbiAgICAgICAgICAgICAgICAgICAgb3V0QXNzYXk6QXNzYXlEYXRhO1xuICAgICAgICAgICAgICAgICQuZWFjaChhc3NheS50aW1lbGluZXNCeU1lYXN1cmVtZW50SWQsXG4gICAgICAgICAgICAgICAgICAgICAgICAodGtleTpzdHJpbmcsIHRpbWVsaW5lOk1ldGFib2xpdGVUaW1lbGluZSk6dm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBzYW1wbGU6YW55ID0gdGltZWxpbmUuZmluZFNhbXBsZUJ5VGltZVN0YW1wKHRpbWVTdGFtcCksXG4gICAgICAgICAgICAgICAgICAgICAgICBtZWFzdXJlbWVudDpNZXRhYm9saXRlVGltZWxpbmU7XG4gICAgICAgICAgICAgICAgICAgIGlmIChzYW1wbGUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lYXN1cmVtZW50ID0gbmV3IE1ldGFib2xpdGVUaW1lbGluZShhc3NheSwgdGltZWxpbmUubWVhc3VyZUlkKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lYXN1cmVtZW50LnRpbWVTYW1wbGVzLnB1c2goc2FtcGxlKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRpbWVsaW5lc1t0aW1lbGluZS5tZWFzdXJlSWRdID0gbWVhc3VyZW1lbnQ7XG4gICAgICAgICAgICAgICAgICAgICAgICArK251bUFkZGVkO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgaWYgKG51bUFkZGVkKSB7XG4gICAgICAgICAgICAgICAgICAgIG91dEFzc2F5ID0gbmV3IEFzc2F5RGF0YShhc3NheS5hc3NheUlkKTtcbiAgICAgICAgICAgICAgICAgICAgb3V0QXNzYXkudGltZWxpbmVzQnlNZWFzdXJlbWVudElkID0gdGltZWxpbmVzO1xuICAgICAgICAgICAgICAgICAgICBmaWx0ZXJlZEFzc2F5cy5wdXNoKG91dEFzc2F5KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHJldHVybiBmaWx0ZXJlZEFzc2F5cztcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFN1bSB1cCBhbGwgdGhlIGluL291dCB2YWx1ZXMgYWNyb3NzIGFsbCBtZXRhYm9saXRlcyBhdCB0aGUgc3BlY2lmaWVkIHRpbWVzdGFtcC5cbiAgICAgICAgZ2V0SW5PdXRTdW1BdFRpbWUodGltZVN0YW1wOm51bWJlcik6SW5PdXRTdW0ge1xuICAgICAgICAgICAgLy8gR3JhYiBhbGwgdGhlIG1lYXN1cmVtZW50cy5cbiAgICAgICAgICAgIHZhciBtZWFzdXJlbWVudHM6SW5PdXRTdW1NZWFzdXJlbWVudFtdID0gW10sXG4gICAgICAgICAgICAgICAgdG90YWxJbjpudW1iZXIgPSAwLFxuICAgICAgICAgICAgICAgIHRvdGFsT3V0Om51bWJlciA9IDA7XG4gICAgICAgICAgICAkLmVhY2godGhpcy5hc3NheXNCeUlELCAoa2V5OnN0cmluZywgYXNzYXk6QXNzYXlEYXRhKTp2b2lkID0+IHtcbiAgICAgICAgICAgICAgICAkLmVhY2goYXNzYXkudGltZWxpbmVzQnlNZWFzdXJlbWVudElkLCAoa2V5OnN0cmluZyxcbiAgICAgICAgICAgICAgICAgICAgICAgIHRpbWVsaW5lOk1ldGFib2xpdGVUaW1lbGluZSk6dm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBpbm91dDpJbk91dFN1bU1lYXN1cmVtZW50ID0gbmV3IEluT3V0U3VtTWVhc3VyZW1lbnQoKTtcbiAgICAgICAgICAgICAgICAgICAgaW5vdXQudGltZWxpbmUgPSBhc3NheS50aW1lbGluZXNCeU1lYXN1cmVtZW50SWRbdGltZWxpbmUubWVhc3VyZUlkXTtcbiAgICAgICAgICAgICAgICAgICAgaW5vdXQuY2FyYm9uRGVsdGEgPSBpbm91dC50aW1lbGluZS5pbnRlcnBvbGF0ZUNhcmJvbkRlbHRhKHRpbWVTdGFtcCk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChpbm91dC5jYXJib25EZWx0YSA+IDApIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRvdGFsT3V0ICs9IGlub3V0LmNhcmJvbkRlbHRhO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgdG90YWxJbiAtPSBpbm91dC5jYXJib25EZWx0YTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBtZWFzdXJlbWVudHMucHVzaChpbm91dCk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHJldHVybiBuZXcgSW5PdXRTdW0odG90YWxJbiwgdG90YWxPdXQsIG1lYXN1cmVtZW50cyk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBUaGlzIHJlcHJlc2VudHMgYSBiYWtlZC1kb3duIHZlcnNpb24gb2YgdGhlIExpbmVEYXRhL0Fzc2F5RGF0YSwgd2hlcmUgd2UndmVcbiAgICAvLyBzdW1tZWQgdXAgY2FyYm9uIGRhdGEgZm9yIGFsbCBhc3NheXMgYXQgZWFjaCB0aW1lIHBvaW50LlxuICAgIGV4cG9ydCBjbGFzcyBNZXJnZWRMaW5lU2FtcGxlcyB7XG4gICAgICAgIC8vIE9yZGVyZWQgYnkgdGltZSBzdGFtcCwgdGhlc2UgYXJlIHRoZSBtZXJnZWQgc2FtcGxlcyB3aXRoIGNhcmJvbiBpbi9vdXQgZGF0YS5cbiAgICAgICAgbWVyZ2VkTGluZVNhbXBsZXM6TWVyZ2VkTGluZVNhbXBsZVtdID0gW107XG5cbiAgICAgICAgLy8gVGhpcyBpcyBhIGxpc3Qgb2YgYWxsIHRpbWVsaW5lcyB0aGF0IHdlcmUgc2FtcGxlZCB0byBidWlsZCB0aGUgc3VtcyBpbiBtZXJnZWRMaW5lU2FtcGxlcy5cbiAgICAgICAgbWV0YWJvbGl0ZVRpbWVsaW5lczpNZXRhYm9saXRlVGltZWxpbmVbXSA9IFtdO1xuICAgIH1cblxuICAgIGV4cG9ydCBjbGFzcyBNZXJnZWRMaW5lU2FtcGxlIHtcbiAgICAgICAgdGltZVN0YW1wOm51bWJlcjtcbiAgICAgICAgdG90YWxDYXJib25JbjpudW1iZXIgPSAwO1xuICAgICAgICB0b3RhbENhcmJvbk91dDpudW1iZXIgPSAwO1xuXG4gICAgICAgIGNvbnN0cnVjdG9yKHRpbWVTdGFtcDpudW1iZXIpIHtcbiAgICAgICAgICAgIHRoaXMudGltZVN0YW1wID0gdGltZVN0YW1wO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZXhwb3J0IGNsYXNzIEluT3V0U3VtIHtcbiAgICAgICAgdG90YWxJbjpudW1iZXI7XG4gICAgICAgIHRvdGFsT3V0Om51bWJlcjtcbiAgICAgICAgbWVhc3VyZW1lbnRzOkluT3V0U3VtTWVhc3VyZW1lbnRbXTtcblxuICAgICAgICBjb25zdHJ1Y3Rvcih0b3RhbEluOm51bWJlciwgdG90YWxPdXQ6bnVtYmVyLCBtZWFzdXJlbWVudHM6SW5PdXRTdW1NZWFzdXJlbWVudFtdKSB7XG4gICAgICAgICAgICB0aGlzLnRvdGFsSW4gPSB0b3RhbEluO1xuICAgICAgICAgICAgdGhpcy50b3RhbE91dCA9IHRvdGFsT3V0O1xuICAgICAgICAgICAgdGhpcy5tZWFzdXJlbWVudHMgPSBtZWFzdXJlbWVudHM7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBleHBvcnQgY2xhc3MgSW5PdXRTdW1NZWFzdXJlbWVudCB7XG4gICAgICAgIHRpbWVsaW5lOk1ldGFib2xpdGVUaW1lbGluZTtcbiAgICAgICAgY2FyYm9uRGVsdGE6bnVtYmVyO1xuXG4gICAgICAgIGFic0RlbHRhKCk6bnVtYmVyIHtcbiAgICAgICAgICAgIHJldHVybiBNYXRoLmFicyh0aGlzLmNhcmJvbkRlbHRhKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGV4cG9ydCBjbGFzcyBBc3NheURhdGEge1xuICAgICAgICB0aW1lbGluZXNCeU1lYXN1cmVtZW50SWQ6VGltZWxpbmVMb29rdXAgPSA8VGltZWxpbmVMb29rdXA+e307XG4gICAgICAgIGFzc2F5SWQ6bnVtYmVyO1xuXG4gICAgICAgIGNvbnN0cnVjdG9yKGFzc2F5SUQ6bnVtYmVyKSB7XG4gICAgICAgICAgICB0aGlzLmFzc2F5SWQgPSBhc3NheUlEO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gUmV0dXJuIGEgbGlzdCBvZiBbbWVhc3VyZW1lbnRJRCwgVGltZVNhbXBsZV0gb2JqZWN0cywgb25lIGZvciBlYWNoXG4gICAgICAgIC8vIG1lYXN1cmVtZW50IHRoYXQgaGFzIGEgc2FtcGxlIGF0IHRoZSBzcGVjaWZpZWQgdGltZSBzdGFtcC5cbiAgICAgICAgZ2V0VGltZVNhbXBsZXNCeVRpbWVTdGFtcCh0aW1lU3RhbXA6bnVtYmVyKSA6IGFueVtdIHtcbiAgICAgICAgICAgIHJldHVybiAkLm1hcCh0aGlzLnRpbWVsaW5lc0J5TWVhc3VyZW1lbnRJZCwgKHRpbWVsaW5lOk1ldGFib2xpdGVUaW1lbGluZSk6YW55ID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgc2FtcGxlOlRpbWVTYW1wbGUgPSB0aW1lbGluZS5maW5kU2FtcGxlQnlUaW1lU3RhbXAodGltZVN0YW1wKTtcbiAgICAgICAgICAgICAgICBpZiAoc2FtcGxlKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBcIm1lYXN1cmVtZW50SURcIjogdGltZWxpbmUubWVhc3VyZUlkLFxuICAgICAgICAgICAgICAgICAgICAgICAgXCJ0aW1lU2FtcGxlXCI6IHNhbXBsZVxuICAgICAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZXhwb3J0IGNsYXNzIE1ldGFib2xpdGVUaW1lbGluZSB7XG4gICAgICAgIGFzc2F5OkFzc2F5RGF0YTtcbiAgICAgICAgdGltZVNhbXBsZXM6VGltZVNhbXBsZVtdID0gW107XG4gICAgICAgIG1lYXN1cmVJZDpudW1iZXI7XG5cbiAgICAgICAgY29uc3RydWN0b3IoYXNzYXk6QXNzYXlEYXRhLCBtZWFzdXJlbWVudElEOm51bWJlcikge1xuICAgICAgICAgICAgLy8gT2YgdHlwZSBTdW1tYXRpb24uVGltZVNhbXBsZS4gU29ydGVkIGJ5IHRpbWVTdGFtcC5cbiAgICAgICAgICAgIC8vIE5vdGUgdGhhdCBzYW1wbGUgMCdzIGNhcmJvbkRlbHRhIHdpbGwgYmUgMCBzaW5jZSBpdCBoYXMgbm8gcHJldmlvdXMgbWVhc3VyZW1lbnQuXG4gICAgICAgICAgICB0aGlzLmFzc2F5ID0gYXNzYXk7XG4gICAgICAgICAgICB0aGlzLm1lYXN1cmVJZCA9IG1lYXN1cmVtZW50SUQ7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBUaGlzIGlzIHRoZSBlYXNpZXN0IGZ1bmN0aW9uIHRvIGNhbGwgdG8gZ2V0IHRoZSBjYXJib24gZGVsdGEgYXQgYSBzcGVjaWZpYyB0aW1lLlxuICAgICAgICAvLyBJZiB0aGlzIHRpbWVsaW5lIGRvZXNuJ3QgaGF2ZSBhIHNhbXBsZSBhdCB0aGF0IHBvc2l0aW9uLCBpdCdsbCBpbnRlcnBvbGF0ZSBiZXR3ZWVuXG4gICAgICAgIC8vIHRoZSBuZWFyZXN0IHR3by5cbiAgICAgICAgaW50ZXJwb2xhdGVDYXJib25EZWx0YSh0aW1lU3RhbXA6bnVtYmVyKTpudW1iZXIge1xuICAgICAgICAgICAgdmFyIHByZXY6VGltZVNhbXBsZSwgZGVsdGE6bnVtYmVyO1xuICAgICAgICAgICAgaWYgKHRoaXMudGltZVNhbXBsZXMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIDA7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyBJZiB0aGUgdGltZSBzdGFtcCBpcyBiZWZvcmUgYWxsIG91ciBzYW1wbGVzLCBqdXN0IHJldHVybiBvdXIgZmlyc3Qgc2FtcGxlJ3NcbiAgICAgICAgICAgIC8vIGNhcmJvbiBkZWx0YS5cbiAgICAgICAgICAgIHByZXYgPSB0aGlzLnRpbWVTYW1wbGVzWzBdO1xuICAgICAgICAgICAgaWYgKHRpbWVTdGFtcCA8PSBwcmV2LnRpbWVTdGFtcCkge1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLnRpbWVTYW1wbGVzWzBdLmNhcmJvbkRlbHRhO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy50aW1lU2FtcGxlcy5zb21lKChzYW1wbGU6VGltZVNhbXBsZSk6Ym9vbGVhbiA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKHNhbXBsZS50aW1lU3RhbXAgPT09IHRpbWVTdGFtcCkge1xuICAgICAgICAgICAgICAgICAgICBkZWx0YSA9IHNhbXBsZS5jYXJib25EZWx0YTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmICh0aW1lU3RhbXAgPj0gcHJldi50aW1lU3RhbXAgJiYgdGltZVN0YW1wIDw9IHNhbXBsZS50aW1lU3RhbXApIHtcbiAgICAgICAgICAgICAgICAgICAgZGVsdGEgPSBVdGwuSlMucmVtYXBWYWx1ZSh0aW1lU3RhbXAsIHByZXYudGltZVN0YW1wLCBzYW1wbGUudGltZVN0YW1wLFxuICAgICAgICAgICAgICAgICAgICAgICAgcHJldi5jYXJib25EZWx0YSwgc2FtcGxlLmNhcmJvbkRlbHRhKTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHByZXYgPSBzYW1wbGU7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIGlmIChkZWx0YSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgLy8gVGhlIHRpbWUgc3RhbXAgdGhleSBwYXNzZWQgaW4gbXVzdCBiZSBwYXN0IGFsbCBvdXIgc2FtcGxlcy5cbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy50aW1lU2FtcGxlcy5zbGljZSgtMSlbMF0uY2FyYm9uRGVsdGE7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gZGVsdGE7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBSZXR1cm4gYSBUaW1lU2FtcGxlIG9yIG51bGwuXG4gICAgICAgIGZpbmRTYW1wbGVCeVRpbWVTdGFtcCh0aW1lU3RhbXA6bnVtYmVyKTpUaW1lU2FtcGxlIHtcbiAgICAgICAgICAgIHZhciBtYXRjaGVkOlRpbWVTYW1wbGVbXTtcbiAgICAgICAgICAgIG1hdGNoZWQgPSB0aGlzLnRpbWVTYW1wbGVzLmZpbHRlcihcbiAgICAgICAgICAgICAgICAoc2FtcGxlOlRpbWVTYW1wbGUpOmJvb2xlYW4gPT4gc2FtcGxlLnRpbWVTdGFtcCA9PT0gdGltZVN0YW1wKTtcbiAgICAgICAgICAgIGlmIChtYXRjaGVkLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgIHJldHVybiBtYXRjaGVkWzBdO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgIH1cblxuICAgIH1cblxuICAgIC8vIERhdGEgZm9yIGEgc2luZ2xlIGxpbmUgZm9yIGEgc2luZ2xlIHBvaW50IGluIHRpbWUuXG4gICAgZXhwb3J0IGNsYXNzIFRpbWVTYW1wbGUge1xuICAgICAgICAvLyBpbiBob3Vyc1xuICAgICAgICB0aW1lU3RhbXA6bnVtYmVyID0gMDtcbiAgICAgICAgLy8gKiogTk9URTogQ21Nb2wgaGVyZSBtZWFucyBjYXJib24gbWlsbGktbW9sZXMuXG4gICAgICAgIC8vIENtTW9sL0wgb2YgY2FyYm9uIGF0IHRoaXMgdGltZXN0YW1wXG4gICAgICAgIGNhcmJvblZhbHVlOm51bWJlciA9IDA7XG4gICAgICAgIC8vIENtTW9sL2dkdy9oclxuICAgICAgICAvLyBkZWx0YSBiZXR3ZWVuIHRoaXMgY2FyYm9uIHZhbHVlIGFuZCB0aGUgcHJldmlvdXMgb25lICgwIGZvciB0aGUgZmlyc3QgZW50cnkpOlxuICAgICAgICAvLyAtLSBQT1NJVElWRSBtZWFucyBvdXRwdXQgKGluIHRoYXQgdGhlIG9yZ2FuaXNtIG91dHB1dHRlZCB0aGlzIG1ldGFib2xpdGUgZm9yIHRoZSB0aW1lXG4gICAgICAgIC8vICAgICAgc3BhbiBpbiBxdWVzdGlvbilcbiAgICAgICAgLy8gLS0gTkVHQVRJVkUgbWVhbnMgaW5wdXQgIChpbiB0aGF0IHRoZSBvcmdhbmlzbSByZWR1Y2VkIHRoZSBhbW91bnQgb2YgdGhpcyBtZXRhYm9saXRlXG4gICAgICAgIC8vICAgICAgZm9yIHRoZSB0aW1lIHNwYW4pXG4gICAgICAgIGNhcmJvbkRlbHRhOm51bWJlciA9IDA7XG5cbiAgICAgICAgaXNJbnB1dCgpIDogYm9vbGVhbiB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5jYXJib25EZWx0YSA8PSAwO1xuICAgICAgICB9XG5cbiAgICAgICAgaXNPdXRwdXQoKSA6IGJvb2xlYW4ge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuY2FyYm9uRGVsdGEgPiAwO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gUmV0dXJuIHRoZSBhYnNvbHV0ZSB2YWx1ZSBvZiBjYXJib25EZWx0YS4gWW91J2xsIG5lZWQgdG8gdXNlIGlzSW5wdXQoKSBvciBpc091dHB1dCgpXG4gICAgICAgIC8vIHRvIGtub3cgd2hpY2ggaXQgcmVwcmVzZW50cy5cbiAgICAgICAgYWJzRGVsdGEoKSA6IG51bWJlciB7XG4gICAgICAgICAgICByZXR1cm4gTWF0aC5hYnModGhpcy5jYXJib25EZWx0YSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBpbnRlcmZhY2UgTWVyZ2VkTGluZVRpbWVMb29rdXAge1xuICAgICAgICBbaW5kZXg6bnVtYmVyXTogTWVyZ2VkTGluZVNhbXBsZTtcbiAgICB9XG5cbiAgICAvLyBTdGVwIDEgaXMgd2hlcmUgQ2FyYm9uQmFsYW5jZS5TdW1tYXRpb24gYnVpbGRzIGEgdGltZWxpbmUgZm9yIGVhY2ggbGluZS0+YXNzYXktPm1ldGFib2xpdGUuXG4gICAgLy8gU3RlcCAyIGlzIHdoZXJlIHRoaXMgY2xhc3MgbWVyZ2VzIGFsbCB0aGUgYXNzYXktPm1ldGFib2xpdGUgdGltZWxpbmVzIGludG8gb25lIHRpbWVsaW5lXG4gICAgLy8gZm9yIGVhY2ggbGluZS5cbiAgICBleHBvcnQgY2xhc3MgVGltZWxpbmVNZXJnZXIge1xuXG4gICAgICAgIC8vIFRha2UgdGhlIGlucHV0IExpbmVEYXRhIGFuZCBzdW0gdXAgYWxsIG1lYXN1cmVtZW50cyBhY3Jvc3MgYWxsIGFzc2F5cy9tZXRhYm9saXRlc1xuICAgICAgICAvLyBpbnRvIGEgbGlzdCBvZiB7dGltZVN0YW1wLCB0b3RhbENhcmJvbkluLCB0b3RhbENhcmJvbk91dH0gb2JqZWN0cyAoc29ydGVkIGJ5IHRpbWVTdGFtcCkuXG4gICAgICAgIHB1YmxpYyBzdGF0aWMgbWVyZ2VBbGxMaW5lU2FtcGxlcyhsaW5lRGF0YTpMaW5lRGF0YSk6TWVyZ2VkTGluZVNhbXBsZXMge1xuICAgICAgICAgICAgdmFyIG1lcmdlZExpbmVTYW1wbGVzOk1lcmdlZExpbmVTYW1wbGVzID0gbmV3IE1lcmdlZExpbmVTYW1wbGVzKCksXG4gICAgICAgICAgICAgICAgLy8gRmlyc3QsIGJ1aWxkIGEgbGlzdCBvZiB0aW1lc3RhbXBzIGZyb20gXCJwcmltYXJ5IGFzc2F5c1wiIChpLmUuIG5vbi1SQU1PUyBhc3NheXMpLlxuICAgICAgICAgICAgICAgIC8vIG9iamVjdCBpcyBiZWluZyB1c2VkIGFzIGEgc2V0XG4gICAgICAgICAgICAgICAgdmFsaWRUaW1lU3RhbXBzOntbaTpudW1iZXJdOm51bWJlcn0gPSB7fSxcbiAgICAgICAgICAgICAgICBtZXJnZWRTYW1wbGVzOk1lcmdlZExpbmVUaW1lTG9va3VwID0gPE1lcmdlZExpbmVUaW1lTG9va3VwPnt9O1xuXG4gICAgICAgICAgICAkLmVhY2gobGluZURhdGEuYXNzYXlzQnlJRCwgKGFrZXk6c3RyaW5nLCBhc3NheTpBc3NheURhdGEpOnZvaWQgPT4ge1xuICAgICAgICAgICAgICAgICQuZWFjaChhc3NheS50aW1lbGluZXNCeU1lYXN1cmVtZW50SWQsXG4gICAgICAgICAgICAgICAgICAgICAgICAodGtleTpzdHJpbmcsIHRpbWVsaW5lOk1ldGFib2xpdGVUaW1lbGluZSk6dm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgICAgIG1lcmdlZExpbmVTYW1wbGVzLm1ldGFib2xpdGVUaW1lbGluZXMucHVzaCh0aW1lbGluZSk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChUaW1lbGluZU1lcmdlci5faXNQcmltYXJ5QXNzYXkoYXNzYXkpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aW1lbGluZS50aW1lU2FtcGxlcy5mb3JFYWNoKChzYW1wbGU6VGltZVNhbXBsZSk6dm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFsaWRUaW1lU3RhbXBzW3NhbXBsZS50aW1lU3RhbXBdID0gc2FtcGxlLnRpbWVTdGFtcDtcbiAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICQuZWFjaCh2YWxpZFRpbWVTdGFtcHMsIChrZXk6c3RyaW5nLCB0aW1lU3RhbXA6bnVtYmVyKTp2b2lkID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgb3V0U2FtcGxlOk1lcmdlZExpbmVTYW1wbGUsIHRpbWVsaW5lczpNZXRhYm9saXRlVGltZWxpbmVbXTtcbiAgICAgICAgICAgICAgICBpZiAodGltZVN0YW1wID09PSAwKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgb3V0U2FtcGxlID0gbmV3IE1lcmdlZExpbmVTYW1wbGUodGltZVN0YW1wKTtcbiAgICAgICAgICAgICAgICBtZXJnZWRTYW1wbGVzW3RpbWVTdGFtcF0gPSBvdXRTYW1wbGU7XG4gICAgICAgICAgICAgICAgdGltZWxpbmVzID0gbWVyZ2VkTGluZVNhbXBsZXMubWV0YWJvbGl0ZVRpbWVsaW5lcztcbiAgICAgICAgICAgICAgICB0aW1lbGluZXMuZm9yRWFjaCgodGltZWxpbmU6TWV0YWJvbGl0ZVRpbWVsaW5lKTp2b2lkID0+IHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIGNhcmJvbkRlbHRhOm51bWJlciA9IHRpbWVsaW5lLmludGVycG9sYXRlQ2FyYm9uRGVsdGEodGltZVN0YW1wKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGNhcmJvbkRlbHRhID4gMCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgb3V0U2FtcGxlLnRvdGFsQ2FyYm9uT3V0ICs9IGNhcmJvbkRlbHRhO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgb3V0U2FtcGxlLnRvdGFsQ2FyYm9uSW4gLT0gY2FyYm9uRGVsdGE7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgLy8gc29ydCB0aGUgc2FtcGxlcyBieSB0aW1lc3RhbXBcbiAgICAgICAgICAgIG1lcmdlZExpbmVTYW1wbGVzLm1lcmdlZExpbmVTYW1wbGVzID0gJC5tYXAoXG4gICAgICAgICAgICAgICAgbWVyZ2VkU2FtcGxlcyxcbiAgICAgICAgICAgICAgICAoc2FtcGxlOk1lcmdlZExpbmVTYW1wbGUpOk1lcmdlZExpbmVTYW1wbGUgPT4gc2FtcGxlXG4gICAgICAgICAgICApLnNvcnQoKGE6TWVyZ2VkTGluZVNhbXBsZSwgYjpNZXJnZWRMaW5lU2FtcGxlKTpudW1iZXIgPT4ge1xuICAgICAgICAgICAgICAgIHJldHVybiBhLnRpbWVTdGFtcCAtIGIudGltZVN0YW1wO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICByZXR1cm4gbWVyZ2VkTGluZVNhbXBsZXM7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBSZXR1cm5zIHRydWUgaWYgdGhpcyBpcyBhIFwicHJpbWFyeVwiIGFzc2F5LCB3aGljaCBtZWFucyB0aGF0IHdlJ2xsIHVzZSBpdCB0byBnZW5lcmF0ZVxuICAgICAgICAvLyBjYXJib24gYmFsYW5jZSB0aW1lIHNhbXBsZXMuIEEgbm9uLXByaW1hcnkgYXNzYXkgaXMgc29tZXRoaW5nIHRoYXQgZ2VuZXJhdGVzIGEgdG9uIG9mXG4gICAgICAgIC8vIHNhbXBsZXMgbGlrZSBSQU1PUy5cbiAgICAgICAgcHJpdmF0ZSBzdGF0aWMgX2lzUHJpbWFyeUFzc2F5KGFzc2F5OkFzc2F5RGF0YSk6Ym9vbGVhbiB7XG4gICAgICAgICAgICB2YXIgc2VydmVyQXNzYXlEYXRhOkFzc2F5UmVjb3JkID0gRURERGF0YS5Bc3NheXNbYXNzYXkuYXNzYXlJZF0sXG4gICAgICAgICAgICAgICAgcHJvdG9jb2w6YW55ID0gRURERGF0YS5Qcm90b2NvbHNbc2VydmVyQXNzYXlEYXRhLnBpZF07XG4gICAgICAgICAgICAvLyBUT0RPOiBGcmFnaWxlXG4gICAgICAgICAgICByZXR1cm4gKHByb3RvY29sLm5hbWUgIT09ICdPMi9DTzInKTtcbiAgICAgICAgfVxuICAgIH1cblxufSAvLyBlbmQgbW9kdWxlIENhcmJvbkJhbGFuY2VcbiJdfQ==