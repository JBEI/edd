/**
* this function creates the line graph 
**/
function createLineGraph(linedata, minValue, maxValue, labels, minXvalue, maxXvalue) {


  var div = d3.select("body").append("div")   
    .attr("class", "tooltip")               
    .style("opacity", 0);

  var margin = {top: 20, right: 20, bottom: 30, left: 40},
      width = 960 - margin.left - margin.right,
      height = 500 - margin.top - margin.bottom;

  var color = d3.scale.category10();

  var y = d3.scale.linear().domain([ minValue - (.1 * minValue) , maxValue + (.1 * maxValue) ]).range([height, 0]);
  var x = d3.scale.linear().domain([minXvalue - 1, maxXvalue]).range([0, width]);

  var yAxis = d3.svg.axis()
    .scale(y)
    .orient("left")
    .ticks(5);
  var xAxis = d3.svg.axis()
    .scale(x)
    .orient("bottom")
    .ticks(5);

  //create svg graph object
  var svg = d3.select("#maingraph").append("svg")
      .attr("width", width + margin.left + margin.right)
      .attr("height", height + margin.top + margin.bottom)
    .append("g")
      .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

  svg.append("g")
      .attr("class", "x axis")
      .attr("transform", "translate(0," + height + ")")
      .call(xAxis);

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
        .attr("x", width-24)// spacing
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
    console.log(linedata[i])
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
