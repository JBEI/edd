"use strict";

import "jquery";
import { LazyAccess } from "../modules/table/Access";
import * as EDDAuto from "./EDDAutocomplete";

type GenericRecord = Record<string, any>;

export type Renderer = (record?: GenericRecord) => any;
export interface FieldRenderer extends Renderer {
    (record?: GenericRecord): string;
}
export interface AutocompleteRenderer extends Renderer {
    (record?: GenericRecord): [string, string];
}
export interface CheckboxRenderer extends Renderer {
    (record?: GenericRecord): boolean;
}
export interface IFormField<T> {
    clear(): IFormField<T>;
    enabled(enabled: boolean): IFormField<T>;
    fill(record: GenericRecord): IFormField<T>;
    name: string;
    parse(): T;
    render(): Renderer;
    render(r: Renderer): void;
    render(r?: Renderer): Renderer | void;
}

/**
 * Handles interactions with forms that can use bulk editing.
 */
export class BulkFormManager {
    private _fields: { [name: string]: IFormField<any> } = {};
    private _selection: JQuery;

    constructor(private form: JQuery, private prefix?: string) {}

    fields(fields: IFormField<any>[]): BulkFormManager {
        fields.forEach((f) => {
            this._fields[f.name] = f;
            f.clear();
        });
        return this;
    }

    fill(record: GenericRecord): BulkFormManager {
        $.each(this._fields, (name, f) => f.fill(record));
        // only when selection has multiple items, show ignore buttons on non-disabled inputs
        if (this._selection.length > 1) {
            this.form
                .find(".bulk")
                .closest("p")
                .each((i, element) => {
                    const input = $(element);
                    const enabled = !input.hasClass("disabled");
                    this.enable(input, enabled);
                });
        }
        return this;
    }

    init(selection: JQuery, prev: string): BulkFormManager {
        this._selection = selection;
        this.removeReportedErrors();
        this.hideBulkEditNotice();
        this.hideIgnoreFieldButtons();
        this.removeDisabledClass();
        this.removeBulkEventHandlers();
        // remove previous selection
        this.form.find(prev).remove();
        // clone selection to the form
        this.form.find("form").append(selection.clone().addClass("off"));

        // enable bulk edit UI when more than one item selected
        if (selection.length > 1) {
            this.initIgnoreFieldButtons();
            this.showBulkEditNotice();
            this.uncheckBulkBoxes();
            this.addBulkEventHandlers();
        }
        return this;
    }

    private addBulkEventHandlers() {
        this.form
            // event handler to enable inputs on click/focus
            .on("click.bulk focus.bulk", ":input", (ev: JQueryEventObject) => {
                const input = $(ev.target as HTMLElement);
                this.enable(input, true);
            })
            // event handler for ignore field buttons
            .on("click.bulk", ".bulk-ignore", (ev: JQueryEventObject) => {
                const input = $(ev.target as HTMLElement);
                this.enable(input, false);
                return false;
            });
    }

    private enable(input: JQuery, on: boolean) {
        const parent = input.closest("p");
        const name = parent.data("name");
        const field = this._fields[name];
        if (field) {
            field.enabled(on);
            parent
                .toggleClass("disabled", !on)
                .children("label")
                .find(".bulk")
                .prop("checked", on);
        }
    }

    private hideBulkEditNotice() {
        this.form.find(".bulk-note").addClass("off");
    }

    private hideIgnoreFieldButtons() {
        this.form.find(".bulk-ignore").addClass("off");
    }

    private initIgnoreFieldButtons() {
        // clone ignore field buttons if needed; last one should be the template
        const ignore = this.form.find(".bulk-ignore").last();
        // function adds ignore field buttons if missing, and takes off the "off" class
        const init_buttons = (i, element) => {
            const parent = $(element);
            if (parent.has(".bulk-ignore").length === 0) {
                ignore.clone().appendTo(parent);
            }
            parent.find(".bulk-ignore").removeClass("off");
        };
        this.form.find(".bulk").closest("p").each(init_buttons);
    }

    private removeBulkEventHandlers() {
        this.form.off(".bulk");
    }

    private removeDisabledClass() {
        this.form.find(".bulk").closest("p").removeClass("disabled");
    }

    private removeReportedErrors() {
        this.form.find(".errorlist").remove();
    }

    private showBulkEditNotice() {
        this.form.find(".bulk-note").removeClass("off");
    }

    private uncheckBulkBoxes() {
        this.form.find(".bulk").prop("checked", false);
    }
}

abstract class AbstractField<T> implements IFormField<T> {
    public static placeholder: string;
    private _render: Renderer;
    private _required: boolean;

    constructor(protected field: JQuery, public readonly name: string) {
        // set name data on parent P element to make it easier to map events to a Field object
        field.closest("p").data("name", name);
        this._required = field.prop("required");
    }

    abstract clear(): IFormField<T>;
    enabled(enabled: boolean, message?: string): IFormField<T> {
        message = message || Field.placeholder;
        if (enabled) {
            this.field
                .removeProp("placeholder")
                .prop("required", this._required)
                .closest("p")
                .removeClass("disabled")
                .end();
        } else {
            this.field
                .prop("placeholder", message)
                // sometimes the attribute re-asserts itself on save
                .removeProp("required")
                .removeAttr("required")
                .closest("p")
                .addClass("disabled")
                .end();
        }
        return this;
    }
    fill(record: GenericRecord): IFormField<T> {
        const hasValue = Object.prototype.hasOwnProperty.call(record, this.name);
        this.enabled(hasValue);
        return this.set(this.render()(record));
    }
    abstract parse(): T;
    render(): Renderer;
    render(r: Renderer): void;
    render(r?: Renderer): Renderer | void {
        if (r === undefined) {
            return this._render ? this._render : this.defaultRender.bind(this);
        }
        this._render = r;
    }
    abstract set(value: T): AbstractField<T>;

    protected defaultRender(record?: GenericRecord): string {
        return record[this.name];
    }
}

/**
 * Basic field; a single input element, having a single value mapped to a record property.
 * Appropriate for plain text inputs, selects, textareas. Defaults to disabling field
 * elements when the filled record does not have a property matching this field.
 */
export class Field extends AbstractField<string> {
    static build(row: JQuery, name: string): Field {
        // row sent by FormMetadataManager already has an appropriate input element
        const input = row.find("input");
        const field = new Field(input, name);
        return field;
    }

    constructor(field: JQuery, name: string) {
        super(field, name);
    }

    protected defaultRender(record?: GenericRecord): string {
        return record[this.name];
    }

    clear(): Field {
        this.field.val("");
        return this;
    }
    parse(): string {
        return this.field.val() as string;
    }
    set(value: string): Field {
        this.field.val(value);
        return this;
    }
}

export type WidgetInit = (row: JQuery, widget: Field) => void;

/**
 * Autocomplete field; has a visible element and a hidden element. Overrides the Renderer used
 * to generate both the visible and hidden values.
 */
export class Autocomplete extends AbstractField<[string, string]> {
    static build(row: JQuery, name: string): Autocomplete {
        // row sent by FormMetadataManager has visible input element
        const visible = row.find("input");
        const hidden = $("<input>").attr("type", "hidden").insertAfter(visible);
        const field = new Autocomplete(visible, hidden, name);
        return field;
    }

    constructor(private visible: JQuery, private hidden: JQuery, name: string) {
        super(visible, name);
    }
    applyAuto(row: JQuery, klass: typeof EDDAuto.BaseAuto): Autocomplete {
        const auto = new klass({
            "container": row,
            "visibleInput": this.visible,
            "hiddenInput": this.hidden,
        });
        auto.init();
        return this;
    }
    clear(): Autocomplete {
        this.hidden.val("");
        this.visible.val("");
        return this;
    }
    parse(): any {
        return this.hidden.val();
    }
    render(): AutocompleteRenderer;
    render(r: AutocompleteRenderer): void;
    render(r?: AutocompleteRenderer): AutocompleteRenderer | void {
        return super.render(r);
    }
    set(value: [string, string]): Autocomplete {
        this.visible.val(value[0]);
        this.hidden.val(value[1]);
        return this;
    }
}

export class Checkbox extends AbstractField<boolean> {
    static build(row: JQuery, name: string): Checkbox {
        // need to replace default textbox with a checkbox
        const existing = row.find("input");
        const checkbox = $("<input>").attr("type", "checkbox").insertAfter(existing);
        const field = new Checkbox(checkbox, name);
        existing.remove();
        return field;
    }

    constructor(private checkbox: JQuery, name: string) {
        super(checkbox, name);
    }
    clear(): Checkbox {
        this.checkbox.prop("checked", false);
        return this;
    }
    enabled(enabled: boolean, message?: string): Checkbox {
        this.checkbox.closest("p").toggleClass("disabled", !enabled);
        // TODO: add message somehow when disabling
        return this;
    }
    parse(): any {
        return this.checkbox.prop("checked");
    }
    render(): CheckboxRenderer;
    render(r: CheckboxRenderer): void;
    render(r?: CheckboxRenderer): CheckboxRenderer | void {
        return super.render(r);
    }
    set(value: boolean): Checkbox {
        this.checkbox.prop("checked", value);
        return this;
    }
}

export class Readonly extends AbstractField<string> {
    static build(row: JQuery, name: string): Readonly {
        // replacing default textbox with a non-input text label
        const existing = row.find("input");
        const valueElem = $("<span>").insertAfter(existing);
        const field = new Readonly(valueElem, name);
        existing.remove();
        return field;
    }

    constructor(private valueElem: JQuery, name: string) {
        super(valueElem, name);
    }
    clear(): Readonly {
        this.valueElem.text("");
        return this;
    }
    enabled(enabled: boolean, message?: string): Readonly {
        return this;
    }
    parse(): string {
        return this.valueElem.text();
    }
    set(value: string): Readonly {
        this.valueElem.text(value);
        return this;
    }
}

/**
 * FormMetadataManager has the responsibility to manipulate the dynamic inputs defining
 * metadata values in EDD's forms. The class expects to get a JQuery object with the
 * form under management, optionally with a Django Form prefix string. The form element
 * should have an input element for metadata, and a container element for the controls
 * for adding a new metadata value (class attribute select_metadata_row_class).
 */
export class FormMetadataManager {
    // metadata with input_type in hidden_widget should not display at all in forms
    private static hidden_widget = new Set(["replicate"]);
    private static widget_type_lookup = {
        "checkbox": Checkbox,
        "user": Autocomplete,
        "strain": Autocomplete,
        "readonly": Readonly,
    };
    private static widget_init_lookup = {
        "user": (row: JQuery, widget: Autocomplete) => {
            const name = "User";
            const autoType = EDDAuto.class_lookup[name];
            widget.applyAuto(row, autoType);
        },
        "strain": (row: JQuery, widget: Autocomplete) => {
            const name = "Registry";
            const autoType = EDDAuto.class_lookup[name];
            widget.applyAuto(row, autoType);
        },
    };

    // pulling out some class names to make customizing later easier
    // note: not const because it's reasonable to allow client code to change these values
    metadata_input_base_name = "metadata";
    row_of_metadata_class = "meta-row";
    model_row_class = "meta-model";
    clearing_metadata_class = "meta-clearing";
    select_metadata_row_class = "meta-add-row";
    select_metadata_button_class = "meta-add";
    prefix_label_class = "meta-prefix";
    postfix_label_class = "meta-postfix";
    remove_metadata_button_class = "meta-remove";
    restore_metadata_button_class = "meta-restore";
    clear_metadata_button_class = "meta-clear";

    private _mfields: { [name: string]: IFormField<any> } = {};

    constructor(
        private form: JQuery,
        private readonly lazy: LazyAccess,
        private prefix?: string,
    ) {
        this.attachEvents();
    }

    // use given metadata to populate form with inputs for that metadata
    metadata(metadata: { [key: number]: any }): FormMetadataManager {
        const metadataInput = this.getMetadataInput();
        // sort incoming metadata by type name
        const typeList: MetadataTypeRecord[] = Object.keys(metadata)
            .map((key) => this.lazy.metaType.get(key))
            .filter((type) => type.pk)
            .sort((a: MetadataTypeRecord, b: MetadataTypeRecord) => {
                const aName = a.type_name;
                const bName = b.type_name;
                return aName < bName ? -1 : aName > bName ? 1 : 0;
            });
        // insert rows in alphabetical order
        typeList.forEach((type) => this.insertMetaRow(type, metadata[type.pk]));
        // set the hidden field values; both the metadata input and its initial field
        const cleaned = this.cleanMeta(metadata);
        const serialized = JSON.stringify(cleaned);
        metadataInput.val(serialized);
        metadataInput.next("[name^=initial-]").val(serialized);
        return this;
    }

    // remove all metadata inputs from the form to reset to initial state
    reset(): FormMetadataManager {
        const metadataInput = this.getMetadataInput();
        $(`.${this.row_of_metadata_class}`)
            .not(`.${this.select_metadata_row_class}`)
            .remove();
        this._mfields = {};
        const blank = "{}";
        metadataInput.val(blank);
        metadataInput.next("[name^=initial-]").val(blank);
        return this;
    }

    private attachEvents(): void {
        // the row with select_metadata_row_class will also have row_of_metadata class
        const metadataRowSelector =
            `.${this.row_of_metadata_class}` +
            `:not(.${this.select_metadata_row_class})`;
        this.form.on("change", metadataRowSelector, (ev) => {
            // when an input changes, update the serialized metadata field
            const parent = $(ev.target).closest("p");
            const name = parent.data("name");
            const field = this._mfields[name];
            const metadataInput = this.getMetadataInput();
            const metadata = JSON.parse((metadataInput.val() as string) || "{}");
            metadata[name] = field.parse();
            metadataInput.val(JSON.stringify(metadata));
        });
        this.form.on("focus click", ".disabled", (ev) => {
            // un-disable anything initially disabled because of conflicting values
            $(ev.target)
                .closest(".disabled")
                .removeClass("disabled")
                .find(":input")
                .first()
                .trigger("change");
        });
        this.form.on("click", `.btn.${this.select_metadata_button_class}`, (ev) => {
            // add new inputs for the selected type of metadata
            const selectionRow = $(ev.target).closest(
                `.${this.select_metadata_row_class}`,
            );
            const typeKey = selectionRow.find("input[type=hidden]").val() as string;
            if (typeKey) {
                this.insertMetadataRow(typeKey);
                // reset the autocomplete
                selectionRow.find(".autocomp").val("");
            }
            // prevent button press from submitting form early
            return false;
        });
        this.form.on("click", `.btn.${this.remove_metadata_button_class}`, (ev) => {
            // remove inputs for a type of metadata
            const metadataRow = $(ev.target).closest(`.${this.row_of_metadata_class}`);
            const metadataInput = this.getMetadataInput();
            const metadata = JSON.parse((metadataInput.val() as string) || "{}");
            const typeKey = this.getRowMetadataKey(metadataRow);
            delete metadata[typeKey];
            metadataInput.val(JSON.stringify(metadata));
            metadataRow.remove();
        });
        this.form.on("click", `.btn.${this.clear_metadata_button_class}`, (ev) => {
            // remove inputs for a type of metadata and add deletion command for the type
            const metadataRow = $(ev.target).closest(`.${this.row_of_metadata_class}`);
            const metadataInput = this.getMetadataInput();
            const metadata = JSON.parse((metadataInput.val() as string) || "{}");
            const typeKey = this.getRowMetadataKey(metadataRow);
            metadata[typeKey] = { "delete": true };
            metadataInput.val(JSON.stringify(metadata));
            // adding class hides most things; shows clearing message + restore button
            metadataRow
                .addClass(this.clearing_metadata_class)
                .find(`.${this.restore_metadata_button_class}`)
                .removeClass("off")
                .end();
        });
        this.form.on("click", `.btn.${this.restore_metadata_button_class}`, (ev) => {
            // remove and replace the row
            const metadataRow = $(ev.target).closest(`.${this.row_of_metadata_class}`);
            const nextSibling = metadataRow.next(`.${this.row_of_metadata_class}`);
            const typeKey = this.getRowMetadataKey(metadataRow);
            // restore is removing the existing row and adding a duplicate in its place
            metadataRow.remove();
            this.insertMetadataRow(typeKey).insertBefore(nextSibling);
        });
    }

    private buildInputElement(
        row: JQuery,
        metaType: MetadataTypeRecord,
        initialValue?: any,
    ): void {
        const metaKey = metaType.pk.toString(10);
        // set disabled when explicit null is passed as initial value
        if (initialValue === null) {
            row.addClass("disabled");
        }
        const widgetType: typeof Field = this.getWidgetType(metaType);
        const widget = widgetType.build(row, metaKey);
        this._mfields[metaKey] = widget;
        if (initialValue !== undefined) {
            widget.set(initialValue);
        }
        const widgetInit = this.getWidgetInit(metaType);
        widgetInit(row, widget);
    }

    private buildInputName(name: string): string {
        if (this.prefix) {
            return `${this.prefix}-${name}`;
        }
        return name;
    }

    private cleanMeta(a: Record<string, unknown>): Record<string, unknown> {
        // take metadata created from mergeMeta, and clean out the null values
        const meta = {};
        $.each(a || {}, (key, value) => {
            if (value !== null) {
                meta[key] = value;
            }
        });
        return meta;
    }

    private getMetadataInput(): JQuery {
        const metadataName = this.buildInputName(this.metadata_input_base_name);
        return this.form.find(`[name=${metadataName}]`);
    }

    private getRowMetadataKey(row: JQuery): string {
        return row.attr("id").match(/-(\d+)$/)[1];
    }

    private getWidgetInit(metaType: MetadataTypeRecord): WidgetInit {
        const doNothing = () => undefined;
        return FormMetadataManager.widget_init_lookup[metaType.input_type] || doNothing;
    }

    private getWidgetType(metaType: MetadataTypeRecord): typeof Field {
        return FormMetadataManager.widget_type_lookup[metaType.input_type] || Field;
    }

    private insertMetadataRow(typeKey: string | number, initialValue?: any): JQuery {
        // try cache first
        const metaType = this.lazy.metaType.get(typeKey);
        if (!metaType.pk) {
            // create a placeholder DIV
            const placeholder = $("<div>").addClass("hidden");
            // replace placeholder with real row once info is available
            this.lazy.metaType.getForce(typeKey).then((mtr) => {
                const row = this.insertMetaRow(mtr, initialValue);
                row.insertBefore(placeholder);
                placeholder.remove();
            });
            return placeholder;
        } else if (!FormMetadataManager.hidden_widget.has(metaType?.input_type)) {
            return this.insertMetaRow(metaType, initialValue);
        }
        return $();
    }

    private insertMetaRow(metaType: MetadataTypeRecord, initialValue?: any): JQuery {
        const id = `meta-${metaType.pk}`;
        const modelRow = this.form.find(`.${this.model_row_class}`);
        const selectionRow = this.form.find(`.${this.select_metadata_row_class}`);
        // defaults to inserting just before the select metadata row at the end of the form
        const addingRow = modelRow
            .clone()
            .attr({
                "class": this.row_of_metadata_class,
                "id": `row-${id}`,
            })
            .insertBefore(selectionRow);
        addingRow.find("label").attr("for", `id-${id}`).text(metaType.type_name);
        this.buildInputElement(addingRow, metaType, initialValue);
        if (metaType.prefix) {
            addingRow.find(`.${this.prefix_label_class}`).text(`(${metaType.prefix})`);
        }
        if (metaType.postfix) {
            addingRow
                .find(`.${this.postfix_label_class}`)
                .text(`(${metaType.postfix})`);
        }
        return addingRow;
    }
}
