// This is an interesting (read: Strange) javascript program that handles all the "edit"
// and "add new" links in the EED site that do not cause the page to refresh when clicked.
// Edit links;
// These call the edit routine, and pass it a big hash full of key/value elements.
// We rely on the fact that these edit links are always inside a table.
// When the link is clicked, we walk up the link's element to the enclosing table in the DOM,
// and then read attributes out of that element, which point the way to one or more elements
// elsewhere on the page that constitute the edit form, or elements to hide when the edit form is shown.
// We gather collections of all the form elements that exist beneath these elements, and
// then we look through the data hash, matching hash keys to form element identifiers, and
// setting the form element values based on the values in the hash.
// In addition, any form elements we find that are NOT mentioned in the hash are reset to
// innocuous values (blank, false, -1) so they do not pollute the form when we submit it.
// A "cancel" routine is also provided here, which reverses the hide/show actions.
// Basically, it makes the page look like it's doing a partial-update from an AJAX call-response,
// but the server is never queried.  Plus we can usually use the same form for both "add" and "edit".
// Inline add forms:
// "Add New" buttons are tacked onto the bottom of the drop-down autocomplete panels.
// When pressed, the autocomplete panel is hidden and replaced with a programmatically-generated
// form for adding a new entry to the autocomplete list.
// The buttons in the form are usually "Add"/"Done" and "Cancel".
// "Add" triggers an AJAX/JSON exchanges with the EDD server, which returns a copy of the newly
// added record, as well as a complete sorted copy of the data structure the record is part of,
// or returns an error message to display if there was a problem with the operation.
// On success, the "Add" button is replaced with the "Done" button.
// "Done" and "Cancel" both hide the form and reveal the autocomplete menu.
var EDDEdit;
EDDEdit = {
    // This is a common entry point to EDDEdit.
    // We take the given DOM element and spider upward for the attributes that tell us
    // how to show and hide the relevant edit form, then we prepare that form with the given data.
    edit: function (obj, fData) {
        var toshow = EDDEdit.seekAttribute(obj, 'editformshow');
        // If there's no form to show, give up.
        if (toshow == null) {
            return;
        }
        var tohide = EDDEdit.seekAttribute(obj, 'editformhide');
        EDDEdit.prepareForm(fData, toshow, tohide);
    },
    // This is a common entry point to EDDEdit, similar to "edit" above, but for bulk edit forms.
    // We take the given DOM element and spider upward for the attributes that tell us
    // how to show and hide the relevant bulk edit form, then we prepare that form with the given data.
    bulkEdit: function (obj, fData) {
        var toshow = EDDEdit.seekAttribute(obj, 'bulkeditformshow');
        if (toshow == null) {
            return;
        }
        var tohide = EDDEdit.seekAttribute(obj, 'bulkeditformhide');
        EDDEdit.prepareForm(fData, toshow, tohide);
    },
    // To prepare the form, we show the elements described in "toshow",
    // then attempt to process every form element contained in those elements using the given form data.
    // If we successfully showed anything in "toshow", we hide the elements in "tohide".
    prepareForm: function (fData, toshow, tohide) {
        if (toshow == null) {
            return;
        }
        // If we found the element(s) in question, remove the 'off' class, revealing them.
        EDDEdit.showthese(toshow);
        var showList = toshow.split(',');
        var foundAnyElements = 0;
        for (var objIndex = 0; objIndex < showList.length; objIndex++) {
            var objName = showList[objIndex];
            objName = objName.replace(/^\s\s*/, '').replace(/\s\s*$/, '');
            var oneObj = document.getElementById(objName);
            if (oneObj) {
                foundAnyElements = 1;
                EDDEdit.processAllFormElements(oneObj, fData);
            }
        }
        if (foundAnyElements) {
            // Since we know we have a valid element to show, it's safe to look for an
            // equivalent element to hide.
            if (tohide != null) {
                EDDEdit.hidethese(tohide);
            }
        }
    },
    // To "cancel" the operation, we need only hide the element(s) we've shown,
    // and reveal the element(s) we hid earlier (if any).
    cancel: function (show, hide) {
        if (show) {
            var showList = show.split(',');
            for (var objIndex = 0; objIndex < showList.length; objIndex++) {
                var objName = showList[objIndex];
                objName = objName.replace(/^\s\s*/, '').replace(/\s\s*$/, '');
                var oneObj = document.getElementById(objName);
                if (oneObj) {
                    // Clear out the form elements, just to tidy up
                    var elements = oneObj.getElementsByTagName('input');
                    EDDEdit.resetFormElements(elements);
                    elements = oneObj.getElementsByTagName('select');
                    EDDEdit.resetFormElements(elements);
                    elements = oneObj.getElementsByTagName('textarea');
                    EDDEdit.resetFormElements(elements);
                }
            }
        }
        EDDEdit.hidethese(show);
        EDDEdit.showthese(hide);
    },
    // Walk up the element tree, looking for an element with the given attribute defined,
    // and return the value of the attribute if we find it.
    seekAttribute: function (obj, attname) {
        var tn = (obj.nodeType == 1) ? obj.tagName.toLowerCase() : 'x';
        var att = obj.hasAttribute(attname);
        while (!att && tn != "body") {
            obj = obj.parentNode || obj.parentElement;
            tn = obj.tagName.toLowerCase();
            att = obj.hasAttribute(attname);
        }
        // If we walked up to the body of the document and found no attribute,
        // something's wrong with our document construction, so give up.
        if (!att) {
            return null;
        }
        return obj.getAttribute(attname);
    },
    // Gather all the form elements of varying types that are children of the given element,
    // and send them all through our routine that checks to see if we have a value to place in them,
    // and places the value if so.
    // In addition, we will run a basic "reset" procedure, where we uncheck all checkboxes that
    // aren't mentioned in our form data and reset all text fields.
    processAllFormElements: function (oneObj, fData) {
        var elements = oneObj.getElementsByTagName('input');
        EDDEdit.resetFormElements(elements, fData);
        EDDEdit.checkFormElements(elements, fData);
        elements = oneObj.getElementsByTagName('select');
        EDDEdit.resetFormElements(elements, fData);
        EDDEdit.checkFormElements(elements, fData);
        elements = oneObj.getElementsByTagName('textarea');
        EDDEdit.resetFormElements(elements, fData);
        EDDEdit.checkFormElements(elements, fData);
    },
    // Uncheck or clear all elements that are NOT mentioned
    // in the given fData hash (object).
    resetFormElements: function (elements, fData) {
        var z = elements.length;
        for (var y = 0; y < z; y++) {
            var element = elements[y];
            var oneName = element.name;
            // Only manipulate a form element whose name is NOT mentioned in our data
            if (typeof fData != 'undefined') {
                if (typeof fData[oneName] != 'undefined') {
                    continue;
                }
            }
            if (element.type == 'select-one') {
                element.selectedIndex = -1;
            }
            else if (element.type == 'checkbox') {
                element.checked = false;
            }
            else if (element.type == 'radio') {
                element.checked = false;
            }
            else if (element.type == 'text') {
                element.value = '';
            }
        }
    },
    checkFormElements: function (elements, fData) {
        var z = elements.length;
        var autofillElements = [];
        for (var y = 0; y < z; y++) {
            var element = elements[y];
            var oneName = element.name;
            // Only manipulate a form element whose name is mentioned in our data
            if (typeof fData[oneName] == 'undefined') {
                // If the input is not mentioned in our supplied form data,
                // and contains a class name that identifies it as an autocomplete element,
                // then we save it to a list of elements for later processing.
                // The idea here is, we run through the form and set all the elements
                // we can (which are set by name), and then afterwards we run through
                // the autocomplete elements and set them by drawing values out of the form (by ID),
                // potentially including values we just set. 
                if ($(element).hasClass('autocomplete')) {
                    autofillElements.push(element);
                }
                continue;
            }
            // If the source value is an array, chain its contents together with linebreaks and use the result
            var oneVal = fData[oneName];
            if ((typeof fData[oneName] == "object") && (fData[oneName].constructor == Array)) {
                oneVal = '';
                for (var i = 0; i < fData[oneName].length; i++) {
                    oneVal = oneVal + fData[oneName][i] + "\n";
                }
            }
            if (element.type == 'select-one') {
                var newIndex = -1;
                for (var i = 0; i < element.length; i++) {
                    if (element[i].value == oneVal) {
                        newIndex = i;
                    }
                }
                element.selectedIndex = newIndex;
            }
            else if (element.type == 'checkbox') {
                if (oneVal == '1' || oneVal == 'true') {
                    element.checked = true;
                }
                else {
                    element.checked = false;
                }
            }
            else if (element.type == 'radio') {
                // If it's a radio button, we need to go through the whole set.
                // Luckily, the enclosing function sends all the radio buttons through this one eventually.
                if (element.value == oneVal) {
                    element.checked = true;
                }
                else {
                    element.checked = false;
                }
            }
            else {
                element.value = oneVal;
            }
        }
        var z = autofillElements.length;
        for (var y = 0; y < z; y++) {
            var element = autofillElements[y];
            // If the autocomplete object exists
            if (element.autocompleter) {
                element.autocompleter.setFromHiddenElement();
            }
        }
    },
    showthese: function (showTheseString) {
        if (showTheseString) {
            var showList = showTheseString.split(',');
            for (var objIndex = 0; objIndex < showList.length; objIndex++) {
                var objName = showList[objIndex];
                objName = objName.replace(/^\s\s*/, '').replace(/\s\s*$/, '');
                var oneObj = document.getElementById(objName);
                if (oneObj) {
                    oneObj.style.visibility = 'visible';
                    $(oneObj).removeClass('off');
                }
            }
        }
    },
    hidethese: function (hideTheseString) {
        if (hideTheseString) {
            var hideList = hideTheseString.split(',');
            for (var objIndex = 0; objIndex < hideList.length; objIndex++) {
                var objName = hideList[objIndex];
                objName = objName.replace(/^\s\s*/, '').replace(/\s\s*$/, '');
                var oneObj = document.getElementById(objName);
                if (oneObj) {
                    $(oneObj).addClass('off');
                    oneObj.style.visibility = 'hidden';
                }
            }
        }
    }
};
//# sourceMappingURL=EDDEditing.js.map