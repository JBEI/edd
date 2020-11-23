"use strict";

import * as $ from "jquery";
import Handsontable from "handsontable";

import { Access, Item } from "../modules/table/Access";
import * as Config from "../modules/table/Config";
import * as Filter from "../modules/table/Filter";
import * as Forms from "../modules/Forms";
import * as GT from "../modules/EDDGraphingTools";
import * as StudyBase from "../modules/Study";
import * as Utl from "../modules/Utl";

declare let window: StudyBase.EDDWindow;
const EDDData = window.EDDData || ({} as EDDData);

// default start on line graph
let viewingMode: GT.ViewingMode = "plot-line";
let filter: Filter.Filter;
let tools: GT.EDDGraphingTools;
let access: Access;
let assayTable: Handsontable;
let measureTable: Handsontable;

// define managers for forms with metadata
let assayMetadataManager: Forms.FormMetadataManager;

/**
 * Forces values to string, falsy === ""
 */
const str = (x: any): string => `${x || ""}`;

function _display(selector: string, mode: GT.ViewingMode) {
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

// Called when initial non-measurement data is loaded
function onDataLoad() {
    access = Access.initAccess(EDDData);
    tools = new GT.EDDGraphingTools(access);
    filter = Filter.Filter.create(access);
    $("#content").append(filter.createElements());

    setupEvents();
    setupModals();
    setupTables();
    fetchDisplaySetting();
    fetchMeasurements();
}

interface DisplaySetting {
    type: GT.ViewingMode;
}

function updateDisplaySetting(mode: GT.ViewingMode) {
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
    $("#graphArea").toggleClass("hidden", isTable);
    if (viewingMode === "table-assay") {
        $("#assayTable").removeClass("hidden");
        $("#measurementTable").addClass("hidden");
        assayTable.loadData(filter.assays());
    } else if (viewingMode === "table-measurement") {
        $("#assayTable").addClass("hidden");
        $("#measurementTable").removeClass("hidden");
        measureTable.loadData(filter.measurements());
    } else if (!isTable) {
        remakeMainGraphArea();
    }
}

function remakeMainGraphArea() {
    let displayed = 0;
    const items = filter.measurements();
    const dataSets = items.map((item: Item): GT.GraphValue[] => {
        // Skip the rest if we've hit our limit
        if (displayed > 15000) {
            return;
        }
        displayed += item.measurement.values.length;
        return tools.transformSingleItem(item);
    });
    // when no points to display show message that there's no data to display
    $("#noData").toggleClass("hidden", items.length > 0);
    $(".displayedDiv").text(
        `${items.length} measurements with ${displayed} values displayed`,
    );
    // replace graph
    const elem = $("#graphArea")
        .toggleClass("hidden", items.length === 0)
        .empty();
    const view = new GT.GraphView(elem.get(0));
    const graphSet = {
        "values": Utl.chainArrays(dataSets),
        "width": 750,
        "height": 220,
    };
    if (viewingMode === "plot-line") {
        view.buildLineGraph(graphSet);
    } else if (viewingMode.startsWith("bar-")) {
        view.buildGroupedBarGraph(graphSet, viewingMode as GT.BarGraphMode);
    }
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
    $("#editAssayButton").on("click", (event) => {
        showEditAssayDialog([]);
        return false;
    });
}

function setupModals(): void {
    // set up the "add" (edit) assay dialog
    const assayModalForm = $("#assayMain");
    assayModalForm.dialog(
        StudyBase.dialogDefaults({
            "minWidth": 500,
        }),
    );
    assayMetadataManager = new Forms.FormMetadataManager(assayModalForm, "assay");
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
        // NOTE: JBEI and ABF covered under "academic research"
        "licenseKey": "non-commercial-and-evaluation",
        "manualColumnFreeze": true,
        "manualColumnMove": true,
        "manualColumnResize": true,
        "manualRowResize": true,
        "multiColumnSorting": true,
        "readOnly": true,
        "rowHeaders": true,
        "stretchH": "all",
        "width": "100%",
    };
    const assayColumns = Config.defineAssayColumns(access);
    const measureColumns = Config.defineMeasurementColumns(access);
    assayTable = new Handsontable(
        document.getElementById("assayTable"),
        Object.assign({}, baseConfig, {
            "colHeaders": assayColumns.map((c) => c.header),
            "columns": assayColumns,
            "data": filter.assays(),
        }),
    );
    measureTable = new Handsontable(
        document.getElementById("measurementTable"),
        Object.assign({}, baseConfig, {
            "colHeaders": measureColumns.map((c) => c.header),
            "columns": measureColumns,
            "data": filter.measurements(),
        }),
    );
}

function showEditAssayDialog(items: AssayRecord[]): void {
    const form = $("#assayMain");
    let titleText: string;
    let record: AssayRecord;
    let experimenter: Utl.EDDContact;

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
        experimenter = new Utl.EDDContact(record.experimenter);
    }
    form.dialog({ "title": titleText });

    // create object to handle form interactions
    const formManager = new Forms.BulkFormManager(form, "assay");
    // define fields on form
    const fields: { [name: string]: Forms.IFormField } = {
        "name": new Forms.Field(form.find("[name=assay-name]"), "name"),
        "description": new Forms.Field(
            form.find("[name=assay-description]"),
            "description",
        ),
        "protocol": new Forms.Field(form.find("[name=assay-protocol"), "pid"),
        "experimenter": new Forms.Autocomplete(
            form.find("[name=assay-experimenter_0"),
            form.find("[name=assay-experimenter_1"),
            "experimenter",
        ).render((): [string, string] => [
            experimenter.display(),
            str(experimenter.id()),
        ]),
    };
    // initialize the form to clean slate, pass in active selection, selector for previous items
    // TODO: build selection from items
    const selection = $();
    formManager
        .init(selection, "[name=assayId]")
        .fields($.map(fields, (v: Forms.IFormField) => v));
    assayMetadataManager.reset();
    if (record !== undefined) {
        formManager.fill(record);
        assayMetadataManager.metadata(record.meta);
    }

    // special case, ignore name field when editing multiples
    const nameInput = form.find("[name=assay-name]");
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
    form.removeClass("off").dialog("open");
}

// wait for edddata event to begin processing page
$(document).on("edddata", onDataLoad);
