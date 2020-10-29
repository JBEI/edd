"use strict";

import * as $ from "jquery";

import * as Config from "../modules/line/Config";
import * as DG from "../modules/DataGrid";
import * as Filter from "../modules/line/Filter";
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

// Table spec and table objects, one each per Protocol, for Assays.
let assaysDataGridSpec;
let assaysDataGrid;

// define managers for forms with metadata
let assayMetadataManager: Forms.FormMetadataManager;

function _display(selector: string, mode: GT.ViewingMode) {
    // show/hide elements for the selected mode
    $("#graphArea").toggleClass("hidden", mode === "table");
    $("#assaysTable").toggleClass("hidden", mode !== "table");
    // highlight the active button
    $("#displayModeButtons").find(".active").removeClass("active");
    $("#displayModeButtons").find(selector).addClass("active");
    // save the current state
    viewingMode = mode;
    updateDisplaySetting({ "type": mode });
    // trigger events to refresh display
    $.event.trigger("eddselect");
    $.event.trigger("eddrefresh");
}

// Called when the page loads.
function onDataLoad() {
    // initialize graph
    eddGraph = new GT.EDDGraphingTools(EDDData);
    // handle events
    $(document).on("eddfilter", Utl.debounce(remakeMainGraphArea));
    $(document).on("eddselect", Utl.debounce(actionPanelRefresh));
    $(document).on("eddrefresh", Utl.debounce(refreshDataDisplayIfStale));

    assaysDataGridSpec = null;
    assaysDataGrid = null;

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
        $.event.trigger("eddrefresh");
    });
    fetchDisplaySetting();
    fetchMeasurements();

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

    $.event.trigger("eddrefresh");
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
            $.event.trigger("eddrefresh");
        });
    });
}

// This function determines if the filtering sections (or settings related to them) have
// changed since the last time we were in the current display mode (e.g. line graph, table,
// bar graph in various modes, etc) and updates the display only if a change is detected.
function refreshDataDisplayIfStale() {
    // Any switch between viewing modes, or change in filtering, is also cause to check the UI
    // in the action panel and make sure it's current.
    $.event.trigger("eddselect");
    $("#graphLoading").addClass("hidden");

    if (viewingMode === "table") {
        assaysDataGridSpec = new DataGridSpecAssays();
        assaysDataGridSpec.init();
        assaysDataGrid = new DataGridAssays(assaysDataGridSpec);
    } else {
        remakeMainGraphArea();
    }
}

function actionPanelRefresh() {
    let checkedBoxes: HTMLInputElement[];
    // Figure out how many assays/checkboxes are selected.

    // Don't show the selected item count if we're not looking at the table.
    // (Only the visible item count makes sense in that case.)
    if (viewingMode === "table") {
        $(".displayedDiv").addClass("off");
        if (assaysDataGrid) {
            checkedBoxes = assaysDataGrid.getSelectedCheckboxElements();
        } else {
            checkedBoxes = [];
        }
        const checkedAssays = $(checkedBoxes).filter("[name=assayId]").length;
        const checkedMeasure = $(checkedBoxes).filter("[name=measurementId]").length;
        const nothingSelected = !checkedAssays && !checkedMeasure;
        // enable action buttons if something is selected
        const actionButtonGroup = $(".tableActionButtons");
        actionButtonGroup.find("button.assayButton").prop("disabled", !checkedAssays);
        actionButtonGroup
            .find("button")
            .not(".assayButton")
            .prop("disabled", nothingSelected);
        $(".selectedDiv").toggleClass("off", nothingSelected);
        const selectedStrs = [];
        if (!nothingSelected) {
            if (checkedAssays) {
                selectedStrs.push(
                    checkedAssays > 1 ? checkedAssays + " Assays" : "1 Assay",
                );
            }
            if (checkedMeasure) {
                selectedStrs.push(
                    checkedMeasure > 1
                        ? checkedMeasure + " Measurements"
                        : "1 Measurement",
                );
            }
            const selectedStr = selectedStrs.join(", ");
            $(".selectedDiv").text(selectedStr + " selected");
        }
    } else {
        $(".selectedDiv").addClass("off");
        $(".displayedDiv").removeClass("off");
    }
    // if there are assays but no data, show empty assays
    // note: this is to combat the current default setting for showing graph on page load
    if (!$.isEmptyObject(EDDData.Assays) && $.isEmptyObject(EDDData.Measurements)) {
        if (!$("#TableShowEAssaysCB").prop("checked")) {
            $("#TableShowEAssaysCB").click();
        }
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

class DataGridAssays extends DG.DataGrid {
    constructor(dataGridSpec: DG.DataGridSpecBase) {
        super(dataGridSpec);
    }

    _getClasses(): string {
        return "dataTable sortable dragboxes hastablecontrols table-striped";
    }
}

// Extending the standard AssayRecord to hold some client-side calculations.
// The idea is, these start out undefined, and are calculated on-demand.
interface AssayRecordExended extends AssayRecord {
    maxXValue: number;
    minXValue: number;
}

// The spec object that will be passed to DG.DataGrid to create the Assays table(s)
class DataGridSpecAssays extends DG.DataGridSpecBase {
    metaDataIDsUsedInAssays: any;
    maximumXValueInData: number;
    minimumXValueInData: number;

    measuringTimesHeaderSpec: DG.DataGridHeaderSpec;

    graphObject: any;

    constructor() {
        super();
        this.graphObject = null;
        this.measuringTimesHeaderSpec = null;
    }

    init() {
        this.findMaximumXValueInData();
        this.findMetaDataIDsUsedInAssays();
        super.init();
    }

    // An array of unique identifiers, used to identify the records in the data set being displayed
    getRecordIDs(): any[] {
        return [];
    }

    // This is an override.  Called when a data reset is triggered, but before the table rows are
    // rebuilt.
    onDataReset(dataGrid: DG.DataGrid): void {
        this.findMaximumXValueInData();
        if (this.measuringTimesHeaderSpec && this.measuringTimesHeaderSpec.element) {
            $(this.measuringTimesHeaderSpec.element)
                .children(":first")
                .text(
                    "Measuring Times (Range " +
                        this.minimumXValueInData +
                        " to " +
                        this.maximumXValueInData +
                        ")",
                );
        }
    }

    // The table element on the page that will be turned into the DG.DataGrid.
    // Any preexisting table content will be removed.
    getTableElement() {
        return document.getElementById("assaysTable");
    }

    // Specification for the table as a whole
    defineTableSpec(): DG.DataGridTableSpec {
        return new DG.DataGridTableSpec("assays", {
            "defaultSort": 0,
        });
    }

    findMetaDataIDsUsedInAssays() {
        const seenHash: any = {};
        this.metaDataIDsUsedInAssays = [];
        $.each(EDDData.Assays, (assayId, assay) => {
            $.each(assay.meta || {}, (metaId) => {
                seenHash[metaId] = true;
            });
        });
        [].push.apply(this.metaDataIDsUsedInAssays, Object.keys(seenHash));
    }

    findMaximumXValueInData(): void {
        type MinMax = [number, number];
        // reduce to find highest/lowest value across all records
        const minmax = this.getRecordIDs().reduce(
            (outer: MinMax, assayId): MinMax => {
                const assay: AssayRecordExended = EDDData.Assays[
                    assayId
                ] as AssayRecordExended;
                let measures: number[];
                let recordMinmax: MinMax;
                // Some caching to speed subsequent runs way up...
                if (assay.maxXValue !== undefined && assay.minXValue !== undefined) {
                    recordMinmax = [assay.maxXValue, assay.minXValue];
                } else {
                    measures = assay.measures || [];
                    // reduce to find highest/lowest value across all measures
                    recordMinmax = measures.reduce<MinMax>(
                        (middle: MinMax, measureId): MinMax => {
                            const m = Utl.lookup(EDDData.Measurements, measureId);
                            // reduce to find highest/lowest value across all data in measurement
                            const measureMinmax = (m.values || []).reduce(
                                (inner: MinMax, point): MinMax => {
                                    return [
                                        Math.max(inner[0], point[0][0]),
                                        Math.min(inner[1], point[0][0]),
                                    ];
                                },
                                [0, Number.MAX_VALUE],
                            );
                            return [
                                Math.max(middle[0], measureMinmax[0]),
                                Math.min(middle[1], measureMinmax[1]),
                            ];
                        },
                        [0, Number.MAX_VALUE],
                    );
                    assay.maxXValue = recordMinmax[0];
                    assay.minXValue = recordMinmax[1];
                }
                return [
                    Math.max(outer[0], recordMinmax[0]),
                    Math.min(outer[1], recordMinmax[1]),
                ];
            },
            [0, Number.MAX_VALUE],
        );
        // Anything above 0 is acceptable, but 0 will default instead to 1.
        this.maximumXValueInData = minmax[0] || 1;
        this.minimumXValueInData = minmax[1] === Number.MAX_VALUE ? 0 : minmax[1];
    }

    private loadAssayName(index: any): string {
        // In an old typical EDDData.Assays record this string is currently pre-assembled
        // and stored in 'fn'. But we're phasing that out. Eventually the name will just be
        // .name, without decoration.
        const assay = EDDData.Assays[index];
        if (assay) {
            return assay.name.toUpperCase();
        }
        return "";
    }

    private loadLineName(index: any): string {
        const assay = EDDData.Assays[index];
        if (assay) {
            const line = EDDData.Lines[assay.lid];
            if (line) {
                return line.name.toUpperCase();
            }
        }
        return "";
    }

    private loadExperimenterInitials(index: any): string {
        // ensure index ID exists, ensure experimenter user ID exists, uppercase initials or ?
        const assay = EDDData.Assays[index];
        if (assay) {
            const experimenter = EDDData.Users[assay.experimenter];
            if (experimenter) {
                return experimenter.initials.toUpperCase();
            }
        }
        return "?";
    }

    private loadAssayModification(index: any): number {
        return EDDData.Assays[index].modified.time;
    }

    // Specification for the headers along the top of the table
    defineHeaderSpec(): DG.DataGridHeaderSpec[] {
        // map all metadata IDs to HeaderSpec objects
        const metaDataHeaders: DG.DataGridHeaderSpec[] = this.metaDataIDsUsedInAssays.map(
            (id, index) => {
                const mdType = EDDData.MetaDataTypes[id];
                return new DG.DataGridHeaderSpec(2 + index, "hAssaysMetaid" + id, {
                    "name": mdType.name,
                    "headerRow": 2,
                    "size": "s",
                    "sortBy": this.makeMetaDataSortFunction(id),
                    "sortAfter": 1,
                });
            },
        );

        // The left section of the table has Assay Name and Line (Name)
        const leftSide: DG.DataGridHeaderSpec[] = [
            new DG.DataGridHeaderSpec(1, "hAssaysName", {
                "name": "Assay Name",
                "headerRow": 2,
                "sortBy": this.loadAssayName,
            }),
            new DG.DataGridHeaderSpec(2, "hAssayLineName", {
                "name": "Line",
                "headerRow": 2,
                "sortBy": this.loadLineName,
            }),
        ];

        // Offsets for the right side of the table depends on size of the preceding sections
        let rightOffset = leftSide.length + metaDataHeaders.length;
        const rightSide = [
            new DG.DataGridHeaderSpec(++rightOffset, "hAssaysMName", {
                "name": "Measurement",
                "headerRow": 2,
            }),
            new DG.DataGridHeaderSpec(++rightOffset, "hAssaysUnits", {
                "name": "Units",
                "headerRow": 2,
            }),
            new DG.DataGridHeaderSpec(++rightOffset, "hAssaysCount", {
                "name": "Count",
                "headerRow": 2,
            }),
            // The measurement times are referenced elsewhere, so are saved to the object
            (this.measuringTimesHeaderSpec = new DG.DataGridHeaderSpec(
                ++rightOffset,
                "hAssaysCount",
                {
                    "name": "Measuring Times",
                    "headerRow": 2,
                },
            )),
            new DG.DataGridHeaderSpec(++rightOffset, "hAssaysExperimenter", {
                "name": "Experimenter",
                "headerRow": 2,
                "sortBy": this.loadExperimenterInitials,
                "sortAfter": 1,
            }),
            new DG.DataGridHeaderSpec(++rightOffset, "hAssaysModified", {
                "name": "Last Modified",
                "headerRow": 2,
                "sortBy": this.loadAssayModification,
                "sortAfter": 1,
            }),
        ];

        return leftSide.concat(metaDataHeaders, rightSide);
    }

    private makeMetaDataSortFunction(id) {
        return (i) => {
            const record = EDDData.Assays[i];
            if (record && record.meta) {
                return record.meta[id] || "";
            }
            return "";
        };
    }

    // The colspan value for all the cells that are assay-level (not measurement-level) is based
    // on the number of measurements for the respective record. Specifically, it's the number of
    // metabolite and general measurements, plus 1 if there are transcriptomics measurements,
    // plus 1 if there are proteomics measurements, all added together.
    // (Or 1, whichever is higher.)
    private rowSpanForRecord(index): number {
        const rec = EDDData.Assays[index];
        const v: number =
            (rec.general || []).length +
                (rec.metabolites || []).length +
                ((rec.transcriptions || []).length ? 1 : 0) +
                ((rec.proteins || []).length ? 1 : 0) || 1;
        return v;
    }

    generateAssayNameCells(
        gridSpec: DataGridSpecAssays,
        index: string,
    ): DG.DataGridDataCell[] {
        const record = EDDData.Assays[index];
        return [
            new DG.DataGridDataCell(gridSpec, index, {
                "checkboxName": "assayId",
                "checkboxWithID": (id) => "assay" + id + "include",
                "hoverEffect": true,
                "nowrap": true,
                "rowspan": gridSpec.rowSpanForRecord(index),
                "contentString": record.name,
            }),
        ];
    }

    generateLineNameCells(
        gridSpec: DataGridSpecAssays,
        index: string,
    ): DG.DataGridDataCell[] {
        const record = EDDData.Assays[index],
            line = EDDData.Lines[record.lid];
        return [
            new DG.DataGridDataCell(gridSpec, index, {
                "rowspan": gridSpec.rowSpanForRecord(index),
                "contentString": line.name,
            }),
        ];
    }

    makeMetaDataCellsGeneratorFunction(id) {
        return (gridSpec: DataGridSpecAssays, index: string): DG.DataGridDataCell[] => {
            const assay = EDDData.Assays[index];
            const type = EDDData.MetaDataTypes[id];
            let contentStr = assay.meta[id] || "";
            if (assay && type && assay.meta && contentStr) {
                contentStr = [type.prefix || "", contentStr, type.postfix || ""]
                    .join(" ")
                    .trim();
            }
            return [
                new DG.DataGridDataCell(gridSpec, index, {
                    "rowspan": gridSpec.rowSpanForRecord(index),
                    "contentString": contentStr,
                }),
            ];
        };
    }

    private generateMeasurementCells(
        gridSpec: DataGridSpecAssays,
        index: string,
        opt: any,
    ): DG.DataGridDataCell[] {
        let cells = [];
        const record: AssayRecord = EDDData.Assays[index];
        const factory = (): DG.DataGridDataCell =>
            new DG.DataGridDataCell(gridSpec, index);

        if ((record.metabolites || []).length > 0) {
            if (EDDData.Measurements === undefined) {
                cells.push(
                    new DG.DataGridLoadingCell(gridSpec, index, {
                        "rowspan": record.metabolites.length,
                    }),
                );
            } else {
                // convert IDs to measurements, sort by name, then convert to cell objects
                cells = record.metabolites
                    .map(opt.metaboliteToValue)
                    .sort(opt.metaboliteValueSort)
                    .map(opt.metaboliteValueToCell);
            }
        }
        if ((record.general || []).length > 0) {
            if (EDDData.Measurements === undefined) {
                cells.push(
                    new DG.DataGridLoadingCell(gridSpec, index, {
                        "rowspan": record.general.length,
                    }),
                );
            } else {
                // convert IDs to measurements, sort by name, then convert to cell objects
                cells = record.general
                    .map(opt.metaboliteToValue)
                    .sort(opt.metaboliteValueSort)
                    .map(opt.metaboliteValueToCell);
            }
        }
        // generate only one cell if there is any transcriptomics data
        if ((record.transcriptions || []).length > 0) {
            if (EDDData.Measurements === undefined) {
                cells.push(new DG.DataGridLoadingCell(gridSpec, index));
            } else {
                cells.push(opt.transcriptToCell(record.transcriptions));
            }
        }
        // generate only one cell if there is any proteomics data
        if ((record.proteins || []).length > 0) {
            if (EDDData.Measurements === undefined) {
                cells.push(new DG.DataGridLoadingCell(gridSpec, index));
            } else {
                cells.push(opt.proteinToCell(record.proteins));
            }
        }
        // generate a loading cell if none created by measurements
        if (!cells.length) {
            if (record.count) {
                // we have a count, but no data yet; still loading
                cells.push(new DG.DataGridLoadingCell(gridSpec, index));
            } else if (opt.empty) {
                cells.push(opt.empty.call({}));
            } else {
                cells.push(factory());
            }
        }
        return cells;
    }

    generateMeasurementNameCells(
        gridSpec: DataGridSpecAssays,
        index: string,
    ): DG.DataGridDataCell[] {
        return gridSpec.generateMeasurementCells(gridSpec, index, {
            "metaboliteToValue": (measureId) => {
                const measure: any = EDDData.Measurements[measureId] || {},
                    mtype: any = EDDData.MeasurementTypes[measure.type] || {};
                return { "name": mtype.name || "", "id": measureId };
            },
            "metaboliteValueSort": (a: any, b: any) => {
                const y = a.name.toLowerCase(),
                    z = b.name.toLowerCase();
                return ((y > z) as any) - ((z > y) as any);
            },
            "metaboliteValueToCell": (value) => {
                return new DG.DataGridDataCell(gridSpec, value.id, {
                    "hoverEffect": true,
                    "checkboxName": "measurementId",
                    "checkboxWithID": () => "measurement" + value.id + "include",
                    "contentString": value.name,
                });
            },
            "transcriptToCell": (ids: any[]) => {
                return new DG.DataGridDataCell(gridSpec, index, {
                    "contentString": "Transcriptomics Data",
                });
            },
            "proteinToCell": (ids: any[]) => {
                return new DG.DataGridDataCell(gridSpec, index, {
                    "contentString": "Proteomics Data",
                });
            },
            "empty": () =>
                new DG.DataGridDataCell(gridSpec, index, {
                    "contentString": "<i>No Measurements</i>",
                }),
        });
    }

    generateUnitsCells(
        gridSpec: DataGridSpecAssays,
        index: string,
    ): DG.DataGridDataCell[] {
        return gridSpec.generateMeasurementCells(gridSpec, index, {
            "metaboliteToValue": (measureId) => {
                const measure: any = EDDData.Measurements[measureId] || {},
                    mtype: any = EDDData.MeasurementTypes[measure.type] || {},
                    unit: any = EDDData.UnitTypes[measure.y_units] || {};
                return {
                    "name": mtype.name || "",
                    "id": measureId,
                    "unit": unit.name || "",
                };
            },
            "metaboliteValueSort": (a: any, b: any) => {
                const y = a.name.toLowerCase(),
                    z = b.name.toLowerCase();
                return ((y > z) as any) - ((z > y) as any);
            },
            "metaboliteValueToCell": (value) => {
                return new DG.DataGridDataCell(gridSpec, index, {
                    "contentString": value.unit,
                });
            },
            "transcriptToCell": (ids: any[]) => {
                return new DG.DataGridDataCell(gridSpec, index, {
                    "contentString": "RPKM",
                });
            },
            "proteinToCell": (ids: any[]) => {
                return new DG.DataGridDataCell(gridSpec, index, {
                    "contentString": "", // TODO: what are proteomics measurement units?
                });
            },
        });
    }

    generateCountCells(
        gridSpec: DataGridSpecAssays,
        index: string,
    ): DG.DataGridDataCell[] {
        // function to use in Array#reduce to count all the values in a set of measurements
        const reduceCount = (prev: number, measureId) => {
            const measure: any = EDDData.Measurements[measureId] || {};
            return prev + (measure.values || []).length;
        };
        return gridSpec.generateMeasurementCells(gridSpec, index, {
            "metaboliteToValue": (measureId) => {
                const measure: any = EDDData.Measurements[measureId] || {},
                    mtype: any = EDDData.MeasurementTypes[measure.type] || {};
                return {
                    "name": mtype.name || "",
                    "id": measureId,
                    "measure": measure,
                };
            },
            "metaboliteValueSort": (a: any, b: any) => {
                const y = a.name.toLowerCase(),
                    z = b.name.toLowerCase();
                return ((y > z) as any) - ((z > y) as any);
            },
            "metaboliteValueToCell": (value) => {
                return new DG.DataGridDataCell(gridSpec, index, {
                    "contentString": [
                        "(",
                        (value.measure.values || []).length,
                        ")",
                    ].join(""),
                });
            },
            "transcriptToCell": (ids: any[]) => {
                return new DG.DataGridDataCell(gridSpec, index, {
                    "contentString": ["(", ids.reduce(reduceCount, 0), ")"].join(""),
                });
            },
            "proteinToCell": (ids: any[]) => {
                return new DG.DataGridDataCell(gridSpec, index, {
                    "contentString": ["(", ids.reduce(reduceCount, 0), ")"].join(""),
                });
            },
        });
    }

    generateMeasuringTimesCells(
        gridSpec: DataGridSpecAssays,
        index: string,
    ): DG.DataGridDataCell[] {
        const svgCellForTimeCounts = (ids: any[]) => {
            const timeCount: { [time: number]: number } = {};
            // count values at each x for all measurements
            ids.forEach((measureId) => {
                const measure = Utl.lookup(EDDData.Measurements, measureId);
                const points: number[][][] = measure.values || [];
                points.forEach((point: number[][]) => {
                    timeCount[point[0][0]] = timeCount[point[0][0]] || 0;
                    // Typescript compiler does not like using increment operator on expression
                    ++timeCount[point[0][0]];
                });
            });
            // map the counts to array of [[x], [count]] tuples
            const consolidated: number[][][] = $.map(timeCount, (value, key) => [
                // key should be a number, but sometimes is a string
                // if parseFloat gets a number, it just returns the number
                // so force cast to string, so the type info on parseFloat accepts
                [[parseFloat((key as unknown) as string)], [value]],
            ]);
            // generate SVG string
            let svg = "";
            if (consolidated.length) {
                svg = gridSpec.assembleSVGStringForDataPoints(consolidated, "");
            }
            return new DG.DataGridDataCell(gridSpec, index, {
                "contentString": svg,
            });
        };
        interface CellValue {
            name: string;
            id: number;
            measure: MeasurementRecord;
        }
        return gridSpec.generateMeasurementCells(gridSpec, index, {
            "metaboliteToValue": (measureId: number): CellValue => {
                const measure = Utl.lookup(EDDData.Measurements, measureId);
                const mtype: MeasurementTypeRecord =
                    EDDData.MeasurementTypes[measure.type] ||
                    ({} as MeasurementTypeRecord);
                return {
                    "name": mtype.name || "",
                    "id": measureId,
                    "measure": measure,
                };
            },
            "metaboliteValueSort": (a: CellValue, b: CellValue): number => {
                const y = a.name.toLowerCase();
                const z = b.name.toLowerCase();
                return ((y > z) as any) - ((z > y) as any);
            },
            "metaboliteValueToCell": (value: CellValue) => {
                const measure = value.measure || ({} as MeasurementRecord);
                const format = measure.format === "1" ? "carbon" : "";
                const points = measure.values || [];
                const svg = gridSpec.assembleSVGStringForDataPoints(points, format);
                return new DG.DataGridDataCell(gridSpec, index, {
                    "contentString": svg,
                });
            },
            "transcriptToCell": svgCellForTimeCounts,
            "proteinToCell": svgCellForTimeCounts,
        });
    }

    generateExperimenterCells(
        gridSpec: DataGridSpecAssays,
        index: string,
    ): DG.DataGridDataCell[] {
        const exp = EDDData.Assays[index].experimenter;
        const uRecord = EDDData.Users[exp];
        return [
            new DG.DataGridDataCell(gridSpec, index, {
                "rowspan": gridSpec.rowSpanForRecord(index),
                "contentString": uRecord ? uRecord.initials : "?",
            }),
        ];
    }

    generateModificationDateCells(
        gridSpec: DataGridSpecAssays,
        index: string,
    ): DG.DataGridDataCell[] {
        return [
            new DG.DataGridDataCell(gridSpec, index, {
                "rowspan": gridSpec.rowSpanForRecord(index),
                "contentString": Utl.JS.timestampToTodayString(
                    EDDData.Assays[index].modified.time,
                ),
            }),
        ];
    }

    assembleSVGStringForDataPoints(points: number[][][], format: string): string {
        const svg =
            '<svg xmlns="http://www.w3.org/2000/svg" version="1.2"\
                    width="100%" height="10px"\
                    viewBox="0 0 470 10" preserveAspectRatio="none">\
                <style type="text/css"><![CDATA[\
                        .cP { stroke:rgba(0,0,0,1); stroke-width:4px; stroke-linecap:round; }\
                        .cV { stroke:rgba(0,0,230,1); stroke-width:4px; stroke-linecap:round; }\
                        .cE { stroke:rgba(255,128,0,1); stroke-width:4px; stroke-linecap:round; }\
                    ]]></style>\
                <path fill="rgba(0,0,0,0.0.05)"\
                        stroke="rgba(0,0,0,0.05)"\
                        d="M10,5h450"\
                        style="stroke-width:2px;"\
                        stroke-width="2"></path>';
        const paths = [svg];
        points
            .sort((a, b) => a[0][0] - b[0][0])
            .forEach((point) => {
                const x = point[0][0];
                const y = point[1][0];
                const range = this.maximumXValueInData - this.minimumXValueInData;
                const rx =
                    range !== 0
                        ? ((x - this.minimumXValueInData) / range) * 450 + 10
                        : 10;
                const tt = [y, " at ", x, "h"].join("");
                paths.push(['<path class="cE" d="M', rx, ',5v4"></path>'].join(""));
                if (y === undefined || y === null) {
                    paths.push(['<path class="cE" d="M', rx, ',2v6"></path>'].join(""));
                    return;
                }
                paths.push(['<path class="cP" d="M', rx, ',1v4"></path>'].join(""));
                if (format === "carbon") {
                    paths.push(
                        [
                            '<path class="cV" d="M',
                            rx,
                            ',1v8"><title>',
                            tt,
                            "</title></path>",
                        ].join(""),
                    );
                } else {
                    paths.push(
                        [
                            '<path class="cP" d="M',
                            rx,
                            ',1v8"><title>',
                            tt,
                            "</title></path>",
                        ].join(""),
                    );
                }
            });
        paths.push("</svg>");
        return paths.join("\n");
    }

    // Specification for each of the data columns that will make up the body of the table
    defineColumnSpec(): DG.DataGridColumnSpec[] {
        let counter = 0;
        const leftSide = [
            new DG.DataGridColumnSpec(++counter, this.generateAssayNameCells),
            new DG.DataGridColumnSpec(++counter, this.generateLineNameCells),
        ];
        const metaDataCols = this.metaDataIDsUsedInAssays.map((id) => {
            return new DG.DataGridColumnSpec(
                ++counter,
                this.makeMetaDataCellsGeneratorFunction(id),
            );
        });
        const rightSide = [
            new DG.DataGridColumnSpec(++counter, this.generateMeasurementNameCells),
            new DG.DataGridColumnSpec(++counter, this.generateUnitsCells),
            new DG.DataGridColumnSpec(++counter, this.generateCountCells),
            new DG.DataGridColumnSpec(++counter, this.generateMeasuringTimesCells),
            new DG.DataGridColumnSpec(++counter, this.generateExperimenterCells),
            new DG.DataGridColumnSpec(++counter, this.generateModificationDateCells),
        ];

        return leftSide.concat(metaDataCols, rightSide);
    }

    // Specification for each of the groups that the headers and data columns are organized into
    defineColumnGroupSpec(): DG.DataGridColumnGroupSpec[] {
        const topSection: DG.DataGridColumnGroupSpec[] = [
            new DG.DataGridColumnGroupSpec("Name", { "showInVisibilityList": false }),
            new DG.DataGridColumnGroupSpec("Line", { "showInVisibilityList": false }),
        ];

        const metaDataColGroups: DG.DataGridColumnGroupSpec[] = this.metaDataIDsUsedInAssays.map(
            (id, index): DG.DataGridColumnGroupSpec => {
                const mdType = EDDData.MetaDataTypes[id];
                return new DG.DataGridColumnGroupSpec(mdType.name);
            },
        );

        const bottomSection: DG.DataGridColumnGroupSpec[] = [
            new DG.DataGridColumnGroupSpec("Measurement", {
                "showInVisibilityList": false,
            }),
            new DG.DataGridColumnGroupSpec("Units", { "showInVisibilityList": false }),
            new DG.DataGridColumnGroupSpec("Count", { "showInVisibilityList": false }),
            new DG.DataGridColumnGroupSpec("Measuring Times", {
                "showInVisibilityList": false,
            }),
            new DG.DataGridColumnGroupSpec("Experimenter", { "hiddenByDefault": true }),
            new DG.DataGridColumnGroupSpec("Last Modified", {
                "hiddenByDefault": true,
            }),
        ];

        return topSection.concat(metaDataColGroups, bottomSection);
    }

    // This is called to generate the array of custom header widgets.
    // The order of the array will be the order they are added to the header bar.
    // It's perfectly fine to return an empty array.
    createCustomHeaderWidgets(dataGrid: DG.DataGrid): DG.DataGridHeaderWidget[] {
        const widgetSet: DG.DataGridHeaderWidget[] = [];

        // A "select all / select none" button
        const selectAllWidget = new DGSelectAllAssaysMeasurementsWidget(dataGrid, this);
        selectAllWidget.displayBeforeViewMenu(true);
        widgetSet.push(selectAllWidget);

        return widgetSet;
    }

    // This is called to generate the array of custom options menu widgets.
    // The order of the array will be the order they are displayed in the menu.
    // It's perfectly fine to return an empty array.
    createCustomOptionsWidgets(dataGrid: DG.DataGrid): DG.DataGridOptionWidget[] {
        const widgetSet: DG.DataGridOptionWidget[] = [];
        const disabledAssaysWidget = new DGDisabledAssaysWidget(dataGrid, this);
        const emptyAssaysWidget = new DGEmptyAssaysWidget(dataGrid, this);
        widgetSet.push(disabledAssaysWidget);
        widgetSet.push(emptyAssaysWidget);
        return widgetSet;
    }

    // This is called after everything is initialized, including the creation of the table content.
    onInitialized(dataGrid: DataGridAssays): void {
        // Wire up the 'action panels' for the Assays sections
        const table = this.getTableElement();
        $(table).on("change", ":checkbox", () => $.event.trigger("eddselect"));

        // Run it once in case the page was generated with checked Assays
        $.event.trigger("eddselect");
    }
}

// A slightly modified "Select All" header widget
// that triggers a refresh of the actions panel when it changes the checkbox state.
class DGSelectAllAssaysMeasurementsWidget extends DG.DGSelectAllWidget {
    clickHandler(): void {
        super.clickHandler();
        $.event.trigger("eddselect");
    }
}

// When unchecked, this hides the set of Assays that are marked as disabled.
class DGDisabledAssaysWidget extends DG.DataGridOptionWidget {
    // Return a fragment to use in generating option widget IDs
    getIDFragment(uniqueID): string {
        return "TableShowDAssaysCB";
    }

    // Return text used to label the widget
    getLabelText(): string {
        return "Show Disabled";
    }

    getLabelTitle(): string {
        return "Show assays that have been disabled.";
    }

    // Returns true if the control should be enabled by default
    isEnabledByDefault(): boolean {
        return !!$("#filteringShowDisabledCheckbox").prop("checked");
    }

    // Handle activation of widget
    onWidgetChange(e): void {
        const amIChecked = !!this.checkBoxElement.checked;
        const isOtherChecked: boolean = $("#filteringShowDisabledCheckbox").prop(
            "checked",
        );
        $("#filteringShowDisabledCheckbox").prop("checked", amIChecked);
        if (amIChecked !== isOtherChecked) {
            $.event.trigger("eddrefresh");
        }
    }

    applyFilterToIDs(rowIDs: string[]): string[] {
        const checked = !!this.checkBoxElement.checked;
        // If the box is checked, return the set of IDs unfiltered
        if (checked && rowIDs) {
            $("#enableButton").removeClass("off");
        } else {
            $("#enableButton").addClass("off");
        }

        const anyDisabledChecked: boolean = $(".disabledRecord")
            .toArray()
            .some((row): boolean => $(row).find("input").prop("checked"));
        $("#enableButton").prop("disabled", !anyDisabledChecked);

        // If the box is checked, return the set of IDs unfiltered
        if (checked) {
            return rowIDs;
        }
        return rowIDs.filter((id: string): boolean => {
            return !!EDDData.Assays[id].active;
        });
    }

    initialFormatRowElementsForID(dataRowObjects: any, rowID: string): any {
        const assay = EDDData.Assays[rowID];
        if (!assay.active) {
            $.each(dataRowObjects, (x, row) => {
                $(row.getElement()).addClass("disabledRecord");
            });
        }
    }
}

// When unchecked, this hides the set of Assays that have no measurement data.
class DGEmptyAssaysWidget extends DG.DataGridOptionWidget {
    // Return a fragment to use in generating option widget IDs
    getIDFragment(uniqueID): string {
        return "TableShowEAssaysCB";
    }

    // Return text used to label the widget
    getLabelText(): string {
        return "Show Empty";
    }

    getLabelTitle(): string {
        return "Show assays that don't have any measurements in them.";
    }

    // Returns true if the control should be enabled by default
    isEnabledByDefault(): boolean {
        return !!$("#filteringShowEmptyCheckbox").prop("checked");
    }

    // Handle activation of widget
    onWidgetChange(e): void {
        const amIChecked = !!this.checkBoxElement.checked;
        const isOtherChecked = !!$("#filteringShowEmptyCheckbox").prop("checked");
        $("#filteringShowEmptyCheckbox").prop("checked", amIChecked);
        if (amIChecked !== isOtherChecked) {
            $.event.trigger("eddrefresh");
        }
    }

    applyFilterToIDs(rowIDs: string[]): string[] {
        const checked = !!this.checkBoxElement.checked;
        // If the box is checked, return the set of IDs unfiltered
        if (checked) {
            return rowIDs;
        }
        return rowIDs.filter((id: string): boolean => {
            return !!EDDData.Assays[id].count;
        });
    }

    initialFormatRowElementsForID(dataRowObjects: any, rowID: string): any {
        const assay = EDDData.Assays[rowID];
        if (!assay.count) {
            $.each(dataRowObjects, (x, row) => {
                $(row.getElement()).addClass("emptyRecord");
            });
        }
    }
}

// wait for edddata event to begin processing page
$(document).on("edddata", onDataLoad);
