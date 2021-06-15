"use strict";

import Handsontable from "handsontable";

import { Access, Item } from "./Access";
import * as Render from "./Render";
import * as Utl from "../Utl";

const identity = (item) => item;
type FetchMode = "copy" | "render" | void;

const Checkbox_Column_Width = 23;

/**
 * Basic settings for a display-only table.
 */
const baseTableSettings: Handsontable.GridSettings = {
    "allowInsertRow": false,
    "allowInsertColumn": false,
    "allowRemoveRow": false,
    "allowRemoveColumn": false,
    // NOTE: JBEI and ABF covered under "academic research"
    "licenseKey": "non-commercial-and-evaluation",
    "manualColumnFreeze": true,
    "manualColumnMove": true,
    "manualColumnResize": true,
    "manualRowResize": true,
    "multiColumnSorting": true,
    "readOnly": true,
    "renderAllRows": true,
    "rowHeaders": true,
    "stretchH": "all",
    "width": "100%",
};

/**
 * Define settings for table displaying Assay information. The defined
 * table takes AssayRecord objects as data.
 */
export function settingsForAssayTable(
    access: Access,
    container: HTMLElement,
): Handsontable.GridSettings {
    const metaColumns = access.metadataForAssayTable().map((meta) => ({
        "data": `meta.${meta.id}`,
        "header": meta.name,
        // TODO: apply renderers if exists on MetadataType
    }));
    // register renderers used below
    Render.register();
    const columns = [
        {
            "data": "selected",
            "editor": "checkbox",
            "header": "",
            "readOnly": false,
            "renderer": "checkbox",
            "width": Checkbox_Column_Width,
        },
        {
            "data": "name",
            "header": "Assay Name",
        },
        {
            "data": ParentLineColumn.using(access),
            "header": "Line",
            "renderer": "edd.replicate_name",
        },
        {
            "data": ProtocolColumn.using(access),
            "header": "Protocol",
            "renderer": "edd.protocol",
        },
        ...metaColumns,
        {
            "data": "count",
            "header": "# of Measurements",
            "width": 50,
        },
    ];
    // merge base config with assay-specific config
    return Object.assign({}, baseTableSettings, {
        "beforeColumnMove": disableMoveFirstColumn,
        "beforeStretchingColumnWidth": disableResizeFirstColumn,
        "colHeaders": columns.map((c) => c.header),
        "columns": columns,
        "fixedColumnsLeft": 1,
    } as Handsontable.GridSettings);
}

/**
 * Defines settings for table displaying Line information. The defined
 * table takes LineRecord objects as data.
 */
export function settingsForLineTable(
    access: Access,
    container: HTMLElement,
): Handsontable.GridSettings {
    const metaColumns = access.metadataForLineTable().map((meta) => ({
        "data": `meta.${meta.id}`,
        "header": meta.name,
        // TODO: apply renderers if exists on MetadataType
    }));
    // register renderers used below
    Render.register();
    const columns = [
        {
            "data": "selected",
            "editor": "checkbox",
            "header": "",
            "readOnly": false,
            "renderer": "checkbox",
            "width": Checkbox_Column_Width,
        },
        {
            "data": LineNameColumn.using(access),
            "header": "Name",
            "renderer": "edd.replicate_name",
        },
        { "data": "description", "header": "Description" },
        // pair custom getter/setter with custom renderer
        // see a link from renderer, see a URL when copying, actual value is an ID
        {
            "data": StrainColumn.using(access),
            "header": "Strain",
            "renderer": "edd.strain",
        },
        // splice in metadata columns here
        ...metaColumns,
        {
            "data": LineExperimenterColumn.using(access),
            "header": "Experimenter",
            "renderer": "edd.user",
        },
        // see a date string in renderer, a UTC string when copying, actual value is timestamp
        {
            "data": LineModifiedColumn.using(access),
            "header": "Last Modified",
            "renderer": "edd.timestamp",
        },
    ];
    // merge base config with line-specific config
    return Object.assign({}, baseTableSettings, {
        "afterGetColHeader": disableMenuFirstColumn,
        "beforeColumnMove": disableMoveFirstColumn,
        "beforeStretchingColumnWidth": disableResizeFirstColumn,
        "colHeaders": columns.map((c) => c.header),
        "columns": columns,
        "dropdownMenu": [
            "alignment",
            // TODO: filter works off clipboard value, not rendered value
            // maybe need special handlers per column or render type?
            "filter_by_condition",
            "filter_by_value",
            "filter_action_bar",
        ],
        "filters": true,
        "fixedColumnsLeft": 1,
        "hiddenColumns": {
            "indicators": true,
        },
    } as Handsontable.GridSettings);
}

/**
 * Define settings for table displaying Measurement information. The
 * defined table takes Access.Item objects as data.
 */
export function settingsForMeasurementTable(
    access: Access,
    container: HTMLElement,
): Handsontable.GridSettings {
    // register renderers used below
    Render.register();
    const columns = [
        {
            "data": "measurement.selected",
            "editor": "checkbox",
            "header": `<input type="checkbox" class="select-all"/>`,
            "readOnly": false,
            "renderer": "checkbox",
            "width": Checkbox_Column_Width,
        },
        {
            "data": MeasurementClassColumn.using(access),
            "header": "Measurement",
            "renderer": "edd.mclass",
        },
        {
            "data": YUnitColumn.using(access),
            "header": "Units",
        },
        {
            "data": "line.name",
            "header": "Line",
        },
        {
            "data": "assay.name",
            "header": "Assay",
        },
        {
            "data": "measurement.values.length",
            "header": "# of Values",
            "width": 50,
        },
    ];
    // merge base config with measurement-specific config
    return Object.assign({}, baseTableSettings, {
        "beforeColumnMove": disableMoveFirstColumn,
        "beforeStretchingColumnWidth": disableResizeFirstColumn,
        "colHeaders": columns.map((c) => c.header),
        "columns": columns,
        "fixedColumnsLeft": 1,
    } as Handsontable.GridSettings);
}

/**
 * The Handsontable code will repeatedly replace elements in table header
 * cells. In order to prevent the flickering that occurs when the "Select All"
 * checkbox in the header is replaced, instead create the checkbox outside of
 * the table, then position it on top of the "empty" header cell.
 */
export function setupSelectAllCheckbox(hot: Handsontable, column = 0): void {
    // define select-all checkbox
    const selectAll = $(`<input type="checkbox" class="select-all"/>`);
    // get the config for selection column
    const selectCol = hot.getSettings().columns[column] as Handsontable.ColumnSettings;
    // insert the checkbox into DOM before the table, initially hidden
    selectAll.prependTo(hot.rootElement).addClass("hidden");
    // attach event handler to toggle selection states
    selectAll.on("click", (event) => {
        const status = selectAll.prop("checked");
        // update state of table data
        const rows = hot.getSourceData() as Handsontable.RowObject[];
        rows.forEach((row) => {
            Utl.setObjectValue(row, selectCol.data as string, status);
        });
    });
    // set event handlers on table to update select-all state
    const changeHandler = Utl.debounce(() => {
        const rows = hot.getSourceData() as Handsontable.RowObject[];
        const on = hot.getSourceDataAtCol(column).filter((v) => v);
        selectAll
            .prop("indeterminate", 0 < on.length && on.length < rows.length)
            .prop("checked", on.length === rows.length);
        $(hot.rootElement).trigger("eddselect", [on.length]);
    });
    hot.updateSettings({
        "afterChange": changeHandler,
        "afterRender": changeHandler,
    });
    // move the select-all checkbox into position
    repositionSelectAllCheckbox(hot, column);
}

/**
 * Calculates the correct offsets to place the select-all checkbox over the
 * correct table column header.
 */
export function repositionSelectAllCheckbox(hot: Handsontable, column = 0): void {
    const headerCell = $(hot.getCell(-1, 0));
    const offset = headerCell.offset();
    if (offset) {
        const selectAll = $(".select-all", hot.rootElement).removeClass("hidden");
        const checkWidth = selectAll.outerWidth();
        const checkHeight = selectAll.outerHeight();
        // set styling so checkbox gets positioned on top of the table
        selectAll.css({
            // move to offset of cell, taking off space for padding
            "left": offset.left - (Checkbox_Column_Width - checkWidth),
            "position": "absolute",
            // move down quarter checkbox height
            "top": checkHeight / 4,
            "z-index": 200,
        });
    }
}

/**
 * Callback for Handsontable.GridSettings.afterGetColHeader. Setting the event
 * handler to this function removes the menu dropdown from the first column.
 */
function disableMenuFirstColumn(column: number, th: HTMLElement): void {
    // see: https://github.com/handsontable/handsontable/issues/4253
    // hack to disable menu on only the first column
    if (column === 0) {
        $("button", th).remove();
    }
}

/**
 * Callback for Handsontable.GridSettings.beforeColumnMove. Setting the event
 * handler to this function prevents moving the first column of the table.
 */
function disableMoveFirstColumn(cols: number[], target: number): boolean | void {
    if (cols.indexOf(0) !== -1 || target === 0) {
        return false;
    }
}

/**
 * Callback for Handsontable.GridSettings.beforeStretchingColumnWidth. Setting
 * the event handler to this function prevents resizing the first column.
 */
function disableResizeFirstColumn(width: number, column: number): number {
    if (column === 0) {
        return Checkbox_Column_Width;
    }
    return width;
}

/**
 * Base class for accessor function factories.
 *
 * The first, U, type parameter is type of row object in the table.
 * The second, V, type parameter is the type sent to the cell renderer.
 */
abstract class TableAccessor<U, V> {
    protected constructor(protected readonly _access: Access) {}

    data(): Handsontable.ColumnDataGetterSetterFunction {
        return (row: U, value?: any, mode?: FetchMode): any | void => {
            // explicit no-op when used as a setter!
            if (value === undefined) {
                if (mode === "render") {
                    return this.forRender(row, value);
                } else {
                    return this.forCopy(row, value);
                }
            }
        };
    }

    abstract forCopy(row: U, value?: any): string;
    abstract forRender(row: U, value?: any): V;
}

class MeasurementClassColumn extends TableAccessor<Item, MeasurementClass> {
    static using(access: Access): Handsontable.ColumnDataGetterSetterFunction {
        return new MeasurementClassColumn(access).data();
    }

    forCopy(row: Item, value?: any): string {
        const cat = this.forRender(row, value);
        // TODO: copy formal ID when available
        return cat.measurementType.name;
    }

    forRender(row: Item, value?: any): MeasurementClass {
        return {
            "compartment": this._access.findCompartment(row.measurement.comp),
            "measurementType": this._access.findMeasurementType(row.measurement.type),
        };
    }
}

/**
 * Creates an accessor function for experimenter, yielding email addresses
 * while copying and a UserRecord object for the HTML renderer.
 */
class LineExperimenterColumn extends TableAccessor<LineRecord, UserRecord> {
    static using(access: Access): Handsontable.ColumnDataGetterSetterFunction {
        return new LineExperimenterColumn(access).data();
    }

    forCopy(row: LineRecord, value?: any): string {
        return this.forRender(row, value)?.email || "--";
    }

    forRender(row: LineRecord, value?: any): UserRecord {
        return this._access.findUser(row.experimenter);
    }
}

/**
 * Accesses the Line name, giving the renderer access to the LineRecord.
 * Clipboard value gives the first replicate name and count of replicates if
 * they exist, otherwise gives the string value of the name.
 */
class LineNameColumn extends TableAccessor<LineRecord, LineRecord> {
    static using(access: Access): Handsontable.ColumnDataGetterSetterFunction {
        return new LineNameColumn(access).data();
    }

    forCopy(row: LineRecord, value?: any): string {
        if (row.replicate_names) {
            const add_count = row.replicate_names.length - 1;
            return `${row.replicate_names[0]} (+${add_count})`;
        } else if (row.name) {
            return row.name;
        }
        return "--";
    }

    forRender(row: LineRecord, value?: any): LineRecord {
        return row;
    }
}

/**
 * Creates an accessor for modification time, allowing the renderer to create
 * HTML based on timestamp and a ISO-format string copied to the clipboard.
 */
class LineModifiedColumn extends TableAccessor<LineRecord, number> {
    static using(access: Access): Handsontable.ColumnDataGetterSetterFunction {
        return new LineModifiedColumn(access).data();
    }

    forCopy(row: LineRecord, value?: any): string {
        const timestamp = this.forRender(row, value);
        if (!Number.isFinite(timestamp)) {
            return "";
        }
        const date = new Date(timestamp * 1000);
        return date.toISOString();
    }

    forRender(row: LineRecord, value?: any): number {
        return row.modified?.time;
    }
}

class ParentLineColumn extends TableAccessor<AssayRecord, LineRecord> {
    static using(access: Access): Handsontable.ColumnDataGetterSetterFunction {
        return new ParentLineColumn(access).data();
    }

    forCopy(row: AssayRecord, value?: any): string {
        return this.forRender(row, value).name;
    }

    forRender(row: AssayRecord, value?: any): LineRecord {
        return this._access.findLine(row.lid);
    }
}

class ProtocolColumn extends TableAccessor<AssayRecord, ProtocolRecord> {
    static using(access: Access): Handsontable.ColumnDataGetterSetterFunction {
        return new ProtocolColumn(access).data();
    }

    forCopy(row: AssayRecord, value?: any): string {
        return this.forRender(row, value).name;
    }

    forRender(row: AssayRecord, value?: any): ProtocolRecord {
        return this._access.findProtocol(row.pid);
    }
}

/**
 * Accesses Strains, giving the renderer access to an array of StrainRecord
 * objects. Clipboard value yields newline-delimited string of ICE URL if it
 * exists, or the strain name.
 */
class StrainColumn extends TableAccessor<LineRecord, StrainRecord[]> {
    static using(access: Access): Handsontable.ColumnDataGetterSetterFunction {
        return new StrainColumn(access).data();
    }

    forCopy(row: LineRecord, value?: any): string {
        return this.forRender(row, value)
            .map((strain) => strain.registry_url || strain.name)
            .join("\n");
    }

    forRender(row: LineRecord, value?: any): StrainRecord[] {
        return row.strain.map((item) => this._access.findStrain(item)).filter(identity);
    }
}

class YUnitColumn extends TableAccessor<Item, string> {
    static using(access: Access): Handsontable.ColumnDataGetterSetterFunction {
        return new YUnitColumn(access).data();
    }

    forCopy(row: Item, value?: any): string {
        return this._access.findUnit(row.measurement.y_units).name;
    }

    forRender(row: Item, value?: any): string {
        return this._access.findUnit(row.measurement.y_units).name;
    }
}
