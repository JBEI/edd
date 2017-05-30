 /* unit tests for Import.js
 */

describe("Import.js", function () {
     var selectMajorKindStep, importMessage;
    beforeEach(function() {
        jasmine.getFixtures().fixturesPath='base/main/static/main/js/test/';
        jasmine.getJSONFixtures().fixturesPath='base/main/static/main/js/test/';
        loadFixtures('SpecRunner.html');
        EDDData = getJSONFixture('EDDData.json');
        importMessage = new EDDTableImport.ImportMessage();
        selectMajorKindStep = new EDDTableImport.SelectMajorKindStep();
    });
    describe('method: SelectMajorKindStep.checkInterpretationMode', function() {
         it ('should initially return false', function() {
            expect(selectMajorKindStep.checkInterpretationMode()).toBeFalsy()
        })
    });
    describe('method: SelectMajorKindStep.requiredInputsProvided', function() {
         it ('should initially return false', function() {
            //this should be returning false..
            expect(selectMajorKindStep.requiredInputsProvided()).toBeFalsy()
        })
    });
    describe('method: SelectMajorKindStep.checkMasterProtocol', function() {
        it ('should return an empty array', function() {
            expect(selectMajorKindStep.checkMasterProtocol()).toBeTruthy()
        })
    });
    describe('method: SelectMajorKindStep.getUserWarnings', function() {
        it ('should return an empty array', function() {
            expect(selectMajorKindStep.getUserWarnings()).toEqual([])
        })
    });
    describe('method: SelectMajorKindStep.requiredInputsProvided', function() {
        it ('should initially return false', function() {
            expect(selectMajorKindStep.requiredInputsProvided()).toBeFalsy()
        })
    });
});
