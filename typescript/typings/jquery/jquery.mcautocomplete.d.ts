///<reference path="../jquery/jquery.d.ts" />
///<reference path="../jquery/jqueryui.d.ts" />


declare module MultiColumnAuto {

    interface ColumnDef {
        name: string;
        width: string;
        maxWidth?: string;
        valueField: string;
    }

    interface AutocompleteOptions extends JQueryUI.AutocompleteOptions {
        showHeader?: boolean;
        columns?: ColumnDef[];
    }

}

interface JQuery {
    mcautocomplete(): JQuery;
    mcautocomplete(methodName: 'close'): void;
    mcautocomplete(methodName: 'destroy'): void;
    mcautocomplete(methodName: 'disable'): void;
    mcautocomplete(methodName: 'enable'): void;
    mcautocomplete(methodName: 'search', value?: string): void;
    mcautocomplete(methodName: 'widget'): JQuery;
    mcautocomplete(methodName: string): JQuery;
    mcautocomplete(options: MultiColumnAuto.AutocompleteOptions): JQuery;
    mcautocomplete(optionLiteral: string, optionName: string): any;
    mcautocomplete(optionLiteral: string, options: MultiColumnAuto.AutocompleteOptions): any;
    mcautocomplete(optionLiteral: string, optionName: string, optionValue: any): JQuery;

    /* Adding this from use in EDDAutocomplete; normally this is a private function,
     * but there is no 'public' way to properly trigger events on autocompletes */
    _trigger(eventType: string, eventSubType: string, extraParameters?: any[]|Object): JQuery;
}
