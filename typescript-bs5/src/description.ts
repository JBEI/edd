"use strict";

import Collapse from "bootstrap/js/dist/collapse";
import "datatables.net";
import "datatables.net-bs5";
import "jquery";

import { LazyAccess, Query, QueryFilter, ReplicateFilter } from "./utility/access";
import * as EDDAuto from "./utility/autocomplete";
import { DescriptionDropzone } from "./utility/dropzone";
import "./utility/style";
import * as Time from "./utility/time";

// see: https://datatables.net/reference/option/dom
const domLayout =
    `rt<"row"` +
    `<"col-auto d-flex align-items-center"i>` +
    `<"col-auto d-flex align-items-center ms-auto"l>` +
    `<"col-auto d-flex align-items-center"p>` +
    `>`;

function computePage(start: number, length: number): number {
    try {
        return Math.floor(start / length) + 1;
    } catch {
        // any funny business on the math just give page 1
        return 1;
    }
}

function computeOrder(request: DataTables.AjaxDataRequest): string[] {
    try {
        return request.order.map((o) => {
            const dir = o.dir === "desc" ? "-" : "";
            const field = request.columns[o.column].data;
            return `${dir}${field}`;
        });
    } catch {
        // any errors, just give empty sort
        return [];
    }
}

function displayName(data, type, line: LineRecord, meta): string {
    if (line?.replicate_names?.length > 1) {
        const extra = line.replicate_names.length - 1;
        const first = line.replicate_names[0];
        return `${first} <span class="text-muted">(+${extra})</span>`;
    }
    return line.name;
}

function displaySelect(data, type, line: LineRecord, meta): string {
    let attributes = "";
    if (line?.active === false) {
        attributes = `${attributes} data-edd-inactive="on"`;
    }
    if (line?.pk) {
        return `<input name="lineId" type="checkbox" value="${line.pk}"${attributes}/>`;
    }
    return "";
}

function displayStrains(data, type, line: LineRecord, meta): string {
    return (line?.strains || []).map(strainToLink).join(", ");
}

function displayUser(user: UserRecord): string {
    return user
        ? `<span title="${user.display}">${user.initials}</span>`
        : `<span class="text-warning">—</span>`;
}

function onLazyInit(event, spec: AccessSpec): void {
    new LinesTable(new LazyAccess(spec), $("#edd-studydesc-lines"));
}

function strainToLink(strain: StrainRecord): string {
    return `<a href="${strain.registry_url}" target="_blank">${strain.name}</a>`;
}

class LinesTable {
    private api: DataTables.Api;
    private collapse: JQuery;
    private controls: JQuery;
    // default start with showing only active / not-deleted lines
    private filterQuery: QueryFilter = { "active": "True" };
    private selectState: "none" | "some" | "page" | "all" = "none";
    private staticHeadings: string[];

    constructor(private readonly lazy: LazyAccess, private readonly table: JQuery) {
        this.collapse = $("#edd-inline-form");
        this.controls = $("#edd-studydesc-controls");
        // grab static headings
        this.staticHeadings = this.table
            .find("thead th")
            .map((i, e) => e.textContent)
            .get();
        this.setupDropzone();
        this.setupLineButtons();
        this.setupSelectEvents();
        this.fullReload();
    }

    formData(): FormData {
        return new FormData(this.table.closest("form")[0] as HTMLFormElement);
    }

    /**
     * Re-create the table; this is required if e.g. the columns to display may
     * change, after editing line metadata.
     */
    fullReload(): LinesTable {
        const metaLookup = this.lazy.metaType.eager();
        const userLookup = this.lazy.user.eager();
        $.when(metaLookup, userLookup).done((metaTypes, users) => {
            // need to revert table, if it exists
            this.api?.destroy();
            // clear out existing content
            this.table.empty();
            // re-create the table
            this.api = this.table.DataTable({
                "ajax": this.queryLines(),
                "columns": this.createColumns(metaTypes, users),
                "dom": domLayout,
                "language": this.buildLanguageSettings(),
                "lengthMenu": [10, 25, 50, 100],
                // must specify initial order, or first col (ID) will assume ordering
                "order": [[1, "asc"]],
                "processing": true,
                "serverSide": true,
            });
            this.api.on("draw", () => this.updateSelectState());
        });
        return this;
    }

    /**
     * Re-load data in the table, e.g. after changing lines. Defaults to
     * keeping current page, but can reset if passing `true`.
     */
    reload(resetPaging = false): LinesTable {
        // no callback, keep paging position
        this.api.ajax.reload(null, resetPaging);
        return this;
    }

    runAction(url: string): LinesTable {
        if (url) {
            const payload = this.formData();
            $.ajax(this.ajaxPostForm(url, payload))
                .done(() => this.closeExistingForms().then(() => this.reload()))
                .fail((jqXHR) => this.showUnknownFormError());
        }
        return this;
    }

    setSelection(state: "none" | "some" | "page" | "all"): LinesTable {
        $(".edd-select-lines").addClass("d-none");
        $(`#edd-select-lines-${state}`).removeClass("d-none");
        this.selectState = state;
        this.updateButtonStates();
        return this;
    }

    /**
     * Build AJAX settings for a GET request.
     */
    private ajaxGetForm(url: string): JQuery.AjaxSettings {
        return {
            "cache": false,
            "contentType": false,
            "processData": false,
            "type": "GET",
            "url": url,
        };
    }

    /**
     * Build AJAX settings for a POST request.
     */
    private ajaxPostForm(
        url: string,
        payload: JQuery.PlainObject<any>,
    ): JQuery.AjaxSettings {
        return {
            "cache": false,
            "contentType": false,
            "data": payload,
            "processData": false,
            "type": "POST",
            "url": url,
        };
    }

    private buildLanguageSettings(): DataTables.LanguageSettings {
        // fetch the i18n values from HTML data-* attributes
        return {
            "aria": {
                "sortAscending": this.table.data("i18nAriaSortAscending"),
                "sortDescending": this.table.data("i18nAriaSortDescending"),
            },
            "emptyTable": this.table.data("i18nEmptyTable"),
            "info": this.table.data("i18nInfo"),
            "infoEmpty": this.table.data("i18nInfoEmpty"),
            "infoFiltered": this.table.data("i18nInfoFiltered"),
            "lengthMenu": this.table.data("i18nLengthMenu"),
            "loadingRecords": this.table.data("i18nLoadingRecords"),
            "paginate": {
                "first": this.table.data("i18nPaginateFirst"),
                "last": this.table.data("i18nPaginateLast"),
                "next": this.table.data("i18nPaginateNext"),
                "previous": this.table.data("i18nPaginatePrevious"),
            },
            "processing": this.table.data("i18nProcessing"),
            "search": this.table.data("i18nSearch"),
            "zeroRecords": this.table.data("i18nZeroRecords"),
        };
    }

    /**
     * Trigger closing of forms and return a Promise that resolves when completed.
     */
    private closeExistingForms(): PromiseLike<void> {
        const openForms = $(".edd-collapse-form.show");
        if (openForms.length) {
            const collapse = Collapse.getOrCreateInstance(openForms[0]);
            return new Promise<void>((resolve, reject) => {
                openForms.one("hidden.bs.collapse", () => resolve());
                collapse.hide();
            });
        }
        return Promise.resolve();
    }

    private createColumns(
        metaTypes: MetadataTypeRecord[],
        users: UserRecord[],
    ): DataTables.ColumnSettings[] {
        return [
            {
                "orderable": false,
                "render": displaySelect,
                // intentionally blank
                "title": "",
            },
            {
                "data": "name",
                "orderable": true,
                "render": displayName,
                "title": this.staticHeadings[1],
            },
            {
                "data": "description",
                "orderable": false,
                "title": this.staticHeadings[2],
            },
            {
                "orderable": false,
                "render": displayStrains,
                "title": this.staticHeadings[3],
            },
            ...this.createDynamicColumns(metaTypes, users),
            {
                "data": "experimenter",
                "orderable": true,
                "render": (data, type, row: LineRecord, meta) => {
                    const user = this.lazy.user.get(row.experimenter);
                    return displayUser(user);
                },
                "title": this.staticHeadings[4],
            },
            {
                "data": "updated",
                "orderable": true,
                "render": (data, type, row: LineRecord, meta) =>
                    Time.timestampToToday(row.updated?.time),
                "title": this.staticHeadings[5],
            },
        ];
    }

    private createDynamicColumns(
        metaTypes: MetadataTypeRecord[],
        users: UserRecord[],
    ): DataTables.ColumnSettings[] {
        const visibleMeta = metaTypes.filter((meta) => meta.input_type !== "replicate");
        return visibleMeta.map((meta: MetadataTypeRecord) => ({
            // use function form, as metadata may not exist on given row
            "data": (row: LineRecord) => row?.metadata?.[meta.pk] || "",
            "orderable": false,
            // TODO: handle renderers
            "title": meta.type_name,
        }));
    }

    private exportClick(event): void {
        const button = $(event.currentTarget);
        const url = button.data("eddForm");
        const form = button.closest("form");
        const data = this.formData();
        const lineIds = data.getAll("lineId");
        if (lineIds.length === 0 || this.selectState === "all") {
            // treating nothing selected as entire study selected
            const value = this.lazy.studyPK();
            form.append(`<input type="hidden" name="studyId" value="${value}"/>`);
        } else {
            // add hidden fields for all selected line(s)
            for (const value of lineIds) {
                form.append(`<input type="hidden" name="lineId" value="${value}"/>`);
            }
        }
        form.attr("action", url).trigger("submit");
    }

    private formError(jqXHR): void {
        if (jqXHR.status === 400) {
            this.writeForm()(jqXHR.responseText);
        } else {
            this.showUnknownFormError();
        }
    }

    private formSubmit(event): boolean {
        const form = $(event.currentTarget);
        const buttons = form.find(".edd-save-btn,.edd-saving-btn");
        const url = form.attr("action");
        if (url !== undefined) {
            // when the action isn't set, do further handling below
            event.preventDefault();
        } else {
            return true;
        }
        if (event.currentTarget.reportValidity()) {
            buttons.toggleClass("d-none").prop("disabled", true);
            $.ajax(this.ajaxPostForm(url, new FormData(form[0])))
                .done(() => {
                    this.closeExistingForms().then(() => this.fullReload());
                })
                .fail((jqXHR) => this.formError(jqXHR));
        } else {
            form.addClass("was-validated");
        }
        return false;
    }

    private metadataAddClick(event) {
        const button = $(event.currentTarget);
        const form = button.closest("form");
        const fieldset = button.closest("fieldset");
        const url = button.data("updateUrl");
        $.ajax(this.ajaxPostForm(url, new FormData(form[0])))
            .done((fragment) => {
                const replacement = $(fragment);
                fieldset.replaceWith(replacement);
                EDDAuto.initSelect2(replacement.find(".autocomp2"));
            })
            .fail((jqXHR) => this.showUnknownFormError());
    }

    private openForm(formRequest: JQuery.AjaxSettings): LinesTable {
        $.ajax(formRequest)
            .done(this.writeForm())
            .fail((jqXHR) => this.formError(jqXHR));
        return this;
    }

    private pressedFilterButton(event) {
        const button = $(event.currentTarget);
        const filter = button.data("eddFilter");
        const offText = button.data("eddFilterOff");
        const onText = button.data("eddFilterOn");
        if (filter === "replicates" || filter === "active") {
            if (this.filterQuery?.[filter]) {
                delete this.filterQuery[filter];
                button.text(offText);
            } else {
                this.filterQuery[filter] = "True";
                button.text(onText);
            }
            this.reload(true);
        }
    }

    private pressedMutateButton(event) {
        const button = $(event.currentTarget);
        const action = button.data("eddAction");
        const formUrl = button.data("eddForm");
        this.controls.find(".btn").removeClass("active");
        button.addClass("active");
        switch (action) {
            case "add":
                this.openForm(this.ajaxGetForm(formUrl));
                break;
            case "assay":
                this.openForm(this.ajaxPostForm(formUrl, this.formData()));
                break;
            case "edit":
                this.openForm(this.ajaxPostForm(formUrl, this.formData()));
                break;
            default:
                this.runAction(formUrl);
                break;
        }
    }

    private queryFromRequest(request: DataTables.AjaxDataRequest): Query {
        return {
            "page": computePage(request.start, request.length),
            "size": request.length,
            "sort": computeOrder(request),
            "filter": this.filterQuery,
        };
    }

    private queryLines(): DataTables.FunctionAjax {
        return (request: DataTables.AjaxDataRequest, callback, settings) => {
            const query = this.queryFromRequest(request);
            $.when(this.lazy.line.fetch(query)).done((rpi) => {
                const rf = new ReplicateFilter();
                callback({
                    "data": rf.process(rpi.results),
                    "draw": request.draw,
                    "recordsFiltered": rpi.count,
                    "recordsTotal": rpi.count,
                });
            });
        };
    }

    /**
     * Mark selection between "none", "page", or "all".
     */
    private selectionMark(state: "none" | "page" | "all"): void {
        this.table.find("input[name=lineId]").prop("checked", state !== "none");
        this.setSelection(state);
    }

    private setupDropzone(): void {
        const contentArea = $("#content");
        const dropzoneDiv = $("#edd-studydesc-dropzone");
        DescriptionDropzone.initialize(dropzoneDiv);
        contentArea.on("dragover", (e: JQueryMouseEventObject) => {
            e.stopPropagation();
            e.preventDefault();
            dropzoneDiv.removeClass("d-none");
        });
        contentArea.on("dragend, dragleave, mouseleave", () => {
            dropzoneDiv.addClass("d-none");
        });
    }

    /**
     * Register event handlers for mutation/form/export buttons.
     */
    private setupLineButtons(): void {
        this.collapse
            .on("click", "button[type=reset]", () => {
                this.closeExistingForms();
            })
            .on("click", "button.edd-metadata-add", (event) => {
                this.metadataAddClick(event);
            });
        this.controls
            .on("click", ".btn[data-edd-form]", (event) => {
                this.pressedMutateButton(event);
            })
            .on("click", "#edd-filter-line-menu button", (event) => {
                this.pressedFilterButton(event);
            });
        $(document).on(
            "submit",
            "form#edd-studydesc-form, #edd-inline-form form",
            (event) => this.formSubmit(event),
        );
        $("#edd-export-group").on("click", "[data-edd-form]", (event) => {
            this.exportClick(event);
        });
    }

    /**
     * Register event handlers dealing with selections and changing selection.
     */
    private setupSelectEvents(): void {
        // update icon state for select button and toolbar button activations
        this.table.on("change", "input[name=lineId]", () => this.updateSelectState());
        // click events for buttons cycling between selection states
        this.controls.on("click", "[data-edd-next]", (event) => {
            const next = $(event.currentTarget).data("eddNext");
            if (next) {
                this.selectionMark(next);
            }
        });
    }

    /**
     * Display generic error alert, if no details are available for an error.
     */
    private showUnknownFormError() {
        DescriptionDropzone.clearAlerts();
        DescriptionDropzone.showMessage("Error", "", "danger");
        this.closeExistingForms();
    }

    /**
     * Update toolbar buttons based on the currently selected items.
     */
    private updateButtonStates() {
        const selected = this.table.find("input[name=lineId]:checked");
        const noSelection = selected.length === 0;
        const noInactive = selected.filter("[data-edd-inactive]").length === 0;
        // set disabled state for buttons that need selected lines
        $("#edd-studydesc-controls")
            .find(".edd-needs-lines")
            .prop("disabled", noSelection);
        // if any selected lines are inactive, switch visibility of restore
        $("#edd-lines-remove").toggleClass("d-none", !noInactive);
        $("#edd-lines-restore").toggleClass("d-none", noInactive);
    }

    /**
     * Determines what select button state should show based on currently selected items.
     */
    private updateSelectState() {
        const lines = this.table.find("input[name=lineId]");
        const checked = lines.filter(":checked");
        const unchecked = lines.not(":checked");
        if (lines.length === checked.length) {
            this.setSelection("page");
        } else if (lines.length === unchecked.length) {
            this.setSelection("none");
        } else {
            this.setSelection("some");
        }
    }

    /**
     * Build a callback for writing form HTML fragment to the form area.
     */
    private writeForm(): (fragment: string) => void {
        const collapse = Collapse.getOrCreateInstance(this.collapse[0]);
        return (fragment: string) => {
            this.closeExistingForms().then(() => {
                this.collapse.html(fragment);
                EDDAuto.initSelect2(this.collapse.find(".autocomp2"));
                collapse.show();
            });
        };
    }
}

// run items needing API access after lazy-loading available
$(document).on("eddaccess", onLazyInit);
// use window load to trigger data pull for Access objects
$(window).on("load", () => {
    const accesslink = $("#accesslink");
    if (accesslink.length) {
        $.ajax({
            "type": "GET",
            "url": accesslink.attr("href"),
        }).done((spec: AccessSpec) => {
            $.event.trigger("eddaccess", [spec]);
        });
    }
});
