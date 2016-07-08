
var GroupedByLineName;

GroupedByLineName = {

    /**
     * this function takes in input min y value, max y value, and the sorted json object.
     *  outputs a grouped bar graph with values grouped by assay name
     **/
    createAssayGraph: function (graphSet, selector) {

        var assayMeasurements = graphSet.assayMeasurements;

        var margin = {top: 20, right: 40, bottom: 100, left: 40},
            width = 1000 - margin.left - margin.right,
            height = 270 - margin.top - margin.bottom;

        var color = d3.scale.category10();
        //x axis scale for assay's protein name
        var x_name = d3.scale.ordinal()
            .rangeRoundBands([0, width], .1);
        //x axis scale for x values
        var x_xValue = d3.scale.ordinal();
        //x axis scale for line id to differentiate multiple lines associated with the same protein
        var lineID = d3.scale.ordinal();

        // y axis range scale
        var y = d3.scale.linear()
            .range([height, 0]);

        //x axis scale for protein names
        var protein_axis = d3.svg.axis()
            .scale(x_name)
            .orient("bottom");

        var xValue_axis = d3.svg.axis()
            .scale(x_xValue)
            .orient("bottom");

        var lineID_axis = d3.svg.axis()
            .scale(x_xValue)
            .orient("bottom");

        var yAxis = d3.svg.axis()
            .scale(y)
            .orient("left")
            .tickFormat(d3.format(".2s"));

        var svg = d3.select(selector)
            .append("svg")
            .attr("preserveAspectRatio", "xMinYMin meet")
            .attr("viewBox", "-30 -40 1100 280")
            .classed("svg-content", true);

        var div = d3.select("body").append("div")
            .attr("class", "tooltip")
            .style("opacity", 0);

        //nest data by name. nest again by x label
        var nested = d3.nest()
            .key(function (d) {
                return d.name;
            })
            .key(function (d) {
                return d.x
            })
            .entries(assayMeasurements);

        data = GroupedByLineName.getXYValues(nested);

        var proteinNames = data.map(function (d) {
            return d.key;
        });

        var data2 = data.map(function (d) {
            return (d.values)
        });

        var names = _.map(proteinNames, function (d, i) {
            return i;
        });

        var yvalueIds = data[0].values[0].values.map(function (d) {
            return d.key
        });

        // returns x values
        var xValueLabels = data2[0].map(function (d) {
            return (d.key)
        });


        x_name.domain(names);
        x_xValue.domain(xValueLabels).rangeRoundBands([0, x_name.rangeBand()]);
        lineID.domain(yvalueIds).rangeRoundBands([0, x_xValue.rangeBand()]);
        y.domain([0, d3.max(assayMeasurements, function (d) {
            return d.y
        })]);

        svg.append("g")
            .attr("class", "x axis")
            .attr("transform", "translate(0," + height + ")")
            .call(protein_axis)
            .append('text')
            .attr("y", 20)
            .attr("x", width)
            .text(graphSet.x_unit);

        svg.append("g")
            .attr("class", "y axis")
            .call(yAxis)
            .append("text")
            .attr("transform", "rotate(-90)")
            .attr("y", 6)
            .attr("dy", ".71em")
            .style("text-anchor", "end")
            .text(graphSet.y_unit);

        var names_g = svg.selectAll(".group")
            .data(data)
            .enter().append("g")
            .attr("class", function (d) {
                return 'group group-' + d.key;  //returns assay names
            })
            .attr("transform", function (d) {
                return "translate(" + x_name(d.key) + ",0)";
            });

        var categories_g = names_g.selectAll(".category")
            .data(function (d) {
                return d.values;
            })
            .enter().append("g")
            .attr("class", function (d) {
                return 'category category-' + d.key;   // returns objects with key = value
            })
            .attr("transform", function (d) {
                return "translate(" + x_xValue(d.key) + ",0)";
            });

        var categories_labels = categories_g.selectAll('.category-label')
            .data(function (d) {
                return [d.key];
            })
            .enter()
            .append("text")
            .attr("class", function (d) {
                return 'category-label category-label-' + d;
            })
            .attr("x", function (d) {
                return x_xValue.rangeBand() / 2;
            })
            .attr('y', function (d) {
                return height + 25;
            })
            .attr('text-anchor', 'middle')
            .text(function (d) {
                return d;
            })
            .style("font-size", 8);


        var values_g = categories_g.selectAll(".value")
            .data(function (d) {
                return d.values;
            })
            .enter().append("g")
            .attr("class", function (d) {
                return 'value value-' + d.i;
            })
            .attr("transform", function (d) {
                return "translate(" + lineID(d.key) + ",0)";
            });

        var values_labels = values_g.selectAll('.value-label')
            .data(function (d) {
                return [d.key];
            })
            .enter().append("text")
            .attr("class", function (d) {
                return 'value-label value-label-' + d;
            })
            .attr("x", function (d) {
                return lineID.rangeBand() / 2;
            })
            .attr('y', function (d) {
                return height + 10;
            })
            .attr('text-anchor', 'middle');

        var rects = values_g.selectAll('.rect')
            .data(function (d) {
                return [d];
            })
            .enter().append("rect")
            .attr("class", "rect")
            .attr("width", lineID.rangeBand())
            .attr("y", function (d) {
                return y(d.y);
            })
            .attr("height", function (d) {
                return height - y(d.y);
            })
            .style("fill", function (d) {
                return color(d.key)
            })
            .style("opacity", 0.3);

        var hover = categories_g.selectAll('.rect')
            .data(function (d) {
                return d.values
            })
            .on("mouseover", function (d) {
                div.transition()
                    .style("opacity", .9);
                div.html(d.y + "<br/>" + d.y_unit)
                    .style("left", (d3.event.pageX) + "px")
                    .style("top", (d3.event.pageY - 28) + "px");
            })
            .on("mouseout", function (d) {
                div.transition()
                    .style("opacity", 0);
            });
    },

    /**
     * this function takes in input a protein's line values and inserts a y id key for
     * each x, y object.
     **/
    addYIdentifier: function (data3) {
        return _.map(data3, function (d, i) {
            d.key = 'y' + i;
        })
    },

    /**
     *  function takes in nested assayMeasurements and inserts a y id key for each value object
     *  returns data
     */
    getXYValues: function (nested) {
        return _.forEach(nested, function (nameValues) {
            _.map(nameValues, function (xValue) {
                GroupedByLineName.addYIdentifier(xValue.values)
            })
        });
    }
}
