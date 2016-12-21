// File last modified on: Wed Dec 21 2016 14:53:35  
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiU3R1ZHktQ3JlYXRlLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiU3R1ZHktQ3JlYXRlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLG9EQUFvRDtBQUNwRCxxREFBcUQ7QUFDckQsK0JBQStCOzs7Ozs7QUFHL0IsSUFBTyxXQUFXLENBc0JqQjtBQXRCRCxXQUFPLFdBQVcsRUFBQyxDQUFDO0lBQ2hCLFlBQVksQ0FBQztJQUViLDhCQUE4QjtJQUM5QjtRQUNJLElBQUksaUJBQWlCLENBQUMsQ0FBQyxDQUFDLHNCQUFzQixDQUFDLENBQUMsR0FBRyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUM5RCxDQUFDO0lBRmUscUJBQVMsWUFFeEIsQ0FBQTtJQUdELDBFQUEwRTtJQUMxRTtRQUF1QyxxQ0FBMkI7UUFBbEU7WUFBdUMsOEJBQTJCO1FBV2xFLENBQUM7UUFWRyxxQ0FBUyxHQUFULFVBQVUsS0FBSztZQUNYLE1BQU0sQ0FBQyxJQUFJLENBQUMsY0FBYyxFQUFFLElBQUksRUFBRSxDQUFDO1FBQ3ZDLENBQUM7UUFDRCxzQ0FBVSxHQUFWO1lBQ0ksTUFBTSxDQUFDLCtCQUErQixDQUFDO1FBQzNDLENBQUM7UUFDRCxrQ0FBTSxHQUFOO1lBQ0ksNERBQTREO1lBQ3RELFFBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFFLENBQUMsTUFBTSxFQUFFLENBQUM7UUFDdEMsQ0FBQztRQUNMLHdCQUFDO0lBQUQsQ0FBQyxBQVhELENBQXVDLFdBQVcsQ0FBQyxlQUFlLEdBV2pFO0lBWFksNkJBQWlCLG9CQVc3QixDQUFBO0FBQ0wsQ0FBQyxFQXRCTSxXQUFXLEtBQVgsV0FBVyxRQXNCakI7QUFBQSxDQUFDO0FBR0YsdUVBQXVFO0FBQ3ZFLENBQUMsQ0FBQyxjQUFNLE9BQUEsV0FBVyxDQUFDLFNBQVMsRUFBRSxFQUF2QixDQUF1QixDQUFDLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIvLyBGaWxlIGxhc3QgbW9kaWZpZWQgb246IFdlZCBEZWMgMjEgMjAxNiAxNDo1MzozNSAgXG4vLy8gPHJlZmVyZW5jZSBwYXRoPVwidHlwZXNjcmlwdC1kZWNsYXJhdGlvbnMuZC50c1wiIC8+XG4vLy8gPHJlZmVyZW5jZSBwYXRoPVwiVXRsLnRzXCIgLz5cblxuXG5tb2R1bGUgQ3JlYXRlU3R1ZHkge1xuICAgICd1c2Ugc3RyaWN0JztcblxuICAgIC8vIENhbGxlZCB3aGVuIHRoZSBwYWdlIGxvYWRzLlxuICAgIGV4cG9ydCBmdW5jdGlvbiBwcmVwYXJlSXQoKSB7XG4gICAgICAgIG5ldyBFZGl0YWJsZVN0dWR5TmFtZSgkKCcjZWRpdGFibGUtc3R1ZHktbmFtZScpLmdldCgpWzBdKTtcbiAgICB9XG5cblxuICAgIC8vIEJhc2UgY2xhc3MgZm9yIHRoZSBub24tYXV0b2NvbXBsZXRlIGlubGluZSBlZGl0aW5nIGZpZWxkcyBmb3IgdGhlIFN0dWR5XG4gICAgZXhwb3J0IGNsYXNzIEVkaXRhYmxlU3R1ZHlOYW1lIGV4dGVuZHMgRURERWRpdGFibGUuRWRpdGFibGVFbGVtZW50IHtcbiAgICAgICAgY2FuQ29tbWl0KHZhbHVlKTogYm9vbGVhbiB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5nZXRFZGl0ZWRWYWx1ZSgpICE9ICcnO1xuICAgICAgICB9XG4gICAgICAgIGJsYW5rTGFiZWwoKTogc3RyaW5nIHtcbiAgICAgICAgICAgIHJldHVybiAnKEVudGVyIGEgbmFtZSBmb3IgeW91ciBTdHVkeSknO1xuICAgICAgICB9XG4gICAgICAgIGNvbW1pdCgpIHtcbiAgICAgICAgICAgIC8vIFF1aWNrIGFuZCBkaXJ0eSB3YXkgdG8gc3VibWl0IHRoZSB3aG9sZSAnTmV3IFN0dWR5JyBmb3JtLlxuICAgICAgICAgICAgKDxhbnk+ZG9jdW1lbnQuZm9ybXNbMF0pLnN1Ym1pdCgpO1xuICAgICAgICB9XG4gICAgfVxufTtcblxuXG4vLyB1c2UgSlF1ZXJ5IHJlYWR5IGV2ZW50IHNob3J0Y3V0IHRvIGNhbGwgcHJlcGFyZUl0IHdoZW4gcGFnZSBpcyByZWFkeVxuJCgoKSA9PiBDcmVhdGVTdHVkeS5wcmVwYXJlSXQoKSk7XG4iXX0=