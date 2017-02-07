/**
 * Created by tlopez on 2/6/17.
 */

/**
 * unit tests for Study-Data.js
 */

describe('Test StudyDataPage', function() {

    // beforeEach(function() {
    //     // loadFixtures('test.html');
    //     jasmine.getFixtures().fixturesPath = 'main/static/main/js/test/';
    //     jasmine.getFixtures().load('test.html');
    // });


    describe('method: StudyDataPage.progressiveFilteringWidget.buildAssayIDSet', function() {
        it('should return a data grid data cell with the strain name', function() {
            spyOn(StudyDataPage.progressiveFilteringWidget, 'buildAssayIDSet');
            StudyDataPage.progressiveFilteringWidget.buildAssayIDSet();
            expect(StudyDataPage.progressiveFilteringWidget.buildAssayIDSet).toHaveBeenCalled();
         });
        it('should return an array', function() {
            var EDDData = {};
            expect(StudyDataPage.progressiveFilteringWidget.buildAssayIDSet()).toEqual(['test']);
        })
    });
    describe("StudyDataPage", function() {
        it("calls the prepare it function", function () {
            spyOn(StudyDataPage, "prepareIt");
            StudyDataPage.prepareIt();
            expect(StudyDataPage.prepareIt).toHaveBeenCalled();
        });
    })
});
