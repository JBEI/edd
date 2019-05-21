"use strict";

declare var EDDData: EDDData;  // sticking this here as IDE isn't following references

import {
    DataGrid,
    DataGridColumnGroupSpec,
    DataGridColumnSpec,
    DataGridDataCell,
    DataGridHeaderSpec,
    DataGridHeaderWidget,
    DataGridOptionWidget,
    DataGridSpecBase,
    DataGridTableSpec,
    DGSearchWidget,
    DGSelectAllWidget,
} from "../modules/DataGrid";
import * as Forms from "../modules/Forms";
import * as StudyBase from "../modules/Study";
import * as Utl from "../modules/Utl";


// TODO find out a way to do this in Typescript without relying on specific output targets
/* tslint:disable */
declare function require(name: string): any;  // avoiding warnings for require calls below
// as of JQuery UI 1.12, need to require each dependency individually
require('jquery-ui/themes/base/core.css');
require('jquery-ui/themes/base/menu.css');
require('jquery-ui/themes/base/button.css');
require('jquery-ui/themes/base/draggable.css');
require('jquery-ui/themes/base/resizable.css');
require('jquery-ui/themes/base/dialog.css');
require('jquery-ui/themes/base/theme.css');
require('jquery-ui/ui/widgets/button');
require('jquery-ui/ui/widgets/draggable');
require('jquery-ui/ui/widgets/resizable');
require('jquery-ui/ui/widgets/dialog');
/* tslint:enable */
/* tslint:disable:prefer-const */


var linesActionPanelRefreshTimer: NodeJS.Timer;
var attachmentIDs: any;
var attachmentsByID: any;
var prevDescriptionEditElement: any;

var cSourceEntries: any;
var mTypeEntries: any;

// The table spec object and table object for the Lines table.
export var linesDataGridSpec;
export var linesDataGrid;

let studyBaseUrl: URL = Utl.relativeURL('../');

// define managers for forms with metadata
var lineMetadataManager: Forms.FormMetadataManager;
var assayMetadataManager: Forms.FormMetadataManager;
var $window = $(window);


// Called when the page loads.
export function prepareIt() {
    setupHelp();

    attachmentIDs = null;
    attachmentsByID = null;
    prevDescriptionEditElement = null;

    cSourceEntries = [];
    mTypeEntries = [];

    linesDataGridSpec = null;
    linesDataGrid = null;

    linesActionPanelRefreshTimer = null;

    let lineHelp = $('#line-help-content').dialog({
        'title': 'What is a line?',
        'autoOpen': false,
        'position': {
            'my': 'left top',
            'at': 'left bottom+10',
            'of': '#line-help-btn',
        },
    });
    $('#line-help-btn').on('click', () => lineHelp.dialog('open'));

    var helper = new Utl.FileDropZoneHelpers();

    Utl.FileDropZone.create({
        "elementId": "addToLinesDropZone",
        "url": Utl.relativeURL('describe/', studyBaseUrl).toString(),
        "processResponseFn": helper.fileReturnedFromServer.bind(helper),
        "processErrorFn": helper.fileErrorReturnedFromServer.bind(helper),
        "processWarningFn": helper.fileWarningReturnedFromServer.bind(helper),
    });

    $('#content').on('dragover', (e: JQueryMouseEventObject) => {
        e.stopPropagation();
        e.preventDefault();
        $(".linesDropZone").removeClass('off');
    });
    $('#content').on('dragend, dragleave, mouseleave', () => {
        $(".linesDropZone").addClass('off');
    });

    // set up editable study name
    let nameEdit = new StudyBase.EditableStudyName($('#editable-study-name').get()[0]);
    nameEdit.getValue();

    $.ajax({
        'url': '../edddata/',
        'type': 'GET',
        'error': (xhr, status, e) => {
            $('#overviewSection').prepend("<div class='noData'>Error. Please reload</div>");
            $('#loadingLinesDiv').addClass('hide');
        },
        'success': (data) => {
            var hasLines: boolean;
            EDDData = $.extend(EDDData || {}, data);
            // Instantiate a table specification for the Lines table
            linesDataGridSpec = new DataGridSpecLines();
            linesDataGridSpec.init();
            // Instantiate the table itself with the spec
            linesDataGrid = new LineResults(linesDataGridSpec);

            // Show controls that depend on having some lines present to be useful
            hasLines = Object.keys(EDDData.Lines).length !== 0;
            $('#loadingLinesDiv').addClass('hide');
            $('#edUploadDirectionsDiv').removeClass('hide');
            $('.linesRequiredControls').toggleClass('hide', !hasLines);
            $('#noLinesDiv').toggleClass('hide', hasLines);
        },
    });

    // if dialog had errors, open on page reload
    let lineModalForm = $("#editLineModal");
    if (lineModalForm.hasClass('validation_error')) {
        let navbar = $("nav.navbar");
        lineModalForm.removeClass('off').dialog({
            "maxHeight": $window.height() - navbar.height(),
            "maxWidth": $window.width(),
            "minWidth": 500,
            "position": StudyBase.buildModalPosition(),
            "title": "Please correct errors",
        });
    }
}

function setupHelp() {
    // for consistency with other pages, use JQuery UI to set tool tip, even though it will
    // actually launch a new tab
    $('#ed-help-btn').tooltip();

     // launch a dialog instead of tool-tip to be more mobile-friendly
    let linesHelp = $('#line-help-content').dialog({
        'title': "What is a line?",
        'autoOpen': false,
        'modal': true,
        'resizable': true,
        'position': {
            'my': "left top",
            'at': "left bottom",
            'of': "#line-help-btn",
        },
    });

    $('#line-help-btn').on('click', () => linesHelp.dialog('open'));
}


// Called by DataGrid after the Lines table is rendered
export function prepareAfterLinesTable() {
    const parent: JQuery = $('#studyLinesTable').parent();
    const helpBadge: JQuery = $('.move');
    const input: JQuery = $('.tableControl').last();
    const position = StudyBase.buildModalPosition();
    const navbar = $("nav.navbar");
    // Enable add new Line button
    parent.find('.addNewLineButton').on('click', (ev: JQueryMouseEventObject): boolean => {
        showLineEditDialog($());
        return false;
    });
    // Enable edit lines button
    parent.find('.editButton').on('click', (ev: JQueryMouseEventObject): boolean => {
        showLineEditDialog($('#studyLinesTable').find('[name=lineId]:checked'));
        return false;
    });

    $(helpBadge).insertAfter(input).removeClass('off');

    // Set up jQuery modals
    const lineModalForm = $("#editLineModal");
    lineModalForm.dialog(StudyBase.dialogDefaults({
        "minWidth": 500,
    }));
    lineMetadataManager = new Forms.FormMetadataManager(lineModalForm, "line");
    const assayModalForm = $("#addAssayModal");
    assayModalForm.dialog(StudyBase.dialogDefaults({
        "minWidth": 500,
    }));
    assayMetadataManager = new Forms.FormMetadataManager(assayModalForm, "assay");
    $("#exportModal").dialog(StudyBase.dialogDefaults({
        "maxHeight": 400,
        "minWidth": 400,
    }));

    parent.find(".addAssayButton").click(function() {
        // copy inputs to the modal form
        const inputs = $('#studyLinesTable').find('input[name=lineId]:checked').clone();
        assayModalForm
            .find('.hidden-line-inputs')
                .empty()
                .append(inputs)
            .end()
            .removeClass('off')
            .dialog(StudyBase.dialogDefaults({
                "minWidth": 500,
            }))
            .dialog('open');
        return false;
    });

    parent.find(".exportLineButton").click(function() {
        const table = $('#studyLinesTable').clone();
        const form = $('#exportForm');
        $("#exportModal").removeClass('off').dialog( "open" );
        includeAllLinesIfEmpty(form);
        // add table to form as hidden field.
        form.append(table.hide());
        return false;
    });

    parent.find('.worklistButton').click(function () {
        const table = $('#studyLinesTable').clone();
        const form = $('#exportForm');
        includeAllLinesIfEmpty(form);
        form.append(table.hide())
            .find('select[name=export]').val('worklist').end()
            .find('button[name=action]').click().end();
        return false;
    });

    // make sure the action bar is always visible
    StudyBase.overlayContent($("#actionsBar"));
}

function includeAllLinesIfEmpty(form) {
    if ($('#studyLinesTable').find('input[name=lineId]:checked').length === 0) {
        // append study id to form
        $('<input>').attr({
            "name": 'studyId',
            "type": 'hidden',
            "value": EDDData.currentStudyID,
        }).appendTo(form);
    }
}


// Start a timer to wait before calling the routine that shows the actions panel.
export function queueLinesActionPanelShow() {
    if (linesActionPanelRefreshTimer) {
        clearTimeout(linesActionPanelRefreshTimer);
    }
    linesActionPanelRefreshTimer = setTimeout(linesActionPanelShow, 150);
}


function linesActionPanelShow() {
    // Figure out how many lines are selected.
    var checkedBoxes = [], checkedBoxLen: number;
    if (linesDataGrid) {
        checkedBoxes = linesDataGrid.getSelectedCheckboxElements();
    }
    if (Object.keys(EDDData.Lines).length === 0) {
        $('.lineExplanation').css('display', 'block');
        $('.actionsBar').addClass('off');
    } else {
        checkedBoxLen = checkedBoxes.length;
        $('.linesSelectedCell').empty().text(checkedBoxLen + ' selected');
        $('.disablableButtons > button').prop('disabled', !checkedBoxLen);
    }
}


function showLineEditDialog(selection: JQuery): void {
    const form = $("#editLineModal");
    let titleText: string;
    let record: LineRecord;
    let contact: StudyBase.EDDContact;
    let experimenter: StudyBase.EDDContact;

    // Update the dialog title and fetch selection info
    if (selection.length === 0) {
        titleText = $("#new_line_title").text();
    } else if (selection.length > 1) {
        titleText = $("#bulk_line_title").text();
        // merge all selected items into a single record
        record = selection.toArray()
            .map((elem: Element): LineRecord => Utl.lookup(EDDData.Lines, $(elem).val()))
            .reduce(StudyBase.mergeLines);
        contact = new StudyBase.EDDContact(record.contact);
        experimenter = new StudyBase.EDDContact(record.experimenter);
    } else if (selection.length === 1) {
        titleText = $("#edit_line_title").text();
        record = Utl.lookup(EDDData.Lines, selection.val());
        contact = new StudyBase.EDDContact(record.contact);
        experimenter = new StudyBase.EDDContact(record.experimenter);
    }
    form.dialog({"title": titleText});

    // create object to handle form interactions
    const formManager = new Forms.BulkFormManager(form, "line");
    const str = (x: any): string => "" + (x || "");  // forces values to string, falsy === ""
    // define fields on form
    type Pair = [string, string];  // this gets used below to disambiguate Autocomplete renders
    const fields: {[name: string]: Forms.IFormField} = {
        "name": new Forms.Field(form.find("[name=line-name]"), "name"),
        "description": new Forms.Field(form.find("[name=line-description]"), "description"),
        "control": new Forms.Checkbox(form.find("[name=line-control]"), "control"),
        "contact": new Forms.Autocomplete(
                form.find("[name=line-contact_0"),
                form.find("[name=line-contact_1"),
                "contact",
            )
            .render((): Pair => [contact.display(), str(contact.id())]),
        "experimenter": new Forms.Autocomplete(
                form.find("[name=line-experimenter_0"),
                form.find("[name=line-experimenter_1"),
                "experimenter",
            )
            .render((): Pair => [experimenter.display(), str(experimenter.id())]),
        "carbon": new Forms.Autocomplete(
                form.find("[name=line-carbon_source_0"),
                form.find("[name=line-carbon_source_1"),
                "carbon",
            )
            .render((r): Pair => {
                const list = r.carbon || [];
                const names = list.map((v) => Utl.lookup(EDDData.CSources, v).name || "--");
                return [names.join(", "), list.join(",")];
            }),
        "strain": new Forms.Autocomplete(
                form.find("[name=line-strains_0"),
                form.find("[name=line-strains_1"),
                "strain",
            )
            .render((r): Pair => {
                const list = r.strain || [];
                const names = list.map((v) => Utl.lookup(EDDData.Strains, v).name || "--");
                const uuids = list.map((v) => Utl.lookup(EDDData.Strains, v).registry_id || "");
                return [names.join(", "), uuids.join(",")];
            }),
    };
    // initialize the form to clean slate, pass in active selection, selector for previous items
    formManager
        .init(selection, "[name=lineId]")
        .fields($.map(fields, (v: Forms.IFormField) => v));
    lineMetadataManager.reset();
    if (record !== undefined) {
        formManager.fill(record);
        lineMetadataManager.metadata(record.meta);
    }

    // special case, ignore name field when editing multiples
    if (selection.length > 1) {
        form.find('[name=line-name]')
            // remove required property
            .prop('required', false)
            // also hide form elements and uncheck bulk box
            .parent()
                .hide()
                .find(':checkbox').prop('checked', false).end()
            .end();
    } else {
        form.find('[name=line-name]')
            // make sure line name is required
            .prop('required', true)
                // and line name is shown
                .parent().show().end()
            .end();
    }

    // display modal dialog
    form.removeClass('off').dialog( "open" );
}


class LineResults extends DataGrid {

    constructor(dataGridSpec: DataGridSpecBase) {
        super(dataGridSpec);
    }

    _getClasses(): string {
        return 'dataTable sortable dragboxes hastablecontrols table-striped';
    }

}


class DGSelectAllLinesWidget extends DGSelectAllWidget {

    clickHandler(): void {
        super.clickHandler();
        // update selected text
        var checkedBoxLen = $('#studyLinesTable')
            .find('tbody input[type=checkbox]:checked')
            .length;
        $('.linesSelectedCell').empty().text(checkedBoxLen + ' selected');
        queueLinesActionPanelShow();
     }
}


// The spec object that will be passed to DataGrid to create the Lines table
class DataGridSpecLines extends DataGridSpecBase {

    metaDataIDsUsedInLines: any;
    groupIDsInOrder: any;
    groupIDsToGroupIndexes: any;
    groupIDsToGroupNames: any;

    init() {
        this.findMetaDataIDsUsedInLines();
        this.findGroupIDsAndNames();
        super.init();
    }

    findMetaDataIDsUsedInLines() {
        var seenHash: any = {};
        // loop lines
        $.each(this.getRecordIDs(), (index, id) => {
            var line = EDDData.Lines[id];
            if (line) {
                $.each(line.meta || {}, (key) => seenHash[key] = true);
            }
        });
        // store all metadata IDs seen
        this.metaDataIDsUsedInLines = Object.keys(seenHash);
    }

    findGroupIDsAndNames() {
        var rowGroups = {};
        // Gather all the row IDs under the group ID each belongs to.
        $.each(this.getRecordIDs(), (index, id) => {
            var line = EDDData.Lines[id], rep = line.replicate;
            if (rep) {
                // use parent replicate as a replicate group ID, push all matching line IDs
                (rowGroups[rep] = rowGroups[rep] || [ rep ]).push(id);
            }
        });
        this.groupIDsToGroupNames = {};
        // For each group ID, just use parent replicate name
        $.each(rowGroups, (group: any, lines) => {
            if (typeof(EDDData.Lines[group]) === undefined ||
                    typeof(EDDData.Lines[group].name) === undefined ) {
                return;
            } else {
                this.groupIDsToGroupNames[group] = EDDData.Lines[group].name;
            }
        });
        // alphanumeric sort of group IDs by name attached to those replicate groups
        this.groupIDsInOrder = Object.keys(rowGroups).sort((a, b) => {
            var u: string = this.groupIDsToGroupNames[a], v: string = this.groupIDsToGroupNames[b];
            return u < v ? -1 : u > v ? 1 : 0;
        });
        // Now that they're sorted by name, create a hash for quickly resolving IDs to indexes in
        // the sorted array
        this.groupIDsToGroupIndexes = {};
        $.each(
            this.groupIDsInOrder,
            (index, group) => { this.groupIDsToGroupIndexes[group] = index; },
        );
    }

    // Specification for the table as a whole
    defineTableSpec(): DataGridTableSpec {
        return new DataGridTableSpec('lines', { 'name': 'Lines' });
    }

    private loadLineName(index: string): string {
        var line = EDDData.Lines[index];
        if (line) {
            return line.name.toUpperCase();
        }
        return '';
    }

    private loadLineDescription(index: string): string {
        var line = EDDData.Lines[index];
        if (line) {
            if (line.description != null) {
                return line.description.toUpperCase();
            }
        }
        return '';
    }

    private loadStrainName(index: string): string {
        // ensure a strain ID exists on line, is a known strain, uppercase first found name or '?'
        let line = EDDData.Lines[index];
        if (line) {
            if (line.strain && line.strain.length) {
                let strain = EDDData.Strains[line.strain[0]];
                if (strain) {
                    return strain.name.toUpperCase();
                }
            }
        }
        return '?';
    }

    private loadFirstCarbonSource(index: string): any {
        // ensure carbon source ID(s) exist on line, ensure at least one source ID, ensure first ID
        // is known carbon source
        var line = EDDData.Lines[index];
        if (line) {
            if (line.carbon && line.carbon.length) {
                let source = EDDData.CSources[line.carbon[0]];
                if (source) {
                    return source;
                }
            }
        }
        return undefined;
    }

    private loadCarbonSource(index: string): string {
        var source = this.loadFirstCarbonSource(index);
        if (source) {
            return source.name.toUpperCase();
        }
        return '?';
    }

    private loadCarbonSourceLabeling(index: string): string {
        var source = this.loadFirstCarbonSource(index);
        if (source) {
            return source.labeling.toUpperCase();
        }
        return '?';
    }

    private loadExperimenterInitials(index: string): string {
        // ensure index ID exists, ensure experimenter user ID exists, uppercase initials or ?
        let line = EDDData.Lines[index];
        if (line) {
            let experimenter = EDDData.Users[line.experimenter];
            if (experimenter) {
                return experimenter.initials.toUpperCase();
            }
        }
        return '?';
    }

    private loadLineModification(index: string): number {
        let line = EDDData.Lines[index];
        if (line) {
            return line.modified.time;
        }
        return undefined;
    }

    // Specification for the headers along the top of the table
    defineHeaderSpec(): DataGridHeaderSpec[] {
        var leftSide: DataGridHeaderSpec[] = [
            new DataGridHeaderSpec(1, 'hLinesName', {
                'name': 'Name',
                'sortBy': this.loadLineName,
            }),
            new DataGridHeaderSpec(2, 'hLinesDescription', {
                'name': 'Description',
                'sortBy': this.loadLineDescription,
                'sortAfter': 0,
            }),
            new DataGridHeaderSpec(3, 'hLinesStrain', {
                'name': 'Strain',
                'sortBy': this.loadStrainName,
                'sortAfter': 0,
            }),
            new DataGridHeaderSpec(4, 'hLinesCarbon', {
                'name': 'Carbon Source(s)',
                'size': 's',
                'sortBy': this.loadCarbonSource,
                'sortAfter': 0,
            }),
            new DataGridHeaderSpec(5, 'hLinesLabeling', {
                'name': 'Labeling',
                'size': 's',
                'sortBy': this.loadCarbonSourceLabeling,
                'sortAfter': 0,
            }),
        ];

        // map all metadata IDs to HeaderSpec objects
        var metaDataHeaders: DataGridHeaderSpec[] = this.metaDataIDsUsedInLines
            .map((id, index) => {
                var mdType = EDDData.MetaDataTypes[id];
                return new DataGridHeaderSpec(6 + index, 'hLinesMeta' + id, {
                    'name': mdType.name,
                    'size': 's',
                    'sortBy': this.makeMetaDataSortFunction(id),
                    'sortAfter': 0,
                });
            });

        var rightSide = [
            new DataGridHeaderSpec(6 + metaDataHeaders.length, 'hLinesExperimenter', {
                'name': 'Experimenter',
                'size': 's',
                'sortBy': this.loadExperimenterInitials,
                'sortAfter': 0,
            }),
            new DataGridHeaderSpec(7 + metaDataHeaders.length, 'hLinesModified', {
                'name': 'Last Modified',
                'size': 's',
                'sortBy': this.loadLineModification,
                'sortAfter': 0,
            }),
        ];

        return leftSide.concat(metaDataHeaders, rightSide);
    }

    private makeMetaDataSortFunction(id: string) {
        return (i: string) => {
            var line = EDDData.Lines[i];
            if (line && line.meta) {
                return line.meta[id] || '';
            }
            return '';
        };
    }

    // The colspan value for all the cells that are not 'carbon source' or 'labeling'
    // is based on the number of carbon sources for the respective record.
    // Specifically, it's either the number of carbon sources, or 1, whichever is higher.
    private rowSpanForRecord(index) {
        return (EDDData.Lines[index].carbon || []).length || 1;
    }

    generateLineNameCells(gridSpec: DataGridSpecLines, index: string): DataGridDataCell[] {
        var line = EDDData.Lines[index];
        return [
            new DataGridDataCell(gridSpec, index, {
                'checkboxName': 'lineId',
                'checkboxWithID': (id) => 'line' + id + 'include',
                'hoverEffect': true,
                'nowrap': true,
                'rowspan': gridSpec.rowSpanForRecord(index),
                'contentString': line.name + (line.ctrl ? '<b class="iscontroldata">C</b>' : ''),
            }),
        ];
    }

    generateStrainNameCells(gridSpec: DataGridSpecLines, index: string): DataGridDataCell[] {
        var line = EDDData.Lines[index], content = [];
        if (line) {
            content = line.strain.map((id) => {
                var strain = EDDData.Strains[id];
                if (strain.registry_url) {
                    let link = $('<a>')
                        .attr('href', strain.registry_url)
                        .attr('target', '_blank')
                        .html(strain.name);
                    // render the element to text
                    return link[0].outerHTML;
                }
                return strain.name;
            });
        }
        return [
            new DataGridDataCell(gridSpec, index, {
                'rowspan': gridSpec.rowSpanForRecord(index),
                'contentString': content.join('; ') || '--',
            }),
        ];
    }

    generateDescriptionCells(gridSpec: DataGridSpecLines, index: string): DataGridDataCell[] {
        var line = EDDData.Lines[index], strings = '--';
        if (line) {
            if (line.description && line.description.length) {
                strings = line.description;
            }
        }
        return [
            new DataGridDataCell(gridSpec, index, {
                'rowspan': gridSpec.rowSpanForRecord(index),
                'contentString': strings,
            }),
        ];
    }

    generateCarbonSourceCells(gridSpec: DataGridSpecLines, index: string): DataGridDataCell[] {
        var line = EDDData.Lines[index], strings = ['--'];
        if (line) {
            if (line.carbon && line.carbon.length) {
                strings = line.carbon.map((id) => EDDData.CSources[id].name);
            }
        }
        return strings.map((name) => {
            return new DataGridDataCell(gridSpec, index, { 'contentString': name });
        });
    }

    generateCarbonSourceLabelingCells(
            gridSpec: DataGridSpecLines,
            index: string): DataGridDataCell[] {
        var line = EDDData.Lines[index], strings = ['--'];
        if (line) {
            if (line.carbon && line.carbon.length) {
                strings = line.carbon.map((id) => EDDData.CSources[id].labeling);
            }
        }
        return strings.map((labeling) => {
            return new DataGridDataCell(gridSpec, index, { 'contentString': labeling });
        });
    }

    generateExperimenterInitialsCells(
            gridSpec: DataGridSpecLines,
            index: string): DataGridDataCell[] {
        let line = EDDData.Lines[index], content;
        if (line) {
            let exp = EDDData.Users[line.experimenter];
            if (EDDData.Users && exp) {
                content = exp.initials;
            }
        }
        return [
            new DataGridDataCell(gridSpec, index, {
                'rowspan': gridSpec.rowSpanForRecord(index),
                'contentString': content || '?',
            }),
        ];
    }

    generateModificationDateCells(
            gridSpec: DataGridSpecLines,
            index: string): DataGridDataCell[] {
        return [
            new DataGridDataCell(gridSpec, index, {
                'rowspan': gridSpec.rowSpanForRecord(index),
                'contentString': Utl.JS.timestampToTodayString(EDDData.Lines[index].modified.time),
            }),
        ];
    }

    makeMetaDataCellsGeneratorFunction(id) {
        return (gridSpec: DataGridSpecLines, index: string): DataGridDataCell[] => {
            let line = EDDData.Lines[index];
            let type = EDDData.MetaDataTypes[id];
            let contentStr = line.meta[id] || '';
            if (line && type && line.meta && contentStr) {
                contentStr = [
                    type.prefix || '',
                    contentStr,
                    type.postfix || '',
                ].join(' ').trim();
            }
            return [
                new DataGridDataCell(gridSpec, index, {
                    'rowspan': gridSpec.rowSpanForRecord(index),
                    'contentString': contentStr,
                }),
            ];
        };
    }

    // Specification for each of the data columns that will make up the body of the table
    defineColumnSpec(): DataGridColumnSpec[] {
        let leftSide: DataGridColumnSpec[];
        let metaDataCols: DataGridColumnSpec[];
        let rightSide: DataGridColumnSpec[];
        leftSide = [
            new DataGridColumnSpec(1, this.generateLineNameCells),
            new DataGridColumnSpec(2, this.generateDescriptionCells),
            new DataGridColumnSpec(3, this.generateStrainNameCells),
            new DataGridColumnSpec(4, this.generateCarbonSourceCells),
            new DataGridColumnSpec(5, this.generateCarbonSourceLabelingCells),
        ];
        metaDataCols = this.metaDataIDsUsedInLines.map((id, index) => {
            return new DataGridColumnSpec(6 + index, this.makeMetaDataCellsGeneratorFunction(id));
        });
        rightSide = [
            new DataGridColumnSpec(
                6 + metaDataCols.length, this.generateExperimenterInitialsCells,
            ),
            new DataGridColumnSpec(
                7 + metaDataCols.length, this.generateModificationDateCells,
            ),
        ];

        return leftSide.concat(metaDataCols, rightSide);
    }

    // Specification for each of the groups that the headers and data columns are organized into
    defineColumnGroupSpec(): DataGridColumnGroupSpec[] {
        var topSection: DataGridColumnGroupSpec[] = [
            new DataGridColumnGroupSpec('Line Name', { 'showInVisibilityList': false }),
            new DataGridColumnGroupSpec('Description'),
            new DataGridColumnGroupSpec('Strain'),
            new DataGridColumnGroupSpec('Carbon Source(s)'),
            new DataGridColumnGroupSpec('Labeling'),
        ];

        var metaDataColGroups: DataGridColumnGroupSpec[];
        metaDataColGroups = this.metaDataIDsUsedInLines.map((id, index) => {
            var mdType = EDDData.MetaDataTypes[id];
            return new DataGridColumnGroupSpec(mdType.name);
        });

        var bottomSection: DataGridColumnGroupSpec[] = [
            new DataGridColumnGroupSpec('Experimenter', { 'hiddenByDefault': true }),
            new DataGridColumnGroupSpec('Last Modified', { 'hiddenByDefault': true }),
        ];

        return topSection.concat(metaDataColGroups, bottomSection);
    }

    // Specification for the groups that rows can be gathered into
    defineRowGroupSpec(): any {

        var rowGroupSpec = [];
        for (let id of this.groupIDsInOrder) {
            var rowGroupSpecEntry: any = {    // Groups are numbered starting from 0
                "name": this.groupIDsToGroupNames[id],
            };
            rowGroupSpec.push(rowGroupSpecEntry);
        }

        return rowGroupSpec;
    }

    // The table element on the page that will be turned into the DataGrid.  Any preexisting table
    // content will be removed.
    getTableElement() {
        return document.getElementById("studyLinesTable");
    }

    // An array of unique identifiers (numbers, not strings), used to identify the records in the
    // data set being displayed
    getRecordIDs() {
        return Object.keys(EDDData.Lines);
    }

    // This is called to generate the array of custom header widgets. The order
    // of the array will be the order they are added to the header bar. It's
    // perfectly fine to return an empty array.
    createCustomHeaderWidgets(dataGrid: DataGrid): DataGridHeaderWidget[] {
        var widgetSet: DataGridHeaderWidget[] = [];

        // Create a single widget for substring searching
        var searchLinesWidget = new DGLinesSearchWidget(dataGrid, this, 'Search Lines', 30, false);
        widgetSet.push(searchLinesWidget);
        // A "select all / select none" button
        var selectAllWidget = new DGSelectAllLinesWidget(dataGrid, this);
        selectAllWidget.displayBeforeViewMenu(true);
        widgetSet.push(selectAllWidget);
        return widgetSet;
    }

    // This is called to generate the array of custom options menu widgets. The order of the array
    // will be the order they are displayed in the menu. Empty array = OK.
    createCustomOptionsWidgets(dataGrid: DataGrid): DataGridOptionWidget[] {
        var widgetSet: DataGridOptionWidget[] = [];
        var disabledLinesWidget = new DGDisabledLinesWidget(dataGrid, this);
        widgetSet.push(disabledLinesWidget);
        return widgetSet;
    }

    // This is called after everything is initialized, including the creation of the table content.
    onInitialized(dataGrid: DataGrid): void {

        // Wire up the 'action panels' for the Lines and Assays sections
        var linesTable = this.getTableElement();
        $(linesTable).on('change', ':checkbox', () => queueLinesActionPanelShow());

        // Wire-in our custom edit fields for the Studies page, and continue with general init
        prepareAfterLinesTable();
    }
}

// When unchecked, this hides the set of Lines that are marked as disabled.
class DGDisabledLinesWidget extends DataGridOptionWidget {

    createElements(uniqueID: any): void {
        var cbID: string = this.dataGridSpec.tableSpec.id + 'ShowDLinesCB' + uniqueID;
        var cb: any = this._createCheckbox(cbID, cbID, '1');
        $(cb).click( (e: any) => this.dataGridOwnerObject.clickedOptionWidget(e) );
        if (this.isEnabledByDefault()) {
            cb.setAttribute('checked', 'checked');
        }
        this.checkBoxElement = cb;
        this.labelElement = this._createLabel('Show Disabled', cbID);
        this._createdElements = true;
    }

    applyFilterToIDs(rowIDs: string[]): string[] {
        var checked: boolean = false;
        if (this.checkBoxElement.checked) {
            checked = true;
        }
        // If the box is checked, return the set of IDs unfiltered
        if (checked && rowIDs) {
            $(".enableButton").removeClass('off');
            return rowIDs;
        } else {
            $(".enableButton").addClass('off');
        }

        var filteredIDs = [];
        for (let id of rowIDs) {
            // Here is the condition that determines whether the rows associated with this ID are
            // shown or hidden.
            if (EDDData.Lines[id].active) {
                filteredIDs.push(id);
            }
        }
        return filteredIDs;
    }

    initialFormatRowElementsForID(dataRowObjects: any, rowID: string): void {
        if (!EDDData.Lines[rowID].active) {
            $.each(dataRowObjects, (x, row) => {
                $(row.getElement()).addClass('disabledRecord');
            });
        }
    }
}

// This is a DataGridHeaderWidget derived from DGSearchWidget. It's a search field that offers
// options for additional data types, querying the server for results.
class DGLinesSearchWidget extends DGSearchWidget {

    searchDisclosureElement: any;

    constructor(
            dataGridOwnerObject: any,
            dataGridSpec: any,
            placeHolder: string,
            size: number,
            getsFocus: boolean) {
        super(dataGridOwnerObject, dataGridSpec, placeHolder, size, getsFocus);
    }

    // The uniqueID is provided to assist the widget in avoiding collisions when creating input
    // element labels or other things requiring an ID.
    createElements(uniqueID: any): void {
        super.createElements(uniqueID);
        this.createdElements(true);
    }

    // This is called to append the widget elements beneath the given element. If the elements have
    // not been created yet, they are created, and the uniqueID is passed along.
    appendElements(container: any, uniqueID: any): void {
        if (!this.createdElements()) {
            this.createElements(uniqueID);
        }
        container.appendChild(this.element);
    }
}


// use JQuery ready event shortcut to call prepareIt when page is ready
$(prepareIt);
