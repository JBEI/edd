////// grouped bar chart based on time
function createTimeGraph(linedata, minValue, maxValue, labels, size, arraySize) {

    arraySize = arraySize.pop();

    var margin = {top: 20, right: 40, bottom: 30, left: 40},
        width = 1000 - margin.left - margin.right,
        height = 270 - margin.top - margin.bottom;

    var colorrange = ["#98abc5", "#8a89a6", "#7b6888", "#6b486b", "#a05d56", "#d0743c", "#ff8c00", "grey"];

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

      //create svg graph object
    var svg = d3.select("div#metrics")
      .append("svg")
      .attr("preserveAspectRatio", "xMinYMin meet")
      .attr("viewBox", "-30 -40 1100 280")
      .classed("svg-content", true);

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

    svg.append("g")
      .attr("class", "x axis")
      .attr("transform", "translate(0," + height + ")")
      .call(xAxis)
      // Draw the x Grid lines
    svg.append("g")
        .attr("class", "grid")
        .attr("transform", "translate(0," + height + ")")
        .call(make_x_axis()
            .tickSize(-height, 0, 0)
            .tickFormat("")
        )
        // Draw the y Grid lines
    svg.append("g")
        .attr("class", "grid")
        .call(make_y_axis()
            .tickSize(-width, 0, 0)
            .tickFormat("")
        )
    

    svg.append("g")
      .attr("class", "y axis")
      .call(yAxis)
    .append("text")
      .attr("transform", "rotate(-90)")
      .attr("y", 6)
      .attr("dy", ".71em")
      .style("text-anchor", "end")
      .text("Frequency");

    var bar = svg.selectAll(".bar")
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
          .on("mouseover", function() { tooltip.style("display", null); })
          .on("mouseout", function() { tooltip.style("display", "none"); })
          .on("mousemove", function(d) {
            var barPos = parseFloat(d3.select(this.parentNode).attr('transform').split("(")[1]);
            var xPosition = barPos + d3.mouse(this)[0] - 15;
            var yPosition = d3.mouse(this)[1] - 25;
            tooltip.attr("transform", "translate(" + xPosition + "," + yPosition + ")");
            tooltip.select("text").text("x: " + d.x + " y: " + d.y);
          });

     //legend
    var legendSpace = 200 / labels.length;

    var legend = svg.selectAll(".legend")
          .data(labels.slice().reverse())
        .enter().append("g")
          .attr("class", "legend")
          .attr("transform", function(d, i) { return "translate(0," + i + ")"; });



    legend.append("rect")
          .attr("width", legendSpace)
          .attr("height", legendSpace)
          .attr("x", width + 25)
          .attr("y", function(d, i) {return (legendSpace) + i * (legendSpace) - 5   ;})
          .style("fill", color);

    legend.append("text")
          .attr("x", width + 20)
          .attr("y", function(d, i) {return (legendSpace) + i * (legendSpace);})
          .attr("dy", ".35em")
          .style("text-anchor", "end")
          .text(function(d) { return d; });


    //tooltip
    var tooltip = svg.append("g")
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


}

