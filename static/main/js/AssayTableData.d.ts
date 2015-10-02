/// <reference path="../../../../typescript/lib/jquery.d.ts" />
/// <reference path="EDDDataInterface.d.ts" />
declare var ATData: any;
declare var EDDATDGraphing: any;
declare var EDD_auto: any;
interface RawInput extends Array<string[]> {
}
interface RawInputStat {
    input: RawInput;
    columns: number;
}
interface RowPulldownOption extends Array<any> {
    0: string;
    1: any;
}
declare var EDDATD: any;
