// This file contains various utility classes under the Utl module.

import * as $ from "jquery";

import * as Dropzone from "dropzone";

import "../modules/Styles";

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
    return list[key] || ({} as U);
}

/**
 * Takes an array-of-arrays, and returns a joined array of the concatenated sub-arrays.
 */
export function chainArrays<T>(a: T[][]): T[] {
    return [].concat(...a);
}

export function groupBy<T>(list: T[], key: string): { [key: string]: T[] } {
    return list.reduce((groups, item) => {
        const value = item[key];
        const group: T[] = groups[value] || [];
        groups[value] = group;
        group.push(item);
        return groups;
    }, {});
}

/**
 * Function decorator to debounce frequent callbacks. By default will wait 100
 * milliseconds after last call to trigger the wrapped function.
 */
export function debounce(fn: () => void, wait = 100): () => void {
    let timer;
    return (...args) => {
        window.clearTimeout(timer);
        timer = window.setTimeout(fn, wait, ...args);
    };
}

export class EDD {
    static resolveMeasurementRecordToName(measure: MeasurementRecord): string {
        const mtype = EDDData.MeasurementTypes[measure.type];
        const comp = EDDData.MeasurementTypeCompartments[measure.comp];
        const code = comp?.code || "";
        const name = mtype?.name || "Unknown";
        return `${code} ${name}`.trim();
    }

    static resolveMeasurementRecordToUnits(measure: MeasurementRecord): string {
        return EDDData.UnitTypes?.[measure.y_units]?.name || "";
    }

    static findCSRFToken(): string {
        return ($("input[name=csrfmiddlewaretoken]").val() as string) || "";
    }
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
        const clr: Color = new Color();
        clr.r = r;
        clr.g = g;
        clr.b = b;
        clr.a = alpha;
        return clr;
    }

    // Note: All values are 0-255, but toString() will convert alpha to a 0-1 value
    static rgb(r: number, g: number, b: number): Color {
        const clr: Color = new Color();
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
            clr1.a + (clr2.a - clr1.a) * t,
        );
    }

    static toString(clr: Color | string): string {
        // If it's something else (like a string) already, just return that value.
        if (typeof clr === "string") {
            return clr;
        }
        const r = Math.floor(clr.r);
        const g = Math.floor(clr.g);
        const b = Math.floor(clr.b);
        return `rgba(${r}, ${g}, ${b}, ${clr.a / 255})`;
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

// Javascript utilities
export class JS {
    /**
     * Tests if arrays both contain the same elements (order-agnostic).
     */
    static arrayEquivalent(a: any[], b: any[]): boolean {
        const combined: Set<any> = new Set<any>([...(a || []), ...(b || [])]);
        return combined.size === (a || []).length && combined.size === (b || []).length;
    }

    static assert(condition: boolean, message: string): void {
        if (!condition) {
            message = message || "Assertion failed";
            if (typeof Error !== "undefined") {
                throw Error(message);
            } else {
                throw message;
            }
        }
    }

    /**
     * A shorter alias for `Object.prototype.hasOwnProperty.call(obj, name)`.
     * Used in place of calling `obj.hasOwnProperty(name)` to account for
     * danger of the prototype method being replaced on `obj`.
     */
    static hasOwnProp(obj: unknown, name: string): boolean {
        return Object.prototype.hasOwnProperty.call(obj, name);
    }

    /**
     * Tests if a property on two objects are equal.
     */
    static propertyEqual(a: unknown, b: unknown, name: string): boolean {
        // guard against undefined/null inputs
        a = a || {};
        b = b || {};
        return JS.hasOwnProp(a, name) && JS.hasOwnProp(b, name) && a[name] === b[name];
    }

    // Given a date in seconds (with a possible fractional portion being milliseconds),
    // based on zero being midnight of Jan 1, 1970 (standard old-school POSIX time),
    // return a string formatted in the manner of "Dec 21 2012, 11:45am",
    // with exceptions for 'Today' and 'Yesterday', e.g. "Yesterday, 3:12pm".
    static timestampToTodayString(timestamp: number): string {
        if (!timestamp || timestamp < 1) {
            return `<span style="color:#888;">N/A</span>`;
        }
        const time: Date = new Date(Math.round(timestamp * 1000));
        const now: Date = new Date();
        const yesterday: Date = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        let day_str: string;
        if (
            time.getFullYear() === now.getFullYear() &&
            time.getMonth() === now.getMonth() &&
            time.getDate() === now.getDate()
        ) {
            day_str = "Today";
        } else if (
            time.getFullYear() === yesterday.getFullYear() &&
            time.getMonth() === yesterday.getMonth() &&
            time.getDate() === yesterday.getDate()
        ) {
            day_str = "Yesterday";
        } else if (time.getFullYear() === now.getFullYear()) {
            day_str = new Intl.DateTimeFormat("en-US", {
                "month": "short",
                "day": "numeric",
            }).format(time);
        } else {
            day_str = new Intl.DateTimeFormat("en-US", {
                "month": "short",
                "day": "numeric",
                "year": "numeric",
            }).format(time);
        }
        const time_str = new Intl.DateTimeFormat("en-US", {
            "hour": "numeric",
            "minute": "numeric",
        }).format(time);
        return `${day_str}, ${time_str}`;
    }

    static utcToTodayString(utc: string): string {
        let timestamp: number;
        const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.?(\d{1,6})?Z$/.exec(
            utc,
        );
        if (match) {
            // get rid of overall match, we don't care
            match.shift();
            // convert strings to numbers
            const values = match.map((v) => parseInt(v, 10));
            // Date uses 0-based months, so decrement month
            values[1]--;
            timestamp = Date.UTC(
                values[0], // year
                values[1], // month
                values[2], // day
                values[3], // hour
                values[4], // minute
                values[5], // second
            );
            // the timestampToTodayString expects seconds, not milliseconds
            timestamp /= 1000;
            return JS.timestampToTodayString(timestamp);
        }
        return JS.timestampToTodayString(null);
    }
}

// A class wrapping dropzone (http://www.dropzonejs.com/)
// and providing some additional structure.
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
    options: any;

    constructor(options: any) {
        const element = document.getElementById(options.elementId);
        const clickable = options.clickable === undefined ? true : options.clickable;
        if (element) {
            $(element).addClass("dropzone");
            this.csrftoken = EDD.findCSRFToken();
            this.options = options;
            this.dropzone = new Dropzone(element, {
                "url": options.url,
                "params": { "csrfmiddlewaretoken": this.csrftoken },
                "maxFilesize": 2,
                "acceptedFiles": ".doc,.docx,.pdf,.txt,.xls,.xlsx, .xml, .csv",
                "clickable": clickable,
            });
        }
    }

    // Helper function to create and set up a FileDropZone.
    static create(options: any): void {
        const widget = new FileDropZone(options);
        if (widget.dropzone) {
            widget.setEventHandlers();
        }
    }

    setEventHandlers(): void {
        this.dropzone.on("sending", (file, xhr, formData) => {
            // for import
            if (this.options.fileInitFn) {
                this.options.fileInitFn(file, formData);
            }
        });
        this.dropzone.on("error", (file, msg, xhr) => {
            if (typeof this.options.processErrorFn === "function") {
                this.options.processErrorFn(this, file, msg, xhr);
            }
        });
        this.dropzone.on("success", (file) => {
            const xhr = file.xhr;
            const response = JSON.parse(xhr.response);
            if (response.warnings) {
                if ("function" === typeof this.options.processWarningFn) {
                    this.options.processWarningFn(file, response);
                }
            } else if ("function" === typeof this.options.processResponseFn) {
                this.options.processResponseFn(this, file, response);
            }
            this.dropzone.removeAllFiles();
        });
    }
}

/**
 * Common handling code for Dropzone events in both the Overview and Lines
 * (aka Experiment Description) pages.
 */
export class FileDropZoneHelpers {
    private pageRedirect: string;

    constructor(options?: any) {
        options = options || {};
        this.pageRedirect = options.pageRedirect || "";
    }

    // This is called upon receiving a response from a file upload operation, and unlike
    // fileRead(), is passed a processed result from the server as a second argument,
    // rather than the raw contents of the file.
    fileReturnedFromServer(fileContainer, result): void {
        // TODO: fix hard-coded URL redirect
        const base = relativeURL("../");
        const redirect = relativeURL(this.pageRedirect, base);
        const message = JSON.parse(result.xhr.response);
        $("<p>", {
            "text": ["Success!", message.lines_created, "lines added!"].join(" "),
            "style": "margin:auto",
        }).appendTo("#linesAdded");
        $("#linesAdded").removeClass("off");
        this.successfulRedirect(redirect.pathname);
    }

    fileWarningReturnedFromServer(fileContainer, result): void {
        // TODO: fix hard-coded URL redirect
        const base = relativeURL("../");
        const redirect = relativeURL(this.pageRedirect, base);
        $("#acceptWarnings")
            .find(".acceptWarnings")
            .on("click", (ev: JQueryMouseEventObject): boolean => {
                this.successfulRedirect(redirect.pathname);
                return false;
            });

        $("<p>", {
            "text": `Success! ${result.lines_created} lines added!`,
            "style": "margin:auto",
        }).appendTo("#linesAdded");
        // display success message
        $("#linesAdded").removeClass("off");
        this.generateMessages("warnings", result.warnings);
        this.generateAcceptWarning();
    }

    private successfulRedirect(linesPathName): void {
        // redirect to lines page
        window.setTimeout(() => {
            window.location.pathname = linesPathName;
        }, 1000);
    }

    // This is called upon receiving an error in a file upload operation, and
    // is passed an unprocessed result from the server as a second argument.
    fileErrorReturnedFromServer(dropZone: FileDropZone, file, msg, xhr): void {
        const parent: JQuery = $("#alert_placeholder");
        const dismissAll: JQuery = $("#dismissAll");
        // TODO: fix hard-coded URL redirect
        const baseUrl: URL = relativeURL("../");
        // reset the drop zone here
        // parse xhr.response
        const contentType = xhr.getResponseHeader("Content-Type");

        if (xhr.status === 504) {
            this.generate504Error();
        } else if (xhr.status === 413) {
            this.generate413Error();
        } else if (contentType === "application/json") {
            const json = JSON.parse(xhr.response);
            if (json.errors) {
                if (json.errors[0].category.indexOf("ICE") > -1) {
                    // first remove all files in upload
                    dropZone.dropzone.removeAllFiles();
                    file.status = undefined;
                    file.accepted = undefined;
                    // create alert notification
                    this.processICEerror(json.errors);
                    // click handler for omit strains
                    $("#alert_placeholder")
                        .find(".omitStrains")
                        .on("click", (ev): void => {
                            const parsedUrl: URL = new URL(
                                dropZone.dropzone.options.url,
                                window.location.toString(),
                            );
                            $(ev.target)
                                .parent()
                                .remove();
                            parsedUrl.searchParams.append(
                                "IGNORE_ICE_ACCESS_ERRORS",
                                "true",
                            );
                            dropZone.dropzone.options.url = parsedUrl.toString();
                            dropZone.dropzone.addFile(file);
                        });
                } else {
                    this.generateMessages("error", json.errors);
                }
            }
            // Note: there may be warnings in addition to errors displayed above
            if (json.warnings) {
                this.generateMessages("warnings", json.warnings);
            }
        } else {
            // if there is a back end or proxy error (likely html response), show this
            const defaultError = {
                "category": "",
                "summary": "There was an error",
                "details": "Please try again later or contact support.",
            };
            this.alertError(defaultError);
        }
        // remove the unhelpful DZ default err message ("object")
        $(".dz-error-message").text("File errors (see above)");

        dismissAll.toggleClass("off", $(".alert").length <= 2);

        // set up click handler events
        parent
            .find(".omitStrains")
            .on("click", (ev: JQueryMouseEventObject): boolean => {
                ev.preventDefault();
                ev.stopPropagation();
                $("#iceError").hide();
                return false;
            });
        parent
            .find(".allowDuplicates")
            .on("click", (ev: JQueryMouseEventObject): boolean => {
                const f = file.file;
                const targetUrl = new URL("describe", baseUrl.toString());
                ev.preventDefault();
                ev.stopPropagation();
                targetUrl.searchParams.append("ALLOW_DUPLICATE_NAMES", "true");
                f.sendTo(targetUrl.toString());
                $("#duplicateError").hide();
                return false;
            });
        $(".noDuplicates, .noOmitStrains").on(
            "click",
            (ev: JQueryMouseEventObject): boolean => {
                ev.preventDefault();
                ev.stopPropagation();
                window.location.reload();
                return false;
            },
        );
        // dismiss all alerts
        dismissAll.on("click", ".dismissAll", (ev: JQueryMouseEventObject): boolean => {
            ev.preventDefault();
            ev.stopPropagation();
            parent.find(".close").click();
            window.location.reload();
            return false;
        });
        $("#acceptWarnings")
            .find(".acceptWarnings")
            .on("click", (ev): boolean => {
                // TODO: fix hard-coded URL redirect
                const redirect = relativeURL("description/", baseUrl);
                ev.preventDefault();
                ev.stopPropagation();
                this.successfulRedirect(redirect.pathname);
                return false;
            });
    }

    private generateMessages(type, response) {
        const responseMessages = this.organizeMessages(response);
        $.each(responseMessages, (key: string, value: any) => {
            const template = type === "error" ? ".alert-danger" : ".alert-warning";
            const div = $(template)
                .eq(0)
                .clone();
            this.alertMessage(key, value, div, type);
        });
    }

    private processICEerror(responses): void {
        $(".noDuplicates, .noOmitStrains").on("click", (ev): boolean => {
            ev.preventDefault();
            ev.stopPropagation();
            window.location.reload();
            return false;
        });
        for (const response of responses) {
            // create dismissible error alert
            this.alertIceWarning(response);
        }
    }

    private generateAcceptWarning(): void {
        const warningAlerts = $(".alert-warning:visible");
        const acceptWarningDiv = $("#acceptWarnings").find(".acceptWarnings");
        if (warningAlerts.length === 1) {
            $(warningAlerts).append(acceptWarningDiv);
        } else {
            $("#alert_placeholder").prepend(acceptWarningDiv);
        }
        acceptWarningDiv.show();
    }

    private organizeMessages(responses) {
        const obj = {};
        for (const response of responses) {
            const message = `${response.summary}: ${response.details}`;
            if (Object.prototype.hasOwnProperty.call(obj, response.category)) {
                obj[response.category].push(message);
            } else {
                obj[response.category] = [message];
            }
        }
        return obj;
    }

    private generate504Error(): void {
        const response = {
            "category": "",
            "summary": "EDD timed out",
            "details": "Please reload page and re-upload file",
        };
        this.alertError(response);
    }

    private generate413Error(): void {
        const response = {
            "category": "",
            "summary": "File too large",
            "details":
                "Please contact system administrators or break your file into parts.",
        };
        this.alertError(response);
    }

    private alertIceWarning(response): void {
        const iceError = $("#iceError");
        response.category = `Warning! ${response.category}`;
        this.createAlertMessage(iceError, response);
    }

    private alertError(response): void {
        const newErrorAlert = $(".alert-danger")
            .eq(0)
            .clone();
        this.createAlertMessage(newErrorAlert, response);
        this.clearDropZone();
    }

    private createAlertMessage(alertClone, response) {
        $(alertClone)
            .children("h4")
            .text(response.category);
        $(alertClone)
            .children("p")
            .text(`${response.summary}: ${response.details}`);
        $("#alert_placeholder").append(alertClone);
        $(alertClone)
            .removeClass("off")
            .show();
    }

    private alertMessage(subject, messages, newAlert, type): void {
        if (type === "warnings") {
            $(newAlert)
                .children("h4")
                .text(`Warning! ${subject}`);
        } else {
            $(newAlert)
                .children("h4")
                .text(`Error! ${subject}`);
            this.clearDropZone();
        }
        $.each(messages, (key, message) => {
            const summary = $("<p>")
                .addClass("alertWarning")
                .text(message);
            $(newAlert).append(summary);
        });
        $("#alert_placeholder").append(newAlert);
        $(newAlert)
            .removeClass("off")
            .show();
    }

    private clearDropZone(): void {
        $("#experimentDescDropZone").removeClass("off");
        $("#fileDropInfoIcon").addClass("off");
        $("#fileDropInfoName").addClass("off");
        $("#fileDropInfoSending").addClass("off");
        $(".linesDropZone").addClass("off");
    }
}

/**
 * Wraps a "contact" value that can be number, UserRecord, or BasicContact.
 */
export class EDDContact {
    constructor(private readonly self: number | UserRecord | BasicContact) {}
    as_contact(): BasicContact {
        return { "extra": this.display(), "user_id": this.id() };
    }
    display(fallback?: string): string {
        fallback = fallback || "--";
        if (this.is_userrecord()) {
            return ((this.self || {}) as UserRecord).uid;
        } else if (this.is_basiccontact()) {
            const basic = (this.self || {}) as BasicContact;
            const user = EDDData.Users[basic.user_id] || ({} as UserRecord);
            return basic.extra || user.uid || fallback;
        } else if (typeof this.self === "number") {
            const user = EDDData.Users[this.self as number] || ({} as UserRecord);
            return user.uid || fallback;
        }
        return fallback;
    }
    equals(other: number | UserRecord | BasicContact): boolean {
        return (
            // when both are IDs, using normal equality works
            (this.self !== undefined && this.self === other) ||
            // when both are UserRecord, use propertyEqual on "id"
            JS.propertyEqual(this.self, other, "id") ||
            // when both are BasicContact, use propertyEqual on both "user_id" and "extra"
            (JS.propertyEqual(this.self, other, "user_id") &&
                JS.propertyEqual(this.self, other, "extra"))
        );
    }
    id(): number {
        if (this.is_userrecord()) {
            return ((this.self || {}) as UserRecord).id;
        } else if (this.is_basiccontact()) {
            return ((this.self || {}) as BasicContact).user_id;
        } else if (typeof this.self === "number") {
            return this.self as number;
        }
        return null;
    }
    private is_basiccontact(): boolean {
        const self = this.self || {};
        return JS.hasOwnProp(self, "user_id") || JS.hasOwnProp(self, "extra");
    }
    private is_userrecord(): boolean {
        return JS.hasOwnProp(this.self || {}, "id");
    }
}
