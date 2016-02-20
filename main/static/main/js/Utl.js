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
        // Convert a size provided in bytes to a nicely formatted string
        JS.sizeToString = function (size, allowBytes) {
            var tb = size / (1024 * 1024 * 1024 * 1024);
            if ((tb > 1) || (tb < -1)) {
                return Utl.JS.nicelyPrintFloat(tb, 2) + ' Tb';
            }
            var gigs = size / (1024 * 1024 * 1024);
            if ((gigs > 1) || (gigs < -1)) {
                return Utl.JS.nicelyPrintFloat(gigs, 2) + ' Gb';
            }
            var megs = size / (1024 * 1024);
            if ((megs > 1) || (megs < -1)) {
                return Utl.JS.nicelyPrintFloat(megs, 2) + ' Mb';
            }
            var k = size / 1024;
            if (((k > 1) || (k < -1)) || !allowBytes) {
                return Utl.JS.nicelyPrintFloat(k, 2) + ' Kb';
            }
            return size + ' b';
        };
        // -1 : Print as a full float
        //  0 : Print as an int, ALWAYS rounded down.
        // +n : Print with n decimal places, UNLESS the value is an integer
        JS.nicelyPrintFloat = function (v, places) {
            // We do not want to display ANY decimal point if the value is an integer.
            if (v % 1 === 0) {
                return (v % 1).toString();
            }
            if (places > 0) {
                return v.toFixed(places);
            }
            else if (places == 0) {
                return (v % 1).toString();
            }
            return v.toString();
        };
        // Given a file name (n) and a file type string (t), try and guess what kind of file we've got.
        JS.guessFileType = function (n, t) {
            // Going in order from most confident to least confident guesses:
            if (t.indexOf('officedocument.spreadsheet') >= 0) {
                return 'excel';
            }
            if (t === 'text/csv') {
                return 'csv';
            }
            if (t === 'text/xml') {
                return 'xml';
            }
            if ((n.indexOf('.xlsx', n.length - 5) !== -1) || (n.indexOf('.xls', n.length - 4) !== -1)) {
                return 'excel';
            }
            if (n.indexOf('.xml', n.length - 4) !== -1) {
                return 'xml';
            }
            // If all else fails, assume it's a csv file.  (So, any extension that's not tried above, or no extension.)
            return 'csv';
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
    // A progress bar with a range from 0 to 100 percent.
    // When given only an id, the class seeks an element in the document and uses that as the progress bar.
    // When given a parent element, the class makes a new <progress> element underneath it with the given id.
    var ProgressBar = (function () {
        function ProgressBar(id, parentElement) {
            var b;
            if (parentElement) {
                b = $('<progress>').appendTo(parentElement)[0];
                b.id = id;
            }
            else {
                b = document.getElementById(id);
            }
            b.innerHTML = '0% complete';
            b.setAttribute('min', '0');
            b.setAttribute('max', '100');
            b.setAttribute('value', '0');
            b.className = 'off';
            this.element = b;
        }
        // Sets the progress bar from 0 to 100 percent, or no value to disable.
        // Also shows the spinny wait icon if the progress bar is set to a value other than 100.
        ProgressBar.prototype.setProgress = function (percentage) {
            var b = this.element;
            if (typeof (percentage) === 'undefined') {
                b.innerHTML = '0% complete';
                b.setAttribute('value', '0');
                b.className = 'off';
            }
            else {
                b.innerHTML = percentage + '% complete';
                b.setAttribute('value', percentage.toString());
                b.className = '';
            }
        };
        return ProgressBar;
    })();
    Utl.ProgressBar = ProgressBar;
    // A class wrapping filedrop-min.js (http://filedropjs.org) and providing some additional structure.
    // It's initialized with a single 'options' object:
    // {
    //	elementId: ID of the element to be set up as a drop zone
    //	fileInitFn: Called when a file has been dropped, but before any processing has started
    //	processRawFn: Called when the file content has been read into a local variable, but before any communication with
    //                the server.
    //	url: The URL to upload the file.
    //	progressBar: A ProgressBar object for tracking the upload progress.
    //	processResponseFn: Called when the server sends back its results.
    // }
    // All callbacks are given a FileDropZoneFileContainer object as their first argument.
    // TODO:
    // * Rewrite this with an option to only accept the first file in a dropped set.
    // * Create a fileContainerGroup object, and a fileContainergGroupIndexCounter, and assign sets of files the same group UID.
    // * Add a 'cleanup' callback that's called after all files in a group have been uploaded.
    var FileDropZone = (function () {
        // If processRawFn is provided, it will be called with the raw file data from the drop zone.
        // If url is provided and processRawFn returns false (or was not provided) the file will be sent to the given url.
        // If processResponseFn is provided, it will be called with the returned result of the url call.
        function FileDropZone(options) {
            this.progressBar = options.progressBar || null;
            // If there's a cleaner way to force-disable event logging in filedrop-min.js, do please put it here!
            window.fd.logging = false;
            var z = new FileDrop(options.elementId, {}); // filedrop-min.js , http://filedropjs.org
            this.zone = z;
            this.csrftoken = jQuery.cookie('csrftoken');
            if (!(typeof options.multiple === "undefined")) {
                z.multiple(options.multiple);
            }
            else {
                z.multiple(false);
            }
            this.fileInitFn = options.fileInitFn;
            this.processRawFn = options.processRawFn;
            this.processResponseFn = options.processResponseFn;
            this.url = options.url;
        }
        // Helper function to create and set up a FileDropZone.
        FileDropZone.create = function (options) {
            var h = new FileDropZone(options);
            h.setup();
        };
        FileDropZone.prototype.setup = function () {
            var t = this;
            this.zone.event('send', function (files) {
                files.each(function (file) {
                    var fileContainer = {
                        file: file,
                        fileType: Utl.JS.guessFileType(file.name, file.type),
                        progressBar: t.progressBar,
                        uniqueIndex: FileDropZone.fileContainerIndexCounter++,
                        stopProcessing: false,
                        skipProcessRaw: null,
                        skipUpload: null,
                        allWorkFinished: false
                    };
                    // callInitFile may set fileContainer's internal stopProcessing flag, or any of the others.
                    // So it's possible for callInitFile to act as a gatekeeper, rejecting the dropped file
                    // and halting any additional processing, or it can decide whether to read and process
                    // this file locally, or upload it to the server, or even both.
                    // Another trick: callInitFile may swap in a custom ProgressBar object just for this file,
                    // so multiple files can have their own separate progress bars, while they are all uploaded
                    // in parallel.
                    t.callInitFile.call(t, fileContainer);
                    if (fileContainer.stopProcessing) {
                        fileContainer.allWorkFinished = true;
                        return;
                    }
                    t.callProcessRaw.call(t, fileContainer);
                });
            });
        };
        // If there is a fileInitFn set, call it with the given FileDropZoneFileContainer.
        FileDropZone.prototype.callInitFile = function (fileContainer) {
            if (typeof this.fileInitFn === "function") {
                this.fileInitFn(fileContainer);
            }
        };
        // If processRawFn is defined, we read the entire file into a variable,
        // then pass that to processRawFn along with the FileDropZoneFileContainer object.
        // FileDropZoneFileContainer's contents might be modofied - specifically, the flags - so we check them afterwards
        // to decide how to proceed.
        FileDropZone.prototype.callProcessRaw = function (fileContainer) {
            var t = this;
            if (typeof this.processRawFn === "function" && !fileContainer.skipProcessRaw) {
                fileContainer.file.read({
                    //start: 5,
                    //end: -10,
                    //func: 'cp1251',
                    onDone: function (str) {
                        t.processRawFn(fileContainer, str);
                        if (!fileContainer.stopProcessing && !fileContainer.skipUpload) {
                            t.uploadFile.call(t, fileContainer);
                        }
                        else {
                            fileContainer.allWorkFinished = true;
                        }
                    },
                    onError: function (e) {
                        alert('Failed to read the file! Error: ' + e.fdError);
                    },
                    func: 'text'
                });
            }
            else if (!fileContainer.skipUpload) {
                this.uploadFile(fileContainer);
            }
        };
        FileDropZone.prototype.uploadFile = function (fileContainer) {
            var t = this;
            var f = fileContainer.file;
            // If no url has been defined, we have to stop here.
            if (typeof this.url !== 'string') {
                fileContainer.allWorkFinished = true;
                return;
            }
            // From this point on we assume we're uploading the file,
            // so we set up the progressBar and callback events before triggering the call to upload.
            f.event('done', function (xhr) {
                var result = jQuery.parseJSON(xhr.responseText);
                if (result.python_error) {
                    alert(result.python_error); // TODO: This is a bit extreme. Might want to just pass it to the callback.
                }
                else if (typeof t.processResponseFn === "function") {
                    t.processResponseFn(fileContainer, result);
                }
                fileContainer.allWorkFinished = true;
            });
            f.event('error', function (e, xhr) {
                // TODO: Again, heavy handed. Might want to just embed this in FileDropZoneFileContainer
                // and make an error handler callback.
                alert('Error uploading ' + f.name + ': ' + xhr.status + ', ' + xhr.statusText);
                fileContainer.allWorkFinished = true;
            });
            f.event('xhrSetup', function (xhr) {
                // This ensures that the CSRF middleware in Django doesn't reject our HTTP request.
                xhr.setRequestHeader("X-CSRFToken", t.csrftoken);
                // We want to pass along our own guess at the file type, since it's based on a more specific set of criteria.
                xhr.setRequestHeader('X-EDD-File-Type', fileContainer.fileType);
            });
            f.event('sendXHR', function () {
                if (fileContainer.progressBar) {
                    fileContainer.progressBar.setProgress(0);
                }
            });
            // Update progress when browser reports it:
            f.event('progress', function (current, total) {
                if (fileContainer.progressBar) {
                    var width = current / total * 100;
                    fileContainer.progressBar.setProgress(width);
                }
            });
            f.sendTo(this.url);
        };
        FileDropZone.fileContainerIndexCounter = 0;
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiVXRsLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiVXRsLnRzIl0sIm5hbWVzIjpbIlV0bCIsIlV0bC5FREQiLCJVdGwuRURELmNvbnN0cnVjdG9yIiwiVXRsLkVERC5yZXNvbHZlTWVhc3VyZW1lbnRSZWNvcmRUb05hbWUiLCJVdGwuRURELnJlc29sdmVNZWFzdXJlbWVudFJlY29yZFRvVW5pdHMiLCJVdGwuUXRpcEhlbHBlciIsIlV0bC5RdGlwSGVscGVyLmNvbnN0cnVjdG9yIiwiVXRsLlF0aXBIZWxwZXIuY3JlYXRlIiwiVXRsLlF0aXBIZWxwZXIuX2dlbmVyYXRlQ29udGVudCIsIlV0bC5RdGlwSGVscGVyLl9nZXRRVGlwRWxlbWVudCIsIlV0bC5Db2xvciIsIlV0bC5Db2xvci5jb25zdHJ1Y3RvciIsIlV0bC5Db2xvci5yZ2JhIiwiVXRsLkNvbG9yLnJnYiIsIlV0bC5Db2xvci5pbnRlcnBvbGF0ZSIsIlV0bC5Db2xvci50b1N0cmluZyIsIlV0bC5UYWJsZSIsIlV0bC5UYWJsZS5jb25zdHJ1Y3RvciIsIlV0bC5UYWJsZS5hZGRSb3ciLCJVdGwuVGFibGUuYWRkQ29sdW1uIiwiVXRsLlRhYmxlLmFkZFRhYmxlVG8iLCJVdGwuSlMiLCJVdGwuSlMuY29uc3RydWN0b3IiLCJVdGwuSlMuY3JlYXRlRWxlbWVudEZyb21TdHJpbmciLCJVdGwuSlMuYXNzZXJ0IiwiVXRsLkpTLmNvbnZlcnRIYXNoVG9MaXN0IiwiVXRsLkpTLnBhZFN0cmluZ0xlZnQiLCJVdGwuSlMucGFkU3RyaW5nUmlnaHQiLCJVdGwuSlMucmVwZWF0U3RyaW5nIiwiVXRsLkpTLnNpemVUb1N0cmluZyIsIlV0bC5KUy5uaWNlbHlQcmludEZsb2F0IiwiVXRsLkpTLmd1ZXNzRmlsZVR5cGUiLCJVdGwuSlMudGltZXN0YW1wVG9Ub2RheVN0cmluZyIsIlV0bC5KUy51dGNUb1RvZGF5U3RyaW5nIiwiVXRsLkpTLnJlbWFwVmFsdWUiLCJVdGwuSlMucmVtb3ZlQWxsQ2hpbGRyZW4iLCJVdGwuSlMucmVtb3ZlRnJvbVBhcmVudCIsIlV0bC5KUy5lbmFibGVGMTJUcmFwIiwiVXRsLkpTLnN0YXJ0V2FpdEJhZGdlIiwiVXRsLkpTLnN0b3BXYWl0QmFkZ2UiLCJVdGwuUHJvZ3Jlc3NCYXIiLCJVdGwuUHJvZ3Jlc3NCYXIuY29uc3RydWN0b3IiLCJVdGwuUHJvZ3Jlc3NCYXIuc2V0UHJvZ3Jlc3MiLCJVdGwuRmlsZURyb3Bab25lIiwiVXRsLkZpbGVEcm9wWm9uZS5jb25zdHJ1Y3RvciIsIlV0bC5GaWxlRHJvcFpvbmUuY3JlYXRlIiwiVXRsLkZpbGVEcm9wWm9uZS5zZXR1cCIsIlV0bC5GaWxlRHJvcFpvbmUuY2FsbEluaXRGaWxlIiwiVXRsLkZpbGVEcm9wWm9uZS5jYWxsUHJvY2Vzc1JhdyIsIlV0bC5GaWxlRHJvcFpvbmUudXBsb2FkRmlsZSIsIlV0bC5TVkciLCJVdGwuU1ZHLmNvbnN0cnVjdG9yIiwiVXRsLlNWRy5jcmVhdGVTVkciLCJVdGwuU1ZHLmNyZWF0ZVZlcnRpY2FsTGluZVBhdGgiLCJVdGwuU1ZHLmNyZWF0ZUxpbmUiLCJVdGwuU1ZHLmNyZWF0ZVJlY3QiLCJVdGwuU1ZHLmNyZWF0ZVRleHQiLCJVdGwuU1ZHLm1ha2VSZWN0Um91bmRlZCJdLCJtYXBwaW5ncyI6IkFBQUEscURBQXFEO0FBR3JELG1FQUFtRTtBQUVuRSxJQUFPLEdBQUcsQ0FreUJUO0FBbHlCRCxXQUFPLEdBQUcsRUFBQyxDQUFDO0lBRVhBO1FBQUFDO1FBNkNBQyxDQUFDQTtRQTNDT0Qsa0NBQThCQSxHQUFyQ0EsVUFBc0NBLGlCQUF3Q0E7WUFFN0VFLElBQUlBLEtBQUtBLEdBQUdBLEVBQUVBLENBQUNBO1lBQ2ZBLHFFQUFxRUE7WUFDckVBLElBQUlBLEdBQUdBLEdBQUdBLGlCQUFpQkEsQ0FBQ0EsR0FBR0EsQ0FBQ0E7WUFDaENBLEVBQUVBLENBQUNBLENBQUNBLEdBQUdBLElBQUlBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO2dCQUNkQSxJQUFJQSxRQUFRQSxHQUFHQSxFQUFFQSxDQUFDQTtnQkFDbEJB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QUVBLFFBQWVBO1lBQzlDTyxJQUFJQSxHQUFHQSxHQUFVQSxFQUFFQSxDQUFDQTtZQUNwQkEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBUUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsR0FBR0EsUUFBUUEsRUFBRUEsQ0FBQ0EsRUFBRUE7Z0JBQ3JDQSxHQUFHQSxJQUFJQSxHQUFHQSxDQUFDQTtZQUVaQSxNQUFNQSxDQUFDQSxHQUFHQSxDQUFDQTtRQUNaQSxDQUFDQTtRQUdEUCxnRUFBZ0VBO1FBQ3pEQSxlQUFZQSxHQUFuQkEsVUFBb0JBLElBQVdBLEVBQUVBLFVBQW1CQTtZQUVuRFEsSUFBSUEsRUFBRUEsR0FBR0EsSUFBSUEsR0FBR0EsQ0FBQ0EsSUFBSUEsR0FBR0EsSUFBSUEsR0FBR0EsSUFBSUEsR0FBR0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDNUNBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLEVBQUVBLEdBQUdBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLEVBQUVBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO2dCQUMzQkEsTUFBTUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsZ0JBQWdCQSxDQUFDQSxFQUFFQSxFQUFFQSxDQUFDQSxDQUFDQSxHQUFHQSxLQUFLQSxDQUFDQTtZQUMvQ0EsQ0FBQ0E7WUFDREEsSUFBSUEsSUFBSUEsR0FBR0EsSUFBSUEsR0FBR0EsQ0FBQ0EsSUFBSUEsR0FBR0EsSUFBSUEsR0FBR0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDdkNBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLElBQUlBLEdBQUdBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLElBQUlBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO2dCQUMvQkEsTUFBTUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsZ0JBQWdCQSxDQUFDQSxJQUFJQSxFQUFFQSxDQUFDQSxDQUFDQSxHQUFHQSxLQUFLQSxDQUFDQTtZQUNqREEsQ0FBQ0E7WUFDREEsSUFBSUEsSUFBSUEsR0FBR0EsSUFBSUEsR0FBR0EsQ0FBQ0EsSUFBSUEsR0FBR0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDaENBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLElBQUlBLEdBQUdBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLElBQUlBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO2dCQUMvQkEsTUFBTUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsZ0JBQWdCQSxDQUFDQSxJQUFJQSxFQUFFQSxDQUFDQSxDQUFDQSxHQUFHQSxLQUFLQSxDQUFDQTtZQUNqREEsQ0FBQ0E7WUFDREEsSUFBSUEsQ0FBQ0EsR0FBR0EsSUFBSUEsR0FBR0EsSUFBSUEsQ0FBQ0E7WUFDcEJBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLFVBQVVBLENBQUNBLENBQUNBLENBQUNBO2dCQUMxQ0EsTUFBTUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsZ0JBQWdCQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxHQUFHQSxLQUFLQSxDQUFDQTtZQUM5Q0EsQ0FBQ0E7WUFDREEsTUFBTUEsQ0FBQ0EsSUFBSUEsR0FBR0EsSUFBSUEsQ0FBQ0E7UUFDcEJBLENBQUNBO1FBR0RSLDZCQUE2QkE7UUFDN0JBLDZDQUE2Q0E7UUFDN0NBLG1FQUFtRUE7UUFDNURBLG1CQUFnQkEsR0FBdkJBLFVBQXdCQSxDQUFRQSxFQUFFQSxNQUFhQTtZQUM5Q1MsMEVBQTBFQTtZQUMxRUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ2pCQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxD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QTtnQkFDREEsT0FBT0EsR0FBR0EsR0FBR0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsR0FBR0EsR0FBR0EsSUFBSUEsR0FBR0EsUUFBUUEsQ0FBQ0E7WUFDNUNBLENBQUNBO1lBRURBLElBQUlBLFFBQVFBLEdBQUdBLElBQUlBLENBQUNBO1lBQ3BCQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxHQUFHQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFBQUEsUUFBUUEsR0FBR0EsSUFBSUEsQ0FBQ0E7WUFBQUEsQ0FBQ0E7WUFDakNBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLEdBQUdBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO2dCQUFBQSxJQUFJQSxJQUFJQSxFQUFFQSxDQUFDQTtZQUFBQSxDQUFDQTtZQUM1QkEsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQUFBLElBQUlBLEdBQUdBLEVBQUVBLENBQUNBO1lBQUFBLENBQUNBO1lBQ2hDQSxFQUFFQSxDQUFDQSxDQUFDQSxHQUFHQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFBQUEsR0FBR0EsR0FBR0EsR0FBR0EsR0FBQ0EsR0FBR0EsQ0FBQ0E7WUFBQUEsQ0FBQ0E7WUFFN0JBLE1BQU1BLENBQUNBLE9BQU9BLEdBQUdBLElBQUlBLEdBQUdBLElBQUlBLEdBQUdBLEdBQUdBLEdBQUdBLEdBQUdBLEdBQUdBLFFBQVFBLENBQUNBO1FBQ3JEQSxDQUFDQTtRQUdZWCxtQkFBZ0JBLEdBQXZCQSxVQUF3QkEsR0FBVUE7WUFDOUJZLElBQUlBLENBQU9BLENBQUNBO1lBQ1pBLElBQUlBLFNBQWdCQSxDQUFDQTtZQUNyQkEsQ0FBQ0EsR0FBR0EsaUVBQWlFQSxDQUFDQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtZQUNoRkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ0pBLENBQUNBLENBQUNBLEtBQUtB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VUFBVUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsUUFBUUEsRUFBRUEsTUFBTUEsQ0FBQ0EsUUFBUUEsRUFBRUEsQ0FBQ0EsQ0FBQ0E7WUFDckRBLFVBQVVBLENBQUNBLFlBQVlBLENBQUNBLFNBQVNBLEVBQUVBLE1BQU1BLEdBQUdBLFFBQVFBLEdBQUdBLEdBQUdBLEdBQUdBLFNBQVNBLENBQUNBLENBQUNBO1lBQ3hFQSxVQUFVQSxDQUFDQSxZQUFZQSxDQUFDQSxxQkFBcUJBLEVBQUVBLE1BQU1BLENBQUNBLENBQUNBO1lBQ3ZEQSxNQUFNQSxDQUFDQSxVQUFVQSxDQUFDQTtRQUNuQkEsQ0FBQ0E7UUFHREYsdURBQXVEQTtRQUNoREEsMEJBQXNCQSxHQUE3QkEsVUFBOEJBLE1BQWFBLEVBQUVBLE1BQWFBLEVBQUVBLFNBQWdCQSxFQUFFQSxVQUFpQkEsRUFBRUEsS0FBV0EsRUFBRUEsVUFBY0E7WUFDM0hHLElBQUlBLFNBQVNBLEdBQVVBLFNBQVNBLEdBQUdBLENBQUNBLENBQUNBO1lBRXJDQSxJQUFJQSxJQUFJQSxHQUFVQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxHQUFHQSxVQUFVQSxHQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNwREEsSUFBSUEsT0FBT0EsR0FBVUEsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsR0FBR0EsVUFBVUEsR0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDdkRBLElBQUlBLElBQUlBLEdBQVVBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLEdBQUdBLFNBQVNBLENBQUNBLENBQUNBO1lBQ2pEQSxJQUFJQSxFQUFFQSxHQUFHQSxHQUFHQSxDQUFDQSxVQUFVQSxDQUFFQSxJQUFJQSxFQUFFQSxJQUFJQSxFQUFFQSxJQUFJQSxFQUFFQSxPQUFPQSxFQUFFQSxLQUFLQSxFQUFFQSxTQUFTQSxDQUFDQSxDQUFDQTtZQUNuRUEsdUNBQXVDQTtZQUUxQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsVUFBVUEsQ0FBQ0E7Z0JBQ1hBLFVBQVVBLENBQUNBLFdBQVdBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBO1lBRTVCQSxNQUFNQSxDQUFDQSxFQUFFQSxDQUFDQTtRQUNkQSxDQUFDQTtRQUdNSCxjQUFVQSxHQUFqQkEsVUFBa0JBLEVBQVNBLEVBQUVBLEVBQVNBLEVBQUVBLEVBQVNBLEVBQUVBLEVBQVNBLEVBQUVBLEtBQVlBLEVBQUVBLEtBQWFBO1lBQ3JGSSxJQUFJQSxFQUFFQSxHQUFlQSxRQUFRQSxDQUFDQSxlQUFlQSxDQUFDQSxHQUFHQSxDQUFDQSxVQUFVQSxFQUFFQSxNQUFNQSxDQUFDQSxDQUFDQTtZQUV6RUEsRUFBRUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsSUFBSUEsRUFBRUEsRUFBRUEsQ0FBQ0EsUUFBUUEsRUFBRUEsQ0FBQ0EsQ0FBQ0E7WUFDckNBLEVBQUVBLENBQUNBLFlBQVlBLENBQUNBLElBQUlBLEVBQUVBLEVBQUVBLENBQUNBLFFBQVFBLEVBQUVBLENBQUNBLENBQUNBO1lBQ3JDQSxFQUFFQSxDQUFDQSxZQUFZQSxDQUFDQSxJQUFJQSxFQUFFQSxFQUFFQSxDQUFDQSxRQUFRQSxFQUFFQSxDQUFDQSxDQUFDQTtZQUNyQ0EsRUFBRUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsSUFBSUEsRUFBRUEsRUFBRUEsQ0FBQ0EsUUFBUUEsRUFBRUEsQ0FBQ0EsQ0FBQ0E7WUFFckNBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBO2dCQUNUQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxRQUFRQSxFQUFFQSxLQUFLQSxDQUFDQSxRQUFRQSxFQUFFQSxDQUFDQSxDQUFDQTtZQUV2Q0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0E7Z0JBQ1RBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLGNBQWNBLEVBQUVBLEtBQUtBLENBQUNBLFFBQVFBLEVBQUVBLENBQUNBLENBQUNBO1lBRTFDQSxNQUFNQSxDQUFDQSxFQUFFQSxDQUFDQTtRQUNkQSxDQUFDQTtRQUdNSixjQUFVQSxHQUFqQkEsVUFB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Q0FBQ0EsQ0FBQ0E7WUFFekNBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBO2dCQUNYQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxNQUFNQSxFQUFFQSxLQUFLQSxDQUFDQSxRQUFRQSxFQUFFQSxDQUFDQSxDQUFDQTtZQUNyQ0EsQ0FBQ0E7WUFFREEsTUFBTUEsQ0FBQ0EsRUFBRUEsQ0FBQ0E7UUFDZEEsQ0FBQ0E7UUFHRE4sOENBQThDQTtRQUN2Q0EsbUJBQWVBLEdBQXRCQSxVQUF1QkEsSUFBSUEsRUFBRUEsRUFBRUEsRUFBRUEsRUFBRUE7WUFDL0JPLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLElBQUlBLEVBQUVBLEVBQUVBLENBQUNBLENBQUNBO1lBQzVCQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxJQUFJQSxFQUFFQSxFQUFFQSxDQUFDQSxDQUFDQTtRQUNoQ0EsQ0FBQ0E7UUFFY1AsY0FBVUEsR0FBVUEsNEJBQTRCQSxDQUFDQTtRQUVqRUEsVUFBQ0E7SUFBREEsQ0FBQ0EsQUFySURsRCxJQXFJQ0E7SUFySVlBLE9BQUdBLE1BcUlmQSxDQUFBQTtBQUVGQSxDQUFDQSxFQWx5Qk0sR0FBRyxLQUFILEdBQUcsUUFreUJULENBQUMsaUJBQWlCIiwic291cmNlc0NvbnRlbnQiOlsiLy8vIDxyZWZlcmVuY2UgcGF0aD1cInR5cGVzY3JpcHQtZGVjbGFyYXRpb25zLmQudHNcIiAvPlxuXG5cbi8vIFRoaXMgZmlsZSBjb250YWlucyB2YXJpb3VzIHV0aWxpdHkgY2xhc3NlcyB1bmRlciB0aGUgVXRsIG1vZHVsZS5cblxubW9kdWxlIFV0bCB7XG5cblx0ZXhwb3J0IGNsYXNzIEVERCB7XG5cblx0XHRzdGF0aWMgcmVzb2x2ZU1lYXN1cmVtZW50UmVjb3JkVG9OYW1lKG1lYXN1cmVtZW50UmVjb3JkOkFzc2F5TWVhc3VyZW1lbnRSZWNvcmQpOnN0cmluZyB7XG5cblx0XHRcdHZhciBtTmFtZSA9ICcnO1xuXHRcdFx0Ly8gV2UgZmlndXJlIG91dCB0aGUgbmFtZSBhbmQgdW5pdHMgZGlmZmVyZW50bHkgYmFzZWQgb24gdGhlIHN1YnR5cGUuXG5cdFx0XHR2YXIgbXN0ID0gbWVhc3VyZW1lbnRSZWNvcmQubXN0O1xuXHRcdFx0aWYgKG1zdCA9PSAxKSB7XHQvLyBNZXRhYm9saXRlIHR5cGUuICBNYWdpYyBudW1iZXJzLiAgRVchICBUT0RPOiBFZWVldyFcblx0XHRcdFx0dmFyIGNvbXBOYW1lID0gJyc7XG5cdFx0XHRcdHZhciBjb21wSUQgPSBtZWFzdXJlbWVudFJlY29yZC5tcTtcblx0XHRcdFx0aWYgKGNvbXBJRCkge1xuXHRcdFx0XHRcdHZhciBjUmVjb3JkID0gRURERGF0YS5NZWFzdXJlbWVudFR5cGVDb21wYXJ0bWVudHNbY29tcElEXTtcblx0XHRcdFx0XHRpZiAoY1JlY29yZCkge1xuXHRcdFx0XHRcdFx0Y29tcE5hbWUgPSBjUmVjb3JkLnNuICsgJyAnO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuICAgICAgICAgICAgXHR2YXIgbVJlY29yZCA9IEVERERhdGEuTWV0YWJvbGl0ZVR5cGVzW21lYXN1cmVtZW50UmVjb3JkLm10XTtcbiAgICAgICAgICAgIFx0bU5hbWUgPSBjb21wTmFtZSArIG1SZWNvcmQubmFtZTtcblx0XHQgICAgfSBlbHNlIGlmIChtc3QgPT0gMikge1x0Ly8gR2VuZSB0eXBlLiAgRVdXIEVXV1xuICAgICAgICAgICAgXHRtTmFtZSA9IEVERERhdGEuR2VuZVR5cGVzW21lYXN1cmVtZW50UmVjb3JkLm10XS5uYW1lO1xuXHRcdCAgICB9IGVsc2UgaWYgKG1zdCA9PSAzKSB7XHQvLyBQcm90ZWluIHR5cGUuICBFV1cgRVdXXG4gICAgICAgICAgICBcdG1OYW1lID0gRURERGF0YS5Qcm90ZWluVHlwZXNbbWVhc3VyZW1lbnRSZWNvcmQubXRdLm5hbWU7XG5cdFx0ICAgIH1cblx0XHQgICAgcmV0dXJuIG1OYW1lO1xuXHRcdH1cblxuXG5cdFx0c3RhdGljIHJlc29sdmVNZWFzdXJlbWVudFJlY29yZFRvVW5pdHMobWVhc3VyZW1lbnRSZWNvcmQ6QXNzYXlNZWFzdXJlbWVudFJlY29yZCk6c3RyaW5nIHtcblxuXHRcdFx0dmFyIG1Vbml0cyA9ICcnO1xuXHRcdFx0dmFyIG1zdCA9IG1lYXN1cmVtZW50UmVjb3JkLm1zdDtcblx0XHRcdGlmIChtc3QgPT0gMSkge1x0XHQvLyBUT0RPOiBodHRwczovL3d3dy55b3V0dWJlLmNvbS93YXRjaD92PUpsdEVYcGJHTThzXG4gICAgICAgICAgICBcdGlmIChtZWFzdXJlbWVudFJlY29yZC51aWQpIHtcblx0ICAgICAgICAgICAgXHR2YXIgdVJlY29yZCA9IEVERERhdGEuVW5pdFR5cGVzW21lYXN1cmVtZW50UmVjb3JkLnVpZF07XG5cdCAgICAgICAgICAgIFx0aWYgKHVSZWNvcmQpIHtcblx0ICAgICAgICAgICAgXHRcdG1Vbml0cyA9IHVSZWNvcmQubmFtZTtcblx0ICAgICAgICAgICAgXHR9XG5cdFx0ICAgICAgICB9XG5cdFx0ICAgIH0gZWxzZSBpZiAobXN0ID09IDIpIHtcbiAgICAgICAgICAgIFx0bVVuaXRzID0gJyc7XHQvLyBVbml0cyBmb3IgUHJvdGVvbWljcz8gIEFueW9uZT9cblx0XHQgICAgfSBlbHNlIGlmIChtc3QgPT0gMykge1xuICAgICAgICAgICAgXHRtVW5pdHMgPSAnUlBLTSc7XG5cdFx0ICAgIH1cblx0XHQgICAgcmV0dXJuIG1Vbml0cztcblx0XHR9XG5cdH1cblxuXG5cdGV4cG9ydCBjbGFzcyBRdGlwSGVscGVyIHtcblx0XHRwdWJsaWMgY3JlYXRlKGxpbmtFbGVtZW50LCBjb250ZW50RnVuY3Rpb24sIHBhcmFtczphbnkpOnZvaWQge1xuXG5cdFx0XHRwYXJhbXMucG9zaXRpb24udGFyZ2V0ID0gJChsaW5rRWxlbWVudCk7XG5cdFx0XHRwYXJhbXMucG9zaXRpb24udmlld3BvcnQgPSAkKHdpbmRvdyk7XHQvLyBUaGlzIG1ha2VzIGl0IHBvc2l0aW9uIGl0c2VsZiB0byBmaXQgaW5zaWRlIHRoZSBicm93c2VyIHdpbmRvdy5cblxuXHRcdFx0dGhpcy5fY29udGVudEZ1bmN0aW9uID0gY29udGVudEZ1bmN0aW9uO1xuXG5cdFx0XHRpZiAoIXBhcmFtcy5jb250ZW50KVxuXHRcdFx0XHRwYXJhbXMuY29udGVudCA9IHt9O1xuXG5cdFx0XHRwYXJhbXMuY29udGVudC50ZXh0ID0gdGhpcy5fZ2VuZXJhdGVDb250ZW50LmJpbmQodGhpcyk7XG5cdFx0XHR0aGlzLnF0aXAgPSAkKGxpbmtFbGVtZW50KS5xdGlwKHBhcmFtcyk7XG5cdFx0fVxuXG5cdFx0cHJpdmF0ZSBfZ2VuZXJhdGVDb250ZW50KCk6YW55IHtcblx0XHRcdC8vIEl0J3MgaW5jcmVkaWJseSBzdHVwaWQgdGhhdCB3ZSBoYXZlIHRvIGRvIHRoaXMgdG8gd29yayBhcm91bmQgcXRpcDIncyAyODBweCBtYXgtd2lkdGggZGVmYXVsdC5cblx0XHRcdC8vIFdlIGhhdmUgdG8gZG8gaXQgaGVyZSByYXRoZXIgdGhhbiBpbW1lZGlhdGVseSBhZnRlciBjYWxsaW5nIHF0aXAoKSBiZWNhdXNlIHF0aXAgd2FpdHMgdG8gY3JlYXRlXG5cdFx0XHQvLyB0aGUgYWN0dWFsIGVsZW1lbnQuXG5cdFx0XHR2YXIgcSA9IHRoaXMuX2dldFFUaXBFbGVtZW50KCk7XG5cdFx0XHQkKHEpLmNzcygnbWF4LXdpZHRoJywgJ25vbmUnKTtcblx0XHRcdCQocSkuY3NzKCd3aWR0aCcsICdhdXRvJyk7XG5cblx0XHRcdHJldHVybiB0aGlzLl9jb250ZW50RnVuY3Rpb24oKTtcblx0XHR9XG5cblx0XHQvLyBHZXQgdGhlIEhUTUwgZWxlbWVudCBmb3IgdGhlIHF0aXAuIFVzdWFsbHkgd2UgdXNlIHRoaXMgdG8gdW5zZXQgbWF4LXdpZHRoLlxuXHRcdHByaXZhdGUgX2dldFFUaXBFbGVtZW50KCk6SFRNTEVsZW1lbnQge1xuXHRcdFx0cmV0dXJuIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKHRoaXMucXRpcC5hdHRyKCdhcmlhLWRlc2NyaWJlZGJ5JykpO1xuXHRcdH1cblxuXHRcdHB1YmxpYyBxdGlwOmFueTtcblx0XHRwcml2YXRlIF9jb250ZW50RnVuY3Rpb246YW55O1xuXHR9XG5cblxuXHQvLyBSR0JBIGhlbHBlciBjbGFzcy5cblx0Ly8gVmFsdWVzIGFyZSAwLTI1NSAoYWx0aG91Z2ggdG9TdHJpbmcoKSBtYWtlcyBhbHBoYSAwLTEgc2luY2UgdGhhdCdzIGhvdyBDU1MgbGlrZXMgaXQpLlxuXHRleHBvcnQgY2xhc3MgQ29sb3Ige1xuXG5cdFx0cjogbnVtYmVyO1xuXHRcdGc6IG51bWJlcjtcblx0XHRiOiBudW1iZXI7XG5cdFx0YTogbnVtYmVyO1xuXG5cdFx0Ly8gTm90ZTogQWxsIHZhbHVlcyBhcmUgMC0yNTUsIGJ1dCB0b1N0cmluZygpIHdpbGwgY29udmVydCBhbHBoYSB0byBhIDAtMSB2YWx1ZVxuXHRcdHN0YXRpYyByZ2JhKHI6bnVtYmVyLCBnOm51bWJlciwgYjpudW1iZXIsIGFscGhhOm51bWJlcikgOiBDb2xvciB7XG5cdFx0XHR2YXIgY2xyOkNvbG9yID0gbmV3IENvbG9yKCk7XG5cdFx0XHRjbHIuciA9IHI7XG5cdFx0XHRjbHIuZyA9IGc7XG5cdFx0XHRjbHIuYiA9IGI7XG5cdFx0XHRjbHIuYSA9IGFscGhhO1xuXHRcdFx0cmV0dXJuIGNscjtcblx0XHR9XG5cblx0XHQvLyBOb3RlOiBBbGwgdmFsdWVzIGFyZSAwLTI1NSwgYnV0IHRvU3RyaW5nKCkgd2lsbCBjb252ZXJ0IGFscGhhIHRvIGEgMC0xIHZhbHVlXG5cdFx0c3RhdGljIHJnYihyOm51bWJlciwgZzpudW1iZXIsIGI6bnVtYmVyKSA6IENvbG9yIHtcblx0XHRcdHZhciBjbHI6Q29sb3IgPSBuZXcgQ29sb3IoKTtcblx0XHRcdGNsci5yID0gcjtcblx0XHRcdGNsci5nID0gZztcblx0XHRcdGNsci5iID0gYjtcblx0XHRcdGNsci5hID0gMjU1O1xuXHRcdFx0cmV0dXJuIGNscjtcblx0XHR9XG5cblx0XHRzdGF0aWMgaW50ZXJwb2xhdGUoY2xyMTpDb2xvciwgY2xyMjpDb2xvciwgdDpudW1iZXIpIDogQ29sb3Ige1xuXHRcdFx0cmV0dXJuIENvbG9yLnJnYmEoXG5cdFx0XHRcdGNscjEuciArIChjbHIyLnIgLSBjbHIxLnIpICogdCwgXG5cdFx0XHRcdGNscjEuZyArIChjbHIyLmcgLSBjbHIxLmcpICogdCwgXG5cdFx0XHRcdGNscjEuYiArIChjbHIyLmIgLSBjbHIxLmIpICogdCwgXG5cdFx0XHRcdGNscjEuYSArIChjbHIyLmEgLSBjbHIxLmEpICogdFxuXHRcdFx0KTtcblx0XHR9XG5cblx0XHRzdGF0aWMgdG9TdHJpbmcoY2xyOmFueSkgOiBzdHJpbmcge1xuXHRcdFx0Ly8gSWYgaXQncyBzb21ldGhpbmcgZWxzZSAobGlrZSBhIHN0cmluZykgYWxyZWFkeSwganVzdCByZXR1cm4gdGhhdCB2YWx1ZS5cblx0XHRcdGlmICh0eXBlb2YgY2xyID09ICdzdHJpbmcnKVxuXHRcdFx0XHRyZXR1cm4gY2xyO1xuXG5cdFx0XHRyZXR1cm4gJ3JnYmEoJyArIE1hdGguZmxvb3IoY2xyLnIpICsgJywgJyArIE1hdGguZmxvb3IoY2xyLmcpICsgJywgJyArIE1hdGguZmxvb3IoY2xyLmIpICsgJywgJyArIGNsci5hLzI1NSArICcpJztcblx0XHR9XG5cblx0XHR0b1N0cmluZygpIDogc3RyaW5nIHtcblx0XHRcdHJldHVybiAncmdiYSgnICsgTWF0aC5mbG9vcih0aGlzLnIpICsgJywgJyArIE1hdGguZmxvb3IodGhpcy5nKSArICcsICcgKyBNYXRoLmZsb29yKHRoaXMuYikgKyAnLCAnICsgdGhpcy5hLzI1NSArICcpJztcblx0XHR9XG5cblx0XHRzdGF0aWMgcmVkID0gQ29sb3IucmdiKDI1NSwwLDApO1xuXHRcdHN0YXRpYyBncmVlbiA9IENvbG9yLnJnYigwLDI1NSwwKTtcblx0XHRzdGF0aWMgYmx1ZSA9IENvbG9yLnJnYigwLDAsMjU1KTtcblx0XHRzdGF0aWMgYmxhY2sgPSBDb2xvci5yZ2IoMCwwLDApO1xuXHRcdHN0YXRpYyB3aGl0ZSA9IENvbG9yLnJnYigyNTUsMjU1LDI1NSk7XG5cblx0fTtcblxuXG5cdGV4cG9ydCBjbGFzcyBUYWJsZSB7XG5cblx0XHRjb25zdHJ1Y3Rvcih0YWJsZUlEOnN0cmluZywgd2lkdGg/Om51bWJlciwgaGVpZ2h0PzpudW1iZXIpIHtcblx0XHRcdHRoaXMudGFibGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCd0YWJsZScpO1xuXHRcdFx0dGhpcy50YWJsZS5pZCA9IHRhYmxlSUQ7XG5cblx0XHRcdGlmICh3aWR0aClcblx0XHRcdFx0JCh0aGlzLnRhYmxlKS5jc3MoJ3dpZHRoJywgd2lkdGgpO1xuXG5cdFx0XHRpZiAoaGVpZ2h0KVxuXHRcdFx0XHQkKHRoaXMudGFibGUpLmNzcygnaGVpZ2h0JywgaGVpZ2h0KTtcblx0XHR9XG5cblx0XHRhZGRSb3coKTpIVE1MVGFibGVSb3dFbGVtZW50IHtcblx0XHRcdHZhciByb3cgPSB0aGlzLnRhYmxlLmluc2VydFJvdygtMSk7XG5cdFx0XHR0aGlzLl9jdXJyZW50Um93Kys7XG5cdFx0XHRyZXR1cm4gPEhUTUxUYWJsZVJvd0VsZW1lbnQ+cm93O1xuXHRcdH1cblxuXHRcdGFkZENvbHVtbigpOkhUTUxFbGVtZW50IHtcblx0XHRcdHZhciByb3c6SFRNTFRhYmxlUm93RWxlbWVudCA9IDxIVE1MVGFibGVSb3dFbGVtZW50PnRoaXMudGFibGUucm93c1t0aGlzLl9jdXJyZW50Um93LTFdO1xuXHRcdFx0dmFyIGNvbHVtbjpIVE1MRWxlbWVudCA9IHJvdy5pbnNlcnRDZWxsKC0xKTtcblx0XHRcdHJldHVybiBjb2x1bW47XG5cdFx0fVxuXG5cdFx0Ly8gV2hlbiB5b3UncmUgZG9uZSBzZXR0aW5nIHVwIHRoZSB0YWJsZSwgYWRkIGl0IHRvIGFub3RoZXIgZWxlbWVudC5cblx0XHRhZGRUYWJsZVRvKGVsZW1lbnQ6SFRNTEVsZW1lbnQpIHtcblx0XHRcdGVsZW1lbnQuYXBwZW5kQ2hpbGQodGhpcy50YWJsZSk7XG5cdFx0fVxuXG5cdFx0dGFibGU6SFRNTFRhYmxlRWxlbWVudCA9IG51bGw7XG5cdFx0X2N1cnJlbnRSb3c6bnVtYmVyID0gMDtcblx0fVxuXG5cblx0Ly8gSmF2YXNjcmlwdCB1dGlsaXRpZXNcblx0ZXhwb3J0IGNsYXNzIEpTIHtcblxuXHRcdC8vIFRoaXMgYXNzdW1lcyB0aGF0IHN0ciBoYXMgb25seSBvbmUgcm9vdCBlbGVtZW50LlxuXHRcdC8vIEl0IGFsc28gYnJlYWtzIGZvciBlbGVtZW50cyB0aGF0IG5lZWQgdG8gYmUgbmVzdGVkIHVuZGVyIG90aGVyIHNwZWNpZmljIGVsZW1lbnQgdHlwZXMsXG5cdFx0Ly8gZS5nLiBpZiB5b3UgYXR0ZW1wdCB0byBjcmVhdGUgYSA8dGQ+IHlvdSB3aWxsIGJlIGhhbmRlZCBiYWNrIGEgPGRpdj4uXG5cdFx0c3RhdGljIGNyZWF0ZUVsZW1lbnRGcm9tU3RyaW5nKHN0cjpzdHJpbmcsIG5hbWVzcGFjZTpzdHJpbmcgPSBudWxsKTpIVE1MRWxlbWVudCB7XG5cblx0XHRcdHZhciBkaXY7XG5cdFx0XHRpZiAobmFtZXNwYWNlKVxuXHRcdFx0XHRkaXYgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50TlMobmFtZXNwYWNlLCAnZGl2Jyk7XG5cdFx0XHRlbHNlXG5cdFx0XHRcdGRpdiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXG5cdFx0XHRkaXYuaW5uZXJIVE1MID0gc3RyO1xuXHRcdFx0cmV0dXJuIGRpdi5maXJzdENoaWxkO1xuXG5cdFx0fVxuXG5cblx0XHRzdGF0aWMgYXNzZXJ0KGNvbmRpdGlvbjpib29sZWFuLCBtZXNzYWdlOnN0cmluZyk6dm9pZCB7XG5cdFx0ICAgIGlmICghY29uZGl0aW9uKSB7XG4gICAgICAgICAgICAgICAgbWVzc2FnZSA9IG1lc3NhZ2UgfHwgXCJBc3NlcnRpb24gZmFpbGVkXCI7XG4gICAgICAgICAgICAgICAgaWYgKHR5cGVvZiBFcnJvciAhPT0gJ3VuZGVmaW5lZCcpIHRocm93IEVycm9yKG1lc3NhZ2UpO1xuICAgICAgICAgICAgICAgIGVsc2UgdGhyb3cgbWVzc2FnZTtcblx0XHQgICAgfVxuXHRcdH1cblxuXHRcdFxuXHRcdHN0YXRpYyBjb252ZXJ0SGFzaFRvTGlzdChoYXNoOmFueSk6YW55IHtcblx0XHRcdHJldHVybiBPYmplY3Qua2V5cyhoYXNoKS5tYXAoIGZ1bmN0aW9uKGEpIHtyZXR1cm4gaGFzaFthXTt9ICk7XG5cdFx0fVxuXG5cblx0XHQvLyBSZXR1cm5zIGEgc3RyaW5nIG9mIGxlbmd0aCBudW1DaGFycywgcGFkZGluZyB0aGUgcmlnaHQgc2lkZVxuXHRcdC8vIHdpdGggc3BhY2VzIGlmIHN0ciBpcyBzaG9ydGVyIHRoYW4gbnVtQ2hhcnMuXG5cdFx0Ly8gV2lsbCB0cnVuY2F0ZSBpZiB0aGUgc3RyaW5nIGlzIGxvbmdlciB0aGFuIG51bUNoYXJzLlxuXHRcdHN0YXRpYyBwYWRTdHJpbmdMZWZ0KHN0cjpzdHJpbmcsIG51bUNoYXJzOm51bWJlcik6c3RyaW5nIHtcblx0XHRcdHZhciBzdGFydExlbjpudW1iZXIgPSBzdHIubGVuZ3RoO1xuXHRcdFx0Zm9yICh2YXIgaT1zdGFydExlbjsgaSA8IG51bUNoYXJzOyBpKyspXG5cdFx0XHRcdHN0ciArPSAnICc7XG5cblx0XHRcdHJldHVybiBzdHIuc2xpY2UoMCwgbnVtQ2hhcnMpO1xuXHRcdH1cblxuXG5cdFx0Ly8gUmV0dXJucyBhIHN0cmluZyBvZiBsZW5ndGggbnVtQ2hhcnMsIHBhZGRpbmcgdGhlIGxlZnQgc2lkZVxuXHRcdC8vIHdpdGggc3BhY2VzIGlmIHN0ciBpcyBzaG9ydGVyIHRoYW4gbnVtQ2hhcnMuXG5cdFx0c3RhdGljIHBhZFN0cmluZ1JpZ2h0KHN0cjpzdHJpbmcsIG51bUNoYXJzOm51bWJlcik6c3RyaW5nIHtcblx0XHRcdHZhciBwYWRTdHIgPSBcIlwiO1xuXHRcdFx0Zm9yICh2YXIgaT0wOyBpIDwgbnVtQ2hhcnM7IGkrKylcblx0XHRcdFx0cGFkU3RyICs9IFwiIFwiO1xuXG5cdFx0XHRyZXR1cm4gKHBhZFN0ciArIHN0cikuc2xpY2UoLW51bUNoYXJzKTtcblx0XHR9XG5cblxuXHRcdC8vIE1ha2UgYSBzdHJpbmcgYnkgcmVwZWF0aW5nIHRoZSBzcGVjaWZpZWQgc3RyaW5nIE4gdGltZXMuXG5cdFx0c3RhdGljIHJlcGVhdFN0cmluZyhzdHI6c3RyaW5nLCBudW1DaGFyczpudW1iZXIpOnN0cmluZyB7XG5cdFx0XHR2YXIgcmV0OnN0cmluZyA9IFwiXCI7XG5cdFx0XHRmb3IgKHZhciBpOm51bWJlcj0wOyBpIDwgbnVtQ2hhcnM7IGkrKylcblx0XHRcdFx0cmV0ICs9IHN0cjtcblxuXHRcdFx0cmV0dXJuIHJldDtcblx0XHR9XG5cblxuXHRcdC8vIENvbnZlcnQgYSBzaXplIHByb3ZpZGVkIGluIGJ5dGVzIHRvIGEgbmljZWx5IGZvcm1hdHRlZCBzdHJpbmdcblx0XHRzdGF0aWMgc2l6ZVRvU3RyaW5nKHNpemU6bnVtYmVyLCBhbGxvd0J5dGVzPzpib29sZWFuKTpzdHJpbmcge1xuXG5cdFx0XHR2YXIgdGIgPSBzaXplIC8gKDEwMjQgKiAxMDI0ICogMTAyNCAqIDEwMjQpO1xuXHRcdFx0aWYgKCh0YiA+IDEpIHx8ICh0YiA8IC0xKSkge1xuXHRcdFx0XHRyZXR1cm4gVXRsLkpTLm5pY2VseVByaW50RmxvYXQodGIsIDIpICsgJyBUYic7XG5cdFx0XHR9XG5cdFx0XHR2YXIgZ2lncyA9IHNpemUgLyAoMTAyNCAqIDEwMjQgKiAxMDI0KTtcblx0XHRcdGlmICgoZ2lncyA+IDEpIHx8IChnaWdzIDwgLTEpKSB7XG5cdFx0XHRcdHJldHVybiBVdGwuSlMubmljZWx5UHJpbnRGbG9hdChnaWdzLCAyKSArICcgR2InO1xuXHRcdFx0fVxuXHRcdFx0dmFyIG1lZ3MgPSBzaXplIC8gKDEwMjQgKiAxMDI0KTtcblx0XHRcdGlmICgobWVncyA+IDEpIHx8IChtZWdzIDwgLTEpKSB7XG5cdFx0XHRcdHJldHVybiBVdGwuSlMubmljZWx5UHJpbnRGbG9hdChtZWdzLCAyKSArICcgTWInO1xuXHRcdFx0fVxuXHRcdFx0dmFyIGsgPSBzaXplIC8gMTAyNDtcblx0XHRcdGlmICgoKGsgPiAxKSB8fCAoayA8IC0xKSkgfHwgIWFsbG93Qnl0ZXMpIHtcblx0XHRcdFx0cmV0dXJuIFV0bC5KUy5uaWNlbHlQcmludEZsb2F0KGssIDIpICsgJyBLYic7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gc2l6ZSArICcgYic7XG5cdFx0fVxuXG5cblx0XHQvLyAtMSA6IFByaW50IGFzIGEgZnVsbCBmbG9hdFxuXHRcdC8vICAwIDogUHJpbnQgYXMgYW4gaW50LCBBTFdBWVMgcm91bmRlZCBkb3duLlxuXHRcdC8vICtuIDogUHJpbnQgd2l0aCBuIGRlY2ltYWwgcGxhY2VzLCBVTkxFU1MgdGhlIHZhbHVlIGlzIGFuIGludGVnZXJcblx0XHRzdGF0aWMgbmljZWx5UHJpbnRGbG9hdCh2Om51bWJlciwgcGxhY2VzOm51bWJlcik6c3RyaW5nIHtcblx0XHRcdC8vIFdlIGRvIG5vdCB3YW50IHRvIGRpc3BsYXkgQU5ZIGRlY2ltYWwgcG9pbnQgaWYgdGhlIHZhbHVlIGlzIGFuIGludGVnZXIuXG5cdFx0XHRpZiAodiAlIDEgPT09IDApIHtcdC8vIEJhc2ljIGludGVnZXIgdGVzdFxuXHRcdFx0XHRyZXR1cm4gKHYgJSAxKS50b1N0cmluZygpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHBsYWNlcyA+IDApIHtcblx0XHRcdFx0cmV0dXJuIHYudG9GaXhlZChwbGFjZXMpO1xuXHRcdFx0fSBlbHNlIGlmIChwbGFjZXMgPT0gMCkge1xuXHRcdFx0XHRyZXR1cm4gKHYgJSAxKS50b1N0cmluZygpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHYudG9TdHJpbmcoKTtcblx0XHR9XG5cblxuXHRcdC8vIEdpdmVuIGEgZmlsZSBuYW1lIChuKSBhbmQgYSBmaWxlIHR5cGUgc3RyaW5nICh0KSwgdHJ5IGFuZCBndWVzcyB3aGF0IGtpbmQgb2YgZmlsZSB3ZSd2ZSBnb3QuXG5cdFx0c3RhdGljIGd1ZXNzRmlsZVR5cGUobjogc3RyaW5nLCB0OiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdFx0Ly8gR29pbmcgaW4gb3JkZXIgZnJvbSBtb3N0IGNvbmZpZGVudCB0byBsZWFzdCBjb25maWRlbnQgZ3Vlc3Nlczpcblx0XHRcdGlmICh0LmluZGV4T2YoJ29mZmljZWRvY3VtZW50LnNwcmVhZHNoZWV0JykgPj0gMCkgeyByZXR1cm4gJ2V4Y2VsJzsgfVxuXHRcdFx0aWYgKHQgPT09ICd0ZXh0L2NzdicpIHsgcmV0dXJuICdjc3YnOyB9XG5cdFx0XHRpZiAodCA9PT0gJ3RleHQveG1sJykgeyByZXR1cm4gJ3htbCc7IH1cblx0XHRcdGlmICgobi5pbmRleE9mKCcueGxzeCcsIG4ubGVuZ3RoIC0gNSkgIT09IC0xKSB8fCAobi5pbmRleE9mKCcueGxzJywgbi5sZW5ndGggLSA0KSAhPT0gLTEpKSB7IHJldHVybiAnZXhjZWwnOyB9XG5cdFx0XHRpZiAobi5pbmRleE9mKCcueG1sJywgbi5sZW5ndGggLSA0KSAhPT0gLTEpIHsgcmV0dXJuICd4bWwnOyB9XG5cdFx0XHQvLyBJZiBhbGwgZWxzZSBmYWlscywgYXNzdW1lIGl0J3MgYSBjc3YgZmlsZS4gIChTbywgYW55IGV4dGVuc2lvbiB0aGF0J3Mgbm90IHRyaWVkIGFib3ZlLCBvciBubyBleHRlbnNpb24uKVxuXHRcdFx0cmV0dXJuICdjc3YnO1xuXHRcdH1cblxuXG5cdFx0Ly8gR2l2ZW4gYSBkYXRlIGluIHNlY29uZHMgKHdpdGggYSBwb3NzaWJsZSBmcmFjdGlvbmFsIHBvcnRpb24gYmVpbmcgbWlsbGlzZWNvbmRzKSxcblx0XHQvLyBiYXNlZCBvbiB6ZXJvIGJlaW5nIG1pZG5pZ2h0IG9mIEphbiAxLCAxOTcwIChzdGFuZGFyZCBvbGQtc2Nob29sIFBPU0lYIHRpbWUpLFxuXHRcdC8vIHJldHVybiBhIHN0cmluZyBmb3JtYXR0ZWQgaW4gdGhlIG1hbm5lciBvZiBcIkRlYyAyMSAyMDEyLCAxMTo0NWFtXCIsXG5cdFx0Ly8gd2l0aCBleGNlcHRpb25zIGZvciAnVG9kYXknIGFuZCAnWWVzdGVyZGF5JywgZS5nLiBcIlllc3RlcmRheSwgMzoxMnBtXCIuXG5cdFx0c3RhdGljIHRpbWVzdGFtcFRvVG9kYXlTdHJpbmcodGltZXN0YW1wOm51bWJlcik6c3RyaW5nIHtcblxuXHRcdFx0Ly8gQ29kZSBhZGFwdGVkIGZyb20gUGVybCdzIEhUVFAtRGF0ZVxuXHRcdFx0Ly92YXIgRG9XID0gWydTdW4nLCdNb24nLCdUdWUnLCdXZWQnLCdUaHUnLCdGcmknLCdTYXQnXTtcblx0XHRcdHZhciBNb1kgPSBbJ0phbicsJ0ZlYicsJ01hcicsJ0FwcicsJ01heScsJ0p1bicsJ0p1bCcsJ0F1ZycsJ1NlcCcsJ09jdCcsJ05vdicsJ0RlYyddO1xuXG5cdFx0XHRpZiAoIXRpbWVzdGFtcCB8fCB0aW1lc3RhbXAgPCAxKSB7XG5cdFx0XHRcdHJldHVybiAnPHNwYW4gc3R5bGU9XCJjb2xvcjojODg4O1wiPk4vQTwvc3Bhbj4nO1xuXHRcdFx0fVxuXG5cdFx0XHR2YXIgdCA9IG5ldyBEYXRlKE1hdGgucm91bmQodGltZXN0YW1wKjEwMDApKTtcblx0XHRcdHZhciBuID0gbmV3IERhdGUoKTtcblx0XHRcdHZhciBub3cgPSBuLmdldFRpbWUoKTtcblxuXHRcdFx0dmFyIHNlYyA9IHQuZ2V0U2Vjb25kcygpO1xuXHRcdFx0dmFyIG1pbjphbnkgPSB0LmdldE1pbnV0ZXMoKTtcdC8vIFR5cGUgXCJhbnlcIiBzbyB3ZSBjYW4gYWRkIGEgbGVhZGluZyB6ZXJvXG5cdFx0XHR2YXIgaG91ciA9IHQuZ2V0SG91cnMoKTtcblx0XHRcdHZhciBtZGF5ID0gdC5nZXREYXRlKCk7XHRcdC8vIFJldHVybnMgdGhlIGRheSBvZiB0aGUgbW9udGggKGZyb20gMS0zMSlcblx0XHRcdHZhciBtb24gPSB0LmdldE1vbnRoKCk7XHRcdC8vIFJldHVybnMgdGhlIG1vbnRoIChmcm9tIDAtMTEpXG5cdFx0XHR2YXIgeWVhciA9IHQuZ2V0RnVsbFllYXIoKTtcdC8vIFJldHVybnMgdGhlIHllYXIgKGZvdXIgZGlnaXRzKVxuXHRcdFx0dmFyIHdkYXkgPSB0LmdldERheSgpO1x0XHQvLyBSZXR1cm5zIHRoZSBkYXkgb2YgdGhlIHdlZWsgKGZyb20gMC02KVxuXG5cdFx0XHR2YXIgbnNlYyA9IG4uZ2V0U2Vjb25kcygpO1xuXHRcdFx0dmFyIG5taW4gPSBuLmdldE1pbnV0ZXMoKTtcblx0XHRcdHZhciBuaG91ciA9IG4uZ2V0SG91cnMoKTtcblx0XHRcdHZhciBubWRheSA9IG4uZ2V0RGF0ZSgpO1xuXHRcdFx0dmFyIG5tb24gPSBuLmdldE1vbnRoKCk7XG5cdFx0XHR2YXIgbnllYXIgPSBuLmdldEZ1bGxZZWFyKCk7XG5cdFx0XHR2YXIgbndkYXkgPSBuLmdldERheSgpO1xuXG5cdFx0XHR2YXIgZGF5X3N0cjtcblxuXHRcdFx0aWYgKCh5ZWFyID09IG55ZWFyKSAmJiAobW9uID09IG5tb24pICYmIChtZGF5ID09IG5tZGF5KSkge1xuXHRcdFx0XHRkYXlfc3RyID0gJ1RvZGF5Jztcblx0XHRcdH0gZWxzZSBpZiAoXHQgICAgKG5vdyAtIChuc2VjICsgKDYwKihubWluKyg2MCoobmhvdXIrMjQpKSkpKSkgPT1cdFx0Ly8gTm93J3MgZGF5IGNvbXBvbmVudCBtaW51cyBhIGRheVxuXHRcdFx0XHRcdCAgKHRpbWVzdGFtcCAtIChzZWMgICsgKDYwKihtaW4gKyg2MCogaG91ciAgICAgKSkpKSkpXHQge1x0Ly8gVGltZXN0YW1wJ3MgZGF5IGNvbXBvbmVudFxuXHRcdFx0XHRkYXlfc3RyID0gJ1llc3RlcmRheSc7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR2YXIgeWVhcl9zdHIgPSAnJztcblx0XHRcdFx0aWYgKHllYXIgIT0gbnllYXIpIHtcblx0XHRcdFx0XHR5ZWFyX3N0ciA9ICcgJyArIHllYXI7XG5cdFx0XHRcdH1cblx0XHRcdFx0ZGF5X3N0ciA9IE1vWVttb25dICsgJyAnICsgbWRheSArIHllYXJfc3RyO1xuXHRcdFx0fVxuXG5cdFx0XHR2YXIgaGFsZl9kYXkgPSAnYW0nO1xuXHRcdFx0aWYgKGhvdXIgPiAxMSkge2hhbGZfZGF5ID0gJ3BtJzt9XG5cdFx0XHRpZiAoaG91ciA+IDEyKSB7aG91ciAtPSAxMjt9XG5cdFx0XHRlbHNlIGlmIChob3VyID09IDApIHtob3VyID0gMTI7fVxuXHRcdFx0aWYgKG1pbiA8IDkpIHttaW4gPSAnMCcrbWluO31cblxuXHRcdFx0cmV0dXJuIGRheV9zdHIgKyAnLCAnICsgaG91ciArICc6JyArIG1pbiArIGhhbGZfZGF5O1xuXHRcdH1cblxuXG4gICAgICAgIHN0YXRpYyB1dGNUb1RvZGF5U3RyaW5nKHV0YzpzdHJpbmcpOnN0cmluZyB7XG4gICAgICAgICAgICB2YXIgbTphbnlbXTtcbiAgICAgICAgICAgIHZhciB0aW1lc3RhbXA6bnVtYmVyO1xuICAgICAgICAgICAgbSA9IC9eKFxcZHs0fSktKFxcZHsyfSktKFxcZHsyfSlUKFxcZHsyfSk6KFxcZHsyfSk6KFxcZHsyfSlcXC4/KFxcZHsxLDZ9KT9aJC8uZXhlYyh1dGMpO1xuICAgICAgICAgICAgaWYgKG0pIHtcbiAgICAgICAgICAgICAgICBtLnNoaWZ0KCk7IC8vIGdldCByaWQgb2Ygb3ZlcmFsbCBtYXRjaCwgd2UgZG9uJ3QgY2FyZVxuICAgICAgICAgICAgICAgIG0ubWFwKCh2KSA9PiB7IHJldHVybiBwYXJzZUludCh2LCAxMCk7IH0pOyAvLyBjb252ZXJ0IHN0cmluZ3MgdG8gbnVtYmVyc1xuICAgICAgICAgICAgICAgIG1bMV0tLTsgLy8gRGF0ZSB1c2VzIDAtYmFzZWQgbW9udGhzLCBzbyBkZWNyZW1lbnQgbW9udGhcbiAgICAgICAgICAgICAgICB0aW1lc3RhbXAgPSBEYXRlLlVUQyhtWzBdLCBtWzFdLCBtWzJdLCBtWzNdLCBtWzRdLCBtWzVdKTtcbiAgICAgICAgICAgICAgICB0aW1lc3RhbXAgLz0gMTAwMDsgLy8gdGhlIHRpbWVzdGFtcFRvVG9kYXlTdHJpbmcgZXhwZWN0cyBzZWNvbmRzLCBub3QgbWlsbGlzZWNvbmRzXG4gICAgICAgICAgICAgICAgcmV0dXJuIFV0bC5KUy50aW1lc3RhbXBUb1RvZGF5U3RyaW5nKHRpbWVzdGFtcCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gVXRsLkpTLnRpbWVzdGFtcFRvVG9kYXlTdHJpbmcobnVsbCk7XG4gICAgICAgIH1cblxuXG5cdFx0Ly8gUmVtYXAgYSB2YWx1ZSBmcm9tIFtpbk1pbiwgaW5NYXhdIHRvIFtvdXRNaW4sIG91dE1heF1cblx0XHRzdGF0aWMgcmVtYXBWYWx1ZSh2YWx1ZTpudW1iZXIsIGluTWluOm51bWJlciwgaW5NYXg6bnVtYmVyLCBvdXRNaW46bnVtYmVyLCBvdXRNYXg6bnVtYmVyKTpudW1iZXIge1xuXHRcdFx0dmFyIGRlbHRhOm51bWJlciA9IGluTWF4IC0gaW5NaW47XG5cblx0XHRcdC8vIElmIHRoZXkndmUgZ2l2ZW4gdXMgYSB0aW55IGlucHV0IHJhbmdlLCB0aGVuIHdlIGNhbid0IHJlYWxseSBwYXJhbWV0ZXJpemVcblx0XHRcdC8vIGludG8gdGhlIHJhbmdlLCBzbyBsZXQncyBqdXN0IHJldHVybiBoYWxmd2F5IGJldHdlZW4gdGhlIG91dHB1dHMuXG5cdFx0XHRpZiAoTWF0aC5hYnMoZGVsdGEpIDwgMC4wMDAwMDEpXG5cdFx0XHRcdHJldHVybiBvdXRNaW4gKyAob3V0TWF4IC0gb3V0TWluKSAqIDAuNTtcblxuXHRcdFx0dmFyIHQgPSAodmFsdWUgLSBpbk1pbikgLyAoaW5NYXggLSBpbk1pbik7XG5cdFx0XHRyZXR1cm4gb3V0TWluICsgKG91dE1heCAtIG91dE1pbikgKiB0O1xuXHRcdH1cblxuXHRcdC8vIFJlbW92ZSBhbGwgY2hpbGQgZWxlbWVudHMgZnJvbSB0aGUgc3BlY2lmaWVkIGVsZW1lbnQuXG5cdFx0c3RhdGljIHJlbW92ZUFsbENoaWxkcmVuKGVsZW1lbnQ6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0XHR3aGlsZSAoZWxlbWVudC5maXJzdENoaWxkKVxuXHRcdFx0XHRlbGVtZW50LnJlbW92ZUNoaWxkKGVsZW1lbnQuZmlyc3RDaGlsZCk7XG5cdFx0fVxuXG5cdFx0c3RhdGljIHJlbW92ZUZyb21QYXJlbnQoZWxlbWVudDogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRcdGlmIChlbGVtZW50ICYmIGVsZW1lbnQucGFyZW50Tm9kZSlcblx0XHRcdFx0ZWxlbWVudC5wYXJlbnROb2RlLnJlbW92ZUNoaWxkKGVsZW1lbnQpO1xuXHRcdH1cblxuXHRcdC8vIENhbGwgdGhpcyBhbnl3aGVyZSBpbiB5b3VyIGNvZGUgdG8gdHJhcCBGMTIga2V5cHJlc3MgdG8gc3RvcCBpbiBkZWJ1Z2dlci5cblx0XHQvLyBUaGlzIGlzIHVzZWZ1bCBmb3IgbG9va2luZyBhdCBET00gZWxlbWVudHMgaW4gYSBwb3B1cCB0aGF0IHdvdWxkIG5vcm1hbGx5IGdvIGF3YXkgd2hlblxuXHRcdC8vIHlvdSBtb3ZlZCB0aGUgbW91c2UgYXdheSBmcm9tIGl0LlxuXHRcdHN0YXRpYyBlbmFibGVGMTJUcmFwKCk6IHZvaWQge1xuXHRcdFx0JCh3aW5kb3cpLmtleWRvd24oZnVuY3Rpb24oZSkgeyBpZiAoZS5rZXlDb2RlID09IDEyMykgZGVidWdnZXI7IH0pO1xuXHRcdH1cblxuXHRcdHN0YXRpYyBzdGFydFdhaXRCYWRnZShzZWxlY3Rvcik6IHZvaWQge1xuXHRcdFx0JChzZWxlY3RvcikuY3NzKFwiY2xhc3NcIiwgXCJ3YWl0YmFkZ2Ugd2FpdFwiKTtcblx0XHR9XG5cblx0XHRzdGF0aWMgc3RvcFdhaXRCYWRnZShzZWxlY3Rvcik6IHZvaWQge1xuXHRcdFx0JChzZWxlY3RvcikuY3NzKFwiY2xhc3NcIiwgXCJ3YWl0YmFkZ2VcIik7XG5cdFx0fVxuXHR9XG5cblxuXG5cdC8vIEEgcHJvZ3Jlc3MgYmFyIHdpdGggYSByYW5nZSBmcm9tIDAgdG8gMTAwIHBlcmNlbnQuXG5cdC8vIFdoZW4gZ2l2ZW4gb25seSBhbiBpZCwgdGhlIGNsYXNzIHNlZWtzIGFuIGVsZW1lbnQgaW4gdGhlIGRvY3VtZW50IGFuZCB1c2VzIHRoYXQgYXMgdGhlIHByb2dyZXNzIGJhci5cblx0Ly8gV2hlbiBnaXZlbiBhIHBhcmVudCBlbGVtZW50LCB0aGUgY2xhc3MgbWFrZXMgYSBuZXcgPHByb2dyZXNzPiBlbGVtZW50IHVuZGVybmVhdGggaXQgd2l0aCB0aGUgZ2l2ZW4gaWQuXG5cdGV4cG9ydCBjbGFzcyBQcm9ncmVzc0JhciB7XG5cblx0XHRlbGVtZW50OiBIVE1MRWxlbWVudDtcblxuXG5cdFx0Y29uc3RydWN0b3IoaWQ6IHN0cmluZywgcGFyZW50RWxlbWVudD86IEhUTUxFbGVtZW50KSB7XG5cdFx0XHR2YXIgYjogSFRNTEVsZW1lbnQ7XG5cdFx0XHRpZiAocGFyZW50RWxlbWVudCkge1xuXHRcdFx0XHRiID0gJCgnPHByb2dyZXNzPicpLmFwcGVuZFRvKHBhcmVudEVsZW1lbnQpWzBdO1xuXHRcdFx0XHRiLmlkID0gaWQ7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRiID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoaWQpO1xuXHRcdFx0fVxuXHRcdFx0Yi5pbm5lckhUTUwgPSAnMCUgY29tcGxldGUnO1xuXHRcdFx0Yi5zZXRBdHRyaWJ1dGUoJ21pbicsICcwJyk7XG5cdFx0XHRiLnNldEF0dHJpYnV0ZSgnbWF4JywgJzEwMCcpO1xuXHRcdFx0Yi5zZXRBdHRyaWJ1dGUoJ3ZhbHVlJywgJzAnKTtcblx0XHRcdGIuY2xhc3NOYW1lID0gJ29mZic7XG5cdFx0XHR0aGlzLmVsZW1lbnQgPSBiO1xuXHRcdH1cblxuXG5cdFx0Ly8gU2V0cyB0aGUgcHJvZ3Jlc3MgYmFyIGZyb20gMCB0byAxMDAgcGVyY2VudCwgb3Igbm8gdmFsdWUgdG8gZGlzYWJsZS5cblx0XHQvLyBBbHNvIHNob3dzIHRoZSBzcGlubnkgd2FpdCBpY29uIGlmIHRoZSBwcm9ncmVzcyBiYXIgaXMgc2V0IHRvIGEgdmFsdWUgb3RoZXIgdGhhbiAxMDAuXG5cdFx0c2V0UHJvZ3Jlc3MocGVyY2VudGFnZT86IG51bWJlcikge1xuXHRcdFx0dmFyIGIgPSB0aGlzLmVsZW1lbnQ7XG5cdFx0XHRpZiAodHlwZW9mIChwZXJjZW50YWdlKSA9PT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRcdFx0Yi5pbm5lckhUTUwgPSAnMCUgY29tcGxldGUnO1xuXHRcdFx0XHRiLnNldEF0dHJpYnV0ZSgndmFsdWUnLCAnMCcpO1xuXHRcdFx0XHRiLmNsYXNzTmFtZSA9ICdvZmYnO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Yi5pbm5lckhUTUwgPSBwZXJjZW50YWdlICsgJyUgY29tcGxldGUnO1xuXHRcdFx0XHRiLnNldEF0dHJpYnV0ZSgndmFsdWUnLCBwZXJjZW50YWdlLnRvU3RyaW5nKCkpO1xuXHRcdFx0XHRiLmNsYXNzTmFtZSA9ICcnO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cblxuXHQvLyBVc2VkIGJ5IEZpbGVEcm9wWm9uZSB0byBwYXNzIGFyb3VuZCBhZGRpdGlvbmFsIGluZm8gZm9yIGVhY2ggZHJvcHBlZCBGaWxlIG9iamVjdCB3aXRob3V0XG5cdC8vIG1lc3Npbmcgd2l0aCB0aGUgZmlsZWRyb3AtbWluLmpzIGludGVybmFscy5cbiAgICBpbnRlcmZhY2UgRmlsZURyb3Bab25lRmlsZUNvbnRhaW5lciB7XG4gICAgICAgIGZpbGU6IGFueTtcdFx0XHRcdFx0Ly8gVGhlIGZpbGUgb2JqZWN0IGFzIGNyZWF0ZWQgYnkgZmlsZWRyb3AtbWluLmpzXG4gICAgICAgIGZpbGVUeXBlOiBzdHJpbmc7XHRcdFx0Ly8gQSBndWVzcyBhdCB0aGUgZmlsZSdzIHR5cGUsIGV4cHJlc3NlZCBhcyBhIHN0cmluZywgYXMgcmV0dXJuZWQgYnkgVXRsLkpTLmd1ZXNzRmlsZVR5cGUgLlxuICAgICAgICBwcm9ncmVzc0JhcjogUHJvZ3Jlc3NCYXI7XHQvLyBUaGUgUHJvZ3Jlc3NCYXIgb2JqZWN0IHVzZWQgdG8gdHJhY2sgdGhpcyBmaWxlLiAgQ2FuIGJlIGFsdGVyZWQgYWZ0ZXIgaW5pdCBieSBmaWxlSW5pdEZuLlxuXG4gICAgICAgIHN0b3BQcm9jZXNzaW5nOiBib29sZWFuO1x0Ly8gSWYgc2V0LCBhYmFuZG9uIGFueSBmdXJ0aGVyIGFjdGlvbiBvbiB0aGUgZmlsZS5cbiAgICAgICAgc2tpcFByb2Nlc3NSYXc6IGJvb2xlYW47XHQvLyBJZiBzZXQsIHNraXAgdGhlIGNhbGwgdG8gcHJvY2VzcyB0aGUgZHJvcHBlZCBmaWxlIGxvY2FsbHkuXG4gICAgICAgIHNraXBVcGxvYWQ6IGJvb2xlYW47XHRcdC8vIElmIHNldCwgc2tpcCB0aGUgdXBsb2FkIHRvIHRoZSBzZXJ2ZXIgKGFuZCBzdWJzZXF1ZW50IGNhbGwgdG8gcHJvY2Vzc1Jlc3BvbnNlRm4pXG4gICAgICAgIGFsbFdvcmtGaW5pc2hlZDogYm9vbGVhbjtcdC8vIElmIHNldCwgdGhlIGZpbGUgaGFzIGZpbmlzaGVkIGFsbCBwcm9jZXNzaW5nIGJ5IHRoZSBGaWxlRHJvcFpvbmUgY2xhc3MuXG5cbiAgICAgICAgLy8gVGhpcyBpcyBhc3NpZ25lZCBieSBGaWxlRHJvcFpvbmUgd2hlbiB0aGUgb2JqZWN0IGlzIGdlbmVyYXRlZCwgYW5kIGNhbiBiZSB1c2VkIHRvIGNvcnJlbGF0ZSB0aGVcbiAgICAgICAgLy8gb2JqZWN0IHdpdGggb3RoZXIgaW5mb3JtYXRpb24gZWxzZXdoZXJlLiAgKEl0IGlzIG5vdCB1c2VkIGludGVybmFsbHkgYnkgRmlsZURyb3Bab25lLilcbiAgICAgICAgdW5pcXVlSW5kZXg6IG51bWJlcjtcbiAgICB9XG5cblxuXG5cdC8vIEEgY2xhc3Mgd3JhcHBpbmcgZmlsZWRyb3AtbWluLmpzIChodHRwOi8vZmlsZWRyb3Bqcy5vcmcpIGFuZCBwcm92aWRpbmcgc29tZSBhZGRpdGlvbmFsIHN0cnVjdHVyZS5cblx0Ly8gSXQncyBpbml0aWFsaXplZCB3aXRoIGEgc2luZ2xlICdvcHRpb25zJyBvYmplY3Q6XG5cdC8vIHtcblx0Ly9cdGVsZW1lbnRJZDogSUQgb2YgdGhlIGVsZW1lbnQgdG8gYmUgc2V0IHVwIGFzIGEgZHJvcCB6b25lXG5cdC8vXHRmaWxlSW5pdEZuOiBDYWxsZWQgd2hlbiBhIGZpbGUgaGFzIGJlZW4gZHJvcHBlZCwgYnV0IGJlZm9yZSBhbnkgcHJvY2Vzc2luZyBoYXMgc3RhcnRlZFxuXHQvL1x0cHJvY2Vzc1Jhd0ZuOiBDYWxsZWQgd2hlbiB0aGUgZmlsZSBjb250ZW50IGhhcyBiZWVuIHJlYWQgaW50byBhIGxvY2FsIHZhcmlhYmxlLCBidXQgYmVmb3JlIGFueSBjb21tdW5pY2F0aW9uIHdpdGhcblx0Ly8gICAgICAgICAgICAgICAgdGhlIHNlcnZlci5cblx0Ly9cdHVybDogVGhlIFVSTCB0byB1cGxvYWQgdGhlIGZpbGUuXG5cdC8vXHRwcm9ncmVzc0JhcjogQSBQcm9ncmVzc0JhciBvYmplY3QgZm9yIHRyYWNraW5nIHRoZSB1cGxvYWQgcHJvZ3Jlc3MuXG5cdC8vXHRwcm9jZXNzUmVzcG9uc2VGbjogQ2FsbGVkIHdoZW4gdGhlIHNlcnZlciBzZW5kcyBiYWNrIGl0cyByZXN1bHRzLlxuXHQvLyB9XG5cdC8vIEFsbCBjYWxsYmFja3MgYXJlIGdpdmVuIGEgRmlsZURyb3Bab25lRmlsZUNvbnRhaW5lciBvYmplY3QgYXMgdGhlaXIgZmlyc3QgYXJndW1lbnQuXG5cblx0Ly8gVE9ETzpcblx0Ly8gKiBSZXdyaXRlIHRoaXMgd2l0aCBhbiBvcHRpb24gdG8gb25seSBhY2NlcHQgdGhlIGZpcnN0IGZpbGUgaW4gYSBkcm9wcGVkIHNldC5cblx0Ly8gKiBDcmVhdGUgYSBmaWxlQ29udGFpbmVyR3JvdXAgb2JqZWN0LCBhbmQgYSBmaWxlQ29udGFpbmVyZ0dyb3VwSW5kZXhDb3VudGVyLCBhbmQgYXNzaWduIHNldHMgb2YgZmlsZXMgdGhlIHNhbWUgZ3JvdXAgVUlELlxuXHQvLyAqIEFkZCBhICdjbGVhbnVwJyBjYWxsYmFjayB0aGF0J3MgY2FsbGVkIGFmdGVyIGFsbCBmaWxlcyBpbiBhIGdyb3VwIGhhdmUgYmVlbiB1cGxvYWRlZC5cblx0ZXhwb3J0IGNsYXNzIEZpbGVEcm9wWm9uZSB7XG5cblx0XHR6b25lOiBhbnk7XG5cdFx0Y3NyZnRva2VuOiBhbnk7XG5cdFx0ZWxlbWVudElkOiBhbnk7XG5cdFx0dXJsOiBzdHJpbmc7XG5cdFx0cHJvZ3Jlc3NCYXI6IFByb2dyZXNzQmFyO1xuXG5cdFx0ZmlsZUluaXRGbjogYW55O1xuXHRcdHByb2Nlc3NSYXdGbjogYW55O1xuXHRcdHByb2Nlc3NSZXNwb25zZUZuOiBhbnk7XG5cblx0XHRzdGF0aWMgZmlsZUNvbnRhaW5lckluZGV4Q291bnRlcjogbnVtYmVyID0gMDtcblxuXHRcdC8vIElmIHByb2Nlc3NSYXdGbiBpcyBwcm92aWRlZCwgaXQgd2lsbCBiZSBjYWxsZWQgd2l0aCB0aGUgcmF3IGZpbGUgZGF0YSBmcm9tIHRoZSBkcm9wIHpvbmUuXG5cdFx0Ly8gSWYgdXJsIGlzIHByb3ZpZGVkIGFuZCBwcm9jZXNzUmF3Rm4gcmV0dXJucyBmYWxzZSAob3Igd2FzIG5vdCBwcm92aWRlZCkgdGhlIGZpbGUgd2lsbCBiZSBzZW50IHRvIHRoZSBnaXZlbiB1cmwuXG5cdFx0Ly8gSWYgcHJvY2Vzc1Jlc3BvbnNlRm4gaXMgcHJvdmlkZWQsIGl0IHdpbGwgYmUgY2FsbGVkIHdpdGggdGhlIHJldHVybmVkIHJlc3VsdCBvZiB0aGUgdXJsIGNhbGwuXG4gICAgICAgIGNvbnN0cnVjdG9yKG9wdGlvbnM6YW55KSB7XG5cblx0XHRcdHRoaXMucHJvZ3Jlc3NCYXIgPSBvcHRpb25zLnByb2dyZXNzQmFyIHx8IG51bGw7XG5cblx0XHRcdC8vIElmIHRoZXJlJ3MgYSBjbGVhbmVyIHdheSB0byBmb3JjZS1kaXNhYmxlIGV2ZW50IGxvZ2dpbmcgaW4gZmlsZWRyb3AtbWluLmpzLCBkbyBwbGVhc2UgcHV0IGl0IGhlcmUhXG5cdFx0XHQoPGFueT53aW5kb3cpLmZkLmxvZ2dpbmcgPSBmYWxzZTtcblxuXHRcdFx0dmFyIHogPSBuZXcgRmlsZURyb3Aob3B0aW9ucy5lbGVtZW50SWQsIHt9KTtcdC8vIGZpbGVkcm9wLW1pbi5qcyAsIGh0dHA6Ly9maWxlZHJvcGpzLm9yZ1xuXHRcdFx0dGhpcy56b25lID0gejtcblx0XHRcdHRoaXMuY3NyZnRva2VuID0galF1ZXJ5LmNvb2tpZSgnY3NyZnRva2VuJyk7XG5cdFx0XHRpZiAoISh0eXBlb2Ygb3B0aW9ucy5tdWx0aXBsZSA9PT0gXCJ1bmRlZmluZWRcIikpIHtcblx0XHRcdFx0ei5tdWx0aXBsZShvcHRpb25zLm11bHRpcGxlKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHoubXVsdGlwbGUoZmFsc2UpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5maWxlSW5pdEZuID0gb3B0aW9ucy5maWxlSW5pdEZuO1xuXHRcdFx0dGhpcy5wcm9jZXNzUmF3Rm4gPSBvcHRpb25zLnByb2Nlc3NSYXdGbjtcblx0XHRcdHRoaXMucHJvY2Vzc1Jlc3BvbnNlRm4gPSBvcHRpb25zLnByb2Nlc3NSZXNwb25zZUZuO1xuXHRcdFx0dGhpcy51cmwgPSBvcHRpb25zLnVybDtcblx0XHR9XG5cblxuXHRcdC8vIEhlbHBlciBmdW5jdGlvbiB0byBjcmVhdGUgYW5kIHNldCB1cCBhIEZpbGVEcm9wWm9uZS5cblx0XHRzdGF0aWMgY3JlYXRlKG9wdGlvbnM6YW55KTogdm9pZCB7XG5cdFx0XHR2YXIgaCA9IG5ldyBGaWxlRHJvcFpvbmUob3B0aW9ucyk7XG5cdFx0XHRoLnNldHVwKCk7XG5cdFx0fVxuXG5cblx0XHRzZXR1cCgpOnZvaWQge1xuXHRcdFx0dmFyIHQgPSB0aGlzO1xuXHRcdFx0dGhpcy56b25lLmV2ZW50KCdzZW5kJywgZnVuY3Rpb24oZmlsZXMpIHtcblx0XHRcdFx0ZmlsZXMuZWFjaChmdW5jdGlvbihmaWxlKSB7XG5cblx0XHRcdFx0XHR2YXIgZmlsZUNvbnRhaW5lcjpGaWxlRHJvcFpvbmVGaWxlQ29udGFpbmVyICA9IHtcblx0XHRcdFx0XHRcdGZpbGU6IGZpbGUsXG5cdFx0XHRcdFx0XHRmaWxlVHlwZTogVXRsLkpTLmd1ZXNzRmlsZVR5cGUoZmlsZS5uYW1lLCBmaWxlLnR5cGUpLFxuXHRcdFx0XHRcdFx0cHJvZ3Jlc3NCYXI6IHQucHJvZ3Jlc3NCYXIsXG5cdFx0XHRcdFx0XHR1bmlxdWVJbmRleDogRmlsZURyb3Bab25lLmZpbGVDb250YWluZXJJbmRleENvdW50ZXIrKyxcblx0XHRcdFx0XHRcdHN0b3BQcm9jZXNzaW5nOiBmYWxzZSxcblx0XHRcdFx0XHRcdHNraXBQcm9jZXNzUmF3OiBudWxsLFxuXHRcdFx0XHRcdFx0c2tpcFVwbG9hZDogbnVsbCxcblx0XHRcdFx0XHRcdGFsbFdvcmtGaW5pc2hlZDogZmFsc2Vcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHQvLyBjYWxsSW5pdEZpbGUgbWF5IHNldCBmaWxlQ29udGFpbmVyJ3MgaW50ZXJuYWwgc3RvcFByb2Nlc3NpbmcgZmxhZywgb3IgYW55IG9mIHRoZSBvdGhlcnMuXG5cdFx0XHRcdFx0Ly8gU28gaXQncyBwb3NzaWJsZSBmb3IgY2FsbEluaXRGaWxlIHRvIGFjdCBhcyBhIGdhdGVrZWVwZXIsIHJlamVjdGluZyB0aGUgZHJvcHBlZCBmaWxlXG5cdFx0XHRcdFx0Ly8gYW5kIGhhbHRpbmcgYW55IGFkZGl0aW9uYWwgcHJvY2Vzc2luZywgb3IgaXQgY2FuIGRlY2lkZSB3aGV0aGVyIHRvIHJlYWQgYW5kIHByb2Nlc3Ncblx0XHRcdFx0XHQvLyB0aGlzIGZpbGUgbG9jYWxseSwgb3IgdXBsb2FkIGl0IHRvIHRoZSBzZXJ2ZXIsIG9yIGV2ZW4gYm90aC5cblx0XHRcdFx0XHQvLyBBbm90aGVyIHRyaWNrOiBjYWxsSW5pdEZpbGUgbWF5IHN3YXAgaW4gYSBjdXN0b20gUHJvZ3Jlc3NCYXIgb2JqZWN0IGp1c3QgZm9yIHRoaXMgZmlsZSxcblx0XHRcdFx0XHQvLyBzbyBtdWx0aXBsZSBmaWxlcyBjYW4gaGF2ZSB0aGVpciBvd24gc2VwYXJhdGUgcHJvZ3Jlc3MgYmFycywgd2hpbGUgdGhleSBhcmUgYWxsIHVwbG9hZGVkXG5cdFx0XHRcdFx0Ly8gaW4gcGFyYWxsZWwuXG5cdFx0XHRcdFx0dC5jYWxsSW5pdEZpbGUuY2FsbCh0LCBmaWxlQ29udGFpbmVyKTtcblx0XHRcdFx0XHRpZiAoZmlsZUNvbnRhaW5lci5zdG9wUHJvY2Vzc2luZykgeyBmaWxlQ29udGFpbmVyLmFsbFdvcmtGaW5pc2hlZCA9IHRydWU7IHJldHVybjsgfVxuXG5cdFx0XHRcdFx0dC5jYWxsUHJvY2Vzc1Jhdy5jYWxsKHQsIGZpbGVDb250YWluZXIpO1xuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXHRcdH1cblxuXG5cdFx0Ly8gSWYgdGhlcmUgaXMgYSBmaWxlSW5pdEZuIHNldCwgY2FsbCBpdCB3aXRoIHRoZSBnaXZlbiBGaWxlRHJvcFpvbmVGaWxlQ29udGFpbmVyLlxuXHRcdGNhbGxJbml0RmlsZShmaWxlQ29udGFpbmVyOiBGaWxlRHJvcFpvbmVGaWxlQ29udGFpbmVyKSB7XG5cdFx0XHRpZiAodHlwZW9mIHRoaXMuZmlsZUluaXRGbiA9PT0gXCJmdW5jdGlvblwiKSB7XG5cdFx0XHRcdHRoaXMuZmlsZUluaXRGbihmaWxlQ29udGFpbmVyKTtcblx0XHRcdH1cblx0XHR9XG5cblxuXHRcdC8vIElmIHByb2Nlc3NSYXdGbiBpcyBkZWZpbmVkLCB3ZSByZWFkIHRoZSBlbnRpcmUgZmlsZSBpbnRvIGEgdmFyaWFibGUsXG5cdFx0Ly8gdGhlbiBwYXNzIHRoYXQgdG8gcHJvY2Vzc1Jhd0ZuIGFsb25nIHdpdGggdGhlIEZpbGVEcm9wWm9uZUZpbGVDb250YWluZXIgb2JqZWN0LlxuXHRcdC8vIEZpbGVEcm9wWm9uZUZpbGVDb250YWluZXIncyBjb250ZW50cyBtaWdodCBiZSBtb2RvZmllZCAtIHNwZWNpZmljYWxseSwgdGhlIGZsYWdzIC0gc28gd2UgY2hlY2sgdGhlbSBhZnRlcndhcmRzXG5cdFx0Ly8gdG8gZGVjaWRlIGhvdyB0byBwcm9jZWVkLlxuXHRcdGNhbGxQcm9jZXNzUmF3KGZpbGVDb250YWluZXI6IEZpbGVEcm9wWm9uZUZpbGVDb250YWluZXIpIHtcblx0XHRcdHZhciB0ID0gdGhpcztcblx0XHRcdGlmICh0eXBlb2YgdGhpcy5wcm9jZXNzUmF3Rm4gPT09IFwiZnVuY3Rpb25cIiAmJiAhZmlsZUNvbnRhaW5lci5za2lwUHJvY2Vzc1Jhdykge1xuXHRcdFx0XHRmaWxlQ29udGFpbmVyLmZpbGUucmVhZCh7XG5cdFx0XHRcdFx0Ly9zdGFydDogNSxcblx0XHRcdFx0XHQvL2VuZDogLTEwLFxuXHRcdFx0XHRcdC8vZnVuYzogJ2NwMTI1MScsXG5cdFx0XHRcdFx0b25Eb25lOiBmdW5jdGlvbihzdHIpIHtcblx0XHRcdFx0XHRcdHQucHJvY2Vzc1Jhd0ZuKGZpbGVDb250YWluZXIsIHN0cik7XG5cdFx0XHRcdFx0XHRpZiAoIWZpbGVDb250YWluZXIuc3RvcFByb2Nlc3NpbmcgJiYgIWZpbGVDb250YWluZXIuc2tpcFVwbG9hZCkge1xuXHRcdFx0XHRcdFx0XHR0LnVwbG9hZEZpbGUuY2FsbCh0LCBmaWxlQ29udGFpbmVyKTtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdGZpbGVDb250YWluZXIuYWxsV29ya0ZpbmlzaGVkID0gdHJ1ZTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdG9uRXJyb3I6IGZ1bmN0aW9uKGUpIHtcblx0XHRcdFx0XHRcdGFsZXJ0KCdGYWlsZWQgdG8gcmVhZCB0aGUgZmlsZSEgRXJyb3I6ICcgKyBlLmZkRXJyb3IpXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRmdW5jOiAndGV4dCdcblx0XHRcdFx0fSlcblx0XHRcdC8vIE5vIG5lZWQgdG8gY2hlY2sgc3RvcFByb2Nlc3NpbmcgLSB0aGVyZSdzIG5vIHdheSBpdCBjb3VsZCBoYXZlIGJlZW4gbW9kaWZpZWQgc2luY2UgdGhlIGxhc3Qgc3RlcC5cblx0XHRcdH0gZWxzZSBpZiAoIWZpbGVDb250YWluZXIuc2tpcFVwbG9hZCkge1xuXHRcdFx0XHR0aGlzLnVwbG9hZEZpbGUoZmlsZUNvbnRhaW5lcik7XG5cdFx0XHR9XG5cdFx0fVxuXG5cblx0XHR1cGxvYWRGaWxlKGZpbGVDb250YWluZXI6IEZpbGVEcm9wWm9uZUZpbGVDb250YWluZXIpIHtcblxuXHRcdFx0dmFyIHQgPSB0aGlzO1xuXHRcdFx0dmFyIGYgPSBmaWxlQ29udGFpbmVyLmZpbGU7XG5cdFx0XHQvLyBJZiBubyB1cmwgaGFzIGJlZW4gZGVmaW5lZCwgd2UgaGF2ZSB0byBzdG9wIGhlcmUuXG5cdFx0XHRpZiAodHlwZW9mIHRoaXMudXJsICE9PSAnc3RyaW5nJykgeyBmaWxlQ29udGFpbmVyLmFsbFdvcmtGaW5pc2hlZCA9IHRydWU7IHJldHVybjsgfVxuXG5cdFx0XHQvLyBGcm9tIHRoaXMgcG9pbnQgb24gd2UgYXNzdW1lIHdlJ3JlIHVwbG9hZGluZyB0aGUgZmlsZSxcblx0XHRcdC8vIHNvIHdlIHNldCB1cCB0aGUgcHJvZ3Jlc3NCYXIgYW5kIGNhbGxiYWNrIGV2ZW50cyBiZWZvcmUgdHJpZ2dlcmluZyB0aGUgY2FsbCB0byB1cGxvYWQuXG5cdFx0XHRmLmV2ZW50KCdkb25lJywgZnVuY3Rpb24oeGhyKSB7XG5cdFx0XHRcdHZhciByZXN1bHQgPSBqUXVlcnkucGFyc2VKU09OKHhoci5yZXNwb25zZVRleHQpO1xuXHRcdFx0XHRpZiAocmVzdWx0LnB5dGhvbl9lcnJvcikge1xuXHRcdFx0XHRcdGFsZXJ0KHJlc3VsdC5weXRob25fZXJyb3IpO1x0Ly8gVE9ETzogVGhpcyBpcyBhIGJpdCBleHRyZW1lLiBNaWdodCB3YW50IHRvIGp1c3QgcGFzcyBpdCB0byB0aGUgY2FsbGJhY2suXG5cdFx0XHRcdH0gZWxzZSBpZiAodHlwZW9mIHQucHJvY2Vzc1Jlc3BvbnNlRm4gPT09IFwiZnVuY3Rpb25cIikge1xuXHRcdFx0XHRcdHQucHJvY2Vzc1Jlc3BvbnNlRm4oZmlsZUNvbnRhaW5lciwgcmVzdWx0KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRmaWxlQ29udGFpbmVyLmFsbFdvcmtGaW5pc2hlZCA9IHRydWU7XG5cdFx0XHR9KTtcblxuXHRcdFx0Zi5ldmVudCgnZXJyb3InLCBmdW5jdGlvbihlLCB4aHIpIHtcblx0XHRcdFx0Ly8gVE9ETzogQWdhaW4sIGhlYXZ5IGhhbmRlZC4gTWlnaHQgd2FudCB0byBqdXN0IGVtYmVkIHRoaXMgaW4gRmlsZURyb3Bab25lRmlsZUNvbnRhaW5lclxuXHRcdFx0XHQvLyBhbmQgbWFrZSBhbiBlcnJvciBoYW5kbGVyIGNhbGxiYWNrLlxuXHRcdFx0XHRhbGVydCgnRXJyb3IgdXBsb2FkaW5nICcgKyBmLm5hbWUgKyAnOiAnICsgeGhyLnN0YXR1cyArICcsICcgKyB4aHIuc3RhdHVzVGV4dCk7XG5cdFx0XHRcdGZpbGVDb250YWluZXIuYWxsV29ya0ZpbmlzaGVkID0gdHJ1ZTtcblx0XHRcdH0pO1xuXG5cdFx0XHRmLmV2ZW50KCd4aHJTZXR1cCcsIGZ1bmN0aW9uKHhocikge1xuXHRcdFx0XHQvLyBUaGlzIGVuc3VyZXMgdGhhdCB0aGUgQ1NSRiBtaWRkbGV3YXJlIGluIERqYW5nbyBkb2Vzbid0IHJlamVjdCBvdXIgSFRUUCByZXF1ZXN0LlxuXHRcdFx0XHR4aHIuc2V0UmVxdWVzdEhlYWRlcihcIlgtQ1NSRlRva2VuXCIsIHQuY3NyZnRva2VuKTtcblx0XHRcdFx0Ly8gV2Ugd2FudCB0byBwYXNzIGFsb25nIG91ciBvd24gZ3Vlc3MgYXQgdGhlIGZpbGUgdHlwZSwgc2luY2UgaXQncyBiYXNlZCBvbiBhIG1vcmUgc3BlY2lmaWMgc2V0IG9mIGNyaXRlcmlhLlxuXHRcdFx0XHR4aHIuc2V0UmVxdWVzdEhlYWRlcignWC1FREQtRmlsZS1UeXBlJywgZmlsZUNvbnRhaW5lci5maWxlVHlwZSlcblx0XHRcdH0pO1xuXG5cdFx0XHRmLmV2ZW50KCdzZW5kWEhSJywgZnVuY3Rpb24oKSB7XG5cdFx0XHRcdGlmIChmaWxlQ29udGFpbmVyLnByb2dyZXNzQmFyKSB7XG5cdFx0XHRcdFx0ZmlsZUNvbnRhaW5lci5wcm9ncmVzc0Jhci5zZXRQcm9ncmVzcygwKTtcblx0XHRcdFx0fVxuXHRcdFx0fSlcblxuXHRcdFx0Ly8gVXBkYXRlIHByb2dyZXNzIHdoZW4gYnJvd3NlciByZXBvcnRzIGl0OlxuXHRcdFx0Zi5ldmVudCgncHJvZ3Jlc3MnLCBmdW5jdGlvbihjdXJyZW50LCB0b3RhbCkge1xuXHRcdFx0XHRpZiAoZmlsZUNvbnRhaW5lci5wcm9ncmVzc0Jhcikge1xuXHRcdFx0XHRcdHZhciB3aWR0aCA9IGN1cnJlbnQgLyB0b3RhbCAqIDEwMDtcblx0XHRcdFx0XHRmaWxlQ29udGFpbmVyLnByb2dyZXNzQmFyLnNldFByb2dyZXNzKHdpZHRoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSlcblxuXHRcdFx0Zi5zZW5kVG8odGhpcy51cmwpO1xuXHRcdH1cblx0fVxuXG5cblxuXHQvLyBTVkctcmVsYXRlZCB1dGlsaXRpZXMuXG5cdGV4cG9ydCBjbGFzcyBTVkcge1xuXG5cdFx0c3RhdGljIGNyZWF0ZVNWRyh3aWR0aDphbnksIGhlaWdodDphbnksIGJveFdpZHRoOm51bWJlciwgYm94SGVpZ2h0Om51bWJlcik6U1ZHRWxlbWVudCB7XG5cdFx0XHR2YXIgc3ZnRWxlbWVudDpTVkdFbGVtZW50ID0gPFNWR0VsZW1lbnQ+ZG9jdW1lbnQuY3JlYXRlRWxlbWVudE5TKFNWRy5fbmFtZXNwYWNlLCBcInN2Z1wiKTtcblx0XHRcdHN2Z0VsZW1lbnQuc2V0QXR0cmlidXRlKCd2ZXJzaW9uJywgJzEuMicpO1xuXHRcdFx0c3ZnRWxlbWVudC5zZXRBdHRyaWJ1dGUoJ3dpZHRoJywgd2lkdGgudG9TdHJpbmcoKSk7XG5cdFx0XHRzdmdFbGVtZW50LnNldEF0dHJpYnV0ZSgnaGVpZ2h0JywgaGVpZ2h0LnRvU3RyaW5nKCkpO1xuXHRcdFx0c3ZnRWxlbWVudC5zZXRBdHRyaWJ1dGUoJ3ZpZXdCb3gnLCAnMCAwICcgKyBib3hXaWR0aCArICcgJyArIGJveEhlaWdodCk7XG5cdFx0XHRzdmdFbGVtZW50LnNldEF0dHJpYnV0ZSgncHJlc2VydmVBc3BlY3RSYXRpbycsICdub25lJyk7XG5cdFx0XHRyZXR1cm4gc3ZnRWxlbWVudDtcblx0XHR9XG5cblxuXHRcdC8vIENyZWF0ZXMgYSB2ZXJ0aWNhbCBsaW5lIGNlbnRlcmVkIG9uICh4Q29vcmQseUNvb3JkKS5cblx0XHRzdGF0aWMgY3JlYXRlVmVydGljYWxMaW5lUGF0aCh4Q29vcmQ6bnVtYmVyLCB5Q29vcmQ6bnVtYmVyLCBsaW5lV2lkdGg6bnVtYmVyLCBsaW5lSGVpZ2h0Om51bWJlciwgY29sb3I6Q29sb3IsIHN2Z0VsZW1lbnQ6YW55KTpTVkdFbGVtZW50IHtcblx0XHRcdHZhciBoYWxmV2lkdGg6bnVtYmVyID0gbGluZVdpZHRoIC8gMjtcblxuXHRcdFx0dmFyIHRvcFk6bnVtYmVyID0gTWF0aC5mbG9vcih5Q29vcmQgLSBsaW5lSGVpZ2h0LzIpO1xuXHRcdFx0dmFyIGJvdHRvbVk6bnVtYmVyID0gTWF0aC5mbG9vcih5Q29vcmQgKyBsaW5lSGVpZ2h0LzIpO1xuXHRcdFx0dmFyIG1pZFg6bnVtYmVyID0gTWF0aC5mbG9vcih4Q29vcmQgKyBoYWxmV2lkdGgpO1xuXHRcdFx0dmFyIGVsID0gU1ZHLmNyZWF0ZUxpbmUoIG1pZFgsIHRvcFksIG1pZFgsIGJvdHRvbVksIGNvbG9yLCBsaW5lV2lkdGgpO1xuXHRcdCAgICAvLyQoZWwpLmNzcygnc3Ryb2tlLWxpbmVjYXAnLCAncm91bmQnKTtcblxuXHRcdFx0aWYgKHN2Z0VsZW1lbnQpXG5cdFx0ICAgIFx0c3ZnRWxlbWVudC5hcHBlbmRDaGlsZChlbCk7XG5cblx0XHQgICAgcmV0dXJuIGVsO1xuXHRcdH1cblxuXG5cdFx0c3RhdGljIGNyZWF0ZUxpbmUoeDE6bnVtYmVyLCB5MTpudW1iZXIsIHgyOm51bWJlciwgeTI6bnVtYmVyLCBjb2xvcj86Q29sb3IsIHdpZHRoPzpudW1iZXIpOlNWR0VsZW1lbnQge1xuICAgIFx0XHR2YXIgZWwgPSA8U1ZHRWxlbWVudD5kb2N1bWVudC5jcmVhdGVFbGVtZW50TlMoU1ZHLl9uYW1lc3BhY2UsICdsaW5lJyk7XG5cdFx0XHRcblx0XHRcdGVsLnNldEF0dHJpYnV0ZSgneDEnLCB4MS50b1N0cmluZygpKTtcblx0XHRcdGVsLnNldEF0dHJpYnV0ZSgneTEnLCB5MS50b1N0cmluZygpKTtcblx0XHRcdGVsLnNldEF0dHJpYnV0ZSgneDInLCB4Mi50b1N0cmluZygpKTtcblx0XHRcdGVsLnNldEF0dHJpYnV0ZSgneTInLCB5Mi50b1N0cmluZygpKTtcblxuXHRcdFx0aWYgKGNvbG9yKVxuXHRcdFx0XHQkKGVsKS5jc3MoJ3N0cm9rZScsIGNvbG9yLnRvU3RyaW5nKCkpO1xuXG5cdFx0XHRpZiAod2lkdGgpXG5cdFx0XHRcdCQoZWwpLmNzcygnc3Ryb2tlLXdpZHRoJywgd2lkdGgudG9TdHJpbmcoKSk7XG5cblx0XHQgICAgcmV0dXJuIGVsO1xuXHRcdH1cblxuXG5cdFx0c3RhdGljIGNyZWF0ZVJlY3QoeDpudW1iZXIsIHk6bnVtYmVyLCB3aWR0aDpudW1iZXIsIGhlaWdodDpudW1iZXIsIGZpbGxDb2xvcjpDb2xvciwgc3Ryb2tlV2lkdGg/Om51bWJlciwgc3Ryb2tlQ29sb3I/OkNvbG9yLCBvcGFjaXR5PzpudW1iZXIpOlNWR0VsZW1lbnQge1xuXG5cdFx0XHQvLyBEZWZhdWx0IHZhbHVlcy5cblx0XHRcdHN0cm9rZVdpZHRoID0gKHR5cGVvZihzdHJva2VXaWR0aCkgIT09ICd1bmRlZmluZWQnID8gc3Ryb2tlV2lkdGggOiAwKTtcblxuXHRcdFx0aWYgKCFzdHJva2VDb2xvcilcblx0XHRcdFx0c3Ryb2tlQ29sb3IgPSBDb2xvci5ibGFjaztcblxuXHRcdFx0b3BhY2l0eSA9ICh0eXBlb2Yob3BhY2l0eSkgIT09ICd1bmRlZmluZWQnID8gb3BhY2l0eSA6IDEpO1xuXG4gICAgXHRcdHZhciBlbCA9IDxTVkdFbGVtZW50PmRvY3VtZW50LmNyZWF0ZUVsZW1lbnROUyhTVkcuX25hbWVzcGFjZSwgJ3JlY3QnKTtcblxuICAgIFx0XHQvLyBNYWtlIHN1cmUgd2lkdGggYW5kIGhlaWdodCBhcmUgcG9zaXRpdmUuXG4gICAgXHRcdGlmIChoZWlnaHQgPCAwKSB7XG4gICAgXHRcdFx0eSArPSBoZWlnaHQ7XG4gICAgXHRcdFx0aGVpZ2h0ID0gLWhlaWdodDtcbiAgICBcdFx0fVxuXG4gICAgXHRcdGlmICh3aWR0aCA8IDApIHtcbiAgICBcdFx0XHR4ICs9IGhlaWdodDtcbiAgICBcdFx0XHR3aWR0aCA9IC13aWR0aDtcbiAgICBcdFx0fVxuXG4gICAgXHRcdGVsLnNldEF0dHJpYnV0ZSgneCcsIHgudG9TdHJpbmcoKSk7XG4gICAgXHRcdGVsLnNldEF0dHJpYnV0ZSgneScsIHkudG9TdHJpbmcoKSk7XG4gICAgXHRcdGVsLnNldEF0dHJpYnV0ZSgnd2lkdGgnLCB3aWR0aC50b1N0cmluZygpKTtcbiAgICBcdFx0ZWwuc2V0QXR0cmlidXRlKCdoZWlnaHQnLCBoZWlnaHQudG9TdHJpbmcoKSk7XG5cbiAgICBcdFx0aWYgKHR5cGVvZihzdHJva2VXaWR0aCkgIT09ICd1bmRlZmluZWQnKVxuICAgIFx0XHRcdCQoZWwpLmNzcygnc3Ryb2tlLXdpZHRoJywgc3Ryb2tlV2lkdGgpO1xuXG4gICAgXHRcdGlmICh0eXBlb2Yoc3Ryb2tlQ29sb3IpICE9PSAndW5kZWZpbmVkJylcbiAgICBcdFx0XHQkKGVsKS5jc3MoJ3N0cm9rZScsIHN0cm9rZUNvbG9yLnRvU3RyaW5nKCkpO1xuXG4gICAgXHRcdGlmICh0eXBlb2Yob3BhY2l0eSkgIT09ICd1bmRlZmluZWQnKVxuICAgIFx0XHRcdCQoZWwpLmNzcygnb3BhY2l0eScsIG9wYWNpdHkpO1xuXG4gICAgXHRcdGlmICh0eXBlb2YoZmlsbENvbG9yKSAhPT0gJ3VuZGVmaW5lZCcpXG4gICAgXHRcdFx0JChlbCkuY3NzKCdmaWxsJywgZmlsbENvbG9yLnRvU3RyaW5nKCkpO1xuXG4gICAgXHRcdHJldHVybiBlbDtcblxuXHRcdH1cblxuXG5cdFx0c3RhdGljIGNyZWF0ZVRleHQoeDpudW1iZXIsIHk6bnVtYmVyLCB0ZXh0OnN0cmluZywgZm9udE5hbWU/OnN0cmluZywgZm9udFNpemU/Om51bWJlciwgY2VudGVyZWRPblg/OmJvb2xlYW4sIGNvbG9yPzpDb2xvcik6U1ZHRWxlbWVudCB7XG4gICAgXHRcdHZhciBlbCA9IDxTVkdFbGVtZW50PmRvY3VtZW50LmNyZWF0ZUVsZW1lbnROUyhTVkcuX25hbWVzcGFjZSwgJ3RleHQnKTtcblxuICAgIFx0XHRlbC5zZXRBdHRyaWJ1dGUoJ3gnLCB4LnRvU3RyaW5nKCkpO1xuICAgIFx0XHRlbC5zZXRBdHRyaWJ1dGUoJ3knLCB5LnRvU3RyaW5nKCkpO1xuXG4gICAgXHRcdGlmIChmb250TmFtZSlcbiAgICBcdFx0XHRlbC5zZXRBdHRyaWJ1dGUoJ2ZvbnQtZmFtaWx5JywgZm9udE5hbWUpO1xuICAgIFx0XHRlbHNlXG4gICAgXHRcdFx0ZWwuc2V0QXR0cmlidXRlKCdmb250LWZhbWlseScsIFwiVmVyZGFuYVwiKTtcblxuICAgIFx0XHRpZiAoZm9udFNpemUpXG4gICAgXHRcdFx0ZWwuc2V0QXR0cmlidXRlKCdmb250LXNpemUnLCBmb250U2l6ZS50b1N0cmluZygpKTtcbiAgICBcdFx0ZWxzZVxuICAgIFx0XHRcdGVsLnNldEF0dHJpYnV0ZSgnZm9udC1zaXplJywgXCIxMlwiKTtcblxuICAgIFx0XHRlbC50ZXh0Q29udGVudCA9IHRleHQ7XG5cbiAgICBcdFx0Ly8gQ2VudGVyIG9uIFg/P1xuICAgIFx0XHRpZiAoY2VudGVyZWRPblgpXG4gICAgXHRcdFx0ZWwuc2V0QXR0cmlidXRlKCd0ZXh0LWFuY2hvcicsICdtaWRkbGUnKTtcbiAgICBcdFx0ZWxzZVxuICAgIFx0XHRcdGVsLnNldEF0dHJpYnV0ZSgndGV4dC1hbmNob3InLCAnc3RhcnQnKTtcblxuICAgIFx0XHRpZiAoY29sb3IpIHtcbiAgICBcdFx0XHQkKGVsKS5jc3MoJ2ZpbGwnLCBjb2xvci50b1N0cmluZygpKTtcbiAgICBcdFx0fVxuXG4gICAgXHRcdHJldHVybiBlbDtcblx0XHR9XG5cblxuXHRcdC8vIE1vZGlmeSBhIHJlY3QgZWxlbWVudCB0byByb3VuZCBpdHMgY29ybmVycy5cblx0XHRzdGF0aWMgbWFrZVJlY3RSb3VuZGVkKHJlY3QsIHJ4LCByeSkge1xuICAgIFx0XHRyZWN0LnNldEF0dHJpYnV0ZSgncngnLCByeCk7XG4gICAgXHRcdHJlY3Quc2V0QXR0cmlidXRlKCdyeScsIHJ5KTtcblx0XHR9XG5cblx0XHRwcml2YXRlIHN0YXRpYyBfbmFtZXNwYWNlOnN0cmluZyA9IFwiaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmdcIjtcblxuXHR9XG5cbn0gLy8gZW5kIG1vZHVsZSBVdGxcblxuIl19