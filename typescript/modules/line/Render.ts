"use strict";

import * as $ from "jquery";
import Handsontable from "handsontable";

import * as Utl from "../Utl";

const base = Handsontable.renderers.BaseRenderer;
// define a subset of the base renderer arguments
type RenderFn<T> = (
    td: HTMLTableCellElement,
    rowIndex: number,
    colIndex: number,
    value: T,
) => HTMLTableCellElement;

function buildRenderer<T>(fn: RenderFn<T>): Handsontable.renderers.Base {
    return (hot, td, row, column, prop, value, cellProp) => {
        base.call(this, hot, td, row, column, prop, value, cellProp);
        let resolved: T;
        if ($.isFunction(prop)) {
            // fetch the "render" value from ColumnDataGetterSetterFunction
            resolved = prop.apply(null, [
                hot.getSourceDataAtRow(row),
                undefined,
                "render",
            ]);
        } else {
            // value is already the "render" value
            resolved = value;
        }
        return fn(td, row, column, resolved);
    };
}

/**
 * Registers named renderers with Handsontable.
 *
 * Each renderer expects the value it receives to be a specific type:
 * edd.replicate_name -- entire LineRecord object
 * edd.strain -- a StrainRecord array
 * edd.timestamp -- a number (seconds since epoch)
 * edd.user -- a UserRecord
 */
export function register() {
    Handsontable.renderers.registerRenderer(
        "edd.replicate_name",
        buildRenderer((td, row, column, value: LineRecord) => {
            if (value.replicate_names) {
                const added_count = value.replicate_names.length - 1;
                const first = value.replicate_names[0];
                const additional = `<span class="replicateLineShow">(+${added_count})</span>`;
                td.innerHTML = `${first} ${additional}`;
            } else {
                td.innerHTML = value?.name;
            }
            return td;
        }),
    );
    Handsontable.renderers.registerRenderer(
        "edd.strain",
        buildRenderer((td, row, column, value: StrainRecord[]) => {
            if (value.length > 0) {
                td.innerHTML = value
                    .map((strain) => {
                        if (strain.registry_url) {
                            return `<a href="${strain.registry_url}"
                                target="_blank">${strain.name}</a>`;
                        }
                        return strain.name;
                    })
                    .join("<br/>");
            } else {
                td.innerHTML = "--";
            }
            return td;
        }),
    );
    Handsontable.renderers.registerRenderer(
        "edd.timestamp",
        buildRenderer((td, row, column, value: number) => {
            td.innerHTML = Utl.JS.timestampToTodayString(value);
            return td;
        }),
    );
    Handsontable.renderers.registerRenderer(
        "edd.user",
        buildRenderer((td, row, column, value: UserRecord) => {
            td.innerHTML = value?.initials || "--";
            return td;
        }),
    );
}
