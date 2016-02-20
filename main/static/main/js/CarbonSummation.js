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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiQ2FyYm9uU3VtbWF0aW9uLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiQ2FyYm9uU3VtbWF0aW9uLnRzIl0sIm5hbWVzIjpbIkNhcmJvbkJhbGFuY2UiLCJDYXJib25CYWxhbmNlLlN1bW1hdGlvbiIsIkNhcmJvbkJhbGFuY2UuU3VtbWF0aW9uLmNvbnN0cnVjdG9yIiwiQ2FyYm9uQmFsYW5jZS5TdW1tYXRpb24uY3JlYXRlIiwiQ2FyYm9uQmFsYW5jZS5TdW1tYXRpb24uZ2VuZXJhdGVEZWJ1Z1RleHQiLCJDYXJib25CYWxhbmNlLlN1bW1hdGlvbi5tZXJnZUFsbExpbmVTYW1wbGVzIiwiQ2FyYm9uQmFsYW5jZS5TdW1tYXRpb24uZ2V0TGluZURhdGFCeUlEIiwiQ2FyYm9uQmFsYW5jZS5TdW1tYXRpb24uaW5pdCIsIkNhcmJvbkJhbGFuY2UuU3VtbWF0aW9uLl93cml0ZURlYnVnTGluZSIsIkNhcmJvbkJhbGFuY2UuU3VtbWF0aW9uLl93cml0ZURlYnVnTGluZVdpdGhIZWFkZXIiLCJDYXJib25CYWxhbmNlLlN1bW1hdGlvbi5fbnVtU3RyIiwiQ2FyYm9uQmFsYW5jZS5TdW1tYXRpb24uX2RvZXNNZWFzdXJlbWVudENvbnRhaW5DYXJib24iLCJDYXJib25CYWxhbmNlLlN1bW1hdGlvbi5fY2FsY3VsYXRlQ21Nb2xQZXJMaXRlciIsIkNhcmJvbkJhbGFuY2UuU3VtbWF0aW9uLl9pc09wdGljYWxEZW5zaXR5TWVhc3VyZW1lbnQiLCJDYXJib25CYWxhbmNlLlN1bW1hdGlvbi5faW50ZWdyYXRlQXNzYXlNZWFzdXJlbWVudHMiLCJDYXJib25CYWxhbmNlLlN1bW1hdGlvbi5fZ2V0TWVhc3VyZW1lbnRUaW1lc3RhbXBzU29ydGVkIiwiQ2FyYm9uQmFsYW5jZS5TdW1tYXRpb24uX2J1aWxkU29ydGVkTWVhc3VyZW1lbnRzRm9yQXNzYXlNZXRhYm9saXRlIiwiQ2FyYm9uQmFsYW5jZS5TdW1tYXRpb24uX2NhbGN1bGF0ZUNhcmJvbkRlbHRhcyIsIkNhcmJvbkJhbGFuY2UuU3VtbWF0aW9uLl9jYWxjVGltZURlbHRhIiwiQ2FyYm9uQmFsYW5jZS5TdW1tYXRpb24uX2ZpdE9uU29ydGVkVGltZWxpbmUiLCJDYXJib25CYWxhbmNlLlN1bW1hdGlvbi5fY2FsY3VsYXRlT3B0aWNhbERlbnNpdHlGYWN0b3IiLCJDYXJib25CYWxhbmNlLlN1bW1hdGlvbi5fZ2V0T3B0aWNhbERlbnNpdHlNZWFzdXJlbWVudEZvckxpbmUiLCJDYXJib25CYWxhbmNlLlN1bW1hdGlvbi5fcHJlY2FsY3VsYXRlVmFsaWRMaXN0cyIsIkNhcmJvbkJhbGFuY2UuTGluZURhdGEiLCJDYXJib25CYWxhbmNlLkxpbmVEYXRhLmNvbnN0cnVjdG9yIiwiQ2FyYm9uQmFsYW5jZS5MaW5lRGF0YS5nZXRMaW5lSUQiLCJDYXJib25CYWxhbmNlLkxpbmVEYXRhLmZpbHRlckFzc2F5c0J5VGltZVN0YW1wIiwiQ2FyYm9uQmFsYW5jZS5MaW5lRGF0YS5nZXRJbk91dFN1bUF0VGltZSIsIkNhcmJvbkJhbGFuY2UuTWVyZ2VkTGluZVNhbXBsZXMiLCJDYXJib25CYWxhbmNlLk1lcmdlZExpbmVTYW1wbGVzLmNvbnN0cnVjdG9yIiwiQ2FyYm9uQmFsYW5jZS5NZXJnZWRMaW5lU2FtcGxlIiwiQ2FyYm9uQmFsYW5jZS5NZXJnZWRMaW5lU2FtcGxlLmNvbnN0cnVjdG9yIiwiQ2FyYm9uQmFsYW5jZS5Jbk91dFN1bSIsIkNhcmJvbkJhbGFuY2UuSW5PdXRTdW0uY29uc3RydWN0b3IiLCJDYXJib25CYWxhbmNlLkluT3V0U3VtTWVhc3VyZW1lbnQiLCJDYXJib25CYWxhbmNlLkluT3V0U3VtTWVhc3VyZW1lbnQuY29uc3RydWN0b3IiLCJDYXJib25CYWxhbmNlLkluT3V0U3VtTWVhc3VyZW1lbnQuYWJzRGVsdGEiLCJDYXJib25CYWxhbmNlLkFzc2F5RGF0YSIsIkNhcmJvbkJhbGFuY2UuQXNzYXlEYXRhLmNvbnN0cnVjdG9yIiwiQ2FyYm9uQmFsYW5jZS5Bc3NheURhdGEuZ2V0VGltZVNhbXBsZXNCeVRpbWVTdGFtcCIsIkNhcmJvbkJhbGFuY2UuTWV0YWJvbGl0ZVRpbWVsaW5lIiwiQ2FyYm9uQmFsYW5jZS5NZXRhYm9saXRlVGltZWxpbmUuY29uc3RydWN0b3IiLCJDYXJib25CYWxhbmNlLk1ldGFib2xpdGVUaW1lbGluZS5pbnRlcnBvbGF0ZUNhcmJvbkRlbHRhIiwiQ2FyYm9uQmFsYW5jZS5NZXRhYm9saXRlVGltZWxpbmUuZmluZFNhbXBsZUJ5VGltZVN0YW1wIiwiQ2FyYm9uQmFsYW5jZS5UaW1lU2FtcGxlIiwiQ2FyYm9uQmFsYW5jZS5UaW1lU2FtcGxlLmNvbnN0cnVjdG9yIiwiQ2FyYm9uQmFsYW5jZS5UaW1lU2FtcGxlLmlzSW5wdXQiLCJDYXJib25CYWxhbmNlLlRpbWVTYW1wbGUuaXNPdXRwdXQiLCJDYXJib25CYWxhbmNlLlRpbWVTYW1wbGUuYWJzRGVsdGEiLCJDYXJib25CYWxhbmNlLlRpbWVsaW5lTWVyZ2VyIiwiQ2FyYm9uQmFsYW5jZS5UaW1lbGluZU1lcmdlci5jb25zdHJ1Y3RvciIsIkNhcmJvbkJhbGFuY2UuVGltZWxpbmVNZXJnZXIubWVyZ2VBbGxMaW5lU2FtcGxlcyIsIkNhcmJvbkJhbGFuY2UuVGltZWxpbmVNZXJnZXIuX2lzUHJpbWFyeUFzc2F5Il0sIm1hcHBpbmdzIjoiQUFBQSxxREFBcUQ7QUFDckQsK0JBQStCO0FBQy9CLDhDQUE4QztBQUU5QyxJQUFPLGFBQWEsQ0F1N0JuQjtBQXY3QkQsV0FBTyxhQUFhLEVBQUMsQ0FBQztJQUNsQkEsWUFBWUEsQ0FBQ0E7SUFzQmJBLDZEQUE2REE7SUFDN0RBLCtFQUErRUE7SUFDL0VBLG9EQUFvREE7SUFDcERBLEVBQUVBO0lBQ0ZBLG9EQUFvREE7SUFDcERBO1FBQUFDO1lBRUlDLGlEQUFpREE7WUFDakRBLGlCQUFZQSxHQUErQkEsRUFBRUEsQ0FBQ0E7WUFDOUNBLGtEQUFrREE7WUFDbERBLHNCQUFpQkEsR0FBVUEsQ0FBQ0EsQ0FBQ0E7WUFFN0JBLDRDQUE0Q0E7WUFDNUNBLGlEQUFpREE7WUFDekNBLHlCQUFvQkEsR0FBc0JB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QUVERix1RkFBdUZBO1FBQ3ZGQSx3RkFBd0ZBO1FBQ3hGQSxzQkFBc0JBO1FBQ1BBLDhCQUFlQSxHQUE5QkEsVUFBK0JBLEtBQWVBO1lBQzFDRyxJQUFJQSxlQUFlQSxHQUFlQSxPQUFPQSxDQUFDQSxNQUFNQSxDQUFDQSxLQUFLQSxDQUFDQSxPQUFPQSxDQUFDQSxFQUMzREEsUUFBUUEsR0FBT0EsT0FBT0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsZUFBZUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7WUFDMURBLGdCQUFnQkE7WUFDaEJBLE1BQU1BLENBQUNBLENBQUNBLFFBQVFBLENBQUNBLElBQUlBLEtBQUtBLFFBQVFBLENBQUNBLENBQUNBO1FBQ3hDQSxDQUFDQTtRQUNMSCxxQkFBQ0E7SUFBREEsQ0FBQ0EsQUExRERqRCxJQTBEQ0E7SUExRFlBLDRCQUFjQSxpQkEwRDFCQSxDQUFBQTtBQUVMQSxDQUFDQSxFQXY3Qk0sYUFBYSxLQUFiLGFBQWEsUUF1N0JuQixDQUFDLDJCQUEyQiIsInNvdXJjZXNDb250ZW50IjpbIi8vLyA8cmVmZXJlbmNlIHBhdGg9XCJ0eXBlc2NyaXB0LWRlY2xhcmF0aW9ucy5kLnRzXCIgLz5cbi8vLyA8cmVmZXJlbmNlIHBhdGg9XCJVdGwudHNcIiAvPlxuLy8vIDxyZWZlcmVuY2UgcGF0aD1cIlN0dWR5Q2FyYm9uQmFsYW5jZS50c1wiIC8+XG5cbm1vZHVsZSBDYXJib25CYWxhbmNlIHtcbiAgICAndXNlIHN0cmljdCc7XG5cbiAgICBpbnRlcmZhY2UgVmFsaWRhdGVkVmFsdWUge1xuICAgICAgICBpc1ZhbGlkOmJvb2xlYW47XG4gICAgICAgIHZhbHVlOm51bWJlcjtcbiAgICB9XG5cbiAgICAvLyB2YWx1ZXMgYnkgdGltZSBzZXJpZXNcbiAgICBpbnRlcmZhY2UgSW50ZWdyYWwge1xuICAgICAgICBbdGltZTpudW1iZXJdOiBudW1iZXI7XG4gICAgfVxuXG4gICAgLy8gc3RvcmUgdGltZSBzZXJpZXMgYnkgbWVhc3VyZW1lbnQgSUQgKG9yIHNpbWlsYXIgSUQpXG4gICAgaW50ZXJmYWNlIEludGVncmFsTG9va3VwIHtcbiAgICAgICAgW2lkOm51bWJlcl06IEludGVncmFsO1xuICAgIH1cblxuICAgIC8vIHN0b3JlIGEgbGlzdCBvZiBJRHMgcmVhY2hhYmxlIGZyb20gYW5vdGhlciBJRFxuICAgIGludGVyZmFjZSBJRExvb2t1cCB7XG4gICAgICAgIFtpZDpudW1iZXJdOiBudW1iZXJbXTtcbiAgICB9XG5cbiAgICAvLyBUaGlzIGlzIHRoZSBjbGllbnQtc2lkZSBjb250YWluZXIgZm9yIGNhcmJvbiBiYWxhbmNlIGRhdGEuXG4gICAgLy8gSXQgY29tYnMgdGhyb3VnaCBsaW5lcy9hc3NheXMvbWVhc3VyZW1lbnRzIHRvIGJ1aWxkIGEgc3RydWN0dXJlIHRoYXQgaXMgZWFzeVxuICAgIC8vIHRvIHB1bGwgZnJvbSB3aGVuIGRpc3BsYXlpbmcgY2FyYm9uIGJhbGFuY2UgZGF0YS5cbiAgICAvL1xuICAgIC8vIFRoaXMgaXMgcHVyZWx5IGEgZGF0YSBjbGFzcywgTk9UIGEgZGlzcGxheSBjbGFzcy5cbiAgICBleHBvcnQgY2xhc3MgU3VtbWF0aW9uIHtcblxuICAgICAgICAvLyBEYXRhIGZvciBlYWNoIGxpbmUgb2YgdHlwZSBTdW1tYXRpb24uTGluZURhdGEuXG4gICAgICAgIGxpbmVEYXRhQnlJRDoge1tsaW5lSUQ6bnVtYmVyXTpMaW5lRGF0YX0gPSB7fTtcbiAgICAgICAgLy8gVGhlIGhpZ2hlc3QgdGltZSB2YWx1ZSB0aGF0IGFueSBUaW1lU2FtcGxlIGhhcy5cbiAgICAgICAgbGFzdFRpbWVJblNlY29uZHM6bnVtYmVyID0gMDtcblxuICAgICAgICAvLyBQcmVjYWxjdWxhdGVkIGxvb2t1cHMgdG8gc3BlZWQgdGhpbmdzIHVwLlxuICAgICAgICAvLyBBbiBhcnJheSBvZiBub24tZGlzYWJsZWQgYXNzYXlzIGZvciBlYWNoIGxpbmUuXG4gICAgICAgIHByaXZhdGUgX3ZhbGlkQXNzYXlzQnlMaW5lSUQ6SURMb29rdXAgPSA8SURMb29rdXA+e307XG4gICAgICAgIC8vIEFuIGFycmF5IG9mIG5vbi1kaXNhYmxlZCBtZWFzdXJlbWVudHMgZm9yIGVhY2ggYXNzYXkuXG4gICAgICAgIHByaXZhdGUgX3ZhbGlkTWVhc3VyZW1lbnRzQnlBc3NheUlEOklETG9va3VwID0gPElETG9va3VwPnt9O1xuICAgICAgICAvLyBMb29rdXAgdGhlIE9EIG1lYXN1cmVtZW50IGZvciBlYWNoIGxpbmUuXG4gICAgICAgIHByaXZhdGUgX29wdGljYWxEZW5zaXR5TWVhc3VyZW1lbnRJREJ5TGluZUlEOntbbGluZUlEOm51bWJlcl06bnVtYmVyfSA9IHt9O1xuXG4gICAgICAgIC8vIFRoaXMgaXMgZnJvbSBjb252ZXJ0aW5nIHRoZSBhc3NheSBtZWFzdXJlbWVudCBsaXN0IGdpdmVuIHRvIHVzIGludG8gYSBoYXNoIGJ5IHRpbWVzdGFtcC5cbiAgICAgICAgcHJpdmF0ZSBfYXNzYXlNZWFzdXJlbWVudERhdGFCeUlEOkludGVncmFsTG9va3VwO1xuICAgICAgICBwcml2YXRlIF9kZWJ1Z0xpbmVJRDpudW1iZXIgPSAwO1xuICAgICAgICAvLyBJZiB0aGlzIGlzIHNldCwgdGhlbiB3ZSdsbCBiZSBlbWl0dGluZyBkZWJ1ZyBIVE1MIHRvIF9kZWJ1Z091dHB1dC5cbiAgICAgICAgcHJpdmF0ZSBfZGVidWdUaW1lU3RhbXA6bnVtYmVyO1xuICAgICAgICBwcml2YXRlIF9kZWJ1Z091dHB1dDpzdHJpbmc7XG4gICAgICAgIC8vIEF1dG8gdGFiIG9uIGRlYnVnIG91dHB1dC5cbiAgICAgICAgcHJpdmF0ZSBfZGVidWdPdXRwdXRJbmRlbnQ6bnVtYmVyID0gMDtcblxuXG4gICAgICAgIC8vIFVzZSB0aGlzIHRvIGNyZWF0ZSBhIHN1bW1hdGlvbiBvYmplY3QuXG4gICAgICAgIHN0YXRpYyBjcmVhdGUoYmlvbWFzc0NhbGN1bGF0aW9uOm51bWJlcik6U3VtbWF0aW9uIHtcblxuICAgICAgICAgICAgdmFyIHN1bTpTdW1tYXRpb24gPSBuZXcgU3VtbWF0aW9uKCk7XG4gICAgICAgICAgICBzdW0uaW5pdChiaW9tYXNzQ2FsY3VsYXRpb24pO1xuICAgICAgICAgICAgcmV0dXJuIHN1bTtcbiAgICAgICAgfVxuXG5cbiAgICAgICAgLy8gVXNlIHRoaXMgdG8gZ2VuZXJhdGUgc29tZSBkZWJ1ZyB0ZXh0IHRoYXQgZGVzY3JpYmVzIGFsbCB0aGUgY2FsY3VsYXRpb25zLlxuICAgICAgICBzdGF0aWMgZ2VuZXJhdGVEZWJ1Z1RleHQoYmlvbWFzc0NhbGN1bGF0aW9uOm51bWJlcixcbiAgICAgICAgICAgICAgICBkZWJ1Z0xpbmVJRDpudW1iZXIsXG4gICAgICAgICAgICAgICAgZGVidWdUaW1lU3RhbXA6bnVtYmVyKTpzdHJpbmcge1xuXG4gICAgICAgICAgICAvLyBDcmVhdGUgYSBTdW1tYXRpb24gb2JqZWN0IGJ1dCB0ZWxsIGl0IHRvIGdlbmVyYXRlIGRlYnVnIGluZm8gd2hpbGUgaXQgZG9lcyBpdHNcbiAgICAgICAgICAgIC8vIHRpbWVzdGFtcHMuXG4gICAgICAgICAgICB2YXIgc3VtOlN1bW1hdGlvbiA9IG5ldyBTdW1tYXRpb24oKTtcbiAgICAgICAgICAgIHN1bS5fZGVidWdMaW5lSUQgPSBkZWJ1Z0xpbmVJRDtcbiAgICAgICAgICAgIHN1bS5fZGVidWdUaW1lU3RhbXAgPSBkZWJ1Z1RpbWVTdGFtcDtcbiAgICAgICAgICAgIHN1bS5fZGVidWdPdXRwdXQgPSBcIlwiO1xuICAgICAgICAgICAgc3VtLmluaXQoYmlvbWFzc0NhbGN1bGF0aW9uKTtcblxuICAgICAgICAgICAgLy8gUmV0dXJuIGl0cyBkZWJ1ZyBpbmZvLlxuICAgICAgICAgICAgcmV0dXJuIHN1bS5fZGVidWdPdXRwdXQ7XG4gICAgICAgIH1cblxuXG4gICAgICAgIC8vIFRoaXMganVzdCB3cmFwcyB0aGUgY2FsbCB0byBUaW1lbGluZU1lcmdlci5tZXJnZUFsbExpbmVTYW1wbGVzLlxuICAgICAgICBtZXJnZUFsbExpbmVTYW1wbGVzKGxpbmVEYXRhOmFueSk6TWVyZ2VkTGluZVNhbXBsZXMge1xuICAgICAgICAgICAgcmV0dXJuIFRpbWVsaW5lTWVyZ2VyLm1lcmdlQWxsTGluZVNhbXBsZXMobGluZURhdGEpO1xuICAgICAgICB9XG5cblxuICAgICAgICBnZXRMaW5lRGF0YUJ5SUQobGluZUlEOm51bWJlcik6TGluZURhdGEge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMubGluZURhdGFCeUlEW2xpbmVJRF07XG4gICAgICAgIH1cblxuXG4gICAgICAgIC8vIEludGVybmFsbHksIHRoaXMgaXMgaG93IHdlIGluaXQgdGhlIFN1bW1hdGlvbiBvYmplY3QgcmVnYXJkbGVzcyBvZiB3aGV0aGVyIGl0J3MgdXNlZFxuICAgICAgICAvLyBsYXRlciBvciB3aGV0aGVyIGl0J3MganVzdCB1c2VkIHRvIGdldCBzb21lIGRlYnVnIHRleHQuXG4gICAgICAgIHByaXZhdGUgaW5pdChiaW9tYXNzQ2FsY3VsYXRpb246bnVtYmVyKTp2b2lkIHtcbiAgICAgICAgICAgIHZhciBpbnRlZ3JhbHNCeU1lYXN1cmVtZW50SUQ6SW50ZWdyYWxMb29rdXA7XG5cbiAgICAgICAgICAgIHRoaXMuX3ByZWNhbGN1bGF0ZVZhbGlkTGlzdHMoKTtcbiAgICAgICAgICAgIC8vIENvbnZlcnQgdG8gYSBoYXNoIG9uIHRpbWVzdGFtcCAoeCB2YWx1ZSlcbiAgICAgICAgICAgIHRoaXMuX2Fzc2F5TWVhc3VyZW1lbnREYXRhQnlJRCA9IHt9O1xuICAgICAgICAgICAgJC5lYWNoKEVERERhdGEuQXNzYXlNZWFzdXJlbWVudHMsIChpZDpzdHJpbmcsIG1lYXN1cmU6QXNzYXlNZWFzdXJlbWVudFJlY29yZCk6dm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIG91dDpJbnRlZ3JhbCA9IHRoaXMuX2Fzc2F5TWVhc3VyZW1lbnREYXRhQnlJRFtpZF0gPSA8SW50ZWdyYWw+e307XG4gICAgICAgICAgICAgICAgJC5lYWNoKG1lYXN1cmUudmFsdWVzLCAoaTpudW1iZXIsIHBvaW50Om51bWJlcltdW10pOnZvaWQgPT4ge1xuICAgICAgICAgICAgICAgICAgICAvLyBvbmx5IGRvIG1hcHBpbmcgZm9yICh4LHkpIHBvaW50cywgd29uJ3QgbWFrZSBzZW5zZSB3aXRoIGhpZ2hlciBkaW1lbnNpb25zXG4gICAgICAgICAgICAgICAgICAgIGlmIChwb2ludFswXS5sZW5ndGggPT09IDEgJiYgcG9pbnRbMV0ubGVuZ3RoID09PSAxKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBvdXRbcG9pbnRbMF1bMF1dID0gcG9pbnRbMV1bMF07XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICAvLyBXZSBuZWVkIHRvIHByZXBhcmUgaW50ZWdyYWxzIG9mIGFueSBtb2wvTC9oclxuICAgICAgICAgICAgaW50ZWdyYWxzQnlNZWFzdXJlbWVudElEID0gdGhpcy5faW50ZWdyYXRlQXNzYXlNZWFzdXJlbWVudHMoYmlvbWFzc0NhbGN1bGF0aW9uKTtcblxuICAgICAgICAgICAgLy8gSXRlcmF0ZSBvdmVyIGxpbmVzLlxuICAgICAgICAgICAgJC5lYWNoKEVERERhdGEuTGluZXMsIChsaW5lSWQ6c3RyaW5nLCBsaW5lOkxpbmVSZWNvcmQpOnZvaWQgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBvdXQ6TGluZURhdGEsIGFueVNhbXBsZXNBZGRlZDpib29sZWFuID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgaWYgKCFsaW5lLmFjdGl2ZSkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIG91dCA9IG5ldyBMaW5lRGF0YShsaW5lLmlkKTtcbiAgICAgICAgICAgICAgICB0aGlzLl92YWxpZEFzc2F5c0J5TGluZUlEW2xpbmUuaWRdLmZvckVhY2goKGFzc2F5SWQ6bnVtYmVyKTp2b2lkID0+IHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIGFzc2F5OkFzc2F5UmVjb3JkID0gRURERGF0YS5Bc3NheXNbYXNzYXlJZF0sXG4gICAgICAgICAgICAgICAgICAgICAgICBwcm90b2NvbDphbnkgPSBFREREYXRhLlByb3RvY29sc1thc3NheS5waWRdLFxuICAgICAgICAgICAgICAgICAgICAgICAgbmFtZTpzdHJpbmcgPSBbbGluZS5uYW1lLCBwcm90b2NvbC5uYW1lLCBhc3NheS5uYW1lXS5qb2luKCctJyksXG4gICAgICAgICAgICAgICAgICAgICAgICBvdXRBc3NheTpBc3NheURhdGEgPSBuZXcgQXNzYXlEYXRhKGFzc2F5SWQpLFxuICAgICAgICAgICAgICAgICAgICAgICAgdmFsaWQ6bnVtYmVyID0gMDtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fd3JpdGVEZWJ1Z0xpbmUobGluZS5pZCA9PT0gdGhpcy5fZGVidWdMaW5lSUQsIFwiQXNzYXkgXCIgKyBuYW1lKTtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fZGVidWdPdXRwdXRJbmRlbnQrKztcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fdmFsaWRNZWFzdXJlbWVudHNCeUFzc2F5SURbYXNzYXlJZF0uZm9yRWFjaCgobWVhc3VyZUlkOm51bWJlcik6dm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICB2YXIgbWVhc3VyZTpBc3NheU1lYXN1cmVtZW50UmVjb3JkID0gRURERGF0YS5Bc3NheU1lYXN1cmVtZW50c1ttZWFzdXJlSWRdLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRpbWVsaW5lOk1ldGFib2xpdGVUaW1lbGluZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICghdGhpcy5fZG9lc01lYXN1cmVtZW50Q29udGFpbkNhcmJvbihtZWFzdXJlKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX3dyaXRlRGVidWdMaW5lKGxpbmUuaWQgPT09IHRoaXMuX2RlYnVnTGluZUlELFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIEVERERhdGEuTWV0YWJvbGl0ZVR5cGVzW21lYXN1cmUudHlwZV0ubmFtZSk7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9kZWJ1Z091dHB1dEluZGVudCsrO1xuICAgICAgICAgICAgICAgICAgICAgICAgdmFsaWQrKztcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIENyZWF0ZSBNZXRhYm9saXRlVGltZWxpbmUgb3V0cHV0IHN0cnVjdHVyZVxuICAgICAgICAgICAgICAgICAgICAgICAgdGltZWxpbmUgPSBuZXcgTWV0YWJvbGl0ZVRpbWVsaW5lKG91dEFzc2F5LCBtZWFzdXJlSWQpO1xuICAgICAgICAgICAgICAgICAgICAgICAgb3V0QXNzYXkudGltZWxpbmVzQnlNZWFzdXJlbWVudElkW21lYXN1cmVJZF0gPSB0aW1lbGluZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIEJ1aWxkIGEgc29ydGVkIGxpc3Qgb2YgdGltZXN0YW1wL21lYXN1cmVtZW50XG4gICAgICAgICAgICAgICAgICAgICAgICB0aW1lbGluZS50aW1lU2FtcGxlcyA9IHRoaXMuX2J1aWxkU29ydGVkTWVhc3VyZW1lbnRzRm9yQXNzYXlNZXRhYm9saXRlKFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG91dCwgbWVhc3VyZUlkLCBpbnRlZ3JhbHNCeU1lYXN1cmVtZW50SUQsIGJpb21hc3NDYWxjdWxhdGlvbik7XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBLZWVwIHRyYWNrIG9mIHRoZSBsYXN0IHNhbXBsZSdzIHRpbWVcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICh0aW1lbGluZS50aW1lU2FtcGxlcykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGFueVNhbXBsZXNBZGRlZCA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5sYXN0VGltZUluU2Vjb25kcyA9IE1hdGgubWF4KHRoaXMubGFzdFRpbWVJblNlY29uZHMsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRpbWVsaW5lLnRpbWVTYW1wbGVzLnNsaWNlKC0xKVswXS50aW1lU3RhbXApO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fd3JpdGVEZWJ1Z0xpbmUobGluZS5pZCA9PT0gdGhpcy5fZGVidWdMaW5lSUQsIFwiXCIpO1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fZGVidWdPdXRwdXRJbmRlbnQtLTtcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIC8vIHN0b3JlIHRoZSBhc3NheVxuICAgICAgICAgICAgICAgICAgICBvdXQuYXNzYXlzQnlJRFthc3NheUlkXSA9IG91dEFzc2F5O1xuICAgICAgICAgICAgICAgICAgICB0aGlzLl93cml0ZURlYnVnTGluZShsaW5lLmlkID09PSB0aGlzLl9kZWJ1Z0xpbmVJRCwgXCJcIik7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX2RlYnVnT3V0cHV0SW5kZW50LS07XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgaWYgKGFueVNhbXBsZXNBZGRlZCkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmxpbmVEYXRhQnlJRFtsaW5lLmlkXSA9IG91dDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICB9XG5cblxuICAgICAgICAvLyBBcHBlbmQgdGhlIHN0cmluZyB0byBvdXIgX2RlYnVnT3V0cHV0IHN0cmluZyBpZiBzaG91bGRXcml0ZT10cnVlLlxuICAgICAgICAvLyAoSGF2aW5nIHNob3VsZFdyaXRlIHRoZXJlIG1ha2VzIGl0IGVhc2llciB0byBkbyBhIG9uZS1saW5lIGRlYnVnIG91dHB1dCB0aGF0IGluY2x1ZGVzXG4gICAgICAgIC8vIHRoZSBjaGVjayBvZiB3aGV0aGVyIGl0IHNob3VsZCB3cml0ZSkuXG4gICAgICAgIHByaXZhdGUgX3dyaXRlRGVidWdMaW5lKHNob3VsZFdyaXRlOmJvb2xlYW4sIHZhbDpzdHJpbmcpOnZvaWQge1xuICAgICAgICAgICAgaWYgKCFzaG91bGRXcml0ZSkge1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHZhciBpbmRlbnQ6c3RyaW5nW10gPSBbXTtcbiAgICAgICAgICAgIC8vIGtlZXAgYWRkaW5nIGluZGVudHMgdW50aWwgcmVhY2ggbGVuZ3RoIG9mIF9kZWJ1Z091dHB1dEluZGVudFxuICAgICAgICAgICAgLyogdHNsaW50OmRpc2FibGU6Y3VybHkgKi9cbiAgICAgICAgICAgIHdoaWxlICh0aGlzLl9kZWJ1Z091dHB1dEluZGVudCAmJiB0aGlzLl9kZWJ1Z091dHB1dEluZGVudCA+IGluZGVudC5wdXNoKCcgICAgJykpO1xuICAgICAgICAgICAgLyogdHNsaW50OmVuYWJsZTpjdXJseSAqL1xuICAgICAgICAgICAgdGhpcy5fZGVidWdPdXRwdXQgKz0gaW5kZW50LmpvaW4oJycpICsgdmFsICsgXCJcXG5cIjtcbiAgICAgICAgfVxuXG5cbiAgICAgICAgcHJpdmF0ZSBfd3JpdGVEZWJ1Z0xpbmVXaXRoSGVhZGVyKHNob3VsZFdyaXRlOmJvb2xlYW4sIGhlYWRlcjpzdHJpbmcsIHZhbDpzdHJpbmcpOnZvaWQge1xuICAgICAgICAgICAgdmFyIHN0cjpzdHJpbmcgPSBVdGwuSlMucGFkU3RyaW5nTGVmdChcIltcIiArIGhlYWRlciArIFwiXSBcIiwgMzApO1xuICAgICAgICAgICAgdGhpcy5fd3JpdGVEZWJ1Z0xpbmUoc2hvdWxkV3JpdGUsIHN0ciArIHZhbCk7XG4gICAgICAgIH1cblxuXG4gICAgICAgIC8vIENvbnZlcnQgYSBudW1iZXIgdG8gYSBzdHJpbmcgZm9yIGRlYnVnIG91dHB1dC4gSWYgYWxsIHRoZSBjb2RlIHVzZXMgdGhpcywgdGhlblxuICAgICAgICAvLyBhbGwgdGhlIG51bWJlciBmb3JtYXR0aW5nIHdpbGwgYmUgY29uc2lzdGVudC5cbiAgICAgICAgcHJpdmF0ZSBfbnVtU3RyKHZhbHVlOmFueSk6c3RyaW5nIHtcbiAgICAgICAgICAgIHJldHVybiBwYXJzZUZsb2F0KHZhbHVlKS50b0ZpeGVkKDUpO1xuICAgICAgICB9XG5cblxuICAgICAgICAvLyBUaGlzIGlzIHVzZWQgaW4gYSBmaXJzdCBwYXNzIG9uIGEgbWVhc3VyZW1lbnQgdG8gZGVjaWRlIGlmIHdlIHNob3VsZCBzY2FuIGl0c1xuICAgICAgICAvLyBtZWFzdXJlbWVudHMuIElmIHlvdSB1cGRhdGUgdGhpcywgdXBkYXRlIGNhbGN1bGF0ZUNtb2xQZXJMaXRlciAoYW5kIHZpY2UtdmVyc2EpLlxuICAgICAgICBwcml2YXRlIF9kb2VzTWVhc3VyZW1lbnRDb250YWluQ2FyYm9uKG1lYXN1cmU6QXNzYXlNZWFzdXJlbWVudFJlY29yZCk6Ym9vbGVhbiB7XG4gICAgICAgICAgICB2YXIgbXR5cGU6TWV0YWJvbGl0ZVR5cGVSZWNvcmQgPSBFREREYXRhLk1ldGFib2xpdGVUeXBlc1ttZWFzdXJlLnR5cGVdO1xuICAgICAgICAgICAgaWYgKCFtdHlwZSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gT0QgbWVhc3VyZW1lbnRzIHVzZSB0aGUgYmlvbWFzcyBmYWN0b3IgdG8gZXN0aW1hdGUgdGhlIGFtb3VudCBvZiBjYXJib24gY3JlYXRlZFxuICAgICAgICAgICAgLy8gb3IgZGVzdHJveWVkLiBUaGVyZSdzIG5vIGd1YXJhbnRlZSB3ZSBoYWUgYSB2YWxpZCBiaW9tYXNzIGZhY3RvciwgYnV0IHdlIGRlZmluaXRlbHlcbiAgICAgICAgICAgIC8vIGtub3cgdGhlcmUgaXMgY2FyYm9uIGhlcmUuXG4gICAgICAgICAgICBpZiAodGhpcy5faXNPcHRpY2FsRGVuc2l0eU1lYXN1cmVtZW50KG10eXBlKSkge1xuICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdmFyIHVSZWNvcmQ6YW55ID0gRURERGF0YS5Vbml0VHlwZXNbbWVhc3VyZS55X3VuaXRzXTtcbiAgICAgICAgICAgIHZhciB1bml0czpzdHJpbmcgPSB1UmVjb3JkID8gdVJlY29yZC5uYW1lIDogJyc7XG4gICAgICAgICAgICB2YXIgY2FyYm9uQ291bnQ6bnVtYmVyID0gbXR5cGUuY2M7IC8vICMgY2FyYm9ucyBwZXIgbW9sZVxuXG4gICAgICAgICAgICBpZiAodW5pdHMgPT09ICcnIHx8IHVuaXRzID09PSAnbi9hJyB8fCAhY2FyYm9uQ291bnQpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHVuaXRzID09PSAnZy9MJykge1xuICAgICAgICAgICAgICAgIC8vIGcvTCBpcyBmaW5lIGlmIHdlIGhhdmUgYSBtb2xhciBtYXNzIHNvIHdlIGNhbiBjb252ZXJ0IGctPm1vbFxuICAgICAgICAgICAgICAgIHJldHVybiAhIW10eXBlLm1tO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAvLyBBbnl0aGluZyB1c2luZyBtb2xzIGlzIGZpbmUgYXMgd2VsbC5cbiAgICAgICAgICAgICAgICByZXR1cm4gKHVuaXRzID09PSAnbW9sL0wvaHInIHx8XG4gICAgICAgICAgICAgICAgICAgIHVuaXRzID09PSAndU0nIHx8XG4gICAgICAgICAgICAgICAgICAgIHVuaXRzID09PSAnbU0nIHx8XG4gICAgICAgICAgICAgICAgICAgIHVuaXRzID09PSAnbW9sL0wnIHx8XG4gICAgICAgICAgICAgICAgICAgIHVuaXRzID09PSAnQ21vbC9MJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICAvLyBEbyB1bml0IGNvbnZlcnNpb25zIGluIG9yZGVyIHRvIGdldCBhIENtb2wvTCB2YWx1ZS5cbiAgICAgICAgLy8gKiogTk9URTogVGhpcyBpcyBcIkMtbW9sZXNcIiwgd2hpY2ggaXMgQ0FSQk9OIG1vbC9MIChhcyBvcHBvc2VkIHRvIENFTlRJIG1vbC9MKS5cbiAgICAgICAgcHJpdmF0ZSBfY2FsY3VsYXRlQ21Nb2xQZXJMaXRlcihtZWFzdXJlbWVudElEOm51bWJlcixcbiAgICAgICAgICAgICAgICB0aW1lU3RhbXA6bnVtYmVyLFxuICAgICAgICAgICAgICAgIGludGVncmFsc0J5TWVhc3VyZW1lbnRJRDpJbnRlZ3JhbExvb2t1cCxcbiAgICAgICAgICAgICAgICBiaW9tYXNzQ2FsY3VsYXRpb246bnVtYmVyLFxuICAgICAgICAgICAgICAgIGRPdXQ6Ym9vbGVhbik6VmFsaWRhdGVkVmFsdWUge1xuICAgICAgICAgICAgLy8gQSBtZWFzdXJlbWVudCBpcyB0aGUgdGltZSBzZXJpZXMgZGF0YSBmb3IgT05FIG1ldGFib2xpdGVcbiAgICAgICAgICAgIC8vIG1lYXN1cmVtZW50LnZhbHVlcyBjb250YWlucyBhbGwgdGhlIG1lYXR5IHN0dWZmIC0gYSAzLWRpbWVuc2lvbmFsIGFycmF5IHdpdGg6XG4gICAgICAgICAgICAvLyBmaXJzdCBpbmRleCBzZWxlY3RpbmcgcG9pbnQgdmFsdWU7XG4gICAgICAgICAgICAvLyBzZWNvbmQgaW5kZXggMCBmb3IgeCwgMSBmb3IgeTtcbiAgICAgICAgICAgIC8vIHRoaXJkIGluZGV4IHN1YnNjcmlwdGVkIHZhbHVlcztcbiAgICAgICAgICAgIC8vIGUuZy4gbWVhc3VyZW1lbnQudmFsdWVzWzJdWzBdWzFdIGlzIHRoZSB4MSB2YWx1ZSBvZiB0aGUgdGhpcmQgbWVhc3VyZW1lbnQgdmFsdWVcbiAgICAgICAgICAgIHZhciBtZWFzdXJlbWVudDpBc3NheU1lYXN1cmVtZW50UmVjb3JkID0gRURERGF0YS5Bc3NheU1lYXN1cmVtZW50c1ttZWFzdXJlbWVudElEXSxcbiAgICAgICAgICAgICAgICBtZWFzdXJlbWVudFR5cGU6TWV0YWJvbGl0ZVR5cGVSZWNvcmQgPSBFREREYXRhLk1ldGFib2xpdGVUeXBlc1ttZWFzdXJlbWVudC50eXBlXSxcbiAgICAgICAgICAgICAgICB1UmVjb3JkOlVuaXRUeXBlID0gRURERGF0YS5Vbml0VHlwZXNbbWVhc3VyZW1lbnQueV91bml0c10sXG4gICAgICAgICAgICAgICAgdW5pdHM6c3RyaW5nID0gdVJlY29yZCA/IHVSZWNvcmQubmFtZSA6ICcnLFxuICAgICAgICAgICAgICAgIGNhcmJvbkNvdW50Om51bWJlciA9IG1lYXN1cmVtZW50VHlwZS5jYywgLy8gIyBjYXJib25zIHBlciBtb2xlXG4gICAgICAgICAgICAgICAgZmluYWxWYWx1ZTpudW1iZXIgPSAwLFxuICAgICAgICAgICAgICAgIGlzVmFsaWQ6Ym9vbGVhbiA9IGZhbHNlLFxuICAgICAgICAgICAgICAgIGlzT3B0aWNhbERlbnNpdHk6Ym9vbGVhbiA9IHRoaXMuX2lzT3B0aWNhbERlbnNpdHlNZWFzdXJlbWVudChtZWFzdXJlbWVudFR5cGUpLFxuICAgICAgICAgICAgICAgIHZhbHVlOm51bWJlciA9IHRoaXMuX2Fzc2F5TWVhc3VyZW1lbnREYXRhQnlJRFttZWFzdXJlbWVudElEXVt0aW1lU3RhbXBdO1xuXG4gICAgICAgICAgICAvLyBGaXJzdCwgaXMgdGhpcyBtZWFzdXJlbWVudCBzb21ldGhpbmcgdGhhdCB3ZSBjYXJlIGFib3V0P1xuICAgICAgICAgICAgLy9cbiAgICAgICAgICAgIC8vIFdlJ2xsIHRocm93IG91dCBhbnl0aGluZyB0aGF0IGhhcyBtdWx0aXBsZSBudW1iZXJzIHBlciBzYW1wbGUuIFJpZ2h0IG5vdywgd2UncmVcbiAgICAgICAgICAgIC8vIG9ubHkgaGFuZGxpbmcgb25lLWRpbWVuc2lvbmFsIG51bWVyaWMgc2FtcGxlcy5cbiAgICAgICAgICAgIC8vXG4gICAgICAgICAgICAvLyBXZSdsbCBhbHNvIHRocm93IG91dCBhbnl0aGluZyB3aXRob3V0IGEgY2FyYm9uIGNvdW50LCBsaWtlIENPMi9PMiByYXRpb3MuXG4gICAgICAgICAgICBpZiAoaXNPcHRpY2FsRGVuc2l0eSkge1xuICAgICAgICAgICAgICAgIC8vIE9EIHdpbGwgYmUgdXNlZCBkaXJlY3RseSBpbiBfY2FsY3VsYXRlQ2FyYm9uRGVsdGFzIHRvIGdldCBhIGdyb3d0aCByYXRlLlxuICAgICAgICAgICAgICAgIGZpbmFsVmFsdWUgPSB2YWx1ZTtcbiAgICAgICAgICAgICAgICBpc1ZhbGlkID0gdHJ1ZTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAodW5pdHMgPT09ICdtb2wvTC9ocicpIHtcbiAgICAgICAgICAgICAgICB2YXIgaW50ZWdyYWxzOkludGVncmFsID0gaW50ZWdyYWxzQnlNZWFzdXJlbWVudElEW21lYXN1cmVtZW50SURdO1xuICAgICAgICAgICAgICAgIGlmIChpbnRlZ3JhbHMpIHtcbiAgICAgICAgICAgICAgICAgICAgZmluYWxWYWx1ZSA9IGludGVncmFsc1t0aW1lU3RhbXBdICogMTAwMDtcbiAgICAgICAgICAgICAgICAgICAgaXNWYWxpZCA9ICh0eXBlb2YgZmluYWxWYWx1ZSAhPT0gJ3VuZGVmaW5lZCcpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSBpZiAodW5pdHMgPT09ICcnIHx8IHVuaXRzID09PSAnbi9hJyB8fCAhY2FyYm9uQ291bnQpIHtcbiAgICAgICAgICAgICAgICAvLyBpc1ZhbGlkIHdpbGwgc3RheSBmYWxzZS5cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgLy8gQ2hlY2sgZm9yIHZhcmlvdXMgY29udmVyc2lvbnMgdGhhdCB3ZSBtaWdodCBuZWVkIHRvIGRvLlxuICAgICAgICAgICAgICAgIGlmIChkT3V0KSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX3dyaXRlRGVidWdMaW5lKHRydWUsIHRpbWVTdGFtcCArIFwiaFwiKTtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fZGVidWdPdXRwdXRJbmRlbnQrKztcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fd3JpdGVEZWJ1Z0xpbmVXaXRoSGVhZGVyKHRydWUsIFwicmF3IHZhbHVlXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9udW1TdHIodmFsdWUpICsgXCIgXCIgKyB1bml0cyk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmICh2YWx1ZSA9PT0gMCkge1xuICAgICAgICAgICAgICAgICAgICAvLyBEb24ndCBib3RoZXIgd2l0aCBhbGwgdGhpcyB3b3JrIChhbmQgZGVidWcgb3V0cHV0KSBpZiB0aGUgdmFsdWUgaXMgMC5cbiAgICAgICAgICAgICAgICAgICAgZmluYWxWYWx1ZSA9IHZhbHVlO1xuICAgICAgICAgICAgICAgICAgICBpc1ZhbGlkID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHR5cGVvZiB2YWx1ZSAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gQ29udmVydCB1TSB0byBtb2wvTC4gTm90ZTogZXZlbiB0aG91Z2ggaXQncyBub3Qgd3JpdHRlbiBhcyB1TS9MLCB0aGVzZVxuICAgICAgICAgICAgICAgICAgICAvLyBxdWFudGl0aWVzIHNob3VsZCBiZSB0cmVhdGVkIGFzIHBlci1saXRlci5cbiAgICAgICAgICAgICAgICAgICAgaWYgKHVuaXRzID09PSAndU0nKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB2YWx1ZSA9IHZhbHVlIC8gMTAwMDtcbiAgICAgICAgICAgICAgICAgICAgICAgIHVuaXRzID0gJ21Nb2wvTCc7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl93cml0ZURlYnVnTGluZVdpdGhIZWFkZXIoZE91dCwgXCJjb252ZXJ0XCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgXCIgLyAxMDAwID0gXCIgKyB0aGlzLl9udW1TdHIodmFsdWUpICsgXCIgbW9sL0xcIik7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgLy8gRG8gbW9sYXIgbWFzcyBjb252ZXJzaW9ucy5cbiAgICAgICAgICAgICAgICAgICAgaWYgKHVuaXRzID09PSAnZy9MJykge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCFtZWFzdXJlbWVudFR5cGUubW0pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBXZSBzaG91bGQgbmV2ZXIgZ2V0IGluIGhlcmUuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fd3JpdGVEZWJ1Z0xpbmUoZE91dCwgXCJUcnlpbmcgdG8gY2FsY3VsYXRlIGNhcmJvbiBmb3IgYSBnL0wgXCIgK1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcIm1ldGFib2xpdGUgd2l0aCBhbiB1bnNwZWNpZmllZCBtb2xhciBtYXNzISBcIiArXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiKFRoZSBjb2RlIHNob3VsZCBuZXZlciBnZXQgaGVyZSkuXCIpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyAoZy9MKSAqIChtb2wvZykgPSAobW9sL0wpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFsdWUgPSB2YWx1ZSAqIDEwMDAgLyBtZWFzdXJlbWVudFR5cGUubW07XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fd3JpdGVEZWJ1Z0xpbmVXaXRoSGVhZGVyKGRPdXQsIFwiZGl2aWRlIGJ5IG1vbGFyIG1hc3NcIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgWyBcIiAqIDEwMDAgL1wiLCBtZWFzdXJlbWVudFR5cGUubW0sIFwiZy9tb2wgPVwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9udW1TdHIodmFsdWUpLCBcIm1Nb2wvTFwiIF0uam9pbignICcpKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB1bml0cyA9ICdtTW9sL0wnO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIC8vIENvbnZlcnQgbU1vbC9MIHRvIENtTW9sL0wuXG4gICAgICAgICAgICAgICAgICAgIC8vICoqIE5PVEU6IFRoaXMgaXMgXCJDLW1vbGVzXCIsIHdoaWNoIGlzIENBUkJPTiBtb2wvTFxuICAgICAgICAgICAgICAgICAgICAvLyAoYXMgb3Bwb3NlZCB0byBDRU5USSBtb2wvTCkuXG4gICAgICAgICAgICAgICAgICAgIGlmICh1bml0cyA9PT0gJ21Nb2wvTCcpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhbHVlICo9IGNhcmJvbkNvdW50O1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fd3JpdGVEZWJ1Z0xpbmVXaXRoSGVhZGVyKGRPdXQsIFwibXVsdGlwbHkgYnkgY2FyYm9uIGNvdW50XCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgXCIgKiBcIiArIGNhcmJvbkNvdW50ICsgXCIgPSBcIiArIHRoaXMuX251bVN0cih2YWx1ZSkgKyBcIiBDbU1vbC9MXCIpO1xuICAgICAgICAgICAgICAgICAgICAgICAgdW5pdHMgPSAnQ21Nb2wvTCc7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgLy8gQXJlIHdlIGluIG91ciBkZXNpcmVkIG91dHB1dCBmb3JtYXQgKENtb2wvTCk/XG4gICAgICAgICAgICAgICAgICAgIGlmICh1bml0cyA9PT0gJ0NtTW9sL0wnKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgZmluYWxWYWx1ZSA9IHZhbHVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgIGlzVmFsaWQgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmIChkT3V0KSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX2RlYnVnT3V0cHV0SW5kZW50LS07XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX3dyaXRlRGVidWdMaW5lKHRydWUsIFwiXCIpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIC8vIFJldHVybiBhIHJlc3VsdC5cbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgaXNWYWxpZDogaXNWYWxpZCxcbiAgICAgICAgICAgICAgICB2YWx1ZTogZmluYWxWYWx1ZVxuICAgICAgICAgICAgfTtcbiAgICAgICAgfVxuXG5cbiAgICAgICAgcHJpdmF0ZSBfaXNPcHRpY2FsRGVuc2l0eU1lYXN1cmVtZW50KG1lYXN1cmVtZW50VHlwZTpNZWFzdXJlbWVudFR5cGVSZWNvcmQpOmJvb2xlYW4ge1xuICAgICAgICAgICAgcmV0dXJuIG1lYXN1cmVtZW50VHlwZS5uYW1lID09PSAnT3B0aWNhbCBEZW5zaXR5JztcbiAgICAgICAgfVxuXG5cbiAgICAgICAgLy8gUmV0dXJucyBhIGhhc2ggb2YgYXNzYXlNZWFzdXJlbWVudElELT57dGltZS0+aW50ZWdyYWx9IGZvciBhbnkgbW9sL0wvaHIgbWVhc3VyZW1lbnRzLlxuICAgICAgICBwcml2YXRlIF9pbnRlZ3JhdGVBc3NheU1lYXN1cmVtZW50cyhiaW9tYXNzQ2FsY3VsYXRpb246bnVtYmVyKTpJbnRlZ3JhbExvb2t1cCB7XG4gICAgICAgICAgICB2YXIgaW50ZWdyYWxzQnlNZWFzdXJlbWVudElEOkludGVncmFsTG9va3VwID0ge307XG5cbiAgICAgICAgICAgICQuZWFjaChFREREYXRhLkFzc2F5TWVhc3VyZW1lbnRzLFxuICAgICAgICAgICAgICAgICAgICAobWVhc3VyZUlkOm51bWJlciwgbWVhc3VyZTpBc3NheU1lYXN1cmVtZW50UmVjb3JkKTp2b2lkID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgbXR5cGU6TWV0YWJvbGl0ZVR5cGVSZWNvcmQgPSBFREREYXRhLk1ldGFib2xpdGVUeXBlc1ttZWFzdXJlLnR5cGVdLFxuICAgICAgICAgICAgICAgICAgICBjYXJib25Db3VudDpudW1iZXIsXG4gICAgICAgICAgICAgICAgICAgIHVSZWNvcmQ6VW5pdFR5cGUsXG4gICAgICAgICAgICAgICAgICAgIHVuaXRzOnN0cmluZyxcbiAgICAgICAgICAgICAgICAgICAgaW50ZWdyYWw6SW50ZWdyYWwgPSB7fSxcbiAgICAgICAgICAgICAgICAgICAgZGF0YTpJbnRlZ3JhbCxcbiAgICAgICAgICAgICAgICAgICAgcHJldlRpbWU6bnVtYmVyLFxuICAgICAgICAgICAgICAgICAgICB0b3RhbDpudW1iZXI7XG4gICAgICAgICAgICAgICAgaWYgKCFtdHlwZSkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNhcmJvbkNvdW50ID0gbXR5cGUuY2M7XG4gICAgICAgICAgICAgICAgdVJlY29yZCA9IEVERERhdGEuVW5pdFR5cGVzW21lYXN1cmUueV91bml0c107XG4gICAgICAgICAgICAgICAgdW5pdHMgPSB1UmVjb3JkID8gdVJlY29yZC5uYW1lIDogJyc7XG4gICAgICAgICAgICAgICAgLy8gU2VlICdPcHRpY2FsIERlbnNpdHkgTm90ZScgYmVsb3cuXG4gICAgICAgICAgICAgICAgaWYgKHVuaXRzICE9PSAnbW9sL0wvaHInIHx8ICFjYXJib25Db3VudCkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGludGVncmFsc0J5TWVhc3VyZW1lbnRJRFttZWFzdXJlSWRdID0gaW50ZWdyYWw7XG4gICAgICAgICAgICAgICAgLy8gc3VtIG92ZXIgYWxsIGRhdGFcbiAgICAgICAgICAgICAgICBkYXRhID0gdGhpcy5fYXNzYXlNZWFzdXJlbWVudERhdGFCeUlEW21lYXN1cmVJZF07XG4gICAgICAgICAgICAgICAgdG90YWwgPSAwO1xuICAgICAgICAgICAgICAgIHRoaXMuX2dldE1lYXN1cmVtZW50VGltZXN0YW1wc1NvcnRlZChtZWFzdXJlSWQpLmZvckVhY2goKHRpbWU6bnVtYmVyKTp2b2lkID0+IHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIHZhbHVlOm51bWJlciA9IGRhdGFbdGltZV0sIGR0Om51bWJlcjtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFwcmV2VGltZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgcHJldlRpbWUgPSB0aW1lO1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGR0ID0gdGltZSAtIHByZXZUaW1lO1xuICAgICAgICAgICAgICAgICAgICAvLyBUT0RPIHNob3VsZCB2YWx1ZSBiZWxvdyBiZSBkdiA9IGRhdGFbdGltZV0gLSBkYXRhW3ByZXZUaW1lXSA/P1xuICAgICAgICAgICAgICAgICAgICB0b3RhbCArPSBkdCAqIHZhbHVlICogY2FyYm9uQ291bnQ7XG4gICAgICAgICAgICAgICAgICAgIGludGVncmFsW3RpbWVdID0gdG90YWw7XG4gICAgICAgICAgICAgICAgICAgIHByZXZUaW1lID0gdGltZTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgcmV0dXJuIGludGVncmFsc0J5TWVhc3VyZW1lbnRJRDtcbiAgICAgICAgfVxuXG5cbiAgICAgICAgLy8gUmV0dXJucyBhbiBhcnJheSBvZiB0aW1lc3RhbXBzIGZvciB0aGlzIGFzc2F5IHNvcnRlZCBieSB0aW1lLlxuICAgICAgICBwcml2YXRlIF9nZXRNZWFzdXJlbWVudFRpbWVzdGFtcHNTb3J0ZWQobWVhc3VyZW1lbnRJRDpudW1iZXIpOm51bWJlcltdIHtcbiAgICAgICAgICAgIHZhciBkYXRhOkludGVncmFsID0gdGhpcy5fYXNzYXlNZWFzdXJlbWVudERhdGFCeUlEW21lYXN1cmVtZW50SURdO1xuICAgICAgICAgICAgaWYgKCFkYXRhKSB7XG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coJ1dhcm5pbmc6IE5vIHNvcnRlZCB0aW1lc3RhbXAgYXJyYXkgZm9yIG1lYXN1cmVtZW50ICcgKyBtZWFzdXJlbWVudElEKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gW107XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyBqUXVlcnkgbWFwIGdpdmVzIG9iamVjdCBpbmRleGVzIGFzIHN0cmluZywgc28gbmVlZCB0byBwYXJzZUZsb2F0IGJlZm9yZSBzb3J0aW5nXG4gICAgICAgICAgICByZXR1cm4gJC5tYXAoZGF0YSwgKHZhbHVlOm51bWJlciwgdGltZTpzdHJpbmcpOm51bWJlciA9PiBwYXJzZUZsb2F0KHRpbWUpKS5zb3J0KCk7XG4gICAgICAgIH1cblxuXG4gICAgICAgIC8vIEdvIHRocm91Z2ggYWxsIG1lYXN1cmVtZW50cyBpbiB0aGlzIG1ldGFib2xpdGUsIGZpZ3VyZSBvdXQgdGhlIGNhcmJvbiBjb3VudCwgYW5kIFxuICAgICAgICAvLyByZXR1cm4gYSBzb3J0ZWQgbGlzdCBvZiB7dGltZVN0YW1wLCB2YWx1ZX0gb2JqZWN0cy4gdmFsdWVzIGFyZSBpbiBDbW9sL0wuXG4gICAgICAgIHByaXZhdGUgX2J1aWxkU29ydGVkTWVhc3VyZW1lbnRzRm9yQXNzYXlNZXRhYm9saXRlKGxpbmU6TGluZURhdGEsXG4gICAgICAgICAgICAgICAgbWVhc3VyZW1lbnRJRDpudW1iZXIsXG4gICAgICAgICAgICAgICAgaW50ZWdyYWxzQnlNZWFzdXJlbWVudElEOkludGVncmFsTG9va3VwLFxuICAgICAgICAgICAgICAgIGJpb21hc3NDYWxjdWxhdGlvbjpudW1iZXIpOlRpbWVTYW1wbGVbXSB7XG4gICAgICAgICAgICB2YXIgbWVhc3VyZW1lbnQ6QXNzYXlNZWFzdXJlbWVudFJlY29yZCA9IEVERERhdGEuQXNzYXlNZWFzdXJlbWVudHNbbWVhc3VyZW1lbnRJRF0sXG4gICAgICAgICAgICAgICAgc29ydGVkTWVhc3VyZW1lbnRzOlRpbWVTYW1wbGVbXSA9IFtdO1xuXG4gICAgICAgICAgICB0aGlzLl9nZXRNZWFzdXJlbWVudFRpbWVzdGFtcHNTb3J0ZWQobWVhc3VyZW1lbnRJRCkuZm9yRWFjaChcbiAgICAgICAgICAgICAgICAgICAgKHRpbWU6bnVtYmVyLCBpOm51bWJlciwgYTpudW1iZXJbXSk6dm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIHdyaXRlRGVidWdPdXRwdXQ6Ym9vbGVhbiA9IGZhbHNlLFxuICAgICAgICAgICAgICAgICAgICByZXN1bHQ6VmFsaWRhdGVkVmFsdWUsXG4gICAgICAgICAgICAgICAgICAgIHNhbXBsZTpUaW1lU2FtcGxlO1xuICAgICAgICAgICAgICAgIGlmICh0aGlzLl9kZWJ1Z1RpbWVTdGFtcCAmJiBsaW5lLmdldExpbmVJRCgpID09PSB0aGlzLl9kZWJ1Z0xpbmVJRCkge1xuICAgICAgICAgICAgICAgICAgICAvLyBkZWJ1ZyBpZiBjdXJyZW50IE9SIG5leHQgdGltZSBpcyB0aGUgZGVidWcgdGltZVxuICAgICAgICAgICAgICAgICAgICBpZiAodGltZSA9PT0gdGhpcy5fZGVidWdUaW1lU3RhbXAgfHxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAoaSArIDEgPCBhLmxlbmd0aCAmJiBhW2kgKyAxXSA9PT0gdGhpcy5fZGVidWdUaW1lU3RhbXApKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB3cml0ZURlYnVnT3V0cHV0ID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXN1bHQgPSB0aGlzLl9jYWxjdWxhdGVDbU1vbFBlckxpdGVyKG1lYXN1cmVtZW50SUQsIHRpbWUsXG4gICAgICAgICAgICAgICAgICAgIGludGVncmFsc0J5TWVhc3VyZW1lbnRJRCwgYmlvbWFzc0NhbGN1bGF0aW9uLCB3cml0ZURlYnVnT3V0cHV0KTtcbiAgICAgICAgICAgICAgICBpZiAoIXJlc3VsdC5pc1ZhbGlkKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgc2FtcGxlID0gbmV3IFRpbWVTYW1wbGUoKTtcbiAgICAgICAgICAgICAgICBzYW1wbGUudGltZVN0YW1wID0gdGltZTtcbiAgICAgICAgICAgICAgICBzYW1wbGUuY2FyYm9uVmFsdWUgPSByZXN1bHQudmFsdWU7XG4gICAgICAgICAgICAgICAgc29ydGVkTWVhc3VyZW1lbnRzLnB1c2goc2FtcGxlKTtcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5fY2FsY3VsYXRlQ2FyYm9uRGVsdGFzKHNvcnRlZE1lYXN1cmVtZW50cywgbGluZSwgbWVhc3VyZW1lbnQsXG4gICAgICAgICAgICAgICAgYmlvbWFzc0NhbGN1bGF0aW9uKTtcbiAgICAgICAgfVxuXG5cbiAgICAgICAgLy8gR28gdGhyb3VnaCB0aGUgVGltZVNhbXBsZXMgYW5kIGNhbGN1bGF0ZSB0aGVpciBjYXJib25EZWx0YSB2YWx1ZS5cbiAgICAgICAgcHJpdmF0ZSBfY2FsY3VsYXRlQ2FyYm9uRGVsdGFzKHNvcnRlZE1lYXN1cmVtZW50czpUaW1lU2FtcGxlW10sXG4gICAgICAgICAgICAgICAgbGluZTpMaW5lRGF0YSxcbiAgICAgICAgICAgICAgICBtZWFzdXJlbWVudDpBc3NheU1lYXN1cmVtZW50UmVjb3JkLFxuICAgICAgICAgICAgICAgIGJpb21hc3NDYWxjdWxhdGlvbjpudW1iZXIpOlRpbWVTYW1wbGVbXSB7XG4gICAgICAgICAgICB2YXIgbXR5cGU6TWV0YWJvbGl0ZVR5cGVSZWNvcmQgPSBFREREYXRhLk1ldGFib2xpdGVUeXBlc1ttZWFzdXJlbWVudC50eXBlXSxcbiAgICAgICAgICAgICAgICBpc09wdGljYWxEZW5zaXR5OmJvb2xlYW4gPSB0aGlzLl9pc09wdGljYWxEZW5zaXR5TWVhc3VyZW1lbnQobXR5cGUpLFxuICAgICAgICAgICAgICAgIGFzc2F5OkFzc2F5UmVjb3JkID0gRURERGF0YS5Bc3NheXNbbWVhc3VyZW1lbnQuYXNzYXldLFxuICAgICAgICAgICAgICAgIGxpbmVSZWM6TGluZVJlY29yZCA9IEVERERhdGEuTGluZXNbYXNzYXkubGlkXSxcbiAgICAgICAgICAgICAgICBwcm90b2NvbDphbnkgPSBFREREYXRhLlByb3RvY29sc1thc3NheS5waWRdLFxuICAgICAgICAgICAgICAgIG5hbWU6c3RyaW5nID0gW2xpbmVSZWMubmFtZSwgcHJvdG9jb2wubmFtZSwgYXNzYXkubmFtZV0uam9pbignLScpO1xuXG4gICAgICAgICAgICAvLyBsb29wIGZyb20gc2Vjb25kIGVsZW1lbnQsIGFuZCB1c2UgdGhlIGluZGV4IG9mIHNob3J0ZXIgYXJyYXkgdG8gZ2V0IHByZXZpb3VzXG4gICAgICAgICAgICBzb3J0ZWRNZWFzdXJlbWVudHMuc2xpY2UoMSkuZm9yRWFjaCgoc2FtcGxlOlRpbWVTYW1wbGUsIGk6bnVtYmVyKTp2b2lkID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgcHJldjpUaW1lU2FtcGxlID0gc29ydGVkTWVhc3VyZW1lbnRzW2ldLFxuICAgICAgICAgICAgICAgICAgICBkZWx0YVRpbWU6bnVtYmVyID0gdGhpcy5fY2FsY1RpbWVEZWx0YShwcmV2LnRpbWVTdGFtcCwgc2FtcGxlLnRpbWVTdGFtcCksXG4gICAgICAgICAgICAgICAgICAgIHdyaXRlRGVidWdJbmZvOmJvb2xlYW4sIGdyb3d0aFJhdGU6bnVtYmVyLCBkZWx0YUNhcmJvbjpudW1iZXIsXG4gICAgICAgICAgICAgICAgICAgIG9kRmFjdG9yOm51bWJlciwgY21Nb2xQZXJMUGVySDpudW1iZXIsIGNtTW9sUGVyR2R3UGVySDpudW1iZXI7XG5cbiAgICAgICAgICAgICAgICB3cml0ZURlYnVnSW5mbyA9ICh0aGlzLl9kZWJ1Z1RpbWVTdGFtcFxuICAgICAgICAgICAgICAgICAgICAmJiBsaW5lLmdldExpbmVJRCgpID09PSB0aGlzLl9kZWJ1Z0xpbmVJRFxuICAgICAgICAgICAgICAgICAgICAmJiBzYW1wbGUudGltZVN0YW1wID09PSB0aGlzLl9kZWJ1Z1RpbWVTdGFtcCk7XG4gICAgICAgICAgICAgICAgaWYgKGlzT3B0aWNhbERlbnNpdHkpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gSWYgdGhpcyBpcyB0aGUgT0QgbWVhc3VyZW1lbnQsIHRoZW4gd2UnbGwgdXNlIHRoZSBiaW9tYXNzIGZhY3RvclxuICAgICAgICAgICAgICAgICAgICBncm93dGhSYXRlID0gKE1hdGgubG9nKHNhbXBsZS5jYXJib25WYWx1ZSAvIHByZXYuY2FyYm9uVmFsdWUpIC8gZGVsdGFUaW1lKTtcbiAgICAgICAgICAgICAgICAgICAgc2FtcGxlLmNhcmJvbkRlbHRhID0gYmlvbWFzc0NhbGN1bGF0aW9uICogZ3Jvd3RoUmF0ZTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHdyaXRlRGVidWdJbmZvKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl93cml0ZURlYnVnTGluZSh0cnVlLCBcIkJpb21hc3MgQ2FsY3VsYXRpb24gZm9yIFwiICsgbmFtZSk7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9kZWJ1Z091dHB1dEluZGVudCsrO1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fd3JpdGVEZWJ1Z0xpbmVXaXRoSGVhZGVyKHRydWUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJyYXcgT0QgYXQgXCIgKyBwcmV2LnRpbWVTdGFtcCArIFwiaFwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX251bVN0cihwcmV2LmNhcmJvblZhbHVlKSk7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl93cml0ZURlYnVnTGluZVdpdGhIZWFkZXIodHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBcInJhdyBPRCBhdCBcIiArIHNhbXBsZS50aW1lU3RhbXAgKyBcImhcIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9udW1TdHIoc2FtcGxlLmNhcmJvblZhbHVlKSk7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl93cml0ZURlYnVnTGluZVdpdGhIZWFkZXIodHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBcImdyb3d0aCByYXRlXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJsb2coXCIgK1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9udW1TdHIoc2FtcGxlLmNhcmJvblZhbHVlKSArIFwiIC8gXCIgK1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9udW1TdHIocHJldi5jYXJib25WYWx1ZSkgK1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiKSAvIFwiICsgdGhpcy5fbnVtU3RyKGRlbHRhVGltZSkgKyBcImggPSBcIiArXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fbnVtU3RyKGdyb3d0aFJhdGUpKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX3dyaXRlRGVidWdMaW5lV2l0aEhlYWRlcih0cnVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiYmlvbWFzcyBmYWN0b3JcIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBcIiAqIFwiICsgdGhpcy5fbnVtU3RyKGJpb21hc3NDYWxjdWxhdGlvbikgKyBcIiA9IFwiICtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9udW1TdHIoc2FtcGxlLmNhcmJvbkRlbHRhKSArIFwiIENtTW9sL2dkdy9oclwiKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX3dyaXRlRGVidWdMaW5lKHRydWUsIFwiXCIpO1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fZGVidWdPdXRwdXRJbmRlbnQtLTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIEdhdGhlciB0ZXJtcy5cbiAgICAgICAgICAgICAgICAgICAgZGVsdGFDYXJib24gPSAoc2FtcGxlLmNhcmJvblZhbHVlIC0gcHJldi5jYXJib25WYWx1ZSk7XG4gICAgICAgICAgICAgICAgICAgIG9kRmFjdG9yID0gdGhpcy5fY2FsY3VsYXRlT3B0aWNhbERlbnNpdHlGYWN0b3IobGluZSwgcHJldi50aW1lU3RhbXAsXG4gICAgICAgICAgICAgICAgICAgICAgICB3cml0ZURlYnVnSW5mbyk7XG4gICAgICAgICAgICAgICAgICAgIC8vIENtTW9sL0wgLT4gQ21Nb2wvTC9oclxuICAgICAgICAgICAgICAgICAgICBjbU1vbFBlckxQZXJIID0gKGRlbHRhQ2FyYm9uIC8gZGVsdGFUaW1lKTtcbiAgICAgICAgICAgICAgICAgICAgLy8gQ21Nb2wvTC9ociAqIEwvZ2R3IC0+IENtTW9sL2dkdy9oclxuICAgICAgICAgICAgICAgICAgICBjbU1vbFBlckdkd1BlckggPSBjbU1vbFBlckxQZXJIIC8gb2RGYWN0b3I7XG4gICAgICAgICAgICAgICAgICAgIHNhbXBsZS5jYXJib25EZWx0YSA9IGNtTW9sUGVyR2R3UGVySDtcbiAgICAgICAgICAgICAgICAgICAgLy8gV3JpdGUgc29tZSBkZWJ1ZyBvdXRwdXQgZm9yIHdoYXQgd2UganVzdCBkaWQuXG4gICAgICAgICAgICAgICAgICAgIGlmICh3cml0ZURlYnVnSW5mbykge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fd3JpdGVEZWJ1Z0xpbmUodHJ1ZSwgXCJDb252ZXJ0IHRvIENtTW9sL2dkdy9oclwiKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX2RlYnVnT3V0cHV0SW5kZW50Kys7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl93cml0ZURlYnVnTGluZVdpdGhIZWFkZXIodHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBcImRlbHRhIGZyb20gXCIgKyBwcmV2LnRpbWVTdGFtcCArIFwiaCB0byBcIiArIHNhbXBsZS50aW1lU3RhbXAgKyBcImhcIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9udW1TdHIoc2FtcGxlLmNhcmJvblZhbHVlKSArIFwiIENtTW9sL0wgLSBcIiArXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fbnVtU3RyKHByZXYuY2FyYm9uVmFsdWUpICsgXCIgQ21Nb2wvTCA9IFwiICtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9udW1TdHIoZGVsdGFDYXJib24pICsgXCIgQ21Nb2wvTFwiKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX3dyaXRlRGVidWdMaW5lV2l0aEhlYWRlcih0cnVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiZGVsdGEgdGltZVwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiIC8gXCIgKyB0aGlzLl9udW1TdHIoZGVsdGFUaW1lKSArIFwiaCA9IFwiICtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9udW1TdHIoY21Nb2xQZXJMUGVySCkgKyBcIiBDbU1vbC9ML2hcIik7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl93cml0ZURlYnVnTGluZVdpdGhIZWFkZXIodHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBcImFwcGx5IE9EXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgXCIgLyBcIiArIHRoaXMuX251bVN0cihvZEZhY3RvcikgKyBcIiBML2dkdyA9IFwiICtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9udW1TdHIoY21Nb2xQZXJHZHdQZXJIKSArIFwiIENtTW9sL2dkdy9oXCIpO1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fZGVidWdPdXRwdXRJbmRlbnQtLTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICByZXR1cm4gc29ydGVkTWVhc3VyZW1lbnRzO1xuICAgICAgICB9XG5cblxuICAgICAgICAvLyBDYWxjdWxhdGUgdGhlIGRpZmZlcmVuY2UgYmV0d2VlbiB0d28gdGltZXN0YW1wcy5cbiAgICAgICAgcHJpdmF0ZSBfY2FsY1RpbWVEZWx0YShmcm9tVGltZVN0YW1wOm51bWJlciwgdG9UaW1lU3RhbXA6bnVtYmVyKTpudW1iZXIge1xuICAgICAgICAgICAgcmV0dXJuICh0b1RpbWVTdGFtcCkgLSAoZnJvbVRpbWVTdGFtcCk7XG4gICAgICAgIH1cblxuXG4gICAgICAgIC8vIEZpbmQgd2hlcmUgdGltZVN0YW1wIGZpdHMgaW4gdGhlIHRpbWVsaW5lIGFuZCBpbnRlcnBvbGF0ZS5cbiAgICAgICAgLy8gUmV0dXJucyB0aGUgaW5kZXggb2YgdGhlIHRpbWVsaW5lIGFuZCB0aGUgaW50ZXJwb2xhdGlvbiBhbW91bnQuXG4gICAgICAgIHByaXZhdGUgX2ZpdE9uU29ydGVkVGltZWxpbmUodGltZVN0YW1wOm51bWJlciwgdGltZWxpbmU6bnVtYmVyW10pOmFueSB7XG4gICAgICAgICAgICAvLyBpZiB0aW1lU3RhbXAgaXMgYWZ0ZXIgbGFzdCBlbnRyeSBpbiB0aW1lbGluZSwgcmV0dXJuIGxhc3QgZW50cnlcbiAgICAgICAgICAgIHZhciBpbnRlcjphbnkgPSB7XG4gICAgICAgICAgICAgICAgXCJpbmRleFwiOiB0aW1lbGluZS5sZW5ndGggLSAyLFxuICAgICAgICAgICAgICAgIFwidFwiOiAxXG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgdGltZWxpbmUuc29tZSgodGltZTpudW1iZXIsIGk6bnVtYmVyKTpib29sZWFuID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgcHJldjpudW1iZXI7XG4gICAgICAgICAgICAgICAgaWYgKHRpbWVTdGFtcCA8PSB0aW1lKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpbnRlci5pbmRleCA9IGkgLSAxO1xuICAgICAgICAgICAgICAgICAgICAgICAgcHJldiA9IHRpbWVsaW5lW2ludGVyLmluZGV4XTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGludGVyLnQgPSAodGltZVN0YW1wIC0gcHJldikgLyAodGltZSAtIHByZXYpO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgaW50ZXIuaW5kZXggPSAwO1xuICAgICAgICAgICAgICAgICAgICAgICAgaW50ZXIudCA9IDA7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgcmV0dXJuIGludGVyO1xuICAgICAgICB9XG5cblxuICAgICAgICAvLyBHaXZlbiBhIGxpbmUgYW5kIGEgdGltZXN0YW1wLCB0aGlzIGZ1bmN0aW9uIGxpbmVhcmx5IGludGVycG9sYXRlcyBhcyBuZWNlc3NhcnkgdG8gY29tZVxuICAgICAgICAvLyB1cCB3aXRoIGFuIE9EIHZhbHVlLCB0aGVuIGl0IG11bHRpcGxpZXMgYnkgYSBtYWdpYyBudW1iZXIgdG8gYXJyaXZlIGF0IGEgZ2R3L0wgZmFjdG9yXG4gICAgICAgIC8vIHRoYXQgY2FuIGJlIGZhY3RvcmVkIGludG8gbWVhc3VyZW1lbnRzLlxuICAgICAgICBwcml2YXRlIF9jYWxjdWxhdGVPcHRpY2FsRGVuc2l0eUZhY3RvcihsaW5lOkxpbmVEYXRhLFxuICAgICAgICAgICAgICAgIHRpbWVTdGFtcDpudW1iZXIsXG4gICAgICAgICAgICAgICAgd3JpdGVEZWJ1Z0luZm86Ym9vbGVhbik6bnVtYmVyIHtcbiAgICAgICAgICAgIC8vIEdldCB0aGUgT0QgbWVhc3VyZW1lbnRzLlxuICAgICAgICAgICAgdmFyIG9kTWVhc3VyZUlEOm51bWJlciA9IHRoaXMuX2dldE9wdGljYWxEZW5zaXR5TWVhc3VyZW1lbnRGb3JMaW5lKGxpbmUuZ2V0TGluZUlEKCkpLFxuICAgICAgICAgICAgICAgIC8vIExpbmVhcmx5IGludGVycG9sYXRlIG9uIHRoZSBPRCBtZWFzdXJlbWVudCB0byBnZXQgdGhlIGRlc2lyZWQgZmFjdG9yLlxuICAgICAgICAgICAgICAgIHNvcnRlZFRpbWU6bnVtYmVyW10gPSB0aGlzLl9nZXRNZWFzdXJlbWVudFRpbWVzdGFtcHNTb3J0ZWQob2RNZWFzdXJlSUQpLFxuICAgICAgICAgICAgICAgIGludGVycEluZm86YW55ID0gdGhpcy5fZml0T25Tb3J0ZWRUaW1lbGluZSh0aW1lU3RhbXAsIHNvcnRlZFRpbWUpLFxuICAgICAgICAgICAgICAgIC8vIFRoaXMgaXMgdGhlIChsaW5lYXJseSBpbnRlcnBvbGF0ZWQpIE9ENjAwIG1lYXN1cmVtZW50LlxuICAgICAgICAgICAgICAgIGRhdGE6SW50ZWdyYWwgPSB0aGlzLl9hc3NheU1lYXN1cmVtZW50RGF0YUJ5SURbb2RNZWFzdXJlSURdLFxuICAgICAgICAgICAgICAgIHQ6bnVtYmVyID0gaW50ZXJwSW5mby50LFxuICAgICAgICAgICAgICAgIGRhdGExOm51bWJlciA9IGRhdGFbc29ydGVkVGltZVtpbnRlcnBJbmZvLmluZGV4XV0sXG4gICAgICAgICAgICAgICAgZGF0YTI6bnVtYmVyID0gZGF0YVtzb3J0ZWRUaW1lW2ludGVycEluZm8uaW5kZXggKyAxXV0sXG4gICAgICAgICAgICAgICAgb2RNZWFzdXJlbWVudDpudW1iZXIgPSBkYXRhMSArIChkYXRhMiAtIGRhdGExKSAqIHQsXG4gICAgICAgICAgICAgICAgLy8gQSBtYWdpYyBmYWN0b3IgdG8gZ2l2ZSB1cyBnZHcvTCBmb3IgYW4gT0Q2MDAgbWVhc3VyZW1lbnQuXG4gICAgICAgICAgICAgICAgLy8gVE9ETzogVGhpcyBjYW4gYmUgY3VzdG9taXplZCBpbiBhc3NheSBtZXRhZGF0YSBzbyB3ZSBzaG91bGQgYWxsb3cgZm9yIHRoYXQgaGVyZS5cbiAgICAgICAgICAgICAgICBvZE1hZ2ljRmFjdG9yOm51bWJlciA9IDAuNjUsXG4gICAgICAgICAgICAgICAgZmluYWxWYWx1ZTpudW1iZXIgPSBvZE1lYXN1cmVtZW50ICogb2RNYWdpY0ZhY3RvcixcbiAgICAgICAgICAgICAgICAvLyBkZWNsYXJpbmcgdmFyaWFibGVzIG9ubHkgYXNzaWduZWQgd2hlbiB3cml0aW5nIGRlYnVnIGxvZ3NcbiAgICAgICAgICAgICAgICBtZWFzdXJlOkFzc2F5TWVhc3VyZW1lbnRSZWNvcmQsIGFzc2F5OkFzc2F5UmVjb3JkLCBsaW5lUmVjOkxpbmVSZWNvcmQsXG4gICAgICAgICAgICAgICAgcHJvdG9jb2w6YW55LCBuYW1lOnN0cmluZztcblxuICAgICAgICAgICAgLy8gU3BpdCBvdXQgb3VyIGNhbGN1bGF0aW9ucyBpZiByZXF1ZXN0ZWQuXG4gICAgICAgICAgICBpZiAod3JpdGVEZWJ1Z0luZm8pIHtcbiAgICAgICAgICAgICAgICBtZWFzdXJlID0gRURERGF0YS5Bc3NheU1lYXN1cmVtZW50c1tvZE1lYXN1cmVJRF07XG4gICAgICAgICAgICAgICAgYXNzYXkgPSBFREREYXRhLkFzc2F5c1ttZWFzdXJlLmFzc2F5XTtcbiAgICAgICAgICAgICAgICBsaW5lUmVjID0gRURERGF0YS5MaW5lc1thc3NheS5saWRdO1xuICAgICAgICAgICAgICAgIHByb3RvY29sID0gRURERGF0YS5Qcm90b2NvbHNbYXNzYXkucGlkXTtcbiAgICAgICAgICAgICAgICBuYW1lID0gW2xpbmVSZWMubmFtZSwgcHJvdG9jb2wubmFtZSwgYXNzYXkubmFtZV0uam9pbignLScpO1xuICAgICAgICAgICAgICAgIHRoaXMuX3dyaXRlRGVidWdMaW5lKHRydWUsIFwiR2V0dGluZyBvcHRpY2FsIGRlbnNpdHkgZnJvbSBcIiArIG5hbWUpO1xuICAgICAgICAgICAgICAgIHRoaXMuX2RlYnVnT3V0cHV0SW5kZW50Kys7XG4gICAgICAgICAgICAgICAgaWYgKHQgIT09IDEpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fd3JpdGVEZWJ1Z0xpbmVXaXRoSGVhZGVyKHRydWUsXG4gICAgICAgICAgICAgICAgICAgICAgICBcInJhdyB2YWx1ZSBhdCBcIiArIHNvcnRlZFRpbWVbaW50ZXJwSW5mby5pbmRleF0gKyBcImhcIixcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX251bVN0cihkYXRhMSkpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAodCAhPT0gMCkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLl93cml0ZURlYnVnTGluZVdpdGhIZWFkZXIodHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIFwicmF3IHZhbHVlIGF0IFwiICsgc29ydGVkVGltZVtpbnRlcnBJbmZvLmluZGV4ICsgMV0gKyBcImhcIixcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX251bVN0cihkYXRhMikpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAodCAhPT0gMCAmJiB0ICE9PSAxKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX3dyaXRlRGVidWdMaW5lV2l0aEhlYWRlcih0cnVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgXCJpbnRlcnBvbGF0ZSBcIiArICh0ICogMTAwKS50b0ZpeGVkKDIpICsgXCIlXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9udW1TdHIoZGF0YTEpICsgXCIgKyAoXCIgKyB0aGlzLl9udW1TdHIoZGF0YTIpICsgXCIgLSBcIiArXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9udW1TdHIoZGF0YTEpICsgXCIpXCIgKyBcIiAqIFwiICsgdGhpcy5fbnVtU3RyKHQpICsgXCIgPSBcIiArXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9udW1TdHIob2RNZWFzdXJlbWVudCkgKyBcIiBML2dkd1wiKTtcbiAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgdGhpcy5fd3JpdGVEZWJ1Z0xpbmVXaXRoSGVhZGVyKHRydWUsXG4gICAgICAgICAgICAgICAgICAgIFwiZW1waXJpY2FsIGZhY3RvclwiLFxuICAgICAgICAgICAgICAgICAgICBcIiAqIFwiICsgdGhpcy5fbnVtU3RyKG9kTWFnaWNGYWN0b3IpICsgXCIgPSBcIiArXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX251bVN0cihmaW5hbFZhbHVlKSArIFwiIEwvZ2R3XCIpO1xuICAgICAgICAgICAgICAgIHRoaXMuX3dyaXRlRGVidWdMaW5lKHRydWUsIFwiXCIpO1xuICAgICAgICAgICAgICAgIHRoaXMuX2RlYnVnT3V0cHV0SW5kZW50LS07XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiBmaW5hbFZhbHVlO1xuICAgICAgICB9XG5cblxuICAgICAgICAvLyBSZXR1cm5zIHRoZSBhc3NheSBtZWFzdXJlbWVudCB0aGF0IHJlcHJlc2VudHMgT0QgZm9yIHRoZSBzcGVjaWZpZWQgbGluZS5cbiAgICAgICAgcHJpdmF0ZSBfZ2V0T3B0aWNhbERlbnNpdHlNZWFzdXJlbWVudEZvckxpbmUobGluZUlEOm51bWJlcik6bnVtYmVyIHtcbiAgICAgICAgICAgIHZhciBvZE1lYXN1cmVJRDpudW1iZXIgPSB0aGlzLl9vcHRpY2FsRGVuc2l0eU1lYXN1cmVtZW50SURCeUxpbmVJRFtsaW5lSURdO1xuICAgICAgICAgICAgaWYgKHR5cGVvZiBvZE1lYXN1cmVJRCAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gb2RNZWFzdXJlSUQ7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKFwiV2FybmluZyEgVW5hYmxlIHRvIGZpbmQgT0QgbWVhc3VyZW1lbnQgZm9yIFwiICtcbiAgICAgICAgICAgICAgICAgICAgRURERGF0YS5MaW5lc1tsaW5lSURdLm5hbWUpO1xuICAgICAgICAgICAgICAgIHJldHVybiAtMTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG5cbiAgICAgICAgLy8gVGhpcyBjYWxjdWxhdGVzIHRoZSBfdmFsaWRBc3NheXNCeUxpbmVJRCBhbmQgX3ZhbGlkTWVhc3VyZW1lbnRzQnlBc3NheUlEIGxpc3RzLFxuICAgICAgICAvLyB3aGljaCByZWR1Y2VzIGNsdXR0ZXIgaW4gYWxsIG91ciBsb29waW5nIGNvZGUuXG4gICAgICAgIHByaXZhdGUgX3ByZWNhbGN1bGF0ZVZhbGlkTGlzdHMoKTp2b2lkIHtcbiAgICAgICAgICAgICQuZWFjaChFREREYXRhLkxpbmVzLCAoa2V5OnN0cmluZywgbGluZTpMaW5lUmVjb3JkKTp2b2lkID0+IHtcbiAgICAgICAgICAgICAgICBpZiAobGluZS5hY3RpdmUpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fdmFsaWRBc3NheXNCeUxpbmVJRFtsaW5lLmlkXSA9IFtdO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgJC5lYWNoKEVERERhdGEuQXNzYXlzLCAoa2V5OnN0cmluZywgYXNzYXk6QXNzYXlSZWNvcmQpOnZvaWQgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBsaXN0Om51bWJlcltdID0gdGhpcy5fdmFsaWRBc3NheXNCeUxpbmVJRFthc3NheS5saWRdO1xuICAgICAgICAgICAgICAgIGlmIChhc3NheS5hY3RpdmUgJiYgbGlzdCkge1xuICAgICAgICAgICAgICAgICAgICBsaXN0LnB1c2goYXNzYXkuaWQpO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLl92YWxpZE1lYXN1cmVtZW50c0J5QXNzYXlJRFthc3NheS5pZF0gPSBbXTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICQuZWFjaChFREREYXRhLkFzc2F5TWVhc3VyZW1lbnRzLCAoa2V5OnN0cmluZyxcbiAgICAgICAgICAgICAgICAgICAgbWVhc3VyZTpBc3NheU1lYXN1cmVtZW50UmVjb3JkKTp2b2lkID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgbGlzdDpudW1iZXJbXSA9IHRoaXMuX3ZhbGlkTWVhc3VyZW1lbnRzQnlBc3NheUlEW21lYXN1cmUuYXNzYXldLFxuICAgICAgICAgICAgICAgICAgICB0eXBlOk1lYXN1cmVtZW50VHlwZVJlY29yZCA9IEVERERhdGEuTWVhc3VyZW1lbnRUeXBlc1ttZWFzdXJlLnR5cGVdLFxuICAgICAgICAgICAgICAgICAgICBhc3NheTpBc3NheVJlY29yZCA9IEVERERhdGEuQXNzYXlzW21lYXN1cmUuYXNzYXldO1xuICAgICAgICAgICAgICAgIGlmIChsaXN0KSB7XG4gICAgICAgICAgICAgICAgICAgIGxpc3QucHVzaChtZWFzdXJlLmlkKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHR5cGUgJiYgdGhpcy5faXNPcHRpY2FsRGVuc2l0eU1lYXN1cmVtZW50KHR5cGUpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9vcHRpY2FsRGVuc2l0eU1lYXN1cmVtZW50SURCeUxpbmVJRFthc3NheS5saWRdID0gbWVhc3VyZS5pZDtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZXhwb3J0IGludGVyZmFjZSBBc3NheUxvb2t1cCB7XG4gICAgICAgIFtpZDpudW1iZXJdOiBBc3NheURhdGE7XG4gICAgfVxuXG4gICAgZXhwb3J0IGludGVyZmFjZSBUaW1lbGluZUxvb2t1cCB7XG4gICAgICAgIFtpZDpudW1iZXJdOiBNZXRhYm9saXRlVGltZWxpbmU7XG4gICAgfVxuXG4gICAgLy8gQ2xhc3MgZGVmaW5pdGlvbiBmb3IgZWxlbWVudHMgaW4gU3VtbWF0aW9uLmxpbmVEYXRhQnlJRFxuICAgIGV4cG9ydCBjbGFzcyBMaW5lRGF0YSB7XG4gICAgICAgIGFzc2F5c0J5SUQ6QXNzYXlMb29rdXAgPSA8QXNzYXlMb29rdXA+e307XG4gICAgICAgIHByaXZhdGUgX2xpbmVJRDpudW1iZXI7XG5cbiAgICAgICAgY29uc3RydWN0b3IobGluZUlEOm51bWJlcikge1xuICAgICAgICAgICAgdGhpcy5fbGluZUlEID0gbGluZUlEO1xuICAgICAgICB9XG5cbiAgICAgICAgZ2V0TGluZUlEKCk6bnVtYmVyIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9saW5lSUQ7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBSZXR1cm4gYSBsaXN0IG9mIEFzc2F5RGF0YSBzdHJ1Y3R1cmVzIHRoYXQgb25seVxuICAgICAgICAvLyBjb250YWluIG1ldGFib2xpdGUgZGF0YSBmb3IgdGhlIHNwZWNpZmllZCB0aW1lIHN0YW1wLlxuICAgICAgICAvLyAoVGhpcyB3aWxsIG5vdCByZXR1cm4gYXNzYXlzIHRoYXQgZG9uJ3QgaGF2ZSBhbnkgbWV0YWJvbGl0ZSBkYXRhIGZvciB0aGlzIHRpbWUgc3RhbXAuKVxuICAgICAgICBmaWx0ZXJBc3NheXNCeVRpbWVTdGFtcCh0aW1lU3RhbXA6bnVtYmVyKTpBc3NheURhdGFbXSB7XG4gICAgICAgICAgICB2YXIgZmlsdGVyZWRBc3NheXM6QXNzYXlEYXRhW10gPSBbXTtcbiAgICAgICAgICAgIC8vIGpRdWVyeSBlYWNoIGNhbGxiYWNrIGFsd2F5cyBnaXZlcyBzdHJpbmcgYmFjayBmb3Iga2V5c1xuICAgICAgICAgICAgJC5lYWNoKHRoaXMuYXNzYXlzQnlJRCwgKGFrZXk6c3RyaW5nLCBhc3NheTpBc3NheURhdGEpOnZvaWQgPT4ge1xuICAgICAgICAgICAgICAgIHZhciB0aW1lbGluZXM6VGltZWxpbmVMb29rdXAgPSA8VGltZWxpbmVMb29rdXA+e30sXG4gICAgICAgICAgICAgICAgICAgIG51bUFkZGVkOm51bWJlciA9IDAsXG4gICAgICAgICAgICAgICAgICAgIG91dEFzc2F5OkFzc2F5RGF0YTtcbiAgICAgICAgICAgICAgICAkLmVhY2goYXNzYXkudGltZWxpbmVzQnlNZWFzdXJlbWVudElkLFxuICAgICAgICAgICAgICAgICAgICAgICAgKHRrZXk6c3RyaW5nLCB0aW1lbGluZTpNZXRhYm9saXRlVGltZWxpbmUpOnZvaWQgPT4ge1xuICAgICAgICAgICAgICAgICAgICB2YXIgc2FtcGxlOmFueSA9IHRpbWVsaW5lLmZpbmRTYW1wbGVCeVRpbWVTdGFtcCh0aW1lU3RhbXApLFxuICAgICAgICAgICAgICAgICAgICAgICAgbWVhc3VyZW1lbnQ6TWV0YWJvbGl0ZVRpbWVsaW5lO1xuICAgICAgICAgICAgICAgICAgICBpZiAoc2FtcGxlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBtZWFzdXJlbWVudCA9IG5ldyBNZXRhYm9saXRlVGltZWxpbmUoYXNzYXksIHRpbWVsaW5lLm1lYXN1cmVJZCk7XG4gICAgICAgICAgICAgICAgICAgICAgICBtZWFzdXJlbWVudC50aW1lU2FtcGxlcy5wdXNoKHNhbXBsZSk7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aW1lbGluZXNbdGltZWxpbmUubWVhc3VyZUlkXSA9IG1lYXN1cmVtZW50O1xuICAgICAgICAgICAgICAgICAgICAgICAgKytudW1BZGRlZDtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIGlmIChudW1BZGRlZCkge1xuICAgICAgICAgICAgICAgICAgICBvdXRBc3NheSA9IG5ldyBBc3NheURhdGEoYXNzYXkuYXNzYXlJZCk7XG4gICAgICAgICAgICAgICAgICAgIG91dEFzc2F5LnRpbWVsaW5lc0J5TWVhc3VyZW1lbnRJZCA9IHRpbWVsaW5lcztcbiAgICAgICAgICAgICAgICAgICAgZmlsdGVyZWRBc3NheXMucHVzaChvdXRBc3NheSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICByZXR1cm4gZmlsdGVyZWRBc3NheXM7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBTdW0gdXAgYWxsIHRoZSBpbi9vdXQgdmFsdWVzIGFjcm9zcyBhbGwgbWV0YWJvbGl0ZXMgYXQgdGhlIHNwZWNpZmllZCB0aW1lc3RhbXAuXG4gICAgICAgIGdldEluT3V0U3VtQXRUaW1lKHRpbWVTdGFtcDpudW1iZXIpOkluT3V0U3VtIHtcbiAgICAgICAgICAgIC8vIEdyYWIgYWxsIHRoZSBtZWFzdXJlbWVudHMuXG4gICAgICAgICAgICB2YXIgbWVhc3VyZW1lbnRzOkluT3V0U3VtTWVhc3VyZW1lbnRbXSA9IFtdLFxuICAgICAgICAgICAgICAgIHRvdGFsSW46bnVtYmVyID0gMCxcbiAgICAgICAgICAgICAgICB0b3RhbE91dDpudW1iZXIgPSAwO1xuICAgICAgICAgICAgJC5lYWNoKHRoaXMuYXNzYXlzQnlJRCwgKGtleTpzdHJpbmcsIGFzc2F5OkFzc2F5RGF0YSk6dm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgJC5lYWNoKGFzc2F5LnRpbWVsaW5lc0J5TWVhc3VyZW1lbnRJZCwgKGtleTpzdHJpbmcsXG4gICAgICAgICAgICAgICAgICAgICAgICB0aW1lbGluZTpNZXRhYm9saXRlVGltZWxpbmUpOnZvaWQgPT4ge1xuICAgICAgICAgICAgICAgICAgICB2YXIgaW5vdXQ6SW5PdXRTdW1NZWFzdXJlbWVudCA9IG5ldyBJbk91dFN1bU1lYXN1cmVtZW50KCk7XG4gICAgICAgICAgICAgICAgICAgIGlub3V0LnRpbWVsaW5lID0gYXNzYXkudGltZWxpbmVzQnlNZWFzdXJlbWVudElkW3RpbWVsaW5lLm1lYXN1cmVJZF07XG4gICAgICAgICAgICAgICAgICAgIGlub3V0LmNhcmJvbkRlbHRhID0gaW5vdXQudGltZWxpbmUuaW50ZXJwb2xhdGVDYXJib25EZWx0YSh0aW1lU3RhbXApO1xuICAgICAgICAgICAgICAgICAgICBpZiAoaW5vdXQuY2FyYm9uRGVsdGEgPiAwKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0b3RhbE91dCArPSBpbm91dC5jYXJib25EZWx0YTtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRvdGFsSW4gLT0gaW5vdXQuY2FyYm9uRGVsdGE7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgbWVhc3VyZW1lbnRzLnB1c2goaW5vdXQpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICByZXR1cm4gbmV3IEluT3V0U3VtKHRvdGFsSW4sIHRvdGFsT3V0LCBtZWFzdXJlbWVudHMpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gVGhpcyByZXByZXNlbnRzIGEgYmFrZWQtZG93biB2ZXJzaW9uIG9mIHRoZSBMaW5lRGF0YS9Bc3NheURhdGEsIHdoZXJlIHdlJ3ZlXG4gICAgLy8gc3VtbWVkIHVwIGNhcmJvbiBkYXRhIGZvciBhbGwgYXNzYXlzIGF0IGVhY2ggdGltZSBwb2ludC5cbiAgICBleHBvcnQgY2xhc3MgTWVyZ2VkTGluZVNhbXBsZXMge1xuICAgICAgICAvLyBPcmRlcmVkIGJ5IHRpbWUgc3RhbXAsIHRoZXNlIGFyZSB0aGUgbWVyZ2VkIHNhbXBsZXMgd2l0aCBjYXJib24gaW4vb3V0IGRhdGEuXG4gICAgICAgIG1lcmdlZExpbmVTYW1wbGVzOk1lcmdlZExpbmVTYW1wbGVbXSA9IFtdO1xuXG4gICAgICAgIC8vIFRoaXMgaXMgYSBsaXN0IG9mIGFsbCB0aW1lbGluZXMgdGhhdCB3ZXJlIHNhbXBsZWQgdG8gYnVpbGQgdGhlIHN1bXMgaW4gbWVyZ2VkTGluZVNhbXBsZXMuXG4gICAgICAgIG1ldGFib2xpdGVUaW1lbGluZXM6TWV0YWJvbGl0ZVRpbWVsaW5lW10gPSBbXTtcbiAgICB9XG5cbiAgICBleHBvcnQgY2xhc3MgTWVyZ2VkTGluZVNhbXBsZSB7XG4gICAgICAgIHRpbWVTdGFtcDpudW1iZXI7XG4gICAgICAgIHRvdGFsQ2FyYm9uSW46bnVtYmVyID0gMDtcbiAgICAgICAgdG90YWxDYXJib25PdXQ6bnVtYmVyID0gMDtcblxuICAgICAgICBjb25zdHJ1Y3Rvcih0aW1lU3RhbXA6bnVtYmVyKSB7XG4gICAgICAgICAgICB0aGlzLnRpbWVTdGFtcCA9IHRpbWVTdGFtcDtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGV4cG9ydCBjbGFzcyBJbk91dFN1bSB7XG4gICAgICAgIHRvdGFsSW46bnVtYmVyO1xuICAgICAgICB0b3RhbE91dDpudW1iZXI7XG4gICAgICAgIG1lYXN1cmVtZW50czpJbk91dFN1bU1lYXN1cmVtZW50W107XG5cbiAgICAgICAgY29uc3RydWN0b3IodG90YWxJbjpudW1iZXIsIHRvdGFsT3V0Om51bWJlciwgbWVhc3VyZW1lbnRzOkluT3V0U3VtTWVhc3VyZW1lbnRbXSkge1xuICAgICAgICAgICAgdGhpcy50b3RhbEluID0gdG90YWxJbjtcbiAgICAgICAgICAgIHRoaXMudG90YWxPdXQgPSB0b3RhbE91dDtcbiAgICAgICAgICAgIHRoaXMubWVhc3VyZW1lbnRzID0gbWVhc3VyZW1lbnRzO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZXhwb3J0IGNsYXNzIEluT3V0U3VtTWVhc3VyZW1lbnQge1xuICAgICAgICB0aW1lbGluZTpNZXRhYm9saXRlVGltZWxpbmU7XG4gICAgICAgIGNhcmJvbkRlbHRhOm51bWJlcjtcblxuICAgICAgICBhYnNEZWx0YSgpOm51bWJlciB7XG4gICAgICAgICAgICByZXR1cm4gTWF0aC5hYnModGhpcy5jYXJib25EZWx0YSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBleHBvcnQgY2xhc3MgQXNzYXlEYXRhIHtcbiAgICAgICAgdGltZWxpbmVzQnlNZWFzdXJlbWVudElkOlRpbWVsaW5lTG9va3VwID0gPFRpbWVsaW5lTG9va3VwPnt9O1xuICAgICAgICBhc3NheUlkOm51bWJlcjtcblxuICAgICAgICBjb25zdHJ1Y3Rvcihhc3NheUlEOm51bWJlcikge1xuICAgICAgICAgICAgdGhpcy5hc3NheUlkID0gYXNzYXlJRDtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFJldHVybiBhIGxpc3Qgb2YgW21lYXN1cmVtZW50SUQsIFRpbWVTYW1wbGVdIG9iamVjdHMsIG9uZSBmb3IgZWFjaFxuICAgICAgICAvLyBtZWFzdXJlbWVudCB0aGF0IGhhcyBhIHNhbXBsZSBhdCB0aGUgc3BlY2lmaWVkIHRpbWUgc3RhbXAuXG4gICAgICAgIGdldFRpbWVTYW1wbGVzQnlUaW1lU3RhbXAodGltZVN0YW1wOm51bWJlcikgOiBhbnlbXSB7XG4gICAgICAgICAgICByZXR1cm4gJC5tYXAodGhpcy50aW1lbGluZXNCeU1lYXN1cmVtZW50SWQsICh0aW1lbGluZTpNZXRhYm9saXRlVGltZWxpbmUpOmFueSA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIHNhbXBsZTpUaW1lU2FtcGxlID0gdGltZWxpbmUuZmluZFNhbXBsZUJ5VGltZVN0YW1wKHRpbWVTdGFtcCk7XG4gICAgICAgICAgICAgICAgaWYgKHNhbXBsZSkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgXCJtZWFzdXJlbWVudElEXCI6IHRpbWVsaW5lLm1lYXN1cmVJZCxcbiAgICAgICAgICAgICAgICAgICAgICAgIFwidGltZVNhbXBsZVwiOiBzYW1wbGVcbiAgICAgICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGV4cG9ydCBjbGFzcyBNZXRhYm9saXRlVGltZWxpbmUge1xuICAgICAgICBhc3NheTpBc3NheURhdGE7XG4gICAgICAgIHRpbWVTYW1wbGVzOlRpbWVTYW1wbGVbXSA9IFtdO1xuICAgICAgICBtZWFzdXJlSWQ6bnVtYmVyO1xuXG4gICAgICAgIGNvbnN0cnVjdG9yKGFzc2F5OkFzc2F5RGF0YSwgbWVhc3VyZW1lbnRJRDpudW1iZXIpIHtcbiAgICAgICAgICAgIC8vIE9mIHR5cGUgU3VtbWF0aW9uLlRpbWVTYW1wbGUuIFNvcnRlZCBieSB0aW1lU3RhbXAuXG4gICAgICAgICAgICAvLyBOb3RlIHRoYXQgc2FtcGxlIDAncyBjYXJib25EZWx0YSB3aWxsIGJlIDAgc2luY2UgaXQgaGFzIG5vIHByZXZpb3VzIG1lYXN1cmVtZW50LlxuICAgICAgICAgICAgdGhpcy5hc3NheSA9IGFzc2F5O1xuICAgICAgICAgICAgdGhpcy5tZWFzdXJlSWQgPSBtZWFzdXJlbWVudElEO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gVGhpcyBpcyB0aGUgZWFzaWVzdCBmdW5jdGlvbiB0byBjYWxsIHRvIGdldCB0aGUgY2FyYm9uIGRlbHRhIGF0IGEgc3BlY2lmaWMgdGltZS5cbiAgICAgICAgLy8gSWYgdGhpcyB0aW1lbGluZSBkb2Vzbid0IGhhdmUgYSBzYW1wbGUgYXQgdGhhdCBwb3NpdGlvbiwgaXQnbGwgaW50ZXJwb2xhdGUgYmV0d2VlblxuICAgICAgICAvLyB0aGUgbmVhcmVzdCB0d28uXG4gICAgICAgIGludGVycG9sYXRlQ2FyYm9uRGVsdGEodGltZVN0YW1wOm51bWJlcik6bnVtYmVyIHtcbiAgICAgICAgICAgIHZhciBwcmV2OlRpbWVTYW1wbGUsIGRlbHRhOm51bWJlcjtcbiAgICAgICAgICAgIGlmICh0aGlzLnRpbWVTYW1wbGVzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgICAgICAgIHJldHVybiAwO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy8gSWYgdGhlIHRpbWUgc3RhbXAgaXMgYmVmb3JlIGFsbCBvdXIgc2FtcGxlcywganVzdCByZXR1cm4gb3VyIGZpcnN0IHNhbXBsZSdzXG4gICAgICAgICAgICAvLyBjYXJib24gZGVsdGEuXG4gICAgICAgICAgICBwcmV2ID0gdGhpcy50aW1lU2FtcGxlc1swXTtcbiAgICAgICAgICAgIGlmICh0aW1lU3RhbXAgPD0gcHJldi50aW1lU3RhbXApIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy50aW1lU2FtcGxlc1swXS5jYXJib25EZWx0YTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMudGltZVNhbXBsZXMuc29tZSgoc2FtcGxlOlRpbWVTYW1wbGUpOmJvb2xlYW4gPT4ge1xuICAgICAgICAgICAgICAgIGlmIChzYW1wbGUudGltZVN0YW1wID09PSB0aW1lU3RhbXApIHtcbiAgICAgICAgICAgICAgICAgICAgZGVsdGEgPSBzYW1wbGUuY2FyYm9uRGVsdGE7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAodGltZVN0YW1wID49IHByZXYudGltZVN0YW1wICYmIHRpbWVTdGFtcCA8PSBzYW1wbGUudGltZVN0YW1wKSB7XG4gICAgICAgICAgICAgICAgICAgIGRlbHRhID0gVXRsLkpTLnJlbWFwVmFsdWUodGltZVN0YW1wLCBwcmV2LnRpbWVTdGFtcCwgc2FtcGxlLnRpbWVTdGFtcCxcbiAgICAgICAgICAgICAgICAgICAgICAgIHByZXYuY2FyYm9uRGVsdGEsIHNhbXBsZS5jYXJib25EZWx0YSk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBwcmV2ID0gc2FtcGxlO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICBpZiAoZGVsdGEgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgIC8vIFRoZSB0aW1lIHN0YW1wIHRoZXkgcGFzc2VkIGluIG11c3QgYmUgcGFzdCBhbGwgb3VyIHNhbXBsZXMuXG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMudGltZVNhbXBsZXMuc2xpY2UoLTEpWzBdLmNhcmJvbkRlbHRhO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIGRlbHRhO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gUmV0dXJuIGEgVGltZVNhbXBsZSBvciBudWxsLlxuICAgICAgICBmaW5kU2FtcGxlQnlUaW1lU3RhbXAodGltZVN0YW1wOm51bWJlcik6VGltZVNhbXBsZSB7XG4gICAgICAgICAgICB2YXIgbWF0Y2hlZDpUaW1lU2FtcGxlW107XG4gICAgICAgICAgICBtYXRjaGVkID0gdGhpcy50aW1lU2FtcGxlcy5maWx0ZXIoXG4gICAgICAgICAgICAgICAgKHNhbXBsZTpUaW1lU2FtcGxlKTpib29sZWFuID0+IHNhbXBsZS50aW1lU3RhbXAgPT09IHRpbWVTdGFtcCk7XG4gICAgICAgICAgICBpZiAobWF0Y2hlZC5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gbWF0Y2hlZFswXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICB9XG5cbiAgICB9XG5cbiAgICAvLyBEYXRhIGZvciBhIHNpbmdsZSBsaW5lIGZvciBhIHNpbmdsZSBwb2ludCBpbiB0aW1lLlxuICAgIGV4cG9ydCBjbGFzcyBUaW1lU2FtcGxlIHtcbiAgICAgICAgLy8gaW4gaG91cnNcbiAgICAgICAgdGltZVN0YW1wOm51bWJlciA9IDA7XG4gICAgICAgIC8vICoqIE5PVEU6IENtTW9sIGhlcmUgbWVhbnMgY2FyYm9uIG1pbGxpLW1vbGVzLlxuICAgICAgICAvLyBDbU1vbC9MIG9mIGNhcmJvbiBhdCB0aGlzIHRpbWVzdGFtcFxuICAgICAgICBjYXJib25WYWx1ZTpudW1iZXIgPSAwO1xuICAgICAgICAvLyBDbU1vbC9nZHcvaHJcbiAgICAgICAgLy8gZGVsdGEgYmV0d2VlbiB0aGlzIGNhcmJvbiB2YWx1ZSBhbmQgdGhlIHByZXZpb3VzIG9uZSAoMCBmb3IgdGhlIGZpcnN0IGVudHJ5KTpcbiAgICAgICAgLy8gLS0gUE9TSVRJVkUgbWVhbnMgb3V0cHV0IChpbiB0aGF0IHRoZSBvcmdhbmlzbSBvdXRwdXR0ZWQgdGhpcyBtZXRhYm9saXRlIGZvciB0aGUgdGltZVxuICAgICAgICAvLyAgICAgIHNwYW4gaW4gcXVlc3Rpb24pXG4gICAgICAgIC8vIC0tIE5FR0FUSVZFIG1lYW5zIGlucHV0ICAoaW4gdGhhdCB0aGUgb3JnYW5pc20gcmVkdWNlZCB0aGUgYW1vdW50IG9mIHRoaXMgbWV0YWJvbGl0ZVxuICAgICAgICAvLyAgICAgIGZvciB0aGUgdGltZSBzcGFuKVxuICAgICAgICBjYXJib25EZWx0YTpudW1iZXIgPSAwO1xuXG4gICAgICAgIGlzSW5wdXQoKSA6IGJvb2xlYW4ge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuY2FyYm9uRGVsdGEgPD0gMDtcbiAgICAgICAgfVxuXG4gICAgICAgIGlzT3V0cHV0KCkgOiBib29sZWFuIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmNhcmJvbkRlbHRhID4gMDtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFJldHVybiB0aGUgYWJzb2x1dGUgdmFsdWUgb2YgY2FyYm9uRGVsdGEuIFlvdSdsbCBuZWVkIHRvIHVzZSBpc0lucHV0KCkgb3IgaXNPdXRwdXQoKVxuICAgICAgICAvLyB0byBrbm93IHdoaWNoIGl0IHJlcHJlc2VudHMuXG4gICAgICAgIGFic0RlbHRhKCkgOiBudW1iZXIge1xuICAgICAgICAgICAgcmV0dXJuIE1hdGguYWJzKHRoaXMuY2FyYm9uRGVsdGEpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgaW50ZXJmYWNlIE1lcmdlZExpbmVUaW1lTG9va3VwIHtcbiAgICAgICAgW2luZGV4Om51bWJlcl06IE1lcmdlZExpbmVTYW1wbGU7XG4gICAgfVxuXG4gICAgLy8gU3RlcCAxIGlzIHdoZXJlIENhcmJvbkJhbGFuY2UuU3VtbWF0aW9uIGJ1aWxkcyBhIHRpbWVsaW5lIGZvciBlYWNoIGxpbmUtPmFzc2F5LT5tZXRhYm9saXRlLlxuICAgIC8vIFN0ZXAgMiBpcyB3aGVyZSB0aGlzIGNsYXNzIG1lcmdlcyBhbGwgdGhlIGFzc2F5LT5tZXRhYm9saXRlIHRpbWVsaW5lcyBpbnRvIG9uZSB0aW1lbGluZVxuICAgIC8vIGZvciBlYWNoIGxpbmUuXG4gICAgZXhwb3J0IGNsYXNzIFRpbWVsaW5lTWVyZ2VyIHtcblxuICAgICAgICAvLyBUYWtlIHRoZSBpbnB1dCBMaW5lRGF0YSBhbmQgc3VtIHVwIGFsbCBtZWFzdXJlbWVudHMgYWNyb3NzIGFsbCBhc3NheXMvbWV0YWJvbGl0ZXNcbiAgICAgICAgLy8gaW50byBhIGxpc3Qgb2Yge3RpbWVTdGFtcCwgdG90YWxDYXJib25JbiwgdG90YWxDYXJib25PdXR9IG9iamVjdHMgKHNvcnRlZCBieSB0aW1lU3RhbXApLlxuICAgICAgICBwdWJsaWMgc3RhdGljIG1lcmdlQWxsTGluZVNhbXBsZXMobGluZURhdGE6TGluZURhdGEpOk1lcmdlZExpbmVTYW1wbGVzIHtcbiAgICAgICAgICAgIHZhciBtZXJnZWRMaW5lU2FtcGxlczpNZXJnZWRMaW5lU2FtcGxlcyA9IG5ldyBNZXJnZWRMaW5lU2FtcGxlcygpLFxuICAgICAgICAgICAgICAgIC8vIEZpcnN0LCBidWlsZCBhIGxpc3Qgb2YgdGltZXN0YW1wcyBmcm9tIFwicHJpbWFyeSBhc3NheXNcIiAoaS5lLiBub24tUkFNT1MgYXNzYXlzKS5cbiAgICAgICAgICAgICAgICAvLyBvYmplY3QgaXMgYmVpbmcgdXNlZCBhcyBhIHNldFxuICAgICAgICAgICAgICAgIHZhbGlkVGltZVN0YW1wczp7W2k6bnVtYmVyXTpudW1iZXJ9ID0ge30sXG4gICAgICAgICAgICAgICAgbWVyZ2VkU2FtcGxlczpNZXJnZWRMaW5lVGltZUxvb2t1cCA9IDxNZXJnZWRMaW5lVGltZUxvb2t1cD57fTtcblxuICAgICAgICAgICAgJC5lYWNoKGxpbmVEYXRhLmFzc2F5c0J5SUQsIChha2V5OnN0cmluZywgYXNzYXk6QXNzYXlEYXRhKTp2b2lkID0+IHtcbiAgICAgICAgICAgICAgICAkLmVhY2goYXNzYXkudGltZWxpbmVzQnlNZWFzdXJlbWVudElkLFxuICAgICAgICAgICAgICAgICAgICAgICAgKHRrZXk6c3RyaW5nLCB0aW1lbGluZTpNZXRhYm9saXRlVGltZWxpbmUpOnZvaWQgPT4ge1xuICAgICAgICAgICAgICAgICAgICBtZXJnZWRMaW5lU2FtcGxlcy5tZXRhYm9saXRlVGltZWxpbmVzLnB1c2godGltZWxpbmUpO1xuICAgICAgICAgICAgICAgICAgICBpZiAoVGltZWxpbmVNZXJnZXIuX2lzUHJpbWFyeUFzc2F5KGFzc2F5KSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGltZWxpbmUudGltZVNhbXBsZXMuZm9yRWFjaCgoc2FtcGxlOlRpbWVTYW1wbGUpOnZvaWQgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhbGlkVGltZVN0YW1wc1tzYW1wbGUudGltZVN0YW1wXSA9IHNhbXBsZS50aW1lU3RhbXA7XG4gICAgICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAkLmVhY2godmFsaWRUaW1lU3RhbXBzLCAoa2V5OnN0cmluZywgdGltZVN0YW1wOm51bWJlcik6dm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgdmFyIG91dFNhbXBsZTpNZXJnZWRMaW5lU2FtcGxlLCB0aW1lbGluZXM6TWV0YWJvbGl0ZVRpbWVsaW5lW107XG4gICAgICAgICAgICAgICAgaWYgKHRpbWVTdGFtcCA9PT0gMCkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIG91dFNhbXBsZSA9IG5ldyBNZXJnZWRMaW5lU2FtcGxlKHRpbWVTdGFtcCk7XG4gICAgICAgICAgICAgICAgbWVyZ2VkU2FtcGxlc1t0aW1lU3RhbXBdID0gb3V0U2FtcGxlO1xuICAgICAgICAgICAgICAgIHRpbWVsaW5lcyA9IG1lcmdlZExpbmVTYW1wbGVzLm1ldGFib2xpdGVUaW1lbGluZXM7XG4gICAgICAgICAgICAgICAgdGltZWxpbmVzLmZvckVhY2goKHRpbWVsaW5lOk1ldGFib2xpdGVUaW1lbGluZSk6dm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBjYXJib25EZWx0YTpudW1iZXIgPSB0aW1lbGluZS5pbnRlcnBvbGF0ZUNhcmJvbkRlbHRhKHRpbWVTdGFtcCk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChjYXJib25EZWx0YSA+IDApIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIG91dFNhbXBsZS50b3RhbENhcmJvbk91dCArPSBjYXJib25EZWx0YTtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIG91dFNhbXBsZS50b3RhbENhcmJvbkluIC09IGNhcmJvbkRlbHRhO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIC8vIHNvcnQgdGhlIHNhbXBsZXMgYnkgdGltZXN0YW1wXG4gICAgICAgICAgICBtZXJnZWRMaW5lU2FtcGxlcy5tZXJnZWRMaW5lU2FtcGxlcyA9ICQubWFwKFxuICAgICAgICAgICAgICAgIG1lcmdlZFNhbXBsZXMsXG4gICAgICAgICAgICAgICAgKHNhbXBsZTpNZXJnZWRMaW5lU2FtcGxlKTpNZXJnZWRMaW5lU2FtcGxlID0+IHNhbXBsZVxuICAgICAgICAgICAgKS5zb3J0KChhOk1lcmdlZExpbmVTYW1wbGUsIGI6TWVyZ2VkTGluZVNhbXBsZSk6bnVtYmVyID0+IHtcbiAgICAgICAgICAgICAgICByZXR1cm4gYS50aW1lU3RhbXAgLSBiLnRpbWVTdGFtcDtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgcmV0dXJuIG1lcmdlZExpbmVTYW1wbGVzO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gUmV0dXJucyB0cnVlIGlmIHRoaXMgaXMgYSBcInByaW1hcnlcIiBhc3NheSwgd2hpY2ggbWVhbnMgdGhhdCB3ZSdsbCB1c2UgaXQgdG8gZ2VuZXJhdGVcbiAgICAgICAgLy8gY2FyYm9uIGJhbGFuY2UgdGltZSBzYW1wbGVzLiBBIG5vbi1wcmltYXJ5IGFzc2F5IGlzIHNvbWV0aGluZyB0aGF0IGdlbmVyYXRlcyBhIHRvbiBvZlxuICAgICAgICAvLyBzYW1wbGVzIGxpa2UgUkFNT1MuXG4gICAgICAgIHByaXZhdGUgc3RhdGljIF9pc1ByaW1hcnlBc3NheShhc3NheTpBc3NheURhdGEpOmJvb2xlYW4ge1xuICAgICAgICAgICAgdmFyIHNlcnZlckFzc2F5RGF0YTpBc3NheVJlY29yZCA9IEVERERhdGEuQXNzYXlzW2Fzc2F5LmFzc2F5SWRdLFxuICAgICAgICAgICAgICAgIHByb3RvY29sOmFueSA9IEVERERhdGEuUHJvdG9jb2xzW3NlcnZlckFzc2F5RGF0YS5waWRdO1xuICAgICAgICAgICAgLy8gVE9ETzogRnJhZ2lsZVxuICAgICAgICAgICAgcmV0dXJuIChwcm90b2NvbC5uYW1lICE9PSAnTzIvQ08yJyk7XG4gICAgICAgIH1cbiAgICB9XG5cbn0gLy8gZW5kIG1vZHVsZSBDYXJib25CYWxhbmNlXG4iXX0=