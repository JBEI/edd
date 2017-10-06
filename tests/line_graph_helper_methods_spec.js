/**
 * unit tests for lineGraphHelperMethods.js
 */

describe('Test lineGraphHelperMethods', function() {

    describe('method: howManyUnits', function() {
        it('should how many units are in data', function() {
            var data = [
                {y_unit: 'meas'},
                {y_unit: 'anotherMeas'}
            ];
           expect(EDDGraphingTools.howManyUnits(data)).toEqual(2)
        });
        it('should return 1 for same meas', function() {
            var data = [
                {y_unit: 'meas'},
                {y_unit: 'anotherMeas'},
                {y_unit: 'anotherMeas'}
            ];
           expect(EDDGraphingTools.howManyUnits(data)).toEqual(2)
        });
    });

});
