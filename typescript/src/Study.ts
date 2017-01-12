/// <reference path="typescript-declarations.d.ts" />
/// <reference path="Utl.ts" />


// Code that all Study sub-pages have in common

module StudyBase {
    'use strict';

    // Called when the page loads.
    export function prepareIt() {
        new EditableStudyName($('#editable-study-name').get()[0]);
    }


    // Base class for the non-autocomplete inline editing fields for the Study
    export class EditableStudyElment extends EDDEditable.EditableElement {

        editAllowed(): boolean { return EDDData.currentStudyWritable; }
        canCommit(value): boolean { return EDDData.currentStudyWritable; }
    }


    export class EditableStudyName extends EditableStudyElment {
        canCommit(value): boolean {
            return EDDData.currentStudyWritable && (this.getEditedValue() != '');
        }

        getFormURL(): string {
            return '/study/' + EDDData.currentStudyID + '/rename/';
        }

        getValue():string {
            return EDDData.Studies[EDDData.currentStudyID].name;
        }

        setValue(value) {
            EDDData.Studies[EDDData.currentStudyID].name = value;
        }

        blankLabel(): string {
            return '(Enter a name for your Study)';
        }
    }
};


// use JQuery ready event shortcut to call prepareIt when page is ready
$(() => StudyBase.prepareIt());
