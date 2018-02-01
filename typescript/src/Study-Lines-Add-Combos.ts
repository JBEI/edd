/// <reference types="jqueryui" />
import { EDDAuto } from "../modules/EDDAutocomplete"
import { EddRest } from "../modules/EDDRest"
import { Utl } from "../modules/Utl"
import * as $ from "jquery"
import "bootstrap-loader"

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

module StudyLinesAddCombos {

    //TODO: relocate, e.g. to EDDRest.ts.  Initial attempts compiled but failed to run in
    // strange ways.
    /* Default metadata names that may have to be explicitly-referenced in the UI */
    export const LINE_NAME_META_NAME:string = 'Line Name';
    export const LINE_EXPERIMENTER_META_NAME:string = 'Line Experimenter';
    export const LINE_DESCRIPTION_META_NAME:string = 'Line Description';
    export const LINE_CONTACT_META_NAME:string = 'Line Contact';
    export const CARBON_SOURCE_META_NAME:string = 'Carbon Source(s)';
    export const STRAINS_META_NAME:string = 'Strain(s)';

    // names of line metadata types that should use an autocomplete to gather user input
    export const AUTOCOMPLETE_META_NAMES: string[] = [LINE_EXPERIMENTER_META_NAME,
                                                      LINE_CONTACT_META_NAME,
                                                      CARBON_SOURCE_META_NAME,
                                                      STRAINS_META_NAME];

    // names of line metadata types which represent a user and should use the user autocomplete
    export const USER_META_TYPE_NAMES: string[] = [LINE_CONTACT_META_NAME,
                                                   LINE_EXPERIMENTER_META_NAME];

    // names of line metadata types that support multiple values for a single line
    export const MULTIVALUED_LINE_META_TYPES = [STRAINS_META_NAME, CARBON_SOURCE_META_NAME];

    // Metadata types present in the database that should be omitted from user-displayed lists in
    // contexts where separate display is available for line attributes.
    export const LINE_PROPERTY_META_TYPES = [LINE_NAME_META_NAME, LINE_DESCRIPTION_META_NAME,
        LINE_CONTACT_META_NAME, LINE_EXPERIMENTER_META_NAME, STRAINS_META_NAME];

    // special case JSON identifier for replicate count, which has no direct association to a line
    // metadata type
    const REPLICATE_COUNT_JSON_ID = 'replicate_count';

    const REPLICATE_NUM_NAME_ID = 'replicate_num';

    const SCROLL_DURATION_MS = 2000;

    const LINES_PER_ROW = 5;

    function loadAllLineMetadataTypes():void {
        $('#addPropertyButton').prop('disabled', true);
        EddRest.loadMetadataTypes(
            {
                'success': creationManager.setLineMetaTypes.bind(creationManager),
                'error': showMetaLoadFailed,
                'request_all': true, // get all result pages
                'wait': showWaitMessage,
                'context': EddRest.LINE_METADATA_CONTEXT,
                'ordering': 'type_name',
            });
    }

    function showWaitMessage(): void {
        var div: JQuery, span;
        div = $('#step2_status_div');
        div.empty();

        span = $("<span>")
            .text('Loading line metadata types...')
            .addClass('errorMessage')
            .appendTo(div);
    }

    function showMetaLoadFailed(jqXHR, textStatus:string, errorThrown:string): void {
        var div: JQuery, span;
        div = $('#step2_status_div');
        div.empty();

        span = $("<span>")
            .text('Unable to load line metadata from EDD. Property selection is disabled.')
            .addClass('errorMessage')
            .appendTo(div);

        $('<button type="button">')
            .text(' Retry')
            .addClass('glyphicon')
            .addClass('glyphicon-refresh')
            .on('click', () => {
                loadAllLineMetadataTypes();
            })
            .appendTo(span);
    }

    class NameElement {
        nameEltLabel: string;
        nameEltGuiId: number;
        nameEltJsonId: any; // string for special-cases, integer pk for metadata

        // used to generate a unique ID for each naming element used within the UI. This lets us
        // easily distiguish custom user additions, which have no representation in the database,
        // from line metadata types which do. No need to worry about naming overlaps, etc.
        static nameElementCounter: number = 0;

        constructor(label:string, nameEltJsonId:any) {
            this.nameEltLabel = label;
            this.nameEltJsonId = nameEltJsonId;
            this.nameEltGuiId = ++NameElement.nameElementCounter;
        }
    }

    class LinePropertyDescriptor extends NameElement {
        jsonId: any; // string for special-cases, integer pk for metadata
        inputLabel: string;

        constructor(jsonId, inputLabel:string, nameEltLabel:string =null, nameEltJsonId:any =null) {
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
        nonStrainErrors; boolean;

        constructor(iceAccessErrors: boolean, nonStrainErrors: boolean) {
            this.iceAccessErrors = iceAccessErrors;
            this.nonStrainErrors = nonStrainErrors;
        }
    }

    export class MultiValueInput {
        uiLabel: JQuery;
        maxRows: number;
        minEntries: number;

        rows: JQuery[] = [];
        addButton: JQuery;

        constructor(label:string, options:any) {

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
                $('<span>').addClass('ui-icon')
                    .addClass('ui-icon-trash').appendTo(btn);
                this.registerRemoveRowEvtHandler(btn, rowIndex);
                return btn;
            }
            return null;
        }

        registerRemoveRowEvtHandler(removeButton, rowIndex) {
            // empty method body for children to override
            // TODO: inspect implementations....appears inconsistent use WRT postremovecallback
        }

        buildAddControl(container: JQuery) {
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

        appendRow(): void {
            var newRow: JQuery, parent: JQuery, atMax: boolean, prevRow: JQuery;
            prevRow = this.rows[this.rows.length-1];

            newRow = $('<div>')
                .addClass('table-row')
                .insertAfter(prevRow);
            this.fillRow(newRow);

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

        fillRow(row: JQuery): void {
            // empty default implementation for children to override
        }

        getValueJson(): any {
            // empty default implementation for children to override
        }
    }

    export class LinePropertyInput extends MultiValueInput {
         lineProperty: LinePropertyDescriptor;
         supportsCombinations: boolean;

         constructor(options: any) {
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

        autoUpdateCombinations() {
            var hasMultipleInputs: boolean, hasComboValues: boolean, combosButton:JQuery,
                noCombosButton:JQuery, namingElt:JQuery, supportsMultivalue: boolean;
            hasMultipleInputs = this.hasMultipleInputs();
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
            if(hasMultipleInputs) {
                combosButton.attr('checked', 'checked');
            }
            else {
                noCombosButton.attr('checked', 'checked');
            }

            noCombosButton.prop('disabled', true);

            // update step 2 naming elements for this line property... if valid values are provided
            // for combinatorial input, style the step 2 naming element to reflect that its
            // required to produce unique line names
            hasComboValues = this.validInputCount() > 1; // TODO: note assumption re: multivalued
                                                         // inputs!
            if(this.lineProperty.jsonId === REPLICATE_COUNT_JSON_ID) {
                // do special-case processing for replicate count input...though it's displayed
                // in step 1 as "apply to all lines", if > 1, then it's "combinatorial" from the
                // standpoint that replicate # is required input to computing unique line names
                console.log('Replicates = ' + this.getInput(0));
                namingElt.toggleClass('required-name-elt', this.getInput(0) > 1);
                return;
            }

            namingElt.toggleClass('required-name-elt', hasComboValues);
            noCombosButton.attr('disabled', String(hasComboValues || this.supportsCombinations));
        }

        getValueJson(): any {
            var values: string[] = [];
            this.rows.forEach((currentValue, index, arr) => {
                if(this.hasValidInput(index)) {
                    values.push(this.getInput(index));
                }
            });

            // if there's only one valid value, don't package it in an array
            if(values.length == 1) {
                return values[0];
            }
            return values;
        }

        fillRow(row: JQuery):void {
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
                this.buildAddControl(addCell);
                this.getLabel()
                    .appendTo(labelCell);
            }

            inputCell = $('<div>')
                .addClass('bulk_lines_table_cell')
                .addClass('inputCell')
                .appendTo(row);

            flewGrowWrapper = $('<div>').addClass('inputContent').appendTo(inputCell);

            this.fillInputControls(flewGrowWrapper);

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

        fillInputControls(inputCell: JQuery): void {
             // by default, just fill in a single text box.  child classes may override with
            // alternate user inputs
            var text: JQuery, hidden: JQuery, self: LinePropertyInput;
            self = this;

            text = $('<input type="text">')
                .addClass('columnar-text-input');
            text.on('change', function () {
                self.updateInputState();
                creationManager.updateNameEltChoices();
            });

            inputCell.append(text)
                .append(hidden);
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
                creationManager.updateNameEltChoices();
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

        fillRow(row: JQuery):void {
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

                        creationManager.updateNameEltChoices();
                });
            valCell = this.addCustomNameInput(row, 'custom-val-cell', 'custom-val-input')
                .on('change', null, {'rowIndex': rowIndex, 'elementInput': this},
                    (ev:JQueryMouseEventObject) => {
                        // TODO: cache previous hasValidInput() state and use here to avoid extra
                        // processing / back end requests
                        creationManager.updateNameEltChoices();
                        creationManager.queuePreviewUpdate();
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
            creationManager.updateNameEltChoices();
            creationManager.queuePreviewUpdate();
        }

        removeFromForm() {
            creationManager.removeCustomElt(this.element.nameEltGuiId);
        }
    }

    export class AbbreviationInput extends LinePropertyInput {

        constructor(options:any) {
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

        fillRow(row: JQuery):void {
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
                this.buildAddControl(addCell);
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

        constructor(options) {
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
                creationManager.updateNameEltChoices();
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
            else if(CARBON_SOURCE_META_NAME === this.lineProperty.inputLabel) {
                visible.attr('eddautocompletetype', "CarbonSource");
                this.autoInput = new EDDAuto.CarbonSource({
                    'container': inputCell,
                    'visibleInput': visible,
                    'hiddenInput': hidden,
                });
            }
            else if(STRAINS_META_NAME === this.lineProperty.inputLabel) {
                visible.attr('eddautocompletetype', "Registry");
                this.autoInput = new EDDAuto.Registry({
                    'container': inputCell,
                    'visibleInput': visible,
                    'hiddenInput': hidden,
                    //'searchExtra': ,  TODO: reconsider strain filtering
                });
            }
            this.buildRemoveBtn(inputCell);
        }

        getInput(rowIndex: number): any {
            var stringVal: string;
            stringVal = this.rows[rowIndex].find('input[type=hidden]').first().val();

            if(this.lineProperty.inputLabel == STRAINS_META_NAME) {
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

        constructor(options:any) {
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
                    creationManager.updateNameEltChoices();
                })
                .appendTo(buttonsDiv);
            $('<label>')
                .text('Yes')
                .appendTo(buttonsDiv);
            this.noCheckbox = $('<input type="checkbox">')
                .addClass('noCheckBox')
                .on('change', function() {
                    self.updateInputState();
                    creationManager.updateNameEltChoices();
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
        constructor(options:any) {
            options.maxRows = 1;
            options.minRows = 1;
            options.supportsCombinations = false;
            super(options);
        }

        hasValidInput(rowIndex: number):boolean {
            return $('#spinner').val() > 1;
        }

        fillInputControls(rowContainer: JQuery): void {
            $('<input id="spinner">')
                .val(1)
                .addClass('columnar-text-input')
                .addClass('step2-value-input')
                .appendTo(rowContainer);
        }

        getInput(rowIndex: number): any {
            var textInput = super.getInput(rowIndex);
            return +textInput;
        }
    }

    export class CreationManager {
        replicateInput: LinePropertyInput;

        // step 1 : line property inputs (one per line property, regardless of row count)
        lineProperties:LinePropertyInput[] = [];

        // step 2 state
        abbreviations: AbbreviationInput[] = [];
        customNameAdditions: CustomElementInput[] = [];

        // user-selected name elements from step 2, refreshed shortly *after* user input
        lineNameElements:any[] = [];

        nonAutocompleteLineMetaTypes: any[] = [];
        autocompleteLineMetaTypes: any = {};
        allLineMetaTypes: any = {};
        userMetaTypePks: number[];
        multivaluedMetaTypePks: number[] = [];

        previewUpdateTimerID:number = null;

        plannedLineCount = 0;

        constructor() {
            this.replicateInput = new NumberInput({
                    'lineProperty': new LinePropertyDescriptor(REPLICATE_COUNT_JSON_ID,
                                                                 'Replicates', 'Replicate #',
                                                                  REPLICATE_NUM_NAME_ID)});
            this.lineProperties = [this.replicateInput];
        }

        // Start a timer to wait before calling updating the line name preview, which requires
        // an AJAX call to the back end
        queuePreviewUpdate(): void {
            $('#step3Label').addClass('wait');
            if (this.previewUpdateTimerID) {
                clearTimeout(this.previewUpdateTimerID);
            }
            this.previewUpdateTimerID = setTimeout(this.updatePreview.bind(this), 500);  //TODO:
            // 250 in import
        }

        addInput(lineProperty: LinePropertyDescriptor): void {
            var newInput: LinePropertyInput, autocompleteMetaItem:any;

            autocompleteMetaItem = this.autocompleteLineMetaTypes[lineProperty.jsonId];
            if(autocompleteMetaItem) {
                newInput = new LinePropertyAutoInput({'lineProperty': lineProperty});
            }
            else if(EddRest.CONTROL_META_NAME == lineProperty.inputLabel) {
                newInput = new BooleanInput({'lineProperty': lineProperty, 'maxRows': 1})
            }
            else {
                newInput = new LinePropertyInput({'lineProperty': lineProperty});
            }

            this.lineProperties.push(newInput);
            this.addLineProperty(newInput);
        }

        removeLineProperty(lineProperty: LinePropertyDescriptor): void {
            var foundIndex = -1;
            this.lineProperties.forEach(function(property, index:number) {
                if(property.lineProperty.jsonId === lineProperty.jsonId) {
                    foundIndex = index;
                    return false;  //stop looping
                }
            });

            // remove the property from our tracking and from the DOM
            this.lineProperties.splice(foundIndex, 1);
            $('#line-properties-table')
                .children('.line_attr_' + lineProperty.jsonId)
                .remove();

            // restore user's ability to choose this option via the "add property" dialog
            $('#lineProp' + lineProperty.jsonId).removeClass('hide');

            this.updateNameEltChoices();
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

        addLineProperty(input:LinePropertyInput): void {
            var parentDiv: JQuery, rowClass: string;
            parentDiv = $('#line-properties-table');
            rowClass = 'line_attr_' + input.lineProperty.nameEltJsonId;
            this.insertRow(input, parentDiv, rowClass);
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

        insertRow(input:MultiValueInput, parentDiv:JQuery, rowClass:string): void {
            var row: JQuery;
            row = $('<div>')
                    .addClass(rowClass)
                    .addClass('table-row')
                    .appendTo(parentDiv);
            input.fillRow(row);
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

            $('#create-lines-btn').on('click', this.createLines.bind(this));

            // set up behavior for supported error workarounds
            // 1) De-emphasize related error messages when workaround is in place
            // 2) Show any additional text describing the resulting behavior
            nonStrainsChbx = $('#non-strains-opts-chkbx');
            nonStrainsChbx.on('change', ()=> {
                var checked:boolean = nonStrainsChbx.prop('checked');
                $('.non-strains-err-message').toggleClass('errorMessage', !checked)
                    .toggleClass('disabledErrMsg', checked);
                creationManager.queuePreviewUpdate();
            });

            ignoreIceAccessErrsChkbx = $('#ignore-ice-access-errors-opts-chkbx');
            ignoreIceAccessErrsChkbx.on('change', () => {
                var checked:boolean = ignoreIceAccessErrsChkbx.prop('checked');
                $('.ice-access-err-message').toggleClass('errorMessage', !checked)
                    .toggleClass('disabledErrMsg', checked);
                $('#strains-omitted-span').toggleClass('hide', !checked);
                creationManager.queuePreviewUpdate();
            });
        }

        buildStep1Inputs(): void {

            creationManager.buildAddPropDialog();

            // set up selectable list for abbreviations dialog
            $('#line-properties-list').selectable();

            // add options for any naming elements that should be available by default
            this.lineProperties.forEach((input: LinePropertyInput, i: number): void => {
                this.addLineProperty(input);
            });

            // style the replicates spinner
            $("#spinner").spinner({
                min: 1,
                change: function(event, ui) {
                        creationManager.replicateInput.updateInputState();
                        creationManager.updateNameEltChoices();
                    }});

            // update step 3 choices based on step 2 defaults
            this.updateNameEltChoices();

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

        updateNameEltChoices(): boolean {
            var availableElts: any[], prevNameElts: LinePropertyDescriptor[],
                newElts: LinePropertyDescriptor[], unusedList: JQuery, unusedChildren: JQuery,
                nameEltsChanged:boolean, self:CreationManager;
            console.log('updating available naming elements');

            //build an updated list of available naming elements based on user entries in step 1
            availableElts = [];
            this.lineProperties.forEach((input: LinePropertyInput): void => {
                var elts: LinePropertyDescriptor[] = input.getNameElements();
                availableElts = availableElts.concat(elts);
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
            self = this;
            $('#line_name_elts').children().each((childIndex:number, childElt) => {
                var element:any, nameElement:NameElement, newEltIndex:number, child:any;

                // start to build up a list of newly-available selections. we'll clear out more of
                // them from the list of unavailable ones
                child = $(childElt);
                nameElement = child.data();

                for(newEltIndex = 0; newEltIndex < newElts.length; newEltIndex++) {
                    element = newElts[newEltIndex];

                    if(element.nameEltGuiId == nameElement.nameEltGuiId) {
                        self.lineNameElements.push(nameElement);
                            newElts.splice(newEltIndex, 1);
                            return true;  // continue outer loop
                    }
                }
                child.remove();
                return true;  // continue looping
             });

            console.log('Available name elements: ' + availableElts);

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
                    console.log('Removing ' + listElement.textContent + ' from unused list');
                    listElement.remove();
                    return true;
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
                    //.css('height', '100%');
            });

            // TODO: skip JSON reconstruction / resulting server request if selected naming
            // elements are the same as before preceding changes added additional unselected
            // options. Note that since the form will never add a naming element automatically,
            // comparing array dimensions is enough
            nameEltsChanged = this.lineNameElements.length != $('#line_name_elts').children().length;
            if(nameEltsChanged) {
                this.queuePreviewUpdate();
                return true;
            }

            $('#step1-next-btn').prop('disabled', availableElts.length === 0);
            $('#step2-next-btn').prop('disabled', this.lineNameElements.length === 0);

            return false;
        }

        updatePreview(): void {
            var self: CreationManager, json: string, csrfToken: string, statusDiv: JQuery,
                allowNonStrains: boolean, isIgnoreIceErrors: boolean, url:string, step3Allowed: boolean;
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
                                .length === 0;
            $('#step2-next-btn').prop('disabled', !step3Allowed);

            // if user went back up and added combinatorial data to step 1, hide step 3 until
            // step 2 is complete
            if(!step3Allowed) {
                 $('#step3').addClass('hide');
                 return;
            }

            // clear preview and return early if insufficient inputs available
            if(!this.lineNameElements.length) {
                $('#step3-status-div').empty().text('Select at least one line name element' +
                    ' above').removeClass('errorMessage');
                $('#line-preview-table').addClass('hide');
                $('create-lines-btn').prop('disabled', true);
                return;
            } else {
                $('#step3-status-div').empty();
            }

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

        buildRequestUrl(dryRun: boolean): string {
            var url: string, params: string[], allowNonStrains: boolean,
                isIgnoreIceErrors: boolean;

            params = [];
            url = '../../describe/';

            if(dryRun) {
                params.push('DRY_RUN=True');
            }

            allowNonStrains = $('#non-strains-opts-chkbx').prop('checked');
            isIgnoreIceErrors = $('#ignore-ice-access-errors-opts-chkbx').prop('checked');

            if(allowNonStrains) {
                params.push(this.ALLOW_NON_STRAIN_PARTS_PARAM + '=True');
            }
            if(isIgnoreIceErrors) {
                params.push( this.IGNORE_ICE_ACCESS_ERRORS_PARAM + '=True');
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
            $('#creation-status-div').text('Success!');
            $('#return-to-study-btn').prop('disabled', false);
            $('#create-more-btn').prop('disabled', false);
        }

        lineCreationError(jqXHR, textStatus: string, errorThrown: string): void {
            var statusDiv, json, error, errors;
            statusDiv = $('#creation-status-div');
            json = jqXHR.responseJSON;

            this.showErrorMessages(statusDiv, json);

            //TODO: update text of the "create more" button to reflect that it'll return you to
            // the form to make adjustments

            //TODO: provide a "retry" button user can click to just repeat the request
        }

        NON_STRAINS_ERR_CATEGORY = 'Non-Strains';
        ICE_ACCESS_ERROR_CATEGORIES = ['ICE part access problem', 'ICE access error'];

        ALLOW_NON_STRAIN_PARTS_PARAM = 'ALLOW_NON_STRAIN_PARTS';
        IGNORE_ICE_ACCESS_ERRORS_PARAM = 'IGNORE_ICE_ACCESS_ERRORS';

        updateStep3Error(jqXHR, textStatus: string, errorThrown: string): void {
            var statusDiv:JQuery, json = jqXHR.responseJSON, errSummary: ErrSummary,
                optionsDiv:JQuery, ignoreIceErrorsDiv:JQuery, nonStrainsDiv: JQuery;

            statusDiv = $('#step3-status-div')
                            .empty()
                            .removeClass('bulk-line-table');

            errSummary = this.showErrorMessages(statusDiv, json);

            // If any ICE-related error has occurred, show options for supported workarounds.
            // Once workarounds have been displayed, they should stay visible so user inputs don't
            // get lost, even as other earlier form entries are altered
            optionsDiv = $('#options-div');
            if(optionsDiv.hasClass('hide') && (errSummary.iceAccessErrors ||
                                               errSummary.nonStrainErrors)) {
                optionsDiv.removeClass('hide');
            }

            if(!optionsDiv.hasClass('hide')) {
                ignoreIceErrorsDiv = $('#ignore-ice-errors-opts-div');
                if(ignoreIceErrorsDiv.hasClass('hide') && errSummary.iceAccessErrors) {
                    ignoreIceErrorsDiv.removeClass('hide');
                }

                nonStrainsDiv = $('#non-strains-opts-div');
                if(nonStrainsDiv.hasClass('hide') && errSummary.nonStrainErrors) {
                    nonStrainsDiv.removeClass('hide');
                }
            }

            $('#line-preview-table').empty()
                .addClass('hide');
        }

        showErrorMessages(parentDiv: JQuery, json: any): ErrSummary
        {
            var errors, tableDiv: JQuery, cell:JQuery, anyNonStrainErr:boolean,
                anyIceAccessError: boolean;
            if(json) {
                errors = json['errors'];

                if(errors) {
                    $('<div>')
                        .text('Error(s):')
                        .addClass('step2_subsection')
                        .appendTo(parentDiv);

                    tableDiv = $('<div>')
                        .addClass('bulk-line-table')
                        .appendTo(parentDiv);

                    errors.forEach((error, index:number) =>
                    {
                        var row: JQuery, cell: JQuery, isIceAccessErr: boolean,
                            isNonStrainErr: boolean;

                        row = $('<div>')
                            .addClass('table-row')
                            .addClass('errorMessage')
                            .appendTo(tableDiv);

                        isNonStrainErr = this.NON_STRAINS_ERR_CATEGORY === error.category;
                        isIceAccessErr = this.ICE_ACCESS_ERROR_CATEGORIES.indexOf(error.category) >=0;


                        if(isNonStrainErr) {
                            row.addClass('non-strains-err-message');
                        }
                        if(isIceAccessErr) {
                            row.addClass('ice-access-err-message');
                        }

                        // blank cell to keep things nested under the major heading
                        cell = $('<div>')
                            .addClass('bulk_lines_table_cell');
                        anyNonStrainErr = anyNonStrainErr ||  isNonStrainErr;
                        anyIceAccessError = anyIceAccessError || isIceAccessErr;

                        // category
                        cell = $('<div>')
                                .text(error.category + ": ")
                                .addClass('bulk_lines_table_cell')
                                .addClass('err-summary-label')
                                .appendTo(row);

                        cell = $('<div>')
                                .text(error.summary)
                                .addClass('bulk_lines_table_cell')
                                .appendTo(row);

                        cell = $('<div>')
                                .text(error.details)
                                .addClass('bulk_lines_table_cell')
                                .appendTo(row);
                    });
                } else {
                    this.addUnexpectedErrResult(parentDiv);
                }
            } else {
                this.addUnexpectedErrResult(parentDiv);
            }

            return new ErrSummary(anyIceAccessError, anyNonStrainErr);
        }

        addUnexpectedErrResult(statusDiv: JQuery): void {
            statusDiv.text('Unexpected error computing line names. ')
                    .addClass('errorMessage');
                $("<button type='button'>")
                    .text(" Retry")
                    .addClass('glyphicon')
                    .addClass('glyphicon-refresh')
                    .on('click', creationManager.queuePreviewUpdate.bind(creationManager))
                    .appendTo(statusDiv);
        }

        updateStep3Summary(responseJson): void {
            var count: number, lines:any, table:JQuery, row:JQuery, cell:JQuery, label:JQuery,
                i: number, duplicatesProp:string;

            count = responseJson['count'];

            if(responseJson.hasOwnProperty('lines')) {
                lines = responseJson['lines'];
            } else {

            }

            this.plannedLineCount = count;

            $('#step3-status-div')
                .empty()
                .removeClass('errorMessage')
                .removeClass('bulk-line-table');

            table = $('#line-preview-table').empty();

            // show # lines to be created
            row = $('<div>').addClass('table-row')
                .appendTo(table);
            cell = $('<div>')
                .addClass('bulk_lines_table_cell')
                .addClass('step2_table_heading')
                .appendTo(row);
            $('<label>').text('Lines to create:')
                .appendTo(cell);
            cell = $('<div>').addClass('bulk_lines_table_cell')
                .appendTo(row);
            $('<label>').text(count)
                .appendTo(cell);

            this.addLineNamesToTable(table, lines, 'Sample line names:');

            table.removeClass('hide');
            $('#create-lines-btn').prop('disabled', false);
        }

        addLineNamesToTable(table:JQuery, lines, lineNamesTitle:string) {
            var i:number, row:JQuery, cell:JQuery;

            // print label for the listing of lines
            row = $('<div>').addClass('table-row')
                .appendTo(table);
            cell = $('<div>')
                .addClass('bulk_lines_table_cell')
                .addClass('step2_table_heading')
                .appendTo(row);
            $('<label>').text(lineNamesTitle)
                .addClass('step2_table_heading')
                .appendTo(cell);

            i = 0;
            for (var lineName in lines) {

                if(i > 0 && i % LINES_PER_ROW === 0) {
                    row = $('<div>').addClass('table-row').appendTo(table);
                    cell = $('<div>').addClass('bulk_lines_table_cell')
                                .appendTo(row);
                }

                cell = $('<div>').addClass('bulk_lines_table_cell')
                    .text(lineName)
                    .appendTo(row);
                i++;
            }
        }

        setLineMetaTypes(metadataTypes:any[]) {
            var self: CreationManager = this,
                lineProps: LinePropertyDescriptor[],
                propertyDescriptor: LinePropertyDescriptor;
            $('#step2_status_div').empty();
            $('#addPropertyButton').prop('disabled', false);

            self.userMetaTypePks = [];

            this.nonAutocompleteLineMetaTypes = [];
            this.autocompleteLineMetaTypes = {};
            this.multivaluedMetaTypePks = [];

            lineProps = [];
            metadataTypes.forEach((meta) => {
                var uiLabel: string, postfix: string, nameEltLabel: string, nameEltJsonId: any;

                // omit "Line Name" and "Description" metadata type from available options. Both
                // options would be confusing for users, since the normal case for this
                // GUI should be to compute line names from combinatorial metadata values, and
                // combinatorial entry of line descriptions isn't really possible
                if (LINE_NAME_META_NAME === meta.type_name ||
                    LINE_DESCRIPTION_META_NAME === meta.type_name) {
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
                } else if (STRAINS_META_NAME === meta.type_name ||
                           CARBON_SOURCE_META_NAME === meta.type_name) {
                    nameEltLabel = meta.type_name.substring(0, meta.type_name.indexOf('(s)')) + ' Name(s)';
                    nameEltJsonId = meta.pk + '__name';
                    propertyDescriptor = new LinePropertyDescriptor(meta.pk, uiLabel,
                                                                    nameEltLabel, nameEltJsonId);
                } else {
                    propertyDescriptor = new LinePropertyDescriptor(meta.pk, uiLabel);
                }

                lineProps.push(propertyDescriptor);
                self.allLineMetaTypes[meta.pk] = meta;  // TODO: still need this?
            });

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
                buttons: {
                    'Add Selected': function() {
                        var propsList: JQuery, selectedItems: JQuery;

                        propsList = $('#line-properties-list');
                        selectedItems = propsList.children('.ui-selected');
                        selectedItems.removeClass('ui-selected').addClass('hide');
                        selectedItems.each((index: number, elt: Element) => {
                            var descriptor: LinePropertyDescriptor = $(elt).data();
                            creationManager.addInput(descriptor);
                        });
                    },
                    'Close': function() {
                        $(this).dialog('close');

                        // de-select anything user left selected
                        $('#line-properties-list')
                            .children('.ui-selected')
                            .removeClass('ui-selected');
                    }
                }
            });

            // add click behavior to the "add property" button
            $('#addPropertyButton')
                .on('click', creationManager.showAddProperty.bind(this));
        }

        showCreatingLinesDialog(): void {
            var dialog: JQuery;
            // disable buttons and set styling to match the rest of EDD
            $('#return-to-study-btn').prop('disabled', true).addClass('actionButton');
            $('#create-more-btn').prop('disabled', true).addClass('actionButton');

            $('#creation-status-div')
                .removeClass('errorMessage')
                .removeClass('successMessage')
                .empty();
            $('#line-count-span').text(this.plannedLineCount);
            $('#creating-lines-dialog').dialog('option', 'title', 'Creating ' + this.plannedLineCount + ' Lines...')
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
            });
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
            });
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

                // TODO: both front and back end need to allow for non-combinatorial
                // manyrelatedfields!
                multiValuedInput = (MULTIVALUED_LINE_META_TYPES.indexOf(
                                                input.lineProperty.inputLabel) >= 0);
                if(multiValuedInput && validInputCount > 1) {
                    // for starters, assume each strain or carbon source specified should result in
                    // creation of a combinatorial group of lines.  later on we can add complexity
                    // to support co-culture.  here we package the list of provided strains in
                    // the format supported by the back end, which should already support
                    // co-cultures.
                    value = input.getValueJson();
                    if(value.constructor === Array) {
                       for(v=0; v<value.length; v++) {
                           value[v] = [value[v]];
                       }
                    } else {
                         value = [value]
                    }
                    combinatorialValues[input.lineProperty.jsonId] = value;

                    return true
                }

                if(validInputCount > 1) {
                    combinatorialValues[input.lineProperty.jsonId] = input.getValueJson();
                }
                else {
                    commonValues[input.lineProperty.jsonId] = input.getValueJson();
                }
            });

            result['combinatorial_line_metadata'] = combinatorialValues;
            result['common_line_metadata'] = commonValues;

            json = JSON.stringify(result);
            return json;
        }
    }

    export const creationManager = new CreationManager();

    // As soon as the window load signal is sent, call back to the server for the set of reference
    // records that will be used to disambiguate labels in imported data.
    export function onDocumentReady(): void {
        creationManager.buildLineCreationDialog();

        creationManager.buildStep1Inputs();
        creationManager.buildStep2Inputs();
        creationManager.buildStep3Inputs();


        // load line metadata types from the REST API. This allows us to display them more
        // responsively if there are many, and also to show them in the
        loadAllLineMetadataTypes();
    }

    // send CSRF header on each AJAX request from this page
    $.ajaxSetup({
        beforeSend: function(xhr) {
            var csrfToken = Utl.EDD.findCSRFToken();
            xhr.setRequestHeader('X-CSRFToken', csrfToken);
        }
    });

}

$(window).on('load', function() {
    StudyLinesAddCombos.onDocumentReady();
});