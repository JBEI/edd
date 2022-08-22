"use strict";

import "jquery";
import Handsontable from "handsontable";

import { LazyAccess, Query, ReplicateFilter } from "../modules/table/Access";
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

    private studyPk: number;

    public constructor(private readonly lazy: LazyAccess) {
        this.form = $("#general");
        this.lineModal = $("#editLineModal");
        this.assayModal = $("#addAssayModal");
        this.lineMetadataManager = new Forms.FormMetadataManager(
            this.lineModal,
            lazy,
            "line",
        );
        this.assayMetadataManager = new Forms.FormMetadataManager(
            this.assayModal,
            lazy,
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

    public setupAddButtonEvents(lazy: LazyAccess): void {
        // Enable add new Line button
        this.form.on("click", ".addNewLineButton", () => {
            this.showLineEditDialog([], lazy);
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

    public setupEditButtonEvents(lazy: LazyAccess): void {
        // Enable edit lines button
        this.form.on("click", "#editButton", () => {
            const lines = viewOptions.findSelectedLines();
            if (lines.length > 0) {
                this.showLineEditDialog(lines, lazy);
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

    public setupExportButtonEvents(spec: AccessSpec): void {
        this.studyPk = spec.study.pk;
        Object.entries({
            "#exportLineButton": "#exportForm",
            "#worklistButton": "#worklistForm",
            "#sbmlButton": "#sbmlForm",
            "#exportNewStudyButton": "#newStudyForm",
        }).forEach(([buttonId, formId]) => {
            this.form.on("click", buttonId, () => this.onExport($(formId)));
        });
    }

    private buildHiddenInput(actionValue: string): JQuery {
        return $(`<input type="hidden" name="action" value="${actionValue}"/>`);
    }

    private onExport(exportForm: JQuery) {
        const inputs = exportForm.find(".hidden-inputs").empty();
        const selected = defineSelectionInputs();
        if (selected.length === 0) {
            inputs.append(
                `<input type="hidden" name="studyId" value="${this.studyPk || ""}"/>`,
            );
        } else {
            inputs.append(selected);
        }
        exportForm.trigger("submit");
        return false;
    }

    private showLineEditDialog(lines: LineRecord[], lazy: LazyAccess): void {
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
            record = LazyAccess.mergeLines(lines);
        }
        this.lineModal.dialog({ "title": titleText });

        // create object to handle form interactions
        const formManager = new Forms.BulkFormManager(this.lineModal, "line");
        // define fields on form
        type Pair = [string, string]; // this gets used below to disambiguate Autocomplete renders
        const contactField = new Forms.Autocomplete(
            this.lineModal.find("[name=line-contact_0"),
            this.lineModal.find("[name=line-contact_1"),
            "contact",
        );
        contactField.render((r: LineRecord): Pair => {
            const contact = lazy.user.get(r.contact);
            return [contact?.email || "--", `${r.contact || ""}`];
        });
        const experimenterField = new Forms.Autocomplete(
            this.lineModal.find("[name=line-experimenter_0"),
            this.lineModal.find("[name=line-experimenter_1"),
            "experimenter",
        );
        experimenterField.render((r: LineRecord): Pair => {
            const experimenter = lazy.user.get(r.experimenter);
            return [experimenter?.email || "--", `${r.experimenter || ""}`];
        });
        const strainField = new Forms.Autocomplete(
            this.lineModal.find("[name=line-strains_0"),
            this.lineModal.find("[name=line-strains_1"),
            "strain",
        );
        strainField.render((r: LineRecord): Pair => {
            const list = r.strains || [];
            const names = list.map((v) => v.name || "--");
            const uuids = list.map((v) => v.registry_id || "");
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
            this.lineMetadataManager.metadata(record.metadata);
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
    private readonly pager: JQuery;
    private readonly pagerLabelTemplate: string;
    private readonly query: Query = {
        "page": 1,
        "size": null,
        "sort": [],
        "filter": {
            "active": "true",
        },
    };

    private hot: Handsontable;

    public constructor(
        private readonly spec: AccessSpec,
        private readonly lazy: LazyAccess,
    ) {
        this.menu = $(".table-filter-options");
        this.pager = $(".pager-nav");
        this.pagerLabelTemplate = this.pager.find(".pager-label").text();
    }

    public findSelectedLines(): LineRecord[] {
        const rows = this.hot.getSourceData() as LineRecord[];
        return rows.filter((line) => line?.selected);
    }

    public lazyTableData(): JQuery.Promise<RestPageInfo<LineRecord>> {
        const selectedSwitch = this.menu.find(`.${LineTableViewOptions.checked}`);
        const selected = selectedSwitch.closest("a").attr("id");
        if (selected === LineTableViewOptions.showDisabled) {
            delete this.query.filter.active;
        } else {
            this.query.filter.active = "True";
        }
        if (selected === LineTableViewOptions.groupReplicate) {
            this.query.filter.replicates = "True";
        } else {
            delete this.query.filter.replicates;
        }
        return this.lazy.line.fetch(this.query);
    }

    public initMainDisplay(): void {
        const container = document.getElementById("studyLinesTable");
        $.when(
            this.lazy.metaType.eager(),
            this.lazy.user.eager(),
            this.lazyTableData(),
        ).then((metaTypes, users, rpi) => {
            const settings = Config.settingsForLineTable(
                this.lazy,
                metaTypes,
                container,
            );
            $("#loadingLinesDiv").addClass("hide");
            if (rpi.count !== 0) {
                // Show controls that depend on having some lines present to be useful
                $("#actionsBar").removeClass("hide");
            } else {
                // Show banner announcing no data to display
                $("#noLinesDiv").removeClass("hide");
                forms.setupAddButtonEvents(this.lazy);
            }
            this.setupTable(container, settings, rpi);
        });
    }

    public setupEvents(): void {
        this.menu.on("click", "a", (event) => {
            const item = $(event.currentTarget);
            const clicked_item_icon = item.find("svg");
            this.menuUpdateIconStates(clicked_item_icon);
            // reset page number
            this.query.page = 1;
            this.lazyTableData().then((page) => this.update(page));
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
        forms.setupEditButtonEvents(this.lazy);
        forms.setupAddButtonEvents(this.lazy);
        forms.setupExportButtonEvents(this.spec);
    }

    private preprocessLines(lines: LineRecord[]): LineRecord[] {
        const rf = new ReplicateFilter();
        // initialize selection state
        lines.forEach((line) => {
            line.selected = false;
        });
        // group together anything with matching replicate key
        return rf.process(lines);
    }

    private setupPager(currentPage: LineRecord[], rpi: RestPageInfo<LineRecord>) {
        this.pager.find(".pager-prev").on("click", (event) => {
            const item = $(event.currentTarget);
            event.preventDefault();
            if (!item.hasClass("disabled")) {
                item.addClass("disabled");
                this.query.page--;
                this.lazyTableData().then((page) => this.update(page));
            }
        });
        this.pager.find(".pager-next").on("click", (event) => {
            const item = $(event.currentTarget);
            event.preventDefault();
            if (!item.hasClass("disabled")) {
                item.addClass("disabled");
                this.query.page++;
                this.lazyTableData().then((page) => this.update(page));
            }
        });
        this.updatePager(currentPage, rpi);
        this.pager.removeClass("hidden");
    }

    private setupTable(
        container: HTMLElement,
        settings: Handsontable.GridSettings,
        rpi: RestPageInfo<LineRecord>,
    ) {
        const lines = this.preprocessLines(rpi.results);
        this.hot = new Handsontable(
            container,
            Object.assign(settings, {
                "afterInit": () => this.onLineTableLoad(),
                "data": lines,
            }),
        );
        // listen for events on selection changes
        $(container).on("eddselect", (event) => {
            const rows: LineRecord[] = this.hot.getSourceData() as LineRecord[];
            // count is one per selected row,
            // or the number of grouped replicates if present
            const count = rows
                .filter((line) => line?.selected)
                .reduce((acc, line) => acc + (line?.replicate_ids?.length || 1), 0);
            // enable buttons if needed
            $(".needs-lines-selected")
                .toggleClass("disabled", count === 0)
                .prop("disabled", count === 0);
            // update badge counters
            $(".badge.selected-line-count").text(count ? count.toString() : "");
        });
        // handlers for filter bar
        this.setupEvents();
        // show pager
        this.setupPager(lines, rpi);
    }

    private update(rpi: RestPageInfo<LineRecord>): void {
        const lines = this.preprocessLines(rpi.results);
        this.hot.loadData(lines);
        this.updatePager(lines, rpi);
    }

    private updatePager(currentPage: LineRecord[], rpi: RestPageInfo<LineRecord>) {
        this.pager.find(".pager-prev").toggleClass("disabled", !rpi.previous);
        this.pager.find(".pager-next").toggleClass("disabled", !rpi.next);
        if (!rpi.previous) {
            // first page; know we're bound 1 at beginning
            const start = 1;
            const end = currentPage.length;
            this.updatePagerLabel(`${start}-${end}`, `${rpi.count}`);
            this.hot.updateSettings({ "rowHeaders": true });
        } else if (!rpi.next) {
            // last page; know we're bound to count at end
            const end = rpi.count;
            const start = 1 + end - currentPage.length;
            this.updatePagerLabel(`${start}-${end}`, `${rpi.count}`);
            this.hot.updateSettings({ "rowHeaders": (index) => `${start + index}` });
        } else {
            // in-between; use length as page size and calculate start and end
            const pageSize = currentPage.length;
            const end = this.query.page * pageSize;
            const start = 1 + end - pageSize;
            this.updatePagerLabel(`${start}-${end}`, `${rpi.count}`);
            this.hot.updateSettings({ "rowHeaders": (index) => `${start + index}` });
        }
    }

    private updatePagerLabel(range: string, total: string): void {
        let label = this.pagerLabelTemplate;
        label = label.replace(/@range/, range);
        label = label.replace(/@total/, total);
        this.pager.find(".pager-label").text(label);
    }
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
            inputs.push(template(line.pk));
        }
    });
    return $(inputs);
}

// Called when lazy-loading info is available
function onLazyInit(event, spec: AccessSpec) {
    const lazy = new LazyAccess(spec);
    viewOptions = new LineTableViewOptions(spec, lazy);
    viewOptions.initMainDisplay();
    forms = new LineForms(lazy);
    // if dialog had errors, open on page reload
    forms.checkLineModalErrors();
}

// Called on page loading; data may not be available
function onPageLoad() {
    setupDropzone();
    setupEditableName();
}

function setupDropzone() {
    const contentArea = $("#content");
    const dropzoneDiv = $("#addToLinesDropZone");
    const url = dropzoneDiv.attr("data-url");
    Utl.FileDropZone.create({
        "elementId": "addToLinesDropZone",
        "fileInitFn": DescriptionDropzone.clearAlerts,
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

// handle lazy-loading access
$(document).on("eddaccess", onLazyInit);
$(onPageLoad);
