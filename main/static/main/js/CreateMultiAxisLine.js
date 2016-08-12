/**
* this function creates the line graph
**/
function createMultiLineGraph(graphSet, svg) {

    var assayMeasurements = graphSet.assayMeasurements;
    var numUnits = howManyUnits(assayMeasurements);
    var yRange = [];
    var unitMeasurmentData = [];
    var yMin = [];
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
        yRange.push(d3.scale.linear().rangeRound([graphSet.height, 0]))
        unitMeasurmentData.push(d3.nest()
            .key(function (d) {
                return d.y;
            })
            .entries(meas[i].values));
        yMin.push(d3.min(unitMeasurmentData[i], function (d) {
        return d3.min(d.values, function (d) {
            return d.y;
        });
    }))
    }

    graphSet.create_x_axis(graphSet, x, svg);
    
    for (var index = 0; index<numUnits; index++) {
    y.domain([yMin[index], d3.max(unitMeasurmentData[index], function (d) {
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
        var yAxis = d3.svg.axis().scale(y)
            .orient("left").ticks(5);

        svg.append("g")
            .attr("class", "y axis")
            .call(yAxis)
            .append("text")
            .attr("transform", "rotate(-90)")
            .attr("y", -47)
            .attr("x", 0 - (graphSet.height/2))
            .attr("dy", "1em")
            .style("text-anchor", "middle")
            .text(meas[index].key);
        // Draw the y Grid lines
        svg.append("g")
            .attr("class", "grid")
            .call(yAxis
                .tickSize(-graphSet.width, 0, 0)
                .tickFormat(""));

    } else {
     var yAxis = d3.svg.axis().scale(y)
        .orient("right").ticks(5);
    svg.append("g")
    .attr("class", "y axis")
    .attr("transform", "translate(" + graphSet.width + " ,0)")
    .style("fill", "red")
    .call(yAxis);
    }


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
                return y(d.y);
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
    }
    //create legend
    graphSet.legend(data, graphSet.color, svg, graphSet.width, names);

}

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
