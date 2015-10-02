/// <reference path="typescript-declarations.d.ts" />
var EDDATDGraphing;
EDDATDGraphing = {
    graphDiv: null,
    plotObject: null,
    dataSets: [],
    tickArray: [],
    previousPoint: null,
    previousPointSeries: null,
    setsFetched: {},
    graphOptions: {
        series: {
            lines: {
                //				steps: true,
                show: true
            },
            points: {
                show: true,
                radius: 1.5
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
        xaxis: {},
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
    Setup: function () {
        EDDATDGraphing.graphDiv = $("#graphDiv");
        EDDATDGraphing.graphDiv.bind("plothover", EDDATDGraphing.hoverFunction);
        EDDATDGraphing.graphDiv.bind("plotclick", EDDATDGraphing.plotClickFunction);
        EDDATDGraphing.graphOptions.xaxis.ticks = EDDATDGraphing.tickGeneratorFunction;
        EDDATDGraphing.plotObject = $.plot(EDDATDGraphing.graphDiv, EDDATDGraphing.dataSets, EDDATDGraphing.graphOptions);
    },
    clearAllSets: function () {
        EDDATDGraphing.setsFetched = {};
    },
    addNewSet: function (newSet) {
        if (!newSet.label) {
            $('#debug').text('Failed to fetch series.');
            return;
        }
        EDDATDGraphing.setsFetched[newSet.label] = newSet;
        //		EDDATDGraphing.reassignGraphColors();
        //		EDDATDGraphing.redrawGraph();
    },
    drawSets: function () {
        EDDATDGraphing.reassignGraphColors();
        EDDATDGraphing.redrawGraph();
    },
    reassignGraphColors: function () {
        var setCount = 0; // Damn, there has to be a better way to do this.
        var activeSetCount = 0;
        for (var i in EDDATDGraphing.setsFetched) {
            setCount++;
            var oneSet = EDDATDGraphing.setsFetched[i];
            if (oneSet.data) {
                activeSetCount++;
            }
        }
        var setIndex = 0;
        for (var i in EDDATDGraphing.setsFetched) {
            var oneSet = EDDATDGraphing.setsFetched[i];
            if (oneSet.data) {
                oneSet.color = EDDATDGraphing.intAndRangeToLineColor(setIndex, activeSetCount);
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
        EDDATDGraphing.dataSets = [];
        for (var oneSet in EDDATDGraphing.setsFetched) {
            EDDATDGraphing.dataSets.push(EDDATDGraphing.setsFetched[oneSet]);
        }
        EDDATDGraphing.rebuildXAxis();
        EDDATDGraphing.plotObject = $.plot(EDDATDGraphing.graphDiv, EDDATDGraphing.dataSets, EDDATDGraphing.graphOptions);
    },
    rebuildXAxis: function () {
        EDDATDGraphing.tickArray = [];
        for (var i = 0; i < EDDATDGraphing.dataSets.length; i++) {
            var oneSeries = EDDATDGraphing.dataSets[i];
            if (oneSeries.data) {
                var di = 0;
                var ti = 0;
                var oldTickArray = EDDATDGraphing.tickArray;
                EDDATDGraphing.tickArray = [];
                while ((di < oneSeries.data.length) && (ti < oldTickArray.length)) {
                    var d = parseFloat(oneSeries.data[di][0]);
                    var t = oldTickArray[ti][0];
                    if (d == t) {
                        EDDATDGraphing.tickArray.push([t, oldTickArray[ti][1]]);
                        di++;
                        ti++;
                    }
                    if (d < t) {
                        EDDATDGraphing.tickArray.push([d, d]);
                        di++;
                    }
                    if (t < d) {
                        EDDATDGraphing.tickArray.push([t, oldTickArray[ti][1]]);
                        ti++;
                    }
                }
                while (di < oneSeries.data.length) {
                    var d = parseFloat(oneSeries.data[di][0]);
                    EDDATDGraphing.tickArray.push([d, d]);
                    di++;
                }
                while (ti < oldTickArray.length) {
                    var t = oldTickArray[ti][0];
                    EDDATDGraphing.tickArray.push([t, oldTickArray[ti][1]]);
                    ti++;
                }
            }
        }
    },
    tickGeneratorFunction: function (axis) {
        var res = [];
        if (!EDDATDGraphing.graphDiv) {
            return res;
        }
        var graphDivWidth = EDDATDGraphing.graphDiv.width();
        if (!graphDivWidth) {
            return res;
        }
        var portSize = axis.max - axis.min;
        if (portSize < 1) {
            return res;
        }
        // Hem the region in on the right side to prevent the divs from drawing offscreen
        // and summoning a horizontal scrollbar.
        var maxEdge = Math.floor(axis.max - ((portSize / graphDivWidth) * 20));
        if (maxEdge <= axis.min) {
            return res;
        }
        //		console.log("axis.max: " + axis.max + " axis.min: " + axis.min +
        //			" portSize: " + portSize + " graphDivWidth: " + graphDivWidth +
        //			" Maxedge: " + maxEdge);
        // 26 pixels is about how much screen width we need for each label.
        // The variable stepSize is the minimum distance along the x axis
        // we must step to keep the labels from overlapping.
        var stepSize = Math.floor((portSize / graphDivWidth) * 26);
        if (!EDDATDGraphing.tickArray) {
            return res;
        }
        if (stepSize < 1) {
            stepSize = 1;
        }
        // largestScale is the number of ticks on the axis we have to choose from
        var largestScale = EDDATDGraphing.tickArray.length;
        if (largestScale < 1) {
            return res;
        }
        //		console.log("stepSize: " + stepSize + " largestScale: " + largestScale);
        // This code performs a binary search down into the array,
        // hunting for the closest match to the given value
        // (the left edge of the region we are trying to place a tick in)
        var windowLeftWave = axis.min;
        var prevI = -1;
        // Hint: If this gives bizarre results, make sure you have everything
        // casted to floats or ints, instead of strings.
        do {
            var sScale = largestScale / 2;
            var i = sScale;
            do {
                var v = EDDATDGraphing.tickArray[Math.floor(i)][0];
                sScale = sScale / 2;
                if (v > windowLeftWave) {
                    i = i - sScale;
                }
                else {
                    i = i + sScale;
                }
            } while (sScale > 0.4);
            // The index is meant to end up pointing between the two values on either side
            // of our target, but may be off by one value when we quit searching due to a
            // rounding issue.  So we take the floor and test that value, and choose the one
            // just higher if it's too low.
            i = Math.floor(i);
            if (EDDATDGraphing.tickArray[i][0] < windowLeftWave) {
                i = i + 1;
            }
            // If, by seeking the higher value, we end up off the end of the array, then
            // there are no more values we can add.
            if (i >= EDDATDGraphing.tickArray.length) {
                break;
            }
            res.push([EDDATDGraphing.tickArray[i][0], EDDATDGraphing.tickArray[i][1]]);
            // Take the location of this tick, plus our scaled spacer, and use that as the
            // new left edge of our tick search.
            windowLeftWave = EDDATDGraphing.tickArray[i][0] + stepSize;
            // If, for any reason, we end up on the same index twice in a row,
            // bail out to prevent an infinite loop.
            if (i == prevI) {
                break;
            }
            prevI = i;
        } while (windowLeftWave < maxEdge);
        return res;
    },
    hoverFunction: function (event, pos, item) {
        if (item) {
            if ((EDDATDGraphing.previousPoint != item.dataIndex) ||
                (EDDATDGraphing.previousPointSeries != item.series.name)) {
                EDDATDGraphing.previousPoint = item.dataIndex;
                EDDATDGraphing.previousPointSeries = item.series.name;
                $("#tooltip").remove();
                var x = item.datapoint[0].toFixed(2), y = item.datapoint[1].toFixed(2);
                var tempconfig = '';
                if (item.series.name) {
                    tempconfig = item.series.name + ':<br>';
                }
                var tempunits = '';
                if (item.series.units) {
                    tempunits = item.series.units;
                }
                var templabel = tempconfig + '<B>' + y + '</B> ' + tempunits;
                var temptag = '';
                if (item.series.tags) {
                    if (item.series.tags[item.dataIndex]) {
                        temptag = item.series.tags[item.dataIndex][1];
                    }
                }
                if (temptag != '') {
                    templabel = templabel + '<br>' + temptag;
                }
                EDDATDGraphing.showTooltip(item.pageX + 5, item.pageY + 5, templabel, item.series.color);
            }
        }
        else {
            $("#tooltip").remove();
            EDDATDGraphing.previousPoint = null;
            EDDATDGraphing.previousPointSeries = null;
        }
    },
    showTooltip: function (x, y, contents, col) {
        var newTip = $('<div id="tooltip" class="graphToolTip">' + contents + '</div>');
        // We will place the tooltip in the location specified, unless
        // the rendered width of the content runs off right edge,
        // in which case we will shift it left to be flush with the right-edge of the window,
        // and re-write the width of the box so it conforms to the wrapping of the text.
        newTip.css({
            top: y,
            left: x
        });
        if (col) {
            newTip.css({ 'color': col });
        }
        newTip.appendTo("body");
        newTip = document.getElementById("tooltip");
        var newTipWidth = newTip.clientWidth;
        if ((x + newTipWidth + 20) > window.innerWidth) {
            // tooltip on left hand side, nasty hack to shift the label
            newTip.style.width = (newTipWidth + 2) + "px";
            newTip.style.left = (x - newTipWidth) + "px";
        }
    },
    plotClickFunction: function (event, pos, item) {
        if (item) {
            if (item.series.urls) {
                if (item.series.urls[item.dataIndex]) {
                    var tempurl = item.series.urls[item.dataIndex][1];
                    if (tempurl != '') {
                        window.location = tempurl;
                    }
                }
            }
        }
    }
};
window.addEventListener('load', EDDATDGraphing.Setup, false);
//# sourceMappingURL=AssayTableDataGraphing.js.map