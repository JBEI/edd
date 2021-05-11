import * as $ from "jquery";
import "jquery-ui/ui/effects/effect-bounce";
import "jquery-ui/ui/widgets/button";
import "jquery-ui/ui/widgets/dialog";
import "jquery-ui/ui/widgets/selectable";
import "jquery-ui/ui/widgets/sortable";
import "jquery-ui/ui/widgets/spinner";

import * as EDDAuto from "../modules/EDDAutocomplete";
import * as EddRest from "../modules/EDDRest";
import * as Utl from "../modules/Utl";

import "../modules/Styles";

// line metadata types that should use an autocomplete to gather user input
const AUTOCOMPLETE_META_UUIDS: string[] = [
    EddRest.LINE_EXPERIMENTER_META_UUID,
    EddRest.LINE_CONTACT_META_UUID,
    EddRest.CARBON_SRC_META_UUID,
    EddRest.LINE_STRAINS_META_UUID,
];

// line metadata types which represent a user and should use the user autocomplete
const USER_META_TYPE_UUIDS: string[] = [
    EddRest.LINE_CONTACT_META_UUID,
    EddRest.LINE_EXPERIMENTER_META_UUID,
];

// line metadata types that support multiple values for a single line
const MULTIVALUED_LINE_META_UUIDS = [
    EddRest.LINE_STRAINS_META_UUID,
    EddRest.CARBON_SRC_META_UUID,
];

interface ErrorSummary {
    category: string;
    summary: string;
    details?: string[];
    resolution?: string;
}

interface IceFolder {
    id: number;
    url: string;
    name: string;
    entryTypes: string[];
}

interface MultiValueInputOptions {
    maxRows?: number;
    minEntries?: number;
}

interface LinePropertyInputOptions extends MultiValueInputOptions {
    lineProperty: LinePropertyDescriptor;
    supportsCombinations?: boolean;
}

// special case JSON identifier for replicate count, which has no direct association to a line
// metadata type
const REPLICATE_COUNT_JSON_ID = "replicate_count";
const REPLICATE_NUM_NAME_ID = "replicate_num";

const ICE_FOLDER_JSON_ID = "ice_folder";

const STRAIN_NAME_ELT_LABEL = "ICE Entry Name(s)";

// back-end error messages associated with specific conditions that the UI has to handle
const NON_STRAINS_ERR_CATEGORY = "Non-Strains";
const NON_UNIQUE_NAMES_ERR_CATEGORY = "Non-unique line names";
const ICE_ACCESS_ERROR_CATEGORIES = ["ICE part access problem", "ICE access error"];
const UNRESOLVABLE_ACCESS_ERR =
    "ICE strains are required for combinatorial line creation";

const SCROLL_DURATION_MS = 2000;

// # of line names displayed per row in the step 3 preview
const LINES_PER_ROW = 4;

// max # of line name previews displayed on the page
const MAX_PREVIEW_LINE_NAMES = 51;

// animation parameters to help users understand when duplicate controls are triggered
const BOUNCES = 5;
const BOUNCE_SPEED = "slow";

function loadAllLineMetadataTypes(): void {
    $("#addPropertyButton").prop("disabled", true);
    EddRest.loadMetadataTypes({
        "success": creationManager.setLineMetaTypes.bind(creationManager),
        "error": showMetaLoadFailed,
        "request_all": true, // get all result pages
        "wait": showMetaWaitMessage,
        "context": EddRest.LINE_METADATA_CONTEXT,
        "ordering": "type_name",
    });
}

function addRetryButton(container: JQuery, retryFunction): JQuery {
    const btn = $("<button type='button'>")
        .addClass("retry-btn btn btn-secondary")
        .on("click", (event: Event) => {
            $(event.target).prop("disabled", true);
            retryFunction();
        });

    // set button icon in a span, per Bootstrap suggestion
    $("<span>").addClass("fas fa-sync-alt").appendTo(btn).after(" ");

    // set button text
    $("<span>").text("Retry").appendTo(btn);

    return btn.appendTo(container);
}

function showMetaWaitMessage(): void {
    const div = $("#step1_loading_metadata_status_div").empty();

    $("<span>")
        .text("Loading line metadata types...")
        .addClass("loading-resource-message")
        .appendTo(div);

    $("<span>").addClass("wait waitbadge-new").appendTo(div);
}

function showMetaLoadFailed(jqXHR, textStatus: string, errorThrown: string): void {
    const div = $("#step1_loading_metadata_status_div").empty();
    const span = $("<span>")
        .text("Unable to load line metadata from EDD. Property selection is disabled.")
        .addClass("alert alertDanger")
        .appendTo(div);
    addRetryButton(span, loadAllLineMetadataTypes);
}

class NameElement {
    nameEltLabel: string;
    nameEltGuiId: number;
    nameEltJsonId: any; // string for special-cases, integer pk for metadata

    // used to generate a unique ID,
    // for each naming element used within the UI.
    // This lets us distinguish custom user additions,
    // which have no representation in the database,
    // from line metadata types which do.
    // No need to worry about naming overlaps, etc.
    static nameElementCounter = 0;
    static strainNameGuiId = -1;

    constructor(label: string, nameEltJsonId: any) {
        this.nameEltLabel = label;
        this.nameEltJsonId = nameEltJsonId;

        // prevent duplicate GUI IDs
        // from being generated for strains,
        // which can originate with
        // either an ICE folder
        // or a direct entry...
        // otherwise name elts from each
        // can interfere with the other
        if (nameEltJsonId === creationManager.strainNameEltJsonId) {
            if (NameElement.strainNameGuiId < 0) {
                NameElement.strainNameGuiId = ++NameElement.nameElementCounter;
            }
            this.nameEltGuiId = NameElement.strainNameGuiId;
        } else {
            this.nameEltGuiId = ++NameElement.nameElementCounter;
        }
    }
}

class LinePropertyDescriptor extends NameElement {
    // integer pk for line metadata
    // string for special cases
    // (e.g. replicates, ICE collections)
    jsonId: number | string;
    inputLabel: string;
    metaUUID: string;

    constructor(
        jsonId: number | string,
        inputLabel: string,
        nameEltLabel: string = null,
        nameEltJsonId: any = null,
        metaUUID: string = null,
    ) {
        super(nameEltLabel || inputLabel, nameEltJsonId || jsonId);
        this.jsonId = jsonId;
        this.inputLabel = inputLabel;
        this.metaUUID = metaUUID;
    }

    toString(): string {
        return "(" + this.jsonId.toString() + ", " + this.inputLabel + ")";
    }
}

class CustomNameElement extends NameElement {
    constructor() {
        super("", null);
        this.nameEltJsonId = "_custom_" + this.nameEltGuiId;
    }

    toString(): string {
        return "(" + this.nameEltJsonId + ", " + this.nameEltLabel + ")";
    }
}

class ErrSummary {
    iceAccessErrors: boolean;
    nonStrainErrors: boolean;
    nonUniqueLineNames: boolean;

    constructor(
        iceAccessErrors: boolean,
        nonStrainErrors: boolean,
        nonUniqueLineNames: boolean,
    ) {
        this.iceAccessErrors = iceAccessErrors;
        this.nonStrainErrors = nonStrainErrors;
        this.nonUniqueLineNames = nonUniqueLineNames;
    }
}

abstract class MultiValueInput {
    uiLabel: JQuery;
    maxRows: number;
    minEntries: number;

    rows: JQuery[] = [];
    addButton: JQuery;

    constructor(label: string, options: MultiValueInputOptions) {
        this.uiLabel = $("<label>").text(label).addClass("not-in-use");
        this.maxRows = options.maxRows === undefined ? 30 : options.maxRows;
        this.minEntries = options.minEntries || 0;
    }

    hasValidInput(rowIndex: number): boolean {
        return (
            (this.rows[rowIndex].find("input").first().val() as string).trim() !== ""
        );
    }

    validInputCount(): number {
        let count = 0;
        for (let i = 0; i < this.rows.length; i++) {
            if (this.hasValidInput(i)) {
                count++;
            }
        }
        return count;
    }

    highlightRowLabel(anyValidInput: boolean): void {
        this.rows[0]
            .find("label")
            .first()
            .toggleClass("in-use", anyValidInput)
            .toggleClass("not-in-use", !anyValidInput);
    }

    getLabel(): JQuery {
        return this.uiLabel;
    }

    buildRemoveBtn(container: JQuery): JQuery {
        let btn: JQuery, rowIndex: number;
        // add a delete button in the same cell as the input controls

        if (this.getRowCount() > this.minEntries) {
            rowIndex = this.getRowCount() - 1;
            btn = $("<button>").addClass("removeButton").appendTo(container);
            $("<span>").addClass("ui-icon").addClass("ui-icon-trash").appendTo(btn);
            this.registerRemoveRowEvtHandler(btn, rowIndex);
            return btn;
        }
        return null;
    }

    abstract registerRemoveRowEvtHandler(removeButton: JQuery, rowIndex: number): void;

    buildAddBtn(container: JQuery) {
        // only add the control to the first row
        if (this.getRowCount() === 1 && this.getRowCount() < this.maxRows) {
            this.addButton = $("<button>")
                .addClass("addButton")
                .on("click", this.appendRow.bind(this))
                .appendTo(container);
            $("<span>")
                .addClass("ui-icon")
                .addClass("ui-icon-plus")
                .appendTo(this.addButton);
        }
    }

    canAddRows(): boolean {
        return this.getRowCount() < this.maxRows;
    }

    getRowCount(): number {
        return this.rows.length;
    }

    appendRow(initialInput?: any): void {
        const prevRow = this.rows[this.rows.length - 1];
        const newRow = $("<div>").addClass("table-row").insertAfter(prevRow);
        this.fillRowControls(newRow, initialInput);
        this.updateInputState();
    }

    promoteRowContent(firstRow: JQuery, nextRow: JQuery): void {
        // remove only the input cell content from this row,
        // leaving labeling and controls in place
        const inputCell = firstRow.children(".inputCell").empty();
        // detach and relocate input cell content
        // from the following row, moving it up
        nextRow
            .children(".inputCell")
            .children()
            .each((index: number, element: Element) => {
                $(element).detach().appendTo(inputCell);
            });
    }

    removeRow(rowIndex: number): void {
        let nextRow: JQuery;
        const hadValidInput = this.hasValidInput(rowIndex);
        const row = this.rows[rowIndex];

        // if removing the title row,
        // relocate inputs from the second row to the first,
        // then remove the second row
        if (rowIndex === 0 && this.rows.length > 1) {
            nextRow = this.rows[rowIndex + 1];
            this.promoteRowContent(row, nextRow);
            // remove the now-empty second row whose inputs were moved up to first
            nextRow.remove();
            this.rows.splice(rowIndex + 1, 1);
        } else {
            // if removing a row other than the first / title row, just remove everything
            row.remove();
            this.rows.splice(rowIndex, 1);
        }

        // update event handlers for subsequent rows
        // to get the correct index number
        // following the removal of a preceding row
        this.rows.slice(rowIndex).forEach((following, i) => {
            const removeBtn = following.find(".removeButton").first();
            this.registerRemoveRowEvtHandler(removeBtn, i);
        });

        if (this.getRowCount() === 0) {
            this.removeFromForm();
        }

        // if the removed row had valid user input, recompute results
        if (this.rows.length) {
            this.updateInputState();
        }
        if (hadValidInput) {
            this.postRemoveCallback(rowIndex, hadValidInput);
        }
    }

    removeFromForm(): void {
        // empty default implementation for children to override.
        // this method should ONLY remove the controls from the DOM...
        // handling subsequent updates to the rest of the form
        // should be done in postRemoveCallBack
    }

    postRemoveCallback(rowIndex: number, hadValidInput: boolean): void {
        // empty default implementation for children to override
    }

    updateInputState(): void {
        // empty default implementation for children to override
    }

    fillRowControls(row: JQuery, initialValue?: any): void {
        // empty default implementation for children to override
    }

    getValueJson(): any {
        // empty default implementation for children to override
    }
}

class LinePropertyInput extends MultiValueInput {
    lineProperty: LinePropertyDescriptor;
    supportsCombinations: boolean;

    constructor(options: LinePropertyInputOptions) {
        super(options.lineProperty.inputLabel + ":", options);
        this.lineProperty = options.lineProperty;
        if (!this.lineProperty) {
            throw Error("lineProperty is required");
        }
        this.supportsCombinations =
            options.supportsCombinations === undefined
                ? true
                : options.supportsCombinations;
    }

    updateInputState(): void {
        if (this.addButton) {
            this.addButton.prop("disabled", !this.canAddRows());
        }
        this.highlightRowLabel(this.validInputCount() > 0);
        this.autoUpdateCombinations();
    }

    getNameElements(): LinePropertyDescriptor[] {
        const validInputCount: number = this.validInputCount();
        const hasInput = validInputCount > 0;

        // only allow naming inputs to be used
        // if there's at least one valid value
        // to insert into line names.
        // note that allowing non-unique values
        // to be used in line names
        // during bulk creation can be helpful
        // since they may differentiate
        // new lines from those already in the study.
        if (!hasInput) {
            return [];
        }

        return [this.lineProperty];
    }

    getInput(rowIndex: number): any {
        const value = this.rows[rowIndex].find("input").first().val() as string;
        return value.trim();
    }

    buildYesComboButton(): JQuery {
        return $('<input type="radio">')
            .prop("name", this.lineProperty.jsonId)
            .val("Yes")
            .addClass("property_radio");
    }

    buildNoComboButton(): JQuery {
        return $('<input type="radio">')
            .prop("name", this.lineProperty.jsonId)
            .prop("checked", true)
            .val("No")
            .addClass("property_radio");
    }

    /*
     * Tests whether this property has *controls* to provide combinatorial inputs, though
     * not whether multiple valid combinatorial inputs are actually provided */
    hasMultipleInputs(): boolean {
        return this.rows.length > 1;
    }

    /**
     * Tests whether valid user inputs define combinatorial line creation. Note
     * that this may differ from the status of the "combinatorial" radio button, which
     * reflects the intention of multiple rows (some of which may be blank)
     * @returns {boolean}
     */
    hasValidCombinations(): boolean {
        // for starters, assume multiple inputs
        // (e.g. even for potentially multivalued)
        // inputs should result in creation of a combinatorial group of lines.
        // later on we can add complexity, e.g. to support co-culture.
        const nValidInputs = this.validInputCount();
        if (nValidInputs > 1) {
            return true;
        } else if (nValidInputs === 0) {
            return false;
        }

        if (EddRest.LINE_STRAINS_META_UUID === this.lineProperty.metaUUID) {
            // do special-case processing
            // for single-entry strains
            // so they show as combinatorial
            // if an ICE folder is also specified

            const iceFolderInput = creationManager.getPropertyInput(ICE_FOLDER_JSON_ID);
            if (iceFolderInput && iceFolderInput.hasValidCombinations()) {
                return true;
            }
        }
        return false;
    }

    /**
     * Auto-updates display indicators for this input to show whether they're *intended* as
     * common or combinatorial input. Note that this means, for example:
     *
     * A) When a new, empty row is added, the indicator will flip to show the intended effect
     *    of adding a valid entry in the row.
     * B) If the newly-added row remains unfilled, the indicator will may not match the way the
     *    value is actually treated
     */
    autoUpdateCombinations(): void {
        let combosButton: JQuery;

        const noCombosButton = this.rows[0].find("input:radio[value=No]");
        const namingElt = $("#" + this.lineProperty.nameEltGuiId);

        if (this.supportsCombinations) {
            // note: not all inputs will have a "make combos" button  -- need enclosing check
            combosButton = this.rows[0].find("input:radio[value=Yes]");
            // for the moment, just disable both buttons
            // and treat them as indicators rather than user inputs
            combosButton.prop("disabled", true);
        }

        // update the state of the radio buttons to reflect whether valid inputs will result
        // in combinatorial line creation...inputs may not be provided yet, but best to give
        // feedback right away re: intention when a new row is added
        const isIceFolder = this.lineProperty.jsonId === ICE_FOLDER_JSON_ID;
        const isStrains = this.lineProperty.metaUUID === EddRest.LINE_STRAINS_META_UUID;
        const aggregateComboIntended =
            isIceFolder ||
            (isStrains && !!creationManager.getPropertyInput(ICE_FOLDER_JSON_ID));
        const comboInputIntended = this.hasMultipleInputs() || aggregateComboIntended;

        let wasChecked: boolean, btn: JQuery;
        if (comboInputIntended) {
            wasChecked = combosButton.prop("checked");
            combosButton.prop("checked", true);
            btn = combosButton;
        } else {
            wasChecked = noCombosButton.prop("checked");
            noCombosButton.prop("checked", true);
            btn = noCombosButton;
        }

        // if the selection is auto-updated,
        // animate the newly selected button
        // to call the user's attention to it
        if (!wasChecked) {
            btn.effect("bounce", { "times": BOUNCES }, BOUNCE_SPEED);
        }

        noCombosButton.prop("disabled", true);

        // update step 2 naming elements for this line property... if valid values are provided
        // for combinatorial input, style the step 2 naming element to reflect that its
        // required to produce unique line names
        if (this.lineProperty.jsonId === REPLICATE_COUNT_JSON_ID) {
            // do special-case processing for replicate count input...though it's displayed
            // in step 1 as "apply to all lines", if > 1, then it's "combinatorial" from the
            // standpoint that replicate # is required input to computing unique line names
            namingElt.toggleClass("required-name-elt", this.getInput(0) > 1);
            return;
        }

        const nameInputRequired = this.hasValidCombinations();
        namingElt.toggleClass("required-name-elt", nameInputRequired);
        noCombosButton.attr(
            "disabled",
            String(nameInputRequired || this.supportsCombinations),
        );
    }

    getValueJson(): any {
        const values = this.rows
            .filter((row, index) => this.hasValidInput(index))
            .map((row, index) => this.getInput(index));

        // if there's only one valid value,
        // don't package it in an array,
        // unless there's some special reason to treat a single value as combinatorial
        // (e.g. a single strain when an ICE folder is also present).
        if (values.length === 1 && !this.hasValidCombinations()) {
            return values[0];
        }
        return values;
    }

    fillRowControls(row: JQuery, initialValue?: any): void {
        this.rows.push(row);
        const addCell = $("<div>")
            .addClass("bulk_lines_table_cell")
            .addClass("addCell")
            .appendTo(row);
        const labelCell = $("<div>").addClass("bulk_lines_table_cell").appendTo(row);
        const firstRow = this.getRowCount() === 1;
        if (firstRow) {
            this.buildAddBtn(addCell);
            this.getLabel().appendTo(labelCell);
        }
        const inputCell = $("<div>")
            .addClass("bulk_lines_table_cell")
            .addClass("inputCell")
            .appendTo(row);
        const flewGrowWrapper = $("<div>").addClass("inputContent").appendTo(inputCell);
        this.fillInputControls(flewGrowWrapper, initialValue);
        const applyAllCell = $("<div>")
            .addClass("bulk_lines_table_cell")
            .addClass("centered_radio_btn_parent")
            .appendTo(row);
        const makeComboCell = $("<div>")
            .addClass("bulk_lines_table_cell")
            .addClass("centered_radio_btn_parent")
            .appendTo(row);
        if (firstRow) {
            const noComboButton = this.buildNoComboButton().appendTo(applyAllCell);
            if (firstRow && this.supportsCombinations) {
                this.buildYesComboButton().appendTo(makeComboCell);
                noComboButton.prop("checked", true);
            }
        }
        this.updateInputState();
    }

    fillInputControls(inputCell: JQuery, initialValue?: any): void {
        // by default, just fill in a single text box.
        // child classes may override with alternate user inputs
        $('<input type="text">')
            .addClass("columnar-text-input")
            .on("change", () => {
                this.updateInputState();
                creationManager.updateNameEltChoices(false);
            })
            .appendTo(inputCell);
        this.buildRemoveBtn(inputCell);
    }

    registerRemoveRowEvtHandler(removeButton: JQuery, rowIndex: number): void {
        removeButton
            .off("click")
            .on(
                "click",
                null,
                { "rowIndex": rowIndex, "propertyInput": this },
                (ev: JQueryMouseEventObject) => {
                    ev.data.propertyInput.removeRow(ev.data.rowIndex);
                },
            );
    }

    postRemoveCallback(rowIndex: number, hadValidInput: boolean): void {
        if (hadValidInput) {
            creationManager.updateNameEltChoices(hadValidInput);
        }
    }

    removeFromForm(): void {
        creationManager.removeLineProperty(this.lineProperty);
    }
}

class CustomElementInput extends MultiValueInput {
    element: CustomNameElement;

    constructor() {
        super("", { "maxRows": 1 });
        this.element = new CustomNameElement();
    }

    getNamingElement(): CustomNameElement {
        // TODO: hard-coded index won't work for combo
        if (this.hasValidInput(0)) {
            return this.element;
        }
        return null;
    }

    hasValidInput(rowIndex: number): boolean {
        const match = this.rows[0].find(".custom-name-input").val();
        const abbrev = this.rows[rowIndex].find(".custom-val-input").val();
        return (
            match !== undefined &&
            match.toString().trim() !== "" &&
            abbrev !== undefined &&
            abbrev.toString().trim() !== ""
        );
    }

    getValueJson(): any {
        const values: any = {};
        if (!this.rows.length) {
            return null;
        }
        this.rows.forEach((currentValue, rowIndex) => {
            let staticText: any;
            if (this.hasValidInput(rowIndex)) {
                staticText = this.rows[rowIndex].find(".custom-val-input").val();
                values[this.element.nameEltJsonId] = staticText;
            }
        });
        return values;
    }

    fillRowControls(row: JQuery, initialValue?: any): void {
        const rowIndex = this.rows.length;
        this.rows.push(row);
        // TODO: consider what happens when user deletes all the text!
        this.addCustomNameInput(row, "custom-name-cell", "custom-name-input")
            .children(".custom-name-input")
            .on(
                "change",
                null,
                { "rowIndex": rowIndex, "elementInput": this },
                (ev: JQueryMouseEventObject) => {
                    // update internal state to reflect user input
                    this.element.nameEltLabel = this.rows[0]
                        .find(".custom-name-input")
                        .val() as string;
                    // update labeling for list item in the 'name element order' subsection
                    $("#name_elt" + this.element.nameEltGuiId).text(
                        this.element.nameEltLabel,
                    );
                    creationManager.updateNameEltChoices(true);
                },
            );
        const valCell = this.addCustomNameInput(
            row,
            "custom-val-cell",
            "custom-val-input",
        ).on(
            "change",
            null,
            { "rowIndex": rowIndex, "elementInput": this },
            (ev: JQueryMouseEventObject) => {
                // TODO: cache previous hasValidInput() state
                // and use here to avoid extra processing / back end requests
                creationManager.updateNameEltChoices(true);
            },
        );

        this.buildRemoveBtn(valCell);
        this.updateInputState();
    }

    promoteRowContent(firstRow: JQuery, nextRow: JQuery): void {
        // remove only the input cell content from this row,
        // leaving labeling and controls in place
        const firstRowCell = firstRow.children(".custom-name-cell").empty();
        // detach and relocate input cell content from the following row, moving it up
        nextRow.children(".custom-val-cell").each((index: number, element: Element) => {
            $(element).detach().appendTo(firstRowCell);
        });
    }

    addCustomNameInput(
        row: JQuery,
        cellClassName: string,
        inputClassName: string,
    ): JQuery {
        const cell = $("<div>")
            .addClass(
                cellClassName + " columnar-text-input bulk_lines_table_cell inputCell",
            )
            .appendTo(row);
        $('<input type="text">')
            .addClass(inputClassName)
            .on("change", () => {
                this.updateInputState();
                // TODO: implement!!
                // creationManager.updateCustomNamingElements();
            })
            .appendTo(cell);
        return cell;
    }

    registerRemoveRowEvtHandler(removeButton, rowIndex): void {
        removeButton
            .off("click")
            .on(
                "click",
                null,
                { "rowIndex": rowIndex, "customInput": this },
                (ev: JQueryMouseEventObject) => {
                    const target: number = ev.data.rowIndex;
                    const customEltInput: CustomElementInput = ev.data.customInput;
                    customEltInput.removeRow(target);
                },
            );
    }

    postRemoveCallback(): void {
        creationManager.updateNameEltChoices(true);
    }

    removeFromForm(): void {
        creationManager.removeCustomElt(this.element.nameEltGuiId);
    }
}

class AbbreviationInput extends LinePropertyInput {
    constructor(options: LinePropertyInputOptions) {
        super(options);
        // override default labeling from the parent
        this.uiLabel = $("<label>")
            .text(this.lineProperty.nameEltLabel + ":")
            .addClass("not-in-use");
    }

    hasValidInput(rowIndex: number): boolean {
        const match = this.rows[rowIndex].find(".abbrev-match-input").val();
        const abbrev = this.rows[rowIndex].find(".abbrev-val-input").val();
        return (
            match !== undefined &&
            match.toString().trim() !== "" &&
            abbrev !== undefined &&
            abbrev.toString().trim() !== ""
        );
    }

    removeFromForm(): void {
        creationManager.removeAbbrev(this.lineProperty);
    }

    postRemoveCallback(rowIndex: number, hadValidInput: boolean): void {
        creationManager.updateHasCustomNameElts();
        if (hadValidInput) {
            creationManager.queuePreviewUpdate();
        }
    }

    getValueJson(): any {
        const values: any = {};
        if (!this.rows.length) {
            return null;
        }
        this.rows.forEach((currentValue, rowIndex) => {
            let match: any, abbrev: any;
            if (this.hasValidInput(rowIndex)) {
                match = this.rows[rowIndex].find(".abbrev-match-input").val();
                abbrev = this.rows[rowIndex].find(".abbrev-val-input").val();
                values[match] = abbrev;
            }
        });
        return values;
    }

    fillRowControls(row: JQuery, initialValue?: any): void {
        this.rows.push(row);
        const addCell = $("<div>")
            .addClass("bulk_lines_table_cell")
            .addClass("addCell")
            .appendTo(row);
        const labelCell = $("<div>").addClass("bulk_lines_table_cell").appendTo(row);
        const firstRow = this.getRowCount() === 1;
        if (firstRow) {
            this.buildAddBtn(addCell);
            this.getLabel().appendTo(labelCell);
        }
        this.addAbbrevInput(row, "abbrev-match-cell", "abbrev-match-input");
        const valCell = this.addAbbrevInput(row, "abbrev-val-cell", "abbrev-val-input");
        this.buildRemoveBtn(valCell);
        this.updateInputState();
    }

    promoteRowContent(firstRow: JQuery, nextRow: JQuery): void {
        // remove only the input cell content from this row,
        // leaving labeling and controls in place
        const firstRowCell = firstRow.children(".abbrev-match-cell").empty();
        // detach and relocate input cell content from the following row, moving it up
        nextRow
            .children(".abbrev-match-cell")
            .children(".abbrev-val-cell")
            .each((index: number, element: Element) => {
                $(element).detach().appendTo(firstRowCell);
            });
    }

    addAbbrevInput(row: JQuery, cellClassName: string, inputClassName: string): JQuery {
        const cell = $("<div>")
            .addClass(
                cellClassName + " columnar-text-input bulk_lines_table_cell inputCell",
            )
            .appendTo(row);
        $('<input type="text">')
            .addClass(inputClassName)
            .on("change", () => {
                this.updateInputState();
                // TODO: test for input validity or validity change first!
                creationManager.queuePreviewUpdate();
            })
            .appendTo(cell);
        return cell;
    }

    registerRemoveRowEvtHandler(removeButton, rowIndex): void {
        removeButton
            .off("click")
            .on(
                "click",
                null,
                { "rowIndex": rowIndex, "abbrevInput": this },
                (ev: JQueryMouseEventObject) => {
                    const target: number = ev.data.rowIndex;
                    const abbrevInput: AbbreviationInput = ev.data.abbrevInput;
                    abbrevInput.removeRow(target);
                },
            );
    }
}

class LinePropertyAutoInput extends LinePropertyInput {
    autoInput: EDDAuto.BaseAuto;

    constructor(options: LinePropertyInputOptions) {
        super(options);
    }

    // build custom input controls
    // whose type depends on the data type
    // of the Line attribute they configure
    fillInputControls(inputCell: JQuery): void {
        const visible = $('<input type="text" autocomplete="off">').addClass(
            "columnar-text-input autocomp autocomp_search ui-autocomplete-input",
        );
        const hidden = $('<input type="hidden">')
            .addClass("step2-value-input")
            .on("change", () => {
                this.updateInputState();
                creationManager.updateNameEltChoices(true);
            });
        inputCell.append(visible).append(hidden);
        if (
            creationManager.userMetaTypePks.indexOf(
                this.lineProperty.jsonId as number,
            ) >= 0
        ) {
            visible.attr("eddautocompletetype", "User");
            this.autoInput = new EDDAuto.User({
                "container": inputCell,
                "visibleInput": visible,
                "hiddenInput": hidden,
            });
            this.autoInput.init();
        } else if (EddRest.CARBON_SRC_META_UUID === this.lineProperty.metaUUID) {
            visible.attr("eddautocompletetype", "CarbonSource");
            this.autoInput = new EDDAuto.CarbonSource({
                "container": inputCell,
                "visibleInput": visible,
                "hiddenInput": hidden,
            });
            this.autoInput.init();
        } else if (EddRest.LINE_STRAINS_META_UUID === this.lineProperty.metaUUID) {
            visible.attr("eddautocompletetype", "Registry");
            this.autoInput = new EDDAuto.Registry({
                "container": inputCell,
                "visibleInput": visible,
                "hiddenInput": hidden,
            });
            this.autoInput.init();
        }
        this.buildRemoveBtn(inputCell);
    }

    getInput(rowIndex: number): string | number {
        const stringVal: string = this.rows[rowIndex]
            .find("input[type=hidden]")
            .first()
            .val() as string;
        if (this.lineProperty.metaUUID === EddRest.LINE_STRAINS_META_UUID) {
            // strain autocomplete uses UUID
            return stringVal;
        }
        // non-strain autocompletes use integer pk's
        return parseInt(stringVal, 10);
    }
}

class BooleanInput extends LinePropertyInput {
    yesCheckbox: JQuery;
    noCheckbox: JQuery;

    constructor(options: LinePropertyInputOptions) {
        super(options);
    }

    fillInputControls(rowContainer: JQuery): void {
        const buttonsDiv = $("<div>")
            // TODO: rename class for this new use
            .addClass("columnar-text-input")
            .appendTo(rowContainer);
        this.yesCheckbox = $('<input type="checkbox">')
            .on("change", () => {
                this.updateInputState();
                creationManager.updateNameEltChoices(true);
            })
            .appendTo(buttonsDiv);
        $("<label>").text("Yes").appendTo(buttonsDiv);
        this.noCheckbox = $('<input type="checkbox">')
            .addClass("noCheckBox")
            .on("change", () => {
                this.updateInputState();
                creationManager.updateNameEltChoices(true);
            })
            .appendTo(buttonsDiv);
        $("<label>").text("No").appendTo(buttonsDiv);
        const removeBtn = this.buildRemoveBtn(rowContainer);
        removeBtn.addClass("controlRemoveBtn");
    }

    hasMultipleInputs(): boolean {
        return this.yesCheckbox.prop("checked") && this.noCheckbox.prop("checked");
    }

    hasValidInput(rowIndex: number): boolean {
        return this.yesCheckbox.prop("checked") || this.noCheckbox.prop("checked");
    }

    getValueJson(): any {
        return this.getInput(0);
    }

    getInput(rowIndex: number): any {
        const values = [];
        if (this.yesCheckbox.prop("checked")) {
            values.push(true);
        }
        if (this.noCheckbox.prop("checked")) {
            values.push(false);
        }
        if (values.length === 1) {
            return values[0];
        }
        return values;
    }
}

class NumberInput extends LinePropertyInput {
    constructor(options: LinePropertyInputOptions) {
        options.maxRows = 1;
        options.supportsCombinations = false;
        super(options);
    }

    fillInputControls(inputCell: JQuery): void {
        // overrides the default behavior
        // of providing a simple text input,
        // instead creating a numeric spinner
        // for controling combinatorial replicate creation
        // add spinner to the DOM first so spinner() function will work
        const spinner = $('<input id="replicate_spinner">')
            .addClass("columnar-text-input step2-value-input")
            .appendTo(inputCell);
        // add spinner styling
        spinner
            .spinner({
                "min": 1,
                "change": (event, ui) => {
                    this.updateInputState();
                    creationManager.updateNameEltChoices(true);
                },
            })
            .val(1);
        this.buildRemoveBtn(inputCell);
    }

    getInput(rowIndex: number): number {
        const value = super.getInput(rowIndex);
        return parseInt(value, 10);
    }
}

class IceFolderInput extends LinePropertyInput {
    constructor(options: LinePropertyInputOptions) {
        super(options);
        this.supportsCombinations = true;
    }

    hasValidInput(rowIndex: number): boolean {
        // inputs are pre-checked when provided in a popup dialog.
        // Invalid input impossible.
        return true;
    }

    hasValidCombinations(): boolean {
        // any valid folder input should result in combinatorial line creation
        return !!this.validInputCount();
    }

    // overrides behavior in the parent class,
    // whose default is to automatically add a row
    // each time the button is clicked.
    // In this case, we want to launch a dialog
    // and force the user to choose input first,
    // then the row added to the form
    // will be read-only feedback of user selections made in the dialog.
    buildAddBtn(container: JQuery): void {
        // only add the control to the first row
        if (this.getRowCount() === 1 && this.getRowCount() < this.maxRows) {
            this.addButton = $("<button>")
                .addClass("addButton")
                .on("click", () => {
                    this.appendRow();
                })
                .appendTo(container);
            $("<span>")
                .addClass("ui-icon")
                .addClass("ui-icon-plus")
                .appendTo(this.addButton);
        }
    }

    fillInputControls(inputCell: JQuery, folder: IceFolder): void {
        this.rows[this.rows.length - 1].data(folder);
        $("<a>")
            .prop("href", folder.url)
            .prop("target", "_blank")
            .text(folder.name)
            .addClass("ice-folder-name")
            .appendTo(inputCell);
        const filtersDiv = $("<div>")
            .addClass("ice-folder-filters-div")
            .appendTo(inputCell);
        folder.entryTypes.forEach((entryType) => {
            $("<span>")
                .text(entryType.toLowerCase())
                .addClass("badge badge-default entry-filter-value")
                .appendTo(filtersDiv);
        });
        this.buildRemoveBtn(inputCell);
    }

    /**
     * Overrides the superclass to prompt the user with a dialog, requiring validated
     * input before inserting a read-only row into the main form.
     */
    appendRow(initialInput?: IceFolder): void {
        if (!initialInput) {
            creationManager.showIceFolderDialog();
            return;
        }
        const prevRow = this.rows[this.rows.length - 1];
        const newRow = $("<div>").addClass("table-row").insertAfter(prevRow);
        this.fillRowControls(newRow, initialInput);
        this.updateInputState();
        // unlike other inputs,
        // addition of a row to the main form indicates
        // a new, valid user input.
        // force an update to the preview
        creationManager.updateNameEltChoices(true);
    }

    getValueJson(): any {
        return this.rows.map((row) => {
            const folder = row.data() as IceFolder;
            return folder.id;
        });
    }

    getFiltersJson(): any {
        const filters = {};
        this.rows.forEach((row) => {
            const folder = row.data() as IceFolder;
            filters[folder.id] = folder.entryTypes;
        });
        return filters;
    }

    autoUpdateCombinations(): void {
        // get references to the buttons used to indicate
        // whether this ICE folder results in combinatorial line creation.
        const noCombosButton = this.rows[0].find("input:radio[value=No]");
        const combosButton = this.rows[0].find("input:radio[value=Yes]");
        // Note: this control depends on guarantee
        // that the controller will create the same GUI id for strain name,
        // regardless of whether it origiated w/ an ICE folder
        // or direct strain entry
        $("#" + this.lineProperty.nameEltGuiId).toggleClass("required-name-elt");
        // Set static state associated with this input.
        // Though other inputs may eventually allow users to choose
        // whether to treat inputs as multivalued or combinatorial,
        // the existence of an ICE folder in the form
        // requires that combinatorial line creation be performed
        combosButton.attr("checked", "checked").prop("disabled", true);
        noCombosButton.prop("disabled", true);
    }
}

class CreationManager {
    // line metadata type info that drives the whole UI
    allLineMetaTypes: any = {};
    nonAutocompleteLineMetaTypes: any[] = [];
    autocompleteLineMetaTypes: any = {};
    userMetaTypePks: number[];
    multivaluedMetaTypePks: number[] = [];
    strainMetaPk = -1;
    strainNameEltJsonId: string = null;
    // step 1 : line property inputs (one per line property, regardless of row count)
    lineProperties: LinePropertyInput[] = [];
    // step 2 state
    abbreviations: AbbreviationInput[] = [];
    customNameAdditions: CustomElementInput[] = [];
    // user-selected name elements from step 2, refreshed shortly *after* user input
    lineNameElements: any[] = [];
    previewUpdateTimerID: number = null;
    // step 3 state
    plannedLineCount = 0;

    constructor() {
        // do nothing
    }

    // Start a timer to wait before calling updating the line name preview, which requires
    // an AJAX call to the back end
    queuePreviewUpdate(): void {
        if (this.previewUpdateTimerID) {
            clearTimeout(this.previewUpdateTimerID);
        }
        // TODO: 250 in import
        this.previewUpdateTimerID = window.setTimeout(
            this.updatePreview.bind(this),
            500,
        );
    }

    /*
     * Adds an empty input into the form. Most form elements are added this
     * way, with the exception of ICE folders, which must first have a valid
     * value in order to be added to the form.
     */
    addEmptyInput(lineProperty: LinePropertyDescriptor): void {
        let newInput: LinePropertyInput;
        const autocompleteMetaItem =
            this.autocompleteLineMetaTypes[lineProperty.jsonId];
        if (autocompleteMetaItem) {
            newInput = new LinePropertyAutoInput({ "lineProperty": lineProperty });
        } else if (EddRest.CONTROL_META_UUID === lineProperty.metaUUID) {
            newInput = new BooleanInput({ "lineProperty": lineProperty, "maxRows": 1 });
        } else if (REPLICATE_COUNT_JSON_ID === lineProperty.jsonId) {
            newInput = new NumberInput({ "lineProperty": lineProperty });
        } else {
            newInput = new LinePropertyInput({ "lineProperty": lineProperty });
        }
        this.addLineProperty(newInput);
    }

    removeLineProperty(lineProperty: LinePropertyDescriptor): void {
        let foundIndex = -1;
        this.lineProperties.forEach((property, index: number) => {
            if (property.lineProperty.jsonId === lineProperty.jsonId) {
                foundIndex = index;
                return false; // stop looping
            }
        });
        // remove the property from our tracking and from the DOM
        if (foundIndex >= 0) {
            const propertyInput = this.lineProperties[foundIndex];
            this.lineProperties.splice(foundIndex, 1);
            $("#line-properties-table")
                .children(".line_attr_" + lineProperty.jsonId)
                .remove();
            this.updateLinkedStrainInputs(propertyInput, false);
        }
        // restore user's ability to choose this option via the "add property" dialog
        $("#lineProp" + lineProperty.jsonId).removeClass("hide");
        // TODO: optimize by detecting whether the remaining row was non-blank...
        // this always forces a preview update,
        // which is sometimes unnecessary
        this.updateNameEltChoices(true);
    }

    removeAbbrev(lineProperty: LinePropertyDescriptor): void {
        let foundIndex = -1;
        this.abbreviations.forEach((abbrev, index: number) => {
            if (abbrev.lineProperty.jsonId === lineProperty.jsonId) {
                foundIndex = index;
                return false; // stop looping
            }
        });
        // remove the abbreviation from our tracking and from the DOM
        this.abbreviations.splice(foundIndex, 1);
        $("#abbreviations-table")
            .children(".line_attr_" + lineProperty.jsonId)
            .remove();
        this.updateHasAbbrevInputs();
        this.queuePreviewUpdate();
    }

    removeCustomElt(customEltId: number): void {
        let foundIndex = -1;
        this.customNameAdditions.forEach(
            (customInput: CustomElementInput, index: number) => {
                if (customInput.element.nameEltGuiId === customEltId) {
                    foundIndex = index;
                    return false; // stop looping
                }
            },
        );
        // remove the custom element from our tracking and from the DOM
        this.customNameAdditions.splice(foundIndex, 1);
        const rowClass = "custom_name_elt_" + customEltId;
        $("#custom-elements-table").children(rowClass).remove();
        this.updateHasCustomNameElts();
        this.queuePreviewUpdate();
    }

    addLineProperty(input: LinePropertyInput, initialValue?: any): void {
        this.lineProperties.push(input);
        const parentDiv = $("#line-properties-table");
        const rowClass = "line_attr_" + input.lineProperty.nameEltJsonId;
        this.insertRow(input, parentDiv, rowClass, initialValue);
        this.updateLinkedStrainInputs(input, true);
        // if new input has a valid initial value, update state,
        // e.g. enabling the "next" button to proceed to step 2
        if (input.hasValidInput(0)) {
            this.updateNameEltChoices(true);
        }
    }

    updateLinkedStrainInputs(input: LinePropertyInput, adding: boolean): void {
        // do special-case processing to link single strain and ICE folder inputs.
        // Single-strain input must be treated as combinatorial
        // if there's also an ICE folder present,
        // since the input strains will be merged and used for combinatorial creation
        if (input.lineProperty.jsonId === ICE_FOLDER_JSON_ID) {
            const strainInput = this.getPropertyInput(this.strainMetaPk);
            if (strainInput) {
                strainInput.autoUpdateCombinations();
            }
        } else if (adding && input.lineProperty.jsonId === this.strainMetaPk) {
            input.autoUpdateCombinations();
        }
    }

    addAbbreviation(lineAttr: LinePropertyDescriptor): void {
        const parentDiv = $("#abbreviations-table");
        const input = new AbbreviationInput({ "lineProperty": lineAttr });
        const rowClass = "line_attr_" + input.lineProperty.nameEltJsonId;
        this.abbreviations.push(input);
        this.insertRow(input, parentDiv, rowClass);
    }

    addCustomNameInput(): void {
        const parentDiv = $("#custom-elements-table");
        const input = new CustomElementInput();
        const rowClass = "custom_name_elt_" + input.element.nameEltGuiId;
        this.customNameAdditions.push(input);
        this.insertRow(input, parentDiv, rowClass);
        this.updateHasCustomNameElts();
    }

    insertRow(
        input: MultiValueInput,
        parentDiv: JQuery,
        rowClass: string,
        initialValue?: any,
    ): void {
        const row = $("<div>")
            .addClass(rowClass + " table-row")
            .appendTo(parentDiv);
        input.fillRowControls(row, initialValue);
    }

    buildStep2Inputs(): void {
        // set up connected lists for naming elements
        $("#line_name_elts, #unused_line_name_elts")
            .sortable({
                "connectWith": ".connectedSortable",
                "update": (event, ui) => {
                    creationManager.queuePreviewUpdate();
                },
            })
            .disableSelection();
        $("#add-custom-elt-btn").on("click", this.addCustomNameInput.bind(this));
        $("#step2-next-btn").on("click", this.showStep3.bind(this));
        $("#addAbbreviationButton").on(
            "click",
            creationManager.showAddAbbreviation.bind(this),
        );
    }

    buildStep3Inputs(): void {
        $("#refresh-summary-div").on("click", () => {
            creationManager.queuePreviewUpdate();
        });
        creationManager.buildAbbrevDialog();
        // set up selectable list for abbreviations dialog
        $("#line-name-abbrev-list").selectable();
        $("#add-lines-btn").on("click", this.createLines.bind(this));
        // set up behavior for supported error workarounds
        // 1) De-emphasize related error messages when workaround is in place
        $("#non-strains-opts-chkbx").on(
            "change",
            {
                "alertClass": ".non-strains-err-message",
                "chkbxClass": ".non-strains-chkbx",
            },
            creationManager.duplicateCheckboxChecked,
        );
        $("#ignore-ice-access-errors-opts-chkbx").on(
            "change",
            {
                "alertClass": ".ice-access-err-message",
                "chkbxClass": ".ignore-ice-errors-chkbx",
                "showWhenCheckedSelector": "#strains-omitted-span",
            },
            creationManager.duplicateCheckboxChecked,
        );
        $("#completion-email-opt-chkbx").on(
            "change",
            {
                "alertClass": ".timeout-error-alert",
                "chkbxClass": ".completion-email-chkbx",
            },
            (evt) => creationManager.duplicateCheckboxChecked(evt, false),
        );
    }

    duplicateCheckboxChecked(event, updatePreview?: boolean): void {
        const chxbx = $(event.target);
        const checked = chxbx.prop("checked");
        const targetId = chxbx.prop("id");
        const alertClass = event.data.alertClass;
        const chkboxClass = event.data.chkbxClass;
        // if visible, change styling on the related Step 3 alert
        // to show it's been aknowleged
        $(alertClass)
            .toggleClass("alert-danger", !checked)
            .toggleClass("alert-warning", checked);
        let completeFunction = () => creationManager.queuePreviewUpdate();
        // true except when param is explicitly false
        updatePreview = updatePreview !== false;
        if (!updatePreview) {
            completeFunction = () => {
                return;
            };
        }
        // animate, then auto-check the other (duplicate) checkbox in the form,
        // then resubmit the back-end preview request
        const otherChkbx = $(chkboxClass)
            .filter((idx: number, elt: Element) => {
                return $(elt).prop("id") !== targetId;
            })
            .prop("checked", checked)
            .effect(
                "bounce",
                {
                    "times": BOUNCES,
                    "complete": completeFunction,
                },
                BOUNCE_SPEED,
            );
        // if there is no other checkbox
        // (e.g. 'options' variant was UN-checked in absence of an error),
        // still do the preview update
        if (!otherChkbx.length) {
            completeFunction();
        }
        if (event.data.showWhenCheckedSelector) {
            $(event.data.showWhenCheckedSelector).toggleClass("hide", !checked);
        }
    }

    buildStep1Inputs(): void {
        creationManager.buildAddPropDialog();
        creationManager.buildAddIceFolderDialog();
        // set up selectable list for abbreviations dialog
        $("#line-properties-list").selectable();
        $("#step1-next-btn").on("click", this.showStep2.bind(this));
    }

    showStep2(): void {
        const step2: JQuery = $("#step2").removeClass("hide");
        $("html, body").animate(
            { "scrollTop": step2.offset().top },
            SCROLL_DURATION_MS,
        );
    }

    showStep3(): void {
        const step3: JQuery = $("#step3").removeClass("hide");
        $("html, body").animate(
            { "scrollTop": step3.offset().top },
            SCROLL_DURATION_MS,
        );
    }

    updateNameEltChoices(forcePreviewUpdate: boolean): boolean {
        const prevEltCount = this.lineNameElements.length;
        this.lineNameElements = [];

        // build an updated list of available/unique naming elements
        // based on user entries in step 1.
        const availableElts = [];
        this.lineProperties.forEach((input: LinePropertyInput): void => {
            const elts: LinePropertyDescriptor[] = input.getNameElements();
            // append only unique name elements... Strain properties, for example can be
            // options for Step 1 input of either ICE folders or strains
            elts.forEach((newElt) => {
                const isNameIdEqual = (elt) =>
                    elt.nameEltJsonId === newElt.nameEltJsonId;
                if (availableElts.filter(isNameIdEqual).length === 0) {
                    availableElts.push(newElt);
                }
            });
        });
        this.customNameAdditions.forEach((input: CustomElementInput): void => {
            const elt: CustomNameElement = input.getNamingElement();
            if (elt) {
                availableElts.push(elt);
            }
        });
        // loop over available name elements,
        // constructing a list of those newly added in step 2,
        // so they can be appended at the end of the step 3 list
        // without altering previous user entries into WIP line name ordering
        const newElts = availableElts.slice();
        $("#line_name_elts")
            .children()
            .each((childIndex: number, childElt) => {
                // start to build up a list of newly-available selections.
                // we'll clear out more of them from the list of unavailable ones
                const child = $(childElt);
                const nameElement = child.data();
                for (let newEltIndex = 0; newEltIndex < newElts.length; newEltIndex++) {
                    const element = newElts[newEltIndex];
                    if (element.nameEltGuiId === nameElement.nameEltGuiId) {
                        creationManager.lineNameElements.push(nameElement);
                        newElts.splice(newEltIndex, 1);
                        return; // continue outer loop
                    }
                }
                child.remove();
                return; // continue looping
            });
        const unusedList = $("#unused_line_name_elts");
        const unusedChildren = unusedList.children();
        if (unusedChildren) {
            unusedChildren.each((unusedIndex: number, listElement: Element) => {
                for (let newIndex = 0; newIndex < newElts.length; newIndex++) {
                    const availableElt = newElts[newIndex];
                    const eltData = $(listElement).data();
                    if (availableElt.nameEltGuiId === eltData.nameEltGuiId) {
                        newElts.splice(newIndex, 1);
                        return; // continue outer loop
                    }
                }
                listElement.remove();
                return; // continue looping
            });
        }
        // add newly-inserted elements into the 'unused' section.
        // that way previous configuration stays unaltered
        newElts.forEach((elt: NameElement) => {
            const li = $("<li>")
                .attr("id", elt.nameEltGuiId)
                .addClass("ui-state-default")
                .data(elt)
                .appendTo(unusedList);
            // if this naming element is for a line property
            // that has valid combinatorial input,
            // bold it to attract attention
            for (const input of creationManager.lineProperties) {
                if (input.lineProperty.nameEltJsonId === elt.nameEltJsonId) {
                    // will also update the new name elt to apply styling,
                    // though somewhat indirect
                    input.autoUpdateCombinations();
                    break;
                }
            }
            $("<span>")
                .attr("id", "name_elt" + elt.nameEltGuiId)
                .text(elt.nameEltLabel)
                .appendTo(li);
            // add an arrow to indicate the item can be dragged between lists
            $("<span>")
                .addClass("ui-icon ui-icon-arrowthick-2-n-s name-elt-icon")
                .appendTo(li);
        });
        // enable / disable "next" buttons based on user actions in earlier steps
        const step2Disabled = availableElts.length === 0;
        const step3Disabled = this.lineNameElements.length === 0;
        $("#step1-next-btn").prop("disabled", step2Disabled);
        $("#step2-next-btn").prop("disabled", step3Disabled);
        // auto-hide steps 2 and 3
        // if user went back to an earlier step
        // and removed their required inputs.
        // Note we purposefully *don't* auto-show them,
        // since we want user to confirm completion of the previous step by clicking "next".
        // Note we hide step 3 first to prevent "jumping" behavior
        const step2 = $("#step2");
        const step3 = $("#step3");
        if (step3Disabled && !step3.hasClass("hide")) {
            step3.addClass("hide");
        }
        if (step2Disabled && !step2.hasClass("hide")) {
            step2.addClass("hide");
        }
        // TODO: skip JSON reconstruction / resulting server request
        // if selected naming elements are the same
        // as before preceding changes added additional unselected options.
        // Note that since the form will never add a naming element automatically,
        // comparing array dimensions is enough
        const nameEltsChanged = this.lineNameElements.length !== prevEltCount;
        if (nameEltsChanged || forcePreviewUpdate) {
            this.queuePreviewUpdate();
            return true;
        }
        return false;
    }

    updatePreview(): void {
        // build an updated list of naming elements based on user entries in step 2. Note
        // that events from the connected lists don't give us enough info to know which element
        // was just changed in line names
        this.lineNameElements = [];
        $("#line_name_elts")
            .children()
            .each((index: number, elt: any) => {
                const nameElement = $(elt).data();
                this.lineNameElements.push(nameElement);
            });
        const step3Allowed =
            $("#unused_line_name_elts").children(".required-name-elt").length === 0 &&
            this.lineNameElements.length > 0;
        $("#step2-next-btn").prop("disabled", !step3Allowed);
        // if user went back up and added combinatorial data to step 1,
        // hide step 3 until step 2 is complete
        if (!step3Allowed) {
            $("#step3").addClass("hide");
            return;
        }
        // before submitting the potentially long-running AJAX request,
        // disable all Step 3 inputs and show a basic progress indicator
        creationManager.setStep3InputsEnabled(false);
        $("#step3-waiting-div").removeClass("hide");
        const json = this.buildJson();
        const url = this.buildRequestUrl(true);
        // submit a query to the back end
        // to compute line / assay names and detect errors
        // before actually making any changes
        $.ajax(url, {
            "headers": { "Content-Type": "application/json" },
            "method": "POST",
            "dataType": "json",
            "data": json,
            "processData": false,
            "success": this.updateStep3Summary.bind(this),
            "error": this.updateStep3Error.bind(this),
        });
        $("#step3Label").removeClass("wait");
    }

    setStep3InputsEnabled(enabled: boolean): void {
        $("#step3 :input").prop("disabled", !enabled);
        $("#step3").toggleClass("disabledStep3", !enabled);
        $("#step3 #step3-waiting-div").removeClass("disabledStep3");
    }

    buildRequestUrl(dryRun: boolean): string {
        const params: any = {};
        // aggregate GET parameters to include with the request.
        // Though these could be included in the JSON,
        // they're purposefully separate
        // so they can also be used in the ED file upload.
        if (dryRun) {
            params.DRY_RUN = "True";
        }
        const allowNonStrains = $("#non-strains-opts-chkbx").prop("checked");
        const isIgnoreIceErrors = $("#ignore-ice-access-errors-opts-chkbx").prop(
            "checked",
        );
        const sendEmail = $("#completion-email-opt-chkbx").is(":checked");
        if (sendEmail) {
            params.EMAIL_WHEN_FINISHED = "True";
        }
        if (allowNonStrains) {
            params.ALLOW_NON_STRAIN_PARTS = "True";
        }
        if (isIgnoreIceErrors) {
            params.IGNORE_ICE_ACCESS_ERRORS = "True";
        }
        return "?" + $.param(params);
    }

    createLines(): void {
        this.showCreatingLinesDialog();
        const json = this.buildJson();
        const url = this.buildRequestUrl(false);
        // submit a query to the back end
        // to compute line / assay names
        // and detect errors before actually making any changes
        $.ajax(url, {
            "headers": { "Content-Type": "application/json" },
            "method": "POST",
            "dataType": "json",
            "data": json,
            "processData": false,
            "success": this.lineCreationSuccess.bind(this),
            "error": this.lineCreationError.bind(this),
        });
    }

    lineCreationSuccess(responseJson): void {
        $("#creation-wait-spinner").addClass("hide");
        $("<span>")
            .text("Success")
            .addClass("alert alert-success")
            .appendTo("#creation-status-div");
        $("#return-to-study-btn").prop("disabled", false);
        $("#create-more-btn").prop("disabled", false);
    }

    lineCreationError(jqXHR: JQueryXHR, textStatus: string, errorThrown: string): void {
        $("#creation-wait-spinner").addClass("hide");
        const statusDiv = $("#creation-status-div").empty();
        const json = jqXHR.responseJSON;
        this.showErrorMessages(statusDiv, json, jqXHR.status, false, () =>
            creationManager.createLines(),
        );
    }

    updateStep3Error(jqXHR: JQueryXHR, textStatus: string, errorThrown: string): void {
        const json = jqXHR.responseJSON;
        $("#line-preview-div").addClass("hide");
        const errsDiv = $("#step3-errors-div").empty().removeClass("hide");
        const summary = this.showErrorMessages(errsDiv, json, jqXHR.status, true, () =>
            creationManager.queuePreviewUpdate(),
        );
        const enableAddLines =
            ($("#non-strains-opts-chkbx").prop("checked") ||
                !summary.nonStrainErrors) &&
            !summary.nonUniqueLineNames;
        $("#step3-waiting-div").addClass("hide");
        $("#add-lines-btn").prop("disabled", !enableAddLines);
    }

    showErrorMessages(
        parentDiv: JQuery,
        json: any,
        httpStatus: number,
        preview: boolean,
        retryFunction,
    ): ErrSummary {
        creationManager.setStep3InputsEnabled(true);
        const div = $("<div>").addClass("add-combos-subsection").appendTo(parentDiv);
        $("<label>").text("Error(s):").appendTo(div);
        const tableDiv = $("<div>").addClass("bulk-line-table").appendTo(parentDiv);
        let anyNonStrainErr = false;
        let anyIceAccessErr = false;
        let nonUniqueLineNames = false;
        if (json) {
            const errors = json.errors;
            if (errors) {
                errors.forEach((error, index: number) => {
                    const isNonStrainErr = NON_STRAINS_ERR_CATEGORY === error.category;
                    const isIceAccessErr =
                        ICE_ACCESS_ERROR_CATEGORIES.indexOf(error.category) >= 0;
                    anyNonStrainErr = anyNonStrainErr || isNonStrainErr;
                    anyIceAccessErr = anyIceAccessErr || isIceAccessErr;
                    nonUniqueLineNames =
                        nonUniqueLineNames ||
                        NON_UNIQUE_NAMES_ERR_CATEGORY === error.category;
                    const row = this.appendAlert(tableDiv, error);
                    if (isNonStrainErr) {
                        creationManager.addAlertChkbx(
                            row,
                            "non-strains-alert-chkbx",
                            "non-strains-opts-chkbx",
                            "non-strains-chkbx",
                            "non-strains-err-message",
                        );
                    }
                    if (isIceAccessErr) {
                        if (
                            error.summary &&
                            !error.summary.startsWith(UNRESOLVABLE_ACCESS_ERR)
                        ) {
                            creationManager.addAlertChkbx(
                                row,
                                "ignore-ice-access-errs-alert-chkbx",
                                "ignore-ice-access-errors-opts-chkbx",
                                "ignore-ice-errors-chkbx",
                                "ice-access-err-message",
                                "#strains-omitted-span",
                            );
                        }
                    }
                });
                // If any ICE-related error has occurred,
                // show options for supported workarounds.
                // Once workarounds have been displayed,
                // they should stay visible so user inputs don't get lost,
                // even as other earlier form entries are altered
                const ignoreIceErrorsDiv = $("#ignore-ice-errors-opts-div");
                const nonStrainsDiv = $("#non-strains-opts-div");
                if (anyIceAccessErr && ignoreIceErrorsDiv.hasClass("hide")) {
                    ignoreIceErrorsDiv.removeClass("hide");
                }
                if (anyNonStrainErr && nonStrainsDiv.hasClass("hide")) {
                    nonStrainsDiv.removeClass("hide");
                }
            } else {
                this.addUnexpectedErrResult(parentDiv, retryFunction);
            }
        } else if (httpStatus === 503) {
            // provide a special-case error message
            // to help users work around timeouts
            // until the back-end is migrated to a Celery task
            // with Websocket notifications.
            let details: string[];
            if (preview) {
                details = [
                    "This can occur when you ask EDD to create a very large " +
                        "number of lines, e.g. from a large ICE folder. You can try " +
                        "again, or attempt to create lines anyway, then have EDD " +
                        "email you when line creation succeeds or fails. It's " +
                        "unlikely that EDD will be able to preview the results for " +
                        "you, so we only suggest proceeding if this is an empty " +
                        "study, or you're experienced in using this tool. It's very " +
                        "likely that EDD will time out again during line creation, " +
                        "so consider using email to monitor success.",
                ];
            } else {
                details = [
                    "This can occur when you ask EDD to create a very large " +
                        "number of lines, e.g. from a large ICE folder. EDD may " +
                        "still succeed in creating your lines after a delay, but it " +
                        "won't be able to display a success message here.  Check " +
                        "your study after a few minutes, then consider trying " +
                        "again, perhaps using email notification to monitor " +
                        "progress.",
                ];
            }
            const row = this.appendAlert(tableDiv, {
                "category": "Request timed out",
                "summary": "EDD is unavailable or took too long to respond",
                "details": details,
            });
            if (preview) {
                creationManager.addAlertChkbx(
                    row,
                    "completion-email-alert-chkbx",
                    "completion-email-opt-chkbx",
                    "completion-email-chkbx",
                    "timeout-error-alert",
                    null,
                    false,
                );
                const btnDiv = $("<div>");
                const retryButton = addRetryButton(btnDiv, retryFunction);
                retryButton.removeClass("btn-secondary").addClass("btn-primary");
                const forceBtn = $("<button type='button'>")
                    .prop("id", "force-creation-btn")
                    .addClass("btn btn-secondary")
                    .on("click", (event: Event) => {
                        $(event.target).prop("disabled", true);
                        creationManager.createLines();
                    });
                $("<span>")
                    .addClass("fas fa-exclamation-triangle")
                    .appendTo(forceBtn)
                    .after(" ");
                $("<span>").text("Force Line Creation").appendTo(forceBtn);
                forceBtn.appendTo(btnDiv);
                btnDiv.appendTo(row);
            }
        } else {
            this.addUnexpectedErrResult(parentDiv, retryFunction);
        }
        return new ErrSummary(anyIceAccessErr, anyNonStrainErr, nonUniqueLineNames);
    }

    // insert a checkbox into the alert error message
    // matching the one under the Step 3 "Options" section.
    // Also copy the label text from the baked-in Step 3 checkbox so labels match.
    // This puts user input for problem workarounds in context in the error message,
    // but also makes the stateful controls visible across AJAX requests.
    addAlertChkbx(
        alert: JQuery,
        alertChkbxId: string,
        optsChkbxId: string,
        checkboxClass: string,
        alertClass: string,
        showWhenCheckedSelector?: string,
        updatePreview?: boolean,
    ): void {
        // true except when param is explicitly false
        updatePreview = updatePreview !== false;
        // make a new checkbox to put in the alert,
        // linking it with the "options" checkbox
        const alertChkbx = $('<input type="checkbox">')
            .attr("id", alertChkbxId)
            .addClass(checkboxClass)
            .on(
                "click",
                {
                    "alertClass": "." + alertClass,
                    "chkbxClass": "." + checkboxClass,
                    "showWhenCheckedSelector": showWhenCheckedSelector,
                },
                (evt) => {
                    creationManager.duplicateCheckboxChecked(evt, updatePreview);
                },
            );
        // copy the "options" label into the alert
        const optLabel = $('label[for="' + optsChkbxId + '"]');
        const alertLbl = $("<label>").text(optLabel.text()).attr("for", alertChkbxId);
        $("<div>").append(alertChkbx).append(alertLbl).appendTo(alert);
        // add a class that allows us to locate and restyle the alert later
        // if the workaround is selected
        alert.addClass(alertClass);
    }

    addUnexpectedErrResult(statusDiv: JQuery, retryFunction): void {
        const alertDiv = this.appendAlert(statusDiv, {
            "category": "Error",
            "summary": "An unexpected error occurred. Sorry about that!",
        });
        addRetryButton(alertDiv, retryFunction);
    }

    updateStep3Summary(responseJson): void {
        let lines: any;
        const count = responseJson.count;
        if (Object.prototype.hasOwnProperty.call(responseJson, "lines")) {
            lines = responseJson.lines;
        }
        this.plannedLineCount = count;
        $("#step3-errors-div").empty().addClass("hide");
        // show # lines to be created
        $("#line-count-div").text(count);
        this.addLineNamesToTable(lines);
        creationManager.setStep3InputsEnabled(true);
        $("#add-lines-btn").prop("disabled", false);
        $("#step3-waiting-div").addClass("hide");
    }

    addLineNamesToTable(lines): void {
        let i: number, row: JQuery, cell: JQuery;
        // remove any earlier previews
        $(".line-names-preview-row").remove();
        const table = $("#line-preview-table");
        i = 0;
        for (const lineName in lines) {
            if (Object.prototype.hasOwnProperty.call(lines, lineName)) {
                if (i === 0 || i % LINES_PER_ROW === 0) {
                    row = $("<div>")
                        .addClass("table-row line-names-preview-row")
                        .appendTo(table);
                }
                cell = $("<div>")
                    .addClass("bulk_lines_table_cell")
                    .text(lineName)
                    .appendTo(row);
                if (i === MAX_PREVIEW_LINE_NAMES) {
                    const remainder =
                        Object.keys(lines).length - MAX_PREVIEW_LINE_NAMES;
                    if (remainder > 0) {
                        cell.text("... (" + remainder + " more)");
                    }
                    break;
                }
                i++;
            }
        }
        $("#line-preview-div").removeClass("hide");
    }

    setLineMetaTypes(metadataTypes: any[]): void {
        $("#step1_loading_metadata_status_div").empty();
        $("#addPropertyButton").prop("disabled", false);
        this.userMetaTypePks = [];
        this.nonAutocompleteLineMetaTypes = [];
        this.autocompleteLineMetaTypes = {};
        this.multivaluedMetaTypePks = [];
        this.strainMetaPk = -1;
        const lineProps: LinePropertyDescriptor[] = [];
        metadataTypes.forEach((meta) => {
            // omit "Line Name" and "Description" metadata type from available options.
            // Both options would be confusing for users,
            // since the normal case for this GUI
            // should be to compute line names from combinatorial metadata values,
            // and combinatorial entry of line descriptions isn't really possible
            if (
                EddRest.LINE_NAME_META_UUID === meta.uuid ||
                EddRest.LINE_DESCRIPTION_META_UUID === meta.uuid
            ) {
                return true; // keep looping!
            }
            // if this metadata type matches the name of one we have autocomplete inputs for
            // keep track of its pk for easy reference
            if (AUTOCOMPLETE_META_UUIDS.indexOf(meta.uuid) >= 0) {
                this.autocompleteLineMetaTypes[meta.pk] = meta;
            }
            // if this metadata type is one that supports multivalued input for a single line,
            // store its pk for easy reference
            if (MULTIVALUED_LINE_META_UUIDS.indexOf(meta.uuid) >= 0) {
                this.multivaluedMetaTypePks.push(meta.pk);
            }
            // compute UI labeling for the line properties that makes sense,
            // e.g. by stripping off the "line" prefix from types that have it,
            // or adding in the units suffix for clarity
            let uiLabel: string = meta.type_name;
            if ("Line " === uiLabel.substring(0, 5)) {
                uiLabel = meta.type_name.substring(5, meta.type_name.length);
            }
            const postfix = meta.postfix;
            if (postfix.length) {
                uiLabel = uiLabel + " (" + postfix + ")";
            }
            let nameEltLabel: string = uiLabel;
            let nameEltJsonId: number | string = meta.pk;
            // build up a descriptor for this metadata type,
            // including logical labeling for it in various parts of the GUI,
            // as well as JSON id's for both the metadata itself
            // or its naming elements
            let propertyDescriptor: LinePropertyDescriptor;
            if (USER_META_TYPE_UUIDS.indexOf(meta.uuid) >= 0) {
                nameEltLabel = uiLabel + " Last Name";
                nameEltJsonId = meta.pk + "__last_name";
                propertyDescriptor = new LinePropertyDescriptor(
                    meta.pk,
                    uiLabel,
                    nameEltLabel,
                    nameEltJsonId,
                    meta.uuid,
                );
                this.userMetaTypePks.push(meta.pk);
            } else if (
                EddRest.LINE_STRAINS_META_UUID === meta.uuid ||
                EddRest.CARBON_SRC_META_UUID === meta.uuid
            ) {
                nameEltJsonId = meta.pk + "__name";
                if (EddRest.LINE_STRAINS_META_UUID === meta.uuid) {
                    nameEltLabel = STRAIN_NAME_ELT_LABEL;
                    this.strainNameEltJsonId = nameEltJsonId;
                    this.strainMetaPk = meta.pk;
                } else {
                    nameEltLabel =
                        meta.type_name.substring(0, meta.type_name.indexOf("(s)")) +
                        " Name(s)";
                }
                propertyDescriptor = new LinePropertyDescriptor(
                    meta.pk,
                    uiLabel,
                    nameEltLabel,
                    nameEltJsonId,
                    meta.uuid,
                );
            } else {
                propertyDescriptor = new LinePropertyDescriptor(
                    meta.pk,
                    uiLabel,
                    null,
                    null,
                    meta.uuid,
                );
            }
            lineProps.push(propertyDescriptor);
            this.allLineMetaTypes[meta.pk] = meta; // TODO: still need this?
        });
        // add in special-case hard-coded items
        // that make sense to put in this list,
        // but aren't actually represented by line metadata types in the database.
        // Since line metadata types will all have a unique integer pk identifier,
        // we can use non-integer alphanumeric strings for our special-case additions.
        lineProps.push(
            new LinePropertyDescriptor(
                REPLICATE_COUNT_JSON_ID,
                "Replicates",
                "Replicate #",
                REPLICATE_NUM_NAME_ID,
            ),
        );
        lineProps.push(
            new LinePropertyDescriptor(
                ICE_FOLDER_JSON_ID,
                "Strain(s) - ICE folder",
                STRAIN_NAME_ELT_LABEL,
                this.strainNameEltJsonId,
            ),
        );
        // after removing the "Line " prefix from labels for this context,
        // sort the list so it appears in alphabetic order *as displayed*
        lineProps.sort((a: LinePropertyDescriptor, b: LinePropertyDescriptor) => {
            return a.inputLabel.localeCompare(b.inputLabel);
        });
        // with labeling now sorted alphabetically, create list items
        lineProps.forEach((lineProp: LinePropertyDescriptor) => {
            const linePropsList = $("#line-properties-list");
            $("<li>")
                .attr("id", "lineProp" + lineProp.jsonId)
                .addClass("ui-widget-content")
                .text(lineProp.inputLabel)
                .appendTo(linePropsList)
                .data(lineProp);
        });
    }

    showAddProperty(): void {
        $("#add-prop-dialog").dialog("open");
    }

    buildAddPropDialog(): void {
        const addPropDialog = $("#add-prop-dialog")
            .dialog({
                "resizable": true,
                "height": 500,
                "minWidth": 188,
                "maxWidth": 750,
                "modal": true,
                "autoOpen": false,
                "buttons": [
                    {
                        "text": "Add Selected",
                        "class": "btn btn-primary",
                        "click": () => {
                            $("#line-properties-list")
                                .children(".ui-selected")
                                .removeClass("ui-selected")
                                .addClass("hide")
                                .each((index: number, elt: Element) => {
                                    const descriptor = $(
                                        elt,
                                    ).data() as LinePropertyDescriptor;
                                    if (descriptor.jsonId === ICE_FOLDER_JSON_ID) {
                                        // show folder dialog,
                                        // which will control whether the folder
                                        // eventually gets added as an input (once validated)
                                        creationManager.showIceFolderDialog();
                                        return; // keep iterating
                                    }
                                    creationManager.addEmptyInput(descriptor);
                                });
                        },
                    },
                    {
                        "text": "Close",
                        "class": "btn btn-secondary",
                        "click": () => {
                            addPropDialog.dialog("close");
                            // de-select anything user left selected
                            $("#line-properties-list")
                                .children(".ui-selected")
                                .removeClass("ui-selected");
                        },
                    },
                ],
                // remove class that hides it during initial page load
            })
            .removeClass("hide");

        // add click behavior to the "add property" button
        $("#addPropertyButton").on("click", creationManager.showAddProperty.bind(this));
    }

    showIceFolderDialog(): void {
        // reset form defaults
        $("#ice-folder-url-input").val("");
        $("#folder-lookup-status-div").empty();
        $("type-strain").attr("checked", "checked");
        // show the dialog
        $("#add-ice-folder-dialog").dialog("open");
    }

    buildAddIceFolderDialog(): void {
        const folderDialog = $("#add-ice-folder-dialog")
            .dialog({
                "resizable": true,
                "height": 405,
                "width": 572,
                "minWidth": 345,
                "maxWidth": 750,
                "modal": true,
                "autoOpen": false,
                "buttons": [
                    {
                        "text": "Add Folder",
                        "class": "btn btn-primary",
                        "click": () => {
                            const url = $("#ice-folder-url-input").val();
                            // submit a query to the back end to compute line / assay names
                            // and detect errors before actually making any changes
                            // TODO: replace hard-coded URL (EDD-1261)
                            $.ajax("/ice_folder/", {
                                "headers": { "Content-Type": "application/json" },
                                "method": "GET",
                                "dataType": "json",
                                "data": { "url": url },
                                "success": this.iceFolderLookupSuccess.bind(this),
                                "error": this.iceFolderLookupError.bind(this),
                            });
                        },
                    },
                    {
                        "text": "Cancel",
                        "class": "btn btn-secondary",
                        "click": () => {
                            folderDialog.dialog("close");
                            // de-select anything user left selected
                            $("#line-properties-list")
                                .children(".ui-selected")
                                .removeClass("ui-selected");
                            // if no corresponding rows exist yet in the main form,
                            // restore this option to the line properties dialag
                            // so it can be added later
                            const folderInput: any =
                                this.getPropertyInput(ICE_FOLDER_JSON_ID);
                            if (!folderInput) {
                                $("#lineProp" + ICE_FOLDER_JSON_ID)
                                    .removeClass("hide")
                                    .addClass("ui-selected");
                            }
                        },
                    },
                ],
                // remove class that hides it during initial page load
            })
            .removeClass("hide");
        // add click behavior to the "add property" button
        $("#addPropertyButton").on("click", creationManager.showAddProperty.bind(this));
    }

    getPropertyInput(jsonId: any): LinePropertyInput {
        let result: LinePropertyInput = null;
        this.lineProperties.forEach(function (input) {
            if (input.lineProperty.jsonId === jsonId) {
                result = input;
                return false; // stop looping
            }
        });
        return result;
    }

    iceFolderLookupSuccess(
        folder_json: any,
        textStatus: string,
        jqXHR: JQueryXHR,
    ): void {
        // look for any existing form input for ICE folders.
        // If there is one, we'll just add a row to it for the newly validated folder
        const iceInput = this.getPropertyInput(ICE_FOLDER_JSON_ID) as IceFolderInput;
        $("#add-ice-folder-dialog").dialog("close");
        const toggleIds = [
            "#type-strain",
            "#type-protein",
            "#type-plasmid",
            "#type-part",
            "#type-seed",
        ];
        // gather all the relevant inputs for displaying user entry in the main form
        const filterTypes = toggleIds
            .filter((selector) => $(selector).is(":checked"))
            .map((selector) => $(selector).val() as string);
        const folder: IceFolder = {
            "id": folder_json.id,
            "name": folder_json.folderName,
            "url": $("#ice-folder-url-input").val() as string,
            "entryTypes": filterTypes,
        };
        if (iceInput != null) {
            iceInput.appendRow(folder);
            return;
        }
        // grab the "LineProperty" entry from the 'Add property" dialog's list,
        // then use it to create a new input,
        // including the validated folder in the first row
        $("#line-properties-list")
            .children()
            .each((index: number, elt: Element) => {
                const descriptor = $(elt).data() as LinePropertyDescriptor;
                if (descriptor.jsonId === ICE_FOLDER_JSON_ID) {
                    const input = new IceFolderInput({
                        "lineProperty": descriptor,
                    });
                    creationManager.addLineProperty(input, folder);
                    return false; // stop looping
                }
            });
    }

    iceFolderLookupError(
        jqXHR: JQueryXHR,
        textStatus: string,
        errorThrown: string,
    ): void {
        const contentType = jqXHR.getResponseHeader("Content-Type");
        const statusDiv = $("#folder-lookup-status-div").empty();
        const genericErrorMsg = {
            "category": "ICE lookup error",
            "summary":
                "An unknown error has occurred while resolving the " +
                "folder with ICE. Please try again.",
        };
        if (contentType === "application/json") {
            const errors = jqXHR.responseJSON.errors;
            if (errors) {
                errors.forEach((error) => {
                    this.appendAlert(statusDiv, error);
                });
            } else {
                this.appendAlert(statusDiv, genericErrorMsg);
            }
        } else {
            this.appendAlert(statusDiv, genericErrorMsg);
        }
    }

    appendAlert(statusDiv: JQuery, message: ErrorSummary): JQuery {
        const div = $("<div>").addClass("alert alert-danger").appendTo(statusDiv);
        $("<h4>").text(message.category).appendTo(div);
        if (message.details) {
            $("<p>")
                .text(message.summary + ": " + message.details)
                .appendTo(div);
        } else {
            $("<p>").text(message.summary).appendTo(div);
        }
        return div;
    }

    showCreatingLinesDialog(): void {
        // disable buttons and set styling to match the rest of EDD
        $("#return-to-study-btn").prop("disabled", true).addClass("btn btn-primary");
        $("#create-more-btn").prop("disabled", true).addClass("btn btn-primary");
        $("#creation-wait-spinner").removeClass("hide");
        $("#creation-status-div").empty();
        $("#line-count-span").text(this.plannedLineCount);
        $("#creating-lines-dialog")
            .dialog(
                "option",
                "title",
                "Creating " + this.plannedLineCount + " Lines...",
            )
            .dialog("open");
    }

    buildLineCreationDialog(): void {
        const study_url = $("#study_link").attr("href");
        $("#creating-lines-dialog")
            .dialog({
                // let users see err messages (if any)
                "resizable": true,
                "modal": true,
                "autoOpen": false,
                "buttons": [
                    {
                        "text": "Create More",
                        "id": "create-more-btn",
                        "click": () => {
                            $("#creating-lines-dialog").dialog("close");
                            // if lines have just been created,
                            // we need updated feedback from the back end
                            // since unchanged settings will now produce duplicate names
                            creationManager.queuePreviewUpdate();
                        },
                    },
                    {
                        "text": "Return to Study",
                        "id": "return-to-study-btn",
                        "click": () => {
                            window.location.href = study_url;
                        },
                    },
                ],
                // remove the class that hides it during page load
            })
            .removeClass("hide");
    }

    showAddAbbreviation(): void {
        const list = $("#line-name-abbrev-list").empty();
        this.lineNameElements.forEach((namingElement: LinePropertyDescriptor) => {
            let existingAbbreviation = false;
            this.abbreviations.forEach((abbreviation: AbbreviationInput) => {
                if (abbreviation.lineProperty.jsonId === namingElement.jsonId) {
                    existingAbbreviation = true;
                    return false; // stop inner loop
                }
            });
            // skip list item creation for any line property
            // that we already have an abbreviation for
            if (existingAbbreviation) {
                return true; // continue looping
            }
            $("<li>")
                .text(namingElement.nameEltLabel)
                .addClass("ui-widget-content")
                .data(namingElement)
                .appendTo(list);
        });
        creationManager.updateHasAbbrevDialogOptions(list);
        $("#add-abbrev-dialog").dialog("open");
    }

    buildAbbrevDialog(): void {
        const abbrevDialog = $("#add-abbrev-dialog")
            .dialog({
                "resizable": false,
                "modal": true,
                "autoOpen": false,
                "buttons": {
                    "Add Abbreviation(s)": () => {
                        creationManager.addSelectedAbbreviations();
                    },
                    "Close": () => {
                        abbrevDialog.dialog("close");
                    },
                },
            })
            .removeClass("hide"); // remove class that hides it during initial page load
    }

    addSelectedAbbreviations(): void {
        $("#abbreviations-table").removeClass("hide");
        // build the list of line attributes selected in the dialog
        const abbreviationsList = $("#line-name-abbrev-list");
        const selectedItems = abbreviationsList.children(".ui-selected");
        const selectedProperties = selectedItems
            .get()
            .map((element) => $(element).data() as LinePropertyDescriptor);
        if (!selectedProperties.length) {
            return;
        }
        // remove selected items from the list
        selectedItems.remove();
        this.updateHasAbbrevDialogOptions(abbreviationsList);
        selectedProperties.forEach((attribute) => {
            this.addAbbreviation(attribute);
        });
        this.updateHasAbbrevInputs();
    }

    updateHasAbbrevInputs(): void {
        const hasInputs: boolean =
            $("#abbreviations-table").children(".table-row").length !== 0;
        // show table header, since there's at least one abbreviation row
        $("#abbreviations-table").toggleClass("hide", !hasInputs);
        $("#no-abbrevs-div").toggleClass("hide", hasInputs);
    }

    updateHasAbbrevDialogOptions(list: JQuery): void {
        const hasOptions = list.children("li").length !== 0;
        $("#no-abbrev-options-div").toggleClass("hide", hasOptions);
        list.toggleClass("hide", !hasOptions);
    }

    updateHasCustomNameElts(): void {
        const customEltsTable = $("#custom-elements-table");
        const hasInputs = customEltsTable.children(".table-row").length !== 0;
        customEltsTable.toggleClass("hide", !hasInputs);
        $("#no-custom-elts-div").toggleClass("hide", hasInputs);
    }

    buildJson(): string {
        // name element ordering
        const nameElts: any = {};
        const elts = [];
        this.lineNameElements.forEach(function (nameElement: LinePropertyDescriptor) {
            elts.push(nameElement.nameEltJsonId);
        });
        nameElts.elements = elts;
        // custom name elements
        const customElts: any = {};
        this.customNameAdditions.forEach((input: CustomElementInput) => {
            const value = input.getValueJson();
            if (!value) {
                return true; // continue looping
            }
            $.extend(customElts, value); // TODO: point out overlapping inputs!
        });
        // abbreviations
        if (this.abbreviations.length) {
            const abbrevs: any = {};
            this.abbreviations.forEach((inputs: AbbreviationInput, index: number) => {
                // vals = inputs.validInputCount() )
                const values: any = inputs.getValueJson();
                if (values) {
                    abbrevs[inputs.lineProperty.nameEltJsonId] = values;
                }
            });
            nameElts.abbreviations = abbrevs;
        }
        const result: any = { "name_elements": nameElts };
        if (customElts) {
            result.custom_name_elts = customElts;
        }
        // include all inputs in the JSON,
        // separating them by "combinatorial" status as required
        // meta pk => value or value list
        const commonValues: any = {};
        // meta pk => list of values or list of value lists
        const combinatorialValues: any = {};
        this.lineProperties.forEach((input: LinePropertyInput): boolean => {
            const validInputCount = input.validInputCount();
            if (!validInputCount) {
                return true; // keep looping
            }
            // do special-case processing of replicate count,
            // which isn't represented by a line metadata type
            if (REPLICATE_NUM_NAME_ID === input.lineProperty.nameEltJsonId) {
                result[REPLICATE_COUNT_JSON_ID] = input.getValueJson();
                return true; // keep looping
            }
            // do special-case processing of multivalued inputs
            // (e.g. strain, carbon source).
            // for now, we'll assume that multiple entries for either
            // results in combinatorial line creation.
            // later on, we may add support for non-combinatorial multiples
            // (e.g. co-culture \ multiple carbon sources)
            const multiValuedInput =
                MULTIVALUED_LINE_META_UUIDS.indexOf(input.lineProperty.metaUUID) >= 0;
            if (multiValuedInput && validInputCount > 1) {
                let value = input.getValueJson();
                if (value.constructor === Array) {
                    for (let v = 0; v < value.length; v++) {
                        value[v] = [value[v]];
                    }
                } else {
                    value = [value];
                }
                combinatorialValues[input.lineProperty.jsonId] = value;
                return true;
            }
            if (input.hasValidCombinations()) {
                combinatorialValues[input.lineProperty.jsonId] = input.getValueJson();
            } else {
                commonValues[input.lineProperty.jsonId] = input.getValueJson();
            }
        });
        result.combinatorial_line_metadata = combinatorialValues;
        result.common_line_metadata = commonValues;
        const iceFolderInput = this.getPropertyInput(
            ICE_FOLDER_JSON_ID,
        ) as IceFolderInput;
        if (iceFolderInput) {
            result.ice_folder_to_filters = iceFolderInput.getFiltersJson();
        }
        return JSON.stringify(result);
    }
}

const creationManager = new CreationManager();

// As soon as the window load signal is sent, call back to the server for the set of reference
// records that will be used to disambiguate labels in imported data.
function onDocumentReady(): void {
    creationManager.buildLineCreationDialog();
    creationManager.buildStep1Inputs();
    creationManager.buildStep2Inputs();
    creationManager.buildStep3Inputs();

    // load line metadata types from the REST API. This allows us to display them more
    // responsively if there are many, and also to show them in the
    loadAllLineMetadataTypes();

    // TODO: uncomment/fix or remove
    // $('#ice-folder-form').validator().on('submit', ()=> {event.preventDefault(); });

    // TODO: after upgrading to Bootstrap 4, uncomment and retry this validation experiment
    // var forms, validation;
    // add custom bootstrap validation styles to the form
    // forms = document.getElementsByClassName('needs-validation');
    // validation = Array.prototype.filter.call(forms, (form) => {
    //     form.addEventListener('submit', function (event) {
    //         if (form.checkValidity() === false) {
    //             event.preventDefault();
    //             event.stopPropagation();
    //         }
    //         form.classList.add('was-validated');
    //     }, false);
    // });

    // send CSRF header on each AJAX request from this page
    $.ajaxSetup({
        "beforeSend": function (xhr) {
            const csrfToken = Utl.EDD.findCSRFToken();
            xhr.setRequestHeader("X-CSRFToken", csrfToken);
        },
    });
}

$(window).on("load", onDocumentReady);
