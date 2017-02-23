/**
 * Created by tlopez on 2/6/17.
 */

/**
 * unit tests for Study-Data.js
 */

describe("prepare it", function () {
    var EDDData;
    beforeEach(function() {
       jasmine.getJSONFixtures().fixturesPath='base/main/static/main/js/test/';
       EDDData = getJSONFixture('EDDData.json');
       $.ajax = function (param) {
        //call success handler
        param.success(EDDData);
    };
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

    describe('method: StudyDataPage.progressiveFilteringWidget.buildAssayIDSet', function() {
        it('should return a data grid data cell with the strain name', function() {
            spyOn(StudyDataPage.progressiveFilteringWidget, 'buildAssayIDSet');
            EDDData = getJSONFixture('EDDData.json');
            StudyDataPage.progressiveFilteringWidget.buildAssayIDSet(EDDData);
            expect(StudyDataPage.progressiveFilteringWidget.buildAssayIDSet).toHaveBeenCalled();
         });
        it('should return an array', function() {
            expect(StudyDataPage.progressiveFilteringWidget.buildAssayIDSet(EDDData)).toEqual([ '2049', '2050', '2051', '2052', '2053', '2054' ]);
        })
    });
});
