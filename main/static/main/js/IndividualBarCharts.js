
/**
* this function takes in input min y value, max y value, and the transformed data. Outputs the graph 
**/
function createSideBySide(graphSet, selector) {
  
  var linedata = graphSet.individualData;
  
  //iterate through each assay
  for (var i = 0; i < linedata.length; i++) {

    var margin = {top: 30, right: 100, bottom: 150, left: 60}, width = 300 - margin.left - margin.right, height = 300 - margin.top - margin.bottom;

    var x = d3.scale.ordinal()
      .rangeRoundBands([0, width], 0.1);
   
    var y = d3.scale.linear()
      .range([height, 0]);

    var xAxis = d3.svg.axis()
      .scale(x)
      .orient("bottom");

    var yAxis = d3.svg.axis()
        .scale(y)
        .orient("left");

    var tip = d3.tip()
      .attr('class', 'd3-tip')
      .offset([-10, 0])
      .html(function(d) {
        if (d.y_unit === undefined) {
        d.y_unit = 'n/a';
      }
        return "<span>" + "measurement: " + "</span><span style='color:red'>" + d.y + " " + d.y_unit + "</span>" +
               "</br><span>" + "time: " + "</span><span style='color:red'>" + d.x + " " + d.x_unit + "</span>" ;
      });

    var svg = d3.select(selector).append("svg")
      .attr("width", width + margin.left + margin.right)
      .attr("height", height + margin.top + margin.bottom)
    .append("g")
      .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

    svg.call(tip);

    var ymin = d3.min(linedata[i], function(d) { return d.y; });

    if (ymin >= 0) {
      ymin = 0;
    }

    var xTicks = linedata[i].map(function(d) {
      return d.x;
    });

    if (xTicks.length > 10) {
      var show = "x axis2"
    } else {
      show = 'x axis'
    }

    x.domain(xTicks);
    y.domain([ymin, d3.max(linedata[i], function(d) { return d.y; })]);

    if (graphSet.labels.length === 0) {
      var x_label = 'n/a';
    } else {
      x_label = graphSet.labels[i] + ", entry " + i;
    }

    svg.append("g")
        .attr("class", show)
        .attr("transform", "translate(0," + height + ")")
        .call(xAxis);
        svg.append("text")
        .attr("x", width / 2 )
        .attr("y",  height + 40)
        .style("text-anchor", "middle")
        .text(x_label);

    svg.append("g")
        .attr("class", "y axis")
        .call(yAxis)
      .append("text")
        .attr("transform", "rotate(-90)")
        .attr("y", -5)
        .attr("x", -60)
        .attr("dy", "-3em")
        .style("text-anchor", "middle ")
        .text(graphSet.y_unit);

    svg.selectAll(".bar")
        .data(linedata[i])
      .enter().append("rect")
        .attr("class", "bar")
        .attr("x", function(d) { return x(d.x); })
        .attr("width", x.rangeBand())
        .attr("y", function(d) { return y(d.y); })
        .attr("height", function(d) {return height - y(d.y);})
        .on('mouseover', tip.show)
        .on('mouseout', tip.hide);
  }
}
