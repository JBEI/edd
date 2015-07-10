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
        event.data.table.off('mouseover.dragboxes');
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
        }).closest('.dragboxes').on('mouseover.dragboxes', 'td', dragOver);
        // wait for mouse to go up anywhere, then end drag events
        $(document).one('mouseup.dragboxes', { 'table': table }, dragEnd);
        return false;
    }
    Dragboxes.dragStart = dragStart;
    function initTable(table) {
        $(table).filter('.dragboxes').on('mousedown.dragboxes', 'td :checkbox, td label', dragStart);
    }
    Dragboxes.initTable = initTable;
})(Dragboxes || (Dragboxes = {}));
//# sourceMappingURL=Dragboxes.js.map