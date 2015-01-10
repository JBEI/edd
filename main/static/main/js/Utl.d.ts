/// <reference path="typescript-declarations.d.ts" />
/// <reference path="EDDDataInterface.d.ts" />
declare module Utl {
    class EDD {
        static resolveMeasurementRecordToName(measurementRecord: AssayMeasurementRecord): string;
        static resolveMeasurementRecordToUnits(measurementRecord: AssayMeasurementRecord): string;
    }
    class QtipHelper {
        create(linkElement: any, contentFunction: any, params: any): void;
        private _generateContent();
        private _getQTipElement();
        qtip: any;
        private _contentFunction;
    }
    class Color {
        r: number;
        g: number;
        b: number;
        a: number;
        static rgba(r: number, g: number, b: number, alpha: number): Color;
        static rgb(r: number, g: number, b: number): Color;
        static interpolate(clr1: Color, clr2: Color, t: number): Color;
        static toString(clr: any): string;
        toString(): string;
        static red: Color;
        static green: Color;
        static blue: Color;
        static black: Color;
        static white: Color;
    }
    class Table {
        constructor(tableID: string, width?: number, height?: number);
        addRow(): HTMLTableRowElement;
        addColumn(): HTMLElement;
        addTableTo(element: HTMLElement): void;
        table: HTMLTableElement;
        _currentRow: number;
    }
    class JS {
        static createElementFromString(str: string, namespace?: string): HTMLElement;
        static assert(condition: boolean, message: string): void;
        static convertHashToList(hash: any): any;
        static padStringLeft(str: string, numChars: number): string;
        static padStringRight(str: string, numChars: number): string;
        static repeatString(str: string, numChars: number): string;
        static timestampToTodayString(timestamp: number): string;
        static utcToTodayString(utc: string): string;
        static remapValue(value: number, inMin: number, inMax: number, outMin: number, outMax: number): number;
        static removeAllChildren(element: HTMLElement): void;
        static removeFromParent(element: HTMLElement): void;
        static enableF12Trap(): void;
    }
    class SVG {
        static createSVG(width: any, height: any, boxWidth: number, boxHeight: number): SVGElement;
        static createVerticalLinePath(xCoord: number, yCoord: number, lineWidth: number, lineHeight: number, color: Color, svgElement: any): SVGElement;
        static createLine(x1: number, y1: number, x2: number, y2: number, color?: Color, width?: number): SVGElement;
        static createRect(x: number, y: number, width: number, height: number, fillColor: Color, strokeWidth?: number, strokeColor?: Color, opacity?: number): SVGElement;
        static createText(x: number, y: number, text: string, fontName?: string, fontSize?: number, centeredOnX?: boolean, color?: Color): SVGElement;
        static makeRectRounded(rect: any, rx: any, ry: any): void;
        private static _namespace;
    }
}
