/**
* this function creates the line graph 
**/
function createLineGraph(graphSet, svg) {

    var assayMeasurements = graphSet.assayMeasurements;

    //get x values
    var xDomain = assayMeasurements.map(function(assayMeasurement) { return assayMeasurement.x; });

    //sort x values
    xDomain.sort(function(a, b) {
        return a - b;
    });

    var div = d3.select("body").append("div")
        .attr("class", "tooltip2")
        .style("opacity", 0);

    var y0 = d3.scale.linear().rangeRound([graphSet.height, 0]);
    var y1 = d3.scale.linear().rangeRound([graphSet.height, 0]);
    var x = d3.scale.linear().domain([xDomain[0] - 1, xDomain[xDomain.length -1]]).range([0, graphSet.width]);

    var meas = d3.nest()
        .key(function (d) {
            return d.y_unit;
        })
        .entries(assayMeasurements);

    var getValues = d3.nest()
        .key(function (d) {
            return d.y;
        })
        .entries(meas[0].values);

    var getValues2 = d3.nest()
        .key(function (d) {
            return d.y;
        })
        .entries(meas[1].values);

    ymin = d3.min(getValues, function (d) {
        return d3.min(d.values, function (d) {
            return d.y;
        });
    });

    ymin2 = d3.min(getValues2, function (d) {
        return d3.min(d.values, function (d) {
            return d.y;
        });
    });

    if (ymin >= 0) {
      ymin = 0;
    }

    y0.domain([ymin, d3.max(getValues, function (d) {
        return d3.max(d.values, function (d) {
            return d.y;
        });
    })]);

    y1.domain([ymin2, d3.max(getValues2, function (d) {
        return d3.max(d.values, function (d) {
            return d.y;
        });
    })]);

    var lineGen1 = d3.svg.line()
        .x(function (d) {
            return x(d.x);
        })
        .y(function (d) {
            return y0(d.y);
        });

    var lineGen2 = d3.svg.line()
        .x(function (d) {
            return x(d.x);
        })
        .y(function (d) {
            return y1(d.y);
        });

    var data = d3.nest()
        .key(function (d) {
            return d.name;
        })
        .key(function (d) {
            return d.y_unit;
        })
        .entries(meas[0].values);

    var data2 = d3.nest()
        .key(function (d) {
            return d.name;
        })
        .key(function (d) {
            return d.y_unit;
        })
        .entries(meas[1].values);
    
    var proteinNames = d3.nest()
        .key(function (d) {
            return d.name;
        })
        .entries(assayMeasurements);
        
    
    var names = proteinNames.map(function (d) {return d.key;});

    graphSet.create_x_axis(graphSet, x, svg);
    graphSet.create_y_axis(graphSet, y0, svg);
    var yAxisRight = d3.svg.axis().scale(y1)
    .orient("right").ticks(5);

    svg.append("g")
        .attr("class", "y axis")
        .attr("transform", "translate(" + graphSet.width + " ,0)")
        .style("fill", "red")
        .call(yAxisRight);

    for (var k = 0; k < data.length; k++) {

        //color of line and legend rect
        var color1 = graphSet.color(data[k].key);

        //lines
        for (var j = 0; j < data[k].values.length; j++) {
            var line = svg.append('path')
                .attr("id", data[k].key.split(' ').join('_'))
                .attr('d', lineGen1(data[k].values[j].values))
                .attr('stroke', color1)
                .attr('stroke-width', 2)
                .attr("class", "experiment")
                .attr('fill', 'none');

        //svg object for data points
        var dataCirclesGroup = svg.append('svg:g');

        // data point circles
        var circles = dataCirclesGroup.selectAll('.data-point')
            .data(data[k].values[j].values);

        circles
            .enter()
            .append('svg:circle')
            .attr('class', 'dot')
            //.attr('id', ("circle" + data[k].key).split(' ').join('_') )
            .attr('fill', 'grey')
            .attr('cx', function (d) {
                return x(d.x);
            })
            .attr('cy', function (d) {
                return y0(d.y);
            })
            .attr('r', function () {
                return 3;
            })
            .style("fill", color1)
            .on("mouseover", function (d) {
                div.transition()
                    .duration(200)
                    .style("opacity", 0.9);
                if (d.y_unit === undefined) {
                    var unit = 'n/a';
                } else {
                    unit = d.y_unit;
                }
                div.html('<strong>' + d.name + '</strong>' + ": " + d.y + " " + unit)
                    .style("left", (d3.event.pageX) + "px")
                    .style("top", (d3.event.pageY - 30) + "px");
            })
            .on("mouseout", function (d) {
                div.transition()
                    .duration(500)
                    .style("opacity", 0);
            });
        }
    }
    for (var u = 0; u < data2.length; u++) {

        //color of line and legend rect
        var color1 = graphSet.color(data[u].key);

        //lines
        for (var q = 0; q < data2[u].values.length; q++) {
            var line = svg.append('path')
                .attr("id", data2[u].key.split(' ').join('_'))
                .attr('d', lineGen2(data2[u].values[q].values))
                .attr('stroke', color1)
                .attr('stroke-width', 2)
                .attr("class", "experiment")
                .attr('fill', 'none');

        //svg object for data points
        var dataCirclesGroup = svg.append('svg:g');

        // data point circles
        var circles = dataCirclesGroup.selectAll('.data-point')
            .data(data2[u].values[q].values);

        circles
            .enter()
            .append('svg:circle')
            .attr('class', 'dot')
            //.attr('id', ("circle" + data[k].key).split(' ').join('_') )
            .attr('fill', 'grey')
            .attr('cx', function (d) {
                return x(d.x);
            })
            .attr('cy', function (d) {
                return y1(d.y);
            })
            .attr('r', function () {
                return 3;
            })
            .style("fill", color1)
            .on("mouseover", function (d) {
                div.transition()
                    .duration(200)
                    .style("opacity", 0.9);
                if (d.y_unit === undefined) {
                    var unit = 'n/a';
                } else {
                    unit = d.y_unit;
                }
                div.html('<strong>' + d.name + '</strong>' + ": " + d.y + " " + unit)
                    .style("left", (d3.event.pageX) + "px")
                    .style("top", (d3.event.pageY - 30) + "px");
            })
            .on("mouseout", function (d) {
                div.transition()
                    .duration(500)
                    .style("opacity", 0);
            });
        }
    }
    //create legend 
    graphSet.legend(data, graphSet.color, svg, graphSet.width, names);

}

// function howManyUnits(assayMeasurements) {
//      var y_units =  d3.nest()
//         .key(function (d) {
//             return d.y_unit;
//         })
//         .entries(assayMeasurements);
//     return y_units.length;
// }
//
// function minYUnit(y_unit_values) {
//
// }
//
// function yDomain(){
//
// }
