// Compiled to JS on: Thu Jan 21 2016 17:27:10  
/// <reference path="typescript-declarations.d.ts" />
// This file contains various utility classes under the Utl module.
var Utl;
(function (Utl) {
    var EDD = (function () {
        function EDD() {
        }
        EDD.resolveMeasurementRecordToName = function (measurementRecord) {
            var mName = '';
            // We figure out the name and units differently based on the subtype.
            var mst = measurementRecord.mst;
            if (mst == 1) {
                var compName = '';
                var compID = measurementRecord.mq;
                if (compID) {
                    var cRecord = EDDData.MeasurementTypeCompartments[compID];
                    if (cRecord) {
                        compName = cRecord.sn + ' ';
                    }
                }
                var mRecord = EDDData.MetaboliteTypes[measurementRecord.mt];
                mName = compName + mRecord.name;
            }
            else if (mst == 2) {
                mName = EDDData.GeneTypes[measurementRecord.mt].name;
            }
            else if (mst == 3) {
                mName = EDDData.ProteinTypes[measurementRecord.mt].name;
            }
            return mName;
        };
        EDD.resolveMeasurementRecordToUnits = function (measurementRecord) {
            var mUnits = '';
            var mst = measurementRecord.mst;
            if (mst == 1) {
                if (measurementRecord.uid) {
                    var uRecord = EDDData.UnitTypes[measurementRecord.uid];
                    if (uRecord) {
                        mUnits = uRecord.name;
                    }
                }
            }
            else if (mst == 2) {
                mUnits = ''; // Units for Proteomics?  Anyone?
            }
            else if (mst == 3) {
                mUnits = 'RPKM';
            }
            return mUnits;
        };
        return EDD;
    })();
    Utl.EDD = EDD;
    var QtipHelper = (function () {
        function QtipHelper() {
        }
        QtipHelper.prototype.create = function (linkElement, contentFunction, params) {
            params.position.target = $(linkElement);
            params.position.viewport = $(window); // This makes it position itself to fit inside the browser window.
            this._contentFunction = contentFunction;
            if (!params.content)
                params.content = {};
            params.content.text = this._generateContent.bind(this);
            this.qtip = $(linkElement).qtip(params);
        };
        QtipHelper.prototype._generateContent = function () {
            // It's incredibly stupid that we have to do this to work around qtip2's 280px max-width default.
            // We have to do it here rather than immediately after calling qtip() because qtip waits to create
            // the actual element.
            var q = this._getQTipElement();
            $(q).css('max-width', 'none');
            $(q).css('width', 'auto');
            return this._contentFunction();
        };
        // Get the HTML element for the qtip. Usually we use this to unset max-width.
        QtipHelper.prototype._getQTipElement = function () {
            return document.getElementById(this.qtip.attr('aria-describedby'));
        };
        return QtipHelper;
    })();
    Utl.QtipHelper = QtipHelper;
    // RGBA helper class.
    // Values are 0-255 (although toString() makes alpha 0-1 since that's how CSS likes it).
    var Color = (function () {
        function Color() {
        }
        // Note: All values are 0-255, but toString() will convert alpha to a 0-1 value
        Color.rgba = function (r, g, b, alpha) {
            var clr = new Color();
            clr.r = r;
            clr.g = g;
            clr.b = b;
            clr.a = alpha;
            return clr;
        };
        // Note: All values are 0-255, but toString() will convert alpha to a 0-1 value
        Color.rgb = function (r, g, b) {
            var clr = new Color();
            clr.r = r;
            clr.g = g;
            clr.b = b;
            clr.a = 255;
            return clr;
        };
        Color.interpolate = function (clr1, clr2, t) {
            return Color.rgba(clr1.r + (clr2.r - clr1.r) * t, clr1.g + (clr2.g - clr1.g) * t, clr1.b + (clr2.b - clr1.b) * t, clr1.a + (clr2.a - clr1.a) * t);
        };
        Color.toString = function (clr) {
            // If it's something else (like a string) already, just return that value.
            if (typeof clr == 'string')
                return clr;
            return 'rgba(' + Math.floor(clr.r) + ', ' + Math.floor(clr.g) + ', ' + Math.floor(clr.b) + ', ' + clr.a / 255 + ')';
        };
        Color.prototype.toString = function () {
            return 'rgba(' + Math.floor(this.r) + ', ' + Math.floor(this.g) + ', ' + Math.floor(this.b) + ', ' + this.a / 255 + ')';
        };
        Color.red = Color.rgb(255, 0, 0);
        Color.green = Color.rgb(0, 255, 0);
        Color.blue = Color.rgb(0, 0, 255);
        Color.black = Color.rgb(0, 0, 0);
        Color.white = Color.rgb(255, 255, 255);
        return Color;
    })();
    Utl.Color = Color;
    ;
    var Table = (function () {
        function Table(tableID, width, height) {
            this.table = null;
            this._currentRow = 0;
            this.table = document.createElement('table');
            this.table.id = tableID;
            if (width)
                $(this.table).css('width', width);
            if (height)
                $(this.table).css('height', height);
        }
        Table.prototype.addRow = function () {
            var row = this.table.insertRow(-1);
            this._currentRow++;
            return row;
        };
        Table.prototype.addColumn = function () {
            var row = this.table.rows[this._currentRow - 1];
            var column = row.insertCell(-1);
            return column;
        };
        // When you're done setting up the table, add it to another element.
        Table.prototype.addTableTo = function (element) {
            element.appendChild(this.table);
        };
        return Table;
    })();
    Utl.Table = Table;
    // Javascript utilities
    var JS = (function () {
        function JS() {
        }
        // This assumes that str has only one root element.
        // It also breaks for elements that need to be nested under other specific element types,
        // e.g. if you attempt to create a <td> you will be handed back a <div>.
        JS.createElementFromString = function (str, namespace) {
            if (namespace === void 0) { namespace = null; }
            var div;
            if (namespace)
                div = document.createElementNS(namespace, 'div');
            else
                div = document.createElement('div');
            div.innerHTML = str;
            return div.firstChild;
        };
        JS.assert = function (condition, message) {
            if (!condition) {
                message = message || "Assertion failed";
                if (typeof Error !== 'undefined')
                    throw Error(message);
                else
                    throw message;
            }
        };
        JS.convertHashToList = function (hash) {
            return Object.keys(hash).map(function (a) { return hash[a]; });
        };
        // Returns a string of length numChars, padding the right side
        // with spaces if str is shorter than numChars.
        // Will truncate if the string is longer than numChars.
        JS.padStringLeft = function (str, numChars) {
            var startLen = str.length;
            for (var i = startLen; i < numChars; i++)
                str += ' ';
            return str.slice(0, numChars);
        };
        // Returns a string of length numChars, padding the left side
        // with spaces if str is shorter than numChars.
        JS.padStringRight = function (str, numChars) {
            var padStr = "";
            for (var i = 0; i < numChars; i++)
                padStr += " ";
            return (padStr + str).slice(-numChars);
        };
        // Make a string by repeating the specified string N times.
        JS.repeatString = function (str, numChars) {
            var ret = "";
            for (var i = 0; i < numChars; i++)
                ret += str;
            return ret;
        };
        // Given a date in seconds (with a possible fractional portion being milliseconds),
        // based on zero being midnight of Jan 1, 1970 (standard old-school POSIX time),
        // return a string formatted in the manner of "Dec 21 2012, 11:45am",
        // with exceptions for 'Today' and 'Yesterday', e.g. "Yesterday, 3:12pm".
        JS.timestampToTodayString = function (timestamp) {
            // Code adapted from Perl's HTTP-Date
            //var DoW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
            var MoY = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            if (!timestamp || timestamp < 1) {
                return '<span style="color:#888;">N/A</span>';
            }
            var t = new Date(Math.round(timestamp * 1000));
            var n = new Date();
            var now = n.getTime();
            var sec = t.getSeconds();
            var min = t.getMinutes(); // Type "any" so we can add a leading zero
            var hour = t.getHours();
            var mday = t.getDate(); // Returns the day of the month (from 1-31)
            var mon = t.getMonth(); // Returns the month (from 0-11)
            var year = t.getFullYear(); // Returns the year (four digits)
            var wday = t.getDay(); // Returns the day of the week (from 0-6)
            var nsec = n.getSeconds();
            var nmin = n.getMinutes();
            var nhour = n.getHours();
            var nmday = n.getDate();
            var nmon = n.getMonth();
            var nyear = n.getFullYear();
            var nwday = n.getDay();
            var day_str;
            if ((year == nyear) && (mon == nmon) && (mday == nmday)) {
                day_str = 'Today';
            }
            else if ((now - (nsec + (60 * (nmin + (60 * (nhour + 24)))))) ==
                (timestamp - (sec + (60 * (min + (60 * hour)))))) {
                day_str = 'Yesterday';
            }
            else {
                var year_str = '';
                if (year != nyear) {
                    year_str = ' ' + year;
                }
                day_str = MoY[mon] + ' ' + mday + year_str;
            }
            var half_day = 'am';
            if (hour > 11) {
                half_day = 'pm';
            }
            if (hour > 12) {
                hour -= 12;
            }
            else if (hour == 0) {
                hour = 12;
            }
            if (min < 9) {
                min = '0' + min;
            }
            return day_str + ', ' + hour + ':' + min + half_day;
        };
        JS.utcToTodayString = function (utc) {
            var m;
            var timestamp;
            m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.?(\d{1,6})?Z$/.exec(utc);
            if (m) {
                m.shift(); // get rid of overall match, we don't care
                m.map(function (v) { return parseInt(v, 10); }); // convert strings to numbers
                m[1]--; // Date uses 0-based months, so decrement month
                timestamp = Date.UTC(m[0], m[1], m[2], m[3], m[4], m[5]);
                timestamp /= 1000; // the timestampToTodayString expects seconds, not milliseconds
                return Utl.JS.timestampToTodayString(timestamp);
            }
            return Utl.JS.timestampToTodayString(null);
        };
        // Remap a value from [inMin, inMax] to [outMin, outMax]
        JS.remapValue = function (value, inMin, inMax, outMin, outMax) {
            var delta = inMax - inMin;
            // If they've given us a tiny input range, then we can't really parameterize
            // into the range, so let's just return halfway between the outputs.
            if (Math.abs(delta) < 0.000001)
                return outMin + (outMax - outMin) * 0.5;
            var t = (value - inMin) / (inMax - inMin);
            return outMin + (outMax - outMin) * t;
        };
        // Remove all child elements from the specified element.
        JS.removeAllChildren = function (element) {
            while (element.firstChild)
                element.removeChild(element.firstChild);
        };
        JS.removeFromParent = function (element) {
            if (element && element.parentNode)
                element.parentNode.removeChild(element);
        };
        // Call this anywhere in your code to trap F12 keypress to stop in debugger.
        // This is useful for looking at DOM elements in a popup that would normally go away when
        // you moved the mouse away from it.
        JS.enableF12Trap = function () {
            $(window).keydown(function (e) { if (e.keyCode == 123)
                debugger; });
        };
        JS.startWaitBadge = function (selector) {
            $(selector).css("class", "waitbadge wait");
        };
        JS.stopWaitBadge = function (selector) {
            $(selector).css("class", "waitbadge");
        };
        return JS;
    })();
    Utl.JS = JS;
    var FileDropZone = (function () {
        function FileDropZone() {
        }
        FileDropZone.setup = function (element_id, url, process_result, multiple) {
            var zone = new FileDrop(element_id, {}); // filedrop-min.js , http://filedropjs.org
            var csrftoken = jQuery.cookie('csrftoken');
            if (!(typeof multiple === "undefined")) {
                zone.multiple(multiple);
            }
            else {
                zone.multiple(false);
            }
            zone.event('send', function (files) {
                files.each(function (file) {
                    file.event('done', function (xhr) {
                        var result = jQuery.parseJSON(xhr.responseText);
                        console.log(result);
                        if (result.python_error) {
                            alert(result.python_error);
                        }
                        else {
                            process_result(result);
                        }
                    });
                    file.event('error', function (e, xhr) {
                        alert('Error uploading ' + this.name + ': ' +
                            xhr.status + ', ' + xhr.statusText);
                    });
                    // this ensures that the CSRF middleware in Django doesn't reject our
                    // HTTP request
                    file.event('xhrSetup', function (xhr) {
                        xhr.setRequestHeader("X-CSRFToken", csrftoken);
                    });
                    file.sendTo(url);
                });
            });
        };
        return FileDropZone;
    })();
    Utl.FileDropZone = FileDropZone;
    // SVG-related utilities.
    var SVG = (function () {
        function SVG() {
        }
        SVG.createSVG = function (width, height, boxWidth, boxHeight) {
            var svgElement = document.createElementNS(SVG._namespace, "svg");
            svgElement.setAttribute('version', '1.2');
            svgElement.setAttribute('width', width.toString());
            svgElement.setAttribute('height', height.toString());
            svgElement.setAttribute('viewBox', '0 0 ' + boxWidth + ' ' + boxHeight);
            svgElement.setAttribute('preserveAspectRatio', 'none');
            return svgElement;
        };
        // Creates a vertical line centered on (xCoord,yCoord).
        SVG.createVerticalLinePath = function (xCoord, yCoord, lineWidth, lineHeight, color, svgElement) {
            var halfWidth = lineWidth / 2;
            var topY = Math.floor(yCoord - lineHeight / 2);
            var bottomY = Math.floor(yCoord + lineHeight / 2);
            var midX = Math.floor(xCoord + halfWidth);
            var el = SVG.createLine(midX, topY, midX, bottomY, color, lineWidth);
            //$(el).css('stroke-linecap', 'round');
            if (svgElement)
                svgElement.appendChild(el);
            return el;
        };
        SVG.createLine = function (x1, y1, x2, y2, color, width) {
            var el = document.createElementNS(SVG._namespace, 'line');
            el.setAttribute('x1', x1.toString());
            el.setAttribute('y1', y1.toString());
            el.setAttribute('x2', x2.toString());
            el.setAttribute('y2', y2.toString());
            if (color)
                $(el).css('stroke', color.toString());
            if (width)
                $(el).css('stroke-width', width.toString());
            return el;
        };
        SVG.createRect = function (x, y, width, height, fillColor, strokeWidth, strokeColor, opacity) {
            // Default values.
            strokeWidth = (typeof (strokeWidth) !== 'undefined' ? strokeWidth : 0);
            if (!strokeColor)
                strokeColor = Color.black;
            opacity = (typeof (opacity) !== 'undefined' ? opacity : 1);
            var el = document.createElementNS(SVG._namespace, 'rect');
            // Make sure width and height are positive.
            if (height < 0) {
                y += height;
                height = -height;
            }
            if (width < 0) {
                x += height;
                width = -width;
            }
            el.setAttribute('x', x.toString());
            el.setAttribute('y', y.toString());
            el.setAttribute('width', width.toString());
            el.setAttribute('height', height.toString());
            if (typeof (strokeWidth) !== 'undefined')
                $(el).css('stroke-width', strokeWidth);
            if (typeof (strokeColor) !== 'undefined')
                $(el).css('stroke', strokeColor.toString());
            if (typeof (opacity) !== 'undefined')
                $(el).css('opacity', opacity);
            if (typeof (fillColor) !== 'undefined')
                $(el).css('fill', fillColor.toString());
            return el;
        };
        SVG.createText = function (x, y, text, fontName, fontSize, centeredOnX, color) {
            var el = document.createElementNS(SVG._namespace, 'text');
            el.setAttribute('x', x.toString());
            el.setAttribute('y', y.toString());
            if (fontName)
                el.setAttribute('font-family', fontName);
            else
                el.setAttribute('font-family', "Verdana");
            if (fontSize)
                el.setAttribute('font-size', fontSize.toString());
            else
                el.setAttribute('font-size', "12");
            el.textContent = text;
            // Center on X??
            if (centeredOnX)
                el.setAttribute('text-anchor', 'middle');
            else
                el.setAttribute('text-anchor', 'start');
            if (color) {
                $(el).css('fill', color.toString());
            }
            return el;
        };
        // Modify a rect element to round its corners.
        SVG.makeRectRounded = function (rect, rx, ry) {
            rect.setAttribute('rx', rx);
            rect.setAttribute('ry', ry);
        };
        SVG._namespace = "http://www.w3.org/2000/svg";
        return SVG;
    })();
    Utl.SVG = SVG;
})(Utl || (Utl = {})); // end module Utl
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiVXRsLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiVXRsLnRzIl0sIm5hbWVzIjpbIlV0bCIsIlV0bC5FREQiLCJVdGwuRURELmNvbnN0cnVjdG9yIiwiVXRsLkVERC5yZXNvbHZlTWVhc3VyZW1lbnRSZWNvcmRUb05hbWUiLCJVdGwuRURELnJlc29sdmVNZWFzdXJlbWVudFJlY29yZFRvVW5pdHMiLCJVdGwuUXRpcEhlbHBlciIsIlV0bC5RdGlwSGVscGVyLmNvbnN0cnVjdG9yIiwiVXRsLlF0aXBIZWxwZXIuY3JlYXRlIiwiVXRsLlF0aXBIZWxwZXIuX2dlbmVyYXRlQ29udGVudCIsIlV0bC5RdGlwSGVscGVyLl9nZXRRVGlwRWxlbWVudCIsIlV0bC5Db2xvciIsIlV0bC5Db2xvci5jb25zdHJ1Y3RvciIsIlV0bC5Db2xvci5yZ2JhIiwiVXRsLkNvbG9yLnJnYiIsIlV0bC5Db2xvci5pbnRlcnBvbGF0ZSIsIlV0bC5Db2xvci50b1N0cmluZyIsIlV0bC5UYWJsZSIsIlV0bC5UYWJsZS5jb25zdHJ1Y3RvciIsIlV0bC5UYWJsZS5hZGRSb3ciLCJVdGwuVGFibGUuYWRkQ29sdW1uIiwiVXRsLlRhYmxlLmFkZFRhYmxlVG8iLCJVdGwuSlMiLCJVdGwuSlMuY29uc3RydWN0b3IiLCJVdGwuSlMuY3JlYXRlRWxlbWVudEZyb21TdHJpbmciLCJVdGwuSlMuYXNzZXJ0IiwiVXRsLkpTLmNvbnZlcnRIYXNoVG9MaXN0IiwiVXRsLkpTLnBhZFN0cmluZ0xlZnQiLCJVdGwuSlMucGFkU3RyaW5nUmlnaHQiLCJVdGwuSlMucmVwZWF0U3RyaW5nIiwiVXRsLkpTLnRpbWVzdGFtcFRvVG9kYXlTdHJpbmciLCJVdGwuSlMudXRjVG9Ub2RheVN0cmluZyIsIlV0bC5KUy5yZW1hcFZhbHVlIiwiVXRsLkpTLnJlbW92ZUFsbENoaWxkcmVuIiwiVXRsLkpTLnJlbW92ZUZyb21QYXJlbnQiLCJVdGwuSlMuZW5hYmxlRjEyVHJhcCIsIlV0bC5KUy5zdGFydFdhaXRCYWRnZSIsIlV0bC5KUy5zdG9wV2FpdEJhZGdlIiwiVXRsLkZpbGVEcm9wWm9uZSIsIlV0bC5GaWxlRHJvcFpvbmUuY29uc3RydWN0b3IiLCJVdGwuRmlsZURyb3Bab25lLnNldHVwIiwiVXRsLlNWRyIsIlV0bC5TVkcuY29uc3RydWN0b3IiLCJVdGwuU1ZHLmNyZWF0ZVNWRyIsIlV0bC5TVkcuY3JlYXRlVmVydGljYWxMaW5lUGF0aCIsIlV0bC5TVkcuY3JlYXRlTGluZSIsIlV0bC5TVkcuY3JlYXRlUmVjdCIsIlV0bC5TVkcuY3JlYXRlVGV4dCIsIlV0bC5TVkcubWFrZVJlY3RSb3VuZGVkIl0sIm1hcHBpbmdzIjoiQUFBQSxnREFBZ0Q7QUFDaEQscURBQXFEO0FBR3JELG1FQUFtRTtBQUVuRSxJQUFPLEdBQUcsQ0EyaEJUO0FBM2hCRCxXQUFPLEdBQUcsRUFBQyxDQUFDO0lBRVhBO1FBQUFDO1FBNkNBQyxDQUFDQTtRQTNDT0Qsa0NBQThCQSxHQUFyQ0EsVUFBc0NBLGlCQUF3Q0E7WUFFN0VFLElBQUlBLEtBQUtBLEdBQUdBLEVBQUVBLENBQUNBO1lBQ2ZBLHFFQUFxRUE7WUFDckVBLElBQUlBLEdBQUdBLEdBQUdBLGlCQUFpQkEsQ0FBQ0EsR0FBR0EsQ0FBQ0E7WUFDaENBLEVBQUVBLENBQUNBLENBQUNBLEdBQUdBLElBQUlBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO2dCQUNkQSxJQUFJQSxRQUFRQSxHQUFHQSxFQUFFQSxDQUFDQTtnQkFDbEJBLElBQUlBLE1BQU1BLEdBQUdBLGlCQUFpQkEsQ0FBQ0EsRUFBRUEsQ0FBQ0E7Z0JBQ2xDQSxFQUFFQSxDQUFDQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQTtvQkFDWkEsSUFBSUEsT0FBT0EsR0FBR0EsT0FBT0EsQ0FBQ0EsMkJBQTJCQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTtvQkFDMURBLEVBQUVBLENBQUNBLENBQUNBLE9BQU9BLENBQUNBLENBQUNBLENBQUNBO3dCQUNiQSxRQUFRQSxHQUFHQSxPQUFPQSxDQUFDQSxFQUFFQSxHQUFHQSxH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QUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDOURBLENBQUNBLFNBQVNBLEdBQUdBLENBQUNBLEdBQUdBLEdBQUdBLENBQUNBLEVBQUVBLEdBQUdBLENBQUNBLEdBQUdBLEdBQUdBLENBQUNBLEVBQUVBLEdBQUdBLElBQUlBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO2dCQUNuREEsT0FBT0EsR0FBR0EsV0FBV0EsQ0FBQ0E7WUFDdkJBLENBQUNBO1lBQUNBLElBQUlBLENBQUNBLENBQUNBO2dCQUNQQSxJQUFJQSxRQUFRQSxHQUFHQSxFQUFFQSxDQUFDQTtnQkFDbEJBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLElBQUlBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBO29CQUNuQkEsUUFBUUEsR0FBR0EsR0FBR0EsR0FBR0EsSUFBSUEsQ0FBQ0E7Z0JBQ3ZCQSxDQUFDQTtnQkFDREEsT0FBT0EsR0FBR0EsR0FBR0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsR0FBR0EsR0FBR0EsSUFBSUEsR0FBR0EsUUFBUUEsQ0FBQ0E7WUFDNUNBLENBQUNBO1lBRURBLElBQUlBLFFBQVFBLEdBQUdBLElBQUlBLENBQUNBO1lBQ3BCQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxHQUFHQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFBQ0EsUUFBUUEsR0FBR0EsSUFBSUEsQ0FBQ0E7WUFBQ0EsQ0FBQ0E7WUFDbkNBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLEdBQUdBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO2dCQUFDQSxJQUFJQSxJQUFJQSxFQUFFQSxDQUFDQTtZQUFDQSxDQUFDQTtZQUM5QkEsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQUNBLElBQUlBLEdBQUdBLEVBQUVBLENBQUNBO1lBQUNBLENBQUNBO1lBQ2xDQSxFQUFFQSxDQUFDQSxDQUFD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QUFlQSxHQUF0QkEsVUFBdUJBLElBQUlBLEVBQUVBLEVBQUVBLEVBQUVBLEVBQUVBO1lBQy9CTyxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxJQUFJQSxFQUFFQSxFQUFFQSxDQUFDQSxDQUFDQTtZQUM1QkEsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsSUFBSUEsRUFBRUEsRUFBRUEsQ0FBQ0EsQ0FBQ0E7UUFDaENBLENBQUNBO1FBRWNQLGNBQVVBLEdBQVVBLDRCQUE0QkEsQ0FBQ0E7UUFFakVBLFVBQUNBO0lBQURBLENBQUNBLEFBcklEeEMsSUFxSUNBO0lBcklZQSxPQUFHQSxNQXFJZkEsQ0FBQUE7QUFFRkEsQ0FBQ0EsRUEzaEJNLEdBQUcsS0FBSCxHQUFHLFFBMmhCVCxDQUFDLGlCQUFpQiIsInNvdXJjZXNDb250ZW50IjpbIi8vIENvbXBpbGVkIHRvIEpTIG9uOiBUaHUgSmFuIDIxIDIwMTYgMTc6Mjc6MTAgIFxuLy8vIDxyZWZlcmVuY2UgcGF0aD1cInR5cGVzY3JpcHQtZGVjbGFyYXRpb25zLmQudHNcIiAvPlxuXG5cbi8vIFRoaXMgZmlsZSBjb250YWlucyB2YXJpb3VzIHV0aWxpdHkgY2xhc3NlcyB1bmRlciB0aGUgVXRsIG1vZHVsZS5cblxubW9kdWxlIFV0bCB7XG5cblx0ZXhwb3J0IGNsYXNzIEVERCB7XG5cblx0XHRzdGF0aWMgcmVzb2x2ZU1lYXN1cmVtZW50UmVjb3JkVG9OYW1lKG1lYXN1cmVtZW50UmVjb3JkOkFzc2F5TWVhc3VyZW1lbnRSZWNvcmQpOnN0cmluZyB7XG5cblx0XHRcdHZhciBtTmFtZSA9ICcnO1xuXHRcdFx0Ly8gV2UgZmlndXJlIG91dCB0aGUgbmFtZSBhbmQgdW5pdHMgZGlmZmVyZW50bHkgYmFzZWQgb24gdGhlIHN1YnR5cGUuXG5cdFx0XHR2YXIgbXN0ID0gbWVhc3VyZW1lbnRSZWNvcmQubXN0O1xuXHRcdFx0aWYgKG1zdCA9PSAxKSB7XHQvLyBNZXRhYm9saXRlIHR5cGUuICBNYWdpYyBudW1iZXJzLiAgRVchICBUT0RPOiBFZWVldyFcblx0XHRcdFx0dmFyIGNvbXBOYW1lID0gJyc7XG5cdFx0XHRcdHZhciBjb21wSUQgPSBtZWFzdXJlbWVudFJlY29yZC5tcTtcblx0XHRcdFx0aWYgKGNvbXBJRCkge1xuXHRcdFx0XHRcdHZhciBjUmVjb3JkID0gRURERGF0YS5NZWFzdXJlbWVudFR5cGVDb21wYXJ0bWVudHNbY29tcElEXTtcblx0XHRcdFx0XHRpZiAoY1JlY29yZCkge1xuXHRcdFx0XHRcdFx0Y29tcE5hbWUgPSBjUmVjb3JkLnNuICsgJyAnO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuICAgICAgICAgICAgXHR2YXIgbVJlY29yZCA9IEVERERhdGEuTWV0YWJvbGl0ZVR5cGVzW21lYXN1cmVtZW50UmVjb3JkLm10XTtcbiAgICAgICAgICAgIFx0bU5hbWUgPSBjb21wTmFtZSArIG1SZWNvcmQubmFtZTtcblx0XHQgICAgfSBlbHNlIGlmIChtc3QgPT0gMikge1x0Ly8gR2VuZSB0eXBlLiAgRVdXIEVXV1xuICAgICAgICAgICAgXHRtTmFtZSA9IEVERERhdGEuR2VuZVR5cGVzW21lYXN1cmVtZW50UmVjb3JkLm10XS5uYW1lO1xuXHRcdCAgICB9IGVsc2UgaWYgKG1zdCA9PSAzKSB7XHQvLyBQcm90ZWluIHR5cGUuICBFV1cgRVdXXG4gICAgICAgICAgICBcdG1OYW1lID0gRURERGF0YS5Qcm90ZWluVHlwZXNbbWVhc3VyZW1lbnRSZWNvcmQubXRdLm5hbWU7XG5cdFx0ICAgIH1cblx0XHQgICAgcmV0dXJuIG1OYW1lO1xuXHRcdH1cblxuXG5cdFx0c3RhdGljIHJlc29sdmVNZWFzdXJlbWVudFJlY29yZFRvVW5pdHMobWVhc3VyZW1lbnRSZWNvcmQ6QXNzYXlNZWFzdXJlbWVudFJlY29yZCk6c3RyaW5nIHtcblxuXHRcdFx0dmFyIG1Vbml0cyA9ICcnO1xuXHRcdFx0dmFyIG1zdCA9IG1lYXN1cmVtZW50UmVjb3JkLm1zdDtcblx0XHRcdGlmIChtc3QgPT0gMSkge1x0XHQvLyBUT0RPOiBodHRwczovL3d3dy55b3V0dWJlLmNvbS93YXRjaD92PUpsdEVYcGJHTThzXG4gICAgICAgICAgICBcdGlmIChtZWFzdXJlbWVudFJlY29yZC51aWQpIHtcblx0ICAgICAgICAgICAgXHR2YXIgdVJlY29yZCA9IEVERERhdGEuVW5pdFR5cGVzW21lYXN1cmVtZW50UmVjb3JkLnVpZF07XG5cdCAgICAgICAgICAgIFx0aWYgKHVSZWNvcmQpIHtcblx0ICAgICAgICAgICAgXHRcdG1Vbml0cyA9IHVSZWNvcmQubmFtZTtcblx0ICAgICAgICAgICAgXHR9XG5cdFx0ICAgICAgICB9XG5cdFx0ICAgIH0gZWxzZSBpZiAobXN0ID09IDIpIHtcbiAgICAgICAgICAgIFx0bVVuaXRzID0gJyc7XHQvLyBVbml0cyBmb3IgUHJvdGVvbWljcz8gIEFueW9uZT9cblx0XHQgICAgfSBlbHNlIGlmIChtc3QgPT0gMykge1xuICAgICAgICAgICAgXHRtVW5pdHMgPSAnUlBLTSc7XG5cdFx0ICAgIH1cblx0XHQgICAgcmV0dXJuIG1Vbml0cztcblx0XHR9XG5cdH1cblxuXG5cdGV4cG9ydCBjbGFzcyBRdGlwSGVscGVyIHtcblx0XHRwdWJsaWMgY3JlYXRlKGxpbmtFbGVtZW50LCBjb250ZW50RnVuY3Rpb24sIHBhcmFtczphbnkpOnZvaWQge1xuXG5cdFx0XHRwYXJhbXMucG9zaXRpb24udGFyZ2V0ID0gJChsaW5rRWxlbWVudCk7XG5cdFx0XHRwYXJhbXMucG9zaXRpb24udmlld3BvcnQgPSAkKHdpbmRvdyk7XHQvLyBUaGlzIG1ha2VzIGl0IHBvc2l0aW9uIGl0c2VsZiB0byBmaXQgaW5zaWRlIHRoZSBicm93c2VyIHdpbmRvdy5cblxuXHRcdFx0dGhpcy5fY29udGVudEZ1bmN0aW9uID0gY29udGVudEZ1bmN0aW9uO1xuXG5cdFx0XHRpZiAoIXBhcmFtcy5jb250ZW50KVxuXHRcdFx0XHRwYXJhbXMuY29udGVudCA9IHt9O1xuXG5cdFx0XHRwYXJhbXMuY29udGVudC50ZXh0ID0gdGhpcy5fZ2VuZXJhdGVDb250ZW50LmJpbmQodGhpcyk7XG5cdFx0XHR0aGlzLnF0aXAgPSAkKGxpbmtFbGVtZW50KS5xdGlwKHBhcmFtcyk7XG5cdFx0fVxuXG5cdFx0cHJpdmF0ZSBfZ2VuZXJhdGVDb250ZW50KCk6YW55IHtcblx0XHRcdC8vIEl0J3MgaW5jcmVkaWJseSBzdHVwaWQgdGhhdCB3ZSBoYXZlIHRvIGRvIHRoaXMgdG8gd29yayBhcm91bmQgcXRpcDIncyAyODBweCBtYXgtd2lkdGggZGVmYXVsdC5cblx0XHRcdC8vIFdlIGhhdmUgdG8gZG8gaXQgaGVyZSByYXRoZXIgdGhhbiBpbW1lZGlhdGVseSBhZnRlciBjYWxsaW5nIHF0aXAoKSBiZWNhdXNlIHF0aXAgd2FpdHMgdG8gY3JlYXRlXG5cdFx0XHQvLyB0aGUgYWN0dWFsIGVsZW1lbnQuXG5cdFx0XHR2YXIgcSA9IHRoaXMuX2dldFFUaXBFbGVtZW50KCk7XG5cdFx0XHQkKHEpLmNzcygnbWF4LXdpZHRoJywgJ25vbmUnKTtcblx0XHRcdCQocSkuY3NzKCd3aWR0aCcsICdhdXRvJyk7XG5cblx0XHRcdHJldHVybiB0aGlzLl9jb250ZW50RnVuY3Rpb24oKTtcblx0XHR9XG5cblx0XHQvLyBHZXQgdGhlIEhUTUwgZWxlbWVudCBmb3IgdGhlIHF0aXAuIFVzdWFsbHkgd2UgdXNlIHRoaXMgdG8gdW5zZXQgbWF4LXdpZHRoLlxuXHRcdHByaXZhdGUgX2dldFFUaXBFbGVtZW50KCk6SFRNTEVsZW1lbnQge1xuXHRcdFx0cmV0dXJuIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKHRoaXMucXRpcC5hdHRyKCdhcmlhLWRlc2NyaWJlZGJ5JykpO1xuXHRcdH1cblxuXHRcdHB1YmxpYyBxdGlwOmFueTtcblx0XHRwcml2YXRlIF9jb250ZW50RnVuY3Rpb246YW55O1xuXHR9XG5cblxuXHQvLyBSR0JBIGhlbHBlciBjbGFzcy5cblx0Ly8gVmFsdWVzIGFyZSAwLTI1NSAoYWx0aG91Z2ggdG9TdHJpbmcoKSBtYWtlcyBhbHBoYSAwLTEgc2luY2UgdGhhdCdzIGhvdyBDU1MgbGlrZXMgaXQpLlxuXHRleHBvcnQgY2xhc3MgQ29sb3Ige1xuXG5cdFx0cjogbnVtYmVyO1xuXHRcdGc6IG51bWJlcjtcblx0XHRiOiBudW1iZXI7XG5cdFx0YTogbnVtYmVyO1xuXG5cdFx0Ly8gTm90ZTogQWxsIHZhbHVlcyBhcmUgMC0yNTUsIGJ1dCB0b1N0cmluZygpIHdpbGwgY29udmVydCBhbHBoYSB0byBhIDAtMSB2YWx1ZVxuXHRcdHN0YXRpYyByZ2JhKHI6bnVtYmVyLCBnOm51bWJlciwgYjpudW1iZXIsIGFscGhhOm51bWJlcikgOiBDb2xvciB7XG5cdFx0XHR2YXIgY2xyOkNvbG9yID0gbmV3IENvbG9yKCk7XG5cdFx0XHRjbHIuciA9IHI7XG5cdFx0XHRjbHIuZyA9IGc7XG5cdFx0XHRjbHIuYiA9IGI7XG5cdFx0XHRjbHIuYSA9IGFscGhhO1xuXHRcdFx0cmV0dXJuIGNscjtcblx0XHR9XG5cblx0XHQvLyBOb3RlOiBBbGwgdmFsdWVzIGFyZSAwLTI1NSwgYnV0IHRvU3RyaW5nKCkgd2lsbCBjb252ZXJ0IGFscGhhIHRvIGEgMC0xIHZhbHVlXG5cdFx0c3RhdGljIHJnYihyOm51bWJlciwgZzpudW1iZXIsIGI6bnVtYmVyKSA6IENvbG9yIHtcblx0XHRcdHZhciBjbHI6Q29sb3IgPSBuZXcgQ29sb3IoKTtcblx0XHRcdGNsci5yID0gcjtcblx0XHRcdGNsci5nID0gZztcblx0XHRcdGNsci5iID0gYjtcblx0XHRcdGNsci5hID0gMjU1O1xuXHRcdFx0cmV0dXJuIGNscjtcblx0XHR9XG5cblx0XHRzdGF0aWMgaW50ZXJwb2xhdGUoY2xyMTpDb2xvciwgY2xyMjpDb2xvciwgdDpudW1iZXIpIDogQ29sb3Ige1xuXHRcdFx0cmV0dXJuIENvbG9yLnJnYmEoXG5cdFx0XHRcdGNscjEuciArIChjbHIyLnIgLSBjbHIxLnIpICogdCwgXG5cdFx0XHRcdGNscjEuZyArIChjbHIyLmcgLSBjbHIxLmcpICogdCwgXG5cdFx0XHRcdGNscjEuYiArIChjbHIyLmIgLSBjbHIxLmIpICogdCwgXG5cdFx0XHRcdGNscjEuYSArIChjbHIyLmEgLSBjbHIxLmEpICogdFxuXHRcdFx0KTtcblx0XHR9XG5cblx0XHRzdGF0aWMgdG9TdHJpbmcoY2xyOmFueSkgOiBzdHJpbmcge1xuXHRcdFx0Ly8gSWYgaXQncyBzb21ldGhpbmcgZWxzZSAobGlrZSBhIHN0cmluZykgYWxyZWFkeSwganVzdCByZXR1cm4gdGhhdCB2YWx1ZS5cblx0XHRcdGlmICh0eXBlb2YgY2xyID09ICdzdHJpbmcnKVxuXHRcdFx0XHRyZXR1cm4gY2xyO1xuXG5cdFx0XHRyZXR1cm4gJ3JnYmEoJyArIE1hdGguZmxvb3IoY2xyLnIpICsgJywgJyArIE1hdGguZmxvb3IoY2xyLmcpICsgJywgJyArIE1hdGguZmxvb3IoY2xyLmIpICsgJywgJyArIGNsci5hLzI1NSArICcpJztcblx0XHR9XG5cblx0XHR0b1N0cmluZygpIDogc3RyaW5nIHtcblx0XHRcdHJldHVybiAncmdiYSgnICsgTWF0aC5mbG9vcih0aGlzLnIpICsgJywgJyArIE1hdGguZmxvb3IodGhpcy5nKSArICcsICcgKyBNYXRoLmZsb29yKHRoaXMuYikgKyAnLCAnICsgdGhpcy5hLzI1NSArICcpJztcblx0XHR9XG5cblx0XHRzdGF0aWMgcmVkID0gQ29sb3IucmdiKDI1NSwwLDApO1xuXHRcdHN0YXRpYyBncmVlbiA9IENvbG9yLnJnYigwLDI1NSwwKTtcblx0XHRzdGF0aWMgYmx1ZSA9IENvbG9yLnJnYigwLDAsMjU1KTtcblx0XHRzdGF0aWMgYmxhY2sgPSBDb2xvci5yZ2IoMCwwLDApO1xuXHRcdHN0YXRpYyB3aGl0ZSA9IENvbG9yLnJnYigyNTUsMjU1LDI1NSk7XG5cblx0fTtcblxuXG5cdGV4cG9ydCBjbGFzcyBUYWJsZSB7XG5cblx0XHRjb25zdHJ1Y3Rvcih0YWJsZUlEOnN0cmluZywgd2lkdGg/Om51bWJlciwgaGVpZ2h0PzpudW1iZXIpIHtcblx0XHRcdHRoaXMudGFibGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCd0YWJsZScpO1xuXHRcdFx0dGhpcy50YWJsZS5pZCA9IHRhYmxlSUQ7XG5cblx0XHRcdGlmICh3aWR0aClcblx0XHRcdFx0JCh0aGlzLnRhYmxlKS5jc3MoJ3dpZHRoJywgd2lkdGgpO1xuXG5cdFx0XHRpZiAoaGVpZ2h0KVxuXHRcdFx0XHQkKHRoaXMudGFibGUpLmNzcygnaGVpZ2h0JywgaGVpZ2h0KTtcblx0XHR9XG5cblx0XHRhZGRSb3coKTpIVE1MVGFibGVSb3dFbGVtZW50IHtcblx0XHRcdHZhciByb3cgPSB0aGlzLnRhYmxlLmluc2VydFJvdygtMSk7XG5cdFx0XHR0aGlzLl9jdXJyZW50Um93Kys7XG5cdFx0XHRyZXR1cm4gPEhUTUxUYWJsZVJvd0VsZW1lbnQ+cm93O1xuXHRcdH1cblxuXHRcdGFkZENvbHVtbigpOkhUTUxFbGVtZW50IHtcblx0XHRcdHZhciByb3c6SFRNTFRhYmxlUm93RWxlbWVudCA9IDxIVE1MVGFibGVSb3dFbGVtZW50PnRoaXMudGFibGUucm93c1t0aGlzLl9jdXJyZW50Um93LTFdO1xuXHRcdFx0dmFyIGNvbHVtbjpIVE1MRWxlbWVudCA9IHJvdy5pbnNlcnRDZWxsKC0xKTtcblx0XHRcdHJldHVybiBjb2x1bW47XG5cdFx0fVxuXG5cdFx0Ly8gV2hlbiB5b3UncmUgZG9uZSBzZXR0aW5nIHVwIHRoZSB0YWJsZSwgYWRkIGl0IHRvIGFub3RoZXIgZWxlbWVudC5cblx0XHRhZGRUYWJsZVRvKGVsZW1lbnQ6SFRNTEVsZW1lbnQpIHtcblx0XHRcdGVsZW1lbnQuYXBwZW5kQ2hpbGQodGhpcy50YWJsZSk7XG5cdFx0fVxuXG5cdFx0dGFibGU6SFRNTFRhYmxlRWxlbWVudCA9IG51bGw7XG5cdFx0X2N1cnJlbnRSb3c6bnVtYmVyID0gMDtcblx0fVxuXG5cblx0Ly8gSmF2YXNjcmlwdCB1dGlsaXRpZXNcblx0ZXhwb3J0IGNsYXNzIEpTIHtcblxuXHRcdC8vIFRoaXMgYXNzdW1lcyB0aGF0IHN0ciBoYXMgb25seSBvbmUgcm9vdCBlbGVtZW50LlxuXHRcdC8vIEl0IGFsc28gYnJlYWtzIGZvciBlbGVtZW50cyB0aGF0IG5lZWQgdG8gYmUgbmVzdGVkIHVuZGVyIG90aGVyIHNwZWNpZmljIGVsZW1lbnQgdHlwZXMsXG5cdFx0Ly8gZS5nLiBpZiB5b3UgYXR0ZW1wdCB0byBjcmVhdGUgYSA8dGQ+IHlvdSB3aWxsIGJlIGhhbmRlZCBiYWNrIGEgPGRpdj4uXG5cdFx0c3RhdGljIGNyZWF0ZUVsZW1lbnRGcm9tU3RyaW5nKHN0cjogc3RyaW5nLCBuYW1lc3BhY2U6IHN0cmluZyA9IG51bGwpOiBIVE1MRWxlbWVudCB7XG5cblx0XHRcdHZhciBkaXY7XG5cdFx0XHRpZiAobmFtZXNwYWNlKVxuXHRcdFx0XHRkaXYgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50TlMobmFtZXNwYWNlLCAnZGl2Jyk7XG5cdFx0XHRlbHNlXG5cdFx0XHRcdGRpdiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXG5cdFx0XHRkaXYuaW5uZXJIVE1MID0gc3RyO1xuXHRcdFx0cmV0dXJuIGRpdi5maXJzdENoaWxkO1xuXG5cdFx0fVxuXG5cblx0XHRzdGF0aWMgYXNzZXJ0KGNvbmRpdGlvbjogYm9vbGVhbiwgbWVzc2FnZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0XHRpZiAoIWNvbmRpdGlvbikge1xuICAgICAgICAgICAgICAgIG1lc3NhZ2UgPSBtZXNzYWdlIHx8IFwiQXNzZXJ0aW9uIGZhaWxlZFwiO1xuICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgRXJyb3IgIT09ICd1bmRlZmluZWQnKSB0aHJvdyBFcnJvcihtZXNzYWdlKTtcbiAgICAgICAgICAgICAgICBlbHNlIHRocm93IG1lc3NhZ2U7XG5cdFx0XHR9XG5cdFx0fVxuXG5cblx0XHRzdGF0aWMgY29udmVydEhhc2hUb0xpc3QoaGFzaDogYW55KTogYW55IHtcblx0XHRcdHJldHVybiBPYmplY3Qua2V5cyhoYXNoKS5tYXAoZnVuY3Rpb24oYSkgeyByZXR1cm4gaGFzaFthXTsgfSk7XG5cdFx0fVxuXG5cblx0XHQvLyBSZXR1cm5zIGEgc3RyaW5nIG9mIGxlbmd0aCBudW1DaGFycywgcGFkZGluZyB0aGUgcmlnaHQgc2lkZVxuXHRcdC8vIHdpdGggc3BhY2VzIGlmIHN0ciBpcyBzaG9ydGVyIHRoYW4gbnVtQ2hhcnMuXG5cdFx0Ly8gV2lsbCB0cnVuY2F0ZSBpZiB0aGUgc3RyaW5nIGlzIGxvbmdlciB0aGFuIG51bUNoYXJzLlxuXHRcdHN0YXRpYyBwYWRTdHJpbmdMZWZ0KHN0cjogc3RyaW5nLCBudW1DaGFyczogbnVtYmVyKTogc3RyaW5nIHtcblx0XHRcdHZhciBzdGFydExlbjogbnVtYmVyID0gc3RyLmxlbmd0aDtcblx0XHRcdGZvciAodmFyIGkgPSBzdGFydExlbjsgaSA8IG51bUNoYXJzOyBpKyspXG5cdFx0XHRcdHN0ciArPSAnICc7XG5cblx0XHRcdHJldHVybiBzdHIuc2xpY2UoMCwgbnVtQ2hhcnMpO1xuXHRcdH1cblxuXG5cdFx0Ly8gUmV0dXJucyBhIHN0cmluZyBvZiBsZW5ndGggbnVtQ2hhcnMsIHBhZGRpbmcgdGhlIGxlZnQgc2lkZVxuXHRcdC8vIHdpdGggc3BhY2VzIGlmIHN0ciBpcyBzaG9ydGVyIHRoYW4gbnVtQ2hhcnMuXG5cdFx0c3RhdGljIHBhZFN0cmluZ1JpZ2h0KHN0cjogc3RyaW5nLCBudW1DaGFyczogbnVtYmVyKTogc3RyaW5nIHtcblx0XHRcdHZhciBwYWRTdHIgPSBcIlwiO1xuXHRcdFx0Zm9yICh2YXIgaSA9IDA7IGkgPCBudW1DaGFyczsgaSsrKVxuXHRcdFx0XHRwYWRTdHIgKz0gXCIgXCI7XG5cblx0XHRcdHJldHVybiAocGFkU3RyICsgc3RyKS5zbGljZSgtbnVtQ2hhcnMpO1xuXHRcdH1cblxuXG5cdFx0Ly8gTWFrZSBhIHN0cmluZyBieSByZXBlYXRpbmcgdGhlIHNwZWNpZmllZCBzdHJpbmcgTiB0aW1lcy5cblx0XHRzdGF0aWMgcmVwZWF0U3RyaW5nKHN0cjogc3RyaW5nLCBudW1DaGFyczogbnVtYmVyKTogc3RyaW5nIHtcblx0XHRcdHZhciByZXQ6IHN0cmluZyA9IFwiXCI7XG5cdFx0XHRmb3IgKHZhciBpOiBudW1iZXIgPSAwOyBpIDwgbnVtQ2hhcnM7IGkrKylcblx0XHRcdFx0cmV0ICs9IHN0cjtcblxuXHRcdFx0cmV0dXJuIHJldDtcblx0XHR9XG5cblxuXHRcdC8vIEdpdmVuIGEgZGF0ZSBpbiBzZWNvbmRzICh3aXRoIGEgcG9zc2libGUgZnJhY3Rpb25hbCBwb3J0aW9uIGJlaW5nIG1pbGxpc2Vjb25kcyksXG5cdFx0Ly8gYmFzZWQgb24gemVybyBiZWluZyBtaWRuaWdodCBvZiBKYW4gMSwgMTk3MCAoc3RhbmRhcmQgb2xkLXNjaG9vbCBQT1NJWCB0aW1lKSxcblx0XHQvLyByZXR1cm4gYSBzdHJpbmcgZm9ybWF0dGVkIGluIHRoZSBtYW5uZXIgb2YgXCJEZWMgMjEgMjAxMiwgMTE6NDVhbVwiLFxuXHRcdC8vIHdpdGggZXhjZXB0aW9ucyBmb3IgJ1RvZGF5JyBhbmQgJ1llc3RlcmRheScsIGUuZy4gXCJZZXN0ZXJkYXksIDM6MTJwbVwiLlxuXHRcdHN0YXRpYyB0aW1lc3RhbXBUb1RvZGF5U3RyaW5nKHRpbWVzdGFtcDogbnVtYmVyKTogc3RyaW5nIHtcblxuXHRcdFx0Ly8gQ29kZSBhZGFwdGVkIGZyb20gUGVybCdzIEhUVFAtRGF0ZVxuXHRcdFx0Ly92YXIgRG9XID0gWydTdW4nLCdNb24nLCdUdWUnLCdXZWQnLCdUaHUnLCdGcmknLCdTYXQnXTtcblx0XHRcdHZhciBNb1kgPSBbJ0phbicsICdGZWInLCAnTWFyJywgJ0FwcicsICdNYXknLCAnSnVuJywgJ0p1bCcsICdBdWcnLCAnU2VwJywgJ09jdCcsICdOb3YnLCAnRGVjJ107XG5cblx0XHRcdGlmICghdGltZXN0YW1wIHx8IHRpbWVzdGFtcCA8IDEpIHtcblx0XHRcdFx0cmV0dXJuICc8c3BhbiBzdHlsZT1cImNvbG9yOiM4ODg7XCI+Ti9BPC9zcGFuPic7XG5cdFx0XHR9XG5cblx0XHRcdHZhciB0ID0gbmV3IERhdGUoTWF0aC5yb3VuZCh0aW1lc3RhbXAgKiAxMDAwKSk7XG5cdFx0XHR2YXIgbiA9IG5ldyBEYXRlKCk7XG5cdFx0XHR2YXIgbm93ID0gbi5nZXRUaW1lKCk7XG5cblx0XHRcdHZhciBzZWMgPSB0LmdldFNlY29uZHMoKTtcblx0XHRcdHZhciBtaW46IGFueSA9IHQuZ2V0TWludXRlcygpO1x0Ly8gVHlwZSBcImFueVwiIHNvIHdlIGNhbiBhZGQgYSBsZWFkaW5nIHplcm9cblx0XHRcdHZhciBob3VyID0gdC5nZXRIb3VycygpO1xuXHRcdFx0dmFyIG1kYXkgPSB0LmdldERhdGUoKTtcdFx0Ly8gUmV0dXJucyB0aGUgZGF5IG9mIHRoZSBtb250aCAoZnJvbSAxLTMxKVxuXHRcdFx0dmFyIG1vbiA9IHQuZ2V0TW9udGgoKTtcdFx0Ly8gUmV0dXJucyB0aGUgbW9udGggKGZyb20gMC0xMSlcblx0XHRcdHZhciB5ZWFyID0gdC5nZXRGdWxsWWVhcigpO1x0Ly8gUmV0dXJucyB0aGUgeWVhciAoZm91ciBkaWdpdHMpXG5cdFx0XHR2YXIgd2RheSA9IHQuZ2V0RGF5KCk7XHRcdC8vIFJldHVybnMgdGhlIGRheSBvZiB0aGUgd2VlayAoZnJvbSAwLTYpXG5cblx0XHRcdHZhciBuc2VjID0gbi5nZXRTZWNvbmRzKCk7XG5cdFx0XHR2YXIgbm1pbiA9IG4uZ2V0TWludXRlcygpO1xuXHRcdFx0dmFyIG5ob3VyID0gbi5nZXRIb3VycygpO1xuXHRcdFx0dmFyIG5tZGF5ID0gbi5nZXREYXRlKCk7XG5cdFx0XHR2YXIgbm1vbiA9IG4uZ2V0TW9udGgoKTtcblx0XHRcdHZhciBueWVhciA9IG4uZ2V0RnVsbFllYXIoKTtcblx0XHRcdHZhciBud2RheSA9IG4uZ2V0RGF5KCk7XG5cblx0XHRcdHZhciBkYXlfc3RyO1xuXG5cdFx0XHRpZiAoKHllYXIgPT0gbnllYXIpICYmIChtb24gPT0gbm1vbikgJiYgKG1kYXkgPT0gbm1kYXkpKSB7XG5cdFx0XHRcdGRheV9zdHIgPSAnVG9kYXknO1xuXHRcdFx0fSBlbHNlIGlmICgobm93IC0gKG5zZWMgKyAoNjAgKiAobm1pbiArICg2MCAqIChuaG91ciArIDI0KSkpKSkpID09XHRcdC8vIE5vdydzIGRheSBjb21wb25lbnQgbWludXMgYSBkYXlcblx0XHRcdFx0KHRpbWVzdGFtcCAtIChzZWMgKyAoNjAgKiAobWluICsgKDYwICogaG91cikpKSkpKSB7XHQvLyBUaW1lc3RhbXAncyBkYXkgY29tcG9uZW50XG5cdFx0XHRcdGRheV9zdHIgPSAnWWVzdGVyZGF5Jztcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHZhciB5ZWFyX3N0ciA9ICcnO1xuXHRcdFx0XHRpZiAoeWVhciAhPSBueWVhcikge1xuXHRcdFx0XHRcdHllYXJfc3RyID0gJyAnICsgeWVhcjtcblx0XHRcdFx0fVxuXHRcdFx0XHRkYXlfc3RyID0gTW9ZW21vbl0gKyAnICcgKyBtZGF5ICsgeWVhcl9zdHI7XG5cdFx0XHR9XG5cblx0XHRcdHZhciBoYWxmX2RheSA9ICdhbSc7XG5cdFx0XHRpZiAoaG91ciA+IDExKSB7IGhhbGZfZGF5ID0gJ3BtJzsgfVxuXHRcdFx0aWYgKGhvdXIgPiAxMikgeyBob3VyIC09IDEyOyB9XG5cdFx0XHRlbHNlIGlmIChob3VyID09IDApIHsgaG91ciA9IDEyOyB9XG5cdFx0XHRpZiAobWluIDwgOSkgeyBtaW4gPSAnMCcgKyBtaW47IH1cblxuXHRcdFx0cmV0dXJuIGRheV9zdHIgKyAnLCAnICsgaG91ciArICc6JyArIG1pbiArIGhhbGZfZGF5O1xuXHRcdH1cblxuXG4gICAgICAgIHN0YXRpYyB1dGNUb1RvZGF5U3RyaW5nKHV0Yzogc3RyaW5nKTogc3RyaW5nIHtcbiAgICAgICAgICAgIHZhciBtOiBhbnlbXTtcbiAgICAgICAgICAgIHZhciB0aW1lc3RhbXA6IG51bWJlcjtcbiAgICAgICAgICAgIG0gPSAvXihcXGR7NH0pLShcXGR7Mn0pLShcXGR7Mn0pVChcXGR7Mn0pOihcXGR7Mn0pOihcXGR7Mn0pXFwuPyhcXGR7MSw2fSk/WiQvLmV4ZWModXRjKTtcbiAgICAgICAgICAgIGlmIChtKSB7XG4gICAgICAgICAgICAgICAgbS5zaGlmdCgpOyAvLyBnZXQgcmlkIG9mIG92ZXJhbGwgbWF0Y2gsIHdlIGRvbid0IGNhcmVcbiAgICAgICAgICAgICAgICBtLm1hcCgodikgPT4geyByZXR1cm4gcGFyc2VJbnQodiwgMTApOyB9KTsgLy8gY29udmVydCBzdHJpbmdzIHRvIG51bWJlcnNcbiAgICAgICAgICAgICAgICBtWzFdLS07IC8vIERhdGUgdXNlcyAwLWJhc2VkIG1vbnRocywgc28gZGVjcmVtZW50IG1vbnRoXG4gICAgICAgICAgICAgICAgdGltZXN0YW1wID0gRGF0ZS5VVEMobVswXSwgbVsxXSwgbVsyXSwgbVszXSwgbVs0XSwgbVs1XSk7XG4gICAgICAgICAgICAgICAgdGltZXN0YW1wIC89IDEwMDA7IC8vIHRoZSB0aW1lc3RhbXBUb1RvZGF5U3RyaW5nIGV4cGVjdHMgc2Vjb25kcywgbm90IG1pbGxpc2Vjb25kc1xuICAgICAgICAgICAgICAgIHJldHVybiBVdGwuSlMudGltZXN0YW1wVG9Ub2RheVN0cmluZyh0aW1lc3RhbXApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIFV0bC5KUy50aW1lc3RhbXBUb1RvZGF5U3RyaW5nKG51bGwpO1xuICAgICAgICB9XG5cblxuXHRcdC8vIFJlbWFwIGEgdmFsdWUgZnJvbSBbaW5NaW4sIGluTWF4XSB0byBbb3V0TWluLCBvdXRNYXhdXG5cdFx0c3RhdGljIHJlbWFwVmFsdWUodmFsdWU6IG51bWJlciwgaW5NaW46IG51bWJlciwgaW5NYXg6IG51bWJlciwgb3V0TWluOiBudW1iZXIsIG91dE1heDogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRcdHZhciBkZWx0YTogbnVtYmVyID0gaW5NYXggLSBpbk1pbjtcblxuXHRcdFx0Ly8gSWYgdGhleSd2ZSBnaXZlbiB1cyBhIHRpbnkgaW5wdXQgcmFuZ2UsIHRoZW4gd2UgY2FuJ3QgcmVhbGx5IHBhcmFtZXRlcml6ZVxuXHRcdFx0Ly8gaW50byB0aGUgcmFuZ2UsIHNvIGxldCdzIGp1c3QgcmV0dXJuIGhhbGZ3YXkgYmV0d2VlbiB0aGUgb3V0cHV0cy5cblx0XHRcdGlmIChNYXRoLmFicyhkZWx0YSkgPCAwLjAwMDAwMSlcblx0XHRcdFx0cmV0dXJuIG91dE1pbiArIChvdXRNYXggLSBvdXRNaW4pICogMC41O1xuXG5cdFx0XHR2YXIgdCA9ICh2YWx1ZSAtIGluTWluKSAvIChpbk1heCAtIGluTWluKTtcblx0XHRcdHJldHVybiBvdXRNaW4gKyAob3V0TWF4IC0gb3V0TWluKSAqIHQ7XG5cdFx0fVxuXG5cdFx0Ly8gUmVtb3ZlIGFsbCBjaGlsZCBlbGVtZW50cyBmcm9tIHRoZSBzcGVjaWZpZWQgZWxlbWVudC5cblx0XHRzdGF0aWMgcmVtb3ZlQWxsQ2hpbGRyZW4oZWxlbWVudDogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRcdHdoaWxlIChlbGVtZW50LmZpcnN0Q2hpbGQpXG5cdFx0XHRcdGVsZW1lbnQucmVtb3ZlQ2hpbGQoZWxlbWVudC5maXJzdENoaWxkKTtcblx0XHR9XG5cblx0XHRzdGF0aWMgcmVtb3ZlRnJvbVBhcmVudChlbGVtZW50OiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdFx0aWYgKGVsZW1lbnQgJiYgZWxlbWVudC5wYXJlbnROb2RlKVxuXHRcdFx0XHRlbGVtZW50LnBhcmVudE5vZGUucmVtb3ZlQ2hpbGQoZWxlbWVudCk7XG5cdFx0fVxuXG5cdFx0Ly8gQ2FsbCB0aGlzIGFueXdoZXJlIGluIHlvdXIgY29kZSB0byB0cmFwIEYxMiBrZXlwcmVzcyB0byBzdG9wIGluIGRlYnVnZ2VyLlxuXHRcdC8vIFRoaXMgaXMgdXNlZnVsIGZvciBsb29raW5nIGF0IERPTSBlbGVtZW50cyBpbiBhIHBvcHVwIHRoYXQgd291bGQgbm9ybWFsbHkgZ28gYXdheSB3aGVuXG5cdFx0Ly8geW91IG1vdmVkIHRoZSBtb3VzZSBhd2F5IGZyb20gaXQuXG5cdFx0c3RhdGljIGVuYWJsZUYxMlRyYXAoKTogdm9pZCB7XG5cdFx0XHQkKHdpbmRvdykua2V5ZG93bihmdW5jdGlvbihlKSB7IGlmIChlLmtleUNvZGUgPT0gMTIzKSBkZWJ1Z2dlcjsgfSk7XG5cdFx0fVxuXG5cdFx0c3RhdGljIHN0YXJ0V2FpdEJhZGdlKHNlbGVjdG9yKTogdm9pZCB7XG5cdFx0XHQkKHNlbGVjdG9yKS5jc3MoXCJjbGFzc1wiLCBcIndhaXRiYWRnZSB3YWl0XCIpO1xuXHRcdH1cblxuXHRcdHN0YXRpYyBzdG9wV2FpdEJhZGdlKHNlbGVjdG9yKTogdm9pZCB7XG5cdFx0XHQkKHNlbGVjdG9yKS5jc3MoXCJjbGFzc1wiLCBcIndhaXRiYWRnZVwiKTtcblx0XHR9XG5cdH1cblxuXG5cdGV4cG9ydCBjbGFzcyBGaWxlRHJvcFpvbmUge1xuXG5cdFx0c3RhdGljIHNldHVwKGVsZW1lbnRfaWQsIHVybCwgcHJvY2Vzc19yZXN1bHQsIG11bHRpcGxlKTp2b2lkIHtcblx0XHRcdHZhciB6b25lID0gbmV3IEZpbGVEcm9wKGVsZW1lbnRfaWQsIHt9KTtcdC8vIGZpbGVkcm9wLW1pbi5qcyAsIGh0dHA6Ly9maWxlZHJvcGpzLm9yZ1xuXHRcdFx0dmFyIGNzcmZ0b2tlbiA9IGpRdWVyeS5jb29raWUoJ2NzcmZ0b2tlbicpO1xuXHRcdFx0aWYgKCEodHlwZW9mIG11bHRpcGxlID09PSBcInVuZGVmaW5lZFwiKSkge1xuXHRcdFx0XHR6b25lLm11bHRpcGxlKG11bHRpcGxlKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHpvbmUubXVsdGlwbGUoZmFsc2UpO1xuXHRcdFx0fVxuXHRcdFx0em9uZS5ldmVudCgnc2VuZCcsIGZ1bmN0aW9uKGZpbGVzKSB7XG5cdFx0XHRcdGZpbGVzLmVhY2goZnVuY3Rpb24oZmlsZSkge1xuXHRcdFx0XHRcdGZpbGUuZXZlbnQoJ2RvbmUnLCBmdW5jdGlvbih4aHIpIHtcblx0XHRcdFx0XHRcdHZhciByZXN1bHQgPSBqUXVlcnkucGFyc2VKU09OKHhoci5yZXNwb25zZVRleHQpO1xuXHRcdFx0XHRcdFx0Y29uc29sZS5sb2cocmVzdWx0KTtcblx0XHRcdFx0XHRcdGlmIChyZXN1bHQucHl0aG9uX2Vycm9yKSB7XG5cdFx0XHRcdFx0XHRcdGFsZXJ0KHJlc3VsdC5weXRob25fZXJyb3IpO1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0cHJvY2Vzc19yZXN1bHQocmVzdWx0KTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9KTtcblxuXHRcdFx0XHRcdGZpbGUuZXZlbnQoJ2Vycm9yJywgZnVuY3Rpb24oZSwgeGhyKSB7XG5cdFx0XHRcdFx0XHRhbGVydCgnRXJyb3IgdXBsb2FkaW5nICcgKyB0aGlzLm5hbWUgKyAnOiAnICtcblx0XHRcdFx0XHRcdFx0eGhyLnN0YXR1cyArICcsICcgKyB4aHIuc3RhdHVzVGV4dCk7XG5cdFx0XHRcdFx0fSk7XG5cblx0XHRcdFx0XHQvLyB0aGlzIGVuc3VyZXMgdGhhdCB0aGUgQ1NSRiBtaWRkbGV3YXJlIGluIERqYW5nbyBkb2Vzbid0IHJlamVjdCBvdXJcblx0XHRcdFx0XHQvLyBIVFRQIHJlcXVlc3Rcblx0XHRcdFx0XHRmaWxlLmV2ZW50KCd4aHJTZXR1cCcsIGZ1bmN0aW9uKHhocikge1xuXHRcdFx0XHRcdFx0eGhyLnNldFJlcXVlc3RIZWFkZXIoXCJYLUNTUkZUb2tlblwiLCBjc3JmdG9rZW4pO1xuXHRcdFx0XHRcdH0pO1xuXG5cdFx0XHRcdFx0ZmlsZS5zZW5kVG8odXJsKTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cblxuXG5cdC8vIFNWRy1yZWxhdGVkIHV0aWxpdGllcy5cblx0ZXhwb3J0IGNsYXNzIFNWRyB7XG5cblx0XHRzdGF0aWMgY3JlYXRlU1ZHKHdpZHRoOmFueSwgaGVpZ2h0OmFueSwgYm94V2lkdGg6bnVtYmVyLCBib3hIZWlnaHQ6bnVtYmVyKTpTVkdFbGVtZW50IHtcblx0XHRcdHZhciBzdmdFbGVtZW50OlNWR0VsZW1lbnQgPSA8U1ZHRWxlbWVudD5kb2N1bWVudC5jcmVhdGVFbGVtZW50TlMoU1ZHLl9uYW1lc3BhY2UsIFwic3ZnXCIpO1xuXHRcdFx0c3ZnRWxlbWVudC5zZXRBdHRyaWJ1dGUoJ3ZlcnNpb24nLCAnMS4yJyk7XG5cdFx0XHRzdmdFbGVtZW50LnNldEF0dHJpYnV0ZSgnd2lkdGgnLCB3aWR0aC50b1N0cmluZygpKTtcblx0XHRcdHN2Z0VsZW1lbnQuc2V0QXR0cmlidXRlKCdoZWlnaHQnLCBoZWlnaHQudG9TdHJpbmcoKSk7XG5cdFx0XHRzdmdFbGVtZW50LnNldEF0dHJpYnV0ZSgndmlld0JveCcsICcwIDAgJyArIGJveFdpZHRoICsgJyAnICsgYm94SGVpZ2h0KTtcblx0XHRcdHN2Z0VsZW1lbnQuc2V0QXR0cmlidXRlKCdwcmVzZXJ2ZUFzcGVjdFJhdGlvJywgJ25vbmUnKTtcblx0XHRcdHJldHVybiBzdmdFbGVtZW50O1xuXHRcdH1cblxuXG5cdFx0Ly8gQ3JlYXRlcyBhIHZlcnRpY2FsIGxpbmUgY2VudGVyZWQgb24gKHhDb29yZCx5Q29vcmQpLlxuXHRcdHN0YXRpYyBjcmVhdGVWZXJ0aWNhbExpbmVQYXRoKHhDb29yZDpudW1iZXIsIHlDb29yZDpudW1iZXIsIGxpbmVXaWR0aDpudW1iZXIsIGxpbmVIZWlnaHQ6bnVtYmVyLCBjb2xvcjpDb2xvciwgc3ZnRWxlbWVudDphbnkpOlNWR0VsZW1lbnQge1xuXHRcdFx0dmFyIGhhbGZXaWR0aDpudW1iZXIgPSBsaW5lV2lkdGggLyAyO1xuXG5cdFx0XHR2YXIgdG9wWTpudW1iZXIgPSBNYXRoLmZsb29yKHlDb29yZCAtIGxpbmVIZWlnaHQvMik7XG5cdFx0XHR2YXIgYm90dG9tWTpudW1iZXIgPSBNYXRoLmZsb29yKHlDb29yZCArIGxpbmVIZWlnaHQvMik7XG5cdFx0XHR2YXIgbWlkWDpudW1iZXIgPSBNYXRoLmZsb29yKHhDb29yZCArIGhhbGZXaWR0aCk7XG5cdFx0XHR2YXIgZWwgPSBTVkcuY3JlYXRlTGluZSggbWlkWCwgdG9wWSwgbWlkWCwgYm90dG9tWSwgY29sb3IsIGxpbmVXaWR0aCk7XG5cdFx0ICAgIC8vJChlbCkuY3NzKCdzdHJva2UtbGluZWNhcCcsICdyb3VuZCcpO1xuXG5cdFx0XHRpZiAoc3ZnRWxlbWVudClcblx0XHQgICAgXHRzdmdFbGVtZW50LmFwcGVuZENoaWxkKGVsKTtcblxuXHRcdCAgICByZXR1cm4gZWw7XG5cdFx0fVxuXG5cblx0XHRzdGF0aWMgY3JlYXRlTGluZSh4MTpudW1iZXIsIHkxOm51bWJlciwgeDI6bnVtYmVyLCB5MjpudW1iZXIsIGNvbG9yPzpDb2xvciwgd2lkdGg/Om51bWJlcik6U1ZHRWxlbWVudCB7XG4gICAgXHRcdHZhciBlbCA9IDxTVkdFbGVtZW50PmRvY3VtZW50LmNyZWF0ZUVsZW1lbnROUyhTVkcuX25hbWVzcGFjZSwgJ2xpbmUnKTtcblx0XHRcdFxuXHRcdFx0ZWwuc2V0QXR0cmlidXRlKCd4MScsIHgxLnRvU3RyaW5nKCkpO1xuXHRcdFx0ZWwuc2V0QXR0cmlidXRlKCd5MScsIHkxLnRvU3RyaW5nKCkpO1xuXHRcdFx0ZWwuc2V0QXR0cmlidXRlKCd4MicsIHgyLnRvU3RyaW5nKCkpO1xuXHRcdFx0ZWwuc2V0QXR0cmlidXRlKCd5MicsIHkyLnRvU3RyaW5nKCkpO1xuXG5cdFx0XHRpZiAoY29sb3IpXG5cdFx0XHRcdCQoZWwpLmNzcygnc3Ryb2tlJywgY29sb3IudG9TdHJpbmcoKSk7XG5cblx0XHRcdGlmICh3aWR0aClcblx0XHRcdFx0JChlbCkuY3NzKCdzdHJva2Utd2lkdGgnLCB3aWR0aC50b1N0cmluZygpKTtcblxuXHRcdCAgICByZXR1cm4gZWw7XG5cdFx0fVxuXG5cblx0XHRzdGF0aWMgY3JlYXRlUmVjdCh4Om51bWJlciwgeTpudW1iZXIsIHdpZHRoOm51bWJlciwgaGVpZ2h0Om51bWJlciwgZmlsbENvbG9yOkNvbG9yLCBzdHJva2VXaWR0aD86bnVtYmVyLCBzdHJva2VDb2xvcj86Q29sb3IsIG9wYWNpdHk/Om51bWJlcik6U1ZHRWxlbWVudCB7XG5cblx0XHRcdC8vIERlZmF1bHQgdmFsdWVzLlxuXHRcdFx0c3Ryb2tlV2lkdGggPSAodHlwZW9mKHN0cm9rZVdpZHRoKSAhPT0gJ3VuZGVmaW5lZCcgPyBzdHJva2VXaWR0aCA6IDApO1xuXG5cdFx0XHRpZiAoIXN0cm9rZUNvbG9yKVxuXHRcdFx0XHRzdHJva2VDb2xvciA9IENvbG9yLmJsYWNrO1xuXG5cdFx0XHRvcGFjaXR5ID0gKHR5cGVvZihvcGFjaXR5KSAhPT0gJ3VuZGVmaW5lZCcgPyBvcGFjaXR5IDogMSk7XG5cbiAgICBcdFx0dmFyIGVsID0gPFNWR0VsZW1lbnQ+ZG9jdW1lbnQuY3JlYXRlRWxlbWVudE5TKFNWRy5fbmFtZXNwYWNlLCAncmVjdCcpO1xuXG4gICAgXHRcdC8vIE1ha2Ugc3VyZSB3aWR0aCBhbmQgaGVpZ2h0IGFyZSBwb3NpdGl2ZS5cbiAgICBcdFx0aWYgKGhlaWdodCA8IDApIHtcbiAgICBcdFx0XHR5ICs9IGhlaWdodDtcbiAgICBcdFx0XHRoZWlnaHQgPSAtaGVpZ2h0O1xuICAgIFx0XHR9XG5cbiAgICBcdFx0aWYgKHdpZHRoIDwgMCkge1xuICAgIFx0XHRcdHggKz0gaGVpZ2h0O1xuICAgIFx0XHRcdHdpZHRoID0gLXdpZHRoO1xuICAgIFx0XHR9XG5cbiAgICBcdFx0ZWwuc2V0QXR0cmlidXRlKCd4JywgeC50b1N0cmluZygpKTtcbiAgICBcdFx0ZWwuc2V0QXR0cmlidXRlKCd5JywgeS50b1N0cmluZygpKTtcbiAgICBcdFx0ZWwuc2V0QXR0cmlidXRlKCd3aWR0aCcsIHdpZHRoLnRvU3RyaW5nKCkpO1xuICAgIFx0XHRlbC5zZXRBdHRyaWJ1dGUoJ2hlaWdodCcsIGhlaWdodC50b1N0cmluZygpKTtcblxuICAgIFx0XHRpZiAodHlwZW9mKHN0cm9rZVdpZHRoKSAhPT0gJ3VuZGVmaW5lZCcpXG4gICAgXHRcdFx0JChlbCkuY3NzKCdzdHJva2Utd2lkdGgnLCBzdHJva2VXaWR0aCk7XG5cbiAgICBcdFx0aWYgKHR5cGVvZihzdHJva2VDb2xvcikgIT09ICd1bmRlZmluZWQnKVxuICAgIFx0XHRcdCQoZWwpLmNzcygnc3Ryb2tlJywgc3Ryb2tlQ29sb3IudG9TdHJpbmcoKSk7XG5cbiAgICBcdFx0aWYgKHR5cGVvZihvcGFjaXR5KSAhPT0gJ3VuZGVmaW5lZCcpXG4gICAgXHRcdFx0JChlbCkuY3NzKCdvcGFjaXR5Jywgb3BhY2l0eSk7XG5cbiAgICBcdFx0aWYgKHR5cGVvZihmaWxsQ29sb3IpICE9PSAndW5kZWZpbmVkJylcbiAgICBcdFx0XHQkKGVsKS5jc3MoJ2ZpbGwnLCBmaWxsQ29sb3IudG9TdHJpbmcoKSk7XG5cbiAgICBcdFx0cmV0dXJuIGVsO1xuXG5cdFx0fVxuXG5cblx0XHRzdGF0aWMgY3JlYXRlVGV4dCh4Om51bWJlciwgeTpudW1iZXIsIHRleHQ6c3RyaW5nLCBmb250TmFtZT86c3RyaW5nLCBmb250U2l6ZT86bnVtYmVyLCBjZW50ZXJlZE9uWD86Ym9vbGVhbiwgY29sb3I/OkNvbG9yKTpTVkdFbGVtZW50IHtcbiAgICBcdFx0dmFyIGVsID0gPFNWR0VsZW1lbnQ+ZG9jdW1lbnQuY3JlYXRlRWxlbWVudE5TKFNWRy5fbmFtZXNwYWNlLCAndGV4dCcpO1xuXG4gICAgXHRcdGVsLnNldEF0dHJpYnV0ZSgneCcsIHgudG9TdHJpbmcoKSk7XG4gICAgXHRcdGVsLnNldEF0dHJpYnV0ZSgneScsIHkudG9TdHJpbmcoKSk7XG5cbiAgICBcdFx0aWYgKGZvbnROYW1lKVxuICAgIFx0XHRcdGVsLnNldEF0dHJpYnV0ZSgnZm9udC1mYW1pbHknLCBmb250TmFtZSk7XG4gICAgXHRcdGVsc2VcbiAgICBcdFx0XHRlbC5zZXRBdHRyaWJ1dGUoJ2ZvbnQtZmFtaWx5JywgXCJWZXJkYW5hXCIpO1xuXG4gICAgXHRcdGlmIChmb250U2l6ZSlcbiAgICBcdFx0XHRlbC5zZXRBdHRyaWJ1dGUoJ2ZvbnQtc2l6ZScsIGZvbnRTaXplLnRvU3RyaW5nKCkpO1xuICAgIFx0XHRlbHNlXG4gICAgXHRcdFx0ZWwuc2V0QXR0cmlidXRlKCdmb250LXNpemUnLCBcIjEyXCIpO1xuXG4gICAgXHRcdGVsLnRleHRDb250ZW50ID0gdGV4dDtcblxuICAgIFx0XHQvLyBDZW50ZXIgb24gWD8/XG4gICAgXHRcdGlmIChjZW50ZXJlZE9uWClcbiAgICBcdFx0XHRlbC5zZXRBdHRyaWJ1dGUoJ3RleHQtYW5jaG9yJywgJ21pZGRsZScpO1xuICAgIFx0XHRlbHNlXG4gICAgXHRcdFx0ZWwuc2V0QXR0cmlidXRlKCd0ZXh0LWFuY2hvcicsICdzdGFydCcpO1xuXG4gICAgXHRcdGlmIChjb2xvcikge1xuICAgIFx0XHRcdCQoZWwpLmNzcygnZmlsbCcsIGNvbG9yLnRvU3RyaW5nKCkpO1xuICAgIFx0XHR9XG5cbiAgICBcdFx0cmV0dXJuIGVsO1xuXHRcdH1cblxuXG5cdFx0Ly8gTW9kaWZ5IGEgcmVjdCBlbGVtZW50IHRvIHJvdW5kIGl0cyBjb3JuZXJzLlxuXHRcdHN0YXRpYyBtYWtlUmVjdFJvdW5kZWQocmVjdCwgcngsIHJ5KSB7XG4gICAgXHRcdHJlY3Quc2V0QXR0cmlidXRlKCdyeCcsIHJ4KTtcbiAgICBcdFx0cmVjdC5zZXRBdHRyaWJ1dGUoJ3J5JywgcnkpO1xuXHRcdH1cblxuXHRcdHByaXZhdGUgc3RhdGljIF9uYW1lc3BhY2U6c3RyaW5nID0gXCJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2Z1wiO1xuXG5cdH1cblxufSAvLyBlbmQgbW9kdWxlIFV0bFxuXG4iXX0=