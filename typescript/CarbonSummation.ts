/// <reference path="typescript-declarations.d.ts" />
/// <reference path="Utl.ts" />
/// <reference path="EDDDataInterface.ts" />
/// <reference path="StudyCarbonBalance.ts" />



module CarbonBalance {

	// This is the client-side container for carbon balance data.
	// It combs through lines/assays/measurements to build a structure that is easy
	// to pull from when displaying carbon balance data.
	//
	// This is purely a data class, NOT a display class.
	export class Summation {

		// Use this to create a summation object.
		static create(biomassCalculation:number):Summation {

			var sum:Summation = new Summation();
			sum.init(biomassCalculation);
			return sum;
		}


		// Use this to generate some debug text that describes all the calculations.
		static generateDebugText(biomassCalculation:number, debugLineID:number, debugTimeStamp:string):string {

			// Create a Summation object but tell it to generate debug info while it does its timestamps.
			var sum:Summation = new Summation();
			sum._debugLineID = debugLineID;
			sum._debugTimeStamp = debugTimeStamp;
			sum._debugOutput = "";
			sum.init(biomassCalculation);

			// Return its debug info.
			return sum._debugOutput;
		}


		// Internally, this is how we init the Summation object regardless of whether it's gonna be used later
		// or whether it's just used to get some debug text.
		private init(biomassCalculation:number):void {

			this._precalculateValidLists();
			// Convert to a hash on timestamp.
			this._assayMeasurementDataByID = {};
			for (var assayMeasurementID in EDDData.AssayMeasurements) {
				
				var inData = EDDData.AssayMeasurements[assayMeasurementID].d;
				var outData = {};
				for (var i=0; i < inData.length; i++) {
					outData[inData[i][0]] = inData[i][1];
				}
				this._assayMeasurementDataByID[assayMeasurementID] = outData;
			}

			// We need to prepare integrals of any mol/L/hr 
			var integralsByMeasurementID = this._integrateAssayMeasurements(biomassCalculation);

			// We're gonna keep a list of anything that we don't have molar mass for.
			var needMolarMassByMeasurementTypeID = {};

			// Iterate over lines.
			for (var lineID in EDDData.Lines) {
				var line:LineRecord = EDDData.Lines[lineID];
				if (!line.active) {
					continue;
				}

				// Create the output LineData structure.
				var outLine = new LineData(lineID);
			
				var timeSamplesByTime = {};
				var anyTimeSamplesAdded = false;

				// Get all assays for this line.
				var lineAssays:number[] = this._validAssaysByLineID[lineID];
				for (var iAssay=0; iAssay < lineAssays.length; iAssay++) {
					var assayID:number = lineAssays[iAssay];
					var assay:AssayRecord = EDDData.Assays[assayID];

			    	var pid = assay.pid;
					var assayName:string = [line.name, EDDData.Protocols[pid].name, assay.name].join('-');

					this._writeDebugLine(lineID == this._debugLineID, "Assay " + assayName);
					this._debugOutputIndent++;

					// Create the AssayData output structure.
					var outAssay = new AssayData(assayID);
					var numValidMeasurements = 0;

					// Go through all measurements in this assay.
					var assayMeasurements:number[] = this._validMeasurementsByAssayID[assayID];
					for (var iMeasurement:number=0; iMeasurement < assayMeasurements.length; iMeasurement++) {
						var measurementID:number = assayMeasurements[iMeasurement];
						var measurement:AssayMeasurementRecord = EDDData.AssayMeasurements[measurementID];

						// Skip this measurement altogether if we can't figure out carbon from it.
						if (!this._doesMeasurementContainCarbon(measurementID, needMolarMassByMeasurementTypeID)) {
							continue;
						}

						this._writeDebugLine(lineID == this._debugLineID, EDDData.MetaboliteTypes[measurement.mt].name);
						this._debugOutputIndent++;

						numValidMeasurements++;

						// Create the MetaboliteTimeline output structure.
						var outTimeline = new MetaboliteTimeline(outAssay, measurementID);
						outAssay.timelinesByMeasurementId[measurementID] = outTimeline;

						// Build a sorted list of timestamp/measurement.
						outTimeline.timeSamples = this._buildSortedMeasurementsForAssayMetabolite(outLine, measurementID, integralsByMeasurementID, biomassCalculation);

						// Keep track of the last time sample's time.
						if (outTimeline.timeSamples.length > 0) {
							anyTimeSamplesAdded = true;
							var highestLineTimeSample = outTimeline.timeSamples[outTimeline.timeSamples.length-1].timeStamp;
							this.lastTimeInSeconds = Math.max(this.lastTimeInSeconds, parseFloat(highestLineTimeSample));
						}

						this._writeDebugLine(lineID == this._debugLineID, "");
						this._debugOutputIndent--;
					}

					// Store this assay.
					outLine.assaysByID[assayID] = outAssay;
					this._writeDebugLine(lineID == this._debugLineID, "");
					this._debugOutputIndent--;
				}

				// Keep track of this LineData if it has any data. Otherwise, forget about it.
				if (anyTimeSamplesAdded) {
					this.lineDataByID[lineID] = outLine;
				}
			}

		}


		// Append the string to our _debugOutput string if shouldWrite=true.
		// (Having shouldWrite there makes it easier to do a one-line debug output that includes the check of whether it should write).
		private _writeDebugLine(shouldWrite:boolean, val:string):void {
			if (!shouldWrite) {
				return;
			}
			var indent = '';
			for (var i:number=0; i < this._debugOutputIndent; i++) {
				indent += "    ";
			}
			this._debugOutput += indent + val + "\n";
		}


		private _writeDebugLineWithHeader(shouldWrite:boolean, header:string, val:string) {
			var str:string = Utl.JS.padStringLeft("[" + header + "] ", 30);
			this._writeDebugLine(shouldWrite, str + val);
		}


		// Convert a number to a string for debug output. If all the code uses this, then 
		// all the number formatting will be consistent.
		private _numStr(value:any):string {
			return parseFloat(value).toFixed(5);
		}


		// This just wraps the call to TimelineMerger.mergeAllLineSamples.
		public mergeAllLineSamples(lineData):MergedLineSamples {
			return TimelineMerger.mergeAllLineSamples(lineData);
		}


		getLineDataByID(lineID:number):LineData {
			return this.lineDataByID[lineID];
		}


		// This is used in a first pass on a measurement to decide if we should scan its measurements.
		// If you update this, update calculateCmolPerLiter (and vice-versa).
		private _doesMeasurementContainCarbon(measurementID, needMolarMassByMeasurementTypeID) {
			var measurement:AssayMeasurementRecord = EDDData.AssayMeasurements[measurementID];
			var measurementType:MetaboliteTypeRecord = EDDData.MetaboliteTypes[measurement.mt];
			if (!measurementType) {
				return false;
			}

			// OD measurements use the biomass factor to estimate the amount of carbon created or destroyed.
			// There's no guarantee we hae a valid biomass factor, but we definitely know there is carbon here.
			if (this._isOpticalDensityMeasurement(measurementType)) {
				return true;
			}
            var uRecord = EDDData.UnitTypes[measurement.uid];
            var units:string = uRecord ? uRecord.name : '';

			var carbonCount = measurementType.cc; // # carbons per mole

			if (units == '' || units == 'n/a' || !carbonCount) {
				return false;
			} else if (units == 'g/L') {
				// g/L is fine if we have a molar mass so we can convert g->mol
				if (!measurementType.mm) {
					// Make note that this metabolite is missing molar mass.
					if (needMolarMassByMeasurementTypeID) {
						needMolarMassByMeasurementTypeID[measurement.mt] = true;
					}
					return false;
				} else {
					return true;
				}
			} else {
				// Anything using mols is fine as well.
				return (units == 'mol/L/hr' || units == 'uM' || units == 'mM' || units == 'mol/L' || units == 'Cmol/L');
			}
		}


		// Do unit conversions in order to get a Cmol/L value.
		// ** NOTE: This is "C-moles", which is CARBON moles/liter (as opposed to CENTI moles/liter).
		private _calculateCmMolPerLiter(measurementID, timeStamp, integralsByMeasurementID, biomassCalculation:number, dOut:boolean) {
			// A measurement is the time series data for ONE metabolite
			// measurement.data contains all the meaty stuff - its keys are the timestamps and its values are the actual readings
			var measurement:AssayMeasurementRecord = EDDData.AssayMeasurements[measurementID];
			var measurementType:MetaboliteTypeRecord = EDDData.MetaboliteTypes[measurement.mt];

            var uRecord = EDDData.UnitTypes[measurement.uid];
            var units:string = uRecord ? uRecord.name : '';

			var carbonCount = measurementType.cc; // # carbons per mole
			var finalValue = 0;
			var isValid = false;
			var isOpticalDensity:boolean = this._isOpticalDensityMeasurement(measurementType);

			// First, is this measurement something that we care about? 
			//
			// We'll throw out anything that has multiple numbers per sample. Right now, we're
			// only handling one-dimensional numeric samples.
			//
			// We'll also throw out anything that doesn't even have a carbon count, like CO2/O2 ratios.
			if (isOpticalDensity) {
				// The OD readings will be used directly in _calculateCarbonDeltas to get a growth rate.
				finalValue = this._assayMeasurementDataByID[measurementID][timeStamp];
				isValid = true;
			} else if (units == 'mol/L/hr') {
				var integrals = integralsByMeasurementID[measurementID];
				if (integrals) {
					finalValue = integrals[timeStamp] * 1000;
					isValid = (typeof finalValue != 'undefined');
				}
			} else if (units == '' || units == 'n/a' || !carbonCount) {
				// isValid will stay false.
			} else {
				// Check for various conversions that we might need to do.
				var value = this._assayMeasurementDataByID[measurementID][timeStamp];
				
				if (dOut) {
					this._writeDebugLine(true, timeStamp + "h");
					this._debugOutputIndent++;
					this._writeDebugLineWithHeader(true, "raw value", this._numStr(value) + " " + units);
				}

				if (value == 0) {
					// Don't bother with all this work (and debug output) if the value is 0.
				 	finalValue = value;
				 	isValid = true;
				}
				else if (typeof value != 'undefined') {
					
					// Convert uM to mol/L. Note: even though it's not written as uM/L, these
					// quantities should be treated as per-liter.
					if (units == 'uM') {
						var newValue:number = value / 1000;
						this._writeDebugLineWithHeader(dOut, "convert", " / 1000 = " + this._numStr(newValue) + " mol/L");

						value = newValue;
						units = 'mMol/L'
					}
					
					// Do molar mass conversions.
					if (units == 'g/L') {
						var molarMass = measurementType.mm;
						if (!molarMass) {
							// We should never get in here.
							this._writeDebugLine(dOut, "Trying to calculate carbon for a g/L metabolite with an unspecified molar mass! (The code should never get here).");
						} else {
							var newValue:number = value * 1000 / parseFloat(<any>molarMass);  // (g/L) * (mol/g) = (mol/L)
							this._writeDebugLineWithHeader(dOut, "divide by molar mass",
								" * 1000 / " + molarMass + " g/mol = " + this._numStr(newValue) + " mMol/L");
							value = newValue;
							units = 'mMol/L'
						}
					}

					// Convert mMol/L to CmMol/L.
					// ** NOTE: This is "C-moles", which is CARBON moles/liter (as opposed to CENTI moles/liter).
					if (units == 'mMol/L') {
						var newValue:number = value * carbonCount;

						this._writeDebugLineWithHeader(dOut, "multiply by carbon count", " * " + carbonCount + " = " + this._numStr(newValue) + " CmMol/L");

						value = newValue;
						units = 'CmMol/L'
					}

					// Are we in our desired output format (Cmol/L)?
					if (units == 'CmMol/L') {
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
			}
		}


		private _isOpticalDensityMeasurement(measurementType:MetaboliteTypeRecord):boolean {
			return measurementType.name == 'Optical Density';
		}


		// Returns a hash of assayMeasurementID->{time->integral} for any mol/L/hr measurements.
		private _integrateAssayMeasurements(biomassCalculation:number) {
			var integralsByMeasurementID = {};

			for (var measurementID in EDDData.AssayMeasurements) {
				var measurement:AssayMeasurementRecord = EDDData.AssayMeasurements[measurementID];
				if (measurement.dis) {
					continue; 
				}
				var measurementType:MetaboliteTypeRecord = EDDData.MetaboliteTypes[measurement.mt];
				if (!measurementType) {
					continue;
				}

				var carbonCount = measurementType.cc; // # carbons per mole

				// See 'Optical Density Note' below.
	            var uRecord = EDDData.UnitTypes[measurement.uid];
    	        var units:string = uRecord ? uRecord.name : '';
				if (units != 'mol/L/hr' || !carbonCount) {
					continue;
				}

				// Setup the output structure.
				var integrals = {};
				integralsByMeasurementID[measurementID] = integrals;

				// Now sum over all its data.
				var data = this._assayMeasurementDataByID[measurementID];
				var sortedTime:string[] = this._getMeasurementTimestampsSorted(measurementID);

				var prevTime:number = -1;
				var total:number = 0;
				var prevValue:number = 0;
				for (var i in sortedTime) {
					var timeStamp:number = parseFloat(sortedTime[i]);
					var value = data[timeStamp];
					
					// First sample?
					if (prevTime == -1) {
						prevTime = timeStamp;
						prevValue = value;
						continue;
					}

					// Update the total and store it in the integral table.
					var dt:number = timeStamp - prevTime;
					total += dt * value * carbonCount;

					integrals[timeStamp] = total;

					prevTime = timeStamp;
					prevValue = value;
				}
			}

			return integralsByMeasurementID;
		}
		

		// Get the line ID for a measurement.
		private _getMeasurementLineID(measurement:AssayMeasurementRecord):number {
			var assay:AssayRecord = EDDData.Assays[measurement.aid];
			return assay.lid;
		}


		// Returns an array of timestamps for this assay sorted by time.
		private _getMeasurementTimestampsSorted(measurementID:number):string[] {
			if (!this._assayMeasurementDataByID.hasOwnProperty(measurementID.toString())) {
				console.log('Warning: No sorted timestamp array for measurement ' + measurementID);
				return [];
			}
			var data = this._assayMeasurementDataByID[measurementID];

			var sortedTime = Object.keys(data);
			sortedTime.sort( function(a,b) {return parseFloat(a)-parseFloat(b);} );
			return sortedTime;
		}


		// Go through all measurements in this metabolite, figure out the carbon count, and return a sorted
		// list of {timeStamp, value} objects. values are in Cmol/L.
		private _buildSortedMeasurementsForAssayMetabolite(line:LineData, measurementID, integralsByMeasurementID, biomassCalculation:number):TimeSample[] {

			var measurement:AssayMeasurementRecord = EDDData.AssayMeasurements[measurementID];
			var measurementData = this._assayMeasurementDataByID[measurementID];

			// Make a sorted array of timestamps.
			var sortedTimestamps = Object.keys(measurementData);
			sortedTimestamps.sort( function(a,b) {return <number><any>a - <number><any>b;} );
			var sortedMeasurements = [];

			// For each timestamp, 
			for (var i:number=0; i < sortedTimestamps.length; i++) {
				var timeStamp:string = sortedTimestamps[i];

				// Write debug output for the timestamp we're interested in and the one before it
				// (since the /hr term comes from the delta between the previous and the current timestamp).
				var writeDebugOutput:boolean = false;
				if (this._debugTimeStamp && line.getLineID() == this._debugLineID) {
					if (timeStamp == this._debugTimeStamp || (i+1 < sortedTimestamps.length && sortedTimestamps[i+1] == this._debugTimeStamp))
						writeDebugOutput = true;
				}

				// Get a CmMol/L value.
				var result = this._calculateCmMolPerLiter(
					measurementID, 
					timeStamp, 
					integralsByMeasurementID, 
					biomassCalculation,
					writeDebugOutput);

				if (!result.isValid) {
					continue;
				}

				// Add this 
				var sample:TimeSample = new TimeSample();
				sample.timeStamp = timeStamp;
				sample.carbonValue = result.value;
				sortedMeasurements.push(sample);
			}

			return this._calculateCarbonDeltas(sortedMeasurements, line, measurement, biomassCalculation);
		}


		// Go through the TimeSamples and calculate their carbonDelta value.
		private _calculateCarbonDeltas(sortedMeasurements:TimeSample[], line:LineData, measurement:AssayMeasurementRecord, biomassCalculation:number):TimeSample[] {
			var measurementType:MetaboliteTypeRecord = EDDData.MetaboliteTypes[measurement.mt];
			var isOpticalDensity = this._isOpticalDensityMeasurement(measurementType);

			// Now divide CmMol/gdw deltas by time deltas to get CmMol/gdw/hr.
			for (var i=1; i < sortedMeasurements.length; i++) {
				var cur:TimeSample = sortedMeasurements[i];
				var prev:TimeSample = sortedMeasurements[i-1];

				var writeDebugInfo:boolean = (this._debugTimeStamp && line.getLineID() == this._debugLineID && cur.timeStamp == this._debugTimeStamp);
				var deltaTime:number = this._calcTimeDelta(prev.timeStamp, cur.timeStamp);

				if (isOpticalDensity) {
					// If this is the OD measurement, then we'll use the biomass factor to get biomass.
					var growthRate:number = Math.log(cur.carbonValue / prev.carbonValue) / deltaTime;
					cur.carbonDelta = growthRate * biomassCalculation;

					if (writeDebugInfo) {

						var assay:AssayRecord = EDDData.Assays[measurement.aid];
				    	var lid = assay.lid;
				    	var pid = assay.pid;
						var assayName:string = [EDDData.Lines[lid].name, EDDData.Protocols[pid].name, assay.name].join('-');

						this._writeDebugLine(true, "Biomass Calculation for " + assayName);
						this._debugOutputIndent++;

						this._writeDebugLineWithHeader(true, "raw OD at " + prev.timeStamp + "h", this._numStr(prev.carbonValue));
						this._writeDebugLineWithHeader(true, "raw OD at " + cur.timeStamp + "h", this._numStr(cur.carbonValue));
						this._writeDebugLineWithHeader(true, "growth rate", "log(" + this._numStr(cur.carbonValue) + " / " + this._numStr(prev.carbonValue) + ") / " + this._numStr(deltaTime) + "h = " + this._numStr(growthRate));
						this._writeDebugLineWithHeader(true, "biomass factor", " * " + this._numStr(biomassCalculation) + " = " + this._numStr(cur.carbonDelta) + " CmMol/gdw/hr");

						this._writeDebugLine(true, "");
						this._debugOutputIndent--;
					}
				} else {
					// Gather terms.
					var deltaCarbon:number = (cur.carbonValue - prev.carbonValue);
					var opticalDensityFactor:number = this._calculateOpticalDensityFactor(line, prev.timeStamp, writeDebugInfo);
					
					// CmMol/L -> CmMol/L/hr
					var CmMolPerLiterPerHour:number = (deltaCarbon / deltaTime);

					// CmMol/L/hr * L/gdw -> CmMol/gdw/hr
					var CmMolPerGdwPerHour:number = CmMolPerLiterPerHour / opticalDensityFactor;
					cur.carbonDelta = CmMolPerGdwPerHour;

					// Write some debug output for what we just did.
					if (writeDebugInfo) {
						this._writeDebugLine(true, "Convert to CmMol/gdw/hr");
						this._debugOutputIndent++;

						this._writeDebugLineWithHeader(true, "delta from " + prev.timeStamp + "h to " + cur.timeStamp + "h", this._numStr(cur.carbonValue) + " CmMol/L - " + this._numStr(prev.carbonValue) + " CmMol/L = " + this._numStr(deltaCarbon) + " CmMol/L");
						this._writeDebugLineWithHeader(true, "delta time", " / " + this._numStr(deltaTime) + "h = " + this._numStr(CmMolPerLiterPerHour) + " CmMol/L/h");
						this._writeDebugLineWithHeader(true, "apply OD", " / " + this._numStr(opticalDensityFactor) + " L/gdw = " + this._numStr(CmMolPerGdwPerHour) + " CmMol/gdw/h");

						this._debugOutputIndent--;
					}
				}
			}

			return sortedMeasurements;
		}


		// Calculate the difference between two (string) timestamps.
		private _calcTimeDelta(fromTimeStamp:string, toTimeStamp:string):number {
			return parseFloat(toTimeStamp) - parseFloat(fromTimeStamp);
		}


		// Find where timeStamp fits in the timeline and interpolate.
		// Returns the index of the timeline and the interpolation amount.
		private _fitOnSortedTimeline(timeStamp:string, timeline:string[]):any {

			var timeStampNumber:number = parseFloat(timeStamp);
			for (var i:number=0; i < timeline.length; i++) {
				var cur:number = parseFloat(timeline[i]);
				if (timeStampNumber <= cur) {
					if (i == 0) {
						return {index:0, t:0};
					} else {
						var prev:number = parseFloat(timeline[i-1]);
						return {index:i-1, t:(timeStampNumber - prev) / (cur - prev) };
					}
				}
			}

			// timeStamp is after the last timestamp in the timeline, so let's just return that last one.
			return {index:timeline.length-2, t:1};
		}


		// Given a line and a timestamp, this function linearly interpolates as necessary to come up with
		// an OD value, then it multiplies by a magic number to arrive at a gdw/L factor that
		// can be factored into measurements.
		private _calculateOpticalDensityFactor(line:LineData, timeStamp:string, writeDebugInfo:boolean):number {
			// Get the OD measurements. 
			var measurementID:number = this._getOpticalDensityMeasurementForLine(line.getLineID());

			// Linearly interpolate on the OD measurement to get the desired factor.
			var sortedTime:string[] = this._getMeasurementTimestampsSorted(measurementID);

			var interpInfo = this._fitOnSortedTimeline(timeStamp, sortedTime);

			// This is the (linearly interpolated) OD600 measurement.
			var data = this._assayMeasurementDataByID[measurementID];
			var t:number = interpInfo.t;
			var data1:number = parseFloat(data[sortedTime[interpInfo.index]]);
			var data2:number = parseFloat(data[sortedTime[interpInfo.index+1]]);
			var odMeasurement:number = data1 + (data2 - data1) * t;

			var odMagicFactor:number = 0.65;	// A magic factor to give us gdw/L for an OD600 measurement.
												// TODO: This can be customized in assay metadata so we should allow for that here.
			var finalValue:number = odMeasurement * odMagicFactor;

			// Spit out our calculations if requested.
 			if (writeDebugInfo) {
				var measurement:AssayMeasurementRecord = EDDData.AssayMeasurements[measurementID];

				var assay:AssayRecord = EDDData.Assays[measurement.aid];
		    	var lid = assay.lid;
		    	var pid = assay.pid;
				var assayName:string = [EDDData.Lines[lid].name, EDDData.Protocols[pid].name, assay.name].join('-');

 				this._writeDebugLine(true, "Getting optical density from " + assayName);
				this._debugOutputIndent++;

 				if (t != 1)
					this._writeDebugLineWithHeader(true, "raw value at " + sortedTime[interpInfo.index] + "h", this._numStr(data1));

 				if (t != 0)
					this._writeDebugLineWithHeader(true, "raw value at " + sortedTime[interpInfo.index + 1] + "h", this._numStr(data2));

				if (t != 0 && t != 1) {
					this._writeDebugLineWithHeader(true, "interpolate " + (t * 100).toFixed(2) + "%", 
						this._numStr(data1) + " + (" + this._numStr(data2) + " - " + this._numStr(data1) + ")" + " * " + this._numStr(t) + " = " + this._numStr(odMeasurement) + " L/gdw");
 				}

				this._writeDebugLineWithHeader(true, "empirical factor", " * " + this._numStr(odMagicFactor) + " = " + this._numStr(finalValue) + " L/gdw");
				this._writeDebugLine(true, "");
				this._debugOutputIndent--;
			}

			return finalValue;
		}


		// Returns the assay measurement that represents OD for the specified line.
		private _getOpticalDensityMeasurementForLine(lineID:number):number {
			var measurementID = this._opticalDensityMeasurementIDByLineID[lineID];
			if (typeof measurementID !== 'undefined') {
				return measurementID;
			} else {
				console.log("Warning! Unable to find OD measurement for " + EDDData.Lines[lineID].name);
				return -1;
			}
		}


		// This calculates the _validAssaysByLineID and _validMeasurementsByAssayID lists, which reduces clutter in all our looping code.
		private _precalculateValidLists():void {
			for (var lineID in EDDData.Lines) {
				var line:LineRecord = EDDData.Lines[lineID];
				if (!line.active) {
					continue;
				}
				this._validAssaysByLineID[lineID] = [];
			}

			// Go through all assays for all lines.
			for (var assayID in EDDData.Assays) {
				var assay:AssayRecord = EDDData.Assays[assayID];
				if (!assay.active) {
					continue;
				}
				// TypeScript lies - JavaScript always turns property names into strings.
				// Even if you do declare "var hash:{[id:number]:any[]}".
				// So yes, this produces correct results.
				if (!this._validAssaysByLineID.hasOwnProperty(assay.lid.toString())) {
					continue;
				}
				this._validAssaysByLineID[assay.lid].push(assayID);
				this._validMeasurementsByAssayID[assayID] = [];
			}

			// Go through all measurements in all assays.
			for (var measurementID in EDDData.AssayMeasurements) {
				var measurement:AssayMeasurementRecord = EDDData.AssayMeasurements[measurementID];
				if (measurement.dis) {
					continue;
				}
				if (!this._validMeasurementsByAssayID.hasOwnProperty(measurement.aid.toString())) {
					continue;
				}
				var assay:AssayRecord = EDDData.Assays[measurement.aid];
				if (!this._validAssaysByLineID.hasOwnProperty(assay.lid.toString())) {
					continue;
				}
				this._validMeasurementsByAssayID[measurement.aid].push(measurementID);

				// Update our _opticalDensityMeasurementIDByLineID lookup.
				var measurementType:MetaboliteTypeRecord = EDDData.MetaboliteTypes[measurement.mt];
				if (measurementType) {
					if (this._isOpticalDensityMeasurement(measurementType)) {
						this._opticalDensityMeasurementIDByLineID[assay.lid] = measurementID;
					}
				}
			}
		}


		// Precalculated lookups to speed things up.		
		private _validAssaysByLineID:{[lineID:number]:any[]} = {};			// An array of non-disabled assays for each line.
		private _validMeasurementsByAssayID:{[assayID:number]:any[]} = {};	// An array of non-disabled measurements for each assay.
		private _opticalDensityMeasurementIDByLineID:{[lineID:number]:number} = {};	// Lookup the OD measurement for each line.


		lineDataByID: {[lineID:number]:LineData} = {};		// Data for each line of type Summation.LineData.
		lastTimeInSeconds:number = 0;					// The highest time value that any TimeSample has.
																
		private _assayMeasurementDataByID:any;			// This is from converting the assay measurement list given
														// to us into a hash by timestamp.

		private _debugLineID:number = 0;
		private _debugTimeStamp:string;					// If this is set, then we'll be emitting debug HTML to _debugOutput.
		private _debugOutput:string;
		private _debugOutputIndent:number = 0;				// Auto tab on debug output.
	}



	// Class definition for elements in Summation.lineDataByID
	export class LineData {

		assaysByID:any = {};
		private _lineID:number;


		constructor(lineID:number) {
			this._lineID = lineID;
		}


		getLineID():number {
			return this._lineID;
		}


		// Return a list of AssayData structures that only
		// contain metabolite data for the specified time stamp.
		// (This will not return assays that don't have any metabolite data for this time stamp.)
		filterAssaysByTimeStamp(timeStamp: string): any {

			var filteredAssays = [];

			// Get all assays for this line.
			for (var assayID in this.assaysByID) {
				var assay:AssayData = this.assaysByID[assayID];

				var timelinesByMeasurementId:{[id:number]:MetaboliteTimeline} = {};
				var numAdded = 0;

				for (var measurementID in assay.timelinesByMeasurementId) {
					var timeline = assay.timelinesByMeasurementId[measurementID];

					var sample = timeline.findSampleByTimeStamp(timeStamp);
					if (sample) {
						var measurement = new MetaboliteTimeline(assay, measurementID);
						measurement.timeSamples.push(sample);
						timelinesByMeasurementId[measurementID] = measurement;
						++numAdded;
					}				
				}

				// If there were any measurements at this timestamp for this assay, then add this assay.
				if (numAdded > 0) {
					var outAssay = new AssayData(assayID);
					outAssay.timelinesByMeasurementId = timelinesByMeasurementId;
					filteredAssays.push(outAssay);
				}
			}

			return filteredAssays;

		}


		// Sum up all the in/out values across all metabolites at the specified timestamp.
		getInOutSumAtTime(timeStamp: string) : InOutSum {

			// Grab all the measurements.
			var measurements:InOutSumMeasurement[] = [];

			var totalIn = 0;
			var totalOut = 0;
			
			for (var assayID in this.assaysByID) {
				var assay:AssayData = this.assaysByID[assayID];

				for (var iTimeline in assay.timelinesByMeasurementId) {
					var measurement:InOutSumMeasurement = new InOutSumMeasurement();
					measurement.timeline = assay.timelinesByMeasurementId[iTimeline];

					measurement.carbonDelta = measurement.timeline.interpolateCarbonDelta(timeStamp);
					if (measurement.carbonDelta > 0)
						totalOut += measurement.carbonDelta;
					else
						totalIn -= measurement.carbonDelta;

					measurements.push(measurement);
				}
			}

			return new InOutSum(totalIn, totalOut, measurements);
		}
	}



	// This represents a baked-down version of the LineData/AssayData, where we've
	// summed up carbon data for all assays at each time point.
	export class MergedLineSamples {
		// Ordered by time stamp, these are the merged samples with carbon in/out data.
		mergedLineSamples:MergedLineSample[] = [];

		// This is a list of all timelines that were sampled to build the sums in mergedLineSamples.
		metaboliteTimelines:MetaboliteTimeline[] = [];
	}



	export class MergedLineSample {
		constructor(timeStamp:string) {
			this.timeStamp = timeStamp;
		}

		timeStamp:string = "";
		totalCarbonIn:number = 0;
		totalCarbonOut:number = 0;
	}



	export class InOutSum {
		constructor(public totalIn:number, public totalOut:number, public measurements:InOutSumMeasurement[]) {
		}
	}



	export class InOutSumMeasurement {
		timeline:MetaboliteTimeline;
		carbonDelta:number;

		absDelta():number { return Math.abs(this.carbonDelta); }
	}



	export class AssayData {

		timelinesByMeasurementId:{[measurementID:number]:MetaboliteTimeline} = {};

		constructor(public assayID: number) {
		}

		// Return a list of [measurementID, TimeSample] objects, one for each
		// measurement that has a sample at the specified time stamp.
		getTimeSamplesByTimeStamp(timeStamp:string) : any[] {
			var ret = [];

			for (var iTimeline in this.timelinesByMeasurementId) {
				var timeline = this.timelinesByMeasurementId[iTimeline];
				var sample = timeline.findSampleByTimeStamp(timeStamp);
				if (sample) {
					ret.push({
						measurementID: timeline.measurementID,
						timeSample: sample
					});
				}
			}

			return ret;
		}
	}



	export class MetaboliteTimeline {

		timeSamples:TimeSample[] = [];
	
		constructor(public assay:AssayData, public measurementID:number) {
			// Of type Summation.TimeSample. Sorted by timeStamp.
			// Note that sample 0's carbonDelta will be 0 since it has no previous measurement.
			this.timeSamples = [];
		}

		// This is the easiest function to call to get the carbon delta at a specific time.
		// If this timeline doesn't have a sample at that position, it'll interpolate between
		// the nearest two.
		interpolateCarbonDelta(timeStamp:string):number {
			if (this.timeSamples.length == 0)
				return 0;

			var timeStampNumber:number = parseFloat(timeStamp);

			// If the time stamp is before all our samples, just return our first sample's carbon delta.
			var prevSample = this.timeSamples[0];
			var prevSampleTime  = parseFloat(prevSample.timeStamp);
			if (timeStampNumber <= prevSampleTime)
				return this.timeSamples[0].carbonDelta;

			for (var i:number=1; i < this.timeSamples.length; i++) {
				var curSample:TimeSample = this.timeSamples[i];
				var curSampleTime:number = parseFloat(curSample.timeStamp);

				// Exact match?
				if (this.timeSamples[i].timeStamp == timeStamp)
					return this.timeSamples[i].carbonDelta;

				// If this time sample is between the prev/cur sample, then interpolate the carbon delta.
				if (timeStampNumber >= prevSampleTime && timeStampNumber <= curSampleTime)
					return Utl.JS.remapValue(timeStampNumber, prevSampleTime, curSampleTime, prevSample.carbonDelta, curSample.carbonDelta);

				prevSampleTime = curSampleTime;
				prevSample = curSample;
			}

			// The time stamp they passed in must be past all our samples.
			return this.timeSamples[this.timeSamples.length-1].carbonDelta;
		}

		// Return a TimeSample or null.
		findSampleByTimeStamp(timeStamp:string) : any {
			// Todo: We should probably speed this up with a hash.
			for (var i in this.timeSamples) {
				if (this.timeSamples[i].timeStamp == timeStamp)
					return this.timeSamples[i];
			}

			return null;
		}

	}



	// Data for a single line for a single point in time.
	export class TimeSample {

		timeStamp:string = "";		// in hours

		// ** NOTE: CmMol here means carbon milli-moles.
		carbonValue:number = 0;		// CmMol/L of carbon at this timestamp

		carbonDelta:number = 0;		// CmMol/gdw/hr
									// delta between this carbon value and the previous one (0 for the first entry)
									// POSITIVE means output (in that the organism outputted this metabolite for the time span in question)
									// NEGATIVE means input  (in that the organism reduced the amount of this metabolite for the time span)

		isInput() : boolean {
			return this.carbonDelta <= 0;
		}

		isOutput() : boolean {
			return this.carbonDelta > 0;
		}

		// Return the absolute value of carbonDelta. You'll need to use isInput() or isOutput()
		// to know which it represents.
		absDelta() : number {
			return Math.abs(this.carbonDelta);
		}

	}



	// Step 1 is where CarbonBalance.Summation builds a timeline for each line->assay->metabolite.
	// Step 2 is where this class merges all the assay->metabolite timelines into one timeline for each line.
	export class TimelineMerger {

		// Take the input LineData and sum up all measurements across all assays/metabolites
		// into a list of {timeStamp, totalCarbonIn, totalCarbonOut} objects (sorted by timeStamp).
		public static mergeAllLineSamples(lineData):MergedLineSamples {

			var mergedLineSamples:MergedLineSamples = new MergedLineSamples();

			// First, build a list of timestamps from "primary assays" (i.e. non-RAMOS assays).
			var validTimeStamps:{[i:string]:number} = {};

			for (var assayID in lineData.assaysByID) {
				var assay:AssayData = lineData.assaysByID[assayID];

				for (var measurementID in assay.timelinesByMeasurementId) {
					var timeline:MetaboliteTimeline = assay.timelinesByMeasurementId[measurementID];

					// Remember (in the MergedLineSamples structure that we're returning) that 
					// we're gonna use this metabolite's data for our CB sums.
					mergedLineSamples.metaboliteTimelines.push(timeline);

					// Only make new time stamp entries for "primary" assays.
					if (TimelineMerger._isPrimaryAssay(assay)) {
						for (var i in timeline.timeSamples) {
							validTimeStamps[timeline.timeSamples[i].timeStamp] = 1;
						}
					}
				}
			}

			var mergedSamples:{[index:string]:MergedLineSample;} = {};

			for (var timeStamp in validTimeStamps) {
				// Don't include anything at t=0 because there won't be a carbon delta.
				if (timeStamp == 0)
					continue;

				var outSample:MergedLineSample = new MergedLineSample(timeStamp);
				mergedSamples[timeStamp] = outSample;

				// Now generate a merged sample for each time sample across all assays for this line.
				for (var iTimeline in mergedLineSamples.metaboliteTimelines) {
					var timeline:MetaboliteTimeline = mergedLineSamples.metaboliteTimelines[iTimeline];
					var carbonDelta:number = timeline.interpolateCarbonDelta(timeStamp);

					if (carbonDelta > 0)
						outSample.totalCarbonOut += carbonDelta;
					else
						outSample.totalCarbonIn += -carbonDelta;
				}
			}


			// Convert the hash into a sorted list.
			var sortedSamples:MergedLineSample[] = Object.keys(mergedSamples).map( function(a) {return mergedSamples[a];} );
			sortedSamples.sort( (a:MergedLineSample, b:MergedLineSample) => {return parseFloat(a.timeStamp) - parseFloat(b.timeStamp);} );

			mergedLineSamples.mergedLineSamples = sortedSamples;
			return mergedLineSamples;
		}

		// Returns true if this is a "primary" assay, which means that we'll use it to generate
		// carbon balance time samples. A non-primary assay is something that generates a ton of 
		// samples like RAMOS.
		private static _isPrimaryAssay(assay:AssayData) {
			var serverAssayData:AssayRecord = EDDData.Assays[assay.assayID];
			var protocol:any = EDDData.Protocols[serverAssayData.pid];
			return (protocol.name != 'O2/CO2');							// TODO: Fragile
		}
	}

} // end module CarbonBalance
