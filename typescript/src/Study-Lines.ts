"use strict";

import * as $ from "jquery";
import Handsontable from "handsontable";

import { Access } from "../modules/table/Access";
import * as Config from "../modules/table/Config";
import { DescriptionDropzone } from "../modules/DescriptionDropzone";
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

let access: Access;
let hot: Handsontable;

/**
 * Calculates pixel height available in page to keep the Action Bar visible.
 */
function computeHeight() {
    const container = $("#studyLinesTable");
    const actionsBar = $("#actionsBar");
    // vertical size to leave enough space for actionsBar to display buttons
    const vertical = $window.height() - container.offset().top - actionsBar.height();
    // also include a fudge factor:
    // + 24 pixels for "Report a Bug", to not overlap on buttons
    // + 10 + 10 for top/bottom margins around actionsBar
    // = 44 total pixels
    const fudge = 44;
    // always reserve at least 500 pixels
    return Math.max(500, vertical - fudge);
}

function defineSelectionInputs(lines?: LineRecord[]): JQuery {
    if (lines === undefined) {
        lines = findSelectedLines();
    }
    const template = (id) => $(`<input type="hidden" name="lineId" value="${id}"/>`)[0];
    // TODO: replace with flatMap once supported
    const inputs: HTMLElement[] = [];
    lines.forEach((line) => {
        if (line.replicate_ids?.length) {
            inputs.push(...line.replicate_ids.map(template));
        } else {
            inputs.push(template(line.id));
        }
    });
    return $(inputs);
}

function findSelectedLines(): LineRecord[] {
    const rows = hot.getSourceData() as LineRecord[];
    return rows.filter((line) => line?.selected);
}

// Called when the page loads the EDDData object
function onDataLoad() {
    access = Access.initAccess(EDDData);
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

function onExport(exportForm: JQuery) {
    const inputs = exportForm.find(".hidden-inputs").empty();
    const selected = defineSelectionInputs();
    if (selected.length === 0) {
        inputs.append(
            `<input type="hidden" name="studyId" value="${EDDData.currentStudyID}"/>`,
        );
    } else {
        inputs.append(selected);
    }
    exportForm.trigger("submit");
    return false;
}

// setup controls once line table is displayed
function onLineTableLoad() {
    setupEditButtonEvents();
    setupAddButtonEvents();
    setupExportButtonEvents();
}

// Called on page loading; data may not be available
function onPageLoad() {
    form = $("#general");
    lineModal = $("#editLineModal");
    assayModal = $("#addAssayModal");
    setupDropzone();
    setupEditableName();
    setupModals();
}

function setupAddButtonEvents() {
    // Enable add new Line button
    form.on("click", ".addNewLineButton", () => {
        showLineEditDialog([]);
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
    const url = $("#addToLinesDropZone").attr("data-url");
    Utl.FileDropZone.create({
        "elementId": "addToLinesDropZone",
        "url": url,
        "processResponseFn": DescriptionDropzone.success,
        "processErrorFn": DescriptionDropzone.error,
        "processWarningFn": DescriptionDropzone.warning,
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
        const lines = findSelectedLines();
        if (lines.length > 0) {
            showLineEditDialog(lines);
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
    form.on("click", "#exportLineButton", () => onExport($("#exportForm")));
    form.on("click", "#worklistButton", () => onExport($("#worklistForm")));
    form.on("click", "#sbmlButton", () => onExport($("#sbmlForm")));
    form.on("click", "#exportNewStudyButton", () => onExport($("#newStudyForm")));
}

function setupFilter() {
    const menu = $(".table-filter-options");
    const checked = "fa-toggle-on";
    const unchecked = "fa-toggle-off";
    const choose_data = (key, enabled) => {
        if (enabled) {
            switch (key) {
                case "showDisabledItem":
                    return access.linesWithDisabled();
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
        Config.repositionSelectAllCheckbox(hot);
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
    const settings = Config.settingsForLineTable(access, container);
    hot = new Handsontable(
        container,
        Object.assign(settings, {
            "afterInit": onLineTableLoad,
            "height": computeHeight(),
        }),
    );
    // re-fit the table when scrolling or resizing window
    $window.on("scroll resize", () => {
        hot.updateSettings({ "height": computeHeight() });
        Config.repositionSelectAllCheckbox(hot);
    });
    // handler for select all box
    Config.setupSelectAllCheckbox(hot);
    // listen for events on selection changes
    $(container).on("eddselect", (event, selected) => {
        const rows: LineRecord[] = hot.getSourceData() as LineRecord[];
        // count is one per selected row, or the number of grouped replicates if present
        const count = rows
            .filter((line) => line?.selected)
            .reduce((acc, line) => acc + (line?.replicate_ids?.length || 1), 0);
        // enable buttons if needed
        $(".needs-lines-selected")
            .toggleClass("disabled", selected === 0)
            .prop("disabled", selected === 0);
        // update badge counters
        $(".badge.selected-line-count").text(count ? count.toString() : "");
    });
    // handlers for filter bar
    setupFilter();
}

function showLineEditDialog(lines: LineRecord[]): void {
    let titleText: string;
    let record: LineRecord;

    // Update the dialog title and fetch selection info
    if (lines.length === 0) {
        titleText = $("#new_line_title").text();
    } else {
        if (lines.length > 1) {
            titleText = $("#bulk_line_title").text();
        } else {
            titleText = $("#edit_line_title").text();
        }
        record = access.mergeLines(lines);
    }
    lineModal.dialog({ "title": titleText });

    // create object to handle form interactions
    const formManager = new Forms.BulkFormManager(lineModal, "line");
    const str = (x: any): string => "" + (x || ""); // forces values to string, falsy === ""
    // define fields on form
    type Pair = [string, string]; // this gets used below to disambiguate Autocomplete renders
    const contactField = new Forms.Autocomplete(
        lineModal.find("[name=line-contact_0"),
        lineModal.find("[name=line-contact_1"),
        "contact",
    );
    contactField.render((r: LineRecord): Pair => {
        const contact = new Utl.EDDContact(r.contact);
        return [contact.display(), str(contact.id())];
    });
    const experimenterField = new Forms.Autocomplete(
        lineModal.find("[name=line-experimenter_0"),
        lineModal.find("[name=line-experimenter_1"),
        "experimenter",
    );
    experimenterField.render((r: LineRecord): Pair => {
        const experimenter = new Utl.EDDContact(r.experimenter);
        return [experimenter.display(), str(experimenter.id())];
    });
    const strainField = new Forms.Autocomplete(
        lineModal.find("[name=line-strains_0"),
        lineModal.find("[name=line-strains_1"),
        "strain",
    );
    strainField.render((r): Pair => {
        const list = r.strain || [];
        const names = list.map((v) => Utl.lookup(EDDData.Strains, v).name || "--");
        const uuids = list.map((v) => Utl.lookup(EDDData.Strains, v).registry_id || "");
        return [names.join(", "), uuids.join(",")];
    });
    const fields: { [name: string]: Forms.IFormField<any> } = {
        "name": new Forms.Field(lineModal.find("[name=line-name]"), "name"),
        "description": new Forms.Field(
            lineModal.find("[name=line-description]"),
            "description",
        ),
        "control": new Forms.Checkbox(lineModal.find("[name=line-control]"), "control"),
        "contact": contactField,
        "experimenter": experimenterField,
        "strain": strainField,
    };
    // initialize the form to clean slate, pass in active selection, selector for previous items
    const selection = defineSelectionInputs(lines);
    formManager
        .init(selection, "[name=lineId]")
        .fields($.map(fields, (v: Forms.IFormField<any>) => v));
    lineMetadataManager.reset();
    if (record !== undefined) {
        formManager.fill(record);
        lineMetadataManager.metadata(record.meta);
    }

    // special case, ignore name field when editing multiples
    const nameInput = lineModal.find("[name=line-name]");
    const nameParent = nameInput.parent();
    if (lines.length > 1) {
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

// wait for edddata event to begin processing page
$(document).on("edddata", onDataLoad);
$(onPageLoad);
