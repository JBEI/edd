
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

/**
 *  function takes in nested data by unit type and returns how many units are in data 
 */
function howManyUnits(data) {
    if (data === {}) {
        return 1
    }
     var y_units =  d3.nest()
        .key(function (d) {
            return d.y_unit;
        })
        .entries(data);
    return y_units.length;
}
