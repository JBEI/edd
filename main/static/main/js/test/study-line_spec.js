/**
 * Created by Tlopez on 2/3/17.
 */

/**
 * unit tests for Study-Lines.js
 */

describe('Test DataGridSpecLines', function() {
    
    var dataGrid, disabledLinesWidget, dataGridOptionsWidget;

     beforeEach(function() {
       dataGrid = new DataGridSpecLines();
       disabledLinesWidget = new DGDisabledLinesWidget();
       dataGridOptionsWidget =  new DataGridOptionWidget();
       jasmine.getJSONFixtures().fixturesPath='base/main/static/main/js/test/';
       EDDData = getJSONFixture('EDDData.json');
       $.ajax = function (param) {
           //call success handler
           param.success(EDDData);
       }
      });

    describe('method: DataGridSpecLines.generateStrainNameCells', function() {
        it('should return a data grid data cell with the strain name', function() {
            expect(dataGrid.getTableElement()).toBeDefined();
         })
    });

    describe("StudyLines", function() {
        it("calls the prepare it function", function () {
            spyOn(StudyLines, "prepareIt");
            StudyLines.prepareIt();
            expect(StudyLines.prepareIt).toHaveBeenCalled();
        });
    });

    describe("fetch EDDData", function () {
        it("should make an AJAX request to the correct URL", function () {
            spyOn($, "ajax");
            var callback = jasmine.createSpy();
            StudyDataPage.fetchEDDData(callback);
            expect($.ajax.calls.mostRecent().args[0]["url"]).toEqual("edddata/");
        });
    });
    it("should execute the callback function on success", function () {
        spyOn($, "ajax").and.callFake(function(options) {
            options.success();
        });
        var callback = jasmine.createSpy();
        StudyDataPage.fetchEDDData(callback);
        expect(callback).toHaveBeenCalled();
    });
    describe("Line results method: applyFilterToIDs", function() {
        it("calls the function", function () {
            spyOn(disabledLinesWidget, "applyFilterToIDs");
            disabledLinesWidget.applyFilterToIDs();
            expect(disabledLinesWidget.applyFilterToIDs).toHaveBeenCalled();
        });
        it("returns active rowIDs", function () {
            disabledLinesWidget.checkBoxElement = false;
            expect(disabledLinesWidget.applyFilterToIDs(["755", "339", "5372", "340", "341"])).toEqual(
                ["755", "5372", "340", "341"]
            );
        });
    });
});
