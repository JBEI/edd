////// multi line
function createTimeGraph(linedata, minValue, maxValue, labels) {

var margin = {top: 20, right: 20, bottom: 30, left: 40},
    width = 960 - margin.left - margin.right,
    height = 500 - margin.top - margin.bottom;


  var color = d3.scale.ordinal()
    .range(["#98abc5", "#8a89a6", "#7b6888", "#6b486b", "#a05d56", "#d0743c", "#ff8c00", "grey"]);

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

    var tip = d3.tip()
      .attr('class', 'd3-tip')
      .offset([-10, 0])
      .html(function(d) {
        //console.log(parse(d))
        return "<strong>Time:</strong> <span style='color:red'>" + d.key + "</span>";
      })


//CHART 1
  var svg = d3.select("#metrics").append("svg")
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom)
  .append("g")
    .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

  svg.call(tip);

  var assays = [0, 1, 2, 3, 4, 5, 6, 7]

 var data = d3.nest()
  .key(function(d) { return d.x; })
  .entries(linedata);

  x0.domain(data.map(function(d) { return d.key; }));
  x1.domain(assays).rangeRoundBands([0, x0.rangeBand()]);
  y.domain([0, d3.max(data, function(d) { return d3.max(d.values, function(d) { return d.y; }); })]);

console.log(JSON.stringify(data))

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

  var c1 = svg.selectAll(".bar")
    .data(data)
    .enter().append('g')
    .attr("class", "bar")
    .attr("transform", function(d) { return "translate(" + x0(d.key) + ",0)"; })
    .on('mouseover', tip.show)
    .on('mouseout', tip.hide);


  c1.selectAll("rect")
    .data(function(d) {return d.values})
     .enter().append("rect")
      .attr("width", x1.rangeBand())
      .attr("x", function(d) { return x1(d.i); })
      .attr("y", function(d) { return y(d.y); })
      .attr("height", function(d) { return height - y(d.y); })
      .style("fill", function(d) { return color(d.i); })

 //legend 
 var legend = svg.selectAll(".legend")
      .data(labels.slice().reverse())
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
}  


////// multi bar

/**
* this function takes in input min y value, max y value, and the transformed data. Outputs the graph 
**/
function createAssayGraph(linedata, minValue, maxValue) {

    var margin = {top: 20, right: 20, bottom: 30, left: 40},
    width = 960 - margin.left - margin.right,
    height = 500 - margin.top - margin.bottom;


  var color = d3.scale.ordinal()
    .range(["#98abc5", "#8a89a6", "#7b6888", "#6b486b", "#a05d56", "#d0743c", "#ff8c00", "grey"]);

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
console.log(linedata)
    var tip = d3.tip()
      .attr('class', 'd3-tip')
      .offset([-10, 0])
      .html(function(d) {
        //console.log(parse(d))
        return "<strong>Assay:</strong> <span style='color:red'>" + d.key + "</span>";
      })

  var assays = [0, 1, 2, 3, 4, 5, 6, 7]
  var svg = d3.select("#bar").append("svg")
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom)
  .append("g")
    .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

  svg.call(tip);

 var data = d3.nest()
  .key(function(d) { return d.i; })
  .entries(linedata);

  x0.domain(data.map(function(d) { return d.key; }));
  x1.domain(assays).rangeRoundBands([.5, x0.rangeBand()]);
  y.domain([0, d3.max(data, function(d) { return d3.max(d.values, function(d) { return d.y; }); })]);

console.log(JSON.stringify(data))

  svg.append("g")
    .attr("class", "x axis")
    .attr("transform", "translate(0," + height + ")")
    .call(xAxis)

  svg.append("g")
      .attr("class", "y axis")
      .call(yAxis)
    .append("text")
      .attr("transform", "rotate(-90)")
      .attr("y", 6)
      .attr("dy", ".71em")
      .style("text-anchor", "end")
      .text("Frequency");

  var c1 = svg.selectAll(".bar")
    .data(data)
    .enter().append('g')
    .attr("class", "bar")
    .attr("transform", function(d) { return "translate(" + x0(d.key) + ",0)"; })
    .on('mouseover', tip.show)
    .on('mouseout', tip.hide);


  c1.selectAll("rect")
    .data(function(d) {return d.values})
     .enter().append("rect")
      .attr("width", x1.rangeBand())
      .attr("x", function(d) { return x1(d.x); })
      .attr("y", function(d) { return y(d.y); })
      .attr("height", function(d) { return height - y(d.y); })
      .style("fill", function(d) { return color(d.i); })

 //legend 
 var legend = svg.selectAll(".legend")
      .data(labels.slice().reverse())
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
}  

/**
* this function creates the line graph 
**/
function createLineGraph(linedata, minValue, maxValue, labels, minXvalue, maxXvalue) {


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
    .ticks(5);
  var xAxis = d3.svg.axis()
    .scale(x)
    .orient("bottom")
    .ticks(5);

  //create svg graph object
    var svg = d3.select("div#container")
      .append("svg")
      .attr("preserveAspectRatio", "xMinYMin meet")
      .attr("viewBox", "-100 0 1100 300")
      .classed("svg-content", true);

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
        .attr("x", width + 4)// spacing
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
