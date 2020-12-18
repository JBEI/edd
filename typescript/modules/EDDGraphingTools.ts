import * as d3 from "d3";

export interface GraphParams {
    height: number;
    width: number;
    values: GraphValue[];
}

export interface GraphValue {
    x: number;
    y: number;
    x_unit: string;
    y_unit: string;
    name: string;
    color: string;
    measurement: string;
    fullName: string;
    newLine: boolean;
}
interface ScaledValue extends GraphValue {
    scaled_y: number;
}

// creating a simple interface for result of d3.nest().entries(T[]) *without* a .rollup() call
interface Nested<T> {
    key: string;
    values: T[];
}
// creating a type for keying function for GraphValue nests
export type GroupingKey = (v: GraphValue) => string;
interface GroupingMode {
    primary: GroupingKey;
    secondary: GroupingKey;
    tertiary: GroupingKey;
}

export type Color = string;
export type XYPair = [string | number, string | number];
export type ViewingMode = "linegraph" | "bargraph" | "table";
export type BarGraphMode = "time" | "line" | "measurement";
export type GenericSelection = d3.Selection<d3.BaseType, any, HTMLElement, any>;

export interface MeasurementValueSequence {
    // may be received as string, should insert as number
    data: XYPair[];
}
export interface GraphingSet extends MeasurementValueSequence {
    label: string;
    name: string;
    units: string;
}

export class EDDGraphingTools {
    static readonly colors: Color[] = [
        "#0E6FA4", // dark teal
        "#51BFD8", // teal
        "#2A2056", // navy
        "#FCA456", // light orange
        "#2B7B3D", // green
        "#97D37D", // light pastel green
        "#CF5030", // orange red
        "#FFB6C1", // light pink
        "#6F2F8C", // royal purple
        "#B97DD3", // light purple
        "#7E0404", // burgandy red
        "#765667", // grey pink
        "#F279BA", // pink
        "#993F6C", // maroon
        "#919191", // dark grey
        "#BFBFBD", // grey
        "#ECDA3A", // yellow
        "#B2B200", // mustard yellow
        "#006E7E", // grey blue
        "#B2F2FB", // light blue
        "#0715CD", // royal blue
        "#E8C2F3", // light lavender
        "#7A5230", // brown
    ];

    labels: JQuery[];
    remakeGraphCalls: number;
    globalInfo: EDDData;

    constructor(globalInfo: EDDData) {
        this.labels = [];
        this.remakeGraphCalls = 0;
        this.globalInfo = globalInfo;
    }

    /**
     *  This function takes a unit id and unit type json and returns the unit name
     */
    private unitName(unitId: number): string {
        return this.globalInfo.UnitTypes[unitId].name;
    }

    /**
     *  This function takes a measurement id and measurement type json and returns the
     *  measurement name
     */
    private measurementName(measurementId: number, compId?: string): string {
        const name = this.globalInfo.MeasurementTypes[measurementId].name;
        if (compId) {
            const comp = this.globalInfo.MeasurementTypeCompartments[compId];
            return [comp.code, name].join(" ").trim();
        }
        return name;
    }

    /**
     *  This function takes in EDDdata, a singleAssay line entry, and measurement names and
     *  transforms it into the following schema:
     *    [
     *      {label: "dt9304, x: 1, y: 2.5, x_unit: "n/a", y_unit: "cmol",
     *        name: "i'm a protein name"},
     *      {label: "dt3903, x: 1, y: 23.5, x_unit: "n/a", y_unit: "cmol",
     *        name: "i'm another protein name"},
     *      ...
     *    ]
     */
    transformSingleLineItem(item: MeasurementRecord, color: Color): GraphValue[] {
        // array of x and y values for sorting
        const assay: AssayRecord = this.globalInfo.Assays[item.assay];
        const line: LineRecord = this.globalInfo.Lines[assay.lid];
        const x_units: string = this.unitName(item.x_units);
        const y_units: string = this.unitName(item.y_units);
        const measurementName = this.measurementName(item.type, item.comp);
        const values = item.values.map(
            (dataValue: number[][], index): GraphValue => {
                const dataset: GraphValue = {} as GraphValue;
                // abort if dataValue is not a 2-item array for x and y
                if (dataValue.length !== 2) {
                    return;
                }
                const x = dataValue[0];
                const y = dataValue[1];
                // skip adding any invalid values
                if (
                    x.length === 0 ||
                    y.length === 0 ||
                    !isFinite(x[0]) ||
                    !isFinite(y[0])
                ) {
                    return;
                }
                dataset.x = x[0];
                dataset.y = y[0];
                dataset.x_unit = x_units;
                dataset.y_unit = y_units;
                dataset.name = line.name;
                dataset.color = color;
                dataset.measurement = measurementName;
                dataset.fullName = line.name + " " + measurementName;
                return dataset;
            },
        );
        values.sort((a, b) => a.x - b.x);
        return values;
    }

    /**
     * this function is the same as above but more simple as it is for the import section.
     */
    transformNewLineItem(singleData: GraphingSet): GraphValue[] {
        // array of x and y values for sorting
        const values = singleData.data.map(
            (value: XYPair): GraphValue => {
                const dataset: GraphValue = {} as GraphValue;
                // can also change to omit data point with null which was done before..
                if (value[0] === null) {
                    value[0] = 0;
                } else if (value[1] === null) {
                    value[1] = 0;
                }
                dataset.newLine = true;
                // if the values are numbers, parseFloat just returns as-is
                dataset.x = parseFloat(value[0] as string);
                dataset.y = parseFloat(value[1] as string);
                dataset.y_unit = singleData.units;
                dataset.name = singleData.name;
                dataset.fullName = singleData.label;
                return dataset;
            },
        );
        values.sort((a, b) => a.x - b.x);
        return values;
    }

    /**
     * Takes a listing of lines and maps each to a color value.
     * loosely based on d3 category20 in following link:
     * http://bl.ocks.org/aaizemberg/78bd3dade9593896a59d
     */
    renderColor(lines: RecordList<LineRecord>): any {
        // new color object with assay ids and color hex
        const lineColors = {};
        // values of line obj
        const lineValues: LineRecord[] = $.map(lines, (v) => v);
        lineValues.forEach((line, index) => {
            const color =
                EDDGraphingTools.colors[index % EDDGraphingTools.colors.length];
            line.color = color;
            lineColors[line.id] = color;
        });
        return lineColors;
    }

    /**
     * this function takes in the selected color and returns the color that comes after.
     */
    colorQueue(color: Color): Color {
        // normalize to uppercase for lookups
        const lookup: Color = (color || "").toUpperCase();
        // start at beginning if not in the colors array,
        // otherwise get the next value
        const index = EDDGraphingTools.colors.indexOf(lookup) + 1;
        return EDDGraphingTools.colors[index % EDDGraphingTools.colors.length];
    }
}

class Positioning {
    x_scale: d3.AxisScale<number>;
    y_scale: d3.AxisScale<number>;

    constructor(x_scale: d3.AxisScale<number>, y_scale: d3.AxisScale<number>) {
        this.x_scale = x_scale;
        this.y_scale = y_scale;
    }

    x(offset?: number): (v: GraphValue) => number {
        offset = offset || 0;
        return (v: GraphValue) => this.x_scale(v.x) + offset;
    }

    y(offset?: number): (v: GraphValue) => number {
        offset = offset || 0;
        return (v: GraphValue) => this.y_scale(v.y) + offset;
    }
}

type GraphDecorator = (
    svg: GenericSelection,
    positioning: Positioning,
) => GenericSelection;

export class GraphView {
    svg: GenericSelection;
    tooltip: GenericSelection;

    // commented old values are absolute positioning of axis icons
    private static readonly lineIcons: GraphDecorator[] = [
        // circle icon
        (plot: GenericSelection, pos: Positioning): GenericSelection => {
            return plot
                .append("svg:circle")
                .attr("class", "icon")
                .attr("cx", pos.x()) // old: -46
                .attr("cy", pos.y()) // old: 80
                .attr("r", 3);
        },
        // triangle icon
        (plot: GenericSelection, pos: Positioning): GenericSelection => {
            return plot
                .append("svg:polygon")
                .attr("class", "icon")
                .attr("points", (v: GraphValue): string =>
                    [
                        [pos.x()(v), pos.y(-4)(v)], // top: [789, 75]
                        [pos.x(4)(v), pos.y(4)(v)], // bottom-right: [796, 80]
                        [pos.x(-4)(v), pos.y(4)(v)], // bottom-left: [796, 70]
                    ].join(","),
                );
        },
        // square icon
        (plot: GenericSelection, pos: Positioning): GenericSelection => {
            const squareSize = 6;
            return plot
                .append("svg:rect")
                .attr("class", "icon")
                .attr("x", pos.x(-squareSize / 2)) // old: 843
                .attr("y", pos.y(-squareSize / 2)) // old: 70
                .attr("width", squareSize)
                .attr("height", squareSize);
        },
        // cross icon
        (plot: GenericSelection, pos: Positioning): GenericSelection => {
            const squareSize = 5;
            const narrow = squareSize * 0.4;
            const wide = squareSize * 1.6;
            const icon = plot.append("g").attr("class", "icon");
            // horizontal bar
            icon.append("svg:rect")
                .attr("x", pos.x(-wide / 2))
                .attr("y", pos.y(-narrow / 2))
                .attr("width", wide)
                .attr("height", narrow);
            // vertical bar
            icon.append("svg:rect")
                .attr("x", pos.x(-narrow / 2))
                .attr("y", pos.y(-wide / 2))
                .attr("width", narrow)
                .attr("height", wide);
            return icon;
        },
    ];
    // map BarGraphMode to a human-friendly title (TODO: i18n)
    private static readonly titleLookup: { [k: string]: string } = {
        "line": "Line",
        "time": "Hours",
        "measurement": "Measurement",
    };
    // map BarGraphMode to a GroupingKey function
    private static readonly keyingLookup: { [k: string]: GroupingKey } = {
        "line": (v) => v.name,
        "time": (v) => "" + v.x,
        "measurement": (v) => v.measurement,
    };
    // map BarGraphMode to a GroupingMode priority of groupings
    private static readonly groupingLookup: { [k: string]: GroupingMode } = {
        "line": {
            "primary": GraphView.keyingLookup.line,
            "secondary": GraphView.keyingLookup.time,
            "tertiary": GraphView.keyingLookup.measurement,
        },
        "time": {
            "primary": GraphView.keyingLookup.time,
            "secondary": GraphView.keyingLookup.line,
            "tertiary": GraphView.keyingLookup.measurement,
        },
        "measurement": {
            "primary": GraphView.keyingLookup.measurement,
            "secondary": GraphView.keyingLookup.time,
            "tertiary": GraphView.keyingLookup.line,
        },
    };

    constructor(selector: d3.BaseType) {
        this.svg = d3
            .select(selector)
            .append("svg")
            .attr("preserveAspectRatio", "xMinYMin meet")
            .attr("viewBox", "-55 -30 960 300")
            .classed("svg-content", true);
        this.tooltip = d3
            .select("body")
            .append("div")
            .attr("class", "tooltip2")
            .style("opacity", 0);
    }

    /**
     * this function creates the line graph
     */
    buildLineGraph(params: GraphParams): void {
        const values = this.sortOnX(params.values);
        const x_extent: [number, number] = d3.extent(values, (v: GraphValue) => v.x);

        // tool tip svg
        d3.select("body").append("div").attr("class", "tooltip2").style("opacity", 0);

        // x axis range
        const x_scale = d3.scaleLinear().domain(x_extent).range([0, params.width]);
        const ordinalColors = d3.scaleOrdinal(EDDGraphingTools.colors);

        // create x axis svg
        this.buildXAxis(params, x_scale, "time");

        // iterate through the different unit groups getting min y value, data, and range.
        d3.nest<GraphValue>()
            .key((v: GraphValue) => v.y_unit)
            .entries(values)
            .forEach((grouping: Nested<GraphValue>, index: number) => {
                const y_extent: [number, number] = this.yExtent(grouping);
                const y_scale = d3
                    .scaleLinear()
                    .rangeRound([params.height, 0])
                    .domain(y_extent);
                // nest values using the same units by the value fullName (line name + measurement)
                // TODO: this should nest by Measurement ID for existing data OR
                //   by Line/Assay ID + measurement label for importing data
                const curves: Nested<GraphValue>[] = d3
                    .nest<GraphValue>()
                    .key((d: GraphValue): string => d.fullName)
                    .entries(grouping.values);
                // define axes and icons for this unit grouping
                const icon = this.buildUnitAxis(params, index, y_scale, grouping.key);
                // plot lines for each assay name
                curves.forEach((unitData) => {
                    const firstPoint = unitData.values[0];
                    let color = firstPoint.color;
                    if (firstPoint.newLine) {
                        color = ordinalColors(firstPoint.fullName);
                    }
                    this.drawLine(unitData.values, x_scale, y_scale, color, icon);
                });
            });

        $("#graphLoading").addClass("off");
    }

    buildGroupedBarGraph(params: GraphParams, mode: BarGraphMode) {
        const values: GraphValue[] = this.sortOnX(params.values);
        const grouping: GroupingMode = GraphView.groupingLookup[mode];
        // define the x-axis primary scale; d3.set() keeps items in insertion order
        const primary_scale = d3
            .scaleBand()
            .domain(d3.set(values, grouping.primary).values())
            .rangeRound([0, params.width])
            .padding(0.1);
        // define the x-axis itself
        this.buildXAxis(params, primary_scale, mode);
        // function used later to set translation offsets for groupings
        const translate = (scale: d3.ScaleBand<string>) => {
            return (d: Nested<any>) => "translate(" + scale(d.key) + ")";
        };
        // set y-axis scaling on all measurements
        d3.nest<GraphValue>()
            .key((v: GraphValue) => v.y_unit)
            .entries(values)
            .forEach((nest: Nested<GraphValue>, index: number) => {
                // scale y values so maxima goes to top of graph, and minima goes to bottom
                const y_scale = d3
                    .scaleLinear()
                    .domain(this.yExtent(nest))
                    .range([params.height, 0]);
                // attach the computed scale to every value
                nest.values.forEach(
                    (v: GraphValue) => ((v as ScaledValue).scaled_y = y_scale(v.y)),
                );
                // define axes and icons for this unit grouping
                this.buildUnitAxis(params, index, y_scale, nest.key);
            });
        // nest the values again based on BarGraphMode groupings
        const subnest: Nested<Nested<ScaledValue>>[] = d3
            .nest<ScaledValue>()
            .key(grouping.primary)
            .key(grouping.secondary)
            .entries(values as ScaledValue[]); // values is converted in y_unit nest
        // define x-axis secondary scale; d3.set() keeps items in insertion order
        const secondary_scale = d3
            .scaleBand()
            .domain(d3.set(values, grouping.secondary).values())
            .range([0, primary_scale.bandwidth()]);
        const tertiary_scale = d3
            .scaleBand()
            .domain(d3.set(values, grouping.tertiary).values())
            .range([0, secondary_scale.bandwidth()]);
        // insert SVG group tags for every grouping key in the subnest
        const primary_group = this.svg
            .selectAll(".pgroup")
            .data(subnest)
            .enter()
            .append("g")
            .attr("class", "pgroup")
            .attr("transform", translate(primary_scale));
        // insert SVG group tags for time offsets for every time in the grouping key
        const secondary_group = primary_group
            .selectAll(".sgroup")
            .data((d: Nested<Nested<GraphValue>>) => d.values)
            .enter()
            .append("g")
            .attr("class", "sgroup")
            .attr("transform", translate(secondary_scale));
        // insert SVG rect tags for every value in the subnest values array
        secondary_group
            .selectAll("rect")
            .data((d: Nested<GraphValue>) => d.values)
            .enter()
            .append("rect")
            .attr("class", "rect graphValue")
            .attr("width", tertiary_scale.bandwidth())
            .attr("x", (d) => tertiary_scale(grouping.tertiary(d)))
            .attr("y", (v: ScaledValue) => v.scaled_y)
            .attr("height", (v: ScaledValue) => params.height - v.scaled_y)
            .on("mouseover", this.tooltip_over.bind(this))
            .on("mouseout", this.tooltip_out.bind(this))
            .style("fill", (v: GraphValue) => v.color)
            .style("opacity", 1);
        // switch off the loading indicator
        $("#graphLoading").addClass("off");
    }

    private yExtent(grouping: Nested<GraphValue>): [number, number] {
        const y_extent: [number, number] = d3.extent(
            grouping.values,
            (d: GraphValue): number => d.y,
        );
        // forcing bottom of y domain to 0, otherwise single-item graphs will not show
        y_extent[0] = Math.min(y_extent[0], 0);
        if (y_extent[0] < 0) {
            // if bottom of domain is negative, force top of domain to be at least 0
            y_extent[1] = Math.max(y_extent[1], 0);
        } else if (y_extent[0] === y_extent[1]) {
            // if bottom is same as top, make top 1 unit more than bottom
            y_extent[1] = y_extent[0] + 1;
        }
        return y_extent;
    }

    private sortOnX(values: GraphValue[]): GraphValue[] {
        // filter out undefined values before sorting on X
        return values.filter((v) => !!v).sort((a, b) => a.x - b.x);
    }

    private buildUnitAxis(
        params: GraphParams,
        index: number,
        y_scale: d3.AxisScale<number>,
        label: string,
    ): GraphDecorator {
        // define axes and icons for this unit grouping
        let icon: GraphDecorator = null;
        // create the y-axis, up to 4 total; further axes are not displayed
        if (index === 0) {
            // first axis goes on left
            icon = GraphView.lineIcons[index];
            this.buildLeftYAxis(params, y_scale, label, icon);
        } else if (index < 4) {
            // next three axes go on right
            const offset = params.width + 52 * (index - 1);
            icon = GraphView.lineIcons[index];
            this.buildRightYAxis(params, y_scale, label, offset, icon);
        }
        return icon;
    }

    private buildXAxis<T extends d3.AxisDomain>(
        params: GraphParams,
        scale: d3.AxisScale<T>,
        mode: BarGraphMode,
    ): d3.Axis<T> {
        // define the x-axis itself
        let x_axis: d3.Axis<T> = d3.axisBottom<T>(scale);
        const domain: T[] = scale.domain();
        const max_show = 20;
        if (domain.length === 2 && domain[0] instanceof Number) {
            // in a numeric domain, just use normal formatting
            (x_axis as d3.Axis<number>).ticks(10).tickFormat(d3.format(".2s"));
        } else if (domain.length <= max_show) {
            // non-numeric domain with 20 or fewer items, display everything
            x_axis = x_axis.tickFormat((v: T): string => this.truncateLabel(v));
        } else {
            // non-numeric domain with more than 20 items, choose at most 20 items to display
            const chosen: number[] = [];
            // select the indices to show
            for (let i = 0; i < max_show; ++i) {
                chosen[i] = Math.ceil((i * domain.length) / max_show);
            }
            // format axis so only chosen indices are displayed
            x_axis = x_axis.tickFormat((v: T, i): string => {
                return chosen.indexOf(i) !== -1 ? this.truncateLabel(v) : "";
            });
        }
        // add group containing axis elements
        const axis_group = this.svg
            .append("g")
            .attr("class", "x axis")
            .style("font-size", "12px")
            .attr("transform", "translate(0," + params.height + ")")
            .call(x_axis);
        // adding grid-lines to the plot
        this.svg
            .append("g")
            .attr("class", "grid")
            .attr("transform", "translate(0," + params.height + ")")
            .call(x_axis.tickSize(-params.height).tickFormat(() => ""));
        // slightly angle labels when there are more than 5
        if (domain.length > 5) {
            axis_group
                .selectAll("text")
                .attr("transform", "rotate(15)")
                .style("text-anchor", "start");
        }
        // add overall label to axis
        axis_group
            .append("text")
            .attr("x", params.width / 2)
            .attr("y", 40)
            .attr("fill", "#000")
            .style("text-anchor", "middle")
            .text(GraphView.titleLookup[mode]);
        return x_axis;
    }

    private truncateLabel<T>(value: T): string {
        // coerce to string
        let label: string = "" + value;
        // truncate if necessary
        if (label.length > 21) {
            label = label.substring(0, 20) + "…";
        }
        return label;
    }

    private addAxisTickFormat<T>(axis: d3.Axis<T>): d3.Axis<T> {
        // handle generic types in formatting axis ticks
        return axis.tickFormat((v: T, i): string => {
            if (v instanceof Number) {
                // special-case numbers, to use two significant figures
                // we know it's a number-type because of instanceof, double-cast informs compiler
                return d3.format(".2s")((v as any) as number);
            }
            // otherwise coerce directly to string
            return "" + v;
        });
    }

    /**
     * This function creates the left y axis svg object, and applies grid lines.
     */
    private buildLeftYAxis<T extends d3.AxisDomain>(
        params: GraphParams,
        y_scale: d3.AxisScale<T>,
        label: string,
        icon?: GraphDecorator,
    ): d3.Axis<T> {
        if (!label || label === "undefined") {
            label = "n/a";
        }
        const yAxis = d3.axisLeft(y_scale).ticks(5);
        // write the group containing axis elements
        const axisGroup = this.svg
            .append("g")
            .attr("class", "y axis")
            .style("font-size", "12px")
            .call(this.addAxisTickFormat(yAxis));
        // entire label group is rotated counter-clockwise about a top-left origin
        const axisLabel = axisGroup
            .append("g")
            .attr("transform", "rotate(-90)")
            .attr("fill", "#000");
        const text_x = -(params.height / 2);
        const text_y = -55; // TODO: compute this somehow
        // add a text label for the axis
        axisLabel
            .append("text")
            .attr("class", "axis-text")
            .attr("x", text_x)
            .attr("y", text_y)
            .attr("dy", "1em")
            .text(label);
        // add a graphical icon for the axis (optional)
        if (icon) {
            // x position = text_x + radius + padding = text_x + 5 + 3 = text_x + 8
            // y position = text_y + (font_size * 0.66) = text_y + 8
            const fakeValue: GraphValue = {
                "x": text_x + 8,
                "y": text_y + 8,
            } as GraphValue;
            // create an enter selection with a fake value at icon location
            const labelIcon = axisLabel.selectAll(".icon").data([fakeValue]).enter();
            // using absolute coordinates, identity scale
            const ident = d3.scaleIdentity();
            icon.call(this, labelIcon, new Positioning(ident, ident));
        }
        // Draw the y Grid lines in a separate group
        this.svg
            .append("g")
            .attr("class", "grid")
            .call(yAxis.tickSize(-params.width).tickFormat(() => ""));
        return yAxis;
    }

    /**
     * This function creates the right y axis svg object.
     */
    private buildRightYAxis<T extends d3.AxisDomain>(
        params: GraphParams,
        y_scale: d3.AxisScale<T>,
        label: string,
        spacing: number,
        icon?: GraphDecorator,
    ): d3.Axis<T> {
        if (!label || label === "undefined") {
            label = "n/a";
        }
        const yAxis = d3.axisRight(y_scale).ticks(5);
        // write the group containing axis elements
        const axisGroup = this.svg
            .append("g")
            .attr("class", "y axis")
            .attr("transform", "translate(" + spacing + " ,0)")
            .style("font-size", "12px")
            .call(this.addAxisTickFormat(yAxis));
        const axisLabel = axisGroup
            .append("g")
            .attr("transform", "rotate(-90)")
            .attr("fill", "#000");
        const text_x = -(params.height / 2);
        const text_y = 40; // TODO: compute this somehow
        // add a text label for the axis; flipped to right-side
        axisLabel
            .append("text")
            .attr("class", "axis-text")
            .attr("x", text_x)
            // mirroring the left-side; no dy needed
            .attr("y", text_y)
            // label flipped to opposite side, so need to anchor text to opposite end
            .style("text-anchor", "end")
            .text(label);
        // add a graphical icon for the axis (optional)
        if (icon) {
            // x position = text_x + radius + padding = text_x + 5 + 3 = text_x + 8
            // y position = text_y - (font_size * 0.33) = text_y - 4
            const fakeValue: GraphValue = {
                "x": text_x + 8,
                "y": text_y - 4,
            } as GraphValue;
            // create an enter selection with a fake value at icon location
            const labelIcon = axisLabel.selectAll(".icon").data([fakeValue]).enter();
            // using absolute coordinates, identity scale
            const ident = d3.scaleIdentity();
            icon.call(this, labelIcon, new Positioning(ident, ident));
        }
        return yAxis;
    }

    /**
     *  function takes in path attributes and creates an svg path
     */
    private drawLine(
        data: GraphValue[],
        x_scale: d3.AxisScale<number>,
        y_scale: d3.AxisScale<number>,
        color: Color,
        icon?: GraphDecorator,
    ): void {
        const lineGenerator = d3
            .line<GraphValue>()
            .x((d: GraphValue) => x_scale(d.x))
            .y((d: GraphValue) => y_scale(d.y));
        const curve = this.svg
            .append("g")
            .attr("class", "graphValue")
            .attr("stroke", color)
            .attr("fill", "none");
        curve
            .append("path")
            .attr("d", lineGenerator(data))
            .attr("stroke-width", 2)
            .attr("class", "lineClass")
            .on("mouseover", this.tooltip_over.bind(this))
            .on("mouseout", this.tooltip_out.bind(this));
        // add icon glyphs if passed in
        if (icon) {
            const pointGroup = curve
                .append("g")
                .attr("fill", color)
                .attr("class", "pointIcons")
                .selectAll(".icon")
                .data(data)
                .enter();
            icon.call(this, pointGroup, new Positioning(x_scale, y_scale))
                .on("mouseover", this.tooltip_over.bind(this))
                .on("mouseout", this.tooltip_out.bind(this));
        }
    }

    private tooltip_over(v?: GraphValue): void {
        if (v) {
            const html = [
                ["<strong>", v.name, "</strong>:"].join(""),
                "" + v.measurement,
                [v.y, v.y_unit].join(" "),
                ["@", v.x, "hours"].join(" "),
            ].join("<br/>");
            this.tooltip
                .html(html)
                .style("top", d3.event.pageY - 30 + "px")
                .style("left", d3.event.pageX + "px");
            this.tooltip.transition().style("opacity", 0.9);
        }
        this.svg.selectAll(".graphValue").style("opacity", 0.1);
        // use addBack() for bar graph, where bar is .graphValue
        $(event.target).parents(".graphValue").addBack().css("opacity", 1);
    }

    private tooltip_out(): void {
        this.svg.selectAll(".graphValue").style("opacity", 1);
        this.tooltip.transition().style("opacity", 0);
    }
}
