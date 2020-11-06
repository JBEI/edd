"use strict";

import * as $ from "jquery";
import Handsontable from "handsontable";

import * as Config from "../modules/table/Config";
import * as Forms from "../modules/Forms";
import * as StudyBase from "../modules/Study";
import * as Utl from "../modules/Utl";

declare let window: StudyBase.EDDWindow;
const EDDData = window.EDDData || ({} as EDDData);
const $window = $(window);

// define main form and assay modals
let form: JQuery;
let lineModal: JQuery;
let assayModal: JQuery;
// define managers for forms with metadata
let lineMetadataManager: Forms.FormMetadataManager;
let assayMetadataManager: Forms.FormMetadataManager;

let access: Config.Access;
let hot: Handsontable;

/**
 * Calculates pixel height available in page to keep the Action Bar visible.
 */
function computeHeight() {
    const container = $("#studyLinesTable");
    const actionsBar = $("#actionsBar");
    const vertical = $window.height() - container.offset().top - actionsBar.height();
    // always reserve at least 500 pixels
    // also include a fudge factor of 20 pixels
    return Math.max(500, vertical - 20);
}

function defineSelectionInputs(): JQuery {
    const rows = hot.getSourceData() as LineRecord[];
    const selected = rows.filter((line) => line?.selected);
    const template = (id) => $(`<input type="hidden" name="lineId" value="${id}"/>`)[0];
    // TODO: replace with flatMap once supported
    const inputs: HTMLElement[] = [];
    selected.forEach((line) => {
        if (line.replicate_ids?.length) {
            inputs.push(...line.replicate_ids.map(template));
        } else {
            inputs.push(template(line.id));
        }
    });
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

// Called when the page loads the EDDData object
function onDataLoad() {
    access = Config.Access.initAccess(EDDData);
    // Show controls that depend on having some lines present to be useful
    const hasLines = access.lines().length !== 0;
    $("#loadingLinesDiv").addClass("hide");

    // if dialog had errors, open on page reload
    if (lineModal.hasClass("validation_error")) {
        const navbar = $("nav.navbar");
        lineModal.removeClass("off").dialog({
            "maxHeight": $window.height() - navbar.height(),
            "maxWidth": $window.width(),
            "minWidth": 500,
            "position": StudyBase.buildModalPosition(),
            "title": "Please correct errors",
        });
    }
    if (hasLines) {
        $("#actionsBar").removeClass("hide");
        setupTable();
    } else {
        $("#noLinesDiv").removeClass("hide");
        setupAddButtonEvents();
    }
}

function onExport(exportType: string) {
    const selected = defineSelectionInputs();
    if (selected.length === 0) {
        form.append(
            `<input type="hidden" name="studyId" value="${EDDData.currentStudyID}"/>`,
        );
    } else {
        form.append(selected);
    }
    form.append($(`<input type="hidden" name="action" value="export"/>`));
    form.append($(`<input type="hidden" name="export" value="${exportType}"/>`));
    form.trigger("submit");
    return false;
}

// setup controls once line table is displayed
function onLineTableLoad() {
    setupEditButtonEvents();
    setupAddButtonEvents();
    setupExportButtonEvents();
    setupModals();
}

// Called on page loading; data may not be available
function onPageLoad() {
    form = $("#general");
    lineModal = $("#editLineModal");
    assayModal = $("#addAssayModal");
    setupDropzone();
    setupEditableName();
}

function setupAddButtonEvents() {
    // Enable add new Line button
    form.on("click", ".addNewLineButton", () => {
        showLineEditDialog($());
        return false;
    });
    // menu item for clone
    form.on("click", "#cloneButton", () => {
        const selection = defineSelectionInputs();
        if (selection.length > 0) {
            form.append(selection);
            form.append($(`<input type="hidden" name="action" value="clone"/>`));
            form.trigger("submit");
        }
        return false;
    });
    // menu item for add assay
    form.on("click", "#addAssayButton", () => {
        const selection = defineSelectionInputs();
        if (selection.length > 0) {
            const hiddenInputs = assayModal.find(".hidden-line-inputs");
            assayMetadataManager.reset();
            hiddenInputs.empty().append(selection);
            assayModal
                .removeClass("off")
                .dialog(
                    StudyBase.dialogDefaults({
                        "minWidth": 500,
                    }),
                )
                .dialog("open");
        }
        return false;
    });
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

function setupEditButtonEvents() {
    // Enable edit lines button
    form.on("click", "#editButton", () => {
        const selection = defineSelectionInputs();
        if (selection.length > 0) {
            showLineEditDialog(selection);
        }
        return false;
    });
    // menu items for delete, restore
    form.on("click", "#disableButton", () => {
        const selection = defineSelectionInputs();
        if (selection.length > 0) {
            form.append(selection);
            form.append($(`<input type="hidden" name="action" value="disable"/>`));
            form.trigger("submit");
        }
        return false;
    });
    form.on("click", "#enableButton", () => {
        const selection = defineSelectionInputs();
        if (selection.length > 0) {
            form.append(selection);
            form.append($(`<input type="hidden" name="action" value="enable"/>`));
            form.trigger("submit");
        }
        return false;
    });
    // menu items for grouping and resetting replicates
    form.on("click", "#replicateButton", () => {
        const selection = defineSelectionInputs();
        if (selection.length > 0) {
            form.append(selection);
            form.append($(`<input type="hidden" name="action" value="replicate"/>`));
            form.trigger("submit");
        }
        return false;
    });
    form.on("click", "#unreplicateButton", () => {
        const selection = defineSelectionInputs();
        if (selection.length > 0) {
            form.append(selection);
            form.append($(`<input type="hidden" name="action" value="unreplicate"/>`));
            form.trigger("submit");
        }
        return false;
    });
}

function setupExportButtonEvents() {
    form.on("click", "#exportLineButton", () => onExport("csv"));
    form.on("click", "#worklistButton", () => onExport("worklist"));
    form.on("click", "#sbmlButton", () => onExport("sbml"));
    form.on("click", "#exportNewStudyButton", () => onExport("study"));
}

function setupFilter() {
    const menu = $(".table-filter-options");
    const checked = "fa-toggle-on";
    const unchecked = "fa-toggle-off";
    const choose_data = (key, enabled) => {
        if (enabled) {
            switch (key) {
                case "showDisabledItem":
                    return access.disabledLines();
                case "groupReplicateItem":
                    return access.replicates();
            }
        }
        return access.lines();
    };
    menu.on("click", "a", (event) => {
        const item = $(event.target);
        const icon = item.find("svg");
        const adding_check = icon.hasClass(unchecked);
        // uncheck all items
        menu.find(`.${checked}`).removeClass(checked).addClass(unchecked);
        // change clicked item state
        if (adding_check) {
            icon.removeClass(unchecked).addClass(checked);
        }
        // refresh table data
        hot.loadData(choose_data(item.attr("id"), adding_check));
        return false;
    });
}

function setupModals() {
    // Set up jQuery modals
    lineModal.dialog(
        StudyBase.dialogDefaults({
            "minWidth": 500,
        }),
    );
    lineMetadataManager = new Forms.FormMetadataManager(lineModal, "line");
    assayModal.dialog(
        StudyBase.dialogDefaults({
            "minWidth": 500,
        }),
    );
    assayMetadataManager = new Forms.FormMetadataManager(assayModal, "assay");
}

function setupTable() {
    const container = document.getElementById("studyLinesTable");
    const columns = Config.columns(access);
    const changeHandler = Utl.debounce(updateSelectionState);
    hot = new Handsontable(container, {
        "afterChange": changeHandler,
        "afterInit": onLineTableLoad,
        "afterGetColHeader": disableMenuFirstColumn,
        "afterRender": changeHandler,
        "allowInsertRow": false,
        "allowInsertColumn": false,
        "allowRemoveRow": false,
        "allowRemoveColumn": false,
        "beforeColumnMove": disableMoveFirstColumn,
        "beforeStretchingColumnWidth": disableResizeFirstColumn,
        "colHeaders": columns.map((c) => c.header),
        "columns": columns,
        "data": access.lines(),
        "dropdownMenu": [
            "alignment",
            // TODO: filter works off clipboard value, not rendered value
            // maybe need special handlers per column or render type?
            "filter_by_condition",
            "filter_by_value",
            "filter_action_bar",
        ],
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
        hot.updateSettings({ "height": computeHeight() });
    });
    // handler for select all box
    $(container).on("click", ".select-all", toggleSelectAllState);
    // handlers for filter bar
    setupFilter();
}

function showLineEditDialog(selection: JQuery): void {
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
    lineModal.dialog({ "title": titleText });

    // create object to handle form interactions
    const formManager = new Forms.BulkFormManager(lineModal, "line");
    const str = (x: any): string => "" + (x || ""); // forces values to string, falsy === ""
    // define fields on form
    type Pair = [string, string]; // this gets used below to disambiguate Autocomplete renders
    const fields: { [name: string]: Forms.IFormField } = {
        "name": new Forms.Field(lineModal.find("[name=line-name]"), "name"),
        "description": new Forms.Field(
            lineModal.find("[name=line-description]"),
            "description",
        ),
        "control": new Forms.Checkbox(lineModal.find("[name=line-control]"), "control"),
        "contact": new Forms.Autocomplete(
            lineModal.find("[name=line-contact_0"),
            lineModal.find("[name=line-contact_1"),
            "contact",
        ).render((): Pair => [contact.display(), str(contact.id())]),
        "experimenter": new Forms.Autocomplete(
            lineModal.find("[name=line-experimenter_0"),
            lineModal.find("[name=line-experimenter_1"),
            "experimenter",
        ).render((): Pair => [experimenter.display(), str(experimenter.id())]),
        "strain": new Forms.Autocomplete(
            lineModal.find("[name=line-strains_0"),
            lineModal.find("[name=line-strains_1"),
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
    const nameInput = lineModal.find("[name=line-name]");
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
    lineModal.removeClass("off").dialog("open");
}

function toggleSelectAllState() {
    const box = $(".select-all", hot.rootElement);
    const selectAll = box.prop("indeterminate") || !box.prop("checked");
    const rows = hot.getSourceData() as LineRecord[];
    box.prop("checked", selectAll);
    rows.forEach((line) => {
        line.selected = selectAll;
    });
    return false;
}

function updateSelectionState() {
    const rows: LineRecord[] = hot.getSourceData() as LineRecord[];
    const selectedRows = rows.filter((line) => line?.selected);
    const total = rows.length;
    const selected = selectedRows.length;
    // count is one per selected row, or the number of grouped replicates if present
    const count = selectedRows.reduce(
        (acc, line) => acc + (line?.replicate_ids?.length || 1),
        0,
    );
    const selectAll = $(".select-all", hot.rootElement);
    selectAll
        .prop("indeterminate", 0 < selected && selected < total)
        .prop("checked", selected === total);
    // enable buttons if needed
    $(".needs-lines-selected")
        .toggleClass("disabled", selected === 0)
        .prop("disabled", selected === 0);
    // update badge counters
    $(".badge.selected-line-count").text(count ? count.toString() : "");
}

// wait for edddata event to begin processing page
$(document).on("edddata", onDataLoad);
$(onPageLoad);
