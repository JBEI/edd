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
        it('should return an array with active ids', function() {
            expect(StudyDataPage.progressiveFilteringWidget.buildAssayIDSet()).toEqual(
                [ '2050', '2051', '2053', '2054' ]
            );
        })
    });
    describe('method: StudyDataPage.progressiveFilteringWidget.checkRedrawRequired', function() {
        it('should return false if true is not passed in', function() {
            expect(StudyDataPage.progressiveFilteringWidget.checkRedrawRequired()).toBeFalsy()
        });
        it('should return true if true is passed as an optional parameter', function() {
            expect(StudyDataPage.progressiveFilteringWidget.checkRedrawRequired(true)).toBeTruthy()
        })
    });
});
