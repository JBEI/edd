// File last modified on: Mon Aug 14 2017 16:49:49  
/// <reference path="typescript-declarations.d.ts" />
/// <reference path="Utl.ts" />
/// <reference path="Dragboxes.ts" />
/// <reference path="BiomassCalculationUI.ts" />
/// <reference path="CarbonSummation.ts" />
/// <reference path="DataGrid.ts" />
/// <reference path="FileDropZone.ts" />
var __extends = (this && this.__extends) || (function () {
    var extendStatics = Object.setPrototypeOf ||
        ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
        function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
var StudyLines;
(function (StudyLines) {
    'use strict';
    var linesActionPanelRefreshTimer;
    var positionActionsBarTimer;
    var attachmentIDs;
    var attachmentsByID;
    var prevDescriptionEditElement;
    var carbonBalanceData;
    var carbonBalanceDisplayIsFresh;
    var cSourceEntries;
    var mTypeEntries;
    StudyLines.actionPanelIsCopied = false;
    // Called when the page loads.
    function prepareIt() {
        var _this = this;
        carbonBalanceData = null;
        carbonBalanceDisplayIsFresh = false;
        attachmentIDs = null;
        attachmentsByID = null;
        prevDescriptionEditElement = null;
        StudyLines.metabolicMapID = -1;
        StudyLines.metabolicMapName = null;
        StudyLines.biomassCalculation = -1;
        cSourceEntries = [];
        mTypeEntries = [];
        StudyLines.linesDataGridSpec = null;
        StudyLines.linesDataGrid = null;
        StudyLines.actionPanelIsInBottomBar = false;
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
        $('#content').on('dragover', function (e) {
            e.stopPropagation();
            e.preventDefault();
            $(".linesDropZone").removeClass('off');
        });
        $('#content').on('dragend, dragleave, mouseleave', function (e) {
            $(".linesDropZone").addClass('off');
        });
        $('#content').tooltip({
            content: function () {
                return $(this).prop('title');
            },
            position: { my: "left-10 center", at: "right center" },
            show: null,
            close: function (event, ui) {
                ui.tooltip.hover(function () {
                    $(this).stop(true).fadeTo(400, 1);
                }, function () {
                    $(this).fadeOut("400", function () {
                        $(this).remove();
                    });
                });
            }
        });
        // put the click handler at the document level, then filter to any link inside a .disclose
        $(document).on('click', '.disclose .discloseLink', function (e) {
            $(e.target).closest('.disclose').toggleClass('discloseHide');
            return false;
        });
        $(window).on('resize', queuePositionActionsBar);
        //when all ajax requests are finished, determine if there are AssayMeasurements.
        $(document).ajaxStop(function () {
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
            'error': function (xhr, status, e) {
                $('#overviewSection').prepend("<div class='noData'>Error. Please reload</div>");
                console.log(['Loading EDDData failed: ', status, ';', e].join(''));
            },
            'success': function (data) {
                EDDData = $.extend(EDDData || {}, data);
                // Instantiate a table specification for the Lines table
                StudyLines.linesDataGridSpec = new DataGridSpecLines();
                StudyLines.linesDataGridSpec.init();
                // Instantiate the table itself with the spec
                StudyLines.linesDataGrid = new LineResults(_this.linesDataGridSpec);
                // Show possible next steps div if needed
                if (_.keys(EDDData.Lines).length === 0) {
                    $('.noLines').css('display', 'block');
                }
                else {
                    $('.noLines').css('display', 'none');
                }
            }
        });
    }
    StudyLines.prepareIt = prepareIt;
    function processCarbonBalanceData() {
        // Prepare the carbon balance graph
        this.carbonBalanceData = new CarbonBalance.Display();
        var highlightCarbonBalanceWidget = false;
        if (this.biomassCalculation > -1) {
            this.carbonBalanceData.calculateCarbonBalances(this.metabolicMapID, this.biomassCalculation);
            // Highlight the "Show Carbon Balance" checkbox in red if there are CB issues.
            if (this.carbonBalanceData.getNumberOfImbalances() > 0) {
                highlightCarbonBalanceWidget = true;
            }
        }
        else {
            // Highlight the carbon balance in red to indicate that we can't calculate
            // carbon balances yet. When they click the checkbox, we'll get them to
            // specify which SBML file to use for biomass.
            highlightCarbonBalanceWidget = true;
        }
        this.linesDataGridSpec.highlightCarbonBalanceWidget(highlightCarbonBalanceWidget);
    }
    StudyLines.processCarbonBalanceData = processCarbonBalanceData;
    // Called by DataGrid after the Lines table is rendered
    function prepareAfterLinesTable() {
        var _this = this;
        var parent = $('#studyLinesTable').parent(), helpBadge, input;
        input = $('.tableControl').last();
        helpBadge = $('.move');
        // Enable add new Line button
        parent.find('.addNewLineButton').on('click', function (ev) {
            ev.preventDefault();
            ev.stopPropagation();
            StudyLines.editLines([]);
            return false;
        });
        // Enable edit lines button
        parent.find('.editButton').on('click', function (ev) {
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
            create: function () {
                $(this).css("maxHeight", 400);
            }
        });
        parent.find(".addAssayButton").click(function () {
            $("#addAssayModal").removeClass('off').dialog("open");
            return false;
        });
        parent.find(".exportLineButton").click(function () {
            $("#exportModal").removeClass('off').dialog("open");
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
        var value = $('.edd-label').children('input')[1];
        $(value).on("change", function () {
            var val = $(value).val(), type = EDDData.MetaDataTypes[val], input = $('.line-meta-value'), line = $(this).parents('.line-edit-meta');
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
        $('#editLineModal').on('change', '.line-meta', function (ev) {
            // watch for changes to metadata values, and serialize to the meta_store field
            var form = $(ev.target).closest('form'), metaIn = form.find('[name=line-meta_store]'), meta = JSON.parse(metaIn.val() || '{}');
            form.find('.line-meta > :input').each(function (i, input) {
                if ($(input).val() || $(input).siblings('label').find('input').prop('checked')) {
                    var key = $(input).attr('id').match(/-(\d+)$/)[1];
                    meta[key] = $(input).val();
                }
            });
            metaIn.val(JSON.stringify(meta));
        }).on('click', '.line-meta-add', function (ev) {
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
        }).on('click', '.meta-remove', function (ev) {
            // remove metadata row and insert null value for the metadata key
            var form = $(ev.target).closest('form'), metaRow = $(ev.target).closest('.line-meta'), metaIn = form.find('[name=line-meta_store]'), meta = JSON.parse(metaIn.val() || '{}'), key = metaRow.attr('id').match(/-(\d+)$/)[1];
            meta[key] = null;
            metaIn.val(JSON.stringify(meta));
            metaRow.remove();
        });
        queuePositionActionsBar();
        //pulling in protocol measurements AssayMeasurements
        $.each(EDDData.Protocols, function (id, protocol) {
            $.ajax({
                url: '/study/' + EDDData.currentStudyID + '/measurements/' + id + '/',
                type: 'GET',
                dataType: 'json',
                error: function (xhr, status) {
                    console.log('Failed to fetch measurement data on ' + protocol.name + '!');
                    console.log(status);
                },
                success: processMeasurementData.bind(_this, protocol)
            });
        });
    }
    StudyLines.prepareAfterLinesTable = prepareAfterLinesTable;
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
        var assaySeen = {}, protocolToAssay = {}, count_total = 0, count_rec = 0;
        EDDData.AssayMeasurements = EDDData.AssayMeasurements || {};
        EDDData.MeasurementTypes = $.extend(EDDData.MeasurementTypes || {}, data.types);
        // attach measurement counts to each assay
        $.each(data.total_measures, function (assayId, count) {
            var assay = EDDData.Assays[assayId];
            if (assay) {
                assay.count = count;
                count_total += count;
            }
        });
        // loop over all downloaded measurements
        $.each(data.measures || {}, function (index, measurement) {
            var assay = EDDData.Assays[measurement.assay], line, mtype;
            ++count_rec;
            if (!assay || !assay.active || assay.count === undefined)
                return;
            line = EDDData.Lines[assay.lid];
            if (!line || !line.active)
                return;
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
            if (mtype.family === 'm') {
                (assay.metabolites = assay.metabolites || []).push(measurement.id);
            }
            else if (mtype.family === 'p') {
                (assay.proteins = assay.proteins || []).push(measurement.id);
            }
            else if (mtype.family === 'g') {
                (assay.transcriptions = assay.transcriptions || []).push(measurement.id);
            }
            else {
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
    function carbonBalanceColumnRevealedCallback(spec, dataGridObj) {
        rebuildCarbonBalanceGraphs();
    }
    StudyLines.carbonBalanceColumnRevealedCallback = carbonBalanceColumnRevealedCallback;
    // Start a timer to wait before calling the routine that shows the actions panel.
    function queueLinesActionPanelShow() {
        if (this.linesActionPanelRefreshTimer) {
            clearTimeout(this.linesActionPanelRefreshTimer);
        }
        this.linesActionPanelRefreshTimer = setTimeout(linesActionPanelShow.bind(this), 150);
    }
    StudyLines.queueLinesActionPanelShow = queueLinesActionPanelShow;
    function linesActionPanelShow() {
        // Figure out how many lines are selected.
        var checkedBoxes = [], checkedBoxLen;
        if (this.linesDataGrid) {
            checkedBoxes = this.linesDataGrid.getSelectedCheckboxElements();
        }
        if (_.keys(EDDData.Lines).length === 0) {
            $('.lineExplanation').css('display', 'block');
            $('.actionsBar').addClass('off');
        }
        else {
            checkedBoxLen = checkedBoxes.length;
            $('.linesSelectedCell').empty().text(checkedBoxLen + ' selected');
            // enable singular/plural changes
            $('.editButton').data({
                'count': checkedBoxLen,
                'ids': checkedBoxes.map(function (box) { return box.value; })
            });
            if (checkedBoxLen) {
                $('.disablableButtons > button').prop('disabled', false);
                if (checkedBoxLen < 2) {
                    $('.groupButton').prop('disabled', true);
                }
            }
            else {
                $('.disablableButtons > button').prop('disabled', true);
            }
        }
    }
    // Start a timer to wait before calling the routine that moves the actions bar.
    // Required so we don't crater the CPU with unserved resize events.
    function queuePositionActionsBar() {
        if (positionActionsBarTimer) {
            clearTimeout(positionActionsBarTimer);
        }
        positionActionsBarTimer = setTimeout(StudyLines.positionActionsBar.bind(this), 50);
    }
    StudyLines.queuePositionActionsBar = queuePositionActionsBar;
    function positionActionsBar() {
        // old code was trying to calculate when to move the buttons to the #bottomBar element,
        //    but the calculations were structured in a way to always return the same result.
        var original, copy, viewHeight, itemsHeight;
        // first time, copy the buttons
        if (!StudyLines.actionPanelIsCopied) {
            original = $('#actionsBar');
            copy = original.clone().appendTo('#bottomBar').hide();
            // forward click events on copy to the original button
            copy.on('click', 'button', function (e) {
                original.find('#' + e.target.id).trigger(e);
            });
            StudyLines.actionPanelIsCopied = true;
        }
        // calculate how big everything is
        viewHeight = $('#content').height();
        itemsHeight = 0;
        $('#content').children().each(function (i, e) { itemsHeight += e.scrollHeight; });
        // switch which set of buttons is visible based on size
        if (StudyLines.actionPanelIsInBottomBar && itemsHeight < viewHeight) {
            $('.actionsBar').toggle();
            StudyLines.actionPanelIsInBottomBar = false;
        }
        else if (!StudyLines.actionPanelIsInBottomBar && viewHeight < itemsHeight) {
            $('.actionsBar').toggle();
            StudyLines.actionPanelIsInBottomBar = true;
        }
    }
    StudyLines.positionActionsBar = positionActionsBar;
    function clearLineForm() {
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
    function fillLineForm(record) {
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
        form.find('[name=line-carbon_source_0]').val(record.carbon.map(function (v) { return (EDDData.CSources[v] || {}).name || '--'; }).join(','));
        form.find('[name=line-carbon_source_1]').val(record.carbon.join(','));
        form.find('[name=line-strains_0]').val(record.strain.map(function (v) { return (EDDData.Strains[v] || {}).name || '--'; }).join(','));
        form.find('[name=line-strains_1]').val(record.strain.map(function (v) { return (EDDData.Strains[v] || {}).registry_id || ''; }).join(','));
        if (record.strain.length && form.find('[name=line-strains_1]').val() === '') {
            $('<li>').text('Strain does not have a linked ICE entry! ' +
                'Saving the line without linking to ICE will remove the strain.')
                .wrap('<ul>').parent().addClass('errorlist')
                .appendTo(form.find('[name=line-strains_0]').parent());
        }
        metaRow = form.find('.line-edit-meta');
        // Run through the collection of metadata, and add a form element entry for each
        $.each(record.meta, function (key, value) {
            insertLineMetadataRow(metaRow, key, value);
        });
        // store original metadata in initial- field
        form.find('[name=line-meta_store]').val(JSON.stringify(record.meta));
        form.find('[name=initial-line-meta_store]').val(JSON.stringify(record.meta));
    }
    function insertLineMetadataRow(refRow, key, value) {
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
    function editLines(ids) {
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
            $('.bulk').removeClass('off');
            form.on('change.bulk', ':input', function (ev) {
                $(ev.target).siblings('label').find('.bulk').prop('checked', true);
            });
        }
        else {
            $('.bulkNoteGroup').addClass('off');
            $('#id_line-name').parent().show();
        }
        if (ids.length === 1) {
            $('.bulkNoteGroup').addClass('off');
            fillLineForm(EDDData.Lines[ids[0]]);
            $('#id_line-name').parent().show();
        }
        else {
            // compute used metadata fields on all data.ids, insert metadata rows?
            ids.map(function (id) { return EDDData.Lines[id] || {}; }).forEach(function (line) {
                $.extend(allMeta, line.meta || {});
            });
            metaRow = form.find('.line-edit-meta');
            // Run through the collection of metadata, and add a form element entry for each
            $.each(allMeta, function (key) { return insertLineMetadataRow(metaRow, key, ''); });
        }
        form.find('[name=line-ids]').val(ids.join(','));
        form.removeClass('off').dialog("open");
    }
    StudyLines.editLines = editLines;
    function onChangedMetabolicMap() {
        if (this.metabolicMapName) {
            // Update the UI to show the new filename for the metabolic map.
            $("#metabolicMapName").html(this.metabolicMapName);
        }
        else {
            $("#metabolicMapName").html('(none)');
        }
        if (this.biomassCalculation && this.biomassCalculation != -1) {
            // Calculate carbon balances now that we can.
            this.carbonBalanceData.calculateCarbonBalances(this.metabolicMapID, this.biomassCalculation);
            // Rebuild the CB graphs.
            this.carbonBalanceDisplayIsFresh = false;
            this.rebuildCarbonBalanceGraphs();
        }
    }
    StudyLines.onChangedMetabolicMap = onChangedMetabolicMap;
    function rebuildCarbonBalanceGraphs() {
        var _this = this;
        var cellObjs, group = this.linesDataGridSpec.carbonBalanceCol;
        if (this.carbonBalanceDisplayIsFresh) {
            return;
        }
        // Drop any previously created Carbon Balance SVG elements from the DOM.
        this.carbonBalanceData.removeAllCBGraphs();
        cellObjs = [];
        // get all cells from all columns in the column group
        group.memberColumns.forEach(function (col) {
            Array.prototype.push.apply(cellObjs, col.getEntireIndex());
        });
        // create carbon balance graph for each cell
        cellObjs.forEach(function (cell) {
            _this.carbonBalanceData.createCBGraphForLine(cell.recordID, cell.cellElement);
        });
        this.carbonBalanceDiplayIsFresh = true;
    }
    StudyLines.rebuildCarbonBalanceGraphs = rebuildCarbonBalanceGraphs;
    // They want to select a different metabolic map.
    function onClickedMetabolicMapName() {
        var _this = this;
        var ui, callback = function (error, metabolicMapID, metabolicMapName, finalBiomass) {
            if (!error) {
                _this.metabolicMapID = metabolicMapID;
                _this.metabolicMapName = metabolicMapName;
                _this.biomassCalculation = finalBiomass;
                _this.onChangedMetabolicMap();
            }
            else {
                console.log("onClickedMetabolicMapName error: " + error);
            }
        };
        ui = new StudyMetabolicMapChooser(false, callback);
    }
    StudyLines.onClickedMetabolicMapName = onClickedMetabolicMapName;
})(StudyLines || (StudyLines = {}));
;
var LineResults = (function (_super) {
    __extends(LineResults, _super);
    function LineResults(dataGridSpec) {
        return _super.call(this, dataGridSpec) || this;
    }
    LineResults.prototype._getClasses = function () {
        return 'dataTable sortable dragboxes hastablecontrols table-striped';
    };
    return LineResults;
}(DataGrid));
var DGSelectAllLinesWidget = (function (_super) {
    __extends(DGSelectAllLinesWidget, _super);
    function DGSelectAllLinesWidget() {
        return _super !== null && _super.apply(this, arguments) || this;
    }
    DGSelectAllLinesWidget.prototype.clickHandler = function () {
        _super.prototype.clickHandler.call(this);
        //update selected text
        var checkedBoxLen = $('#studyLinesTable').find('tbody input[type=checkbox]:checked').length;
        $('.linesSelectedCell').empty().text(checkedBoxLen + ' selected');
        StudyLines.queueLinesActionPanelShow();
    };
    return DGSelectAllLinesWidget;
}(DGSelectAllWidget));
// The spec object that will be passed to DataGrid to create the Lines table
var DataGridSpecLines = (function (_super) {
    __extends(DataGridSpecLines, _super);
    function DataGridSpecLines() {
        return _super !== null && _super.apply(this, arguments) || this;
    }
    DataGridSpecLines.prototype.init = function () {
        this.findMetaDataIDsUsedInLines();
        this.findGroupIDsAndNames();
        _super.prototype.init.call(this);
    };
    DataGridSpecLines.prototype.highlightCarbonBalanceWidget = function (v) {
        this.carbonBalanceWidget.highlight(v);
    };
    DataGridSpecLines.prototype.enableCarbonBalanceWidget = function (v) {
        this.carbonBalanceWidget.enable(v);
    };
    DataGridSpecLines.prototype.findMetaDataIDsUsedInLines = function () {
        var seenHash = {};
        // loop lines
        $.each(this.getRecordIDs(), function (index, id) {
            var line = EDDData.Lines[id];
            if (line) {
                $.each(line.meta || {}, function (key) { return seenHash[key] = true; });
            }
        });
        // store all metadata IDs seen
        this.metaDataIDsUsedInLines = Object.keys(seenHash);
    };
    DataGridSpecLines.prototype.findGroupIDsAndNames = function () {
        var _this = this;
        var rowGroups = {};
        // Gather all the row IDs under the group ID each belongs to.
        $.each(this.getRecordIDs(), function (index, id) {
            var line = EDDData.Lines[id], rep = line.replicate;
            if (rep) {
                // use parent replicate as a replicate group ID, push all matching line IDs
                (rowGroups[rep] = rowGroups[rep] || [rep]).push(id);
            }
        });
        this.groupIDsToGroupNames = {};
        // For each group ID, just use parent replicate name
        $.each(rowGroups, function (group, lines) {
            if (EDDData.Lines[group] === undefined || EDDData.Lines[group].name === undefined) {
                _this.groupIDsToGroupNames[group] = null;
            }
            else {
                _this.groupIDsToGroupNames[group] = EDDData.Lines[group].name;
            }
        });
        // alphanumeric sort of group IDs by name attached to those replicate groups
        this.groupIDsInOrder = Object.keys(rowGroups).sort(function (a, b) {
            var u = _this.groupIDsToGroupNames[a], v = _this.groupIDsToGroupNames[b];
            return u < v ? -1 : u > v ? 1 : 0;
        });
        // Now that they're sorted by name, create a hash for quickly resolving IDs to indexes in
        // the sorted array
        this.groupIDsToGroupIndexes = {};
        $.each(this.groupIDsInOrder, function (index, group) { return _this.groupIDsToGroupIndexes[group] = index; });
    };
    // Specification for the table as a whole
    DataGridSpecLines.prototype.defineTableSpec = function () {
        return new DataGridTableSpec('lines', { 'name': 'Lines' });
    };
    DataGridSpecLines.prototype.loadLineName = function (index) {
        var line;
        if ((line = EDDData.Lines[index])) {
            return line.name.toUpperCase();
        }
        return '';
    };
    DataGridSpecLines.prototype.loadLineDescription = function (index) {
        var line;
        if ((line = EDDData.Lines[index])) {
            if (line.description != null) {
                return line.description.toUpperCase();
            }
        }
        return '';
    };
    DataGridSpecLines.prototype.loadStrainName = function (index) {
        // ensure a strain ID exists on line, is a known strain, uppercase first found name or '?'
        var line, strain;
        if ((line = EDDData.Lines[index])) {
            if (line.strain && line.strain.length && (strain = EDDData.Strains[line.strain[0]])) {
                return strain.name.toUpperCase();
            }
        }
        return '?';
    };
    DataGridSpecLines.prototype.loadFirstCarbonSource = function (index) {
        // ensure carbon source ID(s) exist on line, ensure at least one source ID, ensure first ID
        // is known carbon source
        var line, source;
        if ((line = EDDData.Lines[index])) {
            if (line.carbon && line.carbon.length && (source = EDDData.CSources[line.carbon[0]])) {
                return source;
            }
        }
        return undefined;
    };
    DataGridSpecLines.prototype.loadCarbonSource = function (index) {
        var source = this.loadFirstCarbonSource(index);
        if (source) {
            return source.name.toUpperCase();
        }
        return '?';
    };
    DataGridSpecLines.prototype.loadCarbonSourceLabeling = function (index) {
        var source = this.loadFirstCarbonSource(index);
        if (source) {
            return source.labeling.toUpperCase();
        }
        return '?';
    };
    DataGridSpecLines.prototype.loadExperimenterInitials = function (index) {
        // ensure index ID exists, ensure experimenter user ID exists, uppercase initials or ?
        var line, experimenter;
        if ((line = EDDData.Lines[index])) {
            if ((experimenter = EDDData.Users[line.experimenter])) {
                return experimenter.initials.toUpperCase();
            }
        }
        return '?';
    };
    DataGridSpecLines.prototype.loadLineModification = function (index) {
        var line;
        if ((line = EDDData.Lines[index])) {
            return line.modified.time;
        }
        return undefined;
    };
    // Specification for the headers along the top of the table
    DataGridSpecLines.prototype.defineHeaderSpec = function () {
        var _this = this;
        var leftSide = [
            new DataGridHeaderSpec(1, 'hLinesName', {
                'name': 'Name',
                'sortBy': this.loadLineName
            }),
            new DataGridHeaderSpec(2, 'hLinesDescription', {
                'name': 'Description',
                'sortBy': this.loadLineDescription,
                'sortAfter': 0
            }),
            new DataGridHeaderSpec(3, 'hLinesStrain', {
                'name': 'Strain',
                'sortBy': this.loadStrainName,
                'sortAfter': 0
            }),
            new DataGridHeaderSpec(4, 'hLinesCarbon', {
                'name': 'Carbon Source(s)',
                'size': 's',
                'sortBy': this.loadCarbonSource,
                'sortAfter': 0
            }),
            new DataGridHeaderSpec(5, 'hLinesLabeling', {
                'name': 'Labeling',
                'size': 's',
                'sortBy': this.loadCarbonSourceLabeling,
                'sortAfter': 0
            }),
            new DataGridHeaderSpec(6, 'hLinesCarbonBalance', {
                'name': 'Carbon Balance',
                'size': 's',
                'sortBy': this.loadLineName
            })
        ];
        // map all metadata IDs to HeaderSpec objects
        var metaDataHeaders = this.metaDataIDsUsedInLines.map(function (id, index) {
            var mdType = EDDData.MetaDataTypes[id];
            return new DataGridHeaderSpec(7 + index, 'hLinesMeta' + id, {
                'name': mdType.name,
                'size': 's',
                'sortBy': _this.makeMetaDataSortFunction(id),
                'sortAfter': 0
            });
        });
        var rightSide = [
            new DataGridHeaderSpec(7 + metaDataHeaders.length, 'hLinesExperimenter', {
                'name': 'Experimenter',
                'size': 's',
                'sortBy': this.loadExperimenterInitials,
                'sortAfter': 0
            }),
            new DataGridHeaderSpec(8 + metaDataHeaders.length, 'hLinesModified', {
                'name': 'Last Modified',
                'size': 's',
                'sortBy': this.loadLineModification,
                'sortAfter': 0
            })
        ];
        return leftSide.concat(metaDataHeaders, rightSide);
    };
    DataGridSpecLines.prototype.makeMetaDataSortFunction = function (id) {
        return function (i) {
            var line = EDDData.Lines[i];
            if (line && line.meta) {
                return line.meta[id] || '';
            }
            return '';
        };
    };
    // The colspan value for all the cells that are not 'carbon source' or 'labeling'
    // is based on the number of carbon sources for the respective record.
    // Specifically, it's either the number of carbon sources, or 1, whichever is higher.
    DataGridSpecLines.prototype.rowSpanForRecord = function (index) {
        return (EDDData.Lines[index].carbon || []).length || 1;
    };
    DataGridSpecLines.prototype.generateLineNameCells = function (gridSpec, index) {
        var line = EDDData.Lines[index];
        return [
            new DataGridDataCell(gridSpec, index, {
                'checkboxName': 'lineId',
                'checkboxWithID': function (id) { return 'line' + id + 'include'; },
                'sideMenuItems': [
                    '<a href="#" class="line-edit-link" onclick="StudyLines.editLines([' + index + '])">Edit Line</a>',
                    '<a href="/export?lineId=' + index + '">Export Data as CSV/Excel</a>',
                    '<a href="/sbml?lineId=' + index + '">Export Data as SBML</a>'
                ],
                'hoverEffect': true,
                'nowrap': true,
                'rowspan': gridSpec.rowSpanForRecord(index),
                'contentString': line.name + (line.ctrl ? '<b class="iscontroldata">C</b>' : '')
            })
        ];
    };
    DataGridSpecLines.prototype.generateStrainNameCells = function (gridSpec, index) {
        var line, content = [];
        if ((line = EDDData.Lines[index])) {
            content = line.strain.map(function (id) {
                var strain = EDDData.Strains[id];
                return ['<a href="', strain.registry_url, '">', strain.name, '</a>'].join('');
            });
        }
        return [
            new DataGridDataCell(gridSpec, index, {
                'rowspan': gridSpec.rowSpanForRecord(index),
                'contentString': content.join('; ') || '--'
            })
        ];
    };
    DataGridSpecLines.prototype.generateDescriptionCells = function (gridSpec, index) {
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
    };
    DataGridSpecLines.prototype.generateCarbonSourceCells = function (gridSpec, index) {
        var line, strings = ['--'];
        if ((line = EDDData.Lines[index])) {
            if (line.carbon && line.carbon.length) {
                strings = line.carbon.map(function (id) { return EDDData.CSources[id].name; });
            }
        }
        return strings.map(function (name) {
            return new DataGridDataCell(gridSpec, index, { 'contentString': name });
        });
    };
    DataGridSpecLines.prototype.generateCarbonSourceLabelingCells = function (gridSpec, index) {
        var line, strings = ['--'];
        if ((line = EDDData.Lines[index])) {
            if (line.carbon && line.carbon.length) {
                strings = line.carbon.map(function (id) { return EDDData.CSources[id].labeling; });
            }
        }
        return strings.map(function (labeling) {
            return new DataGridDataCell(gridSpec, index, { 'contentString': labeling });
        });
    };
    DataGridSpecLines.prototype.generateCarbonBalanceBlankCells = function (gridSpec, index) {
        return [
            new DataGridDataCell(gridSpec, index, {
                'rowspan': gridSpec.rowSpanForRecord(index),
                'minWidth': 200
            })
        ];
    };
    DataGridSpecLines.prototype.generateExperimenterInitialsCells = function (gridSpec, index) {
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
    };
    DataGridSpecLines.prototype.generateModificationDateCells = function (gridSpec, index) {
        return [
            new DataGridDataCell(gridSpec, index, {
                'rowspan': gridSpec.rowSpanForRecord(index),
                'contentString': Utl.JS.timestampToTodayString(EDDData.Lines[index].modified.time)
            })
        ];
    };
    DataGridSpecLines.prototype.makeMetaDataCellsGeneratorFunction = function (id) {
        return function (gridSpec, index) {
            var contentStr = '', line = EDDData.Lines[index], type = EDDData.MetaDataTypes[id];
            if (line && type && line.meta && (contentStr = line.meta[id] || '')) {
                contentStr = [type.pre || '', contentStr, type.postfix || ''].join(' ').trim();
            }
            return [
                new DataGridDataCell(gridSpec, index, {
                    'rowspan': gridSpec.rowSpanForRecord(index),
                    'contentString': contentStr
                })
            ];
        };
    };
    // Specification for each of the data columns that will make up the body of the table
    DataGridSpecLines.prototype.defineColumnSpec = function () {
        var _this = this;
        var leftSide, metaDataCols, rightSide;
        leftSide = [
            new DataGridColumnSpec(1, this.generateLineNameCells),
            new DataGridColumnSpec(2, this.generateDescriptionCells),
            new DataGridColumnSpec(3, this.generateStrainNameCells),
            new DataGridColumnSpec(4, this.generateCarbonSourceCells),
            new DataGridColumnSpec(5, this.generateCarbonSourceLabelingCells),
            // The Carbon Balance cells are populated by a callback, triggered when first displayed
            new DataGridColumnSpec(6, this.generateCarbonBalanceBlankCells)
        ];
        metaDataCols = this.metaDataIDsUsedInLines.map(function (id, index) {
            return new DataGridColumnSpec(7 + index, _this.makeMetaDataCellsGeneratorFunction(id));
        });
        rightSide = [
            new DataGridColumnSpec(7 + metaDataCols.length, this.generateExperimenterInitialsCells),
            new DataGridColumnSpec(8 + metaDataCols.length, this.generateModificationDateCells)
        ];
        return leftSide.concat(metaDataCols, rightSide);
    };
    // Specification for each of the groups that the headers and data columns are organized into
    DataGridSpecLines.prototype.defineColumnGroupSpec = function () {
        var topSection = [
            new DataGridColumnGroupSpec('Line Name', { 'showInVisibilityList': false }),
            new DataGridColumnGroupSpec('Description'),
            new DataGridColumnGroupSpec('Strain'),
            new DataGridColumnGroupSpec('Carbon Source(s)'),
            new DataGridColumnGroupSpec('Labeling'),
            this.carbonBalanceCol = new DataGridColumnGroupSpec('Carbon Balance', {
                'showInVisibilityList': false,
                'hiddenByDefault': true,
                'revealedCallback': StudyLines.carbonBalanceColumnRevealedCallback
            })
        ];
        var metaDataColGroups;
        metaDataColGroups = this.metaDataIDsUsedInLines.map(function (id, index) {
            var mdType = EDDData.MetaDataTypes[id];
            return new DataGridColumnGroupSpec(mdType.name);
        });
        var bottomSection = [
            new DataGridColumnGroupSpec('Experimenter', { 'hiddenByDefault': true }),
            new DataGridColumnGroupSpec('Last Modified', { 'hiddenByDefault': true })
        ];
        return topSection.concat(metaDataColGroups, bottomSection);
    };
    // Specification for the groups that rows can be gathered into
    DataGridSpecLines.prototype.defineRowGroupSpec = function () {
        var rowGroupSpec = [];
        for (var x = 0; x < this.groupIDsInOrder.length; x++) {
            var id = this.groupIDsInOrder[x];
            var rowGroupSpecEntry = {
                name: this.groupIDsToGroupNames[id]
            };
            rowGroupSpec.push(rowGroupSpecEntry);
        }
        return rowGroupSpec;
    };
    // The table element on the page that will be turned into the DataGrid.  Any preexisting table
    // content will be removed.
    DataGridSpecLines.prototype.getTableElement = function () {
        return document.getElementById("studyLinesTable");
    };
    // An array of unique identifiers (numbers, not strings), used to identify the records in the
    // data set being displayed
    DataGridSpecLines.prototype.getRecordIDs = function () {
        return Object.keys(EDDData.Lines);
    };
    // This is called to generate the array of custom header widgets. The order of the array will be
    // the order they are added to the header bar. It's perfectly fine to return an empty array.
    DataGridSpecLines.prototype.createCustomHeaderWidgets = function (dataGrid) {
        var widgetSet = [];
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
    };
    // This is called to generate the array of custom options menu widgets. The order of the array
    // will be the order they are displayed in the menu. Empty array = OK.
    DataGridSpecLines.prototype.createCustomOptionsWidgets = function (dataGrid) {
        var widgetSet = [];
        // Create a single widget for showing disabled Lines
        var groupLinesWidget = new DGGroupStudyReplicatesWidget(dataGrid, this);
        widgetSet.push(groupLinesWidget);
        var disabledLinesWidget = new DGDisabledLinesWidget(dataGrid, this);
        widgetSet.push(disabledLinesWidget);
        return widgetSet;
    };
    // This is called after everything is initialized, including the creation of the table content.
    DataGridSpecLines.prototype.onInitialized = function (dataGrid) {
        // Wire up the 'action panels' for the Lines and Assays sections
        var linesTable = this.getTableElement();
        $(linesTable).on('change', ':checkbox', function () { return StudyLines.queueLinesActionPanelShow(); });
        // This calls down into the instantiated widget and alters its styling,
        // so we need to do it after the table has been created.
        this.enableCarbonBalanceWidget(false);
        // Wire-in our custom edit fields for the Studies page, and continue with general init
        StudyLines.prepareAfterLinesTable();
    };
    return DataGridSpecLines;
}(DataGridSpecBase));
// When unchecked, this hides the set of Lines that are marked as disabled.
var DGDisabledLinesWidget = (function (_super) {
    __extends(DGDisabledLinesWidget, _super);
    function DGDisabledLinesWidget() {
        return _super !== null && _super.apply(this, arguments) || this;
    }
    DGDisabledLinesWidget.prototype.createElements = function (uniqueID) {
        var _this = this;
        var cbID = this.dataGridSpec.tableSpec.id + 'ShowDLinesCB' + uniqueID;
        var cb = this._createCheckbox(cbID, cbID, '1');
        $(cb).click(function (e) { return _this.dataGridOwnerObject.clickedOptionWidget(e); });
        if (this.isEnabledByDefault()) {
            cb.setAttribute('checked', 'checked');
        }
        this.checkBoxElement = cb;
        this.labelElement = this._createLabel('Show Disabled', cbID);
        this._createdElements = true;
    };
    DGDisabledLinesWidget.prototype.applyFilterToIDs = function (rowIDs) {
        var checked = false;
        if (this.checkBoxElement.checked) {
            checked = true;
        }
        // If the box is checked, return the set of IDs unfiltered
        if (checked && rowIDs && EDDData.currentStudyWritable) {
            $(".enableButton").removeClass('off');
            return rowIDs;
        }
        else {
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
    };
    DGDisabledLinesWidget.prototype.initialFormatRowElementsForID = function (dataRowObjects, rowID) {
        if (!EDDData.Lines[rowID].active) {
            $.each(dataRowObjects, function (x, row) { return $(row.getElement()).addClass('disabledRecord'); });
        }
    };
    return DGDisabledLinesWidget;
}(DataGridOptionWidget));
// A widget to toggle replicate grouping on and off
var DGGroupStudyReplicatesWidget = (function (_super) {
    __extends(DGGroupStudyReplicatesWidget, _super);
    function DGGroupStudyReplicatesWidget() {
        return _super !== null && _super.apply(this, arguments) || this;
    }
    DGGroupStudyReplicatesWidget.prototype.createElements = function (uniqueID) {
        var pThis = this;
        var cbID = 'GroupStudyReplicatesCB';
        var cb = this._createCheckbox(cbID, cbID, '1');
        $(cb).click(function (e) {
            if (pThis.checkBoxElement.checked) {
                pThis.dataGridOwnerObject.turnOnRowGrouping();
            }
            else {
                pThis.dataGridOwnerObject.turnOffRowGrouping();
            }
        });
        if (this.isEnabledByDefault()) {
            cb.setAttribute('checked', 'checked');
        }
        this.checkBoxElement = cb;
        this.labelElement = this._createLabel('Group Replicates', cbID);
        this._createdElements = true;
    };
    return DGGroupStudyReplicatesWidget;
}(DataGridOptionWidget));
// This is a DataGridHeaderWidget derived from DGSearchWidget. It's a search field that offers
// options for additional data types, querying the server for results.
var DGLinesSearchWidget = (function (_super) {
    __extends(DGLinesSearchWidget, _super);
    function DGLinesSearchWidget(dataGridOwnerObject, dataGridSpec, placeHolder, size, getsFocus) {
        return _super.call(this, dataGridOwnerObject, dataGridSpec, placeHolder, size, getsFocus) || this;
    }
    // The uniqueID is provided to assist the widget in avoiding collisions when creating input
    // element labels or other things requiring an ID.
    DGLinesSearchWidget.prototype.createElements = function (uniqueID) {
        _super.prototype.createElements.call(this, uniqueID);
        this.createdElements(true);
    };
    // This is called to append the widget elements beneath the given element. If the elements have
    // not been created yet, they are created, and the uniqueID is passed along.
    DGLinesSearchWidget.prototype.appendElements = function (container, uniqueID) {
        if (!this.createdElements()) {
            this.createElements(uniqueID);
        }
        container.appendChild(this.element);
    };
    return DGLinesSearchWidget;
}(DGSearchWidget));
// A header widget to prepare the Carbon Balance table cells, and show or hide them.
var DGShowCarbonBalanceWidget = (function (_super) {
    __extends(DGShowCarbonBalanceWidget, _super);
    function DGShowCarbonBalanceWidget(dataGridOwnerObject, dataGridSpec) {
        var _this = _super.call(this, dataGridOwnerObject, dataGridSpec) || this;
        _this.checkboxEnabled = true;
        _this.highlighted = false;
        _this._lineSpec = dataGridSpec;
        return _this;
    }
    DGShowCarbonBalanceWidget.prototype.createElements = function (uniqueID) {
        var _this = this;
        var cbID = this.dataGridSpec.tableSpec.id + 'CarBal' + uniqueID;
        var cb = this._createCheckbox(cbID, cbID, '1');
        cb.className = 'tableControl';
        $(cb).click(function (ev) {
            _this.activateCarbonBalance();
        });
        var label = this._createLabel('Carbon Balance', cbID);
        var span = document.createElement("span");
        span.className = 'tableControl';
        span.appendChild(cb);
        span.appendChild(label);
        this.checkBoxElement = cb;
        this.labelElement = label;
        this.element = span;
        this.createdElements(true);
    };
    DGShowCarbonBalanceWidget.prototype.highlight = function (h) {
        this.highlighted = h;
        if (this.checkboxEnabled) {
            if (h) {
                this.labelElement.style.color = 'red';
            }
            else {
                this.labelElement.style.color = '';
            }
        }
    };
    DGShowCarbonBalanceWidget.prototype.enable = function (h) {
        this.checkboxEnabled = h;
        if (h) {
            this.highlight(this.highlighted);
            this.checkBoxElement.removeAttribute('disabled');
        }
        else {
            this.labelElement.style.color = 'gray';
            this.checkBoxElement.setAttribute('disabled', true);
        }
    };
    DGShowCarbonBalanceWidget.prototype.activateCarbonBalance = function () {
        var _this = this;
        var ui, callback;
        callback = function (error, metabolicMapID, metabolicMapFilename, finalBiomass) {
            if (!error) {
                StudyLines.metabolicMapID = metabolicMapID;
                StudyLines.metabolicMapName = metabolicMapFilename;
                StudyLines.biomassCalculation = finalBiomass;
                StudyLines.onChangedMetabolicMap();
                _this.checkBoxElement.checked = true;
                _this.dataGridOwnerObject.showColumn(_this._lineSpec.carbonBalanceCol);
            }
        };
        if (this.checkBoxElement.checked) {
            // We need to get a biomass calculation to multiply against OD.
            // Have they set this up yet?
            if (!StudyLines.biomassCalculation || StudyLines.biomassCalculation === -1) {
                this.checkBoxElement.checked = false;
                // Must setup the biomass
                ui = new FullStudyBiomassUI(callback);
            }
            else {
                this.dataGridOwnerObject.showColumn(this._lineSpec.carbonBalanceCol);
            }
        }
        else {
            this.dataGridOwnerObject.hideColumn(this._lineSpec.carbonBalanceCol);
        }
    };
    return DGShowCarbonBalanceWidget;
}(DataGridHeaderWidget));
// use JQuery ready event shortcut to call prepareIt when page is ready
$(function () { return StudyLines.prepareIt(); });
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiU3R1ZHktTGluZXMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJTdHVkeS1MaW5lcy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxvREFBb0Q7QUFDcEQscURBQXFEO0FBQ3JELCtCQUErQjtBQUMvQixxQ0FBcUM7QUFDckMsZ0RBQWdEO0FBQ2hELDJDQUEyQztBQUMzQyxvQ0FBb0M7QUFDcEMsd0NBQXdDOzs7Ozs7Ozs7OztBQUd4QyxJQUFVLFVBQVUsQ0F5bkJuQjtBQXpuQkQsV0FBVSxVQUFVO0lBQ2hCLFlBQVksQ0FBQztJQUViLElBQUksNEJBQWdDLENBQUM7SUFDckMsSUFBSSx1QkFBMkIsQ0FBQztJQUNoQyxJQUFJLGFBQWlCLENBQUM7SUFDdEIsSUFBSSxlQUFtQixDQUFDO0lBQ3hCLElBQUksMEJBQThCLENBQUM7SUFRbkMsSUFBSSxpQkFBcUIsQ0FBQztJQUMxQixJQUFJLDJCQUFtQyxDQUFDO0lBRXhDLElBQUksY0FBa0IsQ0FBQztJQUN2QixJQUFJLFlBQWdCLENBQUM7SUFRViw4QkFBbUIsR0FBRyxLQUFLLENBQUM7SUFJdkMsOEJBQThCO0lBQzlCO1FBQUEsaUJBZ0hDO1FBOUdHLGlCQUFpQixHQUFHLElBQUksQ0FBQztRQUN6QiwyQkFBMkIsR0FBRyxLQUFLLENBQUM7UUFFcEMsYUFBYSxHQUFHLElBQUksQ0FBQztRQUNyQixlQUFlLEdBQUcsSUFBSSxDQUFDO1FBQ3ZCLDBCQUEwQixHQUFHLElBQUksQ0FBQztRQUVsQyxXQUFBLGNBQWMsR0FBRyxDQUFDLENBQUMsQ0FBQztRQUNwQixXQUFBLGdCQUFnQixHQUFHLElBQUksQ0FBQztRQUN4QixXQUFBLGtCQUFrQixHQUFHLENBQUMsQ0FBQyxDQUFDO1FBRXhCLGNBQWMsR0FBRyxFQUFFLENBQUM7UUFDcEIsWUFBWSxHQUFHLEVBQUUsQ0FBQztRQUVsQixXQUFBLGlCQUFpQixHQUFHLElBQUksQ0FBQztRQUN6QixXQUFBLGFBQWEsR0FBRyxJQUFJLENBQUM7UUFFckIs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Z0JBQWdCLENBQUMsQ0FBQztZQUN6RSxDQUFDO1FBQ0wsQ0FBQztRQUFDLElBQUksQ0FBQyxDQUFDO1lBQ0osSUFBSSxDQUFDLG1CQUFtQixDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLGdCQUFnQixDQUFDLENBQUM7UUFDekUsQ0FBQztJQUNMLENBQUM7SUFDTCxnQ0FBQztBQUFELENBQUMsQUExRkQsQ0FBd0Msb0JBQW9CLEdBMEYzRDtBQUdELHVFQUF1RTtBQUN2RSxDQUFDLENBQUMsY0FBTSxPQUFBLFVBQVUsQ0FBQyxTQUFTLEVBQUUsRUFBdEIsQ0FBc0IsQ0FBQyxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiLy8gRmlsZSBsYXN0IG1vZGlmaWVkIG9uOiBNb24gQXVnIDE0IDIwMTcgMTY6NDk6NDkgIFxuLy8vIDxyZWZlcmVuY2UgcGF0aD1cInR5cGVzY3JpcHQtZGVjbGFyYXRpb25zLmQudHNcIiAvPlxuLy8vIDxyZWZlcmVuY2UgcGF0aD1cIlV0bC50c1wiIC8+XG4vLy8gPHJlZmVyZW5jZSBwYXRoPVwiRHJhZ2JveGVzLnRzXCIgLz5cbi8vLyA8cmVmZXJlbmNlIHBhdGg9XCJCaW9tYXNzQ2FsY3VsYXRpb25VSS50c1wiIC8+XG4vLy8gPHJlZmVyZW5jZSBwYXRoPVwiQ2FyYm9uU3VtbWF0aW9uLnRzXCIgLz5cbi8vLyA8cmVmZXJlbmNlIHBhdGg9XCJEYXRhR3JpZC50c1wiIC8+XG4vLy8gPHJlZmVyZW5jZSBwYXRoPVwiRmlsZURyb3Bab25lLnRzXCIgLz5cblxuZGVjbGFyZSB2YXIgRURERGF0YTpFREREYXRhO1xubmFtZXNwYWNlIFN0dWR5TGluZXMge1xuICAgICd1c2Ugc3RyaWN0JztcblxuICAgIHZhciBsaW5lc0FjdGlvblBhbmVsUmVmcmVzaFRpbWVyOmFueTtcbiAgICB2YXIgcG9zaXRpb25BY3Rpb25zQmFyVGltZXI6YW55O1xuICAgIHZhciBhdHRhY2htZW50SURzOmFueTtcbiAgICB2YXIgYXR0YWNobWVudHNCeUlEOmFueTtcbiAgICB2YXIgcHJldkRlc2NyaXB0aW9uRWRpdEVsZW1lbnQ6YW55O1xuXG4gICAgLy8gV2UgY2FuIGhhdmUgYSB2YWxpZCBtZXRhYm9saWMgbWFwIGJ1dCBubyB2YWxpZCBiaW9tYXNzIGNhbGN1bGF0aW9uLlxuICAgIC8vIElmIHRoZXkgdHJ5IHRvIHNob3cgY2FyYm9uIGJhbGFuY2UgaW4gdGhhdCBjYXNlLCB3ZSdsbCBicmluZyB1cCB0aGUgVUkgdG9cbiAgICAvLyBjYWxjdWxhdGUgYmlvbWFzcyBmb3IgdGhlIHNwZWNpZmllZCBtZXRhYm9saWMgbWFwLlxuICAgIGV4cG9ydCB2YXIgbWV0YWJvbGljTWFwSUQ6YW55O1xuICAgIGV4cG9ydCB2YXIgbWV0YWJvbGljTWFwTmFtZTphbnk7XG4gICAgZXhwb3J0IHZhciBiaW9tYXNzQ2FsY3VsYXRpb246bnVtYmVyO1xuICAgIHZhciBjYXJib25CYWxhbmNlRGF0YTphbnk7XG4gICAgdmFyIGNhcmJvbkJhbGFuY2VEaXNwbGF5SXNGcmVzaDpib29sZWFuO1xuXG4gICAgdmFyIGNTb3VyY2VFbnRyaWVzOmFueTtcbiAgICB2YXIgbVR5cGVFbnRyaWVzOmFueTtcblxuICAgIC8vIFRoZSB0YWJsZSBzcGVjIG9iamVjdCBhbmQgdGFibGUgb2JqZWN0IGZvciB0aGUgTGluZXMgdGFibGUuXG4gICAgZXhwb3J0IHZhciBsaW5lc0RhdGFHcmlkU3BlYztcbiAgICBleHBvcnQgdmFyIGxpbmVzRGF0YUdyaWQ7XG4gICAgLy8gV2UgdXNlIG91ciBvd24gZmxhZyB0byBlbnN1cmUgd2UgZG9uJ3QgZ2V0IGludG8gYW4gaW5maW5pdGUgZXZlbnQgbG9vcCxcbiAgICAvLyBzd2l0Y2hpbmcgYmFjayBhbmQgZm9ydGggYmV0d2VlbiBwb3NpdGlvbnMgdGhhdCBtaWdodCB0cmlnZ2VyIHJlc2l6ZSBldmVudHMuXG4gICAgZXhwb3J0IHZhciBhY3Rpb25QYW5lbElzSW5Cb3R0b21CYXI7XG4gICAgZXhwb3J0IHZhciBhY3Rpb25QYW5lbElzQ29waWVkID0gZmFsc2U7XG4gICAgZXhwb3J0IHZhciBmaWxlVXBsb2FkUHJvZ3Jlc3NCYXI6IFV0bC5Qcm9ncmVzc0JhcjtcblxuXG4gICAgLy8gQ2FsbGVkIHdoZW4gdGhlIHBhZ2UgbG9hZHMuXG4gICAgZXhwb3J0IGZ1bmN0aW9uIHByZXBhcmVJdCgpIHtcblxuICAgICAgICBjYXJib25CYWxhbmNlRGF0YSA9IG51bGw7XG4gICAgICAgIGNhcmJvbkJhbGFuY2VEaXNwbGF5SXNGcmVzaCA9IGZhbHNlO1xuXG4gICAgICAgIGF0dGFjaG1lbnRJRHMgPSBudWxsO1xuICAgICAgICBhdHRhY2htZW50c0J5SUQgPSBudWxsO1xuICAgICAgICBwcmV2RGVzY3JpcHRpb25FZGl0RWxlbWVudCA9IG51bGw7XG5cbiAgICAgICAgbWV0YWJvbGljTWFwSUQgPSAtMTtcbiAgICAgICAgbWV0YWJvbGljTWFwTmFtZSA9IG51bGw7XG4gICAgICAgIGJpb21hc3NDYWxjdWxhdGlvbiA9IC0xO1xuXG4gICAgICAgIGNTb3VyY2VFbnRyaWVzID0gW107XG4gICAgICAgIG1UeXBlRW50cmllcyA9IFtdO1xuXG4gICAgICAgIGxpbmVzRGF0YUdyaWRTcGVjID0gbnVsbDtcbiAgICAgICAgbGluZXNEYXRhR3JpZCA9IG51bGw7XG5cbiAgICAgICAgYWN0aW9uUGFuZWxJc0luQm90dG9tQmFyID0gZmFsc2U7XG5cbiAgICAgICAgbGluZXNBY3Rpb25QYW5lbFJlZnJlc2hUaW1lciA9IG51bGw7XG4gICAgICAgIHBvc2l0aW9uQWN0aW9uc0JhclRpbWVyID0gbnVsbDtcblxuICAgICAgICB0aGlzLmZpbGVVcGxvYWRQcm9ncmVzc0JhciA9IG5ldyBVdGwuUHJvZ3Jlc3NCYXIoJ2ZpbGVVcGxvYWRQcm9ncmVzc0JhcicpO1xuICAgICAgICB2YXIgZmlsZURyb3Bab25lSGVscGVyID0gbmV3IEZpbGVEcm9wWm9uZS5GaWxlRHJvcFpvbmVIZWxwZXJzKHtcbiAgICAgICAgICAgcGFnZVJlZGlyZWN0OiAnJyxcbiAgICAgICAgICAgaGF2ZUlucHV0RGF0YTogZmFsc2UsXG4gICAgICAgIH0pO1xuXG4gICAgICAgIFV0bC5GaWxlRHJvcFpvbmUuY3JlYXRlKHtcbiAgICAgICAgICAgIGVsZW1lbnRJZDogXCJhZGRUb0xpbmVzRHJvcFpvbmVcIixcbiAgICAgICAgICAgIGZpbGVJbml0Rm46IGZpbGVEcm9wWm9uZUhlbHBlci5maWxlRHJvcHBlZC5iaW5kKGZpbGVEcm9wWm9uZUhlbHBlciksXG4gICAgICAgICAgICBwcm9jZXNzUmF3Rm46IGZpbGVEcm9wWm9uZUhlbHBlci5maWxlUmVhZC5iaW5kKGZpbGVEcm9wWm9uZUhlbHBlciksXG4gICAgICAgICAgICB1cmw6ICcvc3R1ZHkvJyArIEVERERhdGEuY3VycmVudFN0dWR5SUQgKyAnL2Rlc2NyaWJlLycsXG4gICAgICAgICAgICBwcm9jZXNzUmVzcG9uc2VGbjogZmlsZURyb3Bab25lSGVscGVyLmZpbGVSZXR1cm5lZEZyb21TZXJ2ZXIuYmluZChmaWxlRHJvcFpvbmVIZWxwZXIpLFxuICAgICAgICAgICAgcHJvY2Vzc0Vycm9yRm46IGZpbGVEcm9wWm9uZUhlbHBlci5maWxlRXJyb3JSZXR1cm5lZEZyb21TZXJ2ZXIuYmluZChmaWxlRHJvcFpvbmVIZWxwZXIpLFxuICAgICAgICAgICAgcHJvY2Vzc1dhcm5pbmdGbjogZmlsZURyb3Bab25lSGVscGVyLmZpbGVXYXJuaW5nUmV0dXJuZWRGcm9tU2VydmVyLmJpbmQoZmlsZURyb3Bab25lSGVscGVyKSxcbiAgICAgICAgICAgIHByb2dyZXNzQmFyOiB0aGlzLmZpbGVVcGxvYWRQcm9ncmVzc0JhclxuICAgICAgICB9KTtcblxuICAgICAgICAkKCcjY29udGVudCcpLm9uKCdkcmFnb3ZlcicsIGZ1bmN0aW9uKGU6YW55KSB7XG4gICAgICAgICAgICBlLnN0b3BQcm9wYWdhdGlvbigpO1xuICAgICAgICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICAgICAgJChcIi5saW5lc0Ryb3Bab25lXCIpLnJlbW92ZUNsYXNzKCdvZmYnKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgJCgnI2NvbnRlbnQnKS5vbignZHJhZ2VuZCwgZHJhZ2xlYXZlLCBtb3VzZWxlYXZlJywgZnVuY3Rpb24oZTphbnkpIHtcbiAgICAgICAgICAgJChcIi5saW5lc0Ryb3Bab25lXCIpLmFkZENsYXNzKCdvZmYnKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgJCgnI2NvbnRlbnQnKS50b29sdGlwKHtcbiAgICAgICAgICAgIGNvbnRlbnQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gJCh0aGlzKS5wcm9wKCd0aXRsZScpO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHBvc2l0aW9uOiB7IG15OiBcImxlZnQtMTAgY2VudGVyXCIsIGF0OiBcInJpZ2h0IGNlbnRlclwiIH0sXG4gICAgICAgICAgICBzaG93OiBudWxsLFxuICAgICAgICAgICAgY2xvc2U6IGZ1bmN0aW9uIChldmVudCwgdWk6YW55KSB7XG4gICAgICAgICAgICAgICAgdWkudG9vbHRpcC5ob3ZlcihcbiAgICAgICAgICAgICAgICBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgICAgICQodGhpcykuc3RvcCh0cnVlKS5mYWRlVG8oNDAwLCAxKTtcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICAgICAgJCh0aGlzKS5mYWRlT3V0KFwiNDAwXCIsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICQodGhpcykucmVtb3ZlKCk7XG4gICAgICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIHB1dCB0aGUgY2xpY2sgaGFuZGxlciBhdCB0aGUgZG9jdW1lbnQgbGV2ZWwsIHRoZW4gZmlsdGVyIHRvIGFueSBsaW5rIGluc2lkZSBhIC5kaXNjbG9zZVxuICAgICAgICAkKGRvY3VtZW50KS5vbignY2xpY2snLCAnLmRpc2Nsb3NlIC5kaXNjbG9zZUxpbmsnLCAoZSkgPT4ge1xuICAgICAgICAgICAgJChlLnRhcmdldCkuY2xvc2VzdCgnLmRpc2Nsb3NlJykudG9nZ2xlQ2xhc3MoJ2Rpc2Nsb3NlSGlkZScpO1xuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9KTtcblxuICAgICAgICAkKHdpbmRvdykub24oJ3Jlc2l6ZScsIHF1ZXVlUG9zaXRpb25BY3Rpb25zQmFyKTtcblxuICAgICAgICAvL3doZW4gYWxsIGFqYXggcmVxdWVzdHMgYXJlIGZpbmlzaGVkLCBkZXRlcm1pbmUgaWYgdGhlcmUgYXJlIEFzc2F5TWVhc3VyZW1lbnRzLlxuICAgICAgICAkKGRvY3VtZW50KS5hamF4U3RvcChmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIC8vIGhpZGUgZXhwb3J0IGJ1dHRvbiBpZiB0aGVyZSBhcmUgbm8gYXNzYXlzXG4gICAgICAgICAgICBpZiAoXy5rZXlzKEVERERhdGEuQXNzYXlzKS5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgICAgICAkKCcjZXhwb3J0TGluZUJ1dHRvbicpLnByb3AoJ2Rpc2FibGVkJywgdHJ1ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICAkKCcjZXhwb3J0TGluZUJ1dHRvbicpLnByb3AoJ2Rpc2FibGVkJywgZmFsc2UpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICAkLmFqYXgoe1xuICAgICAgICAgICAgJ3VybCc6ICcuLi9lZGRkYXRhLycsXG4gICAgICAgICAgICAndHlwZSc6ICdHRVQnLFxuICAgICAgICAgICAgJ2Vycm9yJzogKHhociwgc3RhdHVzLCBlKSA9PiB7XG4gICAgICAgICAgICAgICAgJCgnI292ZXJ2aWV3U2VjdGlvbicpLnByZXBlbmQoXCI8ZGl2IGNsYXNzPSdub0RhdGEnPkVycm9yLiBQbGVhc2UgcmVsb2FkPC9kaXY+XCIpO1xuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKFsnTG9hZGluZyBFREREYXRhIGZhaWxlZDogJywgc3RhdHVzLCAnOycsIGVdLmpvaW4oJycpKTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAnc3VjY2Vzcyc6IChkYXRhKSA9PiB7XG4gICAgICAgICAgICAgICAgRURERGF0YSA9ICQuZXh0ZW5kKEVERERhdGEgfHwge30sIGRhdGEpO1xuICAgICAgICAgICAgICAgIC8vIEluc3RhbnRpYXRlIGEgdGFibGUgc3BlY2lmaWNhdGlvbiBmb3IgdGhlIExpbmVzIHRhYmxlXG4gICAgICAgICAgICAgICAgU3R1ZHlMaW5lcy5saW5lc0RhdGFHcmlkU3BlYyA9IG5ldyBEYXRhR3JpZFNwZWNMaW5lcygpO1xuICAgICAgICAgICAgICAgIFN0dWR5TGluZXMubGluZXNEYXRhR3JpZFNwZWMuaW5pdCgpO1xuICAgICAgICAgICAgICAgIC8vIEluc3RhbnRpYXRlIHRoZSB0YWJsZSBpdHNlbGYgd2l0aCB0aGUgc3BlY1xuICAgICAgICAgICAgICAgIFN0dWR5TGluZXMubGluZXNEYXRhR3JpZCA9IG5ldyBMaW5lUmVzdWx0cyh0aGlzLmxpbmVzRGF0YUdyaWRTcGVjKTtcblxuICAgICAgICAgICAgICAgIC8vIFNob3cgcG9zc2libGUgbmV4dCBzdGVwcyBkaXYgaWYgbmVlZGVkXG4gICAgICAgICAgICAgICAgaWYgKF8ua2V5cyhFREREYXRhLkxpbmVzKS5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgICAgICAgICAgJCgnLm5vTGluZXMnKS5jc3MoJ2Rpc3BsYXknLCAnYmxvY2snKTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAkKCcubm9MaW5lcycpLmNzcygnZGlzcGxheScsICdub25lJyk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBleHBvcnQgZnVuY3Rpb24gcHJvY2Vzc0NhcmJvbkJhbGFuY2VEYXRhKCkge1xuICAgICAgICAvLyBQcmVwYXJlIHRoZSBjYXJib24gYmFsYW5jZSBncmFwaFxuICAgICAgICB0aGlzLmNhcmJvbkJhbGFuY2VEYXRhID0gbmV3IENhcmJvbkJhbGFuY2UuRGlzcGxheSgpO1xuICAgICAgICB2YXIgaGlnaGxpZ2h0Q2FyYm9uQmFsYW5jZVdpZGdldCA9IGZhbHNlO1xuICAgICAgICBpZiAoIHRoaXMuYmlvbWFzc0NhbGN1bGF0aW9uID4gLTEgKSB7XG4gICAgICAgICAgICB0aGlzLmNhcmJvbkJhbGFuY2VEYXRhLmNhbGN1bGF0ZUNhcmJvbkJhbGFuY2VzKHRoaXMubWV0YWJvbGljTWFwSUQsXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuYmlvbWFzc0NhbGN1bGF0aW9uKTtcbiAgICAgICAgICAgIC8vIEhpZ2hsaWdodCB0aGUgXCJTaG93IENhcmJvbiBCYWxhbmNlXCIgY2hlY2tib3ggaW4gcmVkIGlmIHRoZXJlIGFyZSBDQiBpc3N1ZXMuXG4gICAgICAgICAgICBpZiAodGhpcy5jYXJib25CYWxhbmNlRGF0YS5nZXROdW1iZXJPZkltYmFsYW5jZXMoKSA+IDApIHtcbiAgICAgICAgICAgICAgICBoaWdobGlnaHRDYXJib25CYWxhbmNlV2lkZ2V0ID0gdHJ1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIC8vIEhpZ2hsaWdodCB0aGUgY2FyYm9uIGJhbGFuY2UgaW4gcmVkIHRvIGluZGljYXRlIHRoYXQgd2UgY2FuJ3QgY2FsY3VsYXRlXG4gICAgICAgICAgICAvLyBjYXJib24gYmFsYW5jZXMgeWV0LiBXaGVuIHRoZXkgY2xpY2sgdGhlIGNoZWNrYm94LCB3ZSdsbCBnZXQgdGhlbSB0b1xuICAgICAgICAgICAgLy8gc3BlY2lmeSB3aGljaCBTQk1MIGZpbGUgdG8gdXNlIGZvciBiaW9tYXNzLlxuICAgICAgICAgICAgaGlnaGxpZ2h0Q2FyYm9uQmFsYW5jZVdpZGdldCA9IHRydWU7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5saW5lc0RhdGFHcmlkU3BlYy5oaWdobGlnaHRDYXJib25CYWxhbmNlV2lkZ2V0KGhpZ2hsaWdodENhcmJvbkJhbGFuY2VXaWRnZXQpO1xuICAgIH1cblxuXG4gICAgLy8gQ2FsbGVkIGJ5IERhdGFHcmlkIGFmdGVyIHRoZSBMaW5lcyB0YWJsZSBpcyByZW5kZXJlZFxuICAgIGV4cG9ydCBmdW5jdGlvbiBwcmVwYXJlQWZ0ZXJMaW5lc1RhYmxlKCkge1xuXG4gICAgICAgIHZhciBwYXJlbnQ6IEpRdWVyeSA9ICQoJyNzdHVkeUxpbmVzVGFibGUnKS5wYXJlbnQoKSwgaGVscEJhZGdlOkpRdWVyeSwgaW5wdXQ6IEpRdWVyeTtcbiAgICAgICAgICAgIGlucHV0ID0gJCgnLnRhYmxlQ29udHJvbCcpLmxhc3QoKTtcbiAgICAgICAgICAgIGhlbHBCYWRnZSA9ICQoJy5tb3ZlJyk7XG4gICAgICAgIC8vIEVuYWJsZSBhZGQgbmV3IExpbmUgYnV0dG9uXG4gICAgICAgIHBhcmVudC5maW5kKCcuYWRkTmV3TGluZUJ1dHRvbicpLm9uKCdjbGljaycsIChldjpKUXVlcnlNb3VzZUV2ZW50T2JqZWN0KTpib29sZWFuID0+IHtcbiAgICAgICAgICAgIGV2LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgICAgICBldi5zdG9wUHJvcGFnYXRpb24oKTtcbiAgICAgICAgICAgIFN0dWR5TGluZXMuZWRpdExpbmVzKFtdKTtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gRW5hYmxlIGVkaXQgbGluZXMgYnV0dG9uXG4gICAgICAgIHBhcmVudC5maW5kKCcuZWRpdEJ1dHRvbicpLm9uKCdjbGljaycsIChldjpKUXVlcnlNb3VzZUV2ZW50T2JqZWN0KTpib29sZWFuID0+IHtcbiAgICAgICAgICAgIHZhciBidXR0b24gPSAkKGV2LnRhcmdldCksIGRhdGEgPSBidXR0b24uZGF0YSgpO1xuICAgICAgICAgICAgZXYucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgICAgIFN0dWR5TGluZXMuZWRpdExpbmVzKGRhdGEuaWRzIHx8IFtdKTtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgJChoZWxwQmFkZ2UpLmluc2VydEFmdGVyKGlucHV0KTtcblxuICAgICAgICAvLyBTZXQgdXAgalF1ZXJ5IG1vZGFsc1xuICAgICAgICAkKFwiI2VkaXRMaW5lTW9kYWxcIikuZGlhbG9nKHsgbWluV2lkdGg6IDUwMCwgYXV0b09wZW46IGZhbHNlIH0pO1xuICAgICAgICAkKFwiI2FkZEFzc2F5TW9kYWxcIikuZGlhbG9nKHsgbWluV2lkdGg6IDUwMCwgYXV0b09wZW46IGZhbHNlIH0pO1xuICAgICAgICAkKFwiI2V4cG9ydE1vZGFsXCIpLmRpYWxvZyh7XG4gICAgICAgICAgICBtaW5XaWR0aDogNDAwLFxuICAgICAgICAgICAgYXV0b09wZW46IGZhbHNlLFxuICAgICAgICAgICAgbWluSGVpZ2h0OiAwLFxuICAgICAgICAgICAgY3JlYXRlOiBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgICAkKHRoaXMpLmNzcyhcIm1heEhlaWdodFwiLCA0MDApO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICBwYXJlbnQuZmluZChcIi5hZGRBc3NheUJ1dHRvblwiKS5jbGljayhmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICQoXCIjYWRkQXNzYXlNb2RhbFwiKS5yZW1vdmVDbGFzcygnb2ZmJykuZGlhbG9nKCBcIm9wZW5cIiApO1xuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9KTtcblxuICAgICAgICBwYXJlbnQuZmluZChcIi5leHBvcnRMaW5lQnV0dG9uXCIpLmNsaWNrKGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgJChcIiNleHBvcnRNb2RhbFwiKS5yZW1vdmVDbGFzcygnb2ZmJykuZGlhbG9nKCBcIm9wZW5cIiApO1xuICAgICAgICAgICAgaW5jbHVkZUFsbExpbmVzSWZFbXB0eSgpO1xuICAgICAgICAgICAgLy9hZGQgdGFibGUgdG8gZm9ybSBhcyBoaWRkZW4gZmllbGQuXG4gICAgICAgICAgICB2YXIgdGFibGUgPSAkKCcjc3R1ZHlMaW5lc1RhYmxlJykuY2xvbmUoKTtcbiAgICAgICAgICAgICQoJyNleHBvcnRGb3JtJykuYXBwZW5kKHRhYmxlKTtcbiAgICAgICAgICAgIHRhYmxlLmhpZGUoKTtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcGFyZW50LmZpbmQoJy53b3JrbGlzdEJ1dHRvbicpLmNsaWNrKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIGluY2x1ZGVBbGxMaW5lc0lmRW1wdHkoKTtcbiAgICAgICAgICAgIHZhciB0YWJsZSA9ICQoJyNzdHVkeUxpbmVzVGFibGUnKS5jbG9uZSgpO1xuICAgICAgICAgICAgJCgnI2V4cG9ydEZvcm0nKS5hcHBlbmQodGFibGUpO1xuICAgICAgICAgICAgdGFibGUuaGlkZSgpO1xuICAgICAgICAgICAgJCgnc2VsZWN0W25hbWU9XCJleHBvcnRcIl0nKS52YWwoJ3dvcmtsaXN0Jyk7XG4gICAgICAgICAgICAkKCdidXR0b25bdmFsdWU9XCJsaW5lX2FjdGlvblwiXScpLmNsaWNrKCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vd2hlbiB0aGUgaW5wdXQgdmFsdWUgY2hhbmdlcywgYXNzaWduIGEgcHJlIG9yIHBvc3RmaXggdG8gdGhlIG1ldGFkYXRhIGlmIG9uZSBleGlzdHNcbiAgICAgICAgdmFyIHZhbHVlOiBhbnkgPSAkKCcuZWRkLWxhYmVsJykuY2hpbGRyZW4oJ2lucHV0JylbMV07XG5cbiAgICAgICAgJCh2YWx1ZSkub24oXCJjaGFuZ2VcIixmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICB2YXIgdmFsOiBhbnkgPSAkKHZhbHVlKS52YWwoKSxcbiAgICAgICAgICAgICAgICB0eXBlOiBNZXRhZGF0YVR5cGVSZWNvcmQgPSBFREREYXRhLk1ldGFEYXRhVHlwZXNbdmFsXSxcbiAgICAgICAgICAgICAgICBpbnB1dCA9ICQoJy5saW5lLW1ldGEtdmFsdWUnKSxcbiAgICAgICAgICAgICAgICBsaW5lID0gJCh0aGlzKS5wYXJlbnRzKCcubGluZS1lZGl0LW1ldGEnKTtcblxuICAgICAgICAgICAgIC8vcmVtb3ZlIHBvc3QgYW5kIHByZWZpeCBtZXRhIHZhbHVlc1xuICAgICAgICAgICAgIGxpbmUuZmluZCgnLm1ldGEtcG9zdGZpeCcpLnJlbW92ZSgpO1xuICAgICAgICAgICAgIGxpbmUuZmluZCgnLm1ldGEtcHJlZml4JykucmVtb3ZlKCk7XG5cbiAgICAgICAgICAgICBpZiAodHlwZSkge1xuICAgICAgICAgICAgICAgICBpZiAodHlwZS5wcmUpIHtcbiAgICAgICAgICAgICAgICAgICAgJCgnPHNwYW4+JykuYWRkQ2xhc3MoJ21ldGEtcHJlZml4JykudGV4dCh0eXBlLnByZSkuaW5zZXJ0QmVmb3JlKGlucHV0KTtcbiAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgIGlmICh0eXBlLnBvc3RmaXgpIHtcbiAgICAgICAgICAgICAgICAgICAgJCgnPHNwYW4+JykuYWRkQ2xhc3MoJ21ldGEtcG9zdGZpeCcpLnRleHQodHlwZS5wb3N0Zml4KS5pbnNlcnRBZnRlcihpbnB1dCk7XG4gICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICB9XG4gICAgICAgICB9KTtcblxuICAgICAgICAkKCcjZWRpdExpbmVNb2RhbCcpLm9uKCdjaGFuZ2UnLCAnLmxpbmUtbWV0YScsIChldikgPT4ge1xuICAgICAgICAgICAgLy8gd2F0Y2ggZm9yIGNoYW5nZXMgdG8gbWV0YWRhdGEgdmFsdWVzLCBhbmQgc2VyaWFsaXplIHRvIHRoZSBtZXRhX3N0b3JlIGZpZWxkXG4gICAgICAgICAgICB2YXIgZm9ybSA9ICQoZXYudGFyZ2V0KS5jbG9zZXN0KCdmb3JtJyksXG4gICAgICAgICAgICAgICAgbWV0YUluID0gZm9ybS5maW5kKCdbbmFtZT1saW5lLW1ldGFfc3RvcmVdJyksXG4gICAgICAgICAgICAgICAgbWV0YSA9IEpTT04ucGFyc2UobWV0YUluLnZhbCgpIHx8ICd7fScpO1xuICAgICAgICAgICAgZm9ybS5maW5kKCcubGluZS1tZXRhID4gOmlucHV0JykuZWFjaCgoaSwgaW5wdXQpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAoJChpbnB1dCkudmFsKCkgfHwgJChpbnB1dCkuc2libGluZ3MoJ2xhYmVsJykuZmluZCgnaW5wdXQnKS5wcm9wKCdjaGVja2VkJykpIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIGtleSA9ICQoaW5wdXQpLmF0dHIoJ2lkJykubWF0Y2goLy0oXFxkKykkLylbMV07XG4gICAgICAgICAgICAgICAgICAgIG1ldGFba2V5XSA9ICQoaW5wdXQpLnZhbCgpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgbWV0YUluLnZhbChKU09OLnN0cmluZ2lmeShtZXRhKSk7XG4gICAgICAgIH0pLm9uKCdjbGljaycsICcubGluZS1tZXRhLWFkZCcsIChldjpKUXVlcnlNb3VzZUV2ZW50T2JqZWN0KSA9PiB7XG4gICAgICAgICAgICAvLyBtYWtlIG1ldGFkYXRhIEFkZCBWYWx1ZSBidXR0b24gd29yayBhbmQgbm90IHN1Ym1pdCB0aGUgZm9ybVxuICAgICAgICAgICAgdmFyIGFkZHJvdyA9ICQoZXYudGFyZ2V0KS5jbG9zZXN0KCcubGluZS1lZGl0LW1ldGEnKSwgdHlwZSwgdmFsdWU7XG4gICAgICAgICAgICB0eXBlID0gYWRkcm93LmZpbmQoJy5saW5lLW1ldGEtdHlwZScpLnZhbCgpO1xuICAgICAgICAgICAgdmFsdWUgPSBhZGRyb3cuZmluZCgnLmxpbmUtbWV0YS12YWx1ZScpLnZhbCgpO1xuICAgICAgICAgICAgLy8gY2xlYXIgb3V0IGlucHV0cyBzbyBhbm90aGVyIHZhbHVlIGNhbiBiZSBlbnRlcmVkXG4gICAgICAgICAgICBhZGRyb3cuZmluZCgnOmlucHV0Jykubm90KCc6Y2hlY2tib3gsIDpyYWRpbycpLnZhbCgnJyk7XG4gICAgICAgICAgICBhZGRyb3cuZmluZCgnOmNoZWNrYm94LCA6cmFkaW8nKS5wcm9wKCdjaGVja2VkJywgZmFsc2UpO1xuICAgICAgICAgICAgaWYgKEVERERhdGEuTWV0YURhdGFUeXBlc1t0eXBlXSkge1xuICAgICAgICAgICAgICAgIGluc2VydExpbmVNZXRhZGF0YVJvdyhhZGRyb3csIHR5cGUsIHZhbHVlKS5maW5kKCc6aW5wdXQnKS50cmlnZ2VyKCdjaGFuZ2UnKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfSkub24oJ2NsaWNrJywgJy5tZXRhLXJlbW92ZScsIChldjpKUXVlcnlNb3VzZUV2ZW50T2JqZWN0KSA9PiB7XG4gICAgICAgICAgICAvLyByZW1vdmUgbWV0YWRhdGEgcm93IGFuZCBpbnNlcnQgbnVsbCB2YWx1ZSBmb3IgdGhlIG1ldGFkYXRhIGtleVxuICAgICAgICAgICAgdmFyIGZvcm0gPSAkKGV2LnRhcmdldCkuY2xvc2VzdCgnZm9ybScpLFxuICAgICAgICAgICAgICAgIG1ldGFSb3cgPSAkKGV2LnRhcmdldCkuY2xvc2VzdCgnLmxpbmUtbWV0YScpLFxuICAgICAgICAgICAgICAgIG1ldGFJbiA9IGZvcm0uZmluZCgnW25hbWU9bGluZS1tZXRhX3N0b3JlXScpLFxuICAgICAgICAgICAgICAgIG1ldGEgPSBKU09OLnBhcnNlKG1ldGFJbi52YWwoKSB8fCAne30nKSxcbiAgICAgICAgICAgICAgICBrZXkgPSBtZXRhUm93LmF0dHIoJ2lkJykubWF0Y2goLy0oXFxkKykkLylbMV07XG4gICAgICAgICAgICBtZXRhW2tleV0gPSBudWxsO1xuICAgICAgICAgICAgbWV0YUluLnZhbChKU09OLnN0cmluZ2lmeShtZXRhKSk7XG4gICAgICAgICAgICBtZXRhUm93LnJlbW92ZSgpO1xuICAgICAgICB9KTtcblxuICAgICAgICBxdWV1ZVBvc2l0aW9uQWN0aW9uc0JhcigpO1xuXG4gICAgICAgIC8vcHVsbGluZyBpbiBwcm90b2NvbCBtZWFzdXJlbWVudHMgQXNzYXlNZWFzdXJlbWVudHNcbiAgICAgICAgJC5lYWNoKEVERERhdGEuUHJvdG9jb2xzLCAoaWQsIHByb3RvY29sKSA9PiB7XG4gICAgICAgICAgICAkLmFqYXgoe1xuICAgICAgICAgICAgICAgIHVybDogJy9zdHVkeS8nICsgRURERGF0YS5jdXJyZW50U3R1ZHlJRCArICcvbWVhc3VyZW1lbnRzLycgKyBpZCArICcvJyxcbiAgICAgICAgICAgICAgICB0eXBlOiAnR0VUJyxcbiAgICAgICAgICAgICAgICBkYXRhVHlwZTogJ2pzb24nLFxuICAgICAgICAgICAgICAgIGVycm9yOiAoeGhyLCBzdGF0dXMpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgY29uc29sZS5sb2coJ0ZhaWxlZCB0byBmZXRjaCBtZWFzdXJlbWVudCBkYXRhIG9uICcgKyBwcm90b2NvbC5uYW1lICsgJyEnKTtcbiAgICAgICAgICAgICAgICAgICAgY29uc29sZS5sb2coc3RhdHVzKTtcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHByb2Nlc3NNZWFzdXJlbWVudERhdGEuYmluZCh0aGlzLCBwcm90b2NvbClcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBpbmNsdWRlQWxsTGluZXNJZkVtcHR5KCkge1xuICAgICAgICBpZiAoJCgnI3N0dWR5TGluZXNUYWJsZScpLmZpbmQoJ2lucHV0W25hbWU9bGluZUlkXTpjaGVja2VkJykubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICAvL2FwcGVuZCBzdHVkeSBpZCB0byBmb3JtXG4gICAgICAgICAgICB2YXIgc3R1ZHkgPSBfLmtleXMoRURERGF0YS5TdHVkaWVzKVswXTtcbiAgICAgICAgICAgICQoJzxpbnB1dD4nKS5hdHRyKHtcbiAgICAgICAgICAgICAgICB0eXBlOiAnaGlkZGVuJyxcbiAgICAgICAgICAgICAgICB2YWx1ZTogc3R1ZHksXG4gICAgICAgICAgICAgICAgbmFtZTogJ3N0dWR5SWQnLFxuICAgICAgICAgICAgfSkuYXBwZW5kVG8oJ2Zvcm0nKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIHByb2Nlc3NNZWFzdXJlbWVudERhdGEocHJvdG9jb2wsIGRhdGEpIHtcbiAgICAgICAgdmFyIGFzc2F5U2VlbiA9IHt9LFxuICAgICAgICAgICAgcHJvdG9jb2xUb0Fzc2F5ID0ge30sXG4gICAgICAgICAgICBjb3VudF90b3RhbDpudW1iZXIgPSAwLFxuICAgICAgICAgICAgY291bnRfcmVjOm51bWJlciA9IDA7XG4gICAgICAgIEVERERhdGEuQXNzYXlNZWFzdXJlbWVudHMgPSBFREREYXRhLkFzc2F5TWVhc3VyZW1lbnRzIHx8IHt9O1xuICAgICAgICBFREREYXRhLk1lYXN1cmVtZW50VHlwZXMgPSAkLmV4dGVuZChFREREYXRhLk1lYXN1cmVtZW50VHlwZXMgfHwge30sIGRhdGEudHlwZXMpO1xuXG4gICAgICAgIC8vIGF0dGFjaCBtZWFzdXJlbWVudCBjb3VudHMgdG8gZWFjaCBhc3NheVxuICAgICAgICAkLmVhY2goZGF0YS50b3RhbF9tZWFzdXJlcywgKGFzc2F5SWQ6c3RyaW5nLCBjb3VudDpudW1iZXIpOnZvaWQgPT4ge1xuICAgICAgICAgICAgdmFyIGFzc2F5ID0gRURERGF0YS5Bc3NheXNbYXNzYXlJZF07XG4gICAgICAgICAgICBpZiAoYXNzYXkpIHtcbiAgICAgICAgICAgICAgICBhc3NheS5jb3VudCA9IGNvdW50O1xuICAgICAgICAgICAgICAgIGNvdW50X3RvdGFsICs9IGNvdW50O1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgLy8gbG9vcCBvdmVyIGFsbCBkb3dubG9hZGVkIG1lYXN1cmVtZW50c1xuICAgICAgICAkLmVhY2goZGF0YS5tZWFzdXJlcyB8fCB7fSwgKGluZGV4LCBtZWFzdXJlbWVudCkgPT4ge1xuICAgICAgICAgICAgdmFyIGFzc2F5ID0gRURERGF0YS5Bc3NheXNbbWVhc3VyZW1lbnQuYXNzYXldLCBsaW5lLCBtdHlwZTtcbiAgICAgICAgICAgICsrY291bnRfcmVjO1xuICAgICAgICAgICAgaWYgKCFhc3NheSB8fCAhYXNzYXkuYWN0aXZlIHx8IGFzc2F5LmNvdW50ID09PSB1bmRlZmluZWQpIHJldHVybjtcbiAgICAgICAgICAgIGxpbmUgPSBFREREYXRhLkxpbmVzW2Fzc2F5LmxpZF07XG4gICAgICAgICAgICBpZiAoIWxpbmUgfHwgIWxpbmUuYWN0aXZlKSByZXR1cm47XG4gICAgICAgICAgICAvLyBhdHRhY2ggdmFsdWVzXG4gICAgICAgICAgICAkLmV4dGVuZChtZWFzdXJlbWVudCwgeyAndmFsdWVzJzogZGF0YS5kYXRhW21lYXN1cmVtZW50LmlkXSB8fCBbXSB9KTtcbiAgICAgICAgICAgIC8vIHN0b3JlIHRoZSBtZWFzdXJlbWVudHNcbiAgICAgICAgICAgIEVERERhdGEuQXNzYXlNZWFzdXJlbWVudHNbbWVhc3VyZW1lbnQuaWRdID0gbWVhc3VyZW1lbnQ7XG4gICAgICAgICAgICAvLyB0cmFjayB3aGljaCBhc3NheXMgcmVjZWl2ZWQgdXBkYXRlZCBtZWFzdXJlbWVudHNcbiAgICAgICAgICAgIGFzc2F5U2Vlblthc3NheS5pZF0gPSB0cnVlO1xuICAgICAgICAgICAgcHJvdG9jb2xUb0Fzc2F5W2Fzc2F5LnBpZF0gPSBwcm90b2NvbFRvQXNzYXlbYXNzYXkucGlkXSB8fCB7fTtcbiAgICAgICAgICAgIHByb3RvY29sVG9Bc3NheVthc3NheS5waWRdW2Fzc2F5LmlkXSA9IHRydWU7XG4gICAgICAgICAgICAvLyBoYW5kbGUgbWVhc3VyZW1lbnQgZGF0YSBiYXNlZCBvbiB0eXBlXG4gICAgICAgICAgICBtdHlwZSA9IGRhdGEudHlwZXNbbWVhc3VyZW1lbnQudHlwZV0gfHwge307XG4gICAgICAgICAgICAoYXNzYXkubWVhc3VyZXMgPSBhc3NheS5tZWFzdXJlcyB8fCBbXSkucHVzaChtZWFzdXJlbWVudC5pZCk7XG4gICAgICAgICAgICBpZiAobXR5cGUuZmFtaWx5ID09PSAnbScpIHsgLy8gbWVhc3VyZW1lbnQgaXMgb2YgbWV0YWJvbGl0ZVxuICAgICAgICAgICAgICAgIChhc3NheS5tZXRhYm9saXRlcyA9IGFzc2F5Lm1ldGFib2xpdGVzIHx8IFtdKS5wdXNoKG1lYXN1cmVtZW50LmlkKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAobXR5cGUuZmFtaWx5ID09PSAncCcpIHsgLy8gbWVhc3VyZW1lbnQgaXMgb2YgcHJvdGVpblxuICAgICAgICAgICAgICAgIChhc3NheS5wcm90ZWlucyA9IGFzc2F5LnByb3RlaW5zIHx8IFtdKS5wdXNoKG1lYXN1cmVtZW50LmlkKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAobXR5cGUuZmFtaWx5ID09PSAnZycpIHsgLy8gbWVhc3VyZW1lbnQgaXMgb2YgZ2VuZSAvIHRyYW5zY3JpcHRcbiAgICAgICAgICAgICAgICAoYXNzYXkudHJhbnNjcmlwdGlvbnMgPSBhc3NheS50cmFuc2NyaXB0aW9ucyB8fCBbXSkucHVzaChtZWFzdXJlbWVudC5pZCk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIC8vIHRocm93IGV2ZXJ5dGhpbmcgZWxzZSBpbiBhIGdlbmVyYWwgYXJlYVxuICAgICAgICAgICAgICAgIChhc3NheS5nZW5lcmFsID0gYXNzYXkuZ2VuZXJhbCB8fCBbXSkucHVzaChtZWFzdXJlbWVudC5pZCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGlmIChjb3VudF9yZWMgPCBjb3VudF90b3RhbCkge1xuICAgICAgICAgICAgLy8gVE9ETyBub3QgYWxsIG1lYXN1cmVtZW50cyBkb3dubG9hZGVkOyBkaXNwbGF5IGEgbWVzc2FnZSBpbmRpY2F0aW5nIHRoaXNcbiAgICAgICAgICAgIC8vIGV4cGxhaW4gZG93bmxvYWRpbmcgaW5kaXZpZHVhbCBhc3NheSBtZWFzdXJlbWVudHMgdG9vXG4gICAgICAgIH1cblxuICAgICAgICBxdWV1ZVBvc2l0aW9uQWN0aW9uc0JhcigpO1xuICAgICAgICB0aGlzLmxpbmVzRGF0YUdyaWRTcGVjLmVuYWJsZUNhcmJvbkJhbGFuY2VXaWRnZXQodHJ1ZSk7XG4gICAgICAgIHRoaXMucHJvY2Vzc0NhcmJvbkJhbGFuY2VEYXRhKCk7XG4gICAgfVxuXG5cbiAgICBleHBvcnQgZnVuY3Rpb24gY2FyYm9uQmFsYW5jZUNvbHVtblJldmVhbGVkQ2FsbGJhY2soc3BlYzpEYXRhR3JpZFNwZWNMaW5lcywgZGF0YUdyaWRPYmo6RGF0YUdyaWQpIHtcbiAgICAgICAgcmVidWlsZENhcmJvbkJhbGFuY2VHcmFwaHMoKTtcbiAgICB9XG5cblxuICAgIC8vIFN0YXJ0IGEgdGltZXIgdG8gd2FpdCBiZWZvcmUgY2FsbGluZyB0aGUgcm91dGluZSB0aGF0IHNob3dzIHRoZSBhY3Rpb25zIHBhbmVsLlxuICAgIGV4cG9ydCBmdW5jdGlvbiBxdWV1ZUxpbmVzQWN0aW9uUGFuZWxTaG93KCkge1xuICAgICAgICBpZiAodGhpcy5saW5lc0FjdGlvblBhbmVsUmVmcmVzaFRpbWVyKSB7XG4gICAgICAgICAgICBjbGVhclRpbWVvdXQgKHRoaXMubGluZXNBY3Rpb25QYW5lbFJlZnJlc2hUaW1lcik7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5saW5lc0FjdGlvblBhbmVsUmVmcmVzaFRpbWVyID0gc2V0VGltZW91dChsaW5lc0FjdGlvblBhbmVsU2hvdy5iaW5kKHRoaXMpLCAxNTApO1xuICAgIH1cblxuXG4gICAgZnVuY3Rpb24gbGluZXNBY3Rpb25QYW5lbFNob3coKSB7XG4gICAgICAgIC8vIEZpZ3VyZSBvdXQgaG93IG1hbnkgbGluZXMgYXJlIHNlbGVjdGVkLlxuICAgICAgICB2YXIgY2hlY2tlZEJveGVzID0gW10sIGNoZWNrZWRCb3hMZW46IG51bWJlcjtcbiAgICAgICAgaWYgKHRoaXMubGluZXNEYXRhR3JpZCkge1xuICAgICAgICAgICAgY2hlY2tlZEJveGVzID0gdGhpcy5saW5lc0RhdGFHcmlkLmdldFNlbGVjdGVkQ2hlY2tib3hFbGVtZW50cygpO1xuICAgICAgICB9XG4gICAgICAgIGlmIChfLmtleXMoRURERGF0YS5MaW5lcykubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICAkKCcubGluZUV4cGxhbmF0aW9uJykuY3NzKCdkaXNwbGF5JywgJ2Jsb2NrJyk7XG4gICAgICAgICAgICAkKCcuYWN0aW9uc0JhcicpLmFkZENsYXNzKCdvZmYnKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNoZWNrZWRCb3hMZW4gPSBjaGVja2VkQm94ZXMubGVuZ3RoO1xuICAgICAgICAgICAgJCgnLmxpbmVzU2VsZWN0ZWRDZWxsJykuZW1wdHkoKS50ZXh0KGNoZWNrZWRCb3hMZW4gKyAnIHNlbGVjdGVkJyk7XG4gICAgICAgICAgICAvLyBlbmFibGUgc2luZ3VsYXIvcGx1cmFsIGNoYW5nZXNcbiAgICAgICAgICAgICQoJy5lZGl0QnV0dG9uJykuZGF0YSh7XG4gICAgICAgICAgICAgICAgJ2NvdW50JzogY2hlY2tlZEJveExlbixcbiAgICAgICAgICAgICAgICAnaWRzJzogY2hlY2tlZEJveGVzLm1hcCgoYm94OkhUTUxJbnB1dEVsZW1lbnQpID0+IGJveC52YWx1ZSlcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgaWYgKGNoZWNrZWRCb3hMZW4pIHtcbiAgICAgICAgICAgICAgICAkKCcuZGlzYWJsYWJsZUJ1dHRvbnMgPiBidXR0b24nKS5wcm9wKCdkaXNhYmxlZCcsIGZhbHNlKTtcbiAgICAgICAgICAgICAgICBpZiAoY2hlY2tlZEJveExlbiA8IDIpIHtcbiAgICAgICAgICAgICAgICAgICAgJCgnLmdyb3VwQnV0dG9uJykucHJvcCgnZGlzYWJsZWQnLCB0cnVlKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICQoJy5kaXNhYmxhYmxlQnV0dG9ucyA+IGJ1dHRvbicpLnByb3AoJ2Rpc2FibGVkJywgdHJ1ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cblxuICAgIC8vIFN0YXJ0IGEgdGltZXIgdG8gd2FpdCBiZWZvcmUgY2FsbGluZyB0aGUgcm91dGluZSB0aGF0IG1vdmVzIHRoZSBhY3Rpb25zIGJhci5cbiAgICAvLyBSZXF1aXJlZCBzbyB3ZSBkb24ndCBjcmF0ZXIgdGhlIENQVSB3aXRoIHVuc2VydmVkIHJlc2l6ZSBldmVudHMuXG4gICAgZXhwb3J0IGZ1bmN0aW9uIHF1ZXVlUG9zaXRpb25BY3Rpb25zQmFyKCkge1xuICAgICAgICBpZiAocG9zaXRpb25BY3Rpb25zQmFyVGltZXIpIHtcbiAgICAgICAgICAgIGNsZWFyVGltZW91dCAocG9zaXRpb25BY3Rpb25zQmFyVGltZXIpO1xuICAgICAgICB9XG4gICAgICAgIHBvc2l0aW9uQWN0aW9uc0JhclRpbWVyID0gc2V0VGltZW91dChTdHVkeUxpbmVzLnBvc2l0aW9uQWN0aW9uc0Jhci5iaW5kKHRoaXMpLCA1MCk7XG4gICAgfVxuXG5cbiAgICBleHBvcnQgZnVuY3Rpb24gcG9zaXRpb25BY3Rpb25zQmFyKCkge1xuICAgICAgICAvLyBvbGQgY29kZSB3YXMgdHJ5aW5nIHRvIGNhbGN1bGF0ZSB3aGVuIHRvIG1vdmUgdGhlIGJ1dHRvbnMgdG8gdGhlICNib3R0b21CYXIgZWxlbWVudCxcbiAgICAgICAgLy8gICAgYnV0IHRoZSBjYWxjdWxhdGlvbnMgd2VyZSBzdHJ1Y3R1cmVkIGluIGEgd2F5IHRvIGFsd2F5cyByZXR1cm4gdGhlIHNhbWUgcmVzdWx0LlxuICAgICAgICB2YXIgb3JpZ2luYWw6IEpRdWVyeSwgY29weTogSlF1ZXJ5LCB2aWV3SGVpZ2h0OiBudW1iZXIsIGl0ZW1zSGVpZ2h0OiBudW1iZXI7XG4gICAgICAgIC8vIGZpcnN0IHRpbWUsIGNvcHkgdGhlIGJ1dHRvbnNcbiAgICAgICAgaWYgKCFhY3Rpb25QYW5lbElzQ29waWVkKSB7XG4gICAgICAgICAgICBvcmlnaW5hbCA9ICQoJyNhY3Rpb25zQmFyJyk7XG4gICAgICAgICAgICBjb3B5ID0gb3JpZ2luYWwuY2xvbmUoKS5hcHBlbmRUbygnI2JvdHRvbUJhcicpLmhpZGUoKTtcbiAgICAgICAgICAgIC8vIGZvcndhcmQgY2xpY2sgZXZlbnRzIG9uIGNvcHkgdG8gdGhlIG9yaWdpbmFsIGJ1dHRvblxuICAgICAgICAgICAgY29weS5vbignY2xpY2snLCAnYnV0dG9uJywgKGUpID0+IHtcbiAgICAgICAgICAgICAgICBvcmlnaW5hbC5maW5kKCcjJyArIGUudGFyZ2V0LmlkKS50cmlnZ2VyKGUpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICBhY3Rpb25QYW5lbElzQ29waWVkID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgICAvLyBjYWxjdWxhdGUgaG93IGJpZyBldmVyeXRoaW5nIGlzXG4gICAgICAgIHZpZXdIZWlnaHQgPSAkKCcjY29udGVudCcpLmhlaWdodCgpO1xuICAgICAgICBpdGVtc0hlaWdodCA9IDA7XG4gICAgICAgICQoJyNjb250ZW50JykuY2hpbGRyZW4oKS5lYWNoKChpLCBlKSA9PiB7IGl0ZW1zSGVpZ2h0ICs9IGUuc2Nyb2xsSGVpZ2h0OyB9KTtcbiAgICAgICAgLy8gc3dpdGNoIHdoaWNoIHNldCBvZiBidXR0b25zIGlzIHZpc2libGUgYmFzZWQgb24gc2l6ZVxuICAgICAgICBpZiAoYWN0aW9uUGFuZWxJc0luQm90dG9tQmFyICYmIGl0ZW1zSGVpZ2h0IDwgdmlld0hlaWdodCkge1xuICAgICAgICAgICAgJCgnLmFjdGlvbnNCYXInKS50b2dnbGUoKTtcbiAgICAgICAgICAgIGFjdGlvblBhbmVsSXNJbkJvdHRvbUJhciA9IGZhbHNlO1xuICAgICAgICB9IGVsc2UgaWYgKCFhY3Rpb25QYW5lbElzSW5Cb3R0b21CYXIgJiYgdmlld0hlaWdodCA8IGl0ZW1zSGVpZ2h0KSB7XG4gICAgICAgICAgICAkKCcuYWN0aW9uc0JhcicpLnRvZ2dsZSgpO1xuICAgICAgICAgICAgYWN0aW9uUGFuZWxJc0luQm90dG9tQmFyID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIGNsZWFyTGluZUZvcm0oKSB7XG4gICAgICAgIHZhciBmb3JtID0gJCgnI2VkaXRMaW5lTW9kYWwnKTtcbiAgICAgICAgZm9ybS5maW5kKCcubGluZS1tZXRhJykucmVtb3ZlKCk7XG4gICAgICAgIGZvcm0uZmluZCgnW25hbWVePWxpbmUtXScpLm5vdCgnOmNoZWNrYm94LCA6cmFkaW8nKS52YWwoJycpO1xuICAgICAgICBmb3JtLmZpbmQoJ1tuYW1lXj1saW5lLV0nKS5maWx0ZXIoJzpjaGVja2JveCwgOnJhZGlvJykucHJvcCgnY2hlY2tlZCcsIGZhbHNlKTtcbiAgICAgICAgZm9ybS5maW5kKCcuZXJyb3JsaXN0JykucmVtb3ZlKCk7XG4gICAgICAgIGZvcm0uZmluZCgnLmNhbmNlbC1saW5rJykucmVtb3ZlKCk7XG4gICAgICAgIGZvcm0uZmluZCgnLmJ1bGsnKS5hZGRDbGFzcygnb2ZmJyk7XG4gICAgICAgIGZvcm0ub2ZmKCdjaGFuZ2UuYnVsaycpO1xuICAgICAgICByZXR1cm4gZm9ybTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBmaWxsTGluZUZvcm0ocmVjb3JkKSB7XG4gICAgICAgIHZhciBtZXRhUm93LCBleHBlcmltZW50ZXIsIGNvbnRhY3Q7XG4gICAgICAgIHZhciBmb3JtID0gJCgnI2VkaXRMaW5lTW9kYWwnKTtcbiAgICAgICAgZXhwZXJpbWVudGVyID0gRURERGF0YS5Vc2Vyc1tyZWNvcmQuZXhwZXJpbWVudGVyXTtcbiAgICAgICAgY29udGFjdCA9IEVERERhdGEuVXNlcnNbcmVjb3JkLmNvbnRhY3QudXNlcl9pZF07XG4gICAgICAgIGZvcm0uZmluZCgnW25hbWU9bGluZS1uYW1lXScpLnZhbChyZWNvcmQubmFtZSk7XG4gICAgICAgIGZvcm0uZmluZCgnW25hbWU9bGluZS1kZXNjcmlwdGlvbl0nKS52YWwocmVjb3JkLmRlc2NyaXB0aW9uKTtcbiAgICAgICAgZm9ybS5maW5kKCdbbmFtZT1saW5lLWNvbnRyb2xdJykucHJvcCgnY2hlY2tlZCcsIHJlY29yZC5jb250cm9sKTtcbiAgICAgICAgZm9ybS5maW5kKCdbbmFtZT1saW5lLWNvbnRhY3RfMF0nKS52YWwocmVjb3JkLmNvbnRhY3QudGV4dCB8fCAoY29udGFjdCAmJiBjb250YWN0LnVpZCA/IGNvbnRhY3QudWlkIDogJy0tJykpO1xuICAgICAgICBmb3JtLmZpbmQoJ1tuYW1lPWxpbmUtY29udGFjdF8xXScpLnZhbChyZWNvcmQuY29udGFjdC51c2VyX2lkKTtcbiAgICAgICAgZm9ybS5maW5kKCdbbmFtZT1saW5lLWV4cGVyaW1lbnRlcl8wXScpLnZhbChleHBlcmltZW50ZXIgJiYgZXhwZXJpbWVudGVyLnVpZCA/IGV4cGVyaW1lbnRlci51aWQgOiAnLS0nKTtcbiAgICAgICAgZm9ybS5maW5kKCdbbmFtZT1saW5lLWV4cGVyaW1lbnRlcl8xXScpLnZhbChyZWNvcmQuZXhwZXJpbWVudGVyKTtcbiAgICAgICAgZm9ybS5maW5kKCdbbmFtZT1saW5lLWNhcmJvbl9zb3VyY2VfMF0nKS52YWwoXG4gICAgICAgICAgICAgICAgcmVjb3JkLmNhcmJvbi5tYXAoKHYpID0+IChFREREYXRhLkNTb3VyY2VzW3ZdIHx8IDxDYXJib25Tb3VyY2VSZWNvcmQ+e30pLm5hbWUgfHwgJy0tJykuam9pbignLCcpKTtcbiAgICAgICAgZm9ybS5maW5kKCdbbmFtZT1saW5lLWNhcmJvbl9zb3VyY2VfMV0nKS52YWwocmVjb3JkLmNhcmJvbi5qb2luKCcsJykpO1xuICAgICAgICBmb3JtLmZpbmQoJ1tuYW1lPWxpbmUtc3RyYWluc18wXScpLnZhbChcbiAgICAgICAgICAgICAgICByZWNvcmQuc3RyYWluLm1hcCgodikgPT4gKEVERERhdGEuU3RyYWluc1t2XSB8fCA8U3RyYWluUmVjb3JkPnt9KS5uYW1lIHx8ICctLScpLmpvaW4oJywnKSk7XG4gICAgICAgIGZvcm0uZmluZCgnW25hbWU9bGluZS1zdHJhaW5zXzFdJykudmFsKFxuICAgICAgICAgICAgICAgIHJlY29yZC5zdHJhaW4ubWFwKCh2KSA9PiAoRURERGF0YS5TdHJhaW5zW3ZdIHx8IDxTdHJhaW5SZWNvcmQ+e30pLnJlZ2lzdHJ5X2lkIHx8ICcnKS5qb2luKCcsJykpO1xuICAgICAgICBpZiAocmVjb3JkLnN0cmFpbi5sZW5ndGggJiYgZm9ybS5maW5kKCdbbmFtZT1saW5lLXN0cmFpbnNfMV0nKS52YWwoKSA9PT0gJycpIHtcbiAgICAgICAgICAgICQoJzxsaT4nKS50ZXh0KCdTdHJhaW4gZG9lcyBub3QgaGF2ZSBhIGxpbmtlZCBJQ0UgZW50cnkhICcgK1xuICAgICAgICAgICAgICAgICAgICAnU2F2aW5nIHRoZSBsaW5lIHdpdGhvdXQgbGlua2luZyB0byBJQ0Ugd2lsbCByZW1vdmUgdGhlIHN0cmFpbi4nKVxuICAgICAgICAgICAgICAgIC53cmFwKCc8dWw+JykucGFyZW50KCkuYWRkQ2xhc3MoJ2Vycm9ybGlzdCcpXG4gICAgICAgICAgICAgICAgLmFwcGVuZFRvKGZvcm0uZmluZCgnW25hbWU9bGluZS1zdHJhaW5zXzBdJykucGFyZW50KCkpO1xuICAgICAgICB9XG4gICAgICAgIG1ldGFSb3cgPSBmb3JtLmZpbmQoJy5saW5lLWVkaXQtbWV0YScpO1xuICAgICAgICAvLyBSdW4gdGhyb3VnaCB0aGUgY29sbGVjdGlvbiBvZiBtZXRhZGF0YSwgYW5kIGFkZCBhIGZvcm0gZWxlbWVudCBlbnRyeSBmb3IgZWFjaFxuICAgICAgICAkLmVhY2gocmVjb3JkLm1ldGEsIChrZXksIHZhbHVlKSA9PiB7XG4gICAgICAgICAgICBpbnNlcnRMaW5lTWV0YWRhdGFSb3cobWV0YVJvdywga2V5LCB2YWx1ZSk7XG4gICAgICAgIH0pO1xuICAgICAgICAvLyBzdG9yZSBvcmlnaW5hbCBtZXRhZGF0YSBpbiBpbml0aWFsLSBmaWVsZFxuICAgICAgICBmb3JtLmZpbmQoJ1tuYW1lPWxpbmUtbWV0YV9zdG9yZV0nKS52YWwoSlNPTi5zdHJpbmdpZnkocmVjb3JkLm1ldGEpKTtcbiAgICAgICAgZm9ybS5maW5kKCdbbmFtZT1pbml0aWFsLWxpbmUtbWV0YV9zdG9yZV0nKS52YWwoSlNPTi5zdHJpbmdpZnkocmVjb3JkLm1ldGEpKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBpbnNlcnRMaW5lTWV0YWRhdGFSb3cocmVmUm93LCBrZXksIHZhbHVlKSB7XG4gICAgICAgIHZhciByb3csIHR5cGUsIGxhYmVsLCBpbnB1dCwgcG9zdGZpeFZhbCwgcHJlZml4VmFsLCBpZCA9ICdsaW5lLW1ldGEtJyArIGtleSwgY2hlY2tib3g7XG4gICAgICAgIHJvdyA9ICQoJzxwPicpLmF0dHIoJ2lkJywgJ3Jvd18nICsgaWQpLmFkZENsYXNzKCdsaW5lLW1ldGEnKS5pbnNlcnRCZWZvcmUocmVmUm93KTtcbiAgICAgICAgdHlwZSA9IEVERERhdGEuTWV0YURhdGFUeXBlc1trZXldO1xuICAgICAgICBsYWJlbCA9ICQoJzxsYWJlbD4nKS5hdHRyKCdmb3InLCAnaWRfJyArIGlkKS50ZXh0KHR5cGUubmFtZSkuYXBwZW5kVG8ocm93KTtcbiAgICAgICAgLy8gYnVsayBjaGVja2JveFxuICAgICAgICBjaGVja2JveCA9ICQoJzxpbnB1dCB0eXBlPVwiY2hlY2tib3hcIj4nKS5hZGRDbGFzcygnYnVsaycpLmF0dHIoJ25hbWUnLCBpZCk7XG4gICAgICAgICQoY2hlY2tib3gpLnByZXBlbmRUbyhsYWJlbCk7XG4gICAgICAgIGlucHV0ID0gJCgnPGlucHV0IHR5cGU9XCJ0ZXh0XCI+JykuYXR0cignaWQnLCAnaWRfJyArIGlkKS5hZGRDbGFzcygnZm9ybS1jb250cm9sJykudmFsKHZhbHVlKS5hcHBlbmRUbyhyb3cpO1xuICAgICAgICBwb3N0Zml4VmFsID0gJChyZWZSb3cpLmZpbmQoJy5tZXRhLXBvc3RmaXgnKTsgLy9yZXR1cm5zIGFycmF5IG9mIHBvc3RmaXggZWxlbXMgcHJlc2VudFxuICAgICAgICBwcmVmaXhWYWwgPSAkKHJlZlJvdykuZmluZCgnLm1ldGEtcHJlZml4Jyk7IC8vcmV0dXJucyBhcnJheSBvZiBwcmVmaXggZWxlbXMgcHJlc2VudFxuICAgICAgICAvL2lmIHRoZXJlIGlzIGEgbWV0YSBwb3N0Zml4IHZhbCwgaGlkZSBpdC5cblxuICAgICAgICAocG9zdGZpeFZhbCkucmVtb3ZlKCk7XG5cbiAgICAgICAgLy9pZiB0aGVyZSBpcyBhIG1ldGEgcHJlZml4IHZhbCwgaGlkZSBpdC5cbiAgICAgICAgKHByZWZpeFZhbCkucmVtb3ZlKCk7XG5cbiAgICAgICAgaWYgKHR5cGUucHJlKSB7XG4gICAgICAgICAgICAkKCc8c3Bhbj4nKS5hZGRDbGFzcygnbWV0YS1wcmVmaXgnKS50ZXh0KFwiKFwiICsgdHlwZS5wcmUgKyBcIikgXCIpLmluc2VydEJlZm9yZShsYWJlbCk7XG4gICAgICAgIH1cbiAgICAgICAgJCgnPHNwYW4+JykuYWRkQ2xhc3MoJ21ldGEtcmVtb3ZlJykudGV4dCgnUmVtb3ZlJykuaW5zZXJ0QWZ0ZXIobGFiZWwpO1xuICAgICAgICBpZiAodHlwZS5wb3N0Zml4KSB7XG4gICAgICAgICAgICAkKCc8c3Bhbj4nKS5hZGRDbGFzcygnbWV0YS1wb3N0Zml4JykudGV4dChcIiAoXCIgKyB0eXBlLnBvc3RmaXggKyBcIilcIikuaW5zZXJ0QWZ0ZXIobGFiZWwpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiByb3c7XG59XG5cblxuICAgIGV4cG9ydCBmdW5jdGlvbiBlZGl0TGluZXMoaWRzOm51bWJlcltdKTp2b2lkIHtcbiAgICAgICAgdmFyIGZvcm0gPSAkKCcjZWRpdExpbmVNb2RhbCcpLCBhbGxNZXRhID0ge30sIG1ldGFSb3c7XG4gICAgICAgIGNsZWFyTGluZUZvcm0oKTtcblxuICAgICAgICAvLyBVcGRhdGUgdGhlIGRpc2Nsb3NlIHRpdGxlXG4gICAgICAgIHZhciB0ZXh0ID0gJ0FkZCBOZXcgTGluZSc7XG4gICAgICAgIGlmIChpZHMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgdGV4dCA9ICdFZGl0IExpbmUnICsgKGlkcy5sZW5ndGggPiAxID8gJ3MgJyArIFwiKFwiICsgaWRzLmxlbmd0aCArIFwiKVwiIDogJycpO1xuICAgICAgICB9XG5cbiAgICAgICAgJChcIiNlZGl0TGluZU1vZGFsXCIpLmRpYWxvZyh7IG1pbldpZHRoOiA1MDAsIGF1dG9PcGVuOiBmYWxzZSwgdGl0bGU6IHRleHQgfSk7XG5cbiAgICAgICAgaWYgKGlkcy5sZW5ndGggPiAxKSB7XG4gICAgICAgICAgICAvL2hpZGUgbGluZSBuYW1lIGJlY2F1c2UgdGhpcyBkb2Vzbid0IG1hdHRlclxuICAgICAgICAgICAgJCgnI2lkX2xpbmUtbmFtZScpLnBhcmVudCgpLmhpZGUoKTtcbiAgICAgICAgICAgIC8vc2hvdyBidWxrIG5vdGljZVxuICAgICAgICAgICAgJCgnLmJ1bGtOb3RlR3JvdXAnKS5yZW1vdmVDbGFzcygnb2ZmJyk7XG4gICAgICAgICAgICAkKCcuYnVsaycpLnJlbW92ZUNsYXNzKCdvZmYnKVxuICAgICAgICAgICAgZm9ybS5vbignY2hhbmdlLmJ1bGsnLCAnOmlucHV0JywgKGV2OkpRdWVyeUV2ZW50T2JqZWN0KSA9PiB7XG4gICAgICAgICAgICAgICAgJChldi50YXJnZXQpLnNpYmxpbmdzKCdsYWJlbCcpLmZpbmQoJy5idWxrJykucHJvcCgnY2hlY2tlZCcsIHRydWUpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgJCgnLmJ1bGtOb3RlR3JvdXAnKS5hZGRDbGFzcygnb2ZmJyk7XG4gICAgICAgICAgICAgJCgnI2lkX2xpbmUtbmFtZScpLnBhcmVudCgpLnNob3coKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChpZHMubGVuZ3RoID09PSAxKSB7XG4gICAgICAgICAgICAkKCcuYnVsa05vdGVHcm91cCcpLmFkZENsYXNzKCdvZmYnKTtcbiAgICAgICAgICAgIGZpbGxMaW5lRm9ybShFREREYXRhLkxpbmVzW2lkc1swXV0pO1xuICAgICAgICAgICAgJCgnI2lkX2xpbmUtbmFtZScpLnBhcmVudCgpLnNob3coKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIC8vIGNvbXB1dGUgdXNlZCBtZXRhZGF0YSBmaWVsZHMgb24gYWxsIGRhdGEuaWRzLCBpbnNlcnQgbWV0YWRhdGEgcm93cz9cbiAgICAgICAgICAgIGlkcy5tYXAoKGlkOm51bWJlcikgPT4gRURERGF0YS5MaW5lc1tpZF0gfHwge30pLmZvckVhY2goKGxpbmU6TGluZVJlY29yZCkgPT4ge1xuICAgICAgICAgICAgICAgICQuZXh0ZW5kKGFsbE1ldGEsIGxpbmUubWV0YSB8fCB7fSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIG1ldGFSb3cgPSBmb3JtLmZpbmQoJy5saW5lLWVkaXQtbWV0YScpO1xuICAgICAgICAgICAgLy8gUnVuIHRocm91Z2ggdGhlIGNvbGxlY3Rpb24gb2YgbWV0YWRhdGEsIGFuZCBhZGQgYSBmb3JtIGVsZW1lbnQgZW50cnkgZm9yIGVhY2hcbiAgICAgICAgICAgICQuZWFjaChhbGxNZXRhLCAoa2V5KSA9PiBpbnNlcnRMaW5lTWV0YWRhdGFSb3cobWV0YVJvdywga2V5LCAnJykpO1xuICAgICAgICB9XG4gICAgICAgIGZvcm0uZmluZCgnW25hbWU9bGluZS1pZHNdJykudmFsKGlkcy5qb2luKCcsJykpO1xuICAgICAgICBmb3JtLnJlbW92ZUNsYXNzKCdvZmYnKS5kaWFsb2coIFwib3BlblwiICk7XG4gICAgfVxuXG5cbiAgICBleHBvcnQgZnVuY3Rpb24gb25DaGFuZ2VkTWV0YWJvbGljTWFwKCkge1xuICAgICAgICBpZiAodGhpcy5tZXRhYm9saWNNYXBOYW1lKSB7XG4gICAgICAgICAgICAvLyBVcGRhdGUgdGhlIFVJIHRvIHNob3cgdGhlIG5ldyBmaWxlbmFtZSBmb3IgdGhlIG1ldGFib2xpYyBtYXAuXG4gICAgICAgICAgICAkKFwiI21ldGFib2xpY01hcE5hbWVcIikuaHRtbCh0aGlzLm1ldGFib2xpY01hcE5hbWUpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgJChcIiNtZXRhYm9saWNNYXBOYW1lXCIpLmh0bWwoJyhub25lKScpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHRoaXMuYmlvbWFzc0NhbGN1bGF0aW9uICYmIHRoaXMuYmlvbWFzc0NhbGN1bGF0aW9uICE9IC0xKSB7XG4gICAgICAgICAgICAvLyBDYWxjdWxhdGUgY2FyYm9uIGJhbGFuY2VzIG5vdyB0aGF0IHdlIGNhbi5cbiAgICAgICAgICAgIHRoaXMuY2FyYm9uQmFsYW5jZURhdGEuY2FsY3VsYXRlQ2FyYm9uQmFsYW5jZXModGhpcy5tZXRhYm9saWNNYXBJRCxcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5iaW9tYXNzQ2FsY3VsYXRpb24pO1xuXG4gICAgICAgICAgICAvLyBSZWJ1aWxkIHRoZSBDQiBncmFwaHMuXG4gICAgICAgICAgICB0aGlzLmNhcmJvbkJhbGFuY2VEaXNwbGF5SXNGcmVzaCA9IGZhbHNlO1xuICAgICAgICAgICAgdGhpcy5yZWJ1aWxkQ2FyYm9uQmFsYW5jZUdyYXBocygpO1xuICAgICAgICB9XG4gICAgfVxuXG5cbiAgICBleHBvcnQgZnVuY3Rpb24gcmVidWlsZENhcmJvbkJhbGFuY2VHcmFwaHMoKSB7XG4gICAgICAgIHZhciBjZWxsT2JqczpEYXRhR3JpZERhdGFDZWxsW10sXG4gICAgICAgICAgICBncm91cDpEYXRhR3JpZENvbHVtbkdyb3VwU3BlYyA9IHRoaXMubGluZXNEYXRhR3JpZFNwZWMuY2FyYm9uQmFsYW5jZUNvbDtcbiAgICAgICAgaWYgKHRoaXMuY2FyYm9uQmFsYW5jZURpc3BsYXlJc0ZyZXNoKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgLy8gRHJvcCBhbnkgcHJldmlvdXNseSBjcmVhdGVkIENhcmJvbiBCYWxhbmNlIFNWRyBlbGVtZW50cyBmcm9tIHRoZSBET00uXG4gICAgICAgIHRoaXMuY2FyYm9uQmFsYW5jZURhdGEucmVtb3ZlQWxsQ0JHcmFwaHMoKTtcbiAgICAgICAgY2VsbE9ianMgPSBbXTtcbiAgICAgICAgLy8gZ2V0IGFsbCBjZWxscyBmcm9tIGFsbCBjb2x1bW5zIGluIHRoZSBjb2x1bW4gZ3JvdXBcbiAgICAgICAgZ3JvdXAubWVtYmVyQ29sdW1ucy5mb3JFYWNoKChjb2w6RGF0YUdyaWRDb2x1bW5TcGVjKTp2b2lkID0+IHtcbiAgICAgICAgICAgIEFycmF5LnByb3RvdHlwZS5wdXNoLmFwcGx5KGNlbGxPYmpzLCBjb2wuZ2V0RW50aXJlSW5kZXgoKSk7XG4gICAgICAgIH0pO1xuICAgICAgICAvLyBjcmVhdGUgY2FyYm9uIGJhbGFuY2UgZ3JhcGggZm9yIGVhY2ggY2VsbFxuICAgICAgICBjZWxsT2Jqcy5mb3JFYWNoKChjZWxsOkRhdGFHcmlkRGF0YUNlbGwpID0+IHtcbiAgICAgICAgICAgIHRoaXMuY2FyYm9uQmFsYW5jZURhdGEuY3JlYXRlQ0JHcmFwaEZvckxpbmUoY2VsbC5yZWNvcmRJRCwgY2VsbC5jZWxsRWxlbWVudCk7XG4gICAgICAgIH0pO1xuICAgICAgICB0aGlzLmNhcmJvbkJhbGFuY2VEaXBsYXlJc0ZyZXNoID0gdHJ1ZTtcbiAgICB9XG5cblxuICAgIC8vIFRoZXkgd2FudCB0byBzZWxlY3QgYSBkaWZmZXJlbnQgbWV0YWJvbGljIG1hcC5cbiAgICBleHBvcnQgZnVuY3Rpb24gb25DbGlja2VkTWV0YWJvbGljTWFwTmFtZSgpOnZvaWQge1xuICAgICAgICB2YXIgdWk6U3R1ZHlNZXRhYm9saWNNYXBDaG9vc2VyLFxuICAgICAgICAgICAgY2FsbGJhY2s6TWV0YWJvbGljTWFwQ2hvb3NlclJlc3VsdCA9IChlcnJvcjpzdHJpbmcsXG4gICAgICAgICAgICAgICAgbWV0YWJvbGljTWFwSUQ/Om51bWJlcixcbiAgICAgICAgICAgICAgICBtZXRhYm9saWNNYXBOYW1lPzpzdHJpbmcsXG4gICAgICAgICAgICAgICAgZmluYWxCaW9tYXNzPzpudW1iZXIpOnZvaWQgPT4ge1xuICAgICAgICAgICAgaWYgKCFlcnJvcikge1xuICAgICAgICAgICAgICAgIHRoaXMubWV0YWJvbGljTWFwSUQgPSBtZXRhYm9saWNNYXBJRDtcbiAgICAgICAgICAgICAgICB0aGlzLm1ldGFib2xpY01hcE5hbWUgPSBtZXRhYm9saWNNYXBOYW1lO1xuICAgICAgICAgICAgICAgIHRoaXMuYmlvbWFzc0NhbGN1bGF0aW9uID0gZmluYWxCaW9tYXNzO1xuICAgICAgICAgICAgICAgIHRoaXMub25DaGFuZ2VkTWV0YWJvbGljTWFwKCk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKFwib25DbGlja2VkTWV0YWJvbGljTWFwTmFtZSBlcnJvcjogXCIgKyBlcnJvcik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgICAgIHVpID0gbmV3IFN0dWR5TWV0YWJvbGljTWFwQ2hvb3NlcihmYWxzZSwgY2FsbGJhY2spO1xuICAgIH1cbn07XG5cbmNsYXNzIExpbmVSZXN1bHRzIGV4dGVuZHMgRGF0YUdyaWQge1xuXG4gICAgY29uc3RydWN0b3IoZGF0YUdyaWRTcGVjOkRhdGFHcmlkU3BlY0Jhc2UpIHtcbiAgICAgICAgc3VwZXIoZGF0YUdyaWRTcGVjKTtcbiAgICB9XG5cbiAgICBfZ2V0Q2xhc3NlcygpOnN0cmluZyB7XG4gICAgICAgIHJldHVybiAnZGF0YVRhYmxlIHNvcnRhYmxlIGRyYWdib3hlcyBoYXN0YWJsZWNvbnRyb2xzIHRhYmxlLXN0cmlwZWQnO1xuICAgIH1cblxufVxuXG5jbGFzcyBER1NlbGVjdEFsbExpbmVzV2lkZ2V0IGV4dGVuZHMgREdTZWxlY3RBbGxXaWRnZXQge1xuXG4gICAgY2xpY2tIYW5kbGVyKCk6dm9pZCB7XG4gICAgICAgIHN1cGVyLmNsaWNrSGFuZGxlcigpO1xuICAgICAgICAvL3VwZGF0ZSBzZWxlY3RlZCB0ZXh0XG4gICAgICAgIHZhciBjaGVja2VkQm94TGVuID0gJCgnI3N0dWR5TGluZXNUYWJsZScpLmZpbmQoJ3Rib2R5IGlucHV0W3R5cGU9Y2hlY2tib3hdOmNoZWNrZWQnKS5sZW5ndGg7XG4gICAgICAgICQoJy5saW5lc1NlbGVjdGVkQ2VsbCcpLmVtcHR5KCkudGV4dChjaGVja2VkQm94TGVuICsgJyBzZWxlY3RlZCcpO1xuICAgICAgICBTdHVkeUxpbmVzLnF1ZXVlTGluZXNBY3Rpb25QYW5lbFNob3coKTtcbiAgICAgfVxufVxuXG4vLyBUaGUgc3BlYyBvYmplY3QgdGhhdCB3aWxsIGJlIHBhc3NlZCB0byBEYXRhR3JpZCB0byBjcmVhdGUgdGhlIExpbmVzIHRhYmxlXG5jbGFzcyBEYXRhR3JpZFNwZWNMaW5lcyBleHRlbmRzIERhdGFHcmlkU3BlY0Jhc2Uge1xuXG4gICAgbWV0YURhdGFJRHNVc2VkSW5MaW5lczphbnk7XG4gICAgZ3JvdXBJRHNJbk9yZGVyOmFueTtcbiAgICBncm91cElEc1RvR3JvdXBJbmRleGVzOmFueTtcbiAgICBncm91cElEc1RvR3JvdXBOYW1lczphbnk7XG4gICAgY2FyYm9uQmFsYW5jZUNvbDpEYXRhR3JpZENvbHVtbkdyb3VwU3BlYztcbiAgICBjYXJib25CYWxhbmNlV2lkZ2V0OkRHU2hvd0NhcmJvbkJhbGFuY2VXaWRnZXQ7XG5cbiAgICBpbml0KCkge1xuICAgICAgICB0aGlzLmZpbmRNZXRhRGF0YUlEc1VzZWRJbkxpbmVzKCk7XG4gICAgICAgIHRoaXMuZmluZEdyb3VwSURzQW5kTmFtZXMoKTtcbiAgICAgICAgc3VwZXIuaW5pdCgpO1xuICAgIH1cblxuICAgIGhpZ2hsaWdodENhcmJvbkJhbGFuY2VXaWRnZXQodjpib29sZWFuKTp2b2lkIHtcbiAgICAgICAgdGhpcy5jYXJib25CYWxhbmNlV2lkZ2V0LmhpZ2hsaWdodCh2KTtcbiAgICB9XG5cbiAgICBlbmFibGVDYXJib25CYWxhbmNlV2lkZ2V0KHY6Ym9vbGVhbik6dm9pZCB7XG4gICAgICAgIHRoaXMuY2FyYm9uQmFsYW5jZVdpZGdldC5lbmFibGUodik7XG4gICAgfVxuXG4gICAgZmluZE1ldGFEYXRhSURzVXNlZEluTGluZXMoKSB7XG4gICAgICAgIHZhciBzZWVuSGFzaDphbnkgPSB7fTtcbiAgICAgICAgLy8gbG9vcCBsaW5lc1xuICAgICAgICAkLmVhY2godGhpcy5nZXRSZWNvcmRJRHMoKSwgKGluZGV4LCBpZCkgPT4ge1xuICAgICAgICAgICAgdmFyIGxpbmUgPSBFREREYXRhLkxpbmVzW2lkXTtcbiAgICAgICAgICAgIGlmIChsaW5lKSB7XG4gICAgICAgICAgICAgICAgJC5lYWNoKGxpbmUubWV0YSB8fCB7fSwgKGtleSkgPT4gc2Vlbkhhc2hba2V5XSA9IHRydWUpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgLy8gc3RvcmUgYWxsIG1ldGFkYXRhIElEcyBzZWVuXG4gICAgICAgIHRoaXMubWV0YURhdGFJRHNVc2VkSW5MaW5lcyA9IE9iamVjdC5rZXlzKHNlZW5IYXNoKTtcbiAgICB9XG5cbiAgICBmaW5kR3JvdXBJRHNBbmROYW1lcygpIHtcbiAgICAgICAgdmFyIHJvd0dyb3VwcyA9IHt9O1xuICAgICAgICAvLyBHYXRoZXIgYWxsIHRoZSByb3cgSURzIHVuZGVyIHRoZSBncm91cCBJRCBlYWNoIGJlbG9uZ3MgdG8uXG4gICAgICAgICQuZWFjaCh0aGlzLmdldFJlY29yZElEcygpLCAoaW5kZXgsIGlkKSA9PiB7XG4gICAgICAgICAgICB2YXIgbGluZSA9IEVERERhdGEuTGluZXNbaWRdLCByZXAgPSBsaW5lLnJlcGxpY2F0ZTtcbiAgICAgICAgICAgIGlmIChyZXApIHtcbiAgICAgICAgICAgICAgICAvLyB1c2UgcGFyZW50IHJlcGxpY2F0ZSBhcyBhIHJlcGxpY2F0ZSBncm91cCBJRCwgcHVzaCBhbGwgbWF0Y2hpbmcgbGluZSBJRHNcbiAgICAgICAgICAgICAgICAocm93R3JvdXBzW3JlcF0gPSByb3dHcm91cHNbcmVwXSB8fCBbIHJlcCBdKS5wdXNoKGlkKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIHRoaXMuZ3JvdXBJRHNUb0dyb3VwTmFtZXMgPSB7fTtcbiAgICAgICAgLy8gRm9yIGVhY2ggZ3JvdXAgSUQsIGp1c3QgdXNlIHBhcmVudCByZXBsaWNhdGUgbmFtZVxuICAgICAgICAkLmVhY2gocm93R3JvdXBzLCAoZ3JvdXAsIGxpbmVzKSA9PiB7XG4gICAgICAgICAgICBpZiAoRURERGF0YS5MaW5lc1tncm91cF0gPT09IHVuZGVmaW5lZCB8fCBFREREYXRhLkxpbmVzW2dyb3VwXS5uYW1lID09PSB1bmRlZmluZWQgKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5ncm91cElEc1RvR3JvdXBOYW1lc1tncm91cF0gPSBudWxsO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0aGlzLmdyb3VwSURzVG9Hcm91cE5hbWVzW2dyb3VwXSA9IEVERERhdGEuTGluZXNbZ3JvdXBdLm5hbWU7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICAvLyBhbHBoYW51bWVyaWMgc29ydCBvZiBncm91cCBJRHMgYnkgbmFtZSBhdHRhY2hlZCB0byB0aG9zZSByZXBsaWNhdGUgZ3JvdXBzXG4gICAgICAgIHRoaXMuZ3JvdXBJRHNJbk9yZGVyID0gT2JqZWN0LmtleXMocm93R3JvdXBzKS5zb3J0KChhLGIpID0+IHtcbiAgICAgICAgICAgIHZhciB1OnN0cmluZyA9IHRoaXMuZ3JvdXBJRHNUb0dyb3VwTmFtZXNbYV0sIHY6c3RyaW5nID0gdGhpcy5ncm91cElEc1RvR3JvdXBOYW1lc1tiXTtcbiAgICAgICAgICAgIHJldHVybiB1IDwgdiA/IC0xIDogdSA+IHYgPyAxIDogMDtcbiAgICAgICAgfSk7XG4gICAgICAgIC8vIE5vdyB0aGF0IHRoZXkncmUgc29ydGVkIGJ5IG5hbWUsIGNyZWF0ZSBhIGhhc2ggZm9yIHF1aWNrbHkgcmVzb2x2aW5nIElEcyB0byBpbmRleGVzIGluXG4gICAgICAgIC8vIHRoZSBzb3J0ZWQgYXJyYXlcbiAgICAgICAgdGhpcy5ncm91cElEc1RvR3JvdXBJbmRleGVzID0ge307XG4gICAgICAgICQuZWFjaCh0aGlzLmdyb3VwSURzSW5PcmRlciwgKGluZGV4LCBncm91cCkgPT4gdGhpcy5ncm91cElEc1RvR3JvdXBJbmRleGVzW2dyb3VwXSA9IGluZGV4KTtcbiAgICB9XG5cbiAgICAvLyBTcGVjaWZpY2F0aW9uIGZvciB0aGUgdGFibGUgYXMgYSB3aG9sZVxuICAgIGRlZmluZVRhYmxlU3BlYygpOkRhdGFHcmlkVGFibGVTcGVjIHtcbiAgICAgICAgcmV0dXJuIG5ldyBEYXRhR3JpZFRhYmxlU3BlYygnbGluZXMnLCB7ICduYW1lJzogJ0xpbmVzJyB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGxvYWRMaW5lTmFtZShpbmRleDpzdHJpbmcpOnN0cmluZyB7XG4gICAgICAgIHZhciBsaW5lO1xuICAgICAgICBpZiAoKGxpbmUgPSBFREREYXRhLkxpbmVzW2luZGV4XSkpIHtcbiAgICAgICAgICAgIHJldHVybiBsaW5lLm5hbWUudG9VcHBlckNhc2UoKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gJyc7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBsb2FkTGluZURlc2NyaXB0aW9uKGluZGV4OnN0cmluZyk6c3RyaW5nIHtcbiAgICAgICAgdmFyIGxpbmU7XG4gICAgICAgIGlmICgobGluZSA9IEVERERhdGEuTGluZXNbaW5kZXhdKSkge1xuICAgICAgICAgICAgaWYgKGxpbmUuZGVzY3JpcHRpb24gIT0gbnVsbCkge1xuICAgICAgICAgICAgICAgIHJldHVybiBsaW5lLmRlc2NyaXB0aW9uLnRvVXBwZXJDYXNlKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuICcnO1xuICAgIH1cblxuICAgIHByaXZhdGUgbG9hZFN0cmFpbk5hbWUoaW5kZXg6c3RyaW5nKTpzdHJpbmcge1xuICAgICAgICAvLyBlbnN1cmUgYSBzdHJhaW4gSUQgZXhpc3RzIG9uIGxpbmUsIGlzIGEga25vd24gc3RyYWluLCB1cHBlcmNhc2UgZmlyc3QgZm91bmQgbmFtZSBvciAnPydcbiAgICAgICAgdmFyIGxpbmUsIHN0cmFpbjtcbiAgICAgICAgaWYgKChsaW5lID0gRURERGF0YS5MaW5lc1tpbmRleF0pKSB7XG4gICAgICAgICAgICBpZiAobGluZS5zdHJhaW4gJiYgbGluZS5zdHJhaW4ubGVuZ3RoICYmIChzdHJhaW4gPSBFREREYXRhLlN0cmFpbnNbbGluZS5zdHJhaW5bMF1dKSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBzdHJhaW4ubmFtZS50b1VwcGVyQ2FzZSgpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiAnPyc7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBsb2FkRmlyc3RDYXJib25Tb3VyY2UoaW5kZXg6c3RyaW5nKTphbnkge1xuICAgICAgICAvLyBlbnN1cmUgY2FyYm9uIHNvdXJjZSBJRChzKSBleGlzdCBvbiBsaW5lLCBlbnN1cmUgYXQgbGVhc3Qgb25lIHNvdXJjZSBJRCwgZW5zdXJlIGZpcnN0IElEXG4gICAgICAgIC8vIGlzIGtub3duIGNhcmJvbiBzb3VyY2VcbiAgICAgICAgdmFyIGxpbmUsIHNvdXJjZTtcbiAgICAgICAgaWYgKChsaW5lID0gRURERGF0YS5MaW5lc1tpbmRleF0pKSB7XG4gICAgICAgICAgICBpZiAobGluZS5jYXJib24gJiYgbGluZS5jYXJib24ubGVuZ3RoICYmIChzb3VyY2UgPSBFREREYXRhLkNTb3VyY2VzW2xpbmUuY2FyYm9uWzBdXSkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gc291cmNlO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBsb2FkQ2FyYm9uU291cmNlKGluZGV4OnN0cmluZyk6c3RyaW5nIHtcbiAgICAgICAgdmFyIHNvdXJjZSA9IHRoaXMubG9hZEZpcnN0Q2FyYm9uU291cmNlKGluZGV4KTtcbiAgICAgICAgaWYgKHNvdXJjZSkge1xuICAgICAgICAgICAgcmV0dXJuIHNvdXJjZS5uYW1lLnRvVXBwZXJDYXNlKCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuICc/JztcbiAgICB9XG5cbiAgICBwcml2YXRlIGxvYWRDYXJib25Tb3VyY2VMYWJlbGluZyhpbmRleDpzdHJpbmcpOnN0cmluZyB7XG4gICAgICAgIHZhciBzb3VyY2UgPSB0aGlzLmxvYWRGaXJzdENhcmJvblNvdXJjZShpbmRleCk7XG4gICAgICAgIGlmIChzb3VyY2UpIHtcbiAgICAgICAgICAgIHJldHVybiBzb3VyY2UubGFiZWxpbmcudG9VcHBlckNhc2UoKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gJz8nO1xuICAgIH1cblxuICAgIHByaXZhdGUgbG9hZEV4cGVyaW1lbnRlckluaXRpYWxzKGluZGV4OnN0cmluZyk6c3RyaW5nIHtcbiAgICAgICAgLy8gZW5zdXJlIGluZGV4IElEIGV4aXN0cywgZW5zdXJlIGV4cGVyaW1lbnRlciB1c2VyIElEIGV4aXN0cywgdXBwZXJjYXNlIGluaXRpYWxzIG9yID9cbiAgICAgICAgdmFyIGxpbmUsIGV4cGVyaW1lbnRlcjtcbiAgICAgICAgaWYgKChsaW5lID0gRURERGF0YS5MaW5lc1tpbmRleF0pKSB7XG4gICAgICAgICAgICBpZiAoKGV4cGVyaW1lbnRlciA9IEVERERhdGEuVXNlcnNbbGluZS5leHBlcmltZW50ZXJdKSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBleHBlcmltZW50ZXIuaW5pdGlhbHMudG9VcHBlckNhc2UoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gJz8nO1xuICAgIH1cblxuICAgIHByaXZhdGUgbG9hZExpbmVNb2RpZmljYXRpb24oaW5kZXg6c3RyaW5nKTpudW1iZXIge1xuICAgICAgICB2YXIgbGluZTtcbiAgICAgICAgaWYgKChsaW5lID0gRURERGF0YS5MaW5lc1tpbmRleF0pKSB7XG4gICAgICAgICAgICByZXR1cm4gbGluZS5tb2RpZmllZC50aW1lO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgfVxuXG4gICAgLy8gU3BlY2lmaWNhdGlvbiBmb3IgdGhlIGhlYWRlcnMgYWxvbmcgdGhlIHRvcCBvZiB0aGUgdGFibGVcbiAgICBkZWZpbmVIZWFkZXJTcGVjKCk6RGF0YUdyaWRIZWFkZXJTcGVjW10ge1xuICAgICAgICB2YXIgbGVmdFNpZGU6RGF0YUdyaWRIZWFkZXJTcGVjW10gPSBbXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRIZWFkZXJTcGVjKDEsICdoTGluZXNOYW1lJywge1xuICAgICAgICAgICAgICAgICduYW1lJzogJ05hbWUnLFxuICAgICAgICAgICAgICAgICdzb3J0QnknOiB0aGlzLmxvYWRMaW5lTmFtZSB9KSxcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZEhlYWRlclNwZWMoMiwgJ2hMaW5lc0Rlc2NyaXB0aW9uJywge1xuICAgICAgICAgICAgICAgICduYW1lJzogJ0Rlc2NyaXB0aW9uJyxcbiAgICAgICAgICAgICAgICAnc29ydEJ5JzogdGhpcy5sb2FkTGluZURlc2NyaXB0aW9uLFxuICAgICAgICAgICAgICAgICdzb3J0QWZ0ZXInOiAwIH0pLFxuICAgICAgICAgICAgbmV3IERhdGFHcmlkSGVhZGVyU3BlYygzLCAnaExpbmVzU3RyYWluJywge1xuICAgICAgICAgICAgICAgICduYW1lJzogJ1N0cmFpbicsXG4gICAgICAgICAgICAgICAgJ3NvcnRCeSc6IHRoaXMubG9hZFN0cmFpbk5hbWUsXG4gICAgICAgICAgICAgICAgJ3NvcnRBZnRlcic6IDAgfSksXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRIZWFkZXJTcGVjKDQsICdoTGluZXNDYXJib24nLCB7XG4gICAgICAgICAgICAgICAgJ25hbWUnOiAnQ2FyYm9uIFNvdXJjZShzKScsXG4gICAgICAgICAgICAgICAgJ3NpemUnOiAncycsXG4gICAgICAgICAgICAgICAgJ3NvcnRCeSc6IHRoaXMubG9hZENhcmJvblNvdXJjZSxcbiAgICAgICAgICAgICAgICAnc29ydEFmdGVyJzogMCB9KSxcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZEhlYWRlclNwZWMoNSwgJ2hMaW5lc0xhYmVsaW5nJywge1xuICAgICAgICAgICAgICAgICduYW1lJzogJ0xhYmVsaW5nJyxcbiAgICAgICAgICAgICAgICAnc2l6ZSc6ICdzJyxcbiAgICAgICAgICAgICAgICAnc29ydEJ5JzogdGhpcy5sb2FkQ2FyYm9uU291cmNlTGFiZWxpbmcsXG4gICAgICAgICAgICAgICAgJ3NvcnRBZnRlcic6IDAgfSksXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRIZWFkZXJTcGVjKDYsICdoTGluZXNDYXJib25CYWxhbmNlJywge1xuICAgICAgICAgICAgICAgICduYW1lJzogJ0NhcmJvbiBCYWxhbmNlJyxcbiAgICAgICAgICAgICAgICAnc2l6ZSc6ICdzJyxcbiAgICAgICAgICAgICAgICAnc29ydEJ5JzogdGhpcy5sb2FkTGluZU5hbWUgfSlcbiAgICAgICAgXTtcblxuICAgICAgICAvLyBtYXAgYWxsIG1ldGFkYXRhIElEcyB0byBIZWFkZXJTcGVjIG9iamVjdHNcbiAgICAgICAgdmFyIG1ldGFEYXRhSGVhZGVyczpEYXRhR3JpZEhlYWRlclNwZWNbXSA9IHRoaXMubWV0YURhdGFJRHNVc2VkSW5MaW5lcy5tYXAoKGlkLCBpbmRleCkgPT4ge1xuICAgICAgICAgICAgdmFyIG1kVHlwZSA9IEVERERhdGEuTWV0YURhdGFUeXBlc1tpZF07XG4gICAgICAgICAgICByZXR1cm4gbmV3IERhdGFHcmlkSGVhZGVyU3BlYyg3ICsgaW5kZXgsICdoTGluZXNNZXRhJyArIGlkLCB7XG4gICAgICAgICAgICAgICAgJ25hbWUnOiBtZFR5cGUubmFtZSxcbiAgICAgICAgICAgICAgICAnc2l6ZSc6ICdzJyxcbiAgICAgICAgICAgICAgICAnc29ydEJ5JzogdGhpcy5tYWtlTWV0YURhdGFTb3J0RnVuY3Rpb24oaWQpLFxuICAgICAgICAgICAgICAgICdzb3J0QWZ0ZXInOiAwIH0pO1xuICAgICAgICB9KTtcblxuICAgICAgICB2YXIgcmlnaHRTaWRlID0gW1xuICAgICAgICAgICAgbmV3IERhdGFHcmlkSGVhZGVyU3BlYyg3ICsgbWV0YURhdGFIZWFkZXJzLmxlbmd0aCwgJ2hMaW5lc0V4cGVyaW1lbnRlcicsIHtcbiAgICAgICAgICAgICAgICAnbmFtZSc6ICdFeHBlcmltZW50ZXInLFxuICAgICAgICAgICAgICAgICdzaXplJzogJ3MnLFxuICAgICAgICAgICAgICAgICdzb3J0QnknOiB0aGlzLmxvYWRFeHBlcmltZW50ZXJJbml0aWFscyxcbiAgICAgICAgICAgICAgICAnc29ydEFmdGVyJzogMCB9KSxcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZEhlYWRlclNwZWMoOCArIG1ldGFEYXRhSGVhZGVycy5sZW5ndGgsICdoTGluZXNNb2RpZmllZCcsIHtcbiAgICAgICAgICAgICAgICAnbmFtZSc6ICdMYXN0IE1vZGlmaWVkJyxcbiAgICAgICAgICAgICAgICAnc2l6ZSc6ICdzJyxcbiAgICAgICAgICAgICAgICAnc29ydEJ5JzogdGhpcy5sb2FkTGluZU1vZGlmaWNhdGlvbixcbiAgICAgICAgICAgICAgICAnc29ydEFmdGVyJzogMCB9KVxuICAgICAgICBdO1xuXG4gICAgICAgIHJldHVybiBsZWZ0U2lkZS5jb25jYXQobWV0YURhdGFIZWFkZXJzLCByaWdodFNpZGUpO1xuICAgIH1cblxuICAgIHByaXZhdGUgbWFrZU1ldGFEYXRhU29ydEZ1bmN0aW9uKGlkOnN0cmluZykge1xuICAgICAgICByZXR1cm4gKGk6c3RyaW5nKSA9PiB7XG4gICAgICAgICAgICB2YXIgbGluZSA9IEVERERhdGEuTGluZXNbaV07XG4gICAgICAgICAgICBpZiAobGluZSAmJiBsaW5lLm1ldGEpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gbGluZS5tZXRhW2lkXSB8fCAnJztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiAnJztcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8vIFRoZSBjb2xzcGFuIHZhbHVlIGZvciBhbGwgdGhlIGNlbGxzIHRoYXQgYXJlIG5vdCAnY2FyYm9uIHNvdXJjZScgb3IgJ2xhYmVsaW5nJ1xuICAgIC8vIGlzIGJhc2VkIG9uIHRoZSBudW1iZXIgb2YgY2FyYm9uIHNvdXJjZXMgZm9yIHRoZSByZXNwZWN0aXZlIHJlY29yZC5cbiAgICAvLyBTcGVjaWZpY2FsbHksIGl0J3MgZWl0aGVyIHRoZSBudW1iZXIgb2YgY2FyYm9uIHNvdXJjZXMsIG9yIDEsIHdoaWNoZXZlciBpcyBoaWdoZXIuXG4gICAgcHJpdmF0ZSByb3dTcGFuRm9yUmVjb3JkKGluZGV4KSB7XG4gICAgICAgIHJldHVybiAoRURERGF0YS5MaW5lc1tpbmRleF0uY2FyYm9uIHx8IFtdKS5sZW5ndGggfHwgMTtcbiAgICB9XG5cbiAgICBnZW5lcmF0ZUxpbmVOYW1lQ2VsbHMoZ3JpZFNwZWM6RGF0YUdyaWRTcGVjTGluZXMsIGluZGV4OnN0cmluZyk6RGF0YUdyaWREYXRhQ2VsbFtdIHtcbiAgICAgICAgdmFyIGxpbmUgPSBFREREYXRhLkxpbmVzW2luZGV4XTtcbiAgICAgICAgcmV0dXJuIFtcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZERhdGFDZWxsKGdyaWRTcGVjLCBpbmRleCwge1xuICAgICAgICAgICAgICAgICdjaGVja2JveE5hbWUnOiAnbGluZUlkJyxcbiAgICAgICAgICAgICAgICAnY2hlY2tib3hXaXRoSUQnOiAoaWQpID0+IHsgcmV0dXJuICdsaW5lJyArIGlkICsgJ2luY2x1ZGUnOyB9LFxuICAgICAgICAgICAgICAgICdzaWRlTWVudUl0ZW1zJzogW1xuICAgICAgICAgICAgICAgICAgICAnPGEgaHJlZj1cIiNcIiBjbGFzcz1cImxpbmUtZWRpdC1saW5rXCIgb25jbGljaz1cIlN0dWR5TGluZXMuZWRpdExpbmVzKFsnICsgaW5kZXggKyAnXSlcIj5FZGl0IExpbmU8L2E+JyxcbiAgICAgICAgICAgICAgICAgICAgJzxhIGhyZWY9XCIvZXhwb3J0P2xpbmVJZD0nICsgaW5kZXggKyAnXCI+RXhwb3J0IERhdGEgYXMgQ1NWL0V4Y2VsPC9hPicsXG4gICAgICAgICAgICAgICAgICAgICc8YSBocmVmPVwiL3NibWw/bGluZUlkPScgKyBpbmRleCArICdcIj5FeHBvcnQgRGF0YSBhcyBTQk1MPC9hPidcbiAgICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgICAgICdob3ZlckVmZmVjdCc6IHRydWUsXG4gICAgICAgICAgICAgICAgJ25vd3JhcCc6IHRydWUsXG4gICAgICAgICAgICAgICAgJ3Jvd3NwYW4nOiBncmlkU3BlYy5yb3dTcGFuRm9yUmVjb3JkKGluZGV4KSxcbiAgICAgICAgICAgICAgICAnY29udGVudFN0cmluZyc6IGxpbmUubmFtZSArIChsaW5lLmN0cmwgPyAnPGIgY2xhc3M9XCJpc2NvbnRyb2xkYXRhXCI+QzwvYj4nIDogJycpXG4gICAgICAgICAgICB9KVxuICAgICAgICBdO1xuICAgIH1cblxuICAgIGdlbmVyYXRlU3RyYWluTmFtZUNlbGxzKGdyaWRTcGVjOkRhdGFHcmlkU3BlY0xpbmVzLCBpbmRleDpzdHJpbmcpOkRhdGFHcmlkRGF0YUNlbGxbXSB7XG4gICAgICAgIHZhciBsaW5lLCBjb250ZW50ID0gW107XG4gICAgICAgIGlmICgobGluZSA9IEVERERhdGEuTGluZXNbaW5kZXhdKSkge1xuICAgICAgICAgICAgY29udGVudCA9IGxpbmUuc3RyYWluLm1hcCgoaWQpID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgc3RyYWluID0gRURERGF0YS5TdHJhaW5zW2lkXTtcbiAgICAgICAgICAgICAgICByZXR1cm4gWyAnPGEgaHJlZj1cIicsIHN0cmFpbi5yZWdpc3RyeV91cmwsICdcIj4nLCBzdHJhaW4ubmFtZSwgJzwvYT4nIF0uam9pbignJyk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gW1xuICAgICAgICAgICAgbmV3IERhdGFHcmlkRGF0YUNlbGwoZ3JpZFNwZWMsIGluZGV4LCB7XG4gICAgICAgICAgICAgICAgJ3Jvd3NwYW4nOiBncmlkU3BlYy5yb3dTcGFuRm9yUmVjb3JkKGluZGV4KSxcbiAgICAgICAgICAgICAgICAnY29udGVudFN0cmluZyc6IGNvbnRlbnQuam9pbignOyAnKSB8fCAnLS0nXG4gICAgICAgICAgICAgICB9KVxuICAgICAgICBdO1xuICAgIH1cblxuICAgIGdlbmVyYXRlRGVzY3JpcHRpb25DZWxscyhncmlkU3BlYzpEYXRhR3JpZFNwZWNMaW5lcywgaW5kZXg6c3RyaW5nKTpEYXRhR3JpZERhdGFDZWxsW10ge1xuICAgICAgICB2YXIgbGluZSwgc3RyaW5ncyA9ICctLSc7XG4gICAgICAgIGlmICgobGluZSA9IEVERERhdGEuTGluZXNbaW5kZXhdKSkge1xuICAgICAgICAgICAgaWYgKGxpbmUuZGVzY3JpcHRpb24gJiYgbGluZS5kZXNjcmlwdGlvbi5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICBzdHJpbmdzID0gbGluZS5kZXNjcmlwdGlvbjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gW1xuICAgICAgICAgICAgbmV3IERhdGFHcmlkRGF0YUNlbGwoZ3JpZFNwZWMsIGluZGV4LCB7XG4gICAgICAgICAgICAgICAgJ3Jvd3NwYW4nOiBncmlkU3BlYy5yb3dTcGFuRm9yUmVjb3JkKGluZGV4KSxcbiAgICAgICAgICAgICAgICAnY29udGVudFN0cmluZyc6IHN0cmluZ3MsXG4gICAgICAgICAgICB9KVxuICAgICAgICBdO1xuICAgIH1cblxuICAgIGdlbmVyYXRlQ2FyYm9uU291cmNlQ2VsbHMoZ3JpZFNwZWM6RGF0YUdyaWRTcGVjTGluZXMsIGluZGV4OnN0cmluZyk6RGF0YUdyaWREYXRhQ2VsbFtdIHtcbiAgICAgICAgdmFyIGxpbmUsIHN0cmluZ3MgPSBbJy0tJ107XG4gICAgICAgIGlmICgobGluZSA9IEVERERhdGEuTGluZXNbaW5kZXhdKSkge1xuICAgICAgICAgICAgaWYgKGxpbmUuY2FyYm9uICYmIGxpbmUuY2FyYm9uLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgIHN0cmluZ3MgPSBsaW5lLmNhcmJvbi5tYXAoKGlkKSA9PiB7IHJldHVybiBFREREYXRhLkNTb3VyY2VzW2lkXS5uYW1lOyB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gc3RyaW5ncy5tYXAoKG5hbWUpID0+IHtcbiAgICAgICAgICAgIHJldHVybiBuZXcgRGF0YUdyaWREYXRhQ2VsbChncmlkU3BlYywgaW5kZXgsIHsgJ2NvbnRlbnRTdHJpbmcnOiBuYW1lIH0pXG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIGdlbmVyYXRlQ2FyYm9uU291cmNlTGFiZWxpbmdDZWxscyhncmlkU3BlYzpEYXRhR3JpZFNwZWNMaW5lcywgaW5kZXg6c3RyaW5nKTpEYXRhR3JpZERhdGFDZWxsW10ge1xuICAgICAgICB2YXIgbGluZSwgc3RyaW5ncyA9IFsnLS0nXTtcbiAgICAgICAgaWYgKChsaW5lID0gRURERGF0YS5MaW5lc1tpbmRleF0pKSB7XG4gICAgICAgICAgICBpZiAobGluZS5jYXJib24gJiYgbGluZS5jYXJib24ubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgc3RyaW5ncyA9IGxpbmUuY2FyYm9uLm1hcCgoaWQpID0+IHsgcmV0dXJuIEVERERhdGEuQ1NvdXJjZXNbaWRdLmxhYmVsaW5nOyB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gc3RyaW5ncy5tYXAoKGxhYmVsaW5nKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gbmV3IERhdGFHcmlkRGF0YUNlbGwoZ3JpZFNwZWMsIGluZGV4LCB7ICdjb250ZW50U3RyaW5nJzogbGFiZWxpbmcgfSlcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgZ2VuZXJhdGVDYXJib25CYWxhbmNlQmxhbmtDZWxscyhncmlkU3BlYzpEYXRhR3JpZFNwZWNMaW5lcywgaW5kZXg6c3RyaW5nKTpEYXRhR3JpZERhdGFDZWxsW10ge1xuICAgICAgICByZXR1cm4gW1xuICAgICAgICAgICAgbmV3IERhdGFHcmlkRGF0YUNlbGwoZ3JpZFNwZWMsIGluZGV4LCB7XG4gICAgICAgICAgICAgICAgJ3Jvd3NwYW4nOiBncmlkU3BlYy5yb3dTcGFuRm9yUmVjb3JkKGluZGV4KSxcbiAgICAgICAgICAgICAgICAnbWluV2lkdGgnOiAyMDBcbiAgICAgICAgICAgIH0pXG4gICAgICAgIF07XG4gICAgfVxuXG4gICAgZ2VuZXJhdGVFeHBlcmltZW50ZXJJbml0aWFsc0NlbGxzKGdyaWRTcGVjOkRhdGFHcmlkU3BlY0xpbmVzLCBpbmRleDpzdHJpbmcpOkRhdGFHcmlkRGF0YUNlbGxbXSB7XG4gICAgICAgIHZhciBsaW5lLCBleHAsIGNvbnRlbnQ7XG4gICAgICAgIGlmICgobGluZSA9IEVERERhdGEuTGluZXNbaW5kZXhdKSkge1xuICAgICAgICAgICAgaWYgKEVERERhdGEuVXNlcnMgJiYgKGV4cCA9IEVERERhdGEuVXNlcnNbbGluZS5leHBlcmltZW50ZXJdKSkge1xuICAgICAgICAgICAgICAgIGNvbnRlbnQgPSBleHAuaW5pdGlhbHM7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIFtcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZERhdGFDZWxsKGdyaWRTcGVjLCBpbmRleCwge1xuICAgICAgICAgICAgICAgICdyb3dzcGFuJzogZ3JpZFNwZWMucm93U3BhbkZvclJlY29yZChpbmRleCksXG4gICAgICAgICAgICAgICAgJ2NvbnRlbnRTdHJpbmcnOiBjb250ZW50IHx8ICc/J1xuICAgICAgICAgICAgfSlcbiAgICAgICAgXTtcbiAgICB9XG5cbiAgICBnZW5lcmF0ZU1vZGlmaWNhdGlvbkRhdGVDZWxscyhncmlkU3BlYzpEYXRhR3JpZFNwZWNMaW5lcywgaW5kZXg6c3RyaW5nKTpEYXRhR3JpZERhdGFDZWxsW10ge1xuICAgICAgICByZXR1cm4gW1xuICAgICAgICAgICAgbmV3IERhdGFHcmlkRGF0YUNlbGwoZ3JpZFNwZWMsIGluZGV4LCB7XG4gICAgICAgICAgICAgICAgJ3Jvd3NwYW4nOiBncmlkU3BlYy5yb3dTcGFuRm9yUmVjb3JkKGluZGV4KSxcbiAgICAgICAgICAgICAgICAnY29udGVudFN0cmluZyc6IFV0bC5KUy50aW1lc3RhbXBUb1RvZGF5U3RyaW5nKEVERERhdGEuTGluZXNbaW5kZXhdLm1vZGlmaWVkLnRpbWUpXG4gICAgICAgICAgICB9KVxuICAgICAgICBdO1xuICAgIH1cblxuICAgIG1ha2VNZXRhRGF0YUNlbGxzR2VuZXJhdG9yRnVuY3Rpb24oaWQpIHtcbiAgICAgICAgcmV0dXJuIChncmlkU3BlYzpEYXRhR3JpZFNwZWNMaW5lcywgaW5kZXg6c3RyaW5nKTpEYXRhR3JpZERhdGFDZWxsW10gPT4ge1xuICAgICAgICAgICAgdmFyIGNvbnRlbnRTdHIgPSAnJywgbGluZSA9IEVERERhdGEuTGluZXNbaW5kZXhdLCB0eXBlID0gRURERGF0YS5NZXRhRGF0YVR5cGVzW2lkXTtcbiAgICAgICAgICAgIGlmIChsaW5lICYmIHR5cGUgJiYgbGluZS5tZXRhICYmIChjb250ZW50U3RyID0gbGluZS5tZXRhW2lkXSB8fCAnJykpIHtcbiAgICAgICAgICAgICAgICBjb250ZW50U3RyID0gWyB0eXBlLnByZSB8fCAnJywgY29udGVudFN0ciwgdHlwZS5wb3N0Zml4IHx8ICcnIF0uam9pbignICcpLnRyaW0oKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBbXG4gICAgICAgICAgICAgICAgbmV3IERhdGFHcmlkRGF0YUNlbGwoZ3JpZFNwZWMsIGluZGV4LCB7XG4gICAgICAgICAgICAgICAgICAgICdyb3dzcGFuJzogZ3JpZFNwZWMucm93U3BhbkZvclJlY29yZChpbmRleCksXG4gICAgICAgICAgICAgICAgICAgICdjb250ZW50U3RyaW5nJzogY29udGVudFN0clxuICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICBdO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gU3BlY2lmaWNhdGlvbiBmb3IgZWFjaCBvZiB0aGUgZGF0YSBjb2x1bW5zIHRoYXQgd2lsbCBtYWtlIHVwIHRoZSBib2R5IG9mIHRoZSB0YWJsZVxuICAgIGRlZmluZUNvbHVtblNwZWMoKTpEYXRhR3JpZENvbHVtblNwZWNbXSB7XG4gICAgICAgIHZhciBsZWZ0U2lkZTpEYXRhR3JpZENvbHVtblNwZWNbXSxcbiAgICAgICAgICAgIG1ldGFEYXRhQ29sczpEYXRhR3JpZENvbHVtblNwZWNbXSxcbiAgICAgICAgICAgIHJpZ2h0U2lkZTpEYXRhR3JpZENvbHVtblNwZWNbXTtcbiAgICAgICAgbGVmdFNpZGUgPSBbXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRDb2x1bW5TcGVjKDEsIHRoaXMuZ2VuZXJhdGVMaW5lTmFtZUNlbGxzKSxcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZENvbHVtblNwZWMoMiwgdGhpcy5nZW5lcmF0ZURlc2NyaXB0aW9uQ2VsbHMpLFxuICAgICAgICAgICAgbmV3IERhdGFHcmlkQ29sdW1uU3BlYygzLCB0aGlzLmdlbmVyYXRlU3RyYWluTmFtZUNlbGxzKSxcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZENvbHVtblNwZWMoNCwgdGhpcy5nZW5lcmF0ZUNhcmJvblNvdXJjZUNlbGxzKSxcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZENvbHVtblNwZWMoNSwgdGhpcy5nZW5lcmF0ZUNhcmJvblNvdXJjZUxhYmVsaW5nQ2VsbHMpLFxuICAgICAgICAgICAgLy8gVGhlIENhcmJvbiBCYWxhbmNlIGNlbGxzIGFyZSBwb3B1bGF0ZWQgYnkgYSBjYWxsYmFjaywgdHJpZ2dlcmVkIHdoZW4gZmlyc3QgZGlzcGxheWVkXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRDb2x1bW5TcGVjKDYsIHRoaXMuZ2VuZXJhdGVDYXJib25CYWxhbmNlQmxhbmtDZWxscylcbiAgICAgICAgXTtcbiAgICAgICAgbWV0YURhdGFDb2xzID0gdGhpcy5tZXRhRGF0YUlEc1VzZWRJbkxpbmVzLm1hcCgoaWQsIGluZGV4KSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gbmV3IERhdGFHcmlkQ29sdW1uU3BlYyg3ICsgaW5kZXgsIHRoaXMubWFrZU1ldGFEYXRhQ2VsbHNHZW5lcmF0b3JGdW5jdGlvbihpZCkpO1xuICAgICAgICB9KTtcbiAgICAgICAgcmlnaHRTaWRlID0gW1xuICAgICAgICAgICAgbmV3IERhdGFHcmlkQ29sdW1uU3BlYyg3ICsgbWV0YURhdGFDb2xzLmxlbmd0aCwgdGhpcy5nZW5lcmF0ZUV4cGVyaW1lbnRlckluaXRpYWxzQ2VsbHMpLFxuICAgICAgICAgICAgbmV3IERhdGFHcmlkQ29sdW1uU3BlYyg4ICsgbWV0YURhdGFDb2xzLmxlbmd0aCwgdGhpcy5nZW5lcmF0ZU1vZGlmaWNhdGlvbkRhdGVDZWxscylcbiAgICAgICAgXTtcblxuICAgICAgICByZXR1cm4gbGVmdFNpZGUuY29uY2F0KG1ldGFEYXRhQ29scywgcmlnaHRTaWRlKTtcbiAgICB9XG5cbiAgICAvLyBTcGVjaWZpY2F0aW9uIGZvciBlYWNoIG9mIHRoZSBncm91cHMgdGhhdCB0aGUgaGVhZGVycyBhbmQgZGF0YSBjb2x1bW5zIGFyZSBvcmdhbml6ZWQgaW50b1xuICAgIGRlZmluZUNvbHVtbkdyb3VwU3BlYygpOkRhdGFHcmlkQ29sdW1uR3JvdXBTcGVjW10ge1xuICAgICAgICB2YXIgdG9wU2VjdGlvbjpEYXRhR3JpZENvbHVtbkdyb3VwU3BlY1tdID0gW1xuICAgICAgICAgICAgbmV3IERhdGFHcmlkQ29sdW1uR3JvdXBTcGVjKCdMaW5lIE5hbWUnLCB7ICdzaG93SW5WaXNpYmlsaXR5TGlzdCc6IGZhbHNlIH0pLFxuICAgICAgICAgICAgbmV3IERhdGFHcmlkQ29sdW1uR3JvdXBTcGVjKCdEZXNjcmlwdGlvbicpLFxuICAgICAgICAgICAgbmV3IERhdGFHcmlkQ29sdW1uR3JvdXBTcGVjKCdTdHJhaW4nKSxcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZENvbHVtbkdyb3VwU3BlYygnQ2FyYm9uIFNvdXJjZShzKScpLFxuICAgICAgICAgICAgbmV3IERhdGFHcmlkQ29sdW1uR3JvdXBTcGVjKCdMYWJlbGluZycpLFxuICAgICAgICAgICAgdGhpcy5jYXJib25CYWxhbmNlQ29sID0gbmV3IERhdGFHcmlkQ29sdW1uR3JvdXBTcGVjKCdDYXJib24gQmFsYW5jZScsIHtcbiAgICAgICAgICAgICAgICAnc2hvd0luVmlzaWJpbGl0eUxpc3QnOiBmYWxzZSwgICAgLy8gSGFzIGl0cyBvd24gaGVhZGVyIHdpZGdldFxuICAgICAgICAgICAgICAgICdoaWRkZW5CeURlZmF1bHQnOiB0cnVlLFxuICAgICAgICAgICAgICAgICdyZXZlYWxlZENhbGxiYWNrJzogU3R1ZHlMaW5lcy5jYXJib25CYWxhbmNlQ29sdW1uUmV2ZWFsZWRDYWxsYmFja1xuICAgICAgICAgICAgfSlcbiAgICAgICAgXTtcblxuICAgICAgICB2YXIgbWV0YURhdGFDb2xHcm91cHM6RGF0YUdyaWRDb2x1bW5Hcm91cFNwZWNbXTtcbiAgICAgICAgbWV0YURhdGFDb2xHcm91cHMgPSB0aGlzLm1ldGFEYXRhSURzVXNlZEluTGluZXMubWFwKChpZCwgaW5kZXgpID0+IHtcbiAgICAgICAgICAgIHZhciBtZFR5cGUgPSBFREREYXRhLk1ldGFEYXRhVHlwZXNbaWRdO1xuICAgICAgICAgICAgcmV0dXJuIG5ldyBEYXRhR3JpZENvbHVtbkdyb3VwU3BlYyhtZFR5cGUubmFtZSk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHZhciBib3R0b21TZWN0aW9uOkRhdGFHcmlkQ29sdW1uR3JvdXBTcGVjW10gPSBbXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRDb2x1bW5Hcm91cFNwZWMoJ0V4cGVyaW1lbnRlcicsIHsgJ2hpZGRlbkJ5RGVmYXVsdCc6IHRydWUgfSksXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRDb2x1bW5Hcm91cFNwZWMoJ0xhc3QgTW9kaWZpZWQnLCB7ICdoaWRkZW5CeURlZmF1bHQnOiB0cnVlIH0pXG4gICAgICAgIF07XG5cbiAgICAgICAgcmV0dXJuIHRvcFNlY3Rpb24uY29uY2F0KG1ldGFEYXRhQ29sR3JvdXBzLCBib3R0b21TZWN0aW9uKTtcbiAgICB9XG5cbiAgICAvLyBTcGVjaWZpY2F0aW9uIGZvciB0aGUgZ3JvdXBzIHRoYXQgcm93cyBjYW4gYmUgZ2F0aGVyZWQgaW50b1xuICAgIGRlZmluZVJvd0dyb3VwU3BlYygpOmFueSB7XG5cbiAgICAgICAgdmFyIHJvd0dyb3VwU3BlYyA9IFtdO1xuICAgICAgICBmb3IgKHZhciB4ID0gMDsgeCA8IHRoaXMuZ3JvdXBJRHNJbk9yZGVyLmxlbmd0aDsgeCsrKSB7XG4gICAgICAgICAgICB2YXIgaWQgPSB0aGlzLmdyb3VwSURzSW5PcmRlclt4XTtcblxuICAgICAgICAgICAgdmFyIHJvd0dyb3VwU3BlY0VudHJ5OmFueSA9IHsgICAgLy8gR3JvdXBzIGFyZSBudW1iZXJlZCBzdGFydGluZyBmcm9tIDBcbiAgICAgICAgICAgICAgICBuYW1lOiB0aGlzLmdyb3VwSURzVG9Hcm91cE5hbWVzW2lkXVxuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIHJvd0dyb3VwU3BlYy5wdXNoKHJvd0dyb3VwU3BlY0VudHJ5KTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiByb3dHcm91cFNwZWM7XG4gICAgfVxuXG4gICAgLy8gVGhlIHRhYmxlIGVsZW1lbnQgb24gdGhlIHBhZ2UgdGhhdCB3aWxsIGJlIHR1cm5lZCBpbnRvIHRoZSBEYXRhR3JpZC4gIEFueSBwcmVleGlzdGluZyB0YWJsZVxuICAgIC8vIGNvbnRlbnQgd2lsbCBiZSByZW1vdmVkLlxuICAgIGdldFRhYmxlRWxlbWVudCgpIHtcbiAgICAgICAgcmV0dXJuIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic3R1ZHlMaW5lc1RhYmxlXCIpO1xuICAgIH1cblxuICAgIC8vIEFuIGFycmF5IG9mIHVuaXF1ZSBpZGVudGlmaWVycyAobnVtYmVycywgbm90IHN0cmluZ3MpLCB1c2VkIHRvIGlkZW50aWZ5IHRoZSByZWNvcmRzIGluIHRoZVxuICAgIC8vIGRhdGEgc2V0IGJlaW5nIGRpc3BsYXllZFxuICAgIGdldFJlY29yZElEcygpIHtcbiAgICAgICAgcmV0dXJuIE9iamVjdC5rZXlzKEVERERhdGEuTGluZXMpO1xuICAgIH1cblxuICAgIC8vIFRoaXMgaXMgY2FsbGVkIHRvIGdlbmVyYXRlIHRoZSBhcnJheSBvZiBjdXN0b20gaGVhZGVyIHdpZGdldHMuIFRoZSBvcmRlciBvZiB0aGUgYXJyYXkgd2lsbCBiZVxuICAgIC8vIHRoZSBvcmRlciB0aGV5IGFyZSBhZGRlZCB0byB0aGUgaGVhZGVyIGJhci4gSXQncyBwZXJmZWN0bHkgZmluZSB0byByZXR1cm4gYW4gZW1wdHkgYXJyYXkuXG4gICAgY3JlYXRlQ3VzdG9tSGVhZGVyV2lkZ2V0cyhkYXRhR3JpZDpEYXRhR3JpZCk6RGF0YUdyaWRIZWFkZXJXaWRnZXRbXSB7XG4gICAgICAgIHZhciB3aWRnZXRTZXQ6RGF0YUdyaWRIZWFkZXJXaWRnZXRbXSA9IFtdO1xuXG4gICAgICAgIC8vIENyZWF0ZSBhIHNpbmdsZSB3aWRnZXQgZm9yIHN1YnN0cmluZyBzZWFyY2hpbmdcbiAgICAgICAgdmFyIHNlYXJjaExpbmVzV2lkZ2V0ID0gbmV3IERHTGluZXNTZWFyY2hXaWRnZXQoZGF0YUdyaWQsIHRoaXMsICdTZWFyY2ggTGluZXMnLCAzMCwgZmFsc2UpO1xuICAgICAgICB3aWRnZXRTZXQucHVzaChzZWFyY2hMaW5lc1dpZGdldCk7XG4gICAgICAgIC8vIEEgXCJDYXJib24gQmFsYW5jZVwiIGNoZWNrYm94XG4gICAgICAgIHZhciBzaG93Q2FyYm9uQmFsYW5jZVdpZGdldCA9IG5ldyBER1Nob3dDYXJib25CYWxhbmNlV2lkZ2V0KGRhdGFHcmlkLCB0aGlzKTtcbiAgICAgICAgc2hvd0NhcmJvbkJhbGFuY2VXaWRnZXQuZGlzcGxheUJlZm9yZVZpZXdNZW51KHRydWUpO1xuICAgICAgICB3aWRnZXRTZXQucHVzaChzaG93Q2FyYm9uQmFsYW5jZVdpZGdldCk7XG4gICAgICAgIHRoaXMuY2FyYm9uQmFsYW5jZVdpZGdldCA9IHNob3dDYXJib25CYWxhbmNlV2lkZ2V0O1xuICAgICAgICAvLyBBIFwic2VsZWN0IGFsbCAvIHNlbGVjdCBub25lXCIgYnV0dG9uXG4gICAgICAgIHZhciBzZWxlY3RBbGxXaWRnZXQgPSBuZXcgREdTZWxlY3RBbGxMaW5lc1dpZGdldChkYXRhR3JpZCwgdGhpcyk7XG4gICAgICAgIHNlbGVjdEFsbFdpZGdldC5kaXNwbGF5QmVmb3JlVmlld01lbnUodHJ1ZSk7XG4gICAgICAgIHdpZGdldFNldC5wdXNoKHNlbGVjdEFsbFdpZGdldCk7XG4gICAgICAgIHJldHVybiB3aWRnZXRTZXQ7XG4gICAgfVxuXG4gICAgLy8gVGhpcyBpcyBjYWxsZWQgdG8gZ2VuZXJhdGUgdGhlIGFycmF5IG9mIGN1c3RvbSBvcHRpb25zIG1lbnUgd2lkZ2V0cy4gVGhlIG9yZGVyIG9mIHRoZSBhcnJheVxuICAgIC8vIHdpbGwgYmUgdGhlIG9yZGVyIHRoZXkgYXJlIGRpc3BsYXllZCBpbiB0aGUgbWVudS4gRW1wdHkgYXJyYXkgPSBPSy5cbiAgICBjcmVhdGVDdXN0b21PcHRpb25zV2lkZ2V0cyhkYXRhR3JpZDpEYXRhR3JpZCk6RGF0YUdyaWRPcHRpb25XaWRnZXRbXSB7XG4gICAgICAgIHZhciB3aWRnZXRTZXQ6RGF0YUdyaWRPcHRpb25XaWRnZXRbXSA9IFtdO1xuXG4gICAgICAgIC8vIENyZWF0ZSBhIHNpbmdsZSB3aWRnZXQgZm9yIHNob3dpbmcgZGlzYWJsZWQgTGluZXNcbiAgICAgICAgdmFyIGdyb3VwTGluZXNXaWRnZXQgPSBuZXcgREdHcm91cFN0dWR5UmVwbGljYXRlc1dpZGdldChkYXRhR3JpZCwgdGhpcyk7XG4gICAgICAgIHdpZGdldFNldC5wdXNoKGdyb3VwTGluZXNXaWRnZXQpO1xuICAgICAgICB2YXIgZGlzYWJsZWRMaW5lc1dpZGdldCA9IG5ldyBER0Rpc2FibGVkTGluZXNXaWRnZXQoZGF0YUdyaWQsIHRoaXMpO1xuICAgICAgICB3aWRnZXRTZXQucHVzaChkaXNhYmxlZExpbmVzV2lkZ2V0KTtcbiAgICAgICAgcmV0dXJuIHdpZGdldFNldDtcbiAgICB9XG5cbiAgICAvLyBUaGlzIGlzIGNhbGxlZCBhZnRlciBldmVyeXRoaW5nIGlzIGluaXRpYWxpemVkLCBpbmNsdWRpbmcgdGhlIGNyZWF0aW9uIG9mIHRoZSB0YWJsZSBjb250ZW50LlxuICAgIG9uSW5pdGlhbGl6ZWQoZGF0YUdyaWQ6RGF0YUdyaWQpOnZvaWQge1xuXG4gICAgICAgIC8vIFdpcmUgdXAgdGhlICdhY3Rpb24gcGFuZWxzJyBmb3IgdGhlIExpbmVzIGFuZCBBc3NheXMgc2VjdGlvbnNcbiAgICAgICAgdmFyIGxpbmVzVGFibGUgPSB0aGlzLmdldFRhYmxlRWxlbWVudCgpO1xuICAgICAgICAkKGxpbmVzVGFibGUpLm9uKCdjaGFuZ2UnLCAnOmNoZWNrYm94JywgKCkgPT4gU3R1ZHlMaW5lcy5xdWV1ZUxpbmVzQWN0aW9uUGFuZWxTaG93KCkpO1xuXG4gICAgICAgIC8vIFRoaXMgY2FsbHMgZG93biBpbnRvIHRoZSBpbnN0YW50aWF0ZWQgd2lkZ2V0IGFuZCBhbHRlcnMgaXRzIHN0eWxpbmcsXG4gICAgICAgIC8vIHNvIHdlIG5lZWQgdG8gZG8gaXQgYWZ0ZXIgdGhlIHRhYmxlIGhhcyBiZWVuIGNyZWF0ZWQuXG4gICAgICAgIHRoaXMuZW5hYmxlQ2FyYm9uQmFsYW5jZVdpZGdldChmYWxzZSk7XG5cbiAgICAgICAgLy8gV2lyZS1pbiBvdXIgY3VzdG9tIGVkaXQgZmllbGRzIGZvciB0aGUgU3R1ZGllcyBwYWdlLCBhbmQgY29udGludWUgd2l0aCBnZW5lcmFsIGluaXRcbiAgICAgICAgU3R1ZHlMaW5lcy5wcmVwYXJlQWZ0ZXJMaW5lc1RhYmxlKCk7XG4gICAgfVxufVxuXG4vLyBXaGVuIHVuY2hlY2tlZCwgdGhpcyBoaWRlcyB0aGUgc2V0IG9mIExpbmVzIHRoYXQgYXJlIG1hcmtlZCBhcyBkaXNhYmxlZC5cbmNsYXNzIERHRGlzYWJsZWRMaW5lc1dpZGdldCBleHRlbmRzIERhdGFHcmlkT3B0aW9uV2lkZ2V0IHtcblxuICAgIGNyZWF0ZUVsZW1lbnRzKHVuaXF1ZUlEOmFueSk6dm9pZCB7XG4gICAgICAgIHZhciBjYklEOnN0cmluZyA9IHRoaXMuZGF0YUdyaWRTcGVjLnRhYmxlU3BlYy5pZCsnU2hvd0RMaW5lc0NCJyt1bmlxdWVJRDtcbiAgICAgICAgdmFyIGNiOkhUTUxJbnB1dEVsZW1lbnQgPSB0aGlzLl9jcmVhdGVDaGVja2JveChjYklELCBjYklELCAnMScpO1xuICAgICAgICAkKGNiKS5jbGljayggKGUpID0+IHRoaXMuZGF0YUdyaWRPd25lck9iamVjdC5jbGlja2VkT3B0aW9uV2lkZ2V0KGUpICk7XG4gICAgICAgIGlmICh0aGlzLmlzRW5hYmxlZEJ5RGVmYXVsdCgpKSB7XG4gICAgICAgICAgICBjYi5zZXRBdHRyaWJ1dGUoJ2NoZWNrZWQnLCAnY2hlY2tlZCcpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuY2hlY2tCb3hFbGVtZW50ID0gY2I7XG4gICAgICAgIHRoaXMubGFiZWxFbGVtZW50ID0gdGhpcy5fY3JlYXRlTGFiZWwoJ1Nob3cgRGlzYWJsZWQnLCBjYklEKTtcbiAgICAgICAgdGhpcy5fY3JlYXRlZEVsZW1lbnRzID0gdHJ1ZTtcbiAgICB9XG5cbiAgICBhcHBseUZpbHRlclRvSURzKHJvd0lEczpzdHJpbmdbXSk6c3RyaW5nW10ge1xuXG4gICAgICAgIHZhciBjaGVja2VkOmJvb2xlYW4gPSBmYWxzZTtcbiAgICAgICAgaWYgKHRoaXMuY2hlY2tCb3hFbGVtZW50LmNoZWNrZWQpIHtcbiAgICAgICAgICAgIGNoZWNrZWQgPSB0cnVlO1xuICAgICAgICB9XG4gICAgICAgIC8vIElmIHRoZSBib3ggaXMgY2hlY2tlZCwgcmV0dXJuIHRoZSBzZXQgb2YgSURzIHVuZmlsdGVyZWRcbiAgICAgICAgaWYgKGNoZWNrZWQgJiYgcm93SURzICYmIEVERERhdGEuY3VycmVudFN0dWR5V3JpdGFibGUpIHtcbiAgICAgICAgICAgICQoXCIuZW5hYmxlQnV0dG9uXCIpLnJlbW92ZUNsYXNzKCdvZmYnKTtcbiAgICAgICAgICAgIHJldHVybiByb3dJRHM7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAkKFwiLmVuYWJsZUJ1dHRvblwiKS5hZGRDbGFzcygnb2ZmJyk7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgZmlsdGVyZWRJRHMgPSBbXTtcbiAgICAgICAgZm9yICh2YXIgciA9IDA7IHIgPCByb3dJRHMubGVuZ3RoOyByKyspIHtcbiAgICAgICAgICAgIHZhciBpZCA9IHJvd0lEc1tyXTtcbiAgICAgICAgICAgIC8vIEhlcmUgaXMgdGhlIGNvbmRpdGlvbiB0aGF0IGRldGVybWluZXMgd2hldGhlciB0aGUgcm93cyBhc3NvY2lhdGVkIHdpdGggdGhpcyBJRCBhcmVcbiAgICAgICAgICAgIC8vIHNob3duIG9yIGhpZGRlbi5cbiAgICAgICAgICAgIGlmIChFREREYXRhLkxpbmVzW2lkXS5hY3RpdmUpIHtcbiAgICAgICAgICAgICAgICBmaWx0ZXJlZElEcy5wdXNoKGlkKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZmlsdGVyZWRJRHM7XG4gICAgfVxuXG4gICAgaW5pdGlhbEZvcm1hdFJvd0VsZW1lbnRzRm9ySUQoZGF0YVJvd09iamVjdHM6YW55LCByb3dJRDpzdHJpbmcpOmFueSB7XG4gICAgICAgIGlmICghRURERGF0YS5MaW5lc1tyb3dJRF0uYWN0aXZlKSB7XG4gICAgICAgICAgICAkLmVhY2goZGF0YVJvd09iamVjdHMsICh4LCByb3cpID0+ICQocm93LmdldEVsZW1lbnQoKSkuYWRkQ2xhc3MoJ2Rpc2FibGVkUmVjb3JkJykpO1xuICAgICAgICB9XG4gICAgfVxufVxuXG4vLyBBIHdpZGdldCB0byB0b2dnbGUgcmVwbGljYXRlIGdyb3VwaW5nIG9uIGFuZCBvZmZcbmNsYXNzIERHR3JvdXBTdHVkeVJlcGxpY2F0ZXNXaWRnZXQgZXh0ZW5kcyBEYXRhR3JpZE9wdGlvbldpZGdldCB7XG5cbiAgICBjcmVhdGVFbGVtZW50cyh1bmlxdWVJRDphbnkpOnZvaWQge1xuICAgICAgICB2YXIgcFRoaXMgPSB0aGlzO1xuICAgICAgICB2YXIgY2JJRDpzdHJpbmcgPSAnR3JvdXBTdHVkeVJlcGxpY2F0ZXNDQic7XG4gICAgICAgIHZhciBjYjpIVE1MSW5wdXRFbGVtZW50ID0gdGhpcy5fY3JlYXRlQ2hlY2tib3goY2JJRCwgY2JJRCwgJzEnKTtcbiAgICAgICAgJChjYikuY2xpY2soXG4gICAgICAgICAgICBmdW5jdGlvbihlKSB7XG4gICAgICAgICAgICAgICAgaWYgKHBUaGlzLmNoZWNrQm94RWxlbWVudC5jaGVja2VkKSB7XG4gICAgICAgICAgICAgICAgICAgIHBUaGlzLmRhdGFHcmlkT3duZXJPYmplY3QudHVybk9uUm93R3JvdXBpbmcoKTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBwVGhpcy5kYXRhR3JpZE93bmVyT2JqZWN0LnR1cm5PZmZSb3dHcm91cGluZygpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgKTtcbiAgICAgICAgaWYgKHRoaXMuaXNFbmFibGVkQnlEZWZhdWx0KCkpIHtcbiAgICAgICAgICAgIGNiLnNldEF0dHJpYnV0ZSgnY2hlY2tlZCcsICdjaGVja2VkJyk7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5jaGVja0JveEVsZW1lbnQgPSBjYjtcbiAgICAgICAgdGhpcy5sYWJlbEVsZW1lbnQgPSB0aGlzLl9jcmVhdGVMYWJlbCgnR3JvdXAgUmVwbGljYXRlcycsIGNiSUQpO1xuICAgICAgICB0aGlzLl9jcmVhdGVkRWxlbWVudHMgPSB0cnVlO1xuICAgIH1cbn1cblxuLy8gVGhpcyBpcyBhIERhdGFHcmlkSGVhZGVyV2lkZ2V0IGRlcml2ZWQgZnJvbSBER1NlYXJjaFdpZGdldC4gSXQncyBhIHNlYXJjaCBmaWVsZCB0aGF0IG9mZmVyc1xuLy8gb3B0aW9ucyBmb3IgYWRkaXRpb25hbCBkYXRhIHR5cGVzLCBxdWVyeWluZyB0aGUgc2VydmVyIGZvciByZXN1bHRzLlxuY2xhc3MgREdMaW5lc1NlYXJjaFdpZGdldCBleHRlbmRzIERHU2VhcmNoV2lkZ2V0IHtcblxuICAgIHNlYXJjaERpc2Nsb3N1cmVFbGVtZW50OmFueTtcblxuICAgIGNvbnN0cnVjdG9yKGRhdGFHcmlkT3duZXJPYmplY3Q6YW55LCBkYXRhR3JpZFNwZWM6YW55LCBwbGFjZUhvbGRlcjpzdHJpbmcsIHNpemU6bnVtYmVyLFxuICAgICAgICAgICAgZ2V0c0ZvY3VzOmJvb2xlYW4pIHtcbiAgICAgICAgc3VwZXIoZGF0YUdyaWRPd25lck9iamVjdCwgZGF0YUdyaWRTcGVjLCBwbGFjZUhvbGRlciwgc2l6ZSwgZ2V0c0ZvY3VzKTtcbiAgICB9XG5cbiAgICAvLyBUaGUgdW5pcXVlSUQgaXMgcHJvdmlkZWQgdG8gYXNzaXN0IHRoZSB3aWRnZXQgaW4gYXZvaWRpbmcgY29sbGlzaW9ucyB3aGVuIGNyZWF0aW5nIGlucHV0XG4gICAgLy8gZWxlbWVudCBsYWJlbHMgb3Igb3RoZXIgdGhpbmdzIHJlcXVpcmluZyBhbiBJRC5cbiAgICBjcmVhdGVFbGVtZW50cyh1bmlxdWVJRDphbnkpOnZvaWQge1xuICAgICAgICBzdXBlci5jcmVhdGVFbGVtZW50cyh1bmlxdWVJRCk7XG4gICAgICAgIHRoaXMuY3JlYXRlZEVsZW1lbnRzKHRydWUpO1xuICAgIH1cblxuICAgIC8vIFRoaXMgaXMgY2FsbGVkIHRvIGFwcGVuZCB0aGUgd2lkZ2V0IGVsZW1lbnRzIGJlbmVhdGggdGhlIGdpdmVuIGVsZW1lbnQuIElmIHRoZSBlbGVtZW50cyBoYXZlXG4gICAgLy8gbm90IGJlZW4gY3JlYXRlZCB5ZXQsIHRoZXkgYXJlIGNyZWF0ZWQsIGFuZCB0aGUgdW5pcXVlSUQgaXMgcGFzc2VkIGFsb25nLlxuICAgIGFwcGVuZEVsZW1lbnRzKGNvbnRhaW5lcjphbnksIHVuaXF1ZUlEOmFueSk6dm9pZCB7XG4gICAgICAgIGlmICghdGhpcy5jcmVhdGVkRWxlbWVudHMoKSkge1xuICAgICAgICAgICAgdGhpcy5jcmVhdGVFbGVtZW50cyh1bmlxdWVJRCk7XG4gICAgICAgIH1cbiAgICAgICAgY29udGFpbmVyLmFwcGVuZENoaWxkKHRoaXMuZWxlbWVudCk7XG4gICAgfVxufVxuXG5cblxuLy8gQSBoZWFkZXIgd2lkZ2V0IHRvIHByZXBhcmUgdGhlIENhcmJvbiBCYWxhbmNlIHRhYmxlIGNlbGxzLCBhbmQgc2hvdyBvciBoaWRlIHRoZW0uXG5jbGFzcyBER1Nob3dDYXJib25CYWxhbmNlV2lkZ2V0IGV4dGVuZHMgRGF0YUdyaWRIZWFkZXJXaWRnZXQge1xuXG4gICAgY2hlY2tCb3hFbGVtZW50OmFueTtcbiAgICBsYWJlbEVsZW1lbnQ6YW55O1xuICAgIGhpZ2hsaWdodGVkOmJvb2xlYW47XG4gICAgY2hlY2tib3hFbmFibGVkOmJvb2xlYW47XG5cbiAgICAvLyBzdG9yZSBtb3JlIHNwZWNpZmljIHR5cGUgb2Ygc3BlYyB0byBnZXQgdG8gY2FyYm9uQmFsYW5jZUNvbCBsYXRlclxuICAgIHByaXZhdGUgX2xpbmVTcGVjOkRhdGFHcmlkU3BlY0xpbmVzO1xuXG4gICAgY29uc3RydWN0b3IoZGF0YUdyaWRPd25lck9iamVjdDpEYXRhR3JpZCwgZGF0YUdyaWRTcGVjOkRhdGFHcmlkU3BlY0xpbmVzKSB7XG4gICAgICAgIHN1cGVyKGRhdGFHcmlkT3duZXJPYmplY3QsIGRhdGFHcmlkU3BlYyk7XG4gICAgICAgIHRoaXMuY2hlY2tib3hFbmFibGVkID0gdHJ1ZTtcbiAgICAgICAgdGhpcy5oaWdobGlnaHRlZCA9IGZhbHNlO1xuICAgICAgICB0aGlzLl9saW5lU3BlYyA9IGRhdGFHcmlkU3BlYztcbiAgICB9XG5cbiAgICBjcmVhdGVFbGVtZW50cyh1bmlxdWVJRDphbnkpOnZvaWQge1xuICAgICAgICB2YXIgY2JJRDpzdHJpbmcgPSB0aGlzLmRhdGFHcmlkU3BlYy50YWJsZVNwZWMuaWQgKyAnQ2FyQmFsJyArIHVuaXF1ZUlEO1xuICAgICAgICB2YXIgY2I6SFRNTElucHV0RWxlbWVudCA9IHRoaXMuX2NyZWF0ZUNoZWNrYm94KGNiSUQsIGNiSUQsICcxJyk7XG4gICAgICAgIGNiLmNsYXNzTmFtZSA9ICd0YWJsZUNvbnRyb2wnO1xuICAgICAgICAkKGNiKS5jbGljaygoZXY6SlF1ZXJ5TW91c2VFdmVudE9iamVjdCk6dm9pZCA9PiB7XG4gICAgICAgICAgICB0aGlzLmFjdGl2YXRlQ2FyYm9uQmFsYW5jZSgpO1xuICAgICAgICB9KTtcblxuICAgICAgICB2YXIgbGFiZWw6SFRNTEVsZW1lbnQgPSB0aGlzLl9jcmVhdGVMYWJlbCgnQ2FyYm9uIEJhbGFuY2UnLCBjYklEKTtcblxuICAgICAgICB2YXIgc3BhbjpIVE1MRWxlbWVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJzcGFuXCIpO1xuICAgICAgICBzcGFuLmNsYXNzTmFtZSA9ICd0YWJsZUNvbnRyb2wnO1xuICAgICAgICBzcGFuLmFwcGVuZENoaWxkKGNiKTtcbiAgICAgICAgc3Bhbi5hcHBlbmRDaGlsZChsYWJlbCk7XG5cbiAgICAgICAgdGhpcy5jaGVja0JveEVsZW1lbnQgPSBjYjtcbiAgICAgICAgdGhpcy5sYWJlbEVsZW1lbnQgPSBsYWJlbDtcbiAgICAgICAgdGhpcy5lbGVtZW50ID0gc3BhbjtcbiAgICAgICAgdGhpcy5jcmVhdGVkRWxlbWVudHModHJ1ZSk7XG4gICAgfVxuXG4gICAgaGlnaGxpZ2h0KGg6Ym9vbGVhbik6dm9pZCB7XG4gICAgICAgIHRoaXMuaGlnaGxpZ2h0ZWQgPSBoO1xuICAgICAgICBpZiAodGhpcy5jaGVja2JveEVuYWJsZWQpIHtcbiAgICAgICAgICAgIGlmIChoKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5sYWJlbEVsZW1lbnQuc3R5bGUuY29sb3IgPSAncmVkJztcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdGhpcy5sYWJlbEVsZW1lbnQuc3R5bGUuY29sb3IgPSAnJztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIGVuYWJsZShoOmJvb2xlYW4pOnZvaWQge1xuICAgICAgICB0aGlzLmNoZWNrYm94RW5hYmxlZCA9IGg7XG4gICAgICAgIGlmIChoKSB7XG4gICAgICAgICAgICB0aGlzLmhpZ2hsaWdodCh0aGlzLmhpZ2hsaWdodGVkKTtcbiAgICAgICAgICAgIHRoaXMuY2hlY2tCb3hFbGVtZW50LnJlbW92ZUF0dHJpYnV0ZSgnZGlzYWJsZWQnKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMubGFiZWxFbGVtZW50LnN0eWxlLmNvbG9yID0gJ2dyYXknO1xuICAgICAgICAgICAgdGhpcy5jaGVja0JveEVsZW1lbnQuc2V0QXR0cmlidXRlKCdkaXNhYmxlZCcsIHRydWUpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhY3RpdmF0ZUNhcmJvbkJhbGFuY2UoKTp2b2lkIHtcbiAgICAgICAgdmFyIHVpOkZ1bGxTdHVkeUJpb21hc3NVSSxcbiAgICAgICAgICAgIGNhbGxiYWNrOkZ1bGxTdHVkeUJpb21hc3NVSVJlc3VsdHNDYWxsYmFjaztcbiAgICAgICAgY2FsbGJhY2sgPSAoZXJyb3I6c3RyaW5nLFxuICAgICAgICAgICAgICAgIG1ldGFib2xpY01hcElEPzpudW1iZXIsXG4gICAgICAgICAgICAgICAgbWV0YWJvbGljTWFwRmlsZW5hbWU/OnN0cmluZyxcbiAgICAgICAgICAgICAgICBmaW5hbEJpb21hc3M/Om51bWJlcik6dm9pZCA9PiB7XG4gICAgICAgICAgICBpZiAoIWVycm9yKSB7XG4gICAgICAgICAgICAgICAgU3R1ZHlMaW5lcy5tZXRhYm9saWNNYXBJRCA9IG1ldGFib2xpY01hcElEO1xuICAgICAgICAgICAgICAgIFN0dWR5TGluZXMubWV0YWJvbGljTWFwTmFtZSA9IG1ldGFib2xpY01hcEZpbGVuYW1lO1xuICAgICAgICAgICAgICAgIFN0dWR5TGluZXMuYmlvbWFzc0NhbGN1bGF0aW9uID0gZmluYWxCaW9tYXNzO1xuICAgICAgICAgICAgICAgIFN0dWR5TGluZXMub25DaGFuZ2VkTWV0YWJvbGljTWFwKCk7XG4gICAgICAgICAgICAgICAgdGhpcy5jaGVja0JveEVsZW1lbnQuY2hlY2tlZCA9IHRydWU7XG4gICAgICAgICAgICAgICAgdGhpcy5kYXRhR3JpZE93bmVyT2JqZWN0LnNob3dDb2x1bW4odGhpcy5fbGluZVNwZWMuY2FyYm9uQmFsYW5jZUNvbCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgICAgIGlmICh0aGlzLmNoZWNrQm94RWxlbWVudC5jaGVja2VkKSB7XG4gICAgICAgICAgICAvLyBXZSBuZWVkIHRvIGdldCBhIGJpb21hc3MgY2FsY3VsYXRpb24gdG8gbXVsdGlwbHkgYWdhaW5zdCBPRC5cbiAgICAgICAgICAgIC8vIEhhdmUgdGhleSBzZXQgdGhpcyB1cCB5ZXQ/XG4gICAgICAgICAgICBpZiAoIVN0dWR5TGluZXMuYmlvbWFzc0NhbGN1bGF0aW9uIHx8IFN0dWR5TGluZXMuYmlvbWFzc0NhbGN1bGF0aW9uID09PSAtMSkge1xuICAgICAgICAgICAgICAgIHRoaXMuY2hlY2tCb3hFbGVtZW50LmNoZWNrZWQgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICAvLyBNdXN0IHNldHVwIHRoZSBiaW9tYXNzXG4gICAgICAgICAgICAgICAgdWkgPSBuZXcgRnVsbFN0dWR5QmlvbWFzc1VJKGNhbGxiYWNrKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdGhpcy5kYXRhR3JpZE93bmVyT2JqZWN0LnNob3dDb2x1bW4odGhpcy5fbGluZVNwZWMuY2FyYm9uQmFsYW5jZUNvbCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLmRhdGFHcmlkT3duZXJPYmplY3QuaGlkZUNvbHVtbih0aGlzLl9saW5lU3BlYy5jYXJib25CYWxhbmNlQ29sKTtcbiAgICAgICAgfVxuICAgIH1cbn1cblxuXG4vLyB1c2UgSlF1ZXJ5IHJlYWR5IGV2ZW50IHNob3J0Y3V0IHRvIGNhbGwgcHJlcGFyZUl0IHdoZW4gcGFnZSBpcyByZWFkeVxuJCgoKSA9PiBTdHVkeUxpbmVzLnByZXBhcmVJdCgpKTtcbiJdfQ==