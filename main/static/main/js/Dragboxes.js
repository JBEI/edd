// File last modified on: Wed Dec 21 2016 14:53:35  
/// <reference path="typescript-declarations.d.ts" />
// Code for supporting drag-select
var Dragboxes;
(function (Dragboxes) {
    'use strict';
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
            $(':checkbox', this).prop('checked', globalChecked).trigger('change');
        }
    }
    Dragboxes.dragOver = dragOver;
    function dragStart(event) {
        var $this = $(this), checkbox, table;
        // ignore mouse events not using the left mouse button
        if (event.which !== 1) {
            return true;
        }
        // mousedown toggles the clicked checkbox value and stores new value in globalChecked
        if (globalChecked === null) {
            // may have clicked label, so go to parent TD and find the checkbox
            checkbox = $this.closest('td').find(':checkbox');
            // have to check for null to prevent double event from clicking label
            checkbox.prop('checked', function (i, value) {
                return (globalChecked = !value);
            }).trigger('change');
        }
        // also attaches mouseover event to all cells in parent table
        table = $this.closest('.dragboxes').on('mouseover.dragboxes', 'td', dragOver);
        // wait for mouse to go up anywhere, then end drag events
        $(document).one('mouseup.dragboxes', { 'table': table }, dragEnd);
        return false;
    }
    Dragboxes.dragStart = dragStart;
    function initTable(table) {
        $(table).filter('.dragboxes')
            .on('mousedown.dragboxes', 'td :checkbox', dragStart)
            .on('mousedown.dragboxes', 'td label', dragStart)
            .on('click.dragboxes', 'td :checkbox', function () { return false; });
    }
    Dragboxes.initTable = initTable;
})(Dragboxes || (Dragboxes = {}));
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiRHJhZ2JveGVzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiRHJhZ2JveGVzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLG9EQUFvRDtBQUNwRCxxREFBcUQ7QUFFckQsa0NBQWtDO0FBRWxDLElBQU8sU0FBUyxDQW1EZjtBQW5ERCxXQUFPLFNBQVMsRUFBQyxDQUFDO0lBQ2QsWUFBWSxDQUFDO0lBRWIsSUFBSSxhQUFhLEdBQVcsSUFBSSxDQUFDO0lBRXBDO1FBQ0MsQ0FBQyxDQUFDLGlCQUFpQixDQUFDLENBQUMsSUFBSSxDQUFDLFVBQUMsQ0FBUSxFQUFFLEtBQWlCLElBQVUsT0FBQSxTQUFTLENBQUMsS0FBSyxDQUFDLEVBQWhCLENBQWdCLENBQUMsQ0FBQztJQUNuRixDQUFDO0lBRmUsOEJBQW9CLHVCQUVuQyxDQUFBO0lBRUUsaUJBQXdCLEtBQTRCO1FBQ2hELGFBQWEsR0FBRyxJQUFJLENBQUM7UUFDckIsS0FBSyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLHFCQUFxQixDQUFDLENBQUM7SUFDaEQsQ0FBQztJQUhlLGlCQUFPLFVBR3RCLENBQUE7SUFFRCxrQkFBeUIsS0FBNEI7UUFDakQsRUFBRSxDQUFDLENBQUMsYUFBYSxLQUFLLElBQUksQ0FBQyxDQUFDLENBQUM7WUFDekIsQ0FBQyxDQUFDLFdBQVcsRUFBRSxJQUFJLENBQUMsQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLGFBQWEsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUMxRSxDQUFDO0lBQ0wsQ0FBQztJQUplLGtCQUFRLFdBSXZCLENBQUE7SUFFRCxtQkFBMEIsS0FBNEI7UUFDbEQsSUFBSSxLQUFLLEdBQVUsQ0FBQyxDQUFDLElBQUksQ0FBQyxFQUFFLFFBQWdCLEVBQUUsS0FBWSxDQUFDO1FBQzNELHNEQUFzRDtRQUN0RCxFQUFFLENBQUMsQ0FBQyxLQUFLLENBQUMsS0FBSyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDcEIsTUFBTSxDQUFDLElBQUksQ0FBQztRQUNoQixDQUFDO1FBQ0QscUZBQXFGO1FBQ3JGLEVBQUUsQ0FBQyxDQUFDLGFBQWEsS0FBSyxJQUFJLENBQUMsQ0FBQyxDQUFDO1lBQ3pCLG1FQUFtRTtZQUNuRSxRQUFRLEdBQUcsS0FBSyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLENBQUM7WUFDakQscUVBQXFFO1lBQ3JFLFFBQVEsQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLFVBQUMsQ0FBUSxFQUFFLEtBQWE7Z0JBQzdDLE1BQU0sQ0FBQyxDQUFDLGFBQWEsR0FBRyxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQ3BDLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUN6QixDQUFDO1FBQ0QsNkRBQTZEO1FBQzdELEtBQUssR0FBRyxLQUFLLENBQUMsT0FBTyxDQUFDLFlBQVksQ0FBQyxDQUFDLEVBQUUsQ0FBQyxxQkFBcUIsRUFBRSxJQUFJLEVBQUUsUUFBUSxDQUFDLENBQUM7UUFDOUUseURBQXlEO1FBQ3pELENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxHQUFHLENBQUMsbUJBQW1CLEVBQUUsRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLEVBQUUsT0FBTyxDQUFDLENBQUM7UUFDbEUsTUFBTSxDQUFDLEtBQUssQ0FBQztJQUNqQixDQUFDO0lBcEJlLG1CQUFTLFlBb0J4QixDQUFBO0lBRUQsbUJBQTBCLEtBQTJCO1FBQ2pELENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxNQUFNLENBQUMsWUFBWSxDQUFDO2FBRXhCLEVBQUUsQ0FBQyxxQkFBcUIsRUFBRSxjQUFjLEVBQUUsU0FBUyxDQUFDO2FBRXBELEVBQUUsQ0FBQyxxQkFBcUIsRUFBRSxVQUFVLEVBQUUsU0FBUyxDQUFDO2FBRWhELEVBQUUsQ0FBQyxpQkFBaUIsRUFBRSxjQUFjLEVBQUUsY0FBYyxPQUFBLEtBQUssRUFBTCxDQUFLLENBQUMsQ0FBQztJQUNwRSxDQUFDO0lBUmUsbUJBQVMsWUFReEIsQ0FBQTtBQUNMLENBQUMsRUFuRE0sU0FBUyxLQUFULFNBQVMsUUFtRGYiLCJzb3VyY2VzQ29udGVudCI6WyIvLyBGaWxlIGxhc3QgbW9kaWZpZWQgb246IFdlZCBEZWMgMjEgMjAxNiAxNDo1MzozNSAgXG4vLy8gPHJlZmVyZW5jZSBwYXRoPVwidHlwZXNjcmlwdC1kZWNsYXJhdGlvbnMuZC50c1wiIC8+XG5cbi8vIENvZGUgZm9yIHN1cHBvcnRpbmcgZHJhZy1zZWxlY3RcblxubW9kdWxlIERyYWdib3hlcyB7XG4gICAgJ3VzZSBzdHJpY3QnO1xuXG4gICAgdmFyIGdsb2JhbENoZWNrZWQ6Ym9vbGVhbiA9IG51bGw7XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIGZpbmRBbmRJbml0QWxsVGFibGVzKCk6dm9pZCB7XG5cdFx0JCgndGFibGUuZHJhZ2JveGVzJykuZWFjaCgoaTpudW1iZXIsIHRhYmxlOkhUTUxFbGVtZW50KTp2b2lkID0+IGluaXRUYWJsZSh0YWJsZSkpO1xuXHR9XG5cbiAgICBleHBvcnQgZnVuY3Rpb24gZHJhZ0VuZChldmVudDpKUXVlcnlNb3VzZUV2ZW50T2JqZWN0KTp2b2lkIHtcbiAgICAgICAgZ2xvYmFsQ2hlY2tlZCA9IG51bGw7XG4gICAgICAgIGV2ZW50LmRhdGEudGFibGUub2ZmKCdtb3VzZW92ZXIuZHJhZ2JveGVzJyk7XG4gICAgfVxuXG4gICAgZXhwb3J0IGZ1bmN0aW9uIGRyYWdPdmVyKGV2ZW50OkpRdWVyeU1vdXNlRXZlbnRPYmplY3QpOnZvaWQge1xuICAgICAgICBpZiAoZ2xvYmFsQ2hlY2tlZCAhPT0gbnVsbCkge1xuICAgICAgICAgICAgJCgnOmNoZWNrYm94JywgdGhpcykucHJvcCgnY2hlY2tlZCcsIGdsb2JhbENoZWNrZWQpLnRyaWdnZXIoJ2NoYW5nZScpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZXhwb3J0IGZ1bmN0aW9uIGRyYWdTdGFydChldmVudDpKUXVlcnlNb3VzZUV2ZW50T2JqZWN0KTpib29sZWFuIHtcbiAgICAgICAgdmFyICR0aGlzOkpRdWVyeSA9ICQodGhpcyksIGNoZWNrYm94OiBKUXVlcnksIHRhYmxlOkpRdWVyeTtcbiAgICAgICAgLy8gaWdub3JlIG1vdXNlIGV2ZW50cyBub3QgdXNpbmcgdGhlIGxlZnQgbW91c2UgYnV0dG9uXG4gICAgICAgIGlmIChldmVudC53aGljaCAhPT0gMSkge1xuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cbiAgICAgICAgLy8gbW91c2Vkb3duIHRvZ2dsZXMgdGhlIGNsaWNrZWQgY2hlY2tib3ggdmFsdWUgYW5kIHN0b3JlcyBuZXcgdmFsdWUgaW4gZ2xvYmFsQ2hlY2tlZFxuICAgICAgICBpZiAoZ2xvYmFsQ2hlY2tlZCA9PT0gbnVsbCkge1xuICAgICAgICAgICAgLy8gbWF5IGhhdmUgY2xpY2tlZCBsYWJlbCwgc28gZ28gdG8gcGFyZW50IFREIGFuZCBmaW5kIHRoZSBjaGVja2JveFxuICAgICAgICAgICAgY2hlY2tib3ggPSAkdGhpcy5jbG9zZXN0KCd0ZCcpLmZpbmQoJzpjaGVja2JveCcpO1xuICAgICAgICAgICAgLy8gaGF2ZSB0byBjaGVjayBmb3IgbnVsbCB0byBwcmV2ZW50IGRvdWJsZSBldmVudCBmcm9tIGNsaWNraW5nIGxhYmVsXG4gICAgICAgICAgICBjaGVja2JveC5wcm9wKCdjaGVja2VkJywgKGk6bnVtYmVyLCB2YWx1ZTpib29sZWFuKTpib29sZWFuID0+IHtcbiAgICAgICAgICAgICAgICByZXR1cm4gKGdsb2JhbENoZWNrZWQgPSAhdmFsdWUpO1xuICAgICAgICAgICAgfSkudHJpZ2dlcignY2hhbmdlJyk7XG4gICAgICAgIH1cbiAgICAgICAgLy8gYWxzbyBhdHRhY2hlcyBtb3VzZW92ZXIgZXZlbnQgdG8gYWxsIGNlbGxzIGluIHBhcmVudCB0YWJsZVxuICAgICAgICB0YWJsZSA9ICR0aGlzLmNsb3Nlc3QoJy5kcmFnYm94ZXMnKS5vbignbW91c2VvdmVyLmRyYWdib3hlcycsICd0ZCcsIGRyYWdPdmVyKTtcbiAgICAgICAgLy8gd2FpdCBmb3IgbW91c2UgdG8gZ28gdXAgYW55d2hlcmUsIHRoZW4gZW5kIGRyYWcgZXZlbnRzXG4gICAgICAgICQoZG9jdW1lbnQpLm9uZSgnbW91c2V1cC5kcmFnYm94ZXMnLCB7ICd0YWJsZSc6IHRhYmxlIH0sIGRyYWdFbmQpO1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgZXhwb3J0IGZ1bmN0aW9uIGluaXRUYWJsZSh0YWJsZTogSlF1ZXJ5IHwgSFRNTEVsZW1lbnQpOnZvaWQge1xuICAgICAgICAkKHRhYmxlKS5maWx0ZXIoJy5kcmFnYm94ZXMnKVxuICAgICAgICAgICAgLy8gd2F0Y2ggZm9yIG1vdXNlZG93biBvbiBjaGVja2JveGVzXG4gICAgICAgICAgICAub24oJ21vdXNlZG93bi5kcmFnYm94ZXMnLCAndGQgOmNoZWNrYm94JywgZHJhZ1N0YXJ0KVxuICAgICAgICAgICAgLy8gYWxzbyB3YXRjaCBmb3IgbW91c2Vkb3duIG9uIGxhYmVsc1xuICAgICAgICAgICAgLm9uKCdtb3VzZWRvd24uZHJhZ2JveGVzJywgJ3RkIGxhYmVsJywgZHJhZ1N0YXJ0KVxuICAgICAgICAgICAgLy8gZGlzYWJsZSBjbGljayBiZWNhdXNlIG1vdXNlZG93biBpcyBoYW5kbGluZyBpdCBub3dcbiAgICAgICAgICAgIC5vbignY2xpY2suZHJhZ2JveGVzJywgJ3RkIDpjaGVja2JveCcsICgpOmJvb2xlYW4gPT4gZmFsc2UpO1xuICAgIH1cbn1cbiJdfQ==