"use strict";

import Handsontable from "handsontable";

import * as Utl from "../Utl";
import * as Render from "./Render";

const identity = (item) => item;
type FetchMode = "copy" | "render" | void;

/**
 * Defines column settings for table displaying Line information, given an
 * Access object and a listing of metadata to show.
 */
export function columns(access: Access): Handsontable.ColumnSettings[] {
    const metaColumns = access.metadataForTable().map((meta) => ({
        "data": `meta.${meta.id}`,
        "header": meta.name,
        // TODO: apply renderers if exists on MetadataType
    }));
    // register renderers used below
    Render.register();
    return [
        {
            "data": "selected",
            "editor": "checkbox",
            "header": `<input type="checkbox" class="select-all"/>`,
            "readOnly": false,
            "renderer": "checkbox",
            "width": 23,
        },
        {
            "data": access.name(),
            "header": "Name",
            "renderer": "edd.replicate_name",
        },
        { "data": "description", "header": "Description" },
        // pair custom getter/setter with custom renderer
        // see a link from renderer, see a URL when copying, actual value is an ID
        {
            "data": access.strain(),
            "header": "Strain",
            "renderer": "edd.strain",
        },
        // splice in metadata columns here
        ...metaColumns,
        {
            "data": access.experimenter(),
            "header": "Experimenter",
            "renderer": "edd.user",
        },
        // see a date string in renderer, a UTC string when copying, actual value is timestamp
        {
            "data": access.modified(),
            "header": "Last Modified",
            "renderer": "edd.timestamp",
        },
    ];
}

/**
 * Class collects function factories used to create accessor functions.
 *
 * Once initialized with a view of data, the methods on this class give
 * getter/setter methods for the table. Additionally, these accessor functions
 * are extended with an optional getter mode, allowing for different values to
 * be used for rendering table HTML and for copying data to the clipboard.
 *
 * Current implementation only provides getters. If used in a setter context,
 * the result is a no-op. This may change in the future if use of the table is
 * extended to allow inline editing of values in addition to existing forms.
 */
export class Access {
    protected constructor(
        private _data: EDDData,
        private _metadata: MetadataTypeRecord[],
        private _replicate: MetadataTypeRecord,
    ) {}

    public static initAccess(data: EDDData): Access {
        const metaKeys = new Set<string | number>();
        Object.values(data.Lines).forEach((line) => {
            // initializing every LineRecord with selected = false
            // prevents checkboxes from showing as initially disabled
            // failing to initialize will give undefined behavior to select-all checkbox
            line.selected = false;
            // collecting the used metadata keys
            Object.keys(line.meta).forEach((key) => metaKeys.add(key));
        });
        const metadata = Array.from(metaKeys).map((key) => data.MetaDataTypes[key]);
        const replicate: MetadataTypeRecord = Object.values(data.MetaDataTypes).find(
            (md: MetadataTypeRecord) => md.input_type === "replicate",
        );
        return new Access(data, metadata, replicate);
    }

    /**
     * Returns an AssayRecord for use in an edit dialog, with data merged from
     * selected IDs passed in argument.
     */
    assayFromSelection(selection: JQuery): AssayRecord {
        return selection
            .toArray()
            .map(
                (elem: Element): AssayRecord =>
                    Utl.lookup(this._data.Assays, $(elem).val() as string),
            )
            .reduce(mergeAssays);
    }

    disabledLines(): LineRecord[] {
        return Object.values(this._data.Lines);
    }

    /**
     * Creates an accessor function for experimenter, yielding email addresses
     * while copying and a UserRecord object for the HTML renderer.
     */
    experimenter(): Handsontable.ColumnDataGetterSetterFunction {
        return this.decorateWithModeParam(
            this.experimenterForClipboard(),
            this.experimenterForRender(),
        );
    }

    /**
     * Creates an accessor function for experimenter, yielding an email address,
     * or a default string "--" if none.
     */
    experimenterForClipboard(): Handsontable.ColumnDataGetterSetterFunction {
        return (row: LineRecord, value?: any): string => {
            const user = this.convertUserRecord(row.experimenter);
            return user?.email || "--";
        };
    }

    /**
     * Creates an accessor function for experimenter, yielding a UserRecord.
     */
    experimenterForRender(): Handsontable.ColumnDataGetterSetterFunction {
        return (row: LineRecord, value?: any): UserRecord => {
            return this.convertUserRecord(row.experimenter);
        };
    }

    /**
     * Returns a LineRecord for use in an edit dialog, with data merged from
     * selected IDs passed in argument.
     */
    lineFromSelection(selection: JQuery): LineRecord {
        return selection
            .toArray()
            .map(
                (elem: Element): LineRecord =>
                    Utl.lookup(this._data.Lines, $(elem).val() as string),
            )
            .reduce((a, b) => mergeLines(a, b));
    }

    lines(): LineRecord[] {
        return Object.values(this._data.Lines).filter((line) => line.active);
    }

    metadata(): MetadataTypeRecord[] {
        return this._metadata;
    }

    metadataForTable(): MetadataTypeRecord[] {
        // metadata to show in table is everything except replicate
        // maybe later also filter out other things
        return this._metadata.filter((meta) => meta.input_type !== "replicate");
    }

    /**
     * Creates an accessor for modification time, allowing the renderer to
     * create HTML based on timestamp and a ISO-format string copied to
     * the clipboard.
     */
    modified(): Handsontable.ColumnDataGetterSetterFunction {
        return this.decorateWithModeParam(
            this.modifiedForClipboard(),
            this.modifiedForRender(),
        );
    }

    /**
     * Creates an accessor function for modification time, yielding an
     * ISO-formatted timestamp string for copying.
     */
    modifiedForClipboard(): Handsontable.ColumnDataGetterSetterFunction {
        return (row: LineRecord, value?: any): string => {
            const timestamp = row.modified?.time * 1000;
            if (Number.isNaN(timestamp)) {
                return "";
            }
            const date = new Date(row.modified?.time * 1000);
            return date.toISOString();
        };
    }

    /**
     * Creates an accessor function for modification time, yielding the
     * stored timestamp value for the renderer to display.
     */
    modifiedForRender(): Handsontable.ColumnDataGetterSetterFunction {
        return (row: LineRecord, value?: any): number => {
            return row.modified?.time;
        };
    }

    name(): Handsontable.ColumnDataGetterSetterFunction {
        return this.decorateWithModeParam(
            this.nameForClipboard(),
            this.nameForRender(),
        );
    }

    nameForClipboard(): Handsontable.ColumnDataGetterSetterFunction {
        return (row: LineRecord, value?: any): string => {
            if (row.replicate_names) {
                const add_count = row.replicate_names.length - 1;
                return `${row.replicate_names[0]} (+${add_count})`;
            } else if (row.name) {
                return row.name;
            }
            return "--";
        };
    }

    nameForRender(): Handsontable.ColumnDataGetterSetterFunction {
        return (row: LineRecord, value?: any): LineRecord => row;
    }

    replicates(conflict?: any): LineRecord[] {
        const replicates: LineRecord[] = [];
        const lookup = {};
        // scan all lines, merging those that are replicates
        this.lines().forEach((line: LineRecord) => {
            const replicate_id = line.meta[this._replicate.id];
            if (replicate_id) {
                // find any previous match
                const match_index = lookup[replicate_id];
                if (match_index !== undefined) {
                    // merge with previous match
                    const previous = replicates[match_index];
                    const updated = mergeLines(previous, line, conflict);
                    // track the names
                    updated.replicate_names = previous.replicate_names;
                    updated.replicate_names.push(line.name);
                    // keep the updated object
                    replicates[match_index] = updated;
                } else {
                    // make a copy for "replicate" version
                    const updated = { ...line };
                    // record index and add to list
                    lookup[replicate_id] = replicates.length;
                    updated.replicate_names = [line.name];
                    replicates.push(updated);
                }
            } else {
                // if no replicate, pass directly to list
                replicates.push(line);
            }
        });
        return replicates;
    }

    /**
     * Creates an accessor function for strains, yielding URLs while copying
     * and a StrainRecord object for the HTML renderer.
     */
    strain(): Handsontable.ColumnDataGetterSetterFunction {
        return this.decorateWithModeParam(
            this.strainForClipboard(),
            this.strainForRender(),
        );
    }

    /**
     * Creates an accessor function for strains, yielding newline-separated
     * URLs for strains on the row.
     */
    strainForClipboard(): Handsontable.ColumnDataGetterSetterFunction {
        return (row: LineRecord, value?: any): string => {
            return row.strain
                .map((item) => {
                    const strain = this._data.Strains?.[item];
                    return strain?.registry_url;
                })
                .filter(identity)
                .join("\n");
        };
    }

    /**
     * Creates an accessor function for strains, yielding the StrainRecord
     * objects on the row.
     */
    strainForRender(): Handsontable.ColumnDataGetterSetterFunction {
        return (row: LineRecord, value?: any): StrainRecord[] => {
            return row.strain
                .map((item) => this._data.Strains?.[item])
                .filter(identity);
        };
    }

    private decorateWithModeParam(
        copyFn: Handsontable.ColumnDataGetterSetterFunction,
        renderFn: Handsontable.ColumnDataGetterSetterFunction,
    ): Handsontable.ColumnDataGetterSetterFunction {
        return (row: LineRecord, value?: any, mode?: FetchMode): any | void => {
            if (value === undefined) {
                if (mode === "render") {
                    return renderFn(row, value);
                } else {
                    return copyFn(row, value);
                }
            }
        };
    }

    private convertUserRecord(value: number | BasicContact | UserRecord) {
        if (this.isBasicContact(value)) {
            const basic = value as BasicContact;
            return this._data.Users[basic.user_id];
        } else if (this.isUserRecord(value)) {
            return value as UserRecord;
        }
        return this._data.Users[value as number];
    }

    private isBasicContact(value): boolean {
        try {
            return Object.prototype.hasOwnProperty.call(value, "extra");
        } catch {
            return false;
        }
    }

    private isUserRecord(value): boolean {
        try {
            return Object.prototype.hasOwnProperty.call(value, "uid");
        } catch {
            return false;
        }
    }
}

function mergeMeta<T extends object>(a: T, b: T, conflict?: any): T {
    // metadata values, set key when equal, and set symmetric difference to conflict value
    const meta = {} as any;
    for (const [key, value] of Object.entries(a || {})) {
        if (Utl.JS.propertyEqual(a, b, key)) {
            meta[key] = value;
        } else {
            meta[key] = conflict;
        }
    }
    for (const key of Object.keys(b || {})) {
        if (!Utl.JS.hasOwnProp(meta, key)) {
            meta[key] = conflict;
        }
    }
    return meta;
}

/**
 * Merges properties that match in a and b; to same key in c. Optionally set a
 * conflict value, defaulting to undefined.
 */
function mergeProp<T extends object>(
    a: T,
    b: T,
    c: T,
    prop: string,
    conflict?: any,
): void {
    if (Utl.JS.propertyEqual(a, b, prop)) {
        c[prop] = a[prop];
    } else {
        c[prop] = conflict;
    }
}

function mergeLines(a: LineRecord, b: LineRecord, conflict?: any): LineRecord {
    if (a === undefined) {
        return b;
    } else if (b === undefined) {
        return a;
    } else {
        const c: LineRecord = {} as LineRecord;
        // set values only when equal
        mergeProp(a, b, c, "name", conflict);
        mergeProp(a, b, c, "description", conflict);
        mergeProp(a, b, c, "control", conflict);
        mergeProp(a, b, c, "contact", conflict);
        mergeProp(a, b, c, "experimenter", conflict);
        // array values, either all values are the same or do not set
        if (Utl.JS.arrayEquivalent(a.strain, b.strain)) {
            c.strain = [].concat(a.strain);
        } else {
            c.strain = conflict;
        }
        // set metadata to merged result, set all keys that appear and only set equal values
        c.meta = mergeMeta(a.meta, b.meta, conflict);
        return c;
    }
}

function mergeAssays(a: AssayRecord, b: AssayRecord): AssayRecord {
    if (a === undefined) {
        return b;
    } else if (b === undefined) {
        return a;
    } else {
        const c: AssayRecord = {} as AssayRecord;
        const experimenter = new Utl.EDDContact(a.experimenter);
        // set values only when equal
        if (Utl.JS.propertyEqual(a, b, "name")) {
            c.name = a.name;
        }
        if (Utl.JS.propertyEqual(a, b, "description")) {
            c.description = a.description;
        }
        if (Utl.JS.propertyEqual(a, b, "pid")) {
            c.pid = a.pid;
        }
        if (experimenter.equals(b.experimenter)) {
            c.experimenter = a.experimenter;
        }
        c.meta = mergeMeta(a.meta, b.meta);
        return c;
    }
}
