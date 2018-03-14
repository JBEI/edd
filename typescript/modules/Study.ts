/// <reference path="../typings/jquery/jquery.mcautocomplete.d.ts" />

// Code that all Study sub-pages have in common

import * as $ from "jquery";
import { EDDEditable } from "./EDDEditableElement"
import { EDDAuto } from "./EDDAutocomplete"
import { Utl } from "../modules/Utl"


export module StudyBase {
    'use strict';

    let studyBaseUrl: URL = Utl.relativeURL('../');

    $( window ).on("load", function() { // Shortcutting this to .load confuses jQuery
        EDDAuto.BaseAuto.initPreexisting();
        // this makes the autocomplete work like a dropdown box
        // fires off a search as soon as the element gains focus
        $(document).on('focus', '.autocomp', function (ev) {
            $(ev.target).addClass('autocomp_search').mcautocomplete('search');
        });
    });

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
            this.formURL(Utl.relativeURL('rename/', studyBaseUrl).toString());
        }

        canCommit(value): boolean {
            return EDDData.currentStudyWritable && (this.getEditedValue() != '');
        }

        getValue():string {
            return $(this.inputElement).val();
        }

        blankLabel(): string {
            return '(Enter a name for your Study)';
        }
    }

    // Called when the page loads.
    export function prepareIt() {
        new EditableStudyName($('#editable-study-name').get()[0]);
        // put the click handler at the document level, then filter to any link inside a .disclose
        $(document).on('click', '.disclose .discloseLink', (e) => {
            $(e.target).closest('.disclose').toggleClass('discloseHide');
            return false;
        });
    }
};


// use JQuery ready event shortcut to call prepareIt when page is ready
$(() => StudyBase.prepareIt());
