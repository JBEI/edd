var StudyDGraphing;
StudyDGraphing = {
    graphDiv: null,
    plotObject: null,
    dataSets: [],
    tickArray: [],
    hoverWidget: null,
    previousHoverPoint: null,
    previousHoverPointSeries: null,
    clickWidget: null,
    previousClickPoint: null,
    previousClickPointSeries: null,
    highlightedClickPoint: null,
    setsFetched: {},
    axesSeen: {},
    axesCount: 0,
    graphOptions: {
        series: {
            lines: {
                //				steps: true,
                show: true
            },
            points: {
                show: true,
                radius: 1.5,
            },
            shadowSize: 0
        },
        grid: {
            hoverable: true,
            clickable: true,
            autoHighlight: true,
            backgroundColor: "#FFF",
            borderColor: "#EEE"
        },
        crosshair: {
            mode: "x"
        },
        xaxis: {
            fullTickArray: [],
            currentGraphDOMObject: null
        },
        yaxis: {
            zoomRange: [1, 1]
        },
        zoom: {
            interactive: false
        },
        pan: {
            interactive: false
        },
        legend: {
            show: false
        }
    },
    Setup: function (graphdiv) {
        if (graphdiv) {
            this.graphDiv = $("#" + graphdiv);
        }
        else {
            this.graphDiv = $("#graphDiv");
        }
        this.graphDiv.bind("plothover", this.hoverFunction);
        this.graphDiv.bind("plotclick", this.plotClickFunction);
        this.graphOptions.xaxis.ticks = this.tickGeneratorFunction;
        this.graphOptions.xaxis.currentGraphDOMObject = this.graphDiv;
        this.graphOptions.yaxes = []; // Default: Show 1 y axis, fit all data to it.
        //this.plotObject = $.plot(this.graphDiv, this.dataSets, this.graphOptions);
    },
    clearAllSets: function () {
        this.graphOptions.yaxes = [];
        this.axesSeen = {};
        this.axesCount = 0;
        this.setsFetched = {};
    },
    addNewSet: function (newSet) {
        if (!newSet.label) {
            $('#debug').text('Failed to fetch series.');
            return;
        }
        var leftAxis = { show: true, position: "left" };
        var rightAxis = { show: true, position: "right" };
        var blankAxis = { show: false };
        // If we get any data sets that are not assigned to the default y axis (or y axis 1),
        // then we need to create a set of "hidden" y axis objects in the graphOptions to
        // inform flot.
        if (newSet.yaxisByMeasurementTypeID) {
            if (typeof this.axesSeen[newSet.yaxisByMeasurementTypeID] === "undefined") {
                this.axesCount++;
                this.axesSeen[newSet.yaxisByMeasurementTypeID] = this.axesCount;
            }
            // This has the effect of remaking the numbers by the sequence encountered
            newSet.yaxis = this.axesSeen[newSet.yaxisByMeasurementTypeID];
            while (this.graphOptions.yaxes.length < newSet.yaxis) {
                var chosenAxis = leftAxis;
                if (this.graphOptions.yaxes.length > 1) {
                    chosenAxis = blankAxis;
                }
                else if (this.graphOptions.yaxes.length > 0) {
                    chosenAxis = rightAxis;
                }
                if (newSet.logscale) {
                    chosenAxis.transform = function (v) {
                        if (v == 0)
                            v = 0.00001;
                        return Math.log(v);
                    };
                    chosenAxis.inverseTransform = function (v) {
                        return Math.exp(v);
                    };
                    chosenAxis.autoscaleMargin = null;
                }
                this.graphOptions.yaxes.push(chosenAxis);
            }
        }
        if (newSet.iscontrol) {
            newSet.lines = { show: false };
            newSet.dashes = { show: true, lineWidth: 2, dashLength: [3, 1] };
        }
        //		console.log(this.graphOptions.yaxes);
        this.setsFetched[newSet.label] = newSet;
        //		this.reassignGraphColors();
        //		this.redrawGraph();
    },
    drawSets: function () {
        this.reassignGraphColors();
        this.redrawGraph();
    },
    reassignGraphColors: function () {
        var setCount = 0; // Damn, there has to be a better way to do this.
        var activeSetCount = 0;
        for (var i in this.setsFetched) {
            setCount++;
            var oneSet = this.setsFetched[i];
            if (oneSet.data) {
                activeSetCount++;
            }
        }
        var setIndex = 0;
        for (var i in this.setsFetched) {
            var oneSet = this.setsFetched[i];
            if (oneSet.data) {
                // If we have multiple axes, then choose the color based on which axis the line is assigned to
                if (this.graphOptions.yaxes.length > 1) {
                    // We're banking on yaxis always being 1 or greater, never 0, to get correct color
                    // This should be true because flot itself never uses 0 to refer to an axis internally.
                    oneSet.color = this.intAndRangeToLineColor(oneSet.yaxis - 1, this.graphOptions.yaxes.length);
                    this.graphOptions.yaxes[oneSet.yaxis - 1].color = oneSet.color;
                }
                else {
                    oneSet.color = this.intAndRangeToLineColor(setIndex, activeSetCount);
                }
                var ts = document.getElementById(oneSet.label + 'Label');
                if (ts) {
                    ts.style.backgroundColor = oneSet.color;
                    ts.style.color = '#FFF';
                }
            }
            setIndex++;
        }
    },
    intAndRangeToLineColor: function (i, r) {
        // 17 intermediate spots on the color wheel, adjusted for visibility,
        // with the 18th a clone of the 1st.
        var lineColors = [
            [0, 136, 132], [10, 136, 109], [13, 143, 45], [20, 136, 10], [72, 136, 10], [125, 136, 0],
            [136, 108, 10], [136, 73, 11], [136, 43, 14], [136, 14, 43], [136, 11, 88], [118, 13, 136],
            [89, 23, 136], [43, 20, 136], [14, 23, 136], [12, 44, 136], [13, 107, 136], [0, 136, 132]];
        // Range of 0 is just unacceptable
        if (r < 1) {
            return '#888';
        }
        // Negative index is equally unacceptable
        if (i < 0) {
            return '#888';
        }
        if (i > r) {
            i = i % r; // Make sure i is within r
        }
        var adjustedRange = (i / r) * (lineColors.length - 2);
        var lIndex = Math.floor(adjustedRange);
        var lfraction = adjustedRange - lIndex;
        var rIndex = lIndex + 1;
        var rfraction = rIndex - adjustedRange;
        //		console.log(rIndex + ' ' + lfraction + ' ' + (lineColors.length - 2));
        var r = Math.floor((lineColors[lIndex][0] * lfraction) + (lineColors[rIndex][0] * rfraction));
        var g = Math.floor((lineColors[lIndex][1] * lfraction) + (lineColors[rIndex][1] * rfraction));
        var b = Math.floor((lineColors[lIndex][2] * lfraction) + (lineColors[rIndex][2] * rfraction));
        return 'rgb(' + r + ', ' + g + ', ' + b + ')';
    },
    redrawGraph: function () {
        this.dataSets = [];
        for (var oneSet in this.setsFetched) {
            this.dataSets.push(this.setsFetched[oneSet]);
        }
        console.log(this.dataSets);
        this.rebuildXAxis();
        if (StudyDGraphing.clickWidget) {
            StudyDGraphing.clickWidget.remove();
        }
        if (StudyDGraphing.highlightedClickPoint) {
            StudyDGraphing.highlightedClickPoint.remove();
        }
        this.plotObject = $.plot(this.graphDiv, this.dataSets, this.graphOptions);
    },
    rebuildXAxis: function () {
        var _this = this;
        this.tickArray = [];
        this.dataSets.forEach(function (series) {
            var di = 0, ti = 0, oldTickArray = _this.tickArray, d, t;
            if (series.data) {
                _this.tickArray = [];
                while ((di < series.data.length) && (ti < oldTickArray.length)) {
                    d = parseFloat(series.data[di][0]);
                    t = oldTickArray[ti][0];
                    if (d < t) {
                        _this.tickArray.push([d, d]);
                        di++;
                    }
                    else if (t < d) {
                        _this.tickArray.push([t, oldTickArray[ti][1]]);
                        ti++;
                    }
                    else {
                        _this.tickArray.push([t, oldTickArray[ti][1]]);
                        di++;
                        ti++;
                    }
                }
                while (di < series.data.length) {
                    d = parseFloat(series.data[di][0]);
                    _this.tickArray.push([d, d]);
                    di++;
                }
                while (ti < oldTickArray.length) {
                    t = oldTickArray[ti][0];
                    _this.tickArray.push([t, oldTickArray[ti][1]]);
                    ti++;
                }
            }
        });
        // Embed it in the options for eventual passing through flot and into the custom tick generator just below
        this.graphOptions.xaxis.fullTickArray = this.tickArray;
    },
    tickGeneratorFunction: function (fullaxis) {
        var res = [];
        if (!fullaxis) {
            console.log("No first argument passed to the tick generator?  Something's wrong with flot.  Better investigate.");
            return res;
        }
        if (!fullaxis.options) {
            console.log("No options in the argument passed to the tick generator?  Something's wrong with flot.  Better investigate.");
            return res;
        }
        if (!fullaxis.options.currentGraphDOMObject) {
            return res;
        }
        var graphDivWidth = fullaxis.options.currentGraphDOMObject.width();
        if (!graphDivWidth) {
            return res;
        }
        var axisApertureSize = fullaxis.max - fullaxis.min;
        if (axisApertureSize < 1) {
            return res;
        }
        // Hem the region in on the right side to prevent the divs from drawing offscreen
        // and summoning a horizontal scrollbar.
        var maxWidth = graphDivWidth - 20;
        if (maxWidth < 5) {
            return res;
        }
        // 26 pixels is about how much screen width we need for each label.
        var stepSize = 26;
        var tickArray = fullaxis.options.fullTickArray;
        if (!tickArray) {
            return res;
        }
        // width varies a lot; one character is about 7px, so compute the widest label
        stepSize = tickArray.reduce(function (p, v) { return Math.max(p, v[1].toString().length * 7); }, stepSize);
        // tickArrayLength is the number of ticks on the axis we have to choose from
        var tickArrayLength = tickArray.length;
        if (tickArrayLength < 1) {
            return res;
        }
        // This code performs a binary search down into the array,
        // hunting for the closest match to the given value
        // (the left edge of the region we are trying to place a tick in)
        var apertureLeftEdge = 0;
        var i = 0;
        var prevI = -1;
        // Hint: If this gives bizarre results, make sure you have everything
        // casted to floats or ints, instead of strings.
        do {
            var tickArrayStepSize = (tickArrayLength - i) / 2;
            var i = tickArrayStepSize + i;
            do {
                var v = tickArray[Math.floor(i)][0];
                tickArrayStepSize = tickArrayStepSize / 2;
                if (((v - fullaxis.min) * (graphDivWidth / axisApertureSize)) > apertureLeftEdge) {
                    i = i - tickArrayStepSize;
                }
                else {
                    i = i + tickArrayStepSize;
                }
            } while (tickArrayStepSize > 0.4);
            // The index is meant to end up pointing between the two values on either side
            // of our target, but may be off by one value when we quit searching due to a
            // rounding issue.  So we take the floor and test that value, and choose the one
            // just higher if it's too low.
            i = Math.floor(i);
            if (((tickArray[i][0] - fullaxis.min) * (graphDivWidth / axisApertureSize)) < apertureLeftEdge) {
                i = i + 1;
            }
            // If, by seeking the higher value, we end up off the end of the array, then
            // there are no more values we can add.
            if (i >= tickArrayLength) {
                break;
            }
            res.push([tickArray[i][0], tickArray[i][1]]);
            // Take the location of this tick, plus our scaled spacer, and use that as the
            // new left edge of our tick search.
            apertureLeftEdge = ((tickArray[i][0] - fullaxis.min) * (graphDivWidth / axisApertureSize)) + stepSize;
            //			console.log("val: " + tickArray[i][0] + " edge: " + apertureLeftEdge);
            // If, for any reason, we end up on the same index twice in a row,
            // bail out to prevent an infinite loop.
            if (i == prevI) {
                break;
            }
            prevI = i;
        } while (apertureLeftEdge < maxWidth);
        return res;
    },
    hoverFunction: function (event, pos, item) {
        if (item) {
            if ((StudyDGraphing.previousHoverPoint != item.dataIndex) ||
                (StudyDGraphing.previousHoverPointSeries != item.series)) {
                StudyDGraphing.previousHoverPoint = item.dataIndex;
                StudyDGraphing.previousHoverPointSeries = item.series;
                if (StudyDGraphing.hoverWidget) {
                    StudyDGraphing.hoverWidget.remove();
                    StudyDGraphing.hoverWidget = null;
                }
                if ((StudyDGraphing.previousClickPoint != StudyDGraphing.previousHoverPoint) ||
                    (StudyDGraphing.previousClickPointSeries != StudyDGraphing.previousHoverPointSeries)) {
                    StudyDGraphing.hoverWidget = StudyDGraphing.createWidget('graphHoverWidget', item);
                }
            }
        }
        else {
            if (StudyDGraphing.hoverWidget) {
                StudyDGraphing.hoverWidget.remove();
                StudyDGraphing.hoverWidget = null;
            }
            StudyDGraphing.previousHoverPoint = null;
            StudyDGraphing.previousHoverPointSeries = null;
        }
    },
    plotClickFunction: function (event, pos, item) {
        if (item) {
            // If we're re-clicking a current item
            if ((StudyDGraphing.previousClickPoint == item.dataIndex) &&
                (StudyDGraphing.previousClickPointSeries == item.series)) {
                StudyDGraphing.previousClickPoint = null;
                StudyDGraphing.previousClickPointSeries = null;
                if (StudyDGraphing.clickWidget) {
                    StudyDGraphing.clickWidget.remove();
                    StudyDGraphing.clickWidget = null;
                }
                if (StudyDGraphing.highlightedClickPoint) {
                    StudyDGraphing.highlightedClickPoint.remove();
                    StudyDGraphing.highlightedClickPoint = null;
                }
            }
            else {
                StudyDGraphing.previousClickPoint = item.dataIndex;
                StudyDGraphing.previousClickPointSeries = item.series;
                if (StudyDGraphing.clickWidget) {
                    StudyDGraphing.clickWidget.remove();
                }
                if (StudyDGraphing.highlightedClickPoint) {
                    StudyDGraphing.highlightedClickPoint.remove();
                }
                StudyDGraphing.highlightedClickPoint = StudyDGraphing.createPointSelectionOverlay('graphClickMarker', item);
                StudyDGraphing.clickWidget = StudyDGraphing.createWidget('graphClickWidget', item);
            }
        }
    },
    createPointSelectionOverlay: function (widgetStyle, item) {
        var tx = item.pageX - 6;
        var ty = item.pageY - 6;
        var ptColor = 'rgba(88,88,88,1)';
        if (item.series.color) {
            ptColor = $.color.parse(item.series.color).scale('a', 0.5).toString();
        }
        var svgString = '<svg id="' + widgetStyle + 'p" xmlns="http://www.w3.org/2000/svg" version="1.2"' +
            ' width="12px" height="12px" viewBox="0 0 12 12" preserveAspectRatio="none"' +
            ' style="position: absolute;top:' + ty + ';left:' + tx + ';">' +
            '<defs>' +
            '<radialGradient id="g1" cx="50%" cy="50%" r="50%">' +
            '<stop stop-color="' + ptColor + '" offset="0%" />' +
            '<stop stop-color="white" offset="100%" />' +
            '</radialGradient>' +
            '</defs>' +
            '<line x1="6.5" y1="6.5" x2="11.5" y2="11.5" stroke="black" stroke-width="2" />' +
            '<circle id="c1" cx="6.5" cy="6.5" r="5" stroke="black" stroke-width="1" fill="url(#g1)" />' +
            '</svg>';
        var newPt = $(svgString);
        newPt.appendTo("body");
        return newPt;
    },
    createWidget: function (widgetStyle, item) {
        var y = item.datapoint[1];
        var tempdescription = '';
        if (item.series.name) {
            tempdescription = item.series.name + '<br>';
        }
        if (item.series.measurementname) {
            tempdescription = tempdescription + item.series.measurementname + ': ';
        }
        var tempunits = '';
        if (item.series.units) {
            tempunits = item.series.units;
        }
        var templabel = tempdescription + '<B>' + y + '</B> ' + tempunits;
        var temptag = '';
        if (item.series.tags) {
            if (item.series.tags[item.dataIndex]) {
                temptag = item.series.tags[item.dataIndex][1];
            }
        }
        if (temptag != '') {
            templabel = templabel + '<br>' + temptag;
        }
        var tx = item.pageX + 5;
        var ty = item.pageY + 5;
        var newTip = $('<div id="' + widgetStyle + 't" class="' + widgetStyle + '">' + templabel + '</div>');
        // We will place the tooltip in the location specified, unless
        // the rendered width of the content runs off right edge,
        // in which case we will shift it left to be flush with the right-edge of the window,
        // and re-write the width of the box so it conforms to the wrapping of the text.
        newTip.css({
            top: ty,
            left: tx
        });
        if (item.series.color) {
            newTip.css({ 'color': item.series.color });
        }
        newTip.appendTo("body");
        var newTipEl = document.getElementById(widgetStyle + "t");
        var newTipWidth = newTipEl.clientWidth;
        if ((tx + newTipWidth + 20) > window.innerWidth) {
            // tooltip on left hand side, nasty hack to shift the label
            newTipEl.style.width = (newTipWidth + 2) + "px";
            newTipEl.style.left = (tx - newTipWidth) + "px";
        }
        return newTip;
    }
};
