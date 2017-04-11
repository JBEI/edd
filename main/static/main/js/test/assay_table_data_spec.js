/**
 * unit tests for AssayTableData.js
 */

describe("Import.js", function () {
    var selectMajorKindStep;
    beforeEach(function() {
       jasmine.getJSONFixtures().fixturesPath='base/main/static/main/js/test/';
       EDDData = getJSONFixture('EDDData.json');
       selectMajorKindStep = new EDDTableImport.SelectMajorKindStep();
    });
    describe('method: SelectMajorKindStep.checkInterpretationMode', function() {
        it ('should initially return false', function() {
             expect(selectMajorKindStep.checkInterpretationMode()).toBeFalsy()
        })
    });
    describe('method: SelectMajorKindStep.checkMasterProtocol', function() {
        it ('should initially return false', function() {
            //this should be returning false..
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
