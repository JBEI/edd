"use strict";

import * as $ from "jquery";
import Handsontable from "handsontable";

import * as Utl from "../Utl";
import * as Render from "./Render";

const identity = (item) => item;
const $window = $(window);

type FetchMode = "copy" | "render" | void;

/**
 * Defines column settings for table displaying Line information, given an
 * Access object and a listing of metadata to show.
 */
export function columns(access: Access): Handsontable.ColumnSettings[] {
    const metaColumns = access.metadata().map((meta) => ({
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
        { "data": "name", "header": "Name" },
        { "data": "description", "header": "Description" },
        // pair custom getter/setter with custom renderer
        // see a link from renderer, see a URL when copying, actual value is an ID
        {
            "data": access.strain(),
            "header": "Strain",
            "renderer": "edd.strain",
        },
        // splice in metadata columns here
        ...metaColumns,
        {
            "data": access.experimenter(),
            "header": "Experimenter",
            "renderer": "edd.user",
        },
        // see a date string in renderer, a UTC string when copying, actual value is timestamp
        {
            "data": access.modified(),
            "header": "Last Modified",
            "renderer": "edd.timestamp",
        },
    ];
}

/**
 * Calculates pixel height available in page with bottom bar overlaid on the
 * content container.
 */
export function computeHeight() {
    const container = $("#studyLinesTable");
    const bottomBar = $("#bottomBar");
    return Math.max(
        500,
        $window.height() - container.offset().top - bottomBar.height(),
    );
}

export function disableMenuFirstColumn(column, th): void {
    // see: https://github.com/handsontable/handsontable/issues/4253
    // hack to disable menu on only the first column
    if (column === 0) {
        $("button", th).remove();
    }
}

export function disableMoveFirstColumn(cols: number[], target: number): boolean | void {
    if (cols.indexOf(0) !== -1 || target === 0) {
        return false;
    }
}

export function disableResizeFirstColumn(width: number, column: number): number {
    if (column === 0) {
        return 23;
    }
    return width;
}

/**
 * Creates a listener for changes to table data, updating status of buttons and
 * the select-all checkbox.
 */
export function handleChange(
    access: Access,
    container: Element,
): (...args: any[]) => void {
    return Utl.debounce(() => {
        const lines: LineRecord[] = access.lines();
        const total = lines.length;
        const selected = lines.filter((line) => line?.selected).length;
        const selectAll = $(".select-all", container);
        selectAll
            .prop("indeterminate", 0 < selected && selected < total)
            .prop("checked", selected === total);
        // enable buttons if needed
        $(".disablableButtons > button").prop("disabled", selected === 0);
    });
}

/**
 * Class collects function factories used to create accessor functions.
 *
 * Once initialized with a view of data, the methods on this class give
 * getter/setter methods for the table. Additionally, these accessor functions
 * are extended with an optional getter mode, allowing for different values to
 * be used for rendering table HTML and for copying data to the clipboard.
 *
 * Current implementation only provides getters. If used in a setter context,
 * the result is a no-op. This may change in the future if use of the table is
 * extended to allow inline editing of values in addition to existing forms.
 */
export class Access {
    protected constructor(
        private _data: EDDData,
        private _metadata: MetadataTypeRecord[],
    ) {}

    public static initAccess(data: EDDData): Access {
        const metaKeys = new Set<string | number>();
        Object.values(data.Lines).forEach((line) => {
            // initializing every LineRecord with selected = false
            // prevents checkboxes from showing as initially disabled
            // failing to initialize will give undefined behavior to select-all checkbox
            line.selected = false;
            // collecting the used metadata keys
            Object.keys(line.meta).forEach((key) => metaKeys.add(key));
        });
        const metadata = Array.from(metaKeys).map((key) => data.MetaDataTypes[key]);
        return new Access(data, metadata);
    }

    /**
     * Creates an accessor function for experimenter, yielding email addresses
     * while copying and a UserRecord object for the HTML renderer.
     */
    experimenter(): Handsontable.ColumnDataGetterSetterFunction {
        return this.decorateWithModeParam(
            this.experimenterForClipboard(),
            this.experimenterForRender(),
        );
    }

    /**
     * Creates an accessor function for experimenter, yielding an email address,
     * or a default string "--" if none.
     */
    experimenterForClipboard(): Handsontable.ColumnDataGetterSetterFunction {
        return (row: LineRecord, value?: any): string => {
            const user = this.convertUserRecord(row.experimenter);
            return user?.email || "--";
        };
    }

    /**
     * Creates an accessor function for experimenter, yielding a UserRecord.
     */
    experimenterForRender(): Handsontable.ColumnDataGetterSetterFunction {
        return (row: LineRecord, value?: any): UserRecord => {
            return this.convertUserRecord(row.experimenter);
        };
    }

    lines(): LineRecord[] {
        return Object.values(this._data.Lines);
    }

    metadata(): MetadataTypeRecord[] {
        return this._metadata;
    }

    /**
     * Creates an accessor for modification time, allowing the renderer to
     * create HTML based on timestamp and a ISO-format string copied to
     * the clipboard.
     */
    modified(): Handsontable.ColumnDataGetterSetterFunction {
        return this.decorateWithModeParam(
            this.modifiedForClipboard(),
            this.modifiedForRender(),
        );
    }

    /**
     * Creates an accessor function for modification time, yielding an
     * ISO-formatted timestamp string for copying.
     */
    modifiedForClipboard(): Handsontable.ColumnDataGetterSetterFunction {
        return (row: LineRecord, value?: any): string => {
            const date = new Date(row.modified.time * 1000);
            return date.toISOString();
        };
    }

    /**
     * Creates an accessor function for modification time, yielding the
     * stored timestamp value for the renderer to display.
     */
    modifiedForRender(): Handsontable.ColumnDataGetterSetterFunction {
        return (row: LineRecord, value?: any): number => {
            return row.modified.time;
        };
    }

    /**
     * Creates an accessor function for strains, yielding URLs while copying
     * and a StrainRecord object for the HTML renderer.
     */
    strain(): Handsontable.ColumnDataGetterSetterFunction {
        return this.decorateWithModeParam(
            this.strainForClipboard(),
            this.strainForRender(),
        );
    }

    /**
     * Creates an accessor function for strains, yielding newline-separated
     * URLs for strains on the row.
     */
    strainForClipboard(): Handsontable.ColumnDataGetterSetterFunction {
        return (row: LineRecord, value?: any): string => {
            return row.strain
                .map((item) => {
                    const strain = this._data.Strains?.[item];
                    return strain?.registry_url;
                })
                .filter(identity)
                .join("\n");
        };
    }

    /**
     * Creates an accessor function for strains, yielding the StrainRecord
     * objects on the row.
     */
    strainForRender(): Handsontable.ColumnDataGetterSetterFunction {
        return (row: LineRecord, value?: any): StrainRecord[] => {
            return row.strain
                .map((item) => this._data.Strains?.[item])
                .filter(identity);
        };
    }

    private decorateWithModeParam(
        copyFn: Handsontable.ColumnDataGetterSetterFunction,
        renderFn: Handsontable.ColumnDataGetterSetterFunction,
    ): Handsontable.ColumnDataGetterSetterFunction {
        return (row: LineRecord, value?: any, mode?: FetchMode): any | void => {
            if (value === undefined) {
                if (mode === "render") {
                    return renderFn(row, value);
                } else {
                    return copyFn(row, value);
                }
            }
        };
    }

    private convertUserRecord(value: number | BasicContact | UserRecord) {
        if (this.isBasicContact(value)) {
            const basic = value as BasicContact;
            return this._data.Users[basic.user_id];
        } else if (this.isUserRecord(value)) {
            return value as UserRecord;
        }
        return this._data.Users[value as number];
    }

    private isBasicContact(value): boolean {
        try {
            return Object.prototype.hasOwnProperty.call(value, "extra");
        } catch {
            return false;
        }
    }

    private isUserRecord(value): boolean {
        try {
            return Object.prototype.hasOwnProperty.call(value, "uid");
        } catch {
            return false;
        }
    }
}
