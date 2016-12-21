// File last modified on: Wed Dec 21 2016 14:53:35  
/// <reference path="typescript-declarations.d.ts" />
/// <reference path="Utl.ts" />
/// <reference path="Dragboxes.ts" />
/// <reference path="BiomassCalculationUI.ts" />
/// <reference path="CarbonSummation.ts" />
/// <reference path="DataGrid.ts" />
/// <reference path="StudyGraphing.ts" />
/// <reference path="GraphHelperMethods.ts" />
/// <reference path="../typings/d3/d3.d.ts"/>
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
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
    // The table spec object and table object for the Lines table.
    var linesDataGridSpec;
    var linesDataGrid;
    // Called when the page loads.
    function prepareIt() {
        var _this = this;
        this.carbonBalanceData = null;
        this.carbonBalanceDisplayIsFresh = false;
        this.attachmentIDs = null;
        this.attachmentsByID = null;
        this.prevDescriptionEditElement = null;
        this.metabolicMapID = -1;
        this.metabolicMapName = null;
        this.biomassCalculation = -1;
        this.cSourceEntries = [];
        this.mTypeEntries = [];
        this.linesDataGridSpec = null;
        this.linesDataGrid = null;
        this.actionPanelIsInBottomBar = false;
        this.linesActionPanelRefreshTimer = null;
        this.positionActionsBarTimer = null;
        // put the click handler at the document level, then filter to any link inside a .disclose
        $(document).on('click', '.disclose .discloseLink', function (e) {
            $(e.target).closest('.disclose').toggleClass('discloseHide');
            return false;
        });
        $(window).on('resize', StudyLines.queuePositionActionsBar);
        $('#worklistButton').attr('title', 'select line(s) first');
        $('#exportButton').attr('title', 'select line(s) first');
        $.ajax({
            'url': 'edddata/',
            'type': 'GET',
            'error': function (xhr, status, e) {
                $('#overviewSection').prepend("<div class='noData'>Error. Please reload</div>");
                console.log(['Loading EDDData failed: ', status, ';', e].join(''));
            },
            'success': function (data) {
                EDDData = $.extend(EDDData || {}, data);
                // Instantiate a table specification for the Lines table
                _this.linesDataGridSpec = new DataGridSpecLines();
                _this.linesDataGridSpec.init();
                // Instantiate the table itself with the spec
                _this.linesDataGrid = new LineResults(_this.linesDataGridSpec);
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
    function show_int() {
        $('#show').val("hide");
        $('#lineDescription').css('display', 'block');
    }
    function show_hide() {
        $('#show').val("show");
        $('#lineDescription').css('display', 'none');
    }
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
        // Enable add new Line button
        $('#addNewLineButton').on('click', function (ev) {
            ev.preventDefault();
            ev.stopPropagation();
            StudyLines.editLines([]);
            return false;
        });
        // Enable edit lines button
        $('#editButton').on('click', function (ev) {
            var button = $(ev.target), data = button.data();
            ev.preventDefault();
            StudyLines.editLines(data.ids || []);
            return false;
        });
        // Set up jQuery modals
        $("#editLineModal").dialog({ minWidth: 500, autoOpen: false });
        $("#addAssayModal").dialog({ autoOpen: false });
        $("#exportModal").dialog({ autoOpen: false });
        $("#addAssayButton").click(function () {
            $("#addAssayModal").removeClass('off').dialog("open");
            return false;
        });
        $("#exportButton").click(function () {
            $("#exportModal").removeClass('off').dialog("open");
            return false;
        });
        $('#worklistButton').click(function () {
            $('select[name="export"]').val('worklist');
            var lineActionButton = $('button[value="line_action"]')[1];
            $(lineActionButton).click();
        });
        $('#editLineModal').on('change', '.line-meta > :input', function (ev) {
            // watch for changes to metadata values, and serialize to the meta_store field
            var form = $(ev.target).closest('form'), metaIn = form.find('[name=line-meta_store]'), meta = JSON.parse(metaIn.val() || '{}');
            form.find('.line-meta > :input').each(function (i, input) {
                var key = $(input).attr('id').match(/-(\d+)$/)[1];
                meta[key] = $(input).val();
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
        //pulling in protocol measurements AssayMeasurements
        $.each(EDDData.Protocols, function (id, protocol) {
            $.ajax({
                url: 'measurements/' + id + '/',
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
        }
        this.linesDataGridSpec.enableCarbonBalanceWidget(true);
        this.processCarbonBalanceData();
    }
    function carbonBalanceColumnRevealedCallback(spec, dataGridObj) {
        StudyLines.rebuildCarbonBalanceGraphs();
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
        var checkedBoxes = [], checkedLen;
        if (this.linesDataGrid) {
            checkedBoxes = this.linesDataGrid.getSelectedCheckboxElements();
        }
        if (_.keys(EDDData.Lines).length === 0) {
            $('.lineExplanation').css('display', 'block');
            $("#editButton, #cloneButton, #groupButton, #addAssayButton, #disableButton, #enableButton, #worklistButton, #exportButton").addClass('off');
        }
        else {
            checkedLen = checkedBoxes.length;
            $('#linesSelectedCell').empty().text(checkedLen + ' selected');
            // enable singular/plural changes
            $('#editButton').data({
                'count': checkedLen,
                'ids': checkedBoxes.map(function (box) { return box.value; })
            });
            $("#editButton, #cloneButton, #groupButton, #addAssayButton, #disableButton, #worklistButton, #exportButton").removeClass('off');
            if (checkedLen) {
                $("#editButton, #cloneButton, #groupButton, #addAssayButton, #disableButton, #enableButton").prop('disabled', false);
                $('#addNewLineButton').prop('disabled', true);
                $('#worklistButton').attr('title', 'Generate a worklist to carry out your experiment');
                $('#exportButton').attr('title', 'Export your lines in a file type of your choosing');
                if (checkedLen < 2) {
                    $('#groupButton').prop('disabled', true);
                }
            }
            else {
                $("#editButton, #cloneButton, #groupButton, #addAssayButton, #disableButton, #enableButton").prop('disabled', true);
                $('#addNewLineButton').prop('disabled', false);
                $('#worklistButton').attr('title', 'select line(s) first');
                $('#exportButton').attr('title', 'select line(s) first');
            }
            StudyLines.queuePositionActionsBar();
        }
    }
    // Start a timer to wait before calling the routine that moves the actions bar.
    // Required so we don't crater the CPU with unserved resize events.
    function queuePositionActionsBar() {
        if (this.positionActionsBarTimer) {
            clearTimeout(this.positionActionsBarTimer);
        }
        this.positionActionsBarTimer = setTimeout(StudyLines.positionActionsBar.bind(this), 50);
    }
    StudyLines.queuePositionActionsBar = queuePositionActionsBar;
    function positionActionsBar() {
        var h = $('#content').height(); // Height of the viewing region
        // Height of the entire contents.  Note that we cannot just use scrollHeight on #content,
        // because the flex layout changes the way scrollHeight is calculated.  (sh will always be >= h)
        // Also note we cannot use jQuery's "each" because of its reliance on the 'this' keyword.
        var sh = 0;
        $('#content').children().get().forEach(function (e) { sh += e.scrollHeight; });
        if (StudyLines.actionPanelIsInBottomBar) {
            if (sh < h) {
                $('#actionsBar').appendTo('#content');
                StudyLines.actionPanelIsInBottomBar = false;
            }
        }
        else {
            if (sh > h) {
                $('#actionsBar').appendTo('#bottomBar');
                StudyLines.actionPanelIsInBottomBar = true;
            }
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
        var row, type, label, input, id = 'line-meta-' + key;
        row = $('<p>').attr('id', 'row_' + id).addClass('line-meta').insertBefore(refRow);
        type = EDDData.MetaDataTypes[key];
        label = $('<label>').attr('for', 'id_' + id).text(type.name).appendTo(row);
        // bulk checkbox?
        input = $('<input type="text">').attr('id', 'id_' + id).val(value).appendTo(row);
        if (type.pre) {
            $('<span>').addClass('meta-prefix').text(type.pre).insertBefore(input);
        }
        $('<span>').addClass('meta-remove').text('Remove').insertAfter(input);
        if (type.postfix) {
            $('<span>').addClass('meta-postfix').text(type.postfix).insertAfter(input);
        }
        return row;
    }
    function editLines(ids) {
        var form = $('#editLineModal'), allMeta = {}, metaRow;
        clearLineForm();
        // Update the disclose title
        var text = 'Add New Line';
        if (ids.length > 0) {
            var text = 'Edit Line' + (ids.length > 1 ? 's' : '');
        }
        form.prop('title', text);
        if (ids.length > 1) {
            form.find('.bulk').prop('checked', false).removeClass('off');
            form.on('change.bulk', ':input', function (ev) {
                $(ev.target).siblings('label').find('.bulk').prop('checked', true);
            });
        }
        if (ids.length === 1) {
            fillLineForm(EDDData.Lines[ids[0]]);
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
        this.carbonBalanceDisplayIsFresh = true;
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
// The spec object that will be passed to DataGrid to create the Lines table
var DataGridSpecLines = (function (_super) {
    __extends(DataGridSpecLines, _super);
    function DataGridSpecLines() {
        _super.apply(this, arguments);
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
            _this.groupIDsToGroupNames[group] = EDDData.Lines[group].name;
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
                'sortBy': this.loadLineName }),
            new DataGridHeaderSpec(2, 'hLinesStrain', {
                'name': 'Strain',
                'sortBy': this.loadStrainName,
                'sortAfter': 0 }),
            new DataGridHeaderSpec(3, 'hLinesCarbon', {
                'name': 'Carbon Source(s)',
                'size': 's',
                'sortBy': this.loadCarbonSource,
                'sortAfter': 0 }),
            new DataGridHeaderSpec(4, 'hLinesLabeling', {
                'name': 'Labeling',
                'size': 's',
                'sortBy': this.loadCarbonSourceLabeling,
                'sortAfter': 0 }),
            new DataGridHeaderSpec(5, 'hLinesCarbonBalance', {
                'name': 'Carbon Balance',
                'size': 's',
                'sortBy': this.loadLineName })
        ];
        // map all metadata IDs to HeaderSpec objects
        var metaDataHeaders = this.metaDataIDsUsedInLines.map(function (id, index) {
            var mdType = EDDData.MetaDataTypes[id];
            return new DataGridHeaderSpec(6 + index, 'hLinesMeta' + id, {
                'name': mdType.name,
                'size': 's',
                'sortBy': _this.makeMetaDataSortFunction(id),
                'sortAfter': 0 });
        });
        var rightSide = [
            new DataGridHeaderSpec(6 + metaDataHeaders.length, 'hLinesExperimenter', {
                'name': 'Experimenter',
                'size': 's',
                'sortBy': this.loadExperimenterInitials,
                'sortAfter': 0 }),
            new DataGridHeaderSpec(7 + metaDataHeaders.length, 'hLinesModified', {
                'name': 'Last Modified',
                'size': 's',
                'sortBy': this.loadLineModification,
                'sortAfter': 0 })
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
                    '<a href="#" class="line-edit-link">Edit Line</a>',
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
            new DataGridColumnSpec(2, this.generateStrainNameCells),
            new DataGridColumnSpec(3, this.generateCarbonSourceCells),
            new DataGridColumnSpec(4, this.generateCarbonSourceLabelingCells),
            // The Carbon Balance cells are populated by a callback, triggered when first displayed
            new DataGridColumnSpec(5, this.generateCarbonBalanceBlankCells)
        ];
        metaDataCols = this.metaDataIDsUsedInLines.map(function (id, index) {
            return new DataGridColumnSpec(6 + index, _this.makeMetaDataCellsGeneratorFunction(id));
        });
        rightSide = [
            new DataGridColumnSpec(6 + metaDataCols.length, this.generateExperimenterInitialsCells),
            new DataGridColumnSpec(7 + metaDataCols.length, this.generateModificationDateCells)
        ];
        return leftSide.concat(metaDataCols, rightSide);
    };
    // Specification for each of the groups that the headers and data columns are organized into
    DataGridSpecLines.prototype.defineColumnGroupSpec = function () {
        var topSection = [
            new DataGridColumnGroupSpec('Line Name', { 'showInVisibilityList': false }),
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
        // A "deselect all" button
        var deselectAllWidget = new DGDeselectAllWidget(dataGrid, this);
        deselectAllWidget.displayBeforeViewMenu(true);
        widgetSet.push(deselectAllWidget);
        // A "select all" button
        var selectAllWidget = new DGSelectAllWidget(dataGrid, this);
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
        // add click handler for menu on line name cells
        $('#studyLinesTable').on('click', 'a.line-edit-link', function (ev) {
            StudyLines.editLines([$(ev.target).closest('.popupcell').find('input').val()]);
            return false;
        });
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
        _super.apply(this, arguments);
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
            $("#enableButton").removeClass('off');
            return rowIDs;
        }
        else {
            $("#enableButton").addClass('off');
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
        _super.apply(this, arguments);
    }
    DGGroupStudyReplicatesWidget.prototype.createElements = function (uniqueID) {
        var pThis = this;
        var cbID = this.dataGridSpec.tableSpec.id + 'GroupStudyReplicatesCB' + uniqueID;
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
        _super.call(this, dataGridOwnerObject, dataGridSpec, placeHolder, size, getsFocus);
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
        _super.call(this, dataGridOwnerObject, dataGridSpec);
        this.checkboxEnabled = true;
        this.highlighted = false;
        this._lineSpec = dataGridSpec;
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiU3R1ZHktTGluZXMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJTdHVkeS1MaW5lcy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxvREFBb0Q7QUFDcEQscURBQXFEO0FBQ3JELCtCQUErQjtBQUMvQixxQ0FBcUM7QUFDckMsZ0RBQWdEO0FBQ2hELDJDQUEyQztBQUMzQyxvQ0FBb0M7QUFDcEMseUNBQXlDO0FBQ3pDLDhDQUE4QztBQUM5Qyw2Q0FBNkM7Ozs7OztBQUk3QyxJQUFPLFVBQVUsQ0FtZ0JoQjtBQW5nQkQsV0FBTyxVQUFVLEVBQUMsQ0FBQztJQUNmLFlBQVksQ0FBQztJQUViLElBQUksNEJBQWdDLENBQUM7SUFDckMsSUFBSSx1QkFBMkIsQ0FBQztJQUNoQyxJQUFJLGFBQWlCLENBQUM7SUFDdEIsSUFBSSxlQUFtQixDQUFDO0lBQ3hCLElBQUksMEJBQThCLENBQUM7SUFRbkMsSUFBSSxpQkFBcUIsQ0FBQztJQUMxQixJQUFJLDJCQUFtQyxDQUFDO0lBRXhDLElBQUksY0FBa0IsQ0FBQztJQUN2QixJQUFJLFlBQWdCLENBQUM7SUFFckIsOERBQThEO0lBQzlELElBQUksaUJBQWlCLENBQUM7SUFDdEIsSUFBSSxhQUFhLENBQUM7SUFNbEIsOEJBQThCO0lBQzlCO1FBQUEsaUJBMkRDO1FBekRHLElBQUksQ0FBQyxpQkFBaUIsR0FBRyxJQUFJLENBQUM7UUFDOUIsSUFBSSxDQUFDLDJCQUEyQixHQUFHLEtBQUssQ0FBQztRQUV6QyxJQUFJLENBQUMsYUFBYSxHQUFHLElBQUksQ0FBQztRQUMxQixJQUFJLENBQUMsZUFBZSxHQUFHLElBQUksQ0FBQztRQUM1QixJQUFJLENBQUMsMEJBQTBCLEdBQUcsSUFBSSxDQUFDO1FBRXZDLElBQUksQ0FBQyxjQUFjLEdBQUcsQ0FBQyxDQUFDLENBQUM7UUFDekIsSUFBSSxDQUFDLGdCQUFnQixHQUFHLElBQUksQ0FBQztRQUM3QixJQUFJLENBQUMsa0JBQWtCLEdBQUcsQ0FBQyxDQUFDLENB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VUFBVSxDQUFDLFNBQVMsRUFBRSxFQUF0QixDQUFzQixDQUFDLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIvLyBGaWxlIGxhc3QgbW9kaWZpZWQgb246IFdlZCBEZWMgMjEgMjAxNiAxNDo1MzozNSAgXG4vLy8gPHJlZmVyZW5jZSBwYXRoPVwidHlwZXNjcmlwdC1kZWNsYXJhdGlvbnMuZC50c1wiIC8+XG4vLy8gPHJlZmVyZW5jZSBwYXRoPVwiVXRsLnRzXCIgLz5cbi8vLyA8cmVmZXJlbmNlIHBhdGg9XCJEcmFnYm94ZXMudHNcIiAvPlxuLy8vIDxyZWZlcmVuY2UgcGF0aD1cIkJpb21hc3NDYWxjdWxhdGlvblVJLnRzXCIgLz5cbi8vLyA8cmVmZXJlbmNlIHBhdGg9XCJDYXJib25TdW1tYXRpb24udHNcIiAvPlxuLy8vIDxyZWZlcmVuY2UgcGF0aD1cIkRhdGFHcmlkLnRzXCIgLz5cbi8vLyA8cmVmZXJlbmNlIHBhdGg9XCJTdHVkeUdyYXBoaW5nLnRzXCIgLz5cbi8vLyA8cmVmZXJlbmNlIHBhdGg9XCJHcmFwaEhlbHBlck1ldGhvZHMudHNcIiAvPlxuLy8vIDxyZWZlcmVuY2UgcGF0aD1cIi4uL3R5cGluZ3MvZDMvZDMuZC50c1wiLz5cblxuZGVjbGFyZSB2YXIgRURERGF0YTpFREREYXRhO1xuXG5tb2R1bGUgU3R1ZHlMaW5lcyB7XG4gICAgJ3VzZSBzdHJpY3QnO1xuXG4gICAgdmFyIGxpbmVzQWN0aW9uUGFuZWxSZWZyZXNoVGltZXI6YW55O1xuICAgIHZhciBwb3NpdGlvbkFjdGlvbnNCYXJUaW1lcjphbnk7XG4gICAgdmFyIGF0dGFjaG1lbnRJRHM6YW55O1xuICAgIHZhciBhdHRhY2htZW50c0J5SUQ6YW55O1xuICAgIHZhciBwcmV2RGVzY3JpcHRpb25FZGl0RWxlbWVudDphbnk7XG5cbiAgICAvLyBXZSBjYW4gaGF2ZSBhIHZhbGlkIG1ldGFib2xpYyBtYXAgYnV0IG5vIHZhbGlkIGJpb21hc3MgY2FsY3VsYXRpb24uXG4gICAgLy8gSWYgdGhleSB0cnkgdG8gc2hvdyBjYXJib24gYmFsYW5jZSBpbiB0aGF0IGNhc2UsIHdlJ2xsIGJyaW5nIHVwIHRoZSBVSSB0b1xuICAgIC8vIGNhbGN1bGF0ZSBiaW9tYXNzIGZvciB0aGUgc3BlY2lmaWVkIG1ldGFib2xpYyBtYXAuXG4gICAgZXhwb3J0IHZhciBtZXRhYm9saWNNYXBJRDphbnk7XG4gICAgZXhwb3J0IHZhciBtZXRhYm9saWNNYXBOYW1lOmFueTtcbiAgICBleHBvcnQgdmFyIGJpb21hc3NDYWxjdWxhdGlvbjpudW1iZXI7XG4gICAgdmFyIGNhcmJvbkJhbGFuY2VEYXRhOmFueTtcbiAgICB2YXIgY2FyYm9uQmFsYW5jZURpc3BsYXlJc0ZyZXNoOmJvb2xlYW47XG5cbiAgICB2YXIgY1NvdXJjZUVudHJpZXM6YW55O1xuICAgIHZhciBtVHlwZUVudHJpZXM6YW55O1xuXG4gICAgLy8gVGhlIHRhYmxlIHNwZWMgb2JqZWN0IGFuZCB0YWJsZSBvYmplY3QgZm9yIHRoZSBMaW5lcyB0YWJsZS5cbiAgICB2YXIgbGluZXNEYXRhR3JpZFNwZWM7XG4gICAgdmFyIGxpbmVzRGF0YUdyaWQ7XG4gICAgLy8gV2UgdXNlIG91ciBvd24gZmxhZyB0byBlbnN1cmUgd2UgZG9uJ3QgZ2V0IGludG8gYW4gaW5maW5pdGUgZXZlbnQgbG9vcCxcbiAgICAvLyBzd2l0Y2hpbmcgYmFjayBhbmQgZm9ydGggYmV0d2VlbiBwb3NpdGlvbnMgdGhhdCBtaWdodCB0cmlnZ2VyIHJlc2l6ZSBldmVudHMuXG4gICAgZXhwb3J0IHZhciBhY3Rpb25QYW5lbElzSW5Cb3R0b21CYXI7XG5cblxuICAgIC8vIENhbGxlZCB3aGVuIHRoZSBwYWdlIGxvYWRzLlxuICAgIGV4cG9ydCBmdW5jdGlvbiBwcmVwYXJlSXQoKSB7XG5cbiAgICAgICAgdGhpcy5jYXJib25CYWxhbmNlRGF0YSA9IG51bGw7XG4gICAgICAgIHRoaXMuY2FyYm9uQmFsYW5jZURpc3BsYXlJc0ZyZXNoID0gZmFsc2U7XG5cbiAgICAgICAgdGhpcy5hdHRhY2htZW50SURzID0gbnVsbDtcbiAgICAgICAgdGhpcy5hdHRhY2htZW50c0J5SUQgPSBudWxsO1xuICAgICAgICB0aGlzLnByZXZEZXNjcmlwdGlvbkVkaXRFbGVtZW50ID0gbnVsbDtcblxuICAgICAgICB0aGlzLm1ldGFib2xpY01hcElEID0gLTE7XG4gICAgICAgIHRoaXMubWV0YWJvbGljTWFwTmFtZSA9IG51bGw7XG4gICAgICAgIHRoaXMuYmlvbWFzc0NhbGN1bGF0aW9uID0gLTE7XG5cbiAgICAgICAgdGhpcy5jU291cmNlRW50cmllcyA9IFtdO1xuICAgICAgICB0aGlzLm1UeXBlRW50cmllcyA9IFtdO1xuXG4gICAgICAgIHRoaXMubGluZXNEYXRhR3JpZFNwZWMgPSBudWxsO1xuICAgICAgICB0aGlzLmxpbmVzRGF0YUdyaWQgPSBudWxsO1xuXG4gICAgICAgIHRoaXMuYWN0aW9uUGFuZWxJc0luQm90dG9tQmFyID0gZmFsc2U7XG5cbiAgICAgICAgdGhpcy5saW5lc0FjdGlvblBhbmVsUmVmcmVzaFRpbWVyID0gbnVsbDtcbiAgICAgICAgdGhpcy5wb3NpdGlvbkFjdGlvbnNCYXJUaW1lciA9IG51bGw7XG5cbiAgICAgICAgLy8gcHV0IHRoZSBjbGljayBoYW5kbGVyIGF0IHRoZSBkb2N1bWVudCBsZXZlbCwgdGhlbiBmaWx0ZXIgdG8gYW55IGxpbmsgaW5zaWRlIGEgLmRpc2Nsb3NlXG4gICAgICAgICQoZG9jdW1lbnQpLm9uKCdjbGljaycsICcuZGlzY2xvc2UgLmRpc2Nsb3NlTGluaycsIChlKSA9PiB7XG4gICAgICAgICAgICAkKGUudGFyZ2V0KS5jbG9zZXN0KCcuZGlzY2xvc2UnKS50b2dnbGVDbGFzcygnZGlzY2xvc2VIaWRlJyk7XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH0pO1xuXG4gICAgICAgICQod2luZG93KS5vbigncmVzaXplJywgU3R1ZHlMaW5lcy5xdWV1ZVBvc2l0aW9uQWN0aW9uc0Jhcik7XG5cbiAgICAgICAgJCgnI3dvcmtsaXN0QnV0dG9uJykuYXR0cigndGl0bGUnLCAnc2VsZWN0IGxpbmUocykgZmlyc3QnKTtcbiAgICAgICAgJCgnI2V4cG9ydEJ1dHRvbicpLmF0dHIoJ3RpdGxlJywgJ3NlbGVjdCBsaW5lKHMpIGZpcnN0Jyk7XG5cblxuICAgICAgICAkLmFqYXgoe1xuICAgICAgICAgICAgJ3VybCc6ICdlZGRkYXRhLycsXG4gICAgICAgICAgICAndHlwZSc6ICdHRVQnLFxuICAgICAgICAgICAgJ2Vycm9yJzogKHhociwgc3RhdHVzLCBlKSA9PiB7XG4gICAgICAgICAgICAgICAgJCgnI292ZXJ2aWV3U2VjdGlvbicpLnByZXBlbmQoXCI8ZGl2IGNsYXNzPSdub0RhdGEnPkVycm9yLiBQbGVhc2UgcmVsb2FkPC9kaXY+XCIpO1xuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKFsnTG9hZGluZyBFREREYXRhIGZhaWxlZDogJywgc3RhdHVzLCAnOycsIGVdLmpvaW4oJycpKTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAnc3VjY2Vzcyc6IChkYXRhKSA9PiB7XG4gICAgICAgICAgICAgICAgRURERGF0YSA9ICQuZXh0ZW5kKEVERERhdGEgfHwge30sIGRhdGEpO1xuICAgICAgICAgICAgICAgIC8vIEluc3RhbnRpYXRlIGEgdGFibGUgc3BlY2lmaWNhdGlvbiBmb3IgdGhlIExpbmVzIHRhYmxlXG4gICAgICAgICAgICAgICAgdGhpcy5saW5lc0RhdGFHcmlkU3BlYyA9IG5ldyBEYXRhR3JpZFNwZWNMaW5lcygpO1xuICAgICAgICAgICAgICAgIHRoaXMubGluZXNEYXRhR3JpZFNwZWMuaW5pdCgpO1xuICAgICAgICAgICAgICAgIC8vIEluc3RhbnRpYXRlIHRoZSB0YWJsZSBpdHNlbGYgd2l0aCB0aGUgc3BlY1xuICAgICAgICAgICAgICAgIHRoaXMubGluZXNEYXRhR3JpZCA9IG5ldyBMaW5lUmVzdWx0cyh0aGlzLmxpbmVzRGF0YUdyaWRTcGVjKTtcblxuICAgICAgICAgICAgICAgIC8vIFNob3cgcG9zc2libGUgbmV4dCBzdGVwcyBkaXYgaWYgbmVlZGVkXG4gICAgICAgICAgICAgICAgaWYgKF8ua2V5cyhFREREYXRhLkxpbmVzKS5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgICAgICAgICAgJCgnLm5vTGluZXMnKS5jc3MoJ2Rpc3BsYXknLCAnYmxvY2snKTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAkKCcubm9MaW5lcycpLmNzcygnZGlzcGxheScsICdub25lJyk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9XG5cblxuICAgIGZ1bmN0aW9uIHNob3dfaW50KCkge1xuICAgICAgICAkKCcjc2hvdycpLnZhbChcImhpZGVcIik7XG4gICAgICAgICQoJyNsaW5lRGVzY3JpcHRpb24nKS5jc3MoJ2Rpc3BsYXknLCAnYmxvY2snKTtcbiAgICB9XG5cblxuICAgIGZ1bmN0aW9uIHNob3dfaGlkZSgpIHtcbiAgICAgICAgJCgnI3Nob3cnKS52YWwoXCJzaG93XCIpO1xuICAgICAgICAkKCcjbGluZURlc2NyaXB0aW9uJykuY3NzKCdkaXNwbGF5JywgJ25vbmUnKTtcbiAgICB9XG5cblxuICAgIGV4cG9ydCBmdW5jdGlvbiBwcm9jZXNzQ2FyYm9uQmFsYW5jZURhdGEoKSB7XG4gICAgICAgIC8vIFByZXBhcmUgdGhlIGNhcmJvbiBiYWxhbmNlIGdyYXBoXG4gICAgICAgIHRoaXMuY2FyYm9uQmFsYW5jZURhdGEgPSBuZXcgQ2FyYm9uQmFsYW5jZS5EaXNwbGF5KCk7XG4gICAgICAgIHZhciBoaWdobGlnaHRDYXJib25CYWxhbmNlV2lkZ2V0ID0gZmFsc2U7XG4gICAgICAgIGlmICggdGhpcy5iaW9tYXNzQ2FsY3VsYXRpb24gPiAtMSApIHtcbiAgICAgICAgICAgIHRoaXMuY2FyYm9uQmFsYW5jZURhdGEuY2FsY3VsYXRlQ2FyYm9uQmFsYW5jZXModGhpcy5tZXRhYm9saWNNYXBJRCxcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5iaW9tYXNzQ2FsY3VsYXRpb24pO1xuICAgICAgICAgICAgLy8gSGlnaGxpZ2h0IHRoZSBcIlNob3cgQ2FyYm9uIEJhbGFuY2VcIiBjaGVja2JveCBpbiByZWQgaWYgdGhlcmUgYXJlIENCIGlzc3Vlcy5cbiAgICAgICAgICAgIGlmICh0aGlzLmNhcmJvbkJhbGFuY2VEYXRhLmdldE51bWJlck9mSW1iYWxhbmNlcygpID4gMCkge1xuICAgICAgICAgICAgICAgIGhpZ2hsaWdodENhcmJvbkJhbGFuY2VXaWRnZXQgPSB0cnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgLy8gSGlnaGxpZ2h0IHRoZSBjYXJib24gYmFsYW5jZSBpbiByZWQgdG8gaW5kaWNhdGUgdGhhdCB3ZSBjYW4ndCBjYWxjdWxhdGVcbiAgICAgICAgICAgIC8vIGNhcmJvbiBiYWxhbmNlcyB5ZXQuIFdoZW4gdGhleSBjbGljayB0aGUgY2hlY2tib3gsIHdlJ2xsIGdldCB0aGVtIHRvXG4gICAgICAgICAgICAvLyBzcGVjaWZ5IHdoaWNoIFNCTUwgZmlsZSB0byB1c2UgZm9yIGJpb21hc3MuXG4gICAgICAgICAgICBoaWdobGlnaHRDYXJib25CYWxhbmNlV2lkZ2V0ID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLmxpbmVzRGF0YUdyaWRTcGVjLmhpZ2hsaWdodENhcmJvbkJhbGFuY2VXaWRnZXQoaGlnaGxpZ2h0Q2FyYm9uQmFsYW5jZVdpZGdldCk7XG4gICAgfVxuXG5cbiAgICAvLyBDYWxsZWQgYnkgRGF0YUdyaWQgYWZ0ZXIgdGhlIExpbmVzIHRhYmxlIGlzIHJlbmRlcmVkXG4gICAgZXhwb3J0IGZ1bmN0aW9uIHByZXBhcmVBZnRlckxpbmVzVGFibGUoKSB7XG5cbiAgICAgICAgLy8gRW5hYmxlIGFkZCBuZXcgTGluZSBidXR0b25cbiAgICAgICAgJCgnI2FkZE5ld0xpbmVCdXR0b24nKS5vbignY2xpY2snLCAoZXY6SlF1ZXJ5TW91c2VFdmVudE9iamVjdCk6Ym9vbGVhbiA9PiB7XG4gICAgICAgICAgICBldi5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICAgICAgZXYuc3RvcFByb3BhZ2F0aW9uKCk7XG4gICAgICAgICAgICBTdHVkeUxpbmVzLmVkaXRMaW5lcyhbXSk7XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIEVuYWJsZSBlZGl0IGxpbmVzIGJ1dHRvblxuICAgICAgICAkKCcjZWRpdEJ1dHRvbicpLm9uKCdjbGljaycsIChldjpKUXVlcnlNb3VzZUV2ZW50T2JqZWN0KTpib29sZWFuID0+IHtcbiAgICAgICAgICAgIHZhciBidXR0b24gPSAkKGV2LnRhcmdldCksIGRhdGEgPSBidXR0b24uZGF0YSgpO1xuICAgICAgICAgICAgZXYucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgICAgIFN0dWR5TGluZXMuZWRpdExpbmVzKGRhdGEuaWRzIHx8IFtdKTtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gU2V0IHVwIGpRdWVyeSBtb2RhbHNcbiAgICAgICAgJChcIiNlZGl0TGluZU1vZGFsXCIpLmRpYWxvZyh7IG1pbldpZHRoOiA1MDAsIGF1dG9PcGVuOiBmYWxzZSB9KTtcbiAgICAgICAgJChcIiNhZGRBc3NheU1vZGFsXCIpLmRpYWxvZyh7IGF1dG9PcGVuOiBmYWxzZSB9KTtcbiAgICAgICAgJChcIiNleHBvcnRNb2RhbFwiKS5kaWFsb2coeyBhdXRvT3BlbjogZmFsc2UgfSk7XG5cbiAgICAgICAgJChcIiNhZGRBc3NheUJ1dHRvblwiKS5jbGljayhmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICQoXCIjYWRkQXNzYXlNb2RhbFwiKS5yZW1vdmVDbGFzcygnb2ZmJykuZGlhbG9nKCBcIm9wZW5cIiApO1xuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9KTtcblxuICAgICAgICAkKFwiI2V4cG9ydEJ1dHRvblwiKS5jbGljayhmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICQoXCIjZXhwb3J0TW9kYWxcIikucmVtb3ZlQ2xhc3MoJ29mZicpLmRpYWxvZyggXCJvcGVuXCIgKTtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgJCgnI3dvcmtsaXN0QnV0dG9uJykuY2xpY2soZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgJCgnc2VsZWN0W25hbWU9XCJleHBvcnRcIl0nKS52YWwoJ3dvcmtsaXN0Jyk7XG4gICAgICAgICAgICB2YXIgbGluZUFjdGlvbkJ1dHRvbiA9ICQoJ2J1dHRvblt2YWx1ZT1cImxpbmVfYWN0aW9uXCJdJylbMV07XG4gICAgICAgICAgICAkKGxpbmVBY3Rpb25CdXR0b24pLmNsaWNrKCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgICQoJyNlZGl0TGluZU1vZGFsJykub24oJ2NoYW5nZScsICcubGluZS1tZXRhID4gOmlucHV0JywgKGV2KSA9PiB7XG4gICAgICAgICAgICAvLyB3YXRjaCBmb3IgY2hhbmdlcyB0byBtZXRhZGF0YSB2YWx1ZXMsIGFuZCBzZXJpYWxpemUgdG8gdGhlIG1ldGFfc3RvcmUgZmllbGRcbiAgICAgICAgICAgIHZhciBmb3JtID0gJChldi50YXJnZXQpLmNsb3Nlc3QoJ2Zvcm0nKSxcbiAgICAgICAgICAgICAgICBtZXRhSW4gPSBmb3JtLmZpbmQoJ1tuYW1lPWxpbmUtbWV0YV9zdG9yZV0nKSxcbiAgICAgICAgICAgICAgICBtZXRhID0gSlNPTi5wYXJzZShtZXRhSW4udmFsKCkgfHwgJ3t9Jyk7XG4gICAgICAgICAgICBmb3JtLmZpbmQoJy5saW5lLW1ldGEgPiA6aW5wdXQnKS5lYWNoKChpLCBpbnB1dCkgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBrZXkgPSAkKGlucHV0KS5hdHRyKCdpZCcpLm1hdGNoKC8tKFxcZCspJC8pWzFdO1xuICAgICAgICAgICAgICAgIG1ldGFba2V5XSA9ICQoaW5wdXQpLnZhbCgpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICBtZXRhSW4udmFsKEpTT04uc3RyaW5naWZ5KG1ldGEpKTtcbiAgICAgICAgfSkub24oJ2NsaWNrJywgJy5saW5lLW1ldGEtYWRkJywgKGV2OkpRdWVyeU1vdXNlRXZlbnRPYmplY3QpID0+IHtcbiAgICAgICAgICAgIC8vIG1ha2UgbWV0YWRhdGEgQWRkIFZhbHVlIGJ1dHRvbiB3b3JrIGFuZCBub3Qgc3VibWl0IHRoZSBmb3JtXG4gICAgICAgICAgICB2YXIgYWRkcm93ID0gJChldi50YXJnZXQpLmNsb3Nlc3QoJy5saW5lLWVkaXQtbWV0YScpLCB0eXBlLCB2YWx1ZTtcbiAgICAgICAgICAgIHR5cGUgPSBhZGRyb3cuZmluZCgnLmxpbmUtbWV0YS10eXBlJykudmFsKCk7XG4gICAgICAgICAgICB2YWx1ZSA9IGFkZHJvdy5maW5kKCcubGluZS1tZXRhLXZhbHVlJykudmFsKCk7XG4gICAgICAgICAgICAvLyBjbGVhciBvdXQgaW5wdXRzIHNvIGFub3RoZXIgdmFsdWUgY2FuIGJlIGVudGVyZWRcbiAgICAgICAgICAgIGFkZHJvdy5maW5kKCc6aW5wdXQnKS5ub3QoJzpjaGVja2JveCwgOnJhZGlvJykudmFsKCcnKTtcbiAgICAgICAgICAgIGFkZHJvdy5maW5kKCc6Y2hlY2tib3gsIDpyYWRpbycpLnByb3AoJ2NoZWNrZWQnLCBmYWxzZSk7XG4gICAgICAgICAgICBpZiAoRURERGF0YS5NZXRhRGF0YVR5cGVzW3R5cGVdKSB7XG4gICAgICAgICAgICAgICAgaW5zZXJ0TGluZU1ldGFkYXRhUm93KGFkZHJvdywgdHlwZSwgdmFsdWUpLmZpbmQoJzppbnB1dCcpLnRyaWdnZXIoJ2NoYW5nZScpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9KS5vbignY2xpY2snLCAnLm1ldGEtcmVtb3ZlJywgKGV2OkpRdWVyeU1vdXNlRXZlbnRPYmplY3QpID0+IHtcbiAgICAgICAgICAgIC8vIHJlbW92ZSBtZXRhZGF0YSByb3cgYW5kIGluc2VydCBudWxsIHZhbHVlIGZvciB0aGUgbWV0YWRhdGEga2V5XG4gICAgICAgICAgICB2YXIgZm9ybSA9ICQoZXYudGFyZ2V0KS5jbG9zZXN0KCdmb3JtJyksXG4gICAgICAgICAgICAgICAgbWV0YVJvdyA9ICQoZXYudGFyZ2V0KS5jbG9zZXN0KCcubGluZS1tZXRhJyksXG4gICAgICAgICAgICAgICAgbWV0YUluID0gZm9ybS5maW5kKCdbbmFtZT1saW5lLW1ldGFfc3RvcmVdJyksXG4gICAgICAgICAgICAgICAgbWV0YSA9IEpTT04ucGFyc2UobWV0YUluLnZhbCgpIHx8ICd7fScpLFxuICAgICAgICAgICAgICAgIGtleSA9IG1ldGFSb3cuYXR0cignaWQnKS5tYXRjaCgvLShcXGQrKSQvKVsxXTtcbiAgICAgICAgICAgIG1ldGFba2V5XSA9IG51bGw7XG4gICAgICAgICAgICBtZXRhSW4udmFsKEpTT04uc3RyaW5naWZ5KG1ldGEpKTtcbiAgICAgICAgICAgIG1ldGFSb3cucmVtb3ZlKCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vcHVsbGluZyBpbiBwcm90b2NvbCBtZWFzdXJlbWVudHMgQXNzYXlNZWFzdXJlbWVudHNcbiAgICAgICAgJC5lYWNoKEVERERhdGEuUHJvdG9jb2xzLCAoaWQsIHByb3RvY29sKSA9PiB7XG4gICAgICAgICAgICAkLmFqYXgoe1xuICAgICAgICAgICAgICAgIHVybDogJ21lYXN1cmVtZW50cy8nICsgaWQgKyAnLycsXG4gICAgICAgICAgICAgICAgdHlwZTogJ0dFVCcsXG4gICAgICAgICAgICAgICAgZGF0YVR5cGU6ICdqc29uJyxcbiAgICAgICAgICAgICAgICBlcnJvcjogKHhociwgc3RhdHVzKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKCdGYWlsZWQgdG8gZmV0Y2ggbWVhc3VyZW1lbnQgZGF0YSBvbiAnICsgcHJvdG9jb2wubmFtZSArICchJyk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKHN0YXR1cyk7XG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBzdWNjZXNzOiBwcm9jZXNzTWVhc3VyZW1lbnREYXRhLmJpbmQodGhpcywgcHJvdG9jb2wpXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG5cbiAgICBmdW5jdGlvbiBwcm9jZXNzTWVhc3VyZW1lbnREYXRhKHByb3RvY29sLCBkYXRhKSB7XG4gICAgICAgIHZhciBhc3NheVNlZW4gPSB7fSxcbiAgICAgICAgICAgIHByb3RvY29sVG9Bc3NheSA9IHt9LFxuICAgICAgICAgICAgY291bnRfdG90YWw6bnVtYmVyID0gMCxcbiAgICAgICAgICAgIGNvdW50X3JlYzpudW1iZXIgPSAwO1xuICAgICAgICBFREREYXRhLkFzc2F5TWVhc3VyZW1lbnRzID0gRURERGF0YS5Bc3NheU1lYXN1cmVtZW50cyB8fCB7fTtcbiAgICAgICAgRURERGF0YS5NZWFzdXJlbWVudFR5cGVzID0gJC5leHRlbmQoRURERGF0YS5NZWFzdXJlbWVudFR5cGVzIHx8IHt9LCBkYXRhLnR5cGVzKTtcblxuICAgICAgICAvLyBhdHRhY2ggbWVhc3VyZW1lbnQgY291bnRzIHRvIGVhY2ggYXNzYXlcbiAgICAgICAgJC5lYWNoKGRhdGEudG90YWxfbWVhc3VyZXMsIChhc3NheUlkOnN0cmluZywgY291bnQ6bnVtYmVyKTp2b2lkID0+IHtcbiAgICAgICAgICAgIHZhciBhc3NheSA9IEVERERhdGEuQXNzYXlzW2Fzc2F5SWRdO1xuICAgICAgICAgICAgaWYgKGFzc2F5KSB7XG4gICAgICAgICAgICAgICAgYXNzYXkuY291bnQgPSBjb3VudDtcbiAgICAgICAgICAgICAgICBjb3VudF90b3RhbCArPSBjb3VudDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIC8vIGxvb3Agb3ZlciBhbGwgZG93bmxvYWRlZCBtZWFzdXJlbWVudHNcbiAgICAgICAgJC5lYWNoKGRhdGEubWVhc3VyZXMgfHwge30sIChpbmRleCwgbWVhc3VyZW1lbnQpID0+IHtcbiAgICAgICAgICAgIHZhciBhc3NheSA9IEVERERhdGEuQXNzYXlzW21lYXN1cmVtZW50LmFzc2F5XSwgbGluZSwgbXR5cGU7XG4gICAgICAgICAgICArK2NvdW50X3JlYztcbiAgICAgICAgICAgIGlmICghYXNzYXkgfHwgIWFzc2F5LmFjdGl2ZSB8fCBhc3NheS5jb3VudCA9PT0gdW5kZWZpbmVkKSByZXR1cm47XG4gICAgICAgICAgICBsaW5lID0gRURERGF0YS5MaW5lc1thc3NheS5saWRdO1xuICAgICAgICAgICAgaWYgKCFsaW5lIHx8ICFsaW5lLmFjdGl2ZSkgcmV0dXJuO1xuICAgICAgICAgICAgLy8gYXR0YWNoIHZhbHVlc1xuICAgICAgICAgICAgJC5leHRlbmQobWVhc3VyZW1lbnQsIHsgJ3ZhbHVlcyc6IGRhdGEuZGF0YVttZWFzdXJlbWVudC5pZF0gfHwgW10gfSk7XG4gICAgICAgICAgICAvLyBzdG9yZSB0aGUgbWVhc3VyZW1lbnRzXG4gICAgICAgICAgICBFREREYXRhLkFzc2F5TWVhc3VyZW1lbnRzW21lYXN1cmVtZW50LmlkXSA9IG1lYXN1cmVtZW50O1xuICAgICAgICAgICAgLy8gdHJhY2sgd2hpY2ggYXNzYXlzIHJlY2VpdmVkIHVwZGF0ZWQgbWVhc3VyZW1lbnRzXG4gICAgICAgICAgICBhc3NheVNlZW5bYXNzYXkuaWRdID0gdHJ1ZTtcbiAgICAgICAgICAgIHByb3RvY29sVG9Bc3NheVthc3NheS5waWRdID0gcHJvdG9jb2xUb0Fzc2F5W2Fzc2F5LnBpZF0gfHwge307XG4gICAgICAgICAgICBwcm90b2NvbFRvQXNzYXlbYXNzYXkucGlkXVthc3NheS5pZF0gPSB0cnVlO1xuICAgICAgICAgICAgLy8gaGFuZGxlIG1lYXN1cmVtZW50IGRhdGEgYmFzZWQgb24gdHlwZVxuICAgICAgICAgICAgbXR5cGUgPSBkYXRhLnR5cGVzW21lYXN1cmVtZW50LnR5cGVdIHx8IHt9O1xuICAgICAgICAgICAgKGFzc2F5Lm1lYXN1cmVzID0gYXNzYXkubWVhc3VyZXMgfHwgW10pLnB1c2gobWVhc3VyZW1lbnQuaWQpO1xuICAgICAgICAgICAgaWYgKG10eXBlLmZhbWlseSA9PT0gJ20nKSB7IC8vIG1lYXN1cmVtZW50IGlzIG9mIG1ldGFib2xpdGVcbiAgICAgICAgICAgICAgICAoYXNzYXkubWV0YWJvbGl0ZXMgPSBhc3NheS5tZXRhYm9saXRlcyB8fCBbXSkucHVzaChtZWFzdXJlbWVudC5pZCk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKG10eXBlLmZhbWlseSA9PT0gJ3AnKSB7IC8vIG1lYXN1cmVtZW50IGlzIG9mIHByb3RlaW5cbiAgICAgICAgICAgICAgICAoYXNzYXkucHJvdGVpbnMgPSBhc3NheS5wcm90ZWlucyB8fCBbXSkucHVzaChtZWFzdXJlbWVudC5pZCk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKG10eXBlLmZhbWlseSA9PT0gJ2cnKSB7IC8vIG1lYXN1cmVtZW50IGlzIG9mIGdlbmUgLyB0cmFuc2NyaXB0XG4gICAgICAgICAgICAgICAgKGFzc2F5LnRyYW5zY3JpcHRpb25zID0gYXNzYXkudHJhbnNjcmlwdGlvbnMgfHwgW10pLnB1c2gobWVhc3VyZW1lbnQuaWQpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAvLyB0aHJvdyBldmVyeXRoaW5nIGVsc2UgaW4gYSBnZW5lcmFsIGFyZWFcbiAgICAgICAgICAgICAgICAoYXNzYXkuZ2VuZXJhbCA9IGFzc2F5LmdlbmVyYWwgfHwgW10pLnB1c2gobWVhc3VyZW1lbnQuaWQpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcblxuXG4gICAgICAgIGlmIChjb3VudF9yZWMgPCBjb3VudF90b3RhbCkge1xuICAgICAgICAgICAgLy8gVE9ETyBub3QgYWxsIG1lYXN1cmVtZW50cyBkb3dubG9hZGVkOyBkaXNwbGF5IGEgbWVzc2FnZSBpbmRpY2F0aW5nIHRoaXNcbiAgICAgICAgICAgIC8vIGV4cGxhaW4gZG93bmxvYWRpbmcgaW5kaXZpZHVhbCBhc3NheSBtZWFzdXJlbWVudHMgdG9vXG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLmxpbmVzRGF0YUdyaWRTcGVjLmVuYWJsZUNhcmJvbkJhbGFuY2VXaWRnZXQodHJ1ZSk7XG4gICAgICAgIHRoaXMucHJvY2Vzc0NhcmJvbkJhbGFuY2VEYXRhKCk7XG4gICAgfVxuXG5cbiAgICBleHBvcnQgZnVuY3Rpb24gY2FyYm9uQmFsYW5jZUNvbHVtblJldmVhbGVkQ2FsbGJhY2soc3BlYzpEYXRhR3JpZFNwZWNMaW5lcywgZGF0YUdyaWRPYmo6RGF0YUdyaWQpIHtcbiAgICAgICAgU3R1ZHlMaW5lcy5yZWJ1aWxkQ2FyYm9uQmFsYW5jZUdyYXBocygpO1xuICAgIH1cblxuXG4gICAgLy8gU3RhcnQgYSB0aW1lciB0byB3YWl0IGJlZm9yZSBjYWxsaW5nIHRoZSByb3V0aW5lIHRoYXQgc2hvd3MgdGhlIGFjdGlvbnMgcGFuZWwuXG4gICAgZXhwb3J0IGZ1bmN0aW9uIHF1ZXVlTGluZXNBY3Rpb25QYW5lbFNob3coKSB7XG4gICAgICAgIGlmICh0aGlzLmxpbmVzQWN0aW9uUGFuZWxSZWZyZXNoVGltZXIpIHtcbiAgICAgICAgICAgIGNsZWFyVGltZW91dCAodGhpcy5saW5lc0FjdGlvblBhbmVsUmVmcmVzaFRpbWVyKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLmxpbmVzQWN0aW9uUGFuZWxSZWZyZXNoVGltZXIgPSBzZXRUaW1lb3V0KGxpbmVzQWN0aW9uUGFuZWxTaG93LmJpbmQodGhpcyksIDE1MCk7XG4gICAgfVxuXG5cbiAgICBmdW5jdGlvbiBsaW5lc0FjdGlvblBhbmVsU2hvdygpIHtcbiAgICAgICAgLy8gRmlndXJlIG91dCBob3cgbWFueSBsaW5lcyBhcmUgc2VsZWN0ZWQuXG4gICAgICAgIHZhciBjaGVja2VkQm94ZXMgPSBbXSwgY2hlY2tlZExlbjtcbiAgICAgICAgaWYgKHRoaXMubGluZXNEYXRhR3JpZCkge1xuICAgICAgICAgICAgY2hlY2tlZEJveGVzID0gdGhpcy5saW5lc0RhdGFHcmlkLmdldFNlbGVjdGVkQ2hlY2tib3hFbGVtZW50cygpO1xuICAgICAgICB9XG4gICAgICAgIGlmIChfLmtleXMoRURERGF0YS5MaW5lcykubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICAkKCcubGluZUV4cGxhbmF0aW9uJykuY3NzKCdkaXNwbGF5JywgJ2Jsb2NrJyk7XG4gICAgICAgICAgICAkKFwiI2VkaXRCdXR0b24sICNjbG9uZUJ1dHRvbiwgI2dyb3VwQnV0dG9uLCAjYWRkQXNzYXlCdXR0b24sICNkaXNhYmxlQnV0dG9uLCAjZW5hYmxlQnV0dG9uLCAjd29ya2xpc3RCdXR0b24sICNleHBvcnRCdXR0b25cIikuYWRkQ2xhc3MoJ29mZicpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY2hlY2tlZExlbiA9IGNoZWNrZWRCb3hlcy5sZW5ndGg7XG4gICAgICAgICAgICAkKCcjbGluZXNTZWxlY3RlZENlbGwnKS5lbXB0eSgpLnRleHQoY2hlY2tlZExlbiArICcgc2VsZWN0ZWQnKTtcbiAgICAgICAgICAgIC8vIGVuYWJsZSBzaW5ndWxhci9wbHVyYWwgY2hhbmdlc1xuICAgICAgICAgICAgJCgnI2VkaXRCdXR0b24nKS5kYXRhKHtcbiAgICAgICAgICAgICAgICAnY291bnQnOiBjaGVja2VkTGVuLFxuICAgICAgICAgICAgICAgICdpZHMnOiBjaGVja2VkQm94ZXMubWFwKChib3g6SFRNTElucHV0RWxlbWVudCkgPT4gYm94LnZhbHVlKVxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAkKFwiI2VkaXRCdXR0b24sICNjbG9uZUJ1dHRvbiwgI2dyb3VwQnV0dG9uLCAjYWRkQXNzYXlCdXR0b24sICNkaXNhYmxlQnV0dG9uLCAjd29ya2xpc3RCdXR0b24sICNleHBvcnRCdXR0b25cIikucmVtb3ZlQ2xhc3MoJ29mZicpO1xuICAgICAgICAgICAgaWYgKGNoZWNrZWRMZW4pIHtcbiAgICAgICAgICAgICAgICAkKFwiI2VkaXRCdXR0b24sICNjbG9uZUJ1dHRvbiwgI2dyb3VwQnV0dG9uLCAjYWRkQXNzYXlCdXR0b24sICNkaXNhYmxlQnV0dG9uLCAjZW5hYmxlQnV0dG9uXCIpLnByb3AoJ2Rpc2FibGVkJyxmYWxzZSk7XG4gICAgICAgICAgICAgICAgJCgnI2FkZE5ld0xpbmVCdXR0b24nKS5wcm9wKCdkaXNhYmxlZCcsIHRydWUpO1xuICAgICAgICAgICAgICAgICQoJyN3b3JrbGlzdEJ1dHRvbicpLmF0dHIoJ3RpdGxlJywgJ0dlbmVyYXRlIGEgd29ya2xpc3QgdG8gY2Fycnkgb3V0IHlvdXIgZXhwZXJpbWVudCcpO1xuICAgICAgICAgICAgICAgICQoJyNleHBvcnRCdXR0b24nKS5hdHRyKCd0aXRsZScsICdFeHBvcnQgeW91ciBsaW5lcyBpbiBhIGZpbGUgdHlwZSBvZiB5b3VyIGNob29zaW5nJyk7XG4gICAgICAgICAgICAgICAgaWYgKGNoZWNrZWRMZW4gPCAyKSB7XG4gICAgICAgICAgICAgICAgICAgICQoJyNncm91cEJ1dHRvbicpLnByb3AoJ2Rpc2FibGVkJywgdHJ1ZSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAkKFwiI2VkaXRCdXR0b24sICNjbG9uZUJ1dHRvbiwgI2dyb3VwQnV0dG9uLCAjYWRkQXNzYXlCdXR0b24sICNkaXNhYmxlQnV0dG9uLCAjZW5hYmxlQnV0dG9uXCIpLnByb3AoJ2Rpc2FibGVkJyx0cnVlKTtcbiAgICAgICAgICAgICAgICAkKCcjYWRkTmV3TGluZUJ1dHRvbicpLnByb3AoJ2Rpc2FibGVkJywgZmFsc2UpO1xuICAgICAgICAgICAgICAgICQoJyN3b3JrbGlzdEJ1dHRvbicpLmF0dHIoJ3RpdGxlJywgJ3NlbGVjdCBsaW5lKHMpIGZpcnN0Jyk7XG4gICAgICAgICAgICAgICAgJCgnI2V4cG9ydEJ1dHRvbicpLmF0dHIoJ3RpdGxlJywgJ3NlbGVjdCBsaW5lKHMpIGZpcnN0Jyk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBTdHVkeUxpbmVzLnF1ZXVlUG9zaXRpb25BY3Rpb25zQmFyKCk7XG4gICAgICAgIH1cbiAgICB9XG5cblxuICAgIC8vIFN0YXJ0IGEgdGltZXIgdG8gd2FpdCBiZWZvcmUgY2FsbGluZyB0aGUgcm91dGluZSB0aGF0IG1vdmVzIHRoZSBhY3Rpb25zIGJhci5cbiAgICAvLyBSZXF1aXJlZCBzbyB3ZSBkb24ndCBjcmF0ZXIgdGhlIENQVSB3aXRoIHVuc2VydmVkIHJlc2l6ZSBldmVudHMuXG4gICAgZXhwb3J0IGZ1bmN0aW9uIHF1ZXVlUG9zaXRpb25BY3Rpb25zQmFyKCkge1xuICAgICAgICBpZiAodGhpcy5wb3NpdGlvbkFjdGlvbnNCYXJUaW1lcikge1xuICAgICAgICAgICAgY2xlYXJUaW1lb3V0ICh0aGlzLnBvc2l0aW9uQWN0aW9uc0JhclRpbWVyKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLnBvc2l0aW9uQWN0aW9uc0JhclRpbWVyID0gc2V0VGltZW91dChTdHVkeUxpbmVzLnBvc2l0aW9uQWN0aW9uc0Jhci5iaW5kKHRoaXMpLCA1MCk7XG4gICAgfVxuXG5cbiAgICBleHBvcnQgZnVuY3Rpb24gcG9zaXRpb25BY3Rpb25zQmFyKCkge1xuXG4gICAgICAgIHZhciBoID0gJCgnI2NvbnRlbnQnKS5oZWlnaHQoKTsgICAgICAgICAgICAvLyBIZWlnaHQgb2YgdGhlIHZpZXdpbmcgcmVnaW9uXG5cbiAgICAgICAgLy8gSGVpZ2h0IG9mIHRoZSBlbnRpcmUgY29udGVudHMuICBOb3RlIHRoYXQgd2UgY2Fubm90IGp1c3QgdXNlIHNjcm9sbEhlaWdodCBvbiAjY29udGVudCxcbiAgICAgICAgLy8gYmVjYXVzZSB0aGUgZmxleCBsYXlvdXQgY2hhbmdlcyB0aGUgd2F5IHNjcm9sbEhlaWdodCBpcyBjYWxjdWxhdGVkLiAgKHNoIHdpbGwgYWx3YXlzIGJlID49IGgpXG4gICAgICAgIC8vIEFsc28gbm90ZSB3ZSBjYW5ub3QgdXNlIGpRdWVyeSdzIFwiZWFjaFwiIGJlY2F1c2Ugb2YgaXRzIHJlbGlhbmNlIG9uIHRoZSAndGhpcycga2V5d29yZC5cbiAgICAgICAgdmFyIHNoID0gMDtcbiAgICAgICAgJCgnI2NvbnRlbnQnKS5jaGlsZHJlbigpLmdldCgpLmZvckVhY2goKGU6SFRNTEVsZW1lbnQpOnZvaWQgPT4geyBzaCArPSBlLnNjcm9sbEhlaWdodDsgfSk7XG5cbiAgICAgICAgaWYgKFN0dWR5TGluZXMuYWN0aW9uUGFuZWxJc0luQm90dG9tQmFyKSB7XG4gICAgICAgICAgICBpZiAoc2ggPCBoKSB7XG4gICAgICAgICAgICAgICAgJCgnI2FjdGlvbnNCYXInKS5hcHBlbmRUbygnI2NvbnRlbnQnKTtcbiAgICAgICAgICAgICAgICBTdHVkeUxpbmVzLmFjdGlvblBhbmVsSXNJbkJvdHRvbUJhciA9IGZhbHNlO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgaWYgKHNoID4gaCkge1xuICAgICAgICAgICAgICAgICQoJyNhY3Rpb25zQmFyJykuYXBwZW5kVG8oJyNib3R0b21CYXInKTtcbiAgICAgICAgICAgICAgICBTdHVkeUxpbmVzLmFjdGlvblBhbmVsSXNJbkJvdHRvbUJhciA9IHRydWU7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBjbGVhckxpbmVGb3JtKCkge1xuICAgICAgICB2YXIgZm9ybSA9ICQoJyNlZGl0TGluZU1vZGFsJyk7XG4gICAgICAgIGZvcm0uZmluZCgnLmxpbmUtbWV0YScpLnJlbW92ZSgpO1xuICAgICAgICBmb3JtLmZpbmQoJ1tuYW1lXj1saW5lLV0nKS5ub3QoJzpjaGVja2JveCwgOnJhZGlvJykudmFsKCcnKTtcbiAgICAgICAgZm9ybS5maW5kKCdbbmFtZV49bGluZS1dJykuZmlsdGVyKCc6Y2hlY2tib3gsIDpyYWRpbycpLnByb3AoJ2NoZWNrZWQnLCBmYWxzZSk7XG4gICAgICAgIGZvcm0uZmluZCgnLmVycm9ybGlzdCcpLnJlbW92ZSgpO1xuICAgICAgICBmb3JtLmZpbmQoJy5jYW5jZWwtbGluaycpLnJlbW92ZSgpO1xuICAgICAgICBmb3JtLmZpbmQoJy5idWxrJykuYWRkQ2xhc3MoJ29mZicpO1xuICAgICAgICBmb3JtLm9mZignY2hhbmdlLmJ1bGsnKTtcbiAgICAgICAgcmV0dXJuIGZvcm07XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZmlsbExpbmVGb3JtKHJlY29yZCkge1xuICAgICAgICB2YXIgbWV0YVJvdywgZXhwZXJpbWVudGVyLCBjb250YWN0O1xuICAgICAgICB2YXIgZm9ybSA9ICQoJyNlZGl0TGluZU1vZGFsJyk7XG4gICAgICAgIGV4cGVyaW1lbnRlciA9IEVERERhdGEuVXNlcnNbcmVjb3JkLmV4cGVyaW1lbnRlcl07XG4gICAgICAgIGNvbnRhY3QgPSBFREREYXRhLlVzZXJzW3JlY29yZC5jb250YWN0LnVzZXJfaWRdO1xuICAgICAgICBmb3JtLmZpbmQoJ1tuYW1lPWxpbmUtbmFtZV0nKS52YWwocmVjb3JkLm5hbWUpO1xuICAgICAgICBmb3JtLmZpbmQoJ1tuYW1lPWxpbmUtZGVzY3JpcHRpb25dJykudmFsKHJlY29yZC5kZXNjcmlwdGlvbik7XG4gICAgICAgIGZvcm0uZmluZCgnW25hbWU9bGluZS1jb250cm9sXScpLnByb3AoJ2NoZWNrZWQnLCByZWNvcmQuY29udHJvbCk7XG4gICAgICAgIGZvcm0uZmluZCgnW25hbWU9bGluZS1jb250YWN0XzBdJykudmFsKHJlY29yZC5jb250YWN0LnRleHQgfHwgKGNvbnRhY3QgJiYgY29udGFjdC51aWQgPyBjb250YWN0LnVpZCA6ICctLScpKTtcbiAgICAgICAgZm9ybS5maW5kKCdbbmFtZT1saW5lLWNvbnRhY3RfMV0nKS52YWwocmVjb3JkLmNvbnRhY3QudXNlcl9pZCk7XG4gICAgICAgIGZvcm0uZmluZCgnW25hbWU9bGluZS1leHBlcmltZW50ZXJfMF0nKS52YWwoZXhwZXJpbWVudGVyICYmIGV4cGVyaW1lbnRlci51aWQgPyBleHBlcmltZW50ZXIudWlkIDogJy0tJyk7XG4gICAgICAgIGZvcm0uZmluZCgnW25hbWU9bGluZS1leHBlcmltZW50ZXJfMV0nKS52YWwocmVjb3JkLmV4cGVyaW1lbnRlcik7XG4gICAgICAgIGZvcm0uZmluZCgnW25hbWU9bGluZS1jYXJib25fc291cmNlXzBdJykudmFsKFxuICAgICAgICAgICAgICAgIHJlY29yZC5jYXJib24ubWFwKCh2KSA9PiAoRURERGF0YS5DU291cmNlc1t2XSB8fCA8Q2FyYm9uU291cmNlUmVjb3JkPnt9KS5uYW1lIHx8ICctLScpLmpvaW4oJywnKSk7XG4gICAgICAgIGZvcm0uZmluZCgnW25hbWU9bGluZS1jYXJib25fc291cmNlXzFdJykudmFsKHJlY29yZC5jYXJib24uam9pbignLCcpKTtcbiAgICAgICAgZm9ybS5maW5kKCdbbmFtZT1saW5lLXN0cmFpbnNfMF0nKS52YWwoXG4gICAgICAgICAgICAgICAgcmVjb3JkLnN0cmFpbi5tYXAoKHYpID0+IChFREREYXRhLlN0cmFpbnNbdl0gfHwgPFN0cmFpblJlY29yZD57fSkubmFtZSB8fCAnLS0nKS5qb2luKCcsJykpO1xuICAgICAgICBmb3JtLmZpbmQoJ1tuYW1lPWxpbmUtc3RyYWluc18xXScpLnZhbChcbiAgICAgICAgICAgICAgICByZWNvcmQuc3RyYWluLm1hcCgodikgPT4gKEVERERhdGEuU3RyYWluc1t2XSB8fCA8U3RyYWluUmVjb3JkPnt9KS5yZWdpc3RyeV9pZCB8fCAnJykuam9pbignLCcpKTtcbiAgICAgICAgaWYgKHJlY29yZC5zdHJhaW4ubGVuZ3RoICYmIGZvcm0uZmluZCgnW25hbWU9bGluZS1zdHJhaW5zXzFdJykudmFsKCkgPT09ICcnKSB7XG4gICAgICAgICAgICAkKCc8bGk+JykudGV4dCgnU3RyYWluIGRvZXMgbm90IGhhdmUgYSBsaW5rZWQgSUNFIGVudHJ5ISAnICtcbiAgICAgICAgICAgICAgICAgICAgJ1NhdmluZyB0aGUgbGluZSB3aXRob3V0IGxpbmtpbmcgdG8gSUNFIHdpbGwgcmVtb3ZlIHRoZSBzdHJhaW4uJylcbiAgICAgICAgICAgICAgICAud3JhcCgnPHVsPicpLnBhcmVudCgpLmFkZENsYXNzKCdlcnJvcmxpc3QnKVxuICAgICAgICAgICAgICAgIC5hcHBlbmRUbyhmb3JtLmZpbmQoJ1tuYW1lPWxpbmUtc3RyYWluc18wXScpLnBhcmVudCgpKTtcbiAgICAgICAgfVxuICAgICAgICBtZXRhUm93ID0gZm9ybS5maW5kKCcubGluZS1lZGl0LW1ldGEnKTtcbiAgICAgICAgLy8gUnVuIHRocm91Z2ggdGhlIGNvbGxlY3Rpb24gb2YgbWV0YWRhdGEsIGFuZCBhZGQgYSBmb3JtIGVsZW1lbnQgZW50cnkgZm9yIGVhY2hcbiAgICAgICAgJC5lYWNoKHJlY29yZC5tZXRhLCAoa2V5LCB2YWx1ZSkgPT4ge1xuICAgICAgICAgICAgaW5zZXJ0TGluZU1ldGFkYXRhUm93KG1ldGFSb3csIGtleSwgdmFsdWUpO1xuICAgICAgICB9KTtcbiAgICAgICAgLy8gc3RvcmUgb3JpZ2luYWwgbWV0YWRhdGEgaW4gaW5pdGlhbC0gZmllbGRcbiAgICAgICAgZm9ybS5maW5kKCdbbmFtZT1saW5lLW1ldGFfc3RvcmVdJykudmFsKEpTT04uc3RyaW5naWZ5KHJlY29yZC5tZXRhKSk7XG4gICAgICAgIGZvcm0uZmluZCgnW25hbWU9aW5pdGlhbC1saW5lLW1ldGFfc3RvcmVdJykudmFsKEpTT04uc3RyaW5naWZ5KHJlY29yZC5tZXRhKSk7XG4gICAgfVxuXG5cbiAgICBmdW5jdGlvbiBpbnNlcnRMaW5lTWV0YWRhdGFSb3cocmVmUm93LCBrZXksIHZhbHVlKSB7XG4gICAgICAgIHZhciByb3csIHR5cGUsIGxhYmVsLCBpbnB1dCwgaWQgPSAnbGluZS1tZXRhLScgKyBrZXk7XG4gICAgICAgIHJvdyA9ICQoJzxwPicpLmF0dHIoJ2lkJywgJ3Jvd18nICsgaWQpLmFkZENsYXNzKCdsaW5lLW1ldGEnKS5pbnNlcnRCZWZvcmUocmVmUm93KTtcbiAgICAgICAgdHlwZSA9IEVERERhdGEuTWV0YURhdGFUeXBlc1trZXldO1xuICAgICAgICBsYWJlbCA9ICQoJzxsYWJlbD4nKS5hdHRyKCdmb3InLCAnaWRfJyArIGlkKS50ZXh0KHR5cGUubmFtZSkuYXBwZW5kVG8ocm93KTtcbiAgICAgICAgLy8gYnVsayBjaGVja2JveD9cbiAgICAgICAgaW5wdXQgPSAkKCc8aW5wdXQgdHlwZT1cInRleHRcIj4nKS5hdHRyKCdpZCcsICdpZF8nICsgaWQpLnZhbCh2YWx1ZSkuYXBwZW5kVG8ocm93KTtcbiAgICAgICAgaWYgKHR5cGUucHJlKSB7XG4gICAgICAgICAgICAkKCc8c3Bhbj4nKS5hZGRDbGFzcygnbWV0YS1wcmVmaXgnKS50ZXh0KHR5cGUucHJlKS5pbnNlcnRCZWZvcmUoaW5wdXQpO1xuICAgICAgICB9XG4gICAgICAgICQoJzxzcGFuPicpLmFkZENsYXNzKCdtZXRhLXJlbW92ZScpLnRleHQoJ1JlbW92ZScpLmluc2VydEFmdGVyKGlucHV0KTtcbiAgICAgICAgaWYgKHR5cGUucG9zdGZpeCkge1xuICAgICAgICAgICAgJCgnPHNwYW4+JykuYWRkQ2xhc3MoJ21ldGEtcG9zdGZpeCcpLnRleHQodHlwZS5wb3N0Zml4KS5pbnNlcnRBZnRlcihpbnB1dCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHJvdztcbiAgICB9XG5cblxuICAgIGV4cG9ydCBmdW5jdGlvbiBlZGl0TGluZXMoaWRzOm51bWJlcltdKTp2b2lkIHtcbiAgICAgICAgdmFyIGZvcm0gPSAkKCcjZWRpdExpbmVNb2RhbCcpLCBhbGxNZXRhID0ge30sIG1ldGFSb3c7XG4gICAgICAgIGNsZWFyTGluZUZvcm0oKTtcblxuICAgICAgICAvLyBVcGRhdGUgdGhlIGRpc2Nsb3NlIHRpdGxlXG4gICAgICAgIHZhciB0ZXh0ID0gJ0FkZCBOZXcgTGluZSc7XG4gICAgICAgIGlmIChpZHMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgdmFyIHRleHQgPSAnRWRpdCBMaW5lJyArIChpZHMubGVuZ3RoID4gMSA/ICdzJyA6ICcnKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZvcm0ucHJvcCgndGl0bGUnLCB0ZXh0KTtcbiAgICAgICAgaWYgKGlkcy5sZW5ndGggPiAxKSB7XG4gICAgICAgICAgICBmb3JtLmZpbmQoJy5idWxrJykucHJvcCgnY2hlY2tlZCcsIGZhbHNlKS5yZW1vdmVDbGFzcygnb2ZmJyk7XG4gICAgICAgICAgICBmb3JtLm9uKCdjaGFuZ2UuYnVsaycsICc6aW5wdXQnLCAoZXY6SlF1ZXJ5RXZlbnRPYmplY3QpID0+IHtcbiAgICAgICAgICAgICAgICAkKGV2LnRhcmdldCkuc2libGluZ3MoJ2xhYmVsJykuZmluZCgnLmJ1bGsnKS5wcm9wKCdjaGVja2VkJywgdHJ1ZSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChpZHMubGVuZ3RoID09PSAxKSB7XG4gICAgICAgICAgICBmaWxsTGluZUZvcm0oRURERGF0YS5MaW5lc1tpZHNbMF1dKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIC8vIGNvbXB1dGUgdXNlZCBtZXRhZGF0YSBmaWVsZHMgb24gYWxsIGRhdGEuaWRzLCBpbnNlcnQgbWV0YWRhdGEgcm93cz9cbiAgICAgICAgICAgIGlkcy5tYXAoKGlkOm51bWJlcikgPT4gRURERGF0YS5MaW5lc1tpZF0gfHwge30pLmZvckVhY2goKGxpbmU6TGluZVJlY29yZCkgPT4ge1xuICAgICAgICAgICAgICAgICQuZXh0ZW5kKGFsbE1ldGEsIGxpbmUubWV0YSB8fCB7fSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIG1ldGFSb3cgPSBmb3JtLmZpbmQoJy5saW5lLWVkaXQtbWV0YScpO1xuICAgICAgICAgICAgLy8gUnVuIHRocm91Z2ggdGhlIGNvbGxlY3Rpb24gb2YgbWV0YWRhdGEsIGFuZCBhZGQgYSBmb3JtIGVsZW1lbnQgZW50cnkgZm9yIGVhY2hcbiAgICAgICAgICAgICQuZWFjaChhbGxNZXRhLCAoa2V5KSA9PiBpbnNlcnRMaW5lTWV0YWRhdGFSb3cobWV0YVJvdywga2V5LCAnJykpO1xuICAgICAgICB9XG4gICAgICAgIGZvcm0uZmluZCgnW25hbWU9bGluZS1pZHNdJykudmFsKGlkcy5qb2luKCcsJykpO1xuICAgICAgICBmb3JtLnJlbW92ZUNsYXNzKCdvZmYnKS5kaWFsb2coIFwib3BlblwiICk7XG4gICAgfVxuXG5cbiAgICBleHBvcnQgZnVuY3Rpb24gb25DaGFuZ2VkTWV0YWJvbGljTWFwKCkge1xuICAgICAgICBpZiAodGhpcy5tZXRhYm9saWNNYXBOYW1lKSB7XG4gICAgICAgICAgICAvLyBVcGRhdGUgdGhlIFVJIHRvIHNob3cgdGhlIG5ldyBmaWxlbmFtZSBmb3IgdGhlIG1ldGFib2xpYyBtYXAuXG4gICAgICAgICAgICAkKFwiI21ldGFib2xpY01hcE5hbWVcIikuaHRtbCh0aGlzLm1ldGFib2xpY01hcE5hbWUpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgJChcIiNtZXRhYm9saWNNYXBOYW1lXCIpLmh0bWwoJyhub25lKScpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHRoaXMuYmlvbWFzc0NhbGN1bGF0aW9uICYmIHRoaXMuYmlvbWFzc0NhbGN1bGF0aW9uICE9IC0xKSB7XG4gICAgICAgICAgICAvLyBDYWxjdWxhdGUgY2FyYm9uIGJhbGFuY2VzIG5vdyB0aGF0IHdlIGNhbi5cbiAgICAgICAgICAgIHRoaXMuY2FyYm9uQmFsYW5jZURhdGEuY2FsY3VsYXRlQ2FyYm9uQmFsYW5jZXModGhpcy5tZXRhYm9saWNNYXBJRCxcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5iaW9tYXNzQ2FsY3VsYXRpb24pO1xuXG4gICAgICAgICAgICAvLyBSZWJ1aWxkIHRoZSBDQiBncmFwaHMuXG4gICAgICAgICAgICB0aGlzLmNhcmJvbkJhbGFuY2VEaXNwbGF5SXNGcmVzaCA9IGZhbHNlO1xuICAgICAgICAgICAgdGhpcy5yZWJ1aWxkQ2FyYm9uQmFsYW5jZUdyYXBocygpO1xuICAgICAgICB9XG4gICAgfVxuXG5cbiAgICBleHBvcnQgZnVuY3Rpb24gcmVidWlsZENhcmJvbkJhbGFuY2VHcmFwaHMoKSB7XG4gICAgICAgIHZhciBjZWxsT2JqczpEYXRhR3JpZERhdGFDZWxsW10sXG4gICAgICAgICAgICBncm91cDpEYXRhR3JpZENvbHVtbkdyb3VwU3BlYyA9IHRoaXMubGluZXNEYXRhR3JpZFNwZWMuY2FyYm9uQmFsYW5jZUNvbDtcbiAgICAgICAgaWYgKHRoaXMuY2FyYm9uQmFsYW5jZURpc3BsYXlJc0ZyZXNoKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgLy8gRHJvcCBhbnkgcHJldmlvdXNseSBjcmVhdGVkIENhcmJvbiBCYWxhbmNlIFNWRyBlbGVtZW50cyBmcm9tIHRoZSBET00uXG4gICAgICAgIHRoaXMuY2FyYm9uQmFsYW5jZURhdGEucmVtb3ZlQWxsQ0JHcmFwaHMoKTtcbiAgICAgICAgY2VsbE9ianMgPSBbXTtcbiAgICAgICAgLy8gZ2V0IGFsbCBjZWxscyBmcm9tIGFsbCBjb2x1bW5zIGluIHRoZSBjb2x1bW4gZ3JvdXBcbiAgICAgICAgZ3JvdXAubWVtYmVyQ29sdW1ucy5mb3JFYWNoKChjb2w6RGF0YUdyaWRDb2x1bW5TcGVjKTp2b2lkID0+IHtcbiAgICAgICAgICAgIEFycmF5LnByb3RvdHlwZS5wdXNoLmFwcGx5KGNlbGxPYmpzLCBjb2wuZ2V0RW50aXJlSW5kZXgoKSk7XG4gICAgICAgIH0pO1xuICAgICAgICAvLyBjcmVhdGUgY2FyYm9uIGJhbGFuY2UgZ3JhcGggZm9yIGVhY2ggY2VsbFxuICAgICAgICBjZWxsT2Jqcy5mb3JFYWNoKChjZWxsOkRhdGFHcmlkRGF0YUNlbGwpID0+IHtcbiAgICAgICAgICAgIHRoaXMuY2FyYm9uQmFsYW5jZURhdGEuY3JlYXRlQ0JHcmFwaEZvckxpbmUoY2VsbC5yZWNvcmRJRCwgY2VsbC5jZWxsRWxlbWVudCk7XG4gICAgICAgIH0pO1xuICAgICAgICB0aGlzLmNhcmJvbkJhbGFuY2VEaXNwbGF5SXNGcmVzaCA9IHRydWU7XG4gICAgfVxuXG5cbiAgICAvLyBUaGV5IHdhbnQgdG8gc2VsZWN0IGEgZGlmZmVyZW50IG1ldGFib2xpYyBtYXAuXG4gICAgZXhwb3J0IGZ1bmN0aW9uIG9uQ2xpY2tlZE1ldGFib2xpY01hcE5hbWUoKTp2b2lkIHtcbiAgICAgICAgdmFyIHVpOlN0dWR5TWV0YWJvbGljTWFwQ2hvb3NlcixcbiAgICAgICAgICAgIGNhbGxiYWNrOk1ldGFib2xpY01hcENob29zZXJSZXN1bHQgPSAoZXJyb3I6c3RyaW5nLFxuICAgICAgICAgICAgICAgIG1ldGFib2xpY01hcElEPzpudW1iZXIsXG4gICAgICAgICAgICAgICAgbWV0YWJvbGljTWFwTmFtZT86c3RyaW5nLFxuICAgICAgICAgICAgICAgIGZpbmFsQmlvbWFzcz86bnVtYmVyKTp2b2lkID0+IHtcbiAgICAgICAgICAgIGlmICghZXJyb3IpIHtcbiAgICAgICAgICAgICAgICB0aGlzLm1ldGFib2xpY01hcElEID0gbWV0YWJvbGljTWFwSUQ7XG4gICAgICAgICAgICAgICAgdGhpcy5tZXRhYm9saWNNYXBOYW1lID0gbWV0YWJvbGljTWFwTmFtZTtcbiAgICAgICAgICAgICAgICB0aGlzLmJpb21hc3NDYWxjdWxhdGlvbiA9IGZpbmFsQmlvbWFzcztcbiAgICAgICAgICAgICAgICB0aGlzLm9uQ2hhbmdlZE1ldGFib2xpY01hcCgpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhcIm9uQ2xpY2tlZE1ldGFib2xpY01hcE5hbWUgZXJyb3I6IFwiICsgZXJyb3IpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuICAgICAgICB1aSA9IG5ldyBTdHVkeU1ldGFib2xpY01hcENob29zZXIoZmFsc2UsIGNhbGxiYWNrKTtcbiAgICB9XG59O1xuXG5cblxuLy8gVGhlIHNwZWMgb2JqZWN0IHRoYXQgd2lsbCBiZSBwYXNzZWQgdG8gRGF0YUdyaWQgdG8gY3JlYXRlIHRoZSBMaW5lcyB0YWJsZVxuY2xhc3MgRGF0YUdyaWRTcGVjTGluZXMgZXh0ZW5kcyBEYXRhR3JpZFNwZWNCYXNlIHtcblxuICAgIG1ldGFEYXRhSURzVXNlZEluTGluZXM6YW55O1xuICAgIGdyb3VwSURzSW5PcmRlcjphbnk7XG4gICAgZ3JvdXBJRHNUb0dyb3VwSW5kZXhlczphbnk7XG4gICAgZ3JvdXBJRHNUb0dyb3VwTmFtZXM6YW55O1xuICAgIGNhcmJvbkJhbGFuY2VDb2w6RGF0YUdyaWRDb2x1bW5Hcm91cFNwZWM7XG4gICAgY2FyYm9uQmFsYW5jZVdpZGdldDpER1Nob3dDYXJib25CYWxhbmNlV2lkZ2V0O1xuXG4gICAgaW5pdCgpIHtcbiAgICAgICAgdGhpcy5maW5kTWV0YURhdGFJRHNVc2VkSW5MaW5lcygpO1xuICAgICAgICB0aGlzLmZpbmRHcm91cElEc0FuZE5hbWVzKCk7XG4gICAgICAgIHN1cGVyLmluaXQoKTtcbiAgICB9XG5cbiAgICBoaWdobGlnaHRDYXJib25CYWxhbmNlV2lkZ2V0KHY6Ym9vbGVhbik6dm9pZCB7XG4gICAgICAgIHRoaXMuY2FyYm9uQmFsYW5jZVdpZGdldC5oaWdobGlnaHQodik7XG4gICAgfVxuXG4gICAgZW5hYmxlQ2FyYm9uQmFsYW5jZVdpZGdldCh2OmJvb2xlYW4pOnZvaWQge1xuICAgICAgICB0aGlzLmNhcmJvbkJhbGFuY2VXaWRnZXQuZW5hYmxlKHYpO1xuICAgIH1cblxuICAgIGZpbmRNZXRhRGF0YUlEc1VzZWRJbkxpbmVzKCkge1xuICAgICAgICB2YXIgc2Vlbkhhc2g6YW55ID0ge307XG4gICAgICAgIC8vIGxvb3AgbGluZXNcbiAgICAgICAgJC5lYWNoKHRoaXMuZ2V0UmVjb3JkSURzKCksIChpbmRleCwgaWQpID0+IHtcbiAgICAgICAgICAgIHZhciBsaW5lID0gRURERGF0YS5MaW5lc1tpZF07XG4gICAgICAgICAgICBpZiAobGluZSkge1xuICAgICAgICAgICAgICAgICQuZWFjaChsaW5lLm1ldGEgfHwge30sIChrZXkpID0+IHNlZW5IYXNoW2tleV0gPSB0cnVlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIC8vIHN0b3JlIGFsbCBtZXRhZGF0YSBJRHMgc2VlblxuICAgICAgICB0aGlzLm1ldGFEYXRhSURzVXNlZEluTGluZXMgPSBPYmplY3Qua2V5cyhzZWVuSGFzaCk7XG4gICAgfVxuXG4gICAgZmluZEdyb3VwSURzQW5kTmFtZXMoKSB7XG4gICAgICAgIHZhciByb3dHcm91cHMgPSB7fTtcbiAgICAgICAgLy8gR2F0aGVyIGFsbCB0aGUgcm93IElEcyB1bmRlciB0aGUgZ3JvdXAgSUQgZWFjaCBiZWxvbmdzIHRvLlxuICAgICAgICAkLmVhY2godGhpcy5nZXRSZWNvcmRJRHMoKSwgKGluZGV4LCBpZCkgPT4ge1xuICAgICAgICAgICAgdmFyIGxpbmUgPSBFREREYXRhLkxpbmVzW2lkXSwgcmVwID0gbGluZS5yZXBsaWNhdGU7XG4gICAgICAgICAgICBpZiAocmVwKSB7XG4gICAgICAgICAgICAgICAgLy8gdXNlIHBhcmVudCByZXBsaWNhdGUgYXMgYSByZXBsaWNhdGUgZ3JvdXAgSUQsIHB1c2ggYWxsIG1hdGNoaW5nIGxpbmUgSURzXG4gICAgICAgICAgICAgICAgKHJvd0dyb3Vwc1tyZXBdID0gcm93R3JvdXBzW3JlcF0gfHwgWyByZXAgXSkucHVzaChpZCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICB0aGlzLmdyb3VwSURzVG9Hcm91cE5hbWVzID0ge307XG4gICAgICAgIC8vIEZvciBlYWNoIGdyb3VwIElELCBqdXN0IHVzZSBwYXJlbnQgcmVwbGljYXRlIG5hbWVcbiAgICAgICAgJC5lYWNoKHJvd0dyb3VwcywgKGdyb3VwLCBsaW5lcykgPT4ge1xuICAgICAgICAgICAgdGhpcy5ncm91cElEc1RvR3JvdXBOYW1lc1tncm91cF0gPSBFREREYXRhLkxpbmVzW2dyb3VwXS5uYW1lO1xuICAgICAgICB9KTtcbiAgICAgICAgLy8gYWxwaGFudW1lcmljIHNvcnQgb2YgZ3JvdXAgSURzIGJ5IG5hbWUgYXR0YWNoZWQgdG8gdGhvc2UgcmVwbGljYXRlIGdyb3Vwc1xuICAgICAgICB0aGlzLmdyb3VwSURzSW5PcmRlciA9IE9iamVjdC5rZXlzKHJvd0dyb3Vwcykuc29ydCgoYSxiKSA9PiB7XG4gICAgICAgICAgICB2YXIgdTpzdHJpbmcgPSB0aGlzLmdyb3VwSURzVG9Hcm91cE5hbWVzW2FdLCB2OnN0cmluZyA9IHRoaXMuZ3JvdXBJRHNUb0dyb3VwTmFtZXNbYl07XG4gICAgICAgICAgICByZXR1cm4gdSA8IHYgPyAtMSA6IHUgPiB2ID8gMSA6IDA7XG4gICAgICAgIH0pO1xuICAgICAgICAvLyBOb3cgdGhhdCB0aGV5J3JlIHNvcnRlZCBieSBuYW1lLCBjcmVhdGUgYSBoYXNoIGZvciBxdWlja2x5IHJlc29sdmluZyBJRHMgdG8gaW5kZXhlcyBpblxuICAgICAgICAvLyB0aGUgc29ydGVkIGFycmF5XG4gICAgICAgIHRoaXMuZ3JvdXBJRHNUb0dyb3VwSW5kZXhlcyA9IHt9O1xuICAgICAgICAkLmVhY2godGhpcy5ncm91cElEc0luT3JkZXIsIChpbmRleCwgZ3JvdXApID0+IHRoaXMuZ3JvdXBJRHNUb0dyb3VwSW5kZXhlc1tncm91cF0gPSBpbmRleCk7XG4gICAgfVxuXG4gICAgLy8gU3BlY2lmaWNhdGlvbiBmb3IgdGhlIHRhYmxlIGFzIGEgd2hvbGVcbiAgICBkZWZpbmVUYWJsZVNwZWMoKTpEYXRhR3JpZFRhYmxlU3BlYyB7XG4gICAgICAgIHJldHVybiBuZXcgRGF0YUdyaWRUYWJsZVNwZWMoJ2xpbmVzJywgeyAnbmFtZSc6ICdMaW5lcycgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBsb2FkTGluZU5hbWUoaW5kZXg6c3RyaW5nKTpzdHJpbmcge1xuICAgICAgICB2YXIgbGluZTtcbiAgICAgICAgaWYgKChsaW5lID0gRURERGF0YS5MaW5lc1tpbmRleF0pKSB7XG4gICAgICAgICAgICByZXR1cm4gbGluZS5uYW1lLnRvVXBwZXJDYXNlKCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuICcnO1xuICAgIH1cblxuICAgIHByaXZhdGUgbG9hZFN0cmFpbk5hbWUoaW5kZXg6c3RyaW5nKTpzdHJpbmcge1xuICAgICAgICAvLyBlbnN1cmUgYSBzdHJhaW4gSUQgZXhpc3RzIG9uIGxpbmUsIGlzIGEga25vd24gc3RyYWluLCB1cHBlcmNhc2UgZmlyc3QgZm91bmQgbmFtZSBvciAnPydcbiAgICAgICAgdmFyIGxpbmUsIHN0cmFpbjtcbiAgICAgICAgaWYgKChsaW5lID0gRURERGF0YS5MaW5lc1tpbmRleF0pKSB7XG4gICAgICAgICAgICBpZiAobGluZS5zdHJhaW4gJiYgbGluZS5zdHJhaW4ubGVuZ3RoICYmIChzdHJhaW4gPSBFREREYXRhLlN0cmFpbnNbbGluZS5zdHJhaW5bMF1dKSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBzdHJhaW4ubmFtZS50b1VwcGVyQ2FzZSgpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiAnPyc7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBsb2FkRmlyc3RDYXJib25Tb3VyY2UoaW5kZXg6c3RyaW5nKTphbnkge1xuICAgICAgICAvLyBlbnN1cmUgY2FyYm9uIHNvdXJjZSBJRChzKSBleGlzdCBvbiBsaW5lLCBlbnN1cmUgYXQgbGVhc3Qgb25lIHNvdXJjZSBJRCwgZW5zdXJlIGZpcnN0IElEXG4gICAgICAgIC8vIGlzIGtub3duIGNhcmJvbiBzb3VyY2VcbiAgICAgICAgdmFyIGxpbmUsIHNvdXJjZTtcbiAgICAgICAgaWYgKChsaW5lID0gRURERGF0YS5MaW5lc1tpbmRleF0pKSB7XG4gICAgICAgICAgICBpZiAobGluZS5jYXJib24gJiYgbGluZS5jYXJib24ubGVuZ3RoICYmIChzb3VyY2UgPSBFREREYXRhLkNTb3VyY2VzW2xpbmUuY2FyYm9uWzBdXSkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gc291cmNlO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBsb2FkQ2FyYm9uU291cmNlKGluZGV4OnN0cmluZyk6c3RyaW5nIHtcbiAgICAgICAgdmFyIHNvdXJjZSA9IHRoaXMubG9hZEZpcnN0Q2FyYm9uU291cmNlKGluZGV4KTtcbiAgICAgICAgaWYgKHNvdXJjZSkge1xuICAgICAgICAgICAgcmV0dXJuIHNvdXJjZS5uYW1lLnRvVXBwZXJDYXNlKCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuICc/JztcbiAgICB9XG5cbiAgICBwcml2YXRlIGxvYWRDYXJib25Tb3VyY2VMYWJlbGluZyhpbmRleDpzdHJpbmcpOnN0cmluZyB7XG4gICAgICAgIHZhciBzb3VyY2UgPSB0aGlzLmxvYWRGaXJzdENhcmJvblNvdXJjZShpbmRleCk7XG4gICAgICAgIGlmIChzb3VyY2UpIHtcbiAgICAgICAgICAgIHJldHVybiBzb3VyY2UubGFiZWxpbmcudG9VcHBlckNhc2UoKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gJz8nO1xuICAgIH1cblxuICAgIHByaXZhdGUgbG9hZEV4cGVyaW1lbnRlckluaXRpYWxzKGluZGV4OnN0cmluZyk6c3RyaW5nIHtcbiAgICAgICAgLy8gZW5zdXJlIGluZGV4IElEIGV4aXN0cywgZW5zdXJlIGV4cGVyaW1lbnRlciB1c2VyIElEIGV4aXN0cywgdXBwZXJjYXNlIGluaXRpYWxzIG9yID9cbiAgICAgICAgdmFyIGxpbmUsIGV4cGVyaW1lbnRlcjtcbiAgICAgICAgaWYgKChsaW5lID0gRURERGF0YS5MaW5lc1tpbmRleF0pKSB7XG4gICAgICAgICAgICBpZiAoKGV4cGVyaW1lbnRlciA9IEVERERhdGEuVXNlcnNbbGluZS5leHBlcmltZW50ZXJdKSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBleHBlcmltZW50ZXIuaW5pdGlhbHMudG9VcHBlckNhc2UoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gJz8nO1xuICAgIH1cblxuICAgIHByaXZhdGUgbG9hZExpbmVNb2RpZmljYXRpb24oaW5kZXg6c3RyaW5nKTpudW1iZXIge1xuICAgICAgICB2YXIgbGluZTtcbiAgICAgICAgaWYgKChsaW5lID0gRURERGF0YS5MaW5lc1tpbmRleF0pKSB7XG4gICAgICAgICAgICByZXR1cm4gbGluZS5tb2RpZmllZC50aW1lO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgfVxuXG4gICAgLy8gU3BlY2lmaWNhdGlvbiBmb3IgdGhlIGhlYWRlcnMgYWxvbmcgdGhlIHRvcCBvZiB0aGUgdGFibGVcbiAgICBkZWZpbmVIZWFkZXJTcGVjKCk6RGF0YUdyaWRIZWFkZXJTcGVjW10ge1xuICAgICAgICB2YXIgbGVmdFNpZGU6RGF0YUdyaWRIZWFkZXJTcGVjW10gPSBbXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRIZWFkZXJTcGVjKDEsICdoTGluZXNOYW1lJywge1xuICAgICAgICAgICAgICAgICduYW1lJzogJ05hbWUnLFxuICAgICAgICAgICAgICAgICdzb3J0QnknOiB0aGlzLmxvYWRMaW5lTmFtZSB9KSxcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZEhlYWRlclNwZWMoMiwgJ2hMaW5lc1N0cmFpbicsIHtcbiAgICAgICAgICAgICAgICAnbmFtZSc6ICdTdHJhaW4nLFxuICAgICAgICAgICAgICAgICdzb3J0QnknOiB0aGlzLmxvYWRTdHJhaW5OYW1lLFxuICAgICAgICAgICAgICAgICdzb3J0QWZ0ZXInOiAwIH0pLFxuICAgICAgICAgICAgbmV3IERhdGFHcmlkSGVhZGVyU3BlYygzLCAnaExpbmVzQ2FyYm9uJywge1xuICAgICAgICAgICAgICAgICduYW1lJzogJ0NhcmJvbiBTb3VyY2UocyknLFxuICAgICAgICAgICAgICAgICdzaXplJzogJ3MnLFxuICAgICAgICAgICAgICAgICdzb3J0QnknOiB0aGlzLmxvYWRDYXJib25Tb3VyY2UsXG4gICAgICAgICAgICAgICAgJ3NvcnRBZnRlcic6IDAgfSksXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRIZWFkZXJTcGVjKDQsICdoTGluZXNMYWJlbGluZycsIHtcbiAgICAgICAgICAgICAgICAnbmFtZSc6ICdMYWJlbGluZycsXG4gICAgICAgICAgICAgICAgJ3NpemUnOiAncycsXG4gICAgICAgICAgICAgICAgJ3NvcnRCeSc6IHRoaXMubG9hZENhcmJvblNvdXJjZUxhYmVsaW5nLFxuICAgICAgICAgICAgICAgICdzb3J0QWZ0ZXInOiAwIH0pLFxuICAgICAgICAgICAgbmV3IERhdGFHcmlkSGVhZGVyU3BlYyg1LCAnaExpbmVzQ2FyYm9uQmFsYW5jZScsIHtcbiAgICAgICAgICAgICAgICAnbmFtZSc6ICdDYXJib24gQmFsYW5jZScsXG4gICAgICAgICAgICAgICAgJ3NpemUnOiAncycsXG4gICAgICAgICAgICAgICAgJ3NvcnRCeSc6IHRoaXMubG9hZExpbmVOYW1lIH0pXG4gICAgICAgIF07XG5cbiAgICAgICAgLy8gbWFwIGFsbCBtZXRhZGF0YSBJRHMgdG8gSGVhZGVyU3BlYyBvYmplY3RzXG4gICAgICAgIHZhciBtZXRhRGF0YUhlYWRlcnM6RGF0YUdyaWRIZWFkZXJTcGVjW10gPSB0aGlzLm1ldGFEYXRhSURzVXNlZEluTGluZXMubWFwKChpZCwgaW5kZXgpID0+IHtcbiAgICAgICAgICAgIHZhciBtZFR5cGUgPSBFREREYXRhLk1ldGFEYXRhVHlwZXNbaWRdO1xuICAgICAgICAgICAgcmV0dXJuIG5ldyBEYXRhR3JpZEhlYWRlclNwZWMoNiArIGluZGV4LCAnaExpbmVzTWV0YScgKyBpZCwge1xuICAgICAgICAgICAgICAgICduYW1lJzogbWRUeXBlLm5hbWUsXG4gICAgICAgICAgICAgICAgJ3NpemUnOiAncycsXG4gICAgICAgICAgICAgICAgJ3NvcnRCeSc6IHRoaXMubWFrZU1ldGFEYXRhU29ydEZ1bmN0aW9uKGlkKSxcbiAgICAgICAgICAgICAgICAnc29ydEFmdGVyJzogMCB9KTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgdmFyIHJpZ2h0U2lkZSA9IFtcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZEhlYWRlclNwZWMoNiArIG1ldGFEYXRhSGVhZGVycy5sZW5ndGgsICdoTGluZXNFeHBlcmltZW50ZXInLCB7XG4gICAgICAgICAgICAgICAgJ25hbWUnOiAnRXhwZXJpbWVudGVyJyxcbiAgICAgICAgICAgICAgICAnc2l6ZSc6ICdzJyxcbiAgICAgICAgICAgICAgICAnc29ydEJ5JzogdGhpcy5sb2FkRXhwZXJpbWVudGVySW5pdGlhbHMsXG4gICAgICAgICAgICAgICAgJ3NvcnRBZnRlcic6IDAgfSksXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRIZWFkZXJTcGVjKDcgKyBtZXRhRGF0YUhlYWRlcnMubGVuZ3RoLCAnaExpbmVzTW9kaWZpZWQnLCB7XG4gICAgICAgICAgICAgICAgJ25hbWUnOiAnTGFzdCBNb2RpZmllZCcsXG4gICAgICAgICAgICAgICAgJ3NpemUnOiAncycsXG4gICAgICAgICAgICAgICAgJ3NvcnRCeSc6IHRoaXMubG9hZExpbmVNb2RpZmljYXRpb24sXG4gICAgICAgICAgICAgICAgJ3NvcnRBZnRlcic6IDAgfSlcbiAgICAgICAgXTtcblxuICAgICAgICByZXR1cm4gbGVmdFNpZGUuY29uY2F0KG1ldGFEYXRhSGVhZGVycywgcmlnaHRTaWRlKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIG1ha2VNZXRhRGF0YVNvcnRGdW5jdGlvbihpZDpzdHJpbmcpIHtcbiAgICAgICAgcmV0dXJuIChpOnN0cmluZykgPT4ge1xuICAgICAgICAgICAgdmFyIGxpbmUgPSBFREREYXRhLkxpbmVzW2ldO1xuICAgICAgICAgICAgaWYgKGxpbmUgJiYgbGluZS5tZXRhKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGxpbmUubWV0YVtpZF0gfHwgJyc7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gJyc7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBUaGUgY29sc3BhbiB2YWx1ZSBmb3IgYWxsIHRoZSBjZWxscyB0aGF0IGFyZSBub3QgJ2NhcmJvbiBzb3VyY2UnIG9yICdsYWJlbGluZydcbiAgICAvLyBpcyBiYXNlZCBvbiB0aGUgbnVtYmVyIG9mIGNhcmJvbiBzb3VyY2VzIGZvciB0aGUgcmVzcGVjdGl2ZSByZWNvcmQuXG4gICAgLy8gU3BlY2lmaWNhbGx5LCBpdCdzIGVpdGhlciB0aGUgbnVtYmVyIG9mIGNhcmJvbiBzb3VyY2VzLCBvciAxLCB3aGljaGV2ZXIgaXMgaGlnaGVyLlxuICAgIHByaXZhdGUgcm93U3BhbkZvclJlY29yZChpbmRleCkge1xuICAgICAgICByZXR1cm4gKEVERERhdGEuTGluZXNbaW5kZXhdLmNhcmJvbiB8fCBbXSkubGVuZ3RoIHx8IDE7XG4gICAgfVxuXG4gICAgZ2VuZXJhdGVMaW5lTmFtZUNlbGxzKGdyaWRTcGVjOkRhdGFHcmlkU3BlY0xpbmVzLCBpbmRleDpzdHJpbmcpOkRhdGFHcmlkRGF0YUNlbGxbXSB7XG4gICAgICAgIHZhciBsaW5lID0gRURERGF0YS5MaW5lc1tpbmRleF07XG4gICAgICAgIHJldHVybiBbXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWREYXRhQ2VsbChncmlkU3BlYywgaW5kZXgsIHtcbiAgICAgICAgICAgICAgICAnY2hlY2tib3hOYW1lJzogJ2xpbmVJZCcsXG4gICAgICAgICAgICAgICAgJ2NoZWNrYm94V2l0aElEJzogKGlkKSA9PiB7IHJldHVybiAnbGluZScgKyBpZCArICdpbmNsdWRlJzsgfSxcbiAgICAgICAgICAgICAgICAnc2lkZU1lbnVJdGVtcyc6IFtcbiAgICAgICAgICAgICAgICAgICAgJzxhIGhyZWY9XCIjXCIgY2xhc3M9XCJsaW5lLWVkaXQtbGlua1wiPkVkaXQgTGluZTwvYT4nLFxuICAgICAgICAgICAgICAgICAgICAnPGEgaHJlZj1cIi9leHBvcnQ/bGluZUlkPScgKyBpbmRleCArICdcIj5FeHBvcnQgRGF0YSBhcyBDU1YvRXhjZWw8L2E+JyxcbiAgICAgICAgICAgICAgICAgICAgJzxhIGhyZWY9XCIvc2JtbD9saW5lSWQ9JyArIGluZGV4ICsgJ1wiPkV4cG9ydCBEYXRhIGFzIFNCTUw8L2E+J1xuICAgICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICAgICAgJ2hvdmVyRWZmZWN0JzogdHJ1ZSxcbiAgICAgICAgICAgICAgICAnbm93cmFwJzogdHJ1ZSxcbiAgICAgICAgICAgICAgICAncm93c3Bhbic6IGdyaWRTcGVjLnJvd1NwYW5Gb3JSZWNvcmQoaW5kZXgpLFxuICAgICAgICAgICAgICAgICdjb250ZW50U3RyaW5nJzogbGluZS5uYW1lICsgKGxpbmUuY3RybCA/ICc8YiBjbGFzcz1cImlzY29udHJvbGRhdGFcIj5DPC9iPicgOiAnJylcbiAgICAgICAgICAgIH0pXG4gICAgICAgIF07XG4gICAgfVxuXG4gICAgZ2VuZXJhdGVTdHJhaW5OYW1lQ2VsbHMoZ3JpZFNwZWM6RGF0YUdyaWRTcGVjTGluZXMsIGluZGV4OnN0cmluZyk6RGF0YUdyaWREYXRhQ2VsbFtdIHtcbiAgICAgICAgdmFyIGxpbmUsIGNvbnRlbnQgPSBbXTtcbiAgICAgICAgaWYgKChsaW5lID0gRURERGF0YS5MaW5lc1tpbmRleF0pKSB7XG4gICAgICAgICAgICBjb250ZW50ID0gbGluZS5zdHJhaW4ubWFwKChpZCkgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBzdHJhaW4gPSBFREREYXRhLlN0cmFpbnNbaWRdO1xuICAgICAgICAgICAgICAgIHJldHVybiBbICc8YSBocmVmPVwiJywgc3RyYWluLnJlZ2lzdHJ5X3VybCwgJ1wiPicsIHN0cmFpbi5uYW1lLCAnPC9hPicgXS5qb2luKCcnKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBbXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWREYXRhQ2VsbChncmlkU3BlYywgaW5kZXgsIHtcbiAgICAgICAgICAgICAgICAncm93c3Bhbic6IGdyaWRTcGVjLnJvd1NwYW5Gb3JSZWNvcmQoaW5kZXgpLFxuICAgICAgICAgICAgICAgICdjb250ZW50U3RyaW5nJzogY29udGVudC5qb2luKCc7ICcpIHx8ICctLSdcbiAgICAgICAgICAgICAgIH0pXG4gICAgICAgIF07XG4gICAgfVxuXG4gICAgZ2VuZXJhdGVDYXJib25Tb3VyY2VDZWxscyhncmlkU3BlYzpEYXRhR3JpZFNwZWNMaW5lcywgaW5kZXg6c3RyaW5nKTpEYXRhR3JpZERhdGFDZWxsW10ge1xuICAgICAgICB2YXIgbGluZSwgc3RyaW5ncyA9IFsnLS0nXTtcbiAgICAgICAgaWYgKChsaW5lID0gRURERGF0YS5MaW5lc1tpbmRleF0pKSB7XG4gICAgICAgICAgICBpZiAobGluZS5jYXJib24gJiYgbGluZS5jYXJib24ubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgc3RyaW5ncyA9IGxpbmUuY2FyYm9uLm1hcCgoaWQpID0+IHsgcmV0dXJuIEVERERhdGEuQ1NvdXJjZXNbaWRdLm5hbWU7IH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBzdHJpbmdzLm1hcCgobmFtZSkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIG5ldyBEYXRhR3JpZERhdGFDZWxsKGdyaWRTcGVjLCBpbmRleCwgeyAnY29udGVudFN0cmluZyc6IG5hbWUgfSlcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgZ2VuZXJhdGVDYXJib25Tb3VyY2VMYWJlbGluZ0NlbGxzKGdyaWRTcGVjOkRhdGFHcmlkU3BlY0xpbmVzLCBpbmRleDpzdHJpbmcpOkRhdGFHcmlkRGF0YUNlbGxbXSB7XG4gICAgICAgIHZhciBsaW5lLCBzdHJpbmdzID0gWyctLSddO1xuICAgICAgICBpZiAoKGxpbmUgPSBFREREYXRhLkxpbmVzW2luZGV4XSkpIHtcbiAgICAgICAgICAgIGlmIChsaW5lLmNhcmJvbiAmJiBsaW5lLmNhcmJvbi5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICBzdHJpbmdzID0gbGluZS5jYXJib24ubWFwKChpZCkgPT4geyByZXR1cm4gRURERGF0YS5DU291cmNlc1tpZF0ubGFiZWxpbmc7IH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBzdHJpbmdzLm1hcCgobGFiZWxpbmcpID0+IHtcbiAgICAgICAgICAgIHJldHVybiBuZXcgRGF0YUdyaWREYXRhQ2VsbChncmlkU3BlYywgaW5kZXgsIHsgJ2NvbnRlbnRTdHJpbmcnOiBsYWJlbGluZyB9KVxuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBnZW5lcmF0ZUNhcmJvbkJhbGFuY2VCbGFua0NlbGxzKGdyaWRTcGVjOkRhdGFHcmlkU3BlY0xpbmVzLCBpbmRleDpzdHJpbmcpOkRhdGFHcmlkRGF0YUNlbGxbXSB7XG4gICAgICAgIHJldHVybiBbXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWREYXRhQ2VsbChncmlkU3BlYywgaW5kZXgsIHtcbiAgICAgICAgICAgICAgICAncm93c3Bhbic6IGdyaWRTcGVjLnJvd1NwYW5Gb3JSZWNvcmQoaW5kZXgpLFxuICAgICAgICAgICAgICAgICdtaW5XaWR0aCc6IDIwMFxuICAgICAgICAgICAgfSlcbiAgICAgICAgXTtcbiAgICB9XG5cbiAgICBnZW5lcmF0ZUV4cGVyaW1lbnRlckluaXRpYWxzQ2VsbHMoZ3JpZFNwZWM6RGF0YUdyaWRTcGVjTGluZXMsIGluZGV4OnN0cmluZyk6RGF0YUdyaWREYXRhQ2VsbFtdIHtcbiAgICAgICAgdmFyIGxpbmUsIGV4cCwgY29udGVudDtcbiAgICAgICAgaWYgKChsaW5lID0gRURERGF0YS5MaW5lc1tpbmRleF0pKSB7XG4gICAgICAgICAgICBpZiAoRURERGF0YS5Vc2VycyAmJiAoZXhwID0gRURERGF0YS5Vc2Vyc1tsaW5lLmV4cGVyaW1lbnRlcl0pKSB7XG4gICAgICAgICAgICAgICAgY29udGVudCA9IGV4cC5pbml0aWFscztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gW1xuICAgICAgICAgICAgbmV3IERhdGFHcmlkRGF0YUNlbGwoZ3JpZFNwZWMsIGluZGV4LCB7XG4gICAgICAgICAgICAgICAgJ3Jvd3NwYW4nOiBncmlkU3BlYy5yb3dTcGFuRm9yUmVjb3JkKGluZGV4KSxcbiAgICAgICAgICAgICAgICAnY29udGVudFN0cmluZyc6IGNvbnRlbnQgfHwgJz8nXG4gICAgICAgICAgICB9KVxuICAgICAgICBdO1xuICAgIH1cblxuICAgIGdlbmVyYXRlTW9kaWZpY2F0aW9uRGF0ZUNlbGxzKGdyaWRTcGVjOkRhdGFHcmlkU3BlY0xpbmVzLCBpbmRleDpzdHJpbmcpOkRhdGFHcmlkRGF0YUNlbGxbXSB7XG4gICAgICAgIHJldHVybiBbXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWREYXRhQ2VsbChncmlkU3BlYywgaW5kZXgsIHtcbiAgICAgICAgICAgICAgICAncm93c3Bhbic6IGdyaWRTcGVjLnJvd1NwYW5Gb3JSZWNvcmQoaW5kZXgpLFxuICAgICAgICAgICAgICAgICdjb250ZW50U3RyaW5nJzogVXRsLkpTLnRpbWVzdGFtcFRvVG9kYXlTdHJpbmcoRURERGF0YS5MaW5lc1tpbmRleF0ubW9kaWZpZWQudGltZSlcbiAgICAgICAgICAgIH0pXG4gICAgICAgIF07XG4gICAgfVxuXG4gICAgbWFrZU1ldGFEYXRhQ2VsbHNHZW5lcmF0b3JGdW5jdGlvbihpZCkge1xuICAgICAgICByZXR1cm4gKGdyaWRTcGVjOkRhdGFHcmlkU3BlY0xpbmVzLCBpbmRleDpzdHJpbmcpOkRhdGFHcmlkRGF0YUNlbGxbXSA9PiB7XG4gICAgICAgICAgICB2YXIgY29udGVudFN0ciA9ICcnLCBsaW5lID0gRURERGF0YS5MaW5lc1tpbmRleF0sIHR5cGUgPSBFREREYXRhLk1ldGFEYXRhVHlwZXNbaWRdO1xuICAgICAgICAgICAgaWYgKGxpbmUgJiYgdHlwZSAmJiBsaW5lLm1ldGEgJiYgKGNvbnRlbnRTdHIgPSBsaW5lLm1ldGFbaWRdIHx8ICcnKSkge1xuICAgICAgICAgICAgICAgIGNvbnRlbnRTdHIgPSBbIHR5cGUucHJlIHx8ICcnLCBjb250ZW50U3RyLCB0eXBlLnBvc3RmaXggfHwgJycgXS5qb2luKCcgJykudHJpbSgpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIFtcbiAgICAgICAgICAgICAgICBuZXcgRGF0YUdyaWREYXRhQ2VsbChncmlkU3BlYywgaW5kZXgsIHtcbiAgICAgICAgICAgICAgICAgICAgJ3Jvd3NwYW4nOiBncmlkU3BlYy5yb3dTcGFuRm9yUmVjb3JkKGluZGV4KSxcbiAgICAgICAgICAgICAgICAgICAgJ2NvbnRlbnRTdHJpbmcnOiBjb250ZW50U3RyXG4gICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIF07XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBTcGVjaWZpY2F0aW9uIGZvciBlYWNoIG9mIHRoZSBkYXRhIGNvbHVtbnMgdGhhdCB3aWxsIG1ha2UgdXAgdGhlIGJvZHkgb2YgdGhlIHRhYmxlXG4gICAgZGVmaW5lQ29sdW1uU3BlYygpOkRhdGFHcmlkQ29sdW1uU3BlY1tdIHtcbiAgICAgICAgdmFyIGxlZnRTaWRlOkRhdGFHcmlkQ29sdW1uU3BlY1tdLFxuICAgICAgICAgICAgbWV0YURhdGFDb2xzOkRhdGFHcmlkQ29sdW1uU3BlY1tdLFxuICAgICAgICAgICAgcmlnaHRTaWRlOkRhdGFHcmlkQ29sdW1uU3BlY1tdO1xuICAgICAgICBsZWZ0U2lkZSA9IFtcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZENvbHVtblNwZWMoMSwgdGhpcy5nZW5lcmF0ZUxpbmVOYW1lQ2VsbHMpLFxuICAgICAgICAgICAgbmV3IERhdGFHcmlkQ29sdW1uU3BlYygyLCB0aGlzLmdlbmVyYXRlU3RyYWluTmFtZUNlbGxzKSxcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZENvbHVtblNwZWMoMywgdGhpcy5nZW5lcmF0ZUNhcmJvblNvdXJjZUNlbGxzKSxcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZENvbHVtblNwZWMoNCwgdGhpcy5nZW5lcmF0ZUNhcmJvblNvdXJjZUxhYmVsaW5nQ2VsbHMpLFxuICAgICAgICAgICAgLy8gVGhlIENhcmJvbiBCYWxhbmNlIGNlbGxzIGFyZSBwb3B1bGF0ZWQgYnkgYSBjYWxsYmFjaywgdHJpZ2dlcmVkIHdoZW4gZmlyc3QgZGlzcGxheWVkXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRDb2x1bW5TcGVjKDUsIHRoaXMuZ2VuZXJhdGVDYXJib25CYWxhbmNlQmxhbmtDZWxscylcbiAgICAgICAgXTtcbiAgICAgICAgbWV0YURhdGFDb2xzID0gdGhpcy5tZXRhRGF0YUlEc1VzZWRJbkxpbmVzLm1hcCgoaWQsIGluZGV4KSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gbmV3IERhdGFHcmlkQ29sdW1uU3BlYyg2ICsgaW5kZXgsIHRoaXMubWFrZU1ldGFEYXRhQ2VsbHNHZW5lcmF0b3JGdW5jdGlvbihpZCkpO1xuICAgICAgICB9KTtcbiAgICAgICAgcmlnaHRTaWRlID0gW1xuICAgICAgICAgICAgbmV3IERhdGFHcmlkQ29sdW1uU3BlYyg2ICsgbWV0YURhdGFDb2xzLmxlbmd0aCwgdGhpcy5nZW5lcmF0ZUV4cGVyaW1lbnRlckluaXRpYWxzQ2VsbHMpLFxuICAgICAgICAgICAgbmV3IERhdGFHcmlkQ29sdW1uU3BlYyg3ICsgbWV0YURhdGFDb2xzLmxlbmd0aCwgdGhpcy5nZW5lcmF0ZU1vZGlmaWNhdGlvbkRhdGVDZWxscylcbiAgICAgICAgXTtcblxuICAgICAgICByZXR1cm4gbGVmdFNpZGUuY29uY2F0KG1ldGFEYXRhQ29scywgcmlnaHRTaWRlKTtcbiAgICB9XG5cbiAgICAvLyBTcGVjaWZpY2F0aW9uIGZvciBlYWNoIG9mIHRoZSBncm91cHMgdGhhdCB0aGUgaGVhZGVycyBhbmQgZGF0YSBjb2x1bW5zIGFyZSBvcmdhbml6ZWQgaW50b1xuICAgIGRlZmluZUNvbHVtbkdyb3VwU3BlYygpOkRhdGFHcmlkQ29sdW1uR3JvdXBTcGVjW10ge1xuICAgICAgICB2YXIgdG9wU2VjdGlvbjpEYXRhR3JpZENvbHVtbkdyb3VwU3BlY1tdID0gW1xuICAgICAgICAgICAgbmV3IERhdGFHcmlkQ29sdW1uR3JvdXBTcGVjKCdMaW5lIE5hbWUnLCB7ICdzaG93SW5WaXNpYmlsaXR5TGlzdCc6IGZhbHNlIH0pLFxuICAgICAgICAgICAgbmV3IERhdGFHcmlkQ29sdW1uR3JvdXBTcGVjKCdTdHJhaW4nKSxcbiAgICAgICAgICAgIG5ldyBEYXRhR3JpZENvbHVtbkdyb3VwU3BlYygnQ2FyYm9uIFNvdXJjZShzKScpLFxuICAgICAgICAgICAgbmV3IERhdGFHcmlkQ29sdW1uR3JvdXBTcGVjKCdMYWJlbGluZycpLFxuICAgICAgICAgICAgdGhpcy5jYXJib25CYWxhbmNlQ29sID0gbmV3IERhdGFHcmlkQ29sdW1uR3JvdXBTcGVjKCdDYXJib24gQmFsYW5jZScsIHtcbiAgICAgICAgICAgICAgICAnc2hvd0luVmlzaWJpbGl0eUxpc3QnOiBmYWxzZSwgICAgLy8gSGFzIGl0cyBvd24gaGVhZGVyIHdpZGdldFxuICAgICAgICAgICAgICAgICdoaWRkZW5CeURlZmF1bHQnOiB0cnVlLFxuICAgICAgICAgICAgICAgICdyZXZlYWxlZENhbGxiYWNrJzogU3R1ZHlMaW5lcy5jYXJib25CYWxhbmNlQ29sdW1uUmV2ZWFsZWRDYWxsYmFja1xuICAgICAgICAgICAgfSlcbiAgICAgICAgXTtcblxuICAgICAgICB2YXIgbWV0YURhdGFDb2xHcm91cHM6RGF0YUdyaWRDb2x1bW5Hcm91cFNwZWNbXTtcbiAgICAgICAgbWV0YURhdGFDb2xHcm91cHMgPSB0aGlzLm1ldGFEYXRhSURzVXNlZEluTGluZXMubWFwKChpZCwgaW5kZXgpID0+IHtcbiAgICAgICAgICAgIHZhciBtZFR5cGUgPSBFREREYXRhLk1ldGFEYXRhVHlwZXNbaWRdO1xuICAgICAgICAgICAgcmV0dXJuIG5ldyBEYXRhR3JpZENvbHVtbkdyb3VwU3BlYyhtZFR5cGUubmFtZSk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHZhciBib3R0b21TZWN0aW9uOkRhdGFHcmlkQ29sdW1uR3JvdXBTcGVjW10gPSBbXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRDb2x1bW5Hcm91cFNwZWMoJ0V4cGVyaW1lbnRlcicsIHsgJ2hpZGRlbkJ5RGVmYXVsdCc6IHRydWUgfSksXG4gICAgICAgICAgICBuZXcgRGF0YUdyaWRDb2x1bW5Hcm91cFNwZWMoJ0xhc3QgTW9kaWZpZWQnLCB7ICdoaWRkZW5CeURlZmF1bHQnOiB0cnVlIH0pXG4gICAgICAgIF07XG5cbiAgICAgICAgcmV0dXJuIHRvcFNlY3Rpb24uY29uY2F0KG1ldGFEYXRhQ29sR3JvdXBzLCBib3R0b21TZWN0aW9uKTtcbiAgICB9XG5cbiAgICAvLyBTcGVjaWZpY2F0aW9uIGZvciB0aGUgZ3JvdXBzIHRoYXQgcm93cyBjYW4gYmUgZ2F0aGVyZWQgaW50b1xuICAgIGRlZmluZVJvd0dyb3VwU3BlYygpOmFueSB7XG5cbiAgICAgICAgdmFyIHJvd0dyb3VwU3BlYyA9IFtdO1xuICAgICAgICBmb3IgKHZhciB4ID0gMDsgeCA8IHRoaXMuZ3JvdXBJRHNJbk9yZGVyLmxlbmd0aDsgeCsrKSB7XG4gICAgICAgICAgICB2YXIgaWQgPSB0aGlzLmdyb3VwSURzSW5PcmRlclt4XTtcblxuICAgICAgICAgICAgdmFyIHJvd0dyb3VwU3BlY0VudHJ5OmFueSA9IHsgICAgLy8gR3JvdXBzIGFyZSBudW1iZXJlZCBzdGFydGluZyBmcm9tIDBcbiAgICAgICAgICAgICAgICBuYW1lOiB0aGlzLmdyb3VwSURzVG9Hcm91cE5hbWVzW2lkXVxuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIHJvd0dyb3VwU3BlYy5wdXNoKHJvd0dyb3VwU3BlY0VudHJ5KTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiByb3dHcm91cFNwZWM7XG4gICAgfVxuXG4gICAgLy8gVGhlIHRhYmxlIGVsZW1lbnQgb24gdGhlIHBhZ2UgdGhhdCB3aWxsIGJlIHR1cm5lZCBpbnRvIHRoZSBEYXRhR3JpZC4gIEFueSBwcmVleGlzdGluZyB0YWJsZVxuICAgIC8vIGNvbnRlbnQgd2lsbCBiZSByZW1vdmVkLlxuICAgIGdldFRhYmxlRWxlbWVudCgpIHtcbiAgICAgICAgcmV0dXJuIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic3R1ZHlMaW5lc1RhYmxlXCIpO1xuICAgIH1cblxuICAgIC8vIEFuIGFycmF5IG9mIHVuaXF1ZSBpZGVudGlmaWVycyAobnVtYmVycywgbm90IHN0cmluZ3MpLCB1c2VkIHRvIGlkZW50aWZ5IHRoZSByZWNvcmRzIGluIHRoZVxuICAgIC8vIGRhdGEgc2V0IGJlaW5nIGRpc3BsYXllZFxuICAgIGdldFJlY29yZElEcygpIHtcbiAgICAgICAgcmV0dXJuIE9iamVjdC5rZXlzKEVERERhdGEuTGluZXMpO1xuICAgIH1cblxuICAgIC8vIFRoaXMgaXMgY2FsbGVkIHRvIGdlbmVyYXRlIHRoZSBhcnJheSBvZiBjdXN0b20gaGVhZGVyIHdpZGdldHMuIFRoZSBvcmRlciBvZiB0aGUgYXJyYXkgd2lsbCBiZVxuICAgIC8vIHRoZSBvcmRlciB0aGV5IGFyZSBhZGRlZCB0byB0aGUgaGVhZGVyIGJhci4gSXQncyBwZXJmZWN0bHkgZmluZSB0byByZXR1cm4gYW4gZW1wdHkgYXJyYXkuXG4gICAgY3JlYXRlQ3VzdG9tSGVhZGVyV2lkZ2V0cyhkYXRhR3JpZDpEYXRhR3JpZCk6RGF0YUdyaWRIZWFkZXJXaWRnZXRbXSB7XG4gICAgICAgIHZhciB3aWRnZXRTZXQ6RGF0YUdyaWRIZWFkZXJXaWRnZXRbXSA9IFtdO1xuXG4gICAgICAgIC8vIENyZWF0ZSBhIHNpbmdsZSB3aWRnZXQgZm9yIHN1YnN0cmluZyBzZWFyY2hpbmdcbiAgICAgICAgdmFyIHNlYXJjaExpbmVzV2lkZ2V0ID0gbmV3IERHTGluZXNTZWFyY2hXaWRnZXQoZGF0YUdyaWQsIHRoaXMsICdTZWFyY2ggTGluZXMnLCAzMCwgZmFsc2UpO1xuICAgICAgICB3aWRnZXRTZXQucHVzaChzZWFyY2hMaW5lc1dpZGdldCk7XG4gICAgICAgIC8vIEEgXCJDYXJib24gQmFsYW5jZVwiIGNoZWNrYm94XG4gICAgICAgIHZhciBzaG93Q2FyYm9uQmFsYW5jZVdpZGdldCA9IG5ldyBER1Nob3dDYXJib25CYWxhbmNlV2lkZ2V0KGRhdGFHcmlkLCB0aGlzKTtcbiAgICAgICAgc2hvd0NhcmJvbkJhbGFuY2VXaWRnZXQuZGlzcGxheUJlZm9yZVZpZXdNZW51KHRydWUpO1xuICAgICAgICB3aWRnZXRTZXQucHVzaChzaG93Q2FyYm9uQmFsYW5jZVdpZGdldCk7XG4gICAgICAgIHRoaXMuY2FyYm9uQmFsYW5jZVdpZGdldCA9IHNob3dDYXJib25CYWxhbmNlV2lkZ2V0O1xuICAgICAgICAvLyBBIFwiZGVzZWxlY3QgYWxsXCIgYnV0dG9uXG4gICAgICAgIHZhciBkZXNlbGVjdEFsbFdpZGdldCA9IG5ldyBER0Rlc2VsZWN0QWxsV2lkZ2V0KGRhdGFHcmlkLCB0aGlzKTtcbiAgICAgICAgZGVzZWxlY3RBbGxXaWRnZXQuZGlzcGxheUJlZm9yZVZpZXdNZW51KHRydWUpO1xuICAgICAgICB3aWRnZXRTZXQucHVzaChkZXNlbGVjdEFsbFdpZGdldCk7XG4gICAgICAgIC8vIEEgXCJzZWxlY3QgYWxsXCIgYnV0dG9uXG4gICAgICAgIHZhciBzZWxlY3RBbGxXaWRnZXQgPSBuZXcgREdTZWxlY3RBbGxXaWRnZXQoZGF0YUdyaWQsIHRoaXMpO1xuICAgICAgICBzZWxlY3RBbGxXaWRnZXQuZGlzcGxheUJlZm9yZVZpZXdNZW51KHRydWUpO1xuICAgICAgICB3aWRnZXRTZXQucHVzaChzZWxlY3RBbGxXaWRnZXQpO1xuICAgICAgICByZXR1cm4gd2lkZ2V0U2V0O1xuICAgIH1cblxuICAgIC8vIFRoaXMgaXMgY2FsbGVkIHRvIGdlbmVyYXRlIHRoZSBhcnJheSBvZiBjdXN0b20gb3B0aW9ucyBtZW51IHdpZGdldHMuIFRoZSBvcmRlciBvZiB0aGUgYXJyYXlcbiAgICAvLyB3aWxsIGJlIHRoZSBvcmRlciB0aGV5IGFyZSBkaXNwbGF5ZWQgaW4gdGhlIG1lbnUuIEVtcHR5IGFycmF5ID0gT0suXG4gICAgY3JlYXRlQ3VzdG9tT3B0aW9uc1dpZGdldHMoZGF0YUdyaWQ6RGF0YUdyaWQpOkRhdGFHcmlkT3B0aW9uV2lkZ2V0W10ge1xuICAgICAgICB2YXIgd2lkZ2V0U2V0OkRhdGFHcmlkT3B0aW9uV2lkZ2V0W10gPSBbXTtcblxuICAgICAgICAvLyBDcmVhdGUgYSBzaW5nbGUgd2lkZ2V0IGZvciBzaG93aW5nIGRpc2FibGVkIExpbmVzXG4gICAgICAgIHZhciBncm91cExpbmVzV2lkZ2V0ID0gbmV3IERHR3JvdXBTdHVkeVJlcGxpY2F0ZXNXaWRnZXQoZGF0YUdyaWQsIHRoaXMpO1xuICAgICAgICB3aWRnZXRTZXQucHVzaChncm91cExpbmVzV2lkZ2V0KTtcbiAgICAgICAgdmFyIGRpc2FibGVkTGluZXNXaWRnZXQgPSBuZXcgREdEaXNhYmxlZExpbmVzV2lkZ2V0KGRhdGFHcmlkLCB0aGlzKTtcbiAgICAgICAgd2lkZ2V0U2V0LnB1c2goZGlzYWJsZWRMaW5lc1dpZGdldCk7XG4gICAgICAgIHJldHVybiB3aWRnZXRTZXQ7XG4gICAgfVxuXG4gICAgLy8gVGhpcyBpcyBjYWxsZWQgYWZ0ZXIgZXZlcnl0aGluZyBpcyBpbml0aWFsaXplZCwgaW5jbHVkaW5nIHRoZSBjcmVhdGlvbiBvZiB0aGUgdGFibGUgY29udGVudC5cbiAgICBvbkluaXRpYWxpemVkKGRhdGFHcmlkOkRhdGFHcmlkKTp2b2lkIHtcblxuICAgICAgICAvLyBXaXJlIHVwIHRoZSAnYWN0aW9uIHBhbmVscycgZm9yIHRoZSBMaW5lcyBhbmQgQXNzYXlzIHNlY3Rpb25zXG4gICAgICAgIHZhciBsaW5lc1RhYmxlID0gdGhpcy5nZXRUYWJsZUVsZW1lbnQoKTtcbiAgICAgICAgJChsaW5lc1RhYmxlKS5vbignY2hhbmdlJywgJzpjaGVja2JveCcsICgpID0+IFN0dWR5TGluZXMucXVldWVMaW5lc0FjdGlvblBhbmVsU2hvdygpKTtcblxuICAgICAgICAvLyBhZGQgY2xpY2sgaGFuZGxlciBmb3IgbWVudSBvbiBsaW5lIG5hbWUgY2VsbHNcbiAgICAgICAgJCgnI3N0dWR5TGluZXNUYWJsZScpLm9uKCdjbGljaycsICdhLmxpbmUtZWRpdC1saW5rJywgKGV2KSA9PiB7XG4gICAgICAgICAgICBTdHVkeUxpbmVzLmVkaXRMaW5lcyhbJChldi50YXJnZXQpLmNsb3Nlc3QoJy5wb3B1cGNlbGwnKS5maW5kKCdpbnB1dCcpLnZhbCgpXSk7XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIFRoaXMgY2FsbHMgZG93biBpbnRvIHRoZSBpbnN0YW50aWF0ZWQgd2lkZ2V0IGFuZCBhbHRlcnMgaXRzIHN0eWxpbmcsXG4gICAgICAgIC8vIHNvIHdlIG5lZWQgdG8gZG8gaXQgYWZ0ZXIgdGhlIHRhYmxlIGhhcyBiZWVuIGNyZWF0ZWQuXG4gICAgICAgIHRoaXMuZW5hYmxlQ2FyYm9uQmFsYW5jZVdpZGdldChmYWxzZSk7XG5cbiAgICAgICAgLy8gV2lyZS1pbiBvdXIgY3VzdG9tIGVkaXQgZmllbGRzIGZvciB0aGUgU3R1ZGllcyBwYWdlLCBhbmQgY29udGludWUgd2l0aCBnZW5lcmFsIGluaXRcbiAgICAgICAgU3R1ZHlMaW5lcy5wcmVwYXJlQWZ0ZXJMaW5lc1RhYmxlKCk7XG4gICAgfVxufVxuXG4vLyBXaGVuIHVuY2hlY2tlZCwgdGhpcyBoaWRlcyB0aGUgc2V0IG9mIExpbmVzIHRoYXQgYXJlIG1hcmtlZCBhcyBkaXNhYmxlZC5cbmNsYXNzIERHRGlzYWJsZWRMaW5lc1dpZGdldCBleHRlbmRzIERhdGFHcmlkT3B0aW9uV2lkZ2V0IHtcblxuICAgIGNyZWF0ZUVsZW1lbnRzKHVuaXF1ZUlEOmFueSk6dm9pZCB7XG4gICAgICAgIHZhciBjYklEOnN0cmluZyA9IHRoaXMuZGF0YUdyaWRTcGVjLnRhYmxlU3BlYy5pZCsnU2hvd0RMaW5lc0NCJyt1bmlxdWVJRDtcbiAgICAgICAgdmFyIGNiOkhUTUxJbnB1dEVsZW1lbnQgPSB0aGlzLl9jcmVhdGVDaGVja2JveChjYklELCBjYklELCAnMScpO1xuICAgICAgICAkKGNiKS5jbGljayggKGUpID0+IHRoaXMuZGF0YUdyaWRPd25lck9iamVjdC5jbGlja2VkT3B0aW9uV2lkZ2V0KGUpICk7XG4gICAgICAgIGlmICh0aGlzLmlzRW5hYmxlZEJ5RGVmYXVsdCgpKSB7XG4gICAgICAgICAgICBjYi5zZXRBdHRyaWJ1dGUoJ2NoZWNrZWQnLCAnY2hlY2tlZCcpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuY2hlY2tCb3hFbGVtZW50ID0gY2I7XG4gICAgICAgIHRoaXMubGFiZWxFbGVtZW50ID0gdGhpcy5fY3JlYXRlTGFiZWwoJ1Nob3cgRGlzYWJsZWQnLCBjYklEKTtcbiAgICAgICAgdGhpcy5fY3JlYXRlZEVsZW1lbnRzID0gdHJ1ZTtcbiAgICB9XG5cbiAgICBhcHBseUZpbHRlclRvSURzKHJvd0lEczpzdHJpbmdbXSk6c3RyaW5nW10ge1xuXG4gICAgICAgIHZhciBjaGVja2VkOmJvb2xlYW4gPSBmYWxzZTtcbiAgICAgICAgaWYgKHRoaXMuY2hlY2tCb3hFbGVtZW50LmNoZWNrZWQpIHtcbiAgICAgICAgICAgIGNoZWNrZWQgPSB0cnVlO1xuICAgICAgICB9XG4gICAgICAgIC8vIElmIHRoZSBib3ggaXMgY2hlY2tlZCwgcmV0dXJuIHRoZSBzZXQgb2YgSURzIHVuZmlsdGVyZWRcbiAgICAgICAgaWYgKGNoZWNrZWQgJiYgcm93SURzICYmIEVERERhdGEuY3VycmVudFN0dWR5V3JpdGFibGUpIHtcbiAgICAgICAgICAgICQoXCIjZW5hYmxlQnV0dG9uXCIpLnJlbW92ZUNsYXNzKCdvZmYnKTtcbiAgICAgICAgICAgIHJldHVybiByb3dJRHM7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAkKFwiI2VuYWJsZUJ1dHRvblwiKS5hZGRDbGFzcygnb2ZmJyk7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgZmlsdGVyZWRJRHMgPSBbXTtcbiAgICAgICAgZm9yICh2YXIgciA9IDA7IHIgPCByb3dJRHMubGVuZ3RoOyByKyspIHtcbiAgICAgICAgICAgIHZhciBpZCA9IHJvd0lEc1tyXTtcbiAgICAgICAgICAgIC8vIEhlcmUgaXMgdGhlIGNvbmRpdGlvbiB0aGF0IGRldGVybWluZXMgd2hldGhlciB0aGUgcm93cyBhc3NvY2lhdGVkIHdpdGggdGhpcyBJRCBhcmVcbiAgICAgICAgICAgIC8vIHNob3duIG9yIGhpZGRlbi5cbiAgICAgICAgICAgIGlmIChFREREYXRhLkxpbmVzW2lkXS5hY3RpdmUpIHtcbiAgICAgICAgICAgICAgICBmaWx0ZXJlZElEcy5wdXNoKGlkKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZmlsdGVyZWRJRHM7XG4gICAgfVxuXG4gICAgaW5pdGlhbEZvcm1hdFJvd0VsZW1lbnRzRm9ySUQoZGF0YVJvd09iamVjdHM6YW55LCByb3dJRDpzdHJpbmcpOmFueSB7XG4gICAgICAgIGlmICghRURERGF0YS5MaW5lc1tyb3dJRF0uYWN0aXZlKSB7XG4gICAgICAgICAgICAkLmVhY2goZGF0YVJvd09iamVjdHMsICh4LCByb3cpID0+ICQocm93LmdldEVsZW1lbnQoKSkuYWRkQ2xhc3MoJ2Rpc2FibGVkUmVjb3JkJykpO1xuICAgICAgICB9XG4gICAgfVxufVxuXG4vLyBBIHdpZGdldCB0byB0b2dnbGUgcmVwbGljYXRlIGdyb3VwaW5nIG9uIGFuZCBvZmZcbmNsYXNzIERHR3JvdXBTdHVkeVJlcGxpY2F0ZXNXaWRnZXQgZXh0ZW5kcyBEYXRhR3JpZE9wdGlvbldpZGdldCB7XG5cbiAgICBjcmVhdGVFbGVtZW50cyh1bmlxdWVJRDphbnkpOnZvaWQge1xuICAgICAgICB2YXIgcFRoaXMgPSB0aGlzO1xuICAgICAgICB2YXIgY2JJRDpzdHJpbmcgPSB0aGlzLmRhdGFHcmlkU3BlYy50YWJsZVNwZWMuaWQrJ0dyb3VwU3R1ZHlSZXBsaWNhdGVzQ0InK3VuaXF1ZUlEO1xuICAgICAgICB2YXIgY2I6SFRNTElucHV0RWxlbWVudCA9IHRoaXMuX2NyZWF0ZUNoZWNrYm94KGNiSUQsIGNiSUQsICcxJyk7XG4gICAgICAgICQoY2IpLmNsaWNrKFxuICAgICAgICAgICAgZnVuY3Rpb24oZSkge1xuICAgICAgICAgICAgICAgIGlmIChwVGhpcy5jaGVja0JveEVsZW1lbnQuY2hlY2tlZCkge1xuICAgICAgICAgICAgICAgICAgICBwVGhpcy5kYXRhR3JpZE93bmVyT2JqZWN0LnR1cm5PblJvd0dyb3VwaW5nKCk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgcFRoaXMuZGF0YUdyaWRPd25lck9iamVjdC50dXJuT2ZmUm93R3JvdXBpbmcoKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICk7XG4gICAgICAgIGlmICh0aGlzLmlzRW5hYmxlZEJ5RGVmYXVsdCgpKSB7XG4gICAgICAgICAgICBjYi5zZXRBdHRyaWJ1dGUoJ2NoZWNrZWQnLCAnY2hlY2tlZCcpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuY2hlY2tCb3hFbGVtZW50ID0gY2I7XG4gICAgICAgIHRoaXMubGFiZWxFbGVtZW50ID0gdGhpcy5fY3JlYXRlTGFiZWwoJ0dyb3VwIFJlcGxpY2F0ZXMnLCBjYklEKTtcbiAgICAgICAgdGhpcy5fY3JlYXRlZEVsZW1lbnRzID0gdHJ1ZTtcbiAgICB9XG59XG5cbi8vIFRoaXMgaXMgYSBEYXRhR3JpZEhlYWRlcldpZGdldCBkZXJpdmVkIGZyb20gREdTZWFyY2hXaWRnZXQuIEl0J3MgYSBzZWFyY2ggZmllbGQgdGhhdCBvZmZlcnNcbi8vIG9wdGlvbnMgZm9yIGFkZGl0aW9uYWwgZGF0YSB0eXBlcywgcXVlcnlpbmcgdGhlIHNlcnZlciBmb3IgcmVzdWx0cy5cbmNsYXNzIERHTGluZXNTZWFyY2hXaWRnZXQgZXh0ZW5kcyBER1NlYXJjaFdpZGdldCB7XG5cbiAgICBzZWFyY2hEaXNjbG9zdXJlRWxlbWVudDphbnk7XG5cbiAgICBjb25zdHJ1Y3RvcihkYXRhR3JpZE93bmVyT2JqZWN0OmFueSwgZGF0YUdyaWRTcGVjOmFueSwgcGxhY2VIb2xkZXI6c3RyaW5nLCBzaXplOm51bWJlcixcbiAgICAgICAgICAgIGdldHNGb2N1czpib29sZWFuKSB7XG4gICAgICAgIHN1cGVyKGRhdGFHcmlkT3duZXJPYmplY3QsIGRhdGFHcmlkU3BlYywgcGxhY2VIb2xkZXIsIHNpemUsIGdldHNGb2N1cyk7XG4gICAgfVxuXG4gICAgLy8gVGhlIHVuaXF1ZUlEIGlzIHByb3ZpZGVkIHRvIGFzc2lzdCB0aGUgd2lkZ2V0IGluIGF2b2lkaW5nIGNvbGxpc2lvbnMgd2hlbiBjcmVhdGluZyBpbnB1dFxuICAgIC8vIGVsZW1lbnQgbGFiZWxzIG9yIG90aGVyIHRoaW5ncyByZXF1aXJpbmcgYW4gSUQuXG4gICAgY3JlYXRlRWxlbWVudHModW5pcXVlSUQ6YW55KTp2b2lkIHtcbiAgICAgICAgc3VwZXIuY3JlYXRlRWxlbWVudHModW5pcXVlSUQpO1xuICAgICAgICB0aGlzLmNyZWF0ZWRFbGVtZW50cyh0cnVlKTtcbiAgICB9XG5cbiAgICAvLyBUaGlzIGlzIGNhbGxlZCB0byBhcHBlbmQgdGhlIHdpZGdldCBlbGVtZW50cyBiZW5lYXRoIHRoZSBnaXZlbiBlbGVtZW50LiBJZiB0aGUgZWxlbWVudHMgaGF2ZVxuICAgIC8vIG5vdCBiZWVuIGNyZWF0ZWQgeWV0LCB0aGV5IGFyZSBjcmVhdGVkLCBhbmQgdGhlIHVuaXF1ZUlEIGlzIHBhc3NlZCBhbG9uZy5cbiAgICBhcHBlbmRFbGVtZW50cyhjb250YWluZXI6YW55LCB1bmlxdWVJRDphbnkpOnZvaWQge1xuICAgICAgICBpZiAoIXRoaXMuY3JlYXRlZEVsZW1lbnRzKCkpIHtcbiAgICAgICAgICAgIHRoaXMuY3JlYXRlRWxlbWVudHModW5pcXVlSUQpO1xuICAgICAgICB9XG4gICAgICAgIGNvbnRhaW5lci5hcHBlbmRDaGlsZCh0aGlzLmVsZW1lbnQpO1xuICAgIH1cbn1cblxuXG5cbi8vIEEgaGVhZGVyIHdpZGdldCB0byBwcmVwYXJlIHRoZSBDYXJib24gQmFsYW5jZSB0YWJsZSBjZWxscywgYW5kIHNob3cgb3IgaGlkZSB0aGVtLlxuY2xhc3MgREdTaG93Q2FyYm9uQmFsYW5jZVdpZGdldCBleHRlbmRzIERhdGFHcmlkSGVhZGVyV2lkZ2V0IHtcblxuICAgIGNoZWNrQm94RWxlbWVudDphbnk7XG4gICAgbGFiZWxFbGVtZW50OmFueTtcbiAgICBoaWdobGlnaHRlZDpib29sZWFuO1xuICAgIGNoZWNrYm94RW5hYmxlZDpib29sZWFuO1xuXG4gICAgLy8gc3RvcmUgbW9yZSBzcGVjaWZpYyB0eXBlIG9mIHNwZWMgdG8gZ2V0IHRvIGNhcmJvbkJhbGFuY2VDb2wgbGF0ZXJcbiAgICBwcml2YXRlIF9saW5lU3BlYzpEYXRhR3JpZFNwZWNMaW5lcztcblxuICAgIGNvbnN0cnVjdG9yKGRhdGFHcmlkT3duZXJPYmplY3Q6RGF0YUdyaWQsIGRhdGFHcmlkU3BlYzpEYXRhR3JpZFNwZWNMaW5lcykge1xuICAgICAgICBzdXBlcihkYXRhR3JpZE93bmVyT2JqZWN0LCBkYXRhR3JpZFNwZWMpO1xuICAgICAgICB0aGlzLmNoZWNrYm94RW5hYmxlZCA9IHRydWU7XG4gICAgICAgIHRoaXMuaGlnaGxpZ2h0ZWQgPSBmYWxzZTtcbiAgICAgICAgdGhpcy5fbGluZVNwZWMgPSBkYXRhR3JpZFNwZWM7XG4gICAgfVxuXG4gICAgY3JlYXRlRWxlbWVudHModW5pcXVlSUQ6YW55KTp2b2lkIHtcbiAgICAgICAgdmFyIGNiSUQ6c3RyaW5nID0gdGhpcy5kYXRhR3JpZFNwZWMudGFibGVTcGVjLmlkICsgJ0NhckJhbCcgKyB1bmlxdWVJRDtcbiAgICAgICAgdmFyIGNiOkhUTUxJbnB1dEVsZW1lbnQgPSB0aGlzLl9jcmVhdGVDaGVja2JveChjYklELCBjYklELCAnMScpO1xuICAgICAgICBjYi5jbGFzc05hbWUgPSAndGFibGVDb250cm9sJztcbiAgICAgICAgJChjYikuY2xpY2soKGV2OkpRdWVyeU1vdXNlRXZlbnRPYmplY3QpOnZvaWQgPT4ge1xuICAgICAgICAgICAgdGhpcy5hY3RpdmF0ZUNhcmJvbkJhbGFuY2UoKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgdmFyIGxhYmVsOkhUTUxFbGVtZW50ID0gdGhpcy5fY3JlYXRlTGFiZWwoJ0NhcmJvbiBCYWxhbmNlJywgY2JJRCk7XG5cbiAgICAgICAgdmFyIHNwYW46SFRNTEVsZW1lbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwic3BhblwiKTtcbiAgICAgICAgc3Bhbi5jbGFzc05hbWUgPSAndGFibGVDb250cm9sJztcbiAgICAgICAgc3Bhbi5hcHBlbmRDaGlsZChjYik7XG4gICAgICAgIHNwYW4uYXBwZW5kQ2hpbGQobGFiZWwpO1xuXG4gICAgICAgIHRoaXMuY2hlY2tCb3hFbGVtZW50ID0gY2I7XG4gICAgICAgIHRoaXMubGFiZWxFbGVtZW50ID0gbGFiZWw7XG4gICAgICAgIHRoaXMuZWxlbWVudCA9IHNwYW47XG4gICAgICAgIHRoaXMuY3JlYXRlZEVsZW1lbnRzKHRydWUpO1xuICAgIH1cblxuICAgIGhpZ2hsaWdodChoOmJvb2xlYW4pOnZvaWQge1xuICAgICAgICB0aGlzLmhpZ2hsaWdodGVkID0gaDtcbiAgICAgICAgaWYgKHRoaXMuY2hlY2tib3hFbmFibGVkKSB7XG4gICAgICAgICAgICBpZiAoaCkge1xuICAgICAgICAgICAgICAgIHRoaXMubGFiZWxFbGVtZW50LnN0eWxlLmNvbG9yID0gJ3JlZCc7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRoaXMubGFiZWxFbGVtZW50LnN0eWxlLmNvbG9yID0gJyc7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBlbmFibGUoaDpib29sZWFuKTp2b2lkIHtcbiAgICAgICAgdGhpcy5jaGVja2JveEVuYWJsZWQgPSBoO1xuICAgICAgICBpZiAoaCkge1xuICAgICAgICAgICAgdGhpcy5oaWdobGlnaHQodGhpcy5oaWdobGlnaHRlZCk7XG4gICAgICAgICAgICB0aGlzLmNoZWNrQm94RWxlbWVudC5yZW1vdmVBdHRyaWJ1dGUoJ2Rpc2FibGVkJyk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLmxhYmVsRWxlbWVudC5zdHlsZS5jb2xvciA9ICdncmF5JztcbiAgICAgICAgICAgIHRoaXMuY2hlY2tCb3hFbGVtZW50LnNldEF0dHJpYnV0ZSgnZGlzYWJsZWQnLCB0cnVlKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgYWN0aXZhdGVDYXJib25CYWxhbmNlKCk6dm9pZCB7XG4gICAgICAgIHZhciB1aTpGdWxsU3R1ZHlCaW9tYXNzVUksXG4gICAgICAgICAgICBjYWxsYmFjazpGdWxsU3R1ZHlCaW9tYXNzVUlSZXN1bHRzQ2FsbGJhY2s7XG4gICAgICAgIGNhbGxiYWNrID0gKGVycm9yOnN0cmluZyxcbiAgICAgICAgICAgICAgICBtZXRhYm9saWNNYXBJRD86bnVtYmVyLFxuICAgICAgICAgICAgICAgIG1ldGFib2xpY01hcEZpbGVuYW1lPzpzdHJpbmcsXG4gICAgICAgICAgICAgICAgZmluYWxCaW9tYXNzPzpudW1iZXIpOnZvaWQgPT4ge1xuICAgICAgICAgICAgaWYgKCFlcnJvcikge1xuICAgICAgICAgICAgICAgIFN0dWR5TGluZXMubWV0YWJvbGljTWFwSUQgPSBtZXRhYm9saWNNYXBJRDtcbiAgICAgICAgICAgICAgICBTdHVkeUxpbmVzLm1ldGFib2xpY01hcE5hbWUgPSBtZXRhYm9saWNNYXBGaWxlbmFtZTtcbiAgICAgICAgICAgICAgICBTdHVkeUxpbmVzLmJpb21hc3NDYWxjdWxhdGlvbiA9IGZpbmFsQmlvbWFzcztcbiAgICAgICAgICAgICAgICBTdHVkeUxpbmVzLm9uQ2hhbmdlZE1ldGFib2xpY01hcCgpO1xuICAgICAgICAgICAgICAgIHRoaXMuY2hlY2tCb3hFbGVtZW50LmNoZWNrZWQgPSB0cnVlO1xuICAgICAgICAgICAgICAgIHRoaXMuZGF0YUdyaWRPd25lck9iamVjdC5zaG93Q29sdW1uKHRoaXMuX2xpbmVTcGVjLmNhcmJvbkJhbGFuY2VDb2wpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuICAgICAgICBpZiAodGhpcy5jaGVja0JveEVsZW1lbnQuY2hlY2tlZCkge1xuICAgICAgICAgICAgLy8gV2UgbmVlZCB0byBnZXQgYSBiaW9tYXNzIGNhbGN1bGF0aW9uIHRvIG11bHRpcGx5IGFnYWluc3QgT0QuXG4gICAgICAgICAgICAvLyBIYXZlIHRoZXkgc2V0IHRoaXMgdXAgeWV0P1xuICAgICAgICAgICAgaWYgKCFTdHVkeUxpbmVzLmJpb21hc3NDYWxjdWxhdGlvbiB8fCBTdHVkeUxpbmVzLmJpb21hc3NDYWxjdWxhdGlvbiA9PT0gLTEpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmNoZWNrQm94RWxlbWVudC5jaGVja2VkID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgLy8gTXVzdCBzZXR1cCB0aGUgYmlvbWFzc1xuICAgICAgICAgICAgICAgIHVpID0gbmV3IEZ1bGxTdHVkeUJpb21hc3NVSShjYWxsYmFjayk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRoaXMuZGF0YUdyaWRPd25lck9iamVjdC5zaG93Q29sdW1uKHRoaXMuX2xpbmVTcGVjLmNhcmJvbkJhbGFuY2VDb2wpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5kYXRhR3JpZE93bmVyT2JqZWN0LmhpZGVDb2x1bW4odGhpcy5fbGluZVNwZWMuY2FyYm9uQmFsYW5jZUNvbCk7XG4gICAgICAgIH1cbiAgICB9XG59XG5cblxuLy8gdXNlIEpRdWVyeSByZWFkeSBldmVudCBzaG9ydGN1dCB0byBjYWxsIHByZXBhcmVJdCB3aGVuIHBhZ2UgaXMgcmVhZHlcbiQoKCkgPT4gU3R1ZHlMaW5lcy5wcmVwYXJlSXQoKSk7Il19