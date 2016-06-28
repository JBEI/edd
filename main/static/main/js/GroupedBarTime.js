////// grouped bar chart based on time
function createTimeGraph(linedata, minValue, maxValue, minXvalue, maxXvalue, labels, size, arraySize) {


    var margin = {top: 20, right: 40, bottom: 30, left: 40},
        width = 1000 - margin.left - margin.right,
        height = 270 - margin.top - margin.bottom;

    var colorrange = ["#48A36D",  "#56AE7C",  "#64B98C", "#72C39B", "#80CEAA",
         "#80CCB3", "#7FC9BD", "#7FC7C6", "#7EC4CF", "#7FBBCF", "#7FB1CF", "#80A8CE", "#809ECE",
         "#8897CE", "#8F90CD", "#9788CD", "#9E81CC", "#AA81C5", "#B681BE", "#C280B7", "#CE80B0",
         "#D3779F", "#D76D8F", "#DC647E", "#E05A6D", "#E16167", "#E26962", "#E2705C", "#E37756",
         "#E38457", "#E39158", "#E29D58", "#E2AA59", "#E0B15B", "#DFB95C", "#DDC05E", "#DBC75F",
         "#E3CF6D", "#EAD67C", "#F2DE8A", "#48A36D",  "#56AE7C",  "#64B98C", "#72C39B", "#80CEAA",
         "#80CCB3", "#7FC9BD", "#7FC7C6", "#7EC4CF", "#7FBBCF", "#7FB1CF", "#80A8CE", "#809ECE",
         "#8897CE", "#8F90CD", "#9788CD", "#9E81CC", "#AA81C5", "#B681BE", "#C280B7", "#CE80B0",
         "#D3779F", "#D76D8F", "#DC647E", "#E05A6D", "#E16167", "#E26962", "#E2705C", "#E37756",
         "#E38457", "#E39158", "#E29D58", "#E2AA59", "#E0B15B", "#DFB95C", "#DDC05E", "#DBC75F",
         "#E3CF6D", "#EAD67C", "#F2DE8A"];

    var thisColorRange = colorrange.splice(0, labels.length);

    var color = d3.scale.ordinal()
        .range(thisColorRange);

    var x0 = d3.scale.ordinal()
        .rangeRoundBands([0, width], .1);

    var x1 = d3.scale.ordinal();

    var y = d3.scale.linear()
        .range([height, 0]);

    var xAxis = d3.svg.axis()
        .scale(x0)
        .orient("bottom");

    var yAxis = d3.svg.axis()
        .scale(y)
        .orient("left")
        .tickFormat(d3.format(".2s"));

    var svgViewport = d3.select("div#metrics").append("svg")
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom)
    .style("border", "2px solid")

    var zoom = d3.behavior.zoom()
        .scaleExtent([1, 10])
        .on("zoom", zoomed);

    var innerSpace = svgViewport.append("g")
        .attr("class", "inner_space")
        .attr("transform", "translate(" + margin.left + "," + margin.top + ")")
        .call(zoom);
    /**
    *  This method transforms our data object into the following
    *  {
    *  {key: 0, values: {x, y, i}, {x, y, i}, {x, y, i}},
    *  {key: 1, values: {x, y, i}, {x, y, i}, {x, y, i}},
    *  }
    *  ...
    **/
    var data = d3.nest()
      .key(function(d) { return d.x; })
      .entries(linedata);

    x0.domain(data.map(function(d) { return d.key; }));
    x1.domain(labels).rangeRoundBands([0, x0.rangeBand()]);
    y.domain([0, d3.max(data, function(d) { return d3.max(d.values, function(d) { return d.y; }); })]);

    innerSpace.append("g")
      .attr("class", "x axis")
      .attr("transform", "translate(0," + height + ")")
      .call(xAxis)
      // Draw the x Grid lines
    innerSpace.append("g")
        .attr("class", "grid")
        .attr("transform", "translate(0," + height + ")")
        .call(make_x_axis()
            .tickSize(-height, 0, 0)
            .tickFormat("")
        )
        // Draw the y Grid lines
    innerSpace.append("g")
        .attr("class", "grid")
        .call(make_y_axis()
            .tickSize(-width, 0, 0)
            .tickFormat("")
        )


    innerSpace.append("g")
      .attr("class", "y axis")
      .call(yAxis)
    .append("text")
      .attr("transform", "rotate(-90)")
      .attr("y", 6)
      .attr("dy", ".71em")
      .style("text-anchor", "end")
      .text("Frequency");

    var bar = innerSpace.selectAll(".bar")
        .data(data)
        .enter().append('g')
        .attr("class", "bar")
        .attr("transform", function(d) { return "translate(" + x0(d.key) + ",0)"; })


    bar.selectAll("rect")
        .data(function(d) {return d.values})
         .enter().append("rect")
          .attr("width", x1.rangeBand())
          .attr("x", function(d) { return x1(d.i); })
          .attr("y", function(d) { return y(d.y); })
          .attr("height", function(d) { return height - y(d.y); })
          .style("fill", function(d) { return color(d.i); })
          .style("opacity", .3)
          .on("mouseover", function() { tooltip.style("display", null); })
          .on("mouseout", function() { tooltip.style("display", "none"); })
          .on("mousemove", function(d) {
            var barPos = parseFloat(d3.select(this.parentNode).attr('transform').split("(")[1]);
            var xPosition = barPos + d3.mouse(this)[0] - 15;
            var yPosition = d3.mouse(this)[1] - 25;
            tooltip.attr("transform", "translate(" + xPosition + "," + yPosition + ")");
            tooltip.select("text").html(labels[d.i] + ": " + d.y + " " + d.y_unit)
          });

    d3.select("body").append("div").attr("id", "v_scale").text("D3 Zoom Scale: ");
    d3.select("#v_scale").append("span").attr("id", "v_scale_val");
     //legend
     var legend = innerSpace.selectAll(".legend")
          .data(labels)
        .enter().append("g")
          .attr("class", "legend")
          .attr("transform", function(d, i) { return "translate(0," + i * 20 + ")"; });

      legend.append("rect")
          .attr("x", width - 18)
          .attr("width", 18)
          .attr("height", 18)
          .style("fill", color);

      legend.append("text")
          .attr("x", width - 24)
          .attr("y", 9)
          .attr("dy", ".35em")
          .style("text-anchor", "end")
          .text(function(d) { return d; })


    //tooltip
    var tooltip = innerSpace.append("g")
      .attr("class", "tooltip")
      .style("display", "none");

    tooltip.append("rect")
      .attr("width", 100)
      .attr("height", 20)
      .attr("fill", "white")
      .style("opacity", 0.5);

    tooltip.append("text")
      .attr("x", 50)
      .attr("dy", "1.2em")
      .style("text-anchor", "middle")
      .attr("font-size", "12px")
      .attr("font-weight", "bold");

    /**
    * this function creates the x axis tick marks for grid
    **/
    function make_x_axis() {
        return d3.svg.axis()
            .scale(x0)
            .orient("bottom")
            .ticks(5)
    }

    /**
    * this function creates the y axis tick marks for grid
    **/
    function make_y_axis() {
        return d3.svg.axis()
            .scale(y)
            .orient("left")
            .ticks(5)
    }

    function zoomed() {
        innerSpace.attr("transform", "translate(" + d3.event.translate + ")scale(" + d3.event.scale + ")");
    }
}
