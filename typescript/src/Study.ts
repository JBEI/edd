/// <reference path="typescript-declarations.d.ts" />
/// <reference path="EDDEditableElement.ts" />
/// <reference path="Utl.ts" />


// Code that all Study sub-pages have in common

module StudyBase {
    'use strict';


    // Base class for the non-autocomplete inline editing fields for the Study
    export class EditableStudyElement extends EDDEditable.EditableElement {
        constructor(inputElement: HTMLElement, style?: string) {
            super(inputElement, style);
        }

        editAllowed(): boolean { return EDDData.currentStudyWritable; }
        canCommit(value): boolean { return EDDData.currentStudyWritable; }
    }


    export class EditableStudyName extends EditableStudyElement {
        constructor(inputElement: HTMLElement) {
            super(inputElement);
            this.formURL('/study/' + EDDData.currentStudyID + '/rename/');
        }

        canCommit(value): boolean {
            return EDDData.currentStudyWritable && (this.getEditedValue() != '');
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

    // Called when the page loads.
    export function prepareIt() {
        new EditableStudyName($('#editable-study-name').get()[0]);
    }
};


// use JQuery ready event shortcut to call prepareIt when page is ready
$(() => StudyBase.prepareIt());
