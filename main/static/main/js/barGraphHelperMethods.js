
/**
 * this function takes in input a protein's line values and inserts a y id key for
 * each x, y object.
 **/
function addYIdentifier(data3) {
    return _.each(data3, function (d, i) {
        d.key = 'y' + i;
    });
}

/**
 *  function takes in nested assayMeasurements and inserts a y id key for each value object
 *  returns data
 */
function getXYValues(nested) {
    return _.each(nested, function (nameValues) {
        return _.each(nameValues.values, function (xValue) {
            addYIdentifier(xValue.values);
        });
    });
}

/**
 *  function takes in nested keys and returns total length of keys
 */
function getSum(labels) {
    var totalLength = 0;

   _.each(labels, function(label) {
        totalLength += label.length
    });
    return totalLength;
}
