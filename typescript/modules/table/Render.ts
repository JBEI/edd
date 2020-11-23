"use strict";

import * as $ from "jquery";
import Handsontable from "handsontable";

import * as Utl from "../Utl";

const base = Handsontable.renderers.BaseRenderer;
// define a subset of the base renderer arguments
type RenderFn<T> = (td: HTMLTableCellElement, value: T) => HTMLTableCellElement;

function buildRenderer<T>(fn: RenderFn<T>): Handsontable.renderers.Base {
    return (hot, td, row, column, prop, value, cellProp) => {
        base.call(this, hot, td, row, column, prop, value, cellProp);
        let resolved: T;
        if ($.isFunction(prop)) {
            // fetch the "render" value from ColumnDataGetterSetterFunction
            const physical_row = hot.toPhysicalRow(row);
            resolved = prop.apply(null, [
                hot.getSourceDataAtRow(physical_row),
                undefined,
                "render",
            ]);
        } else {
            // value is already the "render" value
            resolved = value;
        }
        return fn(td, resolved);
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
    // TODO: link to PubChem or UniProt or ICE or ...?
    Handsontable.renderers.registerRenderer(
        "edd.category",
        buildRenderer((td, value: Category) => {
            if (value.measurementType.family === "m" && value.compartment.id !== "0") {
                td.innerHTML = `${value.compartment.code} ${value.measurementType.name}`;
            } else {
                td.innerHTML = value.measurementType.name;
            }
            return td;
        }),
    );
    // TODO: link to protocol.io once available?
    Handsontable.renderers.registerRenderer(
        "edd.protocol",
        buildRenderer((td, value: ProtocolRecord) => {
            td.innerHTML = value.name;
            return td;
        }),
    );
    Handsontable.renderers.registerRenderer(
        "edd.replicate_name",
        buildRenderer((td, value: LineRecord) => {
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
        buildRenderer((td, value: StrainRecord[]) => {
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
        buildRenderer((td, value: number) => {
            td.innerHTML = Utl.JS.timestampToTodayString(value);
            return td;
        }),
    );
    Handsontable.renderers.registerRenderer(
        "edd.user",
        buildRenderer((td, value: UserRecord) => {
            td.innerHTML = value?.initials || "--";
            return td;
        }),
    );
}
