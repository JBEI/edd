/// <reference path="typescript-declarations.d.ts" />
/// <reference path="EDDDataInterface.ts" />
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
        return JS;
    })();
    Utl.JS = JS;
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
