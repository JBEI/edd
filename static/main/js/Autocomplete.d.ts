/// <reference path="EDDDataInterface.d.ts" />
declare module EDDAutoComplete {
    class QueryCacheManager<T> {
        static cacheMaxLength: number;
        private emptyQuery;
        private data;
        private length;
        constructor();
        flushCache(): void;
        cache(query: string): T[];
        cache(query: string, data: T[]): QueryCacheManager<T>;
    }
    interface InputFieldValue {
        id: string;
        selectValue: string;
        cols: string[];
        meta: string;
    }
    class InputFieldTemplate<T extends InputFieldValue> {
        static inputFieldUniqueIDCounter: number;
        private onItemSelect;
        selectFirst: boolean;
        selectOnly: boolean;
        mustMatch: boolean;
        delay: number;
        width: number;
        maxItemsToShow: number;
        minCharsToTriggerSearch: number;
        inputFieldUniqueID: number;
        private matchCase;
        private autoFillFirstWhileTyping;
        private loadingClass;
        private resultsClass;
        private resultsContentClass;
        private resultsTableClass;
        inputElementForID: HTMLInputElement;
        inputElement: HTMLInputElement;
        inputElementJQ: any;
        resultsElement: HTMLElement;
        resultsElementJQ: any;
        hasFocus: boolean;
        private resultsContentElement;
        private resultsContentElementJQ;
        private latestSelection;
        private previousSelection;
        private activeRowIndex;
        private clickedInSinceLastDefocus;
        private mouseOverResults;
        private lastKeyPressCode;
        private typingTimeout;
        private defocusTimeout;
        constructor(inputElement: HTMLInputElement);
        configure(): void;
        inputKeyDownHandler: (e: any) => void;
        inputFocusHandler: () => void;
        inputClickHandler: () => void;
        inputFocusOutHandler: (e: any) => void;
        resultsHoverOverHandler: () => void;
        resultsHoverOutHandler: () => void;
        resultsClickHandler: () => void;
        bodyMouseDownHandler: (e: BaseJQueryEventObject) => void;
        setFromPrimaryElement(): void;
        searchForClosestRecordMatch(v: string): number;
        resolveRecordIDToSelectString(id: number): string;
        setFromHiddenElement(): void;
        static createLowercaseForStrings(rec: any): void;
        typingDelayExpirationHandler: () => void;
        autoFill(sValue: string): void;
        showResults(): void;
        defocusAfterDelay(): void;
        defocusNowCallback: () => void;
        defocusNow(): void;
        receiveData(q: string, data: T[]): void;
        resultsRowHoverHandler: (e: BaseJQueryEventObject) => void;
        resultsRowHoverOutHandler: (e: BaseJQueryEventObject) => void;
        resultsRowClickHandler: (e: BaseJQueryEventObject) => void;
        selectCurrent(): boolean;
        moveSelect(step: number): void;
        revertSelection(): void;
        selectItem(rtr: HTMLElement): void;
        onItemSelectCallback: () => void;
        createSelection(start: number, end: number): void;
        requestData(query: string): void;
        loadFromCache(query: string): T[];
        addToCache(query: string, data: T[]): void;
        searchFunction(queries: string[], callback: (data: T[]) => void, params?: any): void;
        formatItemFunction(rtr: HTMLTableRowElement, row: T, i: number, num: number): HTMLTableRowElement;
        findPos(obj: HTMLElement): {
            x: number;
            y: number;
        };
    }
    class InputFieldWithControlsTemplate<T extends InputFieldValue> extends InputFieldTemplate<T> {
        showActionsBar: boolean;
        formDiv: HTMLElement;
        formDivJQ: any;
        formInputElements: any;
        formInputElementsSet: any;
        addFormBaseURL: string;
        private hideAddFormTimeout;
        private lastAutoFillID;
        private cancelButton;
        private submitButton;
        private doneButton;
        private addNewFormMessageArea;
        private resultsActionsClass;
        private mouseOverForm;
        constructor(inputElement: HTMLInputElement);
        configure(): void;
        prepareActionsBar(resultsActionsBar: HTMLElement): void;
        createAddNewForm(): void;
        bodyMouseDownHandlerForInputForm: (e: any) => void;
        addNewButtonHandler: (e: any) => void;
        addNewFunction(): void;
        populateAddNewFormFields(v: number): void;
        hideTheForm(): void;
        hideTheFormCallback: (e: any) => void;
        hideTheFormNow(): void;
        formClickCancelOrDoneButton: (e: any) => void;
        formClickAddButton: (e: any) => void;
        submitTheForm(): void;
        receiveAddNewFormResponse: (data: any, textStatus: any, jqXHR: any) => void;
        addNewResultsSetRecord(data: any): void;
    }
    interface UserFieldValue extends InputFieldValue {
    }
    class UserField extends InputFieldTemplate<UserFieldValue> {
        static cacheManager: QueryCacheManager<UserFieldValue>;
        static sourceDataPrepared: boolean;
        constructor(inputElement: HTMLInputElement);
        configure(): void;
        loadFromCache(query: string): UserFieldValue[];
        addToCache(query: string, data: UserFieldValue[]): void;
        searchFunction(queries: string[], callback: (data: UserFieldValue[]) => void): void;
        formatItemFunction(rtr: any, row: any, i: number, num: number): any;
        searchForClosestRecordMatch(v: string): number;
        resolveRecordIDToSelectString(id: number): any;
        static prepareSourceData(force: boolean): void;
    }
    interface EmailFieldValue extends InputFieldValue {
    }
    class EmailField extends InputFieldTemplate<EmailFieldValue> {
        static cacheManager: QueryCacheManager<EmailFieldValue>;
        static sourceDataPrepared: boolean;
        constructor(inputElement: HTMLInputElement);
        configure(): void;
        loadFromCache(query: string): EmailFieldValue[];
        addToCache(query: string, data: EmailFieldValue[]): void;
        searchFunction(query: string[], callback: (data: EmailFieldValue[]) => void): void;
        formatItemFunction(rtr: any, row: any, i: number, num: number): any;
        searchForClosestRecordMatch(v: string): number;
        resolveRecordIDToSelectString(id: number): any;
        static prepareSourceData(force: boolean): void;
    }
    interface MetaboliteFieldValue extends InputFieldValue {
    }
    class MetaboliteField extends InputFieldWithControlsTemplate<MetaboliteFieldValue> {
        static cacheManager: QueryCacheManager<MetaboliteFieldValue>;
        static sourceDataPrepared: boolean;
        constructor(inputElement: HTMLInputElement);
        configure(): void;
        loadFromCache(query: string): MetaboliteFieldValue[];
        addToCache(query: string, data: MetaboliteFieldValue[]): void;
        searchFunction(query: string[], callback: (data: MetaboliteFieldValue[]) => void): void;
        formatItemFunction(rtr: any, row: any, i: number, num: number): any;
        searchForClosestRecordMatch(v: string): number;
        static searchForClosestRecordMatchStatic(v: string): number;
        resolveRecordIDToSelectString(id: number): string;
        static prepareSourceData(force: boolean): void;
        createAddNewForm(): void;
        populateAddNewFormFields(v: number): void;
        addNewResultsSetRecord(data: any): void;
    }
    interface MetaDataFieldValue extends InputFieldValue {
    }
    class MetaDataField extends InputFieldTemplate<MetaDataFieldValue> {
        static cacheManager: QueryCacheManager<MetaDataFieldValue>;
        static sourceDataPrepared: boolean;
        constructor(inputElement: HTMLInputElement);
        configure(): void;
        loadFromCache(query: string): MetaDataFieldValue[];
        addToCache(query: string, data: MetaDataFieldValue[]): void;
        searchFunction(queries: string[], callback: (data: MetaDataFieldValue[]) => void): void;
        formatItemFunction(rtr: any, row: any, i: number, num: number): any;
        searchForClosestRecordMatch(v: string): number;
        static searchForClosestRecordMatchStatic(v: string): number;
        resolveRecordIDToSelectString(id: number): string;
        static prepareSourceData(force: boolean): void;
    }
    interface CompartmentFieldValue extends InputFieldValue {
    }
    class CompartmentField extends InputFieldTemplate<CompartmentFieldValue> {
        static cacheManager: QueryCacheManager<CompartmentFieldValue>;
        static sourceDataPrepared: boolean;
        constructor(inputElement: HTMLInputElement);
        configure(): void;
        loadFromCache(query: string): CompartmentFieldValue[];
        addToCache(query: string, data: CompartmentFieldValue[]): void;
        searchFunction(queries: string[], callback: (data: CompartmentFieldValue[]) => void): void;
        formatItemFunction(rtr: any, row: any, i: number, num: number): any;
        searchForClosestRecordMatch(v: string): number;
        resolveRecordIDToSelectString(id: number): any;
        static prepareSourceData(force: boolean): void;
    }
    interface UnitsFieldValue extends InputFieldValue {
    }
    class UnitsField extends InputFieldTemplate<UnitsFieldValue> {
        static cacheManager: QueryCacheManager<UnitsFieldValue>;
        static sourceDataPrepared: boolean;
        constructor(inputElement: HTMLInputElement);
        configure(): void;
        loadFromCache(query: string): UnitsFieldValue[];
        addToCache(query: string, data: UnitsFieldValue[]): void;
        searchFunction(queries: string[], callback: (data: UnitsFieldValue[]) => void): void;
        formatItemFunction(rtr: any, row: any, i: number, num: number): any;
        searchForClosestRecordMatch(v: string): number;
        resolveRecordIDToSelectString(id: number): any;
        static prepareSourceData(force: boolean): void;
    }
    interface LabelingFieldValue extends InputFieldValue {
    }
    class LabelingField extends InputFieldTemplate<LabelingFieldValue> {
        static cacheManager: QueryCacheManager<LabelingFieldValue>;
        static sourceDataPrepared: boolean;
        constructor(inputElement: HTMLInputElement);
        configure(): void;
        loadFromCache(query: string): LabelingFieldValue[];
        addToCache(query: string, data: LabelingFieldValue[]): void;
        searchFunction(queries: string[], callback: (data: LabelingFieldValue[]) => void): void;
        formatItemFunction(rtr: any, row: any, i: number, num: number): any;
        searchForClosestRecordMatch(v: string): number;
        resolveRecordIDToSelectString(id: number): string;
        static prepareSourceData(force: boolean): void;
    }
    interface StrainFieldValue extends InputFieldValue {
        meta: string;
    }
    class StrainField extends InputFieldWithControlsTemplate<StrainFieldValue> {
        static cacheManager: QueryCacheManager<StrainFieldValue>;
        private regLink;
        constructor(inputElement: HTMLInputElement);
        configure(): void;
        addNewFunction(): void;
        hideTheFormNow(): void;
        private _resetStrainInfo();
        loadFromCache(query: string): StrainFieldValue[];
        addToCache(query: string, data: StrainFieldValue[]): void;
        searchFunction(queries: string[], callback: (data: StrainFieldValue[]) => void): void;
        formatItemFunction(rtr: any, row: any, i: number, num: number): any;
        createAddNewForm(): void;
    }
    interface CarbonSourceFieldValue extends InputFieldValue {
    }
    class CarbonSourceField extends InputFieldWithControlsTemplate<CarbonSourceFieldValue> {
        static cacheManager: QueryCacheManager<CarbonSourceFieldValue>;
        static sourceDataPrepared: boolean;
        constructor(inputElement: HTMLInputElement);
        configure(): void;
        loadFromCache(query: string): CarbonSourceFieldValue[];
        addToCache(query: string, data: CarbonSourceFieldValue[]): void;
        searchFunction(queries: string[], callback: (data: CarbonSourceFieldValue[]) => void): void;
        formatItemFunction(rtr: any, row: any, i: number, num: number): any;
        searchForClosestRecordMatch(v: string): number;
        resolveRecordIDToSelectString(id: number): any;
        static prepareSourceData(force: boolean): void;
        createAddNewForm(): void;
        populateAddNewFormFields(v: number): void;
        addNewResultsSetRecord(data: any): void;
    }
    interface ExchangeFieldValue extends InputFieldValue {
    }
    class ExchangeField extends InputFieldTemplate<ExchangeFieldValue> {
        static cacheManager: QueryCacheManager<ExchangeFieldValue>;
        static sourceDataPrepared: boolean;
        constructor(inputElement: HTMLInputElement);
        configure(): void;
        loadFromCache(query: string): ExchangeFieldValue[];
        addToCache(query: string, data: ExchangeFieldValue[]): void;
        searchFunction(queries: string[], callback: (data: ExchangeFieldValue[]) => void): void;
        formatItemFunction(rtr: any, row: any, i: number, num: number): any;
        searchForClosestRecordMatch(v: string): number;
        resolveRecordIDToSelectString(id: number): string;
        static prepareSourceData(force: boolean): void;
    }
    interface SpeciesFieldValue extends InputFieldValue {
    }
    class SpeciesField extends InputFieldTemplate<SpeciesFieldValue> {
        static cacheManager: QueryCacheManager<SpeciesFieldValue>;
        static sourceDataPrepared: boolean;
        constructor(inputElement: HTMLInputElement);
        configure(): void;
        loadFromCache(query: string): SpeciesFieldValue[];
        addToCache(query: string, data: SpeciesFieldValue[]): void;
        searchFunction(queries: string[], callback: (data: SpeciesFieldValue[]) => void): void;
        formatItemFunction(rtr: any, row: any, i: number, num: number): any;
        searchForClosestRecordMatch(v: string): number;
        resolveRecordIDToSelectString(id: number): string;
        static prepareSourceData(force: boolean): void;
    }
    function initializeAllPageElements(): void;
    function initializeElement(input: HTMLInputElement): void;
    function createAutoCompleteContainer(autoType: any, elementSize: any, elementName: any, stringValue: any, hiddenValue: any): {
        type: any;
        initialized: number;
        setByUser: number;
        startString: any;
        startIndex: any;
        name: any;
        inputElement: HTMLInputElement;
        hiddenInputElement: HTMLInputElement;
    };
}
