"use strict";

import * as $ from "jquery";
import Handsontable from "handsontable";

import * as Config from "../modules/table/Config";
import * as Filter from "../modules/table/Filter";
import * as Forms from "../modules/Forms";
import * as GT from "../modules/EDDGraphingTools";
import * as StudyBase from "../modules/Study";
import * as Utl from "../modules/Utl";

declare let window: StudyBase.EDDWindow;
const EDDData = window.EDDData || ({} as EDDData);

// default start on line graph
let viewingMode: GT.ViewingMode = "linegraph";
let filter: Filter.Filter;
let eddGraph: GT.EDDGraphingTools;
let hot: Handsontable;

// define managers for forms with metadata
let assayMetadataManager: Forms.FormMetadataManager;

function _display(selector: string, mode: GT.ViewingMode) {
    // highlight the active button
    $("#displayModeButtons").find(".active").removeClass("active");
    $("#displayModeButtons").find(selector).addClass("active");
    // save the current state
    viewingMode = mode;
    updateDisplaySetting({ "type": mode });
    // trigger event to refresh display
    $.event.trigger("eddfilter");
}

// Called when the page loads.
function onDataLoad() {
    // initialize graph
    eddGraph = new GT.EDDGraphingTools(EDDData);
    $(document).on("eddfilter", Utl.debounce(refreshDataDisplayIfStale));

    $("#editAssayButton").click(() => {
        showEditAssayDialog($("#assaysTable").find("[name=assayId]:checked"));
        return false;
    });

    $("#displayModeButtons").on("click", ".edd-view-select", (event) => {
        const target = $(event.currentTarget);
        _display(target.data("selector"), target.data("viewmode"));
    });

    eddGraph.renderColor(EDDData.Lines);
    filter = Filter.Filter.create(EDDData);
    $("#content").append(filter.createElements());

    $("#filteringShowDisabledCheckbox, #filteringShowEmptyCheckbox").change(() => {
        $.event.trigger("eddfilter");
    });
    fetchDisplaySetting();
    fetchMeasurements();

    const columns = Config.defineAssayColumns();
    hot = new Handsontable(document.getElementById("assaysTable"), {
        // "afterChange": changeHandler,
        // "afterInit": onLineTableLoad,
        // "afterGetColHeader": disableMenuFirstColumn,
        // "afterRender": changeHandler,
        "allowInsertRow": false,
        "allowInsertColumn": false,
        "allowRemoveRow": false,
        "allowRemoveColumn": false,
        // "beforeColumnMove": disableMoveFirstColumn,
        // "beforeStretchingColumnWidth": disableResizeFirstColumn,
        "colHeaders": columns.map((c) => c.header),
        "columns": columns,
        "data": filter.getFiltered(),
        // freeze the first column
        "fixedColumnsLeft": 1,
        // "height": computeHeight(),
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
    });

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

    $("#addMeasurementButton").click(() => {
        // copy inputs to the modal form
        const inputs = $("#assaysTable").find("input[name=assayId]:checked").clone();
        $("#addMeasurement")
            .find(".hidden-assay-inputs")
            .empty()
            .append(inputs)
            .end()
            .removeClass("off")
            .dialog("open");
        return false;
    });

    $.event.trigger("eddfilter");
}

interface DisplaySetting {
    type: GT.ViewingMode;
}

function updateDisplaySetting(type: DisplaySetting) {
    const url = $("#settinglink").attr("href");
    $.ajax({
        "data": {
            "csrfmiddlewaretoken": Utl.EDD.findCSRFToken(),
            "data": JSON.stringify(type),
        },
        "type": "POST",
        "url": url,
    });
}

function fetchDisplaySetting(): void {
    const url = $("#settinglink").attr("href");
    $.ajax({ "dataType": "json", "url": url }).done((payload: DisplaySetting) => {
        if (typeof payload !== "object" || typeof payload?.type === "undefined") {
            // do nothing if the parameter is not an object
            return;
        } else if (payload.type === "linegraph") {
            _display("#lineGraphButton", payload.type);
        } else if (payload.type === "table") {
            _display("#dataTableButton", payload.type);
        } else {
            _display("#barGraphButton", payload.type);
        }
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

function refreshDataDisplayIfStale() {
    $("#graphLoading").addClass("hidden");
    // show/hide elements for the selected mode
    $("#graphArea").toggleClass("hidden", viewingMode === "table");
    $("#assaysTable").toggleClass("hidden", viewingMode !== "table");
    if (viewingMode === "table") {
        hot.loadData(filter.getFiltered());
    } else {
        remakeMainGraphArea();
    }
}

function remakeMainGraphArea() {
    let displayed = 0;
    const items = filter.getFiltered();
    const dataSets = items.map((item: Filter.Item): GT.GraphValue[] => {
        // Skip the rest if we've hit our limit
        if (displayed > 15000) {
            return;
        }
        displayed += item.measurement.values.length;
        return eddGraph.transformSingleLineItem(item.measurement, item.line.color);
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
    if (viewingMode === "linegraph") {
        view.buildLineGraph(graphSet);
    } else if (viewingMode !== "table") {
        view.buildGroupedBarGraph(graphSet, viewingMode);
    }
}

function showEditAssayDialog(selection: JQuery): void {
    // TODO: move this to handler for "edddata" event
    const access = Config.Access.initAccess(EDDData);
    const form = $("#assayMain");
    let titleText: string;
    let record: AssayRecord;
    let experimenter: Utl.EDDContact;

    // Update the dialog title and fetch selection info
    if (selection.length === 0) {
        titleText = $("#new_assay_title").text();
    } else {
        if (selection.length > 1) {
            titleText = $("#bulk_assay_title").text();
        } else {
            titleText = $("#edit_assay_title").text();
        }
        record = access.assayFromSelection(selection);
        experimenter = new Utl.EDDContact(record.experimenter);
    }
    form.dialog({ "title": titleText });

    // create object to handle form interactions
    const formManager = new Forms.BulkFormManager(form, "assay");
    const str = (x: any): string => "" + (x || ""); // forces values to string, falsy === ""
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
    formManager
        .init(selection, "[name=assayId]")
        .fields($.map(fields, (v: Forms.IFormField) => v));
    assayMetadataManager.reset();
    if (record !== undefined) {
        formManager.fill(record);
        assayMetadataManager.metadata(record.meta);
    }

    // special case, ignore name field when editing multiples
    if (selection.length > 1) {
        form.find("[name=assay-name]")
            // remove required property
            .prop("required", false)
            // also hide form elements and uncheck bulk box
            .parent()
            .hide()
            .find(":checkbox")
            .prop("checked", false)
            .end()
            .end();
    } else {
        form.find("[name=assay-name]")
            // make sure line name is required
            .prop("required", true)
            // and line name is shown
            .parent()
            .show()
            .end()
            .end();
    }

    // display modal dialog
    form.removeClass("off").dialog("open");
}

// wait for edddata event to begin processing page
$(document).on("edddata", onDataLoad);
