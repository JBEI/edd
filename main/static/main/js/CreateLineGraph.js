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

    var y = d3.scale.linear().rangeRound([graphSet.height, 0]);
    var x = d3.scale.linear().domain([xDomain[0] - 1, xDomain[xDomain.length -1]]).range([0, graphSet.width]);

    var getValues = d3.nest()
        .key(function (d) {
            return d.y;
        })
        .entries(assayMeasurements);

    ymin = d3.min(getValues, function (d) {
        return d3.min(d.values, function (d) {
            return d.y;
        });
    });

    if (ymin >= 0) {
      ymin = 0;
    }

    y.domain([ymin, d3.max(getValues, function (d) {
        return d3.max(d.values, function (d) {
            return d.y;
        });
    })]);

    var lineGen = d3.svg.line()
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
            return d.i;
        })
        .entries(assayMeasurements);
    
    var proteinNames = d3.nest()
        .key(function (d) {
            return d.name;
        })
        .entries(assayMeasurements);
        
    
    var names = proteinNames.map(function (d) {return d.key;});

    graphSet.create_x_axis(graphSet, x, svg);
    graphSet.create_y_axis(graphSet, y, svg);

    for (var k = 0; k < data.length; k++) {

        //color of line and legend rect
        var color1 = graphSet.color(data[k].key);

        //lines
        for (var j = 0; j < data[k].values.length; j++) {
            var line = svg.append('path')
                .attr("id", data[k].key.split(' ').join('_'))
                .attr('d', lineGen(data[k].values[j].values))
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
    //create legend 
    graphSet.legend(data, graphSet.color, svg, graphSet.width, names);

}
