/// <reference path="Utl.ts" />
// At this point, this class is experimental. It's supposed to make modal dialog boxes
// easier to create and configure.
var DialogBox = (function () {
    function DialogBox(width, height) {
        var _this = this;
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
            open: function (event, ui) {
                $('.ui-widget-overlay').bind('click', function () { return _this.term(); });
                $('.ui-dialog-titlebar').hide();
            }
        });
    }
    // This removes the dialog (whereas clearContents() just removes the elements inside it).
    DialogBox.prototype.term = function () {
        this.clearContents();
        this._dialog.dialog('close');
    };
    // The HTML you're adding must equate to an element because we just
    // turn it into an element and add that element to our contents div.
    DialogBox.prototype.addHTML = function (html) {
        this._contentsDiv.appendChild(Utl.JS.createElementFromString(html));
    };
    DialogBox.prototype.addElement = function (element) {
        this._contentsDiv.appendChild(element);
    };
    // Remove all sub elements.
    DialogBox.prototype.clearContents = function () {
        Utl.JS.removeAllChildren(this._contentsDiv);
    };
    // NOTE: This will clear out the contents of the dialog and replace with a wait spinner.
    DialogBox.prototype.showWaitSpinner = function (caption, offset) {
        this.clearContents();
        offset = (typeof offset === 'undefined') ? this._height / 4 : offset;
        var el = Utl.JS.createElementFromString('<div>\
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
    };
    // NOTE: This will clear out the contents of the dialog and replace with the error text.
    DialogBox.prototype.showMessage = function (message, onOK) {
        this.clearContents();
        var offset = this._height / 4;
        var el = Utl.JS.createElementFromString('<div>\
				<div style="height:' + offset.toString() + 'px"></div>\
		    	<table width="100%"> \
		    	<tr><td align="center"> \
			    	<div>' + message + '</div> \
			    </td></tr> \
		    	</table>\
		    	</div>');
        this.addElement(el);
    };
    return DialogBox;
})();
;
// This UI lets the user pick a metabolic map and a biomass reaction inside of it to use for the specified study.
var StudyMetabolicMapChooser = (function () {
    function StudyMetabolicMapChooser(userID, studyID, checkWithServerFirst, callback) {
        var _this = this;
        this._userID = userID;
        this._studyID = studyID;
        this._dialogBox = new DialogBox(500, 500);
        this._dialogBox.showWaitSpinner('Please wait...');
        if (checkWithServerFirst) {
            // First check the metabolic map associated with this study.
            this._requestStudyMetabolicMap(function (err, map) {
                if (err) {
                    callback(err, 0);
                }
                else {
                    if (map.id == -1) {
                        // This study hasn't bound to a metabolic map yet. 
                        // Let's show a chooser for the metabolic map.
                        _this._chooseMetabolicMap(callback);
                    }
                    else {
                        // Ok, everything is fine. This should only happen if someone else setup the
                        // biomass calculation for this study in the background since the page was
                        // originally loaded.
                        _this._dialogBox.term();
                        callback(null, map.id, map.name, map.biomassCalculation);
                    }
                }
            });
        }
        else {
            // This study hasn't bound to a metabolic map yet. 
            // Let's show a chooser for the metabolic map.
            this._chooseMetabolicMap(callback);
        }
    }
    // Present the user with a list of SBML files to choose from. If they choose one
    // and it still requires biomass calculations, we'll go on to _matchMetabolites().
    StudyMetabolicMapChooser.prototype._chooseMetabolicMap = function (callback) {
        var _this = this;
        this._requestMetabolicMapList(function (err, metabolicMaps) {
            // Handle errors.
            if (err) {
                _this._dialogBox.showMessage(err, function () {
                    callback(err);
                });
                return;
            }
            // Display the list.
            _this._dialogBox.clearContents();
            _this._dialogBox.addHTML('<div>Please choose an SBML file to get the biomass data from.<br>This is necessary to calculate carbon balance.<br><br></div>');
            var table = new Utl.Table('metabolicMapChooser');
            table.table.setAttribute('cellspacing', '0');
            $(table.table).css('border-collapse', 'collapse');
            for (var i = 0; i < metabolicMaps.length; i++) {
                var map = metabolicMaps[i];
                table.addRow();
                var column = table.addColumn();
                column.innerHTML = map.name;
                $(column).css('cursor', 'pointer'); // make it look like a link
                $(column).css('border-top', '1px solid #000'); // make it look like a link
                $(column).css('border-bottom', '1px solid #000'); // make it look like a link
                $(column).css('padding', '10px'); // make it look like a link
                $(column).click(_this._onMetabolicMapChosen.bind(_this, map, callback));
            }
            _this._dialogBox.addElement(table.table);
        });
    };
    // Called when they click on a biomass reaction.
    StudyMetabolicMapChooser.prototype._onMetabolicMapChosen = function (map, callback) {
        var _this = this;
        // Before we return to the caller, tell the server to store this association.
        this._requestSetStudyMetabolicMap(this._studyID, map.id, function (err) {
            // Handle errors..
            if (err) {
                _this._dialogBox.showMessage(err, function () {
                    callback(err);
                });
                return;
            }
            // Success! Close the dialog and return the result to our original caller.
            _this._dialogBox.term();
            callback(null, map.id, map.name, map.biomassCalculation);
        });
    };
    // Get info from the server..
    StudyMetabolicMapChooser.prototype._requestStudyMetabolicMap = function (callback) {
        $.ajax({
            type: "POST",
            dataType: "json",
            url: "FormAjaxResp.cgi",
            data: { "action": "requestStudyMetabolicMap", "studyID": this._studyID },
            success: function (response) {
                if (response.type == "Success") {
                    callback(null, response.data.map);
                }
                else {
                    callback(response.message, null);
                }
            }
        });
    };
    // Get a list of metabolic maps that we could use for this study.
    StudyMetabolicMapChooser.prototype._requestMetabolicMapList = function (callback) {
        $.ajax({
            type: "POST",
            dataType: "json",
            url: "FormAjaxResp.cgi",
            data: { "action": "requestMetabolicMapList" },
            success: function (response) {
                if (response.type == "Success") {
                    callback(null, response.data.metabolicMaps);
                }
                else {
                    callback(response.message, null);
                }
            }
        });
    };
    StudyMetabolicMapChooser.prototype._requestSetStudyMetabolicMap = function (studyID, metabolicMapID, callback) {
        $.ajax({
            type: "POST",
            dataType: "json",
            url: "FormAjaxResp.cgi",
            data: { "action": "setStudyMetabolicMap", studyID: studyID, metabolicMapID: metabolicMapID },
            success: function (response) {
                if (response.type == "Success") {
                    callback(null);
                }
                else {
                    callback(response.message);
                }
            }
        });
    };
    return StudyMetabolicMapChooser;
})();
;
// This UI handles mapping SBML species to EDD metabolites, calculating 
// the biomass, and remembering the result.
var BiomassCalculationUI = (function () {
    function BiomassCalculationUI(metabolicMapID, callback) {
        var _this = this;
        this._dialogBox = new DialogBox(500, 500);
        // First, have the user pick a biomass reaction.
        this._dialogBox.showWaitSpinner('Looking up biomass reactions...');
        this._requestBiomassReactionList(metabolicMapID, function (err, reactions) {
            // Handle errors..
            if (err) {
                _this._dialogBox.showMessage(err, function () {
                    callback(err);
                });
                return;
            }
            if (reactions.length == 0) {
                _this._dialogBox.showMessage('There are no biomass reactions in this metabolic map!');
            }
            else {
                // Display the list of biomass reactions.
                _this._dialogBox.clearContents();
                _this._dialogBox.addHTML('<div>Please choose a biomass reaction to use for carbon balance.<br><br></div>');
                var table = new Utl.Table('biomassReactionChooser');
                table.table.setAttribute('cellspacing', '0');
                $(table.table).css('border-collapse', 'collapse');
                for (var i = 0; i < reactions.length; i++) {
                    var reaction = reactions[i];
                    table.addRow();
                    var column = table.addColumn();
                    column.innerHTML = reaction.reactionName;
                    $(column).css('cursor', 'pointer'); // make it look like a link
                    $(column).css('border-top', '1px solid #000'); // make it look like a link
                    $(column).css('border-bottom', '1px solid #000'); // make it look like a link
                    $(column).css('padding', '10px'); // make it look like a link
                    $(column).click(function () {
                        _this._onBiomassReactionChosen(metabolicMapID, reaction, callback);
                    });
                }
                _this._dialogBox.addElement(table.table);
            }
        });
    }
    // The user chose a biomass reaction. Now we can show all the species in the reaction and match to EDD metabolites.
    BiomassCalculationUI.prototype._onBiomassReactionChosen = function (metabolicMapID, reaction, callback) {
        var _this = this;
        // Pull a list of all metabolites in this reaction.
        this._dialogBox.showWaitSpinner('Getting species list...');
        this._requestSpeciesListFromBiomassReaction(metabolicMapID, reaction.reactionID, function (err, speciesList) {
            // Handle errors..
            if (err) {
                _this._dialogBox.showMessage(err, function () {
                    callback(err);
                });
                return;
            }
            var table = new Utl.Table('biomassReactionChooser');
            table.table.setAttribute('cellspacing', '0');
            $(table.table).css('border-collapse', 'collapse');
            var inputs = [];
            for (var i = 0; i < speciesList.length; i++) {
                var species = speciesList[i];
                table.addRow();
                var speciesColumn = table.addColumn();
                speciesColumn.innerHTML = species.sbmlSpeciesName;
                var metaboliteColumn = table.addColumn();
                var autoCompContainer = EDDAutoComplete.createAutoCompleteContainer("metabolite", 45, 'disamMType' + i, species.eddMetaboliteName, 0);
                metaboliteColumn.appendChild(autoCompContainer.inputElement);
                metaboliteColumn.appendChild(autoCompContainer.hiddenInputElement);
                inputs.push(autoCompContainer);
            }
            _this._dialogBox.clearContents();
            _this._dialogBox.addHTML('<div>Please match SBML species to EDD metabolites.<br><br></div>');
            _this._dialogBox.addElement(table.table);
            var errorStringElement = Utl.JS.createElementFromString('<span style="font-size:12px; color:red;"></span>');
            $(errorStringElement).css('visibility', 'hidden');
            _this._dialogBox.addElement(errorStringElement);
            // Create an OK button at the bottom.
            var okButton = document.createElement('button');
            okButton.appendChild(document.createTextNode('OK'));
            $(okButton).click(function () {
                _this._onFinishedBiomassSpeciesEntry(speciesList, inputs, errorStringElement, metabolicMapID, reaction, callback);
            });
            _this._dialogBox.addElement(okButton);
            for (var i = 0; i < inputs.length; i++) {
                EDDAutoComplete.initializeElement(inputs[i].inputElement);
                inputs[i].inputElement.autocompleter.setFromPrimaryElement();
                inputs[i].initialized = 1;
            }
        });
    };
    // Called when they click the OK button on the biomass species list.
    BiomassCalculationUI.prototype._onFinishedBiomassSpeciesEntry = function (speciesList, inputs, errorStringElement, metabolicMapID, reaction, callback) {
        var _this = this;
        // Are the inputs all filled in?
        var numEmpty = 0;
        for (var i = 0; i < inputs.length; i++) {
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
        var matches = {};
        for (var i = 0; i < inputs.length; i++) {
            // This is super lame, but I don't see another way to recover an unsullied version of the
            // metabolite name after Autocomplete has messed with it.
            var dividerPos = inputs[i].inputElement.value.indexOf(' / ');
            if (dividerPos == -1) {
                matches[speciesList[i].sbmlSpeciesName] = inputs[i].inputElement.value;
            }
            else {
                matches[speciesList[i].sbmlSpeciesName] = inputs[i].inputElement.value.substring(0, dividerPos);
            }
        }
        this._requestFinalBiomassComputation(metabolicMapID, reaction.reactionID, matches, function (err, finalBiomass) {
            // Handle errors..
            if (err) {
                _this._dialogBox.showMessage(err, function () {
                    callback(err);
                });
                return;
            }
            // Finally, pass the biomass to our caller.
            _this._dialogBox.term();
            callback(null, finalBiomass);
        });
    };
    // Get a list of biomass reactions in the specified metabolic map.
    BiomassCalculationUI.prototype._requestSpeciesListFromBiomassReaction = function (metabolicMapID, reactionID, callback) {
        $.ajax({
            type: "POST",
            dataType: "json",
            url: "FormAjaxResp.cgi",
            data: { "action": "requestSpeciesListFromBiomassReaction", metabolicMapID: metabolicMapID, reactionID: reactionID },
            success: function (response) {
                if (response.type == "Success") {
                    callback(null, response.data.speciesList);
                }
                else {
                    callback(response.message, null);
                }
            }
        });
    };
    // Get a list of biomass reactions in the specified metabolic map.
    BiomassCalculationUI.prototype._requestBiomassReactionList = function (metabolicMapID, callback) {
        $.ajax({
            type: "POST",
            dataType: "json",
            url: "FormAjaxResp.cgi",
            data: { "action": "requestBiomassReactionList", metabolicMapID: metabolicMapID },
            success: function (response) {
                if (response.type == "Success") {
                    callback(null, response.data.reactions);
                }
                else {
                    callback(response.message, null);
                }
            }
        });
    };
    // This is where we pass all the species->metabolite matches to the server and ask it to finalize the 
    BiomassCalculationUI.prototype._requestFinalBiomassComputation = function (metabolicMapID, reactionID, matches, callback) {
        $.ajax({
            type: "POST",
            dataType: "json",
            url: "FormAjaxResp.cgi",
            data: { "action": "requestFinalBiomassComputation", metabolicMapID: metabolicMapID, reactionID: reactionID, speciesMatches: JSON.stringify(matches) },
            success: function (response) {
                if (response.type == "Success") {
                    callback(null, parseFloat(response.data.finalBiomass));
                }
                else {
                    callback(response.message, null);
                }
            }
        });
    };
    return BiomassCalculationUI;
})();
;
var FullStudyBiomassUI = (function () {
    function FullStudyBiomassUI(userID, studyID, callback) {
        // First, make sure a metabolic map is bound to the study.
        new StudyMetabolicMapChooser(userID, studyID, true, function (err, metabolicMapID, metabolicMapFilename, biomassCalculation) {
            // Handle errors.
            if (err) {
                callback(err);
                return;
            }
            // Now, make sure that this metabolic map has a biomass.
            if (biomassCalculation == -1) {
                // The study has a metabolic map, but no biomass has been calculated for it yet.
                // We need to match all metabolites so the server can calculation biomass.
                new BiomassCalculationUI(metabolicMapID, function (biomassErr, finalBiomassCalculation) {
                    callback(biomassErr, metabolicMapID, metabolicMapFilename, finalBiomassCalculation);
                });
            }
            else {
                callback(null, metabolicMapID, metabolicMapFilename, biomassCalculation);
            }
        });
    }
    return FullStudyBiomassUI;
})();
//# sourceMappingURL=BiomassCalculationUI.js.map