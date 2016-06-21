/**
* this function creates the line graph 
**/
function createLineGraph(linedata, minValue, maxValue, labels, minXvalue, maxXvalue) {

            /**
* this function creates the x axis tick marks for grid
**/
function make_x_axis() {
    return d3.svg.axis()
        .scale(x)
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


  var div = d3.select("body").append("div")   
    .attr("class", "tooltip")               
    .style("opacity", 0);

  var margin = {top: 20, right: 40, bottom: 30, left: 40},
      width = 1000 - margin.left - margin.right,
      height = 270 - margin.top - margin.bottom;

  var color = d3.scale.category10();

  var y = d3.scale.linear().domain([ minValue - (.1 * minValue) , maxValue + (.1 * maxValue) ]).range([height, 0]);
  var x = d3.scale.linear().domain([minXvalue - 1, maxXvalue]).range([0, width]);

  var yAxis = d3.svg.axis()
    .scale(y)
    .orient("left")
    .tickFormat(d3.format(".2s"));

  var xAxis = d3.svg.axis()
    .scale(x)
    .orient("bottom")
    .ticks(5);

  //create svg graph object
    var svg = d3.select("div#container")
      .append("svg")
      .attr("preserveAspectRatio", "xMinYMin meet")
      .attr("viewBox", "-30 -40 1100 280")
      .classed("svg-content", true);

  svg.append("g")
      .attr("class", "x axis")
      .attr("transform", "translate(0," + height + ")")
      .call(xAxis);


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

  var lineGen = d3.svg.line()
      .x(function(d) {
        return x(d.x);
      })
      .y(function(d) {
        return y(d.y)
      })


    //iterate through different arrays 
   for (var i = 0; i < linedata.length; i++) {
    
    //color for specific path and name
    var color1 = color(i)
    //label name coincides with same color 
    var label = labels[i]
    
    //legend
    var legendGroup = svg.append('svg:g');
    var legend = legendGroup.selectAll('.line').data(linedata[i]);
    legend
      .enter()
      .append("text")
        .attr("x", width + 30)// spacing
        .attr("y", 9 + (i * 15) )
        .attr("class", "legend")    // style the legend
        .attr("dy", ".35em")
        .style("fill", color1)
        .on("mouseover", function(d){  //console.log(d) returns last data point for clicked on color in legend 
          var self = this;
          var legends = d3.selectAll('.legend');

          // All other elements transition opacity.
          legends.filter(function (x) { return self != this; })
              .style("opacity", .1);                   
          })
        .on('mouseout', function(d) {
              d3.selectAll('.legend').style("opacity", 1); 
        })       
        .text(label);
    
    //lines
    svg.append('path')
      .attr('d', lineGen(linedata[i]))
      .attr('stroke', color1)
      .attr('stroke-width', 2)
      .attr("class", "line") 
      .attr('fill', 'none')
      .on("mouseover", function () { 
        //highlight path mouse overed 
          d3.select(this).style("stroke-width",'6px') 
          var self = this;
          var paths = d3.selectAll('.line');
          // All other elements transition opacity.
          paths.filter(function (x) { return self != this; })
              .style("opacity", .1);                   
           })
      .on("mouseout", function(d) {
         d3.select(this)                          //on mouseover of each line, give it a nice thick stroke
              .style("stroke-width", 2)  
              d3.selectAll('path').style("opacity", 1); 
      })

    //data circles 

    var dataCirclesGroup = svg.append('svg:g');
    var circles = dataCirclesGroup.selectAll('.data-point')
      .data(linedata[i]);
    circles
      .enter()
      .append('svg:circle')
      .attr('class', 'dot')
      .attr('fill', 'grey')
      .attr('cx', function(d) { return x(d["x"]); })
      .attr('cy', function(d) { return y(d["y"]); })
      .attr('r', function() { return 3; })
      .on("mouseover", function(d) {
         circleLabel = labels[d.i]
         div.transition()        
                .duration(200)      
                .style("opacity", .9);      
            div .html(circleLabel + ": (" + d.x + ", "  + d.y + ")")  
                .style("left", (d3.event.pageX) + "px")     
                .style("top", (d3.event.pageY - 30) + "px");    
      })
      .on("mouseout", function(d) {       
            div.transition()        
                .duration(500)      
                .style("opacity", 0); 
        });

   }

}  
