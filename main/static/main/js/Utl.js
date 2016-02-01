// Compiled to JS on: Mon Feb 01 2016 16:13:47  
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
        function FileDropZone(element_id, process_original, url, process_result, multiple) {
            var z = new FileDrop(element_id, {}); // filedrop-min.js , http://filedropjs.org
            this.zone = z;
            this.csrftoken = jQuery.cookie('csrftoken');
            if (!(typeof multiple === "undefined")) {
                z.multiple(multiple);
            }
            else {
                z.multiple(false);
            }
            this.process_original = process_original;
            this.process_result = process_result;
            this.url = url;
        }
        // If process_original is provided, it will be called with the raw file data from the drop zone.
        // If url is provided and process_original returns false (or was not provided) the file will be sent to the given url.
        // If process_result is provided, it will be called with the returned result of the url call.
        FileDropZone.create = function (element_id, process_original, url, process_result, multiple) {
            var h = new FileDropZone(element_id, process_original, url, process_result, multiple);
            h.setup();
        };
        FileDropZone.prototype.setup = function () {
            var t = this;
            this.zone.event('send', function (files) {
                files.each(function (file) {
                    if (typeof t.process_original === "function") {
                        file.read({
                            //start: 5,
                            //end: -10,
                            //func: 'cp1251',
                            onDone: function (str) {
                                var rawFileProcessStatus = t.process_original(file.type, str);
                                if (!rawFileProcessStatus) {
                                    t.processUrl(file);
                                }
                            },
                            onError: function (e) {
                                alert('Failed to read the file! Error: ' + e.fdError);
                            },
                            func: 'text'
                        });
                    }
                    else {
                        t.processUrl(file);
                    }
                });
            });
        };
        FileDropZone.prototype.processUrl = function (file) {
            var t = this;
            if (typeof this.url === 'string') {
                file.event('done', function (xhr) {
                    var result = jQuery.parseJSON(xhr.responseText);
                    if (result.python_error) {
                        alert(result.python_error);
                    }
                    else if (typeof t.process_result === "function") {
                        t.process_result(result);
                    }
                });
                file.event('error', function (e, xhr) {
                    alert('Error uploading ' + this.name + ': ' +
                        xhr.status + ', ' + xhr.statusText);
                });
                // this ensures that the CSRF middleware in Django doesn't reject our
                // HTTP request
                file.event('xhrSetup', function (xhr) {
                    xhr.setRequestHeader("X-CSRFToken", t.csrftoken);
                });
                file.sendTo(this.url);
            }
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiVXRsLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiVXRsLnRzIl0sIm5hbWVzIjpbIlV0bCIsIlV0bC5FREQiLCJVdGwuRURELmNvbnN0cnVjdG9yIiwiVXRsLkVERC5yZXNvbHZlTWVhc3VyZW1lbnRSZWNvcmRUb05hbWUiLCJVdGwuRURELnJlc29sdmVNZWFzdXJlbWVudFJlY29yZFRvVW5pdHMiLCJVdGwuUXRpcEhlbHBlciIsIlV0bC5RdGlwSGVscGVyLmNvbnN0cnVjdG9yIiwiVXRsLlF0aXBIZWxwZXIuY3JlYXRlIiwiVXRsLlF0aXBIZWxwZXIuX2dlbmVyYXRlQ29udGVudCIsIlV0bC5RdGlwSGVscGVyLl9nZXRRVGlwRWxlbWVudCIsIlV0bC5Db2xvciIsIlV0bC5Db2xvci5jb25zdHJ1Y3RvciIsIlV0bC5Db2xvci5yZ2JhIiwiVXRsLkNvbG9yLnJnYiIsIlV0bC5Db2xvci5pbnRlcnBvbGF0ZSIsIlV0bC5Db2xvci50b1N0cmluZyIsIlV0bC5UYWJsZSIsIlV0bC5UYWJsZS5jb25zdHJ1Y3RvciIsIlV0bC5UYWJsZS5hZGRSb3ciLCJVdGwuVGFibGUuYWRkQ29sdW1uIiwiVXRsLlRhYmxlLmFkZFRhYmxlVG8iLCJVdGwuSlMiLCJVdGwuSlMuY29uc3RydWN0b3IiLCJVdGwuSlMuY3JlYXRlRWxlbWVudEZyb21TdHJpbmciLCJVdGwuSlMuYXNzZXJ0IiwiVXRsLkpTLmNvbnZlcnRIYXNoVG9MaXN0IiwiVXRsLkpTLnBhZFN0cmluZ0xlZnQiLCJVdGwuSlMucGFkU3RyaW5nUmlnaHQiLCJVdGwuSlMucmVwZWF0U3RyaW5nIiwiVXRsLkpTLnRpbWVzdGFtcFRvVG9kYXlTdHJpbmciLCJVdGwuSlMudXRjVG9Ub2RheVN0cmluZyIsIlV0bC5KUy5yZW1hcFZhbHVlIiwiVXRsLkpTLnJlbW92ZUFsbENoaWxkcmVuIiwiVXRsLkpTLnJlbW92ZUZyb21QYXJlbnQiLCJVdGwuSlMuZW5hYmxlRjEyVHJhcCIsIlV0bC5KUy5zdGFydFdhaXRCYWRnZSIsIlV0bC5KUy5zdG9wV2FpdEJhZGdlIiwiVXRsLkZpbGVEcm9wWm9uZSIsIlV0bC5GaWxlRHJvcFpvbmUuY29uc3RydWN0b3IiLCJVdGwuRmlsZURyb3Bab25lLmNyZWF0ZSIsIlV0bC5GaWxlRHJvcFpvbmUuc2V0dXAiLCJVdGwuRmlsZURyb3Bab25lLnByb2Nlc3NVcmwiLCJVdGwuU1ZHIiwiVXRsLlNWRy5jb25zdHJ1Y3RvciIsIlV0bC5TVkcuY3JlYXRlU1ZHIiwiVXRsLlNWRy5jcmVhdGVWZXJ0aWNhbExpbmVQYXRoIiwiVXRsLlNWRy5jcmVhdGVMaW5lIiwiVXRsLlNWRy5jcmVhdGVSZWN0IiwiVXRsLlNWRy5jcmVhdGVUZXh0IiwiVXRsLlNWRy5tYWtlUmVjdFJvdW5kZWQiXSwibWFwcGluZ3MiOiJBQUFBLGdEQUFnRDtBQUNoRCxxREFBcUQ7QUFHckQsbUVBQW1FO0FBRW5FLElBQU8sR0FBRyxDQWlsQlQ7QUFqbEJELFdBQU8sR0FBRyxFQUFDLENBQUM7SUFFWEE7UUFBQUM7UUE2Q0FDLENBQUNBO1FBM0NPRCxrQ0FBOEJBLEdBQXJDQSxVQUFzQ0EsaUJBQXdDQTtZQUU3RUUsSUFBSUEsS0FBS0EsR0FBR0EsRUFBRUEsQ0FBQ0E7WUFDZkEscUVBQXFFQTtZQUNyRUEsSUFBSUEsR0FBR0EsR0FBR0EsaUJBQWlCQSxDQUFDQSxHQUFHQSxDQUFDQTtZQUNoQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ2RBLElBQUlBLFFBQVFBLEdBQUdBLEVBQUVBLENBQUNBO2dCQUNsQkEsSUFBSUEsTUFBTUEsR0FBR0EsaUJBQWlCQSxDQUFDQSxFQUFFQSxDQUFDQTtnQkFDbENBLEVBQUVBLENBQUNBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBO29CQUNaQSxJQUFJQSxPQUFPQSxHQUFHQSxPQUFPQSxDQUFDQSwyQkFBMkJBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO29CQUMxREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsT0FBT0EsQ0FBQ0Es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LENBQVFBLEVBQUVBLENBQVFBLEVBQUVBLEtBQVlBO1lBQ3JERSxJQUFJQSxHQUFHQSxHQUFTQSxJQUFJQSxLQUFLQSxFQUFFQSxDQUFDQTtZQUM1QkEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7WUFDVkEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7WUFDVkEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7WUFDVkEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsS0FBS0EsQ0FBQ0E7WUFDZEEsTUFBTUEsQ0FBQ0EsR0FBR0EsQ0FBQ0E7UUFDWkEsQ0FBQ0E7UUFFREYsK0VBQStFQTtRQUN4RUEsU0FBR0EsR0FBVkEsVUFBV0EsQ0FBUUEsRUFBRUEsQ0FBUUEsRUFBRUEsQ0FBUUE7WUFDdENHLElBQUlBLEdBQUdBLEdBQVNBLElBQUlBLEtBQUtBLEVBQUVBLENBQUNBO1lBQzVCQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtZQUNWQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtZQUNWQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtZQUNWQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxHQUFHQSxDQUFDQTtZQUNaQSxNQUFNQSxDQUFDQSxHQUFHQSxDQUFDQTtRQUNaQSxDQUFDQTtRQUVNSCxpQkFBV0EsR0FBbEJBLFVBQW1CQSxJQUFVQSxFQUFFQSxJQUFVQSxFQUFFQSxDQUFRQTtZQUNsREksTUFBTUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsSUFBSUEsQ0FDaEJBLElBQUlBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLElBQUlBLENBQUNBLENBQUNBLEdBQUdBLElBQUlBLENBQUNBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLEVBQzlCQSxJQUFJQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQSxHQUFHQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxFQUM5QkEsSUFBSUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsRUFDOUJBLElBQUlBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLElBQUlBLENBQUNBLENBQUNBLEdBQUdBLElBQUlBLENBQUNBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQzlCQSxDQUFDQTtRQUNIQSxDQUFDQTtRQUVNSixjQUFRQSxHQUFmQSxVQUFnQkEsR0FBT0E7WUFDdEJLLDBFQUEwRUE7WUFDMUVBLEVBQUVBLENBQUNBLENBQUNBLE9BQU9BLEdBQUdBLElBQUlBLFFBQVFBLENBQUNBO2dCQUMxQkEsTUFBTUEsQ0FBQ0EsR0FBR0EsQ0FBQ0E7WUFFWkEsTUFBTUEsQ0FBQ0EsT0FBT0EsR0FBR0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsSUFBSUEsR0FBR0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsSUFBSUEsR0FBR0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsSUFBSUEsR0FBR0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBQ0EsR0FBR0EsR0FBR0EsR0FBR0EsQ0FBQ0E7UUFDbkhBLENBQUNBO1FBRURMLHdCQUFRQSxHQUFSQTtZQUNDSyxNQUFNQSxDQUFDQSxPQUFPQSxHQUFHQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQSxHQUFHQSxJQUFJQSxHQUFHQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQSxHQUFHQSxJQUFJQSxHQUFHQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQSxHQUFHQSxJQUFJQSxHQUFHQSxJQUFJQSxDQUFDQSxDQUFDQSxHQUFDQSxHQUFHQSxHQUFHQSxHQUFHQSxDQUFDQTtRQUN2SEEsQ0FBQ0E7UUFFTUwsU0FBR0EsR0FBR0EsS0FBS0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsRUFBQ0EsQ0FBQ0EsRUFBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDekJBLFdBQUtBLEdBQUdBLEtBQUtBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLEVBQUNBLEdBQUdBLEVBQUNBLENBQUNBLENBQUNBLENBQUNBO1FBQzNCQSxVQUFJQSxHQUFHQSxLQUFLQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxFQUFDQSxDQUFDQSxFQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUMxQkEsV0FBS0EsR0FBR0EsS0FBS0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsRUFBQ0EsQ0FBQ0EsRUFBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDekJBLFdBQUtBLEdBQUdBLEtBQUtBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLEVBQUNBLEdBQUdBLEVBQUNBLEdBQUdBLENBQUNBLENBQUNBO1FBRXZDQSxZQUFDQTtJQUFEQSxDQUFDQSxBQXRERFYsSUFzRENBO0lBdERZQSxTQUFLQSxRQXNEakJBLENBQUFBO0lBQUFBLENBQUNBO0lBR0ZBO1FBRUNnQixlQUFZQSxPQUFjQSxFQUFFQSxLQUFhQSxFQUFFQSxNQUFjQTtZQTRCekRDLFVBQUtBLEdBQW9CQSxJQUFJQSxDQUFDQTtZQUM5QkEsZ0JBQVdBLEdBQVVBLENBQUNBLENBQUNBO1lBNUJ0QkEsSUFBSUEsQ0FBQ0EsS0FBS0EsR0FBR0EsUUFBUUEsQ0FBQ0EsYUFBYUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0E7WUFDN0NBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLEVBQUVBLEdBQUdBLE9BQU9BLENBQUNBO1lBRXhCQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQTtnQkFDVEEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsT0FBT0EsRUFBRUEsS0FBS0EsQ0FBQ0EsQ0FBQ0E7WUFFbkNBLEVBQUVBLENBQUNBLENBQUNBLE1BQU1BLENBQUNBO2dCQUNWQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxRQUFRQSxFQUFFQSxNQUFNQSxDQUFDQSxDQUFDQTtRQUN0Q0EsQ0FBQ0E7UUFFREQsc0JBQU1BLEdBQU5BO1lBQ0NFLElBQUlBLEdBQUdBLEdBQUdBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLFNBQVNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQ25DQSxJQUFJQSxDQUFDQSxXQUFXQSxFQUFFQSxDQUFDQTtZQUNuQkEsTUFBTUEsQ0FBc0JBLEdBQUdBLENBQUNBO1FBQ2pDQSxDQUFDQTtRQUVERix5QkFBU0EsR0FBVEE7WUFDQ0csSUFBSUEsR0FBR0EsR0FBNENBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLFdBQVdBLEdBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQ3ZGQSxJQUFJQSxNQUFNQSxHQUFlQSxHQUFHQSxDQUFDQSxVQUFVQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUM1Q0EsTUFBTUEsQ0FBQ0EsTUFBTUEsQ0FBQ0E7UUFDZkEsQ0FBQ0E7UUFFREgsb0VBQW9FQTtRQUNwRUEsMEJBQVVBLEdBQVZBLFVBQVdBLE9BQW1CQTtZQUM3QkksT0FBT0EsQ0FBQ0EsV0FBV0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0E7UUFDakNBLENBQUNBO1FBSUZKLFlBQUNBO0lBQURBLENBQUNBLEFBaENEaEIsSUFnQ0NBO0lBaENZQSxTQUFLQSxRQWdDakJBLENBQUFBO0lBR0RBLHVCQUF1QkE7SUFDdkJBO1FBQUFxQjtRQW1MQUMsQ0FBQ0E7UUFqTEFELG1EQUFtREE7UUFDbkRBLHlGQUF5RkE7UUFDekZBLHdFQUF3RUE7UUFDakVBLDBCQUF1QkEsR0FBOUJBLFVBQStCQSxHQUFVQSxFQUFFQSxTQUF1QkE7WUFBdkJFLHlCQUF1QkEsR0FBdkJBLGdCQUF1QkE7WUFFakVBLElBQUlBLEdBQUdBLENBQUNBO1lBQ1JBLEVBQUVBLENBQUNBLENBQUNBLFNBQVNBLENBQUNBO2dCQUNiQSxHQUFHQSxHQUFHQSxRQUFRQSxDQUFDQSxlQUFlQSxDQUFDQSxTQUFTQSxFQUFFQSxLQUFLQSxDQUFDQSxDQUFDQTtZQUNsREEsSUFBSUE7Z0JBQ0hBLEdBQUdBLEdBQUdBLFFBQVFBLENBQUNBLGFBQWFBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBO1lBRXJDQSxHQUFHQSxDQUFDQSxTQUFTQSxHQUFHQSxHQUFHQSxDQUFDQTtZQUNwQkEsTUFBTUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsVUFBVUEsQ0FBQ0E7UUFFdkJBLENBQUNBO1FBR01GLFNBQU1BLEdBQWJBLFVBQWNBLFNBQWlCQSxFQUFFQSxPQUFjQTtZQUMzQ0csRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ1BBLE9BQU9BLEdBQUdBLE9BQU9BLElBQUlBLGtCQUFrQkEsQ0FBQ0E7Z0JBQ3hDQSxFQUFFQSxDQUFDQSxDQUFDQSxPQUFPQSxLQUFLQSxLQUFLQSxXQUFXQSxDQUFDQTtvQkFBQ0EsTUFBTUEsS0FBS0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ3ZEQSxJQUFJQTtvQkFBQ0EsTUFBTUEsT0FBT0EsQ0FBQ0E7WUFDN0JBLENBQUNBO1FBQ0xBLENBQUNBO1FBR01ILG9CQUFpQkEsR0FBeEJBLFVBQXlCQSxJQUFRQTtZQUNoQ0ksTUFBTUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBRUEsVUFBU0EsQ0FBQ0EsSUFBRyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUEsQ0FBQyxDQUFFQSxDQUFDQTtRQUMvREEsQ0FBQ0E7UUFHREosOERBQThEQTtRQUM5REEsK0NBQStDQTtRQUMvQ0EsdURBQXVEQTtRQUNoREEsZ0JBQWFBLEdBQXBCQSxVQUFxQkEsR0FBVUEsRUFBRUEsUUFBZUE7WUFDL0NLLElBQUlBLFFBQVFBLEdBQVVBLEdBQUdBLENBQUNBLE1BQU1BLENBQUNBO1lBQ2pDQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFDQSxRQUFRQSxFQUFFQSxDQUFDQSxHQUFHQSxRQUFRQSxFQUFFQSxDQUFDQSxFQUFFQTtnQkFDckNBLEdBQUdBLElBQUlBLEdBQUdBLENBQUNBO1lBRVpBLE1BQU1BLENBQUNBLEdBQUdBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLEVBQUVBLFFBQVFBLENBQUNBLENBQUNBO1FBQy9CQSxDQUFDQTtRQUdETCw2REFBNkRBO1FBQzdEQSwrQ0FBK0NBO1FBQ3hDQSxpQkFBY0EsR0FBckJBLFVBQXNCQSxHQUFVQSxFQUFFQSxRQUFlQTtZQUNoRE0sSUFBSUEsTUFBTUEsR0FBR0EsRUFBRUEsQ0FBQ0E7WUFDaEJBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLEdBQUNBLENBQUNBLEVBQUVBLENBQUNBLEdBQUdBLFFBQVFBLEVBQUVBLENBQUNBLEVBQUVBO2dCQUM5QkEsTUFBTUEsSUFBSUEsR0FBR0EsQ0FBQ0E7WUFFZkEsTUFBTUEsQ0FBQ0EsQ0FBQ0EsTUFBTUEsR0FBR0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsQ0FBQ0E7UUFDeENBLENBQUNBO1FBR0ROLDJEQUEyREE7UUFDcERBLGVBQVlBLEdBQW5CQSxVQUFvQkEsR0FBVUEsRUFBRUEsUUFBZUE7WUFDOUNPLElBQUlBLEdBQUdBLEdBQVVBLEVBQUVBLENBQUNBO1lBQ3BCQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFRQSxDQUFDQSxFQUFFQSxDQUFDQSxHQUFHQSxRQUFRQSxFQUFFQSxDQUFDQSxFQUFFQTtnQkFDckNBLEdBQUdBLElBQUlBLEdBQUdBLENBQUNBO1lBRVpBLE1BQU1BLENBQUNBLEdBQUdBLENBQUNBO1FBQ1pBLENBQUNBO1FBR0RQLG1GQUFtRkE7UUFDbkZBLGdGQUFnRkE7UUFDaEZBLHFFQUFxRUE7UUFDckVBLHlFQUF5RUE7UUFDbEVBLHlCQUFzQkEsR0FBN0JBLFVBQThCQSxTQUFnQkE7WUFFN0NRLHFDQUFxQ0E7WUFDckNBLHdEQUF3REE7WUFDeERBLElBQUlBLEdBQUdBLEdBQUdBLENBQUNBLEtBQUtBLEVBQUNBLEtBQUtBLEVBQUNBLEtBQUtBLEVBQUNBLEtBQUtBLEVBQUNBLEtBQUtBLEVBQUNBLEtBQUtBLEVBQUNBLEtBQUtBLEVBQUNBLEtBQUtBLEVBQUNBLEtBQUtBLEVBQUNBLEtBQUtBLEVBQUNBLEtBQUtBLEVBQUNBLEtBQUtBLENBQUNBLENBQUNBO1lBRXBGQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxTQUFTQSxJQUFJQSxTQUFTQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDakNBLE1BQU1BLENBQUNBLHNDQUFzQ0EsQ0FBQ0E7WUFDL0NBLENBQUNBO1lBRURBLElBQUlBLENBQUNBLEdBQUdBLElBQUlBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLFNBQVNBLEdBQUNBLElBQUlBLENBQUNBLENBQUNBLENBQUNBO1lBQzdDQSxJQUFJQSxDQUFDQSxHQUFHQSxJQUFJQSxJQUFJQSxFQUFFQSxDQUFDQTtZQUNuQkEsSUFBSUEsR0FBR0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsT0FBT0EsRUFBRUEsQ0FBQ0E7WUFFdEJBLElBQUlBLEdBQUdBLEdBQUdBLENBQUNBLENBQUNBLFVBQVVBLEVBQUVBLENBQUNBO1lBQ3pCQSxJQUFJQSxHQUFHQSxHQUFPQSxDQUFDQSxDQUFDQSxVQUFVQSxFQUFFQSxDQUFDQSxDQUFDQSwwQ0FBMENBO1lBQ3hFQSxJQUFJQSxJQUFJQSxHQUFHQSxDQUFDQSxDQUFDQSxRQUFRQSxFQUFFQSxDQUFDQTtZQUN4QkEsSUFBSUEsSUFBSUEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsT0FBT0EsRUFBRUEsQ0FBQ0EsQ0FBRUEsMkNBQTJDQTtZQUNwRUEsSUFBSUEsR0FBR0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsUUFBUUEsRUFBRUEsQ0FBQ0EsQ0FBRUEsZ0NBQWdDQTtZQUN6REEsSUFBSUEsSUFBSUEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsV0FBV0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsaUNBQWlDQTtZQUM3REEsSUFBSUEsSUFBSUEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsTUFBTUEsRUFBRUEsQ0FBQ0EsQ0FBRUEseUNBQXlDQTtZQUVqRUEsSUFBSUEsSUFBSUEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsVUFBVUEsRUFBRUEsQ0FBQ0E7WUFDMUJBLElBQUlBLElBQUlBLEdBQUdBLENBQUNBLENBQUNBLFVBQVVBLEVBQUVBLENBQUNBO1lBQzFCQSxJQUFJQSxLQUFLQSxHQUFHQSxDQUFDQSxDQUFDQSxRQUFRQSxFQUFFQSxDQUFDQTtZQUN6QkEsSUFBSUEsS0FBS0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsT0FBT0EsRUFBRUEsQ0FBQ0E7WUFDeEJBLElBQUlBLElBQUlBLEdBQUdBLENBQUNBLENBQUNBLFFBQVFBLEVBQUVBLENBQUNBO1lBQ3hCQSxJQUFJQSxLQUFLQSxHQUFHQSxDQUFDQSxDQUFDQSxXQUFXQSxFQUFFQSxDQUFDQTtZQUM1QkEsSUFBSUEsS0FBS0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsTUFBTUEsRUFBRUEsQ0FBQ0E7WUFFdkJBLElBQUlBLE9BQU9BLENBQUNBO1lBRVpBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLElBQUlBLElBQUlBLEtBQUtBLENBQUNBLElBQUlBLENBQUNBLEdBQUdBLElBQUlBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLElBQUlBLElBQUlBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO2dCQUN6REEsT0FBT0EsR0FBR0EsT0FBT0EsQ0FBQ0E7WUFDbkJBLENBQUNBO1lBQUNBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQU1BLENBQUNBLEdBQUdBLEdBQUdBLENBQUNBLElBQUlBLEdBQUdBLENBQUNBLEVBQUVBLEdBQUNBLENBQUNBLElBQUlBLEdBQUNBLENBQUNBLEVBQUVBLEdBQUNBLENBQUNBLEtBQUtBLEdBQUNBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO2dCQUN4REEsQ0FBQ0EsU0FBU0EsR0FBR0EsQ0FBQ0EsR0FBR0EsR0FBSUEsQ0FBQ0EsRUFBRUEsR0FBQ0EsQ0FBQ0EsR0FBR0EsR0FBRUEsQ0FBQ0EsRUFBRUEsR0FBRUEsSUFBSUEsQ0FBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBRUEsQ0FBQ0E7Z0JBQ3pEQSxPQUFPQSxHQUFHQSxXQUFXQSxDQUFDQTtZQUN2QkEsQ0FBQ0E7WUFBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7Z0JBQ1BBLElBQUlBLFFBQVFBLEdBQUdBLEVBQUVBLENBQUNBO2dCQUNsQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsSUFBSUEsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7b0JBQ25CQSxRQUFRQSxHQUFHQSxHQUFHQSxHQUFHQSxJQUFJQSxDQUFDQTtnQkFDdkJBLENBQUNBO2dCQUNEQSxPQUFPQSxHQUFHQSxHQUFHQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxHQUFHQSxHQUFHQSxJQUFJQSxHQUFHQSxRQUFRQSxDQUFDQTtZQUM1Q0EsQ0FBQ0E7WUFFREEsSUFBSUEsUUFBUUEsR0FBR0EsSUFBSUEsQ0FBQ0E7WUFDcEJBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLEdBQUdBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO2dCQUFBQSxRQUFRQSxHQUFHQSxJQUFJQSxDQUFDQTtZQUFBQSxDQUFDQTtZQUNqQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsR0FBR0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQUFBLElBQUlBLElBQUlBLEVBQUVBLENBQUNBO1lBQUFBLENBQUNBO1lBQzVCQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFBQUEsSUFBSUEsR0FBR0EsRUFBRUEsQ0FBQ0E7WUFBQUEsQ0FBQ0E7WUFDaENBLEVBQUVBLENBQUNBLENBQUNBLEdBQUdBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO2dCQUFBQSxHQUFHQSxHQUFHQSxHQUFHQSxHQUFDQSxHQUFHQSxDQUFDQTtZQUFBQSxDQUFDQTtZQUU3QkEsTUFBTUEsQ0FBQ0EsT0FBT0EsR0FBR0EsSUFBSUEsR0FBR0EsSUFBSUEsR0FBR0EsR0FBR0EsR0FBR0EsR0FBR0EsR0FBR0EsUUFBUUEsQ0FBQ0E7UUFDckRBLENBQUNBO1FBR1lSLG1CQUFnQkEsR0FBdkJBLFVBQXdCQSxHQUFVQTtZQUM5QlMsSUFBSUEsQ0FBT0EsQ0FBQ0E7WUFDWkEsSUFBSUEsU0FBZ0JBLENBQUNBO1lBQ3JCQSxDQUFDQSxHQUFHQSxpRUFBaUVBLENBQUNBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO1lBQ2hGQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDSkEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsMENBQTBDQTtnQkFDckRBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLFVBQUNBLENBQUNBLElBQU9BLE1BQU1BLENBQUNBLFFBQVFBLENBQUNBLENBQUNBLEVBQUVBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLDZCQUE2QkE7Z0JBQ3hFQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSwrQ0FBK0NBO2dCQUN2REEsU0FBU0EsR0FBR0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ3pEQSxTQUFTQSxJQUFJQSxJQUFJQSxDQUFDQSxDQUFDQSwrREFBK0RBO2dCQUNsRkEsTUFBTUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsRUFBRUEsQ0FBQ0Esc0JBQXNCQSxDQUFDQSxTQUFTQSxDQUFDQSxDQUFDQTtZQUNwREEsQ0FBQ0E7WUFDREEsTUFBTUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsRUFBRUEsQ0FBQ0Esc0JBQXNCQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtRQUMvQ0EsQ0FBQ0E7UUFHUFQsd0RBQXdEQTtRQUNqREEsYUFBVUEsR0FBakJBLFVBQWtCQSxLQUFZQSxFQUFFQSxLQUFZQSxFQUFFQSxLQUFZQSxFQUFFQSxNQUFhQSxFQUFFQSxNQUFhQTtZQUN2RlUsSUFBSUEsS0FBS0EsR0FBVUEsS0FBS0EsR0FBR0EsS0FBS0EsQ0FBQ0E7WUFFakNBLDRFQUE0RUE7WUFDNUVBLG9FQUFvRUE7WUFDcEVBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLFFBQVFBLENBQUNBO2dCQUM5QkEsTUFBTUEsQ0FBQ0EsTUFBTUEsR0FBR0EsQ0FBQ0EsTUFBTUEsR0FBR0EsTUFBTUEsQ0FBQ0EsR0FBR0EsR0FBR0EsQ0FBQ0E7WUFFekNBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLEtBQUtBLEdBQUdBLEtBQUtBLENBQUNBLEdBQUdBLENBQUNBLEtBQUtBLEdBQUdBLEtBQUtBLENBQUNBLENBQUNBO1lBQzFDQSxNQUFNQSxDQUFDQSxNQUFNQSxHQUFHQSxDQUFDQSxNQUFNQSxHQUFHQSxNQUFNQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUN2Q0EsQ0FBQ0E7UUFFRFYsd0RBQXdEQTtRQUNqREEsb0JBQWlCQSxHQUF4QkEsVUFBeUJBLE9BQW9CQTtZQUM1Q1csT0FBT0EsT0FBT0EsQ0FBQ0EsVUFBVUE7Z0JBQ3hCQSxPQUFPQSxDQUFDQSxXQUFXQSxDQUFDQSxPQUFPQSxDQUFDQSxVQUFVQSxDQUFDQSxDQUFDQTtRQUMxQ0EsQ0FBQ0E7UUFFTVgsbUJBQWdCQSxHQUF2QkEsVUFBd0JBLE9BQW9CQTtZQUMzQ1ksRUFBRUEsQ0FBQ0EsQ0FBQ0EsT0FBT0EsSUFBSUEsT0FBT0EsQ0FBQ0EsVUFBVUEsQ0FBQ0E7Z0JBQ2pDQSxPQUFPQSxDQUFDQSxVQUFVQSxDQUFDQSxXQUFXQSxDQUFDQSxPQUFPQSxDQUFDQSxDQUFDQTtRQUMxQ0EsQ0FBQ0E7UUFFRFosNEVBQTRFQTtRQUM1RUEseUZBQXlGQTtRQUN6RkEsb0NBQW9DQTtRQUM3QkEsZ0JBQWFBLEdBQXBCQTtZQUNDYSxDQUFDQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxPQUFPQSxDQUFDQSxVQUFTQSxDQUFDQSxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxPQUFPLElBQUksR0FBRyxDQUFDO2dCQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQ0EsQ0FBQ0E7UUFDcEVBLENBQUNBO1FBRU1iLGlCQUFjQSxHQUFyQkEsVUFBc0JBLFFBQVFBO1lBQzdCYyxDQUFDQSxDQUFDQSxRQUFRQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxPQUFPQSxFQUFFQSxnQkFBZ0JBLENBQUNBLENBQUNBO1FBQzVDQSxDQUFDQTtRQUVNZCxnQkFBYUEsR0FBcEJBLFVBQXFCQSxRQUFRQTtZQUM1QmUsQ0FBQ0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsT0FBT0EsRUFBRUEsV0FBV0EsQ0FBQ0EsQ0FBQ0E7UUFDdkNBLENBQUNBO1FBQ0ZmLFNBQUNBO0lBQURBLENBQUNBLEFBbkxEckIsSUFtTENBO0lBbkxZQSxNQUFFQSxLQW1MZEEsQ0FBQUE7SUFHREE7UUFVT3FDLHNCQUFZQSxVQUFVQSxFQUFFQSxnQkFBZ0JBLEVBQUVBLEdBQVdBLEVBQUVBLGNBQWNBLEVBQUVBLFFBQVFBO1lBRXBGQyxJQUFJQSxDQUFDQSxHQUFHQSxJQUFJQSxRQUFRQSxDQUFDQSxVQUFVQSxFQUFFQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSwwQ0FBMENBO1lBQ2hGQSxJQUFJQSxDQUFDQSxJQUFJQSxHQUFHQSxDQUFDQSxDQUFDQTtZQUNkQSxJQUFJQSxDQUFDQSxTQUFTQSxHQUFHQSxNQUFNQSxDQUFDQSxNQUFNQSxDQUFDQSxXQUFXQSxDQUFDQSxDQUFDQTtZQUM1Q0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsT0FBT0EsUUFBUUEsS0FBS0EsV0FBV0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ3hDQSxDQUFDQSxDQUFDQSxRQUFRQSxDQUFDQSxRQUFRQSxDQUFDQSxDQUFDQTtZQUN0QkEsQ0FBQ0E7WUFBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7Z0JBQ1BBLENBQUNBLENBQUNBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBO1lBQ25CQSxDQUFDQTtZQUNEQSxJQUFJQSxDQUFDQSxnQkFBZ0JBLEdBQUdBLGdCQUFnQkEsQ0FBQ0E7WUFDekNBLElBQUlBLENBQUNBLGNBQWNBLEdBQUdBLGNBQWNBLENBQUNBO1lBQ3JDQSxJQUFJQSxDQUFDQSxHQUFHQSxHQUFHQSxHQUFHQSxDQUFDQTtRQUNoQkEsQ0FBQ0E7UUFHREQsZ0dBQWdHQTtRQUNoR0Esc0hBQXNIQTtRQUN0SEEsNkZBQTZGQTtRQUN0RkEsbUJBQU1BLEdBQWJBLFVBQWNBLFVBQVVBLEVBQUVBLGdCQUFnQkEsRUFBRUEsR0FBR0EsRUFBRUEsY0FBY0EsRUFBRUEsUUFBUUE7WUFDeEVFLElBQUlBLENBQUNBLEdBQUdBLElBQUlBLFlBQVlBLENBQUNBLFVBQVVBLEVBQUVBLGdCQUFnQkEsRUFBRUEsR0FBR0EsRUFBRUEsY0FBY0EsRUFBRUEsUUFBUUEsQ0FBQ0EsQ0FBQ0E7WUFDdEZBLENBQUNBLENBQUNBLEtBQUtBLEVBQUVBLENBQUNBO1FBQ1hBLENBQUNBO1FBR0RGLDRCQUFLQSxHQUFMQTtZQUNDRyxJQUFJQSxDQUFDQSxHQUFHQSxJQUFJQSxDQUFDQTtZQUNiQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxFQUFFQSxVQUFTQSxLQUFLQTtnQkFDckMsS0FBSyxDQUFDLElBQUksQ0FBQyxVQUFTLElBQUk7b0JBQ3ZCLEVBQUUsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLGdCQUFnQixLQUFLLFVBQVUsQ0FBQyxDQUFDLENBQUM7d0JBQzlDLElBQUksQ0FBQyxJQUFJLENBQUM7NEJBQ1QsV0FBVzs0QkFDWCxXQUFXOzRCQUNYLGlCQUFpQjs0QkFDakIsTUFBTSxFQUFFLFVBQVMsR0FBRztnQ0FDbkIsSUFBSSxvQkFBb0IsR0FBRyxDQUFDLENBQUMsZ0JBQWdCLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxHQUFHLENBQUMsQ0FBQztnQ0FDOUQsRUFBRSxDQUFDLENBQUMsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLENBQUM7b0NBQzNCLENBQUMsQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLENBQUM7Z0NBQ3BCLENBQUM7NEJBQ0YsQ0FBQzs0QkFDRCxPQUFPLEVBQUUsVUFBUyxDQUFDO2dDQUNsQixLQUFLLENBQUMsa0NBQWtDLEdBQUcsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFBOzRCQUN0RCxDQUFDOzRCQUNELElBQUksRUFBRSxNQUFNO3lCQUNaLENBQUMsQ0FBQTtvQkFDSCxDQUFDO29CQUFDLElBQUksQ0FBQyxDQUFDO3dCQUNQLENBQUMsQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLENBQUM7b0JBQ3BCLENBQUM7Z0JBQ0YsQ0FBQyxDQUFDLENBQUM7WUFDSixDQUFDLENBQUNBLENBQUNBO1FBQ0pBLENBQUNBO1FBR0RILGlDQUFVQSxHQUFWQSxVQUFXQSxJQUFRQTtZQUVsQkksSUFBSUEsQ0FBQ0EsR0FBR0EsSUFBSUEsQ0FBQ0E7WUFDYkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsT0FBT0EsSUFBSUEsQ0FBQ0EsR0FBR0EsS0FBS0EsUUFBUUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBRWxDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxFQUFFQSxVQUFTQSxHQUFHQTtvQkFDOUIsSUFBSSxNQUFNLEdBQUcsTUFBTSxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsWUFBWSxDQUFDLENBQUM7b0JBQ2hELEVBQUUsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxZQUFZLENBQUMsQ0FBQyxDQUFDO3dCQUN6QixLQUFLLENBQUMsTUFBTSxDQUFDLFlBQVksQ0FBQyxDQUFDO29CQUM1QixDQUFDO29CQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxjQUFjLEtBQUssVUFBVSxDQUFDLENBQUMsQ0FBQzt3QkFDbkQsQ0FBQyxDQUFDLGNBQWMsQ0FBQyxNQUFNLENBQUMsQ0FBQztvQkFDMUIsQ0FBQztnQkFDRixDQUFDLENBQUNBLENBQUNBO2dCQUVIQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxPQUFPQSxFQUFFQSxVQUFTQSxDQUFDQSxFQUFFQSxHQUFHQTtvQkFDbEMsS0FBSyxDQUFDLGtCQUFrQixHQUFHLElBQUksQ0FBQyxJQUFJLEdBQUcsSUFBSTt3QkFDMUMsR0FBRyxDQUFDLE1BQU0sR0FBRyxJQUFJLEdBQUcsR0FBRyxDQUFDLFVBQVUsQ0FBQyxDQUFDO2dCQUN0QyxDQUFDLENBQUNBLENBQUNBO2dCQUVIQSxxRUFBcUVBO2dCQUNyRUEsZUFBZUE7Z0JBQ2ZBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLFVBQVVBLEVBQUVBLFVBQVNBLEdBQUdBO29CQUNsQyxHQUFHLENBQUMsZ0JBQWdCLENBQUMsYUFBYSxFQUFFLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQztnQkFDbEQsQ0FBQyxDQUFDQSxDQUFDQTtnQkFFSEEsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7WUFDdkJBLENBQUNBO1FBQ0ZBLENBQUNBO1FBQ0ZKLG1CQUFDQTtJQUFEQSxDQUFDQSxBQTNGRHJDLElBMkZDQTtJQTNGWUEsZ0JBQVlBLGVBMkZ4QkEsQ0FBQUE7SUFHREEseUJBQXlCQTtJQUN6QkE7UUFBQTBDO1FBcUlBQyxDQUFDQTtRQW5JT0QsYUFBU0EsR0FBaEJBLFVBQWlCQSxLQUFTQSxFQUFFQSxNQUFVQSxFQUFFQSxRQUFlQSxFQUFFQSxTQUFnQkE7WUFDeEVFLElBQUlBLFVBQVVBLEdBQTBCQSxRQUFRQSxDQUFDQSxlQUFlQSxDQUFDQSxHQUFHQSxDQUFDQSxVQUFVQSxFQUFFQSxLQUFLQSxDQUFDQSxDQUFDQTtZQUN4RkEsVUFBVUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsU0FBU0EsRUFBRUEsS0FBS0EsQ0FBQ0EsQ0FBQ0E7WUFDMUNBLFVBQVVBLENBQUNBLFlBQVlBLENBQUNBLE9BQU9BLEVBQUVBLEtBQUtBLENBQUNBLFFBQVFBLEVBQUVBLENBQUNBLENBQUNBO1lBQ25EQSxVQUFVQSxDQUFDQSxZQUFZQSxDQUFDQSxRQUFRQSxFQUFFQSxNQUFNQSxDQUFDQSxRQUFRQSxFQUFFQSxDQUFDQSxDQUFDQTtZQUNyREEsVUFBVUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsU0FBU0EsRUFBRUEsTUFBTUEsR0FBR0EsUUFBUUEsR0FBR0EsR0FBR0EsR0FBR0EsU0FBU0EsQ0FBQ0EsQ0FBQ0E7WUFDeEVBLFVBQVVBLENBQUNBLFlBQVlBLENBQUNBLHFCQUFxQkEsRUFBRUEsTUFBTUEsQ0FBQ0EsQ0FBQ0E7WUFDdkRBLE1BQU1BLENBQUNBLFVBQVVBLENBQUNBO1FBQ25CQSxDQUFDQTtRQUdERix1REFBdURBO1FBQ2hEQSwwQkFBc0JBLEdBQTdCQSxVQUE4QkEsTUFBYUEsRUFBRUEsTUFBYUEsRUFBRUEsU0FBZ0JBLEVBQUVBLFVBQWlCQSxFQUFFQSxLQUFXQSxFQUFFQSxVQUFjQTtZQUMzSEcsSUFBSUEsU0FBU0EsR0FBVUEsU0FBU0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7WUFFckNBLElBQUlBLElBQUlBLEdBQVVBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLEdBQUdBLFVBQVVBLEdBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQ3BEQSxJQUFJQSxPQUFPQSxHQUFVQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxHQUFHQSxVQUFVQSxHQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUN2REEsSUFBSUEsSUFBSUEsR0FBVUEsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsR0FBR0EsU0FBU0EsQ0FBQ0EsQ0FBQ0E7WUFDakRBLElBQUlBLEVBQUVBLEdBQUdBLEdBQUdBLENBQUNBLFVBQVVBLENBQUVBLElBQUlBLEVBQUVBLElBQUlBLEVBQUVBLElBQUlBLEVBQUVBLE9BQU9BLEVBQUVBLEtBQUtBLEVBQUVBLFNBQVNBLENBQUNBLENBQUNBO1lBQ25FQSx1Q0FBdUNBO1lBRTFDQSxFQUFFQSxDQUFDQSxDQUFDQSxVQUFVQSxDQUFDQTtnQkFDWEEsVUFBVUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0E7WUFFNUJBLE1BQU1BLENBQUNBLEVBQUVBLENBQUNBO1FBQ2RBLENBQUNBO1FBR01ILGNBQVVBLEdBQWpCQSxVQUFrQkEsRUFBU0EsRUFBRUEsRUFBU0EsRUFBRUEsRUFBU0EsRUFBRUEsRUFBU0EsRUFBRUEsS0FBWUEsRUFBRUEsS0FBYUE7WUFDckZJLElBQUlBLEVBQUVBLEdBQWVBLFFBQVFBLENBQUNBLGVBQWVBLENBQUNBLEdBQUdBLENBQUNBLFVBQVVBLEVBQUVBLE1BQU1BLENBQUNBLENBQUNBO1lBRXpFQSxFQUFFQSxDQUFDQSxZQUFZQSxDQUFDQSxJQUFJQSxFQUFFQSxFQUFFQSxDQUFDQSxRQUFRQSxFQUFFQSxDQUFDQSxDQUFDQTtZQUNyQ0EsRUFBRUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsSUFBSUEsRUFBRUEsRUFBRUEsQ0FBQ0EsUUFBUUEsRUFBRUEsQ0FBQ0EsQ0FBQ0E7WUFDckNBLEVBQUVBLENBQUNBLFlBQVlBLENBQUNBLElBQUlBLEVBQUVBLEVBQUVBLENBQUNBLFFBQVFBLEVBQUVBLENBQUNBLENBQUNBO1lBQ3JDQSxFQUFFQSxDQUFDQSxZQUFZQSxDQUFDQSxJQUFJQSxFQUFFQSxFQUFFQSxDQUFDQSxRQUFRQSxFQUFFQSxDQUFDQSxDQUFDQTtZQUVyQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0E7Z0JBQ1RBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLFFBQVFBLEVBQUVBLEtBQUtBLENBQUNBLFFBQVFBLEVBQUVBLENBQUNBLENBQUNBO1lBRXZDQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQTtnQkFDVEEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsY0FBY0EsRUFBRUEsS0FBS0EsQ0FBQ0EsUUFBUUEsRUFBRUEsQ0FBQ0EsQ0FBQ0E7WUFFMUNBLE1BQU1BLENBQUNBLEVBQUVBLENBQUNBO1FBQ2RBLENBQUNBO1FBR01KLGNBQVVBLEdBQWpCQSxVQUFrQkEsQ0FBUUEsRUFBRUEsQ0FBUUEsRUFBRUEsS0FBWUEsRUFBRUEsTUFBYUEsRUFBRUEsU0FBZUEsRUFBRUEsV0FBbUJBLEVBQUVBLFdBQWtCQSxFQUFFQSxPQUFlQTtZQUUzSUssa0JBQWtCQTtZQUNsQkEsV0FBV0EsR0FBR0EsQ0FBQ0EsT0FBTUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsS0FBS0EsV0FBV0EsR0FBR0EsV0FBV0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFFdEVBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLFdBQVdBLENBQUNBO2dCQUNoQkEsV0FBV0EsR0FBR0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0E7WUFFM0JBLE9BQU9BLEdBQUdBLENBQUNBLE9BQU1BLENBQUNBLE9BQU9BLENBQUNBLEtBQUtBLFdBQVdBLEdBQUdBLE9BQU9BLEdBQUdBLENBQUNBLENBQUNBLENBQUNBO1lBRXZEQSxJQUFJQSxFQUFFQSxHQUFlQSxRQUFRQSxDQUFDQSxlQUFlQSxDQUFDQSxHQUFHQSxDQUFDQSxVQUFVQSxFQUFFQSxNQUFNQSxDQUFDQSxDQUFDQTtZQUV0RUEsMkNBQTJDQTtZQUMzQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsTUFBTUEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ2hCQSxDQUFDQSxJQUFJQSxNQUFNQSxDQUFDQTtnQkFDWkEsTUFBTUEsR0FBR0EsQ0FBQ0EsTUFBTUEsQ0FBQ0E7WUFDbEJBLENBQUNBO1lBRURBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO2dCQUNmQSxDQUFDQSxJQUFJQSxNQUFNQSxDQUFDQTtnQkFDWkEsS0FBS0EsR0FBR0EsQ0FBQ0EsS0FBS0EsQ0FBQ0E7WUFDaEJBLENBQUNBO1lBRURBLEVBQUVBLENBQUNBLFlBQVlBLENBQUNBLEdBQUdBLEVBQUVBLENBQUNBLENBQUNBLFFBQVFBLEVBQUVBLENBQUNBLENBQUNBO1lBQ25DQSxFQUFFQSxDQUFDQSxZQUFZQSxDQUFDQSxHQUFHQSxFQUFFQSxDQUFDQSxDQUFDQSxRQUFRQSxFQUFFQSxDQUFDQSxDQUFDQTtZQUNuQ0EsRUFBRUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsT0FBT0EsRUFBRUEsS0FBS0EsQ0FBQ0EsUUFBUUEsRUFBRUEsQ0FBQ0EsQ0FBQ0E7WUFDM0NBLEVBQUVBLENBQUNBLFlBQVlBLENBQUNBLFFBQVFBLEVBQUVBLE1BQU1BLENBQUNBLFFBQVFBLEVBQUVBLENBQUNBLENBQUNBO1lBRTdDQSxFQUFFQSxDQUFDQSxDQUFDQSxPQUFNQSxDQUFDQSxXQUFXQSxDQUFDQSxLQUFLQSxXQUFXQSxDQUFDQTtnQkFDdkNBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLGNBQWNBLEVBQUVBLFdBQVdBLENBQUNBLENBQUNBO1lBRXhDQSxFQUFFQSxDQUFDQSxDQUFDQSxPQUFNQSxDQUFDQSxXQUFXQSxDQUFDQSxLQUFLQSxXQUFXQSxDQUFDQTtnQkFDdkNBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLFFBQVFBLEVBQUVBLFdBQVdBLENBQUNBLFFBQVFBLEVBQUVBLENBQUNBLENBQUNBO1lBRTdDQSxFQUFFQSxDQUFDQSxDQUFDQSxPQUFNQSxDQUFDQSxPQUFPQSxDQUFDQSxLQUFLQSxXQUFXQSxDQUFDQTtnQkFDbkNBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLEdBQUdBLENBQUNB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MDE2IDE2OjEzOjQ3ICBcbi8vLyA8cmVmZXJlbmNlIHBhdGg9XCJ0eXBlc2NyaXB0LWRlY2xhcmF0aW9ucy5kLnRzXCIgLz5cblxuXG4vLyBUaGlzIGZpbGUgY29udGFpbnMgdmFyaW91cyB1dGlsaXR5IGNsYXNzZXMgdW5kZXIgdGhlIFV0bCBtb2R1bGUuXG5cbm1vZHVsZSBVdGwge1xuXG5cdGV4cG9ydCBjbGFzcyBFREQge1xuXG5cdFx0c3RhdGljIHJlc29sdmVNZWFzdXJlbWVudFJlY29yZFRvTmFtZShtZWFzdXJlbWVudFJlY29yZDpBc3NheU1lYXN1cmVtZW50UmVjb3JkKTpzdHJpbmcge1xuXG5cdFx0XHR2YXIgbU5hbWUgPSAnJztcblx0XHRcdC8vIFdlIGZpZ3VyZSBvdXQgdGhlIG5hbWUgYW5kIHVuaXRzIGRpZmZlcmVudGx5IGJhc2VkIG9uIHRoZSBzdWJ0eXBlLlxuXHRcdFx0dmFyIG1zdCA9IG1lYXN1cmVtZW50UmVjb3JkLm1zdDtcblx0XHRcdGlmIChtc3QgPT0gMSkge1x0Ly8gTWV0YWJvbGl0ZSB0eXBlLiAgTWFnaWMgbnVtYmVycy4gIEVXISAgVE9ETzogRWVlZXchXG5cdFx0XHRcdHZhciBjb21wTmFtZSA9ICcnO1xuXHRcdFx0XHR2YXIgY29tcElEID0gbWVhc3VyZW1lbnRSZWNvcmQubXE7XG5cdFx0XHRcdGlmIChjb21wSUQpIHtcblx0XHRcdFx0XHR2YXIgY1JlY29yZCA9IEVERERhdGEuTWVhc3VyZW1lbnRUeXBlQ29tcGFydG1lbnRzW2NvbXBJRF07XG5cdFx0XHRcdFx0aWYgKGNSZWNvcmQpIHtcblx0XHRcdFx0XHRcdGNvbXBOYW1lID0gY1JlY29yZC5zbiArICcgJztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cbiAgICAgICAgICAgIFx0dmFyIG1SZWNvcmQgPSBFREREYXRhLk1ldGFib2xpdGVUeXBlc1ttZWFzdXJlbWVudFJlY29yZC5tdF07XG4gICAgICAgICAgICBcdG1OYW1lID0gY29tcE5hbWUgKyBtUmVjb3JkLm5hbWU7XG5cdFx0ICAgIH0gZWxzZSBpZiAobXN0ID09IDIpIHtcdC8vIEdlbmUgdHlwZS4gIEVXVyBFV1dcbiAgICAgICAgICAgIFx0bU5hbWUgPSBFREREYXRhLkdlbmVUeXBlc1ttZWFzdXJlbWVudFJlY29yZC5tdF0ubmFtZTtcblx0XHQgICAgfSBlbHNlIGlmIChtc3QgPT0gMykge1x0Ly8gUHJvdGVpbiB0eXBlLiAgRVdXIEVXV1xuICAgICAgICAgICAgXHRtTmFtZSA9IEVERERhdGEuUHJvdGVpblR5cGVzW21lYXN1cmVtZW50UmVjb3JkLm10XS5uYW1lO1xuXHRcdCAgICB9XG5cdFx0ICAgIHJldHVybiBtTmFtZTtcblx0XHR9XG5cblxuXHRcdHN0YXRpYyByZXNvbHZlTWVhc3VyZW1lbnRSZWNvcmRUb1VuaXRzKG1lYXN1cmVtZW50UmVjb3JkOkFzc2F5TWVhc3VyZW1lbnRSZWNvcmQpOnN0cmluZyB7XG5cblx0XHRcdHZhciBtVW5pdHMgPSAnJztcblx0XHRcdHZhciBtc3QgPSBtZWFzdXJlbWVudFJlY29yZC5tc3Q7XG5cdFx0XHRpZiAobXN0ID09IDEpIHtcdFx0Ly8gVE9ETzogaHR0cHM6Ly93d3cueW91dHViZS5jb20vd2F0Y2g/dj1KbHRFWHBiR004c1xuICAgICAgICAgICAgXHRpZiAobWVhc3VyZW1lbnRSZWNvcmQudWlkKSB7XG5cdCAgICAgICAgICAgIFx0dmFyIHVSZWNvcmQgPSBFREREYXRhLlVuaXRUeXBlc1ttZWFzdXJlbWVudFJlY29yZC51aWRdO1xuXHQgICAgICAgICAgICBcdGlmICh1UmVjb3JkKSB7XG5cdCAgICAgICAgICAgIFx0XHRtVW5pdHMgPSB1UmVjb3JkLm5hbWU7XG5cdCAgICAgICAgICAgIFx0fVxuXHRcdCAgICAgICAgfVxuXHRcdCAgICB9IGVsc2UgaWYgKG1zdCA9PSAyKSB7XG4gICAgICAgICAgICBcdG1Vbml0cyA9ICcnO1x0Ly8gVW5pdHMgZm9yIFByb3Rlb21pY3M/ICBBbnlvbmU/XG5cdFx0ICAgIH0gZWxzZSBpZiAobXN0ID09IDMpIHtcbiAgICAgICAgICAgIFx0bVVuaXRzID0gJ1JQS00nO1xuXHRcdCAgICB9XG5cdFx0ICAgIHJldHVybiBtVW5pdHM7XG5cdFx0fVxuXHR9XG5cblxuXHRleHBvcnQgY2xhc3MgUXRpcEhlbHBlciB7XG5cdFx0cHVibGljIGNyZWF0ZShsaW5rRWxlbWVudCwgY29udGVudEZ1bmN0aW9uLCBwYXJhbXM6YW55KTp2b2lkIHtcblxuXHRcdFx0cGFyYW1zLnBvc2l0aW9uLnRhcmdldCA9ICQobGlua0VsZW1lbnQpO1xuXHRcdFx0cGFyYW1zLnBvc2l0aW9uLnZpZXdwb3J0ID0gJCh3aW5kb3cpO1x0Ly8gVGhpcyBtYWtlcyBpdCBwb3NpdGlvbiBpdHNlbGYgdG8gZml0IGluc2lkZSB0aGUgYnJvd3NlciB3aW5kb3cuXG5cblx0XHRcdHRoaXMuX2NvbnRlbnRGdW5jdGlvbiA9IGNvbnRlbnRGdW5jdGlvbjtcblxuXHRcdFx0aWYgKCFwYXJhbXMuY29udGVudClcblx0XHRcdFx0cGFyYW1zLmNvbnRlbnQgPSB7fTtcblxuXHRcdFx0cGFyYW1zLmNvbnRlbnQudGV4dCA9IHRoaXMuX2dlbmVyYXRlQ29udGVudC5iaW5kKHRoaXMpO1xuXHRcdFx0dGhpcy5xdGlwID0gJChsaW5rRWxlbWVudCkucXRpcChwYXJhbXMpO1xuXHRcdH1cblxuXHRcdHByaXZhdGUgX2dlbmVyYXRlQ29udGVudCgpOmFueSB7XG5cdFx0XHQvLyBJdCdzIGluY3JlZGlibHkgc3R1cGlkIHRoYXQgd2UgaGF2ZSB0byBkbyB0aGlzIHRvIHdvcmsgYXJvdW5kIHF0aXAyJ3MgMjgwcHggbWF4LXdpZHRoIGRlZmF1bHQuXG5cdFx0XHQvLyBXZSBoYXZlIHRvIGRvIGl0IGhlcmUgcmF0aGVyIHRoYW4gaW1tZWRpYXRlbHkgYWZ0ZXIgY2FsbGluZyBxdGlwKCkgYmVjYXVzZSBxdGlwIHdhaXRzIHRvIGNyZWF0ZVxuXHRcdFx0Ly8gdGhlIGFjdHVhbCBlbGVtZW50LlxuXHRcdFx0dmFyIHEgPSB0aGlzLl9nZXRRVGlwRWxlbWVudCgpO1xuXHRcdFx0JChxKS5jc3MoJ21heC13aWR0aCcsICdub25lJyk7XG5cdFx0XHQkKHEpLmNzcygnd2lkdGgnLCAnYXV0bycpO1xuXG5cdFx0XHRyZXR1cm4gdGhpcy5fY29udGVudEZ1bmN0aW9uKCk7XG5cdFx0fVxuXG5cdFx0Ly8gR2V0IHRoZSBIVE1MIGVsZW1lbnQgZm9yIHRoZSBxdGlwLiBVc3VhbGx5IHdlIHVzZSB0aGlzIHRvIHVuc2V0IG1heC13aWR0aC5cblx0XHRwcml2YXRlIF9nZXRRVGlwRWxlbWVudCgpOkhUTUxFbGVtZW50IHtcblx0XHRcdHJldHVybiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCh0aGlzLnF0aXAuYXR0cignYXJpYS1kZXNjcmliZWRieScpKTtcblx0XHR9XG5cblx0XHRwdWJsaWMgcXRpcDphbnk7XG5cdFx0cHJpdmF0ZSBfY29udGVudEZ1bmN0aW9uOmFueTtcblx0fVxuXG5cblx0Ly8gUkdCQSBoZWxwZXIgY2xhc3MuXG5cdC8vIFZhbHVlcyBhcmUgMC0yNTUgKGFsdGhvdWdoIHRvU3RyaW5nKCkgbWFrZXMgYWxwaGEgMC0xIHNpbmNlIHRoYXQncyBob3cgQ1NTIGxpa2VzIGl0KS5cblx0ZXhwb3J0IGNsYXNzIENvbG9yIHtcblxuXHRcdHI6IG51bWJlcjtcblx0XHRnOiBudW1iZXI7XG5cdFx0YjogbnVtYmVyO1xuXHRcdGE6IG51bWJlcjtcblxuXHRcdC8vIE5vdGU6IEFsbCB2YWx1ZXMgYXJlIDAtMjU1LCBidXQgdG9TdHJpbmcoKSB3aWxsIGNvbnZlcnQgYWxwaGEgdG8gYSAwLTEgdmFsdWVcblx0XHRzdGF0aWMgcmdiYShyOm51bWJlciwgZzpudW1iZXIsIGI6bnVtYmVyLCBhbHBoYTpudW1iZXIpIDogQ29sb3Ige1xuXHRcdFx0dmFyIGNscjpDb2xvciA9IG5ldyBDb2xvcigpO1xuXHRcdFx0Y2xyLnIgPSByO1xuXHRcdFx0Y2xyLmcgPSBnO1xuXHRcdFx0Y2xyLmIgPSBiO1xuXHRcdFx0Y2xyLmEgPSBhbHBoYTtcblx0XHRcdHJldHVybiBjbHI7XG5cdFx0fVxuXG5cdFx0Ly8gTm90ZTogQWxsIHZhbHVlcyBhcmUgMC0yNTUsIGJ1dCB0b1N0cmluZygpIHdpbGwgY29udmVydCBhbHBoYSB0byBhIDAtMSB2YWx1ZVxuXHRcdHN0YXRpYyByZ2IocjpudW1iZXIsIGc6bnVtYmVyLCBiOm51bWJlcikgOiBDb2xvciB7XG5cdFx0XHR2YXIgY2xyOkNvbG9yID0gbmV3IENvbG9yKCk7XG5cdFx0XHRjbHIuciA9IHI7XG5cdFx0XHRjbHIuZyA9IGc7XG5cdFx0XHRjbHIuYiA9IGI7XG5cdFx0XHRjbHIuYSA9IDI1NTtcblx0XHRcdHJldHVybiBjbHI7XG5cdFx0fVxuXG5cdFx0c3RhdGljIGludGVycG9sYXRlKGNscjE6Q29sb3IsIGNscjI6Q29sb3IsIHQ6bnVtYmVyKSA6IENvbG9yIHtcblx0XHRcdHJldHVybiBDb2xvci5yZ2JhKFxuXHRcdFx0XHRjbHIxLnIgKyAoY2xyMi5yIC0gY2xyMS5yKSAqIHQsIFxuXHRcdFx0XHRjbHIxLmcgKyAoY2xyMi5nIC0gY2xyMS5nKSAqIHQsIFxuXHRcdFx0XHRjbHIxLmIgKyAoY2xyMi5iIC0gY2xyMS5iKSAqIHQsIFxuXHRcdFx0XHRjbHIxLmEgKyAoY2xyMi5hIC0gY2xyMS5hKSAqIHRcblx0XHRcdCk7XG5cdFx0fVxuXG5cdFx0c3RhdGljIHRvU3RyaW5nKGNscjphbnkpIDogc3RyaW5nIHtcblx0XHRcdC8vIElmIGl0J3Mgc29tZXRoaW5nIGVsc2UgKGxpa2UgYSBzdHJpbmcpIGFscmVhZHksIGp1c3QgcmV0dXJuIHRoYXQgdmFsdWUuXG5cdFx0XHRpZiAodHlwZW9mIGNsciA9PSAnc3RyaW5nJylcblx0XHRcdFx0cmV0dXJuIGNscjtcblxuXHRcdFx0cmV0dXJuICdyZ2JhKCcgKyBNYXRoLmZsb29yKGNsci5yKSArICcsICcgKyBNYXRoLmZsb29yKGNsci5nKSArICcsICcgKyBNYXRoLmZsb29yKGNsci5iKSArICcsICcgKyBjbHIuYS8yNTUgKyAnKSc7XG5cdFx0fVxuXG5cdFx0dG9TdHJpbmcoKSA6IHN0cmluZyB7XG5cdFx0XHRyZXR1cm4gJ3JnYmEoJyArIE1hdGguZmxvb3IodGhpcy5yKSArICcsICcgKyBNYXRoLmZsb29yKHRoaXMuZykgKyAnLCAnICsgTWF0aC5mbG9vcih0aGlzLmIpICsgJywgJyArIHRoaXMuYS8yNTUgKyAnKSc7XG5cdFx0fVxuXG5cdFx0c3RhdGljIHJlZCA9IENvbG9yLnJnYigyNTUsMCwwKTtcblx0XHRzdGF0aWMgZ3JlZW4gPSBDb2xvci5yZ2IoMCwyNTUsMCk7XG5cdFx0c3RhdGljIGJsdWUgPSBDb2xvci5yZ2IoMCwwLDI1NSk7XG5cdFx0c3RhdGljIGJsYWNrID0gQ29sb3IucmdiKDAsMCwwKTtcblx0XHRzdGF0aWMgd2hpdGUgPSBDb2xvci5yZ2IoMjU1LDI1NSwyNTUpO1xuXG5cdH07XG5cblxuXHRleHBvcnQgY2xhc3MgVGFibGUge1xuXG5cdFx0Y29uc3RydWN0b3IodGFibGVJRDpzdHJpbmcsIHdpZHRoPzpudW1iZXIsIGhlaWdodD86bnVtYmVyKSB7XG5cdFx0XHR0aGlzLnRhYmxlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgndGFibGUnKTtcblx0XHRcdHRoaXMudGFibGUuaWQgPSB0YWJsZUlEO1xuXG5cdFx0XHRpZiAod2lkdGgpXG5cdFx0XHRcdCQodGhpcy50YWJsZSkuY3NzKCd3aWR0aCcsIHdpZHRoKTtcblxuXHRcdFx0aWYgKGhlaWdodClcblx0XHRcdFx0JCh0aGlzLnRhYmxlKS5jc3MoJ2hlaWdodCcsIGhlaWdodCk7XG5cdFx0fVxuXG5cdFx0YWRkUm93KCk6SFRNTFRhYmxlUm93RWxlbWVudCB7XG5cdFx0XHR2YXIgcm93ID0gdGhpcy50YWJsZS5pbnNlcnRSb3coLTEpO1xuXHRcdFx0dGhpcy5fY3VycmVudFJvdysrO1xuXHRcdFx0cmV0dXJuIDxIVE1MVGFibGVSb3dFbGVtZW50PnJvdztcblx0XHR9XG5cblx0XHRhZGRDb2x1bW4oKTpIVE1MRWxlbWVudCB7XG5cdFx0XHR2YXIgcm93OkhUTUxUYWJsZVJvd0VsZW1lbnQgPSA8SFRNTFRhYmxlUm93RWxlbWVudD50aGlzLnRhYmxlLnJvd3NbdGhpcy5fY3VycmVudFJvdy0xXTtcblx0XHRcdHZhciBjb2x1bW46SFRNTEVsZW1lbnQgPSByb3cuaW5zZXJ0Q2VsbCgtMSk7XG5cdFx0XHRyZXR1cm4gY29sdW1uO1xuXHRcdH1cblxuXHRcdC8vIFdoZW4geW91J3JlIGRvbmUgc2V0dGluZyB1cCB0aGUgdGFibGUsIGFkZCBpdCB0byBhbm90aGVyIGVsZW1lbnQuXG5cdFx0YWRkVGFibGVUbyhlbGVtZW50OkhUTUxFbGVtZW50KSB7XG5cdFx0XHRlbGVtZW50LmFwcGVuZENoaWxkKHRoaXMudGFibGUpO1xuXHRcdH1cblxuXHRcdHRhYmxlOkhUTUxUYWJsZUVsZW1lbnQgPSBudWxsO1xuXHRcdF9jdXJyZW50Um93Om51bWJlciA9IDA7XG5cdH1cblxuXG5cdC8vIEphdmFzY3JpcHQgdXRpbGl0aWVzXG5cdGV4cG9ydCBjbGFzcyBKUyB7XG5cblx0XHQvLyBUaGlzIGFzc3VtZXMgdGhhdCBzdHIgaGFzIG9ubHkgb25lIHJvb3QgZWxlbWVudC5cblx0XHQvLyBJdCBhbHNvIGJyZWFrcyBmb3IgZWxlbWVudHMgdGhhdCBuZWVkIHRvIGJlIG5lc3RlZCB1bmRlciBvdGhlciBzcGVjaWZpYyBlbGVtZW50IHR5cGVzLFxuXHRcdC8vIGUuZy4gaWYgeW91IGF0dGVtcHQgdG8gY3JlYXRlIGEgPHRkPiB5b3Ugd2lsbCBiZSBoYW5kZWQgYmFjayBhIDxkaXY+LlxuXHRcdHN0YXRpYyBjcmVhdGVFbGVtZW50RnJvbVN0cmluZyhzdHI6c3RyaW5nLCBuYW1lc3BhY2U6c3RyaW5nID0gbnVsbCk6SFRNTEVsZW1lbnQge1xuXG5cdFx0XHR2YXIgZGl2O1xuXHRcdFx0aWYgKG5hbWVzcGFjZSlcblx0XHRcdFx0ZGl2ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudE5TKG5hbWVzcGFjZSwgJ2RpdicpO1xuXHRcdFx0ZWxzZVxuXHRcdFx0XHRkaXYgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblxuXHRcdFx0ZGl2LmlubmVySFRNTCA9IHN0cjtcblx0XHRcdHJldHVybiBkaXYuZmlyc3RDaGlsZDtcblxuXHRcdH1cblxuXG5cdFx0c3RhdGljIGFzc2VydChjb25kaXRpb246Ym9vbGVhbiwgbWVzc2FnZTpzdHJpbmcpOnZvaWQge1xuXHRcdCAgICBpZiAoIWNvbmRpdGlvbikge1xuICAgICAgICAgICAgICAgIG1lc3NhZ2UgPSBtZXNzYWdlIHx8IFwiQXNzZXJ0aW9uIGZhaWxlZFwiO1xuICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgRXJyb3IgIT09ICd1bmRlZmluZWQnKSB0aHJvdyBFcnJvcihtZXNzYWdlKTtcbiAgICAgICAgICAgICAgICBlbHNlIHRocm93IG1lc3NhZ2U7XG5cdFx0ICAgIH1cblx0XHR9XG5cblx0XHRcblx0XHRzdGF0aWMgY29udmVydEhhc2hUb0xpc3QoaGFzaDphbnkpOmFueSB7XG5cdFx0XHRyZXR1cm4gT2JqZWN0LmtleXMoaGFzaCkubWFwKCBmdW5jdGlvbihhKSB7cmV0dXJuIGhhc2hbYV07fSApO1xuXHRcdH1cblxuXG5cdFx0Ly8gUmV0dXJucyBhIHN0cmluZyBvZiBsZW5ndGggbnVtQ2hhcnMsIHBhZGRpbmcgdGhlIHJpZ2h0IHNpZGVcblx0XHQvLyB3aXRoIHNwYWNlcyBpZiBzdHIgaXMgc2hvcnRlciB0aGFuIG51bUNoYXJzLlxuXHRcdC8vIFdpbGwgdHJ1bmNhdGUgaWYgdGhlIHN0cmluZyBpcyBsb25nZXIgdGhhbiBudW1DaGFycy5cblx0XHRzdGF0aWMgcGFkU3RyaW5nTGVmdChzdHI6c3RyaW5nLCBudW1DaGFyczpudW1iZXIpOnN0cmluZyB7XG5cdFx0XHR2YXIgc3RhcnRMZW46bnVtYmVyID0gc3RyLmxlbmd0aDtcblx0XHRcdGZvciAodmFyIGk9c3RhcnRMZW47IGkgPCBudW1DaGFyczsgaSsrKVxuXHRcdFx0XHRzdHIgKz0gJyAnO1xuXG5cdFx0XHRyZXR1cm4gc3RyLnNsaWNlKDAsIG51bUNoYXJzKTtcblx0XHR9XG5cblxuXHRcdC8vIFJldHVybnMgYSBzdHJpbmcgb2YgbGVuZ3RoIG51bUNoYXJzLCBwYWRkaW5nIHRoZSBsZWZ0IHNpZGVcblx0XHQvLyB3aXRoIHNwYWNlcyBpZiBzdHIgaXMgc2hvcnRlciB0aGFuIG51bUNoYXJzLlxuXHRcdHN0YXRpYyBwYWRTdHJpbmdSaWdodChzdHI6c3RyaW5nLCBudW1DaGFyczpudW1iZXIpOnN0cmluZyB7XG5cdFx0XHR2YXIgcGFkU3RyID0gXCJcIjtcblx0XHRcdGZvciAodmFyIGk9MDsgaSA8IG51bUNoYXJzOyBpKyspXG5cdFx0XHRcdHBhZFN0ciArPSBcIiBcIjtcblxuXHRcdFx0cmV0dXJuIChwYWRTdHIgKyBzdHIpLnNsaWNlKC1udW1DaGFycyk7XG5cdFx0fVxuXG5cblx0XHQvLyBNYWtlIGEgc3RyaW5nIGJ5IHJlcGVhdGluZyB0aGUgc3BlY2lmaWVkIHN0cmluZyBOIHRpbWVzLlxuXHRcdHN0YXRpYyByZXBlYXRTdHJpbmcoc3RyOnN0cmluZywgbnVtQ2hhcnM6bnVtYmVyKTpzdHJpbmcge1xuXHRcdFx0dmFyIHJldDpzdHJpbmcgPSBcIlwiO1xuXHRcdFx0Zm9yICh2YXIgaTpudW1iZXI9MDsgaSA8IG51bUNoYXJzOyBpKyspXG5cdFx0XHRcdHJldCArPSBzdHI7XG5cblx0XHRcdHJldHVybiByZXQ7XG5cdFx0fVxuXG5cblx0XHQvLyBHaXZlbiBhIGRhdGUgaW4gc2Vjb25kcyAod2l0aCBhIHBvc3NpYmxlIGZyYWN0aW9uYWwgcG9ydGlvbiBiZWluZyBtaWxsaXNlY29uZHMpLFxuXHRcdC8vIGJhc2VkIG9uIHplcm8gYmVpbmcgbWlkbmlnaHQgb2YgSmFuIDEsIDE5NzAgKHN0YW5kYXJkIG9sZC1zY2hvb2wgUE9TSVggdGltZSksXG5cdFx0Ly8gcmV0dXJuIGEgc3RyaW5nIGZvcm1hdHRlZCBpbiB0aGUgbWFubmVyIG9mIFwiRGVjIDIxIDIwMTIsIDExOjQ1YW1cIixcblx0XHQvLyB3aXRoIGV4Y2VwdGlvbnMgZm9yICdUb2RheScgYW5kICdZZXN0ZXJkYXknLCBlLmcuIFwiWWVzdGVyZGF5LCAzOjEycG1cIi5cblx0XHRzdGF0aWMgdGltZXN0YW1wVG9Ub2RheVN0cmluZyh0aW1lc3RhbXA6bnVtYmVyKTpzdHJpbmcge1xuXG5cdFx0XHQvLyBDb2RlIGFkYXB0ZWQgZnJvbSBQZXJsJ3MgSFRUUC1EYXRlXG5cdFx0XHQvL3ZhciBEb1cgPSBbJ1N1bicsJ01vbicsJ1R1ZScsJ1dlZCcsJ1RodScsJ0ZyaScsJ1NhdCddO1xuXHRcdFx0dmFyIE1vWSA9IFsnSmFuJywnRmViJywnTWFyJywnQXByJywnTWF5JywnSnVuJywnSnVsJywnQXVnJywnU2VwJywnT2N0JywnTm92JywnRGVjJ107XG5cblx0XHRcdGlmICghdGltZXN0YW1wIHx8IHRpbWVzdGFtcCA8IDEpIHtcblx0XHRcdFx0cmV0dXJuICc8c3BhbiBzdHlsZT1cImNvbG9yOiM4ODg7XCI+Ti9BPC9zcGFuPic7XG5cdFx0XHR9XG5cblx0XHRcdHZhciB0ID0gbmV3IERhdGUoTWF0aC5yb3VuZCh0aW1lc3RhbXAqMTAwMCkpO1xuXHRcdFx0dmFyIG4gPSBuZXcgRGF0ZSgpO1xuXHRcdFx0dmFyIG5vdyA9IG4uZ2V0VGltZSgpO1xuXG5cdFx0XHR2YXIgc2VjID0gdC5nZXRTZWNvbmRzKCk7XG5cdFx0XHR2YXIgbWluOmFueSA9IHQuZ2V0TWludXRlcygpO1x0Ly8gVHlwZSBcImFueVwiIHNvIHdlIGNhbiBhZGQgYSBsZWFkaW5nIHplcm9cblx0XHRcdHZhciBob3VyID0gdC5nZXRIb3VycygpO1xuXHRcdFx0dmFyIG1kYXkgPSB0LmdldERhdGUoKTtcdFx0Ly8gUmV0dXJucyB0aGUgZGF5IG9mIHRoZSBtb250aCAoZnJvbSAxLTMxKVxuXHRcdFx0dmFyIG1vbiA9IHQuZ2V0TW9udGgoKTtcdFx0Ly8gUmV0dXJucyB0aGUgbW9udGggKGZyb20gMC0xMSlcblx0XHRcdHZhciB5ZWFyID0gdC5nZXRGdWxsWWVhcigpO1x0Ly8gUmV0dXJucyB0aGUgeWVhciAoZm91ciBkaWdpdHMpXG5cdFx0XHR2YXIgd2RheSA9IHQuZ2V0RGF5KCk7XHRcdC8vIFJldHVybnMgdGhlIGRheSBvZiB0aGUgd2VlayAoZnJvbSAwLTYpXG5cblx0XHRcdHZhciBuc2VjID0gbi5nZXRTZWNvbmRzKCk7XG5cdFx0XHR2YXIgbm1pbiA9IG4uZ2V0TWludXRlcygpO1xuXHRcdFx0dmFyIG5ob3VyID0gbi5nZXRIb3VycygpO1xuXHRcdFx0dmFyIG5tZGF5ID0gbi5nZXREYXRlKCk7XG5cdFx0XHR2YXIgbm1vbiA9IG4uZ2V0TW9udGgoKTtcblx0XHRcdHZhciBueWVhciA9IG4uZ2V0RnVsbFllYXIoKTtcblx0XHRcdHZhciBud2RheSA9IG4uZ2V0RGF5KCk7XG5cblx0XHRcdHZhciBkYXlfc3RyO1xuXG5cdFx0XHRpZiAoKHllYXIgPT0gbnllYXIpICYmIChtb24gPT0gbm1vbikgJiYgKG1kYXkgPT0gbm1kYXkpKSB7XG5cdFx0XHRcdGRheV9zdHIgPSAnVG9kYXknO1xuXHRcdFx0fSBlbHNlIGlmIChcdCAgICAobm93IC0gKG5zZWMgKyAoNjAqKG5taW4rKDYwKihuaG91cisyNCkpKSkpKSA9PVx0XHQvLyBOb3cncyBkYXkgY29tcG9uZW50IG1pbnVzIGEgZGF5XG5cdFx0XHRcdFx0ICAodGltZXN0YW1wIC0gKHNlYyAgKyAoNjAqKG1pbiArKDYwKiBob3VyICAgICApKSkpKSlcdCB7XHQvLyBUaW1lc3RhbXAncyBkYXkgY29tcG9uZW50XG5cdFx0XHRcdGRheV9zdHIgPSAnWWVzdGVyZGF5Jztcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHZhciB5ZWFyX3N0ciA9ICcnO1xuXHRcdFx0XHRpZiAoeWVhciAhPSBueWVhcikge1xuXHRcdFx0XHRcdHllYXJfc3RyID0gJyAnICsgeWVhcjtcblx0XHRcdFx0fVxuXHRcdFx0XHRkYXlfc3RyID0gTW9ZW21vbl0gKyAnICcgKyBtZGF5ICsgeWVhcl9zdHI7XG5cdFx0XHR9XG5cblx0XHRcdHZhciBoYWxmX2RheSA9ICdhbSc7XG5cdFx0XHRpZiAoaG91ciA+IDExKSB7aGFsZl9kYXkgPSAncG0nO31cblx0XHRcdGlmIChob3VyID4gMTIpIHtob3VyIC09IDEyO31cblx0XHRcdGVsc2UgaWYgKGhvdXIgPT0gMCkge2hvdXIgPSAxMjt9XG5cdFx0XHRpZiAobWluIDwgOSkge21pbiA9ICcwJyttaW47fVxuXG5cdFx0XHRyZXR1cm4gZGF5X3N0ciArICcsICcgKyBob3VyICsgJzonICsgbWluICsgaGFsZl9kYXk7XG5cdFx0fVxuXG5cbiAgICAgICAgc3RhdGljIHV0Y1RvVG9kYXlTdHJpbmcodXRjOnN0cmluZyk6c3RyaW5nIHtcbiAgICAgICAgICAgIHZhciBtOmFueVtdO1xuICAgICAgICAgICAgdmFyIHRpbWVzdGFtcDpudW1iZXI7XG4gICAgICAgICAgICBtID0gL14oXFxkezR9KS0oXFxkezJ9KS0oXFxkezJ9KVQoXFxkezJ9KTooXFxkezJ9KTooXFxkezJ9KVxcLj8oXFxkezEsNn0pP1okLy5leGVjKHV0Yyk7XG4gICAgICAgICAgICBpZiAobSkge1xuICAgICAgICAgICAgICAgIG0uc2hpZnQoKTsgLy8gZ2V0IHJpZCBvZiBvdmVyYWxsIG1hdGNoLCB3ZSBkb24ndCBjYXJlXG4gICAgICAgICAgICAgICAgbS5tYXAoKHYpID0+IHsgcmV0dXJuIHBhcnNlSW50KHYsIDEwKTsgfSk7IC8vIGNvbnZlcnQgc3RyaW5ncyB0byBudW1iZXJzXG4gICAgICAgICAgICAgICAgbVsxXS0tOyAvLyBEYXRlIHVzZXMgMC1iYXNlZCBtb250aHMsIHNvIGRlY3JlbWVudCBtb250aFxuICAgICAgICAgICAgICAgIHRpbWVzdGFtcCA9IERhdGUuVVRDKG1bMF0sIG1bMV0sIG1bMl0sIG1bM10sIG1bNF0sIG1bNV0pO1xuICAgICAgICAgICAgICAgIHRpbWVzdGFtcCAvPSAxMDAwOyAvLyB0aGUgdGltZXN0YW1wVG9Ub2RheVN0cmluZyBleHBlY3RzIHNlY29uZHMsIG5vdCBtaWxsaXNlY29uZHNcbiAgICAgICAgICAgICAgICByZXR1cm4gVXRsLkpTLnRpbWVzdGFtcFRvVG9kYXlTdHJpbmcodGltZXN0YW1wKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBVdGwuSlMudGltZXN0YW1wVG9Ub2RheVN0cmluZyhudWxsKTtcbiAgICAgICAgfVxuXG5cblx0XHQvLyBSZW1hcCBhIHZhbHVlIGZyb20gW2luTWluLCBpbk1heF0gdG8gW291dE1pbiwgb3V0TWF4XVxuXHRcdHN0YXRpYyByZW1hcFZhbHVlKHZhbHVlOm51bWJlciwgaW5NaW46bnVtYmVyLCBpbk1heDpudW1iZXIsIG91dE1pbjpudW1iZXIsIG91dE1heDpudW1iZXIpOm51bWJlciB7XG5cdFx0XHR2YXIgZGVsdGE6bnVtYmVyID0gaW5NYXggLSBpbk1pbjtcblxuXHRcdFx0Ly8gSWYgdGhleSd2ZSBnaXZlbiB1cyBhIHRpbnkgaW5wdXQgcmFuZ2UsIHRoZW4gd2UgY2FuJ3QgcmVhbGx5IHBhcmFtZXRlcml6ZVxuXHRcdFx0Ly8gaW50byB0aGUgcmFuZ2UsIHNvIGxldCdzIGp1c3QgcmV0dXJuIGhhbGZ3YXkgYmV0d2VlbiB0aGUgb3V0cHV0cy5cblx0XHRcdGlmIChNYXRoLmFicyhkZWx0YSkgPCAwLjAwMDAwMSlcblx0XHRcdFx0cmV0dXJuIG91dE1pbiArIChvdXRNYXggLSBvdXRNaW4pICogMC41O1xuXG5cdFx0XHR2YXIgdCA9ICh2YWx1ZSAtIGluTWluKSAvIChpbk1heCAtIGluTWluKTtcblx0XHRcdHJldHVybiBvdXRNaW4gKyAob3V0TWF4IC0gb3V0TWluKSAqIHQ7XG5cdFx0fVxuXG5cdFx0Ly8gUmVtb3ZlIGFsbCBjaGlsZCBlbGVtZW50cyBmcm9tIHRoZSBzcGVjaWZpZWQgZWxlbWVudC5cblx0XHRzdGF0aWMgcmVtb3ZlQWxsQ2hpbGRyZW4oZWxlbWVudDogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRcdHdoaWxlIChlbGVtZW50LmZpcnN0Q2hpbGQpXG5cdFx0XHRcdGVsZW1lbnQucmVtb3ZlQ2hpbGQoZWxlbWVudC5maXJzdENoaWxkKTtcblx0XHR9XG5cblx0XHRzdGF0aWMgcmVtb3ZlRnJvbVBhcmVudChlbGVtZW50OiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdFx0aWYgKGVsZW1lbnQgJiYgZWxlbWVudC5wYXJlbnROb2RlKVxuXHRcdFx0XHRlbGVtZW50LnBhcmVudE5vZGUucmVtb3ZlQ2hpbGQoZWxlbWVudCk7XG5cdFx0fVxuXG5cdFx0Ly8gQ2FsbCB0aGlzIGFueXdoZXJlIGluIHlvdXIgY29kZSB0byB0cmFwIEYxMiBrZXlwcmVzcyB0byBzdG9wIGluIGRlYnVnZ2VyLlxuXHRcdC8vIFRoaXMgaXMgdXNlZnVsIGZvciBsb29raW5nIGF0IERPTSBlbGVtZW50cyBpbiBhIHBvcHVwIHRoYXQgd291bGQgbm9ybWFsbHkgZ28gYXdheSB3aGVuXG5cdFx0Ly8geW91IG1vdmVkIHRoZSBtb3VzZSBhd2F5IGZyb20gaXQuXG5cdFx0c3RhdGljIGVuYWJsZUYxMlRyYXAoKTogdm9pZCB7XG5cdFx0XHQkKHdpbmRvdykua2V5ZG93bihmdW5jdGlvbihlKSB7IGlmIChlLmtleUNvZGUgPT0gMTIzKSBkZWJ1Z2dlcjsgfSk7XG5cdFx0fVxuXG5cdFx0c3RhdGljIHN0YXJ0V2FpdEJhZGdlKHNlbGVjdG9yKTogdm9pZCB7XG5cdFx0XHQkKHNlbGVjdG9yKS5jc3MoXCJjbGFzc1wiLCBcIndhaXRiYWRnZSB3YWl0XCIpO1xuXHRcdH1cblxuXHRcdHN0YXRpYyBzdG9wV2FpdEJhZGdlKHNlbGVjdG9yKTogdm9pZCB7XG5cdFx0XHQkKHNlbGVjdG9yKS5jc3MoXCJjbGFzc1wiLCBcIndhaXRiYWRnZVwiKTtcblx0XHR9XG5cdH1cblxuXG5cdGV4cG9ydCBjbGFzcyBGaWxlRHJvcFpvbmUge1xuXG5cdFx0em9uZTogYW55O1xuXHRcdGNzcmZ0b2tlbjogYW55O1xuXHRcdGVsZW1lbnRfaWQ6IGFueTtcblx0XHR1cmw6IHN0cmluZztcblx0XHRcblx0XHRwcm9jZXNzX29yaWdpbmFsOiBhbnk7XG5cdFx0cHJvY2Vzc19yZXN1bHQ6IGFueTtcblxuICAgICAgICBjb25zdHJ1Y3RvcihlbGVtZW50X2lkLCBwcm9jZXNzX29yaWdpbmFsLCB1cmw6IHN0cmluZywgcHJvY2Vzc19yZXN1bHQsIG11bHRpcGxlKSB7XG5cblx0XHRcdHZhciB6ID0gbmV3IEZpbGVEcm9wKGVsZW1lbnRfaWQsIHt9KTtcdC8vIGZpbGVkcm9wLW1pbi5qcyAsIGh0dHA6Ly9maWxlZHJvcGpzLm9yZ1xuXHRcdFx0dGhpcy56b25lID0gejtcblx0XHRcdHRoaXMuY3NyZnRva2VuID0galF1ZXJ5LmNvb2tpZSgnY3NyZnRva2VuJyk7XG5cdFx0XHRpZiAoISh0eXBlb2YgbXVsdGlwbGUgPT09IFwidW5kZWZpbmVkXCIpKSB7XG5cdFx0XHRcdHoubXVsdGlwbGUobXVsdGlwbGUpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0ei5tdWx0aXBsZShmYWxzZSk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLnByb2Nlc3Nfb3JpZ2luYWwgPSBwcm9jZXNzX29yaWdpbmFsO1xuXHRcdFx0dGhpcy5wcm9jZXNzX3Jlc3VsdCA9IHByb2Nlc3NfcmVzdWx0O1xuXHRcdFx0dGhpcy51cmwgPSB1cmw7XG5cdFx0fVxuXG5cblx0XHQvLyBJZiBwcm9jZXNzX29yaWdpbmFsIGlzIHByb3ZpZGVkLCBpdCB3aWxsIGJlIGNhbGxlZCB3aXRoIHRoZSByYXcgZmlsZSBkYXRhIGZyb20gdGhlIGRyb3Agem9uZS5cblx0XHQvLyBJZiB1cmwgaXMgcHJvdmlkZWQgYW5kIHByb2Nlc3Nfb3JpZ2luYWwgcmV0dXJucyBmYWxzZSAob3Igd2FzIG5vdCBwcm92aWRlZCkgdGhlIGZpbGUgd2lsbCBiZSBzZW50IHRvIHRoZSBnaXZlbiB1cmwuXG5cdFx0Ly8gSWYgcHJvY2Vzc19yZXN1bHQgaXMgcHJvdmlkZWQsIGl0IHdpbGwgYmUgY2FsbGVkIHdpdGggdGhlIHJldHVybmVkIHJlc3VsdCBvZiB0aGUgdXJsIGNhbGwuXG5cdFx0c3RhdGljIGNyZWF0ZShlbGVtZW50X2lkLCBwcm9jZXNzX29yaWdpbmFsLCB1cmwsIHByb2Nlc3NfcmVzdWx0LCBtdWx0aXBsZSk6IHZvaWQge1xuXHRcdFx0dmFyIGggPSBuZXcgRmlsZURyb3Bab25lKGVsZW1lbnRfaWQsIHByb2Nlc3Nfb3JpZ2luYWwsIHVybCwgcHJvY2Vzc19yZXN1bHQsIG11bHRpcGxlKTtcblx0XHRcdGguc2V0dXAoKTtcblx0XHR9XG5cblxuXHRcdHNldHVwKCk6dm9pZCB7XG5cdFx0XHR2YXIgdCA9IHRoaXM7XG5cdFx0XHR0aGlzLnpvbmUuZXZlbnQoJ3NlbmQnLCBmdW5jdGlvbihmaWxlcykge1xuXHRcdFx0XHRmaWxlcy5lYWNoKGZ1bmN0aW9uKGZpbGUpIHtcblx0XHRcdFx0XHRpZiAodHlwZW9mIHQucHJvY2Vzc19vcmlnaW5hbCA9PT0gXCJmdW5jdGlvblwiKSB7XG5cdFx0XHRcdFx0XHRmaWxlLnJlYWQoe1xuXHRcdFx0XHRcdFx0XHQvL3N0YXJ0OiA1LFxuXHRcdFx0XHRcdFx0XHQvL2VuZDogLTEwLFxuXHRcdFx0XHRcdFx0XHQvL2Z1bmM6ICdjcDEyNTEnLFxuXHRcdFx0XHRcdFx0XHRvbkRvbmU6IGZ1bmN0aW9uKHN0cikge1xuXHRcdFx0XHRcdFx0XHRcdHZhciByYXdGaWxlUHJvY2Vzc1N0YXR1cyA9IHQucHJvY2Vzc19vcmlnaW5hbChmaWxlLnR5cGUsIHN0cik7XG5cdFx0XHRcdFx0XHRcdFx0aWYgKCFyYXdGaWxlUHJvY2Vzc1N0YXR1cykge1xuXHRcdFx0XHRcdFx0XHRcdFx0dC5wcm9jZXNzVXJsKGZpbGUpO1xuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0b25FcnJvcjogZnVuY3Rpb24oZSkge1xuXHRcdFx0XHRcdFx0XHRcdGFsZXJ0KCdGYWlsZWQgdG8gcmVhZCB0aGUgZmlsZSEgRXJyb3I6ICcgKyBlLmZkRXJyb3IpXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdGZ1bmM6ICd0ZXh0J1xuXHRcdFx0XHRcdFx0fSlcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0dC5wcm9jZXNzVXJsKGZpbGUpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblx0XHR9XG5cblxuXHRcdHByb2Nlc3NVcmwoZmlsZTphbnkpIHtcblxuXHRcdFx0dmFyIHQgPSB0aGlzO1xuXHRcdFx0aWYgKHR5cGVvZiB0aGlzLnVybCA9PT0gJ3N0cmluZycpIHtcblxuXHRcdFx0XHRmaWxlLmV2ZW50KCdkb25lJywgZnVuY3Rpb24oeGhyKSB7XG5cdFx0XHRcdFx0dmFyIHJlc3VsdCA9IGpRdWVyeS5wYXJzZUpTT04oeGhyLnJlc3BvbnNlVGV4dCk7XG5cdFx0XHRcdFx0aWYgKHJlc3VsdC5weXRob25fZXJyb3IpIHtcblx0XHRcdFx0XHRcdGFsZXJ0KHJlc3VsdC5weXRob25fZXJyb3IpO1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAodHlwZW9mIHQucHJvY2Vzc19yZXN1bHQgPT09IFwiZnVuY3Rpb25cIikge1xuXHRcdFx0XHRcdFx0dC5wcm9jZXNzX3Jlc3VsdChyZXN1bHQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0ZmlsZS5ldmVudCgnZXJyb3InLCBmdW5jdGlvbihlLCB4aHIpIHtcblx0XHRcdFx0XHRhbGVydCgnRXJyb3IgdXBsb2FkaW5nICcgKyB0aGlzLm5hbWUgKyAnOiAnICtcblx0XHRcdFx0XHRcdHhoci5zdGF0dXMgKyAnLCAnICsgeGhyLnN0YXR1c1RleHQpO1xuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHQvLyB0aGlzIGVuc3VyZXMgdGhhdCB0aGUgQ1NSRiBtaWRkbGV3YXJlIGluIERqYW5nbyBkb2Vzbid0IHJlamVjdCBvdXJcblx0XHRcdFx0Ly8gSFRUUCByZXF1ZXN0XG5cdFx0XHRcdGZpbGUuZXZlbnQoJ3hoclNldHVwJywgZnVuY3Rpb24oeGhyKSB7XG5cdFx0XHRcdFx0eGhyLnNldFJlcXVlc3RIZWFkZXIoXCJYLUNTUkZUb2tlblwiLCB0LmNzcmZ0b2tlbik7XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdGZpbGUuc2VuZFRvKHRoaXMudXJsKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXG5cdC8vIFNWRy1yZWxhdGVkIHV0aWxpdGllcy5cblx0ZXhwb3J0IGNsYXNzIFNWRyB7XG5cblx0XHRzdGF0aWMgY3JlYXRlU1ZHKHdpZHRoOmFueSwgaGVpZ2h0OmFueSwgYm94V2lkdGg6bnVtYmVyLCBib3hIZWlnaHQ6bnVtYmVyKTpTVkdFbGVtZW50IHtcblx0XHRcdHZhciBzdmdFbGVtZW50OlNWR0VsZW1lbnQgPSA8U1ZHRWxlbWVudD5kb2N1bWVudC5jcmVhdGVFbGVtZW50TlMoU1ZHLl9uYW1lc3BhY2UsIFwic3ZnXCIpO1xuXHRcdFx0c3ZnRWxlbWVudC5zZXRBdHRyaWJ1dGUoJ3ZlcnNpb24nLCAnMS4yJyk7XG5cdFx0XHRzdmdFbGVtZW50LnNldEF0dHJpYnV0ZSgnd2lkdGgnLCB3aWR0aC50b1N0cmluZygpKTtcblx0XHRcdHN2Z0VsZW1lbnQuc2V0QXR0cmlidXRlKCdoZWlnaHQnLCBoZWlnaHQudG9TdHJpbmcoKSk7XG5cdFx0XHRzdmdFbGVtZW50LnNldEF0dHJpYnV0ZSgndmlld0JveCcsICcwIDAgJyArIGJveFdpZHRoICsgJyAnICsgYm94SGVpZ2h0KTtcblx0XHRcdHN2Z0VsZW1lbnQuc2V0QXR0cmlidXRlKCdwcmVzZXJ2ZUFzcGVjdFJhdGlvJywgJ25vbmUnKTtcblx0XHRcdHJldHVybiBzdmdFbGVtZW50O1xuXHRcdH1cblxuXG5cdFx0Ly8gQ3JlYXRlcyBhIHZlcnRpY2FsIGxpbmUgY2VudGVyZWQgb24gKHhDb29yZCx5Q29vcmQpLlxuXHRcdHN0YXRpYyBjcmVhdGVWZXJ0aWNhbExpbmVQYXRoKHhDb29yZDpudW1iZXIsIHlDb29yZDpudW1iZXIsIGxpbmVXaWR0aDpudW1iZXIsIGxpbmVIZWlnaHQ6bnVtYmVyLCBjb2xvcjpDb2xvciwgc3ZnRWxlbWVudDphbnkpOlNWR0VsZW1lbnQge1xuXHRcdFx0dmFyIGhhbGZXaWR0aDpudW1iZXIgPSBsaW5lV2lkdGggLyAyO1xuXG5cdFx0XHR2YXIgdG9wWTpudW1iZXIgPSBNYXRoLmZsb29yKHlDb29yZCAtIGxpbmVIZWlnaHQvMik7XG5cdFx0XHR2YXIgYm90dG9tWTpudW1iZXIgPSBNYXRoLmZsb29yKHlDb29yZCArIGxpbmVIZWlnaHQvMik7XG5cdFx0XHR2YXIgbWlkWDpudW1iZXIgPSBNYXRoLmZsb29yKHhDb29yZCArIGhhbGZXaWR0aCk7XG5cdFx0XHR2YXIgZWwgPSBTVkcuY3JlYXRlTGluZSggbWlkWCwgdG9wWSwgbWlkWCwgYm90dG9tWSwgY29sb3IsIGxpbmVXaWR0aCk7XG5cdFx0ICAgIC8vJChlbCkuY3NzKCdzdHJva2UtbGluZWNhcCcsICdyb3VuZCcpO1xuXG5cdFx0XHRpZiAoc3ZnRWxlbWVudClcblx0XHQgICAgXHRzdmdFbGVtZW50LmFwcGVuZENoaWxkKGVsKTtcblxuXHRcdCAgICByZXR1cm4gZWw7XG5cdFx0fVxuXG5cblx0XHRzdGF0aWMgY3JlYXRlTGluZSh4MTpudW1iZXIsIHkxOm51bWJlciwgeDI6bnVtYmVyLCB5MjpudW1iZXIsIGNvbG9yPzpDb2xvciwgd2lkdGg/Om51bWJlcik6U1ZHRWxlbWVudCB7XG4gICAgXHRcdHZhciBlbCA9IDxTVkdFbGVtZW50PmRvY3VtZW50LmNyZWF0ZUVsZW1lbnROUyhTVkcuX25hbWVzcGFjZSwgJ2xpbmUnKTtcblx0XHRcdFxuXHRcdFx0ZWwuc2V0QXR0cmlidXRlKCd4MScsIHgxLnRvU3RyaW5nKCkpO1xuXHRcdFx0ZWwuc2V0QXR0cmlidXRlKCd5MScsIHkxLnRvU3RyaW5nKCkpO1xuXHRcdFx0ZWwuc2V0QXR0cmlidXRlKCd4MicsIHgyLnRvU3RyaW5nKCkpO1xuXHRcdFx0ZWwuc2V0QXR0cmlidXRlKCd5MicsIHkyLnRvU3RyaW5nKCkpO1xuXG5cdFx0XHRpZiAoY29sb3IpXG5cdFx0XHRcdCQoZWwpLmNzcygnc3Ryb2tlJywgY29sb3IudG9TdHJpbmcoKSk7XG5cblx0XHRcdGlmICh3aWR0aClcblx0XHRcdFx0JChlbCkuY3NzKCdzdHJva2Utd2lkdGgnLCB3aWR0aC50b1N0cmluZygpKTtcblxuXHRcdCAgICByZXR1cm4gZWw7XG5cdFx0fVxuXG5cblx0XHRzdGF0aWMgY3JlYXRlUmVjdCh4Om51bWJlciwgeTpudW1iZXIsIHdpZHRoOm51bWJlciwgaGVpZ2h0Om51bWJlciwgZmlsbENvbG9yOkNvbG9yLCBzdHJva2VXaWR0aD86bnVtYmVyLCBzdHJva2VDb2xvcj86Q29sb3IsIG9wYWNpdHk/Om51bWJlcik6U1ZHRWxlbWVudCB7XG5cblx0XHRcdC8vIERlZmF1bHQgdmFsdWVzLlxuXHRcdFx0c3Ryb2tlV2lkdGggPSAodHlwZW9mKHN0cm9rZVdpZHRoKSAhPT0gJ3VuZGVmaW5lZCcgPyBzdHJva2VXaWR0aCA6IDApO1xuXG5cdFx0XHRpZiAoIXN0cm9rZUNvbG9yKVxuXHRcdFx0XHRzdHJva2VDb2xvciA9IENvbG9yLmJsYWNrO1xuXG5cdFx0XHRvcGFjaXR5ID0gKHR5cGVvZihvcGFjaXR5KSAhPT0gJ3VuZGVmaW5lZCcgPyBvcGFjaXR5IDogMSk7XG5cbiAgICBcdFx0dmFyIGVsID0gPFNWR0VsZW1lbnQ+ZG9jdW1lbnQuY3JlYXRlRWxlbWVudE5TKFNWRy5fbmFtZXNwYWNlLCAncmVjdCcpO1xuXG4gICAgXHRcdC8vIE1ha2Ugc3VyZSB3aWR0aCBhbmQgaGVpZ2h0IGFyZSBwb3NpdGl2ZS5cbiAgICBcdFx0aWYgKGhlaWdodCA8IDApIHtcbiAgICBcdFx0XHR5ICs9IGhlaWdodDtcbiAgICBcdFx0XHRoZWlnaHQgPSAtaGVpZ2h0O1xuICAgIFx0XHR9XG5cbiAgICBcdFx0aWYgKHdpZHRoIDwgMCkge1xuICAgIFx0XHRcdHggKz0gaGVpZ2h0O1xuICAgIFx0XHRcdHdpZHRoID0gLXdpZHRoO1xuICAgIFx0XHR9XG5cbiAgICBcdFx0ZWwuc2V0QXR0cmlidXRlKCd4JywgeC50b1N0cmluZygpKTtcbiAgICBcdFx0ZWwuc2V0QXR0cmlidXRlKCd5JywgeS50b1N0cmluZygpKTtcbiAgICBcdFx0ZWwuc2V0QXR0cmlidXRlKCd3aWR0aCcsIHdpZHRoLnRvU3RyaW5nKCkpO1xuICAgIFx0XHRlbC5zZXRBdHRyaWJ1dGUoJ2hlaWdodCcsIGhlaWdodC50b1N0cmluZygpKTtcblxuICAgIFx0XHRpZiAodHlwZW9mKHN0cm9rZVdpZHRoKSAhPT0gJ3VuZGVmaW5lZCcpXG4gICAgXHRcdFx0JChlbCkuY3NzKCdzdHJva2Utd2lkdGgnLCBzdHJva2VXaWR0aCk7XG5cbiAgICBcdFx0aWYgKHR5cGVvZihzdHJva2VDb2xvcikgIT09ICd1bmRlZmluZWQnKVxuICAgIFx0XHRcdCQoZWwpLmNzcygnc3Ryb2tlJywgc3Ryb2tlQ29sb3IudG9TdHJpbmcoKSk7XG5cbiAgICBcdFx0aWYgKHR5cGVvZihvcGFjaXR5KSAhPT0gJ3VuZGVmaW5lZCcpXG4gICAgXHRcdFx0JChlbCkuY3NzKCdvcGFjaXR5Jywgb3BhY2l0eSk7XG5cbiAgICBcdFx0aWYgKHR5cGVvZihmaWxsQ29sb3IpICE9PSAndW5kZWZpbmVkJylcbiAgICBcdFx0XHQkKGVsKS5jc3MoJ2ZpbGwnLCBmaWxsQ29sb3IudG9TdHJpbmcoKSk7XG5cbiAgICBcdFx0cmV0dXJuIGVsO1xuXG5cdFx0fVxuXG5cblx0XHRzdGF0aWMgY3JlYXRlVGV4dCh4Om51bWJlciwgeTpudW1iZXIsIHRleHQ6c3RyaW5nLCBmb250TmFtZT86c3RyaW5nLCBmb250U2l6ZT86bnVtYmVyLCBjZW50ZXJlZE9uWD86Ym9vbGVhbiwgY29sb3I/OkNvbG9yKTpTVkdFbGVtZW50IHtcbiAgICBcdFx0dmFyIGVsID0gPFNWR0VsZW1lbnQ+ZG9jdW1lbnQuY3JlYXRlRWxlbWVudE5TKFNWRy5fbmFtZXNwYWNlLCAndGV4dCcpO1xuXG4gICAgXHRcdGVsLnNldEF0dHJpYnV0ZSgneCcsIHgudG9TdHJpbmcoKSk7XG4gICAgXHRcdGVsLnNldEF0dHJpYnV0ZSgneScsIHkudG9TdHJpbmcoKSk7XG5cbiAgICBcdFx0aWYgKGZvbnROYW1lKVxuICAgIFx0XHRcdGVsLnNldEF0dHJpYnV0ZSgnZm9udC1mYW1pbHknLCBmb250TmFtZSk7XG4gICAgXHRcdGVsc2VcbiAgICBcdFx0XHRlbC5zZXRBdHRyaWJ1dGUoJ2ZvbnQtZmFtaWx5JywgXCJWZXJkYW5hXCIpO1xuXG4gICAgXHRcdGlmIChmb250U2l6ZSlcbiAgICBcdFx0XHRlbC5zZXRBdHRyaWJ1dGUoJ2ZvbnQtc2l6ZScsIGZvbnRTaXplLnRvU3RyaW5nKCkpO1xuICAgIFx0XHRlbHNlXG4gICAgXHRcdFx0ZWwuc2V0QXR0cmlidXRlKCdmb250LXNpemUnLCBcIjEyXCIpO1xuXG4gICAgXHRcdGVsLnRleHRDb250ZW50ID0gdGV4dDtcblxuICAgIFx0XHQvLyBDZW50ZXIgb24gWD8/XG4gICAgXHRcdGlmIChjZW50ZXJlZE9uWClcbiAgICBcdFx0XHRlbC5zZXRBdHRyaWJ1dGUoJ3RleHQtYW5jaG9yJywgJ21pZGRsZScpO1xuICAgIFx0XHRlbHNlXG4gICAgXHRcdFx0ZWwuc2V0QXR0cmlidXRlKCd0ZXh0LWFuY2hvcicsICdzdGFydCcpO1xuXG4gICAgXHRcdGlmIChjb2xvcikge1xuICAgIFx0XHRcdCQoZWwpLmNzcygnZmlsbCcsIGNvbG9yLnRvU3RyaW5nKCkpO1xuICAgIFx0XHR9XG5cbiAgICBcdFx0cmV0dXJuIGVsO1xuXHRcdH1cblxuXG5cdFx0Ly8gTW9kaWZ5IGEgcmVjdCBlbGVtZW50IHRvIHJvdW5kIGl0cyBjb3JuZXJzLlxuXHRcdHN0YXRpYyBtYWtlUmVjdFJvdW5kZWQocmVjdCwgcngsIHJ5KSB7XG4gICAgXHRcdHJlY3Quc2V0QXR0cmlidXRlKCdyeCcsIHJ4KTtcbiAgICBcdFx0cmVjdC5zZXRBdHRyaWJ1dGUoJ3J5JywgcnkpO1xuXHRcdH1cblxuXHRcdHByaXZhdGUgc3RhdGljIF9uYW1lc3BhY2U6c3RyaW5nID0gXCJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2Z1wiO1xuXG5cdH1cblxufSAvLyBlbmQgbW9kdWxlIFV0bFxuXG4iXX0=