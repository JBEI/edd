"use strict";

import * as Utl from "../Utl";

/**
 * Describes an entry in a FilterSection; e.g. a Strain.
 */
class FilterValue<U> {
    hidden = false;
    selected = false;

    constructor(readonly value: U) {}
}

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
 * Default pass-through predicate. Filter should skip over running sections
 * that will just return everything anyway.
 */
const ALLOW = () => true;

/**
 * Base class for a layer in the filter. This class is purely defining the
 * filtering and rendering functionality, without the generics of a specific
 * type in FilterSection<U>.
 */
export abstract class FilterLayer {
    abstract createElements(): JQuery;
    abstract isUseful(): boolean;
    predicate(): (item: Item) => boolean {
        return ALLOW;
    }
}

/**
 * Top-level object controlling filtering of data for display in EDD.
 */
export class Filter {
    private readonly layers: FilterLayer[] = [];
    private measurementLayer: MeasurementFilterLayer;
    private root: JQuery = null;

    private constructor(private readonly _data: EDDData) {
        this._data.Measurements = this._data.Measurements || {};
        this.measurementLayer = new MeasurementFilterLayer();
    }

    /**
     * Create the filter from information known in initial EDDData request.
     */
    static create(data: EDDData): Filter {
        const self = new Filter(data);
        // layer for line names
        const lines: LineRecord[] = Object.values(data.Lines);
        self.layers.push(LineNameFilterSection.create(lines));
        // layer for strains
        const strains: StrainRecord[] = Object.values(data.Strains);
        self.layers.push(StrainFilterSection.create(strains));
        // layer for line metadata
        const metadata: MetadataTypeRecord[] = Object.values(data.MetaDataTypes);
        metadata.filter(Filter.lineMetadataFilter).forEach((t) => {
            self.layers.push(MetadataFilterSection.create(lines, t));
        });
        // layer for protocols
        const protocols: ProtocolRecord[] = Object.values(data.Protocols);
        self.layers.push(ProtocolFilterSection.create(protocols));
        // layer for assay metadata
        const assays: AssayRecord[] = Object.values(data.Assays);
        metadata.filter(Filter.assayMetadataFilter).forEach((t) => {
            self.layers.push(MetadataFilterSection.create(assays, t));
        });
        // layer for types of measurements at the end
        self.layers.push(self.measurementLayer);
        return self;
    }

    createElements(): JQuery {
        this.root = $(`<div class="filter-section"></div>`);
        this.layers.forEach((section) => {
            if (section.isUseful()) {
                this.root.append(section.createElements());
            }
        });
        return this.root;
    }

    getFiltered(): Item[] {
        // get every section to give callback for Array.filter()
        const predicates = this.layers.map((s) => s.predicate());
        // remove any ALLOW to speed up iteration
        const active = predicates.filter((p) => p !== ALLOW);
        // do lookups for AssayRecord and LineRecord
        const measurements = Object.values(this._data.Measurements);
        const items = measurements.map(this.createItem);
        // narrow down all to just those allowed by filter layers
        return items.filter((r) => active.every((p) => p(r)));
    }

    getFilteredByLine(): Item[] {
        const grouped: Item[] = [];
        const lookup: { [item_hash: string]: number } = {};
        this.getFiltered().forEach((item: Item) => {
            const hash = Filter.measurementHash(item.measurement);
            const match_index = lookup[`${item.line.id}:${item.assay.pid}:${hash}`];
            if (match_index !== undefined) {
                const match = grouped[match_index];
                // TODO: is merging assays necessary?
                // match.assay = mergeAssays(match.assay, item.assay);
                match.measurement.values = [
                    ...match.measurement.values,
                    ...item.measurement.values,
                ];
            } else {
                // record index and add to lookup
                lookup[item.line.id] = grouped.length;
                grouped.push(item);
            }
        });
        return grouped;
    }

    getFilteredByReplicate(): Item[] {
        const grouped: Item[] = [];
        const lookup: { [item_hash: string]: number } = {};
        // find replicate metadata for Lines to do grouping
        const meta_types = Object.values(this._data.MetaDataTypes);
        const replicate_type: MetadataTypeRecord = meta_types.find(
            (md: MetadataTypeRecord) =>
                md.input_type === "replicate" && md.context === "L",
        );
        this.getFiltered().forEach((item: Item) => {
            const hash = Filter.measurementHash(item.measurement);
            const replicate_id = item.line.meta[replicate_type.id];
            const key = replicate_id
                ? `r${replicate_id}:${item.assay.pid}:${hash}`
                : `l${item.line.id}:${item.assay.pid}:${hash}`;
            const match_index = lookup[key];
            if (match_index !== undefined) {
                const match = grouped[match_index];
                // TODO: is merging assays necessary?
                // match.assay = mergeAssays(match.assay, item.assay);
                match.measurement.values = [
                    ...match.measurement.values,
                    ...item.measurement.values,
                ];
            } else {
                // record index and add to lookup
                lookup[item.line.id] = grouped.length;
                grouped.push(item);
            }
        });
        return grouped;
    }

    /**
     * Update the filter with newly-downloaded measurement information.
     */
    update(payload: AssayValues): void {
        // update types with any new types in the payload
        Object.assign(this._data.MeasurementTypes, payload.types);
        // update assays with real counts; not all measurements may get downloaded
        for (const [assayId, count] of Object.entries(payload.total_measures)) {
            const assay = Utl.lookup(this._data.Assays, assayId);
            assay.count = count;
        }
        const categories = payload.measures.map((value) => {
            // convert the MeasurementRecord to a Category struct
            const c = Utl.lookup(this._data.MeasurementTypeCompartments, value.comp);
            const t = Utl.lookup(this._data.MeasurementTypes, value.type);
            const category = { "compartment": c, "measurementType": t };
            // merge record for Measurement with its data array
            value.values = payload.data[value.id] || [];
            // store it
            this._data.Measurements[value.id] = value;
            return category;
        });
        // pass to measurementLayer so it can update its options
        this.measurementLayer.update(categories);
    }

    private createItem(measurement: MeasurementRecord): Item {
        const assay = EDDData.Assays[measurement.assay];
        const line = EDDData.Lines[assay.lid];
        return { "assay": assay, "line": line, "measurement": measurement };
    }

    private static assayMetadataFilter(t: MetadataTypeRecord): boolean {
        // use set for possibly excluding others later
        const exclude = new Set(["replicate"]);
        return t.context === "A" && !exclude.has(t.input_type);
    }

    private static lineMetadataFilter(t: MetadataTypeRecord): boolean {
        // use set for possibly excluding others later
        const exclude = new Set(["replicate"]);
        return t.context === "L" && !exclude.has(t.input_type);
    }

    private static measurementHash(m: MeasurementRecord): string {
        return `${m.type}:${m.comp}:${m.format}:${m.x_units}:${m.y_units}`;
    }
}

/**
 * Base class for filtering an individual type. A list of these sections are
 * collected into an overall filtering widget.
 */
export abstract class FilterSection<U> extends FilterLayer {
    private static counter = 1;
    readonly items: FilterValue<U>[] = [];
    // use value of section_index to build unique ID attributes for HTML elements
    readonly section_index: number;
    protected section: JQuery = null;
    protected list: JQuery = null;

    protected constructor(readonly title: string) {
        super();
        this.section_index = FilterSection.counter++;
    }

    protected createCheckbox(item: FilterValue<U>, i: number): JQuery {
        const id = `filter-${this.section_index}-${i}`;
        const label = this.valueToDisplay(item.value);
        return $(`
          <label for="${id}">
            <input id="${id}" type="checkbox" data-index="${i}" />
            ${label}
          </label>
        `);
    }

    createElements(): JQuery {
        this.section = $(`<div class="filter-column"></div>`);
        this.section.append(this.createHeading());
        this.section.append(this.createList());
        this.section.toggleClass("hidden", !this.isUseful());
        this.registerHandlers();
        return this.section;
    }

    protected createHeading(): JQuery {
        return $(`
          <div class="filter-head">
            <button class="close filter-clear invisible" type="button">
              <i class="fas fa-times"></i>
            </button>
            <span class="filter-title">${this.title}</span>
          </div>
        `);
    }

    protected createList(): JQuery {
        this.list = $("<ul></ul>");
        this.createListItems();
        return this.list;
    }

    protected createListItems(): void {
        this.items.forEach((item, i) => {
            const li = $("<li></li>").append(this.createCheckbox(item, i));
            this.list.append(li);
        });
    }

    isUseful(): boolean {
        return this.items.length > 1;
    }

    /**
     * Creates a function for Array.filter() to remove measurements this
     * FilterSection eliminates.
     */
    predicate(): (item: Item) => boolean {
        // default is just let everything through
        return ALLOW;
    }

    protected registerHandlers() {
        // changing state of checkbox in the section
        this.section.on("change", "input", (event) => {
            const box = $(event.target);
            const index = box.data("index");
            this.items[index].selected = box.prop("checked");
            const anySelected = this.items.some(
                (item) => item.selected && !item.hidden,
            );
            this.section.find(".filter-clear").toggleClass("invisible", !anySelected);
            $.event.trigger("eddfilter");
        });
        // clicking the clear button for the section
        this.section.on("click", ".filter-clear", (event) => {
            const button = $(event.target);
            if (!button.hasClass("invisible")) {
                this.items.forEach((item) => {
                    item.selected = false;
                });
                this.section.find("input[type=checkbox]").prop("checked", false);
                button.addClass("invisible");
                $.event.trigger("eddfilter");
            }
        });
    }

    /**
     * Items from this FilterSection that are currently active / selected.
     */
    protected selectedItems(): U[] {
        return this.items
            .filter((item) => item.selected && !item.hidden)
            .map((item) => item.value);
    }

    abstract valueToDisplay(value: U): string;
}

abstract class EDDRecordFilter<U extends EDDRecord> extends FilterSection<U> {
    protected selectedIds(): Set<number> {
        return new Set(this.selectedItems().map((r) => r.id));
    }

    valueToDisplay(value: U) {
        return value.name;
    }
}

export class LineNameFilterSection extends EDDRecordFilter<LineRecord> {
    static create(source: LineRecord[]): LineNameFilterSection {
        const section = new LineNameFilterSection("Line");
        section.items.push(...source.map((line) => new FilterValue(line)));
        return section;
    }

    protected createCheckbox(item: FilterValue<LineRecord>, i: number): JQuery {
        const result = super.createCheckbox(item, i);
        if (!item.hidden && item.value.color) {
            result.css("color", item.value.color);
        }
        return result;
    }

    predicate(): (item: Item) => boolean {
        const selected = this.selectedIds();
        if (selected.size === 0) {
            return ALLOW;
        }
        return (r) => selected.has(r.assay.lid);
    }
}

export class StrainFilterSection extends EDDRecordFilter<StrainRecord> {
    static create(source: StrainRecord[]): StrainFilterSection {
        const section = new StrainFilterSection("Strain");
        section.items.push(...source.map((s) => new FilterValue(s)));
        return section;
    }

    predicate(): (item: Item) => boolean {
        const selected = this.selectedIds();
        if (selected.size === 0) {
            return ALLOW;
        }
        // at least one line strain is in selected items
        return (r) => r.line.strain.some((s) => selected.has(s));
    }
}

export class ProtocolFilterSection extends EDDRecordFilter<ProtocolRecord> {
    static create(source: ProtocolRecord[]): ProtocolFilterSection {
        const section = new ProtocolFilterSection("Protocol");
        section.items.push(...source.map((p) => new FilterValue(p)));
        return section;
    }

    predicate(): (item: Item) => boolean {
        const selected = this.selectedIds();
        if (selected.size === 0) {
            return ALLOW;
        }
        return (r) => selected.has(r.assay.pid);
    }
}

export class MetadataFilterSection extends FilterSection<string> {
    protected constructor(private metadataType: MetadataTypeRecord) {
        super(metadataType.name);
    }

    static create(source: EDDRecord[], meta: MetadataTypeRecord) {
        const section = new MetadataFilterSection(meta);
        const values = new Set<string>();
        source.forEach((x) => {
            if (Object.prototype.hasOwnProperty.call(x.meta, `${meta.id}`)) {
                values.add(x.meta[meta.id]);
            }
        });
        values.forEach((v) => {
            section.items.push(new FilterValue(v));
        });
        return section;
    }

    predicate(): (item: Item) => boolean {
        const selected = new Set(this.selectedItems());
        if (selected.size === 0) {
            return ALLOW;
        } else if (this.metadataType.context === "L") {
            return (r) => selected.has(r.line.meta[this.metadataType.id]);
        } else if (this.metadataType.context === "A") {
            return (r) => selected.has(r.assay.meta[this.metadataType.id]);
        }
        return ALLOW;
    }

    valueToDisplay(value: string): string {
        return value;
    }
}

/**
 * Defines parts of a MeasurementRecord to use in filtering by kinds of measurement.
 */
interface Category {
    compartment: MeasurementCompartmentRecord;
    measurementType: MeasurementTypeRecord;
}

export class MeasurementFilterLayer extends FilterLayer {
    private sections: MeasurementFilterSection[];

    constructor() {
        super();
        this.sections = [
            MetaboliteSection.create(),
            ProteinSection.create(),
            TranscriptSection.create(),
            OtherSection.create(),
        ];
    }

    createElements(): JQuery {
        let result = $();
        this.sections.forEach((section) => {
            result = result.add(section.createElements());
        });
        return result;
    }

    isUseful(): boolean {
        return true;
    }

    predicate(): (item: Item) => boolean {
        // get filter predicate function for each section in layer
        const subpredicates = this.sections.map((section) => section.predicate());
        // discard any ALLOW
        const active = subpredicates.filter((p) => p !== ALLOW);
        // if any section is actively filtering
        if (active.length) {
            // predicate should allow if some predicate will allow
            return (item: Item) => active.some((p) => p(item));
        }
        // otherwise allow anything
        return ALLOW;
    }

    update(types: Category[]): void {
        for (const t of types) {
            // .some() will short-circuit on first section to accept the type
            this.sections.some((s) => s.addType(t));
        }
        // after adding types, refresh sections to display changes
        this.sections.forEach((s) => s.refresh());
    }
}

abstract class MeasurementFilterSection extends FilterSection<Category> {
    private readonly itemHashes = new Set<string>();
    private dirty = false;

    /**
     * Serializes the tuple of MeasurementType and MeasurementCompartment to a
     * string for easier Set comparisons.
     */
    static itemHash(item: Item): string {
        return `${item.measurement.comp}:${item.measurement.type}`;
    }

    /**
     * Serializes the tuple of MeasurementType and MeasurementCompartment to a
     * string for easier Set comparisons.
     */
    static typeHash(t: Category): string {
        let comp = "0";
        if (t.measurementType.family === "m") {
            // only care about compartment code in metabolites
            comp = t.compartment.id;
        }
        return `${comp}:${t.measurementType.id}`;
    }

    protected abstract accept(value: Category): boolean;

    /**
     * Attempts to add item to filter, returning true if the item is acceptable
     * for the section.
     */
    addType(value: Category): boolean {
        if (!this.accept(value)) {
            return false;
        }
        const hash = MeasurementFilterSection.typeHash(value);
        if (!this.itemHashes.has(hash)) {
            this.items.push(new FilterValue(value));
            this.itemHashes.add(hash);
            this.dirty = true;
        }
        return true;
    }

    createListItems(): void {
        super.createListItems();
        this.dirty = false;
    }

    isUseful(): boolean {
        return this.items.length > 0;
    }

    predicate(): (item: Item) => boolean {
        const selected = new Set(
            this.selectedItems().map((t) => MeasurementFilterSection.typeHash(t)),
        );
        if (selected.size === 0) {
            return ALLOW;
        }
        return (x) => selected.has(MeasurementFilterSection.itemHash(x));
    }

    refresh(): void {
        if (this.dirty) {
            this.section.removeClass("hidden");
            this.list.empty();
            this.createListItems();
        }
    }

    valueToDisplay(value: Category): string {
        return value.measurementType.name;
    }
}

class MetaboliteSection extends MeasurementFilterSection {
    static create() {
        return new MetaboliteSection("Metabolite");
    }

    protected accept(value: Category) {
        return value.measurementType.family === "m";
    }
}

class ProteinSection extends MeasurementFilterSection {
    static create() {
        return new ProteinSection("Protein");
    }

    protected accept(value: Category) {
        return value.measurementType.family === "p";
    }
}

class TranscriptSection extends MeasurementFilterSection {
    static create() {
        return new TranscriptSection("Transcript");
    }

    protected accept(value: Category) {
        return value.measurementType.family === "g";
    }
}

class OtherSection extends MeasurementFilterSection {
    static create() {
        return new OtherSection("Other");
    }

    protected accept(value: Category) {
        return true;
    }
}
