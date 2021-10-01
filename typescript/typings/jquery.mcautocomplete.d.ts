declare namespace MultiColumnAuto {
    type ValueFieldCallback = (item: any, col: ColumnDef, i: number) => string | JQuery;

    interface ColumnDef {
        name: string;
        width: string;
        maxWidth?: string;
        valueField: string | ValueFieldCallback;
    }

    interface AutocompleteOptions extends JQueryUI.AutocompleteOptions {
        showHeader?: boolean;
        columns?: ColumnDef[];
    }
}

interface JQuery {
    mcautocomplete(methodName?: "widget" | string): JQuery;
    mcautocomplete(methodName: "close" | "destroy" | "disable" | "enable"): void;
    mcautocomplete(methodName: "search", value?: string): void;
    mcautocomplete(options: MultiColumnAuto.AutocompleteOptions): JQuery;
    mcautocomplete(
        optionLiteral: string,
        options: string | MultiColumnAuto.AutocompleteOptions,
    ): any;
    mcautocomplete(optionLiteral: string, optionName: string, optionValue: any): JQuery;

    /* Adding this from use in EDDAutocomplete; normally this is a private function,
     * but there is no 'public' way to properly trigger events on autocompletes */
    _trigger(
        eventType: string,
        eventSubType: string,
        extraParameters?: any[] | Record<string, any>,
    ): JQuery;
}

// TODO: find out why this isn't in DefinitelyTyped definitions
declare namespace JQuery {
    interface EventExtensions {
        trigger(name: string, data?: any[]): void;
    }
}
