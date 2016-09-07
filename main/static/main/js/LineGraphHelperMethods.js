
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
                        + "</br>" + '<strong>' + " Measurement: " + '</strong>' + d.measurement)
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
                        + "</br>" + '<strong>' + " Measurement: " + '</strong>' + d.measurement)
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
 *  function takes in square attributes and creates a plus hover svg object
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
                        + "</br>" + '<strong>' + " Measurement: " + '</strong>' + d.measurement)
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
    function triangleHover(x, y, triangle, color, div) {
        triangle
            .enter()
            .append('svg:polygon')
            .attr('points', function (d) {
                return [[x(d.x), y(d.y) - 4], [x(d.x) + 4, y(d.y) + 4], [x(d.x) - 4, y(d.y) + 4]];
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
                        + "</br>" + d.measurement)
                    .style("left", (d3.event.pageX) + "px")
                    .style("top", (d3.event.pageY - 30) + "px");
            })
            .on("mouseout", function () {
                div.transition()
                    .duration(500)
                    .style("opacity", 0);
            });
    }

/**
 *  function takes in path attributes and creates an svg path
 */
    function createLine(svg, id, line, color) {
        return svg.append('path')
                    .attr("id", id)
                    .attr('d', line)
                    .attr('stroke', color)
                    .attr('stroke-width', 2)
                    .attr("class", 'lineClass')
                    .attr('fill', 'none')
                    .on('mouseover', function(d) {
                        //highlights grouped lines. d3.select(this).style("opacity", "1");
                        var selectedLine = this;
                        d3.selectAll('.lineClass').style('opacity',function () {
                            return (this === selectedLine) ? 1.0 : 0.1;
                        });
                        d3.selectAll('.lineClass').style('stroke', 3);
                        d3.selectAll('circle').style('opacity', 0.1);
                        d3.selectAll('rect').style('opacity', 0.1);
                        d3.selectAll('polygon').style('opacity', 0.1);
                    })
            .on('mouseout', function() {
                d3.selectAll('.lineClass').style('opacity', 1);
                d3.selectAll('circle').style('opacity', 1);
                d3.selectAll('rect').style('opacity', 1);
                d3.selectAll('polygon').style('opacity', 1)
            })
    }
