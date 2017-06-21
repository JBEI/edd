declare var require: any;
declare var EDDData:EDDData;  // sticking this here as IDE isn't following references


import {DataGrid, DataGridSpecBase, DataGridDataCell, DataGridColumnSpec,
        DataGridTableSpec, DataGridHeaderWidget, DataGridColumnGroupSpec,
        DataGridHeaderSpec, DGSelectAllWidget, DataGridOptionWidget, DGSearchWidget
        } from "../modules/DataGrid"
import { Utl } from "../modules/Utl"
import { FileDropZone } from "../modules/FileDropZone"
import { StudyMetabolicMapChooser, MetabolicMapChooserResult, FullStudyBiomassUI,
        FullStudyBiomassUIResultsCallback } from "../modules/BiomassCalculationUI"
import { CarbonBalance } from "../modules/StudyCarbonBalance"
import { StudyBase } from "../modules/Study"
import * as _ from "underscore"

module StudyLines {
    'use strict';

    var linesActionPanelRefreshTimer:any;
    var positionActionsBarTimer:any;
    var attachmentIDs:any;
    var attachmentsByID:any;
    var prevDescriptionEditElement:any;

    // We can have a valid metabolic map but no valid biomass calculation.
    // If they try to show carbon balance in that case, we'll bring up the UI to
    // calculate biomass for the specified metabolic map.
    export var metabolicMapID:any;
    export var metabolicMapName:any;
    export var biomassCalculation:number;
    var carbonBalanceData:any;
    var carbonBalanceDisplayIsFresh:boolean;

    var cSourceEntries:any;
    var mTypeEntries:any;

    // The table spec object and table object for the Lines table.
    export var linesDataGridSpec;
    export var linesDataGrid;
    // We use our own flag to ensure we don't get into an infinite event loop,
    // switching back and forth between positions that might trigger resize events.
    export var actionPanelIsInBottomBar;
    export var actionPanelIsCopied = false;
    export var fileUploadProgressBar: Utl.ProgressBar;


    // Called when the page loads.
    export function prepareIt() {

        carbonBalanceData = null;
        carbonBalanceDisplayIsFresh = false;

        attachmentIDs = null;
        attachmentsByID = null;
        prevDescriptionEditElement = null;

        metabolicMapID = -1;
        metabolicMapName = null;
        biomassCalculation = -1;

        cSourceEntries = [];
        mTypeEntries = [];

        linesDataGridSpec = null;
        linesDataGrid = null;

        actionPanelIsInBottomBar = false;

        linesActionPanelRefreshTimer = null;
        positionActionsBarTimer = null;

        this.fileUploadProgressBar = new Utl.ProgressBar('fileUploadProgressBar');
        var fileDropZoneHelper = new FileDropZone.FileDropZoneHelpers({
           pageRedirect: '',
           haveInputData: false,
        });

        Utl.FileDropZone.create({
            elementId: "addToLinesDropZone",
            fileInitFn: fileDropZoneHelper.fileDropped.bind(fileDropZoneHelper),
            processRawFn: fileDropZoneHelper.fileRead.bind(fileDropZoneHelper),
            url: '/study/' + EDDData.currentStudyID + '/describe/',
            processResponseFn: fileDropZoneHelper.fileReturnedFromServer.bind(fileDropZoneHelper),
            processErrorFn: fileDropZoneHelper.fileErrorReturnedFromServer.bind(fileDropZoneHelper),
            processWarningFn: fileDropZoneHelper.fileWarningReturnedFromServer.bind(fileDropZoneHelper),
            progressBar: this.fileUploadProgressBar
        });

        $('#content').on('dragover', function(e:any) {
            e.stopPropagation();
            e.preventDefault();
            $(".linesDropZone").removeClass('off');
        });
        $('#content').on('dragend, dragleave, mouseleave', function(e:any) {
           $(".linesDropZone").addClass('off');
        });

        //set up editable study name
        new StudyBase.EditableStudyName($('#editable-study-name').get()[0]);

        $('#content').tooltip({
            content: function () {
                return $(this).prop('title');
            },
            position: { my: "left-10 center", at: "right center" },
            show: null,
            close: function (event, ui:any) {
                ui.tooltip.hover(
                function () {
                    $(this).stop(true).fadeTo(400, 1);
                },
                function () {
                    $(this).fadeOut("400", function () {
                        $(this).remove();
                    })
                });
            }
        });

        $(window).on('resize', queuePositionActionsBar);

        //when all ajax requests are finished, determine if there are AssayMeasurements.
        $(document).ajaxStop(function() {
            // hide export button if there are no assays
            if (_.keys(EDDData.Assays).length === 0) {
                $('#exportLineButton').prop('disabled', true);
            }
            else {
                $('#exportLineButton').prop('disabled', false);
            }
        });

        $.ajax({
            'url': '../edddata/',
            'type': 'GET',
            'error': (xhr, status, e) => {
                $('#overviewSection').prepend("<div class='noData'>Error. Please reload</div>");
                console.log(['Loading EDDData failed: ', status, ';', e].join(''));
            },
            'success': (data) => {
                EDDData = $.extend(EDDData || {}, data);
                // Instantiate a table specification for the Lines table
                StudyLines.linesDataGridSpec = new DataGridSpecLines();
                StudyLines.linesDataGridSpec.init();
                // Instantiate the table itself with the spec
                StudyLines.linesDataGrid = new LineResults(this.linesDataGridSpec);

                // Show possible next steps div if needed
                if (_.keys(EDDData.Lines).length === 0) {
                    $('.noLines').css('display', 'block');
                } else {
                    $('.noLines').css('display', 'none');
                }
            }
        });
    }

    export function processCarbonBalanceData() {
        // Prepare the carbon balance graph
        this.carbonBalanceData = new CarbonBalance.Display();
        var highlightCarbonBalanceWidget = false;
        if ( this.biomassCalculation > -1 ) {
            this.carbonBalanceData.calculateCarbonBalances(this.metabolicMapID,
                    this.biomassCalculation);
            // Highlight the "Show Carbon Balance" checkbox in red if there are CB issues.
            if (this.carbonBalanceData.getNumberOfImbalances() > 0) {
                highlightCarbonBalanceWidget = true;
            }
        } else {
            // Highlight the carbon balance in red to indicate that we can't calculate
            // carbon balances yet. When they click the checkbox, we'll get them to
            // specify which SBML file to use for biomass.
            highlightCarbonBalanceWidget = true;
        }
        this.linesDataGridSpec.highlightCarbonBalanceWidget(highlightCarbonBalanceWidget);
    }


    // Called by DataGrid after the Lines table is rendered
    export function prepareAfterLinesTable() {

        var parent: JQuery = $('#studyLinesTable').parent(), helpBadge:JQuery, input: JQuery;
            input = $('.tableControl').last();
            helpBadge = $('.move');
        // Enable add new Line button
        parent.find('.addNewLineButton').on('click', (ev:JQueryMouseEventObject):boolean => {
            ev.preventDefault();
            ev.stopPropagation();
            StudyLines.editLines([]);
            return false;
        });

        // Enable edit lines button
        parent.find('.editButton').on('click', (ev:JQueryMouseEventObject):boolean => {
            var button = $(ev.target), data = button.data();
            ev.preventDefault();
            StudyLines.editLines(data.ids || []);
            return false;
        });

        $(helpBadge).insertAfter(input);

        // Set up jQuery modals
        $("#editLineModal").dialog({ minWidth: 500, autoOpen: false });
        $("#addAssayModal").dialog({ minWidth: 500, autoOpen: false });
        $("#exportModal").dialog({
            minWidth: 400,
            autoOpen: false,
            minHeight: 0,
            create: function() {
                $(this).css("maxHeight", 400);
            }
        });

        parent.find(".addAssayButton").click(function() {
            $("#addAssayModal").removeClass('off').dialog( "open" );
            return false;
        });

        parent.find(".exportLineButton").click(function() {
            $("#exportModal").removeClass('off').dialog( "open" );
            includeAllLinesIfEmpty();
            //add table to form as hidden field.
            var table = $('#studyLinesTable').clone();
            $('#exportForm').append(table);
            table.hide();
            return false;
        });

        parent.find('.worklistButton').click(function () {
            includeAllLinesIfEmpty();
            var table = $('#studyLinesTable').clone();
            $('#exportForm').append(table);
            table.hide();
            $('select[name="export"]').val('worklist');
            $('button[value="line_action"]').click();
        });

        //when the input value changes, assign a pre or postfix to the metadata if one exists
        var value: any = $('.edd-label').children('input')[1];

        $(value).on("change",function() {
             var val: any = $(value).val(),
                type: MetadataTypeRecord = EDDData.MetaDataTypes[val],
                input = $('.line-meta-value'),
                line = $(this).parents('.line-edit-meta');

             //remove post and prefix meta values
             line.find('.meta-postfix').remove();
             line.find('.meta-prefix').remove();

             if (type) {
                 if (type.pre) {
                    $('<span>').addClass('meta-prefix').text(type.pre).insertBefore(input);
                 }

                 if (type.postfix) {
                    $('<span>').addClass('meta-postfix').text(type.postfix).insertAfter(input);
                 }
             }
         });

        $('#editLineModal').on('change', '.line-meta', (ev) => {
            // watch for changes to metadata values, and serialize to the meta_store field
            var form = $(ev.target).closest('form'),
                metaIn:any = form.find('[name=line-meta_store]'),
                meta:number | string = JSON.parse(metaIn.val() || '{}');
            form.find('.line-meta > :input').each((i, input) => {
                if ($(input).val() || $(input).siblings('label').find('input').prop('checked')) {
                    var key = $(input).attr('id').match(/-(\d+)$/)[1];
                    meta[key] = $(input).val();
                }
            });
            metaIn.val(JSON.stringify(meta));
        }).on('click', '.line-meta-add', (ev:JQueryMouseEventObject) => {
            // make metadata Add Value button work and not submit the form
            var addrow = $(ev.target).closest('.line-edit-meta'), type, value;
            type = addrow.find('.line-meta-type').val();
            value = addrow.find('.line-meta-value').val();
            // clear out inputs so another value can be entered
            addrow.find(':input').not(':checkbox, :radio').val('');
            addrow.find(':checkbox, :radio').prop('checked', false);
            if (EDDData.MetaDataTypes[type]) {
                insertLineMetadataRow(addrow, type, value).find(':input').trigger('change');
            }
            return false;
        }).on('click', '.meta-remove', (ev:JQueryMouseEventObject) => {
            // remove metadata row and insert null value for the metadata key
            var form = $(ev.target).closest('form'),
                metaRow = $(ev.target).closest('.line-meta'),
                metaIn:any = form.find('[name=line-meta_store]'),
                meta:any = JSON.parse(metaIn.val() || '{}'),
                key = metaRow.attr('id').match(/-(\d+)$/)[1];
            meta[key] = null;
            metaIn.val(JSON.stringify(meta));
            metaRow.remove();
        });

        queuePositionActionsBar();

        //pulling in protocol measurements AssayMeasurements
        $.each(EDDData.Protocols, (id, protocol) => {
            $.ajax({
                url: '/study/' + EDDData.currentStudyID + '/measurements/' + id + '/',
                type: 'GET',
                dataType: 'json',
                error: (xhr, status) => {
                    console.log('Failed to fetch measurement data on ' + protocol.name + '!');
                    console.log(status);
                },
                success: processMeasurementData.bind(this, protocol)
            });
        });
    }

    function includeAllLinesIfEmpty() {
        if ($('#studyLinesTable').find('input[name=lineId]:checked').length === 0) {
            //append study id to form
            var study = _.keys(EDDData.Studies)[0];
            $('<input>').attr({
                type: 'hidden',
                value: study,
                name: 'studyId',
            }).appendTo('form');
        }
    }

    function processMeasurementData(protocol, data) {
        var assaySeen = {},
            protocolToAssay = {},
            count_total:number = 0,
            count_rec:number = 0;
        EDDData.AssayMeasurements = EDDData.AssayMeasurements || {};
        EDDData.MeasurementTypes = $.extend(EDDData.MeasurementTypes || {}, data.types);

        // attach measurement counts to each assay
        $.each(data.total_measures, (assayId:string, count:number):void => {
            var assay = EDDData.Assays[assayId];
            if (assay) {
                assay.count = count;
                count_total += count;
            }
        });
        // loop over all downloaded measurements
        $.each(data.measures || {}, (index, measurement) => {
            var assay = EDDData.Assays[measurement.assay], line, mtype;
            ++count_rec;
            if (!assay || !assay.active || assay.count === undefined) return;
            line = EDDData.Lines[assay.lid];
            if (!line || !line.active) return;
            // attach values
            $.extend(measurement, { 'values': data.data[measurement.id] || [] });
            // store the measurements
            EDDData.AssayMeasurements[measurement.id] = measurement;
            // track which assays received updated measurements
            assaySeen[assay.id] = true;
            protocolToAssay[assay.pid] = protocolToAssay[assay.pid] || {};
            protocolToAssay[assay.pid][assay.id] = true;
            // handle measurement data based on type
            mtype = data.types[measurement.type] || {};
            (assay.measures = assay.measures || []).push(measurement.id);
            if (mtype.family === 'm') { // measurement is of metabolite
                (assay.metabolites = assay.metabolites || []).push(measurement.id);
            } else if (mtype.family === 'p') { // measurement is of protein
                (assay.proteins = assay.proteins || []).push(measurement.id);
            } else if (mtype.family === 'g') { // measurement is of gene / transcript
                (assay.transcriptions = assay.transcriptions || []).push(measurement.id);
            } else {
                // throw everything else in a general area
                (assay.general = assay.general || []).push(measurement.id);
            }
        });

        if (count_rec < count_total) {
            // TODO not all measurements downloaded; display a message indicating this
            // explain downloading individual assay measurements too
        }

        queuePositionActionsBar();
        this.linesDataGridSpec.enableCarbonBalanceWidget(true);
        this.processCarbonBalanceData();
    }


    export function carbonBalanceColumnRevealedCallback(spec:DataGridSpecLines, dataGridObj:DataGrid) {
        rebuildCarbonBalanceGraphs();
    }


    // Start a timer to wait before calling the routine that shows the actions panel.
    export function queueLinesActionPanelShow() {
        if (this.linesActionPanelRefreshTimer) {
            clearTimeout (this.linesActionPanelRefreshTimer);
        }
        this.linesActionPanelRefreshTimer = setTimeout(linesActionPanelShow.bind(this), 150);
    }


    function linesActionPanelShow() {
        // Figure out how many lines are selected.
        var checkedBoxes = [], checkedBoxLen: number;
        if (this.linesDataGrid) {
            checkedBoxes = this.linesDataGrid.getSelectedCheckboxElements();
        }
        if (_.keys(EDDData.Lines).length === 0) {
            $('.lineExplanation').css('display', 'block');
            $('.actionsBar').addClass('off');
        } else {
            checkedBoxLen = checkedBoxes.length;
            $('.linesSelectedCell').empty().text(checkedBoxLen + ' selected');
            // enable singular/plural changes
            $('.editButton').data({
                'count': checkedBoxLen,
                'ids': checkedBoxes.map((box:HTMLInputElement) => box.value)
            });
            if (checkedBoxLen) {
                $('.disablableButtons > button').prop('disabled', false);
                if (checkedBoxLen < 2) {
                    $('.groupButton').prop('disabled', true);
                }
            } else {
                $('.disablableButtons > button').prop('disabled', true);
            }
        }
    }


    // Start a timer to wait before calling the routine that moves the actions bar.
    // Required so we don't crater the CPU with unserved resize events.
    export function queuePositionActionsBar() {
        if (positionActionsBarTimer) {
            clearTimeout (positionActionsBarTimer);
        }
        positionActionsBarTimer = setTimeout(StudyLines.positionActionsBar.bind(this), 50);
    }


    export function positionActionsBar() {
        // old code was trying to calculate when to move the buttons to the #bottomBar element,
        //    but the calculations were structured in a way to always return the same result.
        var original: JQuery, copy: JQuery, viewHeight: number, itemsHeight: number;
        // first time, copy the buttons
        if (!actionPanelIsCopied) {
            original = $('#actionsBar');
            copy = original.clone().appendTo('#bottomBar').hide();
            // forward click events on copy to the original button
            copy.on('click', 'button', (e) => {
                original.find('#' + e.target.id).trigger(e);
            });
            actionPanelIsCopied = true;
        }
        // calculate how big everything is
        viewHeight = $('#content').height();
        itemsHeight = 0;
        $('#content').children().each((i, e) => { itemsHeight += e.scrollHeight; });
        // switch which set of buttons is visible based on size
        if (actionPanelIsInBottomBar && itemsHeight < viewHeight) {
            $('.actionsBar').toggle();
            actionPanelIsInBottomBar = false;
        } else if (!actionPanelIsInBottomBar && viewHeight < itemsHeight) {
            $('.actionsBar').toggle();
            actionPanelIsInBottomBar = true;
        }
    }

    export function clearLineForm() {
        var form = $('#editLineModal');
        form.find('.line-meta').remove();
        form.find('[name^=line-]').not(':checkbox, :radio').val('');
        form.find('[name^=line-]').filter(':checkbox, :radio').prop('checked', false);
        form.find('.errorlist').remove();
        form.find('.cancel-link').remove();
        form.find('.bulk').addClass('off');
        form.off('change.bulk');
        return form;
    }

    export function fillLineForm(record) {
        var metaRow, experimenter, contact;
        var form = $('#editLineModal');
        experimenter = EDDData.Users[record.experimenter];
        contact = EDDData.Users[record.contact.user_id];
        form.find('[name=line-name]').val(record.name);
        form.find('[name=line-description]').val(record.description);
        form.find('[name=line-control]').prop('checked', record.control);
        form.find('[name=line-contact_0]').val(record.contact.text || (contact && contact.uid ? contact.uid : '--'));
        form.find('[name=line-contact_1]').val(record.contact.user_id);
        form.find('[name=line-experimenter_0]').val(experimenter && experimenter.uid ? experimenter.uid : '--');
        form.find('[name=line-experimenter_1]').val(record.experimenter);
        form.find('[name=line-carbon_source_0]').val(
                record.carbon.map((v) => (EDDData.CSources[v] || <CarbonSourceRecord>{}).name || '--').join(','));
        form.find('[name=line-carbon_source_1]').val(record.carbon.join(','));
        form.find('[name=line-strains_0]').val(
                record.strain.map((v) => (EDDData.Strains[v] || <StrainRecord>{}).name || '--').join(','));
        form.find('[name=line-strains_1]').val(
                record.strain.map((v) => (EDDData.Strains[v] || <StrainRecord>{}).registry_id || '').join(','));
        if (record.strain.length && form.find('[name=line-strains_1]').val() === '') {
            $('<li>').text('Strain does not have a linked ICE entry! ' +
                    'Saving the line without linking to ICE will remove the strain.')
                .wrap('<ul>').parent().addClass('errorlist')
                .appendTo(form.find('[name=line-strains_0]').parent());
        }
        metaRow = form.find('.line-edit-meta');
        // Run through the collection of metadata, and add a form element entry for each
        $.each(record.meta, (key, value) => {
            insertLineMetadataRow(metaRow, key, value);
        });
        // store original metadata in initial- field
        form.find('[name=line-meta_store]').val(JSON.stringify(record.meta));
        form.find('[name=initial-line-meta_store]').val(JSON.stringify(record.meta));
    }

    export function insertLineMetadataRow(refRow, key, value) {
        var row, type, label, input, postfixVal, prefixVal, id = 'line-meta-' + key, checkbox;
        row = $('<p>').attr('id', 'row_' + id).addClass('line-meta').insertBefore(refRow);
        type = EDDData.MetaDataTypes[key];
        label = $('<label>').attr('for', 'id_' + id).text(type.name).appendTo(row);
        // bulk checkbox
        checkbox = $('<input type="checkbox">').addClass('bulk').attr('name', id);
        $(checkbox).prependTo(label);
        input = $('<input type="text">').attr('id', 'id_' + id).addClass('form-control').val(value).appendTo(row);
        postfixVal = $(refRow).find('.meta-postfix'); //returns array of postfix elems present
        prefixVal = $(refRow).find('.meta-prefix'); //returns array of prefix elems present
        //if there is a meta postfix val, hide it.

        (postfixVal).remove();

        //if there is a meta prefix val, hide it.
        (prefixVal).remove();

        if (type.pre) {
            $('<span>').addClass('meta-prefix').text("(" + type.pre + ") ").insertBefore(label);
        }
        $('<span>').addClass('meta-remove').text('Remove').insertAfter(label);
        if (type.postfix) {
            $('<span>').addClass('meta-postfix').text(" (" + type.postfix + ")").insertAfter(label);
        }
        return row;
}


    export function editLines(ids:number[]):void {
        var form = $('#editLineModal'), allMeta = {}, metaRow;
        clearLineForm();

        // Update the disclose title
        var text = 'Add New Line';
        if (ids.length > 0) {
            text = 'Edit Line' + (ids.length > 1 ? 's ' + "(" + ids.length + ")" : '');
        }

        $("#editLineModal").dialog({ minWidth: 500, autoOpen: false, title: text });

        if (ids.length > 1) {
            //hide line name because this doesn't matter
            $('#id_line-name').parent().hide();
            //show bulk notice
            $('.bulkNoteGroup').removeClass('off');
            $('.bulk').removeClass('off')
            form.on('change.bulk', ':input', (ev:JQueryEventObject) => {
                $(ev.target).siblings('label').find('.bulk').prop('checked', true);
            });
        } else {
             $('.bulkNoteGroup').addClass('off');
             $('#id_line-name').parent().show();
        }

        if (ids.length === 1) {
            $('.bulkNoteGroup').addClass('off');
            fillLineForm(EDDData.Lines[ids[0]]);
            $('#id_line-name').parent().show();
        } else {
            // compute used metadata fields on all data.ids, insert metadata rows?
            ids.map((id:number) => EDDData.Lines[id] || {}).forEach((line:LineRecord) => {
                $.extend(allMeta, line.meta || {});
            });
            metaRow = form.find('.line-edit-meta');
            // Run through the collection of metadata, and add a form element entry for each
            $.each(allMeta, (key) => insertLineMetadataRow(metaRow, key, ''));
        }
        form.find('[name=line-ids]').val(ids.join(','));
        form.removeClass('off').dialog( "open" );
    }


    export function onChangedMetabolicMap() {
        if (this.metabolicMapName) {
            // Update the UI to show the new filename for the metabolic map.
            $("#metabolicMapName").html(this.metabolicMapName);
        } else {
            $("#metabolicMapName").html('(none)');
        }

        if (this.biomassCalculation && this.biomassCalculation != -1) {
            // Calculate carbon balances now that we can.
            this.carbonBalanceData.calculateCarbonBalances(this.metabolicMapID,
                    this.biomassCalculation);

            // Rebuild the CB graphs.
            this.carbonBalanceDisplayIsFresh = false;
            this.rebuildCarbonBalanceGraphs();
        }
    }


    export function rebuildCarbonBalanceGraphs() {
        var cellObjs:DataGridDataCell[],
            group:DataGridColumnGroupSpec = this.linesDataGridSpec.carbonBalanceCol;
        if (this.carbonBalanceDisplayIsFresh) {
            return;
        }
        // Drop any previously created Carbon Balance SVG elements from the DOM.
        this.carbonBalanceData.removeAllCBGraphs();
        cellObjs = [];
        // get all cells from all columns in the column group
        group.memberColumns.forEach((col:DataGridColumnSpec):void => {
            Array.prototype.push.apply(cellObjs, col.getEntireIndex());
        });
        // create carbon balance graph for each cell
        cellObjs.forEach((cell:DataGridDataCell) => {
            this.carbonBalanceData.createCBGraphForLine(cell.recordID, cell.cellElement);
        });
        this.carbonBalanceDiplayIsFresh = true;
    }


    // They want to select a different metabolic map.
    export function onClickedMetabolicMapName():void {
        var ui:StudyMetabolicMapChooser,
            callback:MetabolicMapChooserResult = (error:string,
                metabolicMapID?:number,
                metabolicMapName?:string,
                finalBiomass?:number):void => {
            if (!error) {
                this.metabolicMapID = metabolicMapID;
                this.metabolicMapName = metabolicMapName;
                this.biomassCalculation = finalBiomass;
                this.onChangedMetabolicMap();
            } else {
                console.log("onClickedMetabolicMapName error: " + error);
            }
        };
        ui = new StudyMetabolicMapChooser(false, callback);
    }
};

class LineResults extends DataGrid {

    constructor(dataGridSpec:DataGridSpecBase) {
        super(dataGridSpec);
    }

    _getClasses():string {
        return 'dataTable sortable dragboxes hastablecontrols table-striped';
    }

}

class DGSelectAllLinesWidget extends DGSelectAllWidget {

    clickHandler():void {
        super.clickHandler();
        //update selected text
        var checkedBoxLen = $('#studyLinesTable').find('tbody input[type=checkbox]:checked').length;
        $('.linesSelectedCell').empty().text(checkedBoxLen + ' selected');
        StudyLines.queueLinesActionPanelShow();
     }
}

// The spec object that will be passed to DataGrid to create the Lines table
class DataGridSpecLines extends DataGridSpecBase {

    metaDataIDsUsedInLines:any;
    groupIDsInOrder:any;
    groupIDsToGroupIndexes:any;
    groupIDsToGroupNames:any;
    carbonBalanceCol:DataGridColumnGroupSpec;
    carbonBalanceWidget:DGShowCarbonBalanceWidget;

    init() {
        this.findMetaDataIDsUsedInLines();
        this.findGroupIDsAndNames();
        super.init();
    }

    highlightCarbonBalanceWidget(v:boolean):void {
        this.carbonBalanceWidget.highlight(v);
    }

    enableCarbonBalanceWidget(v:boolean):void {
        this.carbonBalanceWidget.enable(v);
    }

    findMetaDataIDsUsedInLines() {
        var seenHash:any = {};
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
        $.each(rowGroups, (group:any, lines) => {
            if (typeof(EDDData.Lines[group]) === undefined || typeof(EDDData.Lines[group].name) === undefined ) {
            } else {
                this.groupIDsToGroupNames[group] = EDDData.Lines[group].name;
            }
        });
        // alphanumeric sort of group IDs by name attached to those replicate groups
        this.groupIDsInOrder = Object.keys(rowGroups).sort((a,b) => {
            var u:string = this.groupIDsToGroupNames[a], v:string = this.groupIDsToGroupNames[b];
            return u < v ? -1 : u > v ? 1 : 0;
        });
        // Now that they're sorted by name, create a hash for quickly resolving IDs to indexes in
        // the sorted array
        this.groupIDsToGroupIndexes = {};
        $.each(this.groupIDsInOrder, (index, group) => { this.groupIDsToGroupIndexes[group] = index });
    }

    // Specification for the table as a whole
    defineTableSpec():DataGridTableSpec {
        return new DataGridTableSpec('lines', { 'name': 'Lines' });
    }

    private loadLineName(index:string):string {
        var line;
        if ((line = EDDData.Lines[index])) {
            return line.name.toUpperCase();
        }
        return '';
    }

    private loadLineDescription(index:string):string {
        var line;
        if ((line = EDDData.Lines[index])) {
            if (line.description != null) {
                return line.description.toUpperCase();
            }
        }
        return '';
    }

    private loadStrainName(index:string):string {
        // ensure a strain ID exists on line, is a known strain, uppercase first found name or '?'
        var line, strain;
        if ((line = EDDData.Lines[index])) {
            if (line.strain && line.strain.length && (strain = EDDData.Strains[line.strain[0]])) {
                return strain.name.toUpperCase();
            }
        }
        return '?';
    }

    private loadFirstCarbonSource(index:string):any {
        // ensure carbon source ID(s) exist on line, ensure at least one source ID, ensure first ID
        // is known carbon source
        var line, source;
        if ((line = EDDData.Lines[index])) {
            if (line.carbon && line.carbon.length && (source = EDDData.CSources[line.carbon[0]])) {
                return source;
            }
        }
        return undefined;
    }

    private loadCarbonSource(index:string):string {
        var source = this.loadFirstCarbonSource(index);
        if (source) {
            return source.name.toUpperCase();
        }
        return '?';
    }

    private loadCarbonSourceLabeling(index:string):string {
        var source = this.loadFirstCarbonSource(index);
        if (source) {
            return source.labeling.toUpperCase();
        }
        return '?';
    }

    private loadExperimenterInitials(index:string):string {
        // ensure index ID exists, ensure experimenter user ID exists, uppercase initials or ?
        var line, experimenter;
        if ((line = EDDData.Lines[index])) {
            if ((experimenter = EDDData.Users[line.experimenter])) {
                return experimenter.initials.toUpperCase();
            }
        }
        return '?';
    }

    private loadLineModification(index:string):number {
        var line;
        if ((line = EDDData.Lines[index])) {
            return line.modified.time;
        }
        return undefined;
    }

    // Specification for the headers along the top of the table
    defineHeaderSpec():DataGridHeaderSpec[] {
        var leftSide:DataGridHeaderSpec[] = [
            new DataGridHeaderSpec(1, 'hLinesName', {
                'name': 'Name',
                'sortBy': this.loadLineName }),
            new DataGridHeaderSpec(2, 'hLinesDescription', {
                'name': 'Description',
                'sortBy': this.loadLineDescription,
                'sortAfter': 0 }),
            new DataGridHeaderSpec(3, 'hLinesStrain', {
                'name': 'Strain',
                'sortBy': this.loadStrainName,
                'sortAfter': 0 }),
            new DataGridHeaderSpec(4, 'hLinesCarbon', {
                'name': 'Carbon Source(s)',
                'size': 's',
                'sortBy': this.loadCarbonSource,
                'sortAfter': 0 }),
            new DataGridHeaderSpec(5, 'hLinesLabeling', {
                'name': 'Labeling',
                'size': 's',
                'sortBy': this.loadCarbonSourceLabeling,
                'sortAfter': 0 }),
            new DataGridHeaderSpec(6, 'hLinesCarbonBalance', {
                'name': 'Carbon Balance',
                'size': 's',
                'sortBy': this.loadLineName })
        ];

        // map all metadata IDs to HeaderSpec objects
        var metaDataHeaders:DataGridHeaderSpec[] = this.metaDataIDsUsedInLines.map((id, index) => {
            var mdType = EDDData.MetaDataTypes[id];
            return new DataGridHeaderSpec(7 + index, 'hLinesMeta' + id, {
                'name': mdType.name,
                'size': 's',
                'sortBy': this.makeMetaDataSortFunction(id),
                'sortAfter': 0 });
        });

        var rightSide = [
            new DataGridHeaderSpec(7 + metaDataHeaders.length, 'hLinesExperimenter', {
                'name': 'Experimenter',
                'size': 's',
                'sortBy': this.loadExperimenterInitials,
                'sortAfter': 0 }),
            new DataGridHeaderSpec(8 + metaDataHeaders.length, 'hLinesModified', {
                'name': 'Last Modified',
                'size': 's',
                'sortBy': this.loadLineModification,
                'sortAfter': 0 })
        ];

        return leftSide.concat(metaDataHeaders, rightSide);
    }

    private makeMetaDataSortFunction(id:string) {
        return (i:string) => {
            var line = EDDData.Lines[i];
            if (line && line.meta) {
                return line.meta[id] || '';
            }
            return '';
        }
    }

    // The colspan value for all the cells that are not 'carbon source' or 'labeling'
    // is based on the number of carbon sources for the respective record.
    // Specifically, it's either the number of carbon sources, or 1, whichever is higher.
    private rowSpanForRecord(index) {
        return (EDDData.Lines[index].carbon || []).length || 1;
    }

    generateLineNameCells(gridSpec:DataGridSpecLines, index:string):DataGridDataCell[] {
        var line = EDDData.Lines[index];
        //move registration outsisde of funciton..just filter on class and attr with id. and
        // pull out attr and
        $(document).on('click', '.line-edit-link', function(e) {
            var index:number = parseInt($(this).attr('dataIndex'), 10);
            StudyLines.editLines([index]);
        });
        return [
            new DataGridDataCell(gridSpec, index, {
                'checkboxName': 'lineId',
                'checkboxWithID': (id) => { return 'line' + id + 'include'; },
                'sideMenuItems': [
                    '<a href="#" dataIndex="' + index + '" id="lineEditLink' + index + '" class="line-edit-link">Edit' +
                    ' Line </a>',
                    '<a href="/export?lineId=' + index + '">Export Data as CSV/Excel</a>',
                    '<a href="/sbml?lineId=' + index + '">Export Data as SBML</a>'
                ],
                'hoverEffect': true,
                'nowrap': true,
                'rowspan': gridSpec.rowSpanForRecord(index),
                'contentString': line.name + (line.ctrl ? '<b class="iscontroldata">C</b>' : '')
            })
        ];
    }

    generateStrainNameCells(gridSpec:DataGridSpecLines, index:string):DataGridDataCell[] {
        var line, content = [];
        if ((line = EDDData.Lines[index])) {
            content = line.strain.map((id) => {
                var strain = EDDData.Strains[id];
                return [ '<a href="', strain.registry_url, '">', strain.name, '</a>' ].join('');
            });
        }
        return [
            new DataGridDataCell(gridSpec, index, {
                'rowspan': gridSpec.rowSpanForRecord(index),
                'contentString': content.join('; ') || '--'
               })
        ];
    }

    generateDescriptionCells(gridSpec:DataGridSpecLines, index:string):DataGridDataCell[] {
        var line, strings = '--';
        if ((line = EDDData.Lines[index])) {
            if (line.description && line.description.length) {
                strings = line.description;
            }
        }
        return [
            new DataGridDataCell(gridSpec, index, {
                'rowspan': gridSpec.rowSpanForRecord(index),
                'contentString': strings,
            })
        ];
    }

    generateCarbonSourceCells(gridSpec:DataGridSpecLines, index:string):DataGridDataCell[] {
        var line, strings = ['--'];
        if ((line = EDDData.Lines[index])) {
            if (line.carbon && line.carbon.length) {
                strings = line.carbon.map((id) => { return EDDData.CSources[id].name; });
            }
        }
        return strings.map((name) => {
            return new DataGridDataCell(gridSpec, index, { 'contentString': name })
        });
    }

    generateCarbonSourceLabelingCells(gridSpec:DataGridSpecLines, index:string):DataGridDataCell[] {
        var line, strings = ['--'];
        if ((line = EDDData.Lines[index])) {
            if (line.carbon && line.carbon.length) {
                strings = line.carbon.map((id) => { return EDDData.CSources[id].labeling; });
            }
        }
        return strings.map((labeling) => {
            return new DataGridDataCell(gridSpec, index, { 'contentString': labeling })
        });
    }

    generateCarbonBalanceBlankCells(gridSpec:DataGridSpecLines, index:string):DataGridDataCell[] {
        return [
            new DataGridDataCell(gridSpec, index, {
                'rowspan': gridSpec.rowSpanForRecord(index),
                'minWidth': 200
            })
        ];
    }

    generateExperimenterInitialsCells(gridSpec:DataGridSpecLines, index:string):DataGridDataCell[] {
        var line, exp, content;
        if ((line = EDDData.Lines[index])) {
            if (EDDData.Users && (exp = EDDData.Users[line.experimenter])) {
                content = exp.initials;
            }
        }
        return [
            new DataGridDataCell(gridSpec, index, {
                'rowspan': gridSpec.rowSpanForRecord(index),
                'contentString': content || '?'
            })
        ];
    }

    generateModificationDateCells(gridSpec:DataGridSpecLines, index:string):DataGridDataCell[] {
        return [
            new DataGridDataCell(gridSpec, index, {
                'rowspan': gridSpec.rowSpanForRecord(index),
                'contentString': Utl.JS.timestampToTodayString(EDDData.Lines[index].modified.time)
            })
        ];
    }

    makeMetaDataCellsGeneratorFunction(id) {
        return (gridSpec:DataGridSpecLines, index:string):DataGridDataCell[] => {
            var contentStr = '', line = EDDData.Lines[index], type = EDDData.MetaDataTypes[id];
            if (line && type && line.meta && (contentStr = line.meta[id] || '')) {
                contentStr = [ type.pre || '', contentStr, type.postfix || '' ].join(' ').trim();
            }
            return [
                new DataGridDataCell(gridSpec, index, {
                    'rowspan': gridSpec.rowSpanForRecord(index),
                    'contentString': contentStr
                })
            ];
        }
    }

    // Specification for each of the data columns that will make up the body of the table
    defineColumnSpec():DataGridColumnSpec[] {
        var leftSide:DataGridColumnSpec[],
            metaDataCols:DataGridColumnSpec[],
            rightSide:DataGridColumnSpec[];
        leftSide = [
            new DataGridColumnSpec(1, this.generateLineNameCells),
            new DataGridColumnSpec(2, this.generateDescriptionCells),
            new DataGridColumnSpec(3, this.generateStrainNameCells),
            new DataGridColumnSpec(4, this.generateCarbonSourceCells),
            new DataGridColumnSpec(5, this.generateCarbonSourceLabelingCells),
            // The Carbon Balance cells are populated by a callback, triggered when first displayed
            new DataGridColumnSpec(6, this.generateCarbonBalanceBlankCells)
        ];
        metaDataCols = this.metaDataIDsUsedInLines.map((id, index) => {
            return new DataGridColumnSpec(7 + index, this.makeMetaDataCellsGeneratorFunction(id));
        });
        rightSide = [
            new DataGridColumnSpec(7 + metaDataCols.length, this.generateExperimenterInitialsCells),
            new DataGridColumnSpec(8 + metaDataCols.length, this.generateModificationDateCells)
        ];

        return leftSide.concat(metaDataCols, rightSide);
    }

    // Specification for each of the groups that the headers and data columns are organized into
    defineColumnGroupSpec():DataGridColumnGroupSpec[] {
        var topSection:DataGridColumnGroupSpec[] = [
            new DataGridColumnGroupSpec('Line Name', { 'showInVisibilityList': false }),
            new DataGridColumnGroupSpec('Description'),
            new DataGridColumnGroupSpec('Strain'),
            new DataGridColumnGroupSpec('Carbon Source(s)'),
            new DataGridColumnGroupSpec('Labeling'),
            this.carbonBalanceCol = new DataGridColumnGroupSpec('Carbon Balance', {
                'showInVisibilityList': false,    // Has its own header widget
                'hiddenByDefault': true,
                'revealedCallback': StudyLines.carbonBalanceColumnRevealedCallback
            })
        ];

        var metaDataColGroups:DataGridColumnGroupSpec[];
        metaDataColGroups = this.metaDataIDsUsedInLines.map((id, index) => {
            var mdType = EDDData.MetaDataTypes[id];
            return new DataGridColumnGroupSpec(mdType.name);
        });

        var bottomSection:DataGridColumnGroupSpec[] = [
            new DataGridColumnGroupSpec('Experimenter', { 'hiddenByDefault': true }),
            new DataGridColumnGroupSpec('Last Modified', { 'hiddenByDefault': true })
        ];

        return topSection.concat(metaDataColGroups, bottomSection);
    }

    // Specification for the groups that rows can be gathered into
    defineRowGroupSpec():any {

        var rowGroupSpec = [];
        for (var x = 0; x < this.groupIDsInOrder.length; x++) {
            var id = this.groupIDsInOrder[x];

            var rowGroupSpecEntry:any = {    // Groups are numbered starting from 0
                name: this.groupIDsToGroupNames[id]
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

    // This is called to generate the array of custom header widgets. The order of the array will be
    // the order they are added to the header bar. It's perfectly fine to return an empty array.
    createCustomHeaderWidgets(dataGrid:DataGrid):DataGridHeaderWidget[] {
        var widgetSet:DataGridHeaderWidget[] = [];

        // Create a single widget for substring searching
        var searchLinesWidget = new DGLinesSearchWidget(dataGrid, this, 'Search Lines', 30, false);
        widgetSet.push(searchLinesWidget);
        // A "Carbon Balance" checkbox
        var showCarbonBalanceWidget = new DGShowCarbonBalanceWidget(dataGrid, this);
        showCarbonBalanceWidget.displayBeforeViewMenu(true);
        widgetSet.push(showCarbonBalanceWidget);
        this.carbonBalanceWidget = showCarbonBalanceWidget;
        // A "select all / select none" button
        var selectAllWidget = new DGSelectAllLinesWidget(dataGrid, this);
        selectAllWidget.displayBeforeViewMenu(true);
        widgetSet.push(selectAllWidget);
        return widgetSet;
    }

    // This is called to generate the array of custom options menu widgets. The order of the array
    // will be the order they are displayed in the menu. Empty array = OK.
    createCustomOptionsWidgets(dataGrid:DataGrid):DataGridOptionWidget[] {
        var widgetSet:DataGridOptionWidget[] = [];

        // Create a single widget for showing disabled Lines
        var groupLinesWidget = new DGGroupStudyReplicatesWidget(dataGrid, this);
        widgetSet.push(groupLinesWidget);
        var disabledLinesWidget = new DGDisabledLinesWidget(dataGrid, this);
        widgetSet.push(disabledLinesWidget);
        return widgetSet;
    }

    // This is called after everything is initialized, including the creation of the table content.
    onInitialized(dataGrid:DataGrid):void {

        // Wire up the 'action panels' for the Lines and Assays sections
        var linesTable = this.getTableElement();
        $(linesTable).on('change', ':checkbox', () => StudyLines.queueLinesActionPanelShow());

        // This calls down into the instantiated widget and alters its styling,
        // so we need to do it after the table has been created.
        this.enableCarbonBalanceWidget(false);

        // Wire-in our custom edit fields for the Studies page, and continue with general init
        StudyLines.prepareAfterLinesTable();
    }
}

// When unchecked, this hides the set of Lines that are marked as disabled.
class DGDisabledLinesWidget extends DataGridOptionWidget {

    createElements(uniqueID:any):void {
        var cbID:string = this.dataGridSpec.tableSpec.id+'ShowDLinesCB'+uniqueID;
        var cb:any = this._createCheckbox(cbID, cbID, '1');
        $(cb).click( (e:any) => this.dataGridOwnerObject.clickedOptionWidget(e) );
        if (this.isEnabledByDefault()) {
            cb.setAttribute('checked', 'checked');
        }
        this.checkBoxElement = cb;
        this.labelElement = this._createLabel('Show Disabled', cbID);
        this._createdElements = true;
    }

    applyFilterToIDs(rowIDs:string[]):string[] {

        var checked:boolean = false;
        if (this.checkBoxElement.checked) {
            checked = true;
        }
        // If the box is checked, return the set of IDs unfiltered
        if (checked && rowIDs && EDDData.currentStudyWritable) {
            $(".enableButton").removeClass('off');
            return rowIDs;
        } else {
            $(".enableButton").addClass('off');
        }

        var filteredIDs = [];
        for (var r = 0; r < rowIDs.length; r++) {
            var id = rowIDs[r];
            // Here is the condition that determines whether the rows associated with this ID are
            // shown or hidden.
            if (EDDData.Lines[id].active) {
                filteredIDs.push(id);
            }
        }
        return filteredIDs;
    }

    initialFormatRowElementsForID(dataRowObjects:any, rowID:string):any {
        if (!EDDData.Lines[rowID].active) {
            $.each(dataRowObjects, (x, row) => { $(row.getElement()).addClass('disabledRecord') });
        }
    }
}

// A widget to toggle replicate grouping on and off
class DGGroupStudyReplicatesWidget extends DataGridOptionWidget {

    createElements(uniqueID:any):void {
        var pThis = this;
        var cbID:string = 'GroupStudyReplicatesCB';
        var cb:HTMLInputElement = this._createCheckbox(cbID, cbID, '1');
        $(cb).click(
            function(e) {
                if (pThis.checkBoxElement.checked) {
                    pThis.dataGridOwnerObject.turnOnRowGrouping();
                } else {
                    pThis.dataGridOwnerObject.turnOffRowGrouping();
                }
            }
        );
        if (this.isEnabledByDefault()) {
            cb.setAttribute('checked', 'checked');
        }
        this.checkBoxElement = cb;
        this.labelElement = this._createLabel('Group Replicates', cbID);
        this._createdElements = true;
    }
}

// This is a DataGridHeaderWidget derived from DGSearchWidget. It's a search field that offers
// options for additional data types, querying the server for results.
class DGLinesSearchWidget extends DGSearchWidget {

    searchDisclosureElement:any;

    constructor(dataGridOwnerObject:any, dataGridSpec:any, placeHolder:string, size:number,
            getsFocus:boolean) {
        super(dataGridOwnerObject, dataGridSpec, placeHolder, size, getsFocus);
    }

    // The uniqueID is provided to assist the widget in avoiding collisions when creating input
    // element labels or other things requiring an ID.
    createElements(uniqueID:any):void {
        super.createElements(uniqueID);
        this.createdElements(true);
    }

    // This is called to append the widget elements beneath the given element. If the elements have
    // not been created yet, they are created, and the uniqueID is passed along.
    appendElements(container:any, uniqueID:any):void {
        if (!this.createdElements()) {
            this.createElements(uniqueID);
        }
        container.appendChild(this.element);
    }
}



// A header widget to prepare the Carbon Balance table cells, and show or hide them.
class DGShowCarbonBalanceWidget extends DataGridHeaderWidget {

    checkBoxElement:any;
    labelElement:any;
    highlighted:boolean;
    checkboxEnabled:boolean;

    // store more specific type of spec to get to carbonBalanceCol later
    private _lineSpec:DataGridSpecLines;

    constructor(dataGridOwnerObject:DataGrid, dataGridSpec:DataGridSpecLines) {
        super(dataGridOwnerObject, dataGridSpec);
        this.checkboxEnabled = true;
        this.highlighted = false;
        this._lineSpec = dataGridSpec;
    }

    createElements(uniqueID:any):void {
        var cbID:string = this.dataGridSpec.tableSpec.id + 'CarBal' + uniqueID;
        var cb:HTMLInputElement = this._createCheckbox(cbID, cbID, '1');
        cb.className = 'tableControl';
        $(cb).click((ev:JQueryMouseEventObject):void => {
            this.activateCarbonBalance();
        });

        var label:HTMLElement = this._createLabel('Carbon Balance', cbID);

        var span:HTMLElement = document.createElement("span");
        span.className = 'tableControl';
        span.appendChild(cb);
        span.appendChild(label);

        this.checkBoxElement = cb;
        this.labelElement = label;
        this.element = span;
        this.createdElements(true);
    }

    highlight(h:boolean):void {
        this.highlighted = h;
        if (this.checkboxEnabled) {
            if (h) {
                this.labelElement.style.color = 'red';
            } else {
                this.labelElement.style.color = '';
            }
        }
    }

    enable(h:boolean):void {
        this.checkboxEnabled = h;
        if (h) {
            this.highlight(this.highlighted);
            this.checkBoxElement.removeAttribute('disabled');
        } else {
            this.labelElement.style.color = 'gray';
            this.checkBoxElement.setAttribute('disabled', true);
        }
    }

    private activateCarbonBalance():void {
        var ui:FullStudyBiomassUI,
            callback:FullStudyBiomassUIResultsCallback;
        callback = (error:string,
                metabolicMapID?:number,
                metabolicMapFilename?:string,
                finalBiomass?:number):void => {
            if (!error) {
                StudyLines.metabolicMapID = metabolicMapID;
                StudyLines.metabolicMapName = metabolicMapFilename;
                StudyLines.biomassCalculation = finalBiomass;
                StudyLines.onChangedMetabolicMap();
                this.checkBoxElement.checked = true;
                this.dataGridOwnerObject.showColumn(this._lineSpec.carbonBalanceCol);
            }
        };
        if (this.checkBoxElement.checked) {
            // We need to get a biomass calculation to multiply against OD.
            // Have they set this up yet?
            if (!StudyLines.biomassCalculation || StudyLines.biomassCalculation === -1) {
                this.checkBoxElement.checked = false;
                // Must setup the biomass
                ui = new FullStudyBiomassUI(callback);
            } else {
                this.dataGridOwnerObject.showColumn(this._lineSpec.carbonBalanceCol);
            }
        } else {
            this.dataGridOwnerObject.hideColumn(this._lineSpec.carbonBalanceCol);
        }
    }
}


// use JQuery ready event shortcut to call prepareIt when page is ready
$(() => StudyLines.prepareIt());
