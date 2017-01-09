/**
 * Created by tlopez on 9/20/16.
 */
/**
 * unit tests for EDDGraphingTools.js
 */

describe('Test barGraphHelperMethods', function() {

    describe('method: EDDGraphingTools.getSum', function() {
        it('should return length of keys', function() {
            var labels = ['test1', 'test2', 'test3'];
           expect(EDDGraphingTools.getSum(labels)).toEqual(15)
        });
    });

    describe('method: addYIdentifier', function() {
        it('should return length of keys', function() {
            var data = [
                {},
               {}
            ];

            var identifiedData = [
                {key: 'y0'},
                {key: 'y1'}
            ];
           expect(EDDGraphingTools.addYIdentifier(data)).toEqual(identifiedData)
        });
    });
});
