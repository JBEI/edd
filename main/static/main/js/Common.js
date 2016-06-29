    /**
    * this function returns object size  
    **/
    function objectSize(obj) {
    
        var size = 0, key;
        for (key in obj) {
            if (obj.hasOwnProperty(key)) size++;
        }
        return size;
    };
    
    /**
    * this function takes in the data object and returns the size of each assays'
    * data points
    **/
    function arrSize(data) {
    
      var size = objectSize(data);
      var maxArrSize = [];
      for (var i = 0; i < size; i++) {
        //returns first object
        var first = (data[Object.keys(data)[i]].values);
        maxArrSize.push(first.length)
    
      }
      maxArrSize.sort(function(a, b) {
              return a - b;
            })
      return maxArrSize
    }
    
    /**
    *  This function takes in data and transforms it into the following
    *  {x, y, i}, {x, y, i}, {x, y, i} .... 
    **/
    
    function sortBarData(assays) {
        return [].concat.apply([], assays);
}
    /**
    *  This function takes a unit id and unit type json and returns the unit name
    **/

    function unitName(unitId, unitTypes) {
      return unitTypes[unitId].name
    }
        /**
    *  This function takes in data and transforms it into the following
    *  [
        ...
        [{x, y}, {x, y}, ...],
        [{x, y}, {x, y}, ...],
        ...
        }
    **/
    function transformLineData(data, names) {
      var unitTypes = data.UnitTypes;
      data = data.AssayMeasurements;
      var linedata = []
      var size = objectSize(data);
      for (var i = 0; i < size; i++) {
        //returns first object
        var first = (data[Object.keys(data)[i]]);
        var values = first.values;
        //data
        var n = [];
        for (var j = 0; j < values.length; j++ ) {
          dataset = {};
            if (values[j][0].length == 0) {
                values[j][0] = ["0"];
            } else if (values[j][1].length == 0) {
                values[j][1] = ["0"];
            }
            dataset.label = 'dt' + first.assay; 
            dataset.x = parseInt(values[j][0].join());
            dataset.y = parseFloat(values[j][1].join());
            dataset.i = i;
            dataset.x_unit = unitName(first.x_units, unitTypes);
            dataset.y_unit = unitName(first.y_units, unitTypes);
            dataset.name = names[i];
            n.push(dataset);
        }

        linedata.push(n);
      }
          //sort data
         linedata.forEach(function(d) {
            d.sort(function(a, b) {
              return a.x - b.x;
            })
          })

        return(linedata);
    }
    
    function transformSingleLineItem(data, singleData, names) {
        var unitTypes = data.UnitTypes;
        var xAndYValues = [];
        singleDataValues = singleData.values;
        for (var i = 0; i < singleDataValues.length; i++) {
            dataset = {};
            if (singleDataValues[i][0].length == 0) {
                singleDataValues[i][0] = ["0"];
            } else if (singleDataValues[i][1].length == 0) {
                singleDataValues[i][1] = ["0"];
            }
            dataset.label = 'dt' + singleData.assay;
            dataset.x = parseInt(singleDataValues[i][0].join());
            dataset.y = parseFloat(singleDataValues[i][1].join());
            dataset.x_unit = unitName(singleData.x_units, unitTypes);
            dataset.y_unit = unitName(singleData.y_units, unitTypes);
            dataset.name = names;
            xAndYValues.push(dataset);
        }
        xAndYValues.sort(function(a, b) {
              return a.x - b.x;
            });
        return xAndYValues;
    }



    /**
    * this function takes in the data array and returns an array of y values  
    **/
    function yvalues(data) {
      var y = [];
      var size = objectSize(data);
      for (var i = 0; i < size; i++) {
        var firstobj = (data[Object.keys(data)[i]].values);
        for (var j = 0; j < firstobj.length; j++) {
          var yval = firstobj[j][1]
          if (yval.length == 1)
          y.push(parseFloat(yval.join()))
        }
      }
      return y;
    }
    
    /**
    * this function returns an array of x values  
    **/
    function xvalues(data) {
      var x = [];
      var size = objectSize(data);
      for (var i = 0; i < size; i++) {
        var firstobj = (data[Object.keys(data)[i]].values);
        for (var j = 0; j < firstobj.length; j++) {
          var xval = firstobj[j][0]
          if (xval.length == 1)
          x.push(parseFloat(xval.join()))
        }
      }
      return x;
    }
    
    function findAllXValues(xvalues) {
        var fullxList = [];
        xvalues.forEach(function(d) {
            if (! _.contains(fullxList, d)) {
                fullxList.push(d)
            }
        })
        return fullxList.sort(function(a, b) {
            return a - b;
        })
    }
    
    /**
    * this function sorts an array of values in ascending order 
    **/
     function sortValues(values) {
        values.sort(function(a,b) {
          return parseFloat(b) - parseFloat(a);
        });
        return values
     }

     /**
  *  This function takes in the EDDData.AssayMeasurements object and returns
  *  an array of Assay ids. 
  **/

    function findAssayIds(assayMeasurements) {
     var assayIds = [];
     for (key in assayMeasurements) {
          assayIds.push(assayMeasurements[key].assay)
     }
        return assayIds
    }

    /**
  *  This function takes in the EDDData.Assays object and array of Assay ids 
  *  and returns an array of LID ids. 
  **/

    function findLidIds(assays, assayIds) {
        var lidIds = [];
        for (var i = 0; i < assayIds.length; i++) {
            lidIds.push(assays[assayIds[i]].lid)
        }
    return lidIds
    }

    /**
  *  This function takes in the EDDData.Lines object and lidIds and returns
  *  an array of measurements names.  
  **/

    function lineName(lines, lidIds) {
        var lineNames = [];
        for (var i = 0; i < lidIds.length; i++) {
            lineNames.push(lines[lidIds[i]].name)
        }
        return lineNames;
    }

  /**
  *  This function takes in the EDDData object and returns
  *  an array of measurements names.  
  **/

  function names(EDDData) {
      var assayIds = findAssayIds(EDDData.AssayMeasurements)
      var lidIds = findLidIds(EDDData.Assays, assayIds)
      var names = lineName(EDDData.Lines, lidIds)
      return names; 
  }
    

  /**
  *  This function takes in the d3 nested data object and returns
  *  the max array size.
  **/
  function maxSize(data) {
    var max = 0;
    data.forEach(function(d) {
    if (d.values.length > max) {
      max = d.values.length
    }
  });
    console.log(max)
  }
