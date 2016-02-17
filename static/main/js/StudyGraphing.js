// Compiled to JS on: Wed Feb 17 2016 14:46:19  
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiU3R1ZHlHcmFwaGluZy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIlN0dWR5R3JhcGhpbmcudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsZ0RBQWdEO0FBQ2hELElBQUksY0FBa0IsQ0FBQztBQUN2QixjQUFjLEdBQUc7SUFFaEIsUUFBUSxFQUFDLElBQUk7SUFDYixVQUFVLEVBQUMsSUFBSTtJQUVaLFFBQVEsRUFBQyxFQUFFO0lBQ1gsU0FBUyxFQUFDLEVBQUU7SUFFZixXQUFXLEVBQUMsSUFBSTtJQUNoQixrQkFBa0IsRUFBQyxJQUFJO0lBQ3ZCLHdCQUF3QixFQUFDLElBQUk7SUFFN0IsV0FBVyxFQUFDLElBQUk7SUFDaEIsa0JBQWtCLEVBQUMsSUFBSTtJQUN2Qix3QkFBd0IsRUFBQyxJQUFJO0lBQzdCLHFCQUFxQixFQUFDLElBQUk7SUFFMUIsV0FBVyxFQUFDLEVBQUU7SUFDZCxRQUFRLEVBQUMsRUFBRTtJQUNYLFNBQVMsRUFBQyxDQUFDO0lBRVgsWUFBWSxFQUFDO1FBQ1osTUFBTSxFQUFFO1lBQ1AsS0FBSyxFQUFFO2dCQUNWLGtCQUFrQjtnQkFDZCxJQUFJLEVBQUUsSUFBSTthQUNWO1lBQ0QsTUFBTSxFQUFFO2dCQUNQLElBQUksRUFBRSxJQUFJO2dCQUNWLE1BQU0sRUFBRSxHQUFHO2FBQ1g7WUFDRCxVQUFVLEVBQUUsQ0FBQztTQUNiO1FBQ0QsSUFBSSxFQUFFO1lBQ0wsU0FBUyxFQUFFLElBQUk7WUFDZixTQUFTLEVBQUUsSUFBSTtZQUNmLGFBQWEsRUFBRSxJQUFJO1lBQ25CLGVBQWUsRUFBRSxNQUFNO1lBQ3ZCLFdBQVcsRUFBRSxNQUFNO1NBQ25CO1FBQ0QsU0FBUyxFQUFFO1lBQ1YsSUFBSSxFQUFFLEdBQUc7U0FDVDtRQUNELEtBQUssRUFBRTtZQUNOLGFBQWEsRUFBQyxFQUFFO1lBQ2hCLHFCQUFxQixFQUFDLElBQUk7U0FDMUI7UUFDRCxLQUFLLEVBQUU7WUFDTixTQUFTLEVBQUUsQ0FBQyxDQUFDLEVBQUUs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QUFFLEVBQUMsR0FBRyxFQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFDLEdBQUcsRUFBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEdBQUcsRUFBQyxHQUFHLEVBQUMsQ0FBQyxDQUFDO1lBQzdFLENBQUMsR0FBRyxFQUFDLEdBQUcsRUFBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEdBQUcsRUFBQyxFQUFFLEVBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxHQUFHLEVBQUMsRUFBRSxFQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsR0FBRyxFQUFDLEVBQUUsRUFBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEdBQUcsRUFBQyxFQUFFLEVBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxHQUFHLEVBQUMsRUFBRSxFQUFDLEdBQUcsQ0FBQztZQUM5RSxDQUFDLEVBQUUsRUFBQyxFQUFFLEVBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUMsRUFBRSxFQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFDLEVBQUUsRUFBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBQyxFQUFFLEVBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUMsR0FBRyxFQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFDLEdBQUcsRUFBQyxHQUFHLENBQUMsQ0FBQyxDQUFDO1FBRWhGLGtDQUFrQztRQUNsQyxFQUFFLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUM7UUFBQyxDQUFDO1FBRTdCLHlDQUF5QztRQUN6QyxFQUFFLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUM7UUFBQyxDQUFDO1FBRTdCLEVBQUUsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ1gsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQywwQkFBMEI7UUFD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RyxJQUFJLENBQUM7WUFDOUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxJQUFJLEdBQUcsQ0FBQyxFQUFFLEdBQUcsV0FBVyxDQUFDLEdBQUcsSUFBSSxDQUFDO1FBQ2pELENBQUM7UUFDRCxNQUFNLENBQUMsTUFBTSxDQUFDO0lBQ1osQ0FBQztDQUNKLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIvLyBDb21waWxlZCB0byBKUyBvbjogV2VkIEZlYiAxNyAyMDE2IDE0OjQ2OjE5ICBcbnZhciBTdHVkeURHcmFwaGluZzphbnk7XG5TdHVkeURHcmFwaGluZyA9IHtcblxuXHRncmFwaERpdjpudWxsLFxuXHRwbG90T2JqZWN0Om51bGwsXG5cbiAgICBkYXRhU2V0czpbXSxcbiAgICB0aWNrQXJyYXk6W10sXG5cblx0aG92ZXJXaWRnZXQ6bnVsbCxcblx0cHJldmlvdXNIb3ZlclBvaW50Om51bGwsXG5cdHByZXZpb3VzSG92ZXJQb2ludFNlcmllczpudWxsLFxuXG5cdGNsaWNrV2lkZ2V0Om51bGwsXG5cdHByZXZpb3VzQ2xpY2tQb2ludDpudWxsLFxuXHRwcmV2aW91c0NsaWNrUG9pbnRTZXJpZXM6bnVsbCxcblx0aGlnaGxpZ2h0ZWRDbGlja1BvaW50Om51bGwsXG5cblx0c2V0c0ZldGNoZWQ6e30sXG5cdGF4ZXNTZWVuOnt9LFxuXHRheGVzQ291bnQ6MCxcblxuXHRncmFwaE9wdGlvbnM6e1xuXHRcdHNlcmllczoge1xuXHRcdFx0bGluZXM6IHtcbi8vXHRcdFx0XHRzdGVwczogdHJ1ZSxcblx0XHRcdFx0c2hvdzogdHJ1ZVxuXHRcdFx0fSxcblx0XHRcdHBvaW50czoge1xuXHRcdFx0XHRzaG93OiB0cnVlLFxuXHRcdFx0XHRyYWRpdXM6IDEuNSxcblx0XHRcdH0sXG5cdFx0XHRzaGFkb3dTaXplOiAwXG5cdFx0fSxcblx0XHRncmlkOiB7XG5cdFx0XHRob3ZlcmFibGU6IHRydWUsXG5cdFx0XHRjbGlja2FibGU6IHRydWUsXG5cdFx0XHRhdXRvSGlnaGxpZ2h0OiB0cnVlLFxuXHRcdFx0YmFja2dyb3VuZENvbG9yOiBcIiNGRkZcIixcblx0XHRcdGJvcmRlckNvbG9yOiBcIiNFRUVcIlxuXHRcdH0sXG5cdFx0Y3Jvc3NoYWlyOiB7XG5cdFx0XHRtb2RlOiBcInhcIlxuXHRcdH0sXG5cdFx0eGF4aXM6IHtcblx0XHRcdGZ1bGxUaWNrQXJyYXk6W10sXHQvLyBUaGlzIGlzIGhlcmUgc28gdGhhdCBmbG90IHdpbGwgcGFzcyBpdCBiYWNrIHRvIHVzIGluIGEgY2FsbGJhY2tcblx0XHRcdGN1cnJlbnRHcmFwaERPTU9iamVjdDpudWxsXG5cdFx0fSxcblx0XHR5YXhpczoge1xuXHRcdFx0em9vbVJhbmdlOiBbMSwgMV1cblx0XHR9LFxuXHRcdHpvb206IHtcblx0XHRcdGludGVyYWN0aXZlOiBmYWxzZVxuXHRcdH0sXG5cdFx0cGFuOiB7XG5cdFx0XHRpbnRlcmFjdGl2ZTogZmFsc2Vcblx0XHR9LFxuXHRcdGxlZ2VuZDoge1xuXHRcdFx0c2hvdzogZmFsc2Vcblx0XHR9XG5cdH0sXG5cblxuXHRTZXR1cDpmdW5jdGlvbihncmFwaGRpdikge1xuXHRcdGlmIChncmFwaGRpdikge1xuXHRcdFx0dGhpcy5ncmFwaERpdiA9ICQoXCIjXCIgKyBncmFwaGRpdik7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuZ3JhcGhEaXYgPSAkKFwiI2dyYXBoRGl2XCIpO1x0XG5cdFx0fVxuXHRcblx0XHR0aGlzLmdyYXBoRGl2LmJpbmQoXCJwbG90aG92ZXJcIiwgdGhpcy5ob3ZlckZ1bmN0aW9uKTtcblx0XHR0aGlzLmdyYXBoRGl2LmJpbmQoXCJwbG90Y2xpY2tcIiwgdGhpcy5wbG90Q2xpY2tGdW5jdGlvbik7XG5cdFx0dGhpcy5ncmFwaE9wdGlvbnMueGF4aXMudGlja3MgPSB0aGlzLnRpY2tHZW5lcmF0b3JGdW5jdGlvbjtcblx0XHR0aGlzLmdyYXBoT3B0aW9ucy54YXhpcy5jdXJyZW50R3JhcGhET01PYmplY3QgPSB0aGlzLmdyYXBoRGl2O1xuXG5cdFx0dGhpcy5ncmFwaE9wdGlvbnMueWF4ZXMgPSBbXTsgLy8gRGVmYXVsdDogU2hvdyAxIHkgYXhpcywgZml0IGFsbCBkYXRhIHRvIGl0LlxuXG5cdFx0dGhpcy5wbG90T2JqZWN0ID0gJC5wbG90KHRoaXMuZ3JhcGhEaXYsIHRoaXMuZGF0YVNldHMsIHRoaXMuZ3JhcGhPcHRpb25zKTtcblx0fSxcblxuXG5cdGNsZWFyQWxsU2V0czpmdW5jdGlvbigpIHtcblxuXHRcdHRoaXMuZ3JhcGhPcHRpb25zLnlheGVzID0gW107XG5cdFx0dGhpcy5heGVzU2VlbiA9IHt9O1xuXHRcdHRoaXMuYXhlc0NvdW50ID0gMDtcblx0XHR0aGlzLnNldHNGZXRjaGVkID0ge307XG5cdH0sXG5cdFxuXG5cdGFkZE5ld1NldDpmdW5jdGlvbihuZXdTZXQpIHtcblxuXHRcdGlmICghbmV3U2V0LmxhYmVsKSB7XG5cdFx0XHQkKCcjZGVidWcnKS50ZXh0KCdGYWlsZWQgdG8gZmV0Y2ggc2VyaWVzLicpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHZhciBsZWZ0QXhpcyA9IHsgICBzaG93OiB0cnVlLCBwb3NpdGlvbjpcImxlZnRcIiB9O1xuXHRcdHZhciByaWdodEF4aXMgPSB7ICAgc2hvdzogdHJ1ZSwgcG9zaXRpb246XCJyaWdodFwiIH07XG5cdFx0dmFyIGJsYW5rQXhpcyA9IHsgICBzaG93OiBmYWxzZSB9O1xuXG5cdFx0Ly8gSWYgd2UgZ2V0IGFueSBkYXRhIHNldHMgdGhhdCBhcmUgbm90IGFzc2lnbmVkIHRvIHRoZSBkZWZhdWx0IHkgYXhpcyAob3IgeSBheGlzIDEpLFxuXHRcdC8vIHRoZW4gd2UgbmVlZCB0byBjcmVhdGUgYSBzZXQgb2YgXCJoaWRkZW5cIiB5IGF4aXMgb2JqZWN0cyBpbiB0aGUgZ3JhcGhPcHRpb25zIHRvXG5cdFx0Ly8gaW5mb3JtIGZsb3QuXG5cdFx0aWYgKG5ld1NldC55YXhpc0J5TWVhc3VyZW1lbnRUeXBlSUQpIHtcblx0XHRcdGlmICh0eXBlb2YgdGhpcy5heGVzU2VlbltuZXdTZXQueWF4aXNCeU1lYXN1cmVtZW50VHlwZUlEXSA9PT0gXCJ1bmRlZmluZWRcIikge1xuXHRcdFx0XHR0aGlzLmF4ZXNDb3VudCsrO1xuXHRcdFx0XHR0aGlzLmF4ZXNTZWVuW25ld1NldC55YXhpc0J5TWVhc3VyZW1lbnRUeXBlSURdID0gdGhpcy5heGVzQ291bnQ7XG5cdFx0XHR9XG5cdFx0XHQvLyBUaGlzIGhhcyB0aGUgZWZmZWN0IG9mIHJlbWFraW5nIHRoZSBudW1iZXJzIGJ5IHRoZSBzZXF1ZW5jZSBlbmNvdW50ZXJlZFxuXHRcdFx0bmV3U2V0LnlheGlzID0gdGhpcy5heGVzU2VlbltuZXdTZXQueWF4aXNCeU1lYXN1cmVtZW50VHlwZUlEXTtcblxuXHRcdFx0d2hpbGUgKHRoaXMuZ3JhcGhPcHRpb25zLnlheGVzLmxlbmd0aCA8IG5ld1NldC55YXhpcykge1xuXHRcdFx0XHR2YXIgY2hvc2VuQXhpczphbnkgPSBsZWZ0QXhpcztcblx0XHRcdFx0aWYgKHRoaXMuZ3JhcGhPcHRpb25zLnlheGVzLmxlbmd0aCA+IDEpIHtcblx0XHRcdFx0XHRjaG9zZW5BeGlzID0gYmxhbmtBeGlzO1xuXHRcdFx0XHR9IGVsc2UgaWYgKHRoaXMuZ3JhcGhPcHRpb25zLnlheGVzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHRjaG9zZW5BeGlzID0gcmlnaHRBeGlzO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChuZXdTZXQubG9nc2NhbGUpIHtcblx0XHRcdFx0XHRjaG9zZW5BeGlzLnRyYW5zZm9ybSA9IGZ1bmN0aW9uICh2KSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0aWYgKHYgPT0gMCkgdiA9IDAuMDAwMDE7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0cmV0dXJuIE1hdGgubG9nKHYpO1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdGNob3NlbkF4aXMuaW52ZXJzZVRyYW5zZm9ybSA9IGZ1bmN0aW9uICh2KSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0cmV0dXJuIE1hdGguZXhwKHYpO1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdGNob3NlbkF4aXMuYXV0b3NjYWxlTWFyZ2luID0gbnVsbDtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLmdyYXBoT3B0aW9ucy55YXhlcy5wdXNoKGNob3NlbkF4aXMpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAobmV3U2V0LmlzY29udHJvbCkge1xuXHRcdFx0bmV3U2V0LmxpbmVzID0ge3Nob3c6ZmFsc2V9O1xuXHRcdFx0bmV3U2V0LmRhc2hlcyA9IHtzaG93OnRydWUsIGxpbmVXaWR0aDoyLCBkYXNoTGVuZ3RoOlszLCAxXX07XG5cdFx0fVxuXG4vL1x0XHRjb25zb2xlLmxvZyh0aGlzLmdyYXBoT3B0aW9ucy55YXhlcyk7XG5cblx0XHR0aGlzLnNldHNGZXRjaGVkW25ld1NldC5sYWJlbF0gPSBuZXdTZXQ7XG5cbi8vXHRcdHRoaXMucmVhc3NpZ25HcmFwaENvbG9ycygpO1xuLy9cdFx0dGhpcy5yZWRyYXdHcmFwaCgpO1xuXHR9LFxuXG5cblx0ZHJhd1NldHM6ZnVuY3Rpb24oKSB7XG5cdFx0dGhpcy5yZWFzc2lnbkdyYXBoQ29sb3JzKCk7XG5cdFx0dGhpcy5yZWRyYXdHcmFwaCgpO1xuXHR9LFxuXG5cblx0cmVhc3NpZ25HcmFwaENvbG9yczpmdW5jdGlvbigpIHtcblx0XHR2YXIgc2V0Q291bnQgPSAwO1x0Ly8gRGFtbiwgdGhlcmUgaGFzIHRvIGJlIGEgYmV0dGVyIHdheSB0byBkbyB0aGlzLlxuXHRcdHZhciBhY3RpdmVTZXRDb3VudCA9IDA7XG5cdFx0Zm9yICh2YXIgaSBpbiB0aGlzLnNldHNGZXRjaGVkKSB7XG5cdFx0XHRzZXRDb3VudCsrO1xuXHRcdFx0dmFyIG9uZVNldCA9IHRoaXMuc2V0c0ZldGNoZWRbaV07XG5cdFx0XHRpZiAob25lU2V0LmRhdGEpIHtcblx0XHRcdFx0YWN0aXZlU2V0Q291bnQrKztcblx0XHRcdH1cblx0XHR9XG5cblx0XHR2YXIgc2V0SW5kZXggPSAwO1xuXHRcdGZvciAodmFyIGkgaW4gdGhpcy5zZXRzRmV0Y2hlZCkge1xuXHRcdFx0dmFyIG9uZVNldCA9IHRoaXMuc2V0c0ZldGNoZWRbaV07XG5cdFx0XHRpZiAob25lU2V0LmRhdGEpIHtcblxuXHRcdFx0XHQvLyBJZiB3ZSBoYXZlIG11bHRpcGxlIGF4ZXMsIHRoZW4gY2hvb3NlIHRoZSBjb2xvciBiYXNlZCBvbiB3aGljaCBheGlzIHRoZSBsaW5lIGlzIGFzc2lnbmVkIHRvXG5cdFx0XHRcdGlmICh0aGlzLmdyYXBoT3B0aW9ucy55YXhlcy5sZW5ndGggPiAxKSB7XG5cdFx0XHRcdFx0Ly8gV2UncmUgYmFua2luZyBvbiB5YXhpcyBhbHdheXMgYmVpbmcgMSBvciBncmVhdGVyLCBuZXZlciAwLCB0byBnZXQgY29ycmVjdCBjb2xvclxuXHRcdFx0XHRcdC8vIFRoaXMgc2hvdWxkIGJlIHRydWUgYmVjYXVzZSBmbG90IGl0c2VsZiBuZXZlciB1c2VzIDAgdG8gcmVmZXIgdG8gYW4gYXhpcyBpbnRlcm5hbGx5LlxuXHRcdFx0XHRcdG9uZVNldC5jb2xvciA9IHRoaXMuaW50QW5kUmFuZ2VUb0xpbmVDb2xvcihvbmVTZXQueWF4aXMtMSwgdGhpcy5ncmFwaE9wdGlvbnMueWF4ZXMubGVuZ3RoKTtcblx0XHRcdFx0XHR0aGlzLmdyYXBoT3B0aW9ucy55YXhlc1tvbmVTZXQueWF4aXMtMV0uY29sb3IgPSBvbmVTZXQuY29sb3I7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0b25lU2V0LmNvbG9yID0gdGhpcy5pbnRBbmRSYW5nZVRvTGluZUNvbG9yKHNldEluZGV4LCBhY3RpdmVTZXRDb3VudCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR2YXIgdHMgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChvbmVTZXQubGFiZWwgKyAnTGFiZWwnKTtcblx0XHRcdFx0aWYgKHRzKSB7XG5cdFx0XHRcdFx0dHMuc3R5bGUuYmFja2dyb3VuZENvbG9yID0gb25lU2V0LmNvbG9yO1xuXHRcdFx0XHQgICAgdHMuc3R5bGUuY29sb3IgPSAnI0ZGRic7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHNldEluZGV4Kys7XG5cdFx0fVxuXHR9LFxuXG5cblx0aW50QW5kUmFuZ2VUb0xpbmVDb2xvcjpmdW5jdGlvbihpLHIpIHtcblx0XHQvLyAxNyBpbnRlcm1lZGlhdGUgc3BvdHMgb24gdGhlIGNvbG9yIHdoZWVsLCBhZGp1c3RlZCBmb3IgdmlzaWJpbGl0eSxcblx0XHQvLyB3aXRoIHRoZSAxOHRoIGEgY2xvbmUgb2YgdGhlIDFzdC5cblx0XHR2YXIgbGluZUNvbG9ycyA9IFtcblx0XHRcdFswLDEzNiwxMzJdLCBbMTAsMTM2LDEwOV0sIFsxMywxNDMsNDVdLCBbMjAsMTM2LDEwXSwgWzcyLDEzNiwxMF0sIFsxMjUsMTM2LDBdLFxuXHRcdFx0WzEzNiwxMDgsMTBdLCBbMTM2LDczLDExXSwgWzEzNiw0MywxNF0sIFsxMzYsMTQsNDNdLCBbMTM2LDExLDg4XSwgWzExOCwxMywxMzZdLFxuXHRcdFx0Wzg5LDIzLDEzNl0sIFs0MywyMCwxMzZdLCBbMTQsMjMsMTM2XSwgWzEyLDQ0LDEzNl0sIFsxMywxMDcsMTM2XSwgWzAsMTM2LDEzMl1dO1xuXG5cdFx0Ly8gUmFuZ2Ugb2YgMCBpcyBqdXN0IHVuYWNjZXB0YWJsZVxuXHRcdGlmIChyIDwgMSkgeyByZXR1cm4gJyM4ODgnOyB9XG5cblx0XHQvLyBOZWdhdGl2ZSBpbmRleCBpcyBlcXVhbGx5IHVuYWNjZXB0YWJsZVxuXHRcdGlmIChpIDwgMCkgeyByZXR1cm4gJyM4ODgnOyB9XG5cblx0XHRpZiAoaSA+IHIpIHtcblx0XHRcdGkgPSBpICUgcjtcdC8vIE1ha2Ugc3VyZSBpIGlzIHdpdGhpbiByXG5cdFx0fVxuXG5cdFx0dmFyIGFkanVzdGVkUmFuZ2UgPSAoaSAvIHIpICogKGxpbmVDb2xvcnMubGVuZ3RoIC0gMik7XG5cdFx0dmFyIGxJbmRleCA9IE1hdGguZmxvb3IoYWRqdXN0ZWRSYW5nZSk7XG5cdFx0dmFyIGxmcmFjdGlvbiA9IGFkanVzdGVkUmFuZ2UgLSBsSW5kZXg7XG5cdFx0dmFyIHJJbmRleCA9IGxJbmRleCArIDE7XG5cdFx0dmFyIHJmcmFjdGlvbiA9IHJJbmRleCAtIGFkanVzdGVkUmFuZ2U7XG4vL1x0XHRjb25zb2xlLmxvZyhySW5kZXggKyAnICcgKyBsZnJhY3Rpb24gKyAnICcgKyAobGluZUNvbG9ycy5sZW5ndGggLSAyKSk7XG5cdFx0dmFyIHI6YW55ID0gTWF0aC5mbG9vcigobGluZUNvbG9yc1tsSW5kZXhdWzBdICogbGZyYWN0aW9uKSArIChsaW5lQ29sb3JzW3JJbmRleF1bMF0gKiByZnJhY3Rpb24pKTtcblx0XHR2YXIgZyA9IE1hdGguZmxvb3IoKGxpbmVDb2xvcnNbbEluZGV4XVsxXSAqIGxmcmFjdGlvbikgKyAobGluZUNvbG9yc1tySW5kZXhdWzFdICogcmZyYWN0aW9uKSk7XG5cdFx0dmFyIGIgPSBNYXRoLmZsb29yKChsaW5lQ29sb3JzW2xJbmRleF1bMl0gKiBsZnJhY3Rpb24pICsgKGxpbmVDb2xvcnNbckluZGV4XVsyXSAqIHJmcmFjdGlvbikpO1xuXHRcdFxuXHRcdHJldHVybiAncmdiKCcgKyByICsgJywgJyArIGcgKyAnLCAnICsgYiArICcpJztcblx0fSxcblxuXG5cdHJlZHJhd0dyYXBoOmZ1bmN0aW9uKCkge1xuXHRcdHRoaXMuZGF0YVNldHMgPSBbXTtcblxuXHRcdGZvciAodmFyIG9uZVNldCBpbiB0aGlzLnNldHNGZXRjaGVkKSB7XG5cdCAgIFx0XHR0aGlzLmRhdGFTZXRzLnB1c2godGhpcy5zZXRzRmV0Y2hlZFtvbmVTZXRdKTtcblx0XHR9XG5cblx0XHR0aGlzLnJlYnVpbGRYQXhpcygpO1xuXG5cdFx0aWYgKFN0dWR5REdyYXBoaW5nLmNsaWNrV2lkZ2V0KSB7XG5cdFx0XHRTdHVkeURHcmFwaGluZy5jbGlja1dpZGdldC5yZW1vdmUoKTtcblx0XHR9XG5cblx0XHRpZiAoU3R1ZHlER3JhcGhpbmcuaGlnaGxpZ2h0ZWRDbGlja1BvaW50KSB7XG5cdFx0XHRTdHVkeURHcmFwaGluZy5oaWdobGlnaHRlZENsaWNrUG9pbnQucmVtb3ZlKCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5wbG90T2JqZWN0ID0gJC5wbG90KHRoaXMuZ3JhcGhEaXYsIHRoaXMuZGF0YVNldHMsIHRoaXMuZ3JhcGhPcHRpb25zKTtcblx0fSxcblxuXG5cdHJlYnVpbGRYQXhpczpmdW5jdGlvbigpIHtcblx0XG5cdFx0dGhpcy50aWNrQXJyYXkgPSBbXTtcblxuXHRcdHRoaXMuZGF0YVNldHMuZm9yRWFjaCgoc2VyaWVzKSA9PiB7XG5cdFx0XHR2YXIgZGkgPSAwLCB0aSA9IDAsIG9sZFRpY2tBcnJheSA9IHRoaXMudGlja0FycmF5LCBkLCB0O1xuXHRcdFx0aWYgKHNlcmllcy5kYXRhKSB7XG5cdFx0XHRcdHRoaXMudGlja0FycmF5ID0gW107XG5cdFx0XHRcdHdoaWxlICgoZGkgPCBzZXJpZXMuZGF0YS5sZW5ndGgpICYmICh0aSA8IG9sZFRpY2tBcnJheS5sZW5ndGgpKSB7XG5cdFx0XHRcdFx0ZCA9IHBhcnNlRmxvYXQoc2VyaWVzLmRhdGFbZGldWzBdKTtcblx0XHRcdFx0XHR0ID0gb2xkVGlja0FycmF5W3RpXVswXTtcblx0XHRcdFx0XHRpZiAoZCA8IHQpIHtcblx0XHRcdFx0XHRcdHRoaXMudGlja0FycmF5LnB1c2goW2QsIGRdKTtcblx0XHRcdFx0XHRcdGRpKys7XG5cdFx0XHRcdFx0fSBlbHNlIGlmICh0IDwgZCkge1xuXHRcdFx0XHRcdFx0dGhpcy50aWNrQXJyYXkucHVzaChbdCwgb2xkVGlja0FycmF5W3RpXVsxXV0pO1xuXHRcdFx0XHRcdFx0dGkrKztcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0dGhpcy50aWNrQXJyYXkucHVzaChbdCwgb2xkVGlja0FycmF5W3RpXVsxXV0pO1xuXHRcdFx0XHRcdFx0ZGkrKztcblx0XHRcdFx0XHRcdHRpKys7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdHdoaWxlIChkaSA8IHNlcmllcy5kYXRhLmxlbmd0aCkge1xuXHRcdFx0XHRcdGQgPSBwYXJzZUZsb2F0KHNlcmllcy5kYXRhW2RpXVswXSk7XG5cdFx0XHRcdFx0dGhpcy50aWNrQXJyYXkucHVzaChbZCwgZF0pO1xuXHRcdFx0XHRcdGRpKys7XG5cdFx0XHRcdH1cblx0XHRcdFx0d2hpbGUgKHRpIDwgb2xkVGlja0FycmF5Lmxlbmd0aCkge1xuXHRcdFx0XHRcdHQgPSBvbGRUaWNrQXJyYXlbdGldWzBdO1xuXHRcdFx0XHRcdHRoaXMudGlja0FycmF5LnB1c2goW3QsIG9sZFRpY2tBcnJheVt0aV1bMV1dKTtcblx0XHRcdFx0XHR0aSsrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0XG5cdFx0Ly8gRW1iZWQgaXQgaW4gdGhlIG9wdGlvbnMgZm9yIGV2ZW50dWFsIHBhc3NpbmcgdGhyb3VnaCBmbG90IGFuZCBpbnRvIHRoZSBjdXN0b20gdGljayBnZW5lcmF0b3IganVzdCBiZWxvd1xuXHRcdHRoaXMuZ3JhcGhPcHRpb25zLnhheGlzLmZ1bGxUaWNrQXJyYXkgPSB0aGlzLnRpY2tBcnJheTtcblx0fSxcdFxuXG5cblx0dGlja0dlbmVyYXRvckZ1bmN0aW9uOmZ1bmN0aW9uKGZ1bGxheGlzKSB7XG5cblx0ICAgIHZhciByZXMgPSBbXTtcblx0ICAgIGlmICghZnVsbGF4aXMpIHtcblx0XHRcdGNvbnNvbGUubG9nKFwiTm8gZmlyc3QgYXJndW1lbnQgcGFzc2VkIHRvIHRoZSB0aWNrIGdlbmVyYXRvcj8gIFNvbWV0aGluZydzIHdyb25nIHdpdGggZmxvdC4gIEJldHRlciBpbnZlc3RpZ2F0ZS5cIik7XG5cdCAgICBcdHJldHVybiByZXM7XG5cdFx0fVxuXHQgICAgaWYgKCFmdWxsYXhpcy5vcHRpb25zKSB7XG5cdFx0XHRjb25zb2xlLmxvZyhcIk5vIG9wdGlvbnMgaW4gdGhlIGFyZ3VtZW50IHBhc3NlZCB0byB0aGUgdGljayBnZW5lcmF0b3I/ICBTb21ldGhpbmcncyB3cm9uZyB3aXRoIGZsb3QuICBCZXR0ZXIgaW52ZXN0aWdhdGUuXCIpO1xuXHQgICAgXHRyZXR1cm4gcmVzO1xuXHRcdH1cblx0ICAgIGlmICghZnVsbGF4aXMub3B0aW9ucy5jdXJyZW50R3JhcGhET01PYmplY3QpIHtcblx0ICAgIFx0cmV0dXJuIHJlcztcblx0ICAgIH1cblx0ICAgIHZhciBncmFwaERpdldpZHRoID0gZnVsbGF4aXMub3B0aW9ucy5jdXJyZW50R3JhcGhET01PYmplY3Qud2lkdGgoKTtcblx0ICAgIGlmICghZ3JhcGhEaXZXaWR0aCkge1xuXHQgICAgXHRyZXR1cm4gcmVzO1xuXHQgICAgfVxuXG5cdFx0dmFyIGF4aXNBcGVydHVyZVNpemUgPSBmdWxsYXhpcy5tYXggLSBmdWxsYXhpcy5taW47XG5cdFx0aWYgKGF4aXNBcGVydHVyZVNpemUgPCAxKSB7XHQvLyBJZiB3ZSdyZSBncmFwaGluZyBhbiBheGlzIG9mIHplcm8gd2lkdGgsIGdpdmUgdXBcblx0XHRcdHJldHVybiByZXM7XG5cdFx0fVxuXG5cdFx0Ly8gSGVtIHRoZSByZWdpb24gaW4gb24gdGhlIHJpZ2h0IHNpZGUgdG8gcHJldmVudCB0aGUgZGl2cyBmcm9tIGRyYXdpbmcgb2Zmc2NyZWVuXG5cdFx0Ly8gYW5kIHN1bW1vbmluZyBhIGhvcml6b250YWwgc2Nyb2xsYmFyLlxuXHRcdHZhciBtYXhXaWR0aCA9IGdyYXBoRGl2V2lkdGggLSAyMDtcblx0XHRpZiAobWF4V2lkdGggPCA1KSB7XHQvLyBObyBzZW5zZSBpbiBkcmF3aW5nIGEgZ3JhcGggNSBwaXhlbHMgd2lkZSEhXG5cdFx0XHRyZXR1cm4gcmVzO1xuXHRcdH1cblxuXHRcdC8vIDI2IHBpeGVscyBpcyBhYm91dCBob3cgbXVjaCBzY3JlZW4gd2lkdGggd2UgbmVlZCBmb3IgZWFjaCBsYWJlbC5cblx0XHR2YXIgc3RlcFNpemUgPSAyNjtcblx0XHR2YXIgdGlja0FycmF5ID0gZnVsbGF4aXMub3B0aW9ucy5mdWxsVGlja0FycmF5O1xuXHRcdGlmICghdGlja0FycmF5KSB7XG5cdFx0XHRyZXR1cm4gcmVzO1xuXHRcdH1cblx0XHQvLyB3aWR0aCB2YXJpZXMgYSBsb3Q7IG9uZSBjaGFyYWN0ZXIgaXMgYWJvdXQgN3B4LCBzbyBjb21wdXRlIHRoZSB3aWRlc3QgbGFiZWxcblx0XHRzdGVwU2l6ZSA9IHRpY2tBcnJheS5yZWR1Y2UoKHAsIHYpID0+IHsgcmV0dXJuIE1hdGgubWF4KHAsIHZbMV0udG9TdHJpbmcoKS5sZW5ndGggKiA3KTsgfSwgc3RlcFNpemUpO1xuXHRcdC8vIHRpY2tBcnJheUxlbmd0aCBpcyB0aGUgbnVtYmVyIG9mIHRpY2tzIG9uIHRoZSBheGlzIHdlIGhhdmUgdG8gY2hvb3NlIGZyb21cblx0XHR2YXIgdGlja0FycmF5TGVuZ3RoID0gdGlja0FycmF5Lmxlbmd0aDtcblx0XHRpZiAodGlja0FycmF5TGVuZ3RoIDwgMSkge1xuXHRcdFx0cmV0dXJuIHJlcztcblx0XHR9XG5cblx0XHQvLyBUaGlzIGNvZGUgcGVyZm9ybXMgYSBiaW5hcnkgc2VhcmNoIGRvd24gaW50byB0aGUgYXJyYXksXG5cdFx0Ly8gaHVudGluZyBmb3IgdGhlIGNsb3Nlc3QgbWF0Y2ggdG8gdGhlIGdpdmVuIHZhbHVlXG5cdFx0Ly8gKHRoZSBsZWZ0IGVkZ2Ugb2YgdGhlIHJlZ2lvbiB3ZSBhcmUgdHJ5aW5nIHRvIHBsYWNlIGEgdGljayBpbilcblxuXHRcdHZhciBhcGVydHVyZUxlZnRFZGdlID0gMDtcblx0XHR2YXIgaSA9IDA7XG5cdFx0dmFyIHByZXZJID0gLTE7XG5cblx0XHQvLyBIaW50OiBJZiB0aGlzIGdpdmVzIGJpemFycmUgcmVzdWx0cywgbWFrZSBzdXJlIHlvdSBoYXZlIGV2ZXJ5dGhpbmdcblx0XHQvLyBjYXN0ZWQgdG8gZmxvYXRzIG9yIGludHMsIGluc3RlYWQgb2Ygc3RyaW5ncy5cblxuXHRcdGRvIHtcblxuXHRcdFx0dmFyIHRpY2tBcnJheVN0ZXBTaXplID0gKHRpY2tBcnJheUxlbmd0aCAtIGkpIC8gMjtcblx0XHRcdHZhciBpID0gdGlja0FycmF5U3RlcFNpemUgKyBpO1xuXHRcdFx0ZG8ge1xuXHRcdFx0XHR2YXIgdiA9IHRpY2tBcnJheVtNYXRoLmZsb29yKGkpXVswXTtcblx0XHRcdFx0dGlja0FycmF5U3RlcFNpemUgPSB0aWNrQXJyYXlTdGVwU2l6ZSAvIDI7XG5cdFx0XHRcdGlmICgoKHYgLSBmdWxsYXhpcy5taW4pICogKGdyYXBoRGl2V2lkdGggLyBheGlzQXBlcnR1cmVTaXplKSkgPiBhcGVydHVyZUxlZnRFZGdlKSB7XG5cdFx0XHRcdFx0aSA9IGkgLSB0aWNrQXJyYXlTdGVwU2l6ZTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRpID0gaSArIHRpY2tBcnJheVN0ZXBTaXplO1xuXHRcdFx0XHR9XG4vL1x0XHRcdFx0Y29uc29sZS5sb2coXCJ2OiBcIiArIHYgKyBcIiBpOiBcIiArIGkgKyBcIiB0aWNrQXJyYXlTdGVwU2l6ZTogXCIgKyB0aWNrQXJyYXlTdGVwU2l6ZSk7XHRcdFx0XHRcblx0XHRcdH0gd2hpbGUgKHRpY2tBcnJheVN0ZXBTaXplID4gMC40KTtcblxuXHRcdFx0Ly8gVGhlIGluZGV4IGlzIG1lYW50IHRvIGVuZCB1cCBwb2ludGluZyBiZXR3ZWVuIHRoZSB0d28gdmFsdWVzIG9uIGVpdGhlciBzaWRlXG5cdFx0XHQvLyBvZiBvdXIgdGFyZ2V0LCBidXQgbWF5IGJlIG9mZiBieSBvbmUgdmFsdWUgd2hlbiB3ZSBxdWl0IHNlYXJjaGluZyBkdWUgdG8gYVxuXHRcdFx0Ly8gcm91bmRpbmcgaXNzdWUuICBTbyB3ZSB0YWtlIHRoZSBmbG9vciBhbmQgdGVzdCB0aGF0IHZhbHVlLCBhbmQgY2hvb3NlIHRoZSBvbmVcblx0XHRcdC8vIGp1c3QgaGlnaGVyIGlmIGl0J3MgdG9vIGxvdy5cblx0XHRcdGkgPSBNYXRoLmZsb29yKGkpO1xuXHRcdFx0aWYgKCgodGlja0FycmF5W2ldWzBdIC0gZnVsbGF4aXMubWluKSAqIChncmFwaERpdldpZHRoIC8gYXhpc0FwZXJ0dXJlU2l6ZSkpIDwgYXBlcnR1cmVMZWZ0RWRnZSkge1xuXHRcdFx0XHRpID0gaSArIDE7XG5cdFx0XHR9XG5cdFxuXHRcdFx0Ly8gSWYsIGJ5IHNlZWtpbmcgdGhlIGhpZ2hlciB2YWx1ZSwgd2UgZW5kIHVwIG9mZiB0aGUgZW5kIG9mIHRoZSBhcnJheSwgdGhlblxuXHRcdFx0Ly8gdGhlcmUgYXJlIG5vIG1vcmUgdmFsdWVzIHdlIGNhbiBhZGQuXG5cdFx0XHRpZiAoaSA+PSB0aWNrQXJyYXlMZW5ndGgpIHtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRcblx0XHRcdHJlcy5wdXNoKFt0aWNrQXJyYXlbaV1bMF0sIHRpY2tBcnJheVtpXVsxXV0pO1xuXHRcblx0XHRcdC8vIFRha2UgdGhlIGxvY2F0aW9uIG9mIHRoaXMgdGljaywgcGx1cyBvdXIgc2NhbGVkIHNwYWNlciwgYW5kIHVzZSB0aGF0IGFzIHRoZVxuXHRcdFx0Ly8gbmV3IGxlZnQgZWRnZSBvZiBvdXIgdGljayBzZWFyY2guXG5cdFx0XHRhcGVydHVyZUxlZnRFZGdlID0gKCh0aWNrQXJyYXlbaV1bMF0gLSBmdWxsYXhpcy5taW4pICogKGdyYXBoRGl2V2lkdGggLyBheGlzQXBlcnR1cmVTaXplKSkgKyBzdGVwU2l6ZTtcblxuLy9cdFx0XHRjb25zb2xlLmxvZyhcInZhbDogXCIgKyB0aWNrQXJyYXlbaV1bMF0gKyBcIiBlZGdlOiBcIiArIGFwZXJ0dXJlTGVmdEVkZ2UpO1x0XHRcdFx0XG5cblx0XHRcdC8vIElmLCBmb3IgYW55IHJlYXNvbiwgd2UgZW5kIHVwIG9uIHRoZSBzYW1lIGluZGV4IHR3aWNlIGluIGEgcm93LFxuXHRcdFx0Ly8gYmFpbCBvdXQgdG8gcHJldmVudCBhbiBpbmZpbml0ZSBsb29wLlxuXHRcdFx0aWYgKGkgPT0gcHJldkkpIHtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cblx0XHRcdHByZXZJID0gaTtcblxuXHRcdH0gd2hpbGUgKGFwZXJ0dXJlTGVmdEVkZ2UgPCBtYXhXaWR0aCk7XG5cblx0XHRyZXR1cm4gcmVzO1xuXHR9LFxuXHRcbiAgICBcbiAgICBob3ZlckZ1bmN0aW9uOmZ1bmN0aW9uKGV2ZW50LCBwb3MsIGl0ZW0pIHtcblx0XHRpZiAoaXRlbSkge1xuXHRcdFx0aWYgKChTdHVkeURHcmFwaGluZy5wcmV2aW91c0hvdmVyUG9pbnQgIT0gaXRlbS5kYXRhSW5kZXgpIHx8XG5cdFx0XHRcdChTdHVkeURHcmFwaGluZy5wcmV2aW91c0hvdmVyUG9pbnRTZXJpZXMgIT0gaXRlbS5zZXJpZXMpKSB7XG5cdFx0XHRcdFxuXHRcdFx0XHRTdHVkeURHcmFwaGluZy5wcmV2aW91c0hvdmVyUG9pbnQgPSBpdGVtLmRhdGFJbmRleDtcblx0XHRcdFx0U3R1ZHlER3JhcGhpbmcucHJldmlvdXNIb3ZlclBvaW50U2VyaWVzID0gaXRlbS5zZXJpZXM7XG5cblx0XHRcdFx0aWYgKFN0dWR5REdyYXBoaW5nLmhvdmVyV2lkZ2V0KSB7XG5cdFx0XHRcdFx0U3R1ZHlER3JhcGhpbmcuaG92ZXJXaWRnZXQucmVtb3ZlKCk7XG5cdFx0XHRcdFx0U3R1ZHlER3JhcGhpbmcuaG92ZXJXaWRnZXQgPSBudWxsO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKChTdHVkeURHcmFwaGluZy5wcmV2aW91c0NsaWNrUG9pbnQgIT0gU3R1ZHlER3JhcGhpbmcucHJldmlvdXNIb3ZlclBvaW50KSB8fFxuXHRcdFx0XHRcdChTdHVkeURHcmFwaGluZy5wcmV2aW91c0NsaWNrUG9pbnRTZXJpZXMgIT0gU3R1ZHlER3JhcGhpbmcucHJldmlvdXNIb3ZlclBvaW50U2VyaWVzKSkge1xuXHRcblx0XHRcdFx0XHRTdHVkeURHcmFwaGluZy5ob3ZlcldpZGdldCA9IFN0dWR5REdyYXBoaW5nLmNyZWF0ZVdpZGdldCgnZ3JhcGhIb3ZlcldpZGdldCcsIGl0ZW0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblxuXHRcdFx0aWYgKFN0dWR5REdyYXBoaW5nLmhvdmVyV2lkZ2V0KSB7XG5cdFx0XHRcdFN0dWR5REdyYXBoaW5nLmhvdmVyV2lkZ2V0LnJlbW92ZSgpO1xuXHRcdFx0XHRTdHVkeURHcmFwaGluZy5ob3ZlcldpZGdldCA9IG51bGw7XG5cdFx0XHR9XG5cblx0XHRcdFN0dWR5REdyYXBoaW5nLnByZXZpb3VzSG92ZXJQb2ludCA9IG51bGw7ICAgICAgICAgICAgXG5cdFx0XHRTdHVkeURHcmFwaGluZy5wcmV2aW91c0hvdmVyUG9pbnRTZXJpZXMgPSBudWxsOyAgICAgICAgICAgIFxuXHRcdH1cbiAgICB9LFxuICAgIFxuICAgIFxuXHRwbG90Q2xpY2tGdW5jdGlvbjpmdW5jdGlvbihldmVudCwgcG9zLCBpdGVtKSB7XG4gICAgICAgIGlmIChpdGVtKSB7XG5cdFx0XHQvLyBJZiB3ZSdyZSByZS1jbGlja2luZyBhIGN1cnJlbnQgaXRlbVxuXHRcdFx0aWYgKChTdHVkeURHcmFwaGluZy5wcmV2aW91c0NsaWNrUG9pbnQgPT0gaXRlbS5kYXRhSW5kZXgpICYmXG5cdFx0XHRcdChTdHVkeURHcmFwaGluZy5wcmV2aW91c0NsaWNrUG9pbnRTZXJpZXMgPT0gaXRlbS5zZXJpZXMpKSB7XG5cblx0XHRcdFx0U3R1ZHlER3JhcGhpbmcucHJldmlvdXNDbGlja1BvaW50ID0gbnVsbDtcblx0XHRcdFx0U3R1ZHlER3JhcGhpbmcucHJldmlvdXNDbGlja1BvaW50U2VyaWVzID0gbnVsbDtcblxuXHRcdFx0XHRpZiAoU3R1ZHlER3JhcGhpbmcuY2xpY2tXaWRnZXQpIHtcblx0XHRcdFx0XHRTdHVkeURHcmFwaGluZy5jbGlja1dpZGdldC5yZW1vdmUoKTtcblx0XHRcdFx0XHRTdHVkeURHcmFwaGluZy5jbGlja1dpZGdldCA9IG51bGw7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoU3R1ZHlER3JhcGhpbmcuaGlnaGxpZ2h0ZWRDbGlja1BvaW50KSB7XG5cdFx0XHRcdFx0U3R1ZHlER3JhcGhpbmcuaGlnaGxpZ2h0ZWRDbGlja1BvaW50LnJlbW92ZSgpO1xuXHRcdFx0XHRcdFN0dWR5REdyYXBoaW5nLmhpZ2hsaWdodGVkQ2xpY2tQb2ludCA9IG51bGw7XG5cdFx0XHRcdH1cblxuXHRcdFx0Ly8gSWYgd2UncmUgY2xpY2tpbmcgYSBuZXcgaXRlbVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0U3R1ZHlER3JhcGhpbmcucHJldmlvdXNDbGlja1BvaW50ID0gaXRlbS5kYXRhSW5kZXg7XG5cdFx0XHRcdFN0dWR5REdyYXBoaW5nLnByZXZpb3VzQ2xpY2tQb2ludFNlcmllcyA9IGl0ZW0uc2VyaWVzO1xuXG5cdFx0XHRcdGlmIChTdHVkeURHcmFwaGluZy5jbGlja1dpZGdldCkge1xuXHRcdFx0XHRcdFN0dWR5REdyYXBoaW5nLmNsaWNrV2lkZ2V0LnJlbW92ZSgpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKFN0dWR5REdyYXBoaW5nLmhpZ2hsaWdodGVkQ2xpY2tQb2ludCkge1xuXHRcdFx0XHRcdFN0dWR5REdyYXBoaW5nLmhpZ2hsaWdodGVkQ2xpY2tQb2ludC5yZW1vdmUoKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdFN0dWR5REdyYXBoaW5nLmhpZ2hsaWdodGVkQ2xpY2tQb2ludCA9IFN0dWR5REdyYXBoaW5nLmNyZWF0ZVBvaW50U2VsZWN0aW9uT3ZlcmxheSgnZ3JhcGhDbGlja01hcmtlcicsIGl0ZW0pO1xuXG5cdFx0XHRcdFN0dWR5REdyYXBoaW5nLmNsaWNrV2lkZ2V0ID0gU3R1ZHlER3JhcGhpbmcuY3JlYXRlV2lkZ2V0KCdncmFwaENsaWNrV2lkZ2V0JywgaXRlbSk7XG5cdFx0XHR9XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgICAgXG4gICAgY3JlYXRlUG9pbnRTZWxlY3Rpb25PdmVybGF5OmZ1bmN0aW9uKHdpZGdldFN0eWxlLCBpdGVtKSB7XG5cblx0XHR2YXIgdHggPSBpdGVtLnBhZ2VYIC0gNjtcblx0XHR2YXIgdHkgPSBpdGVtLnBhZ2VZIC0gNjtcblxuXHRcdHZhciBwdENvbG9yID0gJ3JnYmEoODgsODgsODgsMSknO1xuXG5cdFx0aWYgKGl0ZW0uc2VyaWVzLmNvbG9yKSB7XG4gICAgICAgICAgICBwdENvbG9yID0gJC5jb2xvci5wYXJzZShpdGVtLnNlcmllcy5jb2xvcikuc2NhbGUoJ2EnLCAwLjUpLnRvU3RyaW5nKCk7XG5cdFx0fVxuXG5cdFx0dmFyIHN2Z1N0cmluZyA9ICc8c3ZnIGlkPVwiJyArIHdpZGdldFN0eWxlICsgJ3BcIiB4bWxucz1cImh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnXCIgdmVyc2lvbj1cIjEuMlwiJyArXG5cdFx0XHRcdCcgd2lkdGg9XCIxMnB4XCIgaGVpZ2h0PVwiMTJweFwiIHZpZXdCb3g9XCIwIDAgMTIgMTJcIiBwcmVzZXJ2ZUFzcGVjdFJhdGlvPVwibm9uZVwiJyArXG5cdFx0XHRcdCcgc3R5bGU9XCJwb3NpdGlvbjogYWJzb2x1dGU7dG9wOicgKyB0eSArICc7bGVmdDonICsgdHggKyAnO1wiPicgK1xuXHRcdFx0XHQnPGRlZnM+JyArXG5cdFx0XHRcdFx0JzxyYWRpYWxHcmFkaWVudCBpZD1cImcxXCIgY3g9XCI1MCVcIiBjeT1cIjUwJVwiIHI9XCI1MCVcIj4nICtcblx0XHRcdFx0XHRcdCc8c3RvcCBzdG9wLWNvbG9yPVwiJyArIHB0Q29sb3IgKyAnXCIgb2Zmc2V0PVwiMCVcIiAvPicgK1xuXHRcdFx0XHRcdFx0JzxzdG9wIHN0b3AtY29sb3I9XCJ3aGl0ZVwiIG9mZnNldD1cIjEwMCVcIiAvPicgK1xuXHRcdFx0XHRcdCc8L3JhZGlhbEdyYWRpZW50PicgK1xuXHRcdFx0XHQnPC9kZWZzPicgK1xuXHRcdFx0XHQnPGxpbmUgeDE9XCI2LjVcIiB5MT1cIjYuNVwiIHgyPVwiMTEuNVwiIHkyPVwiMTEuNVwiIHN0cm9rZT1cImJsYWNrXCIgc3Ryb2tlLXdpZHRoPVwiMlwiIC8+JyArXG5cdFx0XHRcdCc8Y2lyY2xlIGlkPVwiYzFcIiBjeD1cIjYuNVwiIGN5PVwiNi41XCIgcj1cIjVcIiBzdHJva2U9XCJibGFja1wiIHN0cm9rZS13aWR0aD1cIjFcIiBmaWxsPVwidXJsKCNnMSlcIiAvPicgK1xuXHRcdFx0Jzwvc3ZnPic7XG5cbiAgICAgICAgdmFyIG5ld1B0ID0gJChzdmdTdHJpbmcpO1xuXG5cdFx0bmV3UHQuYXBwZW5kVG8oXCJib2R5XCIpO1xuXG5cdFx0cmV0dXJuIG5ld1B0O1xuICAgIH0sICAgXG5cblxuICAgIGNyZWF0ZVdpZGdldDpmdW5jdGlvbih3aWRnZXRTdHlsZSwgaXRlbSkge1xuXG5cdFx0dmFyXHR5ID0gaXRlbS5kYXRhcG9pbnRbMV07XG5cdFx0dmFyIHRlbXBkZXNjcmlwdGlvbiA9ICcnO1xuXHRcdGlmIChpdGVtLnNlcmllcy5uYW1lKSB7XG5cdFx0XHR0ZW1wZGVzY3JpcHRpb24gPSBpdGVtLnNlcmllcy5uYW1lICsgJzxicj4nO1xuXHRcdH1cblx0XHRpZiAoaXRlbS5zZXJpZXMubWVhc3VyZW1lbnRuYW1lKSB7XG5cdFx0XHR0ZW1wZGVzY3JpcHRpb24gPSAgdGVtcGRlc2NyaXB0aW9uICsgaXRlbS5zZXJpZXMubWVhc3VyZW1lbnRuYW1lICsgJzogJztcblx0XHR9XG5cblx0XHR2YXIgdGVtcHVuaXRzID0gJyc7XG5cdFx0aWYgKGl0ZW0uc2VyaWVzLnVuaXRzKSB7XG5cdFx0XHR0ZW1wdW5pdHMgPSBpdGVtLnNlcmllcy51bml0cztcblx0XHR9XG5cdFx0dmFyIHRlbXBsYWJlbCA9IHRlbXBkZXNjcmlwdGlvbiArICc8Qj4nICsgeSArICc8L0I+ICcgKyB0ZW1wdW5pdHM7XG5cdFx0dmFyIHRlbXB0YWcgPSAnJztcblx0XHRpZiAoaXRlbS5zZXJpZXMudGFncykge1xuXHRcdFx0aWYgKGl0ZW0uc2VyaWVzLnRhZ3NbaXRlbS5kYXRhSW5kZXhdKSB7XG5cdFx0XHRcdHRlbXB0YWcgPSBpdGVtLnNlcmllcy50YWdzW2l0ZW0uZGF0YUluZGV4XVsxXTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKHRlbXB0YWcgIT0gJycpIHtcblx0XHRcdHRlbXBsYWJlbCA9IHRlbXBsYWJlbCArICc8YnI+JyArIHRlbXB0YWc7XG5cdFx0fVxuXG5cdFx0dmFyIHR4ID0gaXRlbS5wYWdlWCArIDU7XG5cdFx0dmFyIHR5ID0gaXRlbS5wYWdlWSArIDU7XG5cbiAgICAgICAgdmFyIG5ld1RpcCA9ICQoJzxkaXYgaWQ9XCInICsgd2lkZ2V0U3R5bGUgKyAndFwiIGNsYXNzPVwiJyArIHdpZGdldFN0eWxlICsgJ1wiPicgKyB0ZW1wbGFiZWwgKyAnPC9kaXY+Jyk7XG5cblx0XHQvLyBXZSB3aWxsIHBsYWNlIHRoZSB0b29sdGlwIGluIHRoZSBsb2NhdGlvbiBzcGVjaWZpZWQsIHVubGVzc1xuXHRcdC8vIHRoZSByZW5kZXJlZCB3aWR0aCBvZiB0aGUgY29udGVudCBydW5zIG9mZiByaWdodCBlZGdlLFxuXHRcdC8vIGluIHdoaWNoIGNhc2Ugd2Ugd2lsbCBzaGlmdCBpdCBsZWZ0IHRvIGJlIGZsdXNoIHdpdGggdGhlIHJpZ2h0LWVkZ2Ugb2YgdGhlIHdpbmRvdyxcblx0XHQvLyBhbmQgcmUtd3JpdGUgdGhlIHdpZHRoIG9mIHRoZSBib3ggc28gaXQgY29uZm9ybXMgdG8gdGhlIHdyYXBwaW5nIG9mIHRoZSB0ZXh0LlxuXG4gICAgICAgIG5ld1RpcC5jc3MoIHtcbiAgICAgICAgICAgIHRvcDogdHksXG4gICAgICAgICAgICBsZWZ0OiB0eFxuICAgICAgICB9KTtcblxuXHRcdGlmIChpdGVtLnNlcmllcy5jb2xvcikge1xuXHQgICAgICAgIG5ld1RpcC5jc3MoIHsgJ2NvbG9yJzogaXRlbS5zZXJpZXMuY29sb3IgfSk7XG5cdFx0fVxuXG5cdFx0bmV3VGlwLmFwcGVuZFRvKFwiYm9keVwiKTtcblxuXHRcdHZhciBuZXdUaXBFbCA9IDxhbnk+ZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQod2lkZ2V0U3R5bGUgKyBcInRcIik7XG5cdFx0dmFyIG5ld1RpcFdpZHRoID0gbmV3VGlwRWwuY2xpZW50V2lkdGg7XG5cblx0XHRpZiAoKHR4ICsgbmV3VGlwV2lkdGggKyAyMCkgPiB3aW5kb3cuaW5uZXJXaWR0aCkge1xuXHRcdFx0Ly8gdG9vbHRpcCBvbiBsZWZ0IGhhbmQgc2lkZSwgbmFzdHkgaGFjayB0byBzaGlmdCB0aGUgbGFiZWxcblx0XHRcdG5ld1RpcEVsLnN0eWxlLndpZHRoID0gKG5ld1RpcFdpZHRoKzIpICsgXCJweFwiO1xuXHRcdFx0bmV3VGlwRWwuc3R5bGUubGVmdCA9ICh0eCAtIG5ld1RpcFdpZHRoKSArIFwicHhcIjtcblx0XHR9XG5cdFx0cmV0dXJuIG5ld1RpcDtcbiAgICB9XG59O1xuXG5cbiJdfQ==