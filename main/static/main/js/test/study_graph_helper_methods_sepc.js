/**
 * unit tests for StudyGraphingHelperMethods.js
 */

describe('Test StudyGraphingHelperMethods', function() {

    beforeEach(function () {
        jasmine.getFixtures().fixturesPath = 'base/main/static/main/js/test/';
        loadFixtures('test.html')
    });

    describe('method: getButtonElement', function() {
        it('should return an array of selectors', function() {
           expect(StudyHelper.getButtonElement( $('#maingraph')).length).toEqual(5)
        });
        it('should have a certain class', function() {
           expect(StudyHelper.getButtonElement( $('#maingraph')).first().hasClass('line')).toBeTruthy()
        });
    });

    describe('method: getSelectorElement', function() {
        it('should return an array of 7 buttons for maingraph', function() {
           expect(StudyHelper.getSelectorElement( $('#maingraph')).length).toEqual(7)
        });
    });
});
