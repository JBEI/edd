import * as d3 from "d3"
import * as _ from "underscore"

export class EDDGraphingTools {

    nextColor: string;
    labels: any;
    colors: any;
    remakeGraphCalls: number;

    constructor() {

            this.nextColor = null;
            this.labels = [];
            this.remakeGraphCalls = 0;

            this.colors = {
                0: '#0E6FA4',   //dark teal
                1: '#51BFD8',   //teal
                2: '#2a2056',   //navy
                3: '#FCA456',   //light orange
                4: '#2b7b3d',   //green
                5: '#97d37d',   //light pastel green
                6: '#CF5030',   //orange red
                7: '#FFB6C1',   //light pink
                8: '#6f2f8c',   //royal purple
                9: '#b97dd3',   //light purple
                10: '#7e0404',  //burgandy red
                11: '#765667',  //grey pink
                12: '#F279BA',  //pink
                13: '#993f6c',  //maroon
                14: '#919191',  //dark grey
                15: '#BFBFBD',  //grey
                16: '#ecda3a',  //yellow
                17: '#b2b200',  //mustard yellow
                18: '#006E7E',  //grey blue
                19: '#b2f2fb',  //light blue
                20: '#0715CD',  //royal blue
                21: '#e8c2f3',  //light lavender
                22: '#7a5230'   //brown
            }
    }



    /**
     *  This function takes an array of arrays of arrays and flattens it into one array of arrays.
    **/
    concatAssays(assays): any {
        return [].concat.apply([], assays);
    };

    /**
     *  This function takes a unit id and unit type json and returns the unit name
    **/
    unitName(unitId, unitTypes):string {
        return unitTypes[unitId].name;
    }


    /**
     *  This function takes a measurement id and measurement type json and returns the
     *  measurement name
    **/
    measurementName(measurementId, measurementTypes):string {
      return measurementTypes[measurementId].name;
    }


    /**
     *  This function takes a selector element and returns an svg element
    **/
    createSvg(selector):any {
      var svg = d3.select(selector).append("svg")
        .attr("preserveAspectRatio", "xMinYMin meet")
        .attr("viewBox", "-55 -30 960 300")
        .classed("svg-content", true);

      return svg;
    }


    /**
     *  This function takes in EDDdata, a singleAssay line entry, and measurement names and
     *  transforms it into the following schema:
     *    [{label: "dt9304, x: 1, y: 2.5, x_unit: "n/a", y_unit: "cmol",  name: "i'm a protein
     *    name"},
     *    {label: "dt3903, x: 1, y: 23.5, x_unit: "n/a", y_unit: "cmol",  name: "i'm another protein
     *    name"}
     *    ...
     *    ]
    **/
    transformSingleLineItem(dataObj):any[] {
        // unit types
        var unitTypes = dataObj['data'].UnitTypes;
        // measurement types
        var measurementTypes = dataObj['data'].MeasurementTypes;
        // array of x and y values for sorting
        var xAndYValues = [];
        //data for one line entry
        var singleDataValues = dataObj['measure'].values;

        _.each(singleDataValues, (dataValue, index) => {
             let dataset = {};
            //can also change to omit data point with null which was done before..
            if (dataValue[0].length == 0) {
                dataValue[0] = ["0"];
            } else if (dataValue[1].length == 0) {
                dataValue[1] = ["0"];
            }
            dataset['label'] = 'dt' + dataObj['measure'].assay;
            dataset['x'] = parseFloat(dataValue[0].join());
            dataset['y'] = parseFloat(dataValue[1].join());
            dataset['x_unit'] = this.unitName(dataObj['measure'].x_units, unitTypes);
            dataset['y_unit'] = this.unitName(dataObj['measure'].y_units, unitTypes);
            dataset['name'] = dataObj['name'];
            dataset['color'] = dataObj['color'];
            dataset['nameid'] = dataObj['names'] + index;
            dataset['lineName'] = dataObj['lineName'];
            dataset['measurement'] = this.measurementName(dataObj['measure'].type, measurementTypes);
            dataset['fullName'] = dataObj['lineName'] + ' ' + dataset['measurement'];

            xAndYValues.push(dataset);
        });
        xAndYValues.sort(function(a, b) {
              return a.x - b.x;
            });
        return xAndYValues;
    }


    /**
     * this function is the same as above but more simple as it is for the import section.
     **/
    transformNewLineItem(data, singleData):any [] {

        // array of x and y values for sorting
        var xAndYValues = [];
        //data for one line entry
        var singleDataValues = singleData.data;
        var fullName = singleData.label;

        _.each(singleDataValues, function(dataValue) {
             var dataset = {};
            //can also change to omit data point with null which was done before..
            if (dataValue[0] == null) {
                dataValue[0] = ["0"];
            } else if (dataValue[1] == null) {
                dataValue[1] = ["0"];
            }
            dataset['newLine'] = true;
            dataset['x'] = dataValue[0];
            dataset['y'] = parseFloat(dataValue[1]);
            dataset['name'] = singleData.name;
            dataset['fullName'] = fullName;
            xAndYValues.push(dataset);
        });
        xAndYValues.sort(function(a, b) {
              return a.x - b.x;
            });
        return xAndYValues;
    }


    /**
     * this function takes in a single line name and study's lines and returns an object of
     * color values with lid keys
     * loosely based on d3 category20 in following link:
     * http://bl.ocks.org/aaizemberg/78bd3dade9593896a59d
    **/
    renderColor(lines):any {

        //new color object with assay ids and color hex
        var lineColors = {};
        //how many lines
        var lineCount = _.range(Object.keys(lines).length);
        //values of line obj
        var lineValues = _.values(lines);
        //new object with numbers for ids
        var indexLines:any = {};
        // color obj values
        var colorKeys = _.values(this.colors);
        //create index obj with numbers for ids and assay ids as values
        for (var i = 0; i < lineCount.length; i++ ) {
            indexLines[i] = lineValues[i].id;
        }
        //if there are more than 22 lines, create a bigger color obj
        if (lineValues.length > colorKeys.length) {
            var multiplier = Math.ceil(lineValues.length/ colorKeys.length) * 22;
            this.colorMaker(this.colors, colorKeys, multiplier)
        }
        //combine assay ids as keys with hex colors as values
        _.each(indexLines, (value, key) => {
            lineColors[indexLines[key]] = this.colors[key];
        });
        for (var key in lines) { lines[key]['color'] = lineColors[key]}
        return lineColors
    }


    /**
     * this function takes in the selected color and returns the color that comes after.
    **/
    colorQueue(selectedColor):void {
        var reverseColors = this.reverseMap(this.colors);
        var selectedKey = reverseColors[selectedColor];
        if (parseInt(selectedKey) === 21) {
             selectedKey = -1;
         }
        this.nextColor = this.colors[parseInt(selectedKey) + 1];
    }


    /**
     * this function takes in an object and value and returns a new object with keys as values
     * and values as keys.
    **/
    reverseMap (obj):any {
        var reverseMap = {};
        for (var key in obj) {
            if (obj.hasOwnProperty(key)) {
                reverseMap[obj[key]] = key;
            }
        }
        return reverseMap;
    }


    /**
     * this function takes in the color object, colorKeys array, and multiplier to determine how
     * many new colors we need and return and bigger Color object
    **/
    colorMaker(colors, colorKeys, multiplier) {
        var i = 23;
        var j = 0;
        while (i < multiplier) {
            colors[i] = colorKeys[j];
            if (j === 21) {
                j = -1;
            }
            j++;
            i++;
        }
        return colors
    }


    /**
     * This function returns object size
    **/
    objectSize(object):{} {
        var size = 0, key;
        for (key in object) {
            if (object.hasOwnProperty(key)) size++;
        }
        return size;
    }


    /**
     *  This function takes in the unit type for each array and returns the text to display on
     *  the axis
    **/
    createXAxis(graphSet, x, svg, type):void {

        if (type === 'x') {
            type = "Time"
        } else if (type === 'measurement') {
            type = "Measurement"
        } else if (type === "name") {
            type = "Line"
        } else {
            type = 'Hours'
        }

        var xAxis = graphSet.x_axis(x);

        if (graphSet.x_unit == undefined) {
            graphSet.x_unit = 'n/a'
        }

        svg.append("g")
            .attr("class", "x axis")
            .style("font-size","12px")
            .attr("transform", "translate(0," + graphSet.height + ")")
            .call(xAxis)
          .append('text')
            .attr("y", 40)
            .attr("x", graphSet.width/2)
            .style("text-anchor", "middle")
            .text(type);
        //Draw the x Grid lines
        svg.append("g")
            .attr("class", "grid")
            .attr("transform", "translate(0," + graphSet.height + ")")
            .call(xAxis.tickSize(-graphSet.height).tickFormat(""));
    }


    /**
     *  This function creates the left y axis svg object
    **/
    createLeftYAxis(graphSet, label, y, svg):void {

        var yAxis = d3.axisLeft(y).ticks(5).tickFormat(d3.format(".2s"));

        if (label === 'undefined') {
            label = 'n/a'
        }

        svg
          .append("g")
            .attr("class", "y axis")
            .style("font-size","12px")
            .call(yAxis)
          .append("text")
            .attr('class', 'axis-text')
            .attr("transform", "rotate(-90)")
            .attr("y", -55)
            .attr("x", 0 - (graphSet.height/2))
            .attr("dy", "1em")
            .style("text-anchor", "middle")
            .text(label);

        // Draw the y Grid lines
        let gridLines = d3.axisLeft(y)
            .ticks(5)
            .tickSize(-graphSet.width)
            .tickFormat(d3.format(""));
        let axes = svg.append("g")
            .attr("class", "grid")
          .call(gridLines);
        // the empty tickFormat does not seem to apply; remove the extra labels here
        axes.selectAll("text").remove();
    }


    /**
     *  This function creates the right y axis svg object
    **/
    createRightYAxis(label, y, svg, spacing):void {

        var yAxis = d3.axisRight(y).ticks(5).tickFormat(d3.format(".2s"));

        svg.append("g")
            .attr("class", "y axis")
            .attr("transform", "translate(" + spacing + " ,0)")
            .style("font-size","12px")
            .style("fill", "black")
            .call(yAxis)
          .append('text')
            .attr("transform", "rotate(-90)")
            .attr('class', 'text')
            .attr('x', -110)
            .attr("dy", ".32em")
            .attr('y', 43)
            .style('text-anchor', 'middle')
            .text(label)
    }


    /**
     *  This function creates the y axis tick marks for grid
    **/
    make_right_y_axis(y):any {
        return d3.axisRight(y);
    }


    /**
     *  This function creates the x axis tick marks for grid
    **/
    make_x_axis(x):any {
        return d3.axisBottom(x);
    }



    /**
     *  function takes in nested data by unit type and returns how many units are in data
     */
    howManyUnits(data):number {
        if (data === {}) {
            return 1
        }
         var y_units =  d3.nest()
            .key(function (d:any) {
                return d.y_unit;
            })
            .entries(data);
        return y_units.length;
    }


    /**
     *  function takes in rect attributes and creates rect hover svg object
     */
    rectHover(x,y,rect, color, div):any {

        var squareSize = 5;

        rect
            .enter()
            .append('svg:rect')
            .attr('x', function (d) {
                return x(d.x) - squareSize/2;
            })
            .attr('y', function (d) {
                return y(d.y) - squareSize/2;
            })
            .attr('width', squareSize)
            .attr('height', squareSize)
            .style("fill", color)
            .on("mouseover", (d) => {
                this.lineOnHover(div, d)
            })
            .on("mouseout", () => {
                this.lineOnMouseOut(div)
            });
    }


    /**
     *  function takes in circle attributes and creates circle hover svg object
     */
    circleHover(x, y, circles, color, div):void {
        circles
            .enter()
            .append('svg:circle')
            .attr('class', 'dot')
            .attr('fill', 'grey')
            .attr('cx', function (d) {
                return x(d.x);
            })
            .attr('cy', function (d) {
                return y(d.y);
            })
            .attr('r', function () {
                return 3;
            })
            .style("fill", color)
            .on("mouseover", (d) => {
                this.lineOnHover(div, d)
            })
            .on("mouseout", () => {
                this.lineOnMouseOut(div)
            });
    }


    /**
     *  function takes in square attributes and creates a plus hover svg object
     */
    plusHover(x, y, plus, color, div):void {
        var squareSize = 5;
        plus
            .enter()
            .append('svg:rect')
            .attr('x', function (d) {
                return x(d.x) - squareSize/2;
            })
            .attr('y', function (d) {
                return y(d.y);
            })
            .attr('width', squareSize + 3)
            .attr('height', squareSize - 3)
            .style("fill", color);

        plus
            .enter()
            .append('svg:rect')
            .attr('x', function (d) {
                return x(d.x);
            })
            .attr('y', function (d) {
                return y(d.y) - squareSize/2;
            })
            .attr('width', squareSize - 3)
            .attr('height', squareSize + 3)
            .style("fill", color)
            .on("mouseover", (d) => {
                this.lineOnHover(div, d)
            })
            .on("mouseout", () => {
                this.lineOnMouseOut(div)
            });
    }


    /**
     *  function takes in triangle attributes and creates a triangle hover svg object
     */
    triangleHover(x, y, triangle, color, div):any {
        triangle
            .enter()
            .append('svg:polygon')
            .attr('points', (d) => {
                return [[x(d.x), y(d.y) - 4], [x(d.x) + 4, y(d.y) + 4], [x(d.x) - 4, y(d.y) + 4]];
            })
            .style("fill", color)
            .on("mouseover", (d) => {
                this.lineOnHover(div, d)
            })
            .on("mouseout", () => {
                this.lineOnMouseOut(div)
            });
    }


    /**
     *  function takes in path attributes and creates an svg path
     */
    createLine(svg, data, line, color):any {
        return svg.append('path')
            .attr('d', line(data))
            .attr('stroke', color)
            .attr('stroke-width', 2)
            .attr("class", 'lineClass')
            .attr('fill', 'none')
            .on('mouseover', (d) => {
                d3.selectAll('.lineClass').style('opacity', 0.1);
                $(event.target).css('opacity', 1);
                d3.selectAll('circle').style('opacity', 0.1);
                d3.selectAll('rect').style('opacity', 0.1);
                d3.selectAll('polygon').style('opacity', 0.1);
                $(event.target).next().children().css('opacity', 1);
                $('.icon').css('opacity', 1);
            })
            .on('mouseout', () => {
                d3.selectAll('.lineClass').style('opacity', 1).style('stroke-width', 2);
                d3.selectAll('circle').style('opacity', 1);
                d3.selectAll('rect').style('opacity', 1);
                d3.selectAll('polygon').style('opacity', 1)
            })
    }


    /**
     *  function takes in the svg shape type, div and returns the tooltip and hover elements for each
     *  shape
     */
    lineOnHover(div, d):void {
        var hoverSvg = event.target;
        div.transition()
            .duration(200)
            .style("opacity", 0.9);
        if (d.y_unit === undefined) {
            var unit = 'n/a';
        } else {
            unit = d.y_unit;
        }

        d3.selectAll('.lineClass').style('opacity', 0.1);
        $(hoverSvg).parent().prev().css('opacity', 1).css('stroke-width', 3) ;

        //reduce opacity for all shapes besides shapes on the same line as hovered svg shape
        d3.selectAll('rect').style('opacity', 0.1);
        d3.selectAll('circle').style('opacity', 0.1);
        d3.selectAll('polygon').style('opacity', 0.1);
        $('.icon').css('opacity', 1);
        $(hoverSvg).siblings().css('opacity', 1);
        $(hoverSvg).css('opacity', 1);
        //tool tip
        if (d.newLine) {
           div.html('<strong>' + d.name + '</strong>' + ": "
                + '</br>' + d.y + " units" + "</br> " + " @ " + d.x + " hours")
            .style("left", ((<any>d3.event).pageX) + "px")
            .style("top", ((<any>d3.event).pageY - 30) + "px");
        } else {
            div.html('<strong>' + d.name + '</strong>' + ": "
                    + "</br>" + d.measurement + '</br>' + d.y + " " + unit + "</br> " + " @ " + d.x + " hours")
                .style("left", ((<any>d3.event).pageX) + "px")
                .style("top", ((<any>d3.event).pageY - 30) + "px");
        }
    }


    /**
     *  function returns the mouseout tooltip options
     */
    lineOnMouseOut(div):void {
        div.transition()
            .duration(300)
            .style("opacity", 0);
        d3.selectAll('.lineClass').style('opacity', 1).style('stroke-width', 2);
        d3.selectAll('circle').style('opacity', 1);
        d3.selectAll('rect').style('opacity', 1);
        d3.selectAll('polygon').style('opacity', 1)
    }

    /**
    * this function creates the line graph
    **/
    createMultiLineGraph(graphSet, svg):void {

        var assayMeasurements = graphSet.assayMeasurements,
            numUnits = this.howManyUnits(assayMeasurements),
            yRange = [],
            unitMeasurementData = [],
            yMin = [];

        //get x values
        var xDomain = assayMeasurements.map((assayMeasurement) => { return assayMeasurement.x; });

        //sort x values
        xDomain.sort((a, b) => {
            return a - b;
        });

        //tool tip svg
        var div = d3.select("body").append("div")
            .attr("class", "tooltip2")
            .style("opacity", 0);

        //y and x axis ranges
        var y = d3.scaleLinear().rangeRound([graphSet.height, 0]);
        var x = d3.scaleLinear().domain([xDomain[0] - 1, xDomain[xDomain.length -1]]).range([0, graphSet.width]);

        //nest data based off y_unit. ie g/l, cmol, n/a
        var meas = d3.nest()
            .key((d:any) => {
                return d.y_unit;
            })
            .entries(assayMeasurements);

        //iterate through the different unit groups getting min y value, data, and range.
        for (var i = 0; i < numUnits; i++) {
            yRange.push(d3.scaleLinear().rangeRound([graphSet.height, 0]));
            unitMeasurementData.push(d3.nest()
                .key(function (d:any) {
                    return d.y;
                })
                .entries(meas[i].values));
            yMin.push(d3.min(unitMeasurementData[i], (d:any) => {
                return d3.min(d.values, (d:any) => {
                    return d.y;
                });
            }))
        }

        // create x axis svg
        graphSet.create_x_axis(graphSet, x, svg, 'hours');

        //iterate through different unit groups and add lines according to unit type and y axis.
        for (var index = 0; index<numUnits; index++) {

            if (yMin[index] > 0) {
                yMin[index] = 0
            }

            //y axis domain for specific unit group
            y.domain([yMin[index], d3.max(unitMeasurementData[index], (d:any)  => {
                return d3.max(d.values, (d:any) => {
                    return d.y;
                });
            })]);

            //nest data by line name and the nest data again based on y-unit.
            var data = d3.nest()
                .key(function (d:any) {
                    return d.fullName;
                })
                .key(function (d:any) {
                    return d.y_unit;
                })
                .entries(meas[index].values);

            //nest data by line name
            var proteinNames = d3.nest()
                .key(function (d:any) {
                    return d.name;
                })
                .entries(assayMeasurements);

            //spacing for y-axis labels
            var spacing = {
                     1: graphSet.width,
                     2: graphSet.width + 54,
                     3: graphSet.width + 105
                 };

            if (index === 0) {
                //create left y-axis label
                graphSet.create_y_axis(graphSet, meas[index].key, y, svg);
                //add circle image to y axis label
                svg.append('svg:circle')
                    .attr('class', 'icon')
                    .attr('cx', -46)
                    .attr('cy', 80)
                    .attr('r', 5);
            } else if (index === 1) {
                //create first right axis
                graphSet.create_right_y_axis(meas[index].key, y, svg, spacing[index]);
                //add triangle shape to y-axis label
                svg.append('svg:polygon')
                    .attr('class', 'icon')
                    .attr('points', [[789, 75], [796, 80], [796, 70]])
            } else if (index === 2) {
                //create second right axis
                graphSet.create_right_y_axis(meas[index].key, y, svg, spacing[index]);
                var squareSize = 8;
                //add square image to y-axis label
                svg.append('svg:rect')
                    .attr('class', 'icon')
                    .attr('x', 843)
                    .attr('y', 70)
                    .attr('width', squareSize)
                    .attr('height', squareSize);
            } else if (index === 3) {
                //create third right y-axis
                graphSet.create_right_y_axis(meas[index].key, y, svg, spacing[index]);
                //add plus image to y-axis label
                svg.append('svg:rect')
                    .attr('class', 'icon')
                    .attr('x', 894)
                    .attr('y', 73)
                    .attr('width', 8)
                    .attr('height', 2);

                svg.append('svg:rect')
                    .attr('class', 'icon')
                    .attr('x', 897)
                    .attr('y', 70)
                    .attr('width', 2)
                    .attr('height', 8);
            }
            else {
                // group rest of unit types on another axis that is now shown
                graphSet.create_right_y_axis(meas[index].key, y, svg, graphSet.width + 1000);
            }

            _.each(data, (unitData) => {
                // lines for each name
                for (var j = 0; j < unitData.values.length; j++) {

                var individualDataSet = unitData.values[j].values[0],
                    color;
                // create line svg

                var lineGen = d3.line()
                    .x(function (d:any) {
                        return x(d.x);
                    })
                    .y(function (d:any) {
                        return y(d.y);
                    });

                if (individualDataSet.newLine) {
                   color = graphSet.color(individualDataSet.fullName);
                } else {
                    // color of line according to name
                    color = unitData.values[j].values[0].color;
                }

                if (index === 0) {
                    this.createLine(svg, unitData.values[j].values, lineGen, color);
                    //svg object for data points
                    var dataCirclesGroup = svg.append('svg:g');
                    // data point circles
                    var circles = dataCirclesGroup.selectAll('.data-point' + index)
                        .data(unitData.values[j].values);
                    //circle hover svg
                    this.circleHover(x, y, circles, color, div)
                } else if (index === 1) {
                    this.createLine(svg, unitData.values[j].values, lineGen, color);
                    //svg object for data points
                    var dataRectGroup = svg.append('svg:g');
                    // data point circles
                    var triangle = dataRectGroup.selectAll('.data-point' + index)
                        .data(unitData.values[j].values);
                    this.triangleHover(x, y, triangle, color, div);
                }  else if (index === 2) {
                   this.createLine(svg, unitData.values[j].values, lineGen, color);
                    //svg object for data points
                    var dataRectGroup = svg.append('svg:g');
                    // data point circles
                    var rect = dataRectGroup.selectAll('.data-point' + index)
                        .data(unitData.values[j].values);
                    this.rectHover(x, y, rect, color, div);
                } else if (index === 3) {
                   this.createLine(svg, unitData.values[j].values, lineGen, color);
                    //svg object for data points
                    var dataRectGroup = svg.append('svg:g');
                    // data point circles
                    var plus = dataRectGroup.selectAll('.data-point' + index)
                        .data(unitData.values[j].values);
                    this.plusHover(x, y, plus, color, div);
                } else {
                    this.createLine(svg, unitData.key.split(' ').join('_'), lineGen, color);
                    //svg object for data points
                    var dataCirclesGroup = svg.append('svg:g');
                    // data point circles
                    var circles = dataCirclesGroup.selectAll('.data-point' + index)
                        .data(unitData.values[j].values);
                    //circle hover svg
                    this.circleHover(x, y, circles, color, div)
                }
            }
          });
        }
        $('#graphLoading').addClass('off');
    }


    /**
     * this function takes in input a protein's line values and inserts a y id key for
     * each x, y object.
     **/
     addYIdentifier(data):any {
        return _.each(data, (d:any, i) => {
            d.key = 'y' + i;
        });
    }


    /**
     *  function takes in nested assayMeasurements and inserts a y id key for each value object
     *  returns data
     */
    getXYValues(nested):any {
        return _.each(nested, (nameValues:any) => {
            return _.each(nameValues.values, (xValue:any) => {
                this.addYIdentifier(xValue.values);
            });
        });
    }


    /**
     *  function takes in nested keys and returns total length of keys
     */
    getSum(labels):number {
        var totalLength = 0;

       _.each(labels, (label:any) => {
            totalLength += label.length
        });
        return totalLength;
    }

    /**
     * This function takes in data nested by type (ie 'x') and returns and obj with time points as keys and
     * how many values correspond to this key as values
     * @param values
     * @returns ie {6: 6, 7: 6, 8: 6}
     */
    findAllTime(values):{} {
        var times = {};
        _.each(values, (value:any) => {
            times[value.key] = value.values.length;
        });
        return times;
    }


    /**
     * this function takes in the object created by findAllTime. Takes the difference between how many values are present
     * versus the max value. Returns new obj with difference as values and time points as keys.
     * @param obj
     * @returns {*}
     */
    findMaxTimeDifference(obj) {
        var values = _.values(obj);
        var max = Math.max.apply(null, values);
        $.each(obj, (key, value) => {
            obj[key] = max - value;
        });
        return obj;
    }


    /**
     * this function takes in the entries obj with 1 nested data set based on type,
     * the difference obj created by findMaxTimeDifference, and the original data structure array. Inserts values for
     * missing values.
     * @param obj
     * @param differenceObj
     * @param assayMeasurements
     * @param type
     */
    insertFakeValues(obj, differenceObj, assayMeasurements):void {
        var count = 0;
         _.each(obj, (d:any) => {
            var howMany = differenceObj[d.key];
            while (count < howMany) {
                this.insertFakeTime(assayMeasurements, d.key, d.values[0].y_unit);
                count++;
            }
        });
    }


    insertFakeTime(array, key, y_unit):void {
        key = parseFloat(key);
        array.push({
              'color': 'white',
              'x': key,
              'y': null,
              'y_unit': y_unit,
              'name': '',
              'lineName': 'n/a'
            });
    }


    /**
     * This function takes in nested data by name then time and returns and object with line name as key, and
     * an object as value containing time points as keys and how many time points as values.
     * @param nestedByName
     * @returns {{}}
     */
    findTimeValuesForName(nestedByName):{} {
        var times = {};
        nestedByName.forEach(function(value) {
            var arr = {};
            _.each(value.values, (d:any) => {
                arr[d.key] = d.values.length;
            });
            times[value.key] = arr;
        });
        return times;
    }


    getMaxValue(time):number {
        var max = 0;
        $.each(time, (key, value) => {
            $.each(value, (key, value) => {
                if (value > max) {
                    max = value;
                }
            })
        });
        return max;
    }


    filterTimePoints(data, timePoint):any[] {
        var newData = [];
        _.each(data, (dataPoint:any) => {
            if (dataPoint.x === timePoint) {
                newData.push(dataPoint);
            }
        });
        return newData;
    }
}
