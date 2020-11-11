"use strict";

import Handsontable from "handsontable";

import { Access } from "./Access";
import * as Render from "./Render";

const identity = (item) => item;
type FetchMode = "copy" | "render" | void;

/**
 * Define column settings for table displaying Assay and Measurement
 * information. The defined table takes Filter.Item objects as data.
 */
export function defineAssayColumns(): Handsontable.ColumnSettings[] {
    // TODO: form of Filter.Item depends on filter mode:
    // - Assay, like current EDD, individual assays are distinct;
    // - Line, any assays with same Line + Protocol are joined;
    // - Replicate, any assays with same Replicate ID + Protocol are joined;
    return [
        {
            "editor": "checkbox",
            "header": `<input type="checkbox" class="select-all"/>`,
            "readOnly": false,
            "renderer": "checkbox",
            "width": 23,
        },
        {
            "data": "assay.name",
            "header": "Assay Name",
        },
        {
            "data": "line.name",
            "header": "Line",
        },
        {
            "editor": "checkbox",
            "header": `<input type="checkbox" class="select-all"/>`,
            "readOnly": false,
            "renderer": "checkbox",
            "width": 23,
        },
        {
            "data": "measurement.type",
            "header": "Measurement",
        },
        {
            "data": "measurement.y_units",
            "header": "Units",
        },
        {
            "data": "measurement.values.length",
            "header": "Count",
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
            "data": LineNameColumn.create(access).data(),
            "header": "Name",
            "renderer": "edd.replicate_name",
        },
        { "data": "description", "header": "Description" },
        // pair custom getter/setter with custom renderer
        // see a link from renderer, see a URL when copying, actual value is an ID
        {
            "data": StrainColumn.create(access).data(),
            "header": "Strain",
            "renderer": "edd.strain",
        },
        // splice in metadata columns here
        ...metaColumns,
        {
            "data": LineExperimenterColumn.create(access).data(),
            "header": "Experimenter",
            "renderer": "edd.user",
        },
        // see a date string in renderer, a UTC string when copying, actual value is timestamp
        {
            "data": LineModifiedColumn.create(access).data(),
            "header": "Last Modified",
            "renderer": "edd.timestamp",
        },
    ];
}

export function defineMeasurementColumns(
    access: Access,
): Handsontable.ColumnSettings[] {
    return [
        {
            "editor": "checkbox",
            "header": `<input type="checkbox" class="select-all"/>`,
            "readOnly": false,
            "renderer": "checkbox",
            "width": 23,
        },
        {
            "data": "measurement.type",
            "header": "Measurement",
        },
        {
            "data": "measurement.y_units",
            "header": "Units",
        },
        {
            "data": "measurement.values.length",
            "header": "Count",
        },
    ];
}

/**
 * Callback for Handsontable.GridSettings.afterGetColHeader. Setting the event
 * handler to this function removes the menu dropdown from the first column.
 */
export function disableMenuFirstColumn(column, th): void {
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
 * Base class for accessor function factories. Calling the data() method yields
 * an instance of ColumnDataGetterSetterFunction, determining how a column in
 * the table will get displayed and copied to the clipboard.
 */
abstract class TableAccessor {
    protected constructor(protected readonly _access: Access) {}

    data(): Handsontable.ColumnDataGetterSetterFunction {
        return (row: LineRecord, value?: any, mode?: FetchMode): any | void => {
            if (value === undefined) {
                if (mode === "render") {
                    return this.forRender()(row, value);
                } else {
                    return this.forCopy()(row, value);
                }
            }
        };
    }

    abstract forCopy(): Handsontable.ColumnDataGetterSetterFunction;
    abstract forRender(): Handsontable.ColumnDataGetterSetterFunction;
}

/**
 * Creates an accessor function for experimenter, yielding email addresses
 * while copying and a UserRecord object for the HTML renderer.
 */
class LineExperimenterColumn extends TableAccessor {
    static create(access: Access): LineExperimenterColumn {
        return new LineExperimenterColumn(access);
    }

    forCopy(): Handsontable.ColumnDataGetterSetterFunction {
        return (row: LineRecord, value?: any): string => {
            const user = this._access.findUser(row.experimenter);
            return user?.email || "--";
        };
    }

    forRender(): Handsontable.ColumnDataGetterSetterFunction {
        return (row: LineRecord, value?: any): UserRecord => {
            return this._access.findUser(row.experimenter);
        };
    }
}

/**
 * Accesses the Line name, giving the renderer access to the LineRecord.
 * Clipboard value gives the first replicate name and count of replicates if
 * they exist, otherwise gives the string value of the name.
 */
class LineNameColumn extends TableAccessor {
    static create(access: Access): LineNameColumn {
        return new LineNameColumn(access);
    }

    forCopy(): Handsontable.ColumnDataGetterSetterFunction {
        return (row: LineRecord, value?: any): string => {
            if (row.replicate_names) {
                const add_count = row.replicate_names.length - 1;
                return `${row.replicate_names[0]} (+${add_count})`;
            } else if (row.name) {
                return row.name;
            }
            return "--";
        };
    }

    forRender(): Handsontable.ColumnDataGetterSetterFunction {
        return (row: LineRecord, value?: any): LineRecord => row;
    }
}

/**
 * Creates an accessor for modification time, allowing the renderer to create
 * HTML based on timestamp and a ISO-format string copied to the clipboard.
 */
class LineModifiedColumn extends TableAccessor {
    static create(access: Access): LineModifiedColumn {
        return new LineModifiedColumn(access);
    }

    forCopy(): Handsontable.ColumnDataGetterSetterFunction {
        return (row: LineRecord, value?: any): string => {
            const timestamp = row.modified?.time * 1000;
            if (Number.isNaN(timestamp)) {
                return "";
            }
            const date = new Date(row.modified?.time * 1000);
            return date.toISOString();
        };
    }

    forRender(): Handsontable.ColumnDataGetterSetterFunction {
        return (row: LineRecord, value?: any): number => row.modified?.time;
    }
}

/**
 * Accesses Strains, giving the renderer access to an array of StrainRecord
 * objects. Clipboard value yields newline-delimited string of ICE URL if it
 * exists, or the strain name.
 */
class StrainColumn extends TableAccessor {
    static create(access: Access): StrainColumn {
        return new StrainColumn(access);
    }

    forCopy(): Handsontable.ColumnDataGetterSetterFunction {
        return (row: LineRecord, value?: any): string => {
            return row.strain
                .map((item) => {
                    const strain = this._access.findStrain(item);
                    return strain?.registry_url || strain?.name;
                })
                .filter(identity)
                .join("\n");
        };
    }

    forRender(): Handsontable.ColumnDataGetterSetterFunction {
        return (row: LineRecord, value?: any): StrainRecord[] => {
            return row.strain
                .map((item) => this._access.findStrain(item))
                .filter(identity);
        };
    }
}
