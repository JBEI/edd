/// <reference path="typescript-declarations.d.ts" />
declare module Dragboxes {
    function findAndInitAllTables(): void;
    function initTable(ts: any): void;
    function initCell(td: any, cb: any, noTextSelect: any): void;
}
