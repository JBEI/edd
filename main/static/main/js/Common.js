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
    *  This function takes in EDDdata, a singleAssay line entry, and measurement names and
    *  transforms it into the following schema:
    *    [{label: "dt9304, x: 1, y: 2.5, x_unit: "n/a", y_unit: "cmol",  name: "i'm a protein
     *    name"},
    *    {label: "dt3903, x: 1, y: 23.5, x_unit: "n/a", y_unit: "cmol",  name: "i'm another protein
     *    name"}
    *    ...
    *    ]
    **/
    
    function transformSingleLineItem(data, singleData, names) {
        // unit type ids
        var unitTypes = data.UnitTypes;
        // array of x and y values for sortin
        var xAndYValues = [];
        //data for one line entry
        var singleDataValues = singleData.values;
        
        _.forEach(singleDataValues, function(dataValue) {
             var dataset = {};
            //can also change to omit data point with null which was done before..
            if (dataValue[0].length == 0) {
                dataValue[0] = ["0"];
            } else if (dataValue[1].length == 0) {
                dataValue[1] = ["0"];
            }
            dataset.label = 'dt' + singleData.assay;
            dataset.x = parseInt(dataValue[0].join());
            dataset.y = parseFloat(dataValue[1].join());
            dataset.x_unit = unitName(singleData.x_units, unitTypes);
            dataset.y_unit = unitName(singleData.y_units, unitTypes);
            dataset.name = names;
            xAndYValues.push(dataset);
        });
        xAndYValues.sort(function(a, b) {
              return a.x - b.x;
            });
        return xAndYValues;
    }
    
    /**
    *  This function takes in the EDDData.AssayMeasurements object and returns
    *  an array of Assay ids.
    **/
    
    function findAssayIds(assayMeasurements) {
     var assayIds = [];
     for (var key in assayMeasurements) {
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
        _.forEach(assayIds, function(assayId) {
            lidIds.push(assays[assayId].lid)
        });
        return lidIds
    }
    
    /**
    *  This function takes in the EDDData.Lines object and lidIds and returns
    *  an array of measurements names.  
    **/

    function lineName(lines, lidIds) {
       var lineNames = [];
       _.forEach(lidIds, function(lidId) {
            lineNames.push(lines[lidId].name)
        });
        return lineNames;
    }

    /**
    *  This function takes in the EDDData object and returns
    *  an array of measurements names.  
    **/

    function names(EDDData) {
      var assayIds = findAssayIds(EDDData.AssayMeasurements);
      var lidIds = findLidIds(EDDData.Assays, assayIds);
      return lineName(EDDData.Lines, lidIds);
    }

 
    function legend(data, color, svg, width) {
        var legend = svg.selectAll(".legend")
            .data(data)
            .enter().append("g")
            .attr("class", "legend")
            .attr("transform", function (d, i) {
                return "translate(0," + i * 20 + ")";
            });
    
        legend.append("rect")
            .attr("x", width + 5)
            .attr("width", 18)
            .attr("height", 18)
            .style("fill", function (d) { // Add the colours dynamically
                return data.color = color(d.key);
            });
    
        legend.append("text")
            .attr("x", width + 25)
            .attr("y", 9)
            .attr("dy", ".35em")
            .style("text-anchor", "start")
            .text(function (d) {
                return d.key;
            });
        //hide legend for too many entries.
        if (names.length > 10) {
            d3.selectAll(".legend").style("display", "none");
        }
        return legend;
    }
    
    
    /**
     * this function creates the y axis tick marks for grid
     **/
    function make_y_axis(y) {
        return d3.svg.axis()
            .scale(y)
            .orient("left")
            .ticks(5)
    }
    
            /**
     * this function creates the x axis tick marks for grid
     **/
    function make_x_axis(x) {
        return d3.svg.axis()
            .scale(x)
            .orient("bottom")
            .ticks(5)
    }
