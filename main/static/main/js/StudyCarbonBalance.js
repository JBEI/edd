// File last modified on: Wed Dec 21 2016 14:53:35  
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiU3R1ZHlDYXJib25CYWxhbmNlLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiU3R1ZHlDYXJib25CYWxhbmNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLG9EQUFvRDtBQUNwRCxxREFBcUQ7QUFDckQsK0JBQStCO0FBQy9CLDJDQUEyQztBQUczQyxJQUFPLGFBQWEsQ0EybUJuQjtBQTNtQkQsV0FBTyxhQUFhLEVBQUMsQ0FBQztJQUVyQjtRQUVDLDhCQUFtQixXQUFrQixFQUFTLGVBQXNCO1lBQWpELGdCQUFXLEdBQVgsV0FBVyxDQUFPO1lBQVMsb0JBQWUsR0FBZixlQUFlLENBQU87UUFFcEUsQ0FBQztRQUNGLDJCQUFDO0lBQUQsQ0FBQyxBQUxELElBS0M7SUFMWSxrQ0FBb0IsdUJBS2hDLENBQUE7SUFFRDtRQUFBO1lBS0MsZ0JBQVcsR0FBRyxFQUFFLENBQUM7WUFDakIsNEJBQXVCLEdBQXVDLEVBQUUsQ0FBQztZQUNqRSxjQUFTLEdBQTJCLElBQUksQ0FBQztZQW1DekMsNEJBQTRCO1lBQ3BCLDhCQUF5QixHQUFVLEdBQUcsQ0FBQztZQTRIdkMsaUJBQVksR0FBRyxHQUFHLENBQUM7WUFDbkIscUJBQWdCLEdBQUcsR0FBRyxDQUFDO1FBa2JoQyxDQUFDO1FBaGxCQSx3RUFBd0U7UUFDeEUseUNBQXVCLEdBQXZCLFVBQXdCLGNBQXFCLEVBQUUsa0JBQXlCO1lBQ3ZFLElBQUksQ0FBQyxlQUFlLEdBQUcsY0FBYyxDQUFDO1lBQ3RDLElBQUksQ0FBQyxtQkFBbUIsR0FBRyxrQkFBa0IsQ0FBQztZQUM5QyxpQ0FBaUM7WUFDakMsSUFBSSxDQUFDLFNBQVMsR0FBRyxhQUFhLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO1lBRXBFLG1HQUFtRztZQUNuRyxJQUFJLENBQUMsdUJBQXVCLEdBQUcsRUFBRSxDQUFDO1lBQ2xDLEdBQUcsQ0FBQyxDQUFDLElBQUksTUFBTSxJQUFJLElBQUksQ0FBQyxTQUFTLENB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LENBQUMsRUEzbUJNLGFBQWEsS0FBYixhQUFhLFFBMm1CbkIsQ0FBQywyQkFBMkIiLCJzb3VyY2VzQ29udGVudCI6WyIvLyBGaWxlIGxhc3QgbW9kaWZpZWQgb246IFdlZCBEZWMgMjEgMjAxNiAxNDo1MzozNSAgXG4vLy8gPHJlZmVyZW5jZSBwYXRoPVwidHlwZXNjcmlwdC1kZWNsYXJhdGlvbnMuZC50c1wiIC8+XG4vLy8gPHJlZmVyZW5jZSBwYXRoPVwiVXRsLnRzXCIgLz5cbi8vLyA8cmVmZXJlbmNlIHBhdGg9XCJDYXJib25TdW1tYXRpb24udHNcIiAvPlxuXG5cbm1vZHVsZSBDYXJib25CYWxhbmNlIHtcblxuXHRleHBvcnQgY2xhc3MgSW1iYWxhbmNlZFRpbWVTYW1wbGVcblx0e1xuXHRcdGNvbnN0cnVjdG9yKHB1YmxpYyBpVGltZVNhbXBsZTpudW1iZXIsIHB1YmxpYyBub3JtYWxpemVkRXJyb3I6bnVtYmVyKSB7XG5cblx0XHR9XG5cdH1cblxuXHRleHBvcnQgY2xhc3MgRGlzcGxheSB7XG5cblx0XHRwcml2YXRlIF9tZXRhYm9saWNNYXBJRDpudW1iZXI7XG5cdFx0cHJpdmF0ZSBfYmlvbWFzc0NhbGN1bGF0aW9uOm51bWJlcjtcblx0XHRzdGF0aWMgZ3JhcGhEaXYgPSBudWxsO1xuXHRcdGFsbENCR3JhcGhzID0gW107XG5cdFx0bWVyZ2VkVGltZWxpbmVzQnlMaW5lSUQ6e1tsaW5lSUQ6bnVtYmVyXTpNZXJnZWRMaW5lU2FtcGxlc30gPSB7fTtcblx0XHRjYXJib25TdW06Q2FyYm9uQmFsYW5jZS5TdW1tYXRpb24gPSBudWxsO1xuXG5cblx0XHQvLyBDYWxsZWQgYXMgdGhlIHBhZ2UgaXMgbG9hZGluZyB0byBpbml0aWFsaXplIGFuZCBwcmVjYWxjdWxhdGUgQ0IgZGF0YS5cblx0XHRjYWxjdWxhdGVDYXJib25CYWxhbmNlcyhtZXRhYm9saWNNYXBJRDpudW1iZXIsIGJpb21hc3NDYWxjdWxhdGlvbjpudW1iZXIpIHtcblx0XHRcdHRoaXMuX21ldGFib2xpY01hcElEID0gbWV0YWJvbGljTWFwSUQ7IFxuXHRcdFx0dGhpcy5fYmlvbWFzc0NhbGN1bGF0aW9uID0gYmlvbWFzc0NhbGN1bGF0aW9uO1xuXHRcdFx0Ly8gQ2FsY3VsYXRlIGNhcmJvbiBiYWxhbmNlIHN1bXMuXG5cdFx0XHR0aGlzLmNhcmJvblN1bSA9IENhcmJvbkJhbGFuY2UuU3VtbWF0aW9uLmNyZWF0ZShiaW9tYXNzQ2FsY3VsYXRpb24pO1xuXG5cdFx0XHQvLyBOb3cgYnVpbGQgYSBzdHJ1Y3R1cmUgZm9yIGVhY2ggbGluZSB0aGF0IG1lcmdlcyBhbGwgYXNzYXkgYW5kIG1ldGFib2xpdGUgZGF0YSBpbnRvIG9uZSB0aW1lbGluZS5cblx0XHRcdHRoaXMubWVyZ2VkVGltZWxpbmVzQnlMaW5lSUQgPSB7fTtcblx0XHRcdGZvciAodmFyIGxpbmVJRCBpbiB0aGlzLmNhcmJvblN1bS5saW5lRGF0YUJ5SUQpIHtcblx0XHRcdFx0dGhpcy5tZXJnZWRUaW1lbGluZXNCeUxpbmVJRFtsaW5lSURdID0gdGhpcy5jYXJib25TdW0ubWVyZ2VBbGxMaW5lU2FtcGxlcyh0aGlzLmNhcmJvblN1bS5saW5lRGF0YUJ5SURbbGluZUlEXSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cblx0XHRnZXREZWJ1Z1RleHRGb3JUaW1lKG1ldGFib2xpY01hcElEOm51bWJlciwgYmlvbWFzc0NhbGN1bGF0aW9uOm51bWJlciwgbGluZUlEOm51bWJlciwgdGltZVN0YW1wOm51bWJlcik6c3RyaW5nIHtcblx0XHRcdHJldHVybiBDYXJib25CYWxhbmNlLlN1bW1hdGlvbi5nZW5lcmF0ZURlYnVnVGV4dChiaW9tYXNzQ2FsY3VsYXRpb24sIGxpbmVJRCwgdGltZVN0YW1wKTtcblx0XHR9XG5cblxuXHRcdGdldE51bWJlck9mSW1iYWxhbmNlcygpIHtcblx0XHRcdHZhciBudW1JbWJhbGFuY2VzID0gMDtcblxuXHRcdFx0Zm9yICh2YXIgbGluZUlEIGluIHRoaXMuY2FyYm9uU3VtLmxpbmVEYXRhQnlJRCkge1xuXHRcdCAgICBcdHZhciBpbWJhbGFuY2VzOkltYmFsYW5jZWRUaW1lU2FtcGxlW10gPSB0aGlzLl9nZXRUaW1lU2FtcGxlc0ZvckxpbmUobGluZUlELCB0cnVlKTtcblx0XHQgICAgXHRudW1JbWJhbGFuY2VzICs9IGltYmFsYW5jZXMubGVuZ3RoO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gbnVtSW1iYWxhbmNlcztcblx0XHR9XG5cblxuXHRcdC8vIFNlZSBfY2FsY05vcm1hbGl6ZWRFcnJvci5cblx0XHRwcml2YXRlIF9ub3JtYWxpemVkRXJyb3JUaHJlc2hvbGQ6bnVtYmVyID0gMC4xO1xuXG5cblx0XHQvLyBSZXR1cm5zIGEgMC0xIHZhbHVlIHRlbGxpbmcgaG93IG11Y2ggY2FyYm9uSW4gYW5kIGNhcmJvbk91dCBkaWZmZXIuXG5cdFx0Ly9cblx0XHQvLyBBIHZhbHVlIGdyZWF0ZXIgdGhhbiBfbm9ybWFsaXplZEVycm9yVGhyZXNob2xkIGluZGljYXRlcyB0aGF0XG5cdFx0Ly8gd2Ugc2hvdWxkIHRyZWF0IGl0IGFzIGEgY2FyYm9uIGltYmFsYW5jZSBhbmQgc2hvdyBpdCB0byB0aGUgdXNlci5cblx0XHRwcml2YXRlIF9jYWxjTm9ybWFsaXplZEVycm9yKGNhcmJvbkluOm51bWJlciwgY2FyYm9uT3V0Om51bWJlcik6bnVtYmVyIHtcblx0XHRcdHZhciBlcHNpbG9uOm51bWJlciA9IDAuMDAwMTtcbiAgICBcdFx0aWYgKE1hdGguYWJzKGNhcmJvbk91dCkgPD0gZXBzaWxvbiAmJiBNYXRoLmFicyhjYXJib25JbikgPD0gZXBzaWxvbikge1xuXHRcdFx0XHRyZXR1cm4gMDsgLy8gQm90aCBhcmUgemVybywgc28gd2UnbGwgc2F5IGl0J3Mgbm90IG91dCBvZiBiYWxhbmNlLlxuXHRcdFx0fVxuXG5cdFx0XHQvLyBHZXQgdGhlIHBlcmNlbnRhZ2UgZXJyb3IuXG5cdFx0XHR2YXIgbm9ybWFsaXplZEVycm9yOm51bWJlcjtcblx0XHRcdGlmIChjYXJib25JbiA+IGNhcmJvbk91dCkge1xuXHRcdFx0XHRub3JtYWxpemVkRXJyb3IgPSAxIC0gY2FyYm9uT3V0IC8gY2FyYm9uSW47XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRub3JtYWxpemVkRXJyb3IgPSAxIC0gY2FyYm9uSW4gLyBjYXJib25PdXQ7XG5cdFx0XHR9XG5cbiAgICBcdFx0cmV0dXJuIG5vcm1hbGl6ZWRFcnJvcjtcblx0XHR9XG5cblxuXHRcdC8vIFJldHVybnMgYSBsaXN0IG9mIEltYmFsYW5jZWRUaW1lU2FtcGxlIG9iamVjdHMgZm9yIHRoaXMgbGluZS5cblx0XHRwcml2YXRlIF9nZXRUaW1lU2FtcGxlc0ZvckxpbmUobGluZUlEOmFueSwgaW1iYWxhbmNlZE9ubHk6Ym9vbGVhbik6SW1iYWxhbmNlZFRpbWVTYW1wbGVbXSB7XG5cdFx0XHR2YXIgcmV0OkltYmFsYW5jZWRUaW1lU2FtcGxlW10gPSBbXTtcblxuXHQgICAgXHQvLyBGb3IgZWFjaCB0aW1lIHNhbXBsZSB0aGF0IHdlIGhhdmUgZm9yIHRoaXMgbGluZSwgZmlndXJlIG91dCB3aGljaCBvbmVzIGFyZSBpbWJhbGFuY2VkLlxuXHQgICAgXHR2YXIgdGltZWxpbmU6TWVyZ2VkTGluZVNhbXBsZVtdID0gdGhpcy5tZXJnZWRUaW1lbGluZXNCeUxpbmVJRFtsaW5lSURdLm1lcmdlZExpbmVTYW1wbGVzO1xuXHQgICAgXHRmb3IgKHZhciBpVGltZXNhbXBsZTpudW1iZXI9MDsgaVRpbWVzYW1wbGUgPCB0aW1lbGluZS5sZW5ndGg7IGlUaW1lc2FtcGxlKyspIHtcblx0ICAgIFx0XHR2YXIgdGltZVNhbXBsZTpNZXJnZWRMaW5lU2FtcGxlID0gdGltZWxpbmVbaVRpbWVzYW1wbGVdO1xuXG5cdCAgICBcdFx0dmFyIG5vcm1hbGl6ZWRFcnJvcjpudW1iZXIgPSB0aGlzLl9jYWxjTm9ybWFsaXplZEVycm9yKHRpbWVTYW1wbGUudG90YWxDYXJib25JbiwgdGltZVNhbXBsZS50b3RhbENhcmJvbk91dCk7XG5cblx0ICAgIFx0XHRpZiAoIWltYmFsYW5jZWRPbmx5IHx8IG5vcm1hbGl6ZWRFcnJvciA+IHRoaXMuX25vcm1hbGl6ZWRFcnJvclRocmVzaG9sZCkge1xuXHQgICAgXHRcdFx0cmV0LnB1c2goIG5ldyBJbWJhbGFuY2VkVGltZVNhbXBsZShpVGltZXNhbXBsZSwgbm9ybWFsaXplZEVycm9yKSApO1xuXHQgICAgXHRcdH1cblx0ICAgIFx0fVxuXHQgICAgXHRyZXR1cm4gcmV0O1xuXHRcdH1cblxuXG5cdFx0Ly8gQ2FsbGVkIHRvIGNyZWF0ZSBhIHNpbmdsZSBMaW5lJ3MgQ0IgZ3JhcGguXG5cdFx0Y3JlYXRlQ0JHcmFwaEZvckxpbmUobGluZUlELCBwYXJlbnQpIHtcblx0XHRcdC8vJChwYXJlbnQpLmNzcygncGFkZGluZycsICczcHggMnB4IDBweCAycHgnKTtcblxuXHRcdFx0dmFyIGxpbmVOYW1lID0gRURERGF0YS5MaW5lc1tsaW5lSURdLm5hbWU7XG5cblx0XHRcdC8vIEFkZCBhbiBTVkcgb2JqZWN0IHdpdGggdGhlIGdyYXBoIGRhdGEuXG5cdFx0XHR2YXIgc3ZnRWxlbWVudCA9IFV0bC5TVkcuY3JlYXRlU1ZHKCcxMDAlJywgJzEwcHgnLCA0NzAsIDEwKTtcblxuXHRcdFx0Ly8gUHV0IGEgdGhpbiBsaW5lIGRvd24gdGhlIG1pZGRsZS5cblx0XHRcdHZhciBjZW50ZXJZOm51bWJlciA9IDU7XG5cdFx0XHRzdmdFbGVtZW50LmFwcGVuZENoaWxkKCBVdGwuU1ZHLmNyZWF0ZUxpbmUoXG5cdFx0XHRcdDAsIGNlbnRlclksIDQ3MCwgY2VudGVyWSxcblx0XHRcdFx0VXRsLkNvbG9yLnJnYmEoMTYwLDE2MCwxNjAsNTUpLCAxXG5cdFx0XHQpKTtcblxuXHQgICAgXHQvLyBOb3cgZm9yIGVhY2ggdGltZSBzYW1wbGUgdGhhdCB3ZSBoYXZlIGZvciB0aGlzIGxpbmUsIGFkZCBhIGRvdC5cblx0ICAgIFx0dmFyIG1lcmdlZExpbmVTYW1wbGVzOk1lcmdlZExpbmVTYW1wbGVzID0gdGhpcy5tZXJnZWRUaW1lbGluZXNCeUxpbmVJRFtsaW5lSURdO1xuXHQgICAgXHRpZiAobWVyZ2VkTGluZVNhbXBsZXMgIT0gbnVsbCkge1xuXHRcdCAgICBcdHZhciB0aW1lbGluZTpNZXJnZWRMaW5lU2FtcGxlW10gPSBtZXJnZWRMaW5lU2FtcGxlcy5tZXJnZWRMaW5lU2FtcGxlcztcblx0XHQgICAgXHR2YXIgaW1iYWxhbmNlczpJbWJhbGFuY2VkVGltZVNhbXBsZVtdID0gdGhpcy5fZ2V0VGltZVNhbXBsZXNGb3JMaW5lKGxpbmVJRCwgZmFsc2UpO1xuXHRcdCAgICBcdGZvciAodmFyIGlJbWJhbGFuY2UgaW4gaW1iYWxhbmNlcykge1xuXHRcdCAgICBcdFx0dmFyIGltYmFsYW5jZSA9IGltYmFsYW5jZXNbaUltYmFsYW5jZV07XG5cdFx0ICAgIFx0XHR2YXIgdGltZVNhbXBsZTpNZXJnZWRMaW5lU2FtcGxlID0gdGltZWxpbmVbaW1iYWxhbmNlLmlUaW1lU2FtcGxlXTtcblx0XHQgICAgXHRcdHZhciBub3JtYWxpemVkRXJyb3IgPSBpbWJhbGFuY2Uubm9ybWFsaXplZEVycm9yO1xuXG5cdFx0ICAgIFx0XHR2YXIgY2xyOlV0bC5Db2xvciA9IFV0bC5Db2xvci5yZWQ7XG5cdFx0ICAgIFx0XHRjbHIuYSA9IDM1ICsgKG5vcm1hbGl6ZWRFcnJvciAqIDIyMCk7XG5cdFx0ICAgIFx0XHR2YXIgaW50ZXJwb2xhdGVkQ29sb3IgPSBjbHI7XG5cblx0XHQgICAgXHRcdHZhciB4Q29vcmQ6bnVtYmVyID0gNDcwICogKHRpbWVTYW1wbGUudGltZVN0YW1wIC8gdGhpcy5jYXJib25TdW0ubGFzdFRpbWVJblNlY29uZHMpO1xuXHRcdCAgICBcdFx0dmFyIHlDb29yZDpudW1iZXIgPSBNYXRoLmZsb29yKDUpO1xuXHRcdCAgICBcdFx0dmFyIHRpY2tXaWR0aDpudW1iZXIgPSA4O1xuXHRcdCAgICBcdFx0dmFyIHRpY2tNYXJrID0gPGFueT5VdGwuU1ZHLmNyZWF0ZVZlcnRpY2FsTGluZVBhdGgoeENvb3JkLCB5Q29vcmQsIHRpY2tXaWR0aCwgMTAsIGludGVycG9sYXRlZENvbG9yLCBzdmdFbGVtZW50KTtcblxuXHRcdCAgICBcdFx0Ly90aWNrTWFyay5vbm1vdXNlb3ZlciA9IHRoaXMub25Nb3VzZU92ZXJUaWNrTWFyay5iaW5kKHRoaXMsIGxpbmVJRCwgdGltZVNhbXBsZS50aW1lU3RhbXAsIHRpY2tNYXJrKTtcblx0XHQgICAgXHRcdC8vdGlja01hcmsub25tb3VzZWRvd24gPSBmdW5jdGlvbigpIHtjb25zb2xlLmxvZyhcIm1vdXNlZG93blwiKTt9XG5cblx0XHQgICAgXHRcdHZhciBvYmogPSBbbGluZUlELCB0aW1lU2FtcGxlLnRpbWVTdGFtcF07XG5cdFx0ICAgIFx0XHR0aWNrTWFyay5fcXRpcEluZm8gPSAkKHRpY2tNYXJrKS5xdGlwKHtcblx0XHQgICAgXHRcdFx0Y29udGVudDoge1xuXHRcdCAgICBcdFx0XHRcdHRpdGxlOiB0aGlzLl9nZW5lcmF0ZVBvcHVwVGl0bGVGb3JJbWJhbGFuY2UuYmluZCh0aGlzLCBsaW5lSUQsIHRpbWVTYW1wbGUudGltZVN0YW1wKSxcblx0XHQgICAgXHRcdFx0XHR0ZXh0OiB0aGlzLl9nZW5lcmF0ZVBvcHVwRGlzcGxheUZvckltYmFsYW5jZS5iaW5kKHRoaXMsIGxpbmVJRCwgdGltZVNhbXBsZS50aW1lU3RhbXApIC8vICh1c2luZyBKUyBmdW5jdGlvbiBjdXJyeWluZyBoZXJlKVxuXHRcdCAgICBcdFx0XHR9LFxuXHRcdCAgICBcdFx0XHRwb3NpdGlvbjoge1xuXHRcdFx0XHRcdFx0XHR2aWV3cG9ydDogJCh3aW5kb3cpXHQvLyBUaGlzIG1ha2VzIGl0IHBvc2l0aW9uIGl0c2VsZiB0byBmaXQgaW5zaWRlIHRoZSBicm93c2VyIHdpbmRvdy5cblx0XHQgICAgXHRcdFx0fSxcblx0XHQgICAgXHRcdFx0c3R5bGU6IHtcblx0XHRcdFx0XHQgICAgICAgIGNsYXNzZXM6ICdxdGlwLWJsdWUgcXRpcC1zaGFkb3cgcXRpcC1yb3VuZGVkIHF0aXAtYWxsb3ctbGFyZ2UnLFxuXHRcdFx0XHRcdCAgICAgICAgd2lkdGg6IFwiMjgwcHhcIixcblx0XHRcdFx0XHQgICAgICAgIGhlaWdodDogXCJcIiArIHRoaXMuUE9QVVBfSEVJR0hUICsgXCJweFwiXG5cdFx0XHRcdFx0ICAgIH0sXG5cdFx0XHRcdFx0ICAgIHNob3c6IHtcblx0XHRcdFx0XHQgICAgXHRkZWxheTogMCxcblx0XHRcdFx0XHQgICAgXHRzb2xvOiB0cnVlXG5cdFx0XHRcdFx0ICAgIH0sXG5cdFx0XHRcdFx0ICAgIGhpZGU6IHtcblx0XHRcdFx0XHQgICAgXHRmaXhlZDogdHJ1ZSxcblx0XHRcdFx0XHQgICAgXHRkZWxheTogMzAwXG5cdFx0XHRcdFx0ICAgIH1cblxuXHRcdCAgICBcdFx0fSk7XG5cdFx0ICAgIFx0fVxuXHRcdCAgICB9XG5cblx0ICAgIFx0Ly8gQWRkIHRoZSBTVkcgZWxlbWVudCB0byB0aGUgZG9jdW1lbnQuXG5cdCAgICBcdHBhcmVudC5hcHBlbmRDaGlsZChzdmdFbGVtZW50KTtcblx0ICAgIFx0dGhpcy5hbGxDQkdyYXBocy5wdXNoKHN2Z0VsZW1lbnQpO1xuXHRcdH1cblxuXG5cdFx0cmVtb3ZlQWxsQ0JHcmFwaHMoKSB7XG5cdFx0XHRmb3IgKHZhciBpIGluIHRoaXMuYWxsQ0JHcmFwaHMpIHtcblx0XHRcdFx0dmFyIHN2ZyA9IHRoaXMuYWxsQ0JHcmFwaHNbaV07XG5cdFx0XHRcdHN2Zy5wYXJlbnROb2RlLnJlbW92ZUNoaWxkKHN2Zyk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLmFsbENCR3JhcGhzID0gW107XG5cdFx0fVxuXG5cblx0XHRwcml2YXRlIFBPUFVQX0hFSUdIVCA9IDMyMDtcblx0XHRwcml2YXRlIFBPUFVQX1NWR19IRUlHSFQgPSAyODA7XG5cblx0XHQvLyBMb29rdXAgYSBtZXRhYm9saXRlJ3MgbmFtZSBieSBhIG1lYXN1cmVtZW50IElELlxuXHRcdHByaXZhdGUgX2dldE1ldGFib2xpdGVOYW1lQnlNZWFzdXJlbWVudElEKG1lYXN1cmVtZW50SUQ6bnVtYmVyKTpzdHJpbmcge1xuXHRcdFx0dmFyIG1lYXN1cmVtZW50VHlwZUlEOm51bWJlciA9IEVERERhdGEuQXNzYXlNZWFzdXJlbWVudHNbbWVhc3VyZW1lbnRJRF0udHlwZTtcblx0XHRcdHZhciBtZXRhYm9saXRlTmFtZTpzdHJpbmcgPSBFREREYXRhLk1ldGFib2xpdGVUeXBlc1ttZWFzdXJlbWVudFR5cGVJRF0ubmFtZTtcblx0XHRcdHJldHVybiBtZXRhYm9saXRlTmFtZTtcblx0XHR9XG5cblx0XHQvLyBVc2VkIGJ5IF9nZW5lcmF0ZURlYnVnVGV4dEZvclBvcHVwIHRvIGdlbmVyYXRlIGEgbGlzdCBsaWtlOlxuXHRcdC8vID09IElucHV0cyAgICAoMC4yNDM0IENtb2wvTClcblx0XHQvLyAgICAgRm9ybWF0ZSA6IDAuMjQzNFxuXHRcdHByaXZhdGUgX3ByaW50Q2FyYm9uQmFsYW5jZUxpc3QoaGVhZGVyOnN0cmluZywgbGlzdDpJbk91dFN1bU1lYXN1cmVtZW50W10sIHNob3dTdW06Ym9vbGVhbikge1xuXG5cdFx0XHR2YXIgcGFkZGluZzpudW1iZXIgPSAxMDtcblxuXHRcdFx0Ly8gVG90YWwgYWxsIHRoZSBlbGVtZW50cyB1cC5cblx0XHRcdHZhciB0ZXh0OnN0cmluZyA9IGhlYWRlcjtcblxuXHRcdFx0aWYgKHNob3dTdW0gJiYgbGlzdC5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdHZhciBzdW06bnVtYmVyID0gbGlzdC5yZWR1Y2UoIChwOm51bWJlcixjOkluT3V0U3VtTWVhc3VyZW1lbnQpID0+IHAgKyBNYXRoLmFicyhjLmNhcmJvbkRlbHRhKSwgMC4wICk7XG5cdFx0XHRcdHRleHQgKz0gVXRsLkpTLnJlcGVhdFN0cmluZygnICcsIHBhZGRpbmcgLSBoZWFkZXIubGVuZ3RoICsgMykgKyBcIltcIiArIHN1bS50b0ZpeGVkKDQpICsgXCIgQ21Nb2wvZ2R3L2hyXVwiO1xuXHRcdFx0fVxuXG5cdFx0XHR0ZXh0ICs9IFwiXFxuXCI7XG5cblx0XHRcdHZhciBwYWRkaW5nOm51bWJlciA9IDE2O1xuXG5cdFx0XHRpZiAobGlzdC5sZW5ndGggPT0gMCkge1xuXHRcdFx0XHR0ZXh0ICs9IFV0bC5KUy5wYWRTdHJpbmdSaWdodChcIihub25lKVwiLCBwYWRkaW5nKSArIFwiXFxuXCI7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRmb3IgKHZhciBpOm51bWJlcj0wOyBpIDwgbGlzdC5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRcdHZhciBtZWFzdXJlbWVudCA9IGxpc3RbaV07XG5cblx0XHRcdFx0XHQvLyBHZXQgYSBwYWRkZWQgbmFtZSBzdHJpbmcgZm9yIHRoZSBtZXRhYm9saXRlXG5cdFx0XHRcdFx0dmFyIG5hbWU6c3RyaW5nID0gdGhpcy5fZ2V0TWV0YWJvbGl0ZU5hbWVCeU1lYXN1cmVtZW50SUQobWVhc3VyZW1lbnQudGltZWxpbmUubWVhc3VyZUlkKTtcblx0XG5cdFx0XHRcdFx0Ly8gUmVuYW1lIFwiT3B0aWNhbCBEZW5zaXR5XCIgdG8gYmlvbWFzcywgc2luY2UgdGhhdCdzIHdoYXQgd2UgdXNlIGl0IGZvci5cblx0XHRcdFx0XHRpZiAobmFtZSA9PSAnT3B0aWNhbCBEZW5zaXR5Jylcblx0XHRcdFx0XHRcdG5hbWUgPSAnQmlvbWFzcyc7XG5cdFxuXHRcdFx0XHRcdG5hbWUgPSBVdGwuSlMucGFkU3RyaW5nUmlnaHQobmFtZSwgcGFkZGluZyk7XG5cblx0XHRcdFx0XHQvLyBHZXQgdGhlIGFzc2F5J3MgbmFtZVxuXHRcdFx0XHRcdHZhciBhc3NheVJlY29yZCA9IEVERERhdGEuQXNzYXlzW21lYXN1cmVtZW50LnRpbWVsaW5lLmFzc2F5LmFzc2F5SWRdO1xuXHRcdFx0ICAgIFx0dmFyIGxpZCA9IGFzc2F5UmVjb3JkLmxpZDtcblx0XHRcdCAgICBcdHZhciBwaWQgPSBhc3NheVJlY29yZC5waWQ7XG5cdFx0XHRcdFx0dmFyIGFzc2F5TmFtZTpzdHJpbmcgPSBbRURERGF0YS5MaW5lc1tsaWRdLm5hbWUsIEVERERhdGEuUHJvdG9jb2xzW3BpZF0ubmFtZSwgYXNzYXlSZWNvcmQubmFtZV0uam9pbignLScpO1xuXG5cdFx0XHRcdFx0dmFyIG51bWJlclN0cmluZzpzdHJpbmcgPSBVdGwuSlMucGFkU3RyaW5nUmlnaHQoTWF0aC5hYnMobWVhc3VyZW1lbnQuY2FyYm9uRGVsdGEpLnRvRml4ZWQoNCksIDgpO1xuXHRcdFx0XHRcdHRleHQgKz0gbmFtZSArIFwiIDogXCIgKyBudW1iZXJTdHJpbmcgKyBcIiAgICBbXCIgKyBhc3NheU5hbWUgKyBcIl1cIiArIFwiXFxuXCI7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHRleHQ7XG5cdFx0fVxuXG5cdFx0Ly8gVGhpcyBpcyBzaG93biB3aGVuIHRoZXkgY2xpY2sgdGhlICdkYXRhJyBsaW5rIGluIGEgY2FyYm9uIGJhbGFuY2UgcG9wdXAuIEl0J3MgaW50ZW5kZWRcblx0XHQvLyB0byBzaG93IGFsbCB0aGUgZGF0YSB0aGF0IHRoZSBhc3Nlc3NtZW50IHdhcyBiYXNlZCBvbi5cblx0XHRwcml2YXRlIF9nZW5lcmF0ZURlYnVnVGV4dEZvclBvcHVwKGxpbmVJRDpudW1iZXIsIHRpbWVTdGFtcDpudW1iZXIsIGJhbGFuY2U6TGluZVNhbXBsZUJhbGFuY2UpOkhUTUxFbGVtZW50IHtcblx0XHRcdHZhciBlbCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3RleHRhcmVhJyk7XG5cdFx0XHQkKGVsKS5jc3MoJ2ZvbnQtZmFtaWx5JywgJ1wiTHVjaWRhIENvbnNvbGVcIiwgTW9uYWNvLCBtb25vc3BhY2UnKTtcblx0XHRcdCQoZWwpLmNzcygnZm9udC1zaXplJywgJzhwdCcpO1xuXHRcdFx0ZWwuc2V0QXR0cmlidXRlKCd3cmFwJywnb2ZmJyk7XG5cblx0XHRcdHZhciBzb3J0ZWRMaXN0OkluT3V0U3VtTWVhc3VyZW1lbnRbXSA9IGJhbGFuY2UubWVhc3VyZW1lbnRzLnNsaWNlKDApO1xuXHRcdFx0c29ydGVkTGlzdC5zb3J0KCAoYSxiKSA9PiB7cmV0dXJuIGEuY2FyYm9uRGVsdGEgLSBiLmNhcmJvbkRlbHRhO30gKVxuXG5cdFx0XHR2YXIgcHJldlRpbWVTdGFtcDpudW1iZXIgPSB0aGlzLl9nZXRQcmV2aW91c01lcmdlZFRpbWVzdGFtcChsaW5lSUQsIHRpbWVTdGFtcCk7XG5cdFx0XHR2YXIgdGl0bGU6c3RyaW5nID0gRURERGF0YS5MaW5lc1tsaW5lSURdLm5hbWUgKyBcIiBmcm9tIFwiICsgcHJldlRpbWVTdGFtcC50b0ZpeGVkKDEpICsgXCJoIHRvIFwiICsgdGltZVN0YW1wLnRvRml4ZWQoMSkgKyBcImhcIjtcblxuXHRcdFx0dmFyIGRpdmlkZXIgPSBcIj09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cXG5cIjtcblx0XHRcdHZhciB0ZXh0ID0gdGl0bGUgKyBcIlxcblwiICsgZGl2aWRlciArIFwiXFxuXCI7XG5cblx0XHRcdHRleHQgKz0gdGhpcy5fcHJpbnRDYXJib25CYWxhbmNlTGlzdChcIj09IElucHV0c1wiLCBzb3J0ZWRMaXN0LmZpbHRlciggKHgpID0+IHguY2FyYm9uRGVsdGEgPCAwICksIHRydWUpICsgXCJcXG5cIjtcblx0XHRcdHRleHQgKz0gdGhpcy5fcHJpbnRDYXJib25CYWxhbmNlTGlzdChcIj09IE91dHB1dHNcIiwgc29ydGVkTGlzdC5maWx0ZXIoICh4KSA9PiB4LmNhcmJvbkRlbHRhID4gMCApLCB0cnVlKSArIFwiXFxuXCI7XG5cdFx0XHR0ZXh0ICs9IHRoaXMuX3ByaW50Q2FyYm9uQmFsYW5jZUxpc3QoXCI9PSBObyBEZWx0YVwiLCBzb3J0ZWRMaXN0LmZpbHRlciggKHgpID0+IHguY2FyYm9uRGVsdGEgPT0gMCApLCBmYWxzZSkgKyBcIlxcblwiO1xuXG5cdFx0XHQvLyBTaG93IHRoZSBzdW1tYXRpb24gZGV0YWlscyBmb3IgdGhpcyBzdHVkeS5cblx0XHRcdHRleHQgKz0gXCJcXG5ERVRBSUxTXFxuXCIgKyBkaXZpZGVyICsgXCJcXG5cIjtcblxuXHRcdFx0dmFyIGRldGFpbHM6c3RyaW5nID0gQ2FyYm9uQmFsYW5jZS5TdW1tYXRpb24uZ2VuZXJhdGVEZWJ1Z1RleHQoXG5cdFx0XHRcdHRoaXMuX2Jpb21hc3NDYWxjdWxhdGlvbixcblx0XHRcdFx0bGluZUlELFxuXHRcdFx0XHR0aW1lU3RhbXApO1xuXG5cdFx0XHR0ZXh0ICs9IGRldGFpbHM7XG5cblxuXHRcdFx0Ly8gU2hvdyB0aGUgYmlvbWFzcyBjYWxjdWxhdGlvbiBmb3IgdGhpcyBzdHVkeS5cblx0XHRcdHRleHQgKz0gXCJcXG5CSU9NQVNTXFxuXCIgKyBkaXZpZGVyICsgXCJcXG5cIjtcblx0XHRcdHRleHQgKz0gXCJCaW9tYXNzIGNhbGN1bGF0aW9uOiBcIiArICgrdGhpcy5fYmlvbWFzc0NhbGN1bGF0aW9uKS50b0ZpeGVkKDQpICsgXCJcXG5cIjtcblxuXHRcdFx0ZWwuaW5uZXJIVE1MID0gdGV4dDtcblxuXHRcdFx0JChlbCkud2lkdGgoNDYwKTtcblx0XHRcdCQoZWwpLmhlaWdodCh0aGlzLlBPUFVQX1NWR19IRUlHSFQpO1xuXG5cdFx0XHQvLyBMb2FkIHVwIHNvbWUgbW9yZSBkZXRhaWxlZCBzdHVmZiBhYm91dCB0aGUgd2hvbGUgcmVhY3Rpb24uXG5cdFx0XHQkLmFqYXgoe1xuXHRcdFx0XHR0eXBlOiBcIlBPU1RcIixcblx0XHRcdFx0ZGF0YVR5cGU6IFwianNvblwiLFxuXHRcdCAgICAgIFx0dXJsOiBcIkZvcm1BamF4UmVzcC5jZ2lcIiwgXG5cdFx0ICAgICAgXHRkYXRhOiB7IFwiYWN0aW9uXCI6XCJnZXRCaW9tYXNzQ2FsY3VsYXRpb25JbmZvXCIsIG1ldGFib2xpY01hcElEOnRoaXMuX21ldGFib2xpY01hcElEIH0sXG5cdFx0ICAgICAgXHRzdWNjZXNzOiAoIHJlc3BvbnNlOmFueSApID0+IHtcblx0XHQgICAgICBcdFx0aWYgKHJlc3BvbnNlLnR5cGUgPT0gXCJTdWNjZXNzXCIpIHtcblx0XHQgICAgICBcdFx0XHRlbC5pbm5lckhUTUwgKz0gdGhpcy5fZ2VuZXJhdGVCaW9tYXNzQ2FsY3VsYXRpb25EZWJ1Z1RleHQocmVzcG9uc2UuZGF0YS5iaW9tYXNzX2NhbGN1bGF0aW9uX2luZm8pO1xuXHRcdCAgICAgIFx0XHR9IGVsc2Uge1xuXHRcdCAgICAgIFx0XHRcdGNvbnNvbGUubG9nKCdVbmFibGUgdG8gZ2V0IGJpb21hc3MgY2FsY3VsYXRpb24gaW5mbzogJyArIHJlc3BvbnNlLm1lc3NhZ2UpO1xuXHRcdCAgICAgIFx0XHR9XG5cdFx0XHQgICAgfVxuXHRcdFx0fSk7XG5cblx0XHRcdHJldHVybiBlbDtcblx0XHR9XG5cblxuXHRcdC8vIFVzaW5nIHRoZSBzdHJ1Y3R1cmVzIGluIG1ldGFib2xpY19tYXBzLmJpb21hc3NfY2FsY3VsYXRpb25faW5mbywgZ2VuZXJhdGUgYSBzdHJpbmcgdGhhdCBzaG93cyBcblx0XHQvLyBhbGwgdGhlIHNwZWNpZXMsIG1ldGFib2xpdGVzLCBzdG9pY2hpb21ldHJpZXMsIGFuZCBjYXJib24gY291bnRzIHVzZWQuXG5cdFx0Ly8gU2VlIHNjaGVtYS50eHQgZm9yIHRoZSBzdHJ1Y3R1cmUgb2YgYmlvbWFzc19jYWxjdWxhdGlvbl9pbmZvLlxuXHRcdHByaXZhdGUgX2dlbmVyYXRlQmlvbWFzc0NhbGN1bGF0aW9uRGVidWdUZXh0KGJpb21hc3NfY2FsY3VsYXRpb25faW5mbzphbnkpOnN0cmluZyB7XG5cdFx0XHR2YXIgYmNpID0gSlNPTi5wYXJzZShiaW9tYXNzX2NhbGN1bGF0aW9uX2luZm8pO1xuXHRcdFx0dmFyIHJldDpzdHJpbmcgPSAnJztcblxuXHRcdFx0cmV0ICs9IFwiQmlvbWFzcyByZWFjdGlvbiAgIDogXCIgKyBiY2kucmVhY3Rpb25faWQgKyBcIlxcblwiO1xuXHRcdFx0cmV0ICs9IFwiXFxuPT0gUmVhY3RhbnRzXFxuXCI7XG5cdFx0XHRyZXQgKz0gdGhpcy5fZ2VuZXJhdGVCaW9tYXNzQ2FsY3VsYXRpb25EZWJ1Z1RleHRGb3JMaXN0KGJjaS5yZWFjdGFudHMpO1xuXG5cdFx0XHRyZXQgKz0gXCJcXG49PSBQcm9kdWN0c1xcblwiO1xuXHRcdFx0cmV0ICs9IHRoaXMuX2dlbmVyYXRlQmlvbWFzc0NhbGN1bGF0aW9uRGVidWdUZXh0Rm9yTGlzdChiY2kucHJvZHVjdHMpO1xuXG5cdFx0XHRyZXR1cm4gcmV0O1xuXHRcdH1cblxuXG5cdFx0cHJpdmF0ZSBfZ2VuZXJhdGVCaW9tYXNzQ2FsY3VsYXRpb25EZWJ1Z1RleHRGb3JMaXN0KHRoZUxpc3Q6YW55KTpzdHJpbmcge1xuXHRcdFx0dmFyIHJldDpzdHJpbmcgPSAnJztcblxuXHRcdFx0Zm9yICh2YXIgaT0wOyBpIDwgdGhlTGlzdC5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHR2YXIgZW50cnkgPSB0aGVMaXN0W2ldO1xuXG5cdFx0XHRcdGlmIChlbnRyeS5tZXRhYm9saXRlTmFtZSkge1xuXHRcdFx0XHRcdHZhciBjb250cmlidXRpb24gPSBlbnRyeS5zdG9pY2hpb21ldHJ5ICogZW50cnkuY2FyYm9uQ291bnQ7XG5cdFx0XHRcdFx0cmV0ICs9IFwiICAgIFwiICsgVXRsLkpTLnBhZFN0cmluZ1JpZ2h0KGVudHJ5LnNwZWNpZXNOYW1lLDE1KSArIFwiOiBbXCIgKyBVdGwuSlMucGFkU3RyaW5nTGVmdChjb250cmlidXRpb24udG9GaXhlZCg0KSwgOSkgKyBcIl1cIiArIFxuXHRcdFx0XHRcdFx0XCIgIHsgbWV0YWJvbGl0ZTogXCIgKyBlbnRyeS5tZXRhYm9saXRlTmFtZSArIFxuXHRcdFx0XHRcdFx0XCIsIHN0b2ljaGlvbWV0cnk6IFwiICsgZW50cnkuc3RvaWNoaW9tZXRyeSArIFxuXHRcdFx0XHRcdFx0XCIsIGNhcmJvbkNvdW50OiBcIiArIGVudHJ5LmNhcmJvbkNvdW50ICsgXCIgfVwiICsgXCJcXG5cIjtcblxuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHJldCArPSBcIiAgICBcIiArIFV0bC5KUy5wYWRTdHJpbmdSaWdodChlbnRyeS5zcGVjaWVzTmFtZSwxNSkgKyBcIjogWyAgICAgICAgIF1cIiArIFwiXFxuXCI7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHJldDtcblx0XHR9XG5cblxuXHRcdC8vIEdldCB0aGUgcHJldmlvdXMgbWVyZ2VkIHRpbWVzdGFtcCBmb3IgdGhlIGdpdmVuIGxpbmUuXG5cdFx0Ly8gVGhpcyBpcyB1c2VkIHRvIHNob3cgdGhlIHJhbmdlIHRoYXQgYW4gaW1iYWxhbmNlIG9jY3VycmVkIG92ZXIgKHNpbmNlIHdlIGRvbid0IGRpc3BsYXkgaXRcblx0XHQvLyBhbnl3aGVyZSBvbiB0aGUgdGltZWxpbmVzKS5cblx0XHRwcml2YXRlIF9nZXRQcmV2aW91c01lcmdlZFRpbWVzdGFtcChsaW5lSUQ6bnVtYmVyLCB0aW1lU3RhbXA6bnVtYmVyKSB7XG5cdFx0XHR2YXIgcHJldlRpbWVTdGFtcDpudW1iZXIgPSAwO1xuXHRcdFx0XG5cdFx0XHR2YXIgc2FtcGxlczpNZXJnZWRMaW5lU2FtcGxlW10gPSB0aGlzLm1lcmdlZFRpbWVsaW5lc0J5TGluZUlEW2xpbmVJRF0ubWVyZ2VkTGluZVNhbXBsZXM7XG5cdFx0XHRmb3IgKHZhciBpOm51bWJlcj0wOyBpIDwgc2FtcGxlcy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRpZiAoc2FtcGxlc1tpXS50aW1lU3RhbXAgPT0gdGltZVN0YW1wKVxuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRlbHNlXG5cdFx0XHRcdFx0cHJldlRpbWVTdGFtcCA9IHNhbXBsZXNbaV0udGltZVN0YW1wO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gcHJldlRpbWVTdGFtcDtcblx0XHR9XG5cblxuXHRcdC8vIEdlbmVyYXRlcyB0aGUgdGl0bGUgYmFyIHN0cmluZyBmb3IgYSBjYXJib24gYmFsYW5jZSBwb3B1cCBkaXNwbGF5LlxuXHRcdHByaXZhdGUgX2dlbmVyYXRlUG9wdXBUaXRsZUZvckltYmFsYW5jZShsaW5lSUQsIHRpbWVTdGFtcDpudW1iZXIpIHtcblx0XHRcdHZhciBwcmV2VGltZVN0YW1wOm51bWJlciA9IHRoaXMuX2dldFByZXZpb3VzTWVyZ2VkVGltZXN0YW1wKGxpbmVJRCwgdGltZVN0YW1wKTtcblx0XHRcdHJldHVybiBFREREYXRhLkxpbmVzW2xpbmVJRF0ubmFtZSArIFwiIGZyb20gXCIgKyBwcmV2VGltZVN0YW1wLnRvRml4ZWQoMSkgKyBcImggdG8gXCIgKyB0aW1lU3RhbXAudG9GaXhlZCgxKSArIFwiaFwiO1xuXHRcdH1cblxuXG5cdFx0Ly8gV2hlbiB0aGV5IGhvdmVyIG92ZXIgYSB0aWNrIG1hcmssIHdlIHNob3VsZCBkaXNwbGF5IGFsbCB0aGUgY2FyYm9uIGluL291dCBkYXRhIGZvciBhbGwgXG5cdFx0Ly8gYXNzYXlzIHRoYXQgaGF2ZSBhbiBpbWJhbGFuY2UgYXQgdGhpcyB0aW1lIHBvaW50LlxuXHRcdC8vIFRoaXMgZ2VuZXJhdGVzIHRoZSBIVE1MIHRoYXQgZ29lcyBpbiB0aGUgcG9wdXAgZm9yIGEgc3BlY2lmaWMgYXNzYXkgaW1iYWxhbmNlLlxuXHRcdHByaXZhdGUgX2dlbmVyYXRlUG9wdXBEaXNwbGF5Rm9ySW1iYWxhbmNlKGxpbmVJRCwgdGltZVN0YW1wLCBldmVudCwgYXBpKSB7XG5cblx0XHRcdC8vIEdhdGhlciB0aGUgZGF0YSB0aGF0IHdlJ2xsIG5lZWQuXG5cdFx0XHR2YXIgYmFsYW5jZTpMaW5lU2FtcGxlQmFsYW5jZSA9IHRoaXMuX2NoZWNrTGluZVNhbXBsZUJhbGFuY2UobGluZUlELCB0aW1lU3RhbXApO1xuXG5cdFx0XHQvLyBDcmVhdGUgU1ZHIHRvIGRpc3BsYXkgZXZlcnl0aGluZyBpbi5cblx0XHRcdHZhciBzdmdTaXplID0gWzI2MCwgdGhpcy5QT1BVUF9TVkdfSEVJR0hUXTtcblx0XHRcdHZhciBzdmcgPSBVdGwuU1ZHLmNyZWF0ZVNWRyhzdmdTaXplWzBdICsgJ3B4Jywgc3ZnU2l6ZVsxXSArICdweCcsIHN2Z1NpemVbMF0sIHN2Z1NpemVbMV0pO1xuXHRcdFx0dmFyIHlPZmZzZXQgPSAodGhpcy5QT1BVUF9IRUlHSFQgLSBzdmdTaXplWzFdKSAvIDI7XG5cblx0XHRcdHZhciBmb250TmFtZTpzdHJpbmcgPSBcIkFyaWFsXCI7XG5cblx0XHRcdC8vIENyZWF0ZSBhIGxpbmsgdG8gY29weSBkZWJ1ZyB0ZXh0IHRvIHRoZSBjbGlwYm9hcmQuXG5cdFx0XHR2YXIgZGVidWdUZXh0TGluayA9IDxTVkdFbGVtZW50PnN2Zy5hcHBlbmRDaGlsZChVdGwuU1ZHLmNyZWF0ZVRleHQoMCwgMTAsIFwiZGF0YVwiLCBmb250TmFtZSwgMTAsIGZhbHNlLCBVdGwuQ29sb3IucmdiKDE1MCwxNTAsMTUwKSkpO1xuXHRcdFx0ZGVidWdUZXh0TGluay5zZXRBdHRyaWJ1dGUoJ3gnLCAoc3ZnU2l6ZVswXSAtIDMpLnRvU3RyaW5nKCkpO1xuICAgXHRcdFx0ZGVidWdUZXh0TGluay5zZXRBdHRyaWJ1dGUoJ3RleHQtYW5jaG9yJywgJ2VuZCcpO1xuICAgXHRcdFx0ZGVidWdUZXh0TGluay5zZXRBdHRyaWJ1dGUoJ2FsaWdubWVudC1iYXNlbGluZScsICdoYW5naW5nJyk7XG4gICBcdFx0XHRkZWJ1Z1RleHRMaW5rLnNldEF0dHJpYnV0ZSgnZm9udC1zdHlsZScsICdpdGFsaWMnKTtcbiAgIFx0XHRcdCQoZGVidWdUZXh0TGluaykuY3NzKCdjdXJzb3InLCAncG9pbnRlcicpO1xuXG4gICBcdFx0XHR2YXIgaGVscGVyOlV0bC5RdGlwSGVscGVyID0gbmV3IFV0bC5RdGlwSGVscGVyKCk7XG4gICBcdFx0XHRoZWxwZXIuY3JlYXRlKGRlYnVnVGV4dExpbmssIHRoaXMuX2dlbmVyYXRlRGVidWdUZXh0Rm9yUG9wdXAuYmluZCh0aGlzLCBsaW5lSUQsIHRpbWVTdGFtcCwgYmFsYW5jZSksXG4gICBcdFx0XHRcdHtcblx0ICAgIFx0XHRcdHBvc2l0aW9uOiB7XG5cdCAgICBcdFx0XHRcdG15OiAnYm90dG9tIHJpZ2h0Jyxcblx0ICAgIFx0XHRcdFx0YXQ6ICd0b3AgbGVmdCdcblx0ICAgIFx0XHRcdH0sXG5cdCAgICBcdFx0XHRzdHlsZToge1xuXHRcdFx0XHQgICAgICAgIGNsYXNzZXM6ICdxdGlwLWJsdWUgcXRpcC1zaGFkb3cgcXRpcC1yb3VuZGVkIHF0aXAtYWxsb3ctbGFyZ2UnLFxuXHRcdFx0XHQgICAgICAgIHdpZHRoOiBcIjU1MHB4XCIsXG5cdFx0XHRcdCAgICAgICAgaGVpZ2h0OiBcIlwiICsgdGhpcy5QT1BVUF9IRUlHSFQgKyBcInB4XCJcblx0XHRcdFx0ICAgIH0sXG5cdFx0XHRcdCAgICBzaG93OiAnY2xpY2snLFxuXHRcdFx0XHQgICAgaGlkZTogJ3VuZm9jdXMnXG5cdCAgICBcdFx0fSk7XG5cblx0XHRcdC8vIEZpZ3VyZSBvdXQgb3VyIHZlcnRpY2FsIHNjYWxlIGFuZCBsYXlvdXQgcGFyYW1ldGVycy5cblx0XHRcdHZhciB0b3BQb3MgPSBNYXRoLmZsb29yKHN2Z1NpemVbMV0gKiAwLjEpICsgeU9mZnNldDtcblx0XHRcdHZhciBib3R0b21Qb3MgPSBzdmdTaXplWzFdIC0gdG9wUG9zICsgeU9mZnNldDtcblxuXHRcdFx0dmFyIHRvcFBvc1ZhbHVlID0gTWF0aC5tYXgoYmFsYW5jZS50b3RhbEluLCBiYWxhbmNlLnRvdGFsT3V0KTtcblx0XHRcdHZhciBib3R0b21Qb3NWYWx1ZSA9IDA7XG5cblx0XHRcdHZhciBpbnB1dHNCYXIgPSB7XG5cdFx0XHRcdGxlZnQ6ICBNYXRoLmZsb29yKHN2Z1NpemVbMF0gKiAwLjEpLFxuXHRcdFx0XHRyaWdodDogTWF0aC5mbG9vcihzdmdTaXplWzBdICogMC40KSxcblx0XHRcdFx0Y3VycmVudFZhbHVlOiAwLFxuXHRcdFx0XHRjdXJCYXI6IDAsXG5cdFx0XHRcdG51bUJhcnM6IDAsXG5cdFx0XHRcdHN0YXJ0Q29sb3I6IFV0bC5Db2xvci5yZ2IoMTExLDEwMiwyMDkpLCBcblx0XHRcdFx0ZW5kQ29sb3I6IFV0bC5Db2xvci5yZ2IoMzgsMzIsMTI0KVxuXHRcdFx0fTtcblxuXHRcdFx0dmFyIG91dHB1dHNCYXIgPSB7XG5cdFx0XHRcdGxlZnQ6ICBNYXRoLmZsb29yKHN2Z1NpemVbMF0gKiAwLjYpLFxuXHRcdFx0XHRyaWdodDogTWF0aC5mbG9vcihzdmdTaXplWzBdICogMC45KSxcblx0XHRcdFx0Y3VycmVudFZhbHVlOiAwLFxuXHRcdFx0XHRjdXJCYXI6IDAsXG5cdFx0XHRcdG51bUJhcnM6IDAsXG5cdFx0XHRcdHN0YXJ0Q29sb3I6IFV0bC5Db2xvci5yZ2IoMjE5LDAsMTI2KSwgXG5cdFx0XHRcdGVuZENvbG9yOiBVdGwuQ29sb3IucmdiKDkwLDAsMjkpXG5cdFx0XHR9O1xuXG5cdFx0XHQvLyBHZXQgZXZlcnl0aGluZyBpbiBhIGxpc3Qgc29ydGVkIGJ5IGhlaWdodC5cblx0XHRcdHZhciBzb3J0ZWRMaXN0OkluT3V0U3VtTWVhc3VyZW1lbnRbXSA9IFtdO1xuXHRcdFx0Zm9yICh2YXIgaU1lYXN1cmVtZW50IGluIGJhbGFuY2UubWVhc3VyZW1lbnRzKSB7XG5cdFx0XHRcdHNvcnRlZExpc3QucHVzaCggYmFsYW5jZS5tZWFzdXJlbWVudHNbaU1lYXN1cmVtZW50XSApO1xuXHRcdFx0XHR2YXIgY2FyYm9uRGVsdGE6bnVtYmVyID0gYmFsYW5jZS5tZWFzdXJlbWVudHNbaU1lYXN1cmVtZW50XS5jYXJib25EZWx0YTtcblx0XHRcdFx0aWYgKGNhcmJvbkRlbHRhID4gMClcblx0XHRcdFx0XHRvdXRwdXRzQmFyLm51bUJhcnMrKztcblx0XHRcdFx0ZWxzZVxuXHRcdFx0XHRcdGlucHV0c0Jhci5udW1CYXJzKys7XG5cdFx0XHR9XG5cblx0XHRcdHNvcnRlZExpc3Quc29ydCggZnVuY3Rpb24oYSxiKSB7XG5cdFx0XHRcdHJldHVybiBiLmFic0RlbHRhKCkgLSBhLmFic0RlbHRhKCk7XG5cdFx0XHR9KTtcblxuXG5cdFx0XHQvLyBOb3cgYnVpbGQgdGhlIHN0YWNrcy5cblx0XHRcdHZhciBwcmV2SW5WYWx1ZSA9IDAsIHByZXZPdXRWYWx1ZSA9IDA7XG5cdFx0XHRmb3IgKHZhciBpTWVhc3VyZW1lbnQgaW4gc29ydGVkTGlzdCkge1xuXHRcdFx0XHR2YXIgbWVhc3VyZW1lbnQgPSBzb3J0ZWRMaXN0W2lNZWFzdXJlbWVudF07XG5cblx0XHRcdFx0dmFyIGNhcmJvbkRlbHRhOm51bWJlciA9IG1lYXN1cmVtZW50LmNhcmJvbkRlbHRhO1xuXHRcdFx0XHR2YXIgYWJzRGVsdGE6bnVtYmVyID0gTWF0aC5hYnMoY2FyYm9uRGVsdGEpO1xuXG5cdFx0XHRcdHZhciBiYXIgPSBpbnB1dHNCYXI7XG5cdFx0XHRcdGlmIChjYXJib25EZWx0YSA+IDApXG5cdFx0XHRcdFx0YmFyID0gb3V0cHV0c0JhcjtcblxuXHRcdFx0XHR2YXIgbmV4dFZhbHVlID0gYmFyLmN1cnJlbnRWYWx1ZSArIGFic0RlbHRhO1xuXHRcdFx0XHR2YXIgeTEgPSBVdGwuSlMucmVtYXBWYWx1ZShiYXIuY3VycmVudFZhbHVlLCBib3R0b21Qb3NWYWx1ZSwgdG9wUG9zVmFsdWUsIGJvdHRvbVBvcywgdG9wUG9zKTtcblx0XHRcdFx0dmFyIHkyID0gVXRsLkpTLnJlbWFwVmFsdWUobmV4dFZhbHVlLCAgICAgICAgYm90dG9tUG9zVmFsdWUsIHRvcFBvc1ZhbHVlLCBib3R0b21Qb3MsIHRvcFBvcyk7XG5cdFx0XHRcdGlmICh5MS15MiA8PSAxKVxuXHRcdFx0XHRcdHkyID0geTEgLSAyO1xuXG5cdFx0XHRcdC8vIFRoZSBjb2xvciBqdXN0IGludGVycG9sYXRlcyB0aHJvdWdoIHRoaXMgYmFyJ3MgY29sb3IgcmFuZ2UuXG5cdFx0XHRcdHZhciBjbHIgPSAoYmFyLm51bUJhcnMgPD0gMSkgPyBiYXIuc3RhcnRDb2xvciA6IFV0bC5Db2xvci5pbnRlcnBvbGF0ZShiYXIuc3RhcnRDb2xvciwgYmFyLmVuZENvbG9yLCBiYXIuY3VyQmFyIC8gKGJhci5udW1CYXJzLTEpKTtcblxuXHRcdFx0XHR2YXIgcmVjdCA9IHN2Zy5hcHBlbmRDaGlsZCggVXRsLlNWRy5jcmVhdGVSZWN0KGJhci5sZWZ0LCB5MSwgYmFyLnJpZ2h0LWJhci5sZWZ0LCB5Mi15MSwgXG5cdFx0XHRcdFx0Y2xyLCBcdC8vIGZpbGwgY29sb3Jcblx0XHRcdFx0XHQxLCBVdGwuQ29sb3IuYmxhY2sgLy8gc3Ryb2tlIGluZm9cblx0XHRcdFx0KSk7XG5cblx0XHRcdFx0Ly8gTWFrZSBpdCBhIHJvdW5kZWQgcmVjdGFuZ2xlLlxuXHRcdFx0XHR2YXIgcm91bmQgPSBNYXRoLm1pbigyLCBNYXRoLmFicyh5Mi15MSkpO1xuXHRcdFx0XHRVdGwuU1ZHLm1ha2VSZWN0Um91bmRlZChyZWN0LCByb3VuZCwgcm91bmQpO1xuXG5cdFx0XHRcdC8vIEFkZCBhIHRpbnkgbGFiZWwgc2hvd2luZyB0aGUgbmFtZSBvZiB0aGUgbWV0YWJvbGl0ZS5cblx0XHRcdFx0dmFyIG1lYXN1cmVtZW50VHlwZUlEID0gRURERGF0YS5Bc3NheU1lYXN1cmVtZW50c1ttZWFzdXJlbWVudC50aW1lbGluZS5tZWFzdXJlSWRdLnR5cGU7XG5cdFx0XHRcdHZhciBtZXRhYm9saXRlTmFtZSA9IEVERERhdGEuTWV0YWJvbGl0ZVR5cGVzW21lYXN1cmVtZW50VHlwZUlEXS5uYW1lO1xuXG5cdFx0XHRcdC8vIFJlbmFtZSBcIk9wdGljYWwgRGVuc2l0eVwiIHRvIGJpb21hc3MsIHNpbmNlIHRoYXQncyB3aGF0IHdlIHVzZSBpdCBmb3IuXG5cdFx0XHRcdGlmIChtZXRhYm9saXRlTmFtZSA9PSAnT3B0aWNhbCBEZW5zaXR5Jylcblx0XHRcdFx0XHRtZXRhYm9saXRlTmFtZSA9ICdCaW9tYXNzJztcblxuXHRcdFx0XHQvLyBJZiB0aGVyZSdzIHJvb20sIHB1dCB0aGUgbGFiZWwgcmlnaHQgaW4gdGhlIGJveCBmb3IgdGhlIG1ldGFib2xpdGUuXG5cdFx0XHRcdC8vIElmIG5vdCwgcHV0IGl0IG9mZiB0byB0aGUgc2lkZS5cblx0XHRcdFx0dmFyIG1ldGFib2xpdGVMYWJlbEZvbnRTaXplID0gMTE7XG5cdFx0XHRcdGlmICh5MS15MiA+IG1ldGFib2xpdGVMYWJlbEZvbnRTaXplKjEuMikge1xuXHRcdFx0XHRcdHZhciB0ZXh0ID0gdGhpcy5fY3JlYXRlVGV4dFdpdGhEcm9wU2hhZG93KHN2Zyxcblx0XHRcdFx0XHRcdChiYXIubGVmdCArIGJhci5yaWdodCkgLyAyLFxuXHRcdFx0XHRcdFx0KHkxICsgeTIpIC8gMiArIG1ldGFib2xpdGVMYWJlbEZvbnRTaXplLzIsXG5cdFx0XHRcdFx0XHRtZXRhYm9saXRlTmFtZSxcblx0XHRcdFx0XHRcdGZvbnROYW1lLCBtZXRhYm9saXRlTGFiZWxGb250U2l6ZSxcblx0XHRcdFx0XHRcdFV0bC5Db2xvci53aGl0ZSwgVXRsLkNvbG9yLmJsYWNrXG5cdFx0XHRcdFx0KTtcblxuXHRcdFx0XHRcdCQodGV4dCkuY3NzKCdmb250LXdlaWdodCcsICdib2xkJyk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRiYXIuY3VyQmFyKys7XG5cdFx0XHRcdGJhci5jdXJyZW50VmFsdWUgPSBuZXh0VmFsdWU7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX2FkZFN1bW1hcnlMYWJlbHMoc3ZnLCBiYWxhbmNlLCBpbnB1dHNCYXIsIG91dHB1dHNCYXIsIHRvcFBvcywgdG9wUG9zVmFsdWUsIGJvdHRvbVBvcywgYm90dG9tUG9zVmFsdWUpO1xuXG5cdFx0XHRyZXR1cm4gc3ZnO1xuXHRcdH1cblxuXHRcdHByaXZhdGUgX2NyZWF0ZVRleHRXaXRoRHJvcFNoYWRvdyhzdmcsIHgsIHksIHRleHQsIGZvbnQsIGZvbnRTaXplLCBtYWluQ29sb3IsIHNoYWRvd0NvbG9yKSB7XG5cdFx0XHR2YXIgaXggPSBNYXRoLmZsb29yKHgpO1xuXHRcdFx0dmFyIGl5ID0gTWF0aC5mbG9vcih5KTtcblxuXHRcdFx0dmFyIGVsMSA9IHN2Zy5hcHBlbmRDaGlsZCggVXRsLlNWRy5jcmVhdGVUZXh0KCBpeCwgaXksIHRleHQsIGZvbnQsIGZvbnRTaXplLCB0cnVlLCBzaGFkb3dDb2xvciApICk7XG5cdFx0XHR2YXIgZWwyID0gc3ZnLmFwcGVuZENoaWxkKCBVdGwuU1ZHLmNyZWF0ZVRleHQoIGl4LCBpeS0xLCB0ZXh0LCBmb250LCBmb250U2l6ZSwgdHJ1ZSwgbWFpbkNvbG9yICkgKTtcblx0XHRcdHJldHVybiAkKGVsMSkuYWRkKGVsMik7XG5cdFx0fVxuXG5cdFx0cHJpdmF0ZSBfYWRkU3VtbWFyeUxhYmVscyhzdmcsIGJhbGFuY2UsIGlucHV0c0Jhciwgb3V0cHV0c0JhciwgdG9wUG9zLCB0b3BQb3NWYWx1ZSwgYm90dG9tUG9zLCBib3R0b21Qb3NWYWx1ZSkge1xuXG5cdFx0XHQvLyBQdXQgYSBsYWJlbCB1bmRlciBlYWNoIGJhci5cblx0XHRcdHZhciBmb250ID0gXCJBcmlhbFwiO1xuXHRcdFx0dmFyIGZvbnRTaXplID0gMTY7XG5cblx0XHRcdHN2Zy5hcHBlbmRDaGlsZCggVXRsLlNWRy5jcmVhdGVUZXh0KCBcblx0XHRcdFx0KGlucHV0c0Jhci5sZWZ0ICsgaW5wdXRzQmFyLnJpZ2h0KSAqIDAuNSxcblx0XHRcdFx0Ym90dG9tUG9zICsgZm9udFNpemUsXG5cdFx0XHRcdFwiSW5wdXRzXCIsXG5cdFx0XHRcdGZvbnQsIGZvbnRTaXplLFxuXHRcdFx0XHR0cnVlXG5cdFx0XHQpKTtcblxuXHRcdFx0c3ZnLmFwcGVuZENoaWxkKCBVdGwuU1ZHLmNyZWF0ZVRleHQoIFxuXHRcdFx0XHQob3V0cHV0c0Jhci5sZWZ0ICsgb3V0cHV0c0Jhci5yaWdodCkgKiAwLjUsXG5cdFx0XHRcdGJvdHRvbVBvcyArIGZvbnRTaXplLFxuXHRcdFx0XHRcIk91dHB1dHNcIixcblx0XHRcdFx0Zm9udCwgZm9udFNpemUsXG5cdFx0XHRcdHRydWVcblx0XHRcdCkpO1xuXG5cdFx0XHQvLyBMYWJlbCB0aGUgdG9wIG9mIHRoZSBjaGFydCdzIENtb2wvTC4gVGhhdCdzIGVub3VnaCB0byBnZXQgYSBzZW5zZSBvZiB0aGUgZGF0YSwgYW5kIHdlIGNhbiBcblx0XHRcdC8vIHByb3ZpZGUgZnVydGhlciBob3ZlciBwb3B1cHMgaWYgd2UgbmVlZCB0by5cblx0XHRcdHZhciBtaWRkbGVYID0gKGlucHV0c0Jhci5yaWdodCArIG91dHB1dHNCYXIubGVmdCkgLyAyO1xuXHRcdFx0dmFyIHRTaGFwZVdpZHRoID0gKG91dHB1dHNCYXIubGVmdCAtIGlucHV0c0Jhci5yaWdodCkgLSA2O1xuXHRcdFx0dmFyIHRTaGFwZUhlaWdodCA9IDU7XG5cdFx0XHR0aGlzLl9kcmF3VFNoYXBlKHN2ZywgbWlkZGxlWCwgdG9wUG9zLCBcblx0XHRcdFx0dFNoYXBlV2lkdGgsIHRTaGFwZUhlaWdodCwgXG5cdFx0XHRcdHRvcFBvc1ZhbHVlLnRvRml4ZWQoMikgKyBcIiBDbU1vbC9nZHcvaHJcIiwgZm9udCwgMTQsXG5cdFx0XHRcdGZhbHNlICk7XG5cblxuXHRcdFx0Ly8gRHJhdyBhbm90aGVyIGluZGljYXRvciBmb3IgdGhlIG1ldGFib2xpdGUgdGhhdCBoYXMgbGVzcy5cblx0XHRcdHZhciBzbWFsbGVyTWV0YWJvbGl0ZUNtb2xMVmFsdWUgPSBNYXRoLm1pbihiYWxhbmNlLnRvdGFsSW4sIGJhbGFuY2UudG90YWxPdXQpO1xuXHRcdFx0dmFyIHNtYWxsZXJNZXRhYm9saXRlWVBvcyA9IFV0bC5KUy5yZW1hcFZhbHVlKHNtYWxsZXJNZXRhYm9saXRlQ21vbExWYWx1ZSwgYm90dG9tUG9zVmFsdWUsIHRvcFBvc1ZhbHVlLCBib3R0b21Qb3MsIHRvcFBvcyk7XG5cblx0XHRcdHRoaXMuX2RyYXdUU2hhcGUoc3ZnLCBtaWRkbGVYLCBzbWFsbGVyTWV0YWJvbGl0ZVlQb3MsIFxuXHRcdFx0XHR0U2hhcGVXaWR0aCowLjgsIHRTaGFwZUhlaWdodCwgXG5cdFx0XHRcdHNtYWxsZXJNZXRhYm9saXRlQ21vbExWYWx1ZS50b0ZpeGVkKDIpLCBmb250LCAxNCxcblx0XHRcdFx0dHJ1ZSApO1xuXG5cdFx0fVxuXG5cdFx0cHJpdmF0ZSBfZHJhd1RTaGFwZShzdmcsIGNlbnRlclgsIHksIHdpZHRoLCBoZWlnaHQsIHRleHQsIGZvbnQsIGZvbnRTaXplLCB0ZXh0T25Cb3R0b206Ym9vbGVhbikge1xuXG5cdFx0XHR2YXIgdFNoYXBlSGVpZ2h0Om51bWJlciA9IDU7XG5cblx0XHRcdC8vIEJyZWFrIHRoZSB0ZXh0IGludG8gbXVsdGlwbGUgbGluZXMgaWYgbmVjZXNzYXJ5LlxuXHRcdFx0dmFyIGxpbmVzID0gdGV4dC5zcGxpdChcIlxcblwiKTtcblx0XHRcdHZhciBjdXJZID0geSAtIGZvbnRTaXplKmxpbmVzLmxlbmd0aDtcblx0XHRcdGlmICh0ZXh0T25Cb3R0b20pXG5cdFx0XHRcdGN1clkgPSB5ICsgZm9udFNpemUgKyB0U2hhcGVIZWlnaHQ7XG5cblx0XHRcdGZvciAodmFyIGkgaW4gbGluZXMpIHtcblx0XHRcdFx0c3ZnLmFwcGVuZENoaWxkKCBVdGwuU1ZHLmNyZWF0ZVRleHQoIFxuXHRcdFx0XHRcdGNlbnRlclgsXG5cdFx0XHRcdFx0Y3VyWSxcblx0XHRcdFx0XHRsaW5lc1tpXSxcblx0XHRcdFx0XHRmb250LCBmb250U2l6ZSxcblx0XHRcdFx0XHR0cnVlXG5cdFx0XHRcdCkpO1xuXG5cdFx0XHRcdGN1clkgKz0gZm9udFNpemU7XG5cdFx0XHR9XG5cblx0XHRcdHZhciBlbmRPZlQgPSAodGV4dE9uQm90dG9tID8geSt0U2hhcGVIZWlnaHQgOiB5LXRTaGFwZUhlaWdodCk7XG5cdFx0XHRzdmcuYXBwZW5kQ2hpbGQoIFV0bC5TVkcuY3JlYXRlTGluZShcblx0XHRcdFx0Y2VudGVyWCwgZW5kT2ZULFxuXHRcdFx0XHRjZW50ZXJYLCB5LFxuXHRcdFx0XHRVdGwuQ29sb3IuYmxhY2tcblx0XHRcdCkpO1xuXG5cdFx0XHRzdmcuYXBwZW5kQ2hpbGQoIFV0bC5TVkcuY3JlYXRlTGluZShcblx0XHRcdFx0Y2VudGVyWC13aWR0aC8yLCB5LFxuXHRcdFx0XHRjZW50ZXJYK3dpZHRoLzIsIHksXG5cdFx0XHRcdFV0bC5Db2xvci5ibGFja1xuXHRcdFx0KSk7XG5cblx0XHR9XG5cblxuXHRcdHByaXZhdGUgX2NoZWNrTGluZVNhbXBsZUJhbGFuY2UobGluZUlELCB0aW1lU3RhbXApIHtcblx0XHRcdHZhciBsaW5lRGF0YTpMaW5lRGF0YSA9IHRoaXMuY2FyYm9uU3VtLmdldExpbmVEYXRhQnlJRChsaW5lSUQpO1xuXHRcdFx0dmFyIHN1bTpDYXJib25CYWxhbmNlLkluT3V0U3VtID0gbGluZURhdGEuZ2V0SW5PdXRTdW1BdFRpbWUodGltZVN0YW1wKTtcblxuXHRcdFx0Ly8gV2UgbmVlZCBhdCBsZWFzdCAyIG1lYXN1cmVtZW50cyBpbiBvcmRlciB0byByZWdpc3RlciBhbiBpbWJhbGFuY2UuXG5cdFx0XHRpZiAoc3VtLm1lYXN1cmVtZW50cy5sZW5ndGggPCAyKVxuXHRcdFx0XHRyZXR1cm4gbnVsbDtcblxuXHRcdFx0dmFyIG5vcm1hbGl6ZWRFcnJvcjpudW1iZXIgPSB0aGlzLl9jYWxjTm9ybWFsaXplZEVycm9yKHN1bS50b3RhbEluLCBzdW0udG90YWxPdXQpO1xuXG5cdFx0XHRyZXR1cm4gbmV3IExpbmVTYW1wbGVCYWxhbmNlKFxuXHRcdFx0XHQobm9ybWFsaXplZEVycm9yIDwgdGhpcy5fbm9ybWFsaXplZEVycm9yVGhyZXNob2xkKSxcblx0XHRcdFx0c3VtLnRvdGFsSW4sXG5cdFx0XHRcdHN1bS50b3RhbE91dCxcblx0XHRcdFx0c3VtLm1lYXN1cmVtZW50c1xuXHRcdFx0KTtcblx0XHR9XG5cdH07XG5cblxuXG5cdGNsYXNzIExpbmVTYW1wbGVCYWxhbmNlIHtcblx0XHRjb25zdHJ1Y3RvcihwdWJsaWMgaXNCYWxhbmNlZDpib29sZWFuLCBwdWJsaWMgdG90YWxJbjpudW1iZXIsIHB1YmxpYyB0b3RhbE91dDpudW1iZXIsIHB1YmxpYyBtZWFzdXJlbWVudHM6SW5PdXRTdW1NZWFzdXJlbWVudFtdKSB7fVxuXHR9XG5cbn0gLy8gZW5kIENhcmJvbkJhbGFuY2UgbW9kdWxlXG5cbiJdfQ==