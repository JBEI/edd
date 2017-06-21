import { Utl } from "./Utl"
import { EDDAuto } from "../modules/EDDAutocomplete"

// At this point, this class is experimental. It's supposed to make modal dialog boxes
// easier to create and configure.
class DialogBox {

    private _dialog:any;
    private _width:number;
    private _height:number;
    private _contentsDiv:HTMLElement;

    public constructor(width:number, height:number) {
        this._width = width;
        this._height = height;

        this._contentsDiv = Utl.JS.createElementFromString('<div></div>');
        this._dialog = $(this._contentsDiv).dialog({
            autoOpen: true,
            width: width,
            height: height,
            modal: true,
            draggable: false,

            // This hooks the overlay so we can hide the dialog if they click outside it.
            open: (event:Event, ui:JQueryUI.DialogUIParams):void => {
                $('.ui-widget-overlay').bind('click', ():void => this.term() );
                $('.ui-dialog-titlebar').hide();
            }
        });
    }

    // This removes the dialog (whereas clearContents() just removes the elements inside it).
    public term():void {
        this.clearContents();
        this._dialog.dialog('close');
    }

    // The HTML you're adding must equate to an element because we just
    // turn it into an element and add that element to our contents div.
    public addHTML(html:string):void {
        this._contentsDiv.appendChild(Utl.JS.createElementFromString(html));
    }

    public addElement(element:HTMLElement):void {
        this._contentsDiv.appendChild(element);
    }

    // Remove all sub elements.
    public clearContents():void {
        Utl.JS.removeAllChildren(this._contentsDiv);
    }

    // NOTE: This will clear out the contents of the dialog and replace with a wait spinner.
    public showWaitSpinner(caption:string, offset?:number):void {
        this.clearContents();

        offset = (typeof offset === 'undefined') ? this._height / 4 : offset;

        var el:HTMLElement = Utl.JS.createElementFromString('<div>\
                <div style="height:' + offset.toString() + 'px"></div>\
                <table width="100%"> \
                <tr><td align="center"> \
                    <div>' + caption + '<br><br> \
                        <img src="/static/main/images/loading_spinner.gif"></img> \
                    </div> \
                </td></tr> \
                </table>\
                </div>');

        this.addElement(el);
    }

    // NOTE: This will clear out the contents of the dialog and replace with the error text.
    public showMessage(message:string, onOK?:() => void):void {
        this.clearContents();

        var offset:number = this._height / 4;

        var el:HTMLElement = Utl.JS.createElementFromString('<div>\
                <div style="height:' + offset.toString() + 'px"></div>\
                <table width="100%"> \
                <tr><td align="center"> \
                    <div>' + message + '</div> \
                </td></tr> \
                </table>\
                </div>');

        this.addElement(el);
    }

}



// Returned in a list by the server in requestStudyMetabolicMap
interface ServerMetabolicMap {
    name:string;
    id:number;
    biomassCalculation:number;    // -1 if this map doesn't have a biomass calculation yet
}

interface ServerBiomassReaction {
    metabolicMapID:number;
    reactionName:string;
    reactionID:string;
}

interface ServerBiomassSpeciesEntry {
    sbmlSpeciesName:string;     // The speciesReference name in the SBML file
    eddMetaboliteName:string;   // The metabolite in EDD (from metabolite_types.type_name
                                // that matches the species, or '' if not matched yet)
}

export interface MetabolicMapChooserResult {
    (err:string,
        metabolicMapID?:number,
        metabolicMapFilename?:string,
        biomassCalculation?:number): void;
}



// This UI lets the user pick a metabolic map and a biomass reaction inside of it to use for the
// specified study.
export class StudyMetabolicMapChooser {

    private _dialogBox:DialogBox;

    constructor(checkWithServerFirst:boolean, callback:MetabolicMapChooserResult) {
        this._dialogBox = new DialogBox( 500, 500 );
        this._dialogBox.showWaitSpinner('Please wait...');

        if (checkWithServerFirst) {
            // First check the metabolic map associated with this study.
            this._requestStudyMetabolicMap( (map:ServerMetabolicMap):void => {
                if (map.id === -1) {
                    // This study hasn't bound to a metabolic map yet.
                    // Let's show a chooser for the metabolic map.
                    this._chooseMetabolicMap(callback);
                } else {
                    // Ok, everything is fine. This should only happen if someone else setup the
                    // biomass calculation for this study in the background since the page was
                    // originally loaded.
                    this._dialogBox.term();
                    callback.call({}, null, map.id, map.name, map.biomassCalculation);
                }
            }, (err:string):void => {
                callback.call({}, err);
            });
        } else {
            // This study hasn't bound to a metabolic map yet.
            // Let's show a chooser for the metabolic map.
            this._chooseMetabolicMap(callback);
        }
    }

    private _basePayload():any {
        var token:string = document.cookie.replace(
            /(?:(?:^|.*;\s*)csrftoken\s*\=\s*([^;]*).*$)|^.*$/,
            '$1');
        return { 'csrfmiddlewaretoken': token };
    }

    // Present the user with a list of SBML files to choose from. If they choose one
    // and it still requires biomass calculations, we'll go on to _matchMetabolites().
    private _chooseMetabolicMap(callback:MetabolicMapChooserResult):void {
        this._requestMetabolicMapList( (metabolicMaps:ServerMetabolicMap[]):void => {
            // Display the list.
            this._dialogBox.clearContents();
            this._dialogBox.addHTML(
                '<div>Please choose an SBML file to get the biomass data from.' +
                '<br>This is necessary to calculate carbon balance.<br><br></div>');

            var table:Utl.Table = new Utl.Table('metabolicMapChooser');
            table.table.setAttribute('cellspacing', '0');
            $(table.table).css('border-collapse', 'collapse');

            metabolicMaps.forEach((map:ServerMetabolicMap):void => {
                table.addRow();
                var column:any = table.addColumn();
                column.innerHTML = map.name;
                $(column).css('cursor', 'pointer'); // make it look like a link
                $(column).css('border-top', '1px solid #000'); // make it look like a link
                $(column).css('border-bottom', '1px solid #000'); // make it look like a link
                $(column).css('padding', '10px'); // make it look like a link
                $(column).click(this._onMetabolicMapChosen.bind(this, map, callback));
            });
            this._dialogBox.addElement(table.table);
        }, (err:string):void => {
            this._dialogBox.showMessage(err, ():void => callback.call({}, err));
        });
    }


    // Called when they click on a biomass reaction.
    private _onMetabolicMapChosen(map:ServerMetabolicMap,
            callback:MetabolicMapChooserResult):void {
        // Before we return to the caller, tell the server to store this association.
        this._requestSetStudyMetabolicMap(map.id,
            (error:string):void => {
                this._dialogBox.showMessage(error, ():void => callback.call({}, error));
            }
        );
    }


    // Get info from the server..
    private _requestStudyMetabolicMap(
            callback: (map:ServerMetabolicMap) => void,
            error: (error:string) => void): void {
        $.ajax({
            dataType: "json",
            url: "map/",
            success: callback,
            error: (jqXHR:JQueryXHR, status:string, errorText:string):void => {
                error.call({}, status + " " + errorText);
            }
        });
    }


    // Get a list of metabolic maps that we could use for this study.
    private _requestMetabolicMapList(
            callback: (metabolicMaps:ServerMetabolicMap[]) => void,
            error: (error:string) => void):void {
        $.ajax({
            dataType: "json",
            url: "/data/sbml/",
            success: callback,
            error: (jqXHR:JQueryXHR, status:string, errorText:string):void => {
                error.call({}, status + " " + errorText);
            }
        });
    }


    private _requestSetStudyMetabolicMap(metabolicMapID:number,
            callback: (err:string) => void):void {
        $.ajax({
            type: "POST",
            dataType: "json",
            url: "map/",
            data: $.extend({}, this._basePayload(), { "metabolicMapID": metabolicMapID }),
            error: (jqXHR:JQueryXHR, status:string, errorText:string):void => {
                callback.call({}, status + " " + errorText);
            }
        });
    }

}



interface BiomassResultsCallback {
    (err:string, finalBiomass?:number): void;
};

// This UI handles mapping SBML species to EDD metabolites, calculating
// the biomass, and remembering the result.
class BiomassCalculationUI {

    private _dialogBox:DialogBox;

    constructor(metabolicMapID:number, callback:BiomassResultsCallback) {
        this._dialogBox = new DialogBox( 500, 500 );

        // First, have the user pick a biomass reaction.
        this._dialogBox.showWaitSpinner('Looking up biomass reactions...');

        this._requestBiomassReactionList(metabolicMapID,
                (reactions:ServerBiomassReaction[]):void => {
            var table:Utl.Table;
            if (!reactions.length) {
                this._dialogBox.showMessage(
                    'There are no biomass reactions in this metabolic map!');
            } else {
                // Display the list of biomass reactions.
                this._dialogBox.clearContents();
                this._dialogBox.addHTML(
                    '<div>Please choose a biomass reaction to use for carbon balance.' +
                    '<br><br></div>');
                table = new Utl.Table('biomassReactionChooser');
                table.table.setAttribute('cellspacing', '0');
                $(table.table).css('border-collapse', 'collapse');

                reactions.forEach((reaction:ServerBiomassReaction):void => {
                    table.addRow();
                    var column:any = table.addColumn();
                    column.innerHTML = reaction.reactionName;
                    $(column).css('cursor', 'pointer'); // make it look like a link
                    $(column).css('border-top', '1px solid #000'); // make it look like a link
                    $(column).css('border-bottom', '1px solid #000'); // make it look like a link
                    $(column).css('padding', '10px'); // make it look like a link
                    $(column).click( ():void => {
                        this._onBiomassReactionChosen(metabolicMapID, reaction, callback);
                    });
                });
                this._dialogBox.addElement(table.table);
            }

        }, (error:string):void => {
            this._dialogBox.showMessage(error, ():void => callback.call({}, error));
        });
    }


    // The user chose a biomass reaction. Now we can show all the species in the reaction and
    // match to EDD metabolites.
    private _onBiomassReactionChosen(metabolicMapID:number, reaction:ServerBiomassReaction,
            callback:BiomassResultsCallback):void {
        // Pull a list of all metabolites in this reaction.
        this._dialogBox.showWaitSpinner('Getting species list...');
        this._requestSpeciesListFromBiomassReaction(metabolicMapID, reaction.reactionID,
                (speciesList:ServerBiomassSpeciesEntry[]):void => {
            var table:Utl.Table = new Utl.Table('biomassReactionChooser'),
                inputs:EDDAuto.Metabolite[] = [];
            table.table.setAttribute('cellspacing', '0');
            $(table.table).css('border-collapse', 'collapse');

            speciesList.forEach((species:ServerBiomassSpeciesEntry, i:number):void => {
                var speciesColumn:HTMLElement, metaboliteColumn:HTMLElement, autoComp:EDDAuto.Metabolite;
                table.addRow();
                speciesColumn = table.addColumn();
                speciesColumn.innerHTML = species.sbmlSpeciesName;
                metaboliteColumn = table.addColumn();
                autoComp = new EDDAuto.Metabolite({
                    container: $(metaboliteColumn),
                });
                autoComp.visibleInput.addClass('autocomp_metabol');
                inputs.push(autoComp);
            });

            this._dialogBox.clearContents();
            this._dialogBox.addHTML(
                '<div>Please match SBML species to EDD metabolites.<br><br></div>');
            this._dialogBox.addElement(table.table);

            var errorStringElement:HTMLElement = Utl.JS.createElementFromString(
                '<span style="font-size:12px; color:red;"></span>');
            $(errorStringElement).css('visibility', 'hidden');
            this._dialogBox.addElement(errorStringElement);

            // Create an OK button at the bottom.
            var okButton:HTMLElement = document.createElement('button');
            okButton.appendChild(document.createTextNode('OK'));
            $(okButton).click( ():void => this._onFinishedBiomassSpeciesEntry(speciesList, inputs,
                errorStringElement, metabolicMapID, reaction, callback));
            this._dialogBox.addElement(okButton);
        }, (error:string):void => {
            this._dialogBox.showMessage(error, ():void => callback.call({}, error));
        });

    }


    // Called when they click the OK button on the biomass species list.
    private _onFinishedBiomassSpeciesEntry(speciesList:ServerBiomassSpeciesEntry[], inputs:EDDAuto.Metabolite[],
        errorStringElement:HTMLElement, metabolicMapID:number, reaction:ServerBiomassReaction,
        callback:BiomassResultsCallback):void {

        // Are the inputs all filled in?
        var numEmpty:number = inputs.filter((input:EDDAuto.Metabolite):boolean => input.visibleInput.val() === '').length;

        if ($(errorStringElement).css('visibility') === 'hidden') {
            // Show them an error message, but next time they click OK, just do the biomass
            // calculation anyway.
            if (numEmpty > 0) {
                $(errorStringElement).css('visibility', 'visible');
                errorStringElement.innerHTML = '<br><br>There are ' + numEmpty.toString() +
                    ' unmatched species. If you proceed, the biomass calculation will not' +
                    ' include these. Click OK again to proceed anyway.<br><br>';
                return;
            }
        }

        // Send everything to the server and get a biomass calculation back.
        this._dialogBox.showWaitSpinner('Calculating final biomass factor...');

        var matches:any = {};
        inputs.forEach((input:EDDAuto.Metabolite, i:number):void => {
            var spName:string = speciesList[i].sbmlSpeciesName, id:string, met:any;
            id = input.val();
            met = EDDData.MetaboliteTypes[id] || {};
            matches[spName] = met.name || '';
        });

        this._requestFinalBiomassComputation(metabolicMapID, reaction.reactionID, matches,
                (finalBiomass:number):void => {
            // Finally, pass the biomass to our caller.
            this._dialogBox.term();
            callback(null, finalBiomass);
        }, (error:string):void => {
        	this._dialogBox.showMessage(error, ():void => callback.call({}, error));
        });
    }


    // Get a list of biomass reactions in the specified metabolic map.
    private _requestSpeciesListFromBiomassReaction(metabolicMapID:number, reactionID:string,
            callback: (speciesList:ServerBiomassSpeciesEntry[]) => void,
            error: (error:string) => void):void {
        $.ajax({
            dataType: "json",
            url: [ "/data/sbml", metabolicMapID, "reactions", reactionID, "" ].join("/"),
            // refactor: server returns object, existing code expects array, need to translate
            success: (data:any):void => {
                var translated:ServerBiomassSpeciesEntry[] = [];
                translated = $.map(data, (value:any, key:string):ServerBiomassSpeciesEntry => {
                    return $.extend(value, {
                        "sbmlSpeciesName": key,
                        "eddMetaboliteName": value.sn
                    });
                });
                callback.call({}, translated);
            },
            error: (jqXHR:JQueryXHR, status:string, errorText:string):void => {
                error.call({}, status + " " + errorText);
            }
        });
    }


    // Get a list of biomass reactions in the specified metabolic map.
    private _requestBiomassReactionList(metabolicMapID:number,
            callback: (reactions:ServerBiomassReaction[]) => void,
            error: (error:string) => void):void {
        $.ajax({
            dataType: "json",
            url: "/data/sbml/" + metabolicMapID + "/reactions/",
            success: callback,
            error: (jqXHR:JQueryXHR, status:string, errorText:string):void => {
                error.call({}, status + " " + errorText);
            }
        });
    }


    // This is where we pass all the species->metabolite matches to the server and ask it to
    // finalize the
    private _requestFinalBiomassComputation(metabolicMapID:number, reactionID:string, matches:any,
            callback: (finalBiomass:number) => void,
            error: (error:string) => void):void {
        $.ajax({
            type: "POST",
            dataType: "json",
            url: [ "/data/sbml", metabolicMapID, "reactions", reactionID, "compute/" ].join("/"),
            data: { "species": matches },
            success: callback,
            error: (jqXHR:JQueryXHR, status:string, errorText:string):void => {
                error.call({}, status + " " + errorText);
            }
        });
    }
}



// This is the full UI sequence to associate a metabolic map with a study
// AND calculate biomass if necessary. Note that it could succeed in choosing a new metabolic map
// but the user could cancel the biomass calculation. In that case, your callback would be called
// with a valid metabolicMapFilename but finalBiomass=-1 (and err would be set).
export interface FullStudyBiomassUIResultsCallback {
    (err:string, metabolicMapID?:number, metabolicMapFilename?:string, finalBiomass?:number): void;
};

export class FullStudyBiomassUI {
    constructor(callback:FullStudyBiomassUIResultsCallback) {
        var chooser:StudyMetabolicMapChooser, chooserHandler:MetabolicMapChooserResult;
        chooserHandler = (error:string,
                metabolicMapID?:number,
                metabolicMapFilename?:string,
                biomassCalculation?:number):void => {
            var ui:BiomassCalculationUI;
            if (error) {
                callback.call({}, error);
                return;
            }
            if (biomassCalculation === -1) {
                // The study has a metabolic map, but no biomass has been calculated for it yet.
                // We need to match all metabolites so the server can calculation biomass.
                ui = new BiomassCalculationUI(metabolicMapID,
                    (biomassErr:string, finalBiomassCalculation?:number):void => {
                        callback.call({}, biomassErr, metabolicMapID, metabolicMapFilename,
                            finalBiomassCalculation);
                    });
            } else {
                callback(null, metabolicMapID, metabolicMapFilename, biomassCalculation);
            }
        };
        // First, make sure a metabolic map is bound to the study.
        chooser = new StudyMetabolicMapChooser(true, chooserHandler);
    }
}
