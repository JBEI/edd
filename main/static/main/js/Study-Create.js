/// <reference path="typescript-declarations.d.ts" />
/// <reference path="Utl.ts" />
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
var CreateStudy;
(function (CreateStudy) {
    'use strict';
    // Called when the page loads.
    function prepareIt() {
        new EditableStudyName($('#editable-study-name').get()[0]);
    }
    CreateStudy.prepareIt = prepareIt;
    // Base class for the non-autocomplete inline editing fields for the Study
    var EditableStudyName = (function (_super) {
        __extends(EditableStudyName, _super);
        function EditableStudyName() {
            _super.apply(this, arguments);
        }
        EditableStudyName.prototype.canCommit = function (value) {
            return this.getEditedValue() != '';
        };
        EditableStudyName.prototype.blankLabel = function () {
            return '(Enter a name for your Study)';
        };
        EditableStudyName.prototype.commit = function () {
            // Quick and dirty way to submit the whole 'New Study' form.
            document.forms[0].submit();
        };
        return EditableStudyName;
    }(EDDEditable.EditableElement));
    CreateStudy.EditableStudyName = EditableStudyName;
})(CreateStudy || (CreateStudy = {}));
;
// use JQuery ready event shortcut to call prepareIt when page is ready
$(function () { return CreateStudy.prepareIt(); });
