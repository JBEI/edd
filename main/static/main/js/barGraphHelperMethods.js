
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
 * This function takes in data nested by type (ie 'x') and returns and obj with time points as keys and
 * how many values correspond to this key as values
 * @param values
 * @returns ie {6: 6, 7: 6, 8: 6}
 */
function findAllTime(values) {
    var times = {};
    _.each(values, function(value) {
        times[value.key] = value.values.length;
    });
    return times;
}

/**
 * this function takes in the object created by findAllTime. Takes the difference between how many values are present
 * versus the max value. Returns new obj with difference as values and time points as keys.
 * @param obj
 * @returns {*}
 */
function findMaxTimeDifference(obj) {
    var values = _.values(obj);
    var max = Math.max.apply(null, values);
    $.each(obj, function(key, value) {
        obj[key] = max - value;
    });
    return obj;
}

/**
 * this function takes in the entries obj with 1 nested data set based on type,
 * the difference obj created by findMaxTimeDifference, and the original data structure array. Inserts values for
 * missing values.
 * @param obj
 * @param differenceObj
 * @param assayMeasurements
 * @param type
 */
function insertFakeValues(obj, differenceObj, assayMeasurements) {
    var count = 0;
     _.each(obj, function(d) {
        var howMany = differenceObj[d.key];
        while (count < howMany) {
            insertFakeTime(assayMeasurements, d.key, d.values[0].y_unit);
            count++;
        }
    });
}

function insertFakeTime(array, key, y_unit) {
    key = parseFloat(key);
    array.push({
          'color': 'white',
          'x': key,
          'y': null,
          'y_unit': y_unit,
          'name': '',
          'lineName': 'n/a'
        });
}
