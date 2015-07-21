/// <reference path="typescript-declarations.d.ts" />

// Code for supporting drag-select

module Dragboxes {

    var globalChecked = null;

	export function findAndInitAllTables() {
		$('table.dragboxes').each((i, table) => initTable(table));
	}

    export function dragEnd(event) {
        globalChecked = null;
        event.data.table.off('mouseover.dragboxes');
    }

    export function dragOver(event) {
        if (globalChecked !== null) {
            $(':checkbox', this).prop('checked', globalChecked).trigger('change');
        }
    }

    export function dragStart(event) {
        var $this = $(this), table;
        // mousedown toggles the clicked checkbox value and stores new value in globalChecked
        if (globalChecked === null) {
            // have to check for null to prevent double event from clicking label
            $this.prop('checked', (i, value) => { return (globalChecked = !value); });
        }
        // also attaches mouseover event to all cells in parent table
        table = $(this).closest('.dragboxes').on('mouseover.dragboxes', 'td', dragOver);
        // wait for mouse to go up anywhere, then end drag events
        $(document).one('mouseup.dragboxes', { 'table': table }, dragEnd);
        return false;
    }

    export function initTable(table) {
        $(table).filter('.dragboxes')
            // watch for mousedown on checkboxes
            .on('mousedown.dragboxes', 'td :checkbox', dragStart)
            // also watch for mousedown on labels
            .on('mousedown.dragboxes', 'td label', dragStart)
            // disable click because mousedown is handling it now
            .on('click.dragboxes', 'td :checkbox', () => false);
    }
}
