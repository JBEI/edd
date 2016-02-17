// Compiled to JS on: Wed Feb 17 2016 14:46:19  
/// <reference path="typescript-declarations.d.ts" />
/// <reference path="lib/jqueryui.d.ts" />
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiQmlvbWFzc0NhbGN1bGF0aW9uVUkuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJCaW9tYXNzQ2FsY3VsYXRpb25VSS50cyJdLCJuYW1lcyI6WyJEaWFsb2dCb3giLCJEaWFsb2dCb3guY29uc3RydWN0b3IiLCJEaWFsb2dCb3gudGVybSIsIkRpYWxvZ0JveC5hZGRIVE1MIiwiRGlhbG9nQm94LmFkZEVsZW1lbnQiLCJEaWFsb2dCb3guY2xlYXJDb250ZW50cyIsIkRpYWxvZ0JveC5zaG93V2FpdFNwaW5uZXIiLCJEaWFsb2dCb3guc2hvd01lc3NhZ2UiLCJTdHVkeU1ldGFib2xpY01hcENob29zZXIiLCJTdHVkeU1ldGFib2xpY01hcENob29zZXIuY29uc3RydWN0b3IiLCJTdHVkeU1ldGFib2xpY01hcENob29zZXIuX2Jhc2VQYXlsb2FkIiwiU3R1ZHlNZXRhYm9saWNNYXBDaG9vc2VyLl9jaG9vc2VNZXRhYm9saWNNYXAiLCJTdHVkeU1ldGFib2xpY01hcENob29zZXIuX29uTWV0YWJvbGljTWFwQ2hvc2VuIiwiU3R1ZHlNZXRhYm9saWNNYXBDaG9vc2VyLl9yZXF1ZXN0U3R1ZHlNZXRhYm9saWNNYXAiLCJTdHVkeU1ldGFib2xpY01hcENob29zZXIuX3JlcXVlc3RNZXRhYm9saWNNYXBMaXN0IiwiU3R1ZHlNZXRhYm9saWNNYXBDaG9vc2VyLl9yZXF1ZXN0U2V0U3R1ZHlNZXRhYm9saWNNYXAiLCJCaW9tYXNzQ2FsY3VsYXRpb25VSSIsIkJpb21hc3NDYWxjdWxhdGlvblVJLmNvbnN0cnVjdG9yIiwiQmlvbWFzc0NhbGN1bGF0aW9uVUkuX29uQmlvbWFzc1JlYWN0aW9uQ2hvc2VuIiwiQmlvbWFzc0NhbGN1bGF0aW9uVUkuX29uRmluaXNoZWRCaW9tYXNzU3BlY2llc0VudHJ5IiwiQmlvbWFzc0NhbGN1bGF0aW9uVUkuX3JlcXVlc3RTcGVjaWVzTGlzdEZyb21CaW9tYXNzUmVhY3Rpb24iLCJCaW9tYXNzQ2FsY3VsYXRpb25VSS5fcmVxdWVzdEJpb21hc3NSZWFjdGlvbkxpc3QiLCJCaW9tYXNzQ2FsY3VsYXRpb25VSS5fcmVxdWVzdEZpbmFsQmlvbWFzc0NvbXB1dGF0aW9uIiwiRnVsbFN0dWR5QmlvbWFzc1VJIiwiRnVsbFN0dWR5QmlvbWFzc1VJLmNvbnN0cnVjdG9yIl0sIm1hcHBpbmdzIjoiQUFBQSxnREFBZ0Q7QUFDaEQscURBQXFEO0FBQ3JELDBDQUEwQztBQUMxQywrQkFBK0I7QUFFL0IsSUFBSSxRQUFRLEdBQUcsUUFBUSxJQUFJLEVBQUUsQ0FBQztBQUU5QixzRkFBc0Y7QUFDdEYsa0NBQWtDO0FBQ2xDO0lBT0lBLG1CQUFtQkEsS0FBWUEsRUFBRUEsTUFBYUE7UUFQbERDLGlCQXNGQ0E7UUE5RU9BLElBQUlBLENBQUNBLE1BQU1BLEdBQUdBLEtBQUtBLENBQUNBO1FBQ3BCQSxJQUFJQSxDQUFDQSxPQUFPQSxHQUFHQSxNQUFNQSxDQUFDQTtRQUV0QkEsSUFBSUEsQ0FBQ0EsWUFBWUEsR0FBR0EsR0FBR0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsdUJBQXVCQSxDQUFDQSxhQUFhQSxDQUFDQSxDQUFDQTtRQUNsRUEsSUFBSUEsQ0FBQ0EsT0FBT0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsQ0FBQ0EsTUFBTUEsQ0FBQ0E7WUFDdkNBLFFBQVFBLEVBQUVBLElBQUlBO1lBQ2RBLEtBQUtBLEVBQUVBLEtBQUtBO1lBQ1pBLE1BQU1BLEVBQUVBLE1BQU1BO1lBQ2RBLEtBQUtBLEVBQUVBLElBQUlBO1lBQ1hBLFNBQVNBLEVBQUVBLEtBQUtBO1lBRWhCQSw2RUFBNkVBO1lBQzdFQSxJQUFJQSxFQUFFQSxVQUFDQSxLQUFXQSxFQUFFQSxFQUEwQkE7Z0JBQzFDQSxDQUFDQSxDQUFDQSxvQkFBb0JBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLE9BQU9BLEVBQUVBLGNBQVdBLE9BQUFBLEtBQUlBLENBQUNBLElBQUlBLEVBQUVBLEVBQVhBLENBQVdBLENBQUVBLENBQUNBO2dCQUMvREEsQ0FBQ0EsQ0FBQ0EscUJBQXFC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OjQ2OjE5ICBcbi8vLyA8cmVmZXJlbmNlIHBhdGg9XCJ0eXBlc2NyaXB0LWRlY2xhcmF0aW9ucy5kLnRzXCIgLz5cbi8vLyA8cmVmZXJlbmNlIHBhdGg9XCJsaWIvanF1ZXJ5dWkuZC50c1wiIC8+XG4vLy8gPHJlZmVyZW5jZSBwYXRoPVwiVXRsLnRzXCIgLz5cblxudmFyIEVERF9hdXRvID0gRUREX2F1dG8gfHwge307XG5cbi8vIEF0IHRoaXMgcG9pbnQsIHRoaXMgY2xhc3MgaXMgZXhwZXJpbWVudGFsLiBJdCdzIHN1cHBvc2VkIHRvIG1ha2UgbW9kYWwgZGlhbG9nIGJveGVzXG4vLyBlYXNpZXIgdG8gY3JlYXRlIGFuZCBjb25maWd1cmUuXG5jbGFzcyBEaWFsb2dCb3gge1xuXG4gICAgcHJpdmF0ZSBfZGlhbG9nOmFueTtcbiAgICBwcml2YXRlIF93aWR0aDpudW1iZXI7XG4gICAgcHJpdmF0ZSBfaGVpZ2h0Om51bWJlcjtcbiAgICBwcml2YXRlIF9jb250ZW50c0RpdjpIVE1MRWxlbWVudDtcblxuICAgIHB1YmxpYyBjb25zdHJ1Y3Rvcih3aWR0aDpudW1iZXIsIGhlaWdodDpudW1iZXIpIHtcbiAgICAgICAgdGhpcy5fd2lkdGggPSB3aWR0aDtcbiAgICAgICAgdGhpcy5faGVpZ2h0ID0gaGVpZ2h0O1xuXG4gICAgICAgIHRoaXMuX2NvbnRlbnRzRGl2ID0gVXRsLkpTLmNyZWF0ZUVsZW1lbnRGcm9tU3RyaW5nKCc8ZGl2PjwvZGl2PicpO1xuICAgICAgICB0aGlzLl9kaWFsb2cgPSAkKHRoaXMuX2NvbnRlbnRzRGl2KS5kaWFsb2coe1xuICAgICAgICAgICAgYXV0b09wZW46IHRydWUsXG4gICAgICAgICAgICB3aWR0aDogd2lkdGgsXG4gICAgICAgICAgICBoZWlnaHQ6IGhlaWdodCxcbiAgICAgICAgICAgIG1vZGFsOiB0cnVlLFxuICAgICAgICAgICAgZHJhZ2dhYmxlOiBmYWxzZSxcblxuICAgICAgICAgICAgLy8gVGhpcyBob29rcyB0aGUgb3ZlcmxheSBzbyB3ZSBjYW4gaGlkZSB0aGUgZGlhbG9nIGlmIHRoZXkgY2xpY2sgb3V0c2lkZSBpdC5cbiAgICAgICAgICAgIG9wZW46IChldmVudDpFdmVudCwgdWk6SlF1ZXJ5VUkuRGlhbG9nVUlQYXJhbXMpOnZvaWQgPT4ge1xuICAgICAgICAgICAgICAgICQoJy51aS13aWRnZXQtb3ZlcmxheScpLmJpbmQoJ2NsaWNrJywgKCk6dm9pZCA9PiB0aGlzLnRlcm0oKSApO1xuICAgICAgICAgICAgICAgICQoJy51aS1kaWFsb2ctdGl0bGViYXInKS5oaWRlKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIC8vIFRoaXMgcmVtb3ZlcyB0aGUgZGlhbG9nICh3aGVyZWFzIGNsZWFyQ29udGVudHMoKSBqdXN0IHJlbW92ZXMgdGhlIGVsZW1lbnRzIGluc2lkZSBpdCkuXG4gICAgcHVibGljIHRlcm0oKTp2b2lkIHtcbiAgICAgICAgdGhpcy5jbGVhckNvbnRlbnRzKCk7XG4gICAgICAgIHRoaXMuX2RpYWxvZy5kaWFsb2coJ2Nsb3NlJyk7XG4gICAgfVxuXG4gICAgLy8gVGhlIEhUTUwgeW91J3JlIGFkZGluZyBtdXN0IGVxdWF0ZSB0byBhbiBlbGVtZW50IGJlY2F1c2Ugd2UganVzdFxuICAgIC8vIHR1cm4gaXQgaW50byBhbiBlbGVtZW50IGFuZCBhZGQgdGhhdCBlbGVtZW50IHRvIG91ciBjb250ZW50cyBkaXYuXG4gICAgcHVibGljIGFkZEhUTUwoaHRtbDpzdHJpbmcpOnZvaWQge1xuICAgICAgICB0aGlzLl9jb250ZW50c0Rpdi5hcHBlbmRDaGlsZChVdGwuSlMuY3JlYXRlRWxlbWVudEZyb21TdHJpbmcoaHRtbCkpO1xuICAgIH1cblxuICAgIHB1YmxpYyBhZGRFbGVtZW50KGVsZW1lbnQ6SFRNTEVsZW1lbnQpOnZvaWQge1xuICAgICAgICB0aGlzLl9jb250ZW50c0Rpdi5hcHBlbmRDaGlsZChlbGVtZW50KTtcbiAgICB9XG5cbiAgICAvLyBSZW1vdmUgYWxsIHN1YiBlbGVtZW50cy5cbiAgICBwdWJsaWMgY2xlYXJDb250ZW50cygpOnZvaWQge1xuICAgICAgICBVdGwuSlMucmVtb3ZlQWxsQ2hpbGRyZW4odGhpcy5fY29udGVudHNEaXYpO1xuICAgIH1cblxuICAgIC8vIE5PVEU6IFRoaXMgd2lsbCBjbGVhciBvdXQgdGhlIGNvbnRlbnRzIG9mIHRoZSBkaWFsb2cgYW5kIHJlcGxhY2Ugd2l0aCBhIHdhaXQgc3Bpbm5lci5cbiAgICBwdWJsaWMgc2hvd1dhaXRTcGlubmVyKGNhcHRpb246c3RyaW5nLCBvZmZzZXQ/Om51bWJlcik6dm9pZCB7XG4gICAgICAgIHRoaXMuY2xlYXJDb250ZW50cygpO1xuXG4gICAgICAgIG9mZnNldCA9ICh0eXBlb2Ygb2Zmc2V0ID09PSAndW5kZWZpbmVkJykgPyB0aGlzLl9oZWlnaHQgLyA0IDogb2Zmc2V0O1xuXG4gICAgICAgIHZhciBlbDpIVE1MRWxlbWVudCA9IFV0bC5KUy5jcmVhdGVFbGVtZW50RnJvbVN0cmluZygnPGRpdj5cXFxuICAgICAgICAgICAgICAgIDxkaXYgc3R5bGU9XCJoZWlnaHQ6JyArIG9mZnNldC50b1N0cmluZygpICsgJ3B4XCI+PC9kaXY+XFxcbiAgICAgICAgICAgICAgICA8dGFibGUgd2lkdGg9XCIxMDAlXCI+IFxcXG4gICAgICAgICAgICAgICAgPHRyPjx0ZCBhbGlnbj1cImNlbnRlclwiPiBcXFxuICAgICAgICAgICAgICAgICAgICA8ZGl2PicgKyBjYXB0aW9uICsgJzxicj48YnI+IFxcXG4gICAgICAgICAgICAgICAgICAgICAgICA8aW1nIHNyYz1cIi9zdGF0aWMvbWFpbi9pbWFnZXMvbG9hZGluZ19zcGlubmVyLmdpZlwiPjwvaW1nPiBcXFxuICAgICAgICAgICAgICAgICAgICA8L2Rpdj4gXFxcbiAgICAgICAgICAgICAgICA8L3RkPjwvdHI+IFxcXG4gICAgICAgICAgICAgICAgPC90YWJsZT5cXFxuICAgICAgICAgICAgICAgIDwvZGl2PicpO1xuXG4gICAgICAgIHRoaXMuYWRkRWxlbWVudChlbCk7XG4gICAgfVxuXG4gICAgLy8gTk9URTogVGhpcyB3aWxsIGNsZWFyIG91dCB0aGUgY29udGVudHMgb2YgdGhlIGRpYWxvZyBhbmQgcmVwbGFjZSB3aXRoIHRoZSBlcnJvciB0ZXh0LlxuICAgIHB1YmxpYyBzaG93TWVzc2FnZShtZXNzYWdlOnN0cmluZywgb25PSz86KCkgPT4gdm9pZCk6dm9pZCB7XG4gICAgICAgIHRoaXMuY2xlYXJDb250ZW50cygpO1xuXG4gICAgICAgIHZhciBvZmZzZXQ6bnVtYmVyID0gdGhpcy5faGVpZ2h0IC8gNDtcblxuICAgICAgICB2YXIgZWw6SFRNTEVsZW1lbnQgPSBVdGwuSlMuY3JlYXRlRWxlbWVudEZyb21TdHJpbmcoJzxkaXY+XFxcbiAgICAgICAgICAgICAgICA8ZGl2IHN0eWxlPVwiaGVpZ2h0OicgKyBvZmZzZXQudG9TdHJpbmcoKSArICdweFwiPjwvZGl2PlxcXG4gICAgICAgICAgICAgICAgPHRhYmxlIHdpZHRoPVwiMTAwJVwiPiBcXFxuICAgICAgICAgICAgICAgIDx0cj48dGQgYWxpZ249XCJjZW50ZXJcIj4gXFxcbiAgICAgICAgICAgICAgICAgICAgPGRpdj4nICsgbWVzc2FnZSArICc8L2Rpdj4gXFxcbiAgICAgICAgICAgICAgICA8L3RkPjwvdHI+IFxcXG4gICAgICAgICAgICAgICAgPC90YWJsZT5cXFxuICAgICAgICAgICAgICAgIDwvZGl2PicpO1xuXG4gICAgICAgIHRoaXMuYWRkRWxlbWVudChlbCk7XG4gICAgfVxuXG59XG5cblxuXG4vLyBSZXR1cm5lZCBpbiBhIGxpc3QgYnkgdGhlIHNlcnZlciBpbiByZXF1ZXN0U3R1ZHlNZXRhYm9saWNNYXBcbmludGVyZmFjZSBTZXJ2ZXJNZXRhYm9saWNNYXAge1xuICAgIG5hbWU6c3RyaW5nO1xuICAgIGlkOm51bWJlcjtcbiAgICBiaW9tYXNzQ2FsY3VsYXRpb246bnVtYmVyOyAgICAvLyAtMSBpZiB0aGlzIG1hcCBkb2Vzbid0IGhhdmUgYSBiaW9tYXNzIGNhbGN1bGF0aW9uIHlldFxufVxuXG5pbnRlcmZhY2UgU2VydmVyQmlvbWFzc1JlYWN0aW9uIHtcbiAgICBtZXRhYm9saWNNYXBJRDpudW1iZXI7XG4gICAgcmVhY3Rpb25OYW1lOnN0cmluZztcbiAgICByZWFjdGlvbklEOnN0cmluZztcbn1cblxuaW50ZXJmYWNlIFNlcnZlckJpb21hc3NTcGVjaWVzRW50cnkge1xuICAgIHNibWxTcGVjaWVzTmFtZTpzdHJpbmc7ICAgICAvLyBUaGUgc3BlY2llc1JlZmVyZW5jZSBuYW1lIGluIHRoZSBTQk1MIGZpbGVcbiAgICBlZGRNZXRhYm9saXRlTmFtZTpzdHJpbmc7ICAgLy8gVGhlIG1ldGFib2xpdGUgaW4gRUREIChmcm9tIG1ldGFib2xpdGVfdHlwZXMudHlwZV9uYW1lXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIHRoYXQgbWF0Y2hlcyB0aGUgc3BlY2llcywgb3IgJycgaWYgbm90IG1hdGNoZWQgeWV0KVxufVxuXG5pbnRlcmZhY2UgTWV0YWJvbGljTWFwQ2hvb3NlclJlc3VsdCB7XG4gICAgKGVycjpzdHJpbmcsXG4gICAgICAgIG1ldGFib2xpY01hcElEPzpudW1iZXIsXG4gICAgICAgIG1ldGFib2xpY01hcEZpbGVuYW1lPzpzdHJpbmcsXG4gICAgICAgIGJpb21hc3NDYWxjdWxhdGlvbj86bnVtYmVyKTogdm9pZDtcbn07XG5cblxuXG4vLyBUaGlzIFVJIGxldHMgdGhlIHVzZXIgcGljayBhIG1ldGFib2xpYyBtYXAgYW5kIGEgYmlvbWFzcyByZWFjdGlvbiBpbnNpZGUgb2YgaXQgdG8gdXNlIGZvciB0aGVcbi8vIHNwZWNpZmllZCBzdHVkeS5cbmNsYXNzIFN0dWR5TWV0YWJvbGljTWFwQ2hvb3NlciB7XG5cbiAgICBwcml2YXRlIF9kaWFsb2dCb3g6RGlhbG9nQm94O1xuXG4gICAgY29uc3RydWN0b3IoY2hlY2tXaXRoU2VydmVyRmlyc3Q6Ym9vbGVhbiwgY2FsbGJhY2s6TWV0YWJvbGljTWFwQ2hvb3NlclJlc3VsdCkge1xuICAgICAgICB0aGlzLl9kaWFsb2dCb3ggPSBuZXcgRGlhbG9nQm94KCA1MDAsIDUwMCApO1xuICAgICAgICB0aGlzLl9kaWFsb2dCb3guc2hvd1dhaXRTcGlubmVyKCdQbGVhc2Ugd2FpdC4uLicpO1xuXG4gICAgICAgIGlmIChjaGVja1dpdGhTZXJ2ZXJGaXJzdCkge1xuICAgICAgICAgICAgLy8gRmlyc3QgY2hlY2sgdGhlIG1ldGFib2xpYyBtYXAgYXNzb2NpYXRlZCB3aXRoIHRoaXMgc3R1ZHkuXG4gICAgICAgICAgICB0aGlzLl9yZXF1ZXN0U3R1ZHlNZXRhYm9saWNNYXAoIChtYXA6U2VydmVyTWV0YWJvbGljTWFwKTp2b2lkID0+IHtcbiAgICAgICAgICAgICAgICBpZiAobWFwLmlkID09PSAtMSkge1xuICAgICAgICAgICAgICAgICAgICAvLyBUaGlzIHN0dWR5IGhhc24ndCBib3VuZCB0byBhIG1ldGFib2xpYyBtYXAgeWV0LiBcbiAgICAgICAgICAgICAgICAgICAgLy8gTGV0J3Mgc2hvdyBhIGNob29zZXIgZm9yIHRoZSBtZXRhYm9saWMgbWFwLlxuICAgICAgICAgICAgICAgICAgICB0aGlzLl9jaG9vc2VNZXRhYm9saWNNYXAoY2FsbGJhY2spO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIE9rLCBldmVyeXRoaW5nIGlzIGZpbmUuIFRoaXMgc2hvdWxkIG9ubHkgaGFwcGVuIGlmIHNvbWVvbmUgZWxzZSBzZXR1cCB0aGVcbiAgICAgICAgICAgICAgICAgICAgLy8gYmlvbWFzcyBjYWxjdWxhdGlvbiBmb3IgdGhpcyBzdHVkeSBpbiB0aGUgYmFja2dyb3VuZCBzaW5jZSB0aGUgcGFnZSB3YXNcbiAgICAgICAgICAgICAgICAgICAgLy8gb3JpZ2luYWxseSBsb2FkZWQuXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX2RpYWxvZ0JveC50ZXJtKCk7XG4gICAgICAgICAgICAgICAgICAgIGNhbGxiYWNrLmNhbGwoe30sIG51bGwsIG1hcC5pZCwgbWFwLm5hbWUsIG1hcC5iaW9tYXNzQ2FsY3VsYXRpb24pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0sIChlcnI6c3RyaW5nKTp2b2lkID0+IHtcbiAgICAgICAgICAgICAgICBjYWxsYmFjay5jYWxsKHt9LCBlcnIpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAvLyBUaGlzIHN0dWR5IGhhc24ndCBib3VuZCB0byBhIG1ldGFib2xpYyBtYXAgeWV0LiBcbiAgICAgICAgICAgIC8vIExldCdzIHNob3cgYSBjaG9vc2VyIGZvciB0aGUgbWV0YWJvbGljIG1hcC5cbiAgICAgICAgICAgIHRoaXMuX2Nob29zZU1ldGFib2xpY01hcChjYWxsYmFjayk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIF9iYXNlUGF5bG9hZCgpOmFueSB7XG4gICAgICAgIHZhciB0b2tlbjpzdHJpbmcgPSBkb2N1bWVudC5jb29raWUucmVwbGFjZShcbiAgICAgICAgICAgIC8oPzooPzpefC4qO1xccyopY3NyZnRva2VuXFxzKlxcPVxccyooW147XSopLiokKXxeLiokLyxcbiAgICAgICAgICAgICckMScpO1xuICAgICAgICByZXR1cm4geyAnY3NyZm1pZGRsZXdhcmV0b2tlbic6IHRva2VuIH07XG4gICAgfVxuXG4gICAgLy8gUHJlc2VudCB0aGUgdXNlciB3aXRoIGEgbGlzdCBvZiBTQk1MIGZpbGVzIHRvIGNob29zZSBmcm9tLiBJZiB0aGV5IGNob29zZSBvbmVcbiAgICAvLyBhbmQgaXQgc3RpbGwgcmVxdWlyZXMgYmlvbWFzcyBjYWxjdWxhdGlvbnMsIHdlJ2xsIGdvIG9uIHRvIF9tYXRjaE1ldGFib2xpdGVzKCkuXG4gICAgcHJpdmF0ZSBfY2hvb3NlTWV0YWJvbGljTWFwKGNhbGxiYWNrOk1ldGFib2xpY01hcENob29zZXJSZXN1bHQpOnZvaWQge1xuICAgICAgICB0aGlzLl9yZXF1ZXN0TWV0YWJvbGljTWFwTGlzdCggKG1ldGFib2xpY01hcHM6U2VydmVyTWV0YWJvbGljTWFwW10pOnZvaWQgPT4ge1xuICAgICAgICAgICAgLy8gRGlzcGxheSB0aGUgbGlzdC5cbiAgICAgICAgICAgIHRoaXMuX2RpYWxvZ0JveC5jbGVhckNvbnRlbnRzKCk7XG4gICAgICAgICAgICB0aGlzLl9kaWFsb2dCb3guYWRkSFRNTChcbiAgICAgICAgICAgICAgICAnPGRpdj5QbGVhc2UgY2hvb3NlIGFuIFNCTUwgZmlsZSB0byBnZXQgdGhlIGJpb21hc3MgZGF0YSBmcm9tLicgK1xuICAgICAgICAgICAgICAgICc8YnI+VGhpcyBpcyBuZWNlc3NhcnkgdG8gY2FsY3VsYXRlIGNhcmJvbiBiYWxhbmNlLjxicj48YnI+PC9kaXY+Jyk7XG5cbiAgICAgICAgICAgIHZhciB0YWJsZTpVdGwuVGFibGUgPSBuZXcgVXRsLlRhYmxlKCdtZXRhYm9saWNNYXBDaG9vc2VyJyk7XG4gICAgICAgICAgICB0YWJsZS50YWJsZS5zZXRBdHRyaWJ1dGUoJ2NlbGxzcGFjaW5nJywgJzAnKTtcbiAgICAgICAgICAgICQodGFibGUudGFibGUpLmNzcygnYm9yZGVyLWNvbGxhcHNlJywgJ2NvbGxhcHNlJyk7XG5cbiAgICAgICAgICAgIG1ldGFib2xpY01hcHMuZm9yRWFjaCgobWFwOlNlcnZlck1ldGFib2xpY01hcCk6dm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgdGFibGUuYWRkUm93KCk7XG4gICAgICAgICAgICAgICAgdmFyIGNvbHVtbjphbnkgPSB0YWJsZS5hZGRDb2x1bW4oKTtcbiAgICAgICAgICAgICAgICBjb2x1bW4uaW5uZXJIVE1MID0gbWFwLm5hbWU7XG4gICAgICAgICAgICAgICAgJChjb2x1bW4pLmNzcygnY3Vyc29yJywgJ3BvaW50ZXInKTsgLy8gbWFrZSBpdCBsb29rIGxpa2UgYSBsaW5rXG4gICAgICAgICAgICAgICAgJChjb2x1bW4pLmNzcygnYm9yZGVyLXRvcCcsICcxcHggc29saWQgIzAwMCcpOyAvLyBtYWtlIGl0IGxvb2sgbGlrZSBhIGxpbmtcbiAgICAgICAgICAgICAgICAkKGNvbHVtbikuY3NzKCdib3JkZXItYm90dG9tJywgJzFweCBzb2xpZCAjMDAwJyk7IC8vIG1ha2UgaXQgbG9vayBsaWtlIGEgbGlua1xuICAgICAgICAgICAgICAgICQoY29sdW1uKS5jc3MoJ3BhZGRpbmcnLCAnMTBweCcpOyAvLyBtYWtlIGl0IGxvb2sgbGlrZSBhIGxpbmtcbiAgICAgICAgICAgICAgICAkKGNvbHVtbikuY2xpY2sodGhpcy5fb25NZXRhYm9saWNNYXBDaG9zZW4uYmluZCh0aGlzLCBtYXAsIGNhbGxiYWNrKSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHRoaXMuX2RpYWxvZ0JveC5hZGRFbGVtZW50KHRhYmxlLnRhYmxlKTtcbiAgICAgICAgfSwgKGVycjpzdHJpbmcpOnZvaWQgPT4ge1xuICAgICAgICAgICAgdGhpcy5fZGlhbG9nQm94LnNob3dNZXNzYWdlKGVyciwgKCk6dm9pZCA9PiBjYWxsYmFjay5jYWxsKHt9LCBlcnIpKTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG5cbiAgICAvLyBDYWxsZWQgd2hlbiB0aGV5IGNsaWNrIG9uIGEgYmlvbWFzcyByZWFjdGlvbi5cbiAgICBwcml2YXRlIF9vbk1ldGFib2xpY01hcENob3NlbihtYXA6U2VydmVyTWV0YWJvbGljTWFwLFxuICAgICAgICAgICAgY2FsbGJhY2s6TWV0YWJvbGljTWFwQ2hvb3NlclJlc3VsdCk6dm9pZCB7XG4gICAgICAgIC8vIEJlZm9yZSB3ZSByZXR1cm4gdG8gdGhlIGNhbGxlciwgdGVsbCB0aGUgc2VydmVyIHRvIHN0b3JlIHRoaXMgYXNzb2NpYXRpb24uXG4gICAgICAgIHRoaXMuX3JlcXVlc3RTZXRTdHVkeU1ldGFib2xpY01hcChtYXAuaWQsXG4gICAgICAgICAgICAoZXJyb3I6c3RyaW5nKTp2b2lkID0+IHtcbiAgICAgICAgICAgICAgICB0aGlzLl9kaWFsb2dCb3guc2hvd01lc3NhZ2UoZXJyb3IsICgpOnZvaWQgPT4gY2FsbGJhY2suY2FsbCh7fSwgZXJyb3IpKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgKTtcbiAgICB9XG5cblxuICAgIC8vIEdldCBpbmZvIGZyb20gdGhlIHNlcnZlci4uXG4gICAgcHJpdmF0ZSBfcmVxdWVzdFN0dWR5TWV0YWJvbGljTWFwKFxuICAgICAgICAgICAgY2FsbGJhY2s6IChtYXA6U2VydmVyTWV0YWJvbGljTWFwKSA9PiB2b2lkLFxuICAgICAgICAgICAgZXJyb3I6IChlcnJvcjpzdHJpbmcpID0+IHZvaWQpOiB2b2lkIHtcbiAgICAgICAgJC5hamF4KHtcbiAgICAgICAgICAgIGRhdGFUeXBlOiBcImpzb25cIixcbiAgICAgICAgICAgIHVybDogXCJtYXAvXCIsXG4gICAgICAgICAgICBzdWNjZXNzOiBjYWxsYmFjayxcbiAgICAgICAgICAgIGVycm9yOiAoanFYSFI6SlF1ZXJ5WEhSLCBzdGF0dXM6c3RyaW5nLCBlcnJvclRleHQ6c3RyaW5nKTp2b2lkID0+IHtcbiAgICAgICAgICAgICAgICBlcnJvci5jYWxsKHt9LCBzdGF0dXMgKyBcIiBcIiArIGVycm9yVGV4dCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH1cblxuXG4gICAgLy8gR2V0IGEgbGlzdCBvZiBtZXRhYm9saWMgbWFwcyB0aGF0IHdlIGNvdWxkIHVzZSBmb3IgdGhpcyBzdHVkeS5cbiAgICBwcml2YXRlIF9yZXF1ZXN0TWV0YWJvbGljTWFwTGlzdChcbiAgICAgICAgICAgIGNhbGxiYWNrOiAobWV0YWJvbGljTWFwczpTZXJ2ZXJNZXRhYm9saWNNYXBbXSkgPT4gdm9pZCxcbiAgICAgICAgICAgIGVycm9yOiAoZXJyb3I6c3RyaW5nKSA9PiB2b2lkKTp2b2lkIHtcbiAgICAgICAgJC5hamF4KHtcbiAgICAgICAgICAgIGRhdGFUeXBlOiBcImpzb25cIixcbiAgICAgICAgICAgIHVybDogXCIvZGF0YS9zYm1sL1wiLFxuICAgICAgICAgICAgc3VjY2VzczogY2FsbGJhY2ssXG4gICAgICAgICAgICBlcnJvcjogKGpxWEhSOkpRdWVyeVhIUiwgc3RhdHVzOnN0cmluZywgZXJyb3JUZXh0OnN0cmluZyk6dm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgZXJyb3IuY2FsbCh7fSwgc3RhdHVzICsgXCIgXCIgKyBlcnJvclRleHQpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9XG5cblxuICAgIHByaXZhdGUgX3JlcXVlc3RTZXRTdHVkeU1ldGFib2xpY01hcChtZXRhYm9saWNNYXBJRDpudW1iZXIsXG4gICAgICAgICAgICBjYWxsYmFjazogKGVycjpzdHJpbmcpID0+IHZvaWQpOnZvaWQge1xuICAgICAgICAkLmFqYXgoe1xuICAgICAgICAgICAgdHlwZTogXCJQT1NUXCIsXG4gICAgICAgICAgICBkYXRhVHlwZTogXCJqc29uXCIsXG4gICAgICAgICAgICB1cmw6IFwibWFwL1wiLFxuICAgICAgICAgICAgZGF0YTogJC5leHRlbmQoe30sIHRoaXMuX2Jhc2VQYXlsb2FkKCksIHsgXCJtZXRhYm9saWNNYXBJRFwiOiBtZXRhYm9saWNNYXBJRCB9KSxcbiAgICAgICAgICAgIGVycm9yOiAoanFYSFI6SlF1ZXJ5WEhSLCBzdGF0dXM6c3RyaW5nLCBlcnJvclRleHQ6c3RyaW5nKTp2b2lkID0+IHtcbiAgICAgICAgICAgICAgICBjYWxsYmFjay5jYWxsKHt9LCBzdGF0dXMgKyBcIiBcIiArIGVycm9yVGV4dCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH1cblxufVxuXG5cblxuaW50ZXJmYWNlIEJpb21hc3NSZXN1bHRzQ2FsbGJhY2sge1xuICAgIChlcnI6c3RyaW5nLCBmaW5hbEJpb21hc3M/Om51bWJlcik6IHZvaWQ7XG59O1xuXG4vLyBUaGlzIFVJIGhhbmRsZXMgbWFwcGluZyBTQk1MIHNwZWNpZXMgdG8gRUREIG1ldGFib2xpdGVzLCBjYWxjdWxhdGluZyBcbi8vIHRoZSBiaW9tYXNzLCBhbmQgcmVtZW1iZXJpbmcgdGhlIHJlc3VsdC5cbmNsYXNzIEJpb21hc3NDYWxjdWxhdGlvblVJIHtcblxuICAgIHByaXZhdGUgX2RpYWxvZ0JveDpEaWFsb2dCb3g7XG5cbiAgICBjb25zdHJ1Y3RvcihtZXRhYm9saWNNYXBJRDpudW1iZXIsIGNhbGxiYWNrOkJpb21hc3NSZXN1bHRzQ2FsbGJhY2spIHtcbiAgICAgICAgdGhpcy5fZGlhbG9nQm94ID0gbmV3IERpYWxvZ0JveCggNTAwLCA1MDAgKTtcblxuICAgICAgICAvLyBGaXJzdCwgaGF2ZSB0aGUgdXNlciBwaWNrIGEgYmlvbWFzcyByZWFjdGlvbi5cbiAgICAgICAgdGhpcy5fZGlhbG9nQm94LnNob3dXYWl0U3Bpbm5lcignTG9va2luZyB1cCBiaW9tYXNzIHJlYWN0aW9ucy4uLicpO1xuXG4gICAgICAgIHRoaXMuX3JlcXVlc3RCaW9tYXNzUmVhY3Rpb25MaXN0KG1ldGFib2xpY01hcElELFxuICAgICAgICAgICAgICAgIChyZWFjdGlvbnM6U2VydmVyQmlvbWFzc1JlYWN0aW9uW10pOnZvaWQgPT4ge1xuICAgICAgICAgICAgdmFyIHRhYmxlOlV0bC5UYWJsZTtcbiAgICAgICAgICAgIGlmICghcmVhY3Rpb25zLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgIHRoaXMuX2RpYWxvZ0JveC5zaG93TWVzc2FnZShcbiAgICAgICAgICAgICAgICAgICAgJ1RoZXJlIGFyZSBubyBiaW9tYXNzIHJlYWN0aW9ucyBpbiB0aGlzIG1ldGFib2xpYyBtYXAhJyk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIC8vIERpc3BsYXkgdGhlIGxpc3Qgb2YgYmlvbWFzcyByZWFjdGlvbnMuXG4gICAgICAgICAgICAgICAgdGhpcy5fZGlhbG9nQm94LmNsZWFyQ29udGVudHMoKTtcbiAgICAgICAgICAgICAgICB0aGlzLl9kaWFsb2dCb3guYWRkSFRNTChcbiAgICAgICAgICAgICAgICAgICAgJzxkaXY+UGxlYXNlIGNob29zZSBhIGJpb21hc3MgcmVhY3Rpb24gdG8gdXNlIGZvciBjYXJib24gYmFsYW5jZS4nICtcbiAgICAgICAgICAgICAgICAgICAgJzxicj48YnI+PC9kaXY+Jyk7XG4gICAgICAgICAgICAgICAgdGFibGUgPSBuZXcgVXRsLlRhYmxlKCdiaW9tYXNzUmVhY3Rpb25DaG9vc2VyJyk7XG4gICAgICAgICAgICAgICAgdGFibGUudGFibGUuc2V0QXR0cmlidXRlKCdjZWxsc3BhY2luZycsICcwJyk7XG4gICAgICAgICAgICAgICAgJCh0YWJsZS50YWJsZSkuY3NzKCdib3JkZXItY29sbGFwc2UnLCAnY29sbGFwc2UnKTtcblxuICAgICAgICAgICAgICAgIHJlYWN0aW9ucy5mb3JFYWNoKChyZWFjdGlvbjpTZXJ2ZXJCaW9tYXNzUmVhY3Rpb24pOnZvaWQgPT4ge1xuICAgICAgICAgICAgICAgICAgICB0YWJsZS5hZGRSb3coKTtcbiAgICAgICAgICAgICAgICAgICAgdmFyIGNvbHVtbjphbnkgPSB0YWJsZS5hZGRDb2x1bW4oKTtcbiAgICAgICAgICAgICAgICAgICAgY29sdW1uLmlubmVySFRNTCA9IHJlYWN0aW9uLnJlYWN0aW9uTmFtZTtcbiAgICAgICAgICAgICAgICAgICAgJChjb2x1bW4pLmNzcygnY3Vyc29yJywgJ3BvaW50ZXInKTsgLy8gbWFrZSBpdCBsb29rIGxpa2UgYSBsaW5rXG4gICAgICAgICAgICAgICAgICAgICQoY29sdW1uKS5jc3MoJ2JvcmRlci10b3AnLCAnMXB4IHNvbGlkICMwMDAnKTsgLy8gbWFrZSBpdCBsb29rIGxpa2UgYSBsaW5rXG4gICAgICAgICAgICAgICAgICAgICQoY29sdW1uKS5jc3MoJ2JvcmRlci1ib3R0b20nLCAnMXB4IHNvbGlkICMwMDAnKTsgLy8gbWFrZSBpdCBsb29rIGxpa2UgYSBsaW5rXG4gICAgICAgICAgICAgICAgICAgICQoY29sdW1uKS5jc3MoJ3BhZGRpbmcnLCAnMTBweCcpOyAvLyBtYWtlIGl0IGxvb2sgbGlrZSBhIGxpbmtcbiAgICAgICAgICAgICAgICAgICAgJChjb2x1bW4pLmNsaWNrKCAoKTp2b2lkID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX29uQmlvbWFzc1JlYWN0aW9uQ2hvc2VuKG1ldGFib2xpY01hcElELCByZWFjdGlvbiwgY2FsbGJhY2spO1xuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB0aGlzLl9kaWFsb2dCb3guYWRkRWxlbWVudCh0YWJsZS50YWJsZSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgfSwgKGVycm9yOnN0cmluZyk6dm9pZCA9PiB7XG4gICAgICAgICAgICB0aGlzLl9kaWFsb2dCb3guc2hvd01lc3NhZ2UoZXJyb3IsICgpOnZvaWQgPT4gY2FsbGJhY2suY2FsbCh7fSwgZXJyb3IpKTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG5cbiAgICAvLyBUaGUgdXNlciBjaG9zZSBhIGJpb21hc3MgcmVhY3Rpb24uIE5vdyB3ZSBjYW4gc2hvdyBhbGwgdGhlIHNwZWNpZXMgaW4gdGhlIHJlYWN0aW9uIGFuZFxuICAgIC8vIG1hdGNoIHRvIEVERCBtZXRhYm9saXRlcy5cbiAgICBwcml2YXRlIF9vbkJpb21hc3NSZWFjdGlvbkNob3NlbihtZXRhYm9saWNNYXBJRDpudW1iZXIsIHJlYWN0aW9uOlNlcnZlckJpb21hc3NSZWFjdGlvbixcbiAgICAgICAgICAgIGNhbGxiYWNrOkJpb21hc3NSZXN1bHRzQ2FsbGJhY2spOnZvaWQge1xuICAgICAgICAvLyBQdWxsIGEgbGlzdCBvZiBhbGwgbWV0YWJvbGl0ZXMgaW4gdGhpcyByZWFjdGlvbi5cbiAgICAgICAgdGhpcy5fZGlhbG9nQm94LnNob3dXYWl0U3Bpbm5lcignR2V0dGluZyBzcGVjaWVzIGxpc3QuLi4nKTtcbiAgICAgICAgdGhpcy5fcmVxdWVzdFNwZWNpZXNMaXN0RnJvbUJpb21hc3NSZWFjdGlvbihtZXRhYm9saWNNYXBJRCwgcmVhY3Rpb24ucmVhY3Rpb25JRCxcbiAgICAgICAgICAgICAgICAoc3BlY2llc0xpc3Q6U2VydmVyQmlvbWFzc1NwZWNpZXNFbnRyeVtdKTp2b2lkID0+IHtcbiAgICAgICAgICAgIHZhciB0YWJsZTpVdGwuVGFibGUgPSBuZXcgVXRsLlRhYmxlKCdiaW9tYXNzUmVhY3Rpb25DaG9vc2VyJyksXG4gICAgICAgICAgICAgICAgaW5wdXRzOmFueVtdID0gW107XG4gICAgICAgICAgICB0YWJsZS50YWJsZS5zZXRBdHRyaWJ1dGUoJ2NlbGxzcGFjaW5nJywgJzAnKTtcbiAgICAgICAgICAgICQodGFibGUudGFibGUpLmNzcygnYm9yZGVyLWNvbGxhcHNlJywgJ2NvbGxhcHNlJyk7XG5cbiAgICAgICAgICAgIHNwZWNpZXNMaXN0LmZvckVhY2goKHNwZWNpZXM6U2VydmVyQmlvbWFzc1NwZWNpZXNFbnRyeSwgaTpudW1iZXIpOnZvaWQgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBzcGVjaWVzQ29sdW1uOkhUTUxFbGVtZW50LCBtZXRhYm9saXRlQ29sdW1uOkhUTUxFbGVtZW50LCBhdXRvQ29tcDpKUXVlcnk7XG4gICAgICAgICAgICAgICAgdGFibGUuYWRkUm93KCk7XG4gICAgICAgICAgICAgICAgc3BlY2llc0NvbHVtbiA9IHRhYmxlLmFkZENvbHVtbigpO1xuICAgICAgICAgICAgICAgIHNwZWNpZXNDb2x1bW4uaW5uZXJIVE1MID0gc3BlY2llcy5zYm1sU3BlY2llc05hbWU7XG4gICAgICAgICAgICAgICAgbWV0YWJvbGl0ZUNvbHVtbiA9IHRhYmxlLmFkZENvbHVtbigpO1xuICAgICAgICAgICAgICAgIGF1dG9Db21wID0gRUREX2F1dG8uY3JlYXRlX2F1dG9jb21wbGV0ZShtZXRhYm9saXRlQ29sdW1uKTtcbiAgICAgICAgICAgICAgICBhdXRvQ29tcC5hZGRDbGFzcygnYXV0b2NvbXBfbWV0YWJvbCcpO1xuICAgICAgICAgICAgICAgIGlucHV0cy5wdXNoKGF1dG9Db21wKTtcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICB0aGlzLl9kaWFsb2dCb3guY2xlYXJDb250ZW50cygpO1xuICAgICAgICAgICAgdGhpcy5fZGlhbG9nQm94LmFkZEhUTUwoXG4gICAgICAgICAgICAgICAgJzxkaXY+UGxlYXNlIG1hdGNoIFNCTUwgc3BlY2llcyB0byBFREQgbWV0YWJvbGl0ZXMuPGJyPjxicj48L2Rpdj4nKTtcbiAgICAgICAgICAgIHRoaXMuX2RpYWxvZ0JveC5hZGRFbGVtZW50KHRhYmxlLnRhYmxlKTtcblxuICAgICAgICAgICAgdmFyIGVycm9yU3RyaW5nRWxlbWVudDpIVE1MRWxlbWVudCA9IFV0bC5KUy5jcmVhdGVFbGVtZW50RnJvbVN0cmluZyhcbiAgICAgICAgICAgICAgICAnPHNwYW4gc3R5bGU9XCJmb250LXNpemU6MTJweDsgY29sb3I6cmVkO1wiPjwvc3Bhbj4nKTtcbiAgICAgICAgICAgICQoZXJyb3JTdHJpbmdFbGVtZW50KS5jc3MoJ3Zpc2liaWxpdHknLCAnaGlkZGVuJyk7XG4gICAgICAgICAgICB0aGlzLl9kaWFsb2dCb3guYWRkRWxlbWVudChlcnJvclN0cmluZ0VsZW1lbnQpO1xuXG4gICAgICAgICAgICAvLyBDcmVhdGUgYW4gT0sgYnV0dG9uIGF0IHRoZSBib3R0b20uXG4gICAgICAgICAgICB2YXIgb2tCdXR0b246SFRNTEVsZW1lbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdidXR0b24nKTtcbiAgICAgICAgICAgIG9rQnV0dG9uLmFwcGVuZENoaWxkKGRvY3VtZW50LmNyZWF0ZVRleHROb2RlKCdPSycpKTtcbiAgICAgICAgICAgICQob2tCdXR0b24pLmNsaWNrKCAoKTp2b2lkID0+IHRoaXMuX29uRmluaXNoZWRCaW9tYXNzU3BlY2llc0VudHJ5KHNwZWNpZXNMaXN0LCBpbnB1dHMsXG4gICAgICAgICAgICAgICAgZXJyb3JTdHJpbmdFbGVtZW50LCBtZXRhYm9saWNNYXBJRCwgcmVhY3Rpb24sIGNhbGxiYWNrKSk7XG4gICAgICAgICAgICB0aGlzLl9kaWFsb2dCb3guYWRkRWxlbWVudChva0J1dHRvbik7XG5cbiAgICAgICAgICAgIGlucHV0cy5mb3JFYWNoKChpbnB1dCkgPT4ge1xuICAgICAgICAgICAgICAgIEVERF9hdXRvLnNldHVwX2ZpZWxkX2F1dG9jb21wbGV0ZShpbnB1dCwgJ01ldGFib2xpdGUnLCBFREREYXRhLk1ldGFib2xpdGVUeXBlcyB8fCB7fSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSwgKGVycm9yOnN0cmluZyk6dm9pZCA9PiB7XG4gICAgICAgICAgICB0aGlzLl9kaWFsb2dCb3guc2hvd01lc3NhZ2UoZXJyb3IsICgpOnZvaWQgPT4gY2FsbGJhY2suY2FsbCh7fSwgZXJyb3IpKTtcbiAgICAgICAgfSk7XG5cbiAgICB9XG5cblxuICAgIC8vIENhbGxlZCB3aGVuIHRoZXkgY2xpY2sgdGhlIE9LIGJ1dHRvbiBvbiB0aGUgYmlvbWFzcyBzcGVjaWVzIGxpc3QuXG4gICAgcHJpdmF0ZSBfb25GaW5pc2hlZEJpb21hc3NTcGVjaWVzRW50cnkoc3BlY2llc0xpc3Q6U2VydmVyQmlvbWFzc1NwZWNpZXNFbnRyeVtdLCBpbnB1dHM6YW55W10sXG4gICAgICAgIGVycm9yU3RyaW5nRWxlbWVudDpIVE1MRWxlbWVudCwgbWV0YWJvbGljTWFwSUQ6bnVtYmVyLCByZWFjdGlvbjpTZXJ2ZXJCaW9tYXNzUmVhY3Rpb24sXG4gICAgICAgIGNhbGxiYWNrOkJpb21hc3NSZXN1bHRzQ2FsbGJhY2spOnZvaWQge1xuXG4gICAgICAgIC8vIEFyZSB0aGUgaW5wdXRzIGFsbCBmaWxsZWQgaW4/XG4gICAgICAgIHZhciBudW1FbXB0eTpudW1iZXIgPSBpbnB1dHMuZmlsdGVyKChpbnB1dDpKUXVlcnkpOmJvb2xlYW4gPT4gaW5wdXQudmFsKCkgPT09ICcnKS5sZW5ndGg7XG5cbiAgICAgICAgaWYgKCQoZXJyb3JTdHJpbmdFbGVtZW50KS5jc3MoJ3Zpc2liaWxpdHknKSA9PT0gJ2hpZGRlbicpIHtcbiAgICAgICAgICAgIC8vIFNob3cgdGhlbSBhbiBlcnJvciBtZXNzYWdlLCBidXQgbmV4dCB0aW1lIHRoZXkgY2xpY2sgT0ssIGp1c3QgZG8gdGhlIGJpb21hc3NcbiAgICAgICAgICAgIC8vIGNhbGN1bGF0aW9uIGFueXdheS5cbiAgICAgICAgICAgIGlmIChudW1FbXB0eSA+IDApIHtcbiAgICAgICAgICAgICAgICAkKGVycm9yU3RyaW5nRWxlbWVudCkuY3NzKCd2aXNpYmlsaXR5JywgJ3Zpc2libGUnKTtcbiAgICAgICAgICAgICAgICBlcnJvclN0cmluZ0VsZW1lbnQuaW5uZXJIVE1MID0gJzxicj48YnI+VGhlcmUgYXJlICcgKyBudW1FbXB0eS50b1N0cmluZygpICtcbiAgICAgICAgICAgICAgICAgICAgJyB1bm1hdGNoZWQgc3BlY2llcy4gSWYgeW91IHByb2NlZWQsIHRoZSBiaW9tYXNzIGNhbGN1bGF0aW9uIHdpbGwgbm90JyArXG4gICAgICAgICAgICAgICAgICAgICcgaW5jbHVkZSB0aGVzZS4gQ2xpY2sgT0sgYWdhaW4gdG8gcHJvY2VlZCBhbnl3YXkuPGJyPjxicj4nO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFNlbmQgZXZlcnl0aGluZyB0byB0aGUgc2VydmVyIGFuZCBnZXQgYSBiaW9tYXNzIGNhbGN1bGF0aW9uIGJhY2suXG4gICAgICAgIHRoaXMuX2RpYWxvZ0JveC5zaG93V2FpdFNwaW5uZXIoJ0NhbGN1bGF0aW5nIGZpbmFsIGJpb21hc3MgZmFjdG9yLi4uJyk7XG5cbiAgICAgICAgdmFyIG1hdGNoZXM6YW55ID0ge307XG4gICAgICAgIGlucHV0cy5mb3JFYWNoKChpbnB1dDpKUXVlcnksIGk6bnVtYmVyKTp2b2lkID0+IHtcbiAgICAgICAgICAgIHZhciBzcE5hbWU6c3RyaW5nID0gc3BlY2llc0xpc3RbaV0uc2JtbFNwZWNpZXNOYW1lLCBpZDpzdHJpbmcsIG1ldDphbnk7XG4gICAgICAgICAgICBpZCA9IGlucHV0Lm5leHQoJ2lucHV0W3R5cGU9aGlkZGVuXScpLnZhbCgpO1xuICAgICAgICAgICAgbWV0ID0gRURERGF0YS5NZXRhYm9saXRlVHlwZXNbaWRdIHx8IHt9O1xuICAgICAgICAgICAgbWF0Y2hlc1tzcE5hbWVdID0gbWV0Lm5hbWUgfHwgJyc7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHRoaXMuX3JlcXVlc3RGaW5hbEJpb21hc3NDb21wdXRhdGlvbihtZXRhYm9saWNNYXBJRCwgcmVhY3Rpb24ucmVhY3Rpb25JRCwgbWF0Y2hlcyxcbiAgICAgICAgICAgICAgICAoZmluYWxCaW9tYXNzOm51bWJlcik6dm9pZCA9PiB7XG4gICAgICAgICAgICAvLyBGaW5hbGx5LCBwYXNzIHRoZSBiaW9tYXNzIHRvIG91ciBjYWxsZXIuXG4gICAgICAgICAgICB0aGlzLl9kaWFsb2dCb3gudGVybSgpO1xuICAgICAgICAgICAgY2FsbGJhY2sobnVsbCwgZmluYWxCaW9tYXNzKTtcbiAgICAgICAgfSwgKGVycm9yOnN0cmluZyk6dm9pZCA9PiB7XG4gICAgICAgIFx0dGhpcy5fZGlhbG9nQm94LnNob3dNZXNzYWdlKGVycm9yLCAoKTp2b2lkID0+IGNhbGxiYWNrLmNhbGwoe30sIGVycm9yKSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuXG4gICAgLy8gR2V0IGEgbGlzdCBvZiBiaW9tYXNzIHJlYWN0aW9ucyBpbiB0aGUgc3BlY2lmaWVkIG1ldGFib2xpYyBtYXAuXG4gICAgcHJpdmF0ZSBfcmVxdWVzdFNwZWNpZXNMaXN0RnJvbUJpb21hc3NSZWFjdGlvbihtZXRhYm9saWNNYXBJRDpudW1iZXIsIHJlYWN0aW9uSUQ6c3RyaW5nLFxuICAgICAgICAgICAgY2FsbGJhY2s6IChzcGVjaWVzTGlzdDpTZXJ2ZXJCaW9tYXNzU3BlY2llc0VudHJ5W10pID0+IHZvaWQsXG4gICAgICAgICAgICBlcnJvcjogKGVycm9yOnN0cmluZykgPT4gdm9pZCk6dm9pZCB7XG4gICAgICAgICQuYWpheCh7XG4gICAgICAgICAgICBkYXRhVHlwZTogXCJqc29uXCIsXG4gICAgICAgICAgICB1cmw6IFsgXCIvZGF0YS9zYm1sXCIsIG1ldGFib2xpY01hcElELCBcInJlYWN0aW9uc1wiLCByZWFjdGlvbklELCBcIlwiIF0uam9pbihcIi9cIiksXG4gICAgICAgICAgICAvLyByZWZhY3Rvcjogc2VydmVyIHJldHVybnMgb2JqZWN0LCBleGlzdGluZyBjb2RlIGV4cGVjdHMgYXJyYXksIG5lZWQgdG8gdHJhbnNsYXRlXG4gICAgICAgICAgICBzdWNjZXNzOiAoZGF0YTphbnkpOnZvaWQgPT4ge1xuICAgICAgICAgICAgICAgIHZhciB0cmFuc2xhdGVkOlNlcnZlckJpb21hc3NTcGVjaWVzRW50cnlbXSA9IFtdO1xuICAgICAgICAgICAgICAgIHRyYW5zbGF0ZWQgPSAkLm1hcChkYXRhLCAodmFsdWU6YW55LCBrZXk6c3RyaW5nKTpTZXJ2ZXJCaW9tYXNzU3BlY2llc0VudHJ5ID0+IHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuICQuZXh0ZW5kKHZhbHVlLCB7XG4gICAgICAgICAgICAgICAgICAgICAgICBcInNibWxTcGVjaWVzTmFtZVwiOiBrZXksXG4gICAgICAgICAgICAgICAgICAgICAgICBcImVkZE1ldGFib2xpdGVOYW1lXCI6IHZhbHVlLnNuXG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIGNhbGxiYWNrLmNhbGwoe30sIHRyYW5zbGF0ZWQpO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGVycm9yOiAoanFYSFI6SlF1ZXJ5WEhSLCBzdGF0dXM6c3RyaW5nLCBlcnJvclRleHQ6c3RyaW5nKTp2b2lkID0+IHtcbiAgICAgICAgICAgICAgICBlcnJvci5jYWxsKHt9LCBzdGF0dXMgKyBcIiBcIiArIGVycm9yVGV4dCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH1cblxuXG4gICAgLy8gR2V0IGEgbGlzdCBvZiBiaW9tYXNzIHJlYWN0aW9ucyBpbiB0aGUgc3BlY2lmaWVkIG1ldGFib2xpYyBtYXAuXG4gICAgcHJpdmF0ZSBfcmVxdWVzdEJpb21hc3NSZWFjdGlvbkxpc3QobWV0YWJvbGljTWFwSUQ6bnVtYmVyLFxuICAgICAgICAgICAgY2FsbGJhY2s6IChyZWFjdGlvbnM6U2VydmVyQmlvbWFzc1JlYWN0aW9uW10pID0+IHZvaWQsXG4gICAgICAgICAgICBlcnJvcjogKGVycm9yOnN0cmluZykgPT4gdm9pZCk6dm9pZCB7XG4gICAgICAgICQuYWpheCh7XG4gICAgICAgICAgICBkYXRhVHlwZTogXCJqc29uXCIsXG4gICAgICAgICAgICB1cmw6IFwiL2RhdGEvc2JtbC9cIiArIG1ldGFib2xpY01hcElEICsgXCIvcmVhY3Rpb25zL1wiLFxuICAgICAgICAgICAgc3VjY2VzczogY2FsbGJhY2ssXG4gICAgICAgICAgICBlcnJvcjogKGpxWEhSOkpRdWVyeVhIUiwgc3RhdHVzOnN0cmluZywgZXJyb3JUZXh0OnN0cmluZyk6dm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgZXJyb3IuY2FsbCh7fSwgc3RhdHVzICsgXCIgXCIgKyBlcnJvclRleHQpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9XG5cblxuICAgIC8vIFRoaXMgaXMgd2hlcmUgd2UgcGFzcyBhbGwgdGhlIHNwZWNpZXMtPm1ldGFib2xpdGUgbWF0Y2hlcyB0byB0aGUgc2VydmVyIGFuZCBhc2sgaXQgdG9cbiAgICAvLyBmaW5hbGl6ZSB0aGUgXG4gICAgcHJpdmF0ZSBfcmVxdWVzdEZpbmFsQmlvbWFzc0NvbXB1dGF0aW9uKG1ldGFib2xpY01hcElEOm51bWJlciwgcmVhY3Rpb25JRDpzdHJpbmcsIG1hdGNoZXM6YW55LFxuICAgICAgICAgICAgY2FsbGJhY2s6IChmaW5hbEJpb21hc3M6bnVtYmVyKSA9PiB2b2lkLFxuICAgICAgICAgICAgZXJyb3I6IChlcnJvcjpzdHJpbmcpID0+IHZvaWQpOnZvaWQge1xuICAgICAgICAkLmFqYXgoe1xuICAgICAgICAgICAgdHlwZTogXCJQT1NUXCIsXG4gICAgICAgICAgICBkYXRhVHlwZTogXCJqc29uXCIsXG4gICAgICAgICAgICB1cmw6IFsgXCIvZGF0YS9zYm1sXCIsIG1ldGFib2xpY01hcElELCBcInJlYWN0aW9uc1wiLCByZWFjdGlvbklELCBcImNvbXB1dGUvXCIgXS5qb2luKFwiL1wiKSxcbiAgICAgICAgICAgIGRhdGE6IHsgXCJzcGVjaWVzXCI6IG1hdGNoZXMgfSxcbiAgICAgICAgICAgIHN1Y2Nlc3M6IGNhbGxiYWNrLFxuICAgICAgICAgICAgZXJyb3I6IChqcVhIUjpKUXVlcnlYSFIsIHN0YXR1czpzdHJpbmcsIGVycm9yVGV4dDpzdHJpbmcpOnZvaWQgPT4ge1xuICAgICAgICAgICAgICAgIGVycm9yLmNhbGwoe30sIHN0YXR1cyArIFwiIFwiICsgZXJyb3JUZXh0KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfVxufVxuXG5cblxuLy8gVGhpcyBpcyB0aGUgZnVsbCBVSSBzZXF1ZW5jZSB0byBhc3NvY2lhdGUgYSBtZXRhYm9saWMgbWFwIHdpdGggYSBzdHVkeVxuLy8gQU5EIGNhbGN1bGF0ZSBiaW9tYXNzIGlmIG5lY2Vzc2FyeS4gTm90ZSB0aGF0IGl0IGNvdWxkIHN1Y2NlZWQgaW4gY2hvb3NpbmcgYSBuZXcgbWV0YWJvbGljIG1hcFxuLy8gYnV0IHRoZSB1c2VyIGNvdWxkIGNhbmNlbCB0aGUgYmlvbWFzcyBjYWxjdWxhdGlvbi4gSW4gdGhhdCBjYXNlLCB5b3VyIGNhbGxiYWNrIHdvdWxkIGJlIGNhbGxlZFxuLy8gd2l0aCBhIHZhbGlkIG1ldGFib2xpY01hcEZpbGVuYW1lIGJ1dCBmaW5hbEJpb21hc3M9LTEgKGFuZCBlcnIgd291bGQgYmUgc2V0KS5cbmludGVyZmFjZSBGdWxsU3R1ZHlCaW9tYXNzVUlSZXN1bHRzQ2FsbGJhY2sge1xuICAgIChlcnI6c3RyaW5nLCBtZXRhYm9saWNNYXBJRD86bnVtYmVyLCBtZXRhYm9saWNNYXBGaWxlbmFtZT86c3RyaW5nLCBmaW5hbEJpb21hc3M/Om51bWJlcik6IHZvaWQ7XG59O1xuXG5jbGFzcyBGdWxsU3R1ZHlCaW9tYXNzVUkge1xuICAgIGNvbnN0cnVjdG9yKGNhbGxiYWNrOkZ1bGxTdHVkeUJpb21hc3NVSVJlc3VsdHNDYWxsYmFjaykge1xuICAgICAgICB2YXIgY2hvb3NlcjpTdHVkeU1ldGFib2xpY01hcENob29zZXIsIGNob29zZXJIYW5kbGVyOk1ldGFib2xpY01hcENob29zZXJSZXN1bHQ7XG4gICAgICAgIGNob29zZXJIYW5kbGVyID0gKGVycm9yOnN0cmluZyxcbiAgICAgICAgICAgICAgICBtZXRhYm9saWNNYXBJRD86bnVtYmVyLFxuICAgICAgICAgICAgICAgIG1ldGFib2xpY01hcEZpbGVuYW1lPzpzdHJpbmcsXG4gICAgICAgICAgICAgICAgYmlvbWFzc0NhbGN1bGF0aW9uPzpudW1iZXIpOnZvaWQgPT4ge1xuICAgICAgICAgICAgdmFyIHVpOkJpb21hc3NDYWxjdWxhdGlvblVJO1xuICAgICAgICAgICAgaWYgKGVycm9yKSB7XG4gICAgICAgICAgICAgICAgY2FsbGJhY2suY2FsbCh7fSwgZXJyb3IpO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChiaW9tYXNzQ2FsY3VsYXRpb24gPT09IC0xKSB7XG4gICAgICAgICAgICAgICAgLy8gVGhlIHN0dWR5IGhhcyBhIG1ldGFib2xpYyBtYXAsIGJ1dCBubyBiaW9tYXNzIGhhcyBiZWVuIGNhbGN1bGF0ZWQgZm9yIGl0IHlldC5cbiAgICAgICAgICAgICAgICAvLyBXZSBuZWVkIHRvIG1hdGNoIGFsbCBtZXRhYm9saXRlcyBzbyB0aGUgc2VydmVyIGNhbiBjYWxjdWxhdGlvbiBiaW9tYXNzLlxuICAgICAgICAgICAgICAgIHVpID0gbmV3IEJpb21hc3NDYWxjdWxhdGlvblVJKG1ldGFib2xpY01hcElELFxuICAgICAgICAgICAgICAgICAgICAoYmlvbWFzc0VycjpzdHJpbmcsIGZpbmFsQmlvbWFzc0NhbGN1bGF0aW9uPzpudW1iZXIpOnZvaWQgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgY2FsbGJhY2suY2FsbCh7fSwgYmlvbWFzc0VyciwgbWV0YWJvbGljTWFwSUQsIG1ldGFib2xpY01hcEZpbGVuYW1lLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGZpbmFsQmlvbWFzc0NhbGN1bGF0aW9uKTtcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGNhbGxiYWNrKG51bGwsIG1ldGFib2xpY01hcElELCBtZXRhYm9saWNNYXBGaWxlbmFtZSwgYmlvbWFzc0NhbGN1bGF0aW9uKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcbiAgICAgICAgLy8gRmlyc3QsIG1ha2Ugc3VyZSBhIG1ldGFib2xpYyBtYXAgaXMgYm91bmQgdG8gdGhlIHN0dWR5LlxuICAgICAgICBjaG9vc2VyID0gbmV3IFN0dWR5TWV0YWJvbGljTWFwQ2hvb3Nlcih0cnVlLCBjaG9vc2VySGFuZGxlcik7XG4gICAgfVxufVxuXG5cblxuIl19