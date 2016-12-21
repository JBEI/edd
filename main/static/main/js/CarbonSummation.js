// File last modified on: Wed Dec 21 2016 14:53:35  
/// <reference path="typescript-declarations.d.ts" />
/// <reference path="Utl.ts" />
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
    }());
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
    }());
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
    }());
    CarbonBalance.MergedLineSamples = MergedLineSamples;
    var MergedLineSample = (function () {
        function MergedLineSample(timeStamp) {
            this.totalCarbonIn = 0;
            this.totalCarbonOut = 0;
            this.timeStamp = timeStamp;
        }
        return MergedLineSample;
    }());
    CarbonBalance.MergedLineSample = MergedLineSample;
    var InOutSum = (function () {
        function InOutSum(totalIn, totalOut, measurements) {
            this.totalIn = totalIn;
            this.totalOut = totalOut;
            this.measurements = measurements;
        }
        return InOutSum;
    }());
    CarbonBalance.InOutSum = InOutSum;
    var InOutSumMeasurement = (function () {
        function InOutSumMeasurement() {
        }
        InOutSumMeasurement.prototype.absDelta = function () {
            return Math.abs(this.carbonDelta);
        };
        return InOutSumMeasurement;
    }());
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
    }());
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
    }());
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
    }());
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
    }());
    CarbonBalance.TimelineMerger = TimelineMerger;
})(CarbonBalance || (CarbonBalance = {})); // end module CarbonBalance
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiQ2FyYm9uU3VtbWF0aW9uLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiQ2FyYm9uU3VtbWF0aW9uLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLG9EQUFvRDtBQUNwRCxxREFBcUQ7QUFDckQsK0JBQStCO0FBQy9CLDhDQUE4QztBQUU5QyxJQUFPLGFBQWEsQ0F1N0JuQjtBQXY3QkQsV0FBTyxhQUFhLEVBQUMsQ0FBQztJQUNsQixZQUFZLENBQUM7SUFzQmIsNkRBQTZEO0lBQzdELCtFQUErRTtJQUMvRSxvREFBb0Q7SUFDcEQsRUFBRTtJQUNGLG9EQUFvRDtJQUNwRDtRQUFBO1lBRUksaURBQWlEO1lBQ2pELGlCQUFZLEdBQStCLEVBQUUsQ0FBQztZQUM5QyxrREFBa0Q7WUFDbEQsc0JBQWlCLEdBQVUsQ0FBQyxDQUFDO1lBRTdCLDRDQUE0QztZQUM1QyxpREFBaUQ7WUFDekMseUJBQW9CLEdBQXNCLEVBQUUsQ0FBQztZQUNyRCx3REFBd0Q7WUFDaEQsZ0NBQTJCLEdBQXNCLEVBQUUsQ0FBQztZQUM1RCwyQ0FBMkM7WUFDbkMseUNBQW9DLEdBQTRCLEVBQUUsQ0FBQztZQUluRSxpQkFBWSxHQUFVLENBQUMsQ0FBQztZQUloQyw0QkFBNEI7WUFDcEIsdUJBQWtCLEdBQVUsQ0FBQyxDQUFDO1FBNmxCMUMsQ0FBQztRQTFsQkcseUNBQXlDO1FBQ2xDLGdCQUFNLEdBQWIsVUFBYyxrQkFBeUI7WUFFbkMsSUFBSSxHQUFHLEdBQWEsSUFBSSxTQUFTLEVBQUUsQ0FBQztZQUNwQyxHQUFHLENBQUMsSUFBSSxDQUFDLGtCQUFrQixDQUFDLENBQUM7WUFDN0IsTUFBTSxDQUFDLEdBQUcsQ0FBQztRQUNmLENBQUM7UUFHRCw0RUFBNEU7UUFDckUsMkJBQWlCLEdBQXhCLFVBQXlCLGtCQUF5QixFQUMxQyxXQUFrQixFQUNsQixjQUFxQjtZQUV6QixpRkFBaUY7WUFDakYsY0FBYztZQUNkLElBQUksR0FBRyxHQUFhLElBQUksU0FBUyxFQUFFLENBQUM7WUFDcEMsR0FBRyxDQUFDLFlBQVksR0FBRyxXQUFXLENBQUM7WUFDL0IsR0FBRyxDQUFDLGVBQWUsR0FBRyxjQUFjLENBQUM7WUFDckMsR0FBRyxDQUFDLFlBQVksR0FBRyxFQUFFLENBQUM7WUFDdEIsR0FBRyxDQUFDLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO1lBRTdCLHlCQUF5QjtZQUN6QixNQUFNLENBQUMsR0FBRyxDQUFDLFlBQVksQ0FBQztRQUM1QixDQUFDO1FBR0Qsa0VBQWtFO1FBQ2xFLHVDQUFtQixHQUFuQixVQUFvQixRQUFZO1lBQzVCLE1BQU0sQ0FBQyxjQUFjLENBQUMsbUJBQW1CLENBQUMsUUFBUSxDQUFDLENBQUM7UUFDeEQsQ0FBQztRQUdELG1DQUFlLEdBQWYsVUFBZ0IsTUFBYTtZQUN6QixNQUFNLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUNyQyxDQUFDO1FBR0QsdUZBQXVGO1FBQ3ZGLDBEQUEwRDtRQUNsRCx3QkFBSSxHQUFaLFVBQWEsa0JBQXlCO1lBQXRDLGlCQXFFQztZQXBFRyxJQUFJLHdCQUF1QyxDQUFDO1lBRTVDLElBQUksQ0FBQyx1QkFBdUIsRUFBRSxDQUFDO1lBQy9CLDJDQUEyQztZQUMzQyxJQUFJLENBQUMseUJBQXlCLEdBQUcsRUFBRSxDQUFDO1lBQ3BDLENBQUMsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLGlCQUFpQixFQUFFLFVBQUMsRUFBUyxFQUFFLE9BQThCO2dCQUN4RSxJQUFJLEdBQUcsR0FBWSxLQUFJLENBQUMseUJBQXlCLENBQUMsRUFBRSxDQUFDLEdBQWEsRUFBRSxDQUFDO2dCQUNyRSxDQUFDLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxNQUFNLEVBQUUsVUFBQyxDQUFRLEVBQUUsS0FBZ0I7b0JBQzlDLDRFQUE0RTtvQkFDNUUsRUFBRSxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sS0FBSyxDQUFDLElBQUksS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDO3dCQUNqRCxHQUFHLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO29CQUNuQyxDQUFDO2dCQUNMLENBQUMsQ0FBQyxDQUFDO1lBQ1AsQ0FBQyxDQUFDLENBQUM7WUFFSCwrQ0FBK0M7WUFDL0Msd0JBQXdCLEdBQUcsSUFBSSxDQUFDLDJCQUEyQixDQUFDLGtCQUFrQixDQUFDLENBQUM7WUFFaEYsc0JBQXNCO1lBQ3RCLENBQUMsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLEtBQUssRUFBRSxVQUFDLE1BQWEsRUFBRSxJQUFlO2dCQUNqRCxJQUFJLEdBQVksRUFBRSxlQUFlLEdBQVcsS0FBSyxDQUFDO2dCQUNsRCxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO29CQUNmLE1BQU0sQ0FBQztnQkFDWCxDQUFDO2dCQUNELEdBQUcsR0FBRyxJQUFJLFFBQVEsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUM7Z0JBQzVCLEtBQUksQ0FBQyxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUMsT0FBTyxDQUFDLFVBQUMsT0FBYztvQkFDdEQsSUFBSSxLQUFLLEdBQWUsT0FBTyxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsRUFDM0MsUUFBUSxHQUFPLE9BQU8sQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxFQUMzQyxJQUFJLEdBQVUsQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLFFBQVEsQ0FBQyxJQUFJLEVBQUUsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsRUFDOUQsUUFBUSxHQUFhLElBQUksU0FBUyxDQUFDLE9BQU8sQ0FBQyxFQUMzQyxLQUFLLEdBQVUsQ0FBQyxDQUFDO29CQUNyQixLQUFJLENBQUMsZUFBZSxDQUFDLElBQUksQ0FBQyxFQUFFLEtBQUssS0FBSSxDQUFDLFlBQVksRUFBRSxRQUFRLEdBQUcsSUFBSSxDQUFDLENBQUM7b0JBQ3JFLEtBQUksQ0FBQyxrQkFBa0IsRUFBRSxDQUFDO29CQUMxQixLQUFJLENBQUMsMkJBQTJCLENBQUMsT0FBTyxDQUFDLENBQUMsT0FBTyxDQUFDLFVBQUMsU0FBZ0I7d0JBQy9ELElBQUksT0FBTyxHQUEwQixPQUFPLENBQUMsaUJBQWlCLENBQUMsU0FBUyxDQUFDLEVBQ3JFLFFBQTJCLENBQUM7d0JBQ2hDLEVBQUUsQ0FBQyxDQUFDLENBQUMsS0FBSSxDQUFDLDZCQUE2QixDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQzs0QkFDL0MsTUFBTSxDQUFDO3dCQUNYLENBQUM7d0JBQ0QsS0FBSSxDQUFDLGVBQWUsQ0FBQyxJQUFJLENBQUMsRUFBRSxLQUFLLEtBQUksQ0FBQyxZQUFZLEVBQzlDLE9BQU8sQ0FBQyxlQUFlLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDO3dCQUNoRCxLQUFJLENBQUMsa0JBQWtCLEVBQUUsQ0FBQzt3QkFDMUIsS0FBSyxFQUFFLENBQUM7d0JBQ1IsNkNBQTZDO3dCQUM3QyxRQUFRLEdBQUcsSUFBSSxrQkFBa0IsQ0FBQyxRQUFRLEVBQUUsU0FBUyxDQUFDLENBQUM7d0JBQ3ZELFFBQVEsQ0FBQyx3QkFBd0IsQ0FBQyxTQUFTLENBQUMsR0FBRyxRQUFRLENBQUM7d0JBQ3hELCtDQUErQzt3QkFDL0MsUUFBUSxDQUFDLFdBQVcsR0FBRyxLQUFJLENBQUMsMENBQTBDLENBQ2xFLEdBQUcsRUFBRSxTQUFTLEVBQUUsd0JBQXdCLEVBQUUsa0JBQWtCLENBQUMsQ0FBQzt3QkFDbEUsdUNBQXVDO3dCQUN2QyxFQUFFLENBQUMsQ0FBQyxRQUFRLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQzs0QkFDdkIsZUFBZSxHQUFHLElBQUksQ0FBQzs0QkFDdkIsS0FBSSxDQUFDLGlCQUFpQixHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsS0FBSSxDQUFDLGlCQUFpQixFQUNwRCxRQUFRLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDO3dCQUNyRCxDQUFDO3dCQUNELEtBQUksQ0FBQyxlQUFlLENBQUMsSUFBSSxDQUFDLEVBQUUsS0FBSyxLQUFJLENBQUMsWUFBWSxFQUFFLEVBQUUsQ0FBQyxDQUFDO3dCQUN4RCxLQUFJLENBQUMsa0JBQWtCLEVBQUUsQ0FBQztvQkFDOUIsQ0FBQyxDQUFDLENBQUM7b0JBQ0gsa0JBQWtCO29CQUNsQixHQUFHLENBQUMsVUFBVSxDQUFDLE9BQU8sQ0FBQyxHQUFHLFFBQVEsQ0FBQztvQkFDbkMsS0FBSSxDQUFDLGVBQWUsQ0FBQyxJQUFJLENBQUMsRUFBRSxLQUFLLEtBQUksQ0FBQyxZQUFZLEVBQUUsRUFBRSxDQUFDLENBQUM7b0JBQ3hELEtBQUksQ0FBQyxrQkFBa0IsRUFBRSxDQUFDO2dCQUM5QixDQUFDLENBQUMsQ0FBQztnQkFDSCxFQUFFLENBQUMsQ0FBQyxlQUFlLENBQUMsQ0FBQyxDQUFDO29CQUNsQixLQUFJLENBQUMsWUFBWSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsR0FBRyxHQUFHLENBQUM7Z0JBQ3JDLENBQUM7WUFDTCxDQUFDLENBQUMsQ0FBQztRQUVQLENBQUM7UUFHRCxvRUFBb0U7UUFDcEUsd0ZBQXdGO1FBQ3hGLHlDQUF5QztRQUNqQyxtQ0FBZSxHQUF2QixVQUF3QixXQUFtQixFQUFFLEdBQVU7WUFDbkQsRUFBRSxDQUFDLENBQUMsQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDO2dCQUNmLE1BQU0sQ0FBQztZQUNYLENBQUM7WUFDRCxJQUFJLE1BQU0sR0FBWSxFQUFFLENBQUM7WUFDekIsK0RBQStEO1lBQy9ELDBCQUEwQjtZQUMxQixPQUFPLElBQUksQ0FBQyxrQkFBa0IsSUFBSSxJQUFJLENBQUMsa0JBQWtCLEdBQUcsTUFBTSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUM7Z0JBQUMsQ0FBQztZQUNqRix5QkFBeUI7WUFDekIsSUFBSSxDQUFDLFlBQVksSUFBSSxNQUFNLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxHQUFHLEdBQUcsR0FBRyxJQUFJLENBQUM7UUFDdEQsQ0FBQztRQUdPLDZDQUF5QixHQUFqQyxVQUFrQyxXQUFtQixFQUFFLE1BQWEsRUFBRSxHQUFVO1lBQzVFLElBQUksR0FBRyxHQUFVLEdBQUcsQ0FBQyxFQUFFLENBQUMsYUFBYSxDQUFDLEdBQUcsR0FBRyxNQUFNLEdBQUcsSUFBSSxFQUFFLEVBQUUsQ0FBQyxDQUFDO1lBQy9ELElBQUksQ0FBQyxlQUFlLENBQUMsV0FBVyxFQUFFLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQztRQUNqRCxDQUFDO1FBR0QsaUZBQWlGO1FBQ2pGLGdEQUFnRDtRQUN4QywyQkFBTyxHQUFmLFVBQWdCLEtBQVM7WUFDckIsTUFBTSxDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDeEMsQ0FBQztRQUdELGdGQUFnRjtRQUNoRixtRkFBbUY7UUFDM0UsaURBQTZCLEdBQXJDLFVBQXNDLE9BQThCO1lBQ2hFLElBQUksS0FBSyxHQUF3QixPQUFPLENBQUMsZUFBZSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUN2RSxFQUFFLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7Z0JBQ1QsTUFBTSxDQUFDLEtBQUssQ0FBQztZQUNqQixDQUFDO1lBRUQsa0ZBQWtGO1lBQ2xGLHNGQUFzRjtZQUN0Riw2QkFBNkI7WUFDN0IsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLDRCQUE0QixDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDM0MsTUFBTSxDQUFDLElBQUksQ0FBQztZQUNoQixDQUFDO1lBQ0QsSUFBSSxPQUFPLEdBQU8sT0FBTyxDQUFDLFNBQVMsQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLENBQUM7WUFDckQsSUFBSSxLQUFLLEdBQVUsT0FBTyxHQUFHLE9BQU8sQ0FBQyxJQUFJLEdBQUcsRUFBRSxDQUFDO1lBQy9DLElBQUksV0FBVyxHQUFVLEtBQUssQ0FBQyxFQUFFLENBQUMsQ0FBQyxxQkFBcUI7WUFFeEQsRUFBRSxDQUFDLENBQUMsS0FBSyxLQUFLLEVBQUUsSUFBSSxLQUFLLEtBQUssS0FBSyxJQUFJLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQztnQkFDbEQsTUFBTSxDQUFDLEtBQUssQ0FBQztZQUNqQixDQUFDO1lBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEtBQUssS0FBSyxLQUFLLENBQUMsQ0FBQyxDQUFDO2dCQUN6QiwrREFBK0Q7Z0JBQy9ELE1BQU0sQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQztZQUN0QixDQUFDO1lBQUMsSUFBSSxDQUFDLENBQUM7Z0JBQ0osdUNBQXVDO2dCQUN2QyxNQUFNLENBQUMsQ0FBQyxLQUFLLEtBQUssVUFBVTtvQkFDeEIsS0FBSyxLQUFLLElBQUk7b0JBQ2QsS0FBSyxLQUFLLElBQUk7b0JBQ2QsS0FBSyxLQUFLLE9BQU87b0JBQ2pCLEtBQUssS0FBSyxRQUFRLENBQUMsQ0FBQztZQUM1QixDQUFDO1FBQ0wsQ0FBQztRQUVELHNEQUFzRDtRQUN0RCxpRkFBaUY7UUFDekUsMkNBQXVCLEdBQS9CLFVBQWdDLGFBQW9CLEVBQzVDLFNBQWdCLEVBQ2hCLHdCQUF1QyxFQUN2QyxrQkFBeUIsRUFDekIsSUFBWTtZQUNoQiwyREFBMkQ7WUFDM0QsZ0ZBQWdGO1lBQ2hGLHFDQUFxQztZQUNyQyxpQ0FBaUM7WUFDakMsa0NBQWtDO1lBQ2xDLGtGQUFrRjtZQUNsRixJQUFJLFdBQVcsR0FBMEIsT0FBTyxDQUFDLGlCQUFpQixDQUFDLGFBQWEsQ0FBQyxFQUM3RSxlQUFlLEdBQXdCLE9BQU8sQ0FBQyxlQUFlLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxFQUNoRixPQUFPLEdBQVksT0FBTyxDQUFDLFNBQVMsQ0FBQyxXQUFXLENBQUMsT0FBTyxDQUFDLEVBQ3pELEtBQUssR0FBVSxPQUFPLEdBQUcsT0FBTyxDQUFDLElBQUksR0FBRyxFQUFFLEVBQzFDLFdBQVcsR0FBVSxlQUFlLENBQUMsRUFBRSxFQUFFLHFCQUFxQjtZQUM5RCxVQUFVLEdBQVUsQ0FBQyxFQUNyQixPQUFPLEdBQVcsS0FBSyxFQUN2QixnQkFBZ0IsR0FBVyxJQUFJLENBQUMsNEJBQTRCLENBQUMsZUFBZSxDQUFDLEVBQzdFLEtBQUssR0FBVSxJQUFJLENBQUMseUJBQXlCLENBQUMsYUFBYSxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUM7WUFFNUUsMkRBQTJEO1lBQzNELEVBQUU7WUFDRixrRkFBa0Y7WUFDbEYsaURBQWlEO1lBQ2pELEVBQUU7WUFDRiw0RUFBNEU7WUFDNUUsRUFBRSxDQUFDLENBQUMsZ0JBQWdCLENBQUMsQ0FBQyxDQUFDO2dCQUNuQiwyRUFBMkU7Z0JBQzNFLFVBQVUsR0FBRyxLQUFLLENBQUM7Z0JBQ25CLE9BQU8sR0FBRyxJQUFJLENBQUM7WUFDbkIsQ0FBQztZQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxLQUFLLEtBQUssVUFBVSxDQUFDLENBQUMsQ0FBQztnQkFDOUIsSUFBSSxTQUFTLEdBQVksd0JBQXdCLENBQUMsYUFBYSxDQUFDLENBQUM7Z0JBQ2pFLEVBQUUsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUM7b0JBQ1osVUFBVSxHQUFHLFNBQVMsQ0FBQyxTQUFTLENBQUMsR0FBRyxJQUFJLENBQUM7b0JBQ3pDLE9BQU8sR0FBRyxDQUFDLE9BQU8sVUFBVSxLQUFLLFdBQVcsQ0FBQyxDQUFDO2dCQUNsRCxDQUFDO1lBQ0wsQ0FBQztZQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxLQUFLLEtBQUssRUFBRSxJQUFJLEtBQUssS0FBSyxLQUFLLElBQUksQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDO1lBRTdELENBQUM7WUFBQyxJQUFJLENBQUMsQ0FBQztnQkFDSiwwREFBMEQ7Z0JBQzFELEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7b0JBQ1AsSUFBSSxDQUFDLGVBQWUsQ0FBQyxJQUFJLEVBQUUsU0FBUyxHQUFHLEdBQUcsQ0FBQyxDQUFDO29CQUM1QyxJQUFJLENBQUMsa0JBQWtCLEVBQUUsQ0FBQztvQkFDMUIsSUFBSSxDQUFDLHlCQUF5QixDQUFDLElBQUksRUFBRSxXQUFXLEVBQzVDLElBQUksQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLEdBQUcsR0FBRyxHQUFHLEtBQUssQ0FBQyxDQUFDO2dCQUMzQyxDQUFDO2dCQUNELEVBQUUsQ0FBQyxDQUFDLEtBQUssS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDO29CQUNkLHdFQUF3RTtvQkFDeEUsVUFBVSxHQUFHLEtBQUssQ0FBQztvQkFDbkIsT0FBTyxHQUFHLElBQUksQ0FBQztnQkFDbkIsQ0FBQztnQkFBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUMsT0FBTyxLQUFLLEtBQUssV0FBVyxDQUFDLENBQUMsQ0FBQztvQkFDdEMseUVBQXlFO29CQUN6RSw2Q0FBNkM7b0JBQzdDLEVBQUUsQ0FBQyxDQUFDLEtBQUssS0FBSyxJQUFJLENBQUMsQ0FBQyxDQUFDO3dCQUNqQixLQUFLLEdBQUcsS0FBSyxHQUFHLElBQUksQ0FBQzt3QkFDckIsS0FBSyxHQUFHLFFBQVEsQ0FBQzt3QkFDakIsSUFBSSxDQUFDLHlCQUF5QixDQUFDLElBQUksRUFBRSxTQUFTLEVBQzFDLFlBQVksR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxHQUFHLFFBQVEsQ0FBQyxDQUFDO29CQUN2RCxDQUFDO29CQUNELDZCQUE2QjtvQkFDN0IsRUFBRSxDQUFDLENBQUMsS0FBSyxLQUFLLEtBQUssQ0FBQyxDQUFDLENBQUM7d0JBQ2xCLEVBQUUsQ0FBQyxDQUFDLENBQUMsZUFBZSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7NEJBQ3RCLCtCQUErQjs0QkFDL0IsSUFBSSxDQUFDLGVBQWUsQ0FBQyxJQUFJLEVBQUUsdUNBQXVDO2dDQUM5RCw2Q0FBNkM7Z0NBQzdDLG1DQUFtQyxDQUFDLENBQUM7d0JBQzdDLENBQUM7d0JBQUMsSUFBSSxDQUFDLENBQUM7NEJBQ0osNEJBQTRCOzRCQUM1QixLQUFLLEdBQUcsS0FBSyxHQUFHLElBQUksR0FBRyxlQUFlLENBQUMsRUFBRSxDQUFDOzRCQUMxQyxJQUFJLENBQUMseUJBQXlCLENBQUMsSUFBSSxFQUFFLHNCQUFzQixFQUN2RCxDQUFFLFdBQVcsRUFBRSxlQUFlLENBQUMsRUFBRSxFQUFFLFNBQVM7Z0NBQzVDLElBQUksQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLEVBQUUsUUFBUSxDQUFFLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7NEJBQy9DLEtBQUssR0FBRyxRQUFRLENBQUM7d0JBQ3JCLENBQUM7b0JBQ0wsQ0FBQztvQkFDRCw2QkFBNkI7b0JBQzdCLG9EQUFvRDtvQkFDcEQsK0JBQStCO29CQUMvQixFQUFFLENBQUMsQ0FBQyxLQUFLLEtBQUssUUFBUSxDQUFDLENBQUMsQ0FBQzt3QkFDckIsS0FBSyxJQUFJLFdBQVcsQ0FBQzt3QkFDckIsSUFBSSxDQUFDLHlCQUF5QixDQUFDLElBQUksRUFBRSwwQkFBMEIsRUFDM0QsS0FBSyxHQUFHLFdBQVcsR0FBRyxLQUFLLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsR0FBRyxVQUFVLENBQUMsQ0FBQzt3QkFDcEUsS0FBSyxHQUFHLFNBQVMsQ0FBQztvQkFDdEIsQ0FBQztvQkFDRCxnREFBZ0Q7b0JBQ2hELEVBQUUsQ0FBQyxDQUFDLEtBQUssS0FBSyxTQUFTLENBQUMsQ0FBQyxDQUFDO3dCQUNyQixVQUFVLEdBQUcsS0FBSyxDQUFDO3dCQUNuQixPQUFPLEdBQUcsSUFBSSxDQUFDO29CQUNwQixDQUFDO2dCQUNMLENBQUM7Z0JBQ0QsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztvQkFDUCxJQUFJLENBQUMsa0JBQWtCLEVBQUUsQ0FBQztvQkFDMUIsSUFBSSxDQUFDLGVBQWUsQ0FBQyxJQUFJLEVBQUUsRUFBRSxDQUFDLENBQUM7Z0JBQ25DLENBQUM7WUFDTCxDQUFDO1lBQ0QsbUJBQW1CO1lBQ25CLE1BQU0sQ0FBQztnQkFDSCxPQUFPLEVBQUUsT0FBTztnQkFDaEIsS0FBSyxFQUFFLFVBQVU7YUFDcEIsQ0FBQztRQUNOLENBQUM7UUFHTyxnREFBNEIsR0FBcEMsVUFBcUMsZUFBcUM7WUFDdEUsTUFBTSxDQUFDLGVBQWUsQ0FBQyxJQUFJLEtBQUssaUJBQWlCLENBQUM7UUFDdEQsQ0FBQztRQUdELHdGQUF3RjtRQUNoRiwrQ0FBMkIsR0FBbkMsVUFBb0Msa0JBQXlCO1lBQTdELGlCQXlDQztZQXhDRyxJQUFJLHdCQUF3QixHQUFrQixFQUFFLENBQUM7WUFFakQsQ0FBQyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsaUJBQWlCLEVBQ3hCLFVBQUMsU0FBZ0IsRUFBRSxPQUE4QjtnQkFDckQsSUFBSSxLQUFLLEdBQXdCLE9BQU8sQ0FBQyxlQUFlLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxFQUNsRSxXQUFrQixFQUNsQixPQUFnQixFQUNoQixLQUFZLEVBQ1osUUFBUSxHQUFZLEVBQUUsRUFDdEIsSUFBYSxFQUNiLFFBQWUsRUFDZixLQUFZLENBQUM7Z0JBQ2pCLEVBQUUsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztvQkFDVCxNQUFNLENBQUM7Z0JBQ1gsQ0FBQztnQkFDRCxXQUFXLEdBQUcsS0FBSyxDQUFDLEVBQUUsQ0FBQztnQkFDdkIsT0FBTyxHQUFHLE9BQU8sQ0FBQyxTQUFTLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxDQUFDO2dCQUM3QyxLQUFLLEdBQUcsT0FBTyxHQUFHLE9BQU8sQ0FBQyxJQUFJLEdBQUcsRUFBRSxDQUFDO2dCQUNwQyxvQ0FBb0M7Z0JBQ3BDLEVBQUUsQ0FBQyxDQUFDLEtBQUssS0FBSyxVQUFVLElBQUksQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDO29CQUN2QyxNQUFNLENBQUM7Z0JBQ1gsQ0FBQztnQkFDRCx3QkFBd0IsQ0FBQyxTQUFTLENBQUMsR0FBRyxRQUFRLENBQUM7Z0JBQy9DLG9CQUFvQjtnQkFDcEIsSUFBSSxHQUFHLEtBQUksQ0FBQyx5QkFBeUIsQ0FBQyxTQUFTLENBQUMsQ0FBQztnQkFDakQsS0FBSyxHQUFHLENBQUMsQ0FBQztnQkFDVixLQUFJLENBQUMsK0JBQStCLENBQUMsU0FBUyxDQUFDLENBQUMsT0FBTyxDQUFDLFVBQUMsSUFBVztvQkFDaEUsSUFBSSxLQUFLLEdBQVUsSUFBSSxDQUFDLElBQUksQ0FBQyxFQUFFLEVBQVMsQ0FBQztvQkFDekMsRUFBRSxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDO3dCQUNaLFFBQVEsR0FBRyxJQUFJLENBQUM7d0JBQ2hCLE1BQU0sQ0FBQztvQkFDWCxDQUFDO29CQUNELEVBQUUsR0FBRyxJQUFJLEdBQUcsUUFBUSxDQUFDO29CQUNyQixpRUFBaUU7b0JBQ2pFLEtBQUssSUFBSSxFQUFFLEdBQUcsS0FBSyxHQUFHLFdBQVcsQ0FBQztvQkFDbEMsUUFBUSxDQUFDLElBQUksQ0FBQyxHQUFHLEtBQUssQ0FBQztvQkFDdkIsUUFBUSxHQUFHLElBQUksQ0FBQztnQkFDcEIsQ0FBQyxDQUFDLENBQUM7WUFDUCxDQUFDLENBQUMsQ0FBQztZQUNILE1BQU0sQ0FBQyx3QkFBd0IsQ0FBQztRQUNwQyxDQUFDO1FBR0QsZ0VBQWdFO1FBQ3hELG1EQUErQixHQUF2QyxVQUF3QyxhQUFvQjtZQUN4RCxJQUFJLElBQUksR0FBWSxJQUFJLENBQUMseUJBQXlCLENBQUMsYUFBYSxDQUFDLENBQUM7WUFDbEUsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO2dCQUNSLE9BQU8sQ0FBQyxHQUFHLENBQUMscURBQXFELEdBQUcsYUFBYSxDQUFDLENBQUM7Z0JBQ25GLE1BQU0sQ0FBQyxFQUFFLENBQUM7WUFDZCxDQUFDO1lBQ0Qsa0ZBQWtGO1lBQ2xGLE1BQU0sQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLElBQUksRUFBRSxVQUFDLEtBQVksRUFBRSxJQUFXLElBQVksT0FBQSxVQUFVLENBQUMsSUFBSSxDQUFDLEVBQWhCLENBQWdCLENBQUMsQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQUN0RixDQUFDO1FBR0Qsb0ZBQW9GO1FBQ3BGLDRFQUE0RTtRQUNwRSw4REFBMEMsR0FBbEQsVUFBbUQsSUFBYSxFQUN4RCxhQUFvQixFQUNwQix3QkFBdUMsRUFDdkMsa0JBQXlCO1lBSGpDLGlCQWdDQztZQTVCRyxJQUFJLFdBQVcsR0FBMEIsT0FBTyxDQUFDLGlCQUFpQixDQUFDLGFBQWEsQ0FBQyxFQUM3RSxrQkFBa0IsR0FBZ0IsRUFBRSxDQUFDO1lBRXpDLElBQUksQ0FBQywrQkFBK0IsQ0FBQyxhQUFhLENBQUMsQ0FBQyxPQUFPLENBQ25ELFVBQUMsSUFBVyxFQUFFLENBQVEsRUFBRSxDQUFVO2dCQUN0QyxJQUFJLGdCQUFnQixHQUFXLEtBQUssRUFDaEMsTUFBcUIsRUFDckIsTUFBaUIsQ0FBQztnQkFDdEIsRUFBRSxDQUFDLENBQUMsS0FBSSxDQUFDLGVBQWUsSUFBSSxJQUFJLENBQUMsU0FBUyxFQUFFLEtBQUssS0FBSSxDQUFDLFlBQVksQ0FBQyxDQUFDLENBQUM7b0JBQ2pFLGtEQUFrRDtvQkFDbEQsRUFBRSxDQUFDLENBQUMsSUFBSSxLQUFLLEtBQUksQ0FBQyxlQUFlO3dCQUN6QixDQUFDLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDLE1BQU0sSUFBSSxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxLQUFLLEtBQUksQ0FBQyxlQUFlLENBQUMsQ0FBQyxDQUFDLENBQUM7d0JBQzlELGdCQUFnQixHQUFHLElBQUksQ0FBQztvQkFDNUIsQ0FBQztnQkFDTCxDQUFDO2dCQUNELE1BQU0sR0FBRyxLQUFJLENBQUMsdUJBQXVCLENBQUMsYUFBYSxFQUFFLElBQUksRUFDckQsd0JBQXdCLEVBQUUsa0JBQWtCLEVBQUUsZ0JBQWdCLENBQUMsQ0FBQztnQkFDcEUsRUFBRSxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQztvQkFDbEIsTUFBTSxDQUFDO2dCQUNYLENBQUM7Z0JBQ0QsTUFBTSxHQUFHLElBQUksVUFBVSxFQUFFLENBQUM7Z0JBQzFCLE1BQU0sQ0FBQyxTQUFTLEdBQUcsSUFBSSxDQUFDO2dCQUN4QixNQUFNLENBQUMsV0FBVyxHQUFHLE1BQU0sQ0FBQyxLQUFLLENBQUM7Z0JBQ2xDLGtCQUFrQixDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUNwQyxDQUFDLENBQUMsQ0FBQztZQUVILE1BQU0sQ0FBQyxJQUFJLENBQUMsc0JBQXNCLENBQUMsa0JBQWtCLEVBQUUsSUFBSSxFQUFFLFdBQVcsRUFDcEUsa0JBQWtCLENBQUMsQ0FBQztRQUM1QixDQUFDO1FBR0Qsb0VBQW9FO1FBQzVELDBDQUFzQixHQUE5QixVQUErQixrQkFBK0IsRUFDdEQsSUFBYSxFQUNiLFdBQWtDLEVBQ2xDLGtCQUF5QjtZQUhqQyxpQkFpRkM7WUE3RUcsSUFBSSxLQUFLLEdBQXdCLE9BQU8sQ0FBQyxlQUFlLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxFQUN0RSxnQkFBZ0IsR0FBVyxJQUFJLENBQUMsNEJBQTRCLENBQUMsS0FBSyxDQUFDLEVBQ25FLEtBQUssR0FBZSxPQUFPLENBQUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsRUFDckQsT0FBTyxHQUFjLE9BQU8sQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxFQUM3QyxRQUFRLEdBQU8sT0FBTyxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLEVBQzNDLElBQUksR0FBVSxDQUFDLE9BQU8sQ0FBQyxJQUFJLEVBQUUsUUFBUSxDQUFDLElBQUksRUFBRSxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBRXRFLCtFQUErRTtZQUMvRSxrQkFBa0IsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLFVBQUMsTUFBaUIsRUFBRSxDQUFRO2dCQUM1RCxJQUFJLElBQUksR0FBYyxrQkFBa0IsQ0FBQyxDQUFDLENBQUMsRUFDdkMsU0FBUyxHQUFVLEtBQUksQ0FBQyxjQUFjLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRSxNQUFNLENBQUMsU0FBUyxDQUFDLEVBQ3hFLGNBQXNCLEVBQUUsVUFBaUIsRUFBRSxXQUFrQixFQUM3RCxRQUFlLEVBQUUsYUFBb0IsRUFBRSxlQUFzQixDQUFDO2dCQUVsRSxjQUFjLEdBQUcsQ0FBQyxLQUFJLENBQUMsZUFBZTt1QkFDL0IsSUFBSSxDQUFDLFNBQVMsRUFBRSxLQUFLLEtBQUksQ0FBQyxZQUFZO3VCQUN0QyxNQUFNLENBQUMsU0FBUyxLQUFLLEtBQUksQ0FBQyxlQUFlLENBQUMsQ0FBQztnQkFDbEQsRUFBRSxDQUFDLENBQUMsZ0JBQWdCLENBQUMsQ0FBQyxDQUFDO29CQUNuQixtRUFBbUU7b0JBQ25FLFVBQVUsR0FBRyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLFdBQVcsR0FBRyxJQUFJLENBQUMsV0FBVyxDQUFDLEdBQUcsU0FBUyxDQUFDLENBQUM7b0JBQzNFLE1BQU0sQ0FBQyxXQUFXLEdBQUcsa0JBQWtCLEdBQUcsVUFBVSxDQUFDO29CQUNyRCxFQUFFLENBQUMsQ0FBQyxjQUFjLENBQUMsQ0FBQyxDQUFDO3dCQUNqQixLQUFJLENBQUMsZUFBZSxDQUFDLElBQUksRUFBRSwwQkFBMEIsR0FBRyxJQUFJLENBQUMsQ0FBQzt3QkFDOUQsS0FBSSxDQUFDLGtCQUFrQixFQUFFLENBQUM7d0JBQzFCLEtBQUksQ0FBQyx5QkFBeUIsQ0FBQyxJQUFJLEVBQy9CLFlBQVksR0FBRyxJQUFJLENBQUMsU0FBUyxHQUFHLEdBQUcsRUFDbkMsS0FBSSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQzt3QkFDcEMsS0FBSSxDQUFDLHlCQUF5QixDQUFDLElBQUksRUFDL0IsWUFBWSxHQUFHLE1BQU0sQ0FBQyxTQUFTLEdBQUcsR0FBRyxFQUNyQyxLQUFJLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDO3dCQUN0QyxLQUFJLENBQUMseUJBQXlCLENBQUMsSUFBSSxFQUMvQixhQUFhLEVBQ2IsTUFBTTs0QkFDRixLQUFJLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxXQUFXLENBQUMsR0FBRyxLQUFLOzRCQUN4QyxLQUFJLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUM7NEJBQ2xDLE1BQU0sR0FBRyxLQUFJLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxHQUFHLE1BQU07NEJBQ3pDLEtBQUksQ0FBQyxPQUFPLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQzt3QkFDOUIsS0FBSSxDQUFDLHlCQUF5QixDQUFDLElBQUksRUFDL0IsZ0JBQWdCLEVBQ2hCLEtBQUssR0FBRyxLQUFJLENBQUMsT0FBTyxDQUFDLGtCQUFrQixDQUFDLEdBQUcsS0FBSzs0QkFDaEQsS0FBSSxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsV0FBVyxDQUFDLEdBQUcsZUFBZSxDQUFDLENBQUM7d0JBQ3hELEtBQUksQ0FBQyxlQUFlLENBQUMsSUFBSSxFQUFFLEVBQUUsQ0FBQyxDQUFDO3dCQUMvQixLQUFJLENBQUMsa0JBQWtCLEVBQUUsQ0FBQztvQkFDOUIsQ0FBQztnQkFDTCxDQUFDO2dCQUFDLElBQUksQ0FBQyxDQUFDO29CQUNKLGdCQUFnQjtvQkFDaEIsV0FBVyxHQUFHLENBQUMsTUFBTSxDQUFDLFdBQVcsR0FBRyxJQUFJLENBQUMsV0FBVyxDQUFDLENBQUM7b0JBQ3RELFFBQVEsR0FBRyxLQUFJLENBQUMsOEJBQThCLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxTQUFTLEVBQy9ELGNBQWMsQ0FBQyxDQUFDO29CQUNwQix3QkFBd0I7b0JBQ3hCLGFBQWEsR0FBRyxDQUFDLFdBQVcsR0FBRyxTQUFTLENBQUMsQ0FBQztvQkFDMUMscUNBQXFDO29CQUNyQyxlQUFlLEdBQUcsYUFBYSxHQUFHLFFBQVEsQ0FBQztvQkFDM0MsTUFBTSxDQUFDLFdBQVcsR0FBRyxlQUFlLENBQUM7b0JBQ3JDLGdEQUFnRDtvQkFDaEQsRUFBRSxDQUFDLENBQUMsY0FBYyxDQUFDLENBQUMsQ0FBQzt3QkFDakIsS0FBSSxDQUFDLGVBQWUsQ0FBQyxJQUFJLEVBQUUseUJBQXlCLENBQUMsQ0FBQzt3QkFDdEQsS0FBSSxDQUFDLGtCQUFrQixFQUFFLENBQUM7d0JBQzFCLEtBQUksQ0FBQyx5QkFBeUIsQ0FBQyxJQUFJLEVBQy9CLGFBQWEsR0FBRyxJQUFJLENBQUMsU0FBUyxHQUFHLE9BQU8sR0FBRyxNQUFNLENBQUMsU0FBUyxHQUFHLEdBQUcsRUFDakUsS0FBSSxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsV0FBVyxDQUFDLEdBQUcsYUFBYTs0QkFDaEQsS0FBSSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLEdBQUcsYUFBYTs0QkFDOUMsS0FBSSxDQUFDLE9BQU8sQ0FBQyxXQUFXLENBQUMsR0FBRyxVQUFVLENBQUMsQ0FBQzt3QkFDNUMsS0FBSSxDQUFDLHlCQUF5QixDQUFDLElBQUksRUFDL0IsWUFBWSxFQUNaLEtBQUssR0FBRyxLQUFJLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxHQUFHLE1BQU07NEJBQ3hDLEtBQUksQ0FBQyxPQUFPLENBQUMsYUFBYSxDQUFDLEdBQUcsWUFBWSxDQUFDLENBQUM7d0JBQ2hELEtBQUksQ0FBQyx5QkFBeUIsQ0FBQyxJQUFJLEVBQy9CLFVBQVUsRUFDVixLQUFLLEdBQUcsS0FBSSxDQUFDLE9BQU8sQ0FBQyxRQUFRLENBQUMsR0FBRyxXQUFXOzRCQUM1QyxLQUFJLENBQUMsT0FBTyxDQUFDLGVBQWUsQ0FBQyxHQUFHLGNBQWMsQ0FBQyxDQUFDO3dCQUNwRCxLQUFJLENBQUMsa0JBQWtCLEVBQUUsQ0FBQztvQkFDOUIsQ0FBQztnQkFDTCxDQUFDO1lBQ0wsQ0FBQyxDQUFDLENBQUM7WUFFSCxNQUFNLENBQUMsa0JBQWtCLENBQUM7UUFDOUIsQ0FBQztRQUdELG1EQUFtRDtRQUMzQyxrQ0FBYyxHQUF0QixVQUF1QixhQUFvQixFQUFFLFdBQWtCO1lBQzNELE1BQU0sQ0FBQyxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsYUFBYSxDQUFDLENBQUM7UUFDM0MsQ0FBQztRQUdELDZEQUE2RDtRQUM3RCxrRUFBa0U7UUFDMUQsd0NBQW9CLEdBQTVCLFVBQTZCLFNBQWdCLEVBQUUsUUFBaUI7WUFDNUQsa0VBQWtFO1lBQ2xFLElBQUksS0FBSyxHQUFPO2dCQUNaLE9BQU8sRUFBRSxRQUFRLENBQUMsTUFBTSxHQUFHLENBQUM7Z0JBQzVCLEdBQUcsRUFBRSxDQUFDO2FBQ1QsQ0FBQztZQUNGLFFBQVEsQ0FBQyxJQUFJLENBQUMsVUFBQyxJQUFXLEVBQUUsQ0FBUTtnQkFDaEMsSUFBSSxJQUFXLENBQUM7Z0JBQ2hCLEVBQUUsQ0FBQyxDQUFDLFNBQVMsSUFBSSxJQUFJLENBQUMsQ0FBQyxDQUFDO29CQUNwQixFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO3dCQUNKLEtBQUssQ0FBQyxLQUFLLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQzt3QkFDcEIsSUFBSSxHQUFHLFFBQVEsQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUM7d0JBQzdCLEtBQUssQ0FBQyxDQUFDLEdBQUcsQ0FBQyxTQUFTLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDLENBQUM7b0JBQ2pELENBQUM7b0JBQUMsSUFBSSxDQUFDLENBQUM7d0JBQ0osS0FBSyxDQUFDLEtBQUssR0FBRyxDQUFDLENBQUM7d0JBQ2hCLEtBQUssQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDO29CQUNoQixDQUFDO29CQUNELE1BQU0sQ0FBQyxJQUFJLENBQUM7Z0JBQ2hCLENBQUM7Z0JBQ0QsTUFBTSxDQUFDLEtBQUssQ0FBQztZQUNqQixDQUFDLENBQUMsQ0FBQztZQUNILE1BQU0sQ0FBQyxLQUFLLENBQUM7UUFDakIsQ0FBQztRQUdELHlGQUF5RjtRQUN6Rix3RkFBd0Y7UUFDeEYsMENBQTBDO1FBQ2xDLGtEQUE4QixHQUF0QyxVQUF1QyxJQUFhLEVBQzVDLFNBQWdCLEVBQ2hCLGNBQXNCO1lBQzFCLDJCQUEyQjtZQUMzQixJQUFJLFdBQVcsR0FBVSxJQUFJLENBQUMsb0NBQW9DLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRSxDQUFDO1lBQ2hGLHdFQUF3RTtZQUN4RSxVQUFVLEdBQVksSUFBSSxDQUFDLCtCQUErQixDQUFDLFdBQVcsQ0FBQyxFQUN2RSxVQUFVLEdBQU8sSUFBSSxDQUFDLG9CQUFvQixDQUFDLFNBQVMsRUFBRSxVQUFVLENBQUM7WUFDakUseURBQXlEO1lBQ3pELElBQUksR0FBWSxJQUFJLENBQUMseUJBQXlCLENBQUMsV0FBVyxDQUFDLEVBQzNELENBQUMsR0FBVSxVQUFVLENBQUMsQ0FBQyxFQUN2QixLQUFLLEdBQVUsSUFBSSxDQUFDLFVBQVUsQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDLENBQUMsRUFDakQsS0FBSyxHQUFVLElBQUksQ0FBQyxVQUFVLENBQUMsVUFBVSxDQUFDLEtBQUssR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUNyRCxhQUFhLEdBQVUsS0FBSyxHQUFHLENBQUMsS0FBSyxHQUFHLEtBQUssQ0FBQyxHQUFHLENBQUM7WUFDbEQsNERBQTREO1lBQzVELG1GQUFtRjtZQUNuRixhQUFhLEdBQVUsSUFBSSxFQUMzQixVQUFVLEdBQVUsYUFBYSxHQUFHLGFBQWE7WUFDakQsNERBQTREO1lBQzVELE9BQThCLEVBQUUsS0FBaUIsRUFBRSxPQUFrQixFQUNyRSxRQUFZLEVBQUUsSUFBVyxDQUFDO1lBRTlCLDBDQUEwQztZQUMxQyxFQUFFLENBQUMsQ0FBQyxjQUFjLENBQUMsQ0FBQyxDQUFDO2dCQUNqQixPQUFPLEdBQUcsT0FBTyxDQUFDLGlCQUFpQixDQUFDLFdBQVcsQ0FBQyxDQUFDO2dCQUNqRCxLQUFLLEdBQUcsT0FBTyxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLENBQUM7Z0JBQ3RDLE9BQU8sR0FBRyxPQUFPLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztnQkFDbkMsUUFBUSxHQUFHLE9BQU8sQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDO2dCQUN4QyxJQUFJLEdBQUcsQ0FBQyxPQUFPLENBQUMsSUFBSSxFQUFFLFFBQVEsQ0FBQyxJQUFJLEVBQUUsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztnQkFDM0QsSUFBSSxDQUFDLGVBQWUsQ0FBQyxJQUFJLEVBQUUsK0JBQStCLEdBQUcsSUFBSSxDQUFDLENBQUM7Z0JBQ25FLElBQUksQ0FBQyxrQkFBa0IsRUFBRSxDQUFDO2dCQUMxQixFQUFFLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztvQkFDVixJQUFJLENBQUMseUJBQXlCLENBQUMsSUFBSSxFQUMvQixlQUFlLEdBQUcsVUFBVSxDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsR0FBRyxHQUFHLEVBQ3BELElBQUksQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztnQkFDN0IsQ0FBQztnQkFDRCxFQUFFLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztvQkFDVixJQUFJLENBQUMseUJBQXlCLENBQUMsSUFBSSxFQUMvQixlQUFlLEdBQUcsVUFBVSxDQUFDLFVBQVUsQ0FBQyxLQUFLLEdBQUcsQ0FBQyxDQUFDLEdBQUcsR0FBRyxFQUN4RCxJQUFJLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7Z0JBQzdCLENBQUM7Z0JBQ0QsRUFBRSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztvQkFDckIsSUFBSSxDQUFDLHlCQUF5QixDQUFDLElBQUksRUFDL0IsY0FBYyxHQUFHLENBQUMsQ0FBQyxHQUFHLEdBQUcsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsR0FBRyxHQUFHLEVBQzNDLElBQUksQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLEdBQUcsTUFBTSxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLEdBQUcsS0FBSzt3QkFDMUQsSUFBSSxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsR0FBRyxHQUFHLEdBQUcsS0FBSyxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLEdBQUcsS0FBSzt3QkFDM0QsSUFBSSxDQUFDLE9BQU8sQ0FBQyxhQUFhLENBQUMsR0FBRyxRQUFRLENBQUMsQ0FBQztnQkFDL0MsQ0FBQztnQkFFRixJQUFJLENBQUMseUJBQXlCLENBQUMsSUFBSSxFQUMvQixrQkFBa0IsRUFDbEIsS0FBSyxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUMsYUFBYSxDQUFDLEdBQUcsS0FBSztvQkFDM0MsSUFBSSxDQUFDLE9BQU8sQ0FBQyxVQUFVLENBQUMsR0FBRyxRQUFRLENBQUMsQ0FBQztnQkFDekMsSUFBSSxDQUFDLGVBQWUsQ0FBQyxJQUFJLEVBQUUsRUFBRSxDQUFDLENBQUM7Z0JBQy9CLElBQUksQ0FBQyxrQkFBa0IsRUFBRSxDQUFDO1lBQzlCLENBQUM7WUFFRCxNQUFNLENBQUMsVUFBVSxDQUFDO1FBQ3RCLENBQUM7UUFHRCwyRUFBMkU7UUFDbkUsd0RBQW9DLEdBQTVDLFVBQTZDLE1BQWE7WUFDdEQsSUFBSSxXQUFXLEdBQVUsSUFBSSxDQUFDLG9DQUFvQyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1lBQzNFLEVBQUUsQ0FBQyxDQUFDLE9BQU8sV0FBVyxLQUFLLFdBQVcsQ0FBQyxDQUFDLENBQUM7Z0JBQ3JDLE1BQU0sQ0FBQyxXQUFXLENBQUM7WUFDdkIsQ0FBQztZQUFDLElBQUksQ0FBQyxDQUFDO2dCQUNKLE9BQU8sQ0FBQyxHQUFHLENBQUMsNkNBQTZDO29CQUNyRCxPQUFPLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDO2dCQUNoQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDZCxDQUFDO1FBQ0wsQ0FBQztRQUdELGtGQUFrRjtRQUNsRixpREFBaUQ7UUFDekMsMkNBQXVCLEdBQS9CO1lBQUEsaUJBeUJDO1lBeEJHLENBQUMsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLEtBQUssRUFBRSxVQUFDLEdBQVUsRUFBRSxJQUFlO2dCQUM5QyxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQztvQkFDZCxLQUFJLENBQUMsb0JBQW9CLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxHQUFHLEVBQUUsQ0FBQztnQkFDNUMsQ0FBQztZQUNMLENBQUMsQ0FBQyxDQUFDO1lBQ0gsQ0FBQyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsTUFBTSxFQUFFLFVBQUMsR0FBVSxFQUFFLEtBQWlCO2dCQUNqRCxJQUFJLElBQUksR0FBWSxLQUFJLENBQUMsb0JBQW9CLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDO2dCQUN6RCxFQUFFLENBQUMsQ0FBQyxLQUFLLENBQUMsTUFBTSxJQUFJLElBQUksQ0FBQyxDQUFDLENBQUM7b0JBQ3ZCLElBQUksQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxDQUFDO29CQUNwQixLQUFJLENBQUMsMkJBQTJCLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxHQUFHLEVBQUUsQ0FBQztnQkFDcEQsQ0FBQztZQUNMLENBQUMsQ0FBQyxDQUFDO1lBQ0gsQ0FBQyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsaUJBQWlCLEVBQUUsVUFBQyxHQUFVLEVBQ3JDLE9BQThCO2dCQUNsQyxJQUFJLElBQUksR0FBWSxLQUFJLENBQUMsMkJBQTJCLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxFQUMvRCxJQUFJLEdBQXlCLE9BQU8sQ0FBQyxnQkFBZ0IsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLEVBQ25FLEtBQUssR0FBZSxPQUFPLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQztnQkFDdEQsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztvQkFDUCxJQUFJLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUMsQ0FBQztvQkFDdEIsRUFBRSxDQUFDLENBQUMsSUFBSSxJQUFJLEtBQUksQ0FBQyw0QkFBNEIsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7d0JBQ2xELEtBQUksQ0FBQyxvQ0FBb0MsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLEdBQUcsT0FBTyxDQUFDLEVBQUUsQ0FBQztvQkFDdEUsQ0FBQztnQkFDTCxDQUFDO1lBQ0wsQ0FBQyxDQUFDLENBQUM7UUFDUCxDQUFDO1FBQ0wsZ0JBQUM7SUFBRCxDQUFDLEFBbm5CRCxJQW1uQkM7SUFubkJZLHVCQUFTLFlBbW5CckIsQ0FBQTtJQVVELDBEQUEwRDtJQUMxRDtRQUlJLGtCQUFZLE1BQWE7WUFIekIsZUFBVSxHQUE0QixFQUFFLENBQUM7WUFJckMsSUFBSSxDQUFDLE9BQU8sR0FBRyxNQUFNLENBQUM7UUFDMUIsQ0FBQztRQUVELDRCQUFTLEdBQVQ7WUFDSSxNQUFNLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQztRQUN4QixDQUFDO1FBRUQsa0RBQWtEO1FBQ2xELHdEQUF3RDtRQUN4RCx5RkFBeUY7UUFDekYsMENBQXVCLEdBQXZCLFVBQXdCLFNBQWdCO1lBQ3BDLElBQUksY0FBYyxHQUFlLEVBQUUsQ0FBQztZQUNwQyx5REFBeUQ7WUFDekQsQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsVUFBVSxFQUFFLFVBQUMsSUFBVyxFQUFFLEtBQWU7Z0JBQ2pELElBQUksU0FBUyxHQUFrQyxFQUFFLEVBQzdDLFFBQVEsR0FBVSxDQUFDLEVBQ25CLFFBQWtCLENBQUM7Z0JBQ3ZCLENBQUMsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLHdCQUF3QixFQUM3QixVQUFDLElBQVcsRUFBRSxRQUEyQjtvQkFDN0MsSUFBSSxNQUFNLEdBQU8sUUFBUSxDQUFDLHFCQUFxQixDQUFDLFNBQVMsQ0FBQyxFQUN0RCxXQUE4QixDQUFDO29CQUNuQyxFQUFFLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO3dCQUNULFdBQVcsR0FBRyxJQUFJLGtCQUFrQixDQUFDLEtBQUssRUFBRSxRQUFRLENBQUMsU0FBUyxDQUFDLENBQUM7d0JBQ2hFLFdBQVcsQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO3dCQUNyQyxTQUFTLENBQUMsUUFBUSxDQUFDLFNBQVMsQ0FBQyxHQUFHLFdBQVcsQ0FBQzt3QkFDNUMsRUFBRSxRQUFRLENBQUM7b0JBQ2YsQ0FBQztnQkFDTCxDQUFDLENBQUMsQ0FBQztnQkFDSCxFQUFFLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDO29CQUNYLFFBQVEsR0FBRyxJQUFJLFNBQVMsQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUM7b0JBQ3hDLFFBQVEsQ0FBQyx3QkFBd0IsR0FBRyxTQUFTLENBQUM7b0JBQzlDLGNBQWMsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUM7Z0JBQ2xDLENBQUM7WUFDTCxDQUFDLENBQUMsQ0FBQztZQUNILE1BQU0sQ0FBQyxjQUFjLENBQUM7UUFDMUIsQ0FBQztRQUVELGtGQUFrRjtRQUNsRixvQ0FBaUIsR0FBakIsVUFBa0IsU0FBZ0I7WUFDOUIsNkJBQTZCO1lBQzdCLElBQUksWUFBWSxHQUF5QixFQUFFLEVBQ3ZDLE9BQU8sR0FBVSxDQUFDLEVBQ2xCLFFBQVEsR0FBVSxDQUFDLENBQUM7WUFDeEIsQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsVUFBVSxFQUFFLFVBQUMsR0FBVSxFQUFFLEtBQWU7Z0JBQ2hELENBQUMsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLHdCQUF3QixFQUFFLFVBQUMsR0FBVSxFQUMxQyxRQUEyQjtvQkFDL0IsSUFBSSxLQUFLLEdBQXVCLElBQUksbUJBQW1CLEVBQUUsQ0FBQztvQkFDMUQsS0FBSyxDQUFDLFFBQVEsR0FBRyxLQUFLLENBQUMsd0JBQXdCLENBQUMsUUFBUSxDQUFDLFNBQVMsQ0FBQyxDQUFDO29CQUNwRSxLQUFLLENBQUMsV0FBVyxHQUFHLEtBQUssQ0FBQyxRQUFRLENBQUMsc0JBQXNCLENBQUMsU0FBUyxDQUFDLENBQUM7b0JBQ3JFLEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxXQUFXLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQzt3QkFDeEIsUUFBUSxJQUFJLEtBQUssQ0FBQyxXQUFXLENBQUM7b0JBQ2xDLENBQUM7b0JBQUMsSUFBSSxDQUFDLENBQUM7d0JBQ0osT0FBTyxJQUFJLEtBQUssQ0FBQyxXQUFXLENBQUM7b0JBQ2pDLENBQUM7b0JBQ0QsWUFBWSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQztnQkFDN0IsQ0FBQyxDQUFDLENBQUM7WUFDUCxDQUFDLENBQUMsQ0FBQztZQUNILE1BQU0sQ0FBQyxJQUFJLFFBQVEsQ0FBQyxPQUFPLEVBQUUsUUFBUSxFQUFFLFlBQVksQ0FBQyxDQUFDO1FBQ3pELENBQUM7UUFDTCxlQUFDO0lBQUQsQ0FBQyxBQWhFRCxJQWdFQztJQWhFWSxzQkFBUSxXQWdFcEIsQ0FBQTtJQUVELDhFQUE4RTtJQUM5RSwyREFBMkQ7SUFDM0Q7UUFBQTtZQUNJLCtFQUErRTtZQUMvRSxzQkFBaUIsR0FBc0IsRUFBRSxDQUFDO1lBRTFDLDRGQUE0RjtZQUM1Rix3QkFBbUIsR0FBd0IsRUFBRSxDQUFDO1FBQ2xELENBQUM7UUFBRCx3QkFBQztJQUFELENBQUMsQUFORCxJQU1DO0lBTlksK0JBQWlCLG9CQU03QixDQUFBO0lBRUQ7UUFLSSwwQkFBWSxTQUFnQjtZQUg1QixrQkFBYSxHQUFVLENBQUMsQ0FBQztZQUN6QixtQkFBYyxHQUFVLENBQUMsQ0FBQztZQUd0QixJQUFJLENBQUMsU0FBUyxHQUFHLFNBQVMsQ0FBQztRQUMvQixDQUFDO1FBQ0wsdUJBQUM7SUFBRCxDQUFDLEFBUkQsSUFRQztJQVJZLDhCQUFnQixtQkFRNUIsQ0FBQTtJQUVEO1FBS0ksa0JBQVksT0FBYyxFQUFFLFFBQWUsRUFBRSxZQUFrQztZQUMzRSxJQUFJLENBQUMsT0FBTyxHQUFHLE9BQU8sQ0FBQztZQUN2QixJQUFJLENBQUMsUUFBUSxHQUFHLFFBQVEsQ0FBQztZQUN6QixJQUFJLENBQUMsWUFBWSxHQUFHLFlBQVksQ0FBQztRQUNyQyxDQUFDO1FBQ0wsZUFBQztJQUFELENBQUMsQUFWRCxJQVVDO0lBVlksc0JBQVEsV0FVcEIsQ0FBQTtJQUVEO1FBQUE7UUFPQSxDQUFDO1FBSEcsc0NBQVEsR0FBUjtZQUNJLE1BQU0sQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsQ0FBQztRQUN0QyxDQUFDO1FBQ0wsMEJBQUM7SUFBRCxDQUFDLEFBUEQsSUFPQztJQVBZLGlDQUFtQixzQkFPL0IsQ0FBQTtJQUVEO1FBSUksbUJBQVksT0FBYztZQUgxQiw2QkFBd0IsR0FBa0MsRUFBRSxDQUFDO1lBSXpELElBQUksQ0FBQyxPQUFPLEdBQUcsT0FBTyxDQUFDO1FBQzNCLENBQUM7UUFFRCxxRUFBcUU7UUFDckUsNkRBQTZEO1FBQzdELDZDQUF5QixHQUF6QixVQUEwQixTQUFnQjtZQUN0QyxNQUFNLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsd0JBQXdCLEVBQUUsVUFBQyxRQUEyQjtnQkFDcEUsSUFBSSxNQUFNLEdBQWMsUUFBUSxDQUFDLHFCQUFxQixDQUFDLFNBQVMsQ0FBQyxDQUFDO2dCQUNsRSxFQUFFLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO29CQUNULE1BQU0sQ0FBQzt3QkFDSCxlQUFlLEVBQUUsUUFBUSxDQUFDLFNBQVM7d0JBQ25DLFlBQVksRUFBRSxNQUFNO3FCQUN2QixDQUFDO2dCQUNOLENBQUM7WUFDTCxDQUFDLENBQUMsQ0FBQztRQUNQLENBQUM7UUFDTCxnQkFBQztJQUFELENBQUMsQUFyQkQsSUFxQkM7SUFyQlksdUJBQVMsWUFxQnJCLENBQUE7SUFFRDtRQUtJLDRCQUFZLEtBQWUsRUFBRSxhQUFvQjtZQUhqRCxnQkFBVyxHQUFnQixFQUFFLENBQUM7WUFJMUIscURBQXFEO1lBQ3JELG1GQUFtRjtZQUNuRixJQUFJLENBQUMsS0FBSyxHQUFHLEtBQUssQ0FBQztZQUNuQixJQUFJLENBQUMsU0FBUyxHQUFHLGFBQWEsQ0FBQztRQUNuQyxDQUFDO1FBRUQsbUZBQW1GO1FBQ25GLHFGQUFxRjtRQUNyRixtQkFBbUI7UUFDbkIsbURBQXNCLEdBQXRCLFVBQXVCLFNBQWdCO1lBQ25DLElBQUksSUFBZSxFQUFFLEtBQVksQ0FBQztZQUNsQyxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLE1BQU0sS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUNoQyxNQUFNLENBQUMsQ0FBQyxDQUFDO1lBQ2IsQ0FBQztZQUNELDhFQUE4RTtZQUM5RSxnQkFBZ0I7WUFDaEIsSUFBSSxHQUFHLElBQUksQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDM0IsRUFBRSxDQUFDLENBQUMsU0FBUyxJQUFJLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDO2dCQUM5QixNQUFNLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxXQUFXLENBQUM7WUFDM0MsQ0FBQztZQUNELElBQUksQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLFVBQUMsTUFBaUI7Z0JBQ3BDLEVBQUUsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxTQUFTLEtBQUssU0FBUyxDQUFDLENBQUMsQ0FBQztvQkFDakMsS0FBSyxHQUFHLE1BQU0sQ0FBQyxXQUFXLENBQUM7b0JBQzNCLE1BQU0sQ0FBQyxJQUFJLENBQUM7Z0JBQ2hCLENBQUM7Z0JBQ0QsRUFBRSxDQUFDLENBQUMsU0FBUyxJQUFJLElBQUksQ0FBQyxTQUFTLElBQUksU0FBUyxJQUFJLE1BQU0sQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDO29CQUMvRCxLQUFLLEdBQUcsR0FBRyxDQUFDLEVBQUUsQ0FBQyxVQUFVLENBQUMsU0FBUyxFQUFFLElBQUksQ0FBQyxTQUFTLEVBQUUsTUFBTSxDQUFDLFNBQVMsRUFDakUsSUFBSSxDQUFDLFdBQVcsRUFBRSxNQUFNLENBQUMsV0FBVyxDQUFDLENBQUM7b0JBQzFDLE1BQU0sQ0FBQyxJQUFJLENBQUM7Z0JBQ2hCLENBQUM7Z0JBQ0QsSUFBSSxHQUFHLE1BQU0sQ0FBQztZQUNsQixDQUFDLENBQUMsQ0FBQztZQUNILEVBQUUsQ0FBQyxDQUFDLEtBQUssS0FBSyxTQUFTLENBQUMsQ0FBQyxDQUFDO2dCQUN0Qiw4REFBOEQ7Z0JBQzlELE1BQU0sQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLFdBQVcsQ0FBQztZQUNyRCxDQUFDO1lBQ0QsTUFBTSxDQUFDLEtBQUssQ0FBQztRQUNqQixDQUFDO1FBRUQsK0JBQStCO1FBQy9CLGtEQUFxQixHQUFyQixVQUFzQixTQUFnQjtZQUNsQyxJQUFJLE9BQW9CLENBQUM7WUFDekIsT0FBTyxHQUFHLElBQUksQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUM3QixVQUFDLE1BQWlCLElBQWEsT0FBQSxNQUFNLENBQUMsU0FBUyxLQUFLLFNBQVMsRUFBOUIsQ0FBOEIsQ0FBQyxDQUFDO1lBQ25FLEVBQUUsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO2dCQUNqQixNQUFNLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ3RCLENBQUM7WUFDRCxNQUFNLENBQUMsSUFBSSxDQUFDO1FBQ2hCLENBQUM7UUFFTCx5QkFBQztJQUFELENBQUMsQUF4REQsSUF3REM7SUF4RFksZ0NBQWtCLHFCQXdEOUIsQ0FBQTtJQUVELHFEQUFxRDtJQUNyRDtRQUFBO1lBQ0ksV0FBVztZQUNYLGNBQVMsR0FBVSxDQUFDLENBQUM7WUFDckIsZ0RBQWdEO1lBQ2hELHNDQUFzQztZQUN0QyxnQkFBVyxHQUFVLENBQUMsQ0FBQztZQUN2QixlQUFlO1lBQ2YsZ0ZBQWdGO1lBQ2hGLHdGQUF3RjtZQUN4Rix5QkFBeUI7WUFDekIsdUZBQXVGO1lBQ3ZGLDBCQUEwQjtZQUMxQixnQkFBVyxHQUFVLENBQUMsQ0FBQztRQWUzQixDQUFDO1FBYkcsNEJBQU8sR0FBUDtZQUNJLE1BQU0sQ0FBQyxJQUFJLENBQUMsV0FBVyxJQUFJLENBQUMsQ0FBQztRQUNqQyxDQUFDO1FBRUQsNkJBQVEsR0FBUjtZQUNJLE1BQU0sQ0FBQyxJQUFJLENBQUMsV0FBVyxHQUFHLENBQUMsQ0FBQztRQUNoQyxDQUFDO1FBRUQsdUZBQXVGO1FBQ3ZGLCtCQUErQjtRQUMvQiw2QkFBUSxHQUFSO1lBQ0ksTUFBTSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxDQUFDO1FBQ3RDLENBQUM7UUFDTCxpQkFBQztJQUFELENBQUMsQUEzQkQsSUEyQkM7SUEzQlksd0JBQVUsYUEyQnRCLENBQUE7SUFNRCw4RkFBOEY7SUFDOUYsMEZBQTBGO0lBQzFGLGlCQUFpQjtJQUNqQjtRQUFBO1FBMERBLENBQUM7UUF4REcsb0ZBQW9GO1FBQ3BGLDJGQUEyRjtRQUM3RSxrQ0FBbUIsR0FBakMsVUFBa0MsUUFBaUI7WUFDL0MsSUFBSSxpQkFBaUIsR0FBcUIsSUFBSSxpQkFBaUIsRUFBRTtZQUM3RCxtRkFBbUY7WUFDbkYsZ0NBQWdDO1lBQ2hDLGVBQWUsR0FBdUIsRUFBRSxFQUN4QyxhQUFhLEdBQThDLEVBQUUsQ0FBQztZQUVsRSxDQUFDLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxVQUFVLEVBQUUsVUFBQyxJQUFXLEVBQUUsS0FBZTtnQkFDckQsQ0FBQyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsd0JBQXdCLEVBQzdCLFVBQUMsSUFBVyxFQUFFLFFBQTJCO29CQUM3QyxpQkFBaUIsQ0FBQyxtQkFBbUIsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUM7b0JBQ3JELEVBQUUsQ0FBQyxDQUFDLGNBQWMsQ0FBQyxlQUFlLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDO3dCQUN4QyxRQUFRLENBQUMsV0FBVyxDQUFDLE9BQU8sQ0FBQyxVQUFDLE1BQWlCOzRCQUMzQyxlQUFlLENBQUMsTUFBTSxDQUFDLFNBQVMsQ0FBQyxHQUFHLE1BQU0sQ0FBQyxTQUFTLENBQUM7d0JBQ3pELENBQUMsQ0FBQyxDQUFDO29CQUNQLENBQUM7Z0JBQ0wsQ0FBQyxDQUFDLENBQUM7WUFDUCxDQUFDLENBQUMsQ0FBQztZQUNILENBQUMsQ0FBQyxJQUFJLENBQUMsZUFBZSxFQUFFLFVBQUMsR0FBVSxFQUFFLFNBQWdCO2dCQUNqRCxJQUFJLFNBQTBCLEVBQUUsU0FBOEIsQ0FBQztnQkFDL0QsRUFBRSxDQUFDLENBQUMsU0FBUyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7b0JBQ2xCLE1BQU0sQ0FBQztnQkFDWCxDQUFDO2dCQUNELFNBQVMsR0FBRyxJQUFJLGdCQUFnQixDQUFDLFNBQVMsQ0FBQyxDQUFDO2dCQUM1QyxhQUFhLENBQUMsU0FBUyxDQUFDLEdBQUcsU0FBUyxDQUFDO2dCQUNyQyxTQUFTLEdBQUcsaUJBQWlCLENBQUMsbUJBQW1CLENBQUM7Z0JBQ2xELFNBQVMsQ0FBQyxPQUFPLENBQUMsVUFBQyxRQUEyQjtvQkFDMUMsSUFBSSxXQUFXLEdBQVUsUUFBUSxDQUFDLHNCQUFzQixDQUFDLFNBQVMsQ0FBQyxDQUFDO29CQUNwRSxFQUFFLENBQUMsQ0FBQyxXQUFXLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQzt3QkFDbEIsU0FBUyxDQUFDLGNBQWMsSUFBSSxXQUFXLENBQUM7b0JBQzVDLENBQUM7b0JBQUMsSUFBSSxDQUFDLENBQUM7d0JBQ0osU0FBUyxDQUFDLGFBQWEsSUFBSSxXQUFXLENBQUM7b0JBQzNDLENBQUM7Z0JBQ0wsQ0FBQyxDQUFDLENBQUM7WUFDUCxDQUFDLENBQUMsQ0FBQztZQUNILGdDQUFnQztZQUNoQyxpQkFBaUIsQ0FBQyxpQkFBaUIsR0FBRyxDQUFDLENBQUMsR0FBRyxDQUN2QyxhQUFhLEVBQ2IsVUFBQyxNQUF1QixJQUFzQixPQUFBLE1BQU0sRUFBTixDQUFNLENBQ3ZELENBQUMsSUFBSSxDQUFDLFVBQUMsQ0FBa0IsRUFBRSxDQUFrQjtnQkFDMUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxTQUFTLEdBQUcsQ0FBQyxDQUFDLFNBQVMsQ0FBQztZQUNyQyxDQUFDLENBQUMsQ0FBQztZQUNILE1BQU0sQ0FBQyxpQkFBaUIsQ0FBQztRQUM3QixDQUFDO1FBRUQsdUZBQXVGO1FBQ3ZGLHdGQUF3RjtRQUN4RixzQkFBc0I7UUFDUCw4QkFBZSxHQUE5QixVQUErQixLQUFlO1lBQzFDLElBQUksZUFBZSxHQUFlLE9BQU8sQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxFQUMzRCxRQUFRLEdBQU8sT0FBTyxDQUFDLFNBQVMsQ0FBQyxlQUFlLENBQUMsR0FBRyxDQUFDLENBQUM7WUFDMUQsZ0JBQWdCO1lBQ2hCLE1BQU0sQ0FBQyxDQUFDLFFBQVEsQ0FBQyxJQUFJLEtBQUssUUFBUSxDQUFDLENBQUM7UUFDeEMsQ0FBQztRQUNMLHFCQUFDO0lBQUQsQ0FBQyxBQTFERCxJQTBEQztJQTFEWSw0QkFBYyxpQkEwRDFCLENBQUE7QUFFTCxDQUFDLEVBdjdCTSxhQUFhLEtBQWIsYUFBYSxRQXU3Qm5CLENBQUMsMkJBQTJCIiwic291cmNlc0NvbnRlbnQiOlsiLy8gRmlsZSBsYXN0IG1vZGlmaWVkIG9uOiBXZWQgRGVjIDIxIDIwMTYgMTQ6NTM6MzUgIFxuLy8vIDxyZWZlcmVuY2UgcGF0aD1cInR5cGVzY3JpcHQtZGVjbGFyYXRpb25zLmQudHNcIiAvPlxuLy8vIDxyZWZlcmVuY2UgcGF0aD1cIlV0bC50c1wiIC8+XG4vLy8gPHJlZmVyZW5jZSBwYXRoPVwiU3R1ZHlDYXJib25CYWxhbmNlLnRzXCIgLz5cblxubW9kdWxlIENhcmJvbkJhbGFuY2Uge1xuICAgICd1c2Ugc3RyaWN0JztcblxuICAgIGludGVyZmFjZSBWYWxpZGF0ZWRWYWx1ZSB7XG4gICAgICAgIGlzVmFsaWQ6Ym9vbGVhbjtcbiAgICAgICAgdmFsdWU6bnVtYmVyO1xuICAgIH1cblxuICAgIC8vIHZhbHVlcyBieSB0aW1lIHNlcmllc1xuICAgIGludGVyZmFjZSBJbnRlZ3JhbCB7XG4gICAgICAgIFt0aW1lOm51bWJlcl06IG51bWJlcjtcbiAgICB9XG5cbiAgICAvLyBzdG9yZSB0aW1lIHNlcmllcyBieSBtZWFzdXJlbWVudCBJRCAob3Igc2ltaWxhciBJRClcbiAgICBpbnRlcmZhY2UgSW50ZWdyYWxMb29rdXAge1xuICAgICAgICBbaWQ6bnVtYmVyXTogSW50ZWdyYWw7XG4gICAgfVxuXG4gICAgLy8gc3RvcmUgYSBsaXN0IG9mIElEcyByZWFjaGFibGUgZnJvbSBhbm90aGVyIElEXG4gICAgaW50ZXJmYWNlIElETG9va3VwIHtcbiAgICAgICAgW2lkOm51bWJlcl06IG51bWJlcltdO1xuICAgIH1cblxuICAgIC8vIFRoaXMgaXMgdGhlIGNsaWVudC1zaWRlIGNvbnRhaW5lciBmb3IgY2FyYm9uIGJhbGFuY2UgZGF0YS5cbiAgICAvLyBJdCBjb21icyB0aHJvdWdoIGxpbmVzL2Fzc2F5cy9tZWFzdXJlbWVudHMgdG8gYnVpbGQgYSBzdHJ1Y3R1cmUgdGhhdCBpcyBlYXN5XG4gICAgLy8gdG8gcHVsbCBmcm9tIHdoZW4gZGlzcGxheWluZyBjYXJib24gYmFsYW5jZSBkYXRhLlxuICAgIC8vXG4gICAgLy8gVGhpcyBpcyBwdXJlbHkgYSBkYXRhIGNsYXNzLCBOT1QgYSBkaXNwbGF5IGNsYXNzLlxuICAgIGV4cG9ydCBjbGFzcyBTdW1tYXRpb24ge1xuXG4gICAgICAgIC8vIERhdGEgZm9yIGVhY2ggbGluZSBvZiB0eXBlIFN1bW1hdGlvbi5MaW5lRGF0YS5cbiAgICAgICAgbGluZURhdGFCeUlEOiB7W2xpbmVJRDpudW1iZXJdOkxpbmVEYXRhfSA9IHt9O1xuICAgICAgICAvLyBUaGUgaGlnaGVzdCB0aW1lIHZhbHVlIHRoYXQgYW55IFRpbWVTYW1wbGUgaGFzLlxuICAgICAgICBsYXN0VGltZUluU2Vjb25kczpudW1iZXIgPSAwO1xuXG4gICAgICAgIC8vIFByZWNhbGN1bGF0ZWQgbG9va3VwcyB0byBzcGVlZCB0aGluZ3MgdXAuXG4gICAgICAgIC8vIEFuIGFycmF5IG9mIG5vbi1kaXNhYmxlZCBhc3NheXMgZm9yIGVhY2ggbGluZS5cbiAgICAgICAgcHJpdmF0ZSBfdmFsaWRBc3NheXNCeUxpbmVJRDpJRExvb2t1cCA9IDxJRExvb2t1cD57fTtcbiAgICAgICAgLy8gQW4gYXJyYXkgb2Ygbm9uLWRpc2FibGVkIG1lYXN1cmVtZW50cyBmb3IgZWFjaCBhc3NheS5cbiAgICAgICAgcHJpdmF0ZSBfdmFsaWRNZWFzdXJlbWVudHNCeUFzc2F5SUQ6SURMb29rdXAgPSA8SURMb29rdXA+e307XG4gICAgICAgIC8vIExvb2t1cCB0aGUgT0QgbWVhc3VyZW1lbnQgZm9yIGVhY2ggbGluZS5cbiAgICAgICAgcHJpdmF0ZSBfb3B0aWNhbERlbnNpdHlNZWFzdXJlbWVudElEQnlMaW5lSUQ6e1tsaW5lSUQ6bnVtYmVyXTpudW1iZXJ9ID0ge307XG5cbiAgICAgICAgLy8gVGhpcyBpcyBmcm9tIGNvbnZlcnRpbmcgdGhlIGFzc2F5IG1lYXN1cmVtZW50IGxpc3QgZ2l2ZW4gdG8gdXMgaW50byBhIGhhc2ggYnkgdGltZXN0YW1wLlxuICAgICAgICBwcml2YXRlIF9hc3NheU1lYXN1cmVtZW50RGF0YUJ5SUQ6SW50ZWdyYWxMb29rdXA7XG4gICAgICAgIHByaXZhdGUgX2RlYnVnTGluZUlEOm51bWJlciA9IDA7XG4gICAgICAgIC8vIElmIHRoaXMgaXMgc2V0LCB0aGVuIHdlJ2xsIGJlIGVtaXR0aW5nIGRlYnVnIEhUTUwgdG8gX2RlYnVnT3V0cHV0LlxuICAgICAgICBwcml2YXRlIF9kZWJ1Z1RpbWVTdGFtcDpudW1iZXI7XG4gICAgICAgIHByaXZhdGUgX2RlYnVnT3V0cHV0OnN0cmluZztcbiAgICAgICAgLy8gQXV0byB0YWIgb24gZGVidWcgb3V0cHV0LlxuICAgICAgICBwcml2YXRlIF9kZWJ1Z091dHB1dEluZGVudDpudW1iZXIgPSAwO1xuXG5cbiAgICAgICAgLy8gVXNlIHRoaXMgdG8gY3JlYXRlIGEgc3VtbWF0aW9uIG9iamVjdC5cbiAgICAgICAgc3RhdGljIGNyZWF0ZShiaW9tYXNzQ2FsY3VsYXRpb246bnVtYmVyKTpTdW1tYXRpb24ge1xuXG4gICAgICAgICAgICB2YXIgc3VtOlN1bW1hdGlvbiA9IG5ldyBTdW1tYXRpb24oKTtcbiAgICAgICAgICAgIHN1bS5pbml0KGJpb21hc3NDYWxjdWxhdGlvbik7XG4gICAgICAgICAgICByZXR1cm4gc3VtO1xuICAgICAgICB9XG5cblxuICAgICAgICAvLyBVc2UgdGhpcyB0byBnZW5lcmF0ZSBzb21lIGRlYnVnIHRleHQgdGhhdCBkZXNjcmliZXMgYWxsIHRoZSBjYWxjdWxhdGlvbnMuXG4gICAgICAgIHN0YXRpYyBnZW5lcmF0ZURlYnVnVGV4dChiaW9tYXNzQ2FsY3VsYXRpb246bnVtYmVyLFxuICAgICAgICAgICAgICAgIGRlYnVnTGluZUlEOm51bWJlcixcbiAgICAgICAgICAgICAgICBkZWJ1Z1RpbWVTdGFtcDpudW1iZXIpOnN0cmluZyB7XG5cbiAgICAgICAgICAgIC8vIENyZWF0ZSBhIFN1bW1hdGlvbiBvYmplY3QgYnV0IHRlbGwgaXQgdG8gZ2VuZXJhdGUgZGVidWcgaW5mbyB3aGlsZSBpdCBkb2VzIGl0c1xuICAgICAgICAgICAgLy8gdGltZXN0YW1wcy5cbiAgICAgICAgICAgIHZhciBzdW06U3VtbWF0aW9uID0gbmV3IFN1bW1hdGlvbigpO1xuICAgICAgICAgICAgc3VtLl9kZWJ1Z0xpbmVJRCA9IGRlYnVnTGluZUlEO1xuICAgICAgICAgICAgc3VtLl9kZWJ1Z1RpbWVTdGFtcCA9IGRlYnVnVGltZVN0YW1wO1xuICAgICAgICAgICAgc3VtLl9kZWJ1Z091dHB1dCA9IFwiXCI7XG4gICAgICAgICAgICBzdW0uaW5pdChiaW9tYXNzQ2FsY3VsYXRpb24pO1xuXG4gICAgICAgICAgICAvLyBSZXR1cm4gaXRzIGRlYnVnIGluZm8uXG4gICAgICAgICAgICByZXR1cm4gc3VtLl9kZWJ1Z091dHB1dDtcbiAgICAgICAgfVxuXG5cbiAgICAgICAgLy8gVGhpcyBqdXN0IHdyYXBzIHRoZSBjYWxsIHRvIFRpbWVsaW5lTWVyZ2VyLm1lcmdlQWxsTGluZVNhbXBsZXMuXG4gICAgICAgIG1lcmdlQWxsTGluZVNhbXBsZXMobGluZURhdGE6YW55KTpNZXJnZWRMaW5lU2FtcGxlcyB7XG4gICAgICAgICAgICByZXR1cm4gVGltZWxpbmVNZXJnZXIubWVyZ2VBbGxMaW5lU2FtcGxlcyhsaW5lRGF0YSk7XG4gICAgICAgIH1cblxuXG4gICAgICAgIGdldExpbmVEYXRhQnlJRChsaW5lSUQ6bnVtYmVyKTpMaW5lRGF0YSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5saW5lRGF0YUJ5SURbbGluZUlEXTtcbiAgICAgICAgfVxuXG5cbiAgICAgICAgLy8gSW50ZXJuYWxseSwgdGhpcyBpcyBob3cgd2UgaW5pdCB0aGUgU3VtbWF0aW9uIG9iamVjdCByZWdhcmRsZXNzIG9mIHdoZXRoZXIgaXQncyB1c2VkXG4gICAgICAgIC8vIGxhdGVyIG9yIHdoZXRoZXIgaXQncyBqdXN0IHVzZWQgdG8gZ2V0IHNvbWUgZGVidWcgdGV4dC5cbiAgICAgICAgcHJpdmF0ZSBpbml0KGJpb21hc3NDYWxjdWxhdGlvbjpudW1iZXIpOnZvaWQge1xuICAgICAgICAgICAgdmFyIGludGVncmFsc0J5TWVhc3VyZW1lbnRJRDpJbnRlZ3JhbExvb2t1cDtcblxuICAgICAgICAgICAgdGhpcy5fcHJlY2FsY3VsYXRlVmFsaWRMaXN0cygpO1xuICAgICAgICAgICAgLy8gQ29udmVydCB0byBhIGhhc2ggb24gdGltZXN0YW1wICh4IHZhbHVlKVxuICAgICAgICAgICAgdGhpcy5fYXNzYXlNZWFzdXJlbWVudERhdGFCeUlEID0ge307XG4gICAgICAgICAgICAkLmVhY2goRURERGF0YS5Bc3NheU1lYXN1cmVtZW50cywgKGlkOnN0cmluZywgbWVhc3VyZTpBc3NheU1lYXN1cmVtZW50UmVjb3JkKTp2b2lkID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgb3V0OkludGVncmFsID0gdGhpcy5fYXNzYXlNZWFzdXJlbWVudERhdGFCeUlEW2lkXSA9IDxJbnRlZ3JhbD57fTtcbiAgICAgICAgICAgICAgICAkLmVhY2gobWVhc3VyZS52YWx1ZXMsIChpOm51bWJlciwgcG9pbnQ6bnVtYmVyW11bXSk6dm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgICAgIC8vIG9ubHkgZG8gbWFwcGluZyBmb3IgKHgseSkgcG9pbnRzLCB3b24ndCBtYWtlIHNlbnNlIHdpdGggaGlnaGVyIGRpbWVuc2lvbnNcbiAgICAgICAgICAgICAgICAgICAgaWYgKHBvaW50WzBdLmxlbmd0aCA9PT0gMSAmJiBwb2ludFsxXS5sZW5ndGggPT09IDEpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIG91dFtwb2ludFswXVswXV0gPSBwb2ludFsxXVswXTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIC8vIFdlIG5lZWQgdG8gcHJlcGFyZSBpbnRlZ3JhbHMgb2YgYW55IG1vbC9ML2hyXG4gICAgICAgICAgICBpbnRlZ3JhbHNCeU1lYXN1cmVtZW50SUQgPSB0aGlzLl9pbnRlZ3JhdGVBc3NheU1lYXN1cmVtZW50cyhiaW9tYXNzQ2FsY3VsYXRpb24pO1xuXG4gICAgICAgICAgICAvLyBJdGVyYXRlIG92ZXIgbGluZXMuXG4gICAgICAgICAgICAkLmVhY2goRURERGF0YS5MaW5lcywgKGxpbmVJZDpzdHJpbmcsIGxpbmU6TGluZVJlY29yZCk6dm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIG91dDpMaW5lRGF0YSwgYW55U2FtcGxlc0FkZGVkOmJvb2xlYW4gPSBmYWxzZTtcbiAgICAgICAgICAgICAgICBpZiAoIWxpbmUuYWN0aXZlKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgb3V0ID0gbmV3IExpbmVEYXRhKGxpbmUuaWQpO1xuICAgICAgICAgICAgICAgIHRoaXMuX3ZhbGlkQXNzYXlzQnlMaW5lSURbbGluZS5pZF0uZm9yRWFjaCgoYXNzYXlJZDpudW1iZXIpOnZvaWQgPT4ge1xuICAgICAgICAgICAgICAgICAgICB2YXIgYXNzYXk6QXNzYXlSZWNvcmQgPSBFREREYXRhLkFzc2F5c1thc3NheUlkXSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHByb3RvY29sOmFueSA9IEVERERhdGEuUHJvdG9jb2xzW2Fzc2F5LnBpZF0sXG4gICAgICAgICAgICAgICAgICAgICAgICBuYW1lOnN0cmluZyA9IFtsaW5lLm5hbWUsIHByb3RvY29sLm5hbWUsIGFzc2F5Lm5hbWVdLmpvaW4oJy0nKSxcbiAgICAgICAgICAgICAgICAgICAgICAgIG91dEFzc2F5OkFzc2F5RGF0YSA9IG5ldyBBc3NheURhdGEoYXNzYXlJZCksXG4gICAgICAgICAgICAgICAgICAgICAgICB2YWxpZDpudW1iZXIgPSAwO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLl93cml0ZURlYnVnTGluZShsaW5lLmlkID09PSB0aGlzLl9kZWJ1Z0xpbmVJRCwgXCJBc3NheSBcIiArIG5hbWUpO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLl9kZWJ1Z091dHB1dEluZGVudCsrO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLl92YWxpZE1lYXN1cmVtZW50c0J5QXNzYXlJRFthc3NheUlkXS5mb3JFYWNoKChtZWFzdXJlSWQ6bnVtYmVyKTp2b2lkID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciBtZWFzdXJlOkFzc2F5TWVhc3VyZW1lbnRSZWNvcmQgPSBFREREYXRhLkFzc2F5TWVhc3VyZW1lbnRzW21lYXN1cmVJZF0sXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGltZWxpbmU6TWV0YWJvbGl0ZVRpbWVsaW5lO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCF0aGlzLl9kb2VzTWVhc3VyZW1lbnRDb250YWluQ2FyYm9uKG1lYXN1cmUpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fd3JpdGVEZWJ1Z0xpbmUobGluZS5pZCA9PT0gdGhpcy5fZGVidWdMaW5lSUQsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgRURERGF0YS5NZXRhYm9saXRlVHlwZXNbbWVhc3VyZS50eXBlXS5uYW1lKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX2RlYnVnT3V0cHV0SW5kZW50Kys7XG4gICAgICAgICAgICAgICAgICAgICAgICB2YWxpZCsrO1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gQ3JlYXRlIE1ldGFib2xpdGVUaW1lbGluZSBvdXRwdXQgc3RydWN0dXJlXG4gICAgICAgICAgICAgICAgICAgICAgICB0aW1lbGluZSA9IG5ldyBNZXRhYm9saXRlVGltZWxpbmUob3V0QXNzYXksIG1lYXN1cmVJZCk7XG4gICAgICAgICAgICAgICAgICAgICAgICBvdXRBc3NheS50aW1lbGluZXNCeU1lYXN1cmVtZW50SWRbbWVhc3VyZUlkXSA9IHRpbWVsaW5lO1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gQnVpbGQgYSBzb3J0ZWQgbGlzdCBvZiB0aW1lc3RhbXAvbWVhc3VyZW1lbnRcbiAgICAgICAgICAgICAgICAgICAgICAgIHRpbWVsaW5lLnRpbWVTYW1wbGVzID0gdGhpcy5fYnVpbGRTb3J0ZWRNZWFzdXJlbWVudHNGb3JBc3NheU1ldGFib2xpdGUoXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgb3V0LCBtZWFzdXJlSWQsIGludGVncmFsc0J5TWVhc3VyZW1lbnRJRCwgYmlvbWFzc0NhbGN1bGF0aW9uKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIEtlZXAgdHJhY2sgb2YgdGhlIGxhc3Qgc2FtcGxlJ3MgdGltZVxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHRpbWVsaW5lLnRpbWVTYW1wbGVzKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYW55U2FtcGxlc0FkZGVkID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmxhc3RUaW1lSW5TZWNvbmRzID0gTWF0aC5tYXgodGhpcy5sYXN0VGltZUluU2Vjb25kcyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGltZWxpbmUudGltZVNhbXBsZXMuc2xpY2UoLTEpWzBdLnRpbWVTdGFtcCk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl93cml0ZURlYnVnTGluZShsaW5lLmlkID09PSB0aGlzLl9kZWJ1Z0xpbmVJRCwgXCJcIik7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9kZWJ1Z091dHB1dEluZGVudC0tO1xuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgLy8gc3RvcmUgdGhlIGFzc2F5XG4gICAgICAgICAgICAgICAgICAgIG91dC5hc3NheXNCeUlEW2Fzc2F5SWRdID0gb3V0QXNzYXk7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX3dyaXRlRGVidWdMaW5lKGxpbmUuaWQgPT09IHRoaXMuX2RlYnVnTGluZUlELCBcIlwiKTtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fZGVidWdPdXRwdXRJbmRlbnQtLTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICBpZiAoYW55U2FtcGxlc0FkZGVkKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMubGluZURhdGFCeUlEW2xpbmUuaWRdID0gb3V0O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgIH1cblxuXG4gICAgICAgIC8vIEFwcGVuZCB0aGUgc3RyaW5nIHRvIG91ciBfZGVidWdPdXRwdXQgc3RyaW5nIGlmIHNob3VsZFdyaXRlPXRydWUuXG4gICAgICAgIC8vIChIYXZpbmcgc2hvdWxkV3JpdGUgdGhlcmUgbWFrZXMgaXQgZWFzaWVyIHRvIGRvIGEgb25lLWxpbmUgZGVidWcgb3V0cHV0IHRoYXQgaW5jbHVkZXNcbiAgICAgICAgLy8gdGhlIGNoZWNrIG9mIHdoZXRoZXIgaXQgc2hvdWxkIHdyaXRlKS5cbiAgICAgICAgcHJpdmF0ZSBfd3JpdGVEZWJ1Z0xpbmUoc2hvdWxkV3JpdGU6Ym9vbGVhbiwgdmFsOnN0cmluZyk6dm9pZCB7XG4gICAgICAgICAgICBpZiAoIXNob3VsZFdyaXRlKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdmFyIGluZGVudDpzdHJpbmdbXSA9IFtdO1xuICAgICAgICAgICAgLy8ga2VlcCBhZGRpbmcgaW5kZW50cyB1bnRpbCByZWFjaCBsZW5ndGggb2YgX2RlYnVnT3V0cHV0SW5kZW50XG4gICAgICAgICAgICAvKiB0c2xpbnQ6ZGlzYWJsZTpjdXJseSAqL1xuICAgICAgICAgICAgd2hpbGUgKHRoaXMuX2RlYnVnT3V0cHV0SW5kZW50ICYmIHRoaXMuX2RlYnVnT3V0cHV0SW5kZW50ID4gaW5kZW50LnB1c2goJyAgICAnKSk7XG4gICAgICAgICAgICAvKiB0c2xpbnQ6ZW5hYmxlOmN1cmx5ICovXG4gICAgICAgICAgICB0aGlzLl9kZWJ1Z091dHB1dCArPSBpbmRlbnQuam9pbignJykgKyB2YWwgKyBcIlxcblwiO1xuICAgICAgICB9XG5cblxuICAgICAgICBwcml2YXRlIF93cml0ZURlYnVnTGluZVdpdGhIZWFkZXIoc2hvdWxkV3JpdGU6Ym9vbGVhbiwgaGVhZGVyOnN0cmluZywgdmFsOnN0cmluZyk6dm9pZCB7XG4gICAgICAgICAgICB2YXIgc3RyOnN0cmluZyA9IFV0bC5KUy5wYWRTdHJpbmdMZWZ0KFwiW1wiICsgaGVhZGVyICsgXCJdIFwiLCAzMCk7XG4gICAgICAgICAgICB0aGlzLl93cml0ZURlYnVnTGluZShzaG91bGRXcml0ZSwgc3RyICsgdmFsKTtcbiAgICAgICAgfVxuXG5cbiAgICAgICAgLy8gQ29udmVydCBhIG51bWJlciB0byBhIHN0cmluZyBmb3IgZGVidWcgb3V0cHV0LiBJZiBhbGwgdGhlIGNvZGUgdXNlcyB0aGlzLCB0aGVuXG4gICAgICAgIC8vIGFsbCB0aGUgbnVtYmVyIGZvcm1hdHRpbmcgd2lsbCBiZSBjb25zaXN0ZW50LlxuICAgICAgICBwcml2YXRlIF9udW1TdHIodmFsdWU6YW55KTpzdHJpbmcge1xuICAgICAgICAgICAgcmV0dXJuIHBhcnNlRmxvYXQodmFsdWUpLnRvRml4ZWQoNSk7XG4gICAgICAgIH1cblxuXG4gICAgICAgIC8vIFRoaXMgaXMgdXNlZCBpbiBhIGZpcnN0IHBhc3Mgb24gYSBtZWFzdXJlbWVudCB0byBkZWNpZGUgaWYgd2Ugc2hvdWxkIHNjYW4gaXRzXG4gICAgICAgIC8vIG1lYXN1cmVtZW50cy4gSWYgeW91IHVwZGF0ZSB0aGlzLCB1cGRhdGUgY2FsY3VsYXRlQ21vbFBlckxpdGVyIChhbmQgdmljZS12ZXJzYSkuXG4gICAgICAgIHByaXZhdGUgX2RvZXNNZWFzdXJlbWVudENvbnRhaW5DYXJib24obWVhc3VyZTpBc3NheU1lYXN1cmVtZW50UmVjb3JkKTpib29sZWFuIHtcbiAgICAgICAgICAgIHZhciBtdHlwZTpNZXRhYm9saXRlVHlwZVJlY29yZCA9IEVERERhdGEuTWV0YWJvbGl0ZVR5cGVzW21lYXN1cmUudHlwZV07XG4gICAgICAgICAgICBpZiAoIW10eXBlKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBPRCBtZWFzdXJlbWVudHMgdXNlIHRoZSBiaW9tYXNzIGZhY3RvciB0byBlc3RpbWF0ZSB0aGUgYW1vdW50IG9mIGNhcmJvbiBjcmVhdGVkXG4gICAgICAgICAgICAvLyBvciBkZXN0cm95ZWQuIFRoZXJlJ3Mgbm8gZ3VhcmFudGVlIHdlIGhhZSBhIHZhbGlkIGJpb21hc3MgZmFjdG9yLCBidXQgd2UgZGVmaW5pdGVseVxuICAgICAgICAgICAgLy8ga25vdyB0aGVyZSBpcyBjYXJib24gaGVyZS5cbiAgICAgICAgICAgIGlmICh0aGlzLl9pc09wdGljYWxEZW5zaXR5TWVhc3VyZW1lbnQobXR5cGUpKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB2YXIgdVJlY29yZDphbnkgPSBFREREYXRhLlVuaXRUeXBlc1ttZWFzdXJlLnlfdW5pdHNdO1xuICAgICAgICAgICAgdmFyIHVuaXRzOnN0cmluZyA9IHVSZWNvcmQgPyB1UmVjb3JkLm5hbWUgOiAnJztcbiAgICAgICAgICAgIHZhciBjYXJib25Db3VudDpudW1iZXIgPSBtdHlwZS5jYzsgLy8gIyBjYXJib25zIHBlciBtb2xlXG5cbiAgICAgICAgICAgIGlmICh1bml0cyA9PT0gJycgfHwgdW5pdHMgPT09ICduL2EnIHx8ICFjYXJib25Db3VudCkge1xuICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAodW5pdHMgPT09ICdnL0wnKSB7XG4gICAgICAgICAgICAgICAgLy8gZy9MIGlzIGZpbmUgaWYgd2UgaGF2ZSBhIG1vbGFyIG1hc3Mgc28gd2UgY2FuIGNvbnZlcnQgZy0+bW9sXG4gICAgICAgICAgICAgICAgcmV0dXJuICEhbXR5cGUubW07XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIC8vIEFueXRoaW5nIHVzaW5nIG1vbHMgaXMgZmluZSBhcyB3ZWxsLlxuICAgICAgICAgICAgICAgIHJldHVybiAodW5pdHMgPT09ICdtb2wvTC9ocicgfHxcbiAgICAgICAgICAgICAgICAgICAgdW5pdHMgPT09ICd1TScgfHxcbiAgICAgICAgICAgICAgICAgICAgdW5pdHMgPT09ICdtTScgfHxcbiAgICAgICAgICAgICAgICAgICAgdW5pdHMgPT09ICdtb2wvTCcgfHxcbiAgICAgICAgICAgICAgICAgICAgdW5pdHMgPT09ICdDbW9sL0wnKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIERvIHVuaXQgY29udmVyc2lvbnMgaW4gb3JkZXIgdG8gZ2V0IGEgQ21vbC9MIHZhbHVlLlxuICAgICAgICAvLyAqKiBOT1RFOiBUaGlzIGlzIFwiQy1tb2xlc1wiLCB3aGljaCBpcyBDQVJCT04gbW9sL0wgKGFzIG9wcG9zZWQgdG8gQ0VOVEkgbW9sL0wpLlxuICAgICAgICBwcml2YXRlIF9jYWxjdWxhdGVDbU1vbFBlckxpdGVyKG1lYXN1cmVtZW50SUQ6bnVtYmVyLFxuICAgICAgICAgICAgICAgIHRpbWVTdGFtcDpudW1iZXIsXG4gICAgICAgICAgICAgICAgaW50ZWdyYWxzQnlNZWFzdXJlbWVudElEOkludGVncmFsTG9va3VwLFxuICAgICAgICAgICAgICAgIGJpb21hc3NDYWxjdWxhdGlvbjpudW1iZXIsXG4gICAgICAgICAgICAgICAgZE91dDpib29sZWFuKTpWYWxpZGF0ZWRWYWx1ZSB7XG4gICAgICAgICAgICAvLyBBIG1lYXN1cmVtZW50IGlzIHRoZSB0aW1lIHNlcmllcyBkYXRhIGZvciBPTkUgbWV0YWJvbGl0ZVxuICAgICAgICAgICAgLy8gbWVhc3VyZW1lbnQudmFsdWVzIGNvbnRhaW5zIGFsbCB0aGUgbWVhdHkgc3R1ZmYgLSBhIDMtZGltZW5zaW9uYWwgYXJyYXkgd2l0aDpcbiAgICAgICAgICAgIC8vIGZpcnN0IGluZGV4IHNlbGVjdGluZyBwb2ludCB2YWx1ZTtcbiAgICAgICAgICAgIC8vIHNlY29uZCBpbmRleCAwIGZvciB4LCAxIGZvciB5O1xuICAgICAgICAgICAgLy8gdGhpcmQgaW5kZXggc3Vic2NyaXB0ZWQgdmFsdWVzO1xuICAgICAgICAgICAgLy8gZS5nLiBtZWFzdXJlbWVudC52YWx1ZXNbMl1bMF1bMV0gaXMgdGhlIHgxIHZhbHVlIG9mIHRoZSB0aGlyZCBtZWFzdXJlbWVudCB2YWx1ZVxuICAgICAgICAgICAgdmFyIG1lYXN1cmVtZW50OkFzc2F5TWVhc3VyZW1lbnRSZWNvcmQgPSBFREREYXRhLkFzc2F5TWVhc3VyZW1lbnRzW21lYXN1cmVtZW50SURdLFxuICAgICAgICAgICAgICAgIG1lYXN1cmVtZW50VHlwZTpNZXRhYm9saXRlVHlwZVJlY29yZCA9IEVERERhdGEuTWV0YWJvbGl0ZVR5cGVzW21lYXN1cmVtZW50LnR5cGVdLFxuICAgICAgICAgICAgICAgIHVSZWNvcmQ6VW5pdFR5cGUgPSBFREREYXRhLlVuaXRUeXBlc1ttZWFzdXJlbWVudC55X3VuaXRzXSxcbiAgICAgICAgICAgICAgICB1bml0czpzdHJpbmcgPSB1UmVjb3JkID8gdVJlY29yZC5uYW1lIDogJycsXG4gICAgICAgICAgICAgICAgY2FyYm9uQ291bnQ6bnVtYmVyID0gbWVhc3VyZW1lbnRUeXBlLmNjLCAvLyAjIGNhcmJvbnMgcGVyIG1vbGVcbiAgICAgICAgICAgICAgICBmaW5hbFZhbHVlOm51bWJlciA9IDAsXG4gICAgICAgICAgICAgICAgaXNWYWxpZDpib29sZWFuID0gZmFsc2UsXG4gICAgICAgICAgICAgICAgaXNPcHRpY2FsRGVuc2l0eTpib29sZWFuID0gdGhpcy5faXNPcHRpY2FsRGVuc2l0eU1lYXN1cmVtZW50KG1lYXN1cmVtZW50VHlwZSksXG4gICAgICAgICAgICAgICAgdmFsdWU6bnVtYmVyID0gdGhpcy5fYXNzYXlNZWFzdXJlbWVudERhdGFCeUlEW21lYXN1cmVtZW50SURdW3RpbWVTdGFtcF07XG5cbiAgICAgICAgICAgIC8vIEZpcnN0LCBpcyB0aGlzIG1lYXN1cmVtZW50IHNvbWV0aGluZyB0aGF0IHdlIGNhcmUgYWJvdXQ/XG4gICAgICAgICAgICAvL1xuICAgICAgICAgICAgLy8gV2UnbGwgdGhyb3cgb3V0IGFueXRoaW5nIHRoYXQgaGFzIG11bHRpcGxlIG51bWJlcnMgcGVyIHNhbXBsZS4gUmlnaHQgbm93LCB3ZSdyZVxuICAgICAgICAgICAgLy8gb25seSBoYW5kbGluZyBvbmUtZGltZW5zaW9uYWwgbnVtZXJpYyBzYW1wbGVzLlxuICAgICAgICAgICAgLy9cbiAgICAgICAgICAgIC8vIFdlJ2xsIGFsc28gdGhyb3cgb3V0IGFueXRoaW5nIHdpdGhvdXQgYSBjYXJib24gY291bnQsIGxpa2UgQ08yL08yIHJhdGlvcy5cbiAgICAgICAgICAgIGlmIChpc09wdGljYWxEZW5zaXR5KSB7XG4gICAgICAgICAgICAgICAgLy8gT0Qgd2lsbCBiZSB1c2VkIGRpcmVjdGx5IGluIF9jYWxjdWxhdGVDYXJib25EZWx0YXMgdG8gZ2V0IGEgZ3Jvd3RoIHJhdGUuXG4gICAgICAgICAgICAgICAgZmluYWxWYWx1ZSA9IHZhbHVlO1xuICAgICAgICAgICAgICAgIGlzVmFsaWQgPSB0cnVlO1xuICAgICAgICAgICAgfSBlbHNlIGlmICh1bml0cyA9PT0gJ21vbC9ML2hyJykge1xuICAgICAgICAgICAgICAgIHZhciBpbnRlZ3JhbHM6SW50ZWdyYWwgPSBpbnRlZ3JhbHNCeU1lYXN1cmVtZW50SURbbWVhc3VyZW1lbnRJRF07XG4gICAgICAgICAgICAgICAgaWYgKGludGVncmFscykge1xuICAgICAgICAgICAgICAgICAgICBmaW5hbFZhbHVlID0gaW50ZWdyYWxzW3RpbWVTdGFtcF0gKiAxMDAwO1xuICAgICAgICAgICAgICAgICAgICBpc1ZhbGlkID0gKHR5cGVvZiBmaW5hbFZhbHVlICE9PSAndW5kZWZpbmVkJyk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIGlmICh1bml0cyA9PT0gJycgfHwgdW5pdHMgPT09ICduL2EnIHx8ICFjYXJib25Db3VudCkge1xuICAgICAgICAgICAgICAgIC8vIGlzVmFsaWQgd2lsbCBzdGF5IGZhbHNlLlxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAvLyBDaGVjayBmb3IgdmFyaW91cyBjb252ZXJzaW9ucyB0aGF0IHdlIG1pZ2h0IG5lZWQgdG8gZG8uXG4gICAgICAgICAgICAgICAgaWYgKGRPdXQpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fd3JpdGVEZWJ1Z0xpbmUodHJ1ZSwgdGltZVN0YW1wICsgXCJoXCIpO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLl9kZWJ1Z091dHB1dEluZGVudCsrO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLl93cml0ZURlYnVnTGluZVdpdGhIZWFkZXIodHJ1ZSwgXCJyYXcgdmFsdWVcIixcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX251bVN0cih2YWx1ZSkgKyBcIiBcIiArIHVuaXRzKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYgKHZhbHVlID09PSAwKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIERvbid0IGJvdGhlciB3aXRoIGFsbCB0aGlzIHdvcmsgKGFuZCBkZWJ1ZyBvdXRwdXQpIGlmIHRoZSB2YWx1ZSBpcyAwLlxuICAgICAgICAgICAgICAgICAgICBmaW5hbFZhbHVlID0gdmFsdWU7XG4gICAgICAgICAgICAgICAgICAgIGlzVmFsaWQgPSB0cnVlO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAodHlwZW9mIHZhbHVlICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgICAgICAgICAgICAgICAvLyBDb252ZXJ0IHVNIHRvIG1vbC9MLiBOb3RlOiBldmVuIHRob3VnaCBpdCdzIG5vdCB3cml0dGVuIGFzIHVNL0wsIHRoZXNlXG4gICAgICAgICAgICAgICAgICAgIC8vIHF1YW50aXRpZXMgc2hvdWxkIGJlIHRyZWF0ZWQgYXMgcGVyLWxpdGVyLlxuICAgICAgICAgICAgICAgICAgICBpZiAodW5pdHMgPT09ICd1TScpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhbHVlID0gdmFsdWUgLyAxMDAwO1xuICAgICAgICAgICAgICAgICAgICAgICAgdW5pdHMgPSAnbU1vbC9MJztcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX3dyaXRlRGVidWdMaW5lV2l0aEhlYWRlcihkT3V0LCBcImNvbnZlcnRcIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBcIiAvIDEwMDAgPSBcIiArIHRoaXMuX251bVN0cih2YWx1ZSkgKyBcIiBtb2wvTFwiKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAvLyBEbyBtb2xhciBtYXNzIGNvbnZlcnNpb25zLlxuICAgICAgICAgICAgICAgICAgICBpZiAodW5pdHMgPT09ICdnL0wnKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoIW1lYXN1cmVtZW50VHlwZS5tbSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIFdlIHNob3VsZCBuZXZlciBnZXQgaW4gaGVyZS5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl93cml0ZURlYnVnTGluZShkT3V0LCBcIlRyeWluZyB0byBjYWxjdWxhdGUgY2FyYm9uIGZvciBhIGcvTCBcIiArXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwibWV0YWJvbGl0ZSB3aXRoIGFuIHVuc3BlY2lmaWVkIG1vbGFyIG1hc3MhIFwiICtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCIoVGhlIGNvZGUgc2hvdWxkIG5ldmVyIGdldCBoZXJlKS5cIik7XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIChnL0wpICogKG1vbC9nKSA9IChtb2wvTClcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YWx1ZSA9IHZhbHVlICogMTAwMCAvIG1lYXN1cmVtZW50VHlwZS5tbTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl93cml0ZURlYnVnTGluZVdpdGhIZWFkZXIoZE91dCwgXCJkaXZpZGUgYnkgbW9sYXIgbWFzc1wiLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBbIFwiICogMTAwMCAvXCIsIG1lYXN1cmVtZW50VHlwZS5tbSwgXCJnL21vbCA9XCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX251bVN0cih2YWx1ZSksIFwibU1vbC9MXCIgXS5qb2luKCcgJykpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHVuaXRzID0gJ21Nb2wvTCc7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgLy8gQ29udmVydCBtTW9sL0wgdG8gQ21Nb2wvTC5cbiAgICAgICAgICAgICAgICAgICAgLy8gKiogTk9URTogVGhpcyBpcyBcIkMtbW9sZXNcIiwgd2hpY2ggaXMgQ0FSQk9OIG1vbC9MXG4gICAgICAgICAgICAgICAgICAgIC8vIChhcyBvcHBvc2VkIHRvIENFTlRJIG1vbC9MKS5cbiAgICAgICAgICAgICAgICAgICAgaWYgKHVuaXRzID09PSAnbU1vbC9MJykge1xuICAgICAgICAgICAgICAgICAgICAgICAgdmFsdWUgKj0gY2FyYm9uQ291bnQ7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl93cml0ZURlYnVnTGluZVdpdGhIZWFkZXIoZE91dCwgXCJtdWx0aXBseSBieSBjYXJib24gY291bnRcIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBcIiAqIFwiICsgY2FyYm9uQ291bnQgKyBcIiA9IFwiICsgdGhpcy5fbnVtU3RyKHZhbHVlKSArIFwiIENtTW9sL0xcIik7XG4gICAgICAgICAgICAgICAgICAgICAgICB1bml0cyA9ICdDbU1vbC9MJztcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAvLyBBcmUgd2UgaW4gb3VyIGRlc2lyZWQgb3V0cHV0IGZvcm1hdCAoQ21vbC9MKT9cbiAgICAgICAgICAgICAgICAgICAgaWYgKHVuaXRzID09PSAnQ21Nb2wvTCcpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICBmaW5hbFZhbHVlID0gdmFsdWU7XG4gICAgICAgICAgICAgICAgICAgICAgICAgaXNWYWxpZCA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYgKGRPdXQpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fZGVidWdPdXRwdXRJbmRlbnQtLTtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fd3JpdGVEZWJ1Z0xpbmUodHJ1ZSwgXCJcIik7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy8gUmV0dXJuIGEgcmVzdWx0LlxuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBpc1ZhbGlkOiBpc1ZhbGlkLFxuICAgICAgICAgICAgICAgIHZhbHVlOiBmaW5hbFZhbHVlXG4gICAgICAgICAgICB9O1xuICAgICAgICB9XG5cblxuICAgICAgICBwcml2YXRlIF9pc09wdGljYWxEZW5zaXR5TWVhc3VyZW1lbnQobWVhc3VyZW1lbnRUeXBlOk1lYXN1cmVtZW50VHlwZVJlY29yZCk6Ym9vbGVhbiB7XG4gICAgICAgICAgICByZXR1cm4gbWVhc3VyZW1lbnRUeXBlLm5hbWUgPT09ICdPcHRpY2FsIERlbnNpdHknO1xuICAgICAgICB9XG5cblxuICAgICAgICAvLyBSZXR1cm5zIGEgaGFzaCBvZiBhc3NheU1lYXN1cmVtZW50SUQtPnt0aW1lLT5pbnRlZ3JhbH0gZm9yIGFueSBtb2wvTC9ociBtZWFzdXJlbWVudHMuXG4gICAgICAgIHByaXZhdGUgX2ludGVncmF0ZUFzc2F5TWVhc3VyZW1lbnRzKGJpb21hc3NDYWxjdWxhdGlvbjpudW1iZXIpOkludGVncmFsTG9va3VwIHtcbiAgICAgICAgICAgIHZhciBpbnRlZ3JhbHNCeU1lYXN1cmVtZW50SUQ6SW50ZWdyYWxMb29rdXAgPSB7fTtcblxuICAgICAgICAgICAgJC5lYWNoKEVERERhdGEuQXNzYXlNZWFzdXJlbWVudHMsXG4gICAgICAgICAgICAgICAgICAgIChtZWFzdXJlSWQ6bnVtYmVyLCBtZWFzdXJlOkFzc2F5TWVhc3VyZW1lbnRSZWNvcmQpOnZvaWQgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBtdHlwZTpNZXRhYm9saXRlVHlwZVJlY29yZCA9IEVERERhdGEuTWV0YWJvbGl0ZVR5cGVzW21lYXN1cmUudHlwZV0sXG4gICAgICAgICAgICAgICAgICAgIGNhcmJvbkNvdW50Om51bWJlcixcbiAgICAgICAgICAgICAgICAgICAgdVJlY29yZDpVbml0VHlwZSxcbiAgICAgICAgICAgICAgICAgICAgdW5pdHM6c3RyaW5nLFxuICAgICAgICAgICAgICAgICAgICBpbnRlZ3JhbDpJbnRlZ3JhbCA9IHt9LFxuICAgICAgICAgICAgICAgICAgICBkYXRhOkludGVncmFsLFxuICAgICAgICAgICAgICAgICAgICBwcmV2VGltZTpudW1iZXIsXG4gICAgICAgICAgICAgICAgICAgIHRvdGFsOm51bWJlcjtcbiAgICAgICAgICAgICAgICBpZiAoIW10eXBlKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY2FyYm9uQ291bnQgPSBtdHlwZS5jYztcbiAgICAgICAgICAgICAgICB1UmVjb3JkID0gRURERGF0YS5Vbml0VHlwZXNbbWVhc3VyZS55X3VuaXRzXTtcbiAgICAgICAgICAgICAgICB1bml0cyA9IHVSZWNvcmQgPyB1UmVjb3JkLm5hbWUgOiAnJztcbiAgICAgICAgICAgICAgICAvLyBTZWUgJ09wdGljYWwgRGVuc2l0eSBOb3RlJyBiZWxvdy5cbiAgICAgICAgICAgICAgICBpZiAodW5pdHMgIT09ICdtb2wvTC9ocicgfHwgIWNhcmJvbkNvdW50KSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaW50ZWdyYWxzQnlNZWFzdXJlbWVudElEW21lYXN1cmVJZF0gPSBpbnRlZ3JhbDtcbiAgICAgICAgICAgICAgICAvLyBzdW0gb3ZlciBhbGwgZGF0YVxuICAgICAgICAgICAgICAgIGRhdGEgPSB0aGlzLl9hc3NheU1lYXN1cmVtZW50RGF0YUJ5SURbbWVhc3VyZUlkXTtcbiAgICAgICAgICAgICAgICB0b3RhbCA9IDA7XG4gICAgICAgICAgICAgICAgdGhpcy5fZ2V0TWVhc3VyZW1lbnRUaW1lc3RhbXBzU29ydGVkKG1lYXN1cmVJZCkuZm9yRWFjaCgodGltZTpudW1iZXIpOnZvaWQgPT4ge1xuICAgICAgICAgICAgICAgICAgICB2YXIgdmFsdWU6bnVtYmVyID0gZGF0YVt0aW1lXSwgZHQ6bnVtYmVyO1xuICAgICAgICAgICAgICAgICAgICBpZiAoIXByZXZUaW1lKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBwcmV2VGltZSA9IHRpbWU7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgZHQgPSB0aW1lIC0gcHJldlRpbWU7XG4gICAgICAgICAgICAgICAgICAgIC8vIFRPRE8gc2hvdWxkIHZhbHVlIGJlbG93IGJlIGR2ID0gZGF0YVt0aW1lXSAtIGRhdGFbcHJldlRpbWVdID8/XG4gICAgICAgICAgICAgICAgICAgIHRvdGFsICs9IGR0ICogdmFsdWUgKiBjYXJib25Db3VudDtcbiAgICAgICAgICAgICAgICAgICAgaW50ZWdyYWxbdGltZV0gPSB0b3RhbDtcbiAgICAgICAgICAgICAgICAgICAgcHJldlRpbWUgPSB0aW1lO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICByZXR1cm4gaW50ZWdyYWxzQnlNZWFzdXJlbWVudElEO1xuICAgICAgICB9XG5cblxuICAgICAgICAvLyBSZXR1cm5zIGFuIGFycmF5IG9mIHRpbWVzdGFtcHMgZm9yIHRoaXMgYXNzYXkgc29ydGVkIGJ5IHRpbWUuXG4gICAgICAgIHByaXZhdGUgX2dldE1lYXN1cmVtZW50VGltZXN0YW1wc1NvcnRlZChtZWFzdXJlbWVudElEOm51bWJlcik6bnVtYmVyW10ge1xuICAgICAgICAgICAgdmFyIGRhdGE6SW50ZWdyYWwgPSB0aGlzLl9hc3NheU1lYXN1cmVtZW50RGF0YUJ5SURbbWVhc3VyZW1lbnRJRF07XG4gICAgICAgICAgICBpZiAoIWRhdGEpIHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZygnV2FybmluZzogTm8gc29ydGVkIHRpbWVzdGFtcCBhcnJheSBmb3IgbWVhc3VyZW1lbnQgJyArIG1lYXN1cmVtZW50SUQpO1xuICAgICAgICAgICAgICAgIHJldHVybiBbXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIC8vIGpRdWVyeSBtYXAgZ2l2ZXMgb2JqZWN0IGluZGV4ZXMgYXMgc3RyaW5nLCBzbyBuZWVkIHRvIHBhcnNlRmxvYXQgYmVmb3JlIHNvcnRpbmdcbiAgICAgICAgICAgIHJldHVybiAkLm1hcChkYXRhLCAodmFsdWU6bnVtYmVyLCB0aW1lOnN0cmluZyk6bnVtYmVyID0+IHBhcnNlRmxvYXQodGltZSkpLnNvcnQoKTtcbiAgICAgICAgfVxuXG5cbiAgICAgICAgLy8gR28gdGhyb3VnaCBhbGwgbWVhc3VyZW1lbnRzIGluIHRoaXMgbWV0YWJvbGl0ZSwgZmlndXJlIG91dCB0aGUgY2FyYm9uIGNvdW50LCBhbmQgXG4gICAgICAgIC8vIHJldHVybiBhIHNvcnRlZCBsaXN0IG9mIHt0aW1lU3RhbXAsIHZhbHVlfSBvYmplY3RzLiB2YWx1ZXMgYXJlIGluIENtb2wvTC5cbiAgICAgICAgcHJpdmF0ZSBfYnVpbGRTb3J0ZWRNZWFzdXJlbWVudHNGb3JBc3NheU1ldGFib2xpdGUobGluZTpMaW5lRGF0YSxcbiAgICAgICAgICAgICAgICBtZWFzdXJlbWVudElEOm51bWJlcixcbiAgICAgICAgICAgICAgICBpbnRlZ3JhbHNCeU1lYXN1cmVtZW50SUQ6SW50ZWdyYWxMb29rdXAsXG4gICAgICAgICAgICAgICAgYmlvbWFzc0NhbGN1bGF0aW9uOm51bWJlcik6VGltZVNhbXBsZVtdIHtcbiAgICAgICAgICAgIHZhciBtZWFzdXJlbWVudDpBc3NheU1lYXN1cmVtZW50UmVjb3JkID0gRURERGF0YS5Bc3NheU1lYXN1cmVtZW50c1ttZWFzdXJlbWVudElEXSxcbiAgICAgICAgICAgICAgICBzb3J0ZWRNZWFzdXJlbWVudHM6VGltZVNhbXBsZVtdID0gW107XG5cbiAgICAgICAgICAgIHRoaXMuX2dldE1lYXN1cmVtZW50VGltZXN0YW1wc1NvcnRlZChtZWFzdXJlbWVudElEKS5mb3JFYWNoKFxuICAgICAgICAgICAgICAgICAgICAodGltZTpudW1iZXIsIGk6bnVtYmVyLCBhOm51bWJlcltdKTp2b2lkID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgd3JpdGVEZWJ1Z091dHB1dDpib29sZWFuID0gZmFsc2UsXG4gICAgICAgICAgICAgICAgICAgIHJlc3VsdDpWYWxpZGF0ZWRWYWx1ZSxcbiAgICAgICAgICAgICAgICAgICAgc2FtcGxlOlRpbWVTYW1wbGU7XG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuX2RlYnVnVGltZVN0YW1wICYmIGxpbmUuZ2V0TGluZUlEKCkgPT09IHRoaXMuX2RlYnVnTGluZUlEKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIGRlYnVnIGlmIGN1cnJlbnQgT1IgbmV4dCB0aW1lIGlzIHRoZSBkZWJ1ZyB0aW1lXG4gICAgICAgICAgICAgICAgICAgIGlmICh0aW1lID09PSB0aGlzLl9kZWJ1Z1RpbWVTdGFtcCB8fFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIChpICsgMSA8IGEubGVuZ3RoICYmIGFbaSArIDFdID09PSB0aGlzLl9kZWJ1Z1RpbWVTdGFtcCkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHdyaXRlRGVidWdPdXRwdXQgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJlc3VsdCA9IHRoaXMuX2NhbGN1bGF0ZUNtTW9sUGVyTGl0ZXIobWVhc3VyZW1lbnRJRCwgdGltZSxcbiAgICAgICAgICAgICAgICAgICAgaW50ZWdyYWxzQnlNZWFzdXJlbWVudElELCBiaW9tYXNzQ2FsY3VsYXRpb24sIHdyaXRlRGVidWdPdXRwdXQpO1xuICAgICAgICAgICAgICAgIGlmICghcmVzdWx0LmlzVmFsaWQpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBzYW1wbGUgPSBuZXcgVGltZVNhbXBsZSgpO1xuICAgICAgICAgICAgICAgIHNhbXBsZS50aW1lU3RhbXAgPSB0aW1lO1xuICAgICAgICAgICAgICAgIHNhbXBsZS5jYXJib25WYWx1ZSA9IHJlc3VsdC52YWx1ZTtcbiAgICAgICAgICAgICAgICBzb3J0ZWRNZWFzdXJlbWVudHMucHVzaChzYW1wbGUpO1xuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9jYWxjdWxhdGVDYXJib25EZWx0YXMoc29ydGVkTWVhc3VyZW1lbnRzLCBsaW5lLCBtZWFzdXJlbWVudCxcbiAgICAgICAgICAgICAgICBiaW9tYXNzQ2FsY3VsYXRpb24pO1xuICAgICAgICB9XG5cblxuICAgICAgICAvLyBHbyB0aHJvdWdoIHRoZSBUaW1lU2FtcGxlcyBhbmQgY2FsY3VsYXRlIHRoZWlyIGNhcmJvbkRlbHRhIHZhbHVlLlxuICAgICAgICBwcml2YXRlIF9jYWxjdWxhdGVDYXJib25EZWx0YXMoc29ydGVkTWVhc3VyZW1lbnRzOlRpbWVTYW1wbGVbXSxcbiAgICAgICAgICAgICAgICBsaW5lOkxpbmVEYXRhLFxuICAgICAgICAgICAgICAgIG1lYXN1cmVtZW50OkFzc2F5TWVhc3VyZW1lbnRSZWNvcmQsXG4gICAgICAgICAgICAgICAgYmlvbWFzc0NhbGN1bGF0aW9uOm51bWJlcik6VGltZVNhbXBsZVtdIHtcbiAgICAgICAgICAgIHZhciBtdHlwZTpNZXRhYm9saXRlVHlwZVJlY29yZCA9IEVERERhdGEuTWV0YWJvbGl0ZVR5cGVzW21lYXN1cmVtZW50LnR5cGVdLFxuICAgICAgICAgICAgICAgIGlzT3B0aWNhbERlbnNpdHk6Ym9vbGVhbiA9IHRoaXMuX2lzT3B0aWNhbERlbnNpdHlNZWFzdXJlbWVudChtdHlwZSksXG4gICAgICAgICAgICAgICAgYXNzYXk6QXNzYXlSZWNvcmQgPSBFREREYXRhLkFzc2F5c1ttZWFzdXJlbWVudC5hc3NheV0sXG4gICAgICAgICAgICAgICAgbGluZVJlYzpMaW5lUmVjb3JkID0gRURERGF0YS5MaW5lc1thc3NheS5saWRdLFxuICAgICAgICAgICAgICAgIHByb3RvY29sOmFueSA9IEVERERhdGEuUHJvdG9jb2xzW2Fzc2F5LnBpZF0sXG4gICAgICAgICAgICAgICAgbmFtZTpzdHJpbmcgPSBbbGluZVJlYy5uYW1lLCBwcm90b2NvbC5uYW1lLCBhc3NheS5uYW1lXS5qb2luKCctJyk7XG5cbiAgICAgICAgICAgIC8vIGxvb3AgZnJvbSBzZWNvbmQgZWxlbWVudCwgYW5kIHVzZSB0aGUgaW5kZXggb2Ygc2hvcnRlciBhcnJheSB0byBnZXQgcHJldmlvdXNcbiAgICAgICAgICAgIHNvcnRlZE1lYXN1cmVtZW50cy5zbGljZSgxKS5mb3JFYWNoKChzYW1wbGU6VGltZVNhbXBsZSwgaTpudW1iZXIpOnZvaWQgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBwcmV2OlRpbWVTYW1wbGUgPSBzb3J0ZWRNZWFzdXJlbWVudHNbaV0sXG4gICAgICAgICAgICAgICAgICAgIGRlbHRhVGltZTpudW1iZXIgPSB0aGlzLl9jYWxjVGltZURlbHRhKHByZXYudGltZVN0YW1wLCBzYW1wbGUudGltZVN0YW1wKSxcbiAgICAgICAgICAgICAgICAgICAgd3JpdGVEZWJ1Z0luZm86Ym9vbGVhbiwgZ3Jvd3RoUmF0ZTpudW1iZXIsIGRlbHRhQ2FyYm9uOm51bWJlcixcbiAgICAgICAgICAgICAgICAgICAgb2RGYWN0b3I6bnVtYmVyLCBjbU1vbFBlckxQZXJIOm51bWJlciwgY21Nb2xQZXJHZHdQZXJIOm51bWJlcjtcblxuICAgICAgICAgICAgICAgIHdyaXRlRGVidWdJbmZvID0gKHRoaXMuX2RlYnVnVGltZVN0YW1wXG4gICAgICAgICAgICAgICAgICAgICYmIGxpbmUuZ2V0TGluZUlEKCkgPT09IHRoaXMuX2RlYnVnTGluZUlEXG4gICAgICAgICAgICAgICAgICAgICYmIHNhbXBsZS50aW1lU3RhbXAgPT09IHRoaXMuX2RlYnVnVGltZVN0YW1wKTtcbiAgICAgICAgICAgICAgICBpZiAoaXNPcHRpY2FsRGVuc2l0eSkge1xuICAgICAgICAgICAgICAgICAgICAvLyBJZiB0aGlzIGlzIHRoZSBPRCBtZWFzdXJlbWVudCwgdGhlbiB3ZSdsbCB1c2UgdGhlIGJpb21hc3MgZmFjdG9yXG4gICAgICAgICAgICAgICAgICAgIGdyb3d0aFJhdGUgPSAoTWF0aC5sb2coc2FtcGxlLmNhcmJvblZhbHVlIC8gcHJldi5jYXJib25WYWx1ZSkgLyBkZWx0YVRpbWUpO1xuICAgICAgICAgICAgICAgICAgICBzYW1wbGUuY2FyYm9uRGVsdGEgPSBiaW9tYXNzQ2FsY3VsYXRpb24gKiBncm93dGhSYXRlO1xuICAgICAgICAgICAgICAgICAgICBpZiAod3JpdGVEZWJ1Z0luZm8pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX3dyaXRlRGVidWdMaW5lKHRydWUsIFwiQmlvbWFzcyBDYWxjdWxhdGlvbiBmb3IgXCIgKyBuYW1lKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX2RlYnVnT3V0cHV0SW5kZW50Kys7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl93cml0ZURlYnVnTGluZVdpdGhIZWFkZXIodHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBcInJhdyBPRCBhdCBcIiArIHByZXYudGltZVN0YW1wICsgXCJoXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fbnVtU3RyKHByZXYuY2FyYm9uVmFsdWUpKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX3dyaXRlRGVidWdMaW5lV2l0aEhlYWRlcih0cnVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwicmF3IE9EIGF0IFwiICsgc2FtcGxlLnRpbWVTdGFtcCArIFwiaFwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX251bVN0cihzYW1wbGUuY2FyYm9uVmFsdWUpKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX3dyaXRlRGVidWdMaW5lV2l0aEhlYWRlcih0cnVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiZ3Jvd3RoIHJhdGVcIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBcImxvZyhcIiArXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX251bVN0cihzYW1wbGUuY2FyYm9uVmFsdWUpICsgXCIgLyBcIiArXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX251bVN0cihwcmV2LmNhcmJvblZhbHVlKSArXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgXCIpIC8gXCIgKyB0aGlzLl9udW1TdHIoZGVsdGFUaW1lKSArIFwiaCA9IFwiICtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9udW1TdHIoZ3Jvd3RoUmF0ZSkpO1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fd3JpdGVEZWJ1Z0xpbmVXaXRoSGVhZGVyKHRydWUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJiaW9tYXNzIGZhY3RvclwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiICogXCIgKyB0aGlzLl9udW1TdHIoYmlvbWFzc0NhbGN1bGF0aW9uKSArIFwiID0gXCIgK1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX251bVN0cihzYW1wbGUuY2FyYm9uRGVsdGEpICsgXCIgQ21Nb2wvZ2R3L2hyXCIpO1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fd3JpdGVEZWJ1Z0xpbmUodHJ1ZSwgXCJcIik7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9kZWJ1Z091dHB1dEluZGVudC0tO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gR2F0aGVyIHRlcm1zLlxuICAgICAgICAgICAgICAgICAgICBkZWx0YUNhcmJvbiA9IChzYW1wbGUuY2FyYm9uVmFsdWUgLSBwcmV2LmNhcmJvblZhbHVlKTtcbiAgICAgICAgICAgICAgICAgICAgb2RGYWN0b3IgPSB0aGlzLl9jYWxjdWxhdGVPcHRpY2FsRGVuc2l0eUZhY3RvcihsaW5lLCBwcmV2LnRpbWVTdGFtcCxcbiAgICAgICAgICAgICAgICAgICAgICAgIHdyaXRlRGVidWdJbmZvKTtcbiAgICAgICAgICAgICAgICAgICAgLy8gQ21Nb2wvTCAtPiBDbU1vbC9ML2hyXG4gICAgICAgICAgICAgICAgICAgIGNtTW9sUGVyTFBlckggPSAoZGVsdGFDYXJib24gLyBkZWx0YVRpbWUpO1xuICAgICAgICAgICAgICAgICAgICAvLyBDbU1vbC9ML2hyICogTC9nZHcgLT4gQ21Nb2wvZ2R3L2hyXG4gICAgICAgICAgICAgICAgICAgIGNtTW9sUGVyR2R3UGVySCA9IGNtTW9sUGVyTFBlckggLyBvZEZhY3RvcjtcbiAgICAgICAgICAgICAgICAgICAgc2FtcGxlLmNhcmJvbkRlbHRhID0gY21Nb2xQZXJHZHdQZXJIO1xuICAgICAgICAgICAgICAgICAgICAvLyBXcml0ZSBzb21lIGRlYnVnIG91dHB1dCBmb3Igd2hhdCB3ZSBqdXN0IGRpZC5cbiAgICAgICAgICAgICAgICAgICAgaWYgKHdyaXRlRGVidWdJbmZvKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl93cml0ZURlYnVnTGluZSh0cnVlLCBcIkNvbnZlcnQgdG8gQ21Nb2wvZ2R3L2hyXCIpO1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fZGVidWdPdXRwdXRJbmRlbnQrKztcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX3dyaXRlRGVidWdMaW5lV2l0aEhlYWRlcih0cnVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiZGVsdGEgZnJvbSBcIiArIHByZXYudGltZVN0YW1wICsgXCJoIHRvIFwiICsgc2FtcGxlLnRpbWVTdGFtcCArIFwiaFwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX251bVN0cihzYW1wbGUuY2FyYm9uVmFsdWUpICsgXCIgQ21Nb2wvTCAtIFwiICtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9udW1TdHIocHJldi5jYXJib25WYWx1ZSkgKyBcIiBDbU1vbC9MID0gXCIgK1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX251bVN0cihkZWx0YUNhcmJvbikgKyBcIiBDbU1vbC9MXCIpO1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fd3JpdGVEZWJ1Z0xpbmVXaXRoSGVhZGVyKHRydWUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJkZWx0YSB0aW1lXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgXCIgLyBcIiArIHRoaXMuX251bVN0cihkZWx0YVRpbWUpICsgXCJoID0gXCIgK1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX251bVN0cihjbU1vbFBlckxQZXJIKSArIFwiIENtTW9sL0wvaFwiKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX3dyaXRlRGVidWdMaW5lV2l0aEhlYWRlcih0cnVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiYXBwbHkgT0RcIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBcIiAvIFwiICsgdGhpcy5fbnVtU3RyKG9kRmFjdG9yKSArIFwiIEwvZ2R3ID0gXCIgK1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX251bVN0cihjbU1vbFBlckdkd1BlckgpICsgXCIgQ21Nb2wvZ2R3L2hcIik7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9kZWJ1Z091dHB1dEluZGVudC0tO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIHJldHVybiBzb3J0ZWRNZWFzdXJlbWVudHM7XG4gICAgICAgIH1cblxuXG4gICAgICAgIC8vIENhbGN1bGF0ZSB0aGUgZGlmZmVyZW5jZSBiZXR3ZWVuIHR3byB0aW1lc3RhbXBzLlxuICAgICAgICBwcml2YXRlIF9jYWxjVGltZURlbHRhKGZyb21UaW1lU3RhbXA6bnVtYmVyLCB0b1RpbWVTdGFtcDpudW1iZXIpOm51bWJlciB7XG4gICAgICAgICAgICByZXR1cm4gKHRvVGltZVN0YW1wKSAtIChmcm9tVGltZVN0YW1wKTtcbiAgICAgICAgfVxuXG5cbiAgICAgICAgLy8gRmluZCB3aGVyZSB0aW1lU3RhbXAgZml0cyBpbiB0aGUgdGltZWxpbmUgYW5kIGludGVycG9sYXRlLlxuICAgICAgICAvLyBSZXR1cm5zIHRoZSBpbmRleCBvZiB0aGUgdGltZWxpbmUgYW5kIHRoZSBpbnRlcnBvbGF0aW9uIGFtb3VudC5cbiAgICAgICAgcHJpdmF0ZSBfZml0T25Tb3J0ZWRUaW1lbGluZSh0aW1lU3RhbXA6bnVtYmVyLCB0aW1lbGluZTpudW1iZXJbXSk6YW55IHtcbiAgICAgICAgICAgIC8vIGlmIHRpbWVTdGFtcCBpcyBhZnRlciBsYXN0IGVudHJ5IGluIHRpbWVsaW5lLCByZXR1cm4gbGFzdCBlbnRyeVxuICAgICAgICAgICAgdmFyIGludGVyOmFueSA9IHtcbiAgICAgICAgICAgICAgICBcImluZGV4XCI6IHRpbWVsaW5lLmxlbmd0aCAtIDIsXG4gICAgICAgICAgICAgICAgXCJ0XCI6IDFcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICB0aW1lbGluZS5zb21lKCh0aW1lOm51bWJlciwgaTpudW1iZXIpOmJvb2xlYW4gPT4ge1xuICAgICAgICAgICAgICAgIHZhciBwcmV2Om51bWJlcjtcbiAgICAgICAgICAgICAgICBpZiAodGltZVN0YW1wIDw9IHRpbWUpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGludGVyLmluZGV4ID0gaSAtIDE7XG4gICAgICAgICAgICAgICAgICAgICAgICBwcmV2ID0gdGltZWxpbmVbaW50ZXIuaW5kZXhdO1xuICAgICAgICAgICAgICAgICAgICAgICAgaW50ZXIudCA9ICh0aW1lU3RhbXAgLSBwcmV2KSAvICh0aW1lIC0gcHJldik7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpbnRlci5pbmRleCA9IDA7XG4gICAgICAgICAgICAgICAgICAgICAgICBpbnRlci50ID0gMDtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICByZXR1cm4gaW50ZXI7XG4gICAgICAgIH1cblxuXG4gICAgICAgIC8vIEdpdmVuIGEgbGluZSBhbmQgYSB0aW1lc3RhbXAsIHRoaXMgZnVuY3Rpb24gbGluZWFybHkgaW50ZXJwb2xhdGVzIGFzIG5lY2Vzc2FyeSB0byBjb21lXG4gICAgICAgIC8vIHVwIHdpdGggYW4gT0QgdmFsdWUsIHRoZW4gaXQgbXVsdGlwbGllcyBieSBhIG1hZ2ljIG51bWJlciB0byBhcnJpdmUgYXQgYSBnZHcvTCBmYWN0b3JcbiAgICAgICAgLy8gdGhhdCBjYW4gYmUgZmFjdG9yZWQgaW50byBtZWFzdXJlbWVudHMuXG4gICAgICAgIHByaXZhdGUgX2NhbGN1bGF0ZU9wdGljYWxEZW5zaXR5RmFjdG9yKGxpbmU6TGluZURhdGEsXG4gICAgICAgICAgICAgICAgdGltZVN0YW1wOm51bWJlcixcbiAgICAgICAgICAgICAgICB3cml0ZURlYnVnSW5mbzpib29sZWFuKTpudW1iZXIge1xuICAgICAgICAgICAgLy8gR2V0IHRoZSBPRCBtZWFzdXJlbWVudHMuXG4gICAgICAgICAgICB2YXIgb2RNZWFzdXJlSUQ6bnVtYmVyID0gdGhpcy5fZ2V0T3B0aWNhbERlbnNpdHlNZWFzdXJlbWVudEZvckxpbmUobGluZS5nZXRMaW5lSUQoKSksXG4gICAgICAgICAgICAgICAgLy8gTGluZWFybHkgaW50ZXJwb2xhdGUgb24gdGhlIE9EIG1lYXN1cmVtZW50IHRvIGdldCB0aGUgZGVzaXJlZCBmYWN0b3IuXG4gICAgICAgICAgICAgICAgc29ydGVkVGltZTpudW1iZXJbXSA9IHRoaXMuX2dldE1lYXN1cmVtZW50VGltZXN0YW1wc1NvcnRlZChvZE1lYXN1cmVJRCksXG4gICAgICAgICAgICAgICAgaW50ZXJwSW5mbzphbnkgPSB0aGlzLl9maXRPblNvcnRlZFRpbWVsaW5lKHRpbWVTdGFtcCwgc29ydGVkVGltZSksXG4gICAgICAgICAgICAgICAgLy8gVGhpcyBpcyB0aGUgKGxpbmVhcmx5IGludGVycG9sYXRlZCkgT0Q2MDAgbWVhc3VyZW1lbnQuXG4gICAgICAgICAgICAgICAgZGF0YTpJbnRlZ3JhbCA9IHRoaXMuX2Fzc2F5TWVhc3VyZW1lbnREYXRhQnlJRFtvZE1lYXN1cmVJRF0sXG4gICAgICAgICAgICAgICAgdDpudW1iZXIgPSBpbnRlcnBJbmZvLnQsXG4gICAgICAgICAgICAgICAgZGF0YTE6bnVtYmVyID0gZGF0YVtzb3J0ZWRUaW1lW2ludGVycEluZm8uaW5kZXhdXSxcbiAgICAgICAgICAgICAgICBkYXRhMjpudW1iZXIgPSBkYXRhW3NvcnRlZFRpbWVbaW50ZXJwSW5mby5pbmRleCArIDFdXSxcbiAgICAgICAgICAgICAgICBvZE1lYXN1cmVtZW50Om51bWJlciA9IGRhdGExICsgKGRhdGEyIC0gZGF0YTEpICogdCxcbiAgICAgICAgICAgICAgICAvLyBBIG1hZ2ljIGZhY3RvciB0byBnaXZlIHVzIGdkdy9MIGZvciBhbiBPRDYwMCBtZWFzdXJlbWVudC5cbiAgICAgICAgICAgICAgICAvLyBUT0RPOiBUaGlzIGNhbiBiZSBjdXN0b21pemVkIGluIGFzc2F5IG1ldGFkYXRhIHNvIHdlIHNob3VsZCBhbGxvdyBmb3IgdGhhdCBoZXJlLlxuICAgICAgICAgICAgICAgIG9kTWFnaWNGYWN0b3I6bnVtYmVyID0gMC42NSxcbiAgICAgICAgICAgICAgICBmaW5hbFZhbHVlOm51bWJlciA9IG9kTWVhc3VyZW1lbnQgKiBvZE1hZ2ljRmFjdG9yLFxuICAgICAgICAgICAgICAgIC8vIGRlY2xhcmluZyB2YXJpYWJsZXMgb25seSBhc3NpZ25lZCB3aGVuIHdyaXRpbmcgZGVidWcgbG9nc1xuICAgICAgICAgICAgICAgIG1lYXN1cmU6QXNzYXlNZWFzdXJlbWVudFJlY29yZCwgYXNzYXk6QXNzYXlSZWNvcmQsIGxpbmVSZWM6TGluZVJlY29yZCxcbiAgICAgICAgICAgICAgICBwcm90b2NvbDphbnksIG5hbWU6c3RyaW5nO1xuXG4gICAgICAgICAgICAvLyBTcGl0IG91dCBvdXIgY2FsY3VsYXRpb25zIGlmIHJlcXVlc3RlZC5cbiAgICAgICAgICAgIGlmICh3cml0ZURlYnVnSW5mbykge1xuICAgICAgICAgICAgICAgIG1lYXN1cmUgPSBFREREYXRhLkFzc2F5TWVhc3VyZW1lbnRzW29kTWVhc3VyZUlEXTtcbiAgICAgICAgICAgICAgICBhc3NheSA9IEVERERhdGEuQXNzYXlzW21lYXN1cmUuYXNzYXldO1xuICAgICAgICAgICAgICAgIGxpbmVSZWMgPSBFREREYXRhLkxpbmVzW2Fzc2F5LmxpZF07XG4gICAgICAgICAgICAgICAgcHJvdG9jb2wgPSBFREREYXRhLlByb3RvY29sc1thc3NheS5waWRdO1xuICAgICAgICAgICAgICAgIG5hbWUgPSBbbGluZVJlYy5uYW1lLCBwcm90b2NvbC5uYW1lLCBhc3NheS5uYW1lXS5qb2luKCctJyk7XG4gICAgICAgICAgICAgICAgdGhpcy5fd3JpdGVEZWJ1Z0xpbmUodHJ1ZSwgXCJHZXR0aW5nIG9wdGljYWwgZGVuc2l0eSBmcm9tIFwiICsgbmFtZSk7XG4gICAgICAgICAgICAgICAgdGhpcy5fZGVidWdPdXRwdXRJbmRlbnQrKztcbiAgICAgICAgICAgICAgICBpZiAodCAhPT0gMSkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLl93cml0ZURlYnVnTGluZVdpdGhIZWFkZXIodHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIFwicmF3IHZhbHVlIGF0IFwiICsgc29ydGVkVGltZVtpbnRlcnBJbmZvLmluZGV4XSArIFwiaFwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fbnVtU3RyKGRhdGExKSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmICh0ICE9PSAwKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX3dyaXRlRGVidWdMaW5lV2l0aEhlYWRlcih0cnVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgXCJyYXcgdmFsdWUgYXQgXCIgKyBzb3J0ZWRUaW1lW2ludGVycEluZm8uaW5kZXggKyAxXSArIFwiaFwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fbnVtU3RyKGRhdGEyKSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmICh0ICE9PSAwICYmIHQgIT09IDEpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fd3JpdGVEZWJ1Z0xpbmVXaXRoSGVhZGVyKHRydWUsXG4gICAgICAgICAgICAgICAgICAgICAgICBcImludGVycG9sYXRlIFwiICsgKHQgKiAxMDApLnRvRml4ZWQoMikgKyBcIiVcIixcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX251bVN0cihkYXRhMSkgKyBcIiArIChcIiArIHRoaXMuX251bVN0cihkYXRhMikgKyBcIiAtIFwiICtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX251bVN0cihkYXRhMSkgKyBcIilcIiArIFwiICogXCIgKyB0aGlzLl9udW1TdHIodCkgKyBcIiA9IFwiICtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX251bVN0cihvZE1lYXN1cmVtZW50KSArIFwiIEwvZ2R3XCIpO1xuICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICB0aGlzLl93cml0ZURlYnVnTGluZVdpdGhIZWFkZXIodHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgXCJlbXBpcmljYWwgZmFjdG9yXCIsXG4gICAgICAgICAgICAgICAgICAgIFwiICogXCIgKyB0aGlzLl9udW1TdHIob2RNYWdpY0ZhY3RvcikgKyBcIiA9IFwiICtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fbnVtU3RyKGZpbmFsVmFsdWUpICsgXCIgTC9nZHdcIik7XG4gICAgICAgICAgICAgICAgdGhpcy5fd3JpdGVEZWJ1Z0xpbmUodHJ1ZSwgXCJcIik7XG4gICAgICAgICAgICAgICAgdGhpcy5fZGVidWdPdXRwdXRJbmRlbnQtLTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIGZpbmFsVmFsdWU7XG4gICAgICAgIH1cblxuXG4gICAgICAgIC8vIFJldHVybnMgdGhlIGFzc2F5IG1lYXN1cmVtZW50IHRoYXQgcmVwcmVzZW50cyBPRCBmb3IgdGhlIHNwZWNpZmllZCBsaW5lLlxuICAgICAgICBwcml2YXRlIF9nZXRPcHRpY2FsRGVuc2l0eU1lYXN1cmVtZW50Rm9yTGluZShsaW5lSUQ6bnVtYmVyKTpudW1iZXIge1xuICAgICAgICAgICAgdmFyIG9kTWVhc3VyZUlEOm51bWJlciA9IHRoaXMuX29wdGljYWxEZW5zaXR5TWVhc3VyZW1lbnRJREJ5TGluZUlEW2xpbmVJRF07XG4gICAgICAgICAgICBpZiAodHlwZW9mIG9kTWVhc3VyZUlEICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgICAgICAgICAgIHJldHVybiBvZE1lYXN1cmVJRDtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coXCJXYXJuaW5nISBVbmFibGUgdG8gZmluZCBPRCBtZWFzdXJlbWVudCBmb3IgXCIgK1xuICAgICAgICAgICAgICAgICAgICBFREREYXRhLkxpbmVzW2xpbmVJRF0ubmFtZSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIC0xO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cblxuICAgICAgICAvLyBUaGlzIGNhbGN1bGF0ZXMgdGhlIF92YWxpZEFzc2F5c0J5TGluZUlEIGFuZCBfdmFsaWRNZWFzdXJlbWVudHNCeUFzc2F5SUQgbGlzdHMsXG4gICAgICAgIC8vIHdoaWNoIHJlZHVjZXMgY2x1dHRlciBpbiBhbGwgb3VyIGxvb3BpbmcgY29kZS5cbiAgICAgICAgcHJpdmF0ZSBfcHJlY2FsY3VsYXRlVmFsaWRMaXN0cygpOnZvaWQge1xuICAgICAgICAgICAgJC5lYWNoKEVERERhdGEuTGluZXMsIChrZXk6c3RyaW5nLCBsaW5lOkxpbmVSZWNvcmQpOnZvaWQgPT4ge1xuICAgICAgICAgICAgICAgIGlmIChsaW5lLmFjdGl2ZSkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLl92YWxpZEFzc2F5c0J5TGluZUlEW2xpbmUuaWRdID0gW107XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAkLmVhY2goRURERGF0YS5Bc3NheXMsIChrZXk6c3RyaW5nLCBhc3NheTpBc3NheVJlY29yZCk6dm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIGxpc3Q6bnVtYmVyW10gPSB0aGlzLl92YWxpZEFzc2F5c0J5TGluZUlEW2Fzc2F5LmxpZF07XG4gICAgICAgICAgICAgICAgaWYgKGFzc2F5LmFjdGl2ZSAmJiBsaXN0KSB7XG4gICAgICAgICAgICAgICAgICAgIGxpc3QucHVzaChhc3NheS5pZCk7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX3ZhbGlkTWVhc3VyZW1lbnRzQnlBc3NheUlEW2Fzc2F5LmlkXSA9IFtdO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgJC5lYWNoKEVERERhdGEuQXNzYXlNZWFzdXJlbWVudHMsIChrZXk6c3RyaW5nLFxuICAgICAgICAgICAgICAgICAgICBtZWFzdXJlOkFzc2F5TWVhc3VyZW1lbnRSZWNvcmQpOnZvaWQgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBsaXN0Om51bWJlcltdID0gdGhpcy5fdmFsaWRNZWFzdXJlbWVudHNCeUFzc2F5SURbbWVhc3VyZS5hc3NheV0sXG4gICAgICAgICAgICAgICAgICAgIHR5cGU6TWVhc3VyZW1lbnRUeXBlUmVjb3JkID0gRURERGF0YS5NZWFzdXJlbWVudFR5cGVzW21lYXN1cmUudHlwZV0sXG4gICAgICAgICAgICAgICAgICAgIGFzc2F5OkFzc2F5UmVjb3JkID0gRURERGF0YS5Bc3NheXNbbWVhc3VyZS5hc3NheV07XG4gICAgICAgICAgICAgICAgaWYgKGxpc3QpIHtcbiAgICAgICAgICAgICAgICAgICAgbGlzdC5wdXNoKG1lYXN1cmUuaWQpO1xuICAgICAgICAgICAgICAgICAgICBpZiAodHlwZSAmJiB0aGlzLl9pc09wdGljYWxEZW5zaXR5TWVhc3VyZW1lbnQodHlwZSkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX29wdGljYWxEZW5zaXR5TWVhc3VyZW1lbnRJREJ5TGluZUlEW2Fzc2F5LmxpZF0gPSBtZWFzdXJlLmlkO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBleHBvcnQgaW50ZXJmYWNlIEFzc2F5TG9va3VwIHtcbiAgICAgICAgW2lkOm51bWJlcl06IEFzc2F5RGF0YTtcbiAgICB9XG5cbiAgICBleHBvcnQgaW50ZXJmYWNlIFRpbWVsaW5lTG9va3VwIHtcbiAgICAgICAgW2lkOm51bWJlcl06IE1ldGFib2xpdGVUaW1lbGluZTtcbiAgICB9XG5cbiAgICAvLyBDbGFzcyBkZWZpbml0aW9uIGZvciBlbGVtZW50cyBpbiBTdW1tYXRpb24ubGluZURhdGFCeUlEXG4gICAgZXhwb3J0IGNsYXNzIExpbmVEYXRhIHtcbiAgICAgICAgYXNzYXlzQnlJRDpBc3NheUxvb2t1cCA9IDxBc3NheUxvb2t1cD57fTtcbiAgICAgICAgcHJpdmF0ZSBfbGluZUlEOm51bWJlcjtcblxuICAgICAgICBjb25zdHJ1Y3RvcihsaW5lSUQ6bnVtYmVyKSB7XG4gICAgICAgICAgICB0aGlzLl9saW5lSUQgPSBsaW5lSUQ7XG4gICAgICAgIH1cblxuICAgICAgICBnZXRMaW5lSUQoKTpudW1iZXIge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX2xpbmVJRDtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFJldHVybiBhIGxpc3Qgb2YgQXNzYXlEYXRhIHN0cnVjdHVyZXMgdGhhdCBvbmx5XG4gICAgICAgIC8vIGNvbnRhaW4gbWV0YWJvbGl0ZSBkYXRhIGZvciB0aGUgc3BlY2lmaWVkIHRpbWUgc3RhbXAuXG4gICAgICAgIC8vIChUaGlzIHdpbGwgbm90IHJldHVybiBhc3NheXMgdGhhdCBkb24ndCBoYXZlIGFueSBtZXRhYm9saXRlIGRhdGEgZm9yIHRoaXMgdGltZSBzdGFtcC4pXG4gICAgICAgIGZpbHRlckFzc2F5c0J5VGltZVN0YW1wKHRpbWVTdGFtcDpudW1iZXIpOkFzc2F5RGF0YVtdIHtcbiAgICAgICAgICAgIHZhciBmaWx0ZXJlZEFzc2F5czpBc3NheURhdGFbXSA9IFtdO1xuICAgICAgICAgICAgLy8galF1ZXJ5IGVhY2ggY2FsbGJhY2sgYWx3YXlzIGdpdmVzIHN0cmluZyBiYWNrIGZvciBrZXlzXG4gICAgICAgICAgICAkLmVhY2godGhpcy5hc3NheXNCeUlELCAoYWtleTpzdHJpbmcsIGFzc2F5OkFzc2F5RGF0YSk6dm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIHRpbWVsaW5lczpUaW1lbGluZUxvb2t1cCA9IDxUaW1lbGluZUxvb2t1cD57fSxcbiAgICAgICAgICAgICAgICAgICAgbnVtQWRkZWQ6bnVtYmVyID0gMCxcbiAgICAgICAgICAgICAgICAgICAgb3V0QXNzYXk6QXNzYXlEYXRhO1xuICAgICAgICAgICAgICAgICQuZWFjaChhc3NheS50aW1lbGluZXNCeU1lYXN1cmVtZW50SWQsXG4gICAgICAgICAgICAgICAgICAgICAgICAodGtleTpzdHJpbmcsIHRpbWVsaW5lOk1ldGFib2xpdGVUaW1lbGluZSk6dm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBzYW1wbGU6YW55ID0gdGltZWxpbmUuZmluZFNhbXBsZUJ5VGltZVN0YW1wKHRpbWVTdGFtcCksXG4gICAgICAgICAgICAgICAgICAgICAgICBtZWFzdXJlbWVudDpNZXRhYm9saXRlVGltZWxpbmU7XG4gICAgICAgICAgICAgICAgICAgIGlmIChzYW1wbGUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lYXN1cmVtZW50ID0gbmV3IE1ldGFib2xpdGVUaW1lbGluZShhc3NheSwgdGltZWxpbmUubWVhc3VyZUlkKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lYXN1cmVtZW50LnRpbWVTYW1wbGVzLnB1c2goc2FtcGxlKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRpbWVsaW5lc1t0aW1lbGluZS5tZWFzdXJlSWRdID0gbWVhc3VyZW1lbnQ7XG4gICAgICAgICAgICAgICAgICAgICAgICArK251bUFkZGVkO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgaWYgKG51bUFkZGVkKSB7XG4gICAgICAgICAgICAgICAgICAgIG91dEFzc2F5ID0gbmV3IEFzc2F5RGF0YShhc3NheS5hc3NheUlkKTtcbiAgICAgICAgICAgICAgICAgICAgb3V0QXNzYXkudGltZWxpbmVzQnlNZWFzdXJlbWVudElkID0gdGltZWxpbmVzO1xuICAgICAgICAgICAgICAgICAgICBmaWx0ZXJlZEFzc2F5cy5wdXNoKG91dEFzc2F5KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHJldHVybiBmaWx0ZXJlZEFzc2F5cztcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFN1bSB1cCBhbGwgdGhlIGluL291dCB2YWx1ZXMgYWNyb3NzIGFsbCBtZXRhYm9saXRlcyBhdCB0aGUgc3BlY2lmaWVkIHRpbWVzdGFtcC5cbiAgICAgICAgZ2V0SW5PdXRTdW1BdFRpbWUodGltZVN0YW1wOm51bWJlcik6SW5PdXRTdW0ge1xuICAgICAgICAgICAgLy8gR3JhYiBhbGwgdGhlIG1lYXN1cmVtZW50cy5cbiAgICAgICAgICAgIHZhciBtZWFzdXJlbWVudHM6SW5PdXRTdW1NZWFzdXJlbWVudFtdID0gW10sXG4gICAgICAgICAgICAgICAgdG90YWxJbjpudW1iZXIgPSAwLFxuICAgICAgICAgICAgICAgIHRvdGFsT3V0Om51bWJlciA9IDA7XG4gICAgICAgICAgICAkLmVhY2godGhpcy5hc3NheXNCeUlELCAoa2V5OnN0cmluZywgYXNzYXk6QXNzYXlEYXRhKTp2b2lkID0+IHtcbiAgICAgICAgICAgICAgICAkLmVhY2goYXNzYXkudGltZWxpbmVzQnlNZWFzdXJlbWVudElkLCAoa2V5OnN0cmluZyxcbiAgICAgICAgICAgICAgICAgICAgICAgIHRpbWVsaW5lOk1ldGFib2xpdGVUaW1lbGluZSk6dm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBpbm91dDpJbk91dFN1bU1lYXN1cmVtZW50ID0gbmV3IEluT3V0U3VtTWVhc3VyZW1lbnQoKTtcbiAgICAgICAgICAgICAgICAgICAgaW5vdXQudGltZWxpbmUgPSBhc3NheS50aW1lbGluZXNCeU1lYXN1cmVtZW50SWRbdGltZWxpbmUubWVhc3VyZUlkXTtcbiAgICAgICAgICAgICAgICAgICAgaW5vdXQuY2FyYm9uRGVsdGEgPSBpbm91dC50aW1lbGluZS5pbnRlcnBvbGF0ZUNhcmJvbkRlbHRhKHRpbWVTdGFtcCk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChpbm91dC5jYXJib25EZWx0YSA+IDApIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRvdGFsT3V0ICs9IGlub3V0LmNhcmJvbkRlbHRhO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgdG90YWxJbiAtPSBpbm91dC5jYXJib25EZWx0YTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBtZWFzdXJlbWVudHMucHVzaChpbm91dCk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHJldHVybiBuZXcgSW5PdXRTdW0odG90YWxJbiwgdG90YWxPdXQsIG1lYXN1cmVtZW50cyk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBUaGlzIHJlcHJlc2VudHMgYSBiYWtlZC1kb3duIHZlcnNpb24gb2YgdGhlIExpbmVEYXRhL0Fzc2F5RGF0YSwgd2hlcmUgd2UndmVcbiAgICAvLyBzdW1tZWQgdXAgY2FyYm9uIGRhdGEgZm9yIGFsbCBhc3NheXMgYXQgZWFjaCB0aW1lIHBvaW50LlxuICAgIGV4cG9ydCBjbGFzcyBNZXJnZWRMaW5lU2FtcGxlcyB7XG4gICAgICAgIC8vIE9yZGVyZWQgYnkgdGltZSBzdGFtcCwgdGhlc2UgYXJlIHRoZSBtZXJnZWQgc2FtcGxlcyB3aXRoIGNhcmJvbiBpbi9vdXQgZGF0YS5cbiAgICAgICAgbWVyZ2VkTGluZVNhbXBsZXM6TWVyZ2VkTGluZVNhbXBsZVtdID0gW107XG5cbiAgICAgICAgLy8gVGhpcyBpcyBhIGxpc3Qgb2YgYWxsIHRpbWVsaW5lcyB0aGF0IHdlcmUgc2FtcGxlZCB0byBidWlsZCB0aGUgc3VtcyBpbiBtZXJnZWRMaW5lU2FtcGxlcy5cbiAgICAgICAgbWV0YWJvbGl0ZVRpbWVsaW5lczpNZXRhYm9saXRlVGltZWxpbmVbXSA9IFtdO1xuICAgIH1cblxuICAgIGV4cG9ydCBjbGFzcyBNZXJnZWRMaW5lU2FtcGxlIHtcbiAgICAgICAgdGltZVN0YW1wOm51bWJlcjtcbiAgICAgICAgdG90YWxDYXJib25JbjpudW1iZXIgPSAwO1xuICAgICAgICB0b3RhbENhcmJvbk91dDpudW1iZXIgPSAwO1xuXG4gICAgICAgIGNvbnN0cnVjdG9yKHRpbWVTdGFtcDpudW1iZXIpIHtcbiAgICAgICAgICAgIHRoaXMudGltZVN0YW1wID0gdGltZVN0YW1wO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZXhwb3J0IGNsYXNzIEluT3V0U3VtIHtcbiAgICAgICAgdG90YWxJbjpudW1iZXI7XG4gICAgICAgIHRvdGFsT3V0Om51bWJlcjtcbiAgICAgICAgbWVhc3VyZW1lbnRzOkluT3V0U3VtTWVhc3VyZW1lbnRbXTtcblxuICAgICAgICBjb25zdHJ1Y3Rvcih0b3RhbEluOm51bWJlciwgdG90YWxPdXQ6bnVtYmVyLCBtZWFzdXJlbWVudHM6SW5PdXRTdW1NZWFzdXJlbWVudFtdKSB7XG4gICAgICAgICAgICB0aGlzLnRvdGFsSW4gPSB0b3RhbEluO1xuICAgICAgICAgICAgdGhpcy50b3RhbE91dCA9IHRvdGFsT3V0O1xuICAgICAgICAgICAgdGhpcy5tZWFzdXJlbWVudHMgPSBtZWFzdXJlbWVudHM7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBleHBvcnQgY2xhc3MgSW5PdXRTdW1NZWFzdXJlbWVudCB7XG4gICAgICAgIHRpbWVsaW5lOk1ldGFib2xpdGVUaW1lbGluZTtcbiAgICAgICAgY2FyYm9uRGVsdGE6bnVtYmVyO1xuXG4gICAgICAgIGFic0RlbHRhKCk6bnVtYmVyIHtcbiAgICAgICAgICAgIHJldHVybiBNYXRoLmFicyh0aGlzLmNhcmJvbkRlbHRhKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGV4cG9ydCBjbGFzcyBBc3NheURhdGEge1xuICAgICAgICB0aW1lbGluZXNCeU1lYXN1cmVtZW50SWQ6VGltZWxpbmVMb29rdXAgPSA8VGltZWxpbmVMb29rdXA+e307XG4gICAgICAgIGFzc2F5SWQ6bnVtYmVyO1xuXG4gICAgICAgIGNvbnN0cnVjdG9yKGFzc2F5SUQ6bnVtYmVyKSB7XG4gICAgICAgICAgICB0aGlzLmFzc2F5SWQgPSBhc3NheUlEO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gUmV0dXJuIGEgbGlzdCBvZiBbbWVhc3VyZW1lbnRJRCwgVGltZVNhbXBsZV0gb2JqZWN0cywgb25lIGZvciBlYWNoXG4gICAgICAgIC8vIG1lYXN1cmVtZW50IHRoYXQgaGFzIGEgc2FtcGxlIGF0IHRoZSBzcGVjaWZpZWQgdGltZSBzdGFtcC5cbiAgICAgICAgZ2V0VGltZVNhbXBsZXNCeVRpbWVTdGFtcCh0aW1lU3RhbXA6bnVtYmVyKSA6IGFueVtdIHtcbiAgICAgICAgICAgIHJldHVybiAkLm1hcCh0aGlzLnRpbWVsaW5lc0J5TWVhc3VyZW1lbnRJZCwgKHRpbWVsaW5lOk1ldGFib2xpdGVUaW1lbGluZSk6YW55ID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgc2FtcGxlOlRpbWVTYW1wbGUgPSB0aW1lbGluZS5maW5kU2FtcGxlQnlUaW1lU3RhbXAodGltZVN0YW1wKTtcbiAgICAgICAgICAgICAgICBpZiAoc2FtcGxlKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBcIm1lYXN1cmVtZW50SURcIjogdGltZWxpbmUubWVhc3VyZUlkLFxuICAgICAgICAgICAgICAgICAgICAgICAgXCJ0aW1lU2FtcGxlXCI6IHNhbXBsZVxuICAgICAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZXhwb3J0IGNsYXNzIE1ldGFib2xpdGVUaW1lbGluZSB7XG4gICAgICAgIGFzc2F5OkFzc2F5RGF0YTtcbiAgICAgICAgdGltZVNhbXBsZXM6VGltZVNhbXBsZVtdID0gW107XG4gICAgICAgIG1lYXN1cmVJZDpudW1iZXI7XG5cbiAgICAgICAgY29uc3RydWN0b3IoYXNzYXk6QXNzYXlEYXRhLCBtZWFzdXJlbWVudElEOm51bWJlcikge1xuICAgICAgICAgICAgLy8gT2YgdHlwZSBTdW1tYXRpb24uVGltZVNhbXBsZS4gU29ydGVkIGJ5IHRpbWVTdGFtcC5cbiAgICAgICAgICAgIC8vIE5vdGUgdGhhdCBzYW1wbGUgMCdzIGNhcmJvbkRlbHRhIHdpbGwgYmUgMCBzaW5jZSBpdCBoYXMgbm8gcHJldmlvdXMgbWVhc3VyZW1lbnQuXG4gICAgICAgICAgICB0aGlzLmFzc2F5ID0gYXNzYXk7XG4gICAgICAgICAgICB0aGlzLm1lYXN1cmVJZCA9IG1lYXN1cmVtZW50SUQ7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBUaGlzIGlzIHRoZSBlYXNpZXN0IGZ1bmN0aW9uIHRvIGNhbGwgdG8gZ2V0IHRoZSBjYXJib24gZGVsdGEgYXQgYSBzcGVjaWZpYyB0aW1lLlxuICAgICAgICAvLyBJZiB0aGlzIHRpbWVsaW5lIGRvZXNuJ3QgaGF2ZSBhIHNhbXBsZSBhdCB0aGF0IHBvc2l0aW9uLCBpdCdsbCBpbnRlcnBvbGF0ZSBiZXR3ZWVuXG4gICAgICAgIC8vIHRoZSBuZWFyZXN0IHR3by5cbiAgICAgICAgaW50ZXJwb2xhdGVDYXJib25EZWx0YSh0aW1lU3RhbXA6bnVtYmVyKTpudW1iZXIge1xuICAgICAgICAgICAgdmFyIHByZXY6VGltZVNhbXBsZSwgZGVsdGE6bnVtYmVyO1xuICAgICAgICAgICAgaWYgKHRoaXMudGltZVNhbXBsZXMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIDA7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyBJZiB0aGUgdGltZSBzdGFtcCBpcyBiZWZvcmUgYWxsIG91ciBzYW1wbGVzLCBqdXN0IHJldHVybiBvdXIgZmlyc3Qgc2FtcGxlJ3NcbiAgICAgICAgICAgIC8vIGNhcmJvbiBkZWx0YS5cbiAgICAgICAgICAgIHByZXYgPSB0aGlzLnRpbWVTYW1wbGVzWzBdO1xuICAgICAgICAgICAgaWYgKHRpbWVTdGFtcCA8PSBwcmV2LnRpbWVTdGFtcCkge1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLnRpbWVTYW1wbGVzWzBdLmNhcmJvbkRlbHRhO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy50aW1lU2FtcGxlcy5zb21lKChzYW1wbGU6VGltZVNhbXBsZSk6Ym9vbGVhbiA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKHNhbXBsZS50aW1lU3RhbXAgPT09IHRpbWVTdGFtcCkge1xuICAgICAgICAgICAgICAgICAgICBkZWx0YSA9IHNhbXBsZS5jYXJib25EZWx0YTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmICh0aW1lU3RhbXAgPj0gcHJldi50aW1lU3RhbXAgJiYgdGltZVN0YW1wIDw9IHNhbXBsZS50aW1lU3RhbXApIHtcbiAgICAgICAgICAgICAgICAgICAgZGVsdGEgPSBVdGwuSlMucmVtYXBWYWx1ZSh0aW1lU3RhbXAsIHByZXYudGltZVN0YW1wLCBzYW1wbGUudGltZVN0YW1wLFxuICAgICAgICAgICAgICAgICAgICAgICAgcHJldi5jYXJib25EZWx0YSwgc2FtcGxlLmNhcmJvbkRlbHRhKTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHByZXYgPSBzYW1wbGU7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIGlmIChkZWx0YSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgLy8gVGhlIHRpbWUgc3RhbXAgdGhleSBwYXNzZWQgaW4gbXVzdCBiZSBwYXN0IGFsbCBvdXIgc2FtcGxlcy5cbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy50aW1lU2FtcGxlcy5zbGljZSgtMSlbMF0uY2FyYm9uRGVsdGE7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gZGVsdGE7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBSZXR1cm4gYSBUaW1lU2FtcGxlIG9yIG51bGwuXG4gICAgICAgIGZpbmRTYW1wbGVCeVRpbWVTdGFtcCh0aW1lU3RhbXA6bnVtYmVyKTpUaW1lU2FtcGxlIHtcbiAgICAgICAgICAgIHZhciBtYXRjaGVkOlRpbWVTYW1wbGVbXTtcbiAgICAgICAgICAgIG1hdGNoZWQgPSB0aGlzLnRpbWVTYW1wbGVzLmZpbHRlcihcbiAgICAgICAgICAgICAgICAoc2FtcGxlOlRpbWVTYW1wbGUpOmJvb2xlYW4gPT4gc2FtcGxlLnRpbWVTdGFtcCA9PT0gdGltZVN0YW1wKTtcbiAgICAgICAgICAgIGlmIChtYXRjaGVkLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgIHJldHVybiBtYXRjaGVkWzBdO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgIH1cblxuICAgIH1cblxuICAgIC8vIERhdGEgZm9yIGEgc2luZ2xlIGxpbmUgZm9yIGEgc2luZ2xlIHBvaW50IGluIHRpbWUuXG4gICAgZXhwb3J0IGNsYXNzIFRpbWVTYW1wbGUge1xuICAgICAgICAvLyBpbiBob3Vyc1xuICAgICAgICB0aW1lU3RhbXA6bnVtYmVyID0gMDtcbiAgICAgICAgLy8gKiogTk9URTogQ21Nb2wgaGVyZSBtZWFucyBjYXJib24gbWlsbGktbW9sZXMuXG4gICAgICAgIC8vIENtTW9sL0wgb2YgY2FyYm9uIGF0IHRoaXMgdGltZXN0YW1wXG4gICAgICAgIGNhcmJvblZhbHVlOm51bWJlciA9IDA7XG4gICAgICAgIC8vIENtTW9sL2dkdy9oclxuICAgICAgICAvLyBkZWx0YSBiZXR3ZWVuIHRoaXMgY2FyYm9uIHZhbHVlIGFuZCB0aGUgcHJldmlvdXMgb25lICgwIGZvciB0aGUgZmlyc3QgZW50cnkpOlxuICAgICAgICAvLyAtLSBQT1NJVElWRSBtZWFucyBvdXRwdXQgKGluIHRoYXQgdGhlIG9yZ2FuaXNtIG91dHB1dHRlZCB0aGlzIG1ldGFib2xpdGUgZm9yIHRoZSB0aW1lXG4gICAgICAgIC8vICAgICAgc3BhbiBpbiBxdWVzdGlvbilcbiAgICAgICAgLy8gLS0gTkVHQVRJVkUgbWVhbnMgaW5wdXQgIChpbiB0aGF0IHRoZSBvcmdhbmlzbSByZWR1Y2VkIHRoZSBhbW91bnQgb2YgdGhpcyBtZXRhYm9saXRlXG4gICAgICAgIC8vICAgICAgZm9yIHRoZSB0aW1lIHNwYW4pXG4gICAgICAgIGNhcmJvbkRlbHRhOm51bWJlciA9IDA7XG5cbiAgICAgICAgaXNJbnB1dCgpIDogYm9vbGVhbiB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5jYXJib25EZWx0YSA8PSAwO1xuICAgICAgICB9XG5cbiAgICAgICAgaXNPdXRwdXQoKSA6IGJvb2xlYW4ge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuY2FyYm9uRGVsdGEgPiAwO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gUmV0dXJuIHRoZSBhYnNvbHV0ZSB2YWx1ZSBvZiBjYXJib25EZWx0YS4gWW91J2xsIG5lZWQgdG8gdXNlIGlzSW5wdXQoKSBvciBpc091dHB1dCgpXG4gICAgICAgIC8vIHRvIGtub3cgd2hpY2ggaXQgcmVwcmVzZW50cy5cbiAgICAgICAgYWJzRGVsdGEoKSA6IG51bWJlciB7XG4gICAgICAgICAgICByZXR1cm4gTWF0aC5hYnModGhpcy5jYXJib25EZWx0YSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBpbnRlcmZhY2UgTWVyZ2VkTGluZVRpbWVMb29rdXAge1xuICAgICAgICBbaW5kZXg6bnVtYmVyXTogTWVyZ2VkTGluZVNhbXBsZTtcbiAgICB9XG5cbiAgICAvLyBTdGVwIDEgaXMgd2hlcmUgQ2FyYm9uQmFsYW5jZS5TdW1tYXRpb24gYnVpbGRzIGEgdGltZWxpbmUgZm9yIGVhY2ggbGluZS0+YXNzYXktPm1ldGFib2xpdGUuXG4gICAgLy8gU3RlcCAyIGlzIHdoZXJlIHRoaXMgY2xhc3MgbWVyZ2VzIGFsbCB0aGUgYXNzYXktPm1ldGFib2xpdGUgdGltZWxpbmVzIGludG8gb25lIHRpbWVsaW5lXG4gICAgLy8gZm9yIGVhY2ggbGluZS5cbiAgICBleHBvcnQgY2xhc3MgVGltZWxpbmVNZXJnZXIge1xuXG4gICAgICAgIC8vIFRha2UgdGhlIGlucHV0IExpbmVEYXRhIGFuZCBzdW0gdXAgYWxsIG1lYXN1cmVtZW50cyBhY3Jvc3MgYWxsIGFzc2F5cy9tZXRhYm9saXRlc1xuICAgICAgICAvLyBpbnRvIGEgbGlzdCBvZiB7dGltZVN0YW1wLCB0b3RhbENhcmJvbkluLCB0b3RhbENhcmJvbk91dH0gb2JqZWN0cyAoc29ydGVkIGJ5IHRpbWVTdGFtcCkuXG4gICAgICAgIHB1YmxpYyBzdGF0aWMgbWVyZ2VBbGxMaW5lU2FtcGxlcyhsaW5lRGF0YTpMaW5lRGF0YSk6TWVyZ2VkTGluZVNhbXBsZXMge1xuICAgICAgICAgICAgdmFyIG1lcmdlZExpbmVTYW1wbGVzOk1lcmdlZExpbmVTYW1wbGVzID0gbmV3IE1lcmdlZExpbmVTYW1wbGVzKCksXG4gICAgICAgICAgICAgICAgLy8gRmlyc3QsIGJ1aWxkIGEgbGlzdCBvZiB0aW1lc3RhbXBzIGZyb20gXCJwcmltYXJ5IGFzc2F5c1wiIChpLmUuIG5vbi1SQU1PUyBhc3NheXMpLlxuICAgICAgICAgICAgICAgIC8vIG9iamVjdCBpcyBiZWluZyB1c2VkIGFzIGEgc2V0XG4gICAgICAgICAgICAgICAgdmFsaWRUaW1lU3RhbXBzOntbaTpudW1iZXJdOm51bWJlcn0gPSB7fSxcbiAgICAgICAgICAgICAgICBtZXJnZWRTYW1wbGVzOk1lcmdlZExpbmVUaW1lTG9va3VwID0gPE1lcmdlZExpbmVUaW1lTG9va3VwPnt9O1xuXG4gICAgICAgICAgICAkLmVhY2gobGluZURhdGEuYXNzYXlzQnlJRCwgKGFrZXk6c3RyaW5nLCBhc3NheTpBc3NheURhdGEpOnZvaWQgPT4ge1xuICAgICAgICAgICAgICAgICQuZWFjaChhc3NheS50aW1lbGluZXNCeU1lYXN1cmVtZW50SWQsXG4gICAgICAgICAgICAgICAgICAgICAgICAodGtleTpzdHJpbmcsIHRpbWVsaW5lOk1ldGFib2xpdGVUaW1lbGluZSk6dm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgICAgIG1lcmdlZExpbmVTYW1wbGVzLm1ldGFib2xpdGVUaW1lbGluZXMucHVzaCh0aW1lbGluZSk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChUaW1lbGluZU1lcmdlci5faXNQcmltYXJ5QXNzYXkoYXNzYXkpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aW1lbGluZS50aW1lU2FtcGxlcy5mb3JFYWNoKChzYW1wbGU6VGltZVNhbXBsZSk6dm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFsaWRUaW1lU3RhbXBzW3NhbXBsZS50aW1lU3RhbXBdID0gc2FtcGxlLnRpbWVTdGFtcDtcbiAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICQuZWFjaCh2YWxpZFRpbWVTdGFtcHMsIChrZXk6c3RyaW5nLCB0aW1lU3RhbXA6bnVtYmVyKTp2b2lkID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgb3V0U2FtcGxlOk1lcmdlZExpbmVTYW1wbGUsIHRpbWVsaW5lczpNZXRhYm9saXRlVGltZWxpbmVbXTtcbiAgICAgICAgICAgICAgICBpZiAodGltZVN0YW1wID09PSAwKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgb3V0U2FtcGxlID0gbmV3IE1lcmdlZExpbmVTYW1wbGUodGltZVN0YW1wKTtcbiAgICAgICAgICAgICAgICBtZXJnZWRTYW1wbGVzW3RpbWVTdGFtcF0gPSBvdXRTYW1wbGU7XG4gICAgICAgICAgICAgICAgdGltZWxpbmVzID0gbWVyZ2VkTGluZVNhbXBsZXMubWV0YWJvbGl0ZVRpbWVsaW5lcztcbiAgICAgICAgICAgICAgICB0aW1lbGluZXMuZm9yRWFjaCgodGltZWxpbmU6TWV0YWJvbGl0ZVRpbWVsaW5lKTp2b2lkID0+IHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIGNhcmJvbkRlbHRhOm51bWJlciA9IHRpbWVsaW5lLmludGVycG9sYXRlQ2FyYm9uRGVsdGEodGltZVN0YW1wKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGNhcmJvbkRlbHRhID4gMCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgb3V0U2FtcGxlLnRvdGFsQ2FyYm9uT3V0ICs9IGNhcmJvbkRlbHRhO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgb3V0U2FtcGxlLnRvdGFsQ2FyYm9uSW4gLT0gY2FyYm9uRGVsdGE7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgLy8gc29ydCB0aGUgc2FtcGxlcyBieSB0aW1lc3RhbXBcbiAgICAgICAgICAgIG1lcmdlZExpbmVTYW1wbGVzLm1lcmdlZExpbmVTYW1wbGVzID0gJC5tYXAoXG4gICAgICAgICAgICAgICAgbWVyZ2VkU2FtcGxlcyxcbiAgICAgICAgICAgICAgICAoc2FtcGxlOk1lcmdlZExpbmVTYW1wbGUpOk1lcmdlZExpbmVTYW1wbGUgPT4gc2FtcGxlXG4gICAgICAgICAgICApLnNvcnQoKGE6TWVyZ2VkTGluZVNhbXBsZSwgYjpNZXJnZWRMaW5lU2FtcGxlKTpudW1iZXIgPT4ge1xuICAgICAgICAgICAgICAgIHJldHVybiBhLnRpbWVTdGFtcCAtIGIudGltZVN0YW1wO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICByZXR1cm4gbWVyZ2VkTGluZVNhbXBsZXM7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBSZXR1cm5zIHRydWUgaWYgdGhpcyBpcyBhIFwicHJpbWFyeVwiIGFzc2F5LCB3aGljaCBtZWFucyB0aGF0IHdlJ2xsIHVzZSBpdCB0byBnZW5lcmF0ZVxuICAgICAgICAvLyBjYXJib24gYmFsYW5jZSB0aW1lIHNhbXBsZXMuIEEgbm9uLXByaW1hcnkgYXNzYXkgaXMgc29tZXRoaW5nIHRoYXQgZ2VuZXJhdGVzIGEgdG9uIG9mXG4gICAgICAgIC8vIHNhbXBsZXMgbGlrZSBSQU1PUy5cbiAgICAgICAgcHJpdmF0ZSBzdGF0aWMgX2lzUHJpbWFyeUFzc2F5KGFzc2F5OkFzc2F5RGF0YSk6Ym9vbGVhbiB7XG4gICAgICAgICAgICB2YXIgc2VydmVyQXNzYXlEYXRhOkFzc2F5UmVjb3JkID0gRURERGF0YS5Bc3NheXNbYXNzYXkuYXNzYXlJZF0sXG4gICAgICAgICAgICAgICAgcHJvdG9jb2w6YW55ID0gRURERGF0YS5Qcm90b2NvbHNbc2VydmVyQXNzYXlEYXRhLnBpZF07XG4gICAgICAgICAgICAvLyBUT0RPOiBGcmFnaWxlXG4gICAgICAgICAgICByZXR1cm4gKHByb3RvY29sLm5hbWUgIT09ICdPMi9DTzInKTtcbiAgICAgICAgfVxuICAgIH1cblxufSAvLyBlbmQgbW9kdWxlIENhcmJvbkJhbGFuY2VcbiJdfQ==