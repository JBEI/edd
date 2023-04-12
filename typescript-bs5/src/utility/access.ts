"use strict";

import * as JS from "./js";

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

export interface QueryFilter {
    [key: string]: string;
}

export interface Query {
    page?: number;
    size?: number;
    sort?: string[];
    filter?: QueryFilter;
}

interface JQueryPayload {
    [key: string]: any;
}

/**
 * Bare-bones progress bar API.
 */
class Progress {
    private current = 0;
    private weight = 1;

    constructor(private readonly bar: JQuery) {}

    advance(amount: number): void {
        this.current += amount;
        const value = Math.min(1, this.current / this.weight);
        const pct = Math.ceil(100 * value);
        this.bar
            .attr("aria-valuenow", `${pct}`)
            .width(`${pct}%`)
            .find(".sr-only")
            .text(`${pct}%`);
    }

    task(): void {
        this.weight++;
    }
}

/**
 * Simple proxy class to allow reseting progress state after calls to
 * `Lookup.fetch()` or `Lookup.eager()`.
 */
class Tracker {
    private taken = 0;

    constructor(private progress: Progress) {}

    updateProgress(
        xhr: JQuery.Promise<RestPageInfo<any>>,
        query: Query,
        max_steps = 1,
    ): PromiseLike<boolean> {
        if (this.progress !== null) {
            return xhr.then((rpi) => {
                const page_size = query?.size || 30;
                const page_count = Math.max(1, Math.ceil(rpi.count / page_size));
                const steps = Math.min(max_steps, page_count);
                if (++this.taken <= steps) {
                    this.progress.advance(1 / steps);
                    return true;
                } else if (this.taken > 200) {
                    // arbitrary upper limit to abort
                    // prevent downloading forever
                    throw Error("Exceeded maximum data download");
                }
                return false;
            });
        }
        return Promise.resolve(false);
    }
}

/**
 * Generic class to fetch and cache records from the REST API.
 */
class Lookup<T> {
    private cache: RecordList<T>;
    private page_size: number = null;
    private prog: Progress = null;
    private soft_limit = 10;

    public constructor(
        private url: string,
        private studyId: number,
        private toKey: (t: T) => string | number,
    ) {
        this.cache = {};
    }

    /**
     * Fetches a page of records, then also eagerly requests the next page
     * of records, until there are no further pages.
     */
    eager(query: Query = null): JQuery.Promise<T[]> {
        const results: T[] = [];
        const first = this.runQuery(query);
        const tracker = this.tracker();
        const getNextPage = (rpi: RestPageInfo<T>) => {
            results.push(...rpi.results);
            if (rpi.next) {
                const next = this.cacheResponse($.get(rpi.next));
                const wait = tracker.updateProgress(next, query, this.soft_limit);
                return wait.then((keep_waiting) => {
                    const resume = next.then(getNextPage);
                    return keep_waiting ? resume : results;
                });
            }
            return results;
        };
        tracker.updateProgress(first, query, this.soft_limit);
        return first.then(getNextPage);
    }

    /**
     * Fetches a single page of records using the optional query argument.
     */
    fetch(query: Query = null): JQuery.Promise<RestPageInfo<T>> {
        const result = this.runQuery(query);
        const tracker = this.tracker();
        tracker.updateProgress(result, query);
        return result;
    }

    /**
     * Lookup a single record from already-downloaded records. If the record
     * matching the id is not yet downloaded, returns null.
     */
    get(id: string | number): T | null {
        return lookup(this.cache, id);
    }

    /**
     * Force lookup a single record with a new backend query.
     */
    getForce(id: string | number): PromiseLike<T> {
        const query = { "filter": { "id": `${id}` } };
        const result = this.runQuery(query);
        return result.then((rpi) => {
            if (rpi.count === 1) {
                return rpi.results[0];
            }
            throw Error("Unexpected response force fetching record");
        });
    }

    /**
     * Initializes progress tracking for the next `eager()` or `fetch()`.
     */
    progress(progress: Progress, weight: number): Lookup<T> {
        this.prog = progress;
        progress?.task();
        return this;
    }

    /**
     * Initializes a page size for the next `eager()` or `fetch()`.
     */
    size(page_size: number): Lookup<T> {
        this.page_size = page_size;
        return this;
    }

    /**
     * Initializes a soft limit for the next `eager()` call. The call will
     * resolve its Promise after `limit` number of requests, rather than
     * waiting for all the eager requests to complete.
     */
    soft(limit: number): Lookup<T> {
        this.soft_limit = limit;
        return this;
    }

    protected addPagingAndSorting(query: Query, payload: JQueryPayload): JQueryPayload {
        if (query?.page) {
            payload.page = query.page;
        }
        if (query?.size || this.page_size) {
            payload.page_size = query?.size || this.page_size;
            this.page_size = null;
        }
        if (query?.sort) {
            payload.ordering = query.sort.join(",");
        }
        return payload;
    }

    protected cacheResponse(
        jqxhr: JQuery.jqXHR<RestPageInfo<T>>,
    ): JQuery.Promise<RestPageInfo<T>> {
        return jqxhr.then((rpi: RestPageInfo<T>) => {
            rpi.results.forEach((record: T) => {
                this.cache[this.toKey(record)] = record;
            });
            return rpi;
        });
    }

    protected runQuery(query: Query): JQuery.Promise<RestPageInfo<T>> {
        const payload = this.addPagingAndSorting(query, {
            ...query?.filter,
            "in_study": this.studyId,
        });
        const xhr = $.ajax({
            "data": payload,
            "type": "GET",
            "url": this.url,
        });
        return this.cacheResponse(xhr);
    }

    protected tracker(): Tracker {
        const tracker = new Tracker(this.prog);
        this.prog = null;
        return tracker;
    }
}

/**
 * A lazy-loading alternative / successor to previous Access facade. Uses a
 * promise-based API, rather than relying on all data being available up-front.
 */
export class LazyAccess {
    readonly assay: Lookup<AssayRecord>;
    readonly compartment: Lookup<CompartmentRecord>;
    readonly line: Lookup<LineRecord>;
    readonly measurement: Lookup<MeasurementRecord>;
    readonly metaType: Lookup<MetadataTypeRecord>;
    readonly protocol: Lookup<ProtocolRecord>;
    readonly type: Lookup<MeasurementTypeRecord>;
    readonly unit: Lookup<UnitType>;
    readonly user: Lookup<UserRecord>;

    progress: Progress = null;

    public constructor(protected spec: AccessSpec) {
        this.assay = new Lookup<AssayRecord>(
            this.spec.urlAssay,
            this.studyPK(),
            (assay: AssayRecord) => assay.pk,
        );
        this.compartment = new Lookup<CompartmentRecord>(
            this.spec.urlCompartment,
            this.studyPK(),
            (compartment: CompartmentRecord) => compartment.pk,
        );
        this.line = new Lookup<LineRecord>(
            this.spec.urlLine,
            this.studyPK(),
            (line: LineRecord) => line.pk,
        );
        this.measurement = new Lookup<MeasurementRecord>(
            this.spec.urlMeasurement,
            this.studyPK(),
            (measurement: MeasurementRecord) => measurement.pk,
        );
        this.metaType = new Lookup<MetadataTypeRecord>(
            this.spec.urlMetadata,
            this.studyPK(),
            (meta: MetadataTypeRecord) => meta.pk,
        );
        this.protocol = new Lookup<ProtocolRecord>(
            this.spec.urlProtocol,
            this.studyPK(),
            (protocol: ProtocolRecord) => protocol.pk,
        );
        this.type = new Lookup<MeasurementTypeRecord>(
            this.spec.urlType,
            this.studyPK(),
            (type: MeasurementTypeRecord) => type.pk,
        );
        this.unit = new Lookup<UnitType>(
            this.spec.urlUnit,
            this.studyPK(),
            (unit: UnitType) => unit.pk,
        );
        this.user = new Lookup<UserRecord>(
            this.spec.urlUser,
            this.studyPK(),
            (user: UserRecord) => user.pk,
        );
    }

    /**
     * Returns an AssayRecord for use in an edit dialog, with data merged from
     * items in the argument.
     */
    public static mergeAssays(items: AssayRecord[]): AssayRecord {
        // reduce callback has additional ignored arguments here
        // it is an error to replace the lambda with bare mergeLines!
        return items.reduce((a, b) => mergeAssays(a, b));
    }

    /**
     * Returns a LineRecord for use in an edit dialog, with data merged from
     * items in the argument.
     */
    public static mergeLines(items: LineRecord[]): LineRecord {
        // reduce callback has additional ignored arguments here
        // it is an error to replace the lambda with bare mergeLines!
        return items.reduce((a, b) => mergeLines(a, b));
    }

    item(measurement: MeasurementRecord): Item {
        const assay = this.assay.get(measurement?.assay);
        const line = this.line.get(assay?.line);
        return {
            "assay": assay,
            "line": line,
            "measurement": measurement,
        };
    }

    progressFinish(): void {
        this.progress = null;
    }

    progressInit(bar: JQuery): Progress {
        if (this.progress === null) {
            this.progress = new Progress(bar);
        }
        return this.progress;
    }

    /**
     * Builds a simple Query to narrow down results from LazyAccess calls.
     */
    query(key: string, value: string): Query {
        const filter = {};
        filter[key] = value;
        return { "filter": filter };
    }

    studyPK(): number {
        return this.spec.study.pk;
    }
}

/**
 * Processes an array of LineRecord objects to produce a list of merged
 * items where the replicate UUIDs match.
 */
export class ReplicateFilter {
    private readonly lookup: Map<string, number> = new Map();
    private readonly replicates: LineRecord[] = [];

    public constructor(private readonly conflict = null) {}

    public process(lines: LineRecord[]): LineRecord[] {
        this.reset();
        for (const line of lines) {
            const copy = { ...line };
            const replicate_id = this.getReplicateId(line);
            if (replicate_id) {
                this.checkForPriorReplicate(copy, replicate_id);
            } else {
                this.replicates.push(copy);
            }
        }
        return this.replicates;
    }

    public reset(): void {
        this.lookup.clear();
    }

    private checkForPriorReplicate(line: LineRecord, replicate_id: string): void {
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
        const value = line.replicate;
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
        updated.replicate_ids = [...previous.replicate_ids, line.pk];
        updated.replicate_names = [...previous.replicate_names, line.name];
        // keep the updated object
        this.replicates[match_index] = updated;
    }

    private recordReplicateEntry(line: LineRecord, replicate_id: string): void {
        this.lookup.set(replicate_id, this.replicates.length);
        // track names and IDs
        line.replicate_ids = [line.pk];
        line.replicate_names = [line.name];
        // pass to list
        this.replicates.push(line);
    }
}

/**
 * Finds a record in a RecordList, returning null if the key does not exist.
 */
function lookup<U>(list: RecordList<U>, key: number | string): U | null {
    // return item or a null type
    return list[key] || null;
}

function mergeMeta<T>(a: T, b: T, conflict = null): T {
    // metadata values, set key when equal, and set symmetric difference to conflict value
    const meta = {} as any;
    for (const [key, value] of Object.entries(a || {})) {
        if (JS.propertyEqual(a, b, key)) {
            meta[key] = value;
        } else {
            meta[key] = conflict;
        }
    }
    for (const key of Object.keys(b || {})) {
        if (!JS.hasOwnProp(meta, key)) {
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
    if (JS.propertyEqual(a, b, prop)) {
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
        if (JS.arrayEquivalent(a.strains, b.strains)) {
            c.strains = [].concat(a.strains);
        } else {
            c.strains = [];
        }
        // set metadata to merged result, set all keys that appear and only set equal values
        c.metadata = mergeMeta(a.metadata, b.metadata, conflict);
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
        // set values only when equal
        if (JS.propertyEqual(a, b, "name")) {
            c.name = a.name;
        }
        if (JS.propertyEqual(a, b, "description")) {
            c.description = a.description;
        }
        if (JS.propertyEqual(a, b, "protocol")) {
            c.protocol = a.protocol;
        }
        if (JS.propertyEqual(a, b, "experimenter")) {
            c.experimenter = a.experimenter;
        }
        c.metadata = mergeMeta(a.metadata, b.metadata);
        return c;
    }
}
