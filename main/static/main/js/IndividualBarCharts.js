
/**
* this function takes in input min y value, max y value, and the transformed data. Outputs the graph 
**/
function createSideBySide(linedata, labels) {

  //iterate through each assay
  for (var i = 0; i < linedata.length; i++) {

    var width = 300, height = 300;
    var margin = {top: 30, right: 100, bottom: 150, left: 60}, width = width - margin.left - margin.right, height = height - margin.top - margin.bottom;


    var color = d3.scale.ordinal()
      .range(["#98abc5", "#8a89a6", "#7b6888", "#6b486b", "#a05d56", "#d0743c", "#ff8c00"]);


    var x = d3.scale.ordinal()
      .rangeRoundBands([0, width], .1);
   
    var y = d3.scale.linear()
      .range([height, 0]);

    var xAxis = d3.svg.axis()
      .scale(x)
      .orient("bottom"); 

    var yAxis = d3.svg.axis()
        .scale(y)
        .orient("left")

    var tip = d3.tip()
      .attr('class', 'd3-tip')
      .offset([-10, 0])
      .html(function(d) {
        return "<strong>y value</strong> <span style='color:red'>" + d.y + " " + d.y_unit + "</span>";
      })

    var svg = d3.select("#single").append("svg")
      .attr("width", width + margin.left + margin.right)
      .attr("height", height + margin.top + margin.bottom)
    .append("g")
      .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

    svg.call(tip);

      x.domain(linedata[i].map(function(d) { return d.x; }));
      y.domain([0, d3.max(linedata[i], function(d) { return d.y; })]);

    svg.append("g")
        .attr("class", "x axis")
        .attr("transform", "translate(0," + height + ")")
        .call(xAxis)
        svg.append("text")      // text label for the x axis
        .attr("x", width / 2 )
        .attr("y",  height + 40)
        .style("text-anchor", "middle")
        .text(labels[i] + ", entry " + i);

    svg.append("g")
        .attr("class", "y axis")
        .call(yAxis)
      .append("text")
        .attr("transform", "rotate(-90)")
        .attr("y", 6)
        .attr("dy", ".71em")
        .style("text-anchor", "end")
        .text("Frequenc");

    svg.selectAll(".bar")
        .data(linedata[i])
      .enter().append("rect")
        .attr("class", "bar")
        .attr("x", function(d) { return x(d.x); })
        .attr("width", x.rangeBand())
        .attr("y", function(d) { return y(d.y); })
        .attr("height", function(d) {return height - y(d.y)})
        .on('mouseover', tip.show)
        .on('mouseout', tip.hide)
    
  }

}

