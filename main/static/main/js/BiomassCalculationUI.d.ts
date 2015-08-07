/// <reference path="typescript-declarations.d.ts" />
/// <reference path="lib/jqueryui.d.ts" />
/// <reference path="Utl.d.ts" />
declare class DialogBox {
    private _dialog;
    private _width;
    private _height;
    private _contentsDiv;
    constructor(width: number, height: number);
    term(): void;
    addHTML(html: string): void;
    addElement(element: HTMLElement): void;
    clearContents(): void;
    showWaitSpinner(caption: string, offset?: number): void;
    showMessage(message: string, onOK?: () => void): void;
}
interface ServerMetabolicMap {
    name: string;
    id: number;
    biomassCalculation: number;
}
interface ServerBiomassReaction {
    metabolicMapID: number;
    reactionName: string;
    reactionID: string;
}
interface ServerBiomassSpeciesEntry {
    sbmlSpeciesName: string;
    eddMetaboliteName: string;
}
interface MetabolicMapChooserResult {
    (err: string, metabolicMapID?: number, metabolicMapFilename?: string, biomassCalculation?: number): void;
}
declare class StudyMetabolicMapChooser {
    private _dialogBox;
    constructor(checkWithServerFirst: boolean, callback: MetabolicMapChooserResult);
    private _basePayload();
    private _chooseMetabolicMap(callback);
    private _onMetabolicMapChosen(map, callback);
    private _requestStudyMetabolicMap(callback, error);
    private _requestMetabolicMapList(callback, error);
    private _requestSetStudyMetabolicMap(metabolicMapID, callback);
}
interface BiomassResultsCallback {
    (err: string, finalBiomass?: number): void;
}
declare class BiomassCalculationUI {
    private _dialogBox;
    constructor(metabolicMapID: number, callback: BiomassResultsCallback);
    private _onBiomassReactionChosen(metabolicMapID, reaction, callback);
    private _onFinishedBiomassSpeciesEntry(speciesList, inputs, errorStringElement, metabolicMapID, reaction, callback);
    private _requestSpeciesListFromBiomassReaction(metabolicMapID, reactionID, callback, error);
    private _requestBiomassReactionList(metabolicMapID, callback, error);
    private _requestFinalBiomassComputation(metabolicMapID, reactionID, matches, callback, error);
}
interface FullStudyBiomassUIResultsCallback {
    (err: string, metabolicMapID?: number, metabolicMapFilename?: string, finalBiomass?: number): void;
}
declare class FullStudyBiomassUI {
    constructor(callback: FullStudyBiomassUIResultsCallback);
}
