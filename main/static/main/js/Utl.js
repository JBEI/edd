// File last modified on: Wed Dec 21 2016 14:53:35  
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
    }());
    Utl.EDD = EDD;
    var Tabs = (function () {
        function Tabs() {
        }
        // Set up click-to-browse tabs
        Tabs.prepareTabs = function () {
            // declare the click handler at the document level, then filter to any link inside a .tab
            $(document).on('click', '.tabBar span:not(.active)', function (e) {
                var targetTab = $(e.target).closest('span');
                var activeTabs = targetTab.closest('div.tabBar').children('span.active');
                activeTabs.removeClass('active');
                targetTab.addClass('active');
                var targetTabContentID = targetTab.attr('for');
                var activeTabEls = activeTabs.get();
                if (targetTabContentID) {
                    // Hide the content section for whatever tabs were active, then show the one selected
                    for (var i = 0; i < activeTabEls.length; i++) {
                        var a = activeTabEls[i];
                        var tabContentID = $(a).attr('for');
                        if (tabContentID) {
                            $('#' + tabContentID).addClass('off');
                        }
                    }
                    $('#' + targetTabContentID).removeClass('off');
                }
            });
        };
        return Tabs;
    }());
    Utl.Tabs = Tabs;
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
    }());
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
    }());
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
    }());
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
                return 'xlsx';
            }
            if (t === 'text/csv') {
                return 'csv';
            }
            if (t === 'text/xml') {
                return 'xml';
            }
            if ((n.indexOf('.xlsx', n.length - 5) !== -1) || (n.indexOf('.xls', n.length - 4) !== -1)) {
                return 'xlsx';
            }
            if (n.indexOf('.xml', n.length - 4) !== -1) {
                return 'xml';
            }
            if (t === 'text/plain') {
                return 'txt';
            }
            if (n.indexOf('.txt', n.length - 4) !== -1) {
                return 'txt';
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
    }());
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
    }());
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
                        extraHeaders: {},
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
                $.each(fileContainer.extraHeaders, function (name, value) {
                    xhr.setRequestHeader('X-EDD-' + name, value);
                });
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
    }());
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
    }());
    Utl.SVG = SVG;
})(Utl || (Utl = {})); // end module Utl
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiVXRsLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiVXRsLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLG9EQUFvRDtBQUNwRCxxREFBcUQ7QUFHckQsbUVBQW1FO0FBRW5FLElBQU8sR0FBRyxDQTQwQlQ7QUE1MEJELFdBQU8sR0FBRyxFQUFDLENBQUM7SUFFWDtRQUFBO1FBNkNBLENBQUM7UUEzQ08sa0NBQThCLEdBQXJDLFVBQXNDLGlCQUF3QztZQUU3RSxJQUFJLEtBQUssR0FBRyxFQUFFLENBQUM7WUFDZixxRUFBcUU7WUFDckUsSUFBSSxHQUFHLEdBQUcsaUJBQWlCLENBQUMsR0FBRyxDQUFDO1lBQ2hDLEVBQUUsQ0FBQyxDQUFDLEdBQUcsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUNkLElBQUksUUFBUSxHQUFHLEVBQUUsQ0FBQztnQkFDbEIsSUFBSSxNQUFNLEdBQUcsaUJBQWlCLENBQUMsRUFBRSxDQUFDO2dCQUNsQyxFQUFFLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO29CQUNaLElBQUksT0FBTyxHQUFHLE9BQU8sQ0FBQywyQkFBMkIsQ0FBQyxNQUFNLENBQUMsQ0FBQztvQkFDMUQsRUFBRSxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQzt3QkFDYixRQUFRLEdBQUcsT0FBTyxDQUFDLEVBQUUsR0FBRyxHQUFHLENBQUM7b0JBQzdCLENBQUM7Z0JBQ0YsQ0FBQztnQkFDUSxJQUFJLE9BQU8sR0FBRyxPQUFPLENBQUMsZUFBZSxDQUFDLGlCQUFpQixDQUFDLEVBQUUsQ0FBQyxDQUFDO2dCQUM1RCxLQUFLLEdBQUcsUUFBUSxHQUFHLE9BQU8sQ0FBQyxJQUFJLENBQUM7WUFDdkMsQ0FBQztZQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxHQUFHLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDZixLQUFLLEdBQUcsT0FBTyxDQUFDLFNBQVMsQ0FBQyxpQkFBaUIsQ0FBQyxFQUFFLENBQUMsQ0FB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c291cmNlc0NvbnRlbnQiOlsiLy8gRmlsZSBsYXN0IG1vZGlmaWVkIG9uOiBXZWQgRGVjIDIxIDIwMTYgMTQ6NTM6MzUgIFxuLy8vIDxyZWZlcmVuY2UgcGF0aD1cInR5cGVzY3JpcHQtZGVjbGFyYXRpb25zLmQudHNcIiAvPlxuXG5cbi8vIFRoaXMgZmlsZSBjb250YWlucyB2YXJpb3VzIHV0aWxpdHkgY2xhc3NlcyB1bmRlciB0aGUgVXRsIG1vZHVsZS5cblxubW9kdWxlIFV0bCB7XG5cblx0ZXhwb3J0IGNsYXNzIEVERCB7XG5cblx0XHRzdGF0aWMgcmVzb2x2ZU1lYXN1cmVtZW50UmVjb3JkVG9OYW1lKG1lYXN1cmVtZW50UmVjb3JkOkFzc2F5TWVhc3VyZW1lbnRSZWNvcmQpOnN0cmluZyB7XG5cblx0XHRcdHZhciBtTmFtZSA9ICcnO1xuXHRcdFx0Ly8gV2UgZmlndXJlIG91dCB0aGUgbmFtZSBhbmQgdW5pdHMgZGlmZmVyZW50bHkgYmFzZWQgb24gdGhlIHN1YnR5cGUuXG5cdFx0XHR2YXIgbXN0ID0gbWVhc3VyZW1lbnRSZWNvcmQubXN0O1xuXHRcdFx0aWYgKG1zdCA9PSAxKSB7XHQvLyBNZXRhYm9saXRlIHR5cGUuICBNYWdpYyBudW1iZXJzLiAgRVchICBUT0RPOiBFZWVldyFcblx0XHRcdFx0dmFyIGNvbXBOYW1lID0gJyc7XG5cdFx0XHRcdHZhciBjb21wSUQgPSBtZWFzdXJlbWVudFJlY29yZC5tcTtcblx0XHRcdFx0aWYgKGNvbXBJRCkge1xuXHRcdFx0XHRcdHZhciBjUmVjb3JkID0gRURERGF0YS5NZWFzdXJlbWVudFR5cGVDb21wYXJ0bWVudHNbY29tcElEXTtcblx0XHRcdFx0XHRpZiAoY1JlY29yZCkge1xuXHRcdFx0XHRcdFx0Y29tcE5hbWUgPSBjUmVjb3JkLnNuICsgJyAnO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuICAgICAgICAgICAgXHR2YXIgbVJlY29yZCA9IEVERERhdGEuTWV0YWJvbGl0ZVR5cGVzW21lYXN1cmVtZW50UmVjb3JkLm10XTtcbiAgICAgICAgICAgIFx0bU5hbWUgPSBjb21wTmFtZSArIG1SZWNvcmQubmFtZTtcblx0XHQgICAgfSBlbHNlIGlmIChtc3QgPT0gMikge1x0Ly8gR2VuZSB0eXBlLiAgRVdXIEVXV1xuICAgICAgICAgICAgXHRtTmFtZSA9IEVERERhdGEuR2VuZVR5cGVzW21lYXN1cmVtZW50UmVjb3JkLm10XS5uYW1lO1xuXHRcdCAgICB9IGVsc2UgaWYgKG1zdCA9PSAzKSB7XHQvLyBQcm90ZWluIHR5cGUuICBFV1cgRVdXXG4gICAgICAgICAgICBcdG1OYW1lID0gRURERGF0YS5Qcm90ZWluVHlwZXNbbWVhc3VyZW1lbnRSZWNvcmQubXRdLm5hbWU7XG5cdFx0ICAgIH1cblx0XHQgICAgcmV0dXJuIG1OYW1lO1xuXHRcdH1cblxuXG5cdFx0c3RhdGljIHJlc29sdmVNZWFzdXJlbWVudFJlY29yZFRvVW5pdHMobWVhc3VyZW1lbnRSZWNvcmQ6QXNzYXlNZWFzdXJlbWVudFJlY29yZCk6c3RyaW5nIHtcblxuXHRcdFx0dmFyIG1Vbml0cyA9ICcnO1xuXHRcdFx0dmFyIG1zdCA9IG1lYXN1cmVtZW50UmVjb3JkLm1zdDtcblx0XHRcdGlmIChtc3QgPT0gMSkge1x0XHQvLyBUT0RPOiBodHRwczovL3d3dy55b3V0dWJlLmNvbS93YXRjaD92PUpsdEVYcGJHTThzXG4gICAgICAgICAgICBcdGlmIChtZWFzdXJlbWVudFJlY29yZC51aWQpIHtcblx0ICAgICAgICAgICAgXHR2YXIgdVJlY29yZCA9IEVERERhdGEuVW5pdFR5cGVzW21lYXN1cmVtZW50UmVjb3JkLnVpZF07XG5cdCAgICAgICAgICAgIFx0aWYgKHVSZWNvcmQpIHtcblx0ICAgICAgICAgICAgXHRcdG1Vbml0cyA9IHVSZWNvcmQubmFtZTtcblx0ICAgICAgICAgICAgXHR9XG5cdFx0ICAgICAgICB9XG5cdFx0ICAgIH0gZWxzZSBpZiAobXN0ID09IDIpIHtcbiAgICAgICAgICAgIFx0bVVuaXRzID0gJyc7XHQvLyBVbml0cyBmb3IgUHJvdGVvbWljcz8gIEFueW9uZT9cblx0XHQgICAgfSBlbHNlIGlmIChtc3QgPT0gMykge1xuICAgICAgICAgICAgXHRtVW5pdHMgPSAnUlBLTSc7XG5cdFx0ICAgIH1cblx0XHQgICAgcmV0dXJuIG1Vbml0cztcblx0XHR9XG5cdH1cblxuXG5cblx0ZXhwb3J0IGNsYXNzIFRhYnMge1xuXHQgICAgLy8gU2V0IHVwIGNsaWNrLXRvLWJyb3dzZSB0YWJzXG5cdCAgICBzdGF0aWMgcHJlcGFyZVRhYnMoKSB7XG5cdCAgICAgICAgLy8gZGVjbGFyZSB0aGUgY2xpY2sgaGFuZGxlciBhdCB0aGUgZG9jdW1lbnQgbGV2ZWwsIHRoZW4gZmlsdGVyIHRvIGFueSBsaW5rIGluc2lkZSBhIC50YWJcblx0ICAgICAgICAkKGRvY3VtZW50KS5vbignY2xpY2snLCAnLnRhYkJhciBzcGFuOm5vdCguYWN0aXZlKScsIChlKSA9PiB7XG5cdCAgICAgICAgICAgIHZhciB0YXJnZXRUYWIgPSAkKGUudGFyZ2V0KS5jbG9zZXN0KCdzcGFuJyk7XG5cdCAgICAgICAgICAgIHZhciBhY3RpdmVUYWJzID0gdGFyZ2V0VGFiLmNsb3Nlc3QoJ2Rpdi50YWJCYXInKS5jaGlsZHJlbignc3Bhbi5hY3RpdmUnKTtcblxuXHQgICAgICAgICAgICBhY3RpdmVUYWJzLnJlbW92ZUNsYXNzKCdhY3RpdmUnKTtcblx0ICAgICAgICAgICAgdGFyZ2V0VGFiLmFkZENsYXNzKCdhY3RpdmUnKTtcblxuXHQgICAgICAgICAgICB2YXIgdGFyZ2V0VGFiQ29udGVudElEID0gdGFyZ2V0VGFiLmF0dHIoJ2ZvcicpO1xuXHQgICAgICAgICAgICB2YXIgYWN0aXZlVGFiRWxzID0gYWN0aXZlVGFicy5nZXQoKTtcblxuXHQgICAgICAgICAgICBpZiAodGFyZ2V0VGFiQ29udGVudElEKSB7XG5cdFx0ICAgICAgICAgICAgLy8gSGlkZSB0aGUgY29udGVudCBzZWN0aW9uIGZvciB3aGF0ZXZlciB0YWJzIHdlcmUgYWN0aXZlLCB0aGVuIHNob3cgdGhlIG9uZSBzZWxlY3RlZFxuXHRcdCAgICAgICAgICAgIGZvciAoIHZhciBpID0gMDsgaSA8IGFjdGl2ZVRhYkVscy5sZW5ndGg7IGkrKyApIHtcblx0XHQgICAgICAgICAgICAgICAgdmFyIGEgPSBhY3RpdmVUYWJFbHNbaV07XG5cdFx0ICAgICAgICAgICAgICAgIHZhciB0YWJDb250ZW50SUQgPSAkKGEpLmF0dHIoJ2ZvcicpO1xuXHRcdCAgICAgICAgICAgICAgICBpZiAodGFiQ29udGVudElEKSB7XG5cdFx0XHQgICAgICAgICAgICAgICAgJCgnIycrdGFiQ29udGVudElEKS5hZGRDbGFzcygnb2ZmJyk7XG5cdFx0XHQgICAgICAgIFx0fVxuXHRcdCAgICAgICAgICAgIH1cblx0XHQgICAgICAgICAgICAkKCcjJyt0YXJnZXRUYWJDb250ZW50SUQpLnJlbW92ZUNsYXNzKCdvZmYnKTtcblx0XHQgICAgXHR9XG5cdCAgICAgICAgfSk7XG5cdCAgICB9XG5cdH1cblxuXG5cblx0ZXhwb3J0IGNsYXNzIFF0aXBIZWxwZXIge1xuXHRcdHB1YmxpYyBjcmVhdGUobGlua0VsZW1lbnQsIGNvbnRlbnRGdW5jdGlvbiwgcGFyYW1zOmFueSk6dm9pZCB7XG5cblx0XHRcdHBhcmFtcy5wb3NpdGlvbi50YXJnZXQgPSAkKGxpbmtFbGVtZW50KTtcblx0XHRcdHBhcmFtcy5wb3NpdGlvbi52aWV3cG9ydCA9ICQod2luZG93KTtcdC8vIFRoaXMgbWFrZXMgaXQgcG9zaXRpb24gaXRzZWxmIHRvIGZpdCBpbnNpZGUgdGhlIGJyb3dzZXIgd2luZG93LlxuXG5cdFx0XHR0aGlzLl9jb250ZW50RnVuY3Rpb24gPSBjb250ZW50RnVuY3Rpb247XG5cblx0XHRcdGlmICghcGFyYW1zLmNvbnRlbnQpXG5cdFx0XHRcdHBhcmFtcy5jb250ZW50ID0ge307XG5cblx0XHRcdHBhcmFtcy5jb250ZW50LnRleHQgPSB0aGlzLl9nZW5lcmF0ZUNvbnRlbnQuYmluZCh0aGlzKTtcblx0XHRcdHRoaXMucXRpcCA9ICQobGlua0VsZW1lbnQpLnF0aXAocGFyYW1zKTtcblx0XHR9XG5cblx0XHRwcml2YXRlIF9nZW5lcmF0ZUNvbnRlbnQoKTphbnkge1xuXHRcdFx0Ly8gSXQncyBpbmNyZWRpYmx5IHN0dXBpZCB0aGF0IHdlIGhhdmUgdG8gZG8gdGhpcyB0byB3b3JrIGFyb3VuZCBxdGlwMidzIDI4MHB4IG1heC13aWR0aCBkZWZhdWx0LlxuXHRcdFx0Ly8gV2UgaGF2ZSB0byBkbyBpdCBoZXJlIHJhdGhlciB0aGFuIGltbWVkaWF0ZWx5IGFmdGVyIGNhbGxpbmcgcXRpcCgpIGJlY2F1c2UgcXRpcCB3YWl0cyB0byBjcmVhdGVcblx0XHRcdC8vIHRoZSBhY3R1YWwgZWxlbWVudC5cblx0XHRcdHZhciBxID0gdGhpcy5fZ2V0UVRpcEVsZW1lbnQoKTtcblx0XHRcdCQocSkuY3NzKCdtYXgtd2lkdGgnLCAnbm9uZScpO1xuXHRcdFx0JChxKS5jc3MoJ3dpZHRoJywgJ2F1dG8nKTtcblxuXHRcdFx0cmV0dXJuIHRoaXMuX2NvbnRlbnRGdW5jdGlvbigpO1xuXHRcdH1cblxuXHRcdC8vIEdldCB0aGUgSFRNTCBlbGVtZW50IGZvciB0aGUgcXRpcC4gVXN1YWxseSB3ZSB1c2UgdGhpcyB0byB1bnNldCBtYXgtd2lkdGguXG5cdFx0cHJpdmF0ZSBfZ2V0UVRpcEVsZW1lbnQoKTpIVE1MRWxlbWVudCB7XG5cdFx0XHRyZXR1cm4gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQodGhpcy5xdGlwLmF0dHIoJ2FyaWEtZGVzY3JpYmVkYnknKSk7XG5cdFx0fVxuXG5cdFx0cHVibGljIHF0aXA6YW55O1xuXHRcdHByaXZhdGUgX2NvbnRlbnRGdW5jdGlvbjphbnk7XG5cdH1cblxuXG5cdC8vIFJHQkEgaGVscGVyIGNsYXNzLlxuXHQvLyBWYWx1ZXMgYXJlIDAtMjU1IChhbHRob3VnaCB0b1N0cmluZygpIG1ha2VzIGFscGhhIDAtMSBzaW5jZSB0aGF0J3MgaG93IENTUyBsaWtlcyBpdCkuXG5cdGV4cG9ydCBjbGFzcyBDb2xvciB7XG5cblx0XHRyOiBudW1iZXI7XG5cdFx0ZzogbnVtYmVyO1xuXHRcdGI6IG51bWJlcjtcblx0XHRhOiBudW1iZXI7XG5cblx0XHQvLyBOb3RlOiBBbGwgdmFsdWVzIGFyZSAwLTI1NSwgYnV0IHRvU3RyaW5nKCkgd2lsbCBjb252ZXJ0IGFscGhhIHRvIGEgMC0xIHZhbHVlXG5cdFx0c3RhdGljIHJnYmEocjpudW1iZXIsIGc6bnVtYmVyLCBiOm51bWJlciwgYWxwaGE6bnVtYmVyKSA6IENvbG9yIHtcblx0XHRcdHZhciBjbHI6Q29sb3IgPSBuZXcgQ29sb3IoKTtcblx0XHRcdGNsci5yID0gcjtcblx0XHRcdGNsci5nID0gZztcblx0XHRcdGNsci5iID0gYjtcblx0XHRcdGNsci5hID0gYWxwaGE7XG5cdFx0XHRyZXR1cm4gY2xyO1xuXHRcdH1cblxuXHRcdC8vIE5vdGU6IEFsbCB2YWx1ZXMgYXJlIDAtMjU1LCBidXQgdG9TdHJpbmcoKSB3aWxsIGNvbnZlcnQgYWxwaGEgdG8gYSAwLTEgdmFsdWVcblx0XHRzdGF0aWMgcmdiKHI6bnVtYmVyLCBnOm51bWJlciwgYjpudW1iZXIpIDogQ29sb3Ige1xuXHRcdFx0dmFyIGNscjpDb2xvciA9IG5ldyBDb2xvcigpO1xuXHRcdFx0Y2xyLnIgPSByO1xuXHRcdFx0Y2xyLmcgPSBnO1xuXHRcdFx0Y2xyLmIgPSBiO1xuXHRcdFx0Y2xyLmEgPSAyNTU7XG5cdFx0XHRyZXR1cm4gY2xyO1xuXHRcdH1cblxuXHRcdHN0YXRpYyBpbnRlcnBvbGF0ZShjbHIxOkNvbG9yLCBjbHIyOkNvbG9yLCB0Om51bWJlcikgOiBDb2xvciB7XG5cdFx0XHRyZXR1cm4gQ29sb3IucmdiYShcblx0XHRcdFx0Y2xyMS5yICsgKGNscjIuciAtIGNscjEucikgKiB0LCBcblx0XHRcdFx0Y2xyMS5nICsgKGNscjIuZyAtIGNscjEuZykgKiB0LCBcblx0XHRcdFx0Y2xyMS5iICsgKGNscjIuYiAtIGNscjEuYikgKiB0LCBcblx0XHRcdFx0Y2xyMS5hICsgKGNscjIuYSAtIGNscjEuYSkgKiB0XG5cdFx0XHQpO1xuXHRcdH1cblxuXHRcdHN0YXRpYyB0b1N0cmluZyhjbHI6YW55KSA6IHN0cmluZyB7XG5cdFx0XHQvLyBJZiBpdCdzIHNvbWV0aGluZyBlbHNlIChsaWtlIGEgc3RyaW5nKSBhbHJlYWR5LCBqdXN0IHJldHVybiB0aGF0IHZhbHVlLlxuXHRcdFx0aWYgKHR5cGVvZiBjbHIgPT0gJ3N0cmluZycpXG5cdFx0XHRcdHJldHVybiBjbHI7XG5cblx0XHRcdHJldHVybiAncmdiYSgnICsgTWF0aC5mbG9vcihjbHIucikgKyAnLCAnICsgTWF0aC5mbG9vcihjbHIuZykgKyAnLCAnICsgTWF0aC5mbG9vcihjbHIuYikgKyAnLCAnICsgY2xyLmEvMjU1ICsgJyknO1xuXHRcdH1cblxuXHRcdHRvU3RyaW5nKCkgOiBzdHJpbmcge1xuXHRcdFx0cmV0dXJuICdyZ2JhKCcgKyBNYXRoLmZsb29yKHRoaXMucikgKyAnLCAnICsgTWF0aC5mbG9vcih0aGlzLmcpICsgJywgJyArIE1hdGguZmxvb3IodGhpcy5iKSArICcsICcgKyB0aGlzLmEvMjU1ICsgJyknO1xuXHRcdH1cblxuXHRcdHN0YXRpYyByZWQgPSBDb2xvci5yZ2IoMjU1LDAsMCk7XG5cdFx0c3RhdGljIGdyZWVuID0gQ29sb3IucmdiKDAsMjU1LDApO1xuXHRcdHN0YXRpYyBibHVlID0gQ29sb3IucmdiKDAsMCwyNTUpO1xuXHRcdHN0YXRpYyBibGFjayA9IENvbG9yLnJnYigwLDAsMCk7XG5cdFx0c3RhdGljIHdoaXRlID0gQ29sb3IucmdiKDI1NSwyNTUsMjU1KTtcblxuXHR9O1xuXG5cblx0ZXhwb3J0IGNsYXNzIFRhYmxlIHtcblxuXHRcdGNvbnN0cnVjdG9yKHRhYmxlSUQ6c3RyaW5nLCB3aWR0aD86bnVtYmVyLCBoZWlnaHQ/Om51bWJlcikge1xuXHRcdFx0dGhpcy50YWJsZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3RhYmxlJyk7XG5cdFx0XHR0aGlzLnRhYmxlLmlkID0gdGFibGVJRDtcblxuXHRcdFx0aWYgKHdpZHRoKVxuXHRcdFx0XHQkKHRoaXMudGFibGUpLmNzcygnd2lkdGgnLCB3aWR0aCk7XG5cblx0XHRcdGlmIChoZWlnaHQpXG5cdFx0XHRcdCQodGhpcy50YWJsZSkuY3NzKCdoZWlnaHQnLCBoZWlnaHQpO1xuXHRcdH1cblxuXHRcdGFkZFJvdygpOkhUTUxUYWJsZVJvd0VsZW1lbnQge1xuXHRcdFx0dmFyIHJvdyA9IHRoaXMudGFibGUuaW5zZXJ0Um93KC0xKTtcblx0XHRcdHRoaXMuX2N1cnJlbnRSb3crKztcblx0XHRcdHJldHVybiA8SFRNTFRhYmxlUm93RWxlbWVudD5yb3c7XG5cdFx0fVxuXG5cdFx0YWRkQ29sdW1uKCk6SFRNTEVsZW1lbnQge1xuXHRcdFx0dmFyIHJvdzpIVE1MVGFibGVSb3dFbGVtZW50ID0gPEhUTUxUYWJsZVJvd0VsZW1lbnQ+dGhpcy50YWJsZS5yb3dzW3RoaXMuX2N1cnJlbnRSb3ctMV07XG5cdFx0XHR2YXIgY29sdW1uOkhUTUxFbGVtZW50ID0gcm93Lmluc2VydENlbGwoLTEpO1xuXHRcdFx0cmV0dXJuIGNvbHVtbjtcblx0XHR9XG5cblx0XHQvLyBXaGVuIHlvdSdyZSBkb25lIHNldHRpbmcgdXAgdGhlIHRhYmxlLCBhZGQgaXQgdG8gYW5vdGhlciBlbGVtZW50LlxuXHRcdGFkZFRhYmxlVG8oZWxlbWVudDpIVE1MRWxlbWVudCkge1xuXHRcdFx0ZWxlbWVudC5hcHBlbmRDaGlsZCh0aGlzLnRhYmxlKTtcblx0XHR9XG5cblx0XHR0YWJsZTpIVE1MVGFibGVFbGVtZW50ID0gbnVsbDtcblx0XHRfY3VycmVudFJvdzpudW1iZXIgPSAwO1xuXHR9XG5cblxuXHQvLyBKYXZhc2NyaXB0IHV0aWxpdGllc1xuXHRleHBvcnQgY2xhc3MgSlMge1xuXG5cdFx0Ly8gVGhpcyBhc3N1bWVzIHRoYXQgc3RyIGhhcyBvbmx5IG9uZSByb290IGVsZW1lbnQuXG5cdFx0Ly8gSXQgYWxzbyBicmVha3MgZm9yIGVsZW1lbnRzIHRoYXQgbmVlZCB0byBiZSBuZXN0ZWQgdW5kZXIgb3RoZXIgc3BlY2lmaWMgZWxlbWVudCB0eXBlcyxcblx0XHQvLyBlLmcuIGlmIHlvdSBhdHRlbXB0IHRvIGNyZWF0ZSBhIDx0ZD4geW91IHdpbGwgYmUgaGFuZGVkIGJhY2sgYSA8ZGl2Pi5cblx0XHRzdGF0aWMgY3JlYXRlRWxlbWVudEZyb21TdHJpbmcoc3RyOnN0cmluZywgbmFtZXNwYWNlOnN0cmluZyA9IG51bGwpOkhUTUxFbGVtZW50IHtcblxuXHRcdFx0dmFyIGRpdjtcblx0XHRcdGlmIChuYW1lc3BhY2UpXG5cdFx0XHRcdGRpdiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnROUyhuYW1lc3BhY2UsICdkaXYnKTtcblx0XHRcdGVsc2Vcblx0XHRcdFx0ZGl2ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cblx0XHRcdGRpdi5pbm5lckhUTUwgPSBzdHI7XG5cdFx0XHRyZXR1cm4gZGl2LmZpcnN0Q2hpbGQ7XG5cblx0XHR9XG5cblxuXHRcdHN0YXRpYyBhc3NlcnQoY29uZGl0aW9uOmJvb2xlYW4sIG1lc3NhZ2U6c3RyaW5nKTp2b2lkIHtcblx0XHQgICAgaWYgKCFjb25kaXRpb24pIHtcbiAgICAgICAgICAgICAgICBtZXNzYWdlID0gbWVzc2FnZSB8fCBcIkFzc2VydGlvbiBmYWlsZWRcIjtcbiAgICAgICAgICAgICAgICBpZiAodHlwZW9mIEVycm9yICE9PSAndW5kZWZpbmVkJykgdGhyb3cgRXJyb3IobWVzc2FnZSk7XG4gICAgICAgICAgICAgICAgZWxzZSB0aHJvdyBtZXNzYWdlO1xuXHRcdCAgICB9XG5cdFx0fVxuXG5cdFx0XG5cdFx0c3RhdGljIGNvbnZlcnRIYXNoVG9MaXN0KGhhc2g6YW55KTphbnkge1xuXHRcdFx0cmV0dXJuIE9iamVjdC5rZXlzKGhhc2gpLm1hcCggZnVuY3Rpb24oYSkge3JldHVybiBoYXNoW2FdO30gKTtcblx0XHR9XG5cblxuXHRcdC8vIFJldHVybnMgYSBzdHJpbmcgb2YgbGVuZ3RoIG51bUNoYXJzLCBwYWRkaW5nIHRoZSByaWdodCBzaWRlXG5cdFx0Ly8gd2l0aCBzcGFjZXMgaWYgc3RyIGlzIHNob3J0ZXIgdGhhbiBudW1DaGFycy5cblx0XHQvLyBXaWxsIHRydW5jYXRlIGlmIHRoZSBzdHJpbmcgaXMgbG9uZ2VyIHRoYW4gbnVtQ2hhcnMuXG5cdFx0c3RhdGljIHBhZFN0cmluZ0xlZnQoc3RyOnN0cmluZywgbnVtQ2hhcnM6bnVtYmVyKTpzdHJpbmcge1xuXHRcdFx0dmFyIHN0YXJ0TGVuOm51bWJlciA9IHN0ci5sZW5ndGg7XG5cdFx0XHRmb3IgKHZhciBpPXN0YXJ0TGVuOyBpIDwgbnVtQ2hhcnM7IGkrKylcblx0XHRcdFx0c3RyICs9ICcgJztcblxuXHRcdFx0cmV0dXJuIHN0ci5zbGljZSgwLCBudW1DaGFycyk7XG5cdFx0fVxuXG5cblx0XHQvLyBSZXR1cm5zIGEgc3RyaW5nIG9mIGxlbmd0aCBudW1DaGFycywgcGFkZGluZyB0aGUgbGVmdCBzaWRlXG5cdFx0Ly8gd2l0aCBzcGFjZXMgaWYgc3RyIGlzIHNob3J0ZXIgdGhhbiBudW1DaGFycy5cblx0XHRzdGF0aWMgcGFkU3RyaW5nUmlnaHQoc3RyOnN0cmluZywgbnVtQ2hhcnM6bnVtYmVyKTpzdHJpbmcge1xuXHRcdFx0dmFyIHBhZFN0ciA9IFwiXCI7XG5cdFx0XHRmb3IgKHZhciBpPTA7IGkgPCBudW1DaGFyczsgaSsrKVxuXHRcdFx0XHRwYWRTdHIgKz0gXCIgXCI7XG5cblx0XHRcdHJldHVybiAocGFkU3RyICsgc3RyKS5zbGljZSgtbnVtQ2hhcnMpO1xuXHRcdH1cblxuXG5cdFx0Ly8gTWFrZSBhIHN0cmluZyBieSByZXBlYXRpbmcgdGhlIHNwZWNpZmllZCBzdHJpbmcgTiB0aW1lcy5cblx0XHRzdGF0aWMgcmVwZWF0U3RyaW5nKHN0cjpzdHJpbmcsIG51bUNoYXJzOm51bWJlcik6c3RyaW5nIHtcblx0XHRcdHZhciByZXQ6c3RyaW5nID0gXCJcIjtcblx0XHRcdGZvciAodmFyIGk6bnVtYmVyPTA7IGkgPCBudW1DaGFyczsgaSsrKVxuXHRcdFx0XHRyZXQgKz0gc3RyO1xuXG5cdFx0XHRyZXR1cm4gcmV0O1xuXHRcdH1cblxuXG5cdFx0Ly8gQ29udmVydCBhIHNpemUgcHJvdmlkZWQgaW4gYnl0ZXMgdG8gYSBuaWNlbHkgZm9ybWF0dGVkIHN0cmluZ1xuXHRcdHN0YXRpYyBzaXplVG9TdHJpbmcoc2l6ZTpudW1iZXIsIGFsbG93Qnl0ZXM/OmJvb2xlYW4pOnN0cmluZyB7XG5cblx0XHRcdHZhciB0YiA9IHNpemUgLyAoMTAyNCAqIDEwMjQgKiAxMDI0ICogMTAyNCk7XG5cdFx0XHRpZiAoKHRiID4gMSkgfHwgKHRiIDwgLTEpKSB7XG5cdFx0XHRcdHJldHVybiBVdGwuSlMubmljZWx5UHJpbnRGbG9hdCh0YiwgMikgKyAnIFRiJztcblx0XHRcdH1cblx0XHRcdHZhciBnaWdzID0gc2l6ZSAvICgxMDI0ICogMTAyNCAqIDEwMjQpO1xuXHRcdFx0aWYgKChnaWdzID4gMSkgfHwgKGdpZ3MgPCAtMSkpIHtcblx0XHRcdFx0cmV0dXJuIFV0bC5KUy5uaWNlbHlQcmludEZsb2F0KGdpZ3MsIDIpICsgJyBHYic7XG5cdFx0XHR9XG5cdFx0XHR2YXIgbWVncyA9IHNpemUgLyAoMTAyNCAqIDEwMjQpO1xuXHRcdFx0aWYgKChtZWdzID4gMSkgfHwgKG1lZ3MgPCAtMSkpIHtcblx0XHRcdFx0cmV0dXJuIFV0bC5KUy5uaWNlbHlQcmludEZsb2F0KG1lZ3MsIDIpICsgJyBNYic7XG5cdFx0XHR9XG5cdFx0XHR2YXIgayA9IHNpemUgLyAxMDI0O1xuXHRcdFx0aWYgKCgoayA+IDEpIHx8IChrIDwgLTEpKSB8fCAhYWxsb3dCeXRlcykge1xuXHRcdFx0XHRyZXR1cm4gVXRsLkpTLm5pY2VseVByaW50RmxvYXQoaywgMikgKyAnIEtiJztcblx0XHRcdH1cblx0XHRcdHJldHVybiBzaXplICsgJyBiJztcblx0XHR9XG5cblxuXHRcdC8vIC0xIDogUHJpbnQgYXMgYSBmdWxsIGZsb2F0XG5cdFx0Ly8gIDAgOiBQcmludCBhcyBhbiBpbnQsIEFMV0FZUyByb3VuZGVkIGRvd24uXG5cdFx0Ly8gK24gOiBQcmludCB3aXRoIG4gZGVjaW1hbCBwbGFjZXMsIFVOTEVTUyB0aGUgdmFsdWUgaXMgYW4gaW50ZWdlclxuXHRcdHN0YXRpYyBuaWNlbHlQcmludEZsb2F0KHY6bnVtYmVyLCBwbGFjZXM6bnVtYmVyKTpzdHJpbmcge1xuXHRcdFx0Ly8gV2UgZG8gbm90IHdhbnQgdG8gZGlzcGxheSBBTlkgZGVjaW1hbCBwb2ludCBpZiB0aGUgdmFsdWUgaXMgYW4gaW50ZWdlci5cblx0XHRcdGlmICh2ICUgMSA9PT0gMCkge1x0Ly8gQmFzaWMgaW50ZWdlciB0ZXN0XG5cdFx0XHRcdHJldHVybiAodiAlIDEpLnRvU3RyaW5nKCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAocGxhY2VzID4gMCkge1xuXHRcdFx0XHRyZXR1cm4gdi50b0ZpeGVkKHBsYWNlcyk7XG5cdFx0XHR9IGVsc2UgaWYgKHBsYWNlcyA9PSAwKSB7XG5cdFx0XHRcdHJldHVybiAodiAlIDEpLnRvU3RyaW5nKCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdi50b1N0cmluZygpO1xuXHRcdH1cblxuXG5cdFx0Ly8gR2l2ZW4gYSBmaWxlIG5hbWUgKG4pIGFuZCBhIGZpbGUgdHlwZSBzdHJpbmcgKHQpLCB0cnkgYW5kIGd1ZXNzIHdoYXQga2luZCBvZiBmaWxlIHdlJ3ZlIGdvdC5cblx0XHRzdGF0aWMgZ3Vlc3NGaWxlVHlwZShuOiBzdHJpbmcsIHQ6IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0XHQvLyBHb2luZyBpbiBvcmRlciBmcm9tIG1vc3QgY29uZmlkZW50IHRvIGxlYXN0IGNvbmZpZGVudCBndWVzc2VzOlxuXHRcdFx0aWYgKHQuaW5kZXhPZignb2ZmaWNlZG9jdW1lbnQuc3ByZWFkc2hlZXQnKSA+PSAwKSB7IHJldHVybiAneGxzeCc7IH1cblx0XHRcdGlmICh0ID09PSAndGV4dC9jc3YnKSB7IHJldHVybiAnY3N2JzsgfVxuXHRcdFx0aWYgKHQgPT09ICd0ZXh0L3htbCcpIHsgcmV0dXJuICd4bWwnOyB9XG5cdFx0XHRpZiAoKG4uaW5kZXhPZignLnhsc3gnLCBuLmxlbmd0aCAtIDUpICE9PSAtMSkgfHwgKG4uaW5kZXhPZignLnhscycsIG4ubGVuZ3RoIC0gNCkgIT09IC0xKSkgeyByZXR1cm4gJ3hsc3gnOyB9XG5cdFx0XHRpZiAobi5pbmRleE9mKCcueG1sJywgbi5sZW5ndGggLSA0KSAhPT0gLTEpIHsgcmV0dXJuICd4bWwnOyB9XG5cdFx0XHRpZiAodCA9PT0gJ3RleHQvcGxhaW4nKSB7IHJldHVybiAndHh0JzsgfVxuXHRcdFx0aWYgKG4uaW5kZXhPZignLnR4dCcsIG4ubGVuZ3RoIC0gNCkgIT09IC0xKSB7IHJldHVybiAndHh0JzsgfVxuXHRcdFx0Ly8gSWYgYWxsIGVsc2UgZmFpbHMsIGFzc3VtZSBpdCdzIGEgY3N2IGZpbGUuICAoU28sIGFueSBleHRlbnNpb24gdGhhdCdzIG5vdCB0cmllZCBhYm92ZSwgb3Igbm8gZXh0ZW5zaW9uLilcblx0XHRcdHJldHVybiAnY3N2Jztcblx0XHR9XG5cblxuXHRcdC8vIEdpdmVuIGEgZGF0ZSBpbiBzZWNvbmRzICh3aXRoIGEgcG9zc2libGUgZnJhY3Rpb25hbCBwb3J0aW9uIGJlaW5nIG1pbGxpc2Vjb25kcyksXG5cdFx0Ly8gYmFzZWQgb24gemVybyBiZWluZyBtaWRuaWdodCBvZiBKYW4gMSwgMTk3MCAoc3RhbmRhcmQgb2xkLXNjaG9vbCBQT1NJWCB0aW1lKSxcblx0XHQvLyByZXR1cm4gYSBzdHJpbmcgZm9ybWF0dGVkIGluIHRoZSBtYW5uZXIgb2YgXCJEZWMgMjEgMjAxMiwgMTE6NDVhbVwiLFxuXHRcdC8vIHdpdGggZXhjZXB0aW9ucyBmb3IgJ1RvZGF5JyBhbmQgJ1llc3RlcmRheScsIGUuZy4gXCJZZXN0ZXJkYXksIDM6MTJwbVwiLlxuXHRcdHN0YXRpYyB0aW1lc3RhbXBUb1RvZGF5U3RyaW5nKHRpbWVzdGFtcDpudW1iZXIpOnN0cmluZyB7XG5cblx0XHRcdC8vIENvZGUgYWRhcHRlZCBmcm9tIFBlcmwncyBIVFRQLURhdGVcblx0XHRcdC8vdmFyIERvVyA9IFsnU3VuJywnTW9uJywnVHVlJywnV2VkJywnVGh1JywnRnJpJywnU2F0J107XG5cdFx0XHR2YXIgTW9ZID0gWydKYW4nLCdGZWInLCdNYXInLCdBcHInLCdNYXknLCdKdW4nLCdKdWwnLCdBdWcnLCdTZXAnLCdPY3QnLCdOb3YnLCdEZWMnXTtcblxuXHRcdFx0aWYgKCF0aW1lc3RhbXAgfHwgdGltZXN0YW1wIDwgMSkge1xuXHRcdFx0XHRyZXR1cm4gJzxzcGFuIHN0eWxlPVwiY29sb3I6Izg4ODtcIj5OL0E8L3NwYW4+Jztcblx0XHRcdH1cblxuXHRcdFx0dmFyIHQgPSBuZXcgRGF0ZShNYXRoLnJvdW5kKHRpbWVzdGFtcCoxMDAwKSk7XG5cdFx0XHR2YXIgbiA9IG5ldyBEYXRlKCk7XG5cdFx0XHR2YXIgbm93ID0gbi5nZXRUaW1lKCk7XG5cblx0XHRcdHZhciBzZWMgPSB0LmdldFNlY29uZHMoKTtcblx0XHRcdHZhciBtaW46YW55ID0gdC5nZXRNaW51dGVzKCk7XHQvLyBUeXBlIFwiYW55XCIgc28gd2UgY2FuIGFkZCBhIGxlYWRpbmcgemVyb1xuXHRcdFx0dmFyIGhvdXIgPSB0LmdldEhvdXJzKCk7XG5cdFx0XHR2YXIgbWRheSA9IHQuZ2V0RGF0ZSgpO1x0XHQvLyBSZXR1cm5zIHRoZSBkYXkgb2YgdGhlIG1vbnRoIChmcm9tIDEtMzEpXG5cdFx0XHR2YXIgbW9uID0gdC5nZXRNb250aCgpO1x0XHQvLyBSZXR1cm5zIHRoZSBtb250aCAoZnJvbSAwLTExKVxuXHRcdFx0dmFyIHllYXIgPSB0LmdldEZ1bGxZZWFyKCk7XHQvLyBSZXR1cm5zIHRoZSB5ZWFyIChmb3VyIGRpZ2l0cylcblx0XHRcdHZhciB3ZGF5ID0gdC5nZXREYXkoKTtcdFx0Ly8gUmV0dXJucyB0aGUgZGF5IG9mIHRoZSB3ZWVrIChmcm9tIDAtNilcblxuXHRcdFx0dmFyIG5zZWMgPSBuLmdldFNlY29uZHMoKTtcblx0XHRcdHZhciBubWluID0gbi5nZXRNaW51dGVzKCk7XG5cdFx0XHR2YXIgbmhvdXIgPSBuLmdldEhvdXJzKCk7XG5cdFx0XHR2YXIgbm1kYXkgPSBuLmdldERhdGUoKTtcblx0XHRcdHZhciBubW9uID0gbi5nZXRNb250aCgpO1xuXHRcdFx0dmFyIG55ZWFyID0gbi5nZXRGdWxsWWVhcigpO1xuXHRcdFx0dmFyIG53ZGF5ID0gbi5nZXREYXkoKTtcblxuXHRcdFx0dmFyIGRheV9zdHI7XG5cblx0XHRcdGlmICgoeWVhciA9PSBueWVhcikgJiYgKG1vbiA9PSBubW9uKSAmJiAobWRheSA9PSBubWRheSkpIHtcblx0XHRcdFx0ZGF5X3N0ciA9ICdUb2RheSc7XG5cdFx0XHR9IGVsc2UgaWYgKFx0ICAgIChub3cgLSAobnNlYyArICg2MCoobm1pbisoNjAqKG5ob3VyKzI0KSkpKSkpID09XHRcdC8vIE5vdydzIGRheSBjb21wb25lbnQgbWludXMgYSBkYXlcblx0XHRcdFx0XHQgICh0aW1lc3RhbXAgLSAoc2VjICArICg2MCoobWluICsoNjAqIGhvdXIgICAgICkpKSkpKVx0IHtcdC8vIFRpbWVzdGFtcCdzIGRheSBjb21wb25lbnRcblx0XHRcdFx0ZGF5X3N0ciA9ICdZZXN0ZXJkYXknO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dmFyIHllYXJfc3RyID0gJyc7XG5cdFx0XHRcdGlmICh5ZWFyICE9IG55ZWFyKSB7XG5cdFx0XHRcdFx0eWVhcl9zdHIgPSAnICcgKyB5ZWFyO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGRheV9zdHIgPSBNb1lbbW9uXSArICcgJyArIG1kYXkgKyB5ZWFyX3N0cjtcblx0XHRcdH1cblxuXHRcdFx0dmFyIGhhbGZfZGF5ID0gJ2FtJztcblx0XHRcdGlmIChob3VyID4gMTEpIHtoYWxmX2RheSA9ICdwbSc7fVxuXHRcdFx0aWYgKGhvdXIgPiAxMikge2hvdXIgLT0gMTI7fVxuXHRcdFx0ZWxzZSBpZiAoaG91ciA9PSAwKSB7aG91ciA9IDEyO31cblx0XHRcdGlmIChtaW4gPCA5KSB7bWluID0gJzAnK21pbjt9XG5cblx0XHRcdHJldHVybiBkYXlfc3RyICsgJywgJyArIGhvdXIgKyAnOicgKyBtaW4gKyBoYWxmX2RheTtcblx0XHR9XG5cblxuICAgICAgICBzdGF0aWMgdXRjVG9Ub2RheVN0cmluZyh1dGM6c3RyaW5nKTpzdHJpbmcge1xuICAgICAgICAgICAgdmFyIG06YW55W107XG4gICAgICAgICAgICB2YXIgdGltZXN0YW1wOm51bWJlcjtcbiAgICAgICAgICAgIG0gPSAvXihcXGR7NH0pLShcXGR7Mn0pLShcXGR7Mn0pVChcXGR7Mn0pOihcXGR7Mn0pOihcXGR7Mn0pXFwuPyhcXGR7MSw2fSk/WiQvLmV4ZWModXRjKTtcbiAgICAgICAgICAgIGlmIChtKSB7XG4gICAgICAgICAgICAgICAgbS5zaGlmdCgpOyAvLyBnZXQgcmlkIG9mIG92ZXJhbGwgbWF0Y2gsIHdlIGRvbid0IGNhcmVcbiAgICAgICAgICAgICAgICBtLm1hcCgodikgPT4geyByZXR1cm4gcGFyc2VJbnQodiwgMTApOyB9KTsgLy8gY29udmVydCBzdHJpbmdzIHRvIG51bWJlcnNcbiAgICAgICAgICAgICAgICBtWzFdLS07IC8vIERhdGUgdXNlcyAwLWJhc2VkIG1vbnRocywgc28gZGVjcmVtZW50IG1vbnRoXG4gICAgICAgICAgICAgICAgdGltZXN0YW1wID0gRGF0ZS5VVEMobVswXSwgbVsxXSwgbVsyXSwgbVszXSwgbVs0XSwgbVs1XSk7XG4gICAgICAgICAgICAgICAgdGltZXN0YW1wIC89IDEwMDA7IC8vIHRoZSB0aW1lc3RhbXBUb1RvZGF5U3RyaW5nIGV4cGVjdHMgc2Vjb25kcywgbm90IG1pbGxpc2Vjb25kc1xuICAgICAgICAgICAgICAgIHJldHVybiBVdGwuSlMudGltZXN0YW1wVG9Ub2RheVN0cmluZyh0aW1lc3RhbXApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIFV0bC5KUy50aW1lc3RhbXBUb1RvZGF5U3RyaW5nKG51bGwpO1xuICAgICAgICB9XG5cblxuXHRcdC8vIFJlbWFwIGEgdmFsdWUgZnJvbSBbaW5NaW4sIGluTWF4XSB0byBbb3V0TWluLCBvdXRNYXhdXG5cdFx0c3RhdGljIHJlbWFwVmFsdWUodmFsdWU6bnVtYmVyLCBpbk1pbjpudW1iZXIsIGluTWF4Om51bWJlciwgb3V0TWluOm51bWJlciwgb3V0TWF4Om51bWJlcik6bnVtYmVyIHtcblx0XHRcdHZhciBkZWx0YTpudW1iZXIgPSBpbk1heCAtIGluTWluO1xuXG5cdFx0XHQvLyBJZiB0aGV5J3ZlIGdpdmVuIHVzIGEgdGlueSBpbnB1dCByYW5nZSwgdGhlbiB3ZSBjYW4ndCByZWFsbHkgcGFyYW1ldGVyaXplXG5cdFx0XHQvLyBpbnRvIHRoZSByYW5nZSwgc28gbGV0J3MganVzdCByZXR1cm4gaGFsZndheSBiZXR3ZWVuIHRoZSBvdXRwdXRzLlxuXHRcdFx0aWYgKE1hdGguYWJzKGRlbHRhKSA8IDAuMDAwMDAxKVxuXHRcdFx0XHRyZXR1cm4gb3V0TWluICsgKG91dE1heCAtIG91dE1pbikgKiAwLjU7XG5cblx0XHRcdHZhciB0ID0gKHZhbHVlIC0gaW5NaW4pIC8gKGluTWF4IC0gaW5NaW4pO1xuXHRcdFx0cmV0dXJuIG91dE1pbiArIChvdXRNYXggLSBvdXRNaW4pICogdDtcblx0XHR9XG5cblx0XHQvLyBSZW1vdmUgYWxsIGNoaWxkIGVsZW1lbnRzIGZyb20gdGhlIHNwZWNpZmllZCBlbGVtZW50LlxuXHRcdHN0YXRpYyByZW1vdmVBbGxDaGlsZHJlbihlbGVtZW50OiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdFx0d2hpbGUgKGVsZW1lbnQuZmlyc3RDaGlsZClcblx0XHRcdFx0ZWxlbWVudC5yZW1vdmVDaGlsZChlbGVtZW50LmZpcnN0Q2hpbGQpO1xuXHRcdH1cblxuXHRcdHN0YXRpYyByZW1vdmVGcm9tUGFyZW50KGVsZW1lbnQ6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0XHRpZiAoZWxlbWVudCAmJiBlbGVtZW50LnBhcmVudE5vZGUpXG5cdFx0XHRcdGVsZW1lbnQucGFyZW50Tm9kZS5yZW1vdmVDaGlsZChlbGVtZW50KTtcblx0XHR9XG5cblx0XHQvLyBDYWxsIHRoaXMgYW55d2hlcmUgaW4geW91ciBjb2RlIHRvIHRyYXAgRjEyIGtleXByZXNzIHRvIHN0b3AgaW4gZGVidWdnZXIuXG5cdFx0Ly8gVGhpcyBpcyB1c2VmdWwgZm9yIGxvb2tpbmcgYXQgRE9NIGVsZW1lbnRzIGluIGEgcG9wdXAgdGhhdCB3b3VsZCBub3JtYWxseSBnbyBhd2F5IHdoZW5cblx0XHQvLyB5b3UgbW92ZWQgdGhlIG1vdXNlIGF3YXkgZnJvbSBpdC5cblx0XHRzdGF0aWMgZW5hYmxlRjEyVHJhcCgpOiB2b2lkIHtcblx0XHRcdCQod2luZG93KS5rZXlkb3duKGZ1bmN0aW9uKGUpIHsgaWYgKGUua2V5Q29kZSA9PSAxMjMpIGRlYnVnZ2VyOyB9KTtcblx0XHR9XG5cblx0XHRzdGF0aWMgc3RhcnRXYWl0QmFkZ2Uoc2VsZWN0b3IpOiB2b2lkIHtcblx0XHRcdCQoc2VsZWN0b3IpLmNzcyhcImNsYXNzXCIsIFwid2FpdGJhZGdlIHdhaXRcIik7XG5cdFx0fVxuXG5cdFx0c3RhdGljIHN0b3BXYWl0QmFkZ2Uoc2VsZWN0b3IpOiB2b2lkIHtcblx0XHRcdCQoc2VsZWN0b3IpLmNzcyhcImNsYXNzXCIsIFwid2FpdGJhZGdlXCIpO1xuXHRcdH1cblx0fVxuXG5cblxuXHQvLyBBIHByb2dyZXNzIGJhciB3aXRoIGEgcmFuZ2UgZnJvbSAwIHRvIDEwMCBwZXJjZW50LlxuXHQvLyBXaGVuIGdpdmVuIG9ubHkgYW4gaWQsIHRoZSBjbGFzcyBzZWVrcyBhbiBlbGVtZW50IGluIHRoZSBkb2N1bWVudCBhbmQgdXNlcyB0aGF0IGFzIHRoZSBwcm9ncmVzcyBiYXIuXG5cdC8vIFdoZW4gZ2l2ZW4gYSBwYXJlbnQgZWxlbWVudCwgdGhlIGNsYXNzIG1ha2VzIGEgbmV3IDxwcm9ncmVzcz4gZWxlbWVudCB1bmRlcm5lYXRoIGl0IHdpdGggdGhlIGdpdmVuIGlkLlxuXHRleHBvcnQgY2xhc3MgUHJvZ3Jlc3NCYXIge1xuXG5cdFx0ZWxlbWVudDogSFRNTEVsZW1lbnQ7XG5cblxuXHRcdGNvbnN0cnVjdG9yKGlkOiBzdHJpbmcsIHBhcmVudEVsZW1lbnQ/OiBIVE1MRWxlbWVudCkge1xuXHRcdFx0dmFyIGI6IEhUTUxFbGVtZW50O1xuXHRcdFx0aWYgKHBhcmVudEVsZW1lbnQpIHtcblx0XHRcdFx0YiA9ICQoJzxwcm9ncmVzcz4nKS5hcHBlbmRUbyhwYXJlbnRFbGVtZW50KVswXTtcblx0XHRcdFx0Yi5pZCA9IGlkO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0YiA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKGlkKTtcblx0XHRcdH1cblx0XHRcdGIuaW5uZXJIVE1MID0gJzAlIGNvbXBsZXRlJztcblx0XHRcdGIuc2V0QXR0cmlidXRlKCdtaW4nLCAnMCcpO1xuXHRcdFx0Yi5zZXRBdHRyaWJ1dGUoJ21heCcsICcxMDAnKTtcblx0XHRcdGIuc2V0QXR0cmlidXRlKCd2YWx1ZScsICcwJyk7XG5cdFx0XHRiLmNsYXNzTmFtZSA9ICdvZmYnO1xuXHRcdFx0dGhpcy5lbGVtZW50ID0gYjtcblx0XHR9XG5cblxuXHRcdC8vIFNldHMgdGhlIHByb2dyZXNzIGJhciBmcm9tIDAgdG8gMTAwIHBlcmNlbnQsIG9yIG5vIHZhbHVlIHRvIGRpc2FibGUuXG5cdFx0Ly8gQWxzbyBzaG93cyB0aGUgc3Bpbm55IHdhaXQgaWNvbiBpZiB0aGUgcHJvZ3Jlc3MgYmFyIGlzIHNldCB0byBhIHZhbHVlIG90aGVyIHRoYW4gMTAwLlxuXHRcdHNldFByb2dyZXNzKHBlcmNlbnRhZ2U/OiBudW1iZXIpIHtcblx0XHRcdHZhciBiID0gdGhpcy5lbGVtZW50O1xuXHRcdFx0aWYgKHR5cGVvZiAocGVyY2VudGFnZSkgPT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHRcdGIuaW5uZXJIVE1MID0gJzAlIGNvbXBsZXRlJztcblx0XHRcdFx0Yi5zZXRBdHRyaWJ1dGUoJ3ZhbHVlJywgJzAnKTtcblx0XHRcdFx0Yi5jbGFzc05hbWUgPSAnb2ZmJztcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGIuaW5uZXJIVE1MID0gcGVyY2VudGFnZSArICclIGNvbXBsZXRlJztcblx0XHRcdFx0Yi5zZXRBdHRyaWJ1dGUoJ3ZhbHVlJywgcGVyY2VudGFnZS50b1N0cmluZygpKTtcblx0XHRcdFx0Yi5jbGFzc05hbWUgPSAnJztcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXG5cblx0Ly8gVXNlZCBieSBGaWxlRHJvcFpvbmUgdG8gcGFzcyBhcm91bmQgYWRkaXRpb25hbCBpbmZvIGZvciBlYWNoIGRyb3BwZWQgRmlsZSBvYmplY3Qgd2l0aG91dFxuXHQvLyBtZXNzaW5nIHdpdGggdGhlIGZpbGVkcm9wLW1pbi5qcyBpbnRlcm5hbHMuXG4gICAgaW50ZXJmYWNlIEZpbGVEcm9wWm9uZUZpbGVDb250YWluZXIge1xuICAgICAgICBmaWxlOiBhbnk7XHRcdFx0XHRcdC8vIFRoZSBmaWxlIG9iamVjdCBhcyBjcmVhdGVkIGJ5IGZpbGVkcm9wLW1pbi5qc1xuICAgICAgICBmaWxlVHlwZTogc3RyaW5nO1x0XHRcdC8vIEEgZ3Vlc3MgYXQgdGhlIGZpbGUncyB0eXBlLCBleHByZXNzZWQgYXMgYSBzdHJpbmcsIGFzIHJldHVybmVkIGJ5IFV0bC5KUy5ndWVzc0ZpbGVUeXBlIC5cbiAgICAgICAgZXh0cmFIZWFkZXJzOntbaWQ6c3RyaW5nXTogc3RyaW5nfTtcdC8vIEFueSBleHRyYSBoZWFkZXJzIHRvIHNlbmQgd2l0aCB0aGUgUE9TVCB0byB0aGUgc2VydmVyLlxuXG4gICAgICAgIHByb2dyZXNzQmFyOiBQcm9ncmVzc0JhcjtcdC8vIFRoZSBQcm9ncmVzc0JhciBvYmplY3QgdXNlZCB0byB0cmFjayB0aGlzIGZpbGUuICBDYW4gYmUgYWx0ZXJlZCBhZnRlciBpbml0IGJ5IGZpbGVJbml0Rm4uXG5cbiAgICAgICAgc3RvcFByb2Nlc3Npbmc6IGJvb2xlYW47XHQvLyBJZiBzZXQsIGFiYW5kb24gYW55IGZ1cnRoZXIgYWN0aW9uIG9uIHRoZSBmaWxlLlxuICAgICAgICBza2lwUHJvY2Vzc1JhdzogYm9vbGVhbjtcdC8vIElmIHNldCwgc2tpcCB0aGUgY2FsbCB0byBwcm9jZXNzIHRoZSBkcm9wcGVkIGZpbGUgbG9jYWxseS5cbiAgICAgICAgc2tpcFVwbG9hZDogYm9vbGVhbjtcdFx0Ly8gSWYgc2V0LCBza2lwIHRoZSB1cGxvYWQgdG8gdGhlIHNlcnZlciAoYW5kIHN1YnNlcXVlbnQgY2FsbCB0byBwcm9jZXNzUmVzcG9uc2VGbilcbiAgICAgICAgYWxsV29ya0ZpbmlzaGVkOiBib29sZWFuO1x0Ly8gSWYgc2V0LCB0aGUgZmlsZSBoYXMgZmluaXNoZWQgYWxsIHByb2Nlc3NpbmcgYnkgdGhlIEZpbGVEcm9wWm9uZSBjbGFzcy5cblxuICAgICAgICAvLyBUaGlzIGlzIGFzc2lnbmVkIGJ5IEZpbGVEcm9wWm9uZSB3aGVuIHRoZSBvYmplY3QgaXMgZ2VuZXJhdGVkLCBhbmQgY2FuIGJlIHVzZWQgdG8gY29ycmVsYXRlIHRoZVxuICAgICAgICAvLyBvYmplY3Qgd2l0aCBvdGhlciBpbmZvcm1hdGlvbiBlbHNld2hlcmUuICAoSXQgaXMgbm90IHVzZWQgaW50ZXJuYWxseSBieSBGaWxlRHJvcFpvbmUuKVxuICAgICAgICB1bmlxdWVJbmRleDogbnVtYmVyO1xuICAgIH1cblxuXG5cblx0Ly8gQSBjbGFzcyB3cmFwcGluZyBmaWxlZHJvcC1taW4uanMgKGh0dHA6Ly9maWxlZHJvcGpzLm9yZykgYW5kIHByb3ZpZGluZyBzb21lIGFkZGl0aW9uYWwgc3RydWN0dXJlLlxuXHQvLyBJdCdzIGluaXRpYWxpemVkIHdpdGggYSBzaW5nbGUgJ29wdGlvbnMnIG9iamVjdDpcblx0Ly8ge1xuXHQvL1x0ZWxlbWVudElkOiBJRCBvZiB0aGUgZWxlbWVudCB0byBiZSBzZXQgdXAgYXMgYSBkcm9wIHpvbmVcblx0Ly9cdGZpbGVJbml0Rm46IENhbGxlZCB3aGVuIGEgZmlsZSBoYXMgYmVlbiBkcm9wcGVkLCBidXQgYmVmb3JlIGFueSBwcm9jZXNzaW5nIGhhcyBzdGFydGVkXG5cdC8vXHRwcm9jZXNzUmF3Rm46IENhbGxlZCB3aGVuIHRoZSBmaWxlIGNvbnRlbnQgaGFzIGJlZW4gcmVhZCBpbnRvIGEgbG9jYWwgdmFyaWFibGUsIGJ1dCBiZWZvcmUgYW55IGNvbW11bmljYXRpb24gd2l0aFxuXHQvLyAgICAgICAgICAgICAgICB0aGUgc2VydmVyLlxuXHQvL1x0dXJsOiBUaGUgVVJMIHRvIHVwbG9hZCB0aGUgZmlsZS5cblx0Ly9cdHByb2dyZXNzQmFyOiBBIFByb2dyZXNzQmFyIG9iamVjdCBmb3IgdHJhY2tpbmcgdGhlIHVwbG9hZCBwcm9ncmVzcy5cblx0Ly9cdHByb2Nlc3NSZXNwb25zZUZuOiBDYWxsZWQgd2hlbiB0aGUgc2VydmVyIHNlbmRzIGJhY2sgaXRzIHJlc3VsdHMuXG5cdC8vIH1cblx0Ly8gQWxsIGNhbGxiYWNrcyBhcmUgZ2l2ZW4gYSBGaWxlRHJvcFpvbmVGaWxlQ29udGFpbmVyIG9iamVjdCBhcyB0aGVpciBmaXJzdCBhcmd1bWVudC5cblxuXHQvLyBUT0RPOlxuXHQvLyAqIFJld3JpdGUgdGhpcyB3aXRoIGFuIG9wdGlvbiB0byBvbmx5IGFjY2VwdCB0aGUgZmlyc3QgZmlsZSBpbiBhIGRyb3BwZWQgc2V0LlxuXHQvLyAqIENyZWF0ZSBhIGZpbGVDb250YWluZXJHcm91cCBvYmplY3QsIGFuZCBhIGZpbGVDb250YWluZXJnR3JvdXBJbmRleENvdW50ZXIsIGFuZCBhc3NpZ24gc2V0cyBvZiBmaWxlcyB0aGUgc2FtZSBncm91cCBVSUQuXG5cdC8vICogQWRkIGEgJ2NsZWFudXAnIGNhbGxiYWNrIHRoYXQncyBjYWxsZWQgYWZ0ZXIgYWxsIGZpbGVzIGluIGEgZ3JvdXAgaGF2ZSBiZWVuIHVwbG9hZGVkLlxuXHRleHBvcnQgY2xhc3MgRmlsZURyb3Bab25lIHtcblxuXHRcdHpvbmU6IGFueTtcblx0XHRjc3JmdG9rZW46IGFueTtcblx0XHRlbGVtZW50SWQ6IGFueTtcblx0XHR1cmw6IHN0cmluZztcblx0XHRwcm9ncmVzc0JhcjogUHJvZ3Jlc3NCYXI7XG5cblx0XHRmaWxlSW5pdEZuOiBhbnk7XG5cdFx0cHJvY2Vzc1Jhd0ZuOiBhbnk7XG5cdFx0cHJvY2Vzc1Jlc3BvbnNlRm46IGFueTtcblxuXHRcdHN0YXRpYyBmaWxlQ29udGFpbmVySW5kZXhDb3VudGVyOiBudW1iZXIgPSAwO1xuXG5cdFx0Ly8gSWYgcHJvY2Vzc1Jhd0ZuIGlzIHByb3ZpZGVkLCBpdCB3aWxsIGJlIGNhbGxlZCB3aXRoIHRoZSByYXcgZmlsZSBkYXRhIGZyb20gdGhlIGRyb3Agem9uZS5cblx0XHQvLyBJZiB1cmwgaXMgcHJvdmlkZWQgYW5kIHByb2Nlc3NSYXdGbiByZXR1cm5zIGZhbHNlIChvciB3YXMgbm90IHByb3ZpZGVkKSB0aGUgZmlsZSB3aWxsIGJlIHNlbnQgdG8gdGhlIGdpdmVuIHVybC5cblx0XHQvLyBJZiBwcm9jZXNzUmVzcG9uc2VGbiBpcyBwcm92aWRlZCwgaXQgd2lsbCBiZSBjYWxsZWQgd2l0aCB0aGUgcmV0dXJuZWQgcmVzdWx0IG9mIHRoZSB1cmwgY2FsbC5cbiAgICAgICAgY29uc3RydWN0b3Iob3B0aW9uczphbnkpIHtcblxuXHRcdFx0dGhpcy5wcm9ncmVzc0JhciA9IG9wdGlvbnMucHJvZ3Jlc3NCYXIgfHwgbnVsbDtcblxuXHRcdFx0Ly8gSWYgdGhlcmUncyBhIGNsZWFuZXIgd2F5IHRvIGZvcmNlLWRpc2FibGUgZXZlbnQgbG9nZ2luZyBpbiBmaWxlZHJvcC1taW4uanMsIGRvIHBsZWFzZSBwdXQgaXQgaGVyZSFcblx0XHRcdCg8YW55PndpbmRvdykuZmQubG9nZ2luZyA9IGZhbHNlO1xuXG5cdFx0XHR2YXIgeiA9IG5ldyBGaWxlRHJvcChvcHRpb25zLmVsZW1lbnRJZCwge30pO1x0Ly8gZmlsZWRyb3AtbWluLmpzICwgaHR0cDovL2ZpbGVkcm9wanMub3JnXG5cdFx0XHR0aGlzLnpvbmUgPSB6O1xuXHRcdFx0dGhpcy5jc3JmdG9rZW4gPSBqUXVlcnkuY29va2llKCdjc3JmdG9rZW4nKTtcblx0XHRcdGlmICghKHR5cGVvZiBvcHRpb25zLm11bHRpcGxlID09PSBcInVuZGVmaW5lZFwiKSkge1xuXHRcdFx0XHR6Lm11bHRpcGxlKG9wdGlvbnMubXVsdGlwbGUpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0ei5tdWx0aXBsZShmYWxzZSk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLmZpbGVJbml0Rm4gPSBvcHRpb25zLmZpbGVJbml0Rm47XG5cdFx0XHR0aGlzLnByb2Nlc3NSYXdGbiA9IG9wdGlvbnMucHJvY2Vzc1Jhd0ZuO1xuXHRcdFx0dGhpcy5wcm9jZXNzUmVzcG9uc2VGbiA9IG9wdGlvbnMucHJvY2Vzc1Jlc3BvbnNlRm47XG5cdFx0XHR0aGlzLnVybCA9IG9wdGlvbnMudXJsO1xuXHRcdH1cblxuXG5cdFx0Ly8gSGVscGVyIGZ1bmN0aW9uIHRvIGNyZWF0ZSBhbmQgc2V0IHVwIGEgRmlsZURyb3Bab25lLlxuXHRcdHN0YXRpYyBjcmVhdGUob3B0aW9uczphbnkpOiB2b2lkIHtcblx0XHRcdHZhciBoID0gbmV3IEZpbGVEcm9wWm9uZShvcHRpb25zKTtcblx0XHRcdGguc2V0dXAoKTtcblx0XHR9XG5cblxuXHRcdHNldHVwKCk6dm9pZCB7XG5cdFx0XHR2YXIgdCA9IHRoaXM7XG5cdFx0XHR0aGlzLnpvbmUuZXZlbnQoJ3NlbmQnLCBmdW5jdGlvbihmaWxlcykge1xuXHRcdFx0XHRmaWxlcy5lYWNoKGZ1bmN0aW9uKGZpbGUpIHtcblxuXHRcdFx0XHRcdHZhciBmaWxlQ29udGFpbmVyOkZpbGVEcm9wWm9uZUZpbGVDb250YWluZXIgID0ge1xuXHRcdFx0XHRcdFx0ZmlsZTogZmlsZSxcblx0XHRcdFx0XHRcdGZpbGVUeXBlOiBVdGwuSlMuZ3Vlc3NGaWxlVHlwZShmaWxlLm5hbWUsIGZpbGUudHlwZSksXG5cdFx0XHRcdFx0XHRleHRyYUhlYWRlcnM6IHt9LFxuXHRcdFx0XHRcdFx0cHJvZ3Jlc3NCYXI6IHQucHJvZ3Jlc3NCYXIsXG5cdFx0XHRcdFx0XHR1bmlxdWVJbmRleDogRmlsZURyb3Bab25lLmZpbGVDb250YWluZXJJbmRleENvdW50ZXIrKyxcblx0XHRcdFx0XHRcdHN0b3BQcm9jZXNzaW5nOiBmYWxzZSxcblx0XHRcdFx0XHRcdHNraXBQcm9jZXNzUmF3OiBudWxsLFxuXHRcdFx0XHRcdFx0c2tpcFVwbG9hZDogbnVsbCxcblx0XHRcdFx0XHRcdGFsbFdvcmtGaW5pc2hlZDogZmFsc2Vcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHQvLyBjYWxsSW5pdEZpbGUgbWF5IHNldCBmaWxlQ29udGFpbmVyJ3MgaW50ZXJuYWwgc3RvcFByb2Nlc3NpbmcgZmxhZywgb3IgYW55IG9mIHRoZSBvdGhlcnMuXG5cdFx0XHRcdFx0Ly8gU28gaXQncyBwb3NzaWJsZSBmb3IgY2FsbEluaXRGaWxlIHRvIGFjdCBhcyBhIGdhdGVrZWVwZXIsIHJlamVjdGluZyB0aGUgZHJvcHBlZCBmaWxlXG5cdFx0XHRcdFx0Ly8gYW5kIGhhbHRpbmcgYW55IGFkZGl0aW9uYWwgcHJvY2Vzc2luZywgb3IgaXQgY2FuIGRlY2lkZSB3aGV0aGVyIHRvIHJlYWQgYW5kIHByb2Nlc3Ncblx0XHRcdFx0XHQvLyB0aGlzIGZpbGUgbG9jYWxseSwgb3IgdXBsb2FkIGl0IHRvIHRoZSBzZXJ2ZXIsIG9yIGV2ZW4gYm90aC5cblx0XHRcdFx0XHQvLyBBbm90aGVyIHRyaWNrOiBjYWxsSW5pdEZpbGUgbWF5IHN3YXAgaW4gYSBjdXN0b20gUHJvZ3Jlc3NCYXIgb2JqZWN0IGp1c3QgZm9yIHRoaXMgZmlsZSxcblx0XHRcdFx0XHQvLyBzbyBtdWx0aXBsZSBmaWxlcyBjYW4gaGF2ZSB0aGVpciBvd24gc2VwYXJhdGUgcHJvZ3Jlc3MgYmFycywgd2hpbGUgdGhleSBhcmUgYWxsIHVwbG9hZGVkXG5cdFx0XHRcdFx0Ly8gaW4gcGFyYWxsZWwuXG5cdFx0XHRcdFx0dC5jYWxsSW5pdEZpbGUuY2FsbCh0LCBmaWxlQ29udGFpbmVyKTtcblx0XHRcdFx0XHRpZiAoZmlsZUNvbnRhaW5lci5zdG9wUHJvY2Vzc2luZykgeyBmaWxlQ29udGFpbmVyLmFsbFdvcmtGaW5pc2hlZCA9IHRydWU7IHJldHVybjsgfVxuXG5cdFx0XHRcdFx0dC5jYWxsUHJvY2Vzc1Jhdy5jYWxsKHQsIGZpbGVDb250YWluZXIpO1xuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXHRcdH1cblxuXG5cdFx0Ly8gSWYgdGhlcmUgaXMgYSBmaWxlSW5pdEZuIHNldCwgY2FsbCBpdCB3aXRoIHRoZSBnaXZlbiBGaWxlRHJvcFpvbmVGaWxlQ29udGFpbmVyLlxuXHRcdGNhbGxJbml0RmlsZShmaWxlQ29udGFpbmVyOiBGaWxlRHJvcFpvbmVGaWxlQ29udGFpbmVyKSB7XG5cdFx0XHRpZiAodHlwZW9mIHRoaXMuZmlsZUluaXRGbiA9PT0gXCJmdW5jdGlvblwiKSB7XG5cdFx0XHRcdHRoaXMuZmlsZUluaXRGbihmaWxlQ29udGFpbmVyKTtcblx0XHRcdH1cblx0XHR9XG5cblxuXHRcdC8vIElmIHByb2Nlc3NSYXdGbiBpcyBkZWZpbmVkLCB3ZSByZWFkIHRoZSBlbnRpcmUgZmlsZSBpbnRvIGEgdmFyaWFibGUsXG5cdFx0Ly8gdGhlbiBwYXNzIHRoYXQgdG8gcHJvY2Vzc1Jhd0ZuIGFsb25nIHdpdGggdGhlIEZpbGVEcm9wWm9uZUZpbGVDb250YWluZXIgb2JqZWN0LlxuXHRcdC8vIEZpbGVEcm9wWm9uZUZpbGVDb250YWluZXIncyBjb250ZW50cyBtaWdodCBiZSBtb2RvZmllZCAtIHNwZWNpZmljYWxseSwgdGhlIGZsYWdzIC0gc28gd2UgY2hlY2sgdGhlbSBhZnRlcndhcmRzXG5cdFx0Ly8gdG8gZGVjaWRlIGhvdyB0byBwcm9jZWVkLlxuXHRcdGNhbGxQcm9jZXNzUmF3KGZpbGVDb250YWluZXI6IEZpbGVEcm9wWm9uZUZpbGVDb250YWluZXIpIHtcblx0XHRcdHZhciB0ID0gdGhpcztcblx0XHRcdGlmICh0eXBlb2YgdGhpcy5wcm9jZXNzUmF3Rm4gPT09IFwiZnVuY3Rpb25cIiAmJiAhZmlsZUNvbnRhaW5lci5za2lwUHJvY2Vzc1Jhdykge1xuXHRcdFx0XHRmaWxlQ29udGFpbmVyLmZpbGUucmVhZCh7XG5cdFx0XHRcdFx0Ly9zdGFydDogNSxcblx0XHRcdFx0XHQvL2VuZDogLTEwLFxuXHRcdFx0XHRcdC8vZnVuYzogJ2NwMTI1MScsXG5cdFx0XHRcdFx0b25Eb25lOiBmdW5jdGlvbihzdHIpIHtcblx0XHRcdFx0XHRcdHQucHJvY2Vzc1Jhd0ZuKGZpbGVDb250YWluZXIsIHN0cik7XG5cdFx0XHRcdFx0XHRpZiAoIWZpbGVDb250YWluZXIuc3RvcFByb2Nlc3NpbmcgJiYgIWZpbGVDb250YWluZXIuc2tpcFVwbG9hZCkge1xuXHRcdFx0XHRcdFx0XHR0LnVwbG9hZEZpbGUuY2FsbCh0LCBmaWxlQ29udGFpbmVyKTtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdGZpbGVDb250YWluZXIuYWxsV29ya0ZpbmlzaGVkID0gdHJ1ZTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdG9uRXJyb3I6IGZ1bmN0aW9uKGUpIHtcblx0XHRcdFx0XHRcdGFsZXJ0KCdGYWlsZWQgdG8gcmVhZCB0aGUgZmlsZSEgRXJyb3I6ICcgKyBlLmZkRXJyb3IpXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRmdW5jOiAndGV4dCdcblx0XHRcdFx0fSlcblx0XHRcdC8vIE5vIG5lZWQgdG8gY2hlY2sgc3RvcFByb2Nlc3NpbmcgLSB0aGVyZSdzIG5vIHdheSBpdCBjb3VsZCBoYXZlIGJlZW4gbW9kaWZpZWQgc2luY2UgdGhlIGxhc3Qgc3RlcC5cblx0XHRcdH0gZWxzZSBpZiAoIWZpbGVDb250YWluZXIuc2tpcFVwbG9hZCkge1xuXHRcdFx0XHR0aGlzLnVwbG9hZEZpbGUoZmlsZUNvbnRhaW5lcik7XG5cdFx0XHR9XG5cdFx0fVxuXG5cblx0XHR1cGxvYWRGaWxlKGZpbGVDb250YWluZXI6IEZpbGVEcm9wWm9uZUZpbGVDb250YWluZXIpIHtcblxuXHRcdFx0dmFyIHQgPSB0aGlzO1xuXHRcdFx0dmFyIGYgPSBmaWxlQ29udGFpbmVyLmZpbGU7XG5cdFx0XHQvLyBJZiBubyB1cmwgaGFzIGJlZW4gZGVmaW5lZCwgd2UgaGF2ZSB0byBzdG9wIGhlcmUuXG5cdFx0XHRpZiAodHlwZW9mIHRoaXMudXJsICE9PSAnc3RyaW5nJykgeyBmaWxlQ29udGFpbmVyLmFsbFdvcmtGaW5pc2hlZCA9IHRydWU7IHJldHVybjsgfVxuXG5cdFx0XHQvLyBGcm9tIHRoaXMgcG9pbnQgb24gd2UgYXNzdW1lIHdlJ3JlIHVwbG9hZGluZyB0aGUgZmlsZSxcblx0XHRcdC8vIHNvIHdlIHNldCB1cCB0aGUgcHJvZ3Jlc3NCYXIgYW5kIGNhbGxiYWNrIGV2ZW50cyBiZWZvcmUgdHJpZ2dlcmluZyB0aGUgY2FsbCB0byB1cGxvYWQuXG5cdFx0XHRmLmV2ZW50KCdkb25lJywgZnVuY3Rpb24oeGhyKSB7XG5cdFx0XHRcdHZhciByZXN1bHQgPSBqUXVlcnkucGFyc2VKU09OKHhoci5yZXNwb25zZVRleHQpO1xuXHRcdFx0XHRpZiAocmVzdWx0LnB5dGhvbl9lcnJvcikge1xuXHRcdFx0XHRcdGFsZXJ0KHJlc3VsdC5weXRob25fZXJyb3IpO1x0Ly8gVE9ETzogVGhpcyBpcyBhIGJpdCBleHRyZW1lLiBNaWdodCB3YW50IHRvIGp1c3QgcGFzcyBpdCB0byB0aGUgY2FsbGJhY2suXG5cdFx0XHRcdH0gZWxzZSBpZiAodHlwZW9mIHQucHJvY2Vzc1Jlc3BvbnNlRm4gPT09IFwiZnVuY3Rpb25cIikge1xuXHRcdFx0XHRcdHQucHJvY2Vzc1Jlc3BvbnNlRm4oZmlsZUNvbnRhaW5lciwgcmVzdWx0KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRmaWxlQ29udGFpbmVyLmFsbFdvcmtGaW5pc2hlZCA9IHRydWU7XG5cdFx0XHR9KTtcblxuXHRcdFx0Zi5ldmVudCgnZXJyb3InLCBmdW5jdGlvbihlLCB4aHIpIHtcblx0XHRcdFx0Ly8gVE9ETzogQWdhaW4sIGhlYXZ5IGhhbmRlZC4gTWlnaHQgd2FudCB0byBqdXN0IGVtYmVkIHRoaXMgaW4gRmlsZURyb3Bab25lRmlsZUNvbnRhaW5lclxuXHRcdFx0XHQvLyBhbmQgbWFrZSBhbiBlcnJvciBoYW5kbGVyIGNhbGxiYWNrLlxuXHRcdFx0XHRhbGVydCgnRXJyb3IgdXBsb2FkaW5nICcgKyBmLm5hbWUgKyAnOiAnICsgeGhyLnN0YXR1cyArICcsICcgKyB4aHIuc3RhdHVzVGV4dCk7XG5cdFx0XHRcdGZpbGVDb250YWluZXIuYWxsV29ya0ZpbmlzaGVkID0gdHJ1ZTtcblx0XHRcdH0pO1xuXG5cdFx0XHRmLmV2ZW50KCd4aHJTZXR1cCcsIGZ1bmN0aW9uKHhocikge1xuXHRcdFx0XHQvLyBUaGlzIGVuc3VyZXMgdGhhdCB0aGUgQ1NSRiBtaWRkbGV3YXJlIGluIERqYW5nbyBkb2Vzbid0IHJlamVjdCBvdXIgSFRUUCByZXF1ZXN0LlxuXHRcdFx0XHR4aHIuc2V0UmVxdWVzdEhlYWRlcihcIlgtQ1NSRlRva2VuXCIsIHQuY3NyZnRva2VuKTtcblx0XHRcdFx0Ly8gV2Ugd2FudCB0byBwYXNzIGFsb25nIG91ciBvd24gZ3Vlc3MgYXQgdGhlIGZpbGUgdHlwZSwgc2luY2UgaXQncyBiYXNlZCBvbiBhIG1vcmUgc3BlY2lmaWMgc2V0IG9mIGNyaXRlcmlhLlxuXHRcdFx0XHR4aHIuc2V0UmVxdWVzdEhlYWRlcignWC1FREQtRmlsZS1UeXBlJywgZmlsZUNvbnRhaW5lci5maWxlVHlwZSlcblxuICAgICAgICAgICAgXHQkLmVhY2goZmlsZUNvbnRhaW5lci5leHRyYUhlYWRlcnMsIChuYW1lOiBzdHJpbmcsIHZhbHVlOiBzdHJpbmcpOiB2b2lkID0+IHtcblx0XHRcdFx0XHR4aHIuc2V0UmVxdWVzdEhlYWRlcignWC1FREQtJyArIG5hbWUsIHZhbHVlKVxuXHRcdFx0XHR9KTtcblxuXHRcdFx0fSk7XG5cblx0XHRcdGYuZXZlbnQoJ3NlbmRYSFInLCBmdW5jdGlvbigpIHtcblx0XHRcdFx0aWYgKGZpbGVDb250YWluZXIucHJvZ3Jlc3NCYXIpIHtcblx0XHRcdFx0XHRmaWxlQ29udGFpbmVyLnByb2dyZXNzQmFyLnNldFByb2dyZXNzKDApO1xuXHRcdFx0XHR9XG5cdFx0XHR9KVxuXG5cdFx0XHQvLyBVcGRhdGUgcHJvZ3Jlc3Mgd2hlbiBicm93c2VyIHJlcG9ydHMgaXQ6XG5cdFx0XHRmLmV2ZW50KCdwcm9ncmVzcycsIGZ1bmN0aW9uKGN1cnJlbnQsIHRvdGFsKSB7XG5cdFx0XHRcdGlmIChmaWxlQ29udGFpbmVyLnByb2dyZXNzQmFyKSB7XG5cdFx0XHRcdFx0dmFyIHdpZHRoID0gY3VycmVudCAvIHRvdGFsICogMTAwO1xuXHRcdFx0XHRcdGZpbGVDb250YWluZXIucHJvZ3Jlc3NCYXIuc2V0UHJvZ3Jlc3Mod2lkdGgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KVxuXG5cdFx0XHRmLnNlbmRUbyh0aGlzLnVybCk7XG5cdFx0fVxuXHR9XG5cblxuXG5cdC8vIFNWRy1yZWxhdGVkIHV0aWxpdGllcy5cblx0ZXhwb3J0IGNsYXNzIFNWRyB7XG5cblx0XHRzdGF0aWMgY3JlYXRlU1ZHKHdpZHRoOmFueSwgaGVpZ2h0OmFueSwgYm94V2lkdGg6bnVtYmVyLCBib3hIZWlnaHQ6bnVtYmVyKTpTVkdFbGVtZW50IHtcblx0XHRcdHZhciBzdmdFbGVtZW50OlNWR0VsZW1lbnQgPSA8U1ZHRWxlbWVudD5kb2N1bWVudC5jcmVhdGVFbGVtZW50TlMoU1ZHLl9uYW1lc3BhY2UsIFwic3ZnXCIpO1xuXHRcdFx0c3ZnRWxlbWVudC5zZXRBdHRyaWJ1dGUoJ3ZlcnNpb24nLCAnMS4yJyk7XG5cdFx0XHRzdmdFbGVtZW50LnNldEF0dHJpYnV0ZSgnd2lkdGgnLCB3aWR0aC50b1N0cmluZygpKTtcblx0XHRcdHN2Z0VsZW1lbnQuc2V0QXR0cmlidXRlKCdoZWlnaHQnLCBoZWlnaHQudG9TdHJpbmcoKSk7XG5cdFx0XHRzdmdFbGVtZW50LnNldEF0dHJpYnV0ZSgndmlld0JveCcsICcwIDAgJyArIGJveFdpZHRoICsgJyAnICsgYm94SGVpZ2h0KTtcblx0XHRcdHN2Z0VsZW1lbnQuc2V0QXR0cmlidXRlKCdwcmVzZXJ2ZUFzcGVjdFJhdGlvJywgJ25vbmUnKTtcblx0XHRcdHJldHVybiBzdmdFbGVtZW50O1xuXHRcdH1cblxuXG5cdFx0Ly8gQ3JlYXRlcyBhIHZlcnRpY2FsIGxpbmUgY2VudGVyZWQgb24gKHhDb29yZCx5Q29vcmQpLlxuXHRcdHN0YXRpYyBjcmVhdGVWZXJ0aWNhbExpbmVQYXRoKHhDb29yZDpudW1iZXIsIHlDb29yZDpudW1iZXIsIGxpbmVXaWR0aDpudW1iZXIsIGxpbmVIZWlnaHQ6bnVtYmVyLCBjb2xvcjpDb2xvciwgc3ZnRWxlbWVudDphbnkpOlNWR0VsZW1lbnQge1xuXHRcdFx0dmFyIGhhbGZXaWR0aDpudW1iZXIgPSBsaW5lV2lkdGggLyAyO1xuXG5cdFx0XHR2YXIgdG9wWTpudW1iZXIgPSBNYXRoLmZsb29yKHlDb29yZCAtIGxpbmVIZWlnaHQvMik7XG5cdFx0XHR2YXIgYm90dG9tWTpudW1iZXIgPSBNYXRoLmZsb29yKHlDb29yZCArIGxpbmVIZWlnaHQvMik7XG5cdFx0XHR2YXIgbWlkWDpudW1iZXIgPSBNYXRoLmZsb29yKHhDb29yZCArIGhhbGZXaWR0aCk7XG5cdFx0XHR2YXIgZWwgPSBTVkcuY3JlYXRlTGluZSggbWlkWCwgdG9wWSwgbWlkWCwgYm90dG9tWSwgY29sb3IsIGxpbmVXaWR0aCk7XG5cdFx0ICAgIC8vJChlbCkuY3NzKCdzdHJva2UtbGluZWNhcCcsICdyb3VuZCcpO1xuXG5cdFx0XHRpZiAoc3ZnRWxlbWVudClcblx0XHQgICAgXHRzdmdFbGVtZW50LmFwcGVuZENoaWxkKGVsKTtcblxuXHRcdCAgICByZXR1cm4gZWw7XG5cdFx0fVxuXG5cblx0XHRzdGF0aWMgY3JlYXRlTGluZSh4MTpudW1iZXIsIHkxOm51bWJlciwgeDI6bnVtYmVyLCB5MjpudW1iZXIsIGNvbG9yPzpDb2xvciwgd2lkdGg/Om51bWJlcik6U1ZHRWxlbWVudCB7XG4gICAgXHRcdHZhciBlbCA9IDxTVkdFbGVtZW50PmRvY3VtZW50LmNyZWF0ZUVsZW1lbnROUyhTVkcuX25hbWVzcGFjZSwgJ2xpbmUnKTtcblx0XHRcdFxuXHRcdFx0ZWwuc2V0QXR0cmlidXRlKCd4MScsIHgxLnRvU3RyaW5nKCkpO1xuXHRcdFx0ZWwuc2V0QXR0cmlidXRlKCd5MScsIHkxLnRvU3RyaW5nKCkpO1xuXHRcdFx0ZWwuc2V0QXR0cmlidXRlKCd4MicsIHgyLnRvU3RyaW5nKCkpO1xuXHRcdFx0ZWwuc2V0QXR0cmlidXRlKCd5MicsIHkyLnRvU3RyaW5nKCkpO1xuXG5cdFx0XHRpZiAoY29sb3IpXG5cdFx0XHRcdCQoZWwpLmNzcygnc3Ryb2tlJywgY29sb3IudG9TdHJpbmcoKSk7XG5cblx0XHRcdGlmICh3aWR0aClcblx0XHRcdFx0JChlbCkuY3NzKCdzdHJva2Utd2lkdGgnLCB3aWR0aC50b1N0cmluZygpKTtcblxuXHRcdCAgICByZXR1cm4gZWw7XG5cdFx0fVxuXG5cblx0XHRzdGF0aWMgY3JlYXRlUmVjdCh4Om51bWJlciwgeTpudW1iZXIsIHdpZHRoOm51bWJlciwgaGVpZ2h0Om51bWJlciwgZmlsbENvbG9yOkNvbG9yLCBzdHJva2VXaWR0aD86bnVtYmVyLCBzdHJva2VDb2xvcj86Q29sb3IsIG9wYWNpdHk/Om51bWJlcik6U1ZHRWxlbWVudCB7XG5cblx0XHRcdC8vIERlZmF1bHQgdmFsdWVzLlxuXHRcdFx0c3Ryb2tlV2lkdGggPSAodHlwZW9mKHN0cm9rZVdpZHRoKSAhPT0gJ3VuZGVmaW5lZCcgPyBzdHJva2VXaWR0aCA6IDApO1xuXG5cdFx0XHRpZiAoIXN0cm9rZUNvbG9yKVxuXHRcdFx0XHRzdHJva2VDb2xvciA9IENvbG9yLmJsYWNrO1xuXG5cdFx0XHRvcGFjaXR5ID0gKHR5cGVvZihvcGFjaXR5KSAhPT0gJ3VuZGVmaW5lZCcgPyBvcGFjaXR5IDogMSk7XG5cbiAgICBcdFx0dmFyIGVsID0gPFNWR0VsZW1lbnQ+ZG9jdW1lbnQuY3JlYXRlRWxlbWVudE5TKFNWRy5fbmFtZXNwYWNlLCAncmVjdCcpO1xuXG4gICAgXHRcdC8vIE1ha2Ugc3VyZSB3aWR0aCBhbmQgaGVpZ2h0IGFyZSBwb3NpdGl2ZS5cbiAgICBcdFx0aWYgKGhlaWdodCA8IDApIHtcbiAgICBcdFx0XHR5ICs9IGhlaWdodDtcbiAgICBcdFx0XHRoZWlnaHQgPSAtaGVpZ2h0O1xuICAgIFx0XHR9XG5cbiAgICBcdFx0aWYgKHdpZHRoIDwgMCkge1xuICAgIFx0XHRcdHggKz0gaGVpZ2h0O1xuICAgIFx0XHRcdHdpZHRoID0gLXdpZHRoO1xuICAgIFx0XHR9XG5cbiAgICBcdFx0ZWwuc2V0QXR0cmlidXRlKCd4JywgeC50b1N0cmluZygpKTtcbiAgICBcdFx0ZWwuc2V0QXR0cmlidXRlKCd5JywgeS50b1N0cmluZygpKTtcbiAgICBcdFx0ZWwuc2V0QXR0cmlidXRlKCd3aWR0aCcsIHdpZHRoLnRvU3RyaW5nKCkpO1xuICAgIFx0XHRlbC5zZXRBdHRyaWJ1dGUoJ2hlaWdodCcsIGhlaWdodC50b1N0cmluZygpKTtcblxuICAgIFx0XHRpZiAodHlwZW9mKHN0cm9rZVdpZHRoKSAhPT0gJ3VuZGVmaW5lZCcpXG4gICAgXHRcdFx0JChlbCkuY3NzKCdzdHJva2Utd2lkdGgnLCBzdHJva2VXaWR0aCk7XG5cbiAgICBcdFx0aWYgKHR5cGVvZihzdHJva2VDb2xvcikgIT09ICd1bmRlZmluZWQnKVxuICAgIFx0XHRcdCQoZWwpLmNzcygnc3Ryb2tlJywgc3Ryb2tlQ29sb3IudG9TdHJpbmcoKSk7XG5cbiAgICBcdFx0aWYgKHR5cGVvZihvcGFjaXR5KSAhPT0gJ3VuZGVmaW5lZCcpXG4gICAgXHRcdFx0JChlbCkuY3NzKCdvcGFjaXR5Jywgb3BhY2l0eSk7XG5cbiAgICBcdFx0aWYgKHR5cGVvZihmaWxsQ29sb3IpICE9PSAndW5kZWZpbmVkJylcbiAgICBcdFx0XHQkKGVsKS5jc3MoJ2ZpbGwnLCBmaWxsQ29sb3IudG9TdHJpbmcoKSk7XG5cbiAgICBcdFx0cmV0dXJuIGVsO1xuXG5cdFx0fVxuXG5cblx0XHRzdGF0aWMgY3JlYXRlVGV4dCh4Om51bWJlciwgeTpudW1iZXIsIHRleHQ6c3RyaW5nLCBmb250TmFtZT86c3RyaW5nLCBmb250U2l6ZT86bnVtYmVyLCBjZW50ZXJlZE9uWD86Ym9vbGVhbiwgY29sb3I/OkNvbG9yKTpTVkdFbGVtZW50IHtcbiAgICBcdFx0dmFyIGVsID0gPFNWR0VsZW1lbnQ+ZG9jdW1lbnQuY3JlYXRlRWxlbWVudE5TKFNWRy5fbmFtZXNwYWNlLCAndGV4dCcpO1xuXG4gICAgXHRcdGVsLnNldEF0dHJpYnV0ZSgneCcsIHgudG9TdHJpbmcoKSk7XG4gICAgXHRcdGVsLnNldEF0dHJpYnV0ZSgneScsIHkudG9TdHJpbmcoKSk7XG5cbiAgICBcdFx0aWYgKGZvbnROYW1lKVxuICAgIFx0XHRcdGVsLnNldEF0dHJpYnV0ZSgnZm9udC1mYW1pbHknLCBmb250TmFtZSk7XG4gICAgXHRcdGVsc2VcbiAgICBcdFx0XHRlbC5zZXRBdHRyaWJ1dGUoJ2ZvbnQtZmFtaWx5JywgXCJWZXJkYW5hXCIpO1xuXG4gICAgXHRcdGlmIChmb250U2l6ZSlcbiAgICBcdFx0XHRlbC5zZXRBdHRyaWJ1dGUoJ2ZvbnQtc2l6ZScsIGZvbnRTaXplLnRvU3RyaW5nKCkpO1xuICAgIFx0XHRlbHNlXG4gICAgXHRcdFx0ZWwuc2V0QXR0cmlidXRlKCdmb250LXNpemUnLCBcIjEyXCIpO1xuXG4gICAgXHRcdGVsLnRleHRDb250ZW50ID0gdGV4dDtcblxuICAgIFx0XHQvLyBDZW50ZXIgb24gWD8/XG4gICAgXHRcdGlmIChjZW50ZXJlZE9uWClcbiAgICBcdFx0XHRlbC5zZXRBdHRyaWJ1dGUoJ3RleHQtYW5jaG9yJywgJ21pZGRsZScpO1xuICAgIFx0XHRlbHNlXG4gICAgXHRcdFx0ZWwuc2V0QXR0cmlidXRlKCd0ZXh0LWFuY2hvcicsICdzdGFydCcpO1xuXG4gICAgXHRcdGlmIChjb2xvcikge1xuICAgIFx0XHRcdCQoZWwpLmNzcygnZmlsbCcsIGNvbG9yLnRvU3RyaW5nKCkpO1xuICAgIFx0XHR9XG5cbiAgICBcdFx0cmV0dXJuIGVsO1xuXHRcdH1cblxuXG5cdFx0Ly8gTW9kaWZ5IGEgcmVjdCBlbGVtZW50IHRvIHJvdW5kIGl0cyBjb3JuZXJzLlxuXHRcdHN0YXRpYyBtYWtlUmVjdFJvdW5kZWQocmVjdCwgcngsIHJ5KSB7XG4gICAgXHRcdHJlY3Quc2V0QXR0cmlidXRlKCdyeCcsIHJ4KTtcbiAgICBcdFx0cmVjdC5zZXRBdHRyaWJ1dGUoJ3J5JywgcnkpO1xuXHRcdH1cblxuXHRcdHByaXZhdGUgc3RhdGljIF9uYW1lc3BhY2U6c3RyaW5nID0gXCJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2Z1wiO1xuXG5cdH1cblxufSAvLyBlbmQgbW9kdWxlIFV0bFxuXG4iXX0=