/// <reference path="Utl.ts" />

// At this point, this class is experimental. It's supposed to make modal dialog boxes
// easier to create and configure.
class DialogBox {

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
			open: (event,ui) => { 
				$('.ui-widget-overlay').bind('click', () => this.term() );
				$('.ui-dialog-titlebar').hide();
				 }
			});
	}

	// This removes the dialog (whereas clearContents() just removes the elements inside it).
	public term() {
		this.clearContents();
		this._dialog.dialog('close');
	}

	// The HTML you're adding must equate to an element because we just
	// turn it into an element and add that element to our contents div.
	public addHTML(html:string) {
		this._contentsDiv.appendChild(Utl.JS.createElementFromString(html));
	}

	public addElement(element:HTMLElement) {
		this._contentsDiv.appendChild(element);
	}

	// Remove all sub elements.
	public clearContents() {
		Utl.JS.removeAllChildren(this._contentsDiv);
	}

	// NOTE: This will clear out the contents of the dialog and replace with a wait spinner.
	public showWaitSpinner(caption:string, offset?:number) {
		this.clearContents();

		offset = (typeof offset === 'undefined') ? this._height / 4 : offset;

		var el:HTMLElement = Utl.JS.createElementFromString('<div>\
				<div style="height:' + offset.toString() + 'px"></div>\
		    	<table width="100%"> \
		    	<tr><td align="center"> \
			    	<div>' + caption + '<br><br> \
			    		<img src="images/loading_spinner.gif"></img> \
			    	</div> \
			    </td></tr> \
		    	</table>\
		    	</div>');

		this.addElement(el);
	}

	// NOTE: This will clear out the contents of the dialog and replace with the error text.
	public showMessage(message:string, onOK?:()=>void) {
		this.clearContents();

		var offset = this._height / 4;

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

	private _dialog:any;
	
	private _width:number;
	private _height:number;

	private _contentsDiv:HTMLElement;
}



// Returned in a list by the server in requestStudyMetabolicMap
interface ServerMetabolicMap {
	name:string;
	id:number;
	biomassCalculation:number;	// -1 if this map doesn't have a biomass calculation yet
}

interface ServerBiomassReaction {
	metabolicMapID:number;
	reactionName:string;
	reactionID:string;
}

interface ServerBiomassSpeciesEntry {
	sbmlSpeciesName:string;		// The speciesReference name in the SBML file
	eddMetaboliteName:string    // The metabolite in EDD (from metabolite_types.type_name that matches the species, or '' if not matched yet)
}

interface MetabolicMapChooserResult { (err:string, metabolicMapID?:number, metabolicMapFilename?:string, biomassCalculation?:number): void; };



// This UI lets the user pick a metabolic map and a biomass reaction inside of it to use for the specified study.
class StudyMetabolicMapChooser {
	constructor(userID:number, studyID:number, checkWithServerFirst:boolean, callback:MetabolicMapChooserResult) {

		this._userID = userID;
		this._studyID = studyID;

		this._dialogBox = new DialogBox( 500, 500 );
		this._dialogBox.showWaitSpinner('Please wait...');

		if (checkWithServerFirst) {
			// First check the metabolic map associated with this study.
			this._requestStudyMetabolicMap( (err:string, map:ServerMetabolicMap) => {
				if (err) {
					callback(err, 0);
				} else {
					if (map.id == -1) {
						// This study hasn't bound to a metabolic map yet. 
						// Let's show a chooser for the metabolic map.
						this._chooseMetabolicMap(callback);
					} else {
						// Ok, everything is fine. This should only happen if someone else setup the
						// biomass calculation for this study in the background since the page was
						// originally loaded.
						this._dialogBox.term();
						callback(null, map.id, map.name, map.biomassCalculation);
					}
				}
			});
		} else {
			// This study hasn't bound to a metabolic map yet. 
			// Let's show a chooser for the metabolic map.
			this._chooseMetabolicMap(callback);
		}
	}


	// Present the user with a list of SBML files to choose from. If they choose one
	// and it still requires biomass calculations, we'll go on to _matchMetabolites().
	private _chooseMetabolicMap( callback:MetabolicMapChooserResult ) {
		this._requestMetabolicMapList( (err:string, metabolicMaps:ServerMetabolicMap[]) => {
			// Handle errors.
			if (err) {
				this._dialogBox.showMessage(err, () => {callback(err);});				
				return;
			}

			// Display the list.
			this._dialogBox.clearContents();
			this._dialogBox.addHTML( '<div>Please choose an SBML file to get the biomass data from.<br>This is necessary to calculate carbon balance.<br><br></div>' );

			var table = new Utl.Table('metabolicMapChooser');
			table.table.setAttribute('cellspacing', '0');
			$(table.table).css('border-collapse', 'collapse');

			for (var i=0; i < metabolicMaps.length; i++) {
				var map:ServerMetabolicMap = metabolicMaps[i];

				table.addRow();
				var column:any = table.addColumn();
				column.innerHTML = map.name;
				$(column).css('cursor', 'pointer'); // make it look like a link
				$(column).css('border-top', '1px solid #000'); // make it look like a link
				$(column).css('border-bottom', '1px solid #000'); // make it look like a link
				$(column).css('padding', '10px'); // make it look like a link
				$(column).click( this._onMetabolicMapChosen.bind(this, map, callback) );
			}
			this._dialogBox.addElement(table.table);
		});
	}


	// Called when they click on a biomass reaction.
	private _onMetabolicMapChosen( map:ServerMetabolicMap, callback:MetabolicMapChooserResult ) {
		// Before we return to the caller, tell the server to store this association.
		this._requestSetStudyMetabolicMap(this._studyID, map.id, (err:string) => {
				// Handle errors..
				if (err) {
					this._dialogBox.showMessage(err, () => {callback(err);});				
					return;
				}

				// Success! Close the dialog and return the result to our original caller.
				this._dialogBox.term();
				callback(null, map.id, map.name, map.biomassCalculation);
		});
	}


	// Get info from the server..
	private _requestStudyMetabolicMap( callback: (err:string, map:ServerMetabolicMap) => void ): void {
		$.ajax({
			type: "POST",
			dataType: "json",
	      	url: "FormAjaxResp.cgi", 
	      	data: { "action":"requestStudyMetabolicMap", "studyID":this._studyID },
	      	success: ( response:any ) => {
	      		if (response.type == "Success") {
	      			callback(null, response.data.map);
	      		} else {
	      			callback(response.message, null);
	      		}
		    }
		});
	}


	// Get a list of metabolic maps that we could use for this study.
	private _requestMetabolicMapList( callback: (err:string, metabolicMaps:ServerMetabolicMap[]) => void ):void {
		$.ajax({
			type: "POST",
			dataType: "json",
	      	url: "FormAjaxResp.cgi", 
	      	data: { "action":"requestMetabolicMapList" },
	      	success: ( response:any ) => {
	      		if (response.type == "Success") {
	      			callback(null, response.data.metabolicMaps);
	      		} else {
	      			callback(response.message, null);
	      		}
		    }
		});
	}


	private _requestSetStudyMetabolicMap( studyID:number, metabolicMapID:number, callback: (err:string) => void ):void {
		$.ajax({
			type: "POST",
			dataType: "json",
	      	url: "FormAjaxResp.cgi", 
	      	data: { "action":"setStudyMetabolicMap", studyID:studyID, metabolicMapID:metabolicMapID },
	      	success: ( response:any ) => {
	      		if (response.type == "Success") {
	      			callback(null);
	      		} else {
	      			callback(response.message);
	      		}
		    }
		});
	}


	private _userID:number;
	private _studyID:number;
	private _dialogBox:DialogBox;
}



interface BiomassResultsCallback { (err:string, finalBiomass?:number): void; };

// This UI handles mapping SBML species to EDD metabolites, calculating 
// the biomass, and remembering the result.
class BiomassCalculationUI {
	constructor(metabolicMapID:number, callback:BiomassResultsCallback) {
		this._dialogBox = new DialogBox( 500, 500 );

		// First, have the user pick a biomass reaction.
		this._dialogBox.showWaitSpinner('Looking up biomass reactions...');

		this._requestBiomassReactionList(metabolicMapID, (err:string, reactions:ServerBiomassReaction[]) => {
			
			// Handle errors..
			if (err) {
				this._dialogBox.showMessage(err, () => {callback(err);});				
				return;
			}

			if (reactions.length == 0) {
				this._dialogBox.showMessage('There are no biomass reactions in this metabolic map!');
			} else {
				// Display the list of biomass reactions.
				this._dialogBox.clearContents();
				this._dialogBox.addHTML( '<div>Please choose a biomass reaction to use for carbon balance.<br><br></div>' );

				var table = new Utl.Table('biomassReactionChooser');
				table.table.setAttribute('cellspacing', '0');
				$(table.table).css('border-collapse', 'collapse');

				for (var i=0; i < reactions.length; i++) {
					var reaction:ServerBiomassReaction = reactions[i];

					table.addRow();
					var column:any = table.addColumn();
					column.innerHTML = reaction.reactionName;
					$(column).css('cursor', 'pointer'); // make it look like a link
					$(column).css('border-top', '1px solid #000'); // make it look like a link
					$(column).css('border-bottom', '1px solid #000'); // make it look like a link
					$(column).css('padding', '10px'); // make it look like a link
					$(column).click( () => {
						this._onBiomassReactionChosen(metabolicMapID, reaction, callback);
					});
				}
				this._dialogBox.addElement(table.table);
			}

		});
	}


	// The user chose a biomass reaction. Now we can show all the species in the reaction and match to EDD metabolites.
	private _onBiomassReactionChosen(metabolicMapID:number, reaction:ServerBiomassReaction, callback:BiomassResultsCallback) {

		// Pull a list of all metabolites in this reaction.
		this._dialogBox.showWaitSpinner('Getting species list...');

		this._requestSpeciesListFromBiomassReaction(metabolicMapID, reaction.reactionID, (err:string, speciesList:ServerBiomassSpeciesEntry[]) => {
			
			// Handle errors..
			if (err) {
				this._dialogBox.showMessage(err, () => {callback(err);});				
				return;
			}

			var table = new Utl.Table('biomassReactionChooser');
			table.table.setAttribute('cellspacing', '0');
			$(table.table).css('border-collapse', 'collapse');

			var inputs:any[] = [];

			for (var i=0; i < speciesList.length; i++) {
				var species:ServerBiomassSpeciesEntry = speciesList[i];
				table.addRow();

				var speciesColumn:HTMLElement = table.addColumn();
				speciesColumn.innerHTML = species.sbmlSpeciesName;

				var metaboliteColumn:HTMLElement = table.addColumn();

				var autoCompContainer:any = EDDAutoComplete.createAutoCompleteContainer(
					"metabolite", 45, 'disamMType' + i, species.eddMetaboliteName, 0);
				metaboliteColumn.appendChild(autoCompContainer.inputElement);
				metaboliteColumn.appendChild(autoCompContainer.hiddenInputElement);
				inputs.push(autoCompContainer);
			}

			this._dialogBox.clearContents();
			this._dialogBox.addHTML( '<div>Please match SBML species to EDD metabolites.<br><br></div>' );
			this._dialogBox.addElement(table.table);

			var errorStringElement:HTMLElement = Utl.JS.createElementFromString('<span style="font-size:12px; color:red;"></span>');
			$(errorStringElement).css('visibility', 'hidden');
			this._dialogBox.addElement(errorStringElement);

			// Create an OK button at the bottom.
			var okButton:HTMLElement = document.createElement('button');
			okButton.appendChild(document.createTextNode('OK'));
			$(okButton).click( () => { this._onFinishedBiomassSpeciesEntry(speciesList, inputs, errorStringElement, metabolicMapID, reaction, callback); } );
			this._dialogBox.addElement(okButton);

			for (var i=0; i < inputs.length; i++) {
				EDDAutoComplete.initializeElement(inputs[i].inputElement);
				inputs[i].inputElement.autocompleter.setFromPrimaryElement();
				inputs[i].initialized = 1;
			}
		});

	}


	// Called when they click the OK button on the biomass species list.
	private _onFinishedBiomassSpeciesEntry(speciesList:ServerBiomassSpeciesEntry[], inputs:any[], errorStringElement:HTMLElement, 
		metabolicMapID:number, reaction:ServerBiomassReaction, callback:BiomassResultsCallback) {

		// Are the inputs all filled in?
		var numEmpty:number = 0;
		for (var i=0; i < inputs.length; i++) {
			if (inputs[i].inputElement.value == '')
				++numEmpty;
		}

		if ($(errorStringElement).css('visibility') == 'hidden') {
			// Show them an error message, but next time they click OK, just do the biomass calculation anyway.
			if (numEmpty > 0) {
				$(errorStringElement).css('visibility', 'visible');
				errorStringElement.innerHTML = '<br><br>There are ' + numEmpty.toString() + ' unmatched species. If you proceed, the biomass calculation will not include these. Click OK again to proceed anyway.<br><br>';
				return;
			}
		}

		// Send everything to the server and get a biomass calculation back.
		this._dialogBox.showWaitSpinner('Calculating final biomass factor...');

		var matches:any = {};
		for (var i=0; i < inputs.length; i++) {
			// This is super lame, but I don't see another way to recover an unsullied version of the
			// metabolite name after Autocomplete has messed with it.
			var dividerPos = inputs[i].inputElement.value.indexOf(' / ');
			if (dividerPos == -1) {
				matches[speciesList[i].sbmlSpeciesName] = inputs[i].inputElement.value;
			} else {
				matches[speciesList[i].sbmlSpeciesName] = inputs[i].inputElement.value.substring(0, dividerPos);
			}
		}

		this._requestFinalBiomassComputation( metabolicMapID, reaction.reactionID, matches, (err:string, finalBiomass:number) => {

			// Handle errors..
			if (err) {
				this._dialogBox.showMessage(err, () => {callback(err);});				
				return;
			}

			// Finally, pass the biomass to our caller.
			this._dialogBox.term();
			callback(null, finalBiomass);

		});
	}


	// Get a list of biomass reactions in the specified metabolic map.
	private _requestSpeciesListFromBiomassReaction( metabolicMapID:number, reactionID:string, callback: (err:string, speciesList:ServerBiomassSpeciesEntry[]) => void ):void {
		$.ajax({
			type: "POST",
			dataType: "json",
	      	url: "FormAjaxResp.cgi", 
	      	data: { "action":"requestSpeciesListFromBiomassReaction", metabolicMapID:metabolicMapID, reactionID:reactionID },
	      	success: ( response:any ) => {
	      		if (response.type == "Success") {
	      			callback(null, response.data.speciesList);
	      		} else {
	      			callback(response.message, null);
	      		}
		    }
		});
	}


	// Get a list of biomass reactions in the specified metabolic map.
	private _requestBiomassReactionList( metabolicMapID:number, callback: (err:string, reactions:ServerBiomassReaction[]) => void ):void {
		$.ajax({
			type: "POST",
			dataType: "json",
	      	url: "FormAjaxResp.cgi", 
	      	data: { "action":"requestBiomassReactionList", metabolicMapID:metabolicMapID },
	      	success: ( response:any ) => {
	      		if (response.type == "Success") {
	      			callback(null, response.data.reactions);
	      		} else {
	      			callback(response.message, null);
	      		}
		    }
		});
	}


	// This is where we pass all the species->metabolite matches to the server and ask it to finalize the 
	private _requestFinalBiomassComputation( metabolicMapID:number, reactionID:string, matches:any, callback: (err:string, finalBiomass:number) => void ):void {
		$.ajax({
			type: "POST",
			dataType: "json",
	      	url: "FormAjaxResp.cgi", 
	      	data: { "action":"requestFinalBiomassComputation", metabolicMapID:metabolicMapID, reactionID:reactionID, speciesMatches:JSON.stringify(matches) },
	      	success: ( response:any ) => {
	      		if (response.type == "Success") {
	      			callback(null, parseFloat(response.data.finalBiomass));
	      		} else {
	      			callback(response.message, null);
	      		}
		    }
		});
	}


	private _dialogBox:DialogBox;
}



// This is the full UI sequence to associate a metabolic map with a study
// AND calculate biomass if necessary. Note that it could succeed in choosing a new metabolic map
// but the user could cancel the biomass calculation. In that case, your callback would be called
// with a valid metabolicMapFilename but finalBiomass=-1 (and err would be set).
interface FullStudyBiomassUIResultsCallback { (err:string, metabolicMapID?:number, metabolicMapFilename?:string, finalBiomass?:number): void; };

class FullStudyBiomassUI {
	constructor(userID:number, studyID:number, callback:FullStudyBiomassUIResultsCallback) {
		// First, make sure a metabolic map is bound to the study.
		new StudyMetabolicMapChooser(userID, studyID, true, (err:string, metabolicMapID?:number, metabolicMapFilename?:string, biomassCalculation?:number) => {
			
			// Handle errors.
			if (err) {
				callback(err);
				return;
			}

			// Now, make sure that this metabolic map has a biomass.
			if (biomassCalculation == -1) {
				// The study has a metabolic map, but no biomass has been calculated for it yet.
				// We need to match all metabolites so the server can calculation biomass.
				new BiomassCalculationUI(metabolicMapID, (biomassErr:string, finalBiomassCalculation?:number) => {
					callback(biomassErr, metabolicMapID, metabolicMapFilename, finalBiomassCalculation);
				});
			} else {
				callback(null, metabolicMapID, metabolicMapFilename, biomassCalculation);
			}

		});
	}
}



