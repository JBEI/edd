/// <reference path="typescript-declarations.d.ts" />
/// <reference path="Utl.ts" />
/// <reference path="CarbonSummation.ts" />
var CarbonBalance;
(function (CarbonBalance) {
    var ImbalancedTimeSample = (function () {
        function ImbalancedTimeSample(iTimeSample, normalizedError) {
            this.iTimeSample = iTimeSample;
            this.normalizedError = normalizedError;
        }
        return ImbalancedTimeSample;
    }());
    CarbonBalance.ImbalancedTimeSample = ImbalancedTimeSample;
    var Display = (function () {
        function Display() {
            this.allCBGraphs = [];
            this.mergedTimelinesByLineID = {};
            this.carbonSum = null;
            // See _calcNormalizedError.
            this._normalizedErrorThreshold = 0.1;
            this.POPUP_HEIGHT = 320;
            this.POPUP_SVG_HEIGHT = 280;
        }
        // Called as the page is loading to initialize and precalculate CB data.
        Display.prototype.calculateCarbonBalances = function (metabolicMapID, biomassCalculation) {
            this._metabolicMapID = metabolicMapID;
            this._biomassCalculation = biomassCalculation;
            // Calculate carbon balance sums.
            this.carbonSum = CarbonBalance.Summation.create(biomassCalculation);
            // Now build a structure for each line that merges all assay and metabolite data into one timeline.
            this.mergedTimelinesByLineID = {};
            for (var lineID in this.carbonSum.lineDataByID) {
                this.mergedTimelinesByLineID[lineID] = this.carbonSum.mergeAllLineSamples(this.carbonSum.lineDataByID[lineID]);
            }
        };
        Display.prototype.getDebugTextForTime = function (metabolicMapID, biomassCalculation, lineID, timeStamp) {
            return CarbonBalance.Summation.generateDebugText(biomassCalculation, lineID, timeStamp);
        };
        Display.prototype.getNumberOfImbalances = function () {
            var numImbalances = 0;
            for (var lineID in this.carbonSum.lineDataByID) {
                var imbalances = this._getTimeSamplesForLine(lineID, true);
                numImbalances += imbalances.length;
            }
            return numImbalances;
        };
        // Returns a 0-1 value telling how much carbonIn and carbonOut differ.
        //
        // A value greater than _normalizedErrorThreshold indicates that
        // we should treat it as a carbon imbalance and show it to the user.
        Display.prototype._calcNormalizedError = function (carbonIn, carbonOut) {
            var epsilon = 0.0001;
            if (Math.abs(carbonOut) <= epsilon && Math.abs(carbonIn) <= epsilon) {
                return 0; // Both are zero, so we'll say it's not out of balance.
            }
            // Get the percentage error.
            var normalizedError;
            if (carbonIn > carbonOut) {
                normalizedError = 1 - carbonOut / carbonIn;
            }
            else {
                normalizedError = 1 - carbonIn / carbonOut;
            }
            return normalizedError;
        };
        // Returns a list of ImbalancedTimeSample objects for this line.
        Display.prototype._getTimeSamplesForLine = function (lineID, imbalancedOnly) {
            var ret = [];
            // For each time sample that we have for this line, figure out which ones are imbalanced.
            var timeline = this.mergedTimelinesByLineID[lineID].mergedLineSamples;
            for (var iTimesample = 0; iTimesample < timeline.length; iTimesample++) {
                var timeSample = timeline[iTimesample];
                var normalizedError = this._calcNormalizedError(timeSample.totalCarbonIn, timeSample.totalCarbonOut);
                if (!imbalancedOnly || normalizedError > this._normalizedErrorThreshold) {
                    ret.push(new ImbalancedTimeSample(iTimesample, normalizedError));
                }
            }
            return ret;
        };
        // Called to create a single Line's CB graph.
        Display.prototype.createCBGraphForLine = function (lineID, parent) {
            //$(parent).css('padding', '3px 2px 0px 2px');
            var lineName = EDDData.Lines[lineID].name;
            // Add an SVG object with the graph data.
            var svgElement = Utl.SVG.createSVG('100%', '10px', 470, 10);
            // Put a thin line down the middle.
            var centerY = 5;
            svgElement.appendChild(Utl.SVG.createLine(0, centerY, 470, centerY, Utl.Color.rgba(160, 160, 160, 55), 1));
            // Now for each time sample that we have for this line, add a dot.
            var mergedLineSamples = this.mergedTimelinesByLineID[lineID];
            if (mergedLineSamples != null) {
                var timeline = mergedLineSamples.mergedLineSamples;
                var imbalances = this._getTimeSamplesForLine(lineID, false);
                for (var iImbalance in imbalances) {
                    var imbalance = imbalances[iImbalance];
                    var timeSample = timeline[imbalance.iTimeSample];
                    var normalizedError = imbalance.normalizedError;
                    var clr = Utl.Color.red;
                    clr.a = 35 + (normalizedError * 220);
                    var interpolatedColor = clr;
                    var xCoord = 470 * (timeSample.timeStamp / this.carbonSum.lastTimeInSeconds);
                    var yCoord = Math.floor(5);
                    var tickWidth = 8;
                    var tickMark = Utl.SVG.createVerticalLinePath(xCoord, yCoord, tickWidth, 10, interpolatedColor, svgElement);
                    //tickMark.onmouseover = this.onMouseOverTickMark.bind(this, lineID, timeSample.timeStamp, tickMark);
                    //tickMark.onmousedown = function() {console.log("mousedown");}
                    var obj = [lineID, timeSample.timeStamp];
                    tickMark._qtipInfo = $(tickMark).qtip({
                        content: {
                            title: this._generatePopupTitleForImbalance.bind(this, lineID, timeSample.timeStamp),
                            text: this._generatePopupDisplayForImbalance.bind(this, lineID, timeSample.timeStamp) // (using JS function currying here)
                        },
                        position: {
                            viewport: $(window) // This makes it position itself to fit inside the browser window.
                        },
                        style: {
                            classes: 'qtip-blue qtip-shadow qtip-rounded qtip-allow-large',
                            width: "280px",
                            height: "" + this.POPUP_HEIGHT + "px"
                        },
                        show: {
                            delay: 0,
                            solo: true
                        },
                        hide: {
                            fixed: true,
                            delay: 300
                        }
                    });
                }
            }
            // Add the SVG element to the document.
            parent.appendChild(svgElement);
            this.allCBGraphs.push(svgElement);
        };
        Display.prototype.removeAllCBGraphs = function () {
            for (var i in this.allCBGraphs) {
                var svg = this.allCBGraphs[i];
                svg.parentNode.removeChild(svg);
            }
            this.allCBGraphs = [];
        };
        // Lookup a metabolite's name by a measurement ID.
        Display.prototype._getMetaboliteNameByMeasurementID = function (measurementID) {
            var measurementTypeID = EDDData.AssayMeasurements[measurementID].type;
            var metaboliteName = EDDData.MetaboliteTypes[measurementTypeID].name;
            return metaboliteName;
        };
        // Used by _generateDebugTextForPopup to generate a list like:
        // == Inputs    (0.2434 Cmol/L)
        //     Formate : 0.2434
        Display.prototype._printCarbonBalanceList = function (header, list, showSum) {
            var padding = 10;
            // Total all the elements up.
            var text = header;
            if (showSum && list.length > 0) {
                var sum = list.reduce(function (p, c) { return p + Math.abs(c.carbonDelta); }, 0.0);
                text += Utl.JS.repeatString(' ', padding - header.length + 3) + "[" + sum.toFixed(4) + " CmMol/gdw/hr]";
            }
            text += "\n";
            var padding = 16;
            if (list.length == 0) {
                text += Utl.JS.padStringRight("(none)", padding) + "\n";
            }
            else {
                for (var i = 0; i < list.length; i++) {
                    var measurement = list[i];
                    // Get a padded name string for the metabolite
                    var name = this._getMetaboliteNameByMeasurementID(measurement.timeline.measureId);
                    // Rename "Optical Density" to biomass, since that's what we use it for.
                    if (name == 'Optical Density')
                        name = 'Biomass';
                    name = Utl.JS.padStringRight(name, padding);
                    // Get the assay's name
                    var assayRecord = EDDData.Assays[measurement.timeline.assay.assayId];
                    var lid = assayRecord.lid;
                    var pid = assayRecord.pid;
                    var assayName = [EDDData.Lines[lid].name, EDDData.Protocols[pid].name, assayRecord.name].join('-');
                    var numberString = Utl.JS.padStringRight(Math.abs(measurement.carbonDelta).toFixed(4), 8);
                    text += name + " : " + numberString + "    [" + assayName + "]" + "\n";
                }
            }
            return text;
        };
        // This is shown when they click the 'data' link in a carbon balance popup. It's intended
        // to show all the data that the assessment was based on.
        Display.prototype._generateDebugTextForPopup = function (lineID, timeStamp, balance) {
            var _this = this;
            var el = document.createElement('textarea');
            $(el).css('font-family', '"Lucida Console", Monaco, monospace');
            $(el).css('font-size', '8pt');
            el.setAttribute('wrap', 'off');
            var sortedList = balance.measurements.slice(0);
            sortedList.sort(function (a, b) { return a.carbonDelta - b.carbonDelta; });
            var prevTimeStamp = this._getPreviousMergedTimestamp(lineID, timeStamp);
            var title = EDDData.Lines[lineID].name + " from " + prevTimeStamp.toFixed(1) + "h to " + timeStamp.toFixed(1) + "h";
            var divider = "========================================\n";
            var text = title + "\n" + divider + "\n";
            text += this._printCarbonBalanceList("== Inputs", sortedList.filter(function (x) { return x.carbonDelta < 0; }), true) + "\n";
            text += this._printCarbonBalanceList("== Outputs", sortedList.filter(function (x) { return x.carbonDelta > 0; }), true) + "\n";
            text += this._printCarbonBalanceList("== No Delta", sortedList.filter(function (x) { return x.carbonDelta == 0; }), false) + "\n";
            // Show the summation details for this study.
            text += "\nDETAILS\n" + divider + "\n";
            var details = CarbonBalance.Summation.generateDebugText(this._biomassCalculation, lineID, timeStamp);
            text += details;
            // Show the biomass calculation for this study.
            text += "\nBIOMASS\n" + divider + "\n";
            text += "Biomass calculation: " + (+this._biomassCalculation).toFixed(4) + "\n";
            el.innerHTML = text;
            $(el).width(460);
            $(el).height(this.POPUP_SVG_HEIGHT);
            // Load up some more detailed stuff about the whole reaction.
            $.ajax({
                type: "POST",
                dataType: "json",
                url: "FormAjaxResp.cgi",
                data: { "action": "getBiomassCalculationInfo", metabolicMapID: this._metabolicMapID },
                success: function (response) {
                    if (response.type == "Success") {
                        el.innerHTML += _this._generateBiomassCalculationDebugText(response.data.biomass_calculation_info);
                    }
                    else {
                        console.log('Unable to get biomass calculation info: ' + response.message);
                    }
                }
            });
            return el;
        };
        // Using the structures in metabolic_maps.biomass_calculation_info, generate a string that shows 
        // all the species, metabolites, stoichiometries, and carbon counts used.
        // See schema.txt for the structure of biomass_calculation_info.
        Display.prototype._generateBiomassCalculationDebugText = function (biomass_calculation_info) {
            var bci = JSON.parse(biomass_calculation_info);
            var ret = '';
            ret += "Biomass reaction   : " + bci.reaction_id + "\n";
            ret += "\n== Reactants\n";
            ret += this._generateBiomassCalculationDebugTextForList(bci.reactants);
            ret += "\n== Products\n";
            ret += this._generateBiomassCalculationDebugTextForList(bci.products);
            return ret;
        };
        Display.prototype._generateBiomassCalculationDebugTextForList = function (theList) {
            var ret = '';
            for (var i = 0; i < theList.length; i++) {
                var entry = theList[i];
                if (entry.metaboliteName) {
                    var contribution = entry.stoichiometry * entry.carbonCount;
                    ret += "    " + Utl.JS.padStringRight(entry.speciesName, 15) + ": [" + Utl.JS.padStringLeft(contribution.toFixed(4), 9) + "]" +
                        "  { metabolite: " + entry.metaboliteName +
                        ", stoichiometry: " + entry.stoichiometry +
                        ", carbonCount: " + entry.carbonCount + " }" + "\n";
                }
                else {
                    ret += "    " + Utl.JS.padStringRight(entry.speciesName, 15) + ": [         ]" + "\n";
                }
            }
            return ret;
        };
        // Get the previous merged timestamp for the given line.
        // This is used to show the range that an imbalance occurred over (since we don't display it
        // anywhere on the timelines).
        Display.prototype._getPreviousMergedTimestamp = function (lineID, timeStamp) {
            var prevTimeStamp = 0;
            var samples = this.mergedTimelinesByLineID[lineID].mergedLineSamples;
            for (var i = 0; i < samples.length; i++) {
                if (samples[i].timeStamp == timeStamp)
                    break;
                else
                    prevTimeStamp = samples[i].timeStamp;
            }
            return prevTimeStamp;
        };
        // Generates the title bar string for a carbon balance popup display.
        Display.prototype._generatePopupTitleForImbalance = function (lineID, timeStamp) {
            var prevTimeStamp = this._getPreviousMergedTimestamp(lineID, timeStamp);
            return EDDData.Lines[lineID].name + " from " + prevTimeStamp.toFixed(1) + "h to " + timeStamp.toFixed(1) + "h";
        };
        // When they hover over a tick mark, we should display all the carbon in/out data for all 
        // assays that have an imbalance at this time point.
        // This generates the HTML that goes in the popup for a specific assay imbalance.
        Display.prototype._generatePopupDisplayForImbalance = function (lineID, timeStamp, event, api) {
            // Gather the data that we'll need.
            var balance = this._checkLineSampleBalance(lineID, timeStamp);
            // Create SVG to display everything in.
            var svgSize = [260, this.POPUP_SVG_HEIGHT];
            var svg = Utl.SVG.createSVG(svgSize[0] + 'px', svgSize[1] + 'px', svgSize[0], svgSize[1]);
            var yOffset = (this.POPUP_HEIGHT - svgSize[1]) / 2;
            var fontName = "Arial";
            // Create a link to copy debug text to the clipboard.
            var debugTextLink = svg.appendChild(Utl.SVG.createText(0, 10, "data", fontName, 10, false, Utl.Color.rgb(150, 150, 150)));
            debugTextLink.setAttribute('x', (svgSize[0] - 3).toString());
            debugTextLink.setAttribute('text-anchor', 'end');
            debugTextLink.setAttribute('alignment-baseline', 'hanging');
            debugTextLink.setAttribute('font-style', 'italic');
            $(debugTextLink).css('cursor', 'pointer');
            var helper = new Utl.QtipHelper();
            helper.create(debugTextLink, this._generateDebugTextForPopup.bind(this, lineID, timeStamp, balance), {
                position: {
                    my: 'bottom right',
                    at: 'top left'
                },
                style: {
                    classes: 'qtip-blue qtip-shadow qtip-rounded qtip-allow-large',
                    width: "550px",
                    height: "" + this.POPUP_HEIGHT + "px"
                },
                show: 'click',
                hide: 'unfocus'
            });
            // Figure out our vertical scale and layout parameters.
            var topPos = Math.floor(svgSize[1] * 0.1) + yOffset;
            var bottomPos = svgSize[1] - topPos + yOffset;
            var topPosValue = Math.max(balance.totalIn, balance.totalOut);
            var bottomPosValue = 0;
            var inputsBar = {
                left: Math.floor(svgSize[0] * 0.1),
                right: Math.floor(svgSize[0] * 0.4),
                currentValue: 0,
                curBar: 0,
                numBars: 0,
                startColor: Utl.Color.rgb(111, 102, 209),
                endColor: Utl.Color.rgb(38, 32, 124)
            };
            var outputsBar = {
                left: Math.floor(svgSize[0] * 0.6),
                right: Math.floor(svgSize[0] * 0.9),
                currentValue: 0,
                curBar: 0,
                numBars: 0,
                startColor: Utl.Color.rgb(219, 0, 126),
                endColor: Utl.Color.rgb(90, 0, 29)
            };
            // Get everything in a list sorted by height.
            var sortedList = [];
            for (var iMeasurement in balance.measurements) {
                sortedList.push(balance.measurements[iMeasurement]);
                var carbonDelta = balance.measurements[iMeasurement].carbonDelta;
                if (carbonDelta > 0)
                    outputsBar.numBars++;
                else
                    inputsBar.numBars++;
            }
            sortedList.sort(function (a, b) {
                return b.absDelta() - a.absDelta();
            });
            // Now build the stacks.
            var prevInValue = 0, prevOutValue = 0;
            for (var iMeasurement in sortedList) {
                var measurement = sortedList[iMeasurement];
                var carbonDelta = measurement.carbonDelta;
                var absDelta = Math.abs(carbonDelta);
                var bar = inputsBar;
                if (carbonDelta > 0)
                    bar = outputsBar;
                var nextValue = bar.currentValue + absDelta;
                var y1 = Utl.JS.remapValue(bar.currentValue, bottomPosValue, topPosValue, bottomPos, topPos);
                var y2 = Utl.JS.remapValue(nextValue, bottomPosValue, topPosValue, bottomPos, topPos);
                if (y1 - y2 <= 1)
                    y2 = y1 - 2;
                // The color just interpolates through this bar's color range.
                var clr = (bar.numBars <= 1) ? bar.startColor : Utl.Color.interpolate(bar.startColor, bar.endColor, bar.curBar / (bar.numBars - 1));
                var rect = svg.appendChild(Utl.SVG.createRect(bar.left, y1, bar.right - bar.left, y2 - y1, clr, // fill color
                1, Utl.Color.black // stroke info
                ));
                // Make it a rounded rectangle.
                var round = Math.min(2, Math.abs(y2 - y1));
                Utl.SVG.makeRectRounded(rect, round, round);
                // Add a tiny label showing the name of the metabolite.
                var measurementTypeID = EDDData.AssayMeasurements[measurement.timeline.measureId].type;
                var metaboliteName = EDDData.MetaboliteTypes[measurementTypeID].name;
                // Rename "Optical Density" to biomass, since that's what we use it for.
                if (metaboliteName == 'Optical Density')
                    metaboliteName = 'Biomass';
                // If there's room, put the label right in the box for the metabolite.
                // If not, put it off to the side.
                var metaboliteLabelFontSize = 11;
                if (y1 - y2 > metaboliteLabelFontSize * 1.2) {
                    var text = this._createTextWithDropShadow(svg, (bar.left + bar.right) / 2, (y1 + y2) / 2 + metaboliteLabelFontSize / 2, metaboliteName, fontName, metaboliteLabelFontSize, Utl.Color.white, Utl.Color.black);
                    $(text).css('font-weight', 'bold');
                }
                bar.curBar++;
                bar.currentValue = nextValue;
            }
            this._addSummaryLabels(svg, balance, inputsBar, outputsBar, topPos, topPosValue, bottomPos, bottomPosValue);
            return svg;
        };
        Display.prototype._createTextWithDropShadow = function (svg, x, y, text, font, fontSize, mainColor, shadowColor) {
            var ix = Math.floor(x);
            var iy = Math.floor(y);
            var el1 = svg.appendChild(Utl.SVG.createText(ix, iy, text, font, fontSize, true, shadowColor));
            var el2 = svg.appendChild(Utl.SVG.createText(ix, iy - 1, text, font, fontSize, true, mainColor));
            return $(el1).add(el2);
        };
        Display.prototype._addSummaryLabels = function (svg, balance, inputsBar, outputsBar, topPos, topPosValue, bottomPos, bottomPosValue) {
            // Put a label under each bar.
            var font = "Arial";
            var fontSize = 16;
            svg.appendChild(Utl.SVG.createText((inputsBar.left + inputsBar.right) * 0.5, bottomPos + fontSize, "Inputs", font, fontSize, true));
            svg.appendChild(Utl.SVG.createText((outputsBar.left + outputsBar.right) * 0.5, bottomPos + fontSize, "Outputs", font, fontSize, true));
            // Label the top of the chart's Cmol/L. That's enough to get a sense of the data, and we can 
            // provide further hover popups if we need to.
            var middleX = (inputsBar.right + outputsBar.left) / 2;
            var tShapeWidth = (outputsBar.left - inputsBar.right) - 6;
            var tShapeHeight = 5;
            this._drawTShape(svg, middleX, topPos, tShapeWidth, tShapeHeight, topPosValue.toFixed(2) + " CmMol/gdw/hr", font, 14, false);
            // Draw another indicator for the metabolite that has less.
            var smallerMetaboliteCmolLValue = Math.min(balance.totalIn, balance.totalOut);
            var smallerMetaboliteYPos = Utl.JS.remapValue(smallerMetaboliteCmolLValue, bottomPosValue, topPosValue, bottomPos, topPos);
            this._drawTShape(svg, middleX, smallerMetaboliteYPos, tShapeWidth * 0.8, tShapeHeight, smallerMetaboliteCmolLValue.toFixed(2), font, 14, true);
        };
        Display.prototype._drawTShape = function (svg, centerX, y, width, height, text, font, fontSize, textOnBottom) {
            var tShapeHeight = 5;
            // Break the text into multiple lines if necessary.
            var lines = text.split("\n");
            var curY = y - fontSize * lines.length;
            if (textOnBottom)
                curY = y + fontSize + tShapeHeight;
            for (var i in lines) {
                svg.appendChild(Utl.SVG.createText(centerX, curY, lines[i], font, fontSize, true));
                curY += fontSize;
            }
            var endOfT = (textOnBottom ? y + tShapeHeight : y - tShapeHeight);
            svg.appendChild(Utl.SVG.createLine(centerX, endOfT, centerX, y, Utl.Color.black));
            svg.appendChild(Utl.SVG.createLine(centerX - width / 2, y, centerX + width / 2, y, Utl.Color.black));
        };
        Display.prototype._checkLineSampleBalance = function (lineID, timeStamp) {
            var lineData = this.carbonSum.getLineDataByID(lineID);
            var sum = lineData.getInOutSumAtTime(timeStamp);
            // We need at least 2 measurements in order to register an imbalance.
            if (sum.measurements.length < 2)
                return null;
            var normalizedError = this._calcNormalizedError(sum.totalIn, sum.totalOut);
            return new LineSampleBalance((normalizedError < this._normalizedErrorThreshold), sum.totalIn, sum.totalOut, sum.measurements);
        };
        Display.graphDiv = null;
        return Display;
    }());
    CarbonBalance.Display = Display;
    ;
    var LineSampleBalance = (function () {
        function LineSampleBalance(isBalanced, totalIn, totalOut, measurements) {
            this.isBalanced = isBalanced;
            this.totalIn = totalIn;
            this.totalOut = totalOut;
            this.measurements = measurements;
        }
        return LineSampleBalance;
    }());
})(CarbonBalance || (CarbonBalance = {})); // end CarbonBalance module
