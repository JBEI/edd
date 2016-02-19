// Compiled to JS on: Thu Feb 18 2016 16:47:14  
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
        this.plotObject = $.plot(this.graphDiv, this.dataSets, this.graphOptions);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiU3R1ZHlHcmFwaGluZy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uL3NyYy9TdHVkeUdyYXBoaW5nLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLElBQUksY0FBa0IsQ0FBQztBQUN2QixjQUFjLEdBQUc7SUFFaEIsUUFBUSxFQUFDLElBQUk7SUFDYixVQUFVLEVBQUMsSUFBSTtJQUVaLFFBQVEsRUFBQyxFQUFFO0lBQ1gsU0FBUyxFQUFDLEVBQUU7SUFFZixXQUFXLEVBQUMsSUFBSTtJQUNoQixrQkFBa0IsRUFBQyxJQUFJO0lBQ3ZCLHdCQUF3QixFQUFDLElBQUk7SUFFN0IsV0FBVyxFQUFDLElBQUk7SUFDaEIsa0JBQWtCLEVBQUMsSUFBSTtJQUN2Qix3QkFBd0IsRUFBQyxJQUFJO0lBQzdCLHFCQUFxQixFQUFDLElBQUk7SUFFMUIsV0FBVyxFQUFDLEVBQUU7SUFDZCxRQUFRLEVBQUMsRUFBRTtJQUNYLFNBQVMsRUFBQyxDQUFDO0lBRVgsWUFBWSxFQUFDO1FBQ1osTUFBTSxFQUFFO1lBQ1AsS0FBSyxFQUFFO2dCQUNWLGtCQUFrQjtnQkFDZCxJQUFJLEVBQUUsSUFBSTthQUNWO1lBQ0QsTUFBTSxFQUFFO2dCQUNQLElBQUksRUFBRSxJQUFJO2dCQUNWLE1BQU0sRUFBRSxHQUFHO2FBQ1g7WUFDRCxVQUFVLEVBQUUsQ0FBQztTQUNiO1FBQ0QsSUFBSSxFQUFFO1lBQ0wsU0FBUyxFQUFFLElBQUk7WUFDZixTQUFTLEVBQUUsSUFBSTtZQUNmLGFBQWEsRUFBRSxJQUFJO1lBQ25CLGVBQWUsRUFBRSxNQUFNO1lBQ3ZCLFdBQVcsRUFBRSxNQUFNO1NBQ25CO1FBQ0QsU0FBUyxFQUFFO1lBQ1YsSUFBSSxFQUFFLEdBQUc7U0FDVDtRQUNELEtBQUssRUFBRTtZQUNOLGFBQWEsRUFBQyxFQUFFO1lBQ2hCLHFCQUFxQixFQUFDLElBQUk7U0FDMUI7UUFDRCxLQUFLLEVBQUU7WUFDTixTQUFTLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxD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QUMsR0FBRyxFQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFDLEdBQUcsRUFBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEdBQUcsRUFBQyxHQUFHLEVBQUMsQ0FBQyxDQUFDO1lBQzdFLENBQUMsR0FBRyxFQUFDLEdBQUcsRUFBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEdBQUcsRUFBQyxFQUFFLEVBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxHQUFHLEVBQUMsRUFBRSxFQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsR0FBRyxFQUFDLEVBQUUsRUFBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEdBQUcsRUFBQyxFQUFFLEVBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxHQUFHLEVBQUMsRUFBRSxFQUFDLEdBQUcsQ0FBQztZQUM5RSxDQUFDLEVBQUUsRUFBQyxFQUFFLEVBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUMsRUFBRSxFQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFDLEVBQUUsRUFBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBQyxFQUFFLEVBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUMsR0FBRyxFQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFDLEdBQUcsRUFBQyxHQUFHLENBQUMsQ0FBQyxDQUFDO1FBRWhGLGtDQUFrQztRQUNsQyxFQUFFLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUM7UUFBQyxDQUFDO1FBRTdCLHlDQUF5QztRQUN6QyxFQUFFLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUM7UUFBQyxDQUFDO1FBRTdCLEVBQUUsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ1gsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQywwQkFBMEI7UUFDdEMsQ0FB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LENBQUM7WUFDOUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxJQUFJLEdBQUcsQ0FBQyxFQUFFLEdBQUcsV0FBVyxDQUFDLEdBQUcsSUFBSSxDQUFDO1FBQ2pELENBQUM7UUFDRCxNQUFNLENBQUMsTUFBTSxDQUFDO0lBQ1osQ0FBQztDQUNKLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJ2YXIgU3R1ZHlER3JhcGhpbmc6YW55O1xuU3R1ZHlER3JhcGhpbmcgPSB7XG5cblx0Z3JhcGhEaXY6bnVsbCxcblx0cGxvdE9iamVjdDpudWxsLFxuXG4gICAgZGF0YVNldHM6W10sXG4gICAgdGlja0FycmF5OltdLFxuXG5cdGhvdmVyV2lkZ2V0Om51bGwsXG5cdHByZXZpb3VzSG92ZXJQb2ludDpudWxsLFxuXHRwcmV2aW91c0hvdmVyUG9pbnRTZXJpZXM6bnVsbCxcblxuXHRjbGlja1dpZGdldDpudWxsLFxuXHRwcmV2aW91c0NsaWNrUG9pbnQ6bnVsbCxcblx0cHJldmlvdXNDbGlja1BvaW50U2VyaWVzOm51bGwsXG5cdGhpZ2hsaWdodGVkQ2xpY2tQb2ludDpudWxsLFxuXG5cdHNldHNGZXRjaGVkOnt9LFxuXHRheGVzU2Vlbjp7fSxcblx0YXhlc0NvdW50OjAsXG5cblx0Z3JhcGhPcHRpb25zOntcblx0XHRzZXJpZXM6IHtcblx0XHRcdGxpbmVzOiB7XG4vL1x0XHRcdFx0c3RlcHM6IHRydWUsXG5cdFx0XHRcdHNob3c6IHRydWVcblx0XHRcdH0sXG5cdFx0XHRwb2ludHM6IHtcblx0XHRcdFx0c2hvdzogdHJ1ZSxcblx0XHRcdFx0cmFkaXVzOiAxLjUsXG5cdFx0XHR9LFxuXHRcdFx0c2hhZG93U2l6ZTogMFxuXHRcdH0sXG5cdFx0Z3JpZDoge1xuXHRcdFx0aG92ZXJhYmxlOiB0cnVlLFxuXHRcdFx0Y2xpY2thYmxlOiB0cnVlLFxuXHRcdFx0YXV0b0hpZ2hsaWdodDogdHJ1ZSxcblx0XHRcdGJhY2tncm91bmRDb2xvcjogXCIjRkZGXCIsXG5cdFx0XHRib3JkZXJDb2xvcjogXCIjRUVFXCJcblx0XHR9LFxuXHRcdGNyb3NzaGFpcjoge1xuXHRcdFx0bW9kZTogXCJ4XCJcblx0XHR9LFxuXHRcdHhheGlzOiB7XG5cdFx0XHRmdWxsVGlja0FycmF5OltdLFx0Ly8gVGhpcyBpcyBoZXJlIHNvIHRoYXQgZmxvdCB3aWxsIHBhc3MgaXQgYmFjayB0byB1cyBpbiBhIGNhbGxiYWNrXG5cdFx0XHRjdXJyZW50R3JhcGhET01PYmplY3Q6bnVsbFxuXHRcdH0sXG5cdFx0eWF4aXM6IHtcblx0XHRcdHpvb21SYW5nZTogWzEsIDFdXG5cdFx0fSxcblx0XHR6b29tOiB7XG5cdFx0XHRpbnRlcmFjdGl2ZTogZmFsc2Vcblx0XHR9LFxuXHRcdHBhbjoge1xuXHRcdFx0aW50ZXJhY3RpdmU6IGZhbHNlXG5cdFx0fSxcblx0XHRsZWdlbmQ6IHtcblx0XHRcdHNob3c6IGZhbHNlXG5cdFx0fVxuXHR9LFxuXG5cblx0U2V0dXA6ZnVuY3Rpb24oZ3JhcGhkaXYpIHtcblx0XHRpZiAoZ3JhcGhkaXYpIHtcblx0XHRcdHRoaXMuZ3JhcGhEaXYgPSAkKFwiI1wiICsgZ3JhcGhkaXYpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmdyYXBoRGl2ID0gJChcIiNncmFwaERpdlwiKTtcdFxuXHRcdH1cblx0XG5cdFx0dGhpcy5ncmFwaERpdi5iaW5kKFwicGxvdGhvdmVyXCIsIHRoaXMuaG92ZXJGdW5jdGlvbik7XG5cdFx0dGhpcy5ncmFwaERpdi5iaW5kKFwicGxvdGNsaWNrXCIsIHRoaXMucGxvdENsaWNrRnVuY3Rpb24pO1xuXHRcdHRoaXMuZ3JhcGhPcHRpb25zLnhheGlzLnRpY2tzID0gdGhpcy50aWNrR2VuZXJhdG9yRnVuY3Rpb247XG5cdFx0dGhpcy5ncmFwaE9wdGlvbnMueGF4aXMuY3VycmVudEdyYXBoRE9NT2JqZWN0ID0gdGhpcy5ncmFwaERpdjtcblxuXHRcdHRoaXMuZ3JhcGhPcHRpb25zLnlheGVzID0gW107IC8vIERlZmF1bHQ6IFNob3cgMSB5IGF4aXMsIGZpdCBhbGwgZGF0YSB0byBpdC5cblxuXHRcdHRoaXMucGxvdE9iamVjdCA9ICQucGxvdCh0aGlzLmdyYXBoRGl2LCB0aGlzLmRhdGFTZXRzLCB0aGlzLmdyYXBoT3B0aW9ucyk7XG5cdH0sXG5cblxuXHRjbGVhckFsbFNldHM6ZnVuY3Rpb24oKSB7XG5cblx0XHR0aGlzLmdyYXBoT3B0aW9ucy55YXhlcyA9IFtdO1xuXHRcdHRoaXMuYXhlc1NlZW4gPSB7fTtcblx0XHR0aGlzLmF4ZXNDb3VudCA9IDA7XG5cdFx0dGhpcy5zZXRzRmV0Y2hlZCA9IHt9O1xuXHR9LFxuXHRcblxuXHRhZGROZXdTZXQ6ZnVuY3Rpb24obmV3U2V0KSB7XG5cblx0XHRpZiAoIW5ld1NldC5sYWJlbCkge1xuXHRcdFx0JCgnI2RlYnVnJykudGV4dCgnRmFpbGVkIHRvIGZldGNoIHNlcmllcy4nKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR2YXIgbGVmdEF4aXMgPSB7ICAgc2hvdzogdHJ1ZSwgcG9zaXRpb246XCJsZWZ0XCIgfTtcblx0XHR2YXIgcmlnaHRBeGlzID0geyAgIHNob3c6IHRydWUsIHBvc2l0aW9uOlwicmlnaHRcIiB9O1xuXHRcdHZhciBibGFua0F4aXMgPSB7ICAgc2hvdzogZmFsc2UgfTtcblxuXHRcdC8vIElmIHdlIGdldCBhbnkgZGF0YSBzZXRzIHRoYXQgYXJlIG5vdCBhc3NpZ25lZCB0byB0aGUgZGVmYXVsdCB5IGF4aXMgKG9yIHkgYXhpcyAxKSxcblx0XHQvLyB0aGVuIHdlIG5lZWQgdG8gY3JlYXRlIGEgc2V0IG9mIFwiaGlkZGVuXCIgeSBheGlzIG9iamVjdHMgaW4gdGhlIGdyYXBoT3B0aW9ucyB0b1xuXHRcdC8vIGluZm9ybSBmbG90LlxuXHRcdGlmIChuZXdTZXQueWF4aXNCeU1lYXN1cmVtZW50VHlwZUlEKSB7XG5cdFx0XHRpZiAodHlwZW9mIHRoaXMuYXhlc1NlZW5bbmV3U2V0LnlheGlzQnlNZWFzdXJlbWVudFR5cGVJRF0gPT09IFwidW5kZWZpbmVkXCIpIHtcblx0XHRcdFx0dGhpcy5heGVzQ291bnQrKztcblx0XHRcdFx0dGhpcy5heGVzU2VlbltuZXdTZXQueWF4aXNCeU1lYXN1cmVtZW50VHlwZUlEXSA9IHRoaXMuYXhlc0NvdW50O1xuXHRcdFx0fVxuXHRcdFx0Ly8gVGhpcyBoYXMgdGhlIGVmZmVjdCBvZiByZW1ha2luZyB0aGUgbnVtYmVycyBieSB0aGUgc2VxdWVuY2UgZW5jb3VudGVyZWRcblx0XHRcdG5ld1NldC55YXhpcyA9IHRoaXMuYXhlc1NlZW5bbmV3U2V0LnlheGlzQnlNZWFzdXJlbWVudFR5cGVJRF07XG5cblx0XHRcdHdoaWxlICh0aGlzLmdyYXBoT3B0aW9ucy55YXhlcy5sZW5ndGggPCBuZXdTZXQueWF4aXMpIHtcblx0XHRcdFx0dmFyIGNob3NlbkF4aXM6YW55ID0gbGVmdEF4aXM7XG5cdFx0XHRcdGlmICh0aGlzLmdyYXBoT3B0aW9ucy55YXhlcy5sZW5ndGggPiAxKSB7XG5cdFx0XHRcdFx0Y2hvc2VuQXhpcyA9IGJsYW5rQXhpcztcblx0XHRcdFx0fSBlbHNlIGlmICh0aGlzLmdyYXBoT3B0aW9ucy55YXhlcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0Y2hvc2VuQXhpcyA9IHJpZ2h0QXhpcztcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAobmV3U2V0LmxvZ3NjYWxlKSB7XG5cdFx0XHRcdFx0Y2hvc2VuQXhpcy50cmFuc2Zvcm0gPSBmdW5jdGlvbiAodikge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdGlmICh2ID09IDApIHYgPSAwLjAwMDAxO1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdHJldHVybiBNYXRoLmxvZyh2KTtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0fTtcblx0XHRcdFx0XHRjaG9zZW5BeGlzLmludmVyc2VUcmFuc2Zvcm0gPSBmdW5jdGlvbiAodikge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdHJldHVybiBNYXRoLmV4cCh2KTtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0fTtcblx0XHRcdFx0XHRjaG9zZW5BeGlzLmF1dG9zY2FsZU1hcmdpbiA9IG51bGw7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5ncmFwaE9wdGlvbnMueWF4ZXMucHVzaChjaG9zZW5BeGlzKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKG5ld1NldC5pc2NvbnRyb2wpIHtcblx0XHRcdG5ld1NldC5saW5lcyA9IHtzaG93OmZhbHNlfTtcblx0XHRcdG5ld1NldC5kYXNoZXMgPSB7c2hvdzp0cnVlLCBsaW5lV2lkdGg6MiwgZGFzaExlbmd0aDpbMywgMV19O1xuXHRcdH1cblxuLy9cdFx0Y29uc29sZS5sb2codGhpcy5ncmFwaE9wdGlvbnMueWF4ZXMpO1xuXG5cdFx0dGhpcy5zZXRzRmV0Y2hlZFtuZXdTZXQubGFiZWxdID0gbmV3U2V0O1xuXG4vL1x0XHR0aGlzLnJlYXNzaWduR3JhcGhDb2xvcnMoKTtcbi8vXHRcdHRoaXMucmVkcmF3R3JhcGgoKTtcblx0fSxcblxuXG5cdGRyYXdTZXRzOmZ1bmN0aW9uKCkge1xuXHRcdHRoaXMucmVhc3NpZ25HcmFwaENvbG9ycygpO1xuXHRcdHRoaXMucmVkcmF3R3JhcGgoKTtcblx0fSxcblxuXG5cdHJlYXNzaWduR3JhcGhDb2xvcnM6ZnVuY3Rpb24oKSB7XG5cdFx0dmFyIHNldENvdW50ID0gMDtcdC8vIERhbW4sIHRoZXJlIGhhcyB0byBiZSBhIGJldHRlciB3YXkgdG8gZG8gdGhpcy5cblx0XHR2YXIgYWN0aXZlU2V0Q291bnQgPSAwO1xuXHRcdGZvciAodmFyIGkgaW4gdGhpcy5zZXRzRmV0Y2hlZCkge1xuXHRcdFx0c2V0Q291bnQrKztcblx0XHRcdHZhciBvbmVTZXQgPSB0aGlzLnNldHNGZXRjaGVkW2ldO1xuXHRcdFx0aWYgKG9uZVNldC5kYXRhKSB7XG5cdFx0XHRcdGFjdGl2ZVNldENvdW50Kys7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dmFyIHNldEluZGV4ID0gMDtcblx0XHRmb3IgKHZhciBpIGluIHRoaXMuc2V0c0ZldGNoZWQpIHtcblx0XHRcdHZhciBvbmVTZXQgPSB0aGlzLnNldHNGZXRjaGVkW2ldO1xuXHRcdFx0aWYgKG9uZVNldC5kYXRhKSB7XG5cblx0XHRcdFx0Ly8gSWYgd2UgaGF2ZSBtdWx0aXBsZSBheGVzLCB0aGVuIGNob29zZSB0aGUgY29sb3IgYmFzZWQgb24gd2hpY2ggYXhpcyB0aGUgbGluZSBpcyBhc3NpZ25lZCB0b1xuXHRcdFx0XHRpZiAodGhpcy5ncmFwaE9wdGlvbnMueWF4ZXMubGVuZ3RoID4gMSkge1xuXHRcdFx0XHRcdC8vIFdlJ3JlIGJhbmtpbmcgb24geWF4aXMgYWx3YXlzIGJlaW5nIDEgb3IgZ3JlYXRlciwgbmV2ZXIgMCwgdG8gZ2V0IGNvcnJlY3QgY29sb3Jcblx0XHRcdFx0XHQvLyBUaGlzIHNob3VsZCBiZSB0cnVlIGJlY2F1c2UgZmxvdCBpdHNlbGYgbmV2ZXIgdXNlcyAwIHRvIHJlZmVyIHRvIGFuIGF4aXMgaW50ZXJuYWxseS5cblx0XHRcdFx0XHRvbmVTZXQuY29sb3IgPSB0aGlzLmludEFuZFJhbmdlVG9MaW5lQ29sb3Iob25lU2V0LnlheGlzLTEsIHRoaXMuZ3JhcGhPcHRpb25zLnlheGVzLmxlbmd0aCk7XG5cdFx0XHRcdFx0dGhpcy5ncmFwaE9wdGlvbnMueWF4ZXNbb25lU2V0LnlheGlzLTFdLmNvbG9yID0gb25lU2V0LmNvbG9yO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdG9uZVNldC5jb2xvciA9IHRoaXMuaW50QW5kUmFuZ2VUb0xpbmVDb2xvcihzZXRJbmRleCwgYWN0aXZlU2V0Q291bnQpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0dmFyIHRzID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQob25lU2V0LmxhYmVsICsgJ0xhYmVsJyk7XG5cdFx0XHRcdGlmICh0cykge1xuXHRcdFx0XHRcdHRzLnN0eWxlLmJhY2tncm91bmRDb2xvciA9IG9uZVNldC5jb2xvcjtcblx0XHRcdFx0ICAgIHRzLnN0eWxlLmNvbG9yID0gJyNGRkYnO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRzZXRJbmRleCsrO1xuXHRcdH1cblx0fSxcblxuXG5cdGludEFuZFJhbmdlVG9MaW5lQ29sb3I6ZnVuY3Rpb24oaSxyKSB7XG5cdFx0Ly8gMTcgaW50ZXJtZWRpYXRlIHNwb3RzIG9uIHRoZSBjb2xvciB3aGVlbCwgYWRqdXN0ZWQgZm9yIHZpc2liaWxpdHksXG5cdFx0Ly8gd2l0aCB0aGUgMTh0aCBhIGNsb25lIG9mIHRoZSAxc3QuXG5cdFx0dmFyIGxpbmVDb2xvcnMgPSBbXG5cdFx0XHRbMCwxMzYsMTMyXSwgWzEwLDEzNiwxMDldLCBbMTMsMTQzLDQ1XSwgWzIwLDEzNiwxMF0sIFs3MiwxMzYsMTBdLCBbMTI1LDEzNiwwXSxcblx0XHRcdFsxMzYsMTA4LDEwXSwgWzEzNiw3MywxMV0sIFsxMzYsNDMsMTRdLCBbMTM2LDE0LDQzXSwgWzEzNiwxMSw4OF0sIFsxMTgsMTMsMTM2XSxcblx0XHRcdFs4OSwyMywxMzZdLCBbNDMsMjAsMTM2XSwgWzE0LDIzLDEzNl0sIFsxMiw0NCwxMzZdLCBbMTMsMTA3LDEzNl0sIFswLDEzNiwxMzJdXTtcblxuXHRcdC8vIFJhbmdlIG9mIDAgaXMganVzdCB1bmFjY2VwdGFibGVcblx0XHRpZiAociA8IDEpIHsgcmV0dXJuICcjODg4JzsgfVxuXG5cdFx0Ly8gTmVnYXRpdmUgaW5kZXggaXMgZXF1YWxseSB1bmFjY2VwdGFibGVcblx0XHRpZiAoaSA8IDApIHsgcmV0dXJuICcjODg4JzsgfVxuXG5cdFx0aWYgKGkgPiByKSB7XG5cdFx0XHRpID0gaSAlIHI7XHQvLyBNYWtlIHN1cmUgaSBpcyB3aXRoaW4gclxuXHRcdH1cblxuXHRcdHZhciBhZGp1c3RlZFJhbmdlID0gKGkgLyByKSAqIChsaW5lQ29sb3JzLmxlbmd0aCAtIDIpO1xuXHRcdHZhciBsSW5kZXggPSBNYXRoLmZsb29yKGFkanVzdGVkUmFuZ2UpO1xuXHRcdHZhciBsZnJhY3Rpb24gPSBhZGp1c3RlZFJhbmdlIC0gbEluZGV4O1xuXHRcdHZhciBySW5kZXggPSBsSW5kZXggKyAxO1xuXHRcdHZhciByZnJhY3Rpb24gPSBySW5kZXggLSBhZGp1c3RlZFJhbmdlO1xuLy9cdFx0Y29uc29sZS5sb2cockluZGV4ICsgJyAnICsgbGZyYWN0aW9uICsgJyAnICsgKGxpbmVDb2xvcnMubGVuZ3RoIC0gMikpO1xuXHRcdHZhciByOmFueSA9IE1hdGguZmxvb3IoKGxpbmVDb2xvcnNbbEluZGV4XVswXSAqIGxmcmFjdGlvbikgKyAobGluZUNvbG9yc1tySW5kZXhdWzBdICogcmZyYWN0aW9uKSk7XG5cdFx0dmFyIGcgPSBNYXRoLmZsb29yKChsaW5lQ29sb3JzW2xJbmRleF1bMV0gKiBsZnJhY3Rpb24pICsgKGxpbmVDb2xvcnNbckluZGV4XVsxXSAqIHJmcmFjdGlvbikpO1xuXHRcdHZhciBiID0gTWF0aC5mbG9vcigobGluZUNvbG9yc1tsSW5kZXhdWzJdICogbGZyYWN0aW9uKSArIChsaW5lQ29sb3JzW3JJbmRleF1bMl0gKiByZnJhY3Rpb24pKTtcblx0XHRcblx0XHRyZXR1cm4gJ3JnYignICsgciArICcsICcgKyBnICsgJywgJyArIGIgKyAnKSc7XG5cdH0sXG5cblxuXHRyZWRyYXdHcmFwaDpmdW5jdGlvbigpIHtcblx0XHR0aGlzLmRhdGFTZXRzID0gW107XG5cblx0XHRmb3IgKHZhciBvbmVTZXQgaW4gdGhpcy5zZXRzRmV0Y2hlZCkge1xuXHQgICBcdFx0dGhpcy5kYXRhU2V0cy5wdXNoKHRoaXMuc2V0c0ZldGNoZWRbb25lU2V0XSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5yZWJ1aWxkWEF4aXMoKTtcblxuXHRcdGlmIChTdHVkeURHcmFwaGluZy5jbGlja1dpZGdldCkge1xuXHRcdFx0U3R1ZHlER3JhcGhpbmcuY2xpY2tXaWRnZXQucmVtb3ZlKCk7XG5cdFx0fVxuXG5cdFx0aWYgKFN0dWR5REdyYXBoaW5nLmhpZ2hsaWdodGVkQ2xpY2tQb2ludCkge1xuXHRcdFx0U3R1ZHlER3JhcGhpbmcuaGlnaGxpZ2h0ZWRDbGlja1BvaW50LnJlbW92ZSgpO1xuXHRcdH1cblxuXHRcdHRoaXMucGxvdE9iamVjdCA9ICQucGxvdCh0aGlzLmdyYXBoRGl2LCB0aGlzLmRhdGFTZXRzLCB0aGlzLmdyYXBoT3B0aW9ucyk7XG5cdH0sXG5cblxuXHRyZWJ1aWxkWEF4aXM6ZnVuY3Rpb24oKSB7XG5cdFxuXHRcdHRoaXMudGlja0FycmF5ID0gW107XG5cblx0XHR0aGlzLmRhdGFTZXRzLmZvckVhY2goKHNlcmllcykgPT4ge1xuXHRcdFx0dmFyIGRpID0gMCwgdGkgPSAwLCBvbGRUaWNrQXJyYXkgPSB0aGlzLnRpY2tBcnJheSwgZCwgdDtcblx0XHRcdGlmIChzZXJpZXMuZGF0YSkge1xuXHRcdFx0XHR0aGlzLnRpY2tBcnJheSA9IFtdO1xuXHRcdFx0XHR3aGlsZSAoKGRpIDwgc2VyaWVzLmRhdGEubGVuZ3RoKSAmJiAodGkgPCBvbGRUaWNrQXJyYXkubGVuZ3RoKSkge1xuXHRcdFx0XHRcdGQgPSBwYXJzZUZsb2F0KHNlcmllcy5kYXRhW2RpXVswXSk7XG5cdFx0XHRcdFx0dCA9IG9sZFRpY2tBcnJheVt0aV1bMF07XG5cdFx0XHRcdFx0aWYgKGQgPCB0KSB7XG5cdFx0XHRcdFx0XHR0aGlzLnRpY2tBcnJheS5wdXNoKFtkLCBkXSk7XG5cdFx0XHRcdFx0XHRkaSsrO1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAodCA8IGQpIHtcblx0XHRcdFx0XHRcdHRoaXMudGlja0FycmF5LnB1c2goW3QsIG9sZFRpY2tBcnJheVt0aV1bMV1dKTtcblx0XHRcdFx0XHRcdHRpKys7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHRoaXMudGlja0FycmF5LnB1c2goW3QsIG9sZFRpY2tBcnJheVt0aV1bMV1dKTtcblx0XHRcdFx0XHRcdGRpKys7XG5cdFx0XHRcdFx0XHR0aSsrO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHR3aGlsZSAoZGkgPCBzZXJpZXMuZGF0YS5sZW5ndGgpIHtcblx0XHRcdFx0XHRkID0gcGFyc2VGbG9hdChzZXJpZXMuZGF0YVtkaV1bMF0pO1xuXHRcdFx0XHRcdHRoaXMudGlja0FycmF5LnB1c2goW2QsIGRdKTtcblx0XHRcdFx0XHRkaSsrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHdoaWxlICh0aSA8IG9sZFRpY2tBcnJheS5sZW5ndGgpIHtcblx0XHRcdFx0XHR0ID0gb2xkVGlja0FycmF5W3RpXVswXTtcblx0XHRcdFx0XHR0aGlzLnRpY2tBcnJheS5wdXNoKFt0LCBvbGRUaWNrQXJyYXlbdGldWzFdXSk7XG5cdFx0XHRcdFx0dGkrKztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdFxuXHRcdC8vIEVtYmVkIGl0IGluIHRoZSBvcHRpb25zIGZvciBldmVudHVhbCBwYXNzaW5nIHRocm91Z2ggZmxvdCBhbmQgaW50byB0aGUgY3VzdG9tIHRpY2sgZ2VuZXJhdG9yIGp1c3QgYmVsb3dcblx0XHR0aGlzLmdyYXBoT3B0aW9ucy54YXhpcy5mdWxsVGlja0FycmF5ID0gdGhpcy50aWNrQXJyYXk7XG5cdH0sXHRcblxuXG5cdHRpY2tHZW5lcmF0b3JGdW5jdGlvbjpmdW5jdGlvbihmdWxsYXhpcykge1xuXG5cdCAgICB2YXIgcmVzID0gW107XG5cdCAgICBpZiAoIWZ1bGxheGlzKSB7XG5cdFx0XHRjb25zb2xlLmxvZyhcIk5vIGZpcnN0IGFyZ3VtZW50IHBhc3NlZCB0byB0aGUgdGljayBnZW5lcmF0b3I/ICBTb21ldGhpbmcncyB3cm9uZyB3aXRoIGZsb3QuICBCZXR0ZXIgaW52ZXN0aWdhdGUuXCIpO1xuXHQgICAgXHRyZXR1cm4gcmVzO1xuXHRcdH1cblx0ICAgIGlmICghZnVsbGF4aXMub3B0aW9ucykge1xuXHRcdFx0Y29uc29sZS5sb2coXCJObyBvcHRpb25zIGluIHRoZSBhcmd1bWVudCBwYXNzZWQgdG8gdGhlIHRpY2sgZ2VuZXJhdG9yPyAgU29tZXRoaW5nJ3Mgd3Jvbmcgd2l0aCBmbG90LiAgQmV0dGVyIGludmVzdGlnYXRlLlwiKTtcblx0ICAgIFx0cmV0dXJuIHJlcztcblx0XHR9XG5cdCAgICBpZiAoIWZ1bGxheGlzLm9wdGlvbnMuY3VycmVudEdyYXBoRE9NT2JqZWN0KSB7XG5cdCAgICBcdHJldHVybiByZXM7XG5cdCAgICB9XG5cdCAgICB2YXIgZ3JhcGhEaXZXaWR0aCA9IGZ1bGxheGlzLm9wdGlvbnMuY3VycmVudEdyYXBoRE9NT2JqZWN0LndpZHRoKCk7XG5cdCAgICBpZiAoIWdyYXBoRGl2V2lkdGgpIHtcblx0ICAgIFx0cmV0dXJuIHJlcztcblx0ICAgIH1cblxuXHRcdHZhciBheGlzQXBlcnR1cmVTaXplID0gZnVsbGF4aXMubWF4IC0gZnVsbGF4aXMubWluO1xuXHRcdGlmIChheGlzQXBlcnR1cmVTaXplIDwgMSkge1x0Ly8gSWYgd2UncmUgZ3JhcGhpbmcgYW4gYXhpcyBvZiB6ZXJvIHdpZHRoLCBnaXZlIHVwXG5cdFx0XHRyZXR1cm4gcmVzO1xuXHRcdH1cblxuXHRcdC8vIEhlbSB0aGUgcmVnaW9uIGluIG9uIHRoZSByaWdodCBzaWRlIHRvIHByZXZlbnQgdGhlIGRpdnMgZnJvbSBkcmF3aW5nIG9mZnNjcmVlblxuXHRcdC8vIGFuZCBzdW1tb25pbmcgYSBob3Jpem9udGFsIHNjcm9sbGJhci5cblx0XHR2YXIgbWF4V2lkdGggPSBncmFwaERpdldpZHRoIC0gMjA7XG5cdFx0aWYgKG1heFdpZHRoIDwgNSkge1x0Ly8gTm8gc2Vuc2UgaW4gZHJhd2luZyBhIGdyYXBoIDUgcGl4ZWxzIHdpZGUhIVxuXHRcdFx0cmV0dXJuIHJlcztcblx0XHR9XG5cblx0XHQvLyAyNiBwaXhlbHMgaXMgYWJvdXQgaG93IG11Y2ggc2NyZWVuIHdpZHRoIHdlIG5lZWQgZm9yIGVhY2ggbGFiZWwuXG5cdFx0dmFyIHN0ZXBTaXplID0gMjY7XG5cdFx0dmFyIHRpY2tBcnJheSA9IGZ1bGxheGlzLm9wdGlvbnMuZnVsbFRpY2tBcnJheTtcblx0XHRpZiAoIXRpY2tBcnJheSkge1xuXHRcdFx0cmV0dXJuIHJlcztcblx0XHR9XG5cdFx0Ly8gd2lkdGggdmFyaWVzIGEgbG90OyBvbmUgY2hhcmFjdGVyIGlzIGFib3V0IDdweCwgc28gY29tcHV0ZSB0aGUgd2lkZXN0IGxhYmVsXG5cdFx0c3RlcFNpemUgPSB0aWNrQXJyYXkucmVkdWNlKChwLCB2KSA9PiB7IHJldHVybiBNYXRoLm1heChwLCB2WzFdLnRvU3RyaW5nKCkubGVuZ3RoICogNyk7IH0sIHN0ZXBTaXplKTtcblx0XHQvLyB0aWNrQXJyYXlMZW5ndGggaXMgdGhlIG51bWJlciBvZiB0aWNrcyBvbiB0aGUgYXhpcyB3ZSBoYXZlIHRvIGNob29zZSBmcm9tXG5cdFx0dmFyIHRpY2tBcnJheUxlbmd0aCA9IHRpY2tBcnJheS5sZW5ndGg7XG5cdFx0aWYgKHRpY2tBcnJheUxlbmd0aCA8IDEpIHtcblx0XHRcdHJldHVybiByZXM7XG5cdFx0fVxuXG5cdFx0Ly8gVGhpcyBjb2RlIHBlcmZvcm1zIGEgYmluYXJ5IHNlYXJjaCBkb3duIGludG8gdGhlIGFycmF5LFxuXHRcdC8vIGh1bnRpbmcgZm9yIHRoZSBjbG9zZXN0IG1hdGNoIHRvIHRoZSBnaXZlbiB2YWx1ZVxuXHRcdC8vICh0aGUgbGVmdCBlZGdlIG9mIHRoZSByZWdpb24gd2UgYXJlIHRyeWluZyB0byBwbGFjZSBhIHRpY2sgaW4pXG5cblx0XHR2YXIgYXBlcnR1cmVMZWZ0RWRnZSA9IDA7XG5cdFx0dmFyIGkgPSAwO1xuXHRcdHZhciBwcmV2SSA9IC0xO1xuXG5cdFx0Ly8gSGludDogSWYgdGhpcyBnaXZlcyBiaXphcnJlIHJlc3VsdHMsIG1ha2Ugc3VyZSB5b3UgaGF2ZSBldmVyeXRoaW5nXG5cdFx0Ly8gY2FzdGVkIHRvIGZsb2F0cyBvciBpbnRzLCBpbnN0ZWFkIG9mIHN0cmluZ3MuXG5cblx0XHRkbyB7XG5cblx0XHRcdHZhciB0aWNrQXJyYXlTdGVwU2l6ZSA9ICh0aWNrQXJyYXlMZW5ndGggLSBpKSAvIDI7XG5cdFx0XHR2YXIgaSA9IHRpY2tBcnJheVN0ZXBTaXplICsgaTtcblx0XHRcdGRvIHtcblx0XHRcdFx0dmFyIHYgPSB0aWNrQXJyYXlbTWF0aC5mbG9vcihpKV1bMF07XG5cdFx0XHRcdHRpY2tBcnJheVN0ZXBTaXplID0gdGlja0FycmF5U3RlcFNpemUgLyAyO1xuXHRcdFx0XHRpZiAoKCh2IC0gZnVsbGF4aXMubWluKSAqIChncmFwaERpdldpZHRoIC8gYXhpc0FwZXJ0dXJlU2l6ZSkpID4gYXBlcnR1cmVMZWZ0RWRnZSkge1xuXHRcdFx0XHRcdGkgPSBpIC0gdGlja0FycmF5U3RlcFNpemU7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0aSA9IGkgKyB0aWNrQXJyYXlTdGVwU2l6ZTtcblx0XHRcdFx0fVxuLy9cdFx0XHRcdGNvbnNvbGUubG9nKFwidjogXCIgKyB2ICsgXCIgaTogXCIgKyBpICsgXCIgdGlja0FycmF5U3RlcFNpemU6IFwiICsgdGlja0FycmF5U3RlcFNpemUpO1x0XHRcdFx0XG5cdFx0XHR9IHdoaWxlICh0aWNrQXJyYXlTdGVwU2l6ZSA+IDAuNCk7XG5cblx0XHRcdC8vIFRoZSBpbmRleCBpcyBtZWFudCB0byBlbmQgdXAgcG9pbnRpbmcgYmV0d2VlbiB0aGUgdHdvIHZhbHVlcyBvbiBlaXRoZXIgc2lkZVxuXHRcdFx0Ly8gb2Ygb3VyIHRhcmdldCwgYnV0IG1heSBiZSBvZmYgYnkgb25lIHZhbHVlIHdoZW4gd2UgcXVpdCBzZWFyY2hpbmcgZHVlIHRvIGFcblx0XHRcdC8vIHJvdW5kaW5nIGlzc3VlLiAgU28gd2UgdGFrZSB0aGUgZmxvb3IgYW5kIHRlc3QgdGhhdCB2YWx1ZSwgYW5kIGNob29zZSB0aGUgb25lXG5cdFx0XHQvLyBqdXN0IGhpZ2hlciBpZiBpdCdzIHRvbyBsb3cuXG5cdFx0XHRpID0gTWF0aC5mbG9vcihpKTtcblx0XHRcdGlmICgoKHRpY2tBcnJheVtpXVswXSAtIGZ1bGxheGlzLm1pbikgKiAoZ3JhcGhEaXZXaWR0aCAvIGF4aXNBcGVydHVyZVNpemUpKSA8IGFwZXJ0dXJlTGVmdEVkZ2UpIHtcblx0XHRcdFx0aSA9IGkgKyAxO1xuXHRcdFx0fVxuXHRcblx0XHRcdC8vIElmLCBieSBzZWVraW5nIHRoZSBoaWdoZXIgdmFsdWUsIHdlIGVuZCB1cCBvZmYgdGhlIGVuZCBvZiB0aGUgYXJyYXksIHRoZW5cblx0XHRcdC8vIHRoZXJlIGFyZSBubyBtb3JlIHZhbHVlcyB3ZSBjYW4gYWRkLlxuXHRcdFx0aWYgKGkgPj0gdGlja0FycmF5TGVuZ3RoKSB7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0XG5cdFx0XHRyZXMucHVzaChbdGlja0FycmF5W2ldWzBdLCB0aWNrQXJyYXlbaV1bMV1dKTtcblx0XG5cdFx0XHQvLyBUYWtlIHRoZSBsb2NhdGlvbiBvZiB0aGlzIHRpY2ssIHBsdXMgb3VyIHNjYWxlZCBzcGFjZXIsIGFuZCB1c2UgdGhhdCBhcyB0aGVcblx0XHRcdC8vIG5ldyBsZWZ0IGVkZ2Ugb2Ygb3VyIHRpY2sgc2VhcmNoLlxuXHRcdFx0YXBlcnR1cmVMZWZ0RWRnZSA9ICgodGlja0FycmF5W2ldWzBdIC0gZnVsbGF4aXMubWluKSAqIChncmFwaERpdldpZHRoIC8gYXhpc0FwZXJ0dXJlU2l6ZSkpICsgc3RlcFNpemU7XG5cbi8vXHRcdFx0Y29uc29sZS5sb2coXCJ2YWw6IFwiICsgdGlja0FycmF5W2ldWzBdICsgXCIgZWRnZTogXCIgKyBhcGVydHVyZUxlZnRFZGdlKTtcdFx0XHRcdFxuXG5cdFx0XHQvLyBJZiwgZm9yIGFueSByZWFzb24sIHdlIGVuZCB1cCBvbiB0aGUgc2FtZSBpbmRleCB0d2ljZSBpbiBhIHJvdyxcblx0XHRcdC8vIGJhaWwgb3V0IHRvIHByZXZlbnQgYW4gaW5maW5pdGUgbG9vcC5cblx0XHRcdGlmIChpID09IHByZXZJKSB7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXG5cdFx0XHRwcmV2SSA9IGk7XG5cblx0XHR9IHdoaWxlIChhcGVydHVyZUxlZnRFZGdlIDwgbWF4V2lkdGgpO1xuXG5cdFx0cmV0dXJuIHJlcztcblx0fSxcblx0XG4gICAgXG4gICAgaG92ZXJGdW5jdGlvbjpmdW5jdGlvbihldmVudCwgcG9zLCBpdGVtKSB7XG5cdFx0aWYgKGl0ZW0pIHtcblx0XHRcdGlmICgoU3R1ZHlER3JhcGhpbmcucHJldmlvdXNIb3ZlclBvaW50ICE9IGl0ZW0uZGF0YUluZGV4KSB8fFxuXHRcdFx0XHQoU3R1ZHlER3JhcGhpbmcucHJldmlvdXNIb3ZlclBvaW50U2VyaWVzICE9IGl0ZW0uc2VyaWVzKSkge1xuXHRcdFx0XHRcblx0XHRcdFx0U3R1ZHlER3JhcGhpbmcucHJldmlvdXNIb3ZlclBvaW50ID0gaXRlbS5kYXRhSW5kZXg7XG5cdFx0XHRcdFN0dWR5REdyYXBoaW5nLnByZXZpb3VzSG92ZXJQb2ludFNlcmllcyA9IGl0ZW0uc2VyaWVzO1xuXG5cdFx0XHRcdGlmIChTdHVkeURHcmFwaGluZy5ob3ZlcldpZGdldCkge1xuXHRcdFx0XHRcdFN0dWR5REdyYXBoaW5nLmhvdmVyV2lkZ2V0LnJlbW92ZSgpO1xuXHRcdFx0XHRcdFN0dWR5REdyYXBoaW5nLmhvdmVyV2lkZ2V0ID0gbnVsbDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmICgoU3R1ZHlER3JhcGhpbmcucHJldmlvdXNDbGlja1BvaW50ICE9IFN0dWR5REdyYXBoaW5nLnByZXZpb3VzSG92ZXJQb2ludCkgfHxcblx0XHRcdFx0XHQoU3R1ZHlER3JhcGhpbmcucHJldmlvdXNDbGlja1BvaW50U2VyaWVzICE9IFN0dWR5REdyYXBoaW5nLnByZXZpb3VzSG92ZXJQb2ludFNlcmllcykpIHtcblx0XG5cdFx0XHRcdFx0U3R1ZHlER3JhcGhpbmcuaG92ZXJXaWRnZXQgPSBTdHVkeURHcmFwaGluZy5jcmVhdGVXaWRnZXQoJ2dyYXBoSG92ZXJXaWRnZXQnLCBpdGVtKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cblx0XHRcdGlmIChTdHVkeURHcmFwaGluZy5ob3ZlcldpZGdldCkge1xuXHRcdFx0XHRTdHVkeURHcmFwaGluZy5ob3ZlcldpZGdldC5yZW1vdmUoKTtcblx0XHRcdFx0U3R1ZHlER3JhcGhpbmcuaG92ZXJXaWRnZXQgPSBudWxsO1xuXHRcdFx0fVxuXG5cdFx0XHRTdHVkeURHcmFwaGluZy5wcmV2aW91c0hvdmVyUG9pbnQgPSBudWxsOyAgICAgICAgICAgIFxuXHRcdFx0U3R1ZHlER3JhcGhpbmcucHJldmlvdXNIb3ZlclBvaW50U2VyaWVzID0gbnVsbDsgICAgICAgICAgICBcblx0XHR9XG4gICAgfSxcbiAgICBcbiAgICBcblx0cGxvdENsaWNrRnVuY3Rpb246ZnVuY3Rpb24oZXZlbnQsIHBvcywgaXRlbSkge1xuICAgICAgICBpZiAoaXRlbSkge1xuXHRcdFx0Ly8gSWYgd2UncmUgcmUtY2xpY2tpbmcgYSBjdXJyZW50IGl0ZW1cblx0XHRcdGlmICgoU3R1ZHlER3JhcGhpbmcucHJldmlvdXNDbGlja1BvaW50ID09IGl0ZW0uZGF0YUluZGV4KSAmJlxuXHRcdFx0XHQoU3R1ZHlER3JhcGhpbmcucHJldmlvdXNDbGlja1BvaW50U2VyaWVzID09IGl0ZW0uc2VyaWVzKSkge1xuXG5cdFx0XHRcdFN0dWR5REdyYXBoaW5nLnByZXZpb3VzQ2xpY2tQb2ludCA9IG51bGw7XG5cdFx0XHRcdFN0dWR5REdyYXBoaW5nLnByZXZpb3VzQ2xpY2tQb2ludFNlcmllcyA9IG51bGw7XG5cblx0XHRcdFx0aWYgKFN0dWR5REdyYXBoaW5nLmNsaWNrV2lkZ2V0KSB7XG5cdFx0XHRcdFx0U3R1ZHlER3JhcGhpbmcuY2xpY2tXaWRnZXQucmVtb3ZlKCk7XG5cdFx0XHRcdFx0U3R1ZHlER3JhcGhpbmcuY2xpY2tXaWRnZXQgPSBudWxsO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKFN0dWR5REdyYXBoaW5nLmhpZ2hsaWdodGVkQ2xpY2tQb2ludCkge1xuXHRcdFx0XHRcdFN0dWR5REdyYXBoaW5nLmhpZ2hsaWdodGVkQ2xpY2tQb2ludC5yZW1vdmUoKTtcblx0XHRcdFx0XHRTdHVkeURHcmFwaGluZy5oaWdobGlnaHRlZENsaWNrUG9pbnQgPSBudWxsO1xuXHRcdFx0XHR9XG5cblx0XHRcdC8vIElmIHdlJ3JlIGNsaWNraW5nIGEgbmV3IGl0ZW1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFN0dWR5REdyYXBoaW5nLnByZXZpb3VzQ2xpY2tQb2ludCA9IGl0ZW0uZGF0YUluZGV4O1xuXHRcdFx0XHRTdHVkeURHcmFwaGluZy5wcmV2aW91c0NsaWNrUG9pbnRTZXJpZXMgPSBpdGVtLnNlcmllcztcblxuXHRcdFx0XHRpZiAoU3R1ZHlER3JhcGhpbmcuY2xpY2tXaWRnZXQpIHtcblx0XHRcdFx0XHRTdHVkeURHcmFwaGluZy5jbGlja1dpZGdldC5yZW1vdmUoKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChTdHVkeURHcmFwaGluZy5oaWdobGlnaHRlZENsaWNrUG9pbnQpIHtcblx0XHRcdFx0XHRTdHVkeURHcmFwaGluZy5oaWdobGlnaHRlZENsaWNrUG9pbnQucmVtb3ZlKCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRTdHVkeURHcmFwaGluZy5oaWdobGlnaHRlZENsaWNrUG9pbnQgPSBTdHVkeURHcmFwaGluZy5jcmVhdGVQb2ludFNlbGVjdGlvbk92ZXJsYXkoJ2dyYXBoQ2xpY2tNYXJrZXInLCBpdGVtKTtcblxuXHRcdFx0XHRTdHVkeURHcmFwaGluZy5jbGlja1dpZGdldCA9IFN0dWR5REdyYXBoaW5nLmNyZWF0ZVdpZGdldCgnZ3JhcGhDbGlja1dpZGdldCcsIGl0ZW0pO1xuXHRcdFx0fVxuICAgICAgICB9XG4gICAgfSxcblxuICAgICAgIFxuICAgIGNyZWF0ZVBvaW50U2VsZWN0aW9uT3ZlcmxheTpmdW5jdGlvbih3aWRnZXRTdHlsZSwgaXRlbSkge1xuXG5cdFx0dmFyIHR4ID0gaXRlbS5wYWdlWCAtIDY7XG5cdFx0dmFyIHR5ID0gaXRlbS5wYWdlWSAtIDY7XG5cblx0XHR2YXIgcHRDb2xvciA9ICdyZ2JhKDg4LDg4LDg4LDEpJztcblxuXHRcdGlmIChpdGVtLnNlcmllcy5jb2xvcikge1xuICAgICAgICAgICAgcHRDb2xvciA9ICQuY29sb3IucGFyc2UoaXRlbS5zZXJpZXMuY29sb3IpLnNjYWxlKCdhJywgMC41KS50b1N0cmluZygpO1xuXHRcdH1cblxuXHRcdHZhciBzdmdTdHJpbmcgPSAnPHN2ZyBpZD1cIicgKyB3aWRnZXRTdHlsZSArICdwXCIgeG1sbnM9XCJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2Z1wiIHZlcnNpb249XCIxLjJcIicgK1xuXHRcdFx0XHQnIHdpZHRoPVwiMTJweFwiIGhlaWdodD1cIjEycHhcIiB2aWV3Qm94PVwiMCAwIDEyIDEyXCIgcHJlc2VydmVBc3BlY3RSYXRpbz1cIm5vbmVcIicgK1xuXHRcdFx0XHQnIHN0eWxlPVwicG9zaXRpb246IGFic29sdXRlO3RvcDonICsgdHkgKyAnO2xlZnQ6JyArIHR4ICsgJztcIj4nICtcblx0XHRcdFx0JzxkZWZzPicgK1xuXHRcdFx0XHRcdCc8cmFkaWFsR3JhZGllbnQgaWQ9XCJnMVwiIGN4PVwiNTAlXCIgY3k9XCI1MCVcIiByPVwiNTAlXCI+JyArXG5cdFx0XHRcdFx0XHQnPHN0b3Agc3RvcC1jb2xvcj1cIicgKyBwdENvbG9yICsgJ1wiIG9mZnNldD1cIjAlXCIgLz4nICtcblx0XHRcdFx0XHRcdCc8c3RvcCBzdG9wLWNvbG9yPVwid2hpdGVcIiBvZmZzZXQ9XCIxMDAlXCIgLz4nICtcblx0XHRcdFx0XHQnPC9yYWRpYWxHcmFkaWVudD4nICtcblx0XHRcdFx0JzwvZGVmcz4nICtcblx0XHRcdFx0JzxsaW5lIHgxPVwiNi41XCIgeTE9XCI2LjVcIiB4Mj1cIjExLjVcIiB5Mj1cIjExLjVcIiBzdHJva2U9XCJibGFja1wiIHN0cm9rZS13aWR0aD1cIjJcIiAvPicgK1xuXHRcdFx0XHQnPGNpcmNsZSBpZD1cImMxXCIgY3g9XCI2LjVcIiBjeT1cIjYuNVwiIHI9XCI1XCIgc3Ryb2tlPVwiYmxhY2tcIiBzdHJva2Utd2lkdGg9XCIxXCIgZmlsbD1cInVybCgjZzEpXCIgLz4nICtcblx0XHRcdCc8L3N2Zz4nO1xuXG4gICAgICAgIHZhciBuZXdQdCA9ICQoc3ZnU3RyaW5nKTtcblxuXHRcdG5ld1B0LmFwcGVuZFRvKFwiYm9keVwiKTtcblxuXHRcdHJldHVybiBuZXdQdDtcbiAgICB9LCAgIFxuXG5cbiAgICBjcmVhdGVXaWRnZXQ6ZnVuY3Rpb24od2lkZ2V0U3R5bGUsIGl0ZW0pIHtcblxuXHRcdHZhclx0eSA9IGl0ZW0uZGF0YXBvaW50WzFdO1xuXHRcdHZhciB0ZW1wZGVzY3JpcHRpb24gPSAnJztcblx0XHRpZiAoaXRlbS5zZXJpZXMubmFtZSkge1xuXHRcdFx0dGVtcGRlc2NyaXB0aW9uID0gaXRlbS5zZXJpZXMubmFtZSArICc8YnI+Jztcblx0XHR9XG5cdFx0aWYgKGl0ZW0uc2VyaWVzLm1lYXN1cmVtZW50bmFtZSkge1xuXHRcdFx0dGVtcGRlc2NyaXB0aW9uID0gIHRlbXBkZXNjcmlwdGlvbiArIGl0ZW0uc2VyaWVzLm1lYXN1cmVtZW50bmFtZSArICc6ICc7XG5cdFx0fVxuXG5cdFx0dmFyIHRlbXB1bml0cyA9ICcnO1xuXHRcdGlmIChpdGVtLnNlcmllcy51bml0cykge1xuXHRcdFx0dGVtcHVuaXRzID0gaXRlbS5zZXJpZXMudW5pdHM7XG5cdFx0fVxuXHRcdHZhciB0ZW1wbGFiZWwgPSB0ZW1wZGVzY3JpcHRpb24gKyAnPEI+JyArIHkgKyAnPC9CPiAnICsgdGVtcHVuaXRzO1xuXHRcdHZhciB0ZW1wdGFnID0gJyc7XG5cdFx0aWYgKGl0ZW0uc2VyaWVzLnRhZ3MpIHtcblx0XHRcdGlmIChpdGVtLnNlcmllcy50YWdzW2l0ZW0uZGF0YUluZGV4XSkge1xuXHRcdFx0XHR0ZW1wdGFnID0gaXRlbS5zZXJpZXMudGFnc1tpdGVtLmRhdGFJbmRleF1bMV07XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmICh0ZW1wdGFnICE9ICcnKSB7XG5cdFx0XHR0ZW1wbGFiZWwgPSB0ZW1wbGFiZWwgKyAnPGJyPicgKyB0ZW1wdGFnO1xuXHRcdH1cblxuXHRcdHZhciB0eCA9IGl0ZW0ucGFnZVggKyA1O1xuXHRcdHZhciB0eSA9IGl0ZW0ucGFnZVkgKyA1O1xuXG4gICAgICAgIHZhciBuZXdUaXAgPSAkKCc8ZGl2IGlkPVwiJyArIHdpZGdldFN0eWxlICsgJ3RcIiBjbGFzcz1cIicgKyB3aWRnZXRTdHlsZSArICdcIj4nICsgdGVtcGxhYmVsICsgJzwvZGl2PicpO1xuXG5cdFx0Ly8gV2Ugd2lsbCBwbGFjZSB0aGUgdG9vbHRpcCBpbiB0aGUgbG9jYXRpb24gc3BlY2lmaWVkLCB1bmxlc3Ncblx0XHQvLyB0aGUgcmVuZGVyZWQgd2lkdGggb2YgdGhlIGNvbnRlbnQgcnVucyBvZmYgcmlnaHQgZWRnZSxcblx0XHQvLyBpbiB3aGljaCBjYXNlIHdlIHdpbGwgc2hpZnQgaXQgbGVmdCB0byBiZSBmbHVzaCB3aXRoIHRoZSByaWdodC1lZGdlIG9mIHRoZSB3aW5kb3csXG5cdFx0Ly8gYW5kIHJlLXdyaXRlIHRoZSB3aWR0aCBvZiB0aGUgYm94IHNvIGl0IGNvbmZvcm1zIHRvIHRoZSB3cmFwcGluZyBvZiB0aGUgdGV4dC5cblxuICAgICAgICBuZXdUaXAuY3NzKCB7XG4gICAgICAgICAgICB0b3A6IHR5LFxuICAgICAgICAgICAgbGVmdDogdHhcbiAgICAgICAgfSk7XG5cblx0XHRpZiAoaXRlbS5zZXJpZXMuY29sb3IpIHtcblx0ICAgICAgICBuZXdUaXAuY3NzKCB7ICdjb2xvcic6IGl0ZW0uc2VyaWVzLmNvbG9yIH0pO1xuXHRcdH1cblxuXHRcdG5ld1RpcC5hcHBlbmRUbyhcImJvZHlcIik7XG5cblx0XHR2YXIgbmV3VGlwRWwgPSA8YW55PmRvY3VtZW50LmdldEVsZW1lbnRCeUlkKHdpZGdldFN0eWxlICsgXCJ0XCIpO1xuXHRcdHZhciBuZXdUaXBXaWR0aCA9IG5ld1RpcEVsLmNsaWVudFdpZHRoO1xuXG5cdFx0aWYgKCh0eCArIG5ld1RpcFdpZHRoICsgMjApID4gd2luZG93LmlubmVyV2lkdGgpIHtcblx0XHRcdC8vIHRvb2x0aXAgb24gbGVmdCBoYW5kIHNpZGUsIG5hc3R5IGhhY2sgdG8gc2hpZnQgdGhlIGxhYmVsXG5cdFx0XHRuZXdUaXBFbC5zdHlsZS53aWR0aCA9IChuZXdUaXBXaWR0aCsyKSArIFwicHhcIjtcblx0XHRcdG5ld1RpcEVsLnN0eWxlLmxlZnQgPSAodHggLSBuZXdUaXBXaWR0aCkgKyBcInB4XCI7XG5cdFx0fVxuXHRcdHJldHVybiBuZXdUaXA7XG4gICAgfVxufTtcblxuXG4iXX0=