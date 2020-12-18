"use strict";
// Code for supporting drag-select

import * as $ from "jquery";

let globalChecked: boolean = null;

export function findAndInitAllTables(): void {
    $("table.dragboxes").each((i: number, table: HTMLElement): void =>
        initTable(table),
    );
}

export function dragEnd(event: JQueryMouseEventObject): void {
    globalChecked = null;
    event.data.table.off("mouseover.dragboxes");
}

export function dragOver(): void {
    if (globalChecked !== null) {
        $(":checkbox", this).prop("checked", globalChecked).trigger("change");
    }
}

export function dragStart(event: JQueryMouseEventObject): boolean {
    const $this: JQuery = $(this);
    // ignore mouse events not using the left mouse button
    if (event.which !== 1) {
        return true;
    }
    // mousedown toggles the clicked checkbox value and stores new value in globalChecked
    if (globalChecked === null) {
        // may have clicked label, so go to parent TD and find the checkbox
        const checkbox = $this.closest("td").find(":checkbox");
        // have to check for null to prevent double event from clicking label
        checkbox
            .prop("checked", (i: number, value: boolean): boolean => {
                return (globalChecked = !value);
            })
            .trigger("change");
    }
    // also attaches mouseover event to all cells in parent table
    const table = $this.closest(".dragboxes").on("mouseover.dragboxes", "td", dragOver);
    // wait for mouse to go up anywhere, then end drag events
    $(document).on("mouseup.dragboxes", { "table": table }, dragEnd);
    return false;
}

export function initTable(table: JQuery | HTMLElement): void {
    $(table)
        .filter(".dragboxes")
        // watch for mousedown on checkboxes
        .on("mousedown.dragboxes", "td :checkbox", dragStart)
        // also watch for mousedown on labels
        .on("mousedown.dragboxes", "td label", dragStart)
        // disable click because mousedown is handling it now
        .on("click.dragboxes", "td :checkbox", (): boolean => false);
}
