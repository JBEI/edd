/// <reference path="typescript-declarations.d.ts" />
/// <reference path="lib/jquery.d.ts" />
/// <reference path="Utl.d.ts" />
declare var EDD_auto: any;
declare module EditableElements {
    class EditableElement {
        options: any;
        element: HTMLElement;
        $element: JQuery;
        type: string;
        inputElement: any;
        editButtonElement: HTMLElement;
        acceptButtonElement: HTMLElement;
        cancelButtonElement: HTMLElement;
        waitButtonElement: HTMLElement;
        editControlsPositioner: any;
        editControlsContainer: any;
        editAllowedFn: (e: EditableElement) => boolean;
        getValueFn: (e: EditableElement) => any;
        setValueFn: (e: EditableElement, v: any) => void;
        makeFormDataFn: (e: EditableElement, v: any) => any;
        showValueFn: any;
        tableCellMode: boolean;
        static _prevEditableElement: any;
        static _uniqueIndex: any;
        constructor(opt: any);
        setUpMainElement(): void;
        generateControlsContainer(): void;
        generateControlButtons(): void;
        setUpEditableMode(): void;
        setUpEditingMode(): void;
        clearElementForEditing(): void;
        clickToEditHandler: () => boolean;
        clickToAcceptHandler: () => boolean;
        clickToCancelHandler: () => boolean;
        setUpESCHandler(): void;
        removeESCHandler(): void;
        keyESCHandler: (e: any) => void;
        cancelEditing(): void;
        commitEdit(): void;
        setUpCommittingIndicator(): void;
        getEditedValue(): any;
        setEditedFieldContent(): any;
    }
    class EditableAutocomplete extends EditableElement {
        autoCompleteObject: any;
        constructor(inputElement: HTMLElement);
        setUpMainElement(): void;
        createAutoCompleteObject(): any;
        getAutoCompleteObject(): any;
        setUpEditingMode(): void;
        getEditedValue(): any;
        setEditedFieldContent(): any;
    }
    class EditableEmail extends EditableAutocomplete {
        createAutoCompleteObject(): any;
    }
    class EditableStrain extends EditableAutocomplete {
        createAutoCompleteObject(): any;
    }
    function initializeElement(options: any): void;
    function initializeElements(optionSet: any): void;
}
