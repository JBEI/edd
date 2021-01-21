"use strict";

import * as $ from "jquery";
import Handsontable from "handsontable";

import { Access, Item } from "../modules/table/Access";
import * as Config from "../modules/table/Config";
import { Filter } from "../modules/table/Filter";
import * as Forms from "../modules/Forms";
import { Graph } from "../modules/table/Graph";
import * as StudyBase from "../modules/Study";
import * as Utl from "../modules/Utl";

declare let window: StudyBase.EDDWindow;
const EDDData = window.EDDData || ({} as EDDData);

type TableMode = "table-assay" | "table-measurement";
type BarGraphMode = "bar-line" | "bar-measurement" | "bar-time";
type ViewingMode = "plot-line" | TableMode | BarGraphMode;

// default start on line graph
let viewingMode: ViewingMode = "plot-line";
let filter: Filter;
let plot: Graph;
let access: Access;
let assayTable: Handsontable;
let measureTable: Handsontable;

// define managers for forms with metadata
let assayMetadataManager: Forms.FormMetadataManager;

/**
 * Forces values to string, falsy === ""
 */
const str = (x: any): string => `${x || ""}`;
/**
 * Converts an AssayRecord to an HTML <INPUT> for a form.
 */
const _assayToInput = (assay: AssayRecord): JQuery =>
    $(`<input type="hidden" name="assayId" value="${assay.id}" />`);
/**
 * Converts an Item to an HTML <INPUT> for a form.
 */
const _itemToInput = (item: Item): JQuery =>
    $(`<input type="hidden" name="measurementId" value="${item.measurement.id}" />`);

function _display(selector: string, mode: ViewingMode) {
    // highlight the active button
    const buttons = $("#displayModeButtons");
    buttons.find(".active").removeClass("active");
    buttons.find(selector).addClass("active");
    // save the current state
    viewingMode = mode;
    updateDisplaySetting(mode);
    // trigger event to refresh display
    $.event.trigger("eddfilter");
}

function computeHeight(): number {
    const container = $("#tableArea");
    // reserve about 200 pixels for filter section
    const vertical = $(window).height() - container.offset().top - 200;
    // always reserve at least 500 pixels for table
    return Math.max(500, vertical);
}

// Called when initial non-measurement data is loaded
function onDataLoad() {
    access = Access.initAccess(EDDData);
    filter = Filter.create(access);
    $("#mainFilterSection").append(filter.createElements());
    plot = Graph.create(document.getElementById("graphArea"), access);

    setupEvents();
    setupModals();
    setupTables();
    fetchDisplaySetting();
    fetchMeasurements();
}

interface DisplaySetting {
    type: ViewingMode;
}

function updateDisplaySetting(mode: ViewingMode) {
    const url = $("#settinglink").attr("href");
    const payload: DisplaySetting = { "type": mode };
    $.ajax({
        "data": {
            "csrfmiddlewaretoken": Utl.EDD.findCSRFToken(),
            "data": JSON.stringify(payload),
        },
        "type": "POST",
        "url": url,
    });
}

function fetchDisplaySetting(): void {
    const url = $("#settinglink").attr("href");
    $.ajax({ "dataType": "json", "url": url }).done((payload: DisplaySetting) => {
        // find any controls with viewmode matching payload.type, and auto-click it
        $(".edd-view-select")
            .filter(`[data-viewmode=${payload?.type}]`)
            .trigger("click");
    });
}

function fetchMeasurements() {
    EDDData.valueLinks.forEach((link: string) => {
        $.ajax({
            "dataType": "json",
            "type": "GET",
            "url": link,
        }).done((payload) => {
            filter.update(payload);
            $.event.trigger("eddfilter");
        });
    });
}

function refreshDisplay() {
    $("#graphLoading").addClass("hidden");
    // show/hide elements for the selected mode
    const isTable = viewingMode.startsWith("table-");
    $("#tableArea").toggleClass("hidden", !isTable);
    $("#graphDisplayContainer").toggleClass("hidden", isTable);
    // check on any changes in colors
    const items = filter.measurements();
    plot.assignColors(items);
    filter.refresh(items);
    // update display based on current display mode
    if (viewingMode === "table-assay") {
        $("#assayTable").removeClass("hidden");
        $("#measurementTable").addClass("hidden");
        assayTable.loadData(filter.assays());
    } else if (viewingMode === "table-measurement") {
        $("#assayTable").addClass("hidden");
        $("#measurementTable").removeClass("hidden");
        // always disable buttons in measurement mode
        $(".edd-add-button,.edd-edit-button")
            .addClass("disabled")
            .prop("disabled", true);
        measureTable.loadData(filter.measurements());
    } else if (!isTable) {
        remakeMainGraphArea(items);
    }
}

function remakeMainGraphArea(items: Item[]) {
    // when no points to display show message that there's no data to display
    $("#noData").toggleClass("hidden", items.length > 0);
    // replace graph
    $("#graphArea")
        .toggleClass("hidden", items.length === 0)
        .find("svg")
        .empty();
    let displayed = 0;
    switch (viewingMode) {
        case "plot-line":
            displayed = plot.renderLinePlot(items);
            break;
        case "bar-line":
            displayed = plot.renderBarPlot(items, Graph.GroupLine);
            break;
        case "bar-measurement":
            displayed = plot.renderBarPlot(items, Graph.GroupType);
            break;
        case "bar-time":
            displayed = plot.renderBarPlot(items, Graph.GroupTime);
            break;
    }
    $(".badge.edd-measurement-count").text(`${items.length}`);
    $(".badge.edd-value-count").text(`${displayed}`);
}

function setupEvents(): void {
    // add refresh handler when filter event triggered
    $(document).on("eddfilter", Utl.debounce(refreshDisplay));
    // add click handlers to toggle display modes
    $("#displayModeButtons").on("click", ".edd-view-select", (event) => {
        const target = $(event.currentTarget);
        _display(target.data("selector"), target.data("viewmode"));
    });
    // TODO: handle the buttons for edit, add, delete
    $(".edd-add-button").on("click", (event) => {
        if (viewingMode === "table-assay") {
            const rows = assayTable.getSourceData() as AssayRecord[];
            const selected = rows.filter((assay) => assay?.selected);
            if (selected.length) {
                showAddMeasurementDialog(selected);
            }
        }
    });
    $(".edd-edit-button").on("click", (event) => {
        if (viewingMode === "table-assay") {
            const rows = assayTable.getSourceData() as AssayRecord[];
            const selected = rows.filter((assay) => assay?.selected);
            if (selected.length) {
                showEditAssayDialog(selected);
            }
        }
        return false;
    });
    $(".edd-export-button").on("click", (event) => {
        const form = $("#exportForm");
        const inputs = form.find(".hidden-inputs").empty();
        if (viewingMode === "table-assay") {
            const rows = assayTable.getSourceData() as AssayRecord[];
            const selected = rows.filter((assay) => assay?.selected);
            // when nothing selected, act as if everything selected
            const items = selected.length ? selected : rows;
            // append IDs to export
            inputs.append(...items.map(_assayToInput));
        } else if (viewingMode === "table-measurement") {
            const rows = measureTable.getSourceData() as Item[];
            const selected = rows.filter((item) => item?.measurement?.selected);
            // when nothing selected, act as if everything selected
            const items = selected.length ? selected : rows;
            // append IDs to export
            inputs.append(...items.map(_itemToInput));
        } else {
            const items = filter.measurements();
            // append IDs to export
            inputs.append(...items.map(_itemToInput));
        }
        form.trigger("submit");
        return false;
    });
}

function setupModals(): void {
    // set up the "add" (edit) assay dialog
    const assayModal = $("#assayMain");
    assayModal.dialog(
        StudyBase.dialogDefaults({
            "minWidth": 500,
        }),
    );
    assayMetadataManager = new Forms.FormMetadataManager(assayModal, "assay");
    // Set up the Add Measurement to Assay modal
    $("#addMeasurement").dialog(
        StudyBase.dialogDefaults({
            "minWidth": 500,
        }),
    );
}

function setupTables(): void {
    const baseConfig: Handsontable.GridSettings = {
        "allowInsertRow": false,
        "allowInsertColumn": false,
        "allowRemoveRow": false,
        "allowRemoveColumn": false,
        "beforeColumnMove": Config.disableMoveFirstColumn,
        "beforeStretchingColumnWidth": Config.disableResizeFirstColumn,
        // freeze the first column
        "fixedColumnsLeft": 1,
        "height": computeHeight(),
        // NOTE: JBEI and ABF covered under "academic research"
        "licenseKey": "non-commercial-and-evaluation",
        "manualColumnFreeze": true,
        "manualColumnMove": true,
        "manualColumnResize": true,
        "manualRowResize": true,
        "multiColumnSorting": true,
        "readOnly": true,
        "renderAllRows": true,
        "rowHeaders": true,
        "stretchH": "all",
        "width": "100%",
    };
    const assayChange = Utl.debounce(updateSelectedAssays);
    const assayColumns = Config.defineAssayColumns(access);
    const assayContainer = document.getElementById("assayTable");
    const measureChange = Utl.debounce(updateSelectedMeasurements);
    const measureColumns = Config.defineMeasurementColumns(access);
    const measureContainer = document.getElementById("measurementTable");
    assayTable = new Handsontable(
        assayContainer,
        Object.assign({}, baseConfig, {
            "afterChange": assayChange,
            "afterRender": assayChange,
            "colHeaders": assayColumns.map((c) => c.header),
            "columns": assayColumns,
            "data": filter.assays(),
        } as Handsontable.GridSettings),
    );
    $(assayContainer).on("click", ".select-all", (event) => {
        const box = $(event.currentTarget);
        const goingToSelectAll = box.prop("indeterminate") || !box.prop("checked");
        box.prop("checked", goingToSelectAll);
        assayTable.getSourceData().forEach((assay: AssayRecord) => {
            assay.selected = goingToSelectAll;
        });
        return false;
    });
    measureTable = new Handsontable(
        measureContainer,
        Object.assign({}, baseConfig, {
            "afterChange": measureChange,
            "afterRender": measureChange,
            "colHeaders": measureColumns.map((c) => c.header),
            "columns": measureColumns,
            "data": filter.measurements(),
        } as Handsontable.GridSettings),
    );
    $(measureContainer).on("click", ".select-all", (event) => {
        const box = $(event.currentTarget);
        const goingToSelectAll = box.prop("indeterminate") || !box.prop("checked");
        box.prop("checked", goingToSelectAll);
        measureTable.getSourceData().forEach((item: Item) => {
            item.measurement.selected = goingToSelectAll;
        });
        return false;
    });
    // re-fit tables when scrolling or resizing window
    $(window).on("scroll resize", () => {
        assayTable.updateSettings({ "height": computeHeight() });
        measureTable.updateSettings({ "height": computeHeight() });
    });
}

function showAddMeasurementDialog(items: AssayRecord[]): void {
    const dialog = $("#addMeasurement");
    // create form elements for currently selected assays
    const selection = items.reduce(
        (acc, v) =>
            acc.add($(`<input type="hidden" name="assayId" value="${v.id}" />`)),
        $(),
    );
    const selectionInputs = dialog.find(".hidden-assay-inputs").empty();
    selectionInputs.append(selection);
    // display modal dialog
    dialog.removeClass("off").dialog("open");
}

function showEditAssayDialog(items: AssayRecord[]): void {
    const dialog = $("#assayMain");
    let titleText: string;
    let record: AssayRecord;

    // Update the dialog title and fetch selection info
    if (items.length === 0) {
        titleText = $("#new_assay_title").text();
    } else {
        if (items.length > 1) {
            titleText = $("#bulk_assay_title").text();
        } else {
            titleText = $("#edit_assay_title").text();
        }
        record = access.mergeAssays(items);
    }
    dialog.dialog({ "title": titleText });

    // create object to handle form interactions
    const formManager = new Forms.BulkFormManager(dialog, "assay");
    // define fields on form
    const experimenterField = new Forms.Autocomplete(
        dialog.find("[name=assay-experimenter_0"),
        dialog.find("[name=assay-experimenter_1"),
        "experimenter",
    );
    experimenterField.render((value: Utl.EDDContact): [string, string] => [
        value?.display() || "",
        str(value?.id() || ""),
    ]);
    const fields: Forms.IFormField<any>[] = [
        new Forms.Field(dialog.find("[name=assay-name]"), "name"),
        new Forms.Field(dialog.find("[name=assay-description]"), "description"),
        new Forms.Field(dialog.find("[name=assay-protocol"), "pid"),
        experimenterField,
    ];
    // create form elements for currently selected assays
    const selection = items.reduce(
        (acc, v) =>
            acc.add($(`<input type="hidden" name="assayId" value="${v.id}" />`)),
        $(),
    );
    // initialize the form to clean slate
    formManager.init(selection, "[name=assayId]").fields(fields);
    assayMetadataManager.reset();
    if (record !== undefined) {
        formManager.fill(record);
        assayMetadataManager.metadata(record.meta);
    }

    // special case, ignore name field when editing multiples
    const nameInput = dialog.find("[name=assay-name]");
    const nameParent = nameInput.parent();
    if (items.length > 1) {
        nameInput.prop("required", false);
        nameParent.hide();
        nameParent.find(":checkbox").prop("checked", false);
    } else {
        nameInput.prop("required", true);
        nameParent.show();
    }

    // display modal dialog
    dialog.removeClass("off").dialog("open");
}

function updateSelectedAssays() {
    const rows = assayTable.getSourceData() as AssayRecord[];
    const selectedRows = rows.filter((assay) => assay?.selected);
    const total = rows.length;
    const selected = selectedRows.length;
    const selectAll = $(".select-all", assayTable.rootElement);
    selectAll
        .prop("indeterminate", 0 < selected && selected < total)
        .prop("checked", selected === total);
    // enable buttons if needed
    const disabled = viewingMode !== "table-assay" || selected === 0;
    $(".edd-add-button,.edd-edit-button")
        .toggleClass("disabled", disabled)
        .prop("disabled", disabled);
}

function updateSelectedMeasurements() {
    const rows = measureTable.getSourceData() as Item[];
    const selectedRows = rows.filter((item) => item?.measurement?.selected);
    const total = rows.length;
    const selected = selectedRows.length;
    const selectAll = $(".select-all", measureTable.rootElement);
    selectAll
        .prop("indeterminate", 0 < selected && selected < total)
        .prop("checked", selected === total);
}

// wait for edddata event to begin processing page
$(document).on("edddata", onDataLoad);
