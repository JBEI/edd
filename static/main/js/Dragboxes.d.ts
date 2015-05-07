/// <reference path="typescript-declarations.d.ts" />
declare module Dragboxes {
    function findAndInitAllTables(): void;
    function dragEnd(event: any): void;
    function dragOver(event: any): void;
    function dragStart(event: any): boolean;
    function initTable(table: any): void;
}
