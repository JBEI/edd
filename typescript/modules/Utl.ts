// This file contains various utility classes under the Utl module.

import * as jQuery from "jquery";
import "jquery.cookie";
import "../src/EDDDataInterface";

// TODO find out a way to do this in Typescript without relying on specific output targets
/* tslint:disable */
declare function require(name: string): any;
// load dropzone module
var Dropzone = require('dropzone');
require('dropzone/dist/dropzone.css');
/* tslint:enable */


export function relativeURL(path: string, base?: URL): URL {
    // Defining this to clean up boilerplate as TypeScript compiler requires URL constructor
    // to take only strings as both arguments, instead of a string and another URL.
    let baseStr = window.location.toString();
    if (base) {
        baseStr = base.toString();
    }
    return new URL(path, baseStr);
}


export function lookup<U>(list: RecordList<U>, key: number | string): U {
    // return item or an empty null type
    return list[key] || {} as U;
}


/**
 * Takes an array-of-arrays, and returns a joined array of the concatenated sub-arrays.
 */
export function chainArrays<T>(a: T[][]): T[] {
    return [].concat.apply([], a);
}


export class EDD {

    static resolveMeasurementRecordToName(measurementRecord: AssayMeasurementRecord): string {

        var mName = '';
        // We figure out the name and units differently based on the subtype.
        var mst = measurementRecord.mst;
        if (mst === 1) { // Metabolite type.  Magic numbers.  EW!  TODO: Eeeew!
            var compName = '';
            var compID = measurementRecord.mq;
            if (compID) {
                var cRecord = EDDData.MeasurementTypeCompartments[compID];
                if (cRecord) {
                    compName = cRecord.code + ' ';
                }
            }
            var mRecord = EDDData.MetaboliteTypes[measurementRecord.mt];
            mName = compName + mRecord.name;
        } else if (mst === 2) {  // Gene type.  EWW EWW
            mName = EDDData.GeneTypes[measurementRecord.mt].name;
        } else if (mst === 3) {  // Protein type.  EWW EWW
            mName = EDDData.ProteinTypes[measurementRecord.mt].name;
        }
        return mName;
    }


    static resolveMeasurementRecordToUnits(measurementRecord: AssayMeasurementRecord): string {

        var mUnits = '';
        var mst = measurementRecord.mst;
        if (mst === 1) {     // TODO: https://www.youtube.com/watch?v=JltEXpbGM8s
            if (measurementRecord.uid) {
                var uRecord = EDDData.UnitTypes[measurementRecord.uid];
                if (uRecord) {
                    mUnits = uRecord.name;
                }
            }
        } else if (mst === 2) {
            mUnits = '';    // Units for Proteomics?  Anyone?
        } else if (mst === 3) {
            mUnits = 'RPKM';
        }
        return mUnits;
    }


    static findCSRFToken(): string {
        if (jQuery.cookie) {
            return jQuery.cookie('csrftoken');
        }
        return <string> jQuery('input[name=csrfmiddlewaretoken]').val() || '';
    }


    // Helper function to do a little more prep on objects when calling jQuery's Alax handler.
    // If options contains "data", it is assumed to be a constructed formData object.
    // If options contains a "rawdata" object, it is assumed to be a key-value collection
    // If options contains "type", the form type will be set to it
    //   - valid values are 'GET' or 'POST'.
    //   - If "type" is not specified, it will be 'POST'.
    // If options contains a "progressBar" object, that object is assumed to be an HTMLElement
    //   of type "progress", and the bar will be updated to reflect the upload and/or
    //   download completion.
    static callAjax(options) {
        var processData = false;
        var formData = options.rawdata || options.data;
        var url = options.url || '';
        var type = options.type || 'POST';
        if ((options.rawdata) && (type !== 'POST')) {
            // Turns object name/attribute pairs into a query string, e.g. ?a=4&b=3 .
            // Never what we want when using POST.
            processData = true;
        }
        var headers = {};
        if (type === 'POST') {
            headers["X-CSRFToken"] = EDD.findCSRFToken();
        }
        $.ajax({
            xhr: function() {
                var xhr = new XMLHttpRequest();
                if (options.progressBar && (options.upEnd - options.upStart > 0)) {
                    xhr.upload.addEventListener("progress", function(evt) {
                        if (evt.lengthComputable) {
                            var p = ((evt.loaded / evt.total) *
                                (options.upEnd - options.upStart)
                            ) + options.upStart;
                            options.progressBar.setProgress(p);
                        }
                    }, false);
                }
                if (options.progressBar && (options.downEnd - options.downStart > 0)) {
                    xhr.addEventListener("progress", function(evt) {
                        if (evt.lengthComputable) {
                            var p = ((evt.loaded / evt.total) *
                                (options.downEnd - options.downStart)
                            ) + options.downStart;
                            options.progressBar.setProgress(p);
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
            contentType: false,
            processData: processData,
            success: options.success,
        });
    }
}



export class Tabs {
    // Set up click-to-browse tabs
    static prepareTabs() {
        // declare the click handler at the document level, then filter to any link inside
        // a .tabBar
        $(document).on('click', '.tabBar span:not(.active)', (e) => {
            var targetTab = $(e.target).closest('span');
            var activeTabs = targetTab.closest('div.tabBar').children('span.active');

            activeTabs.removeClass('active');
            targetTab.addClass('active');

            var targetTabContentID = targetTab.attr('for');
            if (targetTabContentID) {
                // Hide the content section for whatever tabs were active, then show the
                // one selected
                activeTabs.each((i, tab) => {
                    var contentId = $(tab).attr('for');
                    if (contentId) {
                        $(document.getElementById(contentId)).addClass('off');
                    }
                });
                $(document.getElementById(targetTabContentID)).removeClass('off');
            }
        });
    }
}


// This is currently implemented almost exactly like Tabs above.
export class ButtonBar {
    // Set up click-to-browse tabs
    static prepareButtonBars() {
        // declare the click handler at the document level, then filter to any link inside
        // a .buttonBar
        $(document).on('click', '.buttonBar span:not(.active)', (e) => {
            var targetButton = $(e.target).closest('span');
            var activeButtons = targetButton.closest('div.buttonBar').children('span.active');

            activeButtons.removeClass('active');
            targetButton.addClass('active');

            var targetButtonContentID = targetButton.attr('for');

            if (targetButtonContentID) {
                // Hide the content section for whatever buttons were active, then show the
                // one selected
                activeButtons.each((i, button) => {
                    var contentId = $(button).attr('for');
                    if (contentId) {
                        $(document.getElementById(contentId)).addClass('off');
                    }
                });
                $(document.getElementById(targetButtonContentID)).removeClass('off');
            }
        });
    }
}


export class QtipHelper {
    public create(linkElement, contentFunction, params: any): void {

        params.position.target = $(linkElement);
        // This makes it position itself to fit inside the browser window.
        params.position.viewport = $(window);

        this._contentFunction = contentFunction;

        if (!params.content) {
            params.content = {};
        }

        params.content.text = this._generateContent.bind(this);
        this.qtip = $(linkElement).qtip(params);
    }

    private _generateContent(): any {
        // It's incredibly stupid that we have to do this to work around qtip2's 280px
        // max-width default. We have to do it here rather than immediately after calling
        // qtip() because qtip waits to create the actual element.
        $(this._getQTipElement()).css('max-width', 'none').css('width', 'auto');
        return this._contentFunction();
    }

    // Get the HTML element for the qtip. Usually we use this to unset max-width.
    private _getQTipElement(): HTMLElement {
        return document.getElementById(this.qtip.attr('aria-describedby'));
    }

    public qtip: any;
    private _contentFunction: any;
}


// RGBA helper class.
// Values are 0-255 (although toString() makes alpha 0-1 since that's how CSS likes it).
export class Color {

    r: number;
    g: number;
    b: number;
    a: number;

    // Note: All values are 0-255, but toString() will convert alpha to a 0-1 value
    static rgba(r: number, g: number, b: number, alpha: number): Color {
        var clr: Color = new Color();
        clr.r = r;
        clr.g = g;
        clr.b = b;
        clr.a = alpha;
        return clr;
    }

    // Note: All values are 0-255, but toString() will convert alpha to a 0-1 value
    static rgb(r: number, g: number, b: number): Color {
        var clr: Color = new Color();
        clr.r = r;
        clr.g = g;
        clr.b = b;
        clr.a = 255;
        return clr;
    }

    static interpolate(clr1: Color, clr2: Color, t: number): Color {
        return Color.rgba(
            clr1.r + (clr2.r - clr1.r) * t,
            clr1.g + (clr2.g - clr1.g) * t,
            clr1.b + (clr2.b - clr1.b) * t,
            clr1.a + (clr2.a - clr1.a) * t
        );
    }

    static toString(clr: any): string {
        // If it's something else (like a string) already, just return that value.
        if (typeof clr === 'string') {
            return clr;
        }

        return 'rgba(' +
            Math.floor(clr.r) + ', ' +
            Math.floor(clr.g) + ', ' +
            Math.floor(clr.b) + ', ' +
            (clr.a / 255) + ')';
    }

    toString(): string {
        return Color.toString(this);
    }

    static red = Color.rgb(255, 0, 0);
    static green = Color.rgb(0, 255, 0);
    static blue = Color.rgb(0, 0, 255);
    static black = Color.rgb(0, 0, 0);
    static white = Color.rgb(255, 255, 255);

}


export class Table {

    constructor(tableID: string, width?: number, height?: number) {
        this.table = document.createElement('table');
        this.table.id = tableID;

        if (width) {
            $(this.table).css('width', width);
        }

        if (height) {
            $(this.table).css('height', height);
        }
    }

    addRow(): HTMLTableRowElement {
        this._currentRow++;
        return this.table.insertRow(-1);
    }

    addColumn(): HTMLElement {
        return this.table.rows.item(this._currentRow - 1).insertCell(-1);
    }

    // When you're done setting up the table, add it to another element.
    addTableTo(element: HTMLElement) {
        element.appendChild(this.table);
    }

    table: HTMLTableElement = null;
    _currentRow: number = 0;
}


// Javascript utilities
export class JS {

    // This assumes that str has only one root element.
    // It also breaks for elements that need to be nested under other specific element types,
    // e.g. if you attempt to create a <td> you will be handed back a <div>.
    static createElementFromString(str: string, namespace: string = null): HTMLElement {

        var div;
        if (namespace) {
            div = document.createElementNS(namespace, 'div');
        } else {
            div = document.createElement('div');
        }

        div.innerHTML = str;
        return div.firstChild;

    }


    static assert(condition: boolean, message: string): void {
        if (!condition) {
            message = message || "Assertion failed";
            if (typeof Error !== 'undefined') {
                throw Error(message);
            } else {
                throw message;
            }
        }
    }


    static convertHashToList(hash: any): any {
        return Object.keys(hash).map((a) => hash[a]);
    }


    // Returns a string of length numChars, padding the right side
    // with spaces if str is shorter than numChars.
    // Will truncate if the string is longer than numChars.
    static padStringLeft(str: string, numChars: number): string {
        var startLen: number = str.length;
        for (var i = startLen; i < numChars; i++) {
            str += ' ';
        }

        return str.slice(0, numChars);
    }


    // Returns a string of length numChars, padding the left side
    // with spaces if str is shorter than numChars.
    static padStringRight(str: string, numChars: number): string {
        var padStr = "";
        for (var i = 0; i < numChars; i++) {
            padStr += " ";
        }

        return (padStr + str).slice(-numChars);
    }


    // Make a string by repeating the specified string N times.
    static repeatString(str: string, numChars: number): string {
        var ret: string = "";
        for (var i: number = 0; i < numChars; i++) {
            ret += str;
        }

        return ret;
    }


    // Convert a size provided in bytes to a nicely formatted string
    static sizeToString(size: number, allowBytes?: boolean): string {

        var tb = size / (1024 * 1024 * 1024 * 1024);
        if ((tb > 1) || (tb < -1)) {
            return JS.nicelyPrintFloat(tb, 2) + ' Tb';
        }
        var gigs = size / (1024 * 1024 * 1024);
        if ((gigs > 1) || (gigs < -1)) {
            return JS.nicelyPrintFloat(gigs, 2) + ' Gb';
        }
        var megs = size / (1024 * 1024);
        if ((megs > 1) || (megs < -1)) {
            return JS.nicelyPrintFloat(megs, 2) + ' Mb';
        }
        var k = size / 1024;
        if (((k > 1) || (k < -1)) || !allowBytes) {
            return JS.nicelyPrintFloat(k, 2) + ' Kb';
        }
        return size + ' b';
    }


    // -1 : Print as a full float
    //  0 : Print as an int, ALWAYS rounded down.
    // +n : Print with n decimal places, UNLESS the value is an integer
    static nicelyPrintFloat(v: number, places: number): string {
        // We do not want to display ANY decimal point if the value is an integer.
        if (v % 1 === 0) {  // Basic integer test
            return (v % 1).toString();
        }
        if (places > 0) {
            return v.toFixed(places);
        } else if (places === 0) {
            return (v % 1).toString();
        }
        return v.toString();
    }


    // Given a file name (n) and a file type string (t), try and guess what kind of file
    // we've got.
    static guessFileType(n: string, t: string): string {
        // Going in order from most confident to least confident guesses:
        if (t.indexOf('officedocument.spreadsheet') >= 0) { return 'xlsx'; }
        if (t === 'text/csv') { return 'csv'; }
        if (t === 'text/xml') { return 'xml'; }
        if ((n.indexOf('.xlsx', n.length - 5) !== -1) ||
            (n.indexOf('.xls', n.length - 4) !== -1)) { return 'xlsx'; }
        if (n.indexOf('.xml', n.length - 4) !== -1) { return 'xml'; }
        if (t === 'text/plain') { return 'txt'; }
        if (n.indexOf('.txt', n.length - 4) !== -1) { return 'txt'; }
        // If all else fails, assume it's a csv file.
        // (So, any extension that's not tried above, or no extension.)
        return 'csv';
    }


    // Given a date in seconds (with a possible fractional portion being milliseconds),
    // based on zero being midnight of Jan 1, 1970 (standard old-school POSIX time),
    // return a string formatted in the manner of "Dec 21 2012, 11:45am",
    // with exceptions for 'Today' and 'Yesterday', e.g. "Yesterday, 3:12pm".
    static timestampToTodayString(timestamp: number): string {

        if (!timestamp || timestamp < 1) {
            return '<span style="color:#888;">N/A</span>';
        }

        var time: Date = new Date(Math.round(timestamp * 1000));
        var now: Date = new Date();
        var yesterday: Date = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        var day_str: string;
        var time_str: string;

        if ((time.getFullYear() === now.getFullYear()) &&
            (time.getMonth() === now.getMonth()) &&
            (time.getDate() === now.getDate())) {
            day_str = 'Today';
        } else if ((time.getFullYear() === yesterday.getFullYear()) &&
            (time.getMonth() === yesterday.getMonth()) &&
            (time.getDate() === yesterday.getDate())) {
            day_str = 'Yesterday';
        } else if (time.getFullYear() === now.getFullYear()) {
            day_str = new Intl.DateTimeFormat('en-US',
                {month: 'short', day: 'numeric'}).format(time);
        } else {
            day_str = new Intl.DateTimeFormat('en-US',
                {month: 'short', day: 'numeric', year: 'numeric'}).format(time);
        }
        time_str = new Intl.DateTimeFormat('en-US',
            {hour: 'numeric', minute: 'numeric'}).format(time);

        return day_str + ', ' + time_str;
    }


    static utcToTodayString(utc: string): string {
        var m: any[];
        var timestamp: number;
        m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.?(\d{1,6})?Z$/.exec(utc);
        if (m) {
            m.shift(); // get rid of overall match, we don't care
            m.map((v) => { return parseInt(v, 10); }); // convert strings to numbers
            m[1]--; // Date uses 0-based months, so decrement month
            timestamp = Date.UTC(m[0], m[1], m[2], m[3], m[4], m[5]);
            timestamp /= 1000; // the timestampToTodayString expects seconds, not milliseconds
            return JS.timestampToTodayString(timestamp);
        }
        return JS.timestampToTodayString(null);
    }


    // Remap a value from [inMin, inMax] to [outMin, outMax]
    static remapValue(
            value: number,
            inMin: number,
            inMax: number,
            outMin: number,
            outMax: number): number {
        var delta: number = inMax - inMin;

        // If they've given us a tiny input range, then we can't really parameterize
        // into the range, so let's just return halfway between the outputs.
        if (Math.abs(delta) < 0.000001) {
            return outMin + (outMax - outMin) * 0.5;
        }

        var t = (value - inMin) / (inMax - inMin);
        return outMin + (outMax - outMin) * t;
    }

    // Remove all child elements from the specified element.
    static removeAllChildren(element: HTMLElement): void {
        while (element.firstChild) {
            element.removeChild(element.firstChild);
        }
    }

    static removeFromParent(element: HTMLElement): void {
        if (element && element.parentNode) {
            element.parentNode.removeChild(element);
        }
    }

    static startWaitBadge(selector): void {
        $(selector).css("class", "waitbadge wait");
    }

    static stopWaitBadge(selector): void {
        $(selector).css("class", "waitbadge");
    }
}



// A class wrapping dropzone (http://www.dropzonejs.com/) and providing some additional
// structure.
// A new dropzone is initialized with a single 'options' object:
// {
//  elementId: ID of the element to be set up as a drop zone
//  url: url where to send request
//  processResponseFn: process success return from server
//  processErrorFn: process error result return from server for experiment description
//  processWarningFn: process warning result return from server for experiment description
//  fileInitFn: preprocess for import
//  clickable: value to pass to dropzone clickable parameter
// }

export class FileDropZone {

    csrftoken: any;
    dropzone: any;
    fileInitFn: any;
    options: any;

    constructor(options: any) {
        let element = document.getElementById(options.elementId);
        let clickable = options.clickable === undefined ? true : options.clickable;
        if (element) {
            $(element).addClass('dropzone');
            this.csrftoken = EDD.findCSRFToken();
            this.fileInitFn = options.fileInitFn;
            this.options = options;
            this.dropzone = new Dropzone(element, {
                'url': options.url,
                'params': {'csrfmiddlewaretoken': this.csrftoken},
                'maxFilesize': 2,
                'acceptedFiles': ".doc,.docx,.pdf,.txt,.xls,.xlsx, .xml, .csv",
                'clickable': clickable,
            });
        }
    }

    // Helper function to create and set up a FileDropZone.
    static create(options: any): void {
        let widget = new FileDropZone(options);
        if (widget.dropzone) {
            widget.setEventHandlers();
        }
    }

    setEventHandlers(): void {
        this.dropzone.on('sending', (file, xhr, formData) => {
            // for import
            if (this.options.fileInitFn) {
                this.options.fileInitFn(file, formData);
            }
        });
        this.dropzone.on('error', (file, msg, xhr) => {
            if (typeof this.options.processErrorFn === 'function') {
                this.options.processErrorFn(this, file, msg, xhr);
            }
        });
        this.dropzone.on('success', (file) => {
            var xhr = file.xhr;
            var response = JSON.parse(xhr.response);
            if (response.warnings) {
                if ('function' === typeof this.options.processWarningFn) {
                    this.options.processWarningFn(file, response);
                }
            } else if ('function' === typeof this.options.processResponseFn) {
                this.options.processResponseFn(this, file, response);
            }
            this.dropzone.removeAllFiles();
        });
    };
}


// SVG-related utilities.
export class SVG {

    static createSVG(width: any, height: any, boxWidth: number, boxHeight: number): SVGElement {
        var svgElement: SVGElement;
        svgElement = <SVGElement> document.createElementNS(SVG._namespace, "svg");
        svgElement.setAttribute('version', '1.2');
        svgElement.setAttribute('width', width.toString());
        svgElement.setAttribute('height', height.toString());
        svgElement.setAttribute('viewBox', '0 0 ' + boxWidth + ' ' + boxHeight);
        svgElement.setAttribute('preserveAspectRatio', 'none');
        return svgElement;
    }


    // Creates a vertical line centered on (xCoord,yCoord).
    static createVerticalLinePath(
            xCoord: number,
            yCoord: number,
            lineWidth: number,
            lineHeight: number,
            color: Color,
            svgElement: any): SVGElement {
        var halfWidth: number = lineWidth / 2;

        var topY: number = Math.floor(yCoord - lineHeight / 2);
        var bottomY: number = Math.floor(yCoord + lineHeight / 2);
        var midX: number = Math.floor(xCoord + halfWidth);
        var el = SVG.createLine(midX, topY, midX, bottomY, color, lineWidth);

        if (svgElement) {
            svgElement.appendChild(el);
        }

        return el;
    }


    static createLine(
            x1: number,
            y1: number,
            x2: number,
            y2: number,
            color?: Color,
            width?: number): SVGElement {
        var el = <SVGElement> document.createElementNS(SVG._namespace, 'line');

        el.setAttribute('x1', x1.toString());
        el.setAttribute('y1', y1.toString());
        el.setAttribute('x2', x2.toString());
        el.setAttribute('y2', y2.toString());

        if (color) {
            $(el).css('stroke', color.toString());
        }

        if (width) {
            $(el).css('stroke-width', width.toString());
        }

        return el;
    }


    static createRect(
            x: number,
            y: number,
            width: number,
            height: number,
            fillColor: Color,
            strokeWidth?: number,
            strokeColor?: Color,
            opacity?: number): SVGElement {

        // Default values.
        strokeWidth = (typeof(strokeWidth) !== 'undefined' ? strokeWidth : 0);

        if (!strokeColor) {
            strokeColor = Color.black;
        }

        opacity = (typeof(opacity) !== 'undefined' ? opacity : 1);

        var el = <SVGElement> document.createElementNS(SVG._namespace, 'rect');

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

        if (typeof(strokeWidth) !== 'undefined') {
            $(el).css('stroke-width', strokeWidth);
        }
        if (typeof(strokeColor) !== 'undefined') {
            $(el).css('stroke', strokeColor.toString());
        }
        if (typeof(opacity) !== 'undefined') {
            $(el).css('opacity', opacity);
        }
        if (typeof(fillColor) !== 'undefined') {
            $(el).css('fill', fillColor.toString());
        }
        return el;

    }


    static createText(
            x: number,
            y: number,
            text: string,
            fontName?: string,
            fontSize?: number,
            centeredOnX?: boolean,
            color?: Color): SVGElement {
        var el = <SVGElement> document.createElementNS(SVG._namespace, 'text');

        el.setAttribute('x', x.toString());
        el.setAttribute('y', y.toString());

        if (fontName) {
            el.setAttribute('font-family', fontName);
        } else {
            el.setAttribute('font-family', "Verdana");
        }
        if (fontSize) {
            el.setAttribute('font-size', fontSize.toString());
        } else {
            el.setAttribute('font-size', "12");
        }
        el.textContent = text;

        // Center on X??
        if (centeredOnX) {
            el.setAttribute('text-anchor', 'middle');
        } else {
            el.setAttribute('text-anchor', 'start');
        }

        if (color) {
            $(el).css('fill', color.toString());
        }

        return el;
    }


    // Modify a rect element to round its corners.
    static makeRectRounded(rect, rx, ry) {
        rect.setAttribute('rx', rx);
        rect.setAttribute('ry', ry);
    }

    private static _namespace: string = "http://www.w3.org/2000/svg";

}

/**
 * Common handling code for Dropzone events in both the Overview and Lines (aka Experiment
 * Description) pages.
 */
export class FileDropZoneHelpers {

    private pageRedirect: string;
    private actionPanelIsCopied: boolean;

    constructor(options?: any) {
        options = options || {};
        this.pageRedirect = options.pageRedirect || '';
        this.actionPanelIsCopied = false;
    }

    // This is called upon receiving a response from a file upload operation, and unlike
    // fileRead(), is passed a processed result from the server as a second argument,
    // rather than the raw contents of the file.
    fileReturnedFromServer(fileContainer, result): void {
        let base = relativeURL('../');
        let redirect = relativeURL(this.pageRedirect, base);
        let message = JSON.parse(result.xhr.response);
        $('<p>', {
            text: ['Success!', message.lines_created, 'lines added!'].join(' '),
            style: 'margin:auto',
        }).appendTo('#linesAdded');
        $('#linesAdded').removeClass('off');
        this.successfulRedirect(redirect.pathname);
    }

    fileWarningReturnedFromServer(fileContainer, result): void {
        let base = relativeURL('../');
        let redirect = relativeURL(this.pageRedirect, base);

        this.copyActionButtons();

        $('#acceptWarnings').find('.acceptWarnings')
            .on('click', (ev: JQueryMouseEventObject): boolean => {
                this.successfulRedirect(redirect.pathname);
                return false;
            });

        $('<p>', {
            text: 'Success! ' + result.lines_created + ' lines added!',
            style: 'margin:auto',
        }).appendTo('#linesAdded');
        // display success message
        $('#linesAdded').removeClass('off');
        this.generateMessages('warnings', result.warnings);
        this.generateAcceptWarning();
    }

    private successfulRedirect(linesPathName): void {
        // redirect to lines page
        setTimeout(function () {
            window.location.pathname = linesPathName;
        }, 1000);
    };

    private copyActionButtons(): void {
        if (!this.actionPanelIsCopied) {
            let original: JQuery = $('#actionWarningBar');
            let copy: JQuery = original.clone().appendTo('#bottomBar').hide();
            // forward click events on copy to the original button
            copy.on('click', 'button', (e) => {
                original.find('#' + e.target.id).trigger(e);
            });
            let originalDismiss: JQuery = $('#dismissAll').find('.dismissAll');
            let copyDismiss: JQuery = originalDismiss.clone().appendTo('#bottomBar').hide();
            // forward click events on copy to the original button
            copyDismiss.on('click', 'button', (e) => {
                originalDismiss.trigger(e);
            });
            let originalAcceptWarnings: JQuery = $('#acceptWarnings').find('.acceptWarnings');
            let copyAcceptWarnings: JQuery = originalAcceptWarnings
                .clone().appendTo('#bottomBar').hide();
            // forward click events on copy to the original button
            copyAcceptWarnings.on('click', 'button', (e) => {
                originalAcceptWarnings.trigger(e);
            });
            this.actionPanelIsCopied = true;
        }
    };

    // This is called upon receiving an error in a file upload operation, and
    // is passed an unprocessed result from the server as a second argument.

    fileErrorReturnedFromServer(dropZone: FileDropZone, file, msg, xhr): void {

        this.copyActionButtons();

        let parent: JQuery = $('#alert_placeholder'),
            dismissAll: JQuery = $('#dismissAll'),
            baseUrl: URL = relativeURL('../');
        // reset the drop zone here
        // parse xhr.response
        let contentType = xhr.getResponseHeader('Content-Type');

        if (xhr.status === 504) {
            this.generate504Error();
        } else if (xhr.status === 413) {
            this.generate413Error();
        } else if (contentType === 'application/json') {
            let json = JSON.parse(xhr.response);
            if (json.errors) {
                if (json.errors[0].category.indexOf('ICE') > -1) {
                    // first remove all files in upload
                    dropZone.dropzone.removeAllFiles();
                    file.status = undefined;
                    file.accepted = undefined;
                    // create alert notification
                    this.processICEerror(json.errors);

                    // click handler for omit strains
                    $('#alert_placeholder').find('.omitStrains').on('click', (ev): void => {
                        var parsedUrl: URL = new URL(
                            dropZone.dropzone.options.url,
                            window.location.toString()
                        );
                        $(ev.target).parent().remove();
                        parsedUrl.searchParams.append('IGNORE_ICE_ACCESS_ERRORS', 'true');
                        dropZone.dropzone.options.url = parsedUrl.toString();
                        dropZone.dropzone.addFile(file);
                    });
                } else {
                    this.generateMessages('error', json.errors);
                }
            }

            // Note: there may be warnings in addition to errors displayed above
            if (json.warnings) {
                this.generateMessages('warnings', json.warnings);
            }
        } else {
            // if there is a back end or proxy error (likely html response), show this
            let defaultError = {
                category: "",
                summary: "There was an error",
                details: "Please try again later or contact support.",
            };
            this.alertError(defaultError);
        }

        // remove the unhelpful DZ default err message ("object")
        $('.dz-error-message').text('File errors (see above)');

        dismissAll.toggleClass('off', ($('.alert').length <= 2));

        // set up click handler events
        parent.find('.omitStrains').on('click', (ev: JQueryMouseEventObject): boolean => {
            ev.preventDefault();
            ev.stopPropagation();
            $('#iceError').hide();
            return false;
        });

        parent.find('.allowDuplicates').on('click', (ev: JQueryMouseEventObject): boolean => {
            let f = file.file,
                targetUrl = new URL('describe', baseUrl.toString());
            ev.preventDefault();
            ev.stopPropagation();
            targetUrl.searchParams.append('ALLOW_DUPLICATE_NAMES', 'true');
            f.sendTo(targetUrl.toString());
            $('#duplicateError').hide();
            return false;
        });

        $('.noDuplicates, .noOmitStrains').on('click', (ev: JQueryMouseEventObject): boolean => {
            ev.preventDefault();
            ev.stopPropagation();
            window.location.reload();
            return false;
        });
        // dismiss all alerts
        dismissAll.on('click', '.dismissAll', (ev: JQueryMouseEventObject): boolean => {
            ev.preventDefault();
            ev.stopPropagation();
            parent.find('.close').click();
            window.location.reload();
            return false;
        });

        $('#acceptWarnings').find('.acceptWarnings').on('click', (ev): boolean => {
            let redirect = relativeURL('experiment-description/', baseUrl);
            ev.preventDefault();
            ev.stopPropagation();
            this.successfulRedirect(redirect.pathname);
            return false;
        });
    }

    private generateMessages(type, response) {
        var responseMessages = this.organizeMessages(response);
        $.each(responseMessages, (key: string, value: any) => {
            let template = type === 'error' ? '.alert-danger' : '.alert-warning';
            let div = $(template).eq(0).clone();
            this.alertMessage(key, value, div, type);
        });
    };

    private processICEerror(responses): void {
        $('.noDuplicates, .noOmitStrains').on('click', (ev): boolean => {
            ev.preventDefault();
            ev.stopPropagation();
            window.location.reload();
            return false;
        });
        for (var response of responses) {
            // create dismissible error alert
            this.alertIceWarning(response);
        }
    };


    private generateAcceptWarning(): void {
        var warningAlerts: JQuery, acceptWarningDiv: JQuery;
        warningAlerts = $('.alert-warning:visible');
        acceptWarningDiv = $('#acceptWarnings').find('.acceptWarnings');
        if (warningAlerts.length === 1) {
            $(warningAlerts).append(acceptWarningDiv);
        } else {
            $('#alert_placeholder').prepend(acceptWarningDiv);
        }
        acceptWarningDiv.show();
    };

    private organizeMessages(responses) {
        var obj = {};
        for (var response of responses) {
            var message = response.summary + ": " + response.details;

            if (obj.hasOwnProperty(response.category)) {
                obj[response.category].push(message);
            } else {
                obj[response.category] = [message];
            }
        }
        return obj;
    };

    private generate504Error(): void {
        let response = {
            category: "",
            summary: "EDD timed out",
            details: "Please reload page and re-upload file",
        };
        this.alertError(response);
    };

    private generate413Error(): void {
        let response = {
            category: "",
            summary: "File too large",
            details: "Please contact system administrators or break your file into parts.",
        };
        this.alertError(response);
    }

    private alertIceWarning(response): void {
        let iceError = $('#iceError');
        response.category = "Warning! " + response.category;
        this.createAlertMessage(iceError, response);
    };

    private alertError(response): void {
        var newErrorAlert = $('.alert-danger').eq(0).clone();
        this.createAlertMessage(newErrorAlert, response);
        this.clearDropZone();
    };

    private createAlertMessage(alertClone, response) {
        $(alertClone).children('h4').text(response.category);
        $(alertClone).children('p').text(response.summary + ": " + response.details);
        $('#alert_placeholder').append(alertClone);
        $(alertClone).removeClass('off').show();
    };


    private alertMessage(subject, messages, newAlert, type): void {
        if (type === "warnings") {
            $(newAlert).children('h4').text("Warning! " + subject);
        } else {
            $(newAlert).children('h4').text("Error! " + subject);
            this.clearDropZone();
        }
        $.each(messages, (key, message) => {
            let summary = $('<p>').addClass('alertWarning').text(message);
            $(newAlert).append(summary);
        });
        $('#alert_placeholder').append(newAlert);
        $(newAlert).removeClass('off').show();
    };

    private clearDropZone(): void {
        $('#experimentDescDropZone').removeClass('off');
        $('#fileDropInfoIcon').addClass('off');
        $('#fileDropInfoName').addClass('off');
        $('#fileDropInfoSending').addClass('off');
        $(".linesDropZone").addClass('off');
    }
}
