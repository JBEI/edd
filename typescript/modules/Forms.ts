"use strict";

import * as $ from "jquery";


export type Renderer = (record?: any) => any;
export interface FieldRenderer extends Renderer {
    (record?: any): string;
}
export interface AutocompleteRenderer extends Renderer {
    (record?: any): [string, string];
}
export interface CheckboxRenderer extends Renderer {
    (record?: any): boolean;
}
export interface IFormField {
    clear(): IFormField;
    enabled(enabled: boolean): IFormField;
    fill(record: any): IFormField;
    name: string;
    render(): Renderer;
    render(r: Renderer): IFormField;
    render(r?: Renderer): Renderer | IFormField;
}

/**
 * Handles interactions with forms that can use bulk editing.
 */
export class BulkFormManager {
    private _fields: {[name: string]: IFormField} = {};
    private _selection: JQuery;

    constructor(private form: JQuery, private prefix?: string) {}

    fields(fields: IFormField[]): BulkFormManager {
        fields.forEach((f) => {
            this._fields[f.name] = f;
            f.clear();
        });
        return this;
    }

    fill(record: any): BulkFormManager {
        $.each(this._fields, (name, f) => f.fill(record));
        // only when selection has multiple items, show ignore buttons on non-disabled inputs
        if (this._selection.length > 1) {
            this.form.find(".bulk").closest("p").each((i, element) => {
                const input = $(element);
                const enabled = !input.hasClass("disabled");
                this.enable(input, enabled);
            });
        }
        return this;
    }

    init(selection: JQuery, prev: string): BulkFormManager {
        this._selection = selection;
        this.form
            // remove reported errors
            .find(".errorlist").remove().end()
            // hide bulk edit notice
            .find(".bulk-note").addClass("off").end()
            // hide ignore field buttons
            .find(".bulk-ignore").addClass("off").end()
            // remove any disabled class
            .find(".bulk").closest("p").removeClass("disabled").end().end()
            // remove bulk handlers
            .off(".bulk")
            // remove previous selection
            .find(prev).remove().end()
            // clone selection to the form
            .find("form").append(selection.clone().addClass("off")).end();

        if (selection.length > 1) {
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
            this.form
                // get the bulk fields
                .find(".bulk")
                    // init the ignore field buttons on each field
                    .closest("p").each(init_buttons).end()
                .end()
                // show bulk notice
                .find(".bulk-note").removeClass("off").end()
                // uncheck bulk checkboxes
                .find(".bulk").prop("checked", false).end()
                // event handler to enable inputs on click/focus
                .on("click.bulk focus.bulk", ":input", (ev: JQueryEventObject) => {
                    const input = $(ev.target);
                    this.enable(input, true);
                })
                // event handler for ignore field buttons
                .on("click.bulk", ".bulk-ignore", (ev: JQueryEventObject) => {
                    const input = $(ev.target);
                    this.enable(input, false);
                    return false;
                });
        }
        return this;
    }

    private enable(input: JQuery, on: boolean) {
        const parent = input.closest("p");
        const name = parent.data("name");
        const field = this._fields[name];
        if (field) {
            field.enabled(on);
            parent.toggleClass("disabled", !on)
                .children("label").find(".bulk").prop("checked", on);
        }
    }
}


/**
 * Basic field; a single input element, having a single value mapped to a record property.
 * Appropriate for plain text inputs, selects, textareas. Defaults to disabling field
 * elements when the filled record does not have a property matching this field.
 */
export class Field implements IFormField {
    public static placeholder: string;
    private _render: Renderer;
    private _required: boolean;

    constructor(private field: JQuery, public readonly name: string) {
        // set name data on parent P element to make it easier to map events to a Field object
        field.closest("p").data("name", name);
        this._required = field.prop("required");
    }

    protected defaultRender(record?: any): string {
        return record[this.name];
    }

    clear(): Field {
        this.field.val("");
        return this;
    }
    enabled(enabled: boolean, message?: string): Field {
        message = message || Field.placeholder;
        if (enabled) {
            this.field
                .removeProp("placeholder")
                .prop("required", this._required)
                .closest("p").removeClass("disabled").end();
        } else {
            this.field
                .prop("placeholder", message)
                // sometimes the attribute re-asserts itself on save
                .removeProp("required").removeAttr("required")
                .closest("p").addClass("disabled").end();
        }
        return this;
    }
    fill(record: any): Field {
        const hasValue = record.hasOwnProperty(this.name);
        this.enabled(hasValue);
        this.field.val(this.render()(record));
        return this;
    }
    render(): Renderer;
    render(r: Renderer): Field;
    render(r?: Renderer): Renderer | Field {
        if (r === undefined) {
            return this._render ? this._render : this.defaultRender.bind(this);
        }
        this._render = r;
        return this;
    }
}


/**
 * Autocomplete field; has a visible element and a hidden element. Overrides the Renderer used
 * to generate both the visible and hidden values.
 */
export class Autocomplete extends Field {
    constructor(private visible: JQuery, private hidden: JQuery, name: string) {
        // TODO: use EDDAutocomplete object instead of field pairs?
        super(visible, name);
    }
    clear(): Autocomplete {
        this.hidden.val("");
        this.visible.val("");
        return this;
    }
    fill(record: any): Autocomplete {
        const hasValue = record.hasOwnProperty(this.name);
        const rendered = this.render()(record);
        this.enabled(hasValue);
        this.visible.val(rendered[0]);
        this.hidden.val(rendered[1]);
        return this;
    }
    render(): AutocompleteRenderer;
    render(r: AutocompleteRenderer): Field;
    render(r?: AutocompleteRenderer): AutocompleteRenderer | Field {
        return super.render(r);
    }
}


export class Checkbox extends Field {
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
    fill(record: any): Checkbox {
        this.enabled(record.hasOwnProperty(this.name));
        this.checkbox.prop("checked", this.render()(record));
        return this;
    }
    render(): CheckboxRenderer;
    render(r: CheckboxRenderer): Field;
    render(r?: CheckboxRenderer): CheckboxRenderer | Field {
        return super.render(r);
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

    // pulling out some class names to make customizing later easier
    // note: not const because it's reasonable to allow client code to change these values
    metadata_input_base_name: string = "metadata";
    row_of_metadata_class: string = "meta-row";
    model_row_class: string = "meta-model";
    clearing_metadata_class: string = "meta-clearing";
    select_metadata_row_class: string = "meta-add-row";
    select_metadata_button_class: string = "meta-add";
    prefix_label_class: string = "meta-prefix";
    postfix_label_class: string = "meta-postfix";
    remove_metadata_button_class: string = "meta-remove";
    restore_metadata_button_class: string = "meta-restore";
    clear_metadata_button_class: string = "meta-clear";

    constructor(private form: JQuery, private prefix?: string) {
        this.attachEvents();
    }

    // use given metadata to populate form with inputs for that metadata
    metadata(metadata: {[key: number]: any}): FormMetadataManager {
        const metadataInput = this.getMetadataInput();
        // sort incoming metadata by type name
        const typeList: MetadataTypeRecord[] = $.map(
                metadata, (value, key) => EDDData.MetaDataTypes[key],
            ).sort((a: MetadataTypeRecord, b: MetadataTypeRecord) => {
                const aName = a.name;
                const bName = b.name;
                return aName < bName ? -1 : aName > bName ? 1 : 0;
            });
        // insert rows in alphabetical order
        typeList.forEach((type) => this.insertMetadataRow(type.id, metadata[type.id]));
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
        $("." + this.row_of_metadata_class)
            .not("." + this.select_metadata_row_class)
            .remove();
        const blank = "{}";
        metadataInput.val(blank);
        metadataInput.next("[name^=initial-]").val(blank);
        return this;
    }

    private attachEvents(): void {
        // the row with select_metadata_row_class will also have row_of_metadata class
        const metadataRowSelector = "." + this.row_of_metadata_class
            + ":not(." + this.select_metadata_row_class + ")";
        this.form.on("change", metadataRowSelector, (ev) => {
            // when an input changes, update the serialized metadata field
            const changedInput = $(ev.target);
            const metadataInput = this.getMetadataInput();
            const metadata = JSON.parse(metadataInput.val() || "{}");
            const typeKey = this.getRowMetadataKey(changedInput);
            metadata[typeKey] = changedInput.val();
            metadataInput.val(JSON.stringify(metadata));
        });
        this.form.on("focus click", ".disabled", (ev) => {
            // un-disable anything initially disabled because of conflicting values
            $(ev.target).closest(".disabled").removeClass("disabled")
                .find(":input").first().trigger("change");
        });
        this.form.on("click", ".btn." + this.select_metadata_button_class, (ev) => {
            // add new inputs for the selected type of metadata
            const selectionRow = $(ev.target).closest("." + this.select_metadata_row_class);
            const typeKey = selectionRow.find("input[type=hidden]").val();
            if (typeKey) {
                this.insertMetadataRow(typeKey);
                // reset the autocomplete
                selectionRow.find(".autocomp").val("");
            }
            // prevent button press from submitting form early
            return false;
        });
        this.form.on("click", ".btn." + this.remove_metadata_button_class, (ev) => {
            // remove inputs for a type of metadata
            const metadataRow = $(ev.target).closest("." + this.row_of_metadata_class);
            const metadataInput = this.getMetadataInput();
            const metadata = JSON.parse(metadataInput.val() || "{}");
            const typeKey = this.getRowMetadataKey(metadataRow);
            delete metadata[typeKey];
            metadataInput.val(JSON.stringify(metadata));
            metadataRow.remove();
        });
        this.form.on("click", ".btn." + this.clear_metadata_button_class, (ev) => {
            // remove inputs for a type of metadata and add deletion command for the type
            const metadataRow = $(ev.target).closest("." + this.row_of_metadata_class);
            const metadataInput = this.getMetadataInput();
            const metadata = JSON.parse(metadataInput.val() || "{}");
            const typeKey = this.getRowMetadataKey(metadataRow);
            metadata[typeKey] = {"delete": true};
            metadataInput.val(JSON.stringify(metadata));
            // adding class hides most things; shows clearing message + restore button
            metadataRow.addClass(this.clearing_metadata_class)
                .find("." + this.restore_metadata_button_class)
                    .removeClass("off")
                .end();
        });
        this.form.on("click", ".btn." + this.restore_metadata_button_class, (ev) => {
            // remove and replace the row
            const metadataRow = $(ev.target).closest("." + this.row_of_metadata_class);
            const nextSibling = metadataRow.next("." + this.row_of_metadata_class);
            const typeKey = this.getRowMetadataKey(metadataRow);
            // restore is removing the existing row and adding a duplicate in its place
            metadataRow.remove();
            this.insertMetadataRow(typeKey).insertBefore(nextSibling);
        });
    }

    private buildInputElement(
        row: JQuery,
        typeKey: string | number,
        initialValue?: string,
    ): JQuery {
        const id = "meta-" + typeKey;
        if (initialValue === null) {
            row.addClass("disabled");
        }
        // TODO: change the input element based on type of metadata; see EDD-438
        return row.find("input")
            .attr("id", "id-" + id)
            .val(initialValue || "");
    }

    private buildInputName(name: string): string {
        if (this.prefix) {
            return this.prefix + "-" + name;
        }
        return name;
    }


    private cleanMeta(a: object): object {
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
        return this.form.find("[name=" + metadataName + "]");
    }

    private getRowMetadataKey(row: JQuery): string {
        return row.attr("id").match(/-(\d+)$/)[1];
    }

    private insertMetadataRow(typeKey: string | number, initialValue?: string): JQuery {
        const metaType = EDDData.MetaDataTypes[typeKey];
        if (metaType) {
            const id = "meta-" + typeKey;
            const modelRow = this.form.find("." + this.model_row_class);
            const selectionRow = this.form.find("." + this.select_metadata_row_class);
            // defaults to inserting just before the select metadata row at the end of the form
            const addingRow = modelRow.clone()
                .attr({
                    "class": this.row_of_metadata_class,
                    "id": "row-" + id,
                })
                .insertBefore(selectionRow);
            addingRow.find("label").attr("for", "id-" + id).text(metaType.name);
            this.buildInputElement(addingRow, typeKey, initialValue);
            if (metaType.pre) {
                addingRow.find("." + this.prefix_label_class)
                    .text("(" + metaType.pre + ")");
            }
            if (metaType.postfix) {
                addingRow.find("." + this.postfix_label_class)
                    .text("(" + metaType.postfix + ")");
            }
            return addingRow;
        }
        return $();
    }
}
