/// <reference path="typescript-declarations.d.ts" />
declare module Dragboxes {
    function findAndInitAllTables(): void;
    function dragEnd(event: JQueryMouseEventObject): void;
    function dragOver(event: JQueryMouseEventObject): void;
    function dragStart(event: JQueryMouseEventObject): boolean;
    function initTable(table: HTMLElement): void;
}
