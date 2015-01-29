/// <reference path="typescript-declarations.d.ts" />
// Code for supporting drag-select
var Dragboxes;
(function (Dragboxes) {
    var globalChecked = null;
    function findAndInitAllTables() {
        $('table.dragboxes').each(function (i, table) { return initTable(table); });
    }
    Dragboxes.findAndInitAllTables = findAndInitAllTables;
    function dragEnd(event) {
        globalChecked = null;
        event.data.table.off('mousedown', 'td :checkbox', dragStart).off('mouseover', 'td', dragOver);
    }
    Dragboxes.dragEnd = dragEnd;
    function dragOver(event) {
        if (globalChecked !== null) {
            $(':checkbox', this).prop('checked', globalChecked);
        }
    }
    Dragboxes.dragOver = dragOver;
    function dragStart(event) {
        // mousedown toggles the clicked checkbox value and stores new value in globalChecked
        // also attaches mouseover event to all cells in parent table
        var table = $(this).prop('checked', function (i, value) {
            return (globalChecked = !value);
        }).closest('.dragboxes').on('mouseover', 'td', dragOver);
        // wait for mouse to go up anywhere, then end drag events
        $(document).one('mouseup', { 'table': table }, dragEnd);
        return false;
    }
    Dragboxes.dragStart = dragStart;
    function initTable(table) {
        $(table).filter('.dragboxes').on('mousedown', 'td :checkbox', dragStart);
    }
    Dragboxes.initTable = initTable;
})(Dragboxes || (Dragboxes = {}));
// call function when ready
$(Dragboxes.findAndInitAllTables);
//# sourceMappingURL=Dragboxes.js.map