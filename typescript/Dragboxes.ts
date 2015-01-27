/// <reference path="typescript-declarations.d.ts" />

// Code for supporting drag-select

module Dragboxes {

    var globalChecked = null;

	export function findAndInitAllTables() {
		$('table.dragboxes').each((i, table) => initTable(table));
	}

    export function dragEnd(event) {
        globalChecked = null;
        event.data.table.off('mousedown', 'td :checkbox', dragStart)
            .off('mouseover', 'td', dragOver);
    }

    export function dragOver(event) {
        if (globalChecked !== null) {
            $(':checkbox', this).prop('checked', globalChecked);
        }
    }

    export function dragStart(event) {
        // mousedown toggles the clicked checkbox value and stores new value in globalChecked
        // also attaches mouseover event to all cells in parent table
        var table = $(this).prop('checked', (i, value) => { return (globalChecked = !value); })
            .closest('.dragboxes').on('mouseover', 'td', dragOver);
        // wait for mouse to go up anywhere, then end drag events
        $(document).one('mouseup', { 'table': table }, dragEnd);
        return false;
    }

    export function initTable(table) {
        $(table).filter('.dragboxes').on('mousedown', 'td :checkbox', dragStart);
    }
}

// call function when ready
$(Dragboxes.findAndInitAllTables);
