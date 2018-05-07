/// <reference types="jqueryui" />
import { EDDAuto } from "../modules/EDDAutocomplete"
import { EddRest } from "../modules/EDDRest"
import { Utl } from "../modules/Utl"
import * as $ from "jquery"

declare function require(name: string): any;  // avoiding warnings for require calls below

// as of JQuery UI 1.12, need to require each dependency individually
require('jquery-ui/themes/base/core.css');
require('jquery-ui/themes/base/selectable.css');
require('jquery-ui/themes/base/sortable.css');
require('jquery-ui/themes/base/dialog.css');
require('jquery-ui/themes/base/spinner.css');
require('jquery-ui/themes/base/theme.css');
require('jquery-ui/ui/widgets/selectable');
require('jquery-ui/ui/widgets/sortable');
require('jquery-ui/ui/widgets/dialog');
require('jquery-ui/ui/widgets/spinner');
require('jquery-ui/ui/effects/effect-bounce');

module StudyLinesAddCombos {

    // names of line metadata types that should use an autocomplete to gather user input
    import STRAINS_META_NAME = EddRest.STRAINS_META_NAME;
    export const AUTOCOMPLETE_META_NAMES: string[] = [EddRest.LINE_EXPERIMENTER_META_NAME,
                                                      EddRest.LINE_CONTACT_META_NAME,
                                                      EddRest.CARBON_SOURCE_META_NAME,
                                                      EddRest.STRAINS_META_NAME];

    // names of line metadata types which represent a user and should use the user autocomplete
    export const USER_META_TYPE_NAMES: string[] = [EddRest.LINE_CONTACT_META_NAME,
                                                   EddRest.LINE_EXPERIMENTER_META_NAME];

    // names of line metadata types that support multiple values for a single line
    export const MULTIVALUED_LINE_META_TYPES = [EddRest.STRAINS_META_NAME,
                                                EddRest.CARBON_SOURCE_META_NAME];

    // Metadata types present in the database that should be omitted from user-displayed lists in
    // contexts where separate display is available for line attributes.
    export const LINE_PROPERTY_META_TYPES = [EddRest.LINE_NAME_META_NAME,
        EddRest.LINE_DESCRIPTION_META_NAME, EddRest.LINE_CONTACT_META_NAME,
        EddRest.LINE_EXPERIMENTER_META_NAME, EddRest.STRAINS_META_NAME];

    export interface ErrorSummary {
        category: string,
        summary: string,
        details?: string[],
        resolution?: string
    }

    interface IceFolder {
        id: number,
        url: string,
        name: string,
        entryTypes: string[],
    }

    interface MultiValueInputOptions {
        maxRows?: number,
        minEntries?: number,
    }

    interface LinePropertyInputOptions extends MultiValueInputOptions {
        lineProperty: LinePropertyDescriptor,
        supportsCombinations?: boolean,
    }

    // special case JSON identifier for replicate count, which has no direct association to a line
    // metadata type
    const REPLICATE_COUNT_JSON_ID = 'replicate_count';
    const REPLICATE_NUM_NAME_ID = 'replicate_num';

    const ICE_FOLDER_JSON_ID = 'ice_folder';

    const STRAIN_NAME_ELT_LABEL = 'ICE Entry Name(s)';

    // back-end error messages associated with specific conditions that the UI has to handle
    const NON_STRAINS_ERR_CATEGORY = 'Non-Strains';
    const NON_UNIQUE_NAMES_ERR_CATEGORY = 'Non-unique line names';
    const ICE_ACCESS_ERROR_CATEGORIES = ['ICE part access problem', 'ICE access error'];
    const UNRESOLVABLE_ACCESS_ERR = 'ICE strains are required for combinatorial line creation';

    // back-end parameters used by the UI to configure the line creation process
    const ALLOW_NON_STRAIN_PARTS_PARAM = 'ALLOW_NON_STRAIN_PARTS';
    const IGNORE_ICE_ACCESS_ERRORS_PARAM = 'IGNORE_ICE_ACCESS_ERRORS';
    const EMAIL_WHEN_FINISHED_PARAM = 'EMAIL_WHEN_FINISHED';

    const SCROLL_DURATION_MS = 2000;

    // # of line names displayed per row in the step 3 preview
    const LINES_PER_ROW = 4;

    // max # of line name previews displayed on the page
    const MAX_PREVIEW_LINE_NAMES: number = 51;

    // animation parameters to help users understand when duplicate controls are triggered
    const BOUNCES = 5;
    const BOUNCE_SPEED = 'slow';

    function loadAllLineMetadataTypes():void {
        $('#addPropertyButton').prop('disabled', true);
        EddRest.loadMetadataTypes(
            {
                'success': creationManager.setLineMetaTypes.bind(creationManager),
                'error': showMetaLoadFailed,
                'request_all': true, // get all result pages
                'wait': showMetaWaitMessage,
                'context': EddRest.LINE_METADATA_CONTEXT,
                'ordering': 'type_name',
            });
    }

    function addRetryButton(container: JQuery, retryFunction): JQuery {
        let btn, iconSpan, textSpan;
        btn = $("<button type='button'>")
            .addClass('retry-btn')
            .addClass('btn btn-secondary')
            .on('click', (event:  Event) => {
                $(event.target).prop('disabled', true);
                retryFunction();
            });

        // set button icon in a span, per Bootstrap suggestion
        $('<span>')
            .addClass('glyphicon')
            .addClass('glyphicon-refresh')
            .appendTo(btn)
            .after(' ');

        // set button text
        $('<span>')
            .text('Retry')
            .appendTo(btn);

        btn.appendTo(container);

        return btn;
    }

    function showMetaWaitMessage(): void {
        var div: JQuery;
        div = $('#step1_loading_metadata_status_div').empty();

        $("<span>")
            .text('Loading line metadata types...')
            .addClass('loading-resource-message')
            .appendTo(div);

        $('<span>')
            .addClass('wait waitbadge-new')
            .appendTo(div);
    }

    function showMetaLoadFailed(jqXHR, textStatus:string, errorThrown:string): void {
        var div: JQuery, span, button;
        div = $('#step1_loading_metadata_status_div')
            .empty();

        span = $("<span>")
            .text('Unable to load line metadata from EDD. Property selection is disabled.')
            .addClass('alert alertDanger')
            .appendTo(div);

        addRetryButton(span, loadAllLineMetadataTypes);
    }

    class NameElement {
        nameEltLabel: string;
        nameEltGuiId: number;
        nameEltJsonId: any; // string for special-cases, integer pk for metadata

        // used to generate a unique ID for each naming element used within the UI. This lets us
        // easily distinguish custom user additions, which have no representation in the database,
        // from line metadata types which do. No need to worry about naming overlaps, etc.
        static nameElementCounter: number = 0;

        static strainNameGuiId = -1;

        constructor(label:string, nameEltJsonId:any) {
            this.nameEltLabel = label;
            this.nameEltJsonId = nameEltJsonId;

            // prevent duplicate GUI IDs from being generated for strains, which can originate with
            // with either an ICE folder or a direct entry...otherwise name elts from each can
            // interfere with the other
            if(nameEltJsonId == creationManager.strainNameEltJsonId) {
                if(NameElement.strainNameGuiId < 0) {
                    NameElement.strainNameGuiId = ++NameElement.nameElementCounter;
                }
                this.nameEltGuiId = NameElement.strainNameGuiId;
            } else {
                this.nameEltGuiId = ++NameElement.nameElementCounter;
            }
        }
    }

    class LinePropertyDescriptor extends NameElement {
        jsonId: any; // integer pk for line metadata, string for special cases (e.g.
                     // replicates, ICE collections)
        inputLabel: string;

        constructor(jsonId, inputLabel:string, nameEltLabel:string =null,
                    nameEltJsonId:any =null) {
            super(nameEltLabel || inputLabel, nameEltJsonId || jsonId);
            this.jsonId = jsonId;
            this.inputLabel = inputLabel;
        }

        toString(): string {
            return '(' + this.jsonId.toString() + ', ' + this.inputLabel + ')';
        }
    }

    class CustomNameElement extends NameElement {

        constructor() {
            super('', null);
            this.nameEltJsonId = '_custom_' + this.nameEltGuiId;
        }

        toString(): string {
            return '(' + this.nameEltJsonId + ', ' + this.nameEltLabel + ')';
        }
    }

    class ErrSummary {
        iceAccessErrors: boolean;
        nonStrainErrors: boolean;
        nonUniqueLineNames: boolean;

        constructor(iceAccessErrors: boolean, nonStrainErrors: boolean,
                    nonUniqueLineNames: boolean) {
            this.iceAccessErrors = iceAccessErrors;
            this.nonStrainErrors = nonStrainErrors;
            this.nonUniqueLineNames = nonUniqueLineNames;
        }
    }

    export class MultiValueInput {
        uiLabel: JQuery;
        maxRows: number;
        minEntries: number;

        rows: JQuery[] = [];
        addButton: JQuery;

        constructor(label:string, options:MultiValueInputOptions) {

            this.uiLabel = $('<label>')
                .text(label)
                .addClass('not-in-use');

            this.maxRows = options.maxRows === undefined ? 30 : options.maxRows;
            this.minEntries = options['minEntries'] || 0;
        }

        hasValidInput(rowIndex: number ): boolean {
            return this.rows[rowIndex].find('input').first().val().trim() != '';
        }

        validInputCount(): number {
            var count: number = 0;
            for(var i=0; i<this.rows.length; i++) {
                if(this.hasValidInput(i)) {
                    count++;
                }
            }
            return count;
        }

        highlightRowLabel(anyValidInput:boolean): void {
            this.rows[0].find('label')
                .first()
                .toggleClass('in-use', anyValidInput)
                .toggleClass('not-in-use', !anyValidInput);
        }

        getLabel(): JQuery {
            return this.uiLabel;
        }


        buildRemoveBtn(container: JQuery): JQuery {
            var btn: JQuery, rowIndex:number, t:any;
            // add a delete button in the same cell as the input controls

            if (this.getRowCount() > this.minEntries) {
                rowIndex = this.getRowCount() -1;
                btn = $('<button>')
                    .addClass('removeButton')
                    .appendTo(container);
                $('<span>')
                    .addClass('ui-icon')
                    .addClass('ui-icon-trash')
                    .appendTo(btn);
                this.registerRemoveRowEvtHandler(btn, rowIndex);
                return btn;
            }
            return null;
        }

        registerRemoveRowEvtHandler(removeButton, rowIndex) {
            // empty method body for children to override
            // TODO: inspect implementations....appears inconsistent use WRT postremovecallback
        }

        buildAddBtn(container: JQuery) {
            // only add the control to the first row
            if ((this.getRowCount() == 1) && (this.getRowCount() < this.maxRows)) {
                this.addButton = $('<button>')
                    .addClass('addButton')
                    .on('click', this.appendRow.bind(this))
                    .appendTo(container);

                $('<span>').addClass('ui-icon')
                    .addClass('ui-icon-plus').appendTo(this.addButton);
            }
        }

        canAddRows(): boolean {
            return this.getRowCount() < this.maxRows;
        }

        getRowCount(): number {
             return this.rows.length;
        }

        appendRow(initialInput?: any): void {
            var newRow: JQuery, parent: JQuery, atMax: boolean, prevRow: JQuery;
            prevRow = this.rows[this.rows.length-1];

            newRow = $('<div>')
                .addClass('table-row')
                .insertAfter(prevRow);
            this.fillRowControls(newRow, initialInput);

            this.updateInputState();
        }

        promoteRowContent(firstRow: JQuery, nextRow: JQuery) {
            var inputCell: JQuery;
            // remove only the input cell content from this row, leaving labeling and controls
            // in place
            inputCell = firstRow.children('.inputCell').empty();

            // detach and relocate input cell content from the following row, moving it up
            nextRow.children('.inputCell').children().each(function(index:number, element: Element)
            {
                $(element).detach().appendTo(inputCell);
            });
        }

        removeRow(rowIndex: number): void {
            var row: JQuery, hadValidInput: boolean, nextRow: JQuery;

            hadValidInput = this.hasValidInput(rowIndex);
            row = this.rows[rowIndex];

            // if removing the title row, relocate inputs from the second row to the first, then
            // remove the second row
            if(rowIndex == 0 && this.rows.length > 1) {
                nextRow = this.rows[rowIndex+1];
                this.promoteRowContent(row, nextRow);

                // remove the now-empty second row whose inputs were moved up to first
                nextRow.remove();
                this.rows.splice(rowIndex+1, 1);
            }
            // if removing a row other than the first / title row, just remove everything
            else {
                row.remove();
                this.rows.splice(rowIndex, 1);
            }

            // update event handlers for subsequent rows to get the correct index number following
            // the removal of a preceding row
            for(var i=rowIndex; i < this.rows.length; i++) {
                var removeBtn: JQuery;
                row = this.rows[i];
                removeBtn = row.find('.removeButton').first();
                this.registerRemoveRowEvtHandler(removeBtn, i);
            }

            if(this.getRowCount() == 0) {
                this.removeFromForm();
            }

            // if the removed row had valid user input, recompute results
            if(this.rows.length) {
                this.updateInputState();
            }
            if(hadValidInput) {
                this.postRemoveCallback(rowIndex, hadValidInput);
            }
        }

        removeFromForm() {
            // empty default implementation for children to override.
            // this method should ONLY remove the controls from the DOM...handling
            // subsequent updates to the rest of the form should be done in postRemoveCallBack
        }

        postRemoveCallback(rowIndex: number, hadValidInput:boolean):void {
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

    export class LinePropertyInput extends MultiValueInput {
         lineProperty: LinePropertyDescriptor;
         supportsCombinations: boolean;

         constructor(options: LinePropertyInputOptions) {
             super(options.lineProperty.inputLabel + ':', options);
             this.lineProperty = options.lineProperty;
             if (!this.lineProperty) {
                throw Error('lineProperty is required');
             }
             this.supportsCombinations = options.supportsCombinations === undefined ?
                true: options.supportsCombinations;
         }

         updateInputState() {
             if(this.addButton) {
                 this.addButton.prop('disabled', !this.canAddRows());
             }
             this.highlightRowLabel(this.validInputCount() > 0);
             this.autoUpdateCombinations();
         }

        getNameElements(): LinePropertyDescriptor[] {
             var validInputCount:number = this.validInputCount(), hasInput:boolean;
             hasInput = validInputCount > 0;

            // only allow naming inputs to be used if there's at least one valid value to insert
            // into line names. note that allowing non-unique values to be used in line names
            // during bulk creation can be helpful since they may differentiate new lines from
            // those already in the study.
            if(!hasInput) {
                return [];
            }

            return [this.lineProperty];
        }

        getInput(rowIndex: number): any {
            return this.rows[rowIndex].find('input').first().val().trim();
        }

        buildYesComboButton(): JQuery {
            return $('<input type="radio">')
                .prop('name', this.lineProperty.jsonId)
                .val('Yes')
                .addClass('property_radio');
        }

        buildNoComboButton(): JQuery {
            return $('<input type="radio">')
                .prop('name', this.lineProperty.jsonId)
                .prop('checked', true)
                .val('No')
                .addClass('property_radio');
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
            // for starters, assume multiple inputs (e.g. even for potentially
            // multivalued) inputs should result in creation of a combinatorial group of lines.
            // later on we can add complexity, e.g. to support co-culture.
            let nValidInputs: number = this.validInputCount();
            if(nValidInputs > 1) {
                return true;
            } else if(nValidInputs == 0) {
                return false;
            }

            if(EddRest.STRAINS_META_NAME == this.lineProperty.inputLabel) {
                // do special-case processing for single-entry strains so they show as
                // combinatorial if an ICE folder is also specified

                let iceFolderInput = creationManager.getPropertyInput(ICE_FOLDER_JSON_ID);
                if(iceFolderInput && iceFolderInput.hasValidCombinations()) {
                    return true;
                }
            }
            return false;
        }

        /**
         * Auto-updates display indicators for this input to show whether they're *intended* as
         * common or combinatorial input. Note that this means, for example:
         * A) When a new, empty row is added, the indicator will flip to show the intended effect
         *    of adding a valid entry in the row.
         * B) If the newly-added row remains unfilled, the indicator will may not match the way the
         * value is actually treated
         */
        autoUpdateCombinations() {
            var comboInputIntended: boolean, aggregateComboIntended, nameInputRequired: boolean,
                combosButton:JQuery, noCombosButton:JQuery, namingElt:JQuery,
                supportsMultivalue: boolean, isIceFolder: boolean, isStrains: boolean;

            noCombosButton = this.rows[0].find('input:radio[value=No]');
            namingElt = $('#'+this.lineProperty.nameEltGuiId);

            if(this.supportsCombinations) {
                // note: not all inputs will have a "make combos" button  -- need enclosing check
                combosButton = this.rows[0].find('input:radio[value=Yes]');
                // for the moment, just disable both buttons and treat them as indicators rather
                // than user inputs
                combosButton.prop('disabled', true);
            }

            //TODO: make use of this to enable user to toggle "apply all/make combos" radio
            // buttons! With a manageable amt of additional UI, that should enable multivalued
            // combinations...e.g. strain groups.
            supportsMultivalue = creationManager.multivaluedMetaTypePks.indexOf(
                                                 this.lineProperty.jsonId) >= 0;

            // update the state of the radio buttons to reflect whether valid inputs will result
            // in combinatorial line creation...inputs may not be provided yet, but best to give
            // feedback right away re: intention when a new row is added
            isIceFolder = this.lineProperty.jsonId == ICE_FOLDER_JSON_ID;
            isStrains = this.lineProperty.inputLabel == STRAINS_META_NAME;
            aggregateComboIntended = (isIceFolder ||
                (isStrains && creationManager.getPropertyInput(ICE_FOLDER_JSON_ID)));
            comboInputIntended = this.hasMultipleInputs() || aggregateComboIntended;

            let wasChecked: boolean, btn: JQuery;
            if(comboInputIntended) {
                wasChecked = combosButton.prop('checked');
                combosButton.prop('checked', true);
                btn = combosButton;
            }
            else {
                wasChecked = noCombosButton.prop('checked');
                noCombosButton.prop('checked', true);
                btn = noCombosButton;
            }

            // if the selection is auto-updated, animate the newly selected button to call
            // the user's attention to it
            if(!wasChecked) {
                btn.effect('bounce',
                    {
                        times: BOUNCES,
                    }, BOUNCE_SPEED);
            }

            noCombosButton.prop('disabled', true);

            // update step 2 naming elements for this line property... if valid values are provided
            // for combinatorial input, style the step 2 naming element to reflect that its
            // required to produce unique line names
            if(this.lineProperty.jsonId === REPLICATE_COUNT_JSON_ID) {
                // do special-case processing for replicate count input...though it's displayed
                // in step 1 as "apply to all lines", if > 1, then it's "combinatorial" from the
                // standpoint that replicate # is required input to computing unique line names
                namingElt.toggleClass('required-name-elt', this.getInput(0) > 1);
                return;
            }

            nameInputRequired = this.hasValidCombinations();
            namingElt.toggleClass('required-name-elt', nameInputRequired);
            noCombosButton.attr('disabled', String(nameInputRequired || this.supportsCombinations));
        }

        getValueJson(): any {
            var values: string[] = [];
            this.rows.forEach((currentValue, index, arr) => {
                if(this.hasValidInput(index)) {
                    values.push(this.getInput(index));
                }
            });

            // if there's only one valid value, don't package it in an array, unless there's
            // some special reason to treat a single value as combinatorial (e.g. a single strain
            // when an ICE folder is also present).
            if(values.length == 1 && !this.hasValidCombinations()) {
                return values[0];
            }
            return values;
        }

        fillRowControls(row: JQuery, initialValue?: any):void {
            var firstRow: boolean, row: JQuery, inputCell: JQuery, addCell: JQuery,
                applyAllCell: JQuery, makeComboCell: JQuery, labelCell: JQuery,
                noComboButton: JQuery, yesComboButton: JQuery, flewGrowWrapper: JQuery;

            this.rows.push(row);

            addCell = $('<div>')
                .addClass('bulk_lines_table_cell')
                .addClass('addCell')
                .appendTo(row);

            labelCell = $('<div>')
                .addClass('bulk_lines_table_cell')
                .appendTo(row);

            firstRow = this.getRowCount() == 1;
            if(firstRow) {
                this.buildAddBtn(addCell);
                this.getLabel()
                    .appendTo(labelCell);
            }

            inputCell = $('<div>')
                .addClass('bulk_lines_table_cell')
                .addClass('inputCell')
                .appendTo(row);

            flewGrowWrapper = $('<div>').addClass('inputContent').appendTo(inputCell);

            this.fillInputControls(flewGrowWrapper, initialValue);

            applyAllCell = $('<div>')
                .addClass('bulk_lines_table_cell')
                .addClass('centered_radio_btn_parent')
                .appendTo(row);

            if(firstRow) {
                noComboButton = this.buildNoComboButton().appendTo(applyAllCell);
            }

            makeComboCell = $('<div>')
                .addClass('bulk_lines_table_cell')
                .addClass('centered_radio_btn_parent')
                .appendTo(row);

            if(firstRow && this.supportsCombinations) {
                yesComboButton = this.buildYesComboButton()
                    .appendTo(makeComboCell);
                noComboButton.prop('checked', true);
            }
            this.updateInputState();
        }

        fillInputControls(inputCell: JQuery, initialValue?:any): void {
             // by default, just fill in a single text box.  child classes may override with
            // alternate user inputs
            var self: LinePropertyInput = this;

            $('<input type="text">')
                .addClass('columnar-text-input')
                .on('change', function () {
                    self.updateInputState();
                    creationManager.updateNameEltChoices(false);
                })
                .appendTo(inputCell);

            this.buildRemoveBtn(inputCell);
        }

        registerRemoveRowEvtHandler(removeButton, rowIndex) {
            removeButton.off('click');

            removeButton.on('click', null, {'rowIndex': rowIndex, 'propertyInput': this},
                        (ev: JQueryMouseEventObject) => {
                        var rowIndex: number, propertyInput:LinePropertyInput;

                        rowIndex = ev.data.rowIndex;
                        propertyInput = ev.data.propertyInput;
                        propertyInput.removeRow(rowIndex);
                    });
        }

        postRemoveCallback(rowIndex: number, hadValidInput:boolean):void {
            if(hadValidInput) {
                creationManager.updateNameEltChoices(hadValidInput);
            }
        }

        removeFromForm() {
            creationManager.removeLineProperty(this.lineProperty);
        }
    }

    export class CustomElementInput extends MultiValueInput {
        element: CustomNameElement;

        constructor() {
            super('', {
                maxRows: 1,
            });
            this.element = new CustomNameElement();
        }

        getNamingElement() {
            if(this.hasValidInput(0)) { //TODO: hard-coded index won't work for combo
                return this.element;
            }
            return null;
        }

        hasValidInput(rowIndex: number): boolean {
            var match:any, abbrev:any;

            match = this.rows[0].find('.custom-name-input').val();
            abbrev = this.rows[rowIndex].find('.custom-val-input').val();

            return (match != undefined) && match.toString().trim() &&
                   (abbrev != undefined) && abbrev.toString().trim();
        }

        getValueJson(): any {
            var values: any = {}, self:CustomElementInput = this;

            if(!this.rows.length) {
                return null;
            }

            this.rows.forEach((currentValue, rowIndex, arr) => {
                var staticText: any;
                if(this.hasValidInput(rowIndex)) {
                    staticText = this.rows[rowIndex].find('.custom-val-input').val();
                    values[self.element.nameEltJsonId] = staticText;
                }
            });
            return values;
        }

        fillRowControls(row: JQuery, initialValue?: any):void {
            var row: JQuery, valCell: JQuery, nameCell: JQuery,
                self: CustomElementInput, rowIndex: number;
            self = this;

            rowIndex = this.rows.length;
            this.rows.push(row);

            // TODO: consider what happens when user deletes all the text!
            this.addCustomNameInput(row, 'custom-name-cell', 'custom-name-input')
                .children('.custom-name-input')
                .on('change', null, {'rowIndex': rowIndex, 'elementInput': this},
                    (ev:JQueryMouseEventObject) => {
                        var rowIndex: number, elementInput: CustomElementInput,
                            hadValidInput:boolean, hasValidInput: boolean;

                        elementInput = ev.data.elementInput;
                        rowIndex = ev.data.rowIndex;

                        // update internal state to reflect user input
                        self.element.nameEltLabel = self.rows[0].find('.custom-name-input').val();

                        // update labeling for list item in the 'name element order' subsection
                        $('#name_elt' +self.element.nameEltGuiId).text(self.element.nameEltLabel);

                        creationManager.updateNameEltChoices(true);
                });
            valCell = this.addCustomNameInput(row, 'custom-val-cell', 'custom-val-input')
                .on('change', null, {'rowIndex': rowIndex, 'elementInput': this},
                    (ev:JQueryMouseEventObject) => {
                        // TODO: cache previous hasValidInput() state and use here to avoid extra
                        // processing / back end requests
                        creationManager.updateNameEltChoices(true);
                });

            this.buildRemoveBtn(valCell);
            this.updateInputState();
        }

        promoteRowContent(firstRow: JQuery, nextRow: JQuery) {
            var firstRowCell: JQuery;
            // remove only the input cell content from this row, leaving labeling and controls
            // in place
            firstRowCell = firstRow.children('.custom-name-cell').empty();

            // detach and relocate input cell content from the following row, moving it up
            nextRow.children('.custom-val-cell').each(function(index:number, element: Element)
            {
                $(element).detach().appendTo(firstRowCell);
            });

            firstRowCell = firstRow.children('.custom-name-cell').empty();
            // detach and relocate input cell content from the following row, moving it up
            nextRow.children('.custom-val-cell').each(function(index:number, element: Element)
            {
                $(element).detach().appendTo(firstRowCell);
            });
        }

        addCustomNameInput(row: JQuery, cellClassName: string, inputClassName: string): JQuery {
            var cell: JQuery, self: CustomElementInput;
            self = this;
            cell = $('<div>')
                .addClass(cellClassName)
                .addClass('columnar-text-input')
                .addClass('bulk_lines_table_cell')
                .addClass('inputCell')
                .appendTo(row);

            $('<input type="text">')
                .addClass(inputClassName)
                .on('change', function() {
                    self.updateInputState();
                    //TODO: implement!!
                    //creationManager.updateCustomNamingElements();
                })
                .appendTo(cell);

            return cell;
        }

        registerRemoveRowEvtHandler(removeButton, rowIndex) {
            removeButton.off('click');

            removeButton.on('click', null, {'rowIndex': rowIndex, 'customInput': this},
                        (ev: JQueryMouseEventObject) => {
                var rowIndex: number, customEltInput:CustomElementInput;

                rowIndex = ev.data.rowIndex;
                customEltInput = ev.data.customInput;

                customEltInput.removeRow(rowIndex);
            });
        }

        postRemoveCallback(): void {
            creationManager.updateNameEltChoices(true);
        }

        removeFromForm() {
            creationManager.removeCustomElt(this.element.nameEltGuiId);
        }
    }

    export class AbbreviationInput extends LinePropertyInput {

        constructor(options:LinePropertyInputOptions) {
            super(options);

            // override default labeling from the parent
            this.uiLabel = $('<label>')
                .text(this.lineProperty.nameEltLabel + ':')
                .addClass('not-in-use');
        }

        hasValidInput(rowIndex: number): boolean {
            var match:any, abbrev:any;

            match = this.rows[rowIndex].find('.abbrev-match-input').val();
            abbrev = this.rows[rowIndex].find('.abbrev-val-input').val();

            return (match != undefined) && match.toString().trim() &&
                   (abbrev != undefined) && abbrev.toString().trim();
        }

        removeFromForm() {
            creationManager.removeAbbrev(this.lineProperty);
        }

        postRemoveCallback(rowIndex: number, hadValidInput:boolean) {
            creationManager.updateHasCustomNameElts();
            if(hadValidInput) {
                creationManager.queuePreviewUpdate();
            }
        }

        getValueJson(): any {
            var values: any = {}, self:AbbreviationInput = this;

            if(!this.rows.length) {
                return null;
            }

            this.rows.forEach((currentValue, rowIndex, arr) => {
                var match: any, abbrev: any;
                if(this.hasValidInput(rowIndex)) {
                    match = this.rows[rowIndex].find('.abbrev-match-input').val();
                    abbrev = this.rows[rowIndex].find('.abbrev-val-input').val();
                    values[match] = abbrev;
                }
            });
            return values;
        }

        fillRowControls(row: JQuery, initialValue?: any):void {
            var firstRow: boolean, row: JQuery, valCell: JQuery, addCell: JQuery,
                abbrevCell: JQuery, labelCell: JQuery, self: AbbreviationInput;
            self = this;

            this.rows.push(row);

            addCell = $('<div>')
                .addClass('bulk_lines_table_cell')
                .addClass('addCell')
                .appendTo(row);

            labelCell = $('<div>')
                .addClass('bulk_lines_table_cell')
                .appendTo(row);

            firstRow = this.getRowCount() == 1;
            if(firstRow) {
                this.buildAddBtn(addCell);
                this.getLabel()
                    .appendTo(labelCell);
            }

            this.addAbbrevInput(row, 'abbrev-match-cell', 'abbrev-match-input');
            valCell = this.addAbbrevInput(row, 'abbrev-val-cell', 'abbrev-val-input');

            this.buildRemoveBtn(valCell);
            this.updateInputState();
        }

        promoteRowContent(firstRow: JQuery, nextRow: JQuery) {
            var firstRowCell: JQuery;
            // remove only the input cell content from this row, leaving labeling and controls
            // in place
            firstRowCell = firstRow.children('.abbrev-match-cell').empty();

            // detach and relocate input cell content from the following row, moving it up
            nextRow.children('.abbrev-match-cell').each(function(index:number, element: Element)
            {
                $(element).detach().appendTo(firstRowCell);
            });

            firstRowCell = firstRow.children('.abbrev-val-cell').empty();
            // detach and relocate input cell content from the following row, moving it up
            nextRow.children('.abbrev-val-cell').each(function(index:number, element: Element)
            {
                $(element).detach().appendTo(firstRowCell);
            });
        }

        addAbbrevInput(row: JQuery, cellClassName: string, inputClassName: string): JQuery {
            var cell: JQuery, self: AbbreviationInput;
            self = this;
            cell = $('<div>')
                .addClass(cellClassName)
                .addClass('columnar-text-input')
                .addClass('bulk_lines_table_cell')
                .addClass('inputCell')
                .appendTo(row);

            $('<input type="text">')
                .addClass(inputClassName)
                .on('change', function() {
                    self.updateInputState();
                    //TODO: test for input validity or validity change first!
                    creationManager.queuePreviewUpdate();
                })
                .appendTo(cell);

            return cell;
        }

        registerRemoveRowEvtHandler(removeButton, rowIndex) {
            removeButton.off('click');

            removeButton.on('click', null, {'rowIndex': rowIndex, 'abbrevInput': this},
                        (ev: JQueryMouseEventObject) => {
                var rowIndex: number, abbrevInput:AbbreviationInput;

                rowIndex = ev.data.rowIndex;
                abbrevInput = ev.data.abbrevInput;
                abbrevInput.removeRow(rowIndex);
            });
        }
    }

    export class LinePropertyAutoInput extends LinePropertyInput {

        autoInput: EDDAuto.BaseAuto;

        constructor(options: LinePropertyInputOptions) {
            super(options);
        }

        // build custom input controls whose type depends on the data type of the Line attribute
        // they configure
        fillInputControls(inputCell: JQuery): void {
            var visible: JQuery, hidden: JQuery, self: LinePropertyAutoInput;
            self = this;

            visible = $('<input type="text" autocomplete="off">')
                .addClass('columnar-text-input')
                .addClass('autocomp')
                .addClass('autocomp_search')
                //.addClass('form-control')
                .addClass('ui-autocomplete-input');
            hidden = $('<input type="hidden">')
                .addClass('step2-value-input');

            hidden.on('change', function() {
                self.updateInputState();
                creationManager.updateNameEltChoices(true);
            });

            inputCell.append(visible)
                .append(hidden);

            if(creationManager.userMetaTypePks.indexOf(this.lineProperty.jsonId) >= 0) {
                visible.attr('eddautocompletetype', "User");
                this.autoInput = new EDDAuto.User({
                    'container': inputCell,
                    'visibleInput': visible,
                    'hiddenInput': hidden,
                });
            }
            else if(EddRest.CARBON_SOURCE_META_NAME === this.lineProperty.inputLabel) {
                visible.attr('eddautocompletetype', "CarbonSource");
                this.autoInput = new EDDAuto.CarbonSource({
                    'container': inputCell,
                    'visibleInput': visible,
                    'hiddenInput': hidden,
                });
            }
            else if(EddRest.STRAINS_META_NAME === this.lineProperty.inputLabel) {
                visible.attr('eddautocompletetype', "Registry");
                this.autoInput = new EDDAuto.Registry({
                    'container': inputCell,
                    'visibleInput': visible,
                    'hiddenInput': hidden,
                });
            }
            this.buildRemoveBtn(inputCell);
        }

        getInput(rowIndex: number): any {
            var stringVal: string;
            stringVal = this.rows[rowIndex].find('input[type=hidden]').first().val();

            if(this.lineProperty.inputLabel == EddRest.STRAINS_META_NAME) {
                // strain autocomplete uses UUID
                return stringVal;
            }
            // non-strain autocompletes use integer pk's
            return parseInt(stringVal);
        }
    }

    export class BooleanInput extends LinePropertyInput {
        yesCheckbox: JQuery;
        noCheckbox: JQuery;

        constructor(options:LinePropertyInputOptions) {
            super(options);
        }

        fillInputControls(rowContainer: JQuery): void {
            var self: BooleanInput = this, removeBtn: JQuery, buttonsDiv: JQuery;
            buttonsDiv = $('<div>')
                .addClass('columnar-text-input')  //TODO: rename class for this new use
                .appendTo(rowContainer);

            this.yesCheckbox = $('<input type="checkbox">')
                .on('change', function() {
                    self.updateInputState();
                    creationManager.updateNameEltChoices(true);
                })
                .appendTo(buttonsDiv);
            $('<label>')
                .text('Yes')
                .appendTo(buttonsDiv);
            this.noCheckbox = $('<input type="checkbox">')
                .addClass('noCheckBox')
                .on('change', function() {
                    self.updateInputState();
                    creationManager.updateNameEltChoices(true);
                })
                .appendTo(buttonsDiv);
            $('<label>')
                .text('No')
                .appendTo(buttonsDiv);
            removeBtn = this.buildRemoveBtn(rowContainer);
            removeBtn.addClass('controlRemoveBtn');
        }

        hasMultipleInputs(): boolean {
            return this.yesCheckbox.prop('checked') &&
                   this.noCheckbox.prop('checked');
        }

        hasValidInput(rowIndex: number) {
            return this.yesCheckbox.prop('checked')
                || this.noCheckbox.prop('checked');
        }

        getValueJson(): any {
            return this.getInput(0);
        }

        getInput(rowIndex: number): any {
            var values = [];
            if(this.yesCheckbox.prop('checked')) {
                values.push(true);
            }
            if(this.noCheckbox.prop('checked')) {
                values.push(false);
            }
            if(values.length === 1) {
                return values[0];
            }
            return values;
        }
    }

    export class NumberInput extends LinePropertyInput {
        constructor(options:LinePropertyInputOptions) {
            options.maxRows = 1;
            options.supportsCombinations = false;
            super(options);
        }

        fillInputControls(inputCell: JQuery): void {
            // overrides the default behavior of providing a simple text input, instead creating
            // a numeric spinner for controling combinatorial replicate creation
            let spinner: JQuery, self: NumberInput;
            self = this;

            // add spinner to the DOM first so spinner() function will work
            spinner = $('<input id="replicate_spinner">');
            spinner.addClass('columnar-text-input')
                   .addClass('step2-value-input')
                    .appendTo(inputCell);

            // add spinner styling
            spinner.spinner({
                        min: 1,
                            change: function(event, ui) {
                                self.updateInputState();
                                creationManager.updateNameEltChoices(true);
                            }})
                    .val(1);

            this.buildRemoveBtn(inputCell);
        }

        getInput(rowIndex: number): any {
            var textInput = super.getInput(rowIndex);
            return +textInput;
        }
    }

    export class IceFolderInput extends LinePropertyInput {

        constructor(options:LinePropertyInputOptions) {
            super(options);
            this.supportsCombinations = true;
        }

        hasValidInput(rowIndex: number):boolean {
            // inputs are pre-checked when provided in a popup dialog.  Invalid input impossible.
            return true;
        }

        hasValidCombinations(): boolean {
            // any valid folder input should result in combinatorial line creation
            return !!this.validInputCount();
        }

        // overrides behavior in the parent class, whose default is to automatically add a row each
        // time the button is clicked.  In this case, we want to launch a dialog and force the user
        // to choose input first, then the row added to the form will be read-only feedback of
        // user selections made in the dialog.
        buildAddBtn(container: JQuery) {
            var self = this;
            // only add the control to the first row
            if ((this.getRowCount() == 1) && (this.getRowCount() < this.maxRows)) {
                this.addButton = $('<button>')
                    .addClass('addButton')
                    .on('click', () => {self.appendRow();})
                    .appendTo(container);

                $('<span>').addClass('ui-icon')
                    .addClass('ui-icon-plus').appendTo(this.addButton);
            }
        }

        fillInputControls(inputCell: JQuery, folder: IceFolder): void {
            var filtersDiv: JQuery;

            this.rows[this.rows.length-1].data(folder);
            $('<a>')
                .prop('href', folder.url)
                .prop('target', '_blank')
                .text(folder.name)
                .addClass('ice-folder-name')
                .appendTo(inputCell);

            filtersDiv = $('<div>')
                .addClass('ice-folder-filters-div')
                .appendTo(inputCell);

            folder.entryTypes.forEach(entryType => {
                $('<span>')
                    .text(entryType.toLowerCase())
                    .addClass('badge badge-default entry-filter-value')
                    .appendTo(filtersDiv)
            });

            this.buildRemoveBtn(inputCell);
        }

        /**
         * Overrides the superclass to prompt the user with a dialog, requiring validated
         * input before inserting a read-only row into the main form.
         */
        appendRow(initialInput?: IceFolder): void {

            if(!initialInput) {
                creationManager.showIceFolderDialog();
                return;
            }
            var newRow: JQuery, parent: JQuery, atMax: boolean, prevRow: JQuery;

            prevRow = this.rows[this.rows.length-1];

            newRow = $('<div>')
                .addClass('table-row')
                .insertAfter(prevRow);
            this.fillRowControls(newRow, initialInput);

            this.updateInputState();

            // unlike other inputs, addition of a row to the main form indicates a new, valid
            // user input. force an update to the preview
            creationManager.updateNameEltChoices(true);
        }

        getValueJson(): any {
            var folders: number[] = [];
            this.rows.forEach(row => {
                let folder = <IceFolder> row.data();
                folders.push(folder.id);
            });
            return folders;
        }

        getFiltersJson(): any {
            var filters = {};
            this.rows.forEach(row => {
                let folder = <IceFolder> row.data();
                filters[folder.id] = folder.entryTypes;
            });
            return filters;
        }

        getInput(rowIndex: number): any {
            var textInput = super.getInput(rowIndex);
            return +textInput;
        }

        autoUpdateCombinations() {
            var hasMultipleInputs: boolean, hasComboValues: boolean, combosButton:JQuery,
                noCombosButton:JQuery, namingElt:JQuery, supportsMultivalue: boolean;

            // get references to the buttons used to indicate whether this ICE folder results
            // in combinatorial line creation.
            noCombosButton = this.rows[0].find('input:radio[value=No]');
            combosButton = this.rows[0].find('input:radio[value=Yes]');

            // Note: this control depends on guarantee that the controller will create the same
            // GUI id for strain name, regardless of whether it origiated w/ an ICE folder or
            // direct strain entry
            namingElt = $('#'+this.lineProperty.nameEltGuiId);
            namingElt.toggleClass('required-name-elt', hasComboValues);

            // Set static state associated with this input.  Though other inputs may eventually
            // allow users to choose whether to treat inputs as multivalued or combinatorial,
            // the existence of an ICE folder in the form requires that combinatorial line
            // creation be performed
            combosButton.attr('checked', 'checked');
            combosButton.prop('disabled', true);
            noCombosButton.prop('disabled', true);
        }
    }

    export class CreationManager {
        // line metadata type info that drives the whole UI
        allLineMetaTypes: any = {};
        nonAutocompleteLineMetaTypes: any[] = [];
        autocompleteLineMetaTypes: any = {};
        userMetaTypePks: number[];
        multivaluedMetaTypePks: number[] = [];
        strainMetaPk: number = -1;
        strainNameEltJsonId: string = null;

        // step 1 : line property inputs (one per line property, regardless of row count)
        lineProperties:LinePropertyInput[] = [];

        // step 2 state
        abbreviations: AbbreviationInput[] = [];
        customNameAdditions: CustomElementInput[] = [];

        // user-selected name elements from step 2, refreshed shortly *after* user input
        lineNameElements:any[] = [];

        previewUpdateTimerID:number = null;

        // step 3 state
        plannedLineCount = 0;

        constructor() {
        }

        // Start a timer to wait before calling updating the line name preview, which requires
        // an AJAX call to the back end
        queuePreviewUpdate(): void {
            if (this.previewUpdateTimerID) {
                clearTimeout(this.previewUpdateTimerID);
            }
            this.previewUpdateTimerID = setTimeout(this.updatePreview.bind(this), 500);  //TODO:
            // 250 in import
        }

        /*
         * Adds an empty input into the form.  Most form elements are added this way, with the
         * exception of ICE folders, which must first have a valid value in order to be added to
         * the form.
        */
        addEmptyInput(lineProperty: LinePropertyDescriptor): void {
            var newInput: LinePropertyInput, autocompleteMetaItem:any;

            autocompleteMetaItem = this.autocompleteLineMetaTypes[lineProperty.jsonId];
            if(autocompleteMetaItem) {
                newInput = new LinePropertyAutoInput({'lineProperty': lineProperty});
            }
            else if(EddRest.CONTROL_META_NAME == lineProperty.inputLabel) {
                newInput = new BooleanInput({'lineProperty': lineProperty, 'maxRows': 1});
            }
            else if(REPLICATE_COUNT_JSON_ID == lineProperty.jsonId) {
                newInput = new NumberInput({'lineProperty': lineProperty});
            }
            else {
                newInput = new LinePropertyInput({'lineProperty': lineProperty});
            }

            this.addLineProperty(newInput);
        }

        removeLineProperty(lineProperty: LinePropertyDescriptor): void {
            var foundIndex = -1, propertyInput: LinePropertyInput;
            this.lineProperties.forEach(function(property, index:number) {
                if(property.lineProperty.jsonId === lineProperty.jsonId) {
                    foundIndex = index;
                    return false;  //stop looping
                }
            });

            // remove the property from our tracking and from the DOM
            if(foundIndex >= 0) {
                propertyInput = this.lineProperties[foundIndex];
                this.lineProperties.splice(foundIndex, 1);
                $('#line-properties-table')
                    .children('.line_attr_' + lineProperty.jsonId)
                    .remove();

                this.updateLinkedStrainInputs(propertyInput, false);
            }

            // restore user's ability to choose this option via the "add property" dialog
            $('#lineProp' + lineProperty.jsonId).removeClass('hide');

            //TODO: optimize by detecting whether the remaining row was non-blank...this always
            // forces a preview update, which is sometimes unnecessary
            this.updateNameEltChoices(true);
        }

        removeAbbrev(lineProperty: LinePropertyDescriptor): void {
            var foundIndex = -1, abbrevInput: AbbreviationInput;
            this.abbreviations.forEach(function(abbrev, index:number) {
                if(abbrev.lineProperty.jsonId === lineProperty.jsonId) {
                    foundIndex = index;
                    abbrevInput = abbrev;
                    return false;  //stop looping
                }
            });

            // remove the abbreviation from our tracking and from the DOM
            this.abbreviations.splice(foundIndex, 1);
            $('#abbreviations-table')
                .children('.line_attr_' + lineProperty.jsonId)
                .remove();

            this.updateHasAbbrevInputs();
            this.queuePreviewUpdate();
        }

        removeCustomElt(customEltId: number): void {
            var foundIndex = -1, rowClass:string;
            this.customNameAdditions.forEach(function(customInput: CustomElementInput,
                                                                index:number) {
                if(customInput.element.nameEltGuiId === customEltId) {
                    foundIndex = index;
                    return false; // stop looping
                }
            });

            // remove the custom element from our tracking and from the DOM
            this.customNameAdditions.splice(foundIndex, 1);
            rowClass = 'custom_name_elt_' + customEltId;
            $('#custom-elements-table')
                .children(rowClass)
                .remove();

            this.updateHasCustomNameElts();
            this.queuePreviewUpdate();
        }

        addLineProperty(input:LinePropertyInput, initialValue?: any): void {
            this.lineProperties.push(input);
            var parentDiv: JQuery, rowClass: string;
            parentDiv = $('#line-properties-table');
            rowClass = 'line_attr_' + input.lineProperty.nameEltJsonId;
            this.insertRow(input, parentDiv, rowClass, initialValue);

            this.updateLinkedStrainInputs(input, true);

            // if new input has a valid initial value, update state, e.g. enabling the "next"
            // button to proceed to step 2
            if(input.hasValidInput(0)) {
                this.updateNameEltChoices(true);
            }
        }

        updateLinkedStrainInputs(input: LinePropertyInput, adding: boolean): void {
            // do special-case processing to link single strain and ICE folder inputs.
            // Single-strain input must be treated as combinatorial if there's also an ICE folder
            // present, since the input strains will be merged and used for combinatorial creation
            if(input.lineProperty.jsonId == ICE_FOLDER_JSON_ID) {
                let strainInput = this.getPropertyInput(this.strainMetaPk);
                if(strainInput) {
                    strainInput.autoUpdateCombinations();
                }
            } else if(adding && input.lineProperty.jsonId == this.strainMetaPk) {
                input.autoUpdateCombinations();
            }
        }

        addAbbreviation(lineAttr:LinePropertyDescriptor): void {
            var parentDiv: JQuery, input: AbbreviationInput, rowClass: string;
            parentDiv = $('#abbreviations-table');
            input = new AbbreviationInput({'lineProperty': lineAttr});
            rowClass = 'line_attr_' + input.lineProperty.nameEltJsonId;
            this.abbreviations.push(input);
            this.insertRow(input, parentDiv, rowClass);
        }

        addCustomNameInput(): void {
            var parentDiv: JQuery, rowClass: string, input:CustomElementInput;

            parentDiv = $('#custom-elements-table');

            input = new CustomElementInput();
            rowClass = 'custom_name_elt_' + input.element.nameEltGuiId;
            this.customNameAdditions.push(input);
            this.insertRow(input, parentDiv, rowClass);

            this.updateHasCustomNameElts();
        }

        insertRow(input:MultiValueInput, parentDiv:JQuery, rowClass:string,
                  initialValue?: any): void {
            var row: JQuery;
            row = $('<div>')
                    .addClass(rowClass)
                    .addClass('table-row')
                    .appendTo(parentDiv);
            input.fillRowControls(row, initialValue);
        }

        buildStep2Inputs(): void {
            // set up connected lists for naming elements
            $( "#line_name_elts, #unused_line_name_elts" ).sortable({
              connectWith: ".connectedSortable",
                update: function(event, ui) {
                      creationManager.queuePreviewUpdate();
                },
            }).disableSelection();

            $('#add-custom-elt-btn').on('click', this.addCustomNameInput.bind(this));

            $('#step2-next-btn').on('click', this.showStep3.bind(this));

            $('#addAbbreviationButton')
                .on('click', creationManager.showAddAbbreviation.bind(this));
        }

        buildStep3Inputs(): void {
            var nonStrainsChbx: JQuery, ignoreIceAccessErrsChkbx: JQuery;
            $('#refresh-summary-div').on('click', () => {
                creationManager.queuePreviewUpdate();
            });
            creationManager.buildAbbrevDialog();

            // set up selectable list for abbreviations dialog
            $('#line-name-abbrev-list').selectable();

            $('#add-lines-btn').on('click', this.createLines.bind(this));

            // set up behavior for supported error workarounds
            // 1) De-emphasize related error messages when workaround is in place
            $('#non-strains-opts-chkbx')
                .on('change', {
                alertClass: '.non-strains-err-message',
                chkbxClass: '.non-strains-chkbx',
            }, creationManager.duplicateCheckboxChecked);

            $('#ignore-ice-access-errors-opts-chkbx')
                .on('change', {
                alertClass: '.ice-access-err-message',
                chkbxClass: '.ignore-ice-errors-chkbx',
                showWhenCheckedSelector: '#strains-omitted-span',
            }, creationManager.duplicateCheckboxChecked);

            $('#completion-email-opt-chkbx')
                .on('change', {
                alertClass: '.timeout-error-alert',
                chkbxClass: '.completion-email-chkbx',
            }, (evt) => creationManager.duplicateCheckboxChecked(evt, false));
        }

        duplicateCheckboxChecked(event, updatePreview?:boolean): void {
            var chxbx: JQuery, checked:boolean, targetId: string, otherChkbx: JQuery,
                alertClass: string, chkboxClass: string, updatePreview: boolean, completeFunction;
            chxbx = $(event.target);
            checked = chxbx.prop('checked');
            targetId = chxbx.prop('id');

            alertClass = event.data.alertClass;
            chkboxClass = event.data.chkbxClass;

            // if visible, change styling on the related Step 3 alert to show it's been aknowleged
            $(alertClass)
                .toggleClass('alert-danger', !checked)
                .toggleClass('alert-warning', checked);

            completeFunction = () => creationManager.queuePreviewUpdate();
            updatePreview = updatePreview !== false;  // true except when param is explicitly false
            if(!updatePreview) {
                completeFunction = () => {};
            }

            // animate, then auto-check the other (duplicate) checkbox in the form,
            // then resubmit the back-end preview request
            otherChkbx = $(chkboxClass)
                .filter((idx: number, elt: Element) => {
                    return $(elt).prop('id') != targetId;
                })
                .prop('checked', checked)
                .effect('bounce',
                    {
                        times: BOUNCES,
                        complete: completeFunction,
                    }, BOUNCE_SPEED);

            // if there is no other checkbox (e.g. 'options' variant was UN-checked in absence of
            // an error), still do the preview update
            if(!otherChkbx.length) {
                completeFunction();
            }

            if(event.data.showWhenCheckedSelector) {
                $(event.data.showWhenCheckedSelector).toggleClass('hide', !checked);
            }
        }

        buildStep1Inputs(): void {
            creationManager.buildAddPropDialog();
            creationManager.buildAddIceFolderDialog();

            // set up selectable list for abbreviations dialog
            $('#line-properties-list').selectable();

            $('#step1-next-btn').on('click', this.showStep2.bind(this));
        }

        showStep2(): void {
            var step2: JQuery = $('#step2');
            step2.removeClass('hide');

            $('html, body').animate({
                scrollTop: step2.offset().top
            }, SCROLL_DURATION_MS);
        }

        showStep3(): void {
            var step3: JQuery = $('#step3');
            step3.removeClass('hide');
            $('html, body').animate({
                scrollTop: step3.offset().top
            }, SCROLL_DURATION_MS);
        }

        updateNameEltChoices(forcePreviewUpdate: boolean): boolean {
            var availableElts: any[], prevNameElts: LinePropertyDescriptor[],
                newElts: LinePropertyDescriptor[], unusedList: JQuery, unusedChildren: JQuery,
                nameEltsChanged:boolean, self:CreationManager, step2Disabled: boolean,
                step3Disabled: boolean, step2: JQuery, step3: JQuery, prevEltCount: number;

            prevEltCount = this.lineNameElements.length;
            this.lineNameElements = [];

            //build an updated list of available/unique naming elements based on user entries in
            // step 1.
            availableElts = [];
            this.lineProperties.forEach((input: LinePropertyInput): void => {
                var elts: LinePropertyDescriptor[] = input.getNameElements();

                // append only unique name elements... Strain properties, for example can be
                // options for Step 1 input of either ICE folders or strains
                elts.forEach(newElt => {
                    if(availableElts.filter(elt => {
                            return elt.nameEltJsonId == newElt.nameEltJsonId;
                        }).length == 0) {
                        availableElts.push(newElt);
                    }
                });
            });
            this.customNameAdditions.forEach((input: CustomElementInput): void => {
                var elt: CustomNameElement = input.getNamingElement();
                if(elt) {
                    availableElts.push(elt);
                }
            });

            // loop over available name elements, constructing a list of those newly added in step
            // 2 so they can be appended at the end of the step 3 list without altering
            // previous user entries into WIP line name ordering
            newElts = availableElts.slice();
            $('#line_name_elts').children().each((childIndex:number, childElt) => {
                var nameElement:NameElement, child:any;

                // start to build up a list of newly-available selections. we'll clear out more of
                // them from the list of unavailable ones
                child = $(childElt);
                nameElement = child.data();

                for(let newEltIndex = 0; newEltIndex < newElts.length; newEltIndex++) {
                    let element = newElts[newEltIndex];

                    if(element.nameEltGuiId == nameElement.nameEltGuiId) {
                        creationManager.lineNameElements.push(nameElement);
                        newElts.splice(newEltIndex, 1);
                        return true;  // continue outer loop
                    }
                }
                child.remove();
                return true;  // continue looping
             });


            unusedList = $('#unused_line_name_elts');
            unusedChildren = unusedList.children();

            if(unusedChildren){
                unusedChildren.each((unusedIndex: number, listElement: Element) => {
                    var availableElt: any, newIndex: number, eltData:NameElement;

                    for(newIndex = 0; newIndex < newElts.length; newIndex++) {
                        availableElt = newElts[newIndex];
                        eltData = $(listElement).data();

                        if(availableElt.nameEltGuiId === eltData.nameEltGuiId) {
                            console.log('Found matching element ' + listElement.textContent);
                            newElts.splice(newIndex, 1);
                            return true; // continue outer loop
                        }
                    }
                    listElement.remove();
                    return true; // continue looping
                });
            }

            // add newly-inserted elements into the 'unused' section. that way previous
            // configuration stays unaltered
            newElts.forEach((elt:NameElement) => {
                var li: JQuery, id:string, input:LinePropertyInput;

                li = $('<li>')
                    .attr('id', elt.nameEltGuiId)
                    .addClass('ui-state-default')
                    .data(elt)
                    .appendTo(unusedList);

                // if this naming element is for a line property that has valid combinatorial
                // input, bold it to attract attention
                for(input of creationManager.lineProperties) {
                    if(input.lineProperty.nameEltJsonId === elt.nameEltJsonId) {
                        // will also update the new name elt to apply styling, though somewhat
                        // indirect
                        input.autoUpdateCombinations();
                        break;
                    }
                }

                $('<span>')
                    .attr('id', 'name_elt' + elt.nameEltGuiId)
                    .text(elt.nameEltLabel)
                    .appendTo(li);

                // add an arrow to indicate the item can be dragged between lists
                $('<span>')
                    .addClass('ui-icon')
                    .addClass('ui-icon-arrowthick-2-n-s')
                    .addClass('name-elt-icon')
                    .appendTo(li);
            });

            // enable / disable "next" buttons based on user actions in earlier steps
            step2Disabled = availableElts.length === 0;
            step3Disabled = this.lineNameElements.length === 0;
            $('#step1-next-btn').prop('disabled', step2Disabled);
            $('#step2-next-btn').prop('disabled', step3Disabled);

            // auto-hide steps 2 and 3 if user went back to an earlier step and removed their
            // required inputs.  Note we purposefully *don't* auto-show them, since we want user to
            // confirm completion of the previous step by clicking "next". Note we hide step 3
            // first to prevent "jumping" behavior
            step2 = $('#step2');
            step3 = $('#step3');

            if(step3Disabled && !step3.hasClass('hide')) {
                step3.addClass('hide');
            }

            if(step2Disabled && !step2.hasClass('hide')) {
                step2.addClass('hide');
            }
            // TODO: skip JSON reconstruction / resulting server request if selected naming
            // elements are the same as before preceding changes added additional unselected
            // options. Note that since the form will never add a naming element automatically,
            // comparing array dimensions is enough
            nameEltsChanged = this.lineNameElements.length != prevEltCount;
            if(nameEltsChanged || forcePreviewUpdate) {
                this.queuePreviewUpdate();
                return true;
            }

            return false;
        }

        updatePreview(): void {
            var self: CreationManager, json: string, url:string, step3Allowed: boolean;
            self = this;
            //build an updated list of naming elements based on user entries in step 2. Note
            // that events from the connected lists don't give us enough info to know which element
            // was just changed in line names
            this.lineNameElements = [];
            $('#line_name_elts').children().each((index: number, elt:any) => {
                var nameElement: any = $(elt).data();
                self.lineNameElements.push(nameElement);
            });

            step3Allowed =  $('#unused_line_name_elts')
                                .children('.required-name-elt')
                                .length === 0 && (this.lineNameElements.length > 0);
            $('#step2-next-btn').prop('disabled', !step3Allowed);

            // if user went back up and added combinatorial data to step 1, hide step 3 until
            // step 2 is complete
            if(!step3Allowed) {
                 $('#step3').addClass('hide');
                 return;
            }

            // before submitting the potentially long-running AJAX request, disable all Step 3
            // inputs and show a basic progress indicator
            creationManager.setStep3InputsEnabled(false);
            $('#step3-waiting-div').removeClass('hide');

            json = this.buildJson();

            url = this.buildRequestUrl(true);

            // submit a query to the back end to compute line / assay names and detect errors
            // before actually making any changes
            $.ajax(url,
                {
                    headers: {'Content-Type' : 'application/json'},
                    method: 'POST',
                    dataType: 'json',
                    data: json,
                    processData: false,
                    success: this.updateStep3Summary.bind(this),
                    error: this.updateStep3Error.bind(this),
                }
            );

            $('#step3Label').removeClass('wait');
        }

        setStep3InputsEnabled(enabled: boolean) {
            $('#step3 :input').prop('disabled', !enabled);
            $('#step3').toggleClass('disabledStep3', !enabled);
            $('#step3 #step3-waiting-div').removeClass('disabledStep3');
        }

        buildRequestUrl(dryRun: boolean): string {
            var url: string, params: string[], allowNonStrains: boolean,
                isIgnoreIceErrors: boolean, sendEmail: boolean;

            params = [];
            url = '../../describe/';

            // aggregate GET parameters to include with the request.  Though these could be
            // included in the JSON, they're purposefully separate so they can also be used in the
            // ED file upload.
            if(dryRun) {
                params.push('DRY_RUN=True');
            }

            allowNonStrains = $('#non-strains-opts-chkbx').prop('checked');
            isIgnoreIceErrors = $('#ignore-ice-access-errors-opts-chkbx').prop('checked');
            sendEmail = $('#completion-email-opt-chkbx').is(':checked');
            if(sendEmail) {
                params.push(EMAIL_WHEN_FINISHED_PARAM + '=True');
            }

            if(allowNonStrains) {
                params.push(ALLOW_NON_STRAIN_PARTS_PARAM + '=True');
            }
            if(isIgnoreIceErrors) {
                params.push( IGNORE_ICE_ACCESS_ERRORS_PARAM + '=True');
            }

            params.forEach((param: string, index: number) => {
                var sep: string = (index == 0 ? '?' : '&');
                url += sep + param;
            });

            return url;
        }

        createLines(): void {
            var url: string, json: string;

            this.showCreatingLinesDialog();

            json = this.buildJson();
            url = this.buildRequestUrl(false);

            // submit a query to the back end to compute line / assay names and detect errors
            // before actually making any changes

            $.ajax(
                url,
                {
                    headers: {'Content-Type' : 'application/json'},
                    method: 'POST',
                    dataType: 'json',
                    data: json,
                    processData: false,
                    success: this.lineCreationSuccess.bind(this),
                    error: this.lineCreationError.bind(this),
                }
            );
        }

        lineCreationSuccess(responseJson): void {
            $('#creation-wait-spinner').addClass('hide');
            $('<span>')
                .text('Success')
                .addClass('alert alert-success')
                .appendTo('#creation-status-div');
            $('#return-to-study-btn').prop('disabled', false);
            $('#create-more-btn').prop('disabled', false);
        }

        lineCreationError(jqXHR, textStatus: string, errorThrown: string): void {
            var statusDiv, json, error, errors;
            $('#creation-wait-spinner').addClass('hide');
            statusDiv = $('#creation-status-div').empty();
            json = jqXHR.responseJSON;

            this.showErrorMessages(statusDiv, json,  jqXHR.status, false,() => creationManager.createLines());
        }

        updateStep3Error(jqXHR, textStatus: string, errorThrown: string): void {
            var errsDiv:JQuery, json = jqXHR.responseJSON,
                ignoreIceErrorsDiv:JQuery, nonStrainsDiv: JQuery, summary: ErrSummary, enableAddLines: boolean;

            $('#line-preview-div').addClass('hide');

            errsDiv = $('#step3-errors-div')
                .empty()
                .removeClass('hide');
            summary = this.showErrorMessages(errsDiv, json, jqXHR.status, true,
                () => creationManager.queuePreviewUpdate());
            enableAddLines = ($('#non-strains-opts-chkbx').prop('checked') ||
                !summary.nonStrainErrors) && !summary.nonUniqueLineNames;

            $('#step3-waiting-div').addClass('hide');

            $('#add-lines-btn')
                .prop('disabled', !enableAddLines);
        }

        showErrorMessages(parentDiv: JQuery, json: any, httpStatus: number, preview: boolean,
                          retryFunction): ErrSummary
        {
            var errors, tableDiv: JQuery, anyNonStrainErr:boolean,
                anyIceAccessError: boolean, nonUniqueLineNames: boolean, div;

            creationManager.setStep3InputsEnabled(true);

            div = $('<div>')
                .addClass('add-combos-subsection')
                .appendTo(parentDiv);

            $('<label>')
                .text('Error(s):')
                .appendTo(div);

            tableDiv = $('<div>')
                .addClass('bulk-line-table')
                .appendTo(parentDiv);

            nonUniqueLineNames = false;

            if(json) {
                errors = json['errors'];

                if(errors) {
                    errors.forEach((error, index:number) =>
                    {
                        var row: JQuery, isIceAccessErr: boolean, isNonStrainErr: boolean;

                        isNonStrainErr = NON_STRAINS_ERR_CATEGORY === error.category;
                        isIceAccessErr = ICE_ACCESS_ERROR_CATEGORIES.indexOf(error.category) >=0;

                        anyNonStrainErr = anyNonStrainErr ||  isNonStrainErr;
                        anyIceAccessError = anyIceAccessError || isIceAccessErr;
                        nonUniqueLineNames = NON_UNIQUE_NAMES_ERR_CATEGORY === error.category;

                        row = this.appendAlert(tableDiv, error);

                        if(isNonStrainErr) {
                            creationManager.addAlertChkbx(row,'non-strains-alert-chkbx',
                                'non-strains-opts-chkbx','non-strains-chkbx',
                                'non-strains-err-message')

                        }
                        if(isIceAccessErr) {
                            if(error.summary && !error.summary.startsWith(UNRESOLVABLE_ACCESS_ERR)) {
                                creationManager.addAlertChkbx(row, 'ignore-ice-access-errs-alert-chkbx',
                                    'ignore-ice-access-errors-opts-chkbx', 'ignore-ice-errors-chkbx',
                                    'ice-access-err-message', '#strains-omitted-span');
                            }
                        }
                    });

                    // If any ICE-related error has occurred, show options for supported workarounds.
                    // Once workarounds have been displayed, they should stay visible so user inputs don't
                    // get lost, even as other earlier form entries are altered
                    let ignoreIceErrorsDiv = $('#ignore-ice-errors-opts-div');
                    let nonStrainsDiv = $('#non-strains-opts-div');
                    if(anyIceAccessError && ignoreIceErrorsDiv.hasClass('hide')) {
                        ignoreIceErrorsDiv.removeClass('hide');
                    }
                    if(anyNonStrainErr && nonStrainsDiv.hasClass('hide')) {
                        nonStrainsDiv.removeClass('hide');
                    }
                } else {
                    this.addUnexpectedErrResult(parentDiv, retryFunction);
                }
            }
            else if (httpStatus == 503) {
                //provide a special-case error message to help users work around timeouts until
                // the back-end is migrated to a Celery task with Websocket notifications.
                let row: JQuery, details: string[];

                if(preview) {
                    details = ["This can occur when you ask EDD to create a" +
                        " very large number of lines, e.g. from a large ICE folder.  You can try" +
                        " again, or attempt to create lines anyway, then have EDD email you" +
                        " when line creation succeeds or fails. It's unlikely that EDD will be" +
                        " able to preview the results for you, so we only suggest proceeding" +
                        " if this is an empty study, or you're experienced in using this tool." +
                        " It's very likely that EDD will time out again during line creation, so" +
                        " consider using email to monitor success."];
                } else {
                    details = ["This can occur when you ask EDD to create a" +
                        " very large number of lines, e.g. from a large ICE folder.  EDD may" +
                    " still succeed in creating your lines after a delay, but it won't be able" +
                    " to display a success message here.  Check your study after a few minutes," +
                    " then consider trying again, perhaps using email notification to" +
                    " monitor progress."];
                }
                row = this.appendAlert(tableDiv, {
                    category: 'Request timed out',
                    summary: "EDD is unavailable or took too long to respond",
                    details: details,
                });

                if(preview) {
                    let btnDiv: JQuery, retryButton: JQuery, forceBtn: JQuery;
                    creationManager.addAlertChkbx(row, 'completion-email-alert-chkbx',
                        'completion-email-opt-chkbx', 'completion-email-chkbx',
                        'timeout-error-alert', null, false);

                    btnDiv = $('<div>');
                    retryButton = addRetryButton(btnDiv, retryFunction);
                    retryButton.removeClass('btn-secondary')
                        .addClass('btn-primary');

                    forceBtn = $("<button type='button'>")
                        .prop('id', 'force-creation-btn')
                        .addClass('btn btn-secondary')
                        .on('click', (event:  Event) => {
                            $(event.target).prop('disabled', true);
                            creationManager.createLines();
                        });

                    $('<span>')
                        .addClass('glyphicon')
                        .addClass('glyphicon-warning-sign')
                        .appendTo(forceBtn)
                        .after(' ');

                    $('<span>')
                        .text('Force Line Creation')
                        .appendTo(forceBtn);

                    forceBtn.appendTo(btnDiv);
                    btnDiv.appendTo(row);
                }
            }
            else {
                this.addUnexpectedErrResult(parentDiv, retryFunction);
            }

            return new ErrSummary(anyIceAccessError, anyNonStrainErr, nonUniqueLineNames);
        }

        // insert a checkbox into the alert error message matching the one under the Step 3
        // "Options" section. Also copy the label text from the baked-in Step 3 checkbox so labels
        // match. This puts user input for problem workarounds in context in the error message, but
        // also makes the stateful controls visible across AJAX requests.
        addAlertChkbx(alert: JQuery, alertChkbxId: string, optsChkbxId: string,
                      checkboxClass: string, alertClass: string, showWhenCheckedSelector?: string,
                      updatePreview?: boolean
        ) {
            var optLabel, alertLbl, alertChkbx, div;

            updatePreview = updatePreview !== false; // true except when param is explicitly false

            // make a new checkbox to put in the alert, linking it with the "options" checkbox
            alertChkbx = $('<input type="checkbox">')
                                .attr('id', alertChkbxId)
                                .addClass(checkboxClass)
                                .on('click', {
                                    alertClass: '.' + alertClass,
                                    chkbxClass: '.' + checkboxClass,
                                    showWhenCheckedSelector: showWhenCheckedSelector,
                                }, (evt) => {
                                    creationManager.duplicateCheckboxChecked(evt, updatePreview)
                                });

            // copy the "options" label into the alert
            optLabel = $('label[for="' + optsChkbxId +'"]');
            alertLbl = $('<label>')
                .text(optLabel.text())
                .attr('for', alertChkbxId);

            $('<div>')
                .append(alertChkbx)
                .append(' ')
                .append(alertLbl)
            .appendTo(alert);

            // add a class that allows us to locate and restyle the alert later if the
            // workaround is selected
            alert.addClass(alertClass);
        }

        addUnexpectedErrResult(statusDiv: JQuery, retryFunction): void {
            let alertDiv = this.appendAlert(statusDiv, {
                category: 'Error',
                summary: 'An unexpected error occurred. Sorry about that!',
            });

            addRetryButton(alertDiv, retryFunction)
        }

        updateStep3Summary(responseJson): void {
            var count: number, lines:any, table:JQuery, row:JQuery, cell:JQuery, label:JQuery,
                i: number, duplicatesProp:string;

            count = responseJson['count'];

            if(responseJson.hasOwnProperty('lines')) {
                lines = responseJson['lines'];
            }

            this.plannedLineCount = count;

            $('#step3-errors-div')
                .empty()
                .addClass('hide');

            // show # lines to be created
            $('#line-count-div').text(count);

            this.addLineNamesToTable(lines);

            creationManager.setStep3InputsEnabled(true);
            $('#add-lines-btn').prop('disabled', false);
            $('#step3-waiting-div').addClass('hide');
        }

        addLineNamesToTable(lines) {
            var i:number, table: JQuery, row:JQuery, cell:JQuery;

            // remove any earlier previews
            $('.line-names-preview-row')
                .remove();

            table = $('#line-preview-table');

            i = 0;
            for (var lineName in lines) {

                if(i == 0 || (i % LINES_PER_ROW === 0)) {
                    row = $('<div>').addClass('table-row line-names-preview-row').appendTo(table);
                }

                cell = $('<div>').addClass('bulk_lines_table_cell')
                    .text(lineName)
                    .appendTo(row);

                if(i == MAX_PREVIEW_LINE_NAMES) {
                    let remainder = Object.keys(lines).length - MAX_PREVIEW_LINE_NAMES;
                    if(remainder > 0) {
                        cell.text('... (' + remainder + ' more)');
                    }
                    break;
                }

                i++;
            }

            $('#line-preview-div').removeClass('hide');
        }

        setLineMetaTypes(metadataTypes:any[]) {
            var self: CreationManager = this,
                lineProps: LinePropertyDescriptor[],
                propertyDescriptor: LinePropertyDescriptor,
                strainNameEltLabel: string,
                strainNameEltJsonId: string;
            $('#step1_loading_metadata_status_div').empty();
            $('#addPropertyButton').prop('disabled', false);

            self.userMetaTypePks = [];

            this.nonAutocompleteLineMetaTypes = [];
            this.autocompleteLineMetaTypes = {};
            this.multivaluedMetaTypePks = [];
            this.strainMetaPk = -1;

            lineProps = [];
            metadataTypes.forEach((meta) => {
                var uiLabel: string, postfix: string, nameEltLabel: string, nameEltJsonId: any;

                // omit "Line Name" and "Description" metadata type from available options. Both
                // options would be confusing for users, since the normal case for this
                // GUI should be to compute line names from combinatorial metadata values, and
                // combinatorial entry of line descriptions isn't really possible
                if (EddRest.LINE_NAME_META_NAME === meta.type_name ||
                    EddRest.LINE_DESCRIPTION_META_NAME === meta.type_name) {
                    return true; // keep looping!
                }

                // if this metadata type matches the name of one we have autocomplete inputs for
                // keep track of its pk for easy reference
                if (AUTOCOMPLETE_META_NAMES.indexOf(meta.type_name) >= 0) {
                    self.autocompleteLineMetaTypes[meta.pk] = meta;
                }

                // if this metadata type is one that supports multivalued input for a single line,
                // store its pk for easy reference
                if(MULTIVALUED_LINE_META_TYPES.indexOf(meta.type_name) >= 0) {
                    self.multivaluedMetaTypePks.push(meta.pk);
                }

                // compute UI labeling for the line properties that makes sense, e.g. by
                // stripping off the "line" prefix from types that have it, or adding in the units
                // suffix for clarity
                uiLabel = meta.type_name;
                if ("Line " === uiLabel.substring(0, 5)) {
                    uiLabel = meta.type_name.substring(5, meta.type_name.length)
                }
                postfix = meta['postfix'];
                if (postfix.length) {
                    uiLabel = uiLabel + ' (' + postfix + ')';
                }
                nameEltLabel = uiLabel;
                nameEltJsonId = meta.pk;

                // build up a descriptor for this metadata type, including logical labeling for it
                // in various parts of the GUI, as well as JSON id's for both the metadata itself
                // or its naming elements
                if (USER_META_TYPE_NAMES.indexOf(meta.type_name) >= 0) {
                    nameEltLabel = uiLabel + ' Last Name';
                    nameEltJsonId = meta.pk + '__last_name';
                    propertyDescriptor = new LinePropertyDescriptor(meta.pk, uiLabel,
                                                                    nameEltLabel, nameEltJsonId);
                    self.userMetaTypePks.push(meta.pk);
                } else if (EddRest.STRAINS_META_NAME === meta.type_name ||
                           EddRest.CARBON_SOURCE_META_NAME === meta.type_name) {
                    nameEltJsonId = meta.pk + '__name';

                    if(EddRest.STRAINS_META_NAME === meta.type_name) {
                        nameEltLabel = STRAIN_NAME_ELT_LABEL;
                        this.strainNameEltJsonId = nameEltJsonId;
                        this.strainMetaPk = meta.pk;
                    } else {
                        nameEltLabel = meta.type_name.substring(0,
                            meta.type_name.indexOf('(s)')) + ' Name(s)';
                    }

                    propertyDescriptor = new LinePropertyDescriptor(meta.pk, uiLabel,
                                                                    nameEltLabel, nameEltJsonId);
                } else {
                    propertyDescriptor = new LinePropertyDescriptor(meta.pk, uiLabel);
                }

                lineProps.push(propertyDescriptor);
                self.allLineMetaTypes[meta.pk] = meta;  // TODO: still need this?
            });

            // add in special-case hard-coded items that make sense to put in this list, but
            // aren't actually represented by line metadata types in the database. Since line
            // metadata types will all have a unique integer pk identifier, we can use
            // non-integer alphanumeric strings for our special-case additions.
            lineProps.push(new LinePropertyDescriptor(REPLICATE_COUNT_JSON_ID, 'Replicates',
                                         'Replicate #', REPLICATE_NUM_NAME_ID));

            lineProps.push(new LinePropertyDescriptor(ICE_FOLDER_JSON_ID,
            'Strain(s) - ICE folder', STRAIN_NAME_ELT_LABEL, this.strainNameEltJsonId));

            // after removing the "Line " prefix from labels for this context, sort the list so
            // it appears in alphabetic order *as displayed*a
            lineProps.sort((a: LinePropertyDescriptor, b: LinePropertyDescriptor) => {
                return a.inputLabel.localeCompare(b.inputLabel);
            });


            // with labeling now sorted alphabetically, create list items
            lineProps.forEach((lineProp: LinePropertyDescriptor) => {
                var linePropsList = $('#line-properties-list');
                $('<li>')
                    .attr('id', 'lineProp' + lineProp.jsonId)
                    .addClass('ui-widget-content')
                    .text(lineProp.inputLabel)
                    .appendTo(linePropsList)
                    .data(lineProp);
            });
        }

        showAddProperty(): void {
            $('#add-prop-dialog').dialog('open');
        }

        buildAddPropDialog(): void {
            var self: CreationManager = this;
            $('#add-prop-dialog').dialog({
                resizable: true,
                height: 500,
                minWidth: 188,
                maxWidth: 750,
                modal: true,
                autoOpen: false,
                buttons: [
                    {
                        text: 'Add Selected',
                        class: 'btn btn-primary',
                        click: function () {
                            var propsList: JQuery, selectedItems: JQuery;

                            propsList = $('#line-properties-list');
                            selectedItems = propsList.children('.ui-selected');
                            selectedItems.removeClass('ui-selected').addClass('hide');
                            selectedItems.each((index: number, elt: Element) => {
                                var descriptor: LinePropertyDescriptor = $(elt).data();

                                if(descriptor.jsonId === ICE_FOLDER_JSON_ID) {
                                    // show folder dialog, which will control whether the folder
                                    // eventually gets added as an input (once validated)
                                    creationManager.showIceFolderDialog();
                                    return true;  // keep iterating
                                }
                                creationManager.addEmptyInput(descriptor);
                            });
                        },
                    },
                    {
                        text: 'Close',
                        class: 'btn btn-secondary',
                        click: function () {
                            $(this).dialog('close');

                            // de-select anything user left selected
                            $('#line-properties-list')
                                .children('.ui-selected')
                                .removeClass('ui-selected');
                        }
                    }
                ]
            })
                .removeClass('hide'); // remove class that hides it during initial page load

            // add click behavior to the "add property" button
            $('#addPropertyButton')
                .on('click', creationManager.showAddProperty.bind(this));
        }

        showIceFolderDialog(): void {
            // reset form defaults
            $('#ice-folder-url-input').val('');
            $('#folder-lookup-status-div').empty();
            $('type-strain').attr('checked', 'checked');

            // show the dialog
            $('#add-ice-folder-dialog').dialog('open');
        }

        buildAddIceFolderDialog(): void {
            var self: CreationManager = this;

            $('#add-ice-folder-dialog').dialog({
                resizable: true,
                height: 405,
                width: 572,
                minWidth: 345,
                maxWidth: 750,
                modal: true,
                autoOpen: false,
                buttons: [
                    {
                        text: 'Add Folder',
                        class: 'btn btn-primary',
                        click: function () {
                            let url: string;

                            url = $('#ice-folder-url-input').val();

                            //submit a query to the back end to compute line / assay names and
                            // detect errors before actually making any changes
                            $.ajax('/ice_folder/',
                                {
                                    headers: {'Content-Type': 'application/json'},
                                    method: 'GET',
                                    dataType: 'json',
                                    data: { url: url, },
                                    success: self.iceFolderLookupSuccess.bind(self),
                                    error: self.iceFolderLookupError.bind(self),
                                }
                            );
                        },
                    },
                    {
                        text: 'Cancel',
                        class: 'btn btn-secondary',
                        click: function () {
                            $(this).dialog('close');

                            // de-select anything user left selected
                            $('#line-properties-list')
                                .children('.ui-selected')
                                .removeClass('ui-selected');

                            // if no corresponding rows exist yet in the main form,  restore
                            // this option to the line properties dialag so it can be added later
                            var folderInput: any = self.getPropertyInput(ICE_FOLDER_JSON_ID);
                            if(!folderInput) {
                                $('#lineProp' + ICE_FOLDER_JSON_ID)
                                    .removeClass('hide')
                                    .addClass('ui-selected');
                            }
                        }
                    }
                ],
            })
                .removeClass('hide'); // remove class that hides it during initial page load

            // add click behavior to the "add property" button
            $('#addPropertyButton')
                .on('click', creationManager.showAddProperty.bind(this));
        }

        getPropertyInput(jsonId: any) {
            var result: LinePropertyInput = null;
            this.lineProperties.forEach(function(input) {
                if(input.lineProperty.jsonId === jsonId) {
                    result = input;
                    return false;  //stop looping
                }
            });
            return result;
        }

        iceFolderLookupSuccess(folder_json: any, textStatus: string, jqXHR: JQueryXHR): void {

            // look for any existing form input for ICE folders. If there is one,
            // we'll just add a row to it for the newly validated folder
            var iceInput: IceFolderInput = <IceFolderInput> this.getPropertyInput(ICE_FOLDER_JSON_ID);

            $('#add-ice-folder-dialog').dialog('close');

            let toggleIds = ['#type-strain', '#type-protein',
                                '#type-plasmid', '#type-part',
                                '#type-seed'];

            // gather all the relevant inputs for displaying user entry in the main form
            let filterTypes = [];
            toggleIds.forEach(idSelector => {
                let btn = $(idSelector);
                if (btn.is(':checked')) {
                    filterTypes.push(btn.val());
                }
            });

            let folder = {
                id: folder_json.id,
                name: folder_json.folderName,
                url: $('#ice-folder-url-input').val(),
                entryTypes: filterTypes,
            };

            if(iceInput != null) {
                iceInput.appendRow(folder);
                return;
            }

            // grab the "LineProperty" entry from the 'Add property" dialog's list, then use it to
            // create a new input, including the validated folder in the first row
            $('#line-properties-list')
                .children()
                .each((index: number, elt: Element) => {
                    let descriptor: LinePropertyDescriptor = $(elt).data();
                    if(descriptor.jsonId === ICE_FOLDER_JSON_ID) {
                        let input = new IceFolderInput({
                            'lineProperty': descriptor,
                        });
                        creationManager.addLineProperty(input, folder);
                        return false; // stop looping
                    }
                });
        }

        iceFolderLookupError(jqXHR, textStatus:string, errorThrown:string): void {
            let contentType, statusDiv, genericErrorMsg, self;
            self = this;
            contentType = jqXHR.getResponseHeader('Content-Type');
            statusDiv = $('#folder-lookup-status-div')
                            .empty();
            genericErrorMsg = {
                'category': 'ICE lookup error',
                'summary': 'An unknown error has occurred while resolving the' +
                ' folder with ICE.  Please try again.'
            };

            if (contentType === 'application/json') {
                let json, errors;
                json = jqXHR.responseJSON;
                errors = json['errors'];
                if (errors) {
                    errors.forEach(error => {
                        self.appendAlert(statusDiv, error);
                    });
                } else {
                    this.appendAlert(statusDiv,
                                             genericErrorMsg)
                }
            } else {
                this.appendAlert(statusDiv, genericErrorMsg);
            }
        }

        appendAlert(statusDiv: JQuery, message:ErrorSummary): JQuery {
            let div = $('<div>')
                .addClass('alert alert-danger')
                .appendTo(statusDiv);
            $('<h4>').text(message.category).appendTo(div);

            if(message.details) {
                $('<p>')
                    .text(message.summary + ': ' + message.details)
                    .appendTo(div);
            } else {
                $('<p>')
                    .text(message.summary)
                    .appendTo(div);
            }
            return div;
        }

        showCreatingLinesDialog(): void {

            // disable buttons and set styling to match the rest of EDD
            $('#return-to-study-btn')
                .prop('disabled', true)
                .addClass('actionButton');
            $('#create-more-btn')
                .prop('disabled', true)
                .addClass('actionButton');

            $('#creation-wait-spinner')
                .removeClass('hide');
            $('#creation-status-div')
                .empty();
            $('#line-count-span')
                .text(this.plannedLineCount);
            $('#creating-lines-dialog')
                .dialog('option', 'title', 'Creating ' + this.plannedLineCount + ' Lines...')
                .dialog('open');
        }

        buildLineCreationDialog(): void {
            $('#creating-lines-dialog').dialog({
                resizable: true,  // let users see err messages (if any)
                modal: true,
                autoOpen: false,
                buttons: [
                    {
                        text: 'Create More',
                        id: 'create-more-btn',
                        click: () => {
                            $('#creating-lines-dialog').dialog('close');

                            // if lines have just been created, we need updated feedback from the back
                            // end since unchanged settings will now produce duplicate names
                            creationManager.queuePreviewUpdate();
                        }
                    },
                    {
                        text: 'Return to Study',
                        id: 'return-to-study-btn',
                        click: function () {
                            window.location.href = '../';
                        }
                    }]
            }).removeClass('hide'); // remove the class that hides it during page load
        }

        showAddAbbreviation(): void {
            var list: JQuery, self: CreationManager;
            self = this;
            list = $('#line-name-abbrev-list').empty();
            this.lineNameElements.forEach((namingElement: LinePropertyDescriptor) => {
                var existingAbbreviation = false;
                self.abbreviations.forEach(function(abbreviation: AbbreviationInput){
                    if(abbreviation.lineProperty.jsonId == namingElement.jsonId) {
                        existingAbbreviation = true;
                        return false;  // stop inner loop
                    }
                });

                // skip list item creation for any line property that we already have an
                // abbreviation for
                if(existingAbbreviation) {
                    return true;  // continue looping
                }

                $('<li>')
                    .text(namingElement.nameEltLabel)
                    .addClass('ui-widget-content')
                    .data(namingElement)
                    .appendTo(list);
            });

            creationManager.updateHasAbbrevDialogOptions(list);
            $('#add-abbrev-dialog').dialog('open');
        }

        buildAbbrevDialog(): void {

            $('#add-abbrev-dialog').dialog({
                resizable: false,
                modal: true,
                autoOpen: false,
                buttons: {
                    'Add Abbreviation(s)': function() {
                        creationManager.addSelectedAbbreviations();
                    },
                    'Close': function() {
                        var textInput: JQuery, hiddenInput: JQuery;
                        $(this).dialog('close');
                    }
                }
            })
                .removeClass('hide'); //remove class that hides it during initial page load
        }

        addSelectedAbbreviations() {
            var abbreviationsList: JQuery, selectedProperties: LinePropertyDescriptor[],
                selectedItems: JQuery, self:CreationManager;
            self = this;

            $('#abbreviations-table').removeClass('hide');

            // build the list of line attributes selected in the dialog
            abbreviationsList = $('#line-name-abbrev-list');
            selectedItems = abbreviationsList.children('.ui-selected');
            selectedProperties = [];
            selectedItems.each(
                function (index: number, elt: Element) {
                selectedProperties.push($(elt).data());
            });

            if(!selectedProperties.length) {
                return;
            }

            // remove selected items from the list
            selectedItems.remove();
            this.updateHasAbbrevDialogOptions(abbreviationsList);

            selectedProperties.forEach(function(attribute) {
                self.addAbbreviation(attribute);
            });

            this.updateHasAbbrevInputs();
        }

        updateHasAbbrevInputs(): void {
            var hasInputs:boolean = $('#abbreviations-table').children('.table-row').length !==0;

            // show table header, since there's at least one abbreviation row
            $('#abbreviations-table').toggleClass('hide', !hasInputs);
            $('#no-abbrevs-div').toggleClass('hide', hasInputs);
        }

        updateHasAbbrevDialogOptions(list: JQuery): void {
            var hasOptions = list.children('li').length !== 0;
            $('#no-abbrev-options-div').toggleClass('hide', hasOptions);
            list.toggleClass('hide', !hasOptions);
        }

        updateHasCustomNameElts(): void {
            var customEltsTable: JQuery, hasInputs:boolean;
            customEltsTable = $('#custom-elements-table');

            hasInputs = customEltsTable.children('.table-row').length !== 0;

            customEltsTable.toggleClass('hide', !hasInputs);
            $('#no-custom-elts-div').toggleClass('hide', hasInputs);
        }

        buildJson(): string {
            var result: any, json: string, nameElts: any, elts: string[], customElts: any,
                combinatorialValues: any, commonValues: any, abbrevs: any;

            let iceFolderInput: IceFolderInput;

            // name element ordering
            nameElts = {};
            elts = [];
            this.lineNameElements.forEach(function(nameElement:LinePropertyDescriptor) {
                elts.push(nameElement.nameEltJsonId);
            });
            nameElts['elements'] = elts;

            // custom name elements
            customElts = {};
            this.customNameAdditions.forEach((input: CustomElementInput)=> {
                var value = input.getValueJson();
                if(!value) {
                    return true; // continue looping
                }
                $.extend(customElts, value);  //TODO: point out overlapping inputs!
            });

            // abbreviations
            if(this.abbreviations.length) {
                abbrevs = {};
                this.abbreviations.forEach(function(inputs: AbbreviationInput,
                                                              index: number) {
                    // vals = inputs.validInputCount() )
                    var values: any = inputs.getValueJson();
                    if(values) {
                        abbrevs[inputs.lineProperty.nameEltJsonId] = values;
                    }
                });
                nameElts['abbreviations'] = abbrevs;
            }
            result = {name_elements: nameElts};

            if(customElts) {
                result['custom_name_elts'] = customElts;
            }

            // include all inputs in the JSON, separating them by "combinatorial" status as
            // required
            commonValues = {}; // meta pk => value or value list
            combinatorialValues = {}; // meta pk => list of values or list of value lists
            this.lineProperties.forEach((input: LinePropertyInput): boolean => {
                var value: any, v: number, validInputCount:number, multiValuedInput:boolean;

                validInputCount = input.validInputCount();
                if(!validInputCount) {
                    return true; // keep looping
                }

                // do special-case processing of replicate count, which isn't represented by a
                // line metadata type
                if(REPLICATE_NUM_NAME_ID == input.lineProperty.nameEltJsonId) {
                    result[REPLICATE_COUNT_JSON_ID] = input.getValueJson();
                    return true; // keep looping
                }

                // do special-case processing of multivalued inputs (e.g. strain, carbon source).
                // for now, we'll assume that multiple entries for either results in combinatorial
                // line creation.  later on, we may add support for non-combinatorial multiples
                // (e.g. co-culture \ multiple carbon sources)
                multiValuedInput = (MULTIVALUED_LINE_META_TYPES.indexOf(
                                                input.lineProperty.inputLabel) >= 0);
                if(multiValuedInput && validInputCount > 1) {
                    value = input.getValueJson();
                    if(value.constructor === Array) {
                       for(v=0; v<value.length; v++) {
                           value[v] = [value[v]];
                       }
                    } else {
                         value = [value]
                    }
                    combinatorialValues[input.lineProperty.jsonId] = value;

                    return true;
                }

                if(input.hasValidCombinations()) {
                    combinatorialValues[input.lineProperty.jsonId] = input.getValueJson();
                }
                else {
                    commonValues[input.lineProperty.jsonId] = input.getValueJson();
                }
            });

            result['combinatorial_line_metadata'] = combinatorialValues;
            result['common_line_metadata'] = commonValues;

            iceFolderInput = <IceFolderInput> this.getPropertyInput(ICE_FOLDER_JSON_ID);
            if(iceFolderInput) {
                result['ice_folder_to_filters'] = iceFolderInput.getFiltersJson();
            }

            json = JSON.stringify(result);
            return json;
        }
    }

    export const creationManager = new CreationManager();

    // As soon as the window load signal is sent, call back to the server for the set of reference
    // records that will be used to disambiguate labels in imported data.
    export function onDocumentReady(): void {
        var forms, validation;

        creationManager.buildLineCreationDialog();
        creationManager.buildStep1Inputs();
        creationManager.buildStep2Inputs();
        creationManager.buildStep3Inputs();

        // load line metadata types from the REST API. This allows us to display them more
        // responsively if there are many, and also to show them in the
        loadAllLineMetadataTypes();

        // TODO: uncomment/fix or remove
        //$('#ice-folder-form').validator().on('submit', ()=> {event.preventDefault(); });

        // TODO: after upgrading to Bootstrap 4, uncomment and retry this validation experiment
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
            beforeSend: function (xhr) {
                var csrfToken = Utl.EDD.findCSRFToken();
                xhr.setRequestHeader('X-CSRFToken', csrfToken);
            }
        });
    }
}

$(window).on('load', function() {
    StudyLinesAddCombos.onDocumentReady();
});
