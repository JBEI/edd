"use strict";

import Handsontable from "handsontable";

import { Item, LazyAccess } from "./Access";
import * as Render from "./Render";

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
    lazy: LazyAccess,
    metaTypes: MetadataTypeRecord[],
    container: HTMLElement,
): Handsontable.GridSettings {
    const metaColumns = metaTypes.map((meta: MetadataTypeRecord) => ({
        "data": `metadata.${meta.pk}`,
        "header": meta.type_name,
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
            "data": ParentLineColumn.using(lazy),
            "header": "Line",
            "renderer": "edd.replicate_name",
        },
        {
            "data": ProtocolColumn.using(lazy),
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
        "afterChange": () => {
            $(container).trigger("eddselect");
        },
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
    lazy: LazyAccess,
    metaTypes: MetadataTypeRecord[],
    container: HTMLElement,
): Handsontable.GridSettings {
    const visibleMeta = metaTypes.filter((meta) => meta.input_type !== "replicate");
    const metaColumns = visibleMeta.map((meta: MetadataTypeRecord) => ({
        "data": `metadata.${meta.pk}`,
        "header": meta.type_name,
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
            "data": LineNameColumn.using(),
            "header": "Name",
            "renderer": "edd.replicate_name",
        },
        { "data": "description", "header": "Description" },
        // pair custom getter/setter with custom renderer
        // see a link from renderer, see a URL when copying, actual value is an ID
        {
            "data": StrainColumn.using(),
            "header": "Strain",
            "renderer": "edd.strain",
        },
        // splice in metadata columns here
        ...metaColumns,
        {
            "data": LineExperimenterColumn.using(lazy),
            "header": "Experimenter",
            "renderer": "edd.user",
        },
        // see a date string in renderer, a UTC string when copying, actual value is timestamp
        {
            "data": LineModifiedColumn.using(),
            "header": "Last Modified",
            "renderer": "edd.timestamp",
        },
    ];
    // merge base config with line-specific config
    return Object.assign({}, baseTableSettings, {
        "afterChange": () => {
            $(container).trigger("eddselect");
        },
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
    lazy: LazyAccess,
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
            "data": MeasurementClassColumn.using(lazy),
            "header": "Measurement",
            "renderer": "edd.mclass",
        },
        {
            "data": YUnitColumn.using(lazy),
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
        "afterChange": () => {
            $(container).trigger("eddselect");
        },
        "beforeColumnMove": disableMoveFirstColumn,
        "beforeStretchingColumnWidth": disableResizeFirstColumn,
        "colHeaders": columns.map((c) => c.header),
        "columns": columns,
        "fixedColumnsLeft": 1,
    } as Handsontable.GridSettings);
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
    protected constructor(private readonly lazy: LazyAccess) {
        super();
    }

    static using(lazy: LazyAccess): Handsontable.ColumnDataGetterSetterFunction {
        return new MeasurementClassColumn(lazy).data();
    }

    forCopy(row: Item, value?: any): string {
        const cat = this.forRender(row, value);
        // TODO: copy formal ID when available
        return cat.measurementType.name;
    }

    forRender(row: Item, value?: any): MeasurementClass {
        return {
            "compartment": this.lazy.compartment.get(row.measurement.compartment),
            "measurementType": this.lazy.type.get(row.measurement.type),
        };
    }
}

/**
 * Creates an accessor function for experimenter, yielding email addresses
 * while copying and a UserRecord object for the HTML renderer.
 */
class LineExperimenterColumn extends TableAccessor<LineRecord, UserRecord> {
    protected constructor(private readonly lazy: LazyAccess) {
        super();
    }

    static using(lazy: LazyAccess): Handsontable.ColumnDataGetterSetterFunction {
        return new LineExperimenterColumn(lazy).data();
    }

    forCopy(row: LineRecord, value?: any): string {
        return this.forRender(row, value)?.email || "--";
    }

    forRender(row: LineRecord, value?: any): UserRecord {
        return this.lazy.user.get(row.experimenter);
    }
}

/**
 * Accesses the Line name, giving the renderer access to the LineRecord.
 * Clipboard value gives the first replicate name and count of replicates if
 * they exist, otherwise gives the string value of the name.
 */
class LineNameColumn extends TableAccessor<LineRecord, LineRecord> {
    static using(): Handsontable.ColumnDataGetterSetterFunction {
        return new LineNameColumn().data();
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
    static using(): Handsontable.ColumnDataGetterSetterFunction {
        return new LineModifiedColumn().data();
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
        return row.updated?.time;
    }
}

class ParentLineColumn extends TableAccessor<AssayRecord, LineRecord> {
    protected constructor(private readonly lazy: LazyAccess) {
        super();
    }

    static using(lazy: LazyAccess): Handsontable.ColumnDataGetterSetterFunction {
        return new ParentLineColumn(lazy).data();
    }

    forCopy(row: AssayRecord, value?: any): string {
        return this.forRender(row, value).name;
    }

    forRender(row: AssayRecord, value?: any): LineRecord {
        return this.lazy.line.get(row.line);
    }
}

class ProtocolColumn extends TableAccessor<AssayRecord, ProtocolRecord> {
    protected constructor(private readonly lazy: LazyAccess) {
        super();
    }

    static using(lazy: LazyAccess): Handsontable.ColumnDataGetterSetterFunction {
        return new ProtocolColumn(lazy).data();
    }

    forCopy(row: AssayRecord, value?: any): string {
        return this.forRender(row, value)?.name;
    }

    forRender(row: AssayRecord, value?: any): ProtocolRecord {
        return this.lazy.protocol.get(row.protocol);
    }
}

/**
 * Accesses Strains, giving the renderer access to an array of StrainRecord
 * objects. Clipboard value yields newline-delimited string of ICE URL if it
 * exists, or the strain name.
 */
class StrainColumn extends TableAccessor<LineRecord, StrainRecord[]> {
    static using(): Handsontable.ColumnDataGetterSetterFunction {
        return new StrainColumn().data();
    }

    forCopy(row: LineRecord, value?: any): string {
        return this.forRender(row, value)
            .map((strain) => strain.registry_url || strain.name)
            .join("\n");
    }

    forRender(row: LineRecord, value?: any): StrainRecord[] {
        return row.strains;
    }
}

class YUnitColumn extends TableAccessor<Item, string> {
    protected constructor(private readonly lazy: LazyAccess) {
        super();
    }

    static using(lazy: LazyAccess): Handsontable.ColumnDataGetterSetterFunction {
        return new YUnitColumn(lazy).data();
    }

    forCopy(row: Item, value?: any): string {
        return this.lazy.unit.get(row.measurement.y_units)?.name;
    }

    forRender(row: Item, value?: any): string {
        return this.lazy.unit.get(row.measurement.y_units)?.name;
    }
}
