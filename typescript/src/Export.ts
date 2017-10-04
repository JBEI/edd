import * as jQuery from "jquery"
import "bootstrap-loader"
import Handsontable from "handsontable"
//import "handsontable.css"

declare function require(name: string): any;  // avoiding warnings for require calls below

require('handsontable.css')


module ExportPage {

  function rsplit(row: string): string[] {
    var sections: string[],
        cells: string[] = [''],
        last = 0,
        i = 0,
        scratch: string[],
        sep: string = $('#id_separator').val();
    // split first on quotes
    sections = row.split('"');
    // make a pass to merge back cells containing doubled-quotes
    for (i = 0; i < sections.length; ++i) {
      // quoted sections concatenate to last cell
      if (i % 2) {
        cells[last] = cells[last] + sections[i];
      }
      // empty string sections merge following section to last cell with a quote added
      else if (sections[i] === '') {
        if (i < sections.length - 1) {
          cells[last] = cells[last] + '"' + sections[++i];
        }
      }
      // all others, split on sep and trim whitespace
      else {
        scratch = sections[i].split(sep);
        // concatenate first value to last cell
        cells[last] = cells[last] + scratch[0].trim();
        // append all other values
        last = Array.prototype.push.apply(
          cells,
          $.map(scratch.slice(1), (c) => c.trim())
        ) - 1;
      }
    }
    return cells;
  }

  export function setUp(): void {
    var dataArea: JQuery,
        tableData: string[],
        tables: JQuery;
    dataArea = $('#textData').hide();
    tableData = dataArea.val().split('\n\n');
    tables = $(tableData.map((table: string): HTMLElement => {
      var container: JQuery = $('<div>').addClass('hot-div').appendTo(dataArea.parent());
      new Handsontable(container[0], { 'data': table.split('\n').map(rsplit) });
      return container[0];
    }));
    $('<button>').text('Toggle View')
      .appendTo(dataArea.closest('.pageSection').find('.sectionHead'))
      .on('click', () => {
        dataArea.toggle();
        tables.toggle();
      });
    // add select/deselect controls
    $('.exportOptions > ul[id$=_meta]').each(function (i, ul) {
      var $ul = $(ul), css = { 'float': 'right', 'padding-left': '1em' };
      $('<a href="#">').text('Deselect All').css(css).on('click', () => {
        $ul.find(':checkbox').prop('checked', false);
        return false;
      }).appendTo($ul.prev('p'));
      $('<a href="#">').text('Select All').css(css).on('click', () => {
        $ul.find(':checkbox').prop('checked', true);
        return false;
      }).appendTo($ul.prev('p'));
    });
    // click handler for disclose sections
    $(document).on('click', '.disclose .discloseLink', (e) => {
      $(e.target).closest('.disclose').toggleClass('discloseHide');
      return false;
    });
  }

}

jQuery(ExportPage.setUp);
