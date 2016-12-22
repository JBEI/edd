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
