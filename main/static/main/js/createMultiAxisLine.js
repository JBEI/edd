/**
* this function creates the line graph
**/
function createMultiLineGraph(graphSet, svg) {

    var assayMeasurements = graphSet.assayMeasurements,
        numUnits = howManyUnits(assayMeasurements),
        yRange = [],
        unitMeasurementData = [],
        yMin = [];

    //get x values
    var xDomain = assayMeasurements.map(function(assayMeasurement) { return assayMeasurement.x; });

    //sort x values
    xDomain.sort(function(a, b) {
        return a - b;
    });

    //tool tip svg
    var div = d3.select("body").append("div")
        .attr("class", "tooltip2")
        .style("opacity", 0);

    //y and x axis ranges
    var y = d3.scale.linear().rangeRound([graphSet.height, 0]);
    var x = d3.scale.linear().domain([xDomain[0] - 1, xDomain[xDomain.length -1]]).range([0, graphSet.width]);

    //nest data based off y_unit. ie g/l, cmol, n/a
    var meas = d3.nest()
        .key(function (d) {
            return d.y_unit;
        })
        .entries(assayMeasurements);

    //iterate through the different unit groups getting min y value, data, and range.
    for (var i = 0; i < numUnits; i++) {
        yRange.push(d3.scale.linear().rangeRound([graphSet.height, 0]));
        unitMeasurementData.push(d3.nest()
            .key(function (d) {
                return d.y;
            })
            .entries(meas[i].values));
        yMin.push(d3.min(unitMeasurementData[i], function (d) {
        return d3.min(d.values, function (d) {
            return d.y;
        });
        }))
    }

    // create x axis svg
    graphSet.create_x_axis(graphSet, x, svg, 'hours');

    //iterate through different unit groups and add lines according to unit type and y axis.
    for (var index = 0; index<numUnits; index++) {

        if (yMin[index] > 0) {
            yMin[index] = 0
        }

        //y axis domain for specific unit group
        y.domain([yMin[index], d3.max(unitMeasurementData[index], function (d) {
            return d3.max(d.values, function (d) {
                return d.y;
            });
        })]);

        //nest data by line name and the nest data again based on y-unit.
        var data = d3.nest()
            .key(function (d) {
                return d.fullName;
            })
            .key(function (d) {
                return d.y_unit;
            })
            .entries(meas[index].values);

        //nest data by line name
        var proteinNames = d3.nest()
            .key(function (d) {
                return d.name;
            })
            .entries(assayMeasurements);

        //spacing for y-axis labels
        var spacing = {
                 1: graphSet.width,
                 2: graphSet.width + 54,
                 3: graphSet.width + 105
             };

        if (index === 0) {
            //create left y-axis label
            graphSet.create_y_axis(graphSet, meas[index].key, y, svg);
            //add circle image to y axis label
            svg.append('svg:circle')
                .attr('class', 'icon')
                .attr('cx', -46)
                .attr('cy', 80)
                .attr('r', 5);
        } else if (index === 1) {
            //create first right axis
            graphSet.create_right_y_axis(meas[index].key, y, svg, spacing[index]);
            //add triangle shape to y-axis label
            svg.append('svg:polygon')
                .attr('class', 'icon')
                .attr('points', [[789, 75], [796, 80], [796, 70]])
        } else if (index === 2) {
            //create second right axis
            graphSet.create_right_y_axis(meas[index].key, y, svg, spacing[index]);
            var squareSize = 8;
            //add square image to y-axis label
            svg.append('svg:rect')
                .attr('class', 'icon')
                .attr('x', 843)
                .attr('y', 70)
                .attr('width', squareSize)
                .attr('height', squareSize);
        } else if (index === 3) {
            //create third right y-axis
            graphSet.create_right_y_axis(meas[index].key, y, svg, spacing[index]);
            //add plus image to y-axis label
            svg.append('svg:rect')
                .attr('class', 'icon')
                .attr('x', 894)
                .attr('y', 73)
                .attr('width', 8)
                .attr('height', 2);

            svg.append('svg:rect')
                .attr('class', 'icon')
                .attr('x', 897)
                .attr('y', 70)
                .attr('width', 2)
                .attr('height', 8)
        }
        else {
            //group rest of unit types on another axis that is now shown
            graphSet.create_right_y_axis(meas[index].key, y, svg, graphSet.width + 1000);
        }

        _.each(data, function(unitData) {
            //lines for each name
            for (var j = 0; j < unitData.values.length; j++) {

            var individualDataSet = unitData.values[j].values[0],
                color;
            //create line svg
            var lineGen = d3.svg.line()
                .x(function (d) {
                    return x(d.x);
                })
                .y(function (d) {
                    return y(d.y);
                });

                if (individualDataSet.newLine) {
                   color = graphSet.color(individualDataSet.fullName);
                } else {
                    //color of line according to name
                   color = unitData.values[j].values[0].color;
                }


            if (index === 0) {
                createLine(svg, unitData.values[j].values, lineGen, color);
                //svg object for data points
                var dataCirclesGroup = svg.append('svg:g');
                // data point circles
                var circles = dataCirclesGroup.selectAll('.data-point' + index)
                    .data(unitData.values[j].values);
                //circle hover svg
                circleHover(x, y, circles, color, div)
            } else if (index === 1) {
                createLine(svg, unitData.values[j].values, lineGen, color);
                //svg object for data points
                var dataRectGroup = svg.append('svg:g');
                // data point circles
                var triangle = dataRectGroup.selectAll('.data-point' + index)
                    .data(unitData.values[j].values);
                triangleHover(x, y, triangle, color, div);
         }  else if (index === 2) {
               createLine(svg, unitData.values[j].values, lineGen, color);
                //svg object for data points
                var dataRectGroup = svg.append('svg:g');
                // data point circles
                var rect = dataRectGroup.selectAll('.data-point' + index)
                    .data(unitData.values[j].values);
                rectHover(x, y, rect, color, div);
            } else if (index === 3) {
               createLine(svg, unitData.values[j].values, lineGen, color);
                //svg object for data points
                var dataRectGroup = svg.append('svg:g');
                // data point circles
                var plus = dataRectGroup.selectAll('.data-point' + index)
                    .data(unitData.values[j].values);
                plusHover(x, y, plus, color, div);
            } else {
                createLine(svg, unitData.key.split(' ').join('_'), line(unitData.values[j].values),
                           color);
                //svg object for data points
                var dataCirclesGroup = svg.append('svg:g');
                // data point circles
                var circles = dataCirclesGroup.selectAll('.data-point' + index)
                    .data(unitData.values[j].values);
                //circle hover svg
                circleHover(x, y, circles, color, div)
            }
        }
          })
        }
}
