// Compiled to JS on: Thu Jan 21 2016 17:27:10  
/// <reference path="typescript-declarations.d.ts" />
/// <reference path="Utl.ts" />
var EDD_auto = EDD_auto || {};
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
                        <img src="/static/main/images/loading_spinner.gif"></img> \
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
// This UI lets the user pick a metabolic map and a biomass reaction inside of it to use for the
// specified study.
var StudyMetabolicMapChooser = (function () {
    function StudyMetabolicMapChooser(checkWithServerFirst, callback) {
        var _this = this;
        this._dialogBox = new DialogBox(500, 500);
        this._dialogBox.showWaitSpinner('Please wait...');
        if (checkWithServerFirst) {
            // First check the metabolic map associated with this study.
            this._requestStudyMetabolicMap(function (map) {
                if (map.id === -1) {
                    // This study hasn't bound to a metabolic map yet. 
                    // Let's show a chooser for the metabolic map.
                    _this._chooseMetabolicMap(callback);
                }
                else {
                    // Ok, everything is fine. This should only happen if someone else setup the
                    // biomass calculation for this study in the background since the page was
                    // originally loaded.
                    _this._dialogBox.term();
                    callback.call({}, null, map.id, map.name, map.biomassCalculation);
                }
            }, function (err) {
                callback.call({}, err);
            });
        }
        else {
            // This study hasn't bound to a metabolic map yet. 
            // Let's show a chooser for the metabolic map.
            this._chooseMetabolicMap(callback);
        }
    }
    StudyMetabolicMapChooser.prototype._basePayload = function () {
        var token = document.cookie.replace(/(?:(?:^|.*;\s*)csrftoken\s*\=\s*([^;]*).*$)|^.*$/, '$1');
        return { 'csrfmiddlewaretoken': token };
    };
    // Present the user with a list of SBML files to choose from. If they choose one
    // and it still requires biomass calculations, we'll go on to _matchMetabolites().
    StudyMetabolicMapChooser.prototype._chooseMetabolicMap = function (callback) {
        var _this = this;
        this._requestMetabolicMapList(function (metabolicMaps) {
            // Display the list.
            _this._dialogBox.clearContents();
            _this._dialogBox.addHTML('<div>Please choose an SBML file to get the biomass data from.' +
                '<br>This is necessary to calculate carbon balance.<br><br></div>');
            var table = new Utl.Table('metabolicMapChooser');
            table.table.setAttribute('cellspacing', '0');
            $(table.table).css('border-collapse', 'collapse');
            metabolicMaps.forEach(function (map) {
                table.addRow();
                var column = table.addColumn();
                column.innerHTML = map.name;
                $(column).css('cursor', 'pointer'); // make it look like a link
                $(column).css('border-top', '1px solid #000'); // make it look like a link
                $(column).css('border-bottom', '1px solid #000'); // make it look like a link
                $(column).css('padding', '10px'); // make it look like a link
                $(column).click(_this._onMetabolicMapChosen.bind(_this, map, callback));
            });
            _this._dialogBox.addElement(table.table);
        }, function (err) {
            _this._dialogBox.showMessage(err, function () { return callback.call({}, err); });
        });
    };
    // Called when they click on a biomass reaction.
    StudyMetabolicMapChooser.prototype._onMetabolicMapChosen = function (map, callback) {
        var _this = this;
        // Before we return to the caller, tell the server to store this association.
        this._requestSetStudyMetabolicMap(map.id, function (error) {
            _this._dialogBox.showMessage(error, function () { return callback.call({}, error); });
        });
    };
    // Get info from the server..
    StudyMetabolicMapChooser.prototype._requestStudyMetabolicMap = function (callback, error) {
        $.ajax({
            dataType: "json",
            url: "map/",
            success: callback,
            error: function (jqXHR, status, errorText) {
                error.call({}, status + " " + errorText);
            }
        });
    };
    // Get a list of metabolic maps that we could use for this study.
    StudyMetabolicMapChooser.prototype._requestMetabolicMapList = function (callback, error) {
        $.ajax({
            dataType: "json",
            url: "/data/sbml/",
            success: callback,
            error: function (jqXHR, status, errorText) {
                error.call({}, status + " " + errorText);
            }
        });
    };
    StudyMetabolicMapChooser.prototype._requestSetStudyMetabolicMap = function (metabolicMapID, callback) {
        $.ajax({
            type: "POST",
            dataType: "json",
            url: "map/",
            data: $.extend({}, this._basePayload(), { "metabolicMapID": metabolicMapID }),
            error: function (jqXHR, status, errorText) {
                callback.call({}, status + " " + errorText);
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
        this._requestBiomassReactionList(metabolicMapID, function (reactions) {
            var table;
            if (!reactions.length) {
                _this._dialogBox.showMessage('There are no biomass reactions in this metabolic map!');
            }
            else {
                // Display the list of biomass reactions.
                _this._dialogBox.clearContents();
                _this._dialogBox.addHTML('<div>Please choose a biomass reaction to use for carbon balance.' +
                    '<br><br></div>');
                table = new Utl.Table('biomassReactionChooser');
                table.table.setAttribute('cellspacing', '0');
                $(table.table).css('border-collapse', 'collapse');
                reactions.forEach(function (reaction) {
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
                });
                _this._dialogBox.addElement(table.table);
            }
        }, function (error) {
            _this._dialogBox.showMessage(error, function () { return callback.call({}, error); });
        });
    }
    // The user chose a biomass reaction. Now we can show all the species in the reaction and
    // match to EDD metabolites.
    BiomassCalculationUI.prototype._onBiomassReactionChosen = function (metabolicMapID, reaction, callback) {
        var _this = this;
        // Pull a list of all metabolites in this reaction.
        this._dialogBox.showWaitSpinner('Getting species list...');
        this._requestSpeciesListFromBiomassReaction(metabolicMapID, reaction.reactionID, function (speciesList) {
            var table = new Utl.Table('biomassReactionChooser'), inputs = [];
            table.table.setAttribute('cellspacing', '0');
            $(table.table).css('border-collapse', 'collapse');
            speciesList.forEach(function (species, i) {
                var speciesColumn, metaboliteColumn, autoComp;
                table.addRow();
                speciesColumn = table.addColumn();
                speciesColumn.innerHTML = species.sbmlSpeciesName;
                metaboliteColumn = table.addColumn();
                autoComp = EDD_auto.create_autocomplete(metaboliteColumn);
                autoComp.addClass('autocomp_metabol');
                inputs.push(autoComp);
            });
            _this._dialogBox.clearContents();
            _this._dialogBox.addHTML('<div>Please match SBML species to EDD metabolites.<br><br></div>');
            _this._dialogBox.addElement(table.table);
            var errorStringElement = Utl.JS.createElementFromString('<span style="font-size:12px; color:red;"></span>');
            $(errorStringElement).css('visibility', 'hidden');
            _this._dialogBox.addElement(errorStringElement);
            // Create an OK button at the bottom.
            var okButton = document.createElement('button');
            okButton.appendChild(document.createTextNode('OK'));
            $(okButton).click(function () { return _this._onFinishedBiomassSpeciesEntry(speciesList, inputs, errorStringElement, metabolicMapID, reaction, callback); });
            _this._dialogBox.addElement(okButton);
            inputs.forEach(function (input) {
                EDD_auto.setup_field_autocomplete(input, 'Metabolite', EDDData.MetaboliteTypes || {});
            });
        }, function (error) {
            _this._dialogBox.showMessage(error, function () { return callback.call({}, error); });
        });
    };
    // Called when they click the OK button on the biomass species list.
    BiomassCalculationUI.prototype._onFinishedBiomassSpeciesEntry = function (speciesList, inputs, errorStringElement, metabolicMapID, reaction, callback) {
        var _this = this;
        // Are the inputs all filled in?
        var numEmpty = inputs.filter(function (input) { return input.val() === ''; }).length;
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
        var matches = {};
        inputs.forEach(function (input, i) {
            var spName = speciesList[i].sbmlSpeciesName, id, met;
            id = input.next('input[type=hidden]').val();
            met = EDDData.MetaboliteTypes[id] || {};
            matches[spName] = met.name || '';
        });
        this._requestFinalBiomassComputation(metabolicMapID, reaction.reactionID, matches, function (finalBiomass) {
            // Finally, pass the biomass to our caller.
            _this._dialogBox.term();
            callback(null, finalBiomass);
        }, function (error) {
            _this._dialogBox.showMessage(error, function () { return callback.call({}, error); });
        });
    };
    // Get a list of biomass reactions in the specified metabolic map.
    BiomassCalculationUI.prototype._requestSpeciesListFromBiomassReaction = function (metabolicMapID, reactionID, callback, error) {
        $.ajax({
            dataType: "json",
            url: ["/data/sbml", metabolicMapID, "reactions", reactionID, ""].join("/"),
            // refactor: server returns object, existing code expects array, need to translate
            success: function (data) {
                var translated = [];
                translated = $.map(data, function (value, key) {
                    return $.extend(value, {
                        "sbmlSpeciesName": key,
                        "eddMetaboliteName": value.sn
                    });
                });
                callback.call({}, translated);
            },
            error: function (jqXHR, status, errorText) {
                error.call({}, status + " " + errorText);
            }
        });
    };
    // Get a list of biomass reactions in the specified metabolic map.
    BiomassCalculationUI.prototype._requestBiomassReactionList = function (metabolicMapID, callback, error) {
        $.ajax({
            dataType: "json",
            url: "/data/sbml/" + metabolicMapID + "/reactions/",
            success: callback,
            error: function (jqXHR, status, errorText) {
                error.call({}, status + " " + errorText);
            }
        });
    };
    // This is where we pass all the species->metabolite matches to the server and ask it to
    // finalize the 
    BiomassCalculationUI.prototype._requestFinalBiomassComputation = function (metabolicMapID, reactionID, matches, callback, error) {
        $.ajax({
            type: "POST",
            dataType: "json",
            url: ["/data/sbml", metabolicMapID, "reactions", reactionID, "compute/"].join("/"),
            data: { "species": matches },
            success: callback,
            error: function (jqXHR, status, errorText) {
                error.call({}, status + " " + errorText);
            }
        });
    };
    return BiomassCalculationUI;
})();
;
var FullStudyBiomassUI = (function () {
    function FullStudyBiomassUI(callback) {
        var chooser, chooserHandler;
        chooserHandler = function (error, metabolicMapID, metabolicMapFilename, biomassCalculation) {
            var ui;
            if (error) {
                callback.call({}, error);
                return;
            }
            if (biomassCalculation === -1) {
                // The study has a metabolic map, but no biomass has been calculated for it yet.
                // We need to match all metabolites so the server can calculation biomass.
                ui = new BiomassCalculationUI(metabolicMapID, function (biomassErr, finalBiomassCalculation) {
                    callback.call({}, biomassErr, metabolicMapID, metabolicMapFilename, finalBiomassCalculation);
                });
            }
            else {
                callback(null, metabolicMapID, metabolicMapFilename, biomassCalculation);
            }
        };
        // First, make sure a metabolic map is bound to the study.
        chooser = new StudyMetabolicMapChooser(true, chooserHandler);
    }
    return FullStudyBiomassUI;
})();
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiQmlvbWFzc0NhbGN1bGF0aW9uVUkuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJCaW9tYXNzQ2FsY3VsYXRpb25VSS50cyJdLCJuYW1lcyI6WyJEaWFsb2dCb3giLCJEaWFsb2dCb3guY29uc3RydWN0b3IiLCJEaWFsb2dCb3gudGVybSIsIkRpYWxvZ0JveC5hZGRIVE1MIiwiRGlhbG9nQm94LmFkZEVsZW1lbnQiLCJEaWFsb2dCb3guY2xlYXJDb250ZW50cyIsIkRpYWxvZ0JveC5zaG93V2FpdFNwaW5uZXIiLCJEaWFsb2dCb3guc2hvd01lc3NhZ2UiLCJTdHVkeU1ldGFib2xpY01hcENob29zZXIiLCJTdHVkeU1ldGFib2xpY01hcENob29zZXIuY29uc3RydWN0b3IiLCJTdHVkeU1ldGFib2xpY01hcENob29zZXIuX2Jhc2VQYXlsb2FkIiwiU3R1ZHlNZXRhYm9saWNNYXBDaG9vc2VyLl9jaG9vc2VNZXRhYm9saWNNYXAiLCJTdHVkeU1ldGFib2xpY01hcENob29zZXIuX29uTWV0YWJvbGljTWFwQ2hvc2VuIiwiU3R1ZHlNZXRhYm9saWNNYXBDaG9vc2VyLl9yZXF1ZXN0U3R1ZHlNZXRhYm9saWNNYXAiLCJTdHVkeU1ldGFib2xpY01hcENob29zZXIuX3JlcXVlc3RNZXRhYm9saWNNYXBMaXN0IiwiU3R1ZHlNZXRhYm9saWNNYXBDaG9vc2VyLl9yZXF1ZXN0U2V0U3R1ZHlNZXRhYm9saWNNYXAiLCJCaW9tYXNzQ2FsY3VsYXRpb25VSSIsIkJpb21hc3NDYWxjdWxhdGlvblVJLmNvbnN0cnVjdG9yIiwiQmlvbWFzc0NhbGN1bGF0aW9uVUkuX29uQmlvbWFzc1JlYWN0aW9uQ2hvc2VuIiwiQmlvbWFzc0NhbGN1bGF0aW9uVUkuX29uRmluaXNoZWRCaW9tYXNzU3BlY2llc0VudHJ5IiwiQmlvbWFzc0NhbGN1bGF0aW9uVUkuX3JlcXVlc3RTcGVjaWVzTGlzdEZyb21CaW9tYXNzUmVhY3Rpb24iLCJCaW9tYXNzQ2FsY3VsYXRpb25VSS5fcmVxdWVzdEJpb21hc3NSZWFjdGlvbkxpc3QiLCJCaW9tYXNzQ2FsY3VsYXRpb25VSS5fcmVxdWVzdEZpbmFsQmlvbWFzc0NvbXB1dGF0aW9uIiwiRnVsbFN0dWR5QmlvbWFzc1VJIiwiRnVsbFN0dWR5QmlvbWFzc1VJLmNvbnN0cnVjdG9yIl0sIm1hcHBpbmdzIjoiQUFBQSxnREFBZ0Q7QUFDaEQscURBQXFEO0FBQ3JELCtCQUErQjtBQUUvQixJQUFJLFFBQVEsR0FBRyxRQUFRLElBQUksRUFBRSxDQUFDO0FBRTlCLHNGQUFzRjtBQUN0RixrQ0FBa0M7QUFDbEM7SUFPSUEsbUJBQW1CQSxLQUFZQSxFQUFFQSxNQUFhQTtRQVBsREMsaUJBc0ZDQTtRQTlFT0EsSUFBSUEsQ0FBQ0EsTUFBTUEsR0FBR0EsS0FBS0EsQ0FBQ0E7UUFDcEJBLElBQUlBLENBQUNBLE9BQU9BLEdBQUdBLE1BQU1BLENBQUNBO1FBRXRCQSxJQUFJQSxDQUFDQSxZQUFZQSxHQUFHQSxHQUFHQSxDQUFDQSxFQUFFQSxDQUFDQSx1QkFBdUJBLENBQUNBLGFBQWFBLENBQUNBLENBQUNBO1FBQ2xFQSxJQUFJQSxDQUFDQSxPQUFPQSxHQUFHQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxDQUFDQSxNQUFNQSxDQUFDQTtZQUN2Q0EsUUFBUUEsRUFBRUEsSUFBSUE7WUFDZEEsS0FBS0EsRUFBRUEsS0FBS0E7WUFDWkEsTUFBTUEsRUFBRUEsTUFBTUE7WUFDZEEsS0FBS0EsRUFBRUEsSUFBSUE7WUFDWEEsU0FBU0EsRUFBRUEsS0FBS0E7WUFFaEJBLDZFQUE2RUE7WUFDN0VBLElBQUlBLEVBQUVBLFVBQUNBLEtBQVdBLEVBQUVBLEVBQTBCQTtnQkFDMUNBLENBQUNBLENBQUNBLG9CQUFvQkEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsT0FBT0EsRUFBRUEsY0FBV0EsT0FBQUEsS0FBSUEsQ0FBQ0EsSUFBSUEsRUFBRUEsRUFBWEEsQ0FBV0EsQ0FBRUEsQ0FBQ0E7Z0JBQy9EQSxDQUFDQSxDQUFDQSxxQkFBcUJBLENBQUNBLENBQUNBLElBQUlBLEVBQUVBLENBQUNBO1lBQ3BDQSxDQUFDQTtTQUNKQSxDQUFDQSxDQUFDQTtJQUNQQSxDQUFDQTtJQUVERCx5RkFBeUZBO0lBQ2xGQSx3QkFBSUEsR0FBWEE7UUFDSUUsSUFBSUEsQ0FBQ0EsYUFBYUEsRUFBRUEsQ0FBQ0E7UUFDckJBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLE1BQU1BLENBQUNBLE9BQU9BLENBQUNBLENBQUNBO0lBQ2pDQSxDQUFDQTtJQUVERixtRUFBbUVBO0lBQ25FQSxvRUFBb0VBO0lBQzdEQSwyQkFBT0EsR0FBZEEsVUFBZUEsSUFBV0E7UUFDdEJHLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLFdBQVdBLENBQUNBLEdBQUdBLENBQUNBLEVBQUVBLENBQUNBLHVCQUF1QkEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7SUFDeEVBLENBQUNBO0lBRU1ILDhCQUFVQSxHQUFqQkEsVUFBa0JBLE9BQW1CQTtRQUNqQ0ksSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0E7SUFDM0NBLENBQUNBO0lBRURKLDJCQUEyQkE7SUFDcEJBLGlDQUFhQSxHQUFwQkE7UUFDSUssR0FBR0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsaUJBQWlCQSxDQUFDQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxDQUFDQTtJQUNoREEsQ0FBQ0E7SUFFREwsd0ZBQXdGQTtJQUNqRkEsbUNBQWVBLEdBQXRCQSxVQUF1QkEsT0FBY0EsRUFBRUEsTUFBY0E7UUFDakRNLElBQUlBLENBQUNBLGFBQWFBLEVBQUVBLENBQUNBO1FBRXJCQSxNQUFNQSxHQUFHQSxDQUFDQSxPQUFPQSxNQUFNQSxLQUFLQSxXQUFXQSxDQUFDQSxHQUFHQSxJQUFJQSxDQUFDQSxPQUFPQSxHQUFHQSxDQUFDQSxHQUFHQSxNQUFNQSxDQUFDQTtRQUVyRUEsSUFBSUEsRUFBRUEsR0FBZUEsR0FBR0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsdUJBQXVCQSxDQUFDQTtvQ0FDeEJBLEdBQUdBLE1BQU1BLENBQUNBLFFBQVFBLEVBQUVBLEdBQUdBOzs7MEJBR2pDQSxHQUFHQSxPQUFPQSxHQUFHQTs7Ozs7dUJBS2hCQSxDQUFDQSxDQUFDQTtRQUVqQkEsSUFBSUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0E7SUFDeEJBLENBQUNBO0lBRUROLHdGQUF3RkE7SUFDakZBLCtCQUFXQSxHQUFsQkEsVUFBbUJBLE9BQWNBLEVBQUVBLElBQWdCQTtRQUMvQ08sSUFBSUEsQ0FBQ0EsYUFBYUEsRUFBRUEsQ0FBQ0E7UUFFckJBLElBQUlBLE1BQU1BLEdBQVVBLElBQUlBLENBQUNBLE9BQU9BLEdBQUdBLENBQUNBLENBQUNBO1FBRXJDQSxJQUFJQSxFQUFFQSxHQUFlQSxHQUFHQSxDQUFDQSxFQUFFQSxDQUFDQSx1QkFBdUJBLENBQUNBO29DQUN4QkEsR0FBR0EsTUFBTUEsQ0FBQ0EsUUFBUUEsRUFBRUEsR0FBR0E7OzswQkFHakNBLEdBQUdBLE9BQU9BLEdBQUdBOzs7dUJBR2hCQSxDQUFDQSxDQUFDQTtRQUVqQkEsSUFBSUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0E7SUFDeEJBLENBQUNBO0lBRUxQLGdCQUFDQTtBQUFEQSxDQUFDQSxBQXRGRCxJQXNGQztBQTRCQSxDQUFDO0FBSUYsZ0dBQWdHO0FBQ2hHLG1CQUFtQjtBQUNuQjtJQUlJUSxrQ0FBWUEsb0JBQTRCQSxFQUFFQSxRQUFrQ0E7UUFKaEZDLGlCQTZIQ0E7UUF4SE9BLElBQUlBLENBQUNBLFVBQVVBLEdBQUdBLElBQUlBLFNBQVNBLENBQUVBLEdBQUdBLEVBQUVBLEdBQUdBLENBQUVBLENBQUNBO1FBQzVDQSxJQUFJQSxDQUFDQSxVQUFVQSxDQUFDQSxlQUFlQSxDQUFDQSxnQkFBZ0JBLENBQUNBLENBQUNBO1FBRWxEQSxFQUFFQSxDQUFDQSxDQUFDQSxvQkFBb0JBLENBQUNBLENBQUNBLENBQUNBO1lBQ3ZCQSw0REFBNERBO1lBQzVEQSxJQUFJQSxDQUFDQSx5QkFBeUJBLENBQUVBLFVBQUNBLEdBQXNCQTtnQkFDbkRBLEVBQUVBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLEVBQUVBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO29CQUNoQkEsbURBQW1EQTtvQkFDbkRBLDhDQUE4Q0E7b0JBQzlDQSxLQUFJQSxDQUFDQSxtQkFBbUJBLENBQUNBLFFBQVFBLENBQUNBLENBQUNBO2dCQUN2Q0EsQ0FBQ0E7Z0JBQUNBLElBQUlBLENBQUNBLENBQUNBO29CQUNKQSw0RUFBNEVBO29CQUM1RUEsMEVBQTBFQTtvQkFDMUVBLHFCQUFxQkE7b0JBQ3JCQSxLQUFJQSxDQUFDQSxVQUFVQSxDQUFDQSxJQUFJQSxFQUFFQSxDQUFDQTtvQkFDdkJBLFFBQVFBLENBQUNBLElBQUlBLENBQUNBLEVBQUVBLEVBQUVBLElBQUlBLEVBQUVBLEdBQUdBLENBQUNBLEVBQUVBLEVBQUVBLEdBQUdBLENBQUNBLElBQUlBLEVBQUVBLEdBQUdBLENBQUNBLGtCQUFrQkEsQ0FBQ0EsQ0FBQ0E7Z0JBQ3RFQSxDQUFDQTtZQUNMQSxDQUFDQSxFQUFFQSxVQUFDQSxHQUFVQTtnQkFDVkEsUUFBUUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsRUFBRUEsRUFBRUEsR0FBR0EsQ0FBQ0EsQ0FBQ0E7WUFDM0JBLENBQUNBLENBQUNBLENBQUNBO1FBQ1BBLENBQUNBO1FBQUNBLElBQUlBLENBQUNBLENBQUNBO1lBQ0pBLG1EQUFtREE7WUFDbkRBLDhDQUE4Q0E7WUFDOUNBLElBQUlBLENBQUNBLG1CQUFtQkEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsQ0FBQ0E7UUFDdkNBLENBQUNBO0lBQ0xBLENBQUNBO0lBRU9ELCtDQUFZQSxHQUFwQkE7UUFDSUUsSUFBSUEsS0FBS0EsR0FBVUEsUUFBUUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsT0FBT0EsQ0FDdENBLGtEQUFrREEsRUFDbERBLElBQUlBLENBQUNBLENBQUNBO1FBQ1ZBLE1BQU1BLENBQUNBLEVBQUVBLHFCQUFxQkEsRUFBRUEsS0FBS0EsRUFBRUEsQ0FBQ0E7SUFDNUNBLENBQUNBO0lBRURGLGdGQUFnRkE7SUFDaEZBLGtGQUFrRkE7SUFDMUVBLHNEQUFtQkEsR0FBM0JBLFVBQTRCQSxRQUFrQ0E7UUFBOURHLGlCQTBCQ0E7UUF6QkdBLElBQUlBLENBQUNBLHdCQUF3QkEsQ0FBRUEsVUFBQ0EsYUFBa0NBO1lBQzlEQSxvQkFBb0JBO1lBQ3BCQSxLQUFJQSxDQUFDQSxVQUFVQSxDQUFDQSxhQUFhQSxFQUFFQSxDQUFDQTtZQUNoQ0EsS0FBSUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsT0FBT0EsQ0FDbkJBLCtEQUErREE7Z0JBQy9EQSxrRUFBa0VBLENBQUNBLENBQUNBO1lBRXhFQSxJQUFJQSxLQUFLQSxHQUFhQSxJQUFJQSxHQUFHQSxDQUFDQSxLQUFLQSxDQUFDQSxxQkFBcUJBLENBQUNBLENBQUNBO1lBQzNEQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxZQUFZQSxDQUFDQSxhQUFhQSxFQUFFQSxHQUFHQSxDQUFDQSxDQUFDQTtZQUM3Q0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsaUJBQWlCQSxFQUFFQSxVQUFVQSxDQUFDQSxDQUFDQTtZQUVsREEsYUFBYUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsVUFBQ0EsR0FBc0JBO2dCQUN6Q0EsS0FBS0EsQ0FBQ0EsTUFBTUEsRUFBRUEsQ0FBQ0E7Z0JBQ2ZBLElBQUlBLE1BQU1BLEdBQU9BLEtBQUtBLENBQUNBLFNBQVNBLEVBQUVBLENBQUNBO2dCQUNuQ0EsTUFBTUEsQ0FBQ0EsU0FBU0EsR0FBR0EsR0FBR0EsQ0FBQ0EsSUFBSUEsQ0FBQ0E7Z0JBQzVCQSxDQUFDQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxRQUFRQSxFQUFFQSxTQUFTQSxDQUFDQSxDQUFDQSxDQUFDQSwyQkFBMkJBO2dCQUMvREEsQ0FBQ0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsWUFBWUEsRUFBRUEsZ0JBQWdCQSxDQUFDQSxDQUFDQSxDQUFDQSwyQkFBMkJBO2dCQUMxRUEsQ0FBQ0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsZUFBZUEsRUFBRUEsZ0JBQWdCQSxDQUFDQSxDQUFDQSxDQUFDQSwyQkFBMkJBO2dCQUM3RUEsQ0FBQ0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsU0FBU0EsRUFBRUEsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsMkJBQTJCQTtnQkFDN0RBLENBQUNBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLEtBQUlBLENBQUNBLHFCQUFxQkEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBSUEsRUFBRUEsR0FBR0EsRUFBRUEsUUFBUUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDMUVBLENBQUNBLENBQUNBLENBQUNBO1lBQ0hBLEtBQUlBLENBQUNBLFVBQVVBLENBQUNBLFVBQVVBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBO1FBQzVDQSxDQUFDQSxFQUFFQSxVQUFDQSxHQUFVQTtZQUNWQSxLQUFJQSxDQUFDQSxVQUFVQSxDQUFDQSxXQUFXQSxDQUFDQSxHQUFHQSxFQUFFQSxjQUFXQSxPQUFBQSxRQUFRQSxDQUFDQSxJQUFJQSxDQUFDQSxFQUFFQSxFQUFFQSxHQUFHQSxDQUFDQSxFQUF0QkEsQ0FBc0JBLENBQUNBLENBQUNBO1FBQ3hFQSxDQUFDQSxDQUFDQSxDQUFDQTtJQUNQQSxDQUFDQTtJQUdESCxnREFBZ0RBO0lBQ3hDQSx3REFBcUJBLEdBQTdCQSxVQUE4QkEsR0FBc0JBLEVBQzVDQSxRQUFrQ0E7UUFEMUNJLGlCQVFDQTtRQU5HQSw2RUFBNkVBO1FBQzdFQSxJQUFJQSxDQUFDQSw0QkFBNEJBLENBQUNBLEdBQUdBLENBQUNBLEVBQUVBLEVBQ3BDQSxVQUFDQSxLQUFZQTtZQUNUQSxLQUFJQSxDQUFDQSxVQUFVQSxDQUFDQSxXQUFXQSxDQUFDQSxLQUFLQSxFQUFFQSxjQUFXQSxPQUFBQSxRQUFRQSxDQUFDQSxJQUFJQSxDQUFDQSxFQUFFQSxFQUFFQSxLQUFLQSxDQUFDQSxFQUF4QkEsQ0FBd0JBLENBQUNBLENBQUNBO1FBQzVFQSxDQUFDQSxDQUNKQSxDQUFDQTtJQUNOQSxDQUFDQTtJQUdESiw2QkFBNkJBO0lBQ3JCQSw0REFBeUJBLEdBQWpDQSxVQUNRQSxRQUEwQ0EsRUFDMUNBLEtBQTZCQTtRQUNqQ0ssQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0E7WUFDSEEsUUFBUUEsRUFBRUEsTUFBTUE7WUFDaEJBLEdBQUdBLEVBQUVBLE1BQU1BO1lBQ1hBLE9BQU9BLEVBQUVBLFFBQVFBO1lBQ2pCQSxLQUFLQSxFQUFFQSxVQUFDQSxLQUFlQSxFQUFFQSxNQUFhQSxFQUFFQSxTQUFnQkE7Z0JBQ3BEQSxLQUFLQSxDQUFDQSxJQUFJQSxDQUFDQSxFQUFFQSxFQUFFQSxNQUFNQSxHQUFHQSxHQUFHQSxHQUFHQSxTQUFTQSxDQUFDQSxDQUFDQTtZQUM3Q0EsQ0FBQ0E7U0FDSkEsQ0FBQ0EsQ0FBQ0E7SUFDUEEsQ0FBQ0E7SUFHREwsaUVBQWlFQTtJQUN6REEsMkRBQXdCQSxHQUFoQ0EsVUFDUUEsUUFBc0RBLEVBQ3REQSxLQUE2QkE7UUFDakNNLENBQUNBLENBQUNBLElBQUlBLENBQUNBO1lBQ0hBLFFBQVFBLEVBQUVBLE1BQU1BO1lBQ2hCQSxHQUFHQSxFQUFFQSxhQUFhQTtZQUNsQkEsT0FBT0EsRUFBRUEsUUFBUUE7WUFDakJBLEtBQUtBLEVBQUVBLFVBQUNBLEtBQWVBLEVBQUVBLE1BQWFBLEVBQUVBLFNBQWdCQTtnQkFDcERBLEtBQUtBLENBQUNBLElBQUlBLENBQUNBLEVBQUVBLEVBQUVBLE1BQU1BLEdBQUdBLEdBQUdBLEdBQUdBLFNBQVNBLENBQUNBLENBQUNBO1lBQzdDQSxDQUFDQTtTQUNKQSxDQUFDQSxDQUFDQTtJQUNQQSxDQUFDQTtJQUdPTiwrREFBNEJBLEdBQXBDQSxVQUFxQ0EsY0FBcUJBLEVBQ2xEQSxRQUE4QkE7UUFDbENPLENBQUNBLENBQUNBLElBQUlBLENBQUNBO1lBQ0hBLElBQUlBLEVBQUVBLE1BQU1BO1lBQ1pBLFFBQVFBLEVBQUVBLE1BQU1BO1lBQ2hCQSxHQUFHQSxFQUFFQSxNQUFNQTtZQUNYQSxJQUFJQSxFQUFFQSxDQUFDQSxDQUFDQSxNQUFNQSxDQUFDQSxFQUFFQSxFQUFFQSxJQUFJQSxDQUFDQSxZQUFZQSxFQUFFQSxFQUFFQSxFQUFFQSxnQkFBZ0JBLEVBQUVBLGNBQWNBLEVBQUVBLENBQUNBO1lBQzdFQSxLQUFLQSxFQUFFQSxVQUFDQSxLQUFlQSxFQUFFQSxNQUFhQSxFQUFFQSxTQUFnQkE7Z0JBQ3BEQSxRQUFRQSxDQUFDQSxJQUFJQSxDQUFDQSxFQUFFQSxFQUFFQSxNQUFNQSxHQUFHQSxHQUFHQSxHQUFHQSxTQUFTQSxDQUFDQSxDQUFDQTtZQUNoREEsQ0FBQ0E7U0FDSkEsQ0FBQ0EsQ0FBQ0E7SUFDUEEsQ0FBQ0E7SUFFTFAsK0JBQUNBO0FBQURBLENBQUNBLEFBN0hELElBNkhDO0FBTUEsQ0FBQztBQUVGLHdFQUF3RTtBQUN4RSwyQ0FBMkM7QUFDM0M7SUFJSVEsOEJBQVlBLGNBQXFCQSxFQUFFQSxRQUErQkE7UUFKdEVDLGlCQW9NQ0E7UUEvTE9BLElBQUlBLENBQUNBLFVBQVVBLEdBQUdBLElBQUlBLFNBQVNBLENBQUVBLEdBQUdBLEVBQUVBLEdBQUdBLENBQUVBLENBQUNBO1FBRTVDQSxnREFBZ0RBO1FBQ2hEQSxJQUFJQSxDQUFDQSxVQUFVQSxDQUFDQSxlQUFlQSxDQUFDQSxpQ0FBaUNBLENBQUNBLENBQUNBO1FBRW5FQSxJQUFJQSxDQUFDQSwyQkFBMkJBLENBQUNBLGNBQWNBLEVBQ3ZDQSxVQUFDQSxTQUFpQ0E7WUFDdENBLElBQUlBLEtBQWVBLENBQUNBO1lBQ3BCQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxTQUFTQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDcEJBLEtBQUlBLENBQUNBLFVBQVVBLENBQUNBLFdBQVdBLENBQ3ZCQSx1REFBdURBLENBQUNBLENBQUNBO1lBQ2pFQSxDQUFDQTtZQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtnQkFDSkEseUNBQXlDQTtnQkFDekNBLEtBQUlBLENBQUNBLFVBQVVBLENBQUNBLGFBQWFBLEVBQUVBLENBQUNBO2dCQUNoQ0EsS0FBSUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsT0FBT0EsQ0FDbkJBLGtFQUFrRUE7b0JBQ2xFQSxnQkFBZ0JBLENBQUNBLENBQUNBO2dCQUN0QkEsS0FBS0EsR0FBR0EsSUFBSUEsR0FBR0EsQ0FBQ0EsS0FBS0EsQ0FBQ0Esd0JBQXdCQSxDQUFDQSxDQUFDQTtnQkFDaERBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLFlBQVlBLENBQUNBLGFBQWFBLEVBQUVBLEdBQUdBLENBQUNBLENBQUNBO2dCQUM3Q0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsaUJBQWlCQSxFQUFFQSxVQUFVQSxDQUFDQSxDQUFDQTtnQkFFbERBLFNBQVNBLENBQUNBLE9BQU9BLENBQUNBLFVBQUNBLFFBQThCQTtvQkFDN0NBLEtBQUtBLENBQUNBLE1BQU1BLEVBQUVBLENBQUNBO29CQUNmQSxJQUFJQSxNQUFNQSxHQUFPQSxLQUFLQSxDQUFDQSxTQUFTQSxFQUFFQSxDQUFDQTtvQkFDbkNBLE1BQU1BLENBQUNBLFNBQVNBLEdBQUdBLFFBQVFBLENBQUNBLFlBQVlBLENBQUNBO29CQUN6Q0EsQ0FBQ0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsUUFBUUEsRUFBRUEsU0FBU0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsMkJBQTJCQTtvQkFDL0RBLENBQUNBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLFlBQVlBLEVBQUVBLGdCQUFnQkEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsMkJBQTJCQTtvQkFDMUVBLENBQUNBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLGVBQWVBLEVBQUVBLGdCQUFnQkEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsMkJBQTJCQTtvQkFDN0VBLENBQUNBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLFNBQVNBLEVBQUVBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBLDJCQUEyQkE7b0JBQzdEQSxDQUFDQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFFQTt3QkFDYkEsS0FBSUEsQ0FBQ0Esd0JBQXdCQSxDQUFDQSxjQUFjQSxFQUFFQSxRQUFRQSxFQUFFQSxRQUFRQSxDQUFDQSxDQUFDQTtvQkFDdEVBLENBQUNBLENBQUNBLENBQUNBO2dCQUNQQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDSEEsS0FBSUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0E7WUFDNUNBLENBQUNBO1FBRUxBLENBQUNBLEVBQUVBLFVBQUNBLEtBQVlBO1lBQ1pBLEtBQUlBLENBQUNBLFVBQVVBLENBQUNBLFdBQVdBLENBQUNBLEtBQUtBLEVBQUVBLGNBQVdBLE9BQUFBLFFBQVFBLENBQUNBLElBQUlBLENBQUNBLEVBQUVBLEVBQUVBLEtBQUtBLENBQUNBLEVBQXhCQSxDQUF3QkEsQ0FBQ0EsQ0FBQ0E7UUFDNUVBLENBQUNBLENBQUNBLENBQUNBO0lBQ1BBLENBQUNBO0lBR0RELHlGQUF5RkE7SUFDekZBLDRCQUE0QkE7SUFDcEJBLHVEQUF3QkEsR0FBaENBLFVBQWlDQSxjQUFxQkEsRUFBRUEsUUFBOEJBLEVBQzlFQSxRQUErQkE7UUFEdkNFLGlCQThDQ0E7UUE1Q0dBLG1EQUFtREE7UUFDbkRBLElBQUlBLENBQUNBLFVBQVVBLENBQUNBLGVBQWVBLENBQUNBLHlCQUF5QkEsQ0FBQ0EsQ0FBQ0E7UUFDM0RBLElBQUlBLENBQUNBLHNDQUFzQ0EsQ0FBQ0EsY0FBY0EsRUFBRUEsUUFBUUEsQ0FBQ0EsVUFBVUEsRUFDdkVBLFVBQUNBLFdBQXVDQTtZQUM1Q0EsSUFBSUEsS0FBS0EsR0FBYUEsSUFBSUEsR0FBR0EsQ0FBQ0EsS0FBS0EsQ0FBQ0Esd0JBQXdCQSxDQUFDQSxFQUN6REEsTUFBTUEsR0FBU0EsRUFBRUEsQ0FBQ0E7WUFDdEJBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLFlBQVlBLENBQUNBLGFBQWFBLEVBQUVBLEdBQUdBLENBQUNBLENBQUNBO1lBQzdDQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxpQkFBaUJBLEVBQUVBLFVBQVVBLENBQUNBLENBQUNBO1lBRWxEQSxXQUFXQSxDQUFDQSxPQUFPQSxDQUFDQSxVQUFDQSxPQUFpQ0EsRUFBRUEsQ0FBUUE7Z0JBQzVEQSxJQUFJQSxhQUF5QkEsRUFBRUEsZ0JBQTRCQSxFQUFFQSxRQUFlQSxDQUFDQTtnQkFDN0VBLEtBQUtBLENBQUNBLE1BQU1BLEVBQUVBLENBQUNBO2dCQUNmQSxhQUFhQSxHQUFHQSxLQUFLQSxDQUFDQSxTQUFTQSxFQUFFQSxDQUFDQTtnQkFDbENBLGFBQWFBLENBQUNBLFNBQVNBLEdBQUdBLE9BQU9BLENBQUNBLGVBQWVBLENBQUNBO2dCQUNsREEsZ0JBQWdCQSxHQUFHQSxLQUFLQSxDQUFDQSxTQUFTQSxFQUFFQSxDQUFDQTtnQkFDckNBLFFBQVFBLEdBQUdBLFFBQVFBLENBQUNBLG1CQUFtQkEsQ0FBQ0EsZ0JBQWdCQSxDQUFDQSxDQUFDQTtnQkFDMURBLFFBQVFBLENBQUNBLFFBQVFBLENBQUNBLGtCQUFrQkEsQ0FBQ0EsQ0FBQ0E7Z0JBQ3RDQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxRQUFRQSxDQUFDQSxDQUFDQTtZQUMxQkEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFFSEEsS0FBSUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsYUFBYUEsRUFBRUEsQ0FBQ0E7WUFDaENBLEtBQUlBLENBQUNBLFVBQVVBLENBQUNBLE9BQU9BLENBQ25CQSxrRUFBa0VBLENBQUNBLENBQUNBO1lBQ3hFQSxLQUFJQSxDQUFDQSxVQUFVQSxDQUFDQSxVQUFVQSxDQUFDQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQTtZQUV4Q0EsSUFBSUEsa0JBQWtCQSxHQUFlQSxHQUFHQSxDQUFDQSxFQUFFQSxDQUFDQSx1QkFBdUJBLENBQy9EQSxrREFBa0RBLENBQUNBLENBQUNBO1lBQ3hEQSxDQUFDQSxDQUFDQSxrQkFBa0JBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLFlBQVlBLEVBQUVBLFFBQVFBLENBQUNBLENBQUNBO1lBQ2xEQSxLQUFJQSxDQUFDQSxVQUFVQSxDQUFDQSxVQUFVQSxDQUFDQSxrQkFBa0JBLENBQUNBLENBQUNBO1lBRS9DQSxxQ0FBcUNBO1lBQ3JDQSxJQUFJQSxRQUFRQSxHQUFlQSxRQUFRQSxDQUFDQSxhQUFhQSxDQUFDQSxRQUFRQSxDQUFDQSxDQUFDQTtZQUM1REEsUUFBUUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsY0FBY0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDcERBLENBQUNBLENBQUNBLFFBQVFBLENBQUNBLENBQUNBLEtBQUtBLENBQUVBLGNBQVdBLE9BQUFBLEtBQUlBLENBQUNBLDhCQUE4QkEsQ0FBQ0EsV0FBV0EsRUFBRUEsTUFBTUEsRUFDakZBLGtCQUFrQkEsRUFBRUEsY0FBY0EsRUFBRUEsUUFBUUEsRUFBRUEsUUFBUUEsQ0FBQ0EsRUFEN0JBLENBQzZCQSxDQUFDQSxDQUFDQTtZQUM3REEsS0FBSUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsQ0FBQ0E7WUFFckNBLE1BQU1BLENBQUNBLE9BQU9BLENBQUNBLFVBQUNBLEtBQUtBO2dCQUNqQkEsUUFBUUEsQ0FBQ0Esd0JBQXdCQSxDQUFDQSxLQUFLQSxFQUFFQSxZQUFZQSxFQUFFQSxPQUFPQSxDQUFDQSxlQUFlQSxJQUFJQSxFQUFFQSxDQUFDQSxDQUFDQTtZQUMxRkEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDUEEsQ0FBQ0EsRUFBRUEsVUFBQ0EsS0FBWUE7WUFDWkEsS0FBSUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsS0FBS0EsRUFBRUEsY0FBV0EsT0FBQUEsUUFBUUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsRUFBRUEsRUFBRUEsS0FBS0EsQ0FBQ0EsRUFBeEJBLENBQXdCQSxDQUFDQSxDQUFDQTtRQUM1RUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7SUFFUEEsQ0FBQ0E7SUFHREYsb0VBQW9FQTtJQUM1REEsNkRBQThCQSxHQUF0Q0EsVUFBdUNBLFdBQXVDQSxFQUFFQSxNQUFZQSxFQUN4RkEsa0JBQThCQSxFQUFFQSxjQUFxQkEsRUFBRUEsUUFBOEJBLEVBQ3JGQSxRQUErQkE7UUFGbkNHLGlCQXNDQ0E7UUFsQ0dBLGdDQUFnQ0E7UUFDaENBLElBQUlBLFFBQVFBLEdBQVVBLE1BQU1BLENBQUNBLE1BQU1BLENBQUNBLFVBQUNBLEtBQVlBLElBQWFBLE9BQUFBLEtBQUtBLENBQUNBLEdBQUdBLEVBQUVBLEtBQUtBLEVBQUVBLEVBQWxCQSxDQUFrQkEsQ0FBQ0EsQ0FBQ0EsTUFBTUEsQ0FBQ0E7UUFFekZBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLGtCQUFrQkEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsWUFBWUEsQ0FBQ0EsS0FBS0EsUUFBUUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDdkRBLCtFQUErRUE7WUFDL0VBLHNCQUFzQkE7WUFDdEJBLEVBQUVBLENBQUNBLENBQUNBLFFBQVFBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO2dCQUNmQSxDQUFDQSxDQUFDQSxrQkFBa0JBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLFlBQVlBLEVBQUVBLFNBQVNBLENBQUNBLENBQUNBO2dCQUNuREEsa0JBQWtCQSxDQUFDQSxTQUFTQSxHQUFHQSxvQkFBb0JBLEdBQUdBLFFBQVFBLENBQUNBLFFBQVFBLEVBQUVBO29CQUNyRUEsc0VBQXNFQTtvQkFDdEVBLDJEQUEyREEsQ0FBQ0E7Z0JBQ2hFQSxNQUFNQSxDQUFDQTtZQUNYQSxDQUFDQTtRQUNMQSxDQUFDQTtRQUVEQSxvRUFBb0VBO1FBQ3BFQSxJQUFJQSxDQUFDQSxVQUFVQSxDQUFDQSxlQUFlQSxDQUFDQSxxQ0FBcUNBLENBQUNBLENBQUNBO1FBRXZFQSxJQUFJQSxPQUFPQSxHQUFPQSxFQUFFQSxDQUFDQTtRQUNyQkEsTUFBTUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsVUFBQ0EsS0FBWUEsRUFBRUEsQ0FBUUE7WUFDbENBLElBQUlBLE1BQU1BLEdBQVVBLFdBQVdBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLGVBQWVBLEVBQUVBLEVBQVNBLEVBQUVBLEdBQU9BLENBQUNBO1lBQ3ZFQSxFQUFFQSxHQUFHQSxLQUFLQSxDQUFDQSxJQUFJQSxDQUFDQSxvQkFBb0JBLENBQUNBLENBQUNBLEdBQUdBLEVBQUVBLENBQUNBO1lBQzVDQSxHQUFHQSxHQUFHQSxPQUFPQSxDQUFDQSxlQUFlQSxDQUFDQSxFQUFFQSxDQUFDQSxJQUFJQSxFQUFFQSxDQUFDQTtZQUN4Q0EsT0FBT0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsR0FBR0EsR0FBR0EsQ0FBQ0EsSUFBSUEsSUFBSUEsRUFBRUEsQ0FBQ0E7UUFDckNBLENBQUNBLENBQUNBLENBQUNBO1FBRUhBLElBQUlBLENBQUNBLCtCQUErQkEsQ0FBQ0EsY0FBY0EsRUFBRUEsUUFBUUEsQ0FBQ0EsVUFBVUEsRUFBRUEsT0FBT0EsRUFDekVBLFVBQUNBLFlBQW1CQTtZQUN4QkEsMkNBQTJDQTtZQUMzQ0EsS0FBSUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsSUFBSUEsRUFBRUEsQ0FBQ0E7WUFDdkJBLFFBQVFBLENBQUNBLElBQUlBLEVBQUVBLFlBQVlBLENBQUNBLENBQUNBO1FBQ2pDQSxDQUFDQSxFQUFFQSxVQUFDQSxLQUFZQTtZQUNmQSxLQUFJQSxDQUFDQSxVQUFVQSxDQUFDQSxXQUFXQSxDQUFDQSxLQUFLQSxFQUFFQSxjQUFXQSxPQUFBQSxRQUFRQSxDQUFDQSxJQUFJQSxDQUFDQSxFQUFFQSxFQUFFQSxLQUFLQSxDQUFDQSxFQUF4QkEsQ0FBd0JBLENBQUNBLENBQUNBO1FBQ3pFQSxDQUFDQSxDQUFDQSxDQUFDQTtJQUNQQSxDQUFDQTtJQUdESCxrRUFBa0VBO0lBQzFEQSxxRUFBc0NBLEdBQTlDQSxVQUErQ0EsY0FBcUJBLEVBQUVBLFVBQWlCQSxFQUMvRUEsUUFBMkRBLEVBQzNEQSxLQUE2QkE7UUFDakNJLENBQUNBLENBQUNBLElBQUlBLENBQUNBO1lBQ0hBLFFBQVFBLEVBQUVBLE1BQU1BO1lBQ2hCQSxHQUFHQSxFQUFFQSxDQUFFQSxZQUFZQSxFQUFFQSxjQUFjQSxFQUFFQSxXQUFXQSxFQUFFQSxVQUFVQSxFQUFFQSxFQUFFQSxDQUFFQSxDQUFDQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQTtZQUM1RUEsa0ZBQWtGQTtZQUNsRkEsT0FBT0EsRUFBRUEsVUFBQ0EsSUFBUUE7Z0JBQ2RBLElBQUlBLFVBQVVBLEdBQStCQSxFQUFFQSxDQUFDQTtnQkFDaERBLFVBQVVBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLElBQUlBLEVBQUVBLFVBQUNBLEtBQVNBLEVBQUVBLEdBQVVBO29CQUMzQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsS0FBS0EsRUFBRUE7d0JBQ25CQSxpQkFBaUJBLEVBQUVBLEdBQUdBO3dCQUN0QkEsbUJBQW1CQSxFQUFFQSxLQUFLQSxDQUFDQSxFQUFFQTtxQkFDaENBLENBQUNBLENBQUNBO2dCQUNQQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDSEEsUUFBUUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsRUFBRUEsRUFBRUEsVUFBVUEsQ0FBQ0EsQ0FBQ0E7WUFDbENBLENBQUNBO1lBQ0RBLEtBQUtBLEVBQUVBLFVBQUNBLEtBQWVBLEVBQUVBLE1BQWFBLEVBQUVBLFNBQWdCQTtnQkFDcERBLEtBQUtBLENBQUNBLElBQUlBLENBQUNBLEVBQUVBLEVBQUVBLE1BQU1BLEdBQUdBLEdBQUdBLEdBQUdBLFNBQVNBLENBQUNBLENBQUNBO1lBQzdDQSxDQUFDQTtTQUNKQSxDQUFDQSxDQUFDQTtJQUNQQSxDQUFDQTtJQUdESixrRUFBa0VBO0lBQzFEQSwwREFBMkJBLEdBQW5DQSxVQUFvQ0EsY0FBcUJBLEVBQ2pEQSxRQUFxREEsRUFDckRBLEtBQTZCQTtRQUNqQ0ssQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0E7WUFDSEEsUUFBUUEsRUFBRUEsTUFBTUE7WUFDaEJBLEdBQUdBLEVBQUVBLGFBQWFBLEdBQUdBLGNBQWNBLEdBQUdBLGFBQWFBO1lBQ25EQSxPQUFPQSxFQUFFQSxRQUFRQTtZQUNqQkEsS0FBS0EsRUFBRUEsVUFBQ0EsS0FBZUEsRUFBRUEsTUFBYUEsRUFBRUEsU0FBZ0JBO2dCQUNwREEsS0FBS0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsRUFBRUEsRUFBRUEsTUFBTUEsR0FBR0EsR0FBR0EsR0FBR0EsU0FBU0EsQ0FBQ0EsQ0FBQ0E7WUFDN0NBLENBQUNBO1NBQ0pBLENBQUNBLENBQUNBO0lBQ1BBLENBQUNBO0lBR0RMLHdGQUF3RkE7SUFDeEZBLGdCQUFnQkE7SUFDUkEsOERBQStCQSxHQUF2Q0EsVUFBd0NBLGNBQXFCQSxFQUFFQSxVQUFpQkEsRUFBRUEsT0FBV0EsRUFDckZBLFFBQXVDQSxFQUN2Q0EsS0FBNkJBO1FBQ2pDTSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQTtZQUNIQSxJQUFJQSxFQUFFQSxNQUFNQTtZQUNaQSxRQUFRQSxFQUFFQSxNQUFNQTtZQUNoQkEsR0FBR0EsRUFBRUEsQ0FBRUEsWUFBWUEsRUFBRUEsY0FBY0EsRUFBRUEsV0FBV0EsRUFBRUEsVUFBVUEsRUFBRUEsVUFBVUEsQ0FBRUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0E7WUFDcEZBLElBQUlBLEVBQUVBLEVBQUVBLFNBQVNBLEVBQUVBLE9BQU9BLEVBQUVBO1lBQzVCQSxPQUFPQSxFQUFFQSxRQUFRQTtZQUNqQkEsS0FBS0EsRUFBRUEsVUFBQ0EsS0FBZUEsRUFBRUEsTUFBYUEsRUFBRUEsU0FBZ0JBO2dCQUNwREEsS0FBS0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsRUFBRUEsRUFBRUEsTUFBTUEsR0FBR0EsR0FBR0EsR0FBR0EsU0FBU0EsQ0FBQ0EsQ0FBQ0E7WUFDN0NBLENBQUNBO1NBQ0pBLENBQUNBLENBQUNBO0lBQ1BBLENBQUNBO0lBQ0xOLDJCQUFDQTtBQUFEQSxDQUFDQSxBQXBNRCxJQW9NQztBQVVBLENBQUM7QUFFRjtJQUNJTyw0QkFBWUEsUUFBMENBO1FBQ2xEQyxJQUFJQSxPQUFnQ0EsRUFBRUEsY0FBd0NBLENBQUNBO1FBQy9FQSxjQUFjQSxHQUFHQSxVQUFDQSxLQUFZQSxFQUN0QkEsY0FBc0JBLEVBQ3RCQSxvQkFBNEJBLEVBQzVCQSxrQkFBMEJBO1lBQzlCQSxJQUFJQSxFQUF1QkEsQ0FBQ0E7WUFDNUJBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBO2dCQUNSQSxRQUFRQSxDQUFDQSxJQUFJQSxDQUFDQSxFQUFFQSxFQUFFQSxLQUFLQSxDQUFDQSxDQUFDQTtnQkFDekJBLE1BQU1BLENBQUNBO1lBQ1hBLENBQUNBO1lBQ0RBLEVBQUVBLENBQUNBLENBQUNBLGtCQUFrQkEsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQzVCQSxnRkFBZ0ZBO2dCQUNoRkEsMEVBQTBFQTtnQkFDMUVBLEVBQUVBLEdBQUdBLElBQUlBLG9CQUFvQkEsQ0FBQ0EsY0FBY0EsRUFDeENBLFVBQUNBLFVBQWlCQSxFQUFFQSx1QkFBK0JBO29CQUMvQ0EsUUFBUUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsRUFBRUEsRUFBRUEsVUFBVUEsRUFBRUEsY0FBY0EsRUFBRUEsb0JBQW9CQSxFQUM5REEsdUJBQXVCQSxDQUFDQSxDQUFDQTtnQkFDakNBLENBQUNBLENBQUNBLENBQUNBO1lBQ1hBLENBQUNBO1lBQUNBLElBQUlBLENBQUNBLENBQUNBO2dCQUNKQSxRQUFRQSxDQUFDQSxJQUFJQSxFQUFFQSxjQUFjQSxFQUFFQSxvQkFBb0JBLEVBQUVBLGtCQUFrQkEsQ0FBQ0EsQ0FBQ0E7WUFDN0VBLENBQUNBO1FBQ0xBLENBQUNBLENBQUNBO1FBQ0ZBLDBEQUEwREE7UUFDMURBLE9BQU9BLEdBQUdBLElBQUlBLHdCQUF3QkEsQ0FBQ0EsSUFBSUEsRUFBRUEsY0FBY0EsQ0FBQ0EsQ0FBQ0E7SUFDakVBLENBQUNBO0lBQ0xELHlCQUFDQTtBQUFEQSxDQUFDQSxBQTNCRCxJQTJCQyIsInNvdXJjZXNDb250ZW50IjpbIi8vIENvbXBpbGVkIHRvIEpTIG9uOiBUaHUgSmFuIDIxIDIwMTYgMTc6Mjc6MTAgIFxuLy8vIDxyZWZlcmVuY2UgcGF0aD1cInR5cGVzY3JpcHQtZGVjbGFyYXRpb25zLmQudHNcIiAvPlxuLy8vIDxyZWZlcmVuY2UgcGF0aD1cIlV0bC50c1wiIC8+XG5cbnZhciBFRERfYXV0byA9IEVERF9hdXRvIHx8IHt9O1xuXG4vLyBBdCB0aGlzIHBvaW50LCB0aGlzIGNsYXNzIGlzIGV4cGVyaW1lbnRhbC4gSXQncyBzdXBwb3NlZCB0byBtYWtlIG1vZGFsIGRpYWxvZyBib3hlc1xuLy8gZWFzaWVyIHRvIGNyZWF0ZSBhbmQgY29uZmlndXJlLlxuY2xhc3MgRGlhbG9nQm94IHtcblxuICAgIHByaXZhdGUgX2RpYWxvZzphbnk7XG4gICAgcHJpdmF0ZSBfd2lkdGg6bnVtYmVyO1xuICAgIHByaXZhdGUgX2hlaWdodDpudW1iZXI7XG4gICAgcHJpdmF0ZSBfY29udGVudHNEaXY6SFRNTEVsZW1lbnQ7XG5cbiAgICBwdWJsaWMgY29uc3RydWN0b3Iod2lkdGg6bnVtYmVyLCBoZWlnaHQ6bnVtYmVyKSB7XG4gICAgICAgIHRoaXMuX3dpZHRoID0gd2lkdGg7XG4gICAgICAgIHRoaXMuX2hlaWdodCA9IGhlaWdodDtcblxuICAgICAgICB0aGlzLl9jb250ZW50c0RpdiA9IFV0bC5KUy5jcmVhdGVFbGVtZW50RnJvbVN0cmluZygnPGRpdj48L2Rpdj4nKTtcbiAgICAgICAgdGhpcy5fZGlhbG9nID0gJCh0aGlzLl9jb250ZW50c0RpdikuZGlhbG9nKHtcbiAgICAgICAgICAgIGF1dG9PcGVuOiB0cnVlLFxuICAgICAgICAgICAgd2lkdGg6IHdpZHRoLFxuICAgICAgICAgICAgaGVpZ2h0OiBoZWlnaHQsXG4gICAgICAgICAgICBtb2RhbDogdHJ1ZSxcbiAgICAgICAgICAgIGRyYWdnYWJsZTogZmFsc2UsXG5cbiAgICAgICAgICAgIC8vIFRoaXMgaG9va3MgdGhlIG92ZXJsYXkgc28gd2UgY2FuIGhpZGUgdGhlIGRpYWxvZyBpZiB0aGV5IGNsaWNrIG91dHNpZGUgaXQuXG4gICAgICAgICAgICBvcGVuOiAoZXZlbnQ6RXZlbnQsIHVpOkpRdWVyeVVJLkRpYWxvZ1VJUGFyYW1zKTp2b2lkID0+IHtcbiAgICAgICAgICAgICAgICAkKCcudWktd2lkZ2V0LW92ZXJsYXknKS5iaW5kKCdjbGljaycsICgpOnZvaWQgPT4gdGhpcy50ZXJtKCkgKTtcbiAgICAgICAgICAgICAgICAkKCcudWktZGlhbG9nLXRpdGxlYmFyJykuaGlkZSgpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICAvLyBUaGlzIHJlbW92ZXMgdGhlIGRpYWxvZyAod2hlcmVhcyBjbGVhckNvbnRlbnRzKCkganVzdCByZW1vdmVzIHRoZSBlbGVtZW50cyBpbnNpZGUgaXQpLlxuICAgIHB1YmxpYyB0ZXJtKCk6dm9pZCB7XG4gICAgICAgIHRoaXMuY2xlYXJDb250ZW50cygpO1xuICAgICAgICB0aGlzLl9kaWFsb2cuZGlhbG9nKCdjbG9zZScpO1xuICAgIH1cblxuICAgIC8vIFRoZSBIVE1MIHlvdSdyZSBhZGRpbmcgbXVzdCBlcXVhdGUgdG8gYW4gZWxlbWVudCBiZWNhdXNlIHdlIGp1c3RcbiAgICAvLyB0dXJuIGl0IGludG8gYW4gZWxlbWVudCBhbmQgYWRkIHRoYXQgZWxlbWVudCB0byBvdXIgY29udGVudHMgZGl2LlxuICAgIHB1YmxpYyBhZGRIVE1MKGh0bWw6c3RyaW5nKTp2b2lkIHtcbiAgICAgICAgdGhpcy5fY29udGVudHNEaXYuYXBwZW5kQ2hpbGQoVXRsLkpTLmNyZWF0ZUVsZW1lbnRGcm9tU3RyaW5nKGh0bWwpKTtcbiAgICB9XG5cbiAgICBwdWJsaWMgYWRkRWxlbWVudChlbGVtZW50OkhUTUxFbGVtZW50KTp2b2lkIHtcbiAgICAgICAgdGhpcy5fY29udGVudHNEaXYuYXBwZW5kQ2hpbGQoZWxlbWVudCk7XG4gICAgfVxuXG4gICAgLy8gUmVtb3ZlIGFsbCBzdWIgZWxlbWVudHMuXG4gICAgcHVibGljIGNsZWFyQ29udGVudHMoKTp2b2lkIHtcbiAgICAgICAgVXRsLkpTLnJlbW92ZUFsbENoaWxkcmVuKHRoaXMuX2NvbnRlbnRzRGl2KTtcbiAgICB9XG5cbiAgICAvLyBOT1RFOiBUaGlzIHdpbGwgY2xlYXIgb3V0IHRoZSBjb250ZW50cyBvZiB0aGUgZGlhbG9nIGFuZCByZXBsYWNlIHdpdGggYSB3YWl0IHNwaW5uZXIuXG4gICAgcHVibGljIHNob3dXYWl0U3Bpbm5lcihjYXB0aW9uOnN0cmluZywgb2Zmc2V0PzpudW1iZXIpOnZvaWQge1xuICAgICAgICB0aGlzLmNsZWFyQ29udGVudHMoKTtcblxuICAgICAgICBvZmZzZXQgPSAodHlwZW9mIG9mZnNldCA9PT0gJ3VuZGVmaW5lZCcpID8gdGhpcy5faGVpZ2h0IC8gNCA6IG9mZnNldDtcblxuICAgICAgICB2YXIgZWw6SFRNTEVsZW1lbnQgPSBVdGwuSlMuY3JlYXRlRWxlbWVudEZyb21TdHJpbmcoJzxkaXY+XFxcbiAgICAgICAgICAgICAgICA8ZGl2IHN0eWxlPVwiaGVpZ2h0OicgKyBvZmZzZXQudG9TdHJpbmcoKSArICdweFwiPjwvZGl2PlxcXG4gICAgICAgICAgICAgICAgPHRhYmxlIHdpZHRoPVwiMTAwJVwiPiBcXFxuICAgICAgICAgICAgICAgIDx0cj48dGQgYWxpZ249XCJjZW50ZXJcIj4gXFxcbiAgICAgICAgICAgICAgICAgICAgPGRpdj4nICsgY2FwdGlvbiArICc8YnI+PGJyPiBcXFxuICAgICAgICAgICAgICAgICAgICAgICAgPGltZyBzcmM9XCIvc3RhdGljL21haW4vaW1hZ2VzL2xvYWRpbmdfc3Bpbm5lci5naWZcIj48L2ltZz4gXFxcbiAgICAgICAgICAgICAgICAgICAgPC9kaXY+IFxcXG4gICAgICAgICAgICAgICAgPC90ZD48L3RyPiBcXFxuICAgICAgICAgICAgICAgIDwvdGFibGU+XFxcbiAgICAgICAgICAgICAgICA8L2Rpdj4nKTtcblxuICAgICAgICB0aGlzLmFkZEVsZW1lbnQoZWwpO1xuICAgIH1cblxuICAgIC8vIE5PVEU6IFRoaXMgd2lsbCBjbGVhciBvdXQgdGhlIGNvbnRlbnRzIG9mIHRoZSBkaWFsb2cgYW5kIHJlcGxhY2Ugd2l0aCB0aGUgZXJyb3IgdGV4dC5cbiAgICBwdWJsaWMgc2hvd01lc3NhZ2UobWVzc2FnZTpzdHJpbmcsIG9uT0s/OigpID0+IHZvaWQpOnZvaWQge1xuICAgICAgICB0aGlzLmNsZWFyQ29udGVudHMoKTtcblxuICAgICAgICB2YXIgb2Zmc2V0Om51bWJlciA9IHRoaXMuX2hlaWdodCAvIDQ7XG5cbiAgICAgICAgdmFyIGVsOkhUTUxFbGVtZW50ID0gVXRsLkpTLmNyZWF0ZUVsZW1lbnRGcm9tU3RyaW5nKCc8ZGl2PlxcXG4gICAgICAgICAgICAgICAgPGRpdiBzdHlsZT1cImhlaWdodDonICsgb2Zmc2V0LnRvU3RyaW5nKCkgKyAncHhcIj48L2Rpdj5cXFxuICAgICAgICAgICAgICAgIDx0YWJsZSB3aWR0aD1cIjEwMCVcIj4gXFxcbiAgICAgICAgICAgICAgICA8dHI+PHRkIGFsaWduPVwiY2VudGVyXCI+IFxcXG4gICAgICAgICAgICAgICAgICAgIDxkaXY+JyArIG1lc3NhZ2UgKyAnPC9kaXY+IFxcXG4gICAgICAgICAgICAgICAgPC90ZD48L3RyPiBcXFxuICAgICAgICAgICAgICAgIDwvdGFibGU+XFxcbiAgICAgICAgICAgICAgICA8L2Rpdj4nKTtcblxuICAgICAgICB0aGlzLmFkZEVsZW1lbnQoZWwpO1xuICAgIH1cblxufVxuXG5cblxuLy8gUmV0dXJuZWQgaW4gYSBsaXN0IGJ5IHRoZSBzZXJ2ZXIgaW4gcmVxdWVzdFN0dWR5TWV0YWJvbGljTWFwXG5pbnRlcmZhY2UgU2VydmVyTWV0YWJvbGljTWFwIHtcbiAgICBuYW1lOnN0cmluZztcbiAgICBpZDpudW1iZXI7XG4gICAgYmlvbWFzc0NhbGN1bGF0aW9uOm51bWJlcjsgICAgLy8gLTEgaWYgdGhpcyBtYXAgZG9lc24ndCBoYXZlIGEgYmlvbWFzcyBjYWxjdWxhdGlvbiB5ZXRcbn1cblxuaW50ZXJmYWNlIFNlcnZlckJpb21hc3NSZWFjdGlvbiB7XG4gICAgbWV0YWJvbGljTWFwSUQ6bnVtYmVyO1xuICAgIHJlYWN0aW9uTmFtZTpzdHJpbmc7XG4gICAgcmVhY3Rpb25JRDpzdHJpbmc7XG59XG5cbmludGVyZmFjZSBTZXJ2ZXJCaW9tYXNzU3BlY2llc0VudHJ5IHtcbiAgICBzYm1sU3BlY2llc05hbWU6c3RyaW5nOyAgICAgLy8gVGhlIHNwZWNpZXNSZWZlcmVuY2UgbmFtZSBpbiB0aGUgU0JNTCBmaWxlXG4gICAgZWRkTWV0YWJvbGl0ZU5hbWU6c3RyaW5nOyAgIC8vIFRoZSBtZXRhYm9saXRlIGluIEVERCAoZnJvbSBtZXRhYm9saXRlX3R5cGVzLnR5cGVfbmFtZVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyB0aGF0IG1hdGNoZXMgdGhlIHNwZWNpZXMsIG9yICcnIGlmIG5vdCBtYXRjaGVkIHlldClcbn1cblxuaW50ZXJmYWNlIE1ldGFib2xpY01hcENob29zZXJSZXN1bHQge1xuICAgIChlcnI6c3RyaW5nLFxuICAgICAgICBtZXRhYm9saWNNYXBJRD86bnVtYmVyLFxuICAgICAgICBtZXRhYm9saWNNYXBGaWxlbmFtZT86c3RyaW5nLFxuICAgICAgICBiaW9tYXNzQ2FsY3VsYXRpb24/Om51bWJlcik6IHZvaWQ7XG59O1xuXG5cblxuLy8gVGhpcyBVSSBsZXRzIHRoZSB1c2VyIHBpY2sgYSBtZXRhYm9saWMgbWFwIGFuZCBhIGJpb21hc3MgcmVhY3Rpb24gaW5zaWRlIG9mIGl0IHRvIHVzZSBmb3IgdGhlXG4vLyBzcGVjaWZpZWQgc3R1ZHkuXG5jbGFzcyBTdHVkeU1ldGFib2xpY01hcENob29zZXIge1xuXG4gICAgcHJpdmF0ZSBfZGlhbG9nQm94OkRpYWxvZ0JveDtcblxuICAgIGNvbnN0cnVjdG9yKGNoZWNrV2l0aFNlcnZlckZpcnN0OmJvb2xlYW4sIGNhbGxiYWNrOk1ldGFib2xpY01hcENob29zZXJSZXN1bHQpIHtcbiAgICAgICAgdGhpcy5fZGlhbG9nQm94ID0gbmV3IERpYWxvZ0JveCggNTAwLCA1MDAgKTtcbiAgICAgICAgdGhpcy5fZGlhbG9nQm94LnNob3dXYWl0U3Bpbm5lcignUGxlYXNlIHdhaXQuLi4nKTtcblxuICAgICAgICBpZiAoY2hlY2tXaXRoU2VydmVyRmlyc3QpIHtcbiAgICAgICAgICAgIC8vIEZpcnN0IGNoZWNrIHRoZSBtZXRhYm9saWMgbWFwIGFzc29jaWF0ZWQgd2l0aCB0aGlzIHN0dWR5LlxuICAgICAgICAgICAgdGhpcy5fcmVxdWVzdFN0dWR5TWV0YWJvbGljTWFwKCAobWFwOlNlcnZlck1ldGFib2xpY01hcCk6dm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKG1hcC5pZCA9PT0gLTEpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gVGhpcyBzdHVkeSBoYXNuJ3QgYm91bmQgdG8gYSBtZXRhYm9saWMgbWFwIHlldC4gXG4gICAgICAgICAgICAgICAgICAgIC8vIExldCdzIHNob3cgYSBjaG9vc2VyIGZvciB0aGUgbWV0YWJvbGljIG1hcC5cbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fY2hvb3NlTWV0YWJvbGljTWFwKGNhbGxiYWNrKTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAvLyBPaywgZXZlcnl0aGluZyBpcyBmaW5lLiBUaGlzIHNob3VsZCBvbmx5IGhhcHBlbiBpZiBzb21lb25lIGVsc2Ugc2V0dXAgdGhlXG4gICAgICAgICAgICAgICAgICAgIC8vIGJpb21hc3MgY2FsY3VsYXRpb24gZm9yIHRoaXMgc3R1ZHkgaW4gdGhlIGJhY2tncm91bmQgc2luY2UgdGhlIHBhZ2Ugd2FzXG4gICAgICAgICAgICAgICAgICAgIC8vIG9yaWdpbmFsbHkgbG9hZGVkLlxuICAgICAgICAgICAgICAgICAgICB0aGlzLl9kaWFsb2dCb3gudGVybSgpO1xuICAgICAgICAgICAgICAgICAgICBjYWxsYmFjay5jYWxsKHt9LCBudWxsLCBtYXAuaWQsIG1hcC5uYW1lLCBtYXAuYmlvbWFzc0NhbGN1bGF0aW9uKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9LCAoZXJyOnN0cmluZyk6dm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgY2FsbGJhY2suY2FsbCh7fSwgZXJyKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgLy8gVGhpcyBzdHVkeSBoYXNuJ3QgYm91bmQgdG8gYSBtZXRhYm9saWMgbWFwIHlldC4gXG4gICAgICAgICAgICAvLyBMZXQncyBzaG93IGEgY2hvb3NlciBmb3IgdGhlIG1ldGFib2xpYyBtYXAuXG4gICAgICAgICAgICB0aGlzLl9jaG9vc2VNZXRhYm9saWNNYXAoY2FsbGJhY2spO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBfYmFzZVBheWxvYWQoKTphbnkge1xuICAgICAgICB2YXIgdG9rZW46c3RyaW5nID0gZG9jdW1lbnQuY29va2llLnJlcGxhY2UoXG4gICAgICAgICAgICAvKD86KD86XnwuKjtcXHMqKWNzcmZ0b2tlblxccypcXD1cXHMqKFteO10qKS4qJCl8Xi4qJC8sXG4gICAgICAgICAgICAnJDEnKTtcbiAgICAgICAgcmV0dXJuIHsgJ2NzcmZtaWRkbGV3YXJldG9rZW4nOiB0b2tlbiB9O1xuICAgIH1cblxuICAgIC8vIFByZXNlbnQgdGhlIHVzZXIgd2l0aCBhIGxpc3Qgb2YgU0JNTCBmaWxlcyB0byBjaG9vc2UgZnJvbS4gSWYgdGhleSBjaG9vc2Ugb25lXG4gICAgLy8gYW5kIGl0IHN0aWxsIHJlcXVpcmVzIGJpb21hc3MgY2FsY3VsYXRpb25zLCB3ZSdsbCBnbyBvbiB0byBfbWF0Y2hNZXRhYm9saXRlcygpLlxuICAgIHByaXZhdGUgX2Nob29zZU1ldGFib2xpY01hcChjYWxsYmFjazpNZXRhYm9saWNNYXBDaG9vc2VyUmVzdWx0KTp2b2lkIHtcbiAgICAgICAgdGhpcy5fcmVxdWVzdE1ldGFib2xpY01hcExpc3QoIChtZXRhYm9saWNNYXBzOlNlcnZlck1ldGFib2xpY01hcFtdKTp2b2lkID0+IHtcbiAgICAgICAgICAgIC8vIERpc3BsYXkgdGhlIGxpc3QuXG4gICAgICAgICAgICB0aGlzLl9kaWFsb2dCb3guY2xlYXJDb250ZW50cygpO1xuICAgICAgICAgICAgdGhpcy5fZGlhbG9nQm94LmFkZEhUTUwoXG4gICAgICAgICAgICAgICAgJzxkaXY+UGxlYXNlIGNob29zZSBhbiBTQk1MIGZpbGUgdG8gZ2V0IHRoZSBiaW9tYXNzIGRhdGEgZnJvbS4nICtcbiAgICAgICAgICAgICAgICAnPGJyPlRoaXMgaXMgbmVjZXNzYXJ5IHRvIGNhbGN1bGF0ZSBjYXJib24gYmFsYW5jZS48YnI+PGJyPjwvZGl2PicpO1xuXG4gICAgICAgICAgICB2YXIgdGFibGU6VXRsLlRhYmxlID0gbmV3IFV0bC5UYWJsZSgnbWV0YWJvbGljTWFwQ2hvb3NlcicpO1xuICAgICAgICAgICAgdGFibGUudGFibGUuc2V0QXR0cmlidXRlKCdjZWxsc3BhY2luZycsICcwJyk7XG4gICAgICAgICAgICAkKHRhYmxlLnRhYmxlKS5jc3MoJ2JvcmRlci1jb2xsYXBzZScsICdjb2xsYXBzZScpO1xuXG4gICAgICAgICAgICBtZXRhYm9saWNNYXBzLmZvckVhY2goKG1hcDpTZXJ2ZXJNZXRhYm9saWNNYXApOnZvaWQgPT4ge1xuICAgICAgICAgICAgICAgIHRhYmxlLmFkZFJvdygpO1xuICAgICAgICAgICAgICAgIHZhciBjb2x1bW46YW55ID0gdGFibGUuYWRkQ29sdW1uKCk7XG4gICAgICAgICAgICAgICAgY29sdW1uLmlubmVySFRNTCA9IG1hcC5uYW1lO1xuICAgICAgICAgICAgICAgICQoY29sdW1uKS5jc3MoJ2N1cnNvcicsICdwb2ludGVyJyk7IC8vIG1ha2UgaXQgbG9vayBsaWtlIGEgbGlua1xuICAgICAgICAgICAgICAgICQoY29sdW1uKS5jc3MoJ2JvcmRlci10b3AnLCAnMXB4IHNvbGlkICMwMDAnKTsgLy8gbWFrZSBpdCBsb29rIGxpa2UgYSBsaW5rXG4gICAgICAgICAgICAgICAgJChjb2x1bW4pLmNzcygnYm9yZGVyLWJvdHRvbScsICcxcHggc29saWQgIzAwMCcpOyAvLyBtYWtlIGl0IGxvb2sgbGlrZSBhIGxpbmtcbiAgICAgICAgICAgICAgICAkKGNvbHVtbikuY3NzKCdwYWRkaW5nJywgJzEwcHgnKTsgLy8gbWFrZSBpdCBsb29rIGxpa2UgYSBsaW5rXG4gICAgICAgICAgICAgICAgJChjb2x1bW4pLmNsaWNrKHRoaXMuX29uTWV0YWJvbGljTWFwQ2hvc2VuLmJpbmQodGhpcywgbWFwLCBjYWxsYmFjaykpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB0aGlzLl9kaWFsb2dCb3guYWRkRWxlbWVudCh0YWJsZS50YWJsZSk7XG4gICAgICAgIH0sIChlcnI6c3RyaW5nKTp2b2lkID0+IHtcbiAgICAgICAgICAgIHRoaXMuX2RpYWxvZ0JveC5zaG93TWVzc2FnZShlcnIsICgpOnZvaWQgPT4gY2FsbGJhY2suY2FsbCh7fSwgZXJyKSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuXG4gICAgLy8gQ2FsbGVkIHdoZW4gdGhleSBjbGljayBvbiBhIGJpb21hc3MgcmVhY3Rpb24uXG4gICAgcHJpdmF0ZSBfb25NZXRhYm9saWNNYXBDaG9zZW4obWFwOlNlcnZlck1ldGFib2xpY01hcCxcbiAgICAgICAgICAgIGNhbGxiYWNrOk1ldGFib2xpY01hcENob29zZXJSZXN1bHQpOnZvaWQge1xuICAgICAgICAvLyBCZWZvcmUgd2UgcmV0dXJuIHRvIHRoZSBjYWxsZXIsIHRlbGwgdGhlIHNlcnZlciB0byBzdG9yZSB0aGlzIGFzc29jaWF0aW9uLlxuICAgICAgICB0aGlzLl9yZXF1ZXN0U2V0U3R1ZHlNZXRhYm9saWNNYXAobWFwLmlkLFxuICAgICAgICAgICAgKGVycm9yOnN0cmluZyk6dm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgdGhpcy5fZGlhbG9nQm94LnNob3dNZXNzYWdlKGVycm9yLCAoKTp2b2lkID0+IGNhbGxiYWNrLmNhbGwoe30sIGVycm9yKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICk7XG4gICAgfVxuXG5cbiAgICAvLyBHZXQgaW5mbyBmcm9tIHRoZSBzZXJ2ZXIuLlxuICAgIHByaXZhdGUgX3JlcXVlc3RTdHVkeU1ldGFib2xpY01hcChcbiAgICAgICAgICAgIGNhbGxiYWNrOiAobWFwOlNlcnZlck1ldGFib2xpY01hcCkgPT4gdm9pZCxcbiAgICAgICAgICAgIGVycm9yOiAoZXJyb3I6c3RyaW5nKSA9PiB2b2lkKTogdm9pZCB7XG4gICAgICAgICQuYWpheCh7XG4gICAgICAgICAgICBkYXRhVHlwZTogXCJqc29uXCIsXG4gICAgICAgICAgICB1cmw6IFwibWFwL1wiLFxuICAgICAgICAgICAgc3VjY2VzczogY2FsbGJhY2ssXG4gICAgICAgICAgICBlcnJvcjogKGpxWEhSOkpRdWVyeVhIUiwgc3RhdHVzOnN0cmluZywgZXJyb3JUZXh0OnN0cmluZyk6dm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgZXJyb3IuY2FsbCh7fSwgc3RhdHVzICsgXCIgXCIgKyBlcnJvclRleHQpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9XG5cblxuICAgIC8vIEdldCBhIGxpc3Qgb2YgbWV0YWJvbGljIG1hcHMgdGhhdCB3ZSBjb3VsZCB1c2UgZm9yIHRoaXMgc3R1ZHkuXG4gICAgcHJpdmF0ZSBfcmVxdWVzdE1ldGFib2xpY01hcExpc3QoXG4gICAgICAgICAgICBjYWxsYmFjazogKG1ldGFib2xpY01hcHM6U2VydmVyTWV0YWJvbGljTWFwW10pID0+IHZvaWQsXG4gICAgICAgICAgICBlcnJvcjogKGVycm9yOnN0cmluZykgPT4gdm9pZCk6dm9pZCB7XG4gICAgICAgICQuYWpheCh7XG4gICAgICAgICAgICBkYXRhVHlwZTogXCJqc29uXCIsXG4gICAgICAgICAgICB1cmw6IFwiL2RhdGEvc2JtbC9cIixcbiAgICAgICAgICAgIHN1Y2Nlc3M6IGNhbGxiYWNrLFxuICAgICAgICAgICAgZXJyb3I6IChqcVhIUjpKUXVlcnlYSFIsIHN0YXR1czpzdHJpbmcsIGVycm9yVGV4dDpzdHJpbmcpOnZvaWQgPT4ge1xuICAgICAgICAgICAgICAgIGVycm9yLmNhbGwoe30sIHN0YXR1cyArIFwiIFwiICsgZXJyb3JUZXh0KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfVxuXG5cbiAgICBwcml2YXRlIF9yZXF1ZXN0U2V0U3R1ZHlNZXRhYm9saWNNYXAobWV0YWJvbGljTWFwSUQ6bnVtYmVyLFxuICAgICAgICAgICAgY2FsbGJhY2s6IChlcnI6c3RyaW5nKSA9PiB2b2lkKTp2b2lkIHtcbiAgICAgICAgJC5hamF4KHtcbiAgICAgICAgICAgIHR5cGU6IFwiUE9TVFwiLFxuICAgICAgICAgICAgZGF0YVR5cGU6IFwianNvblwiLFxuICAgICAgICAgICAgdXJsOiBcIm1hcC9cIixcbiAgICAgICAgICAgIGRhdGE6ICQuZXh0ZW5kKHt9LCB0aGlzLl9iYXNlUGF5bG9hZCgpLCB7IFwibWV0YWJvbGljTWFwSURcIjogbWV0YWJvbGljTWFwSUQgfSksXG4gICAgICAgICAgICBlcnJvcjogKGpxWEhSOkpRdWVyeVhIUiwgc3RhdHVzOnN0cmluZywgZXJyb3JUZXh0OnN0cmluZyk6dm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgY2FsbGJhY2suY2FsbCh7fSwgc3RhdHVzICsgXCIgXCIgKyBlcnJvclRleHQpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9XG5cbn1cblxuXG5cbmludGVyZmFjZSBCaW9tYXNzUmVzdWx0c0NhbGxiYWNrIHtcbiAgICAoZXJyOnN0cmluZywgZmluYWxCaW9tYXNzPzpudW1iZXIpOiB2b2lkO1xufTtcblxuLy8gVGhpcyBVSSBoYW5kbGVzIG1hcHBpbmcgU0JNTCBzcGVjaWVzIHRvIEVERCBtZXRhYm9saXRlcywgY2FsY3VsYXRpbmcgXG4vLyB0aGUgYmlvbWFzcywgYW5kIHJlbWVtYmVyaW5nIHRoZSByZXN1bHQuXG5jbGFzcyBCaW9tYXNzQ2FsY3VsYXRpb25VSSB7XG5cbiAgICBwcml2YXRlIF9kaWFsb2dCb3g6RGlhbG9nQm94O1xuXG4gICAgY29uc3RydWN0b3IobWV0YWJvbGljTWFwSUQ6bnVtYmVyLCBjYWxsYmFjazpCaW9tYXNzUmVzdWx0c0NhbGxiYWNrKSB7XG4gICAgICAgIHRoaXMuX2RpYWxvZ0JveCA9IG5ldyBEaWFsb2dCb3goIDUwMCwgNTAwICk7XG5cbiAgICAgICAgLy8gRmlyc3QsIGhhdmUgdGhlIHVzZXIgcGljayBhIGJpb21hc3MgcmVhY3Rpb24uXG4gICAgICAgIHRoaXMuX2RpYWxvZ0JveC5zaG93V2FpdFNwaW5uZXIoJ0xvb2tpbmcgdXAgYmlvbWFzcyByZWFjdGlvbnMuLi4nKTtcblxuICAgICAgICB0aGlzLl9yZXF1ZXN0QmlvbWFzc1JlYWN0aW9uTGlzdChtZXRhYm9saWNNYXBJRCxcbiAgICAgICAgICAgICAgICAocmVhY3Rpb25zOlNlcnZlckJpb21hc3NSZWFjdGlvbltdKTp2b2lkID0+IHtcbiAgICAgICAgICAgIHZhciB0YWJsZTpVdGwuVGFibGU7XG4gICAgICAgICAgICBpZiAoIXJlYWN0aW9ucy5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICB0aGlzLl9kaWFsb2dCb3guc2hvd01lc3NhZ2UoXG4gICAgICAgICAgICAgICAgICAgICdUaGVyZSBhcmUgbm8gYmlvbWFzcyByZWFjdGlvbnMgaW4gdGhpcyBtZXRhYm9saWMgbWFwIScpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAvLyBEaXNwbGF5IHRoZSBsaXN0IG9mIGJpb21hc3MgcmVhY3Rpb25zLlxuICAgICAgICAgICAgICAgIHRoaXMuX2RpYWxvZ0JveC5jbGVhckNvbnRlbnRzKCk7XG4gICAgICAgICAgICAgICAgdGhpcy5fZGlhbG9nQm94LmFkZEhUTUwoXG4gICAgICAgICAgICAgICAgICAgICc8ZGl2PlBsZWFzZSBjaG9vc2UgYSBiaW9tYXNzIHJlYWN0aW9uIHRvIHVzZSBmb3IgY2FyYm9uIGJhbGFuY2UuJyArXG4gICAgICAgICAgICAgICAgICAgICc8YnI+PGJyPjwvZGl2PicpO1xuICAgICAgICAgICAgICAgIHRhYmxlID0gbmV3IFV0bC5UYWJsZSgnYmlvbWFzc1JlYWN0aW9uQ2hvb3NlcicpO1xuICAgICAgICAgICAgICAgIHRhYmxlLnRhYmxlLnNldEF0dHJpYnV0ZSgnY2VsbHNwYWNpbmcnLCAnMCcpO1xuICAgICAgICAgICAgICAgICQodGFibGUudGFibGUpLmNzcygnYm9yZGVyLWNvbGxhcHNlJywgJ2NvbGxhcHNlJyk7XG5cbiAgICAgICAgICAgICAgICByZWFjdGlvbnMuZm9yRWFjaCgocmVhY3Rpb246U2VydmVyQmlvbWFzc1JlYWN0aW9uKTp2b2lkID0+IHtcbiAgICAgICAgICAgICAgICAgICAgdGFibGUuYWRkUm93KCk7XG4gICAgICAgICAgICAgICAgICAgIHZhciBjb2x1bW46YW55ID0gdGFibGUuYWRkQ29sdW1uKCk7XG4gICAgICAgICAgICAgICAgICAgIGNvbHVtbi5pbm5lckhUTUwgPSByZWFjdGlvbi5yZWFjdGlvbk5hbWU7XG4gICAgICAgICAgICAgICAgICAgICQoY29sdW1uKS5jc3MoJ2N1cnNvcicsICdwb2ludGVyJyk7IC8vIG1ha2UgaXQgbG9vayBsaWtlIGEgbGlua1xuICAgICAgICAgICAgICAgICAgICAkKGNvbHVtbikuY3NzKCdib3JkZXItdG9wJywgJzFweCBzb2xpZCAjMDAwJyk7IC8vIG1ha2UgaXQgbG9vayBsaWtlIGEgbGlua1xuICAgICAgICAgICAgICAgICAgICAkKGNvbHVtbikuY3NzKCdib3JkZXItYm90dG9tJywgJzFweCBzb2xpZCAjMDAwJyk7IC8vIG1ha2UgaXQgbG9vayBsaWtlIGEgbGlua1xuICAgICAgICAgICAgICAgICAgICAkKGNvbHVtbikuY3NzKCdwYWRkaW5nJywgJzEwcHgnKTsgLy8gbWFrZSBpdCBsb29rIGxpa2UgYSBsaW5rXG4gICAgICAgICAgICAgICAgICAgICQoY29sdW1uKS5jbGljayggKCk6dm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9vbkJpb21hc3NSZWFjdGlvbkNob3NlbihtZXRhYm9saWNNYXBJRCwgcmVhY3Rpb24sIGNhbGxiYWNrKTtcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgdGhpcy5fZGlhbG9nQm94LmFkZEVsZW1lbnQodGFibGUudGFibGUpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgIH0sIChlcnJvcjpzdHJpbmcpOnZvaWQgPT4ge1xuICAgICAgICAgICAgdGhpcy5fZGlhbG9nQm94LnNob3dNZXNzYWdlKGVycm9yLCAoKTp2b2lkID0+IGNhbGxiYWNrLmNhbGwoe30sIGVycm9yKSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuXG4gICAgLy8gVGhlIHVzZXIgY2hvc2UgYSBiaW9tYXNzIHJlYWN0aW9uLiBOb3cgd2UgY2FuIHNob3cgYWxsIHRoZSBzcGVjaWVzIGluIHRoZSByZWFjdGlvbiBhbmRcbiAgICAvLyBtYXRjaCB0byBFREQgbWV0YWJvbGl0ZXMuXG4gICAgcHJpdmF0ZSBfb25CaW9tYXNzUmVhY3Rpb25DaG9zZW4obWV0YWJvbGljTWFwSUQ6bnVtYmVyLCByZWFjdGlvbjpTZXJ2ZXJCaW9tYXNzUmVhY3Rpb24sXG4gICAgICAgICAgICBjYWxsYmFjazpCaW9tYXNzUmVzdWx0c0NhbGxiYWNrKTp2b2lkIHtcbiAgICAgICAgLy8gUHVsbCBhIGxpc3Qgb2YgYWxsIG1ldGFib2xpdGVzIGluIHRoaXMgcmVhY3Rpb24uXG4gICAgICAgIHRoaXMuX2RpYWxvZ0JveC5zaG93V2FpdFNwaW5uZXIoJ0dldHRpbmcgc3BlY2llcyBsaXN0Li4uJyk7XG4gICAgICAgIHRoaXMuX3JlcXVlc3RTcGVjaWVzTGlzdEZyb21CaW9tYXNzUmVhY3Rpb24obWV0YWJvbGljTWFwSUQsIHJlYWN0aW9uLnJlYWN0aW9uSUQsXG4gICAgICAgICAgICAgICAgKHNwZWNpZXNMaXN0OlNlcnZlckJpb21hc3NTcGVjaWVzRW50cnlbXSk6dm9pZCA9PiB7XG4gICAgICAgICAgICB2YXIgdGFibGU6VXRsLlRhYmxlID0gbmV3IFV0bC5UYWJsZSgnYmlvbWFzc1JlYWN0aW9uQ2hvb3NlcicpLFxuICAgICAgICAgICAgICAgIGlucHV0czphbnlbXSA9IFtdO1xuICAgICAgICAgICAgdGFibGUudGFibGUuc2V0QXR0cmlidXRlKCdjZWxsc3BhY2luZycsICcwJyk7XG4gICAgICAgICAgICAkKHRhYmxlLnRhYmxlKS5jc3MoJ2JvcmRlci1jb2xsYXBzZScsICdjb2xsYXBzZScpO1xuXG4gICAgICAgICAgICBzcGVjaWVzTGlzdC5mb3JFYWNoKChzcGVjaWVzOlNlcnZlckJpb21hc3NTcGVjaWVzRW50cnksIGk6bnVtYmVyKTp2b2lkID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgc3BlY2llc0NvbHVtbjpIVE1MRWxlbWVudCwgbWV0YWJvbGl0ZUNvbHVtbjpIVE1MRWxlbWVudCwgYXV0b0NvbXA6SlF1ZXJ5O1xuICAgICAgICAgICAgICAgIHRhYmxlLmFkZFJvdygpO1xuICAgICAgICAgICAgICAgIHNwZWNpZXNDb2x1bW4gPSB0YWJsZS5hZGRDb2x1bW4oKTtcbiAgICAgICAgICAgICAgICBzcGVjaWVzQ29sdW1uLmlubmVySFRNTCA9IHNwZWNpZXMuc2JtbFNwZWNpZXNOYW1lO1xuICAgICAgICAgICAgICAgIG1ldGFib2xpdGVDb2x1bW4gPSB0YWJsZS5hZGRDb2x1bW4oKTtcbiAgICAgICAgICAgICAgICBhdXRvQ29tcCA9IEVERF9hdXRvLmNyZWF0ZV9hdXRvY29tcGxldGUobWV0YWJvbGl0ZUNvbHVtbik7XG4gICAgICAgICAgICAgICAgYXV0b0NvbXAuYWRkQ2xhc3MoJ2F1dG9jb21wX21ldGFib2wnKTtcbiAgICAgICAgICAgICAgICBpbnB1dHMucHVzaChhdXRvQ29tcCk7XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgdGhpcy5fZGlhbG9nQm94LmNsZWFyQ29udGVudHMoKTtcbiAgICAgICAgICAgIHRoaXMuX2RpYWxvZ0JveC5hZGRIVE1MKFxuICAgICAgICAgICAgICAgICc8ZGl2PlBsZWFzZSBtYXRjaCBTQk1MIHNwZWNpZXMgdG8gRUREIG1ldGFib2xpdGVzLjxicj48YnI+PC9kaXY+Jyk7XG4gICAgICAgICAgICB0aGlzLl9kaWFsb2dCb3guYWRkRWxlbWVudCh0YWJsZS50YWJsZSk7XG5cbiAgICAgICAgICAgIHZhciBlcnJvclN0cmluZ0VsZW1lbnQ6SFRNTEVsZW1lbnQgPSBVdGwuSlMuY3JlYXRlRWxlbWVudEZyb21TdHJpbmcoXG4gICAgICAgICAgICAgICAgJzxzcGFuIHN0eWxlPVwiZm9udC1zaXplOjEycHg7IGNvbG9yOnJlZDtcIj48L3NwYW4+Jyk7XG4gICAgICAgICAgICAkKGVycm9yU3RyaW5nRWxlbWVudCkuY3NzKCd2aXNpYmlsaXR5JywgJ2hpZGRlbicpO1xuICAgICAgICAgICAgdGhpcy5fZGlhbG9nQm94LmFkZEVsZW1lbnQoZXJyb3JTdHJpbmdFbGVtZW50KTtcblxuICAgICAgICAgICAgLy8gQ3JlYXRlIGFuIE9LIGJ1dHRvbiBhdCB0aGUgYm90dG9tLlxuICAgICAgICAgICAgdmFyIG9rQnV0dG9uOkhUTUxFbGVtZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnYnV0dG9uJyk7XG4gICAgICAgICAgICBva0J1dHRvbi5hcHBlbmRDaGlsZChkb2N1bWVudC5jcmVhdGVUZXh0Tm9kZSgnT0snKSk7XG4gICAgICAgICAgICAkKG9rQnV0dG9uKS5jbGljayggKCk6dm9pZCA9PiB0aGlzLl9vbkZpbmlzaGVkQmlvbWFzc1NwZWNpZXNFbnRyeShzcGVjaWVzTGlzdCwgaW5wdXRzLFxuICAgICAgICAgICAgICAgIGVycm9yU3RyaW5nRWxlbWVudCwgbWV0YWJvbGljTWFwSUQsIHJlYWN0aW9uLCBjYWxsYmFjaykpO1xuICAgICAgICAgICAgdGhpcy5fZGlhbG9nQm94LmFkZEVsZW1lbnQob2tCdXR0b24pO1xuXG4gICAgICAgICAgICBpbnB1dHMuZm9yRWFjaCgoaW5wdXQpID0+IHtcbiAgICAgICAgICAgICAgICBFRERfYXV0by5zZXR1cF9maWVsZF9hdXRvY29tcGxldGUoaW5wdXQsICdNZXRhYm9saXRlJywgRURERGF0YS5NZXRhYm9saXRlVHlwZXMgfHwge30pO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0sIChlcnJvcjpzdHJpbmcpOnZvaWQgPT4ge1xuICAgICAgICAgICAgdGhpcy5fZGlhbG9nQm94LnNob3dNZXNzYWdlKGVycm9yLCAoKTp2b2lkID0+IGNhbGxiYWNrLmNhbGwoe30sIGVycm9yKSk7XG4gICAgICAgIH0pO1xuXG4gICAgfVxuXG5cbiAgICAvLyBDYWxsZWQgd2hlbiB0aGV5IGNsaWNrIHRoZSBPSyBidXR0b24gb24gdGhlIGJpb21hc3Mgc3BlY2llcyBsaXN0LlxuICAgIHByaXZhdGUgX29uRmluaXNoZWRCaW9tYXNzU3BlY2llc0VudHJ5KHNwZWNpZXNMaXN0OlNlcnZlckJpb21hc3NTcGVjaWVzRW50cnlbXSwgaW5wdXRzOmFueVtdLFxuICAgICAgICBlcnJvclN0cmluZ0VsZW1lbnQ6SFRNTEVsZW1lbnQsIG1ldGFib2xpY01hcElEOm51bWJlciwgcmVhY3Rpb246U2VydmVyQmlvbWFzc1JlYWN0aW9uLFxuICAgICAgICBjYWxsYmFjazpCaW9tYXNzUmVzdWx0c0NhbGxiYWNrKTp2b2lkIHtcblxuICAgICAgICAvLyBBcmUgdGhlIGlucHV0cyBhbGwgZmlsbGVkIGluP1xuICAgICAgICB2YXIgbnVtRW1wdHk6bnVtYmVyID0gaW5wdXRzLmZpbHRlcigoaW5wdXQ6SlF1ZXJ5KTpib29sZWFuID0+IGlucHV0LnZhbCgpID09PSAnJykubGVuZ3RoO1xuXG4gICAgICAgIGlmICgkKGVycm9yU3RyaW5nRWxlbWVudCkuY3NzKCd2aXNpYmlsaXR5JykgPT09ICdoaWRkZW4nKSB7XG4gICAgICAgICAgICAvLyBTaG93IHRoZW0gYW4gZXJyb3IgbWVzc2FnZSwgYnV0IG5leHQgdGltZSB0aGV5IGNsaWNrIE9LLCBqdXN0IGRvIHRoZSBiaW9tYXNzXG4gICAgICAgICAgICAvLyBjYWxjdWxhdGlvbiBhbnl3YXkuXG4gICAgICAgICAgICBpZiAobnVtRW1wdHkgPiAwKSB7XG4gICAgICAgICAgICAgICAgJChlcnJvclN0cmluZ0VsZW1lbnQpLmNzcygndmlzaWJpbGl0eScsICd2aXNpYmxlJyk7XG4gICAgICAgICAgICAgICAgZXJyb3JTdHJpbmdFbGVtZW50LmlubmVySFRNTCA9ICc8YnI+PGJyPlRoZXJlIGFyZSAnICsgbnVtRW1wdHkudG9TdHJpbmcoKSArXG4gICAgICAgICAgICAgICAgICAgICcgdW5tYXRjaGVkIHNwZWNpZXMuIElmIHlvdSBwcm9jZWVkLCB0aGUgYmlvbWFzcyBjYWxjdWxhdGlvbiB3aWxsIG5vdCcgK1xuICAgICAgICAgICAgICAgICAgICAnIGluY2x1ZGUgdGhlc2UuIENsaWNrIE9LIGFnYWluIHRvIHByb2NlZWQgYW55d2F5Ljxicj48YnI+JztcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICAvLyBTZW5kIGV2ZXJ5dGhpbmcgdG8gdGhlIHNlcnZlciBhbmQgZ2V0IGEgYmlvbWFzcyBjYWxjdWxhdGlvbiBiYWNrLlxuICAgICAgICB0aGlzLl9kaWFsb2dCb3guc2hvd1dhaXRTcGlubmVyKCdDYWxjdWxhdGluZyBmaW5hbCBiaW9tYXNzIGZhY3Rvci4uLicpO1xuXG4gICAgICAgIHZhciBtYXRjaGVzOmFueSA9IHt9O1xuICAgICAgICBpbnB1dHMuZm9yRWFjaCgoaW5wdXQ6SlF1ZXJ5LCBpOm51bWJlcik6dm9pZCA9PiB7XG4gICAgICAgICAgICB2YXIgc3BOYW1lOnN0cmluZyA9IHNwZWNpZXNMaXN0W2ldLnNibWxTcGVjaWVzTmFtZSwgaWQ6c3RyaW5nLCBtZXQ6YW55O1xuICAgICAgICAgICAgaWQgPSBpbnB1dC5uZXh0KCdpbnB1dFt0eXBlPWhpZGRlbl0nKS52YWwoKTtcbiAgICAgICAgICAgIG1ldCA9IEVERERhdGEuTWV0YWJvbGl0ZVR5cGVzW2lkXSB8fCB7fTtcbiAgICAgICAgICAgIG1hdGNoZXNbc3BOYW1lXSA9IG1ldC5uYW1lIHx8ICcnO1xuICAgICAgICB9KTtcblxuICAgICAgICB0aGlzLl9yZXF1ZXN0RmluYWxCaW9tYXNzQ29tcHV0YXRpb24obWV0YWJvbGljTWFwSUQsIHJlYWN0aW9uLnJlYWN0aW9uSUQsIG1hdGNoZXMsXG4gICAgICAgICAgICAgICAgKGZpbmFsQmlvbWFzczpudW1iZXIpOnZvaWQgPT4ge1xuICAgICAgICAgICAgLy8gRmluYWxseSwgcGFzcyB0aGUgYmlvbWFzcyB0byBvdXIgY2FsbGVyLlxuICAgICAgICAgICAgdGhpcy5fZGlhbG9nQm94LnRlcm0oKTtcbiAgICAgICAgICAgIGNhbGxiYWNrKG51bGwsIGZpbmFsQmlvbWFzcyk7XG4gICAgICAgIH0sIChlcnJvcjpzdHJpbmcpOnZvaWQgPT4ge1xuICAgICAgICBcdHRoaXMuX2RpYWxvZ0JveC5zaG93TWVzc2FnZShlcnJvciwgKCk6dm9pZCA9PiBjYWxsYmFjay5jYWxsKHt9LCBlcnJvcikpO1xuICAgICAgICB9KTtcbiAgICB9XG5cblxuICAgIC8vIEdldCBhIGxpc3Qgb2YgYmlvbWFzcyByZWFjdGlvbnMgaW4gdGhlIHNwZWNpZmllZCBtZXRhYm9saWMgbWFwLlxuICAgIHByaXZhdGUgX3JlcXVlc3RTcGVjaWVzTGlzdEZyb21CaW9tYXNzUmVhY3Rpb24obWV0YWJvbGljTWFwSUQ6bnVtYmVyLCByZWFjdGlvbklEOnN0cmluZyxcbiAgICAgICAgICAgIGNhbGxiYWNrOiAoc3BlY2llc0xpc3Q6U2VydmVyQmlvbWFzc1NwZWNpZXNFbnRyeVtdKSA9PiB2b2lkLFxuICAgICAgICAgICAgZXJyb3I6IChlcnJvcjpzdHJpbmcpID0+IHZvaWQpOnZvaWQge1xuICAgICAgICAkLmFqYXgoe1xuICAgICAgICAgICAgZGF0YVR5cGU6IFwianNvblwiLFxuICAgICAgICAgICAgdXJsOiBbIFwiL2RhdGEvc2JtbFwiLCBtZXRhYm9saWNNYXBJRCwgXCJyZWFjdGlvbnNcIiwgcmVhY3Rpb25JRCwgXCJcIiBdLmpvaW4oXCIvXCIpLFxuICAgICAgICAgICAgLy8gcmVmYWN0b3I6IHNlcnZlciByZXR1cm5zIG9iamVjdCwgZXhpc3RpbmcgY29kZSBleHBlY3RzIGFycmF5LCBuZWVkIHRvIHRyYW5zbGF0ZVxuICAgICAgICAgICAgc3VjY2VzczogKGRhdGE6YW55KTp2b2lkID0+IHtcbiAgICAgICAgICAgICAgICB2YXIgdHJhbnNsYXRlZDpTZXJ2ZXJCaW9tYXNzU3BlY2llc0VudHJ5W10gPSBbXTtcbiAgICAgICAgICAgICAgICB0cmFuc2xhdGVkID0gJC5tYXAoZGF0YSwgKHZhbHVlOmFueSwga2V5OnN0cmluZyk6U2VydmVyQmlvbWFzc1NwZWNpZXNFbnRyeSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiAkLmV4dGVuZCh2YWx1ZSwge1xuICAgICAgICAgICAgICAgICAgICAgICAgXCJzYm1sU3BlY2llc05hbWVcIjoga2V5LFxuICAgICAgICAgICAgICAgICAgICAgICAgXCJlZGRNZXRhYm9saXRlTmFtZVwiOiB2YWx1ZS5zblxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICBjYWxsYmFjay5jYWxsKHt9LCB0cmFuc2xhdGVkKTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBlcnJvcjogKGpxWEhSOkpRdWVyeVhIUiwgc3RhdHVzOnN0cmluZywgZXJyb3JUZXh0OnN0cmluZyk6dm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgZXJyb3IuY2FsbCh7fSwgc3RhdHVzICsgXCIgXCIgKyBlcnJvclRleHQpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9XG5cblxuICAgIC8vIEdldCBhIGxpc3Qgb2YgYmlvbWFzcyByZWFjdGlvbnMgaW4gdGhlIHNwZWNpZmllZCBtZXRhYm9saWMgbWFwLlxuICAgIHByaXZhdGUgX3JlcXVlc3RCaW9tYXNzUmVhY3Rpb25MaXN0KG1ldGFib2xpY01hcElEOm51bWJlcixcbiAgICAgICAgICAgIGNhbGxiYWNrOiAocmVhY3Rpb25zOlNlcnZlckJpb21hc3NSZWFjdGlvbltdKSA9PiB2b2lkLFxuICAgICAgICAgICAgZXJyb3I6IChlcnJvcjpzdHJpbmcpID0+IHZvaWQpOnZvaWQge1xuICAgICAgICAkLmFqYXgoe1xuICAgICAgICAgICAgZGF0YVR5cGU6IFwianNvblwiLFxuICAgICAgICAgICAgdXJsOiBcIi9kYXRhL3NibWwvXCIgKyBtZXRhYm9saWNNYXBJRCArIFwiL3JlYWN0aW9ucy9cIixcbiAgICAgICAgICAgIHN1Y2Nlc3M6IGNhbGxiYWNrLFxuICAgICAgICAgICAgZXJyb3I6IChqcVhIUjpKUXVlcnlYSFIsIHN0YXR1czpzdHJpbmcsIGVycm9yVGV4dDpzdHJpbmcpOnZvaWQgPT4ge1xuICAgICAgICAgICAgICAgIGVycm9yLmNhbGwoe30sIHN0YXR1cyArIFwiIFwiICsgZXJyb3JUZXh0KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfVxuXG5cbiAgICAvLyBUaGlzIGlzIHdoZXJlIHdlIHBhc3MgYWxsIHRoZSBzcGVjaWVzLT5tZXRhYm9saXRlIG1hdGNoZXMgdG8gdGhlIHNlcnZlciBhbmQgYXNrIGl0IHRvXG4gICAgLy8gZmluYWxpemUgdGhlIFxuICAgIHByaXZhdGUgX3JlcXVlc3RGaW5hbEJpb21hc3NDb21wdXRhdGlvbihtZXRhYm9saWNNYXBJRDpudW1iZXIsIHJlYWN0aW9uSUQ6c3RyaW5nLCBtYXRjaGVzOmFueSxcbiAgICAgICAgICAgIGNhbGxiYWNrOiAoZmluYWxCaW9tYXNzOm51bWJlcikgPT4gdm9pZCxcbiAgICAgICAgICAgIGVycm9yOiAoZXJyb3I6c3RyaW5nKSA9PiB2b2lkKTp2b2lkIHtcbiAgICAgICAgJC5hamF4KHtcbiAgICAgICAgICAgIHR5cGU6IFwiUE9TVFwiLFxuICAgICAgICAgICAgZGF0YVR5cGU6IFwianNvblwiLFxuICAgICAgICAgICAgdXJsOiBbIFwiL2RhdGEvc2JtbFwiLCBtZXRhYm9saWNNYXBJRCwgXCJyZWFjdGlvbnNcIiwgcmVhY3Rpb25JRCwgXCJjb21wdXRlL1wiIF0uam9pbihcIi9cIiksXG4gICAgICAgICAgICBkYXRhOiB7IFwic3BlY2llc1wiOiBtYXRjaGVzIH0sXG4gICAgICAgICAgICBzdWNjZXNzOiBjYWxsYmFjayxcbiAgICAgICAgICAgIGVycm9yOiAoanFYSFI6SlF1ZXJ5WEhSLCBzdGF0dXM6c3RyaW5nLCBlcnJvclRleHQ6c3RyaW5nKTp2b2lkID0+IHtcbiAgICAgICAgICAgICAgICBlcnJvci5jYWxsKHt9LCBzdGF0dXMgKyBcIiBcIiArIGVycm9yVGV4dCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH1cbn1cblxuXG5cbi8vIFRoaXMgaXMgdGhlIGZ1bGwgVUkgc2VxdWVuY2UgdG8gYXNzb2NpYXRlIGEgbWV0YWJvbGljIG1hcCB3aXRoIGEgc3R1ZHlcbi8vIEFORCBjYWxjdWxhdGUgYmlvbWFzcyBpZiBuZWNlc3NhcnkuIE5vdGUgdGhhdCBpdCBjb3VsZCBzdWNjZWVkIGluIGNob29zaW5nIGEgbmV3IG1ldGFib2xpYyBtYXBcbi8vIGJ1dCB0aGUgdXNlciBjb3VsZCBjYW5jZWwgdGhlIGJpb21hc3MgY2FsY3VsYXRpb24uIEluIHRoYXQgY2FzZSwgeW91ciBjYWxsYmFjayB3b3VsZCBiZSBjYWxsZWRcbi8vIHdpdGggYSB2YWxpZCBtZXRhYm9saWNNYXBGaWxlbmFtZSBidXQgZmluYWxCaW9tYXNzPS0xIChhbmQgZXJyIHdvdWxkIGJlIHNldCkuXG5pbnRlcmZhY2UgRnVsbFN0dWR5QmlvbWFzc1VJUmVzdWx0c0NhbGxiYWNrIHtcbiAgICAoZXJyOnN0cmluZywgbWV0YWJvbGljTWFwSUQ/Om51bWJlciwgbWV0YWJvbGljTWFwRmlsZW5hbWU/OnN0cmluZywgZmluYWxCaW9tYXNzPzpudW1iZXIpOiB2b2lkO1xufTtcblxuY2xhc3MgRnVsbFN0dWR5QmlvbWFzc1VJIHtcbiAgICBjb25zdHJ1Y3RvcihjYWxsYmFjazpGdWxsU3R1ZHlCaW9tYXNzVUlSZXN1bHRzQ2FsbGJhY2spIHtcbiAgICAgICAgdmFyIGNob29zZXI6U3R1ZHlNZXRhYm9saWNNYXBDaG9vc2VyLCBjaG9vc2VySGFuZGxlcjpNZXRhYm9saWNNYXBDaG9vc2VyUmVzdWx0O1xuICAgICAgICBjaG9vc2VySGFuZGxlciA9IChlcnJvcjpzdHJpbmcsXG4gICAgICAgICAgICAgICAgbWV0YWJvbGljTWFwSUQ/Om51bWJlcixcbiAgICAgICAgICAgICAgICBtZXRhYm9saWNNYXBGaWxlbmFtZT86c3RyaW5nLFxuICAgICAgICAgICAgICAgIGJpb21hc3NDYWxjdWxhdGlvbj86bnVtYmVyKTp2b2lkID0+IHtcbiAgICAgICAgICAgIHZhciB1aTpCaW9tYXNzQ2FsY3VsYXRpb25VSTtcbiAgICAgICAgICAgIGlmIChlcnJvcikge1xuICAgICAgICAgICAgICAgIGNhbGxiYWNrLmNhbGwoe30sIGVycm9yKTtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoYmlvbWFzc0NhbGN1bGF0aW9uID09PSAtMSkge1xuICAgICAgICAgICAgICAgIC8vIFRoZSBzdHVkeSBoYXMgYSBtZXRhYm9saWMgbWFwLCBidXQgbm8gYmlvbWFzcyBoYXMgYmVlbiBjYWxjdWxhdGVkIGZvciBpdCB5ZXQuXG4gICAgICAgICAgICAgICAgLy8gV2UgbmVlZCB0byBtYXRjaCBhbGwgbWV0YWJvbGl0ZXMgc28gdGhlIHNlcnZlciBjYW4gY2FsY3VsYXRpb24gYmlvbWFzcy5cbiAgICAgICAgICAgICAgICB1aSA9IG5ldyBCaW9tYXNzQ2FsY3VsYXRpb25VSShtZXRhYm9saWNNYXBJRCxcbiAgICAgICAgICAgICAgICAgICAgKGJpb21hc3NFcnI6c3RyaW5nLCBmaW5hbEJpb21hc3NDYWxjdWxhdGlvbj86bnVtYmVyKTp2b2lkID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhbGxiYWNrLmNhbGwoe30sIGJpb21hc3NFcnIsIG1ldGFib2xpY01hcElELCBtZXRhYm9saWNNYXBGaWxlbmFtZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBmaW5hbEJpb21hc3NDYWxjdWxhdGlvbik7XG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBjYWxsYmFjayhudWxsLCBtZXRhYm9saWNNYXBJRCwgbWV0YWJvbGljTWFwRmlsZW5hbWUsIGJpb21hc3NDYWxjdWxhdGlvbik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgICAgIC8vIEZpcnN0LCBtYWtlIHN1cmUgYSBtZXRhYm9saWMgbWFwIGlzIGJvdW5kIHRvIHRoZSBzdHVkeS5cbiAgICAgICAgY2hvb3NlciA9IG5ldyBTdHVkeU1ldGFib2xpY01hcENob29zZXIodHJ1ZSwgY2hvb3NlckhhbmRsZXIpO1xuICAgIH1cbn1cblxuXG5cbiJdfQ==