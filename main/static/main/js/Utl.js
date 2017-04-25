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
        EDD.findCSRFToken = function () {
            if (jQuery.cookie) {
                return jQuery.cookie('csrftoken');
            }
            return jQuery('input[name=csrfmiddlewaretoken]').val() || '';
        };
        // Helper function to do a little more prep on objects when calling jQuery's Alax handler.
        // If options contains "data", it is assumed to be a constructed formData object.
        // If options contains a "rawdata" object, it is assumed to be a standard key-value collection
        // If options contains "type", the form type will be set to it - valid values are 'GET' or 'POST'.
        //   If "type" is not specified, it will be 'POST'.
        // If options contains a "progressBar" object, that object is assumed to be an HTML element of type "progress",
        //   and the bar will be updated to reflect the upload and/or download completion.
        EDD.callAjax = function (options) {
            var debug = options.debug || false;
            var processData = false;
            var formData = options.rawdata || options.data;
            var url = options.url || '';
            var type = options.type || 'POST';
            if ((options.rawdata) && (type != 'POST')) {
                // Turns object name/attribute pairs into a query string, e.g. ?a=4&b=3 .
                // Never what we want when using POST.
                processData = true;
            }
            if (debug) {
                console.log('Calling ' + url);
            }
            var headers = {};
            if (type == 'POST') {
                headers["X-CSRFToken"] = EDD.findCSRFToken();
            }
            $.ajax({
                xhr: function () {
                    var xhr = new XMLHttpRequest();
                    if (options.progressBar && (options.upEnd - options.upStart > 0)) {
                        // Specifying evt:any to deal with TypeScript compile error
                        // ">> ../site/ALWindow.ts(197,15): error TS2339: Property 'lengthComputable' does not exist on type 'Event'."
                        xhr.upload.addEventListener("progress", function (evt) {
                            if (evt.lengthComputable) {
                                var p = ((evt.loaded / evt.total) * (options.upEnd - options.upStart)) + options.upStart;
                                options.progressBar.setProgress(p);
                                if (debug) {
                                    console.log('Upload Progress ' + p + '...');
                                }
                            }
                            else if (debug) {
                                console.log('Upload Progress...');
                            }
                        }, false);
                    }
                    if (options.progressBar && (options.downEnd - options.downStart > 0)) {
                        xhr.addEventListener("progress", function (evt) {
                            if (evt.lengthComputable) {
                                var p = ((evt.loaded / evt.total) * (options.downEnd - options.downStart)) + options.downStart;
                                options.progressBar.setProgress(p);
                                if (debug) {
                                    console.log('Download Progress ' + p + '...');
                                }
                            }
                            else if (debug) {
                                console.log('Download Progress...');
                            }
                        }, false);
                    }
                    return xhr;
                },
                headers: headers,
                type: type,
                url: url,
                data: formData,
                cache: false,
                error: function (jqXHR, textStatus, errorThrown) {
                    if (debug) {
                        console.log(textStatus + ' ' + errorThrown);
                        console.log(jqXHR.responseText);
                    }
                },
                contentType: false,
                processData: processData,
                success: function () {
                    var a = Array.prototype.slice.call(arguments, -1);
                    if (debug) {
                        console.log(a[0].responseJSON);
                    }
                    if (options.success) {
                        options.success.apply(this, arguments);
                    }
                }
            });
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
    // This is currently implemented almost exactly like Tabs above.
    var ButtonBar = (function () {
        function ButtonBar() {
        }
        // Set up click-to-browse tabs
        ButtonBar.prepareButtonBars = function () {
            // declare the click handler at the document level, then filter to any link inside a .tab
            $(document).on('click', '.buttonBar span:not(.active)', function (e) {
                var targetButton = $(e.target).closest('span');
                var activeButtons = targetButton.closest('div.buttonBar').children('span.active');
                activeButtons.removeClass('active');
                targetButton.addClass('active');
                var targetButtonContentID = targetButton.attr('for');
                var activeButtonEls = activeButtons.get();
                if (targetButtonContentID) {
                    // Hide the content section for whatever buttons were active, then show the one selected
                    for (var i = 0; i < activeButtonEls.length; i++) {
                        var a = activeButtonEls[i];
                        var ButtonContentID = $(a).attr('for');
                        if (ButtonContentID) {
                            $('#' + ButtonContentID).addClass('off');
                        }
                    }
                    $('#' + targetButtonContentID).removeClass('off');
                }
            });
        };
        return ButtonBar;
    }());
    Utl.ButtonBar = ButtonBar;
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
    //  elementId: ID of the element to be set up as a drop zone
    //  fileInitFn: Called when a file has been dropped, but before any processing has started
    //  processRawFn: Called when the file content has been read into a local variable, but before any communication with
    //                the server.
    //  url: The URL to upload the file.
    //  progressBar: A ProgressBar object for tracking the upload progress.
    //  processResponseFn: Called when the server sends back its results.
    //  processErrorFn: Called as an alternative to processResponseFn if the server reports an error.
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
        // If an error occurs, processErrorFn will be called with the result.
        function FileDropZone(options) {
            this.progressBar = options.progressBar || null;
            // If there's a cleaner way to force-disable event logging in filedrop-min.js, do please put it here!
            window.fd.logging = false;
            var z = new FileDrop(options.elementId, {}); // filedrop-min.js , http://filedropjs.org
            this.zone = z;
            this.csrftoken = EDD.findCSRFToken();
            if (!(typeof options.multiple === "undefined")) {
                z.multiple(options.multiple);
            }
            else {
                z.multiple(false);
            }
            this.fileInitFn = options.fileInitFn;
            this.processRawFn = options.processRawFn;
            this.processResponseFn = options.processResponseFn;
            this.processErrorFn = options.processErrorFn;
            this.processWarningFn = options.processWarningFn;
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
                    // If we were given a function to process the error, use it.
                    if (typeof t.processErrorFn === "function") {
                        t.processErrorFn(fileContainer, xhr);
                    }
                    else {
                        alert(result.python_error);
                    }
                }
                else if (result.warnings) {
                    t.processWarningFn(fileContainer, result);
                }
                else if (typeof t.processResponseFn === "function") {
                    t.processResponseFn(fileContainer, result);
                }
                fileContainer.allWorkFinished = true;
            });
            f.event('error', function (e, xhr) {
                if (typeof t.processErrorFn === "function") {
                    t.processErrorFn(fileContainer, xhr);
                }
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
