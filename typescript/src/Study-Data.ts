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
type SelectionType = "study" | "line" | "assay" | "measurement";

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
/**
 * Converts a Line ID to an HTML <INPUT> for a form.
 */
const _lineIdToInput = (id: number): JQuery =>
    $(`<input type="hidden" name="lineId" value="${id}" />`);

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

function defineSelectionInputs(selectionType: SelectionType = null): JQuery[] {
    if (selectionType === "line") {
        const lineIds = new Set<number>();
        filter.assays().forEach((assay) => lineIds.add(assay.lid));
        return Array.from(lineIds).map(_lineIdToInput);
    } else if (viewingMode === "table-assay") {
        return selectedAssays().map(_assayToInput);
    } else if (selectionType === "assay") {
        return filter.assays().map(_assayToInput);
    } else if (viewingMode === "table-measurement") {
        return selectedMeasurements().map(_itemToInput);
    } else {
        return filter.measurements().map(_itemToInput);
    }
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

/**
 * Submits an export form. By default, uses selection of items from table
 * views, or items filtered in graph. Pass true as second argument to select
 * the entire study.
 */
function onExport(exportForm: JQuery, selectionType: SelectionType = null) {
    const inputs = exportForm.find(".hidden-inputs").empty();
    const selection = defineSelectionInputs(selectionType);
    if (selection.length === 0) {
        inputs.append(
            `<input type="hidden" name="studyId" value="${EDDData.currentStudyID}"/>`,
        );
    } else {
        inputs.append(selection);
    }
    exportForm.trigger("submit");
    return false;
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
        Config.repositionSelectAllCheckbox(assayTable);
    } else if (viewingMode === "table-measurement") {
        $("#assayTable").addClass("hidden");
        $("#measurementTable").removeClass("hidden");
        // always disable buttons in measurement mode
        $(".edd-add-button,.edd-edit-button")
            .addClass("disabled")
            .prop("disabled", true);
        measureTable.loadData(filter.measurements());
        Config.repositionSelectAllCheckbox(measureTable);
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
    $(".badge.edd-value-count")
        .text(`${displayed}`)
        .toggleClass("badge-warning", plot.isTruncated());
    $(".edd-value-truncated").toggleClass("hidden", !plot.isTruncated());
}

function selectedAssays(): AssayRecord[] {
    const rows = assayTable.getSourceData() as AssayRecord[];
    return rows.filter((assay) => assay?.selected);
}

function selectedMeasurements(): Item[] {
    const rows = measureTable.getSourceData() as Item[];
    return rows.filter((item) => item?.measurement?.selected);
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
    setupExportButtonEvents();
}

function setupExportButtonEvents() {
    $(".edd-export-button").on("click", () => onExport($("#exportForm")));
    $(".edd-new-study-button").on("click", () => onExport($("#newStudyForm"), "line"));
    $(".edd-sbml-button").on("click", () => onExport($("#sbmlForm"), "line"));
    $(".edd-worklist-button").on("click", () => onExport($("#worklistForm"), "assay"));
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
    const assayContainer = document.getElementById("assayTable");
    const assaySettings = Config.settingsForAssayTable(access, assayContainer);
    const measureContainer = document.getElementById("measurementTable");
    const measureSettings = Config.settingsForMeasurementTable(
        access,
        measureContainer,
    );
    assayTable = new Handsontable(
        assayContainer,
        Object.assign(assaySettings, {
            "data": filter.assays(),
        } as Handsontable.GridSettings),
    );
    measureTable = new Handsontable(
        measureContainer,
        Object.assign(measureSettings, {
            "data": filter.measurements(),
        } as Handsontable.GridSettings),
    );
    // handlers for select all boxes
    Config.setupSelectAllCheckbox(assayTable);
    Config.setupSelectAllCheckbox(measureTable);
    // re-fit tables when scrolling or resizing window
    $(window).on("scroll resize", () => {
        assayTable.updateSettings({ "height": computeHeight() });
        Config.repositionSelectAllCheckbox(assayTable);
        measureTable.updateSettings({ "height": computeHeight() });
        Config.repositionSelectAllCheckbox(measureTable);
    });
    // change button state when changes in selected items
    $(assayContainer).on("eddselect", (event, selected) => {
        // enable buttons if needed
        const disabled = viewingMode !== "table-assay" || selected === 0;
        $(".edd-add-button,.edd-edit-button")
            .toggleClass("disabled", disabled)
            .prop("disabled", disabled);
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
    experimenterField.render((r: AssayRecord): [string, string] => {
        const experimenter = new Utl.EDDContact(r.experimenter);
        return [experimenter.display(), str(experimenter?.id() || "")];
    });
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

// wait for edddata event to begin processing page
$(document).on("edddata", onDataLoad);
