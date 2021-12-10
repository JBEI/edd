"use strict";

import "jquery";
import Handsontable from "handsontable";

import { Item, LazyAccess } from "../modules/table/Access";
import * as Config from "../modules/table/Config";
import { Filter } from "../modules/table/Filter";
import * as Forms from "../modules/Forms";
import { Graph } from "../modules/table/Graph";
import * as StudyBase from "../modules/Study";
import * as Utl from "../modules/Utl";

type TableMode = "table-assay" | "table-measurement";
type BarGraphMode = "bar-line" | "bar-measurement" | "bar-time";
type ViewingMode = "plot-line" | TableMode | BarGraphMode;

// default start on line graph
let viewingMode: ViewingMode = "plot-line";
let assayTable: Handsontable;
let measureTable: Handsontable;

// define managers for forms with metadata
let assayMetadataManager: Forms.FormMetadataManager;

/**
 * Converts an AssayRecord to an HTML <INPUT> for a form.
 */
const _assayToInput = (assay: AssayRecord): JQuery =>
    $(`<input type="hidden" name="assayId" value="${assay.pk}" />`);
/**
 * Converts an Item to an HTML <INPUT> for a form.
 */
const _itemToInput = (item: Item): JQuery =>
    $(`<input type="hidden" name="measurementId" value="${item.measurement.pk}" />`);

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

function defineSelectionInputs(): JQuery[] {
    if (viewingMode === "table-assay") {
        // when displaying assay table, use selected items in table
        return selectedAssays().map(_assayToInput);
    } else if (viewingMode === "table-measurement") {
        // when displaying measurement table, use selected items in table
        return selectedMeasurements().map(_itemToInput);
    } else if (measureTable) {
        // otherwise, if measurement table exists, use its source data
        const items = measureTable.getSourceData() as Item[];
        return items.map(_itemToInput);
    }
    // when all else fails, use an empty list
    return [];
}

function onLazyInit(event, spec: AccessSpec) {
    const lazy = new LazyAccess(spec);
    setupModals(lazy);
    setupExportButtonEvents(lazy);
    lazy.progressInit($("#graphLoading .progress-bar"));
    const readyFilter = Filter.create(
        document.getElementById("mainFilterSection"),
        lazy,
    );
    const readyItems = readyFilter.then((filter) => {
        return setupMeasurementTable(filter, lazy);
    });
    const readyGraph = Graph.create(document.getElementById("graphArea"), lazy);
    Promise.all([readyFilter, readyGraph, readyItems]).then(([filter, plot, items]) => {
        lazy.progressFinish();
        setupAssayTable(filter, lazy, items);
        refreshDisplay(filter, plot, items);
        // add refresh handler when filter event triggered
        $(document).on("eddfilter", () => {
            const fetch = filter.measurements();
            fetch.then((fetched) => refreshDisplay(filter, plot, fetched));
        });
    });
}

function onPageLoad() {
    setupEvents();
    fetchDisplaySetting();
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

/**
 * Submits an export form. By default, uses selection of items from table
 * views, or items filtered in graph. Pass true as second argument to select
 * the entire study.
 */
function onExport(exportForm: JQuery, lazy: LazyAccess) {
    const inputs = exportForm.find(".hidden-inputs").empty();
    const selection = defineSelectionInputs();
    if (selection.length === 0) {
        inputs.append(
            `<input type="hidden" name="studyId" value="${lazy.studyPK()}"/>`,
        );
    } else {
        inputs.append(selection);
    }
    exportForm.trigger("submit");
    return false;
}

function refreshDisplay(filter: Filter, plot: Graph, items: Item[]) {
    $("#graphLoading").addClass("hidden");
    // show/hide elements for the selected mode
    const isTable = viewingMode.startsWith("table-");
    $("#tableArea").toggleClass("hidden", !isTable);
    $("#graphDisplayContainer").toggleClass("hidden", isTable);
    const subset = filter.limitItems(items);
    const plotable = plot.assignColors(subset);
    // check on any changes in colors then update filter state
    filter.refresh(plotable);
    // update display based on current display mode
    if (viewingMode === "table-assay") {
        $("#assayTable").removeClass("hidden");
        $("#measurementTable").addClass("hidden");
        assayTable.loadData(filter.limitAssays(subset));
    } else if (viewingMode === "table-measurement") {
        $("#assayTable").addClass("hidden");
        $("#measurementTable").removeClass("hidden");
        // always disable buttons in measurement mode
        $(".edd-add-button,.edd-edit-button")
            .addClass("disabled")
            .prop("disabled", true);
        if (measureTable) {
            measureTable.loadData(subset);
        }
    } else if (!isTable) {
        remakeMainGraphArea(plot, plotable);
    }
}

function remakeMainGraphArea(plot: Graph, items: Item[]) {
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
    if (measureTable) {
        const rows = measureTable.getSourceData() as Item[];
        return rows.filter((item) => item?.measurement?.selected);
    }
    return [];
}

function setupEvents(): void {
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
}

function setupExportButtonEvents(lazy: LazyAccess) {
    $(".edd-export-button").on("click", () => onExport($("#exportForm"), lazy));
    $(".edd-new-study-button").on("click", () => onExport($("#newStudyForm"), lazy));
    $(".edd-sbml-button").on("click", () => onExport($("#sbmlForm"), lazy));
    $(".edd-worklist-button").on("click", () => onExport($("#worklistForm"), lazy));
}

function setupModals(lazy: LazyAccess): void {
    // set up the "add" (edit) assay dialog
    const assayModal = $("#assayMain");
    assayModal.dialog(
        StudyBase.dialogDefaults({
            "minWidth": 500,
        }),
    );
    assayMetadataManager = new Forms.FormMetadataManager(assayModal, lazy, "assay");
    // Set up the Add Measurement to Assay modal
    $("#addMeasurement").dialog(
        StudyBase.dialogDefaults({
            "minWidth": 500,
        }),
    );
}

function setupAssayTable(filter: Filter, lazy: LazyAccess, items: Item[]): void {
    const container = document.getElementById("assayTable");
    const settings = Config.settingsForAssayTable(lazy, filter.assayMeta(), container);
    assayTable = new Handsontable(
        container,
        Object.assign(settings, {
            "data": filter.limitAssays(items),
        } as Handsontable.GridSettings),
    );
    // change button state when changes in selected items
    $(container).on("eddselect", (event, selected) => {
        // enable buttons if needed
        const disabled = viewingMode !== "table-assay" || selected === 0;
        $(".edd-add-button,.edd-edit-button")
            .toggleClass("disabled", disabled)
            .prop("disabled", disabled);
    });
}

function setupMeasurementTable(
    filter: Filter,
    lazy: LazyAccess,
): JQuery.Promise<Item[]> {
    const container = document.getElementById("measurementTable");
    const settings = Config.settingsForMeasurementTable(lazy, container);
    return filter.measurements().then((items: Item[]) => {
        measureTable = new Handsontable(
            container,
            Object.assign(settings, {
                "data": items,
            } as Handsontable.GridSettings),
        );
        return items;
    });
}

function showAddMeasurementDialog(items: AssayRecord[]): void {
    const dialog = $("#addMeasurement");
    // create form elements for currently selected assays
    const selection = items.reduce(
        (acc, v) =>
            acc.add($(`<input type="hidden" name="assayId" value="${v.pk}" />`)),
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
        record = LazyAccess.mergeAssays(items);
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
        // const experimenter = new Utl.EDDContact(r.experimenter);
        // return [experimenter.display(), str(experimenter?.id() || "")];
        return ["TODO", `${r.experimenter}`];
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
            acc.add($(`<input type="hidden" name="assayId" value="${v.pk}" />`)),
        $(),
    );
    // initialize the form to clean slate
    formManager.init(selection, "[name=assayId]").fields(fields);
    assayMetadataManager.reset();
    if (record !== undefined) {
        formManager.fill(record);
        assayMetadataManager.metadata(record.metadata);
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

// wait for eddaccess event to begin processing page
$(document).on("eddaccess", onLazyInit);
$(onPageLoad);
