/// <reference path="typescript-declarations.d.ts" />

// Code for supporting drag-select

module Dragboxes {

	function xPreventDefault(e) {
	  if (e && e.preventDefault) e.preventDefault();
	  else if (window.event) window.event.returnValue = false;
	}


	var gCheckedValue = null;


	//function docOnSelectStart(ev)
	//{
	//  return false; // cancel text selection
	//}


	function docOnMouseUp() {
	  document.removeEventListener('mouseup', docOnMouseUp, false);
	//  document.onselectstart = null;
	  gCheckedValue = null;
	}


	function tdOnMouseDown(ev) {
	  if (this.checkBoxObj) {
		gCheckedValue = this.checkBoxObj.checked = !this.checkBoxObj.checked;
		document.addEventListener('mouseup', docOnMouseUp, false);
	//    document.onselectstart = docOnSelectStart; // for IE
		if (this.noTextSelect) {
			xPreventDefault(ev); // cancel text selection
		}
	  }
	}


	function tdOnMouseOver(ev) {
	  if (gCheckedValue != null && this.checkBoxObj) {
		this.checkBoxObj.checked = gCheckedValue;
	  }
	}


	function tdOnClick() {
	  // Cancel a click on the checkbox itself. Let it bubble up to the TD
	  return false;
	}


	function cbOnClick(ev) {
	  // Cancel a click on the checkbox itself. Let it bubble up to the TD
	  this.checked = !this.checked
	}


	export function findAndInitAllTables() {
		var ts = document.getElementsByTagName('table');
		for (var i=0;i < ts.length;i++) {
			initTable(ts[i]);
		}
	}


	export function initTable(ts) {

		if (!$(ts).hasClass('dragboxes')) {
			return;
		}

		var allowTextSelect = ts.getAttribute("allowTextSelect");			
		for (var r = 0; r < ts.rows.length; ++r) {
			var leftHandCellCheckbox = null;
			for (var c = 0; c < (<any>ts.rows[r]).cells.length; ++c) {

				var td = (<any>ts.rows[r]).cells[c];
				if (td.tagName.toLowerCase() == 'td') {
				
					var cb = td.getElementsByTagName('input');
					if (cb[0]) {
						if (cb[0].type.toLowerCase() == 'checkbox') {
							td.addEventListener('mousedown', tdOnMouseDown, false);
							td.addEventListener('mouseover', tdOnMouseOver, false);
							td.addEventListener('click', tdOnClick, false);
							cb[0].addEventListener('click', cbOnClick, false);
							td.checkBoxObj = cb[0];
							if (allowTextSelect) {
								initCell(td, cb[0], 0);
							} else {
								initCell(td, cb[0], 1);
							}
							leftHandCellCheckbox = cb[0];
//						} else {	// If the cell does not contain any input elements of its own
//							// If the previous cell (moving left to right) was assigned the callbacks
//							if (leftHandCellCheckbox != null) {
//								// ... Then assign callbacks to this cell too, and give it a reference to the
//								// checkbox in the previous cell so it can be toggled.
//								if (allowTextSelect) {
//									initCell(td, null, 0);
//								} else {
//									initCell(td, null, 1);
//								}
//								td.checkBoxObj = leftHandCellCheckbox;
//								leftHandCellCheckbox = null;
//							}
						}
					}
				}
			}
		}
	}


	export function initCell(td, cb, noTextSelect) {
		td.addEventListener('mousedown', tdOnMouseDown, false);
		td.addEventListener('mouseover', tdOnMouseOver, false);
		td.addEventListener('click', tdOnClick, false);
		if (cb) {
			cb.addEventListener('click', cbOnClick, false);
			td.checkBoxObj = cb;
		}
		if (noTextSelect) {
			td.noTextSelect = 1;
		} else {
			td.noTextSelect = 0;
		}
	}
}


window.addEventListener('load', function() { Dragboxes.findAndInitAllTables(); }, false);
