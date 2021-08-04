"use strict";

import "jquery";
import Handsontable from "handsontable";

import { Access, ReplicateFilter } from "../modules/table/Access";
import * as Config from "../modules/table/Config";
import { DescriptionDropzone } from "../modules/DescriptionDropzone";
import * as Forms from "../modules/Forms";
import * as StudyBase from "../modules/Study";
import * as Utl from "../modules/Utl";

const $window = $(window);

// define main form and assay modals
let forms: LineForms;
// define table and its controls
let viewOptions: LineTableViewOptions;

/**
 * Defines the modals containing line and assay edit forms, and overall form
 * for controls on the lines table view.
 */
class LineForms {
    private readonly form: JQuery;
    private readonly lineModal: JQuery;
    private readonly assayModal: JQuery;
    private readonly lineMetadataManager: Forms.FormMetadataManager;
    private readonly assayMetadataManager: Forms.FormMetadataManager;

    public constructor() {
        this.form = $("#general");
        this.lineModal = $("#editLineModal");
        this.assayModal = $("#addAssayModal");
        this.lineMetadataManager = new Forms.FormMetadataManager(
            this.lineModal,
            "line",
        );
        this.assayMetadataManager = new Forms.FormMetadataManager(
            this.assayModal,
            "assay",
        );
        // Set up jQuery modals
        this.lineModal.dialog(
            StudyBase.dialogDefaults({
                "minWidth": 500,
            }),
        );
        this.assayModal.dialog(
            StudyBase.dialogDefaults({
                "minWidth": 500,
            }),
        );
    }

    /**
     * The template may include errors from a previous submission of the line
     * add/edit form; check for these and show the modal if they exist.
     */
    public checkLineModalErrors(): void {
        if (this.lineModal.hasClass("validation_error")) {
            const navbar = $("nav.navbar");
            this.lineModal.removeClass("off").dialog({
                "maxHeight": $window.height() - navbar.height(),
                "maxWidth": $window.width(),
                "minWidth": 500,
                "position": StudyBase.buildModalPosition(),
                "title": "Please correct errors",
            });
        }
    }

    public setupAddButtonEvents(access: Access): void {
        // Enable add new Line button
        this.form.on("click", ".addNewLineButton", () => {
            this.showLineEditDialog([], access);
            return false;
        });
        // menu item for clone
        this.form.on("click", "#cloneButton", () => {
            const selection = defineSelectionInputs();
            if (selection.length > 0) {
                this.form.append(selection);
                this.form.append(this.buildHiddenInput("clone"));
                this.form.trigger("submit");
            }
            return false;
        });
        // menu item for add assay
        this.form.on("click", "#addAssayButton", () => {
            const selection = defineSelectionInputs();
            if (selection.length > 0) {
                const hiddenInputs = this.assayModal.find(".hidden-line-inputs");
                this.assayMetadataManager.reset();
                hiddenInputs.empty().append(selection);
                this.assayModal
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

    public setupEditButtonEvents(access: Access): void {
        // Enable edit lines button
        this.form.on("click", "#editButton", () => {
            const lines = viewOptions.findSelectedLines();
            if (lines.length > 0) {
                this.showLineEditDialog(lines, access);
            }
            return false;
        });
        // menu items for delete, restore
        this.form.on("click", "#disableButton", () => {
            const selection = defineSelectionInputs();
            if (selection.length > 0) {
                this.form.append(selection);
                this.form.append(this.buildHiddenInput("disable"));
                this.form.trigger("submit");
            }
            return false;
        });
        this.form.on("click", "#enableButton", () => {
            const selection = defineSelectionInputs();
            if (selection.length > 0) {
                this.form.append(selection);
                this.form.append(this.buildHiddenInput("enable"));
                this.form.trigger("submit");
            }
            return false;
        });
        // menu items for grouping and resetting replicates
        this.form.on("click", "#replicateButton", () => {
            const selection = defineSelectionInputs();
            if (selection.length > 0) {
                this.form.append(selection);
                this.form.append(this.buildHiddenInput("replicate"));
                this.form.trigger("submit");
            }
            return false;
        });
        this.form.on("click", "#unreplicateButton", () => {
            const selection = defineSelectionInputs();
            if (selection.length > 0) {
                this.form.append(selection);
                this.form.append(this.buildHiddenInput("unreplicate"));
                this.form.trigger("submit");
            }
            return false;
        });
    }

    public setupExportButtonEvents(access: Access): void {
        this.form.on("click", "#exportLineButton", () =>
            this.onExport(access, $("#exportForm")),
        );
        this.form.on("click", "#worklistButton", () =>
            this.onExport(access, $("#worklistForm")),
        );
        this.form.on("click", "#sbmlButton", () =>
            this.onExport(access, $("#sbmlForm")),
        );
        this.form.on("click", "#exportNewStudyButton", () =>
            this.onExport(access, $("#newStudyForm")),
        );
    }

    private buildHiddenInput(actionValue: string): JQuery {
        return $(`<input type="hidden" name="action" value="${actionValue}"/>`);
    }

    private onExport(access: Access, exportForm: JQuery) {
        const inputs = exportForm.find(".hidden-inputs").empty();
        const selected = defineSelectionInputs();
        if (selected.length === 0) {
            inputs.append(
                `<input type="hidden" name="studyId" value="${access.studyPK()}"/>`,
            );
        } else {
            inputs.append(selected);
        }
        exportForm.trigger("submit");
        return false;
    }

    private showLineEditDialog(lines: LineRecord[], access: Access): void {
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
        this.lineModal.dialog({ "title": titleText });

        // create object to handle form interactions
        const formManager = new Forms.BulkFormManager(this.lineModal, "line");
        const str = (x: any): string => "" + (x || ""); // forces values to string, falsy === ""
        // define fields on form
        type Pair = [string, string]; // this gets used below to disambiguate Autocomplete renders
        const contactField = new Forms.Autocomplete(
            this.lineModal.find("[name=line-contact_0"),
            this.lineModal.find("[name=line-contact_1"),
            "contact",
        );
        contactField.render((r: LineRecord): Pair => {
            const contact = new Utl.EDDContact(r.contact);
            return [contact.display(), str(contact.id())];
        });
        const experimenterField = new Forms.Autocomplete(
            this.lineModal.find("[name=line-experimenter_0"),
            this.lineModal.find("[name=line-experimenter_1"),
            "experimenter",
        );
        experimenterField.render((r: LineRecord): Pair => {
            const experimenter = new Utl.EDDContact(r.experimenter);
            return [experimenter.display(), str(experimenter.id())];
        });
        const strainField = new Forms.Autocomplete(
            this.lineModal.find("[name=line-strains_0"),
            this.lineModal.find("[name=line-strains_1"),
            "strain",
        );
        strainField.render((r): Pair => {
            const list = r.strain || [];
            const names = list.map((v) => access.findStrain(v).name || "--");
            const uuids = list.map((v) => access.findStrain(v).registry_id || "");
            return [names.join(", "), uuids.join(",")];
        });
        const fields: { [name: string]: Forms.IFormField<any> } = {
            "name": new Forms.Field(this.lineModal.find("[name=line-name]"), "name"),
            "description": new Forms.Field(
                this.lineModal.find("[name=line-description]"),
                "description",
            ),
            "control": new Forms.Checkbox(
                this.lineModal.find("[name=line-control]"),
                "control",
            ),
            "contact": contactField,
            "experimenter": experimenterField,
            "strain": strainField,
        };
        // initialize the form to clean slate,
        // pass in active selection, selector for previous items
        const selection = defineSelectionInputs(lines);
        formManager
            .init(selection, "[name=lineId]")
            .fields($.map(fields, (v: Forms.IFormField<any>) => v));
        this.lineMetadataManager.reset();
        if (record !== undefined) {
            formManager.fill(record);
            this.lineMetadataManager.metadata(record.meta);
        }

        // special case, ignore name field when editing multiples
        const nameInput = this.lineModal.find("[name=line-name]");
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
        this.lineModal.removeClass("off").dialog("open");
    }
}

/**
 * Defines the line table, and the controls that manipulate the display of
 * the table.
 */
class LineTableViewOptions {
    private static readonly checked = "fa-toggle-on";
    private static readonly unchecked = "fa-toggle-off";
    private static readonly showDisabled = "showDisabledItem";
    private static readonly groupReplicate = "groupReplicateItem";

    private readonly menu: JQuery;

    private hot: Handsontable;

    public constructor(private readonly access: Access) {
        this.menu = $(".table-filter-options");
    }

    public findSelectedLines(): LineRecord[] {
        const rows = this.hot.getSourceData() as LineRecord[];
        return rows.filter((line) => line?.selected);
    }

    public getTableData(): LineRecord[] {
        const selected = this.menu.find(`.${LineTableViewOptions.checked}`).attr("id");
        if (selected === LineTableViewOptions.showDisabled) {
            return this.access.linesWithDisabled();
        } else if (selected === LineTableViewOptions.groupReplicate) {
            const rf = new ReplicateFilter(this.access.replicate_type());
            return rf.process(this.access.lines());
        }
        return this.access.lines();
    }

    public initMainDisplay(): void {
        const tableData = this.getTableData();
        if (tableData.length !== 0) {
            // Show controls that depend on having some lines present to be useful
            $("#actionsBar").removeClass("hide");
            this.setupTable();
        } else {
            // Show banner announcing no data to display
            $("#noLinesDiv").removeClass("hide");
            forms.setupAddButtonEvents(this.access);
        }
    }

    public setupEvents(): void {
        this.menu.on("click", "a", (event) => {
            const item = $(event.target);
            const clicked_item_icon = item.find("svg");
            this.menuUpdateIconStates(clicked_item_icon);
            // refresh table data
            this.hot.loadData(this.getTableData());
            Config.repositionSelectAllCheckbox(this.hot);
            return false;
        });
    }

    private menuUpdateIconStates(icon: JQuery<SVGElement>): void {
        const on = LineTableViewOptions.checked;
        const off = LineTableViewOptions.unchecked;
        const icon_was_off = icon.hasClass(off);
        // uncheck everything
        this.menu.find(`.${on}`).removeClass(on).addClass(off);
        // turn on icon state, if it was off before
        if (icon_was_off) {
            icon.removeClass(off).addClass(on);
        }
    }

    // setup controls once line table is displayed
    private onLineTableLoad() {
        forms.setupEditButtonEvents(this.access);
        forms.setupAddButtonEvents(this.access);
        forms.setupExportButtonEvents(this.access);
    }

    private setupTable() {
        const container = document.getElementById("studyLinesTable");
        const settings = Config.settingsForLineTable(this.access, container);
        this.hot = new Handsontable(
            container,
            Object.assign(settings, {
                "afterInit": this.onLineTableLoad,
                "data": this.getTableData(),
                "height": computeHeight(),
            }),
        );
        // re-fit the table when scrolling or resizing window
        $window.on("scroll resize", () => {
            this.hot.updateSettings({ "height": computeHeight() });
            Config.repositionSelectAllCheckbox(this.hot);
        });
        // handler for select all box
        Config.setupSelectAllCheckbox(this.hot);
        // listen for events on selection changes
        $(container).on("eddselect", (event, selected) => {
            const rows: LineRecord[] = this.hot.getSourceData() as LineRecord[];
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
        this.setupEvents();
    }
}

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
        lines = viewOptions.findSelectedLines();
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

// Called when the page loads the EDDData object
function onDataLoad(event, data: EDDData) {
    const access = Access.initAccess(data);
    viewOptions = new LineTableViewOptions(access);
    $("#loadingLinesDiv").addClass("hide");
    // if dialog had errors, open on page reload
    forms.checkLineModalErrors();
    viewOptions.initMainDisplay();
}

// Called on page loading; data may not be available
function onPageLoad() {
    forms = new LineForms();
    setupDropzone();
    setupEditableName();
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

// wait for edddata event to begin processing page
$(document).on("edddata", onDataLoad);
$(onPageLoad);
