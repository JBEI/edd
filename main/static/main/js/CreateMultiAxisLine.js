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

    var div = d3.select("body").append("div")
        .attr("class", "tooltip2")
        .style("opacity", 0);

    var y = d3.scale.linear().rangeRound([graphSet.height, 0]);
    var x = d3.scale.linear().domain([xDomain[0] - 1, xDomain[xDomain.length -1]]).range([0, graphSet.width]);

    var meas = d3.nest()
        .key(function (d) {
            return d.y_unit;
        })
        .entries(assayMeasurements);

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

    graphSet.create_x_axis(graphSet, x, svg);

    for (var index = 0; index<numUnits; index++) {
        y.domain([yMin[index], d3.max(unitMeasurementData[index], function (d) {
            return d3.max(d.values, function (d) {
                return d.y;
            });
        })]);

        var lineGen1 = d3.svg.line()
            .x(function (d) {
                return x(d.x);
            })
            .y(function (d) {
                return y(d.y);
            });

        var data = d3.nest()
            .key(function (d) {
                return d.name;
            })
            .key(function (d) {
                return d.y_unit;
            })
            .entries(meas[index].values);

        var proteinNames = d3.nest()
            .key(function (d) {
                return d.name;
            })
            .entries(assayMeasurements);

        var names = proteinNames.map(function (d) {return d.key;});

        if (index == 0) {

            //create right y-axis label
            graphSet.create_y_axis(graphSet, meas[index].key, y, svg);
            //add image to x axis label
            svg.append('svg:circle')
                .attr('class', 'dot')
                .attr('cx', -37)
                .attr('cy', 80)
                .attr('r', 5);
            svg.append("text")
                .attr("transform", "rotate(-90)")
                .attr("y", -47)
                .attr("x", -80)
                .attr("dy", "1em")
                .style("text-anchor", "middle")
                .text("----");
        } else {
             var spacing = {
                 1: graphSet.width,
                 2: graphSet.width + 50,
                 3: graphSet.width + 100,
                 4: graphSet.width + 150
             };
            //create right axis
            graphSet.create_right_y_axis(meas[index].key, y, svg, spacing[index])
            var squareSize = 8;
            //add image to y-axis label
            svg.append('svg:rect')
                .attr('x', 782)
                .attr('y', 75)
                .attr('width', squareSize)
                .attr('height', squareSize);
            svg.append("text")
                .attr("transform", "rotate(-90)")
                .attr("y", 776)
                .attr("x", -79)
                .attr("dy", "1em")
                .style("text-anchor", "middle")
                .text("---");

        }

        for (var k = 0; k < data.length; k++) {

            //color of line according to name
            var color1 = graphSet.color(data[k].key);

            //lines
            for (var j = 0; j < data[k].values.length; j++) {
                if (index === 0) {
                    createLine(svg, data[k].key.split(' ').join('_'), lineGen1(data[k].values[j].values),
                               color1);
                    //svg object for data points
                    var dataCirclesGroup = svg.append('svg:g');
                    // data point circles
                    var circles = dataCirclesGroup.selectAll('.data-point' + index)
                        .data(data[k].values[j].values);
                    //circle hover svg
                    circleHover(x, y, circles, color1, div)
                } else {
                    createLine(svg, data[k].key.split(' ').join('_'), lineGen1(data[k].values[j].values),
                               color1);
                    //svg object for data points
                    var dataRectGroup = svg.append('svg:g');
                    // data point circles
                    var rect = dataRectGroup.selectAll('.data-point' + index)
                        .data(data[k].values[j].values);
                    plusHover(x, y, rect, color1, div);
             }
            }
          }
        }
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

/**
 *  function takes in rect attributes and creates rect hover svg object
 */
    function rectHover(x,y,rect, color, div) {

        var squareSize = 5;

        rect
            .enter()
            .append('svg:rect')
            .attr('x', function (d) {
                return x(d.x) - squareSize/2;
            })
            .attr('y', function (d) {
                return y(d.y) - squareSize/2;
            })
            .attr('width', squareSize)
            .attr('height', squareSize)
            .style("fill", color)
            .on("mouseover", function (d) {
                div.transition()
                    .duration(200)
                    .style("opacity", 0.9);
                if (d.y_unit === undefined) {
                    var unit = 'n/a';
                } else {
                    unit = d.y_unit;
                }
                div.html('<strong>' + d.name + '</strong>' + ": " + d.y + " " + unit
                        + "</br>" + " measurement: " + d.measurement)
                    .style("left", (d3.event.pageX) + "px")
                    .style("top", (d3.event.pageY - 30) + "px");
            })
            .on("mouseout", function (d) {
                div.transition()
                    .duration(500)
                    .style("opacity", 0);
            });
    }

/**
 *  function takes in circle attributes and creates circle hover svg object
 */
    function circleHover(x, y, circles, color, div) {
        circles
            .enter()
            .append('svg:circle')
            .attr('class', 'dot')
            .attr('fill', 'grey')
            .attr('cx', function (d) {
                return x(d.x);
            })
            .attr('cy', function (d) {
                return y(d.y);
            })
            .attr('r', function () {
                return 3;
            })
            .style("fill", color)
            .on("mouseover", function (d) {
                div.transition()
                    .duration(200)
                    .style("opacity", 0.9);
                if (d.y_unit === undefined) {
                    var unit = 'n/a';
                } else {
                    unit = d.y_unit;
                }
                div.html('<strong>' + d.name + '</strong>' + ": " + d.y + " " + unit
                        + "</br>" + " measurement: " + d.measurement)
                    .style("left", (d3.event.pageX) + "px")
                    .style("top", (d3.event.pageY - 30) + "px");
            })
            .on("mouseout", function (d) {
                div.transition()
                    .duration(500)
                    .style("opacity", 0);
            });
    }


/**
 *  function takes in triangle attributes and creates a triangle hover svg object
 */
    function plusHover(x, y, plus, color, div) {
        var squareSize = 5;
        plus
            .enter()
            .append('svg:rect')
            .attr('x', function (d) {
                return x(d.x) - squareSize/2;
            })
            .attr('y', function (d) {
                return y(d.y);
            })
            .attr('width', squareSize + 3)
            .attr('height', squareSize - 3)
            .style("fill", color);

        plus
            .enter()
            .append('svg:rect')
            .attr('x', function (d) {
                return x(d.x);
            })
            .attr('y', function (d) {
                return y(d.y) - squareSize/2;
            })
            .attr('width', squareSize - 3)
            .attr('height', squareSize + 3)
            .style("fill", color)
            .on("mouseover", function (d) {
                div.transition()
                    .duration(200)
                    .style("opacity", 0.9);
                if (d.y_unit === undefined) {
                    var unit = 'n/a';
                } else {
                    unit = d.y_unit;
                }
                div.html('<strong>' + d.name + '</strong>' + ": " + d.y + " " + unit
                        + "</br>" + " measurement: " + d.measurement)
                    .style("left", (d3.event.pageX) + "px")
                    .style("top", (d3.event.pageY - 30) + "px");
            })
            .on("mouseout", function (d) {
                div.transition()
                    .duration(500)
                    .style("opacity", 0);
            });
    }

    function createLine(svg, id, line, color) {
        var line = svg.append('path')
                    .attr("id", id)
                    .attr('d', line)
                    .attr('stroke', color)
                    .attr('stroke-width', 2)
                    .attr("class", 'experiment')
                    .attr('fill', 'none');
        return line; 
    }
