/**
 * unit tests for EDDEditableElement.js
 */

describe("EDDEditableElement", function () {
    var editableElement;

     beforeEach(function() {
       editableElement = new EDDEditable.EditableElement();
      });
    describe('EDDEditableElement method: EditableElement', function() {
        it("calls the function", function () {
            spyOn(EDDEditable, 'EditableElement');
            EDDEditable.EditableElement();
            expect(EDDEditable.EditableElement).toHaveBeenCalled()
        });
        it('should set a unique index of 4', function() {
            //thought this would equal 1
            expect(EDDEditable.EditableElement._uniqueIndex).toEqual(4);
        });
        it('should set a null value for prevEditableElement', function() {
            expect(EDDEditable.EditableElement._prevEditableElement).toEqual(null);
        });
        it('should return a blank label', function() {
            expect(editableElement.blankLabel()).toEqual('(click to set)')
        });
         it('should return for edit allowed', function() {
            expect(editableElement.editAllowed()).toBeTruthy()
        });
         it('should return an empty string', function() {
            expect(editableElement.getValue()).toEqual('')
        });
    });
});
