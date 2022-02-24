"use strict";

import { Item, LazyAccess, Query, QueryFilter } from "./Access";

/**
 * Describes an entry in a FilterSection; e.g. a Strain.
 */
class FilterValue<U> {
    dimmed = false;
    selected = false;

    constructor(readonly value: U) {}
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
abstract class FilterLayer {
    /**
     * Builds the DOM nodes to render this FilterLayer.
     */
    abstract createElements(): JQuery;
    /**
     * Checks if this FilterLayer is currently useful to show. If changing
     * the state will not change displayed data, then this layer does not
     * need to be shown.
     */
    abstract isUseful(): boolean;
    /**
     * Signal that the FilterLayer should check if any values no longer apply
     * to the subset of Item objects getting filtered.
     */
    abstract refresh(subset: Item[]): void;
    /**
     * Only use as a pre-filter! Layers may choose to skip implementing if
     * given only an AssayRecord and not a full Item tuple.
     */
    allowAssay(): (assay: AssayRecord) => boolean {
        return ALLOW;
    }
    /**
     * Create a function to accept or reject an argument Item tuple.
     */
    allowItem(): (item: Item) => boolean {
        return ALLOW;
    }
    /**
     * Accept a query definition, update with this layer's criterea, and
     * return the modified definition.
     */
    buildQueryFilter(query: QueryFilter): QueryFilter {
        return query;
    }
}

/**
 * Top-level object controlling filtering of data for display in EDD.
 */
export class Filter {
    private measurementLayer: MeasurementFilterLayer;
    private pager: JQuery = null;
    private pagerLabelTemplate: string;
    private root: JQuery = null;
    private _assayMeta: MetadataTypeRecord[] = null;

    private readonly query: Query = {
        "page": 1,
        "size": 500,
        "sort": [],
        "filter": {
            "active": "true",
        },
    };

    private constructor(
        private readonly lazy: LazyAccess,
        private readonly layers: FilterLayer[],
    ) {
        this.pager = $(".pager-nav");
        this.pagerLabelTemplate = this.pager.find(".pager-label").text();
        this.setupPagerEvents();
    }

    /**
     * Create the filter from information pulled from LazyAccess.
     */
    static create(root: HTMLElement, lazy: LazyAccess): Promise<Filter> {
        const forAssay = lazy.query("for_context", "A");
        const forLine = lazy.query("for_context", "L");
        return Promise.all([
            lazy.line.progress(lazy.progress, 1).eager(),
            lazy.assay.progress(lazy.progress, 1).eager(),
            lazy.metaType.progress(lazy.progress, 1).eager(forLine),
            lazy.metaType.progress(lazy.progress, 1).eager(forAssay),
            lazy.protocol.progress(lazy.progress, 1).eager(),
        ]).then(([lines, assays, lineMeta, assayMeta, protocols]) => {
            const mLayer = new MeasurementFilterLayer();
            const layers: FilterLayer[] = [
                LineNameFilterSection.create(lines),
                StrainFilterSection.create(lines),
                ...lineMeta
                    .filter((t) => t.input_type !== "replicate")
                    .map((t) => MetadataFilterSection.create(lines, t)),
                ProtocolFilterSection.create(protocols),
                ...assayMeta.map((t) => MetadataFilterSection.create(assays, t)),
                mLayer,
            ];
            const self = new Filter(lazy, layers);
            self._assayMeta = assayMeta;
            self.measurementLayer = mLayer;
            $(root).append(self.createElements());
            return self;
        });
    }

    /**
     * Accessor for Assay Metadata types used in this Filter.
     */
    assayMeta(): MetadataTypeRecord[] {
        return this._assayMeta;
    }

    private buildQueryFilter(query: QueryFilter): QueryFilter {
        this.layers.forEach((layer) => {
            query = layer.buildQueryFilter(query);
        });
        return query;
    }

    private createElements(): JQuery {
        this.root = $(`<div class="filter-section"></div>`);
        this.layers.forEach((section) => {
            if (section.isUseful()) {
                this.root.append(section.createElements());
            }
        });
        // when the filter sections change state, reset the page state
        this.root.on("eddfilter", () => {
            this.query.page = 1;
        });
        return this.root;
    }

    /**
     * Return Assay objects that satisfy current filter state.
     */
    limitAssays(items: Item[]): AssayRecord[] {
        const limited = this.limitItems(items);
        const assays = new Map<number, AssayRecord>();
        for (const item of limited) {
            assays.set(item.assay.pk, item.assay);
        }
        return Array.from(assays.values());
    }

    /**
     * Return Measurement Item objects that satisfy current Filter state.
     */
    limitItems(items: Item[]): Item[] {
        // get every section to give callback for Array.filter()
        const predicates = this.layers.map((s) => s.allowItem());
        // remove any ALLOW to speed up iteration
        const active = predicates.filter((p) => p !== ALLOW);
        // predicate accepts anything that satisfies every active layer
        return items.filter((item) => active.every((p) => p(item)));
    }

    /**
     * Query for Measurement Item objects using all Filter state that supports
     * querying. The resolved Promise should use `limitItems` to fully filter
     * the Items based on Filter state.
     */
    measurements(): JQuery.Promise<Item[]> {
        const qf = this.buildQueryFilter({ ...this.query.filter });
        return this.lazy.measurement
            .progress(this.lazy.progress, 10)
            .fetch({ ...this.query, "filter": qf })
            .then((rpi) => this.processMeasurements(rpi));
    }

    private processMeasurements(rpi: RestPageInfo<MeasurementRecord>): Item[] {
        // if any compartment-specific measurements are seen, update the filter
        const categories = rpi.results.map((m): MeasurementClass => {
            return {
                "compartment": this.lazy.compartment.get(m.compartment),
                "measurementType": this.lazy.type.get(m.type),
            };
        });
        this.measurementLayer.update(categories);
        this.updatePager(rpi);
        // up-front lookup of assay and line for each measurement
        return rpi.results.map((m): Item => this.lazy.item(m));
    }

    refresh(subset: Item[]): void {
        this.layers.forEach((layer) => {
            if (layer.isUseful()) {
                layer.refresh(subset);
            }
        });
    }

    private setupPagerEvents() {
        this.pager.find(".pager-prev").on("click", (event) => {
            const item = $(event.currentTarget);
            event.preventDefault();
            if (!item.hasClass("disabled")) {
                item.addClass("disabled");
                this.query.page--;
                $.event.trigger("eddfilter");
            }
        });
        this.pager.find(".pager-next").on("click", (event) => {
            const item = $(event.currentTarget);
            event.preventDefault();
            if (!item.hasClass("disabled")) {
                item.addClass("disabled");
                this.query.page++;
                $.event.trigger("eddfilter");
            }
        });
    }

    private updatePager(rpi: RestPageInfo<MeasurementRecord>): void {
        this.pager.find(".pager-prev").toggleClass("disabled", !rpi.previous);
        this.pager.find(".pager-next").toggleClass("disabled", !rpi.next);
        if (!rpi.previous) {
            // first page; know we're bound 1 at beginning
            const start = 1;
            const end = rpi.results.length;
            this.updatePagerLabel(`${start}-${end}`, `${rpi.count}`);
        } else if (!rpi.next) {
            // last page; know we're bound to count at end
            const end = rpi.count;
            const start = 1 + end - rpi.results.length;
            this.updatePagerLabel(`${start}-${end}`, `${rpi.count}`);
        } else {
            // in-between; use length as page size and calculate start and end
            const pageSize = rpi.results.length;
            const end = this.query.page * pageSize;
            const start = 1 + end - pageSize;
            this.updatePagerLabel(`${start}-${end}`, `${rpi.count}`);
        }
        this.pager.removeClass("hidden");
    }

    private updatePagerLabel(range: string, total: string): void {
        let label = this.pagerLabelTemplate;
        label = label.replace(/@range/, range);
        label = label.replace(/@total/, total);
        this.pager.find(".pager-label").text(label);
    }
}

/**
 * Base class for filtering an individual type. A list of these sections are
 * collected into an overall filtering widget.
 */
abstract class FilterSection<U, K> extends FilterLayer {
    private static counter = 1;
    readonly values: FilterValue<U>[] = [];
    // use value of sectionIndex to build unique ID attributes for HTML elements
    readonly sectionIndex: number;
    protected section: JQuery = null;
    protected list: JQuery = null;

    protected constructor(readonly title: string) {
        super();
        this.sectionIndex = FilterSection.counter++;
    }

    allowItem(): (item: Item) => boolean {
        const selected = this.selectedKeys();
        if (selected.size === 0) {
            return ALLOW;
        }
        return (item) => this.keysItem(item).some((v) => selected.has(v));
    }

    protected checkboxId(i: number): string {
        return `filter-${this.sectionIndex}-${i}`;
    }

    protected createCheckbox(item: FilterValue<U>, i: number): JQuery {
        const id = this.checkboxId(i);
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
        // TODO: add autocomplete, visible when values.length > X
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
        this.values.forEach((item, i) => {
            const li = $("<li></li>").append(this.createCheckbox(item, i));
            this.list.append(li);
        });
    }

    isUseful(): boolean {
        return this.values.length > 1;
    }

    /**
     * Converts an Item argument to an array of key values of type K.
     */
    protected abstract keysItem(item: Item): K[];

    /**
     * Converts an U argument to a key value of type K.
     */
    protected abstract keyValue(value: U): K;

    refresh(subset: Item[]): void {
        if (this.isUseful() && this.list !== null) {
            // find all relevant key values for incoming subset Items
            const keys = new Set<K>();
            for (const item of subset) {
                this.keysItem(item).forEach((key) => keys.add(key));
            }
            // set filter values dimmed property based on incoming subset
            this.values.forEach((item, index) => {
                const id = this.checkboxId(index);
                item.dimmed = !keys.has(this.keyValue(item.value));
                this.list
                    .find(`input#${id}`)
                    .parent("label")
                    .toggleClass("text-muted", item.dimmed);
            });
        }
    }

    protected registerHandlers(): void {
        // changing state of checkbox in the section
        this.section.on("change", "input", (event) => {
            const box = $(event.target);
            const index = box.data("index");
            this.values[index].selected = box.prop("checked");
            const anySelected = this.values.some((item) => item.selected);
            this.section.find(".filter-clear").toggleClass("invisible", !anySelected);
            this.section.trigger("eddfilter");
        });
        // clicking the clear button for the section
        this.section.on("click", ".filter-clear", (event) => {
            const button = $(event.currentTarget);
            if (!button.hasClass("invisible")) {
                this.values.forEach((checkbox) => {
                    checkbox.selected = false;
                });
                this.section.find("input[type=checkbox]").prop("checked", false);
                button.addClass("invisible");
                this.section.trigger("eddfilter");
                button.blur();
            }
        });
    }

    /**
     * Set of key values for currently active / selected items in this FilterSection.
     */
    selectedKeys(): Set<K> {
        const keys = new Set<K>();
        this.selectedValues().forEach((checkbox) =>
            keys.add(this.keyValue(checkbox.value)),
        );
        return keys;
    }

    selectedValues(): FilterValue<U>[] {
        return this.values.filter((checkbox) => checkbox.selected);
    }

    /**
     * Converts a U-typed value to an (HTML) string to use for display.
     */
    abstract valueToDisplay(value: U): string;
}

abstract class EDDRecordFilter<U extends EDDRecord> extends FilterSection<U, number> {
    protected keyValue(value: EDDRecord): number {
        return value.pk;
    }

    valueToDisplay(value: U) {
        return value.name;
    }
}

class LineNameFilterSection extends EDDRecordFilter<LineRecord> {
    private labels: JQuery[] = [];
    static create(source: LineRecord[]): LineNameFilterSection {
        const section = new LineNameFilterSection("Line Name");
        section.values.push(...source.map((line) => new FilterValue(line)));
        return section;
    }

    protected createCheckbox(item: FilterValue<LineRecord>, i: number): JQuery {
        const result = super.createCheckbox(item, i);
        this.labels[i] = result;
        if (item.value.color) {
            result.css("color", item.value.color);
        }
        return result;
    }

    allowAssay(): (assay: AssayRecord) => boolean {
        const selected = this.selectedKeys();
        if (selected.size === 0) {
            return ALLOW;
        }
        return (assay) => selected.has(assay.line);
    }

    buildQueryFilter(query: QueryFilter): QueryFilter {
        const values = this.selectedValues();
        if (values) {
            query.line = values.map((v) => v.value.pk).join(",");
        } else {
            delete query.line;
        }
        return query;
    }

    isUseful(): boolean {
        // this section doubles as color key legend,
        // so always display if there's at least one item,
        // instead of more than one
        return this.values.length > 0;
    }

    protected keysItem(item: Item): number[] {
        return [item.line?.pk];
    }

    refresh(subset: Item[]): void {
        super.refresh(subset);
        // set proper colors on every line label
        this.labels.forEach((label, index) => {
            const checkbox = this.values[index];
            if (checkbox.dimmed) {
                label.css("color", "inherit").parent().detach().appendTo(this.list);
            } else {
                label.css("color", checkbox.value.color || null);
            }
        });
    }
}

class StrainFilterSection extends FilterSection<StrainRecord, string> {
    static create(source: LineRecord[]): StrainFilterSection {
        const section = new StrainFilterSection("Strain");
        const map = new Map<string, StrainRecord>();
        source.forEach((line) => {
            line.strains.forEach((strain) => {
                map.set(section.keyValue(strain), strain);
            });
        });
        map.forEach((s) => {
            section.values.push(new FilterValue(s));
        });
        return section;
    }

    protected keysItem(item: Item): string[] {
        return item.line?.strains?.map((value) => this.keyValue(value));
    }

    protected keyValue(value: StrainRecord): string {
        return value.registry_id;
    }

    valueToDisplay(value: StrainRecord): string {
        return value.name;
    }
}

class ProtocolFilterSection extends FilterSection<ProtocolRecord, number> {
    static create(source: ProtocolRecord[]): ProtocolFilterSection {
        const section = new ProtocolFilterSection("Protocol");
        section.values.push(...source.map((p) => new FilterValue(p)));
        return section;
    }

    allowAssay(): (assay: AssayRecord) => boolean {
        const selected = this.selectedKeys();
        if (selected.size === 0) {
            return ALLOW;
        }
        return (assay) => selected.has(assay.protocol);
    }

    buildQueryFilter(query: QueryFilter): QueryFilter {
        const values = this.selectedValues();
        if (values) {
            query.protocol = values.map((v) => v.value.pk).join(",");
        } else {
            delete query.protocol;
        }
        return query;
    }

    protected keysItem(item: Item): number[] {
        return [item.assay?.protocol];
    }

    protected keyValue(value: ProtocolRecord): number {
        return value.pk;
    }

    valueToDisplay(value: ProtocolRecord) {
        return value.name;
    }
}

class MetadataFilterSection extends FilterSection<string, string> {
    protected constructor(private metadataType: MetadataTypeRecord) {
        super(metadataType.type_name);
    }

    static create(
        source: EDDRecord[],
        meta: MetadataTypeRecord,
    ): MetadataFilterSection {
        const section = new MetadataFilterSection(meta);
        const values = new Set<string>();
        source.forEach((x) => {
            if (Object.prototype.hasOwnProperty.call(x.metadata, `${meta.pk}`)) {
                values.add(x.metadata[meta.pk]);
            }
        });
        values.forEach((v) => {
            section.values.push(new FilterValue(v));
        });
        return section;
    }

    allowAssay(): (assay: AssayRecord) => boolean {
        const selected = this.selectedKeys();
        if (selected.size === 0) {
            return ALLOW;
        }
        return (assay) => selected.has(assay.metadata[this.metadataType.pk]);
    }

    protected keysItem(item: Item): string[] {
        if (this.metadataType.for_context === "L") {
            return [item.line?.metadata?.[this.metadataType.pk]];
        } else if (this.metadataType.for_context === "A") {
            return [item.assay?.metadata?.[this.metadataType.pk]];
        }
        return [];
    }

    protected keyValue(value: string): string {
        return value;
    }

    refresh(subset: Item[]): void {
        // TODO: find any new values for metadata, add to this.values
        super.refresh(subset);
    }

    valueToDisplay(value: string): string {
        return value;
    }
}

class MeasurementFilterLayer extends FilterLayer {
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

    allowItem(): (item: Item) => boolean {
        // get filter predicate function for each section in layer
        const subpredicates = this.sections.map((section) => section.allowItem());
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

    buildQueryFilter(query: QueryFilter): QueryFilter {
        const types = new Set<number>();
        for (const section of this.sections) {
            const selected = section.selectedValues();
            selected.forEach((v) => types.add(v.value.measurementType.pk));
        }
        if (types.size > 0) {
            query.type = Array.from(types).join(",");
        } else {
            delete query.type;
        }
        return query;
    }

    refresh(subset: Item[]): void {
        // not doing anything, handle with update() instead
    }

    update(types: MeasurementClass[]): void {
        for (const t of types) {
            // .some() will short-circuit on first section to accept the type
            this.sections.some((s) => s.addType(t));
        }
        // after adding types, update sections to display changes
        this.sections.forEach((s) => s.update());
    }
}

abstract class MeasurementFilterSection extends FilterSection<
    MeasurementClass,
    string
> {
    private readonly itemHashes = new Set<string>();
    private dirty = false;

    protected abstract accept(value: MeasurementClass): boolean;

    /**
     * Attempts to add item to filter, returning true if the item is acceptable
     * for the section.
     */
    addType(value: MeasurementClass): boolean {
        if (!this.accept(value)) {
            return false;
        }
        const hash = this.keyValue(value);
        if (!this.itemHashes.has(hash)) {
            this.values.push(new FilterValue(value));
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
        return this.values.length > 0;
    }

    keysItem(item: Item): string[] {
        return [`${item.measurement.type}`];
    }

    keyValue(value: MeasurementClass): string {
        return `${value.measurementType.pk}`;
    }

    update(): void {
        if (this.dirty) {
            this.section.removeClass("hidden");
            this.list.empty();
            this.createListItems();
        }
    }

    valueToDisplay(value: MeasurementClass): string {
        return value.measurementType.name;
    }
}

class MetaboliteSection extends MeasurementFilterSection {
    static create() {
        return new MetaboliteSection("Metabolite");
    }

    protected accept(value: MeasurementClass) {
        return value.measurementType.family === "m";
    }

    keysItem(item: Item): string[] {
        // override from base to account for compartment
        return [`${item.measurement.compartment}:${item.measurement.type}`];
    }

    keyValue(value: MeasurementClass): string {
        // override from base to account for compartment
        return `${value.compartment.pk}:${value.measurementType.pk}`;
    }

    valueToDisplay(value: MeasurementClass): string {
        const t = value.measurementType;
        let link = "";
        if (t.cid) {
            link = `<a href="https://pubchem.ncbi.nlm.nih.gov/compound/${t.cid}"
                target="_blank">CID:${t.cid}</a>`;
        }
        return `${value.compartment.code} ${t.name} ${link}`.trim();
    }
}

class ProteinSection extends MeasurementFilterSection {
    static create() {
        return new ProteinSection("Protein");
    }

    protected accept(value: MeasurementClass) {
        return value.measurementType.family === "p";
    }

    valueToDisplay(value: MeasurementClass): string {
        const t = value.measurementType;
        let link = "";
        if (t.accession) {
            link = `<a href="https://www.uniprot.org/uniprot/${t.accession}"
                target="_blank">${t.accession}</a>`;
        }
        return `${value.compartment.code} ${t.name} ${link}`.trim();
    }
}

class TranscriptSection extends MeasurementFilterSection {
    static create() {
        return new TranscriptSection("Transcript");
    }

    protected accept(value: MeasurementClass) {
        return value.measurementType.family === "g";
    }
}

class OtherSection extends MeasurementFilterSection {
    static create() {
        return new OtherSection("Other");
    }

    protected accept(value: MeasurementClass) {
        return true;
    }
}
