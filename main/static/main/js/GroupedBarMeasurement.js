////// grouped bar chart based on time
function createMeasurementGraph(graphSet, svg) {

    var assayMeasurements = graphSet.assayMeasurements;

    var x0 = d3.scale.ordinal()
        .rangeRoundBands([0, graphSet.width], 0.1);

    var x1 = d3.scale.ordinal();

    var y = d3.scale.linear()
        .range([graphSet.height, 0]);


    var div = d3.select("body").append("div")
        .attr("class", "tooltip")
        .style("opacity", 0);


    /**
     *  This d3 method transforms our data object into the following
     *  {
     *  {key: 0, values: {x, y, i}, {x, y, i}, {x, y, i}},
     *  {key: 1, values: {x, y, i}, {x, y, i}, {x, y, i}},
     *  }
     *  ...
    **/
    var data = d3.nest()
        .key(function (d) {
            return d.measurement;
        })
        .entries(assayMeasurements);

    //same as above but with protein names as keys
    var time = d3.nest()
        .key(function (d) {
            return d.x;
        })
        .entries(assayMeasurements);

    var ymin = d3.min(data, function (d) {
        return d3.min(d.values, function (d) {
            return d.y;
        });
    });

    if (ymin >= 0) {
      ymin = 0;
    }

    x0.domain(data.map(function (d) {return d.key;}));
    x1.domain(time.map(function (d) {return d.key;})).rangeRoundBands([0, x0.rangeBand()]);
    y.domain([ymin, d3.max(data, function (d) {
        return d3.max(d.values, function (d) {
            return d.y;
        });
    })]);

    graphSet.create_x_axis(graphSet, x0, svg);
    graphSet.create_y_axis(graphSet, y, svg);

    var bar = svg.selectAll(".bar")
        .data(data)
        .enter().append('g')
        .attr("class", "bar")
        .attr("transform", function (d) {
            return "translate(" + x0(d.key) + ",0)";
        });
    bar.selectAll("rect")
            .data(function (d) {
                return d.values;
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
            .style("opacity", 0.3)
            .on("mouseover", function(d) {
                if (d.y_unit === undefined) {
                    d.y_unit = 'n/a';
                  } 
                div.transition()
                    .style("opacity", 0.9);
                div .html(d.y + "<br/>"  + d.y_unit)
                    .style("left", (d3.event.pageX) + "px")
                    .style("top", (d3.event.pageY - 28) + "px");
                })
            .on("mouseout", function(d) {
                div.transition()
                    .style("opacity", 0);
            });
}
