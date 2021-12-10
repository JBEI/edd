// This file contains various utility classes under the Utl module.

import "jquery";

import { default as Dropzone } from "dropzone";

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

/**
 * Takes an array of record-like objects, and groups into sub-arrays where all
 * the inputs have the same value for a given key.
 */
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
 * Sets a value on a target object, following the given dotted-path. e.g.
 * setObjectValue(x, "foo.bar", 42); will find the foo property of x, then set
 * the bar property of that object to 42.
 */
export function setObjectValue<T>(target: T, path: string, value: unknown): T {
    const parts = path.split(".");
    const next = parts[0];
    if (parts.length === 1) {
        target[next] = value;
    } else {
        const rest = parts.slice(1).join(".");
        setObjectValue(target[next], rest, value);
    }
    return target;
}

export class EDD {
    static findCSRFToken(): string {
        return ($("input[name=csrfmiddlewaretoken]").val() as string) || "";
    }
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
        // pattern for yyyy-mm-ddThh:MM:ss.SSSSSSZ ISO date string
        const iso_pattern =
            /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.?(\d{1,6})?Z$/;
        const match = iso_pattern.exec(utc);
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

interface FileDropZoneOptions {
    /** ID of the element to be set up as a Dropzone. */
    elementId: string;
    /** URL target for upload requests. */
    url: string;
    /** Preprocess callback for import. */
    fileInitFn?: (file: Dropzone.DropzoneFile, formData: FormData) => void;
    /** Callback for error result returned from server. */
    processErrorFn?: (
        dropzone: Dropzone,
        file: Dropzone.DropzoneFile,
        response?: any,
    ) => void;
    /** Callback for successful result returned from server. */
    processResponseFn?: (file: Dropzone.DropzoneFile, response: any) => void;
    /** Callback for warning result returned from server. */
    processWarningFn?: (file: Dropzone.DropzoneFile, response: any) => void;
    /** Assign false to prevent clicking; otherwise defaults to clickable Dropzone. */
    clickable?: boolean | string | HTMLElement | (string | HTMLElement)[];
}

/**
 * A class wrapping dropzone (http://www.dropzonejs.com/)
 * and providing some additional structure.
 */
export class FileDropZone {
    csrftoken: any;
    dropzone: Dropzone;
    options: FileDropZoneOptions;

    constructor(options: FileDropZoneOptions) {
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
    static create(options: FileDropZoneOptions): void {
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
        this.dropzone.on("error", (file, msg) => {
            if (typeof this.options.processErrorFn === "function") {
                try {
                    const response = JSON.parse(file.xhr.response);
                    this.options.processErrorFn(this.dropzone, file, response);
                } catch {
                    // still process if there are JSON parse errors
                    this.options.processErrorFn(this.dropzone, file);
                }
            }
        });
        this.dropzone.on("success", (file) => {
            try {
                const response = JSON.parse(file.xhr.response);
                if (response.warnings) {
                    if ("function" === typeof this.options.processWarningFn) {
                        this.options.processWarningFn(file, response);
                    }
                } else if ("function" === typeof this.options.processResponseFn) {
                    this.options.processResponseFn(file, response);
                }
                this.dropzone.removeAllFiles();
            } catch {
                if (typeof this.options.processErrorFn === "function") {
                    this.options.processErrorFn(this.dropzone, file);
                }
            }
        });
    }
}
