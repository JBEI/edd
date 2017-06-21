import { EDDEditable } from "./EDDEditableElement"

export module CreateStudy {
    'use strict';

    // Called when the page loads.
    export function prepareIt() {
        new EditableStudyName($('#editable-study-name').get()[0]);
    }


    // Base class for the non-autocomplete inline editing fields for the Study
    export class EditableStudyName extends EDDEditable.EditableElement {
        canCommit(value): boolean {
            return this.getEditedValue() != '';
        }
        blankLabel(): string {
            return '(Enter a name for your Study)';
        }
        commit() {
            // Quick and dirty way to submit the whole 'New Study' form.
            (<any>document.forms[0]).submit();
        }
    }
};


// use JQuery ready event shortcut to call prepareIt when page is ready
$(() => CreateStudy.prepareIt());
