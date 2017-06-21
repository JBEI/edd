/// <reference path="../typings/jquery/jquery.mcautocomplete.d.ts" />

import * as $ from "jquery";
import "jquery-ui";
import { EDDEditable } from "./EDDEditableElement"
import { EDDAuto } from "./EDDAutocomplete"
import "./EDDAutocomplete.ts"
import "./MultiColumnAutocomplete.ts"
// Code that all Study sub-pages have in common


declare function require(name: string): any;  // avoiding warnings for require calls below

// as of JQuery UI 1.12, need to require each dependency individually
require('jquery-ui/themes/base/core.css');
require('jquery-ui/themes/base/menu.css');
require('jquery-ui/themes/base/button.css');
require('jquery-ui/themes/base/draggable.css');
require('jquery-ui/themes/base/resizable.css');
require('jquery-ui/themes/base/dialog.css');
require('jquery-ui/themes/base/theme.css');
require('jquery-ui/ui/widgets/button');
require('jquery-ui/ui/widgets/draggable');
require('jquery-ui/ui/widgets/resizable');
require('jquery-ui/ui/widgets/dialog');
require('jquery-ui/ui/widgets/tooltip');


export module StudyBase {
    'use strict';

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
        // put the click handler at the document level, then filter to any link inside a .disclose
        $(document).on('click', '.disclose .discloseLink', (e) => {
            $(e.target).closest('.disclose').toggleClass('discloseHide');
            return false;
        });
    }
};


// use JQuery ready event shortcut to call prepareIt when page is ready
$(() => StudyBase.prepareIt());
