/// <reference path="Utl.d.ts" />
declare class DialogBox {
    constructor(width: number, height: number);
    term(): void;
    addHTML(html: string): void;
    addElement(element: HTMLElement): void;
    clearContents(): void;
    showWaitSpinner(caption: string, offset?: number): void;
    showMessage(message: string, onOK?: () => void): void;
    private _dialog;
    private _width;
    private _height;
    private _contentsDiv;
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
    constructor(userID: number, studyID: number, checkWithServerFirst: boolean, callback: MetabolicMapChooserResult);
    private _chooseMetabolicMap(callback);
    private _onMetabolicMapChosen(map, callback);
    private _requestStudyMetabolicMap(callback);
    private _requestMetabolicMapList(callback);
    private _requestSetStudyMetabolicMap(studyID, metabolicMapID, callback);
    private _userID;
    private _studyID;
    private _dialogBox;
}
interface BiomassResultsCallback {
    (err: string, finalBiomass?: number): void;
}
declare class BiomassCalculationUI {
    constructor(metabolicMapID: number, callback: BiomassResultsCallback);
    private _onBiomassReactionChosen(metabolicMapID, reaction, callback);
    private _onFinishedBiomassSpeciesEntry(speciesList, inputs, errorStringElement, metabolicMapID, reaction, callback);
    private _requestSpeciesListFromBiomassReaction(metabolicMapID, reactionID, callback);
    private _requestBiomassReactionList(metabolicMapID, callback);
    private _requestFinalBiomassComputation(metabolicMapID, reactionID, matches, callback);
    private _dialogBox;
}
interface FullStudyBiomassUIResultsCallback {
    (err: string, metabolicMapID?: number, metabolicMapFilename?: string, finalBiomass?: number): void;
}
declare class FullStudyBiomassUI {
    constructor(userID: number, studyID: number, callback: FullStudyBiomassUIResultsCallback);
}
