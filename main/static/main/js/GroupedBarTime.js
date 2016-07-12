////// grouped bar chart based on time
function createTimeGraph(graphSet, svg) {

    var assayMeasurements = graphSet.assayMeasurements;

    var x0 = d3.scale.ordinal()
        .rangeRoundBands([0, graphSet.width], .1);

    var x1 = d3.scale.ordinal();

    var y = d3.scale.linear()
        .range([graphSet.height, 0]);

    var xAxis = d3.svg.axis()
        .scale(x0)
        .orient("bottom");

    var yAxis = d3.svg.axis()
        .scale(y)
        .orient("left")
        .tickFormat(d3.format(".2s"));

    var div = d3.select("body").append("div")
        .attr("class", "tooltip")
        .style("opacity", 0);
    /**
     *  This method transforms our data object into the following
     *  {
    *  {key: 0, values: {x, y, i}, {x, y, i}, {x, y, i}},
    *  {key: 1, values: {x, y, i}, {x, y, i}, {x, y, i}},
    *  }
     *  ...
     **/
    var data = d3.nest()
        .key(function (d) {
            return d.x;
        })
        .entries(assayMeasurements);

    //same as above but with protein names as keys
    var proteinNames = d3.nest()
        .key(function (d) {
            return d.name;
        })
        .entries(assayMeasurements);

    //protein names
    var names = proteinNames.map(function (d) {return d.key;});

    x0.domain(data.map(function (d) {return d.key;}));
    x1.domain(names).rangeRoundBands([0, x0.rangeBand()]);
    y.domain([d3.min(data, function (d) {
        return d3.min(d.values, function (d) {
            return d.y;
        });
    }), d3.max(data, function (d) {
        return d3.max(d.values, function (d) {
            return d.y;
        });
    })]);

    //x -axis
    svg.append("g")
        .attr("class", "x axis")
        .attr("transform", "translate(0," + graphSet.height + ")")
        .call(xAxis)
        .append('text')
        .attr("y", 20)
        .attr("x", graphSet.width)
        .text(graphSet.x_unit);
    // Draw the x Grid lines
    svg.append("g")
        .attr("class", "grid")
        .attr("transform", "translate(0," + graphSet.height + ")")
        .call(graphSet.x_axis(x0)
            .tickSize(-graphSet.height, 0, 0)
            .tickFormat("")
        );

    //y-axis
    svg.append("g")
        .attr("class", "y axis")
        .call(yAxis)
        .append("text")
        .attr("transform", "rotate(-90)")
        .attr("y", 6)
        .attr("dy", ".71em")
        .style("text-anchor", "end")
        .text(graphSet.y_unit);
    // Draw the y Grid lines
    svg.append("g")
        .attr("class", "grid")
        .call(graphSet.y_axis(y)
            .tickSize(-graphSet.width, 0, 0)
            .tickFormat("")
        );




    var bar = svg.selectAll(".bar")
        .data(data)
        .enter().append('g')
        .attr("class", "bar")
        .attr("transform", function (d) {
            return "translate(" + x0(d.key) + ",0)";
        });


    bar.selectAll("rect")
            .data(function (d) {
                return d.values
            })
            .enter().append("rect")
            .attr("width", x1.rangeBand())
            .attr("x", function (d) {
                return x1(d.name);
            })
            .attr("y", function (d) {
                return y(d.y);
            })
            .attr("height", function (d) {
                return Math.abs(graphSet.height - y(d.y));
            })
            .style("fill", function (d) {
                return graphSet.color(d.name);
            })
            .style("opacity", .3)
            .on("mouseover", function(d) {
                div.transition()
                    .style("opacity", .9);
                div .html(d.y + "<br/>"  + d.y_unit)
                    .style("left", (d3.event.pageX) + "px")
                    .style("top", (d3.event.pageY - 28) + "px");
                })
            .on("mouseout", function(d) {
                div.transition()
                    .style("opacity", 0);
            });
}
