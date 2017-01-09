/// <reference path="typescript-declarations.d.ts" />
/// <reference path="Utl.ts" />
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
// Code that all Study sub-pages have in common
var StudyBase;
(function (StudyBase) {
    'use strict';
    // Called when the page loads.
    function prepareIt() {
        new EditableStudyName($('#editable-study-name').get()[0]);
    }
    StudyBase.prepareIt = prepareIt;
    // Base class for the non-autocomplete inline editing fields for the Study
    var EditableStudyElment = (function (_super) {
        __extends(EditableStudyElment, _super);
        function EditableStudyElment() {
            _super.apply(this, arguments);
        }
        EditableStudyElment.prototype.editAllowed = function () { return EDDData.currentStudyWritable; };
        EditableStudyElment.prototype.canCommit = function (value) { return EDDData.currentStudyWritable; };
        return EditableStudyElment;
    }(EDDEditable.EditableElement));
    StudyBase.EditableStudyElment = EditableStudyElment;
    var EditableStudyName = (function (_super) {
        __extends(EditableStudyName, _super);
        function EditableStudyName() {
            _super.apply(this, arguments);
        }
        EditableStudyName.prototype.canCommit = function (value) {
            return EDDData.currentStudyWritable && (this.getEditedValue() != '');
        };
        EditableStudyName.prototype.getFormURL = function () {
            return '/study/' + EDDData.currentStudyID + '/rename/';
        };
        EditableStudyName.prototype.getValue = function () {
            return EDDData.Studies[EDDData.currentStudyID].name;
        };
        EditableStudyName.prototype.setValue = function (value) {
            EDDData.Studies[EDDData.currentStudyID].name = value;
        };
        EditableStudyName.prototype.blankLabel = function () {
            return '(Enter a name for your Study)';
        };
        return EditableStudyName;
    }(EditableStudyElment));
    StudyBase.EditableStudyName = EditableStudyName;
})(StudyBase || (StudyBase = {}));
;
// use JQuery ready event shortcut to call prepareIt when page is ready
$(function () { return StudyBase.prepareIt(); });
