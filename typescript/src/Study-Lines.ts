"use strict";

import * as $ from "jquery";
import Handsontable from "handsontable";

import * as Forms from "../modules/Forms";
import * as StudyBase from "../modules/Study";
import * as Utl from "../modules/Utl";

import * as Config from "../modules/line/Config";

declare let window: StudyBase.EDDWindow;
const EDDData = window.EDDData || ({} as EDDData);
const $window = $(window);

// define managers for forms with metadata
let lineMetadataManager: Forms.FormMetadataManager;
let assayMetadataManager: Forms.FormMetadataManager;

let access: Config.Access;

/**
 * Calculates pixel height available in page with bottom bar overlaid on the
 * content container.
 */
function computeHeight() {
    const container = $("#studyLinesTable");
    const bottomBar = $("#bottomBar");
    return Math.max(
        500,
        $window.height() - container.offset().top - bottomBar.height(),
    );
}

function defineSelectionInputs(): JQuery {
    const selected = access.lines().filter((line) => line?.selected);
    const inputs = selected.map(
        (line) => $(`<input type="hidden" name="lineId" value="${line.id}"/>`)[0],
    );
    return $(inputs);
}

function disableMenuFirstColumn(column, th): void {
    // see: https://github.com/handsontable/handsontable/issues/4253
    // hack to disable menu on only the first column
    if (column === 0) {
        $("button", th).remove();
    }
}

function disableMoveFirstColumn(cols: number[], target: number): boolean | void {
    if (cols.indexOf(0) !== -1 || target === 0) {
        return false;
    }
}

function disableResizeFirstColumn(width: number, column: number): number {
    if (column === 0) {
        return 23;
    }
    return width;
}

/**
 * Creates a listener for changes to table data, updating status of buttons and
 * the select-all checkbox.
 */
function handleChange(container: Element): (...args: any[]) => void {
    return Utl.debounce(() => {
        const lines: LineRecord[] = access.lines();
        const total = lines.length;
        const selected = lines.filter((line) => line?.selected).length;
        const selectAll = $(".select-all", container);
        selectAll
            .prop("indeterminate", 0 < selected && selected < total)
            .prop("checked", selected === total);
        // enable buttons if needed
        $(".disablableButtons > button").prop("disabled", selected === 0);
    });
}

// Called when the page loads the EDDData object
function onDataLoad() {
    access = Config.Access.initAccess(EDDData);
    // Show controls that depend on having some lines present to be useful
    const hasLines = access.lines().length !== 0;
    $("#loadingLinesDiv").addClass("hide");
    $("#edUploadDirectionsDiv").removeClass("hide");
    $(".linesRequiredControls").toggleClass("hide", !hasLines);
    $("#noLinesDiv").toggleClass("hide", hasLines);

    // if dialog had errors, open on page reload
    const lineModalForm = $("#editLineModal");
    if (lineModalForm.hasClass("validation_error")) {
        const navbar = $("nav.navbar");
        lineModalForm.removeClass("off").dialog({
            "maxHeight": $window.height() - navbar.height(),
            "maxWidth": $window.width(),
            "minWidth": 500,
            "position": StudyBase.buildModalPosition(),
            "title": "Please correct errors",
        });
    }

    setupTable();
}

// setup controls once line table is displayed
function onLineTableLoad() {
    const parent: JQuery = $("#studyLinesTable").parent();
    const lineModalForm = $("#editLineModal");
    const assayModalForm = $("#addAssayModal");
    setupModals(lineModalForm, assayModalForm);

    // Enable add new Line button
    parent.find(".addNewLineButton").on("click", () => {
        showLineEditDialog($());
        return false;
    });

    // Enable edit lines button
    parent.find(".editButton").on("click", () => {
        showLineEditDialog(defineSelectionInputs());
        return false;
    });

    // Buttons for: clone, delete, restore
    // each submits form with specific action, but needs to add selected IDs first
    parent.find(".cloneButton, .disableButton, .enableButton").on("click", () => {
        // add selected IDs before submit
        $("#general").append(defineSelectionInputs());
    });

    // Enable add assay button
    parent.find(".addAssayButton").on("click", () => {
        assayMetadataManager.reset();
        assayModalForm
            .find(".hidden-line-inputs")
            .empty()
            .append(defineSelectionInputs());
        assayModalForm
            .removeClass("off")
            .dialog(
                StudyBase.dialogDefaults({
                    "minWidth": 500,
                }),
            )
            .dialog("open");
        return false;
    });

    // Enable export button
    parent.find(".exportLineButton").on("click", () => {
        const form = $("#exportForm");
        const selected = defineSelectionInputs();
        if (selected.length === 0) {
            form.append(
                `<input type="hidden" name="studyId" value="${EDDData.currentStudyID}"/>`,
            );
        } else {
            form.append(selected);
        }
        $("#exportModal")
            .removeClass("off")
            .dialog("open");
        return false;
    });

    // Enable worklist button
    parent.find(".worklistButton").on("click", () => {
        const form = $("#exportForm");
        const selected = defineSelectionInputs();
        if (selected.length === 0) {
            form.append(
                `<input type="hidden" name="studyId" value="${EDDData.currentStudyID}"/>`,
            );
        } else {
            form.append(selected);
        }
        form.find("select[name=export]").val("worklist");
        form.find("button[name=action]").click();
        return false;
    });

    // make sure the action bar is always visible
    StudyBase.overlayContent($("#actionsBar"));
}

// Called on page loading; data may not be available
function onPageLoad() {
    setupHelp();
    setupDropzone();
    setupEditableName();
}

function setupDropzone() {
    const contentArea = $("#content");
    const helper = new Utl.FileDropZoneHelpers();
    const url = $("#addToLinesDropZone").attr("data-url");
    Utl.FileDropZone.create({
        "elementId": "addToLinesDropZone",
        "url": url,
        "processResponseFn": helper.fileReturnedFromServer.bind(helper),
        "processErrorFn": helper.fileErrorReturnedFromServer.bind(helper),
        "processWarningFn": helper.fileWarningReturnedFromServer.bind(helper),
    });
    contentArea.on("dragover", (e: JQueryMouseEventObject) => {
        e.stopPropagation();
        e.preventDefault();
        $(".linesDropZone").removeClass("off");
    });
    contentArea.on("dragend, dragleave, mouseleave", () => {
        $(".linesDropZone").addClass("off");
    });
}

function setupEditableName() {
    const title = $("#editable-study-name").get()[0] as HTMLElement;
    StudyBase.EditableStudyName.createFromElement(title);
}

function setupHelp() {
    const linesHelp = $("#line-help-content").dialog({
        "title": "What is a line?",
        "autoOpen": false,
        "modal": true,
        "resizable": true,
        "position": {
            "my": "left top",
            "at": "left bottom",
            "of": "#line-help-btn",
        },
    });

    $("#line-help-btn").on("click", () => linesHelp.dialog("open"));
}

function setupModals(lineModalForm: JQuery, assayModalForm: JQuery) {
    // Set up jQuery modals
    lineModalForm.dialog(
        StudyBase.dialogDefaults({
            "minWidth": 500,
        }),
    );
    lineMetadataManager = new Forms.FormMetadataManager(lineModalForm, "line");
    assayModalForm.dialog(
        StudyBase.dialogDefaults({
            "minWidth": 500,
        }),
    );
    assayMetadataManager = new Forms.FormMetadataManager(assayModalForm, "assay");
    $("#exportModal").dialog(
        StudyBase.dialogDefaults({
            "maxHeight": 400,
            "minWidth": 400,
        }),
    );
}

function setupTable() {
    const container = document.getElementById("studyLinesTable");
    const columns = Config.columns(access);
    // Handsontable.hooks.add("afterInit", onLineTableLoad);
    const table = new Handsontable(container, {
        "afterChange": handleChange(container),
        "afterInit": onLineTableLoad,
        "afterGetColHeader": disableMenuFirstColumn,
        "allowInsertRow": false,
        "allowInsertColumn": false,
        "allowRemoveRow": false,
        "allowRemoveColumn": false,
        "beforeColumnMove": disableMoveFirstColumn,
        "beforeStretchingColumnWidth": disableResizeFirstColumn,
        "colHeaders": columns.map((c) => c.header),
        "columns": columns,
        "data": access.lines(),
        // TODO: add additional menu items, filtering, etc.
        "dropdownMenu": ["alignment"],
        "filters": true,
        // freeze the first column
        "fixedColumnsLeft": 1,
        "height": computeHeight(),
        "hiddenColumns": {
            "indicators": true,
        },
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
    // re-fit the table when scrolling or resizing window
    $window.on("scroll resize", () => {
        table.updateSettings({ "height": computeHeight() });
    });
    // handler for select all box
    $(container).on("click", ".select-all", toggleSelectAllState);
}

function showLineEditDialog(selection: JQuery): void {
    const form = $("#editLineModal");
    let titleText: string;
    let record: LineRecord;
    let contact: Utl.EDDContact;
    let experimenter: Utl.EDDContact;

    // Update the dialog title and fetch selection info
    if (selection.length === 0) {
        titleText = $("#new_line_title").text();
    } else {
        if (selection.length > 1) {
            titleText = $("#bulk_line_title").text();
        } else {
            titleText = $("#edit_line_title").text();
        }
        record = access.lineFromSelection(selection);
        contact = new Utl.EDDContact(record.contact);
        experimenter = new Utl.EDDContact(record.experimenter);
    }
    form.dialog({ "title": titleText });

    // create object to handle form interactions
    const formManager = new Forms.BulkFormManager(form, "line");
    const str = (x: any): string => "" + (x || ""); // forces values to string, falsy === ""
    // define fields on form
    type Pair = [string, string]; // this gets used below to disambiguate Autocomplete renders
    const fields: { [name: string]: Forms.IFormField } = {
        "name": new Forms.Field(form.find("[name=line-name]"), "name"),
        "description": new Forms.Field(
            form.find("[name=line-description]"),
            "description",
        ),
        "control": new Forms.Checkbox(form.find("[name=line-control]"), "control"),
        "contact": new Forms.Autocomplete(
            form.find("[name=line-contact_0"),
            form.find("[name=line-contact_1"),
            "contact",
        ).render((): Pair => [contact.display(), str(contact.id())]),
        "experimenter": new Forms.Autocomplete(
            form.find("[name=line-experimenter_0"),
            form.find("[name=line-experimenter_1"),
            "experimenter",
        ).render((): Pair => [experimenter.display(), str(experimenter.id())]),
        "strain": new Forms.Autocomplete(
            form.find("[name=line-strains_0"),
            form.find("[name=line-strains_1"),
            "strain",
        ).render(
            (r): Pair => {
                const list = r.strain || [];
                const names = list.map(
                    (v) => Utl.lookup(EDDData.Strains, v).name || "--",
                );
                const uuids = list.map(
                    (v) => Utl.lookup(EDDData.Strains, v).registry_id || "",
                );
                return [names.join(", "), uuids.join(",")];
            },
        ),
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
    const nameInput = form.find("[name=line-name]");
    const nameParent = nameInput.parent();
    if (selection.length > 1) {
        // remove required property
        nameInput.prop("required", false);
        // also hide form elements and uncheck bulk box
        nameParent.hide();
        nameParent.find(":checkbox").prop("checked", false);
    } else {
        // make sure line name is required
        nameInput.prop("required", true);
        // and line name is shown
        nameParent.show();
    }

    // display modal dialog
    form.removeClass("off").dialog("open");
}

function toggleSelectAllState() {
    const container = document.getElementById("studyLinesTable");
    const box = $(".select-all", container);
    const selectAll = box.prop("indeterminate") || !box.prop("checked");
    box.prop("checked", selectAll);
    access.lines().forEach((line) => {
        line.selected = selectAll;
    });
    return false;
}

// wait for edddata event to begin processing page
$(document).on("edddata", onDataLoad);
$(onPageLoad);
