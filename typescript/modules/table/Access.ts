"use strict";

import * as Utl from "../Utl";

/**
 * Groups together a MeasurementRecord with its corresponding AssayRecord and
 * LineRecord. Doing this up front allows Filter predicates to skip repeating
 * the logic of looking up these values from the mapping.
 */
export interface Item {
    assay: AssayRecord;
    line: LineRecord;
    measurement: MeasurementRecord;
}

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
        const access = new Access(data);
        const replicate = access.replicate_type();
        // selected property must be pre-defined to initially false
        // table select-all checkbox has undefined behavior otherwise
        Object.values(data.Lines).forEach((line) => {
            line.replicate = line.meta[replicate?.id] || null;
            line.selected = false;
        });
        Object.values(data.Assays).forEach((assay) => {
            assay.measurements = [];
            assay.selected = false;
        });
        // initialize Measurements listing
        data.Measurements = data.Measurements || {};
        return access;
    }

    assays(): AssayRecord[] {
        return Object.values(this._data.Assays);
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

    findMeasurement(id: number | string): MeasurementRecord {
        return Utl.lookup(this._data.Measurements, id);
    }

    findMeasurementType(id: number | string): MeasurementTypeRecord {
        return Utl.lookup(this._data.MeasurementTypes, id);
    }

    findMetadataType(id: number | string): MetadataTypeRecord {
        return Utl.lookup(this._data.MetaDataTypes, id);
    }

    findProtocol(id: number | string): ProtocolRecord {
        return Utl.lookup(this._data.Protocols, id);
    }

    findStrain(id: number | string): StrainRecord {
        return Utl.lookup(this._data.Strains, id);
    }

    findUnit(id: number | string): UnitType {
        return Utl.lookup(this._data.UnitTypes, id);
    }

    findUser(value: number | BasicContact | UserRecord): UserRecord {
        if (this.isBasicContact(value)) {
            const basic = value as BasicContact;
            return this._data.Users[basic.user_id];
        } else if (this.isUserRecord(value)) {
            return value as UserRecord;
        }
        return this._data.Users[value as number];
    }

    item(measurement: MeasurementRecord): Item {
        const assay = this.findAssay(measurement.assay);
        const line = this.findLine(assay.lid);
        return {
            "assay": assay,
            "line": line,
            "measurement": measurement,
        };
    }

    lines(): LineRecord[] {
        return Object.values(this._data.Lines).filter((line) => line.active);
    }

    linesWithDisabled(): LineRecord[] {
        return Object.values(this._data.Lines);
    }

    measurementItems(): Item[] {
        return this.measurements().map((m) => this.item(m));
    }

    measurements(): MeasurementRecord[] {
        return Object.values(this._data.Measurements);
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

    metadataForAssayTable(assays?: AssayRecord[]): MetadataTypeRecord[] {
        const keys = new Set<string | number>();
        if (assays === undefined) {
            assays = this.assays();
        }
        assays.forEach((assay) => {
            // collecting the used metadata keys
            Object.keys(assay.meta).forEach((key) => keys.add(key));
        });
        return Array.from(keys).map((k) => this.findMetadataType(k));
    }

    metadataForLineTable(lines?: LineRecord[]): MetadataTypeRecord[] {
        const keys = new Set<string | number>();
        if (lines === undefined) {
            lines = this.lines();
        }
        lines.forEach((line) => {
            // collecting the used metadata keys
            Object.keys(line.meta).forEach((key) => keys.add(key));
        });
        const metadata = Array.from(keys).map((k) => this.findMetadataType(k));
        // metadata to show in table is everything except replicate
        // maybe later also filter out other things
        return metadata.filter((meta) => meta.input_type !== "replicate");
    }

    protocols(): ProtocolRecord[] {
        return Object.values(this._data.Protocols);
    }

    replicate_type(): MetadataTypeRecord {
        return Object.values(this._data.MetaDataTypes).find(
            (md: MetadataTypeRecord) =>
                md.input_type === "replicate" && md.context === "L",
        );
    }

    strains(): StrainRecord[] {
        return Object.values(this._data.Strains);
    }

    studyPK(): number {
        return this._data.currentStudyID;
    }

    updateAssayValues(payload: AssayValues): void {
        // update types with any new types in the payload
        Object.assign(this._data.MeasurementTypes, payload.types);
        // update assays with real counts; not all measurements may get downloaded
        for (const [assayId, count] of Object.entries(payload.total_measures)) {
            const assay = Utl.lookup(this._data.Assays, assayId);
            assay.count = count;
        }
        // match measurements with value arrays, store, and return
        payload.measures.forEach((value) => {
            const assay = Utl.lookup(this._data.Assays, value.assay);
            value.selected = false;
            value.values = payload.data[value.id] || [];
            this._data.Measurements[value.id] = value;
            assay.measurements.push(value);
        });
    }

    valueLinks(): string[] {
        return this._data.valueLinks || [];
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
 * Processes an array of LineRecord objects to produce a list of merged
 * items where the replicate UUIDs match.
 */
export class ReplicateFilter {
    private readonly lookup: Map<string, number> = new Map();
    private readonly replicates: LineRecord[] = [];

    public constructor(
        private readonly replicate_type: MetadataTypeRecord,
        private readonly conflict = null,
    ) {}

    public process(lines: LineRecord[]): LineRecord[] {
        this.reset();
        for (const line of lines) {
            const copy = { ...line };
            const replicate_id = this.getReplicateId(line);
            if (replicate_id) {
                this.checkForPriorReplicate(copy);
            } else {
                this.replicates.push(copy);
            }
        }
        return this.replicates;
    }

    public reset(): void {
        this.lookup.clear();
    }

    private checkForPriorReplicate(line: LineRecord): void {
        const replicate_id = `${line.meta[this.replicate_type.id]}`;
        const match_index = this.findPreviousIndex(replicate_id);
        if (match_index !== undefined) {
            this.mergeWithPrevious(line, match_index);
        } else {
            this.recordReplicateEntry(line, replicate_id);
        }
    }

    private findPreviousIndex(replicate_id: string): number {
        return this.lookup.get(replicate_id);
    }

    private getReplicateId(line: LineRecord): string {
        const value = line.meta[this.replicate_type.id];
        // could be anything, so either force to a string or force undefined
        if (value) {
            return `${value}`;
        }
        return undefined;
    }

    private mergeWithPrevious(line: LineRecord, match_index: number): void {
        const previous = this.replicates[match_index];
        const updated = mergeLines(previous, line, this.conflict);
        // track the names, IDs, and selection state
        updated.replicate_ids = [...previous.replicate_ids, line.id];
        updated.replicate_names = [...previous.replicate_names, line.name];
        updated.selected = false;
        // keep the updated object
        this.replicates[match_index] = updated;
    }

    private recordReplicateEntry(line: LineRecord, replicate_id: string): void {
        this.lookup[replicate_id] = this.replicates.length;
        // track names and IDs
        line.replicate_ids = [line.id];
        line.replicate_names = [line.name];
        // pass to list
        this.replicates.push(line);
    }
}

function mergeMeta<T>(a: T, b: T, conflict = null): T {
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
function mergeProp<T>(a: T, b: T, c: T, prop: string, conflict = null): void {
    if (Utl.JS.propertyEqual(a, b, prop)) {
        c[prop] = a[prop];
    } else {
        c[prop] = conflict;
    }
}

function mergeLines(a: LineRecord, b: LineRecord, conflict = null): LineRecord {
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
            c.strain = null;
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
