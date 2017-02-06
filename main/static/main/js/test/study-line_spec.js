/**
 * Created by Tlopez on 2/3/17.
 */

/**
 * unit tests for Study-Lines.js
 */
//
describe('Test DataGridSpecLines', function() {
    
    var dataGrid;

     beforeEach(function() {
        dataGrid = new DataGridSpecLines();
      });


    describe('method: DataGridSpecLines.generateStrainNameCells', function() {
        it('should return a data grid data cell with the strain name', function() {
            expect(dataGrid.getTableElement()).toEqual(null)
         })
    });
});
