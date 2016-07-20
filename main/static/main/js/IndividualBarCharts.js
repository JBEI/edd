
/**
* this function takes in input min y value, max y value, and the transformed data. Outputs the graph 
**/
function createSideBySide(graphSet, selector) {
  
  var linedata = graphSet.individualData;
  
  //iterate through each assay
  for (var i = 0; i < linedata.length; i++) {

    var width = 300, height = 300;
    var margin = {top: 30, right: 100, bottom: 150, left: 60}, width = width - margin.left - margin.right, height = height - margin.top - margin.bottom;

    var x = d3.scale.ordinal()
      .rangeRoundBands([0, width], .1);
   
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
        if (d.y_unit == undefined) {
        d.y_unit = 'n/a'
      }
        return "<strong>" + d.y + " " + d.y_unit + "</strong>";
      });

    var svg = d3.select(selector).append("svg")
      .attr("width", width + margin.left + margin.right)
      .attr("height", height + margin.top + margin.bottom)
    .append("g")
      .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

    svg.call(tip);

    var ymin = d3.min(linedata[i], function(d) { return d.y; })

    if (ymin >= 0) {
      ymin = 0
    }
    x.domain(linedata[i].map(function(d) { return d.x; }));
    y.domain([ymin, d3.max(linedata[i], function(d) { return d.y; })]);

    if (graphSet.labels.length == 0) {
      var x_label = 'n/a'
    } else {
      x_label = graphSet.labels[i] + ", entry " + i;
    }
    svg.append("g")
        .attr("class", "x axis")
        .attr("transform", "translate(0," + height + ")")
        .call(xAxis)
        svg.append("text")
        .attr("x", width / 2 )
        .attr("y",  height + 40)
        .style("text-anchor", "middle")
        .text(graphSet.labels[i]);

    svg.append("g")
        .attr("class", "y axis")
        .call(yAxis)
      .append("text")
        .attr("transform", "rotate(-90)")
        .attr("y", 6)
        .attr("dy", ".71em")
        .style("text-anchor", "end")
        .text(graphSet.y_unit);

    svg.selectAll(".bar")
        .data(linedata[i])
      .enter().append("rect")
        .attr("class", "bar")
        .attr("x", function(d) { return x(d.x); })
        .attr("width", x.rangeBand())
        .attr("y", function(d) { return y(d.y); })
        .attr("height", function(d) {return height - y(d.y)})
        .on('mouseover', tip.show)
        .on('mouseout', tip.hide);
    
  }
}
