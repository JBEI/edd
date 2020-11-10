"use strict";

import Handsontable from "handsontable";

import * as Utl from "../Utl";
import * as Render from "./Render";

const identity = (item) => item;
type FetchMode = "copy" | "render" | void;

/**
 * Define column settings for table displaying Assay and Measurement
 * information. The defined table takes Filter.Item objects as data.
 */
export function defineAssayColumns(): Handsontable.ColumnSettings[] {
    // TODO: form of Filter.Item depends on filter mode:
    // - Assay, like current EDD, individual assays are distinct;
    // - Line, any assays with same Line + Protocol are joined;
    // - Replicate, any assays with same Replicate ID + Protocol are joined;
    return [
        {
            "editor": "checkbox",
            "header": `<input type="checkbox" class="select-all"/>`,
            "readOnly": false,
            "renderer": "checkbox",
            "width": 23,
        },
        {
            "data": "assay.name",
            "header": "Assay Name",
        },
        {
            "data": "line.name",
            "header": "Line",
        },
        {
            "editor": "checkbox",
            "header": `<input type="checkbox" class="select-all"/>`,
            "readOnly": false,
            "renderer": "checkbox",
            "width": 23,
        },
        {
            "data": "measurement.type",
            "header": "Measurement",
        },
        {
            "data": "measurement.y_units",
            "header": "Units",
        },
        {
            "data": "measurement.values.length",
            "header": "Count",
        },
    ];
}

/**
 * Defines column settings for table displaying Line information. The defined
 * table takes LineRecord objects as data.
 */
export function defineLineColumns(access: Access): Handsontable.ColumnSettings[] {
    const metaColumns = access.metadataForLineTable().map((meta) => ({
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
            "data": LineNameColumn.create(access).data(),
            "header": "Name",
            "renderer": "edd.replicate_name",
        },
        { "data": "description", "header": "Description" },
        // pair custom getter/setter with custom renderer
        // see a link from renderer, see a URL when copying, actual value is an ID
        {
            "data": StrainColumn.create(access).data(),
            "header": "Strain",
            "renderer": "edd.strain",
        },
        // splice in metadata columns here
        ...metaColumns,
        {
            "data": LineExperimenterColumn.create(access).data(),
            "header": "Experimenter",
            "renderer": "edd.user",
        },
        // see a date string in renderer, a UTC string when copying, actual value is timestamp
        {
            "data": LineModifiedColumn.create(access).data(),
            "header": "Last Modified",
            "renderer": "edd.timestamp",
        },
    ];
}

export function defineMeasurementColumns(
    access: Access,
): Handsontable.ColumnSettings[] {
    return [
        {
            "editor": "checkbox",
            "header": `<input type="checkbox" class="select-all"/>`,
            "readOnly": false,
            "renderer": "checkbox",
            "width": 23,
        },
        {
            "data": "measurement.type",
            "header": "Measurement",
        },
        {
            "data": "measurement.y_units",
            "header": "Units",
        },
        {
            "data": "measurement.values.length",
            "header": "Count",
        },
    ];
}

/**
 * Callback for Handsontable.GridSettings.afterGetColHeader. Setting the event
 * handler to this function removes the menu dropdown from the first column.
 */
export function disableMenuFirstColumn(column, th): void {
    // see: https://github.com/handsontable/handsontable/issues/4253
    // hack to disable menu on only the first column
    if (column === 0) {
        $("button", th).remove();
    }
}

/**
 * Callback for Handsontable.GridSettings.beforeColumnMove. Setting the event
 * handler to this function prevents moving the first column of the table.
 */
export function disableMoveFirstColumn(cols: number[], target: number): boolean | void {
    if (cols.indexOf(0) !== -1 || target === 0) {
        return false;
    }
}

/**
 * Callback for Handsontable.GridSettings.beforeStretchingColumnWidth. Setting
 * the event handler to this function prevents resizing the first column.
 */
export function disableResizeFirstColumn(width: number, column: number): number {
    if (column === 0) {
        return 23;
    }
    return width;
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
    protected constructor(private _data: EDDData) {}

    public static initAccess(data: EDDData): Access {
        Object.values(data.Lines).forEach((line) => {
            // initializing every LineRecord with selected = false
            // prevents checkboxes from showing as initially disabled
            // failing to initialize will give undefined behavior to select-all checkbox
            line.selected = false;
        });
        return new Access(data);
    }

    disabledLines(): LineRecord[] {
        return Object.values(this._data.Lines);
    }

    findAssay(id: number | string): AssayRecord {
        return Utl.lookup(this._data.Assays, id);
    }

    findLine(id: number | string): LineRecord {
        return Utl.lookup(this._data.Lines, id);
    }

    findMetadataType(id: number | string): MetadataTypeRecord {
        return Utl.lookup(this._data.MetaDataTypes, id);
    }

    findStrain(id: number | string): StrainRecord {
        return Utl.lookup(this._data.Strains, id);
    }

    findUser(value: number | BasicContact | UserRecord) {
        if (this.isBasicContact(value)) {
            const basic = value as BasicContact;
            return this._data.Users[basic.user_id];
        } else if (this.isUserRecord(value)) {
            return value as UserRecord;
        }
        return this._data.Users[value as number];
    }

    /**
     * Returns an AssayRecord for use in an edit dialog, with data merged from
     * items in the argument.
     */
    mergeAssays(items: AssayRecord[]): AssayRecord {
        return items.reduce(mergeAssays);
    }

    /**
     * Returns a LineRecord for use in an edit dialog, with data merged from
     * items in the argument.
     */
    mergeLines(items: LineRecord[]): LineRecord {
        // reduce callback has additional ignored arguments here
        // it is an error to replace the lambda with bare mergeLines!
        return items.reduce((a, b) => mergeLines(a, b));
    }

    lines(): LineRecord[] {
        return Object.values(this._data.Lines).filter((line) => line.active);
    }

    metadataForAssayTable(): MetadataTypeRecord[] {
        const keys = new Set<string | number>();
        Object.values(this._data.Assays).forEach((assay) => {
            // collecting the used metadata keys
            Object.keys(assay.meta).forEach((key) => keys.add(key));
        });
        return Array.from(keys).map((k) => this._data.MetaDataTypes[k]);
    }

    metadataForLineTable(): MetadataTypeRecord[] {
        const keys = new Set<string | number>();
        Object.values(this._data.Lines).forEach((line) => {
            // collecting the used metadata keys
            Object.keys(line.meta).forEach((key) => keys.add(key));
        });
        const metadata = Array.from(keys).map((k) => this._data.MetaDataTypes[k]);
        // metadata to show in table is everything except replicate
        // maybe later also filter out other things
        return metadata.filter((meta) => meta.input_type !== "replicate");
    }

    replicates(conflict?: any): LineRecord[] {
        const replicates: LineRecord[] = [];
        const lookup = {};
        // find replicate metadata for Lines to do grouping
        const meta_types = Object.values(this._data.MetaDataTypes);
        const replicate_type: MetadataTypeRecord = meta_types.find(
            (md: MetadataTypeRecord) =>
                md.input_type === "replicate" && md.context === "L",
        );
        // scan all lines, merging those that are replicates
        this.lines().forEach((line: LineRecord) => {
            // create a copy of the line for replicates view
            const copy = { ...line };
            const replicate_id = copy.meta[replicate_type.id];
            // TODO: better way to handle selection state when switching modes?
            // this means switching between replicate and normal mode will clear selection
            copy.selected = false;
            if (replicate_id) {
                // find any previous match
                const match_index = lookup[replicate_id];
                if (match_index !== undefined) {
                    // merge with previous match
                    const previous = replicates[match_index];
                    const updated = mergeLines(previous, copy, conflict);
                    // track the names, IDs, and selection state
                    updated.replicate_ids = [...previous.replicate_ids, copy.id];
                    updated.replicate_names = [...previous.replicate_names, copy.name];
                    updated.selected = false;
                    // keep the updated object
                    replicates[match_index] = updated;
                } else {
                    // record index and add to lookup
                    lookup[replicate_id] = replicates.length;
                    // track names and IDs
                    copy.replicate_ids = [copy.id];
                    copy.replicate_names = [copy.name];
                    // pass to list
                    replicates.push(copy);
                }
            } else {
                // if no replicate_id, pass directly to list
                replicates.push(copy);
            }
        });
        return replicates;
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

/**
 * Base class for accessor function factories. Calling the data() method yields
 * an instance of ColumnDataGetterSetterFunction, determining how a column in
 * the table will get displayed and copied to the clipboard.
 */
abstract class TableAccessor {
    protected constructor(protected readonly _access: Access) {}

    data(): Handsontable.ColumnDataGetterSetterFunction {
        return (row: LineRecord, value?: any, mode?: FetchMode): any | void => {
            if (value === undefined) {
                if (mode === "render") {
                    return this.forRender()(row, value);
                } else {
                    return this.forCopy()(row, value);
                }
            }
        };
    }

    abstract forCopy(): Handsontable.ColumnDataGetterSetterFunction;
    abstract forRender(): Handsontable.ColumnDataGetterSetterFunction;
}

/**
 * Creates an accessor function for experimenter, yielding email addresses
 * while copying and a UserRecord object for the HTML renderer.
 */
class LineExperimenterColumn extends TableAccessor {
    static create(access: Access): LineExperimenterColumn {
        return new LineExperimenterColumn(access);
    }

    forCopy(): Handsontable.ColumnDataGetterSetterFunction {
        return (row: LineRecord, value?: any): string => {
            const user = this._access.findUser(row.experimenter);
            return user?.email || "--";
        };
    }

    forRender(): Handsontable.ColumnDataGetterSetterFunction {
        return (row: LineRecord, value?: any): UserRecord => {
            return this._access.findUser(row.experimenter);
        };
    }
}

/**
 * Accesses the Line name, giving the renderer access to the LineRecord.
 * Clipboard value gives the first replicate name and count of replicates if
 * they exist, otherwise gives the string value of the name.
 */
class LineNameColumn extends TableAccessor {
    static create(access: Access): LineNameColumn {
        return new LineNameColumn(access);
    }

    forCopy(): Handsontable.ColumnDataGetterSetterFunction {
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

    forRender(): Handsontable.ColumnDataGetterSetterFunction {
        return (row: LineRecord, value?: any): LineRecord => row;
    }
}

/**
 * Creates an accessor for modification time, allowing the renderer to create
 * HTML based on timestamp and a ISO-format string copied to the clipboard.
 */
class LineModifiedColumn extends TableAccessor {
    static create(access: Access): LineModifiedColumn {
        return new LineModifiedColumn(access);
    }

    forCopy(): Handsontable.ColumnDataGetterSetterFunction {
        return (row: LineRecord, value?: any): string => {
            const timestamp = row.modified?.time * 1000;
            if (Number.isNaN(timestamp)) {
                return "";
            }
            const date = new Date(row.modified?.time * 1000);
            return date.toISOString();
        };
    }

    forRender(): Handsontable.ColumnDataGetterSetterFunction {
        return (row: LineRecord, value?: any): number => row.modified?.time;
    }
}

/**
 * Accesses Strains, giving the renderer access to an array of StrainRecord
 * objects. Clipboard value yields newline-delimited string of ICE URL if it
 * exists, or the strain name.
 */
class StrainColumn extends TableAccessor {
    static create(access: Access): StrainColumn {
        return new StrainColumn(access);
    }

    forCopy(): Handsontable.ColumnDataGetterSetterFunction {
        return (row: LineRecord, value?: any): string => {
            return row.strain
                .map((item) => {
                    const strain = this._access.findStrain(item);
                    return strain?.registry_url || strain?.name;
                })
                .filter(identity)
                .join("\n");
        };
    }

    forRender(): Handsontable.ColumnDataGetterSetterFunction {
        return (row: LineRecord, value?: any): StrainRecord[] => {
            return row.strain
                .map((item) => this._access.findStrain(item))
                .filter(identity);
        };
    }
}

function mergeMeta<T extends unknown>(a: T, b: T, conflict?: any): T {
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
function mergeProp<T extends unknown>(
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
