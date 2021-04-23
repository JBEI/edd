"use strict";

import * as d3 from "d3";

import { Access, Item } from "./Access";

const Colors = d3.schemeTableau10;
const DisplayLimitLine = 5000;

/**
 * Individual points, as output by e.g. `d3.rollup().entries()`.
 */
type XYPair = [number, number];
/**
 * Minimum and maximum extent of values from `d3.extent()`.
 */
type Extent = [number, number];
/**
 * Individual point minimum and maximum bounds, as output by combined
 * `d3.extent()` and `d3.rollup().entries()`.
 */
type XYBound = [number, [number, number]];
/**
 * Individual point to plot on graph.
 */
interface PlotValue {
    // NOTE: using [0] and [1] for X and Y makes PlotValue compatible with XYPair.
    /** X value. */
    [0]: number;
    /** Y value. */
    [1]: number;
    /** Source Item record for this record. */
    item: Item;
    /** (optional) Scaled Y value in plot coordinates. */
    height?: number;
    /** (optional) Grouping key used in first level of d3.group(). */
    key?: string;
    /** (optional) Maximum extent of Y, if more than one Y value. */
    y_max?: number;
    /** (optional) Minimum extent of Y, if more than one Y value. */
    y_min?: number;
    /** (optional) Scale used to convert Y values to plot coordinates. */
    y_scale?: d3.ScaleLinear<number, number>;
}
/**
 * Function signature to map a PlotValue to a string key.
 */
type PlotValueKey = (v: PlotValue) => string;
/**
 * Grouping to use in arranging values in a bar plot.
 */
type BarGroupingKeys = [PlotValueKey, PlotValueKey, PlotValueKey];

function attachScale(scale: d3.ScaleLinear<number, number>): (v: PlotValue) => void {
    return (v: PlotValue) => {
        v.y_scale = scale;
    };
}

/**
 * Converts an XYBound to a pair of point XYPair objects.
 */
function boundToPairs(input: XYBound): [XYPair, XYPair] {
    const [x, [y_min, y_max]] = input;
    return [
        [x, y_min],
        [x, y_max],
    ];
}

/**
 * Takes a varying number of iterables and chains them into one iterable.
 */
function chain<T>(...items: Iterable<T>[]): Iterable<T> {
    return {
        [Symbol.iterator]: function* () {
            for (const sub of items) {
                // older TS/JS only allows Array for-of
                // so must manually iterate the Iterable
                const it = sub[Symbol.iterator]();
                let item = it.next();
                while (!item.done) {
                    yield item.value;
                    item = it.next();
                }
            }
        },
    };
}

interface LimitedIterable<T> extends Iterable<T> {
    has_hit_limit: boolean;
}

/**
 * Wraps an iterable with one that terminates after count items.
 */
function limit<T>(iterable: Iterable<T>, count: number): LimitedIterable<T> {
    return {
        [Symbol.iterator]: function* () {
            const it = iterable[Symbol.iterator]();
            let c = count;
            let item = it.next();
            while (!item.done) {
                if (c-- <= 0) {
                    this.has_hit_limit = true;
                    return;
                }
                yield item.value;
                item = it.next();
            }
        },
        "has_hit_limit": false,
    };
}

/**
 * Converts Item array to array of the individual points contained within.
 */
function itemsToValues(items: Item[]): Iterable<PlotValue> {
    const values = items.map((item) => {
        try {
            const format_index = parseInt(item.measurement.format, 10);
            return FORMATS[format_index](item);
        } catch (e) {
            // on any problems, return empty PlotValue array instead
            return [];
        }
    });
    return chain(...values);
}

/**
 * Sorts an array of plot values on X value, filtering out any undefined values.
 */
function sortOnX(values: PlotValue[]): PlotValue[] {
    // filter out undefined values before sorting on X
    return values.filter((v) => v).sort((a, b) => a[0] - b[0]);
}

/**
 * Find min/max values on y-axis.
 */
function yExtent(values: PlotValue[]): Extent {
    const max = d3.max(values, Values.byValueMax);
    const min = d3.min(values, Values.byValueMin);
    // make sure that min and max are not the same by forcing an epsilon
    const span = max - min;
    if (span === 0) {
        return [min, min + 1];
    }
    return [min, max];
}

type ValueFormat = (item: Item) => PlotValue[];

/**
 * Scalar format items have a single x and y value; [[x], [y]]
 */
class ScalarFormat {
    static convert(item: Item): PlotValue[] {
        const valid = item.measurement.values.filter(ScalarFormat.filter);
        return valid.map((value) => {
            const [[x], [y]] = value;
            return { [0]: x, [1]: y, "item": item };
        });
    }

    static filter(value: number[][]): boolean {
        if (value.length !== 2) return false;
        const [x, y] = value;
        if (
            x.length !== 1 ||
            y.length !== 1 ||
            !Number.isFinite(x[0]) ||
            !Number.isFinite(y[0])
        ) {
            return false;
        }
        return true;
    }
}

/**
 * Sigma format items have a single x and 3-tuple y; [[x], [y_avg, y_std, y_n]]
 */
class SigmaFormat {
    static convert(item: Item): PlotValue[] {
        const valid = item.measurement.values.filter(SigmaFormat.filter);
        return valid.map((value: number[][]) => {
            const [[x], [y, y_std]] = value;
            const [y_min, y_max] = [y - y_std, y + y_std];
            return { [0]: x, [1]: y, "y_max": y_max, "y_min": y_min, "item": item };
        });
    }

    static filter(value: number[][]): boolean {
        if (value.length !== 2) return false;
        const [x, y] = value;
        if (
            x.length !== 1 ||
            y.length !== 3 ||
            !Number.isFinite(x[0]) ||
            !Number.isFinite(y[0]) ||
            !Number.isFinite(y[1]) ||
            !Number.isFinite(y[2])
        ) {
            return false;
        }
        return true;
    }
}

/**
 * Range format items have a single x and 3-tuple y; [[x], [y, y_min, y_max]]
 */
class RangeFormat {
    static convert(item: Item): PlotValue[] {
        const valid = item.measurement.values.filter(RangeFormat.filter);
        return valid.map((value) => {
            const [[x], [y, y_max, y_min]] = value;
            return { [0]: x, [1]: y, "y_max": y_max, "y_min": y_min, "item": item };
        });
    }

    static filter(value: number[][]): boolean {
        if (value.length !== 2) return false;
        const [x, y] = value;
        if (
            x.length !== 1 ||
            y.length !== 3 ||
            !Number.isFinite(x[0]) ||
            !Number.isFinite(y[0]) ||
            !Number.isFinite(y[1]) ||
            !Number.isFinite(y[2])
        ) {
            return false;
        }
        return true;
    }
}

/**
 * Packed format items have n-tuple x and n-tuple y; [[x0, x1, ..., xn], [y0, y1, ..., yn]]
 */
class PackedFormat {
    static convert(item: Item): PlotValue[] {
        const valid = item.measurement.values.filter(PackedFormat.filter);
        const values: PlotValue[][] = valid.map((value): PlotValue[] => {
            const [_x, _y] = value;
            return _x.map((x, i): PlotValue => ({ [0]: x, [1]: _y[i], "item": item }));
        });
        return [].concat(...values);
    }

    static filter(value: number[][]): boolean {
        if (value.length !== 2) return false;
        const [x, y] = value;
        return (
            x.length === y.length &&
            x.every(Number.isFinite) &&
            y.every(Number.isFinite)
        );
    }
}

/**
 * Mapping function for measurements using a value format we aren't supporting
 * via the web UI. Gives an empty array for values to plot.
 */
const NOT_SUPPORTED: ValueFormat = (item) => [];

/**
 * Functions to map an Item to an array of values to plot.
 * See server/edd/main/models/core.py#Measurement#Format.
 */
const FORMATS: ValueFormat[] = [
    // "0" -> SCALAR single x and y value; [[x], [y]]
    ScalarFormat.convert,
    // "1" -> VECTOR :: not supported
    NOT_SUPPORTED,
    // "2" -> HISTOGRAM_NAIVE :: not supported
    NOT_SUPPORTED,
    // "3" -> SIGMA single x, 3-tuple y; [[x], [y_avg, y_std, y_n]]
    SigmaFormat.convert,
    // "4" -> RANGE single x, 3-tuple y; [[x], [y, y_max, y_min]]
    RangeFormat.convert,
    // "5" -> VECTOR_RANGE :: not supported
    NOT_SUPPORTED,
    // "6" -> PACKED n-tuple x, n-tuple y; [[x0, x1, ..., xn], [y0, y1, ..., yn]]
    PackedFormat.convert,
    // "7" -> HISTOGRAM :: not supported
    NOT_SUPPORTED,
    // "8" -> HISTOGRAM_STEP :: not supported
    NOT_SUPPORTED,
];

/**
 * Force cast argument to a string, and truncate to at most 20 characters.
 */
function trunc(value: any): string {
    const str = `${value}`;
    if (str.length > 21) {
        return str.substring(0, 20) + "…";
    }
    return str;
}

/**
 * Three ways to group values displayed in bar plots.
 */
type BarGrouping =
    | typeof Graph.GroupLine
    | typeof Graph.GroupTime
    | typeof Graph.GroupType;

export class Graph {
    public static readonly GroupLine: unique symbol = Symbol("Group bars by Line");
    public static readonly GroupTime: unique symbol = Symbol("Group bars by Time");
    public static readonly GroupType: unique symbol = Symbol("Group bars by Type");

    private static readonly _bright: number = 1;
    private static readonly _translucent: number = 0.9;
    private static readonly _dim: number = 0.1;
    private static readonly _width: number = 1000;
    private static readonly _height: number = 300;
    private static readonly _margin: number = 5;
    private static readonly _axis_width: number = 50;
    private static readonly _axis_label_height: number = 10;
    private static readonly _x_labels = {
        [Graph.GroupLine]: "Line",
        [Graph.GroupTime]: "Time",
        [Graph.GroupType]: "Measurement",
    };
    private static readonly _blank_label = () => "";

    // track the currently hovered Element,
    // to prevent flicker when moving between hover targets
    private current_hover: EventTarget = null;
    // track if the last rendered view has limited points displayed
    private is_truncated = false;

    constructor(
        private readonly root: HTMLElement,
        private readonly svg: SVGElement,
        private readonly tooltip: HTMLElement,
        private readonly access: Access,
    ) {
        // intentionally blank
    }

    static create(root: HTMLElement, access: Access): Graph {
        // reserve axis width to left for the axis and labels
        const min_x = 0 - Graph._axis_width;
        // reserve margin to top so plotted values do not render on edge
        const min_y = 0 - Graph._margin;
        // add SVG element to the root
        const svg = d3
            .select(root)
            .append("svg")
            .attr("viewBox", `${min_x} ${min_y} ${Graph._width} ${Graph._height}`);
        // add tooltip element to the root
        const tooltip = d3
            .select(root)
            .append("div")
            .attr("class", "tooltip2 hidden")
            .node();
        return new Graph(root, svg.node(), tooltip, access);
    }

    assignColors(items: Item[], strategy: OrganizerStrategy = KeyLine): void {
        const organizer = new Organizer(strategy, this.access);
        const groups = organizer.groupItems(items);
        let lastColor = null;
        // assign color to each group of Items
        groups.forEach((group: Item[]) => {
            // if an item already has a color, keep it for group
            let color = group[0].line.color || null;
            // if missing, assign next color in the list
            if (color === null) {
                const index = Colors.indexOf(lastColor) + 1;
                color = Colors[index % Colors.length];
            }
            group.forEach((item) => (item.line.color = color));
            lastColor = color;
        });
    }

    clearColors(items: Item[]): void {
        items.forEach((item) => (item.line.color = null));
    }

    isTruncated(): boolean {
        return this.is_truncated;
    }

    /**
     * Renders a line plot from the given filtered items, grouped by a replicate key.
     * The replicate key should be one of Keys.byAssay, Keys.byLine, or Keys.byReplicate.
     */
    renderLinePlot(items: Item[], strategy: OrganizerStrategy = KeyAssay): number {
        const organizer = new Organizer(strategy, this.access);
        // Use a cutoff to prevent interface locking up when too many points are drawn
        const points = limit(itemsToValues(items), DisplayLimitLine);
        // first group by units
        const unit_map = d3.group(points, Values.byUnit);
        // place the x-axis
        const plot_width = Graph.plotWidth(unit_map.size);
        const x_scale = d3
            .scaleLinear()
            .domain(d3.extent(points, Values.byTime))
            .range([0, plot_width]);
        // define a group for plot labeling
        const labeling = d3.select(this.svg).append("g");
        this.buildXAxis(labeling, x_scale, "Time");
        // loop through the unit types, adding y-axis and plots for each
        let axis_index = 0;
        let displayed = 0;
        unit_map.forEach((byUnit, unit_id) => {
            // skip anything where we can't fit an axis
            if (axis_index > 3) return;
            // record number of points getting displayed
            displayed += byUnit.length;
            const unit = this.access.findUnit(unit_id);
            const height = Graph._height - Graph._axis_width - Graph._margin;
            const y_scale = d3
                .scaleLinear()
                .rangeRound([height, 0])
                .domain(yExtent(byUnit));
            const icon = Icons.icons[axis_index];
            this.buildYAxis(labeling, y_scale, plot_width, axis_index, unit.name, icon);
            // group by replicate key and type of measurement to draw
            const groups = organizer.groupValuesByType(byUnit);
            groups.forEach(
                this.drawCurve(
                    d3.select(this.svg).append("g").attr("class", "plot"),
                    new Position(x_scale, y_scale),
                    icon,
                ),
            );
            // increment before moving to next unit
            ++axis_index;
        });
        this.is_truncated = points.has_hit_limit;
        return displayed;
    }

    renderBarPlot(
        items: Item[],
        group: BarGrouping,
        strategy: OrganizerStrategy = KeyAssay,
    ): number {
        const organizer = new Organizer(strategy, this.access);
        // Use a dynamic limit for bar graphs,
        // to ensure bar widths are at least a few pixels
        const max_bars = Math.floor($(this.svg).width() / 4);
        const points = limit(itemsToValues(items), max_bars);
        const unit_map = d3.group(points, Values.byUnit);
        const plot_height = Graph._height - Graph._axis_width - Graph._margin;
        const plot_width = Graph.plotWidth(unit_map.size);
        const plot_group_padding = 0.1;
        // define a group for plot labeling
        const label_parent = d3.select(this.svg).append("g");
        const to_display = this.selectPointsWithVisibleAxis(unit_map, label_parent);
        // group together values for consistent display ordering of bars
        const groups = organizer.groupValues(to_display, group);
        const x_scale = d3
            .scaleBand()
            .domain(groups.keys())
            .rangeRound([0, plot_width])
            .padding(plot_group_padding);
        this.buildXAxis(
            label_parent,
            x_scale,
            Graph._x_labels[group],
            organizer.label(group),
        );
        // loop over first grouping key items
        // the first grouping gets the labels on the X-axis
        const plot = d3.select(this.svg);
        let displayed = 0;
        groups.forEach((outer, o_key) => {
            const ogroup = plot
                .append("g")
                .attr("class", "ogroup")
                .attr("transform", `translate(${x_scale(o_key)})`);
            const outer_scale = d3
                .scaleBand()
                .domain(outer.keys())
                .range([0, x_scale.bandwidth()])
                .padding(plot_group_padding);
            // loop over items in outer groupings
            outer.forEach((inner, i_key) => {
                const igroup = ogroup
                    .append("g")
                    .attr("class", "igroup")
                    .attr("transform", `translate(${outer_scale(i_key)})`);
                const inner_scale = d3
                    .scaleBand()
                    .domain(inner.keys())
                    .range([0, outer_scale.bandwidth()]);
                // build data structure for EnterSelection
                const bar_data = Array.from(inner.entries()).map(([key, values]) => {
                    // collapse PlotValue[] into singular PlotValue
                    // all array members should have same item, y_scale, and [0]/x value
                    const first_item = values[0].item;
                    const y = Values.meanValue(values);
                    displayed += values.length;
                    return {
                        [0]: values[0][0],
                        [1]: y,
                        "height": values[0].y_scale(y),
                        // copy with Object.assign() because original may be discarded
                        "item": Object.assign(first_item),
                        "key": key,
                    } as PlotValue;
                });
                // draw a rect "bar" for every set of values in the inner grouping
                igroup
                    .selectAll("rect")
                    .data(bar_data)
                    .enter()
                    .append("rect")
                    .attr("class", "graphValue")
                    .attr("fill", (d: PlotValue) => d.item.line.color)
                    .attr("height", (d: PlotValue) => plot_height - d.height)
                    .attr("width", inner_scale.bandwidth())
                    .attr("x", (d: PlotValue) => inner_scale(d.key))
                    .attr("y", (d: PlotValue) => d.height)
                    .on("mousemove", this.tooltipOver())
                    .on("mouseout", this.tooltipOut());
            });
        });
        this.is_truncated = points.has_hit_limit;
        return displayed;
    }

    /**
     * Creates and displays an x-axis for the given scale, optionally leaving
     * space for up to three additional y-axes to the right-side of plot area.
     */
    private buildXAxis<T extends d3.AxisDomain>(
        parent: GenericSelection,
        scale: d3.AxisScale<T>,
        label: string,
        tickFormat: (value: any) => string = trunc,
    ): void {
        // calculate offset for bottom axis
        const position = Graph._height - Graph._axis_width - Graph._margin;
        const x_axis = d3.axisBottom(scale);
        const domain: T[] = scale.domain();
        if (domain.length === 2 && domain[0] instanceof Number) {
            // in a numeric domain, just use normal formatting
            x_axis.ticks(10, ".2s");
        } else if (domain.length <= 20) {
            // non-numeric domain with 20 or fewer items, display all values
            x_axis.tickFormat(tickFormat);
        } else {
            // over 20 items, choose at most 20 to display
            const chosen: Set<number> = new Set();
            for (let i = 0; i < 20; ++i) {
                chosen.add(Math.ceil((i * domain.length) / 20));
            }
            x_axis.tickFormat((v: T, i: number) =>
                chosen.has(i) ? tickFormat(v) : "",
            );
        }
        const [start, end] = scale.range();
        const width = end - start;
        // place the bottom x-axis
        const axis_group = parent
            .append("g")
            .attr("class", "axis x-axis")
            .attr("transform", `translate(0,${position})`)
            .call(x_axis);
        // place grid lines for x-axis
        parent
            .append("g")
            .attr("class", "grid")
            .call(x_axis.tickSize(position).tickFormat(Graph._blank_label));
        // slightly angle labels when there are more than five
        if (domain.length > 5) {
            axis_group
                .selectAll("text")
                .attr("transform", "rotate(15)")
                .style("text-anchor", "start");
        }
        // place label on axis
        axis_group
            .append("text")
            .attr("class", "axis-text")
            .attr("fill", "black")
            .attr("x", width / 2)
            .attr("y", Graph._axis_width - Graph._axis_label_height)
            .text(label);
    }

    /**
     * Creates and displays an y-axis for the given scale, placing the first on
     * the left and up to three more on the right.
     */
    private buildYAxis<T extends d3.AxisDomain>(
        parent: GenericSelection,
        y_scale: d3.AxisScale<T>,
        plot_width: number,
        index: number,
        label: string,
        icon: IconDecorator = null,
    ): void {
        // only first axis is on the left, others go on right
        const y_axis = index > 0 ? d3.axisRight(y_scale) : d3.axisLeft(y_scale);
        // define term so first axis has ticks moving to left, others ticks to right
        const direction = index > 0 ? 1 : -1;
        // set five value ticks, labeled SI prefix w/ 2 significant figures
        y_axis.ticks(5, ".2s");
        const group = parent.append("g").attr("class", "axis y-axis y-axis-right");
        group.call(y_axis);
        const axis_label = group
            .append("g")
            .attr("fill", "black")
            .attr("transform", "rotate(-90)");
        // group is rotated so x = -vertical and y = horizontal now
        const text_x = -Graph._height / 2;
        const text_y = (Graph._axis_width - Graph._axis_label_height) * direction;
        axis_label
            .append("text")
            .attr("class", "axis-text")
            .attr("x", text_x)
            .attr("y", text_y)
            .text(label);
        // add icon next to label, if provided
        if (icon !== null) {
            const icon_position: [number, number] = [
                text_x + Icons._width,
                text_y - Icons._width / 2,
            ];
            const icon_selection = axis_label
                .selectAll(".icon")
                .data([icon_position])
                .enter();
            icon(icon_selection);
        }
        // only first axis draws grid lines
        // other axes are translated to right side of plot
        if (index === 0) {
            parent
                .append("g")
                .attr("class", "grid")
                .call(y_axis.tickSize(-plot_width).tickFormat(Graph._blank_label));
        } else {
            const offset = plot_width + Graph._axis_width * (index - 1);
            group.attr("transform", `translate(${offset},0)`);
        }
    }

    private drawCurve(parent: GenericSelection, scale: Position, icon: IconDecorator) {
        return (values: PlotValue[]) => {
            // ensure all values are sorted lowest to highest time
            const sorted = sortOnX(values);
            // take the mean of every distinct time value
            const mean = d3.rollup(sorted, Values.meanValue, Values.byTime);
            // generator for the path of the curve
            const line = d3.line(scale.x(), scale.y());
            // get color from the first item; they should all be the same
            const first_item = values[0].item;
            const color = first_item.line.color;
            // add G element for entire curve
            const curve_group = parent
                .append("g")
                .attr("class", "curve graphValue")
                .attr("fill", "none")
                .attr("stroke", color)
                .on("mousemove", this.tooltipOver(first_item))
                .on("mouseout", this.tooltipOut());
            // add PATH element for plot path
            curve_group
                .append("path")
                .attr("d", line(mean.entries()))
                .attr("stroke-width", 2);
            // add G element for icons over value points
            // NOTE: mean.entries() gives an iterator, so cannot call once and use twice
            const icon_group = curve_group
                .append("g")
                .attr("fill", color)
                .attr("class", "icon-group")
                .selectAll(".icon")
                .data(mean.entries())
                .enter();
            // call icon generator to place icon elements in group
            icon(icon_group, scale).on("mousemove", this.tooltipOver(first_item));
            // take the extent of every distinct time value
            const extent = d3.rollup(sorted, Values.extentValue, Values.byTime);
            // filter out y_min === y_max
            const usable: XYBound[] = Array.from(extent.entries()).filter((c) => {
                const [y_min, y_max] = c[1];
                return y_min !== y_max;
            });
            // add group containing extent bars
            const extent_group = curve_group
                .append("g")
                .attr("class", "extent-group")
                .attr("fill", color)
                .selectAll(".extent")
                .data(usable)
                .enter();
            // draw individual extent bars
            extent_group
                .append("path")
                .attr("d", (data: XYBound) => line(boundToPairs(data)))
                .attr("stroke-width", 1);
        };
    }

    /**
     * Creates up to four y-axis definitions for the plot, and returns an
     * Iterable of PlotValue records for points which will have a
     * visible y-axis.
     */
    private selectPointsWithVisibleAxis(
        unit_map: Map<number, PlotValue[]>,
        labeling: GenericSelection,
    ): Iterable<PlotValue> {
        const plot_width = Graph.plotWidth(unit_map.size);
        // track the points that will get displayed, along with scale
        const to_display: PlotValue[][] = [];
        // loop through the unit types, adding y-axis for up to four
        let axis_index = 0;
        unit_map.forEach((byUnit, unit_id) => {
            // skip anything where we can't fit an axis
            if (axis_index > 3) return;
            const unit = this.access.findUnit(unit_id);
            const height = Graph._height - Graph._axis_width - Graph._margin;
            const y_scale = d3
                .scaleLinear()
                .rangeRound([height, 0])
                .domain(yExtent(byUnit));
            this.buildYAxis(labeling, y_scale, plot_width, axis_index, unit.name);
            byUnit.forEach(attachScale(y_scale));
            to_display[axis_index] = sortOnX(byUnit);
            // increment before moving to next unit
            ++axis_index;
        });
        return chain(...to_display);
    }

    private tooltipOut(): (event: Event) => void {
        return (event: Event) => {
            if (event.currentTarget === this.current_hover) {
                // return all plot elements to normal opacity
                d3.select(this.svg)
                    .selectAll(".graphValue")
                    .style("opacity", Graph._bright);
                // fade out any displayed tooltip
                d3.select(this.tooltip).transition().style("opacity", 0);
            }
        };
    }

    /**
     * Makes event handler callback. If the Item record is known at callback
     * assignment time, it is used; otherwise attempt to find the record on
     * bound data. Callback first argument is event, second argument is any
     * bound data on a d3 selection.
     */
    private tooltipOver(item?: Item): (event: Event, value: any) => void {
        return (event: MouseEvent, value: any) => {
            const tooltip_info = item || (value?.item as Item);
            if (tooltip_info) {
                if (this.current_hover !== event.currentTarget) {
                    const m = tooltip_info?.measurement;
                    const mtype = this.access.findMeasurementType(m?.type);
                    // build description string for bound data if present
                    let value_description = "";
                    if (value) {
                        const [x, y] = value;
                        const x_unit = this.access.findUnit(m?.x_units)?.name;
                        const y_unit = this.access.findUnit(m?.y_units)?.name;
                        value_description = `${y} ${y_unit} @ ${x} ${x_unit}`;
                    }
                    const html = `<strong>${tooltip_info?.line?.name}</strong><br/>
                        ${mtype?.name}<br/>
                        ${value_description}`;
                    $(this.tooltip).html(html);
                }
                $(this.tooltip)
                    .removeClass("hidden")
                    .css("opacity", Graph._translucent)
                    .offset({ "top": event.pageY, "left": event.pageX });
            }
            this.current_hover = event.currentTarget;
            // dim all items in plot, except for the one currently hovered
            d3.select(this.svg).selectAll(".graphValue").style("opacity", Graph._dim);
            $(event.target).closest(".graphValue").css("opacity", Graph._bright);
        };
    }

    /**
     * Calculate width of plot area after accounting for number of y axes.
     */
    private static plotWidth(y_axis_count = 1, max_axis_count = 4): number {
        // reserve space for axis at left and at most 3 additional axes on right-side
        const reserve_axes = Math.max(0, Math.min(max_axis_count, y_axis_count));
        const axes_total_width = reserve_axes * Graph._axis_width;
        // calculate width of plot area, removing axes and margins
        return Graph._width - axes_total_width - Graph._margin;
    }
}

// These are defined outside of Organizer class to avoid circular references internally
const KeyAssay: unique symbol = Symbol("Key by Assay ID");
const KeyLine: unique symbol = Symbol("Key by Line ID");
const KeyReplicate: unique symbol = Symbol("Key by Replicate ID");
type OrganizerStrategy = typeof KeyAssay | typeof KeyLine | typeof KeyReplicate;

/**
 * Organizes records for display, using a strategy for grouping records.
 */
class Organizer {
    public static readonly KeyAssay: typeof KeyAssay = KeyAssay;
    public static readonly KeyLine: typeof KeyLine = KeyLine;
    public static readonly KeyReplicate: typeof KeyReplicate = KeyReplicate;

    private readonly labels: Map<string, string> = new Map();
    private readonly typeLookup: TypeLookup;

    constructor(private strategy: OrganizerStrategy, access: Access) {
        this.typeLookup = new TypeLookup(access);
    }

    barGroupingKeys(grouping: BarGrouping): BarGroupingKeys {
        if (grouping === Graph.GroupLine) {
            return [this.replicateKey(), this.typeLookup.key(), Organizer.byTime];
        } else if (grouping === Graph.GroupTime) {
            return [Organizer.byTime, this.replicateKey(), this.typeLookup.key()];
        } else if (grouping === Graph.GroupType) {
            return [this.typeLookup.key(), Organizer.byTime, this.replicateKey()];
        }
        // should be compile error to reach here
        throw new Error("Invalid BarGrouping argument");
    }

    groupItems(items: Iterable<Item>): Map<string, Item[]> {
        return d3.group(items, this[this.strategy]());
    }

    groupValues(
        values: Iterable<PlotValue>,
        grouping: BarGrouping,
    ): Map<string, Map<string, Map<string, PlotValue[]>>> {
        const keys = this.barGroupingKeys(grouping);
        return d3.group(values, keys[0], keys[1], keys[2]);
    }

    groupValuesByType(values: Iterable<PlotValue>): Map<string, PlotValue[]> {
        const combinedKey = Organizer.join(this.replicateKey(), this.typeLookup.key());
        return d3.group(values, combinedKey);
    }

    label(grouping: BarGrouping): (value: string) => string {
        return (value: string) => {
            let label: string;
            if (grouping === Graph.GroupLine) {
                label = this.labels.get(value);
            } else if (grouping === Graph.GroupType) {
                label = this.typeLookup.label(value);
            } else {
                label = value;
            }
            return trunc(label);
        };
    }

    private replicateKey(): PlotValueKey {
        return (value: PlotValue): string => {
            return this[this.strategy]()(value.item);
        };
    }

    private [KeyAssay](): (item: Item) => string {
        return (item: Item) => {
            const key = `${item.assay.id}`;
            this.labels.set(key, `${item.line.name}`);
            return key;
        };
    }

    private [KeyLine](): (item: Item) => string {
        return (item: Item) => {
            const key = `${item.line.id}`;
            this.labels.set(key, `${item.line.name}`);
            return key;
        };
    }

    private [KeyReplicate](): (item: Item) => string {
        return (item: Item) => {
            // if item.line has replicate metadata, use it
            // otherwise, use item.line.id
            const r = item.line.replicate || null;
            const key = r === null ? `${item.line.id}` : r;
            this.labels.set(key, `${item.line.name}`);
            return key;
        };
    }

    private static join(...keys: PlotValueKey[]): PlotValueKey {
        return (v: PlotValue) => keys.map((f) => f(v)).join("|");
    }

    private static byTime: PlotValueKey = (v: PlotValue) => `${v[0]}`;
}

class TypeLookup {
    private labels: Map<string, string> = new Map();

    constructor(private access: Access) {}

    key(): PlotValueKey {
        return (v: PlotValue) => {
            const m = v.item.measurement;
            const key = `${m.comp}:${m.type}`;
            const t = this.access.findMeasurementType(m.type);
            const c = this.access.findCompartment(m.comp);
            // only using compartment for metabolites
            const label = t.family === "m" ? `${c.code} ${t.name}` : t.name;
            this.labels.set(key, label);
            return key;
        };
    }

    label(key: string): string {
        return this.labels.get(key);
    }
}

/**
 * Collection of value functions to use with `d3.group()` or `d3.rollup()`.
 */
class Values {
    static byTime = (v: PlotValue) => v[0];
    static byUnit = (v: PlotValue) => v.item.measurement.y_units;
    static byValue = (v: PlotValue) => v[1];
    static byValueMax = (v: PlotValue) => (v.y_max === undefined ? v[1] : v.y_max);
    static byValueMin = (v: PlotValue) => (v.y_min === undefined ? v[1] : v.y_min);

    static extentValue = (v: PlotValue[]): [number, number] => [
        d3.min(v, Values.byValueMin),
        d3.max(v, Values.byValueMax),
    ];
    static meanValue = (v: PlotValue[]) => d3.mean(v, Values.byValue);
}

/**
 * Defines a scaled position that converts values to coordinates, with
 * optional offsets in coordinate space.
 */
class Position {
    static Identity: Position = new Position(d3.scaleIdentity(), d3.scaleIdentity());

    constructor(
        private readonly x_scale: d3.AxisScale<number>,
        private readonly y_scale: d3.AxisScale<number>,
    ) {
        // intentionally blank
    }

    x(offset = 0): (v: XYPair) => number {
        return (v: XYPair) => this.x_scale(v[0]) + offset;
    }

    y(offset = 0): (v: XYPair) => number {
        return (v: XYPair) => this.y_scale(v[1]) + offset;
    }
}

/**
 * Alias for a generic d3.Selection type.
 */
type GenericSelection = d3.Selection<d3.BaseType, unknown, d3.BaseType, unknown>;
/**
 * Alias for d3.Selection type used to plot icon positions.
 */
type EnterSelection = d3.Selection<d3.EnterElement, XYPair, Element, unknown>;
/**
 * Function type that applies an icon at a scaled position.
 */
type IconDecorator = (svg: EnterSelection, pos?: Position) => GenericSelection;

/**
 * Defines icons used in line plots, linking a curve to its labeled axis.
 */
class Icons {
    static readonly _width = 6;
    static icons: IconDecorator[] = [
        Icons.circle,
        Icons.triangle,
        Icons.square,
        Icons.cross,
    ];

    /**
     * Builds a circle of radius 3 units, centered on value coordinates.
     */
    static circle(plot: EnterSelection, pos = Position.Identity): GenericSelection {
        return plot
            .append("svg:circle")
            .attr("class", "icon")
            .attr("cx", pos.x())
            .attr("cy", pos.y())
            .attr("r", Icons._width / 2);
    }
    /**
     * Builds a cross 8x8 units, centered on value coordinates.
     */
    static cross(plot: EnterSelection, pos = Position.Identity): GenericSelection {
        const narrow = Icons._width / 3;
        const wide = Icons._width;
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
    }
    /**
     * Builds a square 6x6 units, centered on value coordinates.
     */
    static square(plot: EnterSelection, pos = Position.Identity): GenericSelection {
        const squareSize = Icons._width;
        return plot
            .append("svg:rect")
            .attr("class", "icon")
            .attr("x", pos.x(-squareSize / 2))
            .attr("y", pos.y(-squareSize / 2))
            .attr("width", squareSize)
            .attr("height", squareSize);
    }
    /**
     * Builds an equilateral triangle sides of 8 units, centered on value coordinates.
     */
    static triangle(plot: EnterSelection, pos = Position.Identity): GenericSelection {
        const size = Icons._width;
        // equilateral triangle is π/3 radians or 60°
        const angle = Math.PI / 3;
        const vertical = Math.sin(angle) * (size / 2);
        const horizontal = size / 2;
        return plot
            .append("svg:polygon")
            .attr("class", "icon")
            .attr("points", (v: XYPair): string =>
                [
                    // top
                    pos.x()(v),
                    pos.y(-vertical)(v),
                    // bottom-right
                    pos.x(horizontal)(v),
                    pos.y(vertical)(v),
                    // bottom-left
                    pos.x(-horizontal)(v),
                    pos.y(vertical)(v),
                ].join(","),
            );
    }
}
