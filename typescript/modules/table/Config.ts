"use strict";

import Handsontable from "handsontable";

import { Access, Item } from "./Access";
import * as Render from "./Render";

const identity = (item) => item;
type FetchMode = "copy" | "render" | void;

/**
 * Define column settings for table displaying Assay information. The defined
 * table takes AssayRecord objects as data.
 */
export function defineAssayColumns(access: Access): Handsontable.ColumnSettings[] {
    const metaColumns = access.metadataForAssayTable().map((meta) => ({
        "data": `meta.${meta.id}`,
        "header": meta.name,
        // TODO: apply renderers if exists on MetadataType
    }));
    // register renderers used below
    Render.register();
    return [
        {
            "data": "selected",
            "editor": "checkbox",
            "header": `<input type="checkbox" class="select-all"/>`,
            "readOnly": false,
            "renderer": "checkbox",
            "width": 23,
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
}

/**
 * Defines column settings for table displaying Line information. The defined
 * table takes LineRecord objects as data.
 */
export function defineLineColumns(access: Access): Handsontable.ColumnSettings[] {
    const metaColumns = access.metadataForLineTable().map((meta) => ({
        "data": `meta.${meta.id}`,
        "header": meta.name,
        // TODO: apply renderers if exists on MetadataType
    }));
    // register renderers used below
    Render.register();
    return [
        {
            "data": "selected",
            "editor": "checkbox",
            "header": `<input type="checkbox" class="select-all"/>`,
            "readOnly": false,
            "renderer": "checkbox",
            "width": 23,
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
}

/**
 * Define column settings for table displaying Measurement information. The
 * defined table takes Access.Item objects as data.
 */
export function defineMeasurementColumns(
    access: Access,
): Handsontable.ColumnSettings[] {
    // register renderers used below
    Render.register();
    return [
        {
            "data": "measurement.selected",
            "editor": "checkbox",
            "header": `<input type="checkbox" class="select-all"/>`,
            "readOnly": false,
            "renderer": "checkbox",
            "width": 23,
        },
        {
            "data": CategoryColumn.using(access),
            "header": "Measurement",
            "renderer": "edd.category",
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
}

/**
 * Callback for Handsontable.GridSettings.afterGetColHeader. Setting the event
 * handler to this function removes the menu dropdown from the first column.
 */
export function disableMenuFirstColumn(column: number, th: HTMLElement): void {
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
export function disableMoveFirstColumn(cols: number[], target: number): boolean | void {
    if (cols.indexOf(0) !== -1 || target === 0) {
        return false;
    }
}

/**
 * Callback for Handsontable.GridSettings.beforeStretchingColumnWidth. Setting
 * the event handler to this function prevents resizing the first column.
 */
export function disableResizeFirstColumn(width: number, column: number): number {
    if (column === 0) {
        return 23;
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

class CategoryColumn extends TableAccessor<Item, Category> {
    static using(access: Access): Handsontable.ColumnDataGetterSetterFunction {
        return new CategoryColumn(access).data();
    }

    forCopy(row: Item, value?: any): string {
        const cat = this.forRender(row, value);
        // TODO: copy formal ID when available
        return cat.measurementType.name;
    }

    forRender(row: Item, value?: any): Category {
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
        if (Number.isNaN(timestamp)) {
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
