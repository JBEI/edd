"use strict";

import * as Utl from "../Utl";

/**
 * Facade class providing a more convenient interface to EDDData structure.
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

    findCompartment(id: string): MeasurementCompartmentRecord {
        return Utl.lookup(this._data.MeasurementTypeCompartments, id);
    }

    findLine(id: number | string): LineRecord {
        return Utl.lookup(this._data.Lines, id);
    }

    findMeasurementType(id: number | string): MeasurementTypeRecord {
        return Utl.lookup(this._data.MeasurementTypes, id);
    }

    findMetadataType(id: number | string): MetadataTypeRecord {
        return Utl.lookup(this._data.MetaDataTypes, id);
    }

    findStrain(id: number | string): StrainRecord {
        return Utl.lookup(this._data.Strains, id);
    }

    findUnit(id: number | string): UnitType {
        return Utl.lookup(this._data.UnitTypes, id);
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
