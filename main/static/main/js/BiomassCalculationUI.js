// File last modified on: Wed Dec 21 2016 14:53:35  
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
}());
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
}());
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
                autoComp = new EDDAuto.Metabolite({
                    container: $(metaboliteColumn),
                });
                autoComp.visibleInput.addClass('autocomp_metabol');
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
        }, function (error) {
            _this._dialogBox.showMessage(error, function () { return callback.call({}, error); });
        });
    };
    // Called when they click the OK button on the biomass species list.
    BiomassCalculationUI.prototype._onFinishedBiomassSpeciesEntry = function (speciesList, inputs, errorStringElement, metabolicMapID, reaction, callback) {
        var _this = this;
        // Are the inputs all filled in?
        var numEmpty = inputs.filter(function (input) { return input.visibleInput.val() === ''; }).length;
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
            id = input.val();
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
}());
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
}());
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiQmlvbWFzc0NhbGN1bGF0aW9uVUkuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJCaW9tYXNzQ2FsY3VsYXRpb25VSS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxvREFBb0Q7QUFDcEQscURBQXFEO0FBQ3JELCtCQUErQjtBQUUvQixJQUFJLFFBQVEsR0FBRyxRQUFRLElBQUksRUFBRSxDQUFDO0FBRTlCLHNGQUFzRjtBQUN0RixrQ0FBa0M7QUFDbEM7SUFPSSxtQkFBbUIsS0FBWSxFQUFFLE1BQWE7UUFQbEQsaUJBc0ZDO1FBOUVPLElBQUksQ0FBQyxNQUFNLEdBQUcsS0FBSyxDQUFDO1FBQ3BCLElBQUksQ0FBQyxPQUFPLEdBQUcsTUFBTSxDQUFDO1FBRXRCLElBQUksQ0FBQyxZQUFZLEdBQUcsR0FBRyxDQUFDLEVBQUUsQ0FBQyx1QkFBdUIsQ0FBQyxhQUFhLENBQUMsQ0FBQztRQUNsRSxJQUFJLENBQUMsT0FBTyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLENBQUMsTUFBTSxDQUFDO1lBQ3ZDLFFBQVEsRUFBRSxJQUFJO1lBQ2QsS0FBSyxFQUFFLEtBQUs7WUFDWixNQUFNLEVBQUUsTUFBTTtZQUNkLEtBQUssRUFBRSxJQUFJO1lBQ1gsU0FBUyxFQUFFLEtBQUs7WUFFaEIsNkVBQTZFO1lBQzdFLElBQUksRUFBRSxVQUFDLEtBQVcsRUFBRSxFQUEwQjtnQkFDMUMsQ0FBQyxDQUFDLG9CQUFvQixDQUFDLENBQUMsSUFBSSxDQUFDLE9BQU8sRUFBRSxjQUFXLE9BQUEsS0FBSSxDQUFDLElBQUksRUFBRSxFQUFYLENBQVcsQ0FBRSxDQUFDO2dCQUMvRCxDQUFDLENBQUMscUJBQXFCLENBQUMsQ0FBQyxJQUFJLEVBQUUsQ0FBQztZQUNwQyxDQUFDO1NBQ0osQ0FBQyxDQUFDO0lBQ1AsQ0FBQztJQUVELHlGQUF5RjtJQUNsRix3QkFBSSxHQUFYO1FBQ0ksSUFBSSxDQUFDLGFBQWEsRUFBRSxDQUFDO1FBQ3JCLElBQUks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RUFBRSxrQkFBa0IsQ0FBQyxDQUFDO1lBQzdFLENBQUM7UUFDTCxDQUFDLENBQUM7UUFDRiwwREFBMEQ7UUFDMUQsT0FBTyxHQUFHLElBQUksd0JBQXdCLENBQUMsSUFBSSxFQUFFLGNBQWMsQ0FBQyxDQUFDO0lBQ2pFLENBQUM7SUFDTCx5QkFBQztBQUFELENBQUMsQUEzQkQsSUEyQkMiLCJzb3VyY2VzQ29udGVudCI6WyIvLyBGaWxlIGxhc3QgbW9kaWZpZWQgb246IFdlZCBEZWMgMjEgMjAxNiAxNDo1MzozNSAgXG4vLy8gPHJlZmVyZW5jZSBwYXRoPVwidHlwZXNjcmlwdC1kZWNsYXJhdGlvbnMuZC50c1wiIC8+XG4vLy8gPHJlZmVyZW5jZSBwYXRoPVwiVXRsLnRzXCIgLz5cblxudmFyIEVERF9hdXRvID0gRUREX2F1dG8gfHwge307XG5cbi8vIEF0IHRoaXMgcG9pbnQsIHRoaXMgY2xhc3MgaXMgZXhwZXJpbWVudGFsLiBJdCdzIHN1cHBvc2VkIHRvIG1ha2UgbW9kYWwgZGlhbG9nIGJveGVzXG4vLyBlYXNpZXIgdG8gY3JlYXRlIGFuZCBjb25maWd1cmUuXG5jbGFzcyBEaWFsb2dCb3gge1xuXG4gICAgcHJpdmF0ZSBfZGlhbG9nOmFueTtcbiAgICBwcml2YXRlIF93aWR0aDpudW1iZXI7XG4gICAgcHJpdmF0ZSBfaGVpZ2h0Om51bWJlcjtcbiAgICBwcml2YXRlIF9jb250ZW50c0RpdjpIVE1MRWxlbWVudDtcblxuICAgIHB1YmxpYyBjb25zdHJ1Y3Rvcih3aWR0aDpudW1iZXIsIGhlaWdodDpudW1iZXIpIHtcbiAgICAgICAgdGhpcy5fd2lkdGggPSB3aWR0aDtcbiAgICAgICAgdGhpcy5faGVpZ2h0ID0gaGVpZ2h0O1xuXG4gICAgICAgIHRoaXMuX2NvbnRlbnRzRGl2ID0gVXRsLkpTLmNyZWF0ZUVsZW1lbnRGcm9tU3RyaW5nKCc8ZGl2PjwvZGl2PicpO1xuICAgICAgICB0aGlzLl9kaWFsb2cgPSAkKHRoaXMuX2NvbnRlbnRzRGl2KS5kaWFsb2coe1xuICAgICAgICAgICAgYXV0b09wZW46IHRydWUsXG4gICAgICAgICAgICB3aWR0aDogd2lkdGgsXG4gICAgICAgICAgICBoZWlnaHQ6IGhlaWdodCxcbiAgICAgICAgICAgIG1vZGFsOiB0cnVlLFxuICAgICAgICAgICAgZHJhZ2dhYmxlOiBmYWxzZSxcblxuICAgICAgICAgICAgLy8gVGhpcyBob29rcyB0aGUgb3ZlcmxheSBzbyB3ZSBjYW4gaGlkZSB0aGUgZGlhbG9nIGlmIHRoZXkgY2xpY2sgb3V0c2lkZSBpdC5cbiAgICAgICAgICAgIG9wZW46IChldmVudDpFdmVudCwgdWk6SlF1ZXJ5VUkuRGlhbG9nVUlQYXJhbXMpOnZvaWQgPT4ge1xuICAgICAgICAgICAgICAgICQoJy51aS13aWRnZXQtb3ZlcmxheScpLmJpbmQoJ2NsaWNrJywgKCk6dm9pZCA9PiB0aGlzLnRlcm0oKSApO1xuICAgICAgICAgICAgICAgICQoJy51aS1kaWFsb2ctdGl0bGViYXInKS5oaWRlKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIC8vIFRoaXMgcmVtb3ZlcyB0aGUgZGlhbG9nICh3aGVyZWFzIGNsZWFyQ29udGVudHMoKSBqdXN0IHJlbW92ZXMgdGhlIGVsZW1lbnRzIGluc2lkZSBpdCkuXG4gICAgcHVibGljIHRlcm0oKTp2b2lkIHtcbiAgICAgICAgdGhpcy5jbGVhckNvbnRlbnRzKCk7XG4gICAgICAgIHRoaXMuX2RpYWxvZy5kaWFsb2coJ2Nsb3NlJyk7XG4gICAgfVxuXG4gICAgLy8gVGhlIEhUTUwgeW91J3JlIGFkZGluZyBtdXN0IGVxdWF0ZSB0byBhbiBlbGVtZW50IGJlY2F1c2Ugd2UganVzdFxuICAgIC8vIHR1cm4gaXQgaW50byBhbiBlbGVtZW50IGFuZCBhZGQgdGhhdCBlbGVtZW50IHRvIG91ciBjb250ZW50cyBkaXYuXG4gICAgcHVibGljIGFkZEhUTUwoaHRtbDpzdHJpbmcpOnZvaWQge1xuICAgICAgICB0aGlzLl9jb250ZW50c0Rpdi5hcHBlbmRDaGlsZChVdGwuSlMuY3JlYXRlRWxlbWVudEZyb21TdHJpbmcoaHRtbCkpO1xuICAgIH1cblxuICAgIHB1YmxpYyBhZGRFbGVtZW50KGVsZW1lbnQ6SFRNTEVsZW1lbnQpOnZvaWQge1xuICAgICAgICB0aGlzLl9jb250ZW50c0Rpdi5hcHBlbmRDaGlsZChlbGVtZW50KTtcbiAgICB9XG5cbiAgICAvLyBSZW1vdmUgYWxsIHN1YiBlbGVtZW50cy5cbiAgICBwdWJsaWMgY2xlYXJDb250ZW50cygpOnZvaWQge1xuICAgICAgICBVdGwuSlMucmVtb3ZlQWxsQ2hpbGRyZW4odGhpcy5fY29udGVudHNEaXYpO1xuICAgIH1cblxuICAgIC8vIE5PVEU6IFRoaXMgd2lsbCBjbGVhciBvdXQgdGhlIGNvbnRlbnRzIG9mIHRoZSBkaWFsb2cgYW5kIHJlcGxhY2Ugd2l0aCBhIHdhaXQgc3Bpbm5lci5cbiAgICBwdWJsaWMgc2hvd1dhaXRTcGlubmVyKGNhcHRpb246c3RyaW5nLCBvZmZzZXQ/Om51bWJlcik6dm9pZCB7XG4gICAgICAgIHRoaXMuY2xlYXJDb250ZW50cygpO1xuXG4gICAgICAgIG9mZnNldCA9ICh0eXBlb2Ygb2Zmc2V0ID09PSAndW5kZWZpbmVkJykgPyB0aGlzLl9oZWlnaHQgLyA0IDogb2Zmc2V0O1xuXG4gICAgICAgIHZhciBlbDpIVE1MRWxlbWVudCA9IFV0bC5KUy5jcmVhdGVFbGVtZW50RnJvbVN0cmluZygnPGRpdj5cXFxuICAgICAgICAgICAgICAgIDxkaXYgc3R5bGU9XCJoZWlnaHQ6JyArIG9mZnNldC50b1N0cmluZygpICsgJ3B4XCI+PC9kaXY+XFxcbiAgICAgICAgICAgICAgICA8dGFibGUgd2lkdGg9XCIxMDAlXCI+IFxcXG4gICAgICAgICAgICAgICAgPHRyPjx0ZCBhbGlnbj1cImNlbnRlclwiPiBcXFxuICAgICAgICAgICAgICAgICAgICA8ZGl2PicgKyBjYXB0aW9uICsgJzxicj48YnI+IFxcXG4gICAgICAgICAgICAgICAgICAgICAgICA8aW1nIHNyYz1cIi9zdGF0aWMvbWFpbi9pbWFnZXMvbG9hZGluZ19zcGlubmVyLmdpZlwiPjwvaW1nPiBcXFxuICAgICAgICAgICAgICAgICAgICA8L2Rpdj4gXFxcbiAgICAgICAgICAgICAgICA8L3RkPjwvdHI+IFxcXG4gICAgICAgICAgICAgICAgPC90YWJsZT5cXFxuICAgICAgICAgICAgICAgIDwvZGl2PicpO1xuXG4gICAgICAgIHRoaXMuYWRkRWxlbWVudChlbCk7XG4gICAgfVxuXG4gICAgLy8gTk9URTogVGhpcyB3aWxsIGNsZWFyIG91dCB0aGUgY29udGVudHMgb2YgdGhlIGRpYWxvZyBhbmQgcmVwbGFjZSB3aXRoIHRoZSBlcnJvciB0ZXh0LlxuICAgIHB1YmxpYyBzaG93TWVzc2FnZShtZXNzYWdlOnN0cmluZywgb25PSz86KCkgPT4gdm9pZCk6dm9pZCB7XG4gICAgICAgIHRoaXMuY2xlYXJDb250ZW50cygpO1xuXG4gICAgICAgIHZhciBvZmZzZXQ6bnVtYmVyID0gdGhpcy5faGVpZ2h0IC8gNDtcblxuICAgICAgICB2YXIgZWw6SFRNTEVsZW1lbnQgPSBVdGwuSlMuY3JlYXRlRWxlbWVudEZyb21TdHJpbmcoJzxkaXY+XFxcbiAgICAgICAgICAgICAgICA8ZGl2IHN0eWxlPVwiaGVpZ2h0OicgKyBvZmZzZXQudG9TdHJpbmcoKSArICdweFwiPjwvZGl2PlxcXG4gICAgICAgICAgICAgICAgPHRhYmxlIHdpZHRoPVwiMTAwJVwiPiBcXFxuICAgICAgICAgICAgICAgIDx0cj48dGQgYWxpZ249XCJjZW50ZXJcIj4gXFxcbiAgICAgICAgICAgICAgICAgICAgPGRpdj4nICsgbWVzc2FnZSArICc8L2Rpdj4gXFxcbiAgICAgICAgICAgICAgICA8L3RkPjwvdHI+IFxcXG4gICAgICAgICAgICAgICAgPC90YWJsZT5cXFxuICAgICAgICAgICAgICAgIDwvZGl2PicpO1xuXG4gICAgICAgIHRoaXMuYWRkRWxlbWVudChlbCk7XG4gICAgfVxuXG59XG5cblxuXG4vLyBSZXR1cm5lZCBpbiBhIGxpc3QgYnkgdGhlIHNlcnZlciBpbiByZXF1ZXN0U3R1ZHlNZXRhYm9saWNNYXBcbmludGVyZmFjZSBTZXJ2ZXJNZXRhYm9saWNNYXAge1xuICAgIG5hbWU6c3RyaW5nO1xuICAgIGlkOm51bWJlcjtcbiAgICBiaW9tYXNzQ2FsY3VsYXRpb246bnVtYmVyOyAgICAvLyAtMSBpZiB0aGlzIG1hcCBkb2Vzbid0IGhhdmUgYSBiaW9tYXNzIGNhbGN1bGF0aW9uIHlldFxufVxuXG5pbnRlcmZhY2UgU2VydmVyQmlvbWFzc1JlYWN0aW9uIHtcbiAgICBtZXRhYm9saWNNYXBJRDpudW1iZXI7XG4gICAgcmVhY3Rpb25OYW1lOnN0cmluZztcbiAgICByZWFjdGlvbklEOnN0cmluZztcbn1cblxuaW50ZXJmYWNlIFNlcnZlckJpb21hc3NTcGVjaWVzRW50cnkge1xuICAgIHNibWxTcGVjaWVzTmFtZTpzdHJpbmc7ICAgICAvLyBUaGUgc3BlY2llc1JlZmVyZW5jZSBuYW1lIGluIHRoZSBTQk1MIGZpbGVcbiAgICBlZGRNZXRhYm9saXRlTmFtZTpzdHJpbmc7ICAgLy8gVGhlIG1ldGFib2xpdGUgaW4gRUREIChmcm9tIG1ldGFib2xpdGVfdHlwZXMudHlwZV9uYW1lXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIHRoYXQgbWF0Y2hlcyB0aGUgc3BlY2llcywgb3IgJycgaWYgbm90IG1hdGNoZWQgeWV0KVxufVxuXG5pbnRlcmZhY2UgTWV0YWJvbGljTWFwQ2hvb3NlclJlc3VsdCB7XG4gICAgKGVycjpzdHJpbmcsXG4gICAgICAgIG1ldGFib2xpY01hcElEPzpudW1iZXIsXG4gICAgICAgIG1ldGFib2xpY01hcEZpbGVuYW1lPzpzdHJpbmcsXG4gICAgICAgIGJpb21hc3NDYWxjdWxhdGlvbj86bnVtYmVyKTogdm9pZDtcbn07XG5cblxuXG4vLyBUaGlzIFVJIGxldHMgdGhlIHVzZXIgcGljayBhIG1ldGFib2xpYyBtYXAgYW5kIGEgYmlvbWFzcyByZWFjdGlvbiBpbnNpZGUgb2YgaXQgdG8gdXNlIGZvciB0aGVcbi8vIHNwZWNpZmllZCBzdHVkeS5cbmNsYXNzIFN0dWR5TWV0YWJvbGljTWFwQ2hvb3NlciB7XG5cbiAgICBwcml2YXRlIF9kaWFsb2dCb3g6RGlhbG9nQm94O1xuXG4gICAgY29uc3RydWN0b3IoY2hlY2tXaXRoU2VydmVyRmlyc3Q6Ym9vbGVhbiwgY2FsbGJhY2s6TWV0YWJvbGljTWFwQ2hvb3NlclJlc3VsdCkge1xuICAgICAgICB0aGlzLl9kaWFsb2dCb3ggPSBuZXcgRGlhbG9nQm94KCA1MDAsIDUwMCApO1xuICAgICAgICB0aGlzLl9kaWFsb2dCb3guc2hvd1dhaXRTcGlubmVyKCdQbGVhc2Ugd2FpdC4uLicpO1xuXG4gICAgICAgIGlmIChjaGVja1dpdGhTZXJ2ZXJGaXJzdCkge1xuICAgICAgICAgICAgLy8gRmlyc3QgY2hlY2sgdGhlIG1ldGFib2xpYyBtYXAgYXNzb2NpYXRlZCB3aXRoIHRoaXMgc3R1ZHkuXG4gICAgICAgICAgICB0aGlzLl9yZXF1ZXN0U3R1ZHlNZXRhYm9saWNNYXAoIChtYXA6U2VydmVyTWV0YWJvbGljTWFwKTp2b2lkID0+IHtcbiAgICAgICAgICAgICAgICBpZiAobWFwLmlkID09PSAtMSkge1xuICAgICAgICAgICAgICAgICAgICAvLyBUaGlzIHN0dWR5IGhhc24ndCBib3VuZCB0byBhIG1ldGFib2xpYyBtYXAgeWV0LiBcbiAgICAgICAgICAgICAgICAgICAgLy8gTGV0J3Mgc2hvdyBhIGNob29zZXIgZm9yIHRoZSBtZXRhYm9saWMgbWFwLlxuICAgICAgICAgICAgICAgICAgICB0aGlzLl9jaG9vc2VNZXRhYm9saWNNYXAoY2FsbGJhY2spO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIE9rLCBldmVyeXRoaW5nIGlzIGZpbmUuIFRoaXMgc2hvdWxkIG9ubHkgaGFwcGVuIGlmIHNvbWVvbmUgZWxzZSBzZXR1cCB0aGVcbiAgICAgICAgICAgICAgICAgICAgLy8gYmlvbWFzcyBjYWxjdWxhdGlvbiBmb3IgdGhpcyBzdHVkeSBpbiB0aGUgYmFja2dyb3VuZCBzaW5jZSB0aGUgcGFnZSB3YXNcbiAgICAgICAgICAgICAgICAgICAgLy8gb3JpZ2luYWxseSBsb2FkZWQuXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX2RpYWxvZ0JveC50ZXJtKCk7XG4gICAgICAgICAgICAgICAgICAgIGNhbGxiYWNrLmNhbGwoe30sIG51bGwsIG1hcC5pZCwgbWFwLm5hbWUsIG1hcC5iaW9tYXNzQ2FsY3VsYXRpb24pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0sIChlcnI6c3RyaW5nKTp2b2lkID0+IHtcbiAgICAgICAgICAgICAgICBjYWxsYmFjay5jYWxsKHt9LCBlcnIpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAvLyBUaGlzIHN0dWR5IGhhc24ndCBib3VuZCB0byBhIG1ldGFib2xpYyBtYXAgeWV0LiBcbiAgICAgICAgICAgIC8vIExldCdzIHNob3cgYSBjaG9vc2VyIGZvciB0aGUgbWV0YWJvbGljIG1hcC5cbiAgICAgICAgICAgIHRoaXMuX2Nob29zZU1ldGFib2xpY01hcChjYWxsYmFjayk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIF9iYXNlUGF5bG9hZCgpOmFueSB7XG4gICAgICAgIHZhciB0b2tlbjpzdHJpbmcgPSBkb2N1bWVudC5jb29raWUucmVwbGFjZShcbiAgICAgICAgICAgIC8oPzooPzpefC4qO1xccyopY3NyZnRva2VuXFxzKlxcPVxccyooW147XSopLiokKXxeLiokLyxcbiAgICAgICAgICAgICckMScpO1xuICAgICAgICByZXR1cm4geyAnY3NyZm1pZGRsZXdhcmV0b2tlbic6IHRva2VuIH07XG4gICAgfVxuXG4gICAgLy8gUHJlc2VudCB0aGUgdXNlciB3aXRoIGEgbGlzdCBvZiBTQk1MIGZpbGVzIHRvIGNob29zZSBmcm9tLiBJZiB0aGV5IGNob29zZSBvbmVcbiAgICAvLyBhbmQgaXQgc3RpbGwgcmVxdWlyZXMgYmlvbWFzcyBjYWxjdWxhdGlvbnMsIHdlJ2xsIGdvIG9uIHRvIF9tYXRjaE1ldGFib2xpdGVzKCkuXG4gICAgcHJpdmF0ZSBfY2hvb3NlTWV0YWJvbGljTWFwKGNhbGxiYWNrOk1ldGFib2xpY01hcENob29zZXJSZXN1bHQpOnZvaWQge1xuICAgICAgICB0aGlzLl9yZXF1ZXN0TWV0YWJvbGljTWFwTGlzdCggKG1ldGFib2xpY01hcHM6U2VydmVyTWV0YWJvbGljTWFwW10pOnZvaWQgPT4ge1xuICAgICAgICAgICAgLy8gRGlzcGxheSB0aGUgbGlzdC5cbiAgICAgICAgICAgIHRoaXMuX2RpYWxvZ0JveC5jbGVhckNvbnRlbnRzKCk7XG4gICAgICAgICAgICB0aGlzLl9kaWFsb2dCb3guYWRkSFRNTChcbiAgICAgICAgICAgICAgICAnPGRpdj5QbGVhc2UgY2hvb3NlIGFuIFNCTUwgZmlsZSB0byBnZXQgdGhlIGJpb21hc3MgZGF0YSBmcm9tLicgK1xuICAgICAgICAgICAgICAgICc8YnI+VGhpcyBpcyBuZWNlc3NhcnkgdG8gY2FsY3VsYXRlIGNhcmJvbiBiYWxhbmNlLjxicj48YnI+PC9kaXY+Jyk7XG5cbiAgICAgICAgICAgIHZhciB0YWJsZTpVdGwuVGFibGUgPSBuZXcgVXRsLlRhYmxlKCdtZXRhYm9saWNNYXBDaG9vc2VyJyk7XG4gICAgICAgICAgICB0YWJsZS50YWJsZS5zZXRBdHRyaWJ1dGUoJ2NlbGxzcGFjaW5nJywgJzAnKTtcbiAgICAgICAgICAgICQodGFibGUudGFibGUpLmNzcygnYm9yZGVyLWNvbGxhcHNlJywgJ2NvbGxhcHNlJyk7XG5cbiAgICAgICAgICAgIG1ldGFib2xpY01hcHMuZm9yRWFjaCgobWFwOlNlcnZlck1ldGFib2xpY01hcCk6dm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgdGFibGUuYWRkUm93KCk7XG4gICAgICAgICAgICAgICAgdmFyIGNvbHVtbjphbnkgPSB0YWJsZS5hZGRDb2x1bW4oKTtcbiAgICAgICAgICAgICAgICBjb2x1bW4uaW5uZXJIVE1MID0gbWFwLm5hbWU7XG4gICAgICAgICAgICAgICAgJChjb2x1bW4pLmNzcygnY3Vyc29yJywgJ3BvaW50ZXInKTsgLy8gbWFrZSBpdCBsb29rIGxpa2UgYSBsaW5rXG4gICAgICAgICAgICAgICAgJChjb2x1bW4pLmNzcygnYm9yZGVyLXRvcCcsICcxcHggc29saWQgIzAwMCcpOyAvLyBtYWtlIGl0IGxvb2sgbGlrZSBhIGxpbmtcbiAgICAgICAgICAgICAgICAkKGNvbHVtbikuY3NzKCdib3JkZXItYm90dG9tJywgJzFweCBzb2xpZCAjMDAwJyk7IC8vIG1ha2UgaXQgbG9vayBsaWtlIGEgbGlua1xuICAgICAgICAgICAgICAgICQoY29sdW1uKS5jc3MoJ3BhZGRpbmcnLCAnMTBweCcpOyAvLyBtYWtlIGl0IGxvb2sgbGlrZSBhIGxpbmtcbiAgICAgICAgICAgICAgICAkKGNvbHVtbikuY2xpY2sodGhpcy5fb25NZXRhYm9saWNNYXBDaG9zZW4uYmluZCh0aGlzLCBtYXAsIGNhbGxiYWNrKSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHRoaXMuX2RpYWxvZ0JveC5hZGRFbGVtZW50KHRhYmxlLnRhYmxlKTtcbiAgICAgICAgfSwgKGVycjpzdHJpbmcpOnZvaWQgPT4ge1xuICAgICAgICAgICAgdGhpcy5fZGlhbG9nQm94LnNob3dNZXNzYWdlKGVyciwgKCk6dm9pZCA9PiBjYWxsYmFjay5jYWxsKHt9LCBlcnIpKTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG5cbiAgICAvLyBDYWxsZWQgd2hlbiB0aGV5IGNsaWNrIG9uIGEgYmlvbWFzcyByZWFjdGlvbi5cbiAgICBwcml2YXRlIF9vbk1ldGFib2xpY01hcENob3NlbihtYXA6U2VydmVyTWV0YWJvbGljTWFwLFxuICAgICAgICAgICAgY2FsbGJhY2s6TWV0YWJvbGljTWFwQ2hvb3NlclJlc3VsdCk6dm9pZCB7XG4gICAgICAgIC8vIEJlZm9yZSB3ZSByZXR1cm4gdG8gdGhlIGNhbGxlciwgdGVsbCB0aGUgc2VydmVyIHRvIHN0b3JlIHRoaXMgYXNzb2NpYXRpb24uXG4gICAgICAgIHRoaXMuX3JlcXVlc3RTZXRTdHVkeU1ldGFib2xpY01hcChtYXAuaWQsXG4gICAgICAgICAgICAoZXJyb3I6c3RyaW5nKTp2b2lkID0+IHtcbiAgICAgICAgICAgICAgICB0aGlzLl9kaWFsb2dCb3guc2hvd01lc3NhZ2UoZXJyb3IsICgpOnZvaWQgPT4gY2FsbGJhY2suY2FsbCh7fSwgZXJyb3IpKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgKTtcbiAgICB9XG5cblxuICAgIC8vIEdldCBpbmZvIGZyb20gdGhlIHNlcnZlci4uXG4gICAgcHJpdmF0ZSBfcmVxdWVzdFN0dWR5TWV0YWJvbGljTWFwKFxuICAgICAgICAgICAgY2FsbGJhY2s6IChtYXA6U2VydmVyTWV0YWJvbGljTWFwKSA9PiB2b2lkLFxuICAgICAgICAgICAgZXJyb3I6IChlcnJvcjpzdHJpbmcpID0+IHZvaWQpOiB2b2lkIHtcbiAgICAgICAgJC5hamF4KHtcbiAgICAgICAgICAgIGRhdGFUeXBlOiBcImpzb25cIixcbiAgICAgICAgICAgIHVybDogXCJtYXAvXCIsXG4gICAgICAgICAgICBzdWNjZXNzOiBjYWxsYmFjayxcbiAgICAgICAgICAgIGVycm9yOiAoanFYSFI6SlF1ZXJ5WEhSLCBzdGF0dXM6c3RyaW5nLCBlcnJvclRleHQ6c3RyaW5nKTp2b2lkID0+IHtcbiAgICAgICAgICAgICAgICBlcnJvci5jYWxsKHt9LCBzdGF0dXMgKyBcIiBcIiArIGVycm9yVGV4dCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH1cblxuXG4gICAgLy8gR2V0IGEgbGlzdCBvZiBtZXRhYm9saWMgbWFwcyB0aGF0IHdlIGNvdWxkIHVzZSBmb3IgdGhpcyBzdHVkeS5cbiAgICBwcml2YXRlIF9yZXF1ZXN0TWV0YWJvbGljTWFwTGlzdChcbiAgICAgICAgICAgIGNhbGxiYWNrOiAobWV0YWJvbGljTWFwczpTZXJ2ZXJNZXRhYm9saWNNYXBbXSkgPT4gdm9pZCxcbiAgICAgICAgICAgIGVycm9yOiAoZXJyb3I6c3RyaW5nKSA9PiB2b2lkKTp2b2lkIHtcbiAgICAgICAgJC5hamF4KHtcbiAgICAgICAgICAgIGRhdGFUeXBlOiBcImpzb25cIixcbiAgICAgICAgICAgIHVybDogXCIvZGF0YS9zYm1sL1wiLFxuICAgICAgICAgICAgc3VjY2VzczogY2FsbGJhY2ssXG4gICAgICAgICAgICBlcnJvcjogKGpxWEhSOkpRdWVyeVhIUiwgc3RhdHVzOnN0cmluZywgZXJyb3JUZXh0OnN0cmluZyk6dm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgZXJyb3IuY2FsbCh7fSwgc3RhdHVzICsgXCIgXCIgKyBlcnJvclRleHQpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9XG5cblxuICAgIHByaXZhdGUgX3JlcXVlc3RTZXRTdHVkeU1ldGFib2xpY01hcChtZXRhYm9saWNNYXBJRDpudW1iZXIsXG4gICAgICAgICAgICBjYWxsYmFjazogKGVycjpzdHJpbmcpID0+IHZvaWQpOnZvaWQge1xuICAgICAgICAkLmFqYXgoe1xuICAgICAgICAgICAgdHlwZTogXCJQT1NUXCIsXG4gICAgICAgICAgICBkYXRhVHlwZTogXCJqc29uXCIsXG4gICAgICAgICAgICB1cmw6IFwibWFwL1wiLFxuICAgICAgICAgICAgZGF0YTogJC5leHRlbmQoe30sIHRoaXMuX2Jhc2VQYXlsb2FkKCksIHsgXCJtZXRhYm9saWNNYXBJRFwiOiBtZXRhYm9saWNNYXBJRCB9KSxcbiAgICAgICAgICAgIGVycm9yOiAoanFYSFI6SlF1ZXJ5WEhSLCBzdGF0dXM6c3RyaW5nLCBlcnJvclRleHQ6c3RyaW5nKTp2b2lkID0+IHtcbiAgICAgICAgICAgICAgICBjYWxsYmFjay5jYWxsKHt9LCBzdGF0dXMgKyBcIiBcIiArIGVycm9yVGV4dCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH1cblxufVxuXG5cblxuaW50ZXJmYWNlIEJpb21hc3NSZXN1bHRzQ2FsbGJhY2sge1xuICAgIChlcnI6c3RyaW5nLCBmaW5hbEJpb21hc3M/Om51bWJlcik6IHZvaWQ7XG59O1xuXG4vLyBUaGlzIFVJIGhhbmRsZXMgbWFwcGluZyBTQk1MIHNwZWNpZXMgdG8gRUREIG1ldGFib2xpdGVzLCBjYWxjdWxhdGluZyBcbi8vIHRoZSBiaW9tYXNzLCBhbmQgcmVtZW1iZXJpbmcgdGhlIHJlc3VsdC5cbmNsYXNzIEJpb21hc3NDYWxjdWxhdGlvblVJIHtcblxuICAgIHByaXZhdGUgX2RpYWxvZ0JveDpEaWFsb2dCb3g7XG5cbiAgICBjb25zdHJ1Y3RvcihtZXRhYm9saWNNYXBJRDpudW1iZXIsIGNhbGxiYWNrOkJpb21hc3NSZXN1bHRzQ2FsbGJhY2spIHtcbiAgICAgICAgdGhpcy5fZGlhbG9nQm94ID0gbmV3IERpYWxvZ0JveCggNTAwLCA1MDAgKTtcblxuICAgICAgICAvLyBGaXJzdCwgaGF2ZSB0aGUgdXNlciBwaWNrIGEgYmlvbWFzcyByZWFjdGlvbi5cbiAgICAgICAgdGhpcy5fZGlhbG9nQm94LnNob3dXYWl0U3Bpbm5lcignTG9va2luZyB1cCBiaW9tYXNzIHJlYWN0aW9ucy4uLicpO1xuXG4gICAgICAgIHRoaXMuX3JlcXVlc3RCaW9tYXNzUmVhY3Rpb25MaXN0KG1ldGFib2xpY01hcElELFxuICAgICAgICAgICAgICAgIChyZWFjdGlvbnM6U2VydmVyQmlvbWFzc1JlYWN0aW9uW10pOnZvaWQgPT4ge1xuICAgICAgICAgICAgdmFyIHRhYmxlOlV0bC5UYWJsZTtcbiAgICAgICAgICAgIGlmICghcmVhY3Rpb25zLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgIHRoaXMuX2RpYWxvZ0JveC5zaG93TWVzc2FnZShcbiAgICAgICAgICAgICAgICAgICAgJ1RoZXJlIGFyZSBubyBiaW9tYXNzIHJlYWN0aW9ucyBpbiB0aGlzIG1ldGFib2xpYyBtYXAhJyk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIC8vIERpc3BsYXkgdGhlIGxpc3Qgb2YgYmlvbWFzcyByZWFjdGlvbnMuXG4gICAgICAgICAgICAgICAgdGhpcy5fZGlhbG9nQm94LmNsZWFyQ29udGVudHMoKTtcbiAgICAgICAgICAgICAgICB0aGlzLl9kaWFsb2dCb3guYWRkSFRNTChcbiAgICAgICAgICAgICAgICAgICAgJzxkaXY+UGxlYXNlIGNob29zZSBhIGJpb21hc3MgcmVhY3Rpb24gdG8gdXNlIGZvciBjYXJib24gYmFsYW5jZS4nICtcbiAgICAgICAgICAgICAgICAgICAgJzxicj48YnI+PC9kaXY+Jyk7XG4gICAgICAgICAgICAgICAgdGFibGUgPSBuZXcgVXRsLlRhYmxlKCdiaW9tYXNzUmVhY3Rpb25DaG9vc2VyJyk7XG4gICAgICAgICAgICAgICAgdGFibGUudGFibGUuc2V0QXR0cmlidXRlKCdjZWxsc3BhY2luZycsICcwJyk7XG4gICAgICAgICAgICAgICAgJCh0YWJsZS50YWJsZSkuY3NzKCdib3JkZXItY29sbGFwc2UnLCAnY29sbGFwc2UnKTtcblxuICAgICAgICAgICAgICAgIHJlYWN0aW9ucy5mb3JFYWNoKChyZWFjdGlvbjpTZXJ2ZXJCaW9tYXNzUmVhY3Rpb24pOnZvaWQgPT4ge1xuICAgICAgICAgICAgICAgICAgICB0YWJsZS5hZGRSb3coKTtcbiAgICAgICAgICAgICAgICAgICAgdmFyIGNvbHVtbjphbnkgPSB0YWJsZS5hZGRDb2x1bW4oKTtcbiAgICAgICAgICAgICAgICAgICAgY29sdW1uLmlubmVySFRNTCA9IHJlYWN0aW9uLnJlYWN0aW9uTmFtZTtcbiAgICAgICAgICAgICAgICAgICAgJChjb2x1bW4pLmNzcygnY3Vyc29yJywgJ3BvaW50ZXInKTsgLy8gbWFrZSBpdCBsb29rIGxpa2UgYSBsaW5rXG4gICAgICAgICAgICAgICAgICAgICQoY29sdW1uKS5jc3MoJ2JvcmRlci10b3AnLCAnMXB4IHNvbGlkICMwMDAnKTsgLy8gbWFrZSBpdCBsb29rIGxpa2UgYSBsaW5rXG4gICAgICAgICAgICAgICAgICAgICQoY29sdW1uKS5jc3MoJ2JvcmRlci1ib3R0b20nLCAnMXB4IHNvbGlkICMwMDAnKTsgLy8gbWFrZSBpdCBsb29rIGxpa2UgYSBsaW5rXG4gICAgICAgICAgICAgICAgICAgICQoY29sdW1uKS5jc3MoJ3BhZGRpbmcnLCAnMTBweCcpOyAvLyBtYWtlIGl0IGxvb2sgbGlrZSBhIGxpbmtcbiAgICAgICAgICAgICAgICAgICAgJChjb2x1bW4pLmNsaWNrKCAoKTp2b2lkID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX29uQmlvbWFzc1JlYWN0aW9uQ2hvc2VuKG1ldGFib2xpY01hcElELCByZWFjdGlvbiwgY2FsbGJhY2spO1xuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB0aGlzLl9kaWFsb2dCb3guYWRkRWxlbWVudCh0YWJsZS50YWJsZSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgfSwgKGVycm9yOnN0cmluZyk6dm9pZCA9PiB7XG4gICAgICAgICAgICB0aGlzLl9kaWFsb2dCb3guc2hvd01lc3NhZ2UoZXJyb3IsICgpOnZvaWQgPT4gY2FsbGJhY2suY2FsbCh7fSwgZXJyb3IpKTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG5cbiAgICAvLyBUaGUgdXNlciBjaG9zZSBhIGJpb21hc3MgcmVhY3Rpb24uIE5vdyB3ZSBjYW4gc2hvdyBhbGwgdGhlIHNwZWNpZXMgaW4gdGhlIHJlYWN0aW9uIGFuZFxuICAgIC8vIG1hdGNoIHRvIEVERCBtZXRhYm9saXRlcy5cbiAgICBwcml2YXRlIF9vbkJpb21hc3NSZWFjdGlvbkNob3NlbihtZXRhYm9saWNNYXBJRDpudW1iZXIsIHJlYWN0aW9uOlNlcnZlckJpb21hc3NSZWFjdGlvbixcbiAgICAgICAgICAgIGNhbGxiYWNrOkJpb21hc3NSZXN1bHRzQ2FsbGJhY2spOnZvaWQge1xuICAgICAgICAvLyBQdWxsIGEgbGlzdCBvZiBhbGwgbWV0YWJvbGl0ZXMgaW4gdGhpcyByZWFjdGlvbi5cbiAgICAgICAgdGhpcy5fZGlhbG9nQm94LnNob3dXYWl0U3Bpbm5lcignR2V0dGluZyBzcGVjaWVzIGxpc3QuLi4nKTtcbiAgICAgICAgdGhpcy5fcmVxdWVzdFNwZWNpZXNMaXN0RnJvbUJpb21hc3NSZWFjdGlvbihtZXRhYm9saWNNYXBJRCwgcmVhY3Rpb24ucmVhY3Rpb25JRCxcbiAgICAgICAgICAgICAgICAoc3BlY2llc0xpc3Q6U2VydmVyQmlvbWFzc1NwZWNpZXNFbnRyeVtdKTp2b2lkID0+IHtcbiAgICAgICAgICAgIHZhciB0YWJsZTpVdGwuVGFibGUgPSBuZXcgVXRsLlRhYmxlKCdiaW9tYXNzUmVhY3Rpb25DaG9vc2VyJyksXG4gICAgICAgICAgICAgICAgaW5wdXRzOkVEREF1dG8uTWV0YWJvbGl0ZVtdID0gW107XG4gICAgICAgICAgICB0YWJsZS50YWJsZS5zZXRBdHRyaWJ1dGUoJ2NlbGxzcGFjaW5nJywgJzAnKTtcbiAgICAgICAgICAgICQodGFibGUudGFibGUpLmNzcygnYm9yZGVyLWNvbGxhcHNlJywgJ2NvbGxhcHNlJyk7XG5cbiAgICAgICAgICAgIHNwZWNpZXNMaXN0LmZvckVhY2goKHNwZWNpZXM6U2VydmVyQmlvbWFzc1NwZWNpZXNFbnRyeSwgaTpudW1iZXIpOnZvaWQgPT4ge1xuICAgICAgICAgICAgICAgIHZhciBzcGVjaWVzQ29sdW1uOkhUTUxFbGVtZW50LCBtZXRhYm9saXRlQ29sdW1uOkhUTUxFbGVtZW50LCBhdXRvQ29tcDpFRERBdXRvLk1ldGFib2xpdGU7XG4gICAgICAgICAgICAgICAgdGFibGUuYWRkUm93KCk7XG4gICAgICAgICAgICAgICAgc3BlY2llc0NvbHVtbiA9IHRhYmxlLmFkZENvbHVtbigpO1xuICAgICAgICAgICAgICAgIHNwZWNpZXNDb2x1bW4uaW5uZXJIVE1MID0gc3BlY2llcy5zYm1sU3BlY2llc05hbWU7XG4gICAgICAgICAgICAgICAgbWV0YWJvbGl0ZUNvbHVtbiA9IHRhYmxlLmFkZENvbHVtbigpO1xuICAgICAgICAgICAgICAgIGF1dG9Db21wID0gbmV3IEVEREF1dG8uTWV0YWJvbGl0ZSh7XG4gICAgICAgICAgICAgICAgICAgIGNvbnRhaW5lcjogJChtZXRhYm9saXRlQ29sdW1uKSxcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICBhdXRvQ29tcC52aXNpYmxlSW5wdXQuYWRkQ2xhc3MoJ2F1dG9jb21wX21ldGFib2wnKTtcbiAgICAgICAgICAgICAgICBpbnB1dHMucHVzaChhdXRvQ29tcCk7XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgdGhpcy5fZGlhbG9nQm94LmNsZWFyQ29udGVudHMoKTtcbiAgICAgICAgICAgIHRoaXMuX2RpYWxvZ0JveC5hZGRIVE1MKFxuICAgICAgICAgICAgICAgICc8ZGl2PlBsZWFzZSBtYXRjaCBTQk1MIHNwZWNpZXMgdG8gRUREIG1ldGFib2xpdGVzLjxicj48YnI+PC9kaXY+Jyk7XG4gICAgICAgICAgICB0aGlzLl9kaWFsb2dCb3guYWRkRWxlbWVudCh0YWJsZS50YWJsZSk7XG5cbiAgICAgICAgICAgIHZhciBlcnJvclN0cmluZ0VsZW1lbnQ6SFRNTEVsZW1lbnQgPSBVdGwuSlMuY3JlYXRlRWxlbWVudEZyb21TdHJpbmcoXG4gICAgICAgICAgICAgICAgJzxzcGFuIHN0eWxlPVwiZm9udC1zaXplOjEycHg7IGNvbG9yOnJlZDtcIj48L3NwYW4+Jyk7XG4gICAgICAgICAgICAkKGVycm9yU3RyaW5nRWxlbWVudCkuY3NzKCd2aXNpYmlsaXR5JywgJ2hpZGRlbicpO1xuICAgICAgICAgICAgdGhpcy5fZGlhbG9nQm94LmFkZEVsZW1lbnQoZXJyb3JTdHJpbmdFbGVtZW50KTtcblxuICAgICAgICAgICAgLy8gQ3JlYXRlIGFuIE9LIGJ1dHRvbiBhdCB0aGUgYm90dG9tLlxuICAgICAgICAgICAgdmFyIG9rQnV0dG9uOkhUTUxFbGVtZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnYnV0dG9uJyk7XG4gICAgICAgICAgICBva0J1dHRvbi5hcHBlbmRDaGlsZChkb2N1bWVudC5jcmVhdGVUZXh0Tm9kZSgnT0snKSk7XG4gICAgICAgICAgICAkKG9rQnV0dG9uKS5jbGljayggKCk6dm9pZCA9PiB0aGlzLl9vbkZpbmlzaGVkQmlvbWFzc1NwZWNpZXNFbnRyeShzcGVjaWVzTGlzdCwgaW5wdXRzLFxuICAgICAgICAgICAgICAgIGVycm9yU3RyaW5nRWxlbWVudCwgbWV0YWJvbGljTWFwSUQsIHJlYWN0aW9uLCBjYWxsYmFjaykpO1xuICAgICAgICAgICAgdGhpcy5fZGlhbG9nQm94LmFkZEVsZW1lbnQob2tCdXR0b24pO1xuICAgICAgICB9LCAoZXJyb3I6c3RyaW5nKTp2b2lkID0+IHtcbiAgICAgICAgICAgIHRoaXMuX2RpYWxvZ0JveC5zaG93TWVzc2FnZShlcnJvciwgKCk6dm9pZCA9PiBjYWxsYmFjay5jYWxsKHt9LCBlcnJvcikpO1xuICAgICAgICB9KTtcblxuICAgIH1cblxuXG4gICAgLy8gQ2FsbGVkIHdoZW4gdGhleSBjbGljayB0aGUgT0sgYnV0dG9uIG9uIHRoZSBiaW9tYXNzIHNwZWNpZXMgbGlzdC5cbiAgICBwcml2YXRlIF9vbkZpbmlzaGVkQmlvbWFzc1NwZWNpZXNFbnRyeShzcGVjaWVzTGlzdDpTZXJ2ZXJCaW9tYXNzU3BlY2llc0VudHJ5W10sIGlucHV0czpFRERBdXRvLk1ldGFib2xpdGVbXSxcbiAgICAgICAgZXJyb3JTdHJpbmdFbGVtZW50OkhUTUxFbGVtZW50LCBtZXRhYm9saWNNYXBJRDpudW1iZXIsIHJlYWN0aW9uOlNlcnZlckJpb21hc3NSZWFjdGlvbixcbiAgICAgICAgY2FsbGJhY2s6QmlvbWFzc1Jlc3VsdHNDYWxsYmFjayk6dm9pZCB7XG5cbiAgICAgICAgLy8gQXJlIHRoZSBpbnB1dHMgYWxsIGZpbGxlZCBpbj9cbiAgICAgICAgdmFyIG51bUVtcHR5Om51bWJlciA9IGlucHV0cy5maWx0ZXIoKGlucHV0OkVEREF1dG8uTWV0YWJvbGl0ZSk6Ym9vbGVhbiA9PiBpbnB1dC52aXNpYmxlSW5wdXQudmFsKCkgPT09ICcnKS5sZW5ndGg7XG5cbiAgICAgICAgaWYgKCQoZXJyb3JTdHJpbmdFbGVtZW50KS5jc3MoJ3Zpc2liaWxpdHknKSA9PT0gJ2hpZGRlbicpIHtcbiAgICAgICAgICAgIC8vIFNob3cgdGhlbSBhbiBlcnJvciBtZXNzYWdlLCBidXQgbmV4dCB0aW1lIHRoZXkgY2xpY2sgT0ssIGp1c3QgZG8gdGhlIGJpb21hc3NcbiAgICAgICAgICAgIC8vIGNhbGN1bGF0aW9uIGFueXdheS5cbiAgICAgICAgICAgIGlmIChudW1FbXB0eSA+IDApIHtcbiAgICAgICAgICAgICAgICAkKGVycm9yU3RyaW5nRWxlbWVudCkuY3NzKCd2aXNpYmlsaXR5JywgJ3Zpc2libGUnKTtcbiAgICAgICAgICAgICAgICBlcnJvclN0cmluZ0VsZW1lbnQuaW5uZXJIVE1MID0gJzxicj48YnI+VGhlcmUgYXJlICcgKyBudW1FbXB0eS50b1N0cmluZygpICtcbiAgICAgICAgICAgICAgICAgICAgJyB1bm1hdGNoZWQgc3BlY2llcy4gSWYgeW91IHByb2NlZWQsIHRoZSBiaW9tYXNzIGNhbGN1bGF0aW9uIHdpbGwgbm90JyArXG4gICAgICAgICAgICAgICAgICAgICcgaW5jbHVkZSB0aGVzZS4gQ2xpY2sgT0sgYWdhaW4gdG8gcHJvY2VlZCBhbnl3YXkuPGJyPjxicj4nO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFNlbmQgZXZlcnl0aGluZyB0byB0aGUgc2VydmVyIGFuZCBnZXQgYSBiaW9tYXNzIGNhbGN1bGF0aW9uIGJhY2suXG4gICAgICAgIHRoaXMuX2RpYWxvZ0JveC5zaG93V2FpdFNwaW5uZXIoJ0NhbGN1bGF0aW5nIGZpbmFsIGJpb21hc3MgZmFjdG9yLi4uJyk7XG5cbiAgICAgICAgdmFyIG1hdGNoZXM6YW55ID0ge307XG4gICAgICAgIGlucHV0cy5mb3JFYWNoKChpbnB1dDpFRERBdXRvLk1ldGFib2xpdGUsIGk6bnVtYmVyKTp2b2lkID0+IHtcbiAgICAgICAgICAgIHZhciBzcE5hbWU6c3RyaW5nID0gc3BlY2llc0xpc3RbaV0uc2JtbFNwZWNpZXNOYW1lLCBpZDpzdHJpbmcsIG1ldDphbnk7XG4gICAgICAgICAgICBpZCA9IGlucHV0LnZhbCgpO1xuICAgICAgICAgICAgbWV0ID0gRURERGF0YS5NZXRhYm9saXRlVHlwZXNbaWRdIHx8IHt9O1xuICAgICAgICAgICAgbWF0Y2hlc1tzcE5hbWVdID0gbWV0Lm5hbWUgfHwgJyc7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHRoaXMuX3JlcXVlc3RGaW5hbEJpb21hc3NDb21wdXRhdGlvbihtZXRhYm9saWNNYXBJRCwgcmVhY3Rpb24ucmVhY3Rpb25JRCwgbWF0Y2hlcyxcbiAgICAgICAgICAgICAgICAoZmluYWxCaW9tYXNzOm51bWJlcik6dm9pZCA9PiB7XG4gICAgICAgICAgICAvLyBGaW5hbGx5LCBwYXNzIHRoZSBiaW9tYXNzIHRvIG91ciBjYWxsZXIuXG4gICAgICAgICAgICB0aGlzLl9kaWFsb2dCb3gudGVybSgpO1xuICAgICAgICAgICAgY2FsbGJhY2sobnVsbCwgZmluYWxCaW9tYXNzKTtcbiAgICAgICAgfSwgKGVycm9yOnN0cmluZyk6dm9pZCA9PiB7XG4gICAgICAgIFx0dGhpcy5fZGlhbG9nQm94LnNob3dNZXNzYWdlKGVycm9yLCAoKTp2b2lkID0+IGNhbGxiYWNrLmNhbGwoe30sIGVycm9yKSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuXG4gICAgLy8gR2V0IGEgbGlzdCBvZiBiaW9tYXNzIHJlYWN0aW9ucyBpbiB0aGUgc3BlY2lmaWVkIG1ldGFib2xpYyBtYXAuXG4gICAgcHJpdmF0ZSBfcmVxdWVzdFNwZWNpZXNMaXN0RnJvbUJpb21hc3NSZWFjdGlvbihtZXRhYm9saWNNYXBJRDpudW1iZXIsIHJlYWN0aW9uSUQ6c3RyaW5nLFxuICAgICAgICAgICAgY2FsbGJhY2s6IChzcGVjaWVzTGlzdDpTZXJ2ZXJCaW9tYXNzU3BlY2llc0VudHJ5W10pID0+IHZvaWQsXG4gICAgICAgICAgICBlcnJvcjogKGVycm9yOnN0cmluZykgPT4gdm9pZCk6dm9pZCB7XG4gICAgICAgICQuYWpheCh7XG4gICAgICAgICAgICBkYXRhVHlwZTogXCJqc29uXCIsXG4gICAgICAgICAgICB1cmw6IFsgXCIvZGF0YS9zYm1sXCIsIG1ldGFib2xpY01hcElELCBcInJlYWN0aW9uc1wiLCByZWFjdGlvbklELCBcIlwiIF0uam9pbihcIi9cIiksXG4gICAgICAgICAgICAvLyByZWZhY3Rvcjogc2VydmVyIHJldHVybnMgb2JqZWN0LCBleGlzdGluZyBjb2RlIGV4cGVjdHMgYXJyYXksIG5lZWQgdG8gdHJhbnNsYXRlXG4gICAgICAgICAgICBzdWNjZXNzOiAoZGF0YTphbnkpOnZvaWQgPT4ge1xuICAgICAgICAgICAgICAgIHZhciB0cmFuc2xhdGVkOlNlcnZlckJpb21hc3NTcGVjaWVzRW50cnlbXSA9IFtdO1xuICAgICAgICAgICAgICAgIHRyYW5zbGF0ZWQgPSAkLm1hcChkYXRhLCAodmFsdWU6YW55LCBrZXk6c3RyaW5nKTpTZXJ2ZXJCaW9tYXNzU3BlY2llc0VudHJ5ID0+IHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuICQuZXh0ZW5kKHZhbHVlLCB7XG4gICAgICAgICAgICAgICAgICAgICAgICBcInNibWxTcGVjaWVzTmFtZVwiOiBrZXksXG4gICAgICAgICAgICAgICAgICAgICAgICBcImVkZE1ldGFib2xpdGVOYW1lXCI6IHZhbHVlLnNuXG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIGNhbGxiYWNrLmNhbGwoe30sIHRyYW5zbGF0ZWQpO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGVycm9yOiAoanFYSFI6SlF1ZXJ5WEhSLCBzdGF0dXM6c3RyaW5nLCBlcnJvclRleHQ6c3RyaW5nKTp2b2lkID0+IHtcbiAgICAgICAgICAgICAgICBlcnJvci5jYWxsKHt9LCBzdGF0dXMgKyBcIiBcIiArIGVycm9yVGV4dCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH1cblxuXG4gICAgLy8gR2V0IGEgbGlzdCBvZiBiaW9tYXNzIHJlYWN0aW9ucyBpbiB0aGUgc3BlY2lmaWVkIG1ldGFib2xpYyBtYXAuXG4gICAgcHJpdmF0ZSBfcmVxdWVzdEJpb21hc3NSZWFjdGlvbkxpc3QobWV0YWJvbGljTWFwSUQ6bnVtYmVyLFxuICAgICAgICAgICAgY2FsbGJhY2s6IChyZWFjdGlvbnM6U2VydmVyQmlvbWFzc1JlYWN0aW9uW10pID0+IHZvaWQsXG4gICAgICAgICAgICBlcnJvcjogKGVycm9yOnN0cmluZykgPT4gdm9pZCk6dm9pZCB7XG4gICAgICAgICQuYWpheCh7XG4gICAgICAgICAgICBkYXRhVHlwZTogXCJqc29uXCIsXG4gICAgICAgICAgICB1cmw6IFwiL2RhdGEvc2JtbC9cIiArIG1ldGFib2xpY01hcElEICsgXCIvcmVhY3Rpb25zL1wiLFxuICAgICAgICAgICAgc3VjY2VzczogY2FsbGJhY2ssXG4gICAgICAgICAgICBlcnJvcjogKGpxWEhSOkpRdWVyeVhIUiwgc3RhdHVzOnN0cmluZywgZXJyb3JUZXh0OnN0cmluZyk6dm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgZXJyb3IuY2FsbCh7fSwgc3RhdHVzICsgXCIgXCIgKyBlcnJvclRleHQpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9XG5cblxuICAgIC8vIFRoaXMgaXMgd2hlcmUgd2UgcGFzcyBhbGwgdGhlIHNwZWNpZXMtPm1ldGFib2xpdGUgbWF0Y2hlcyB0byB0aGUgc2VydmVyIGFuZCBhc2sgaXQgdG9cbiAgICAvLyBmaW5hbGl6ZSB0aGUgXG4gICAgcHJpdmF0ZSBfcmVxdWVzdEZpbmFsQmlvbWFzc0NvbXB1dGF0aW9uKG1ldGFib2xpY01hcElEOm51bWJlciwgcmVhY3Rpb25JRDpzdHJpbmcsIG1hdGNoZXM6YW55LFxuICAgICAgICAgICAgY2FsbGJhY2s6IChmaW5hbEJpb21hc3M6bnVtYmVyKSA9PiB2b2lkLFxuICAgICAgICAgICAgZXJyb3I6IChlcnJvcjpzdHJpbmcpID0+IHZvaWQpOnZvaWQge1xuICAgICAgICAkLmFqYXgoe1xuICAgICAgICAgICAgdHlwZTogXCJQT1NUXCIsXG4gICAgICAgICAgICBkYXRhVHlwZTogXCJqc29uXCIsXG4gICAgICAgICAgICB1cmw6IFsgXCIvZGF0YS9zYm1sXCIsIG1ldGFib2xpY01hcElELCBcInJlYWN0aW9uc1wiLCByZWFjdGlvbklELCBcImNvbXB1dGUvXCIgXS5qb2luKFwiL1wiKSxcbiAgICAgICAgICAgIGRhdGE6IHsgXCJzcGVjaWVzXCI6IG1hdGNoZXMgfSxcbiAgICAgICAgICAgIHN1Y2Nlc3M6IGNhbGxiYWNrLFxuICAgICAgICAgICAgZXJyb3I6IChqcVhIUjpKUXVlcnlYSFIsIHN0YXR1czpzdHJpbmcsIGVycm9yVGV4dDpzdHJpbmcpOnZvaWQgPT4ge1xuICAgICAgICAgICAgICAgIGVycm9yLmNhbGwoe30sIHN0YXR1cyArIFwiIFwiICsgZXJyb3JUZXh0KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfVxufVxuXG5cblxuLy8gVGhpcyBpcyB0aGUgZnVsbCBVSSBzZXF1ZW5jZSB0byBhc3NvY2lhdGUgYSBtZXRhYm9saWMgbWFwIHdpdGggYSBzdHVkeVxuLy8gQU5EIGNhbGN1bGF0ZSBiaW9tYXNzIGlmIG5lY2Vzc2FyeS4gTm90ZSB0aGF0IGl0IGNvdWxkIHN1Y2NlZWQgaW4gY2hvb3NpbmcgYSBuZXcgbWV0YWJvbGljIG1hcFxuLy8gYnV0IHRoZSB1c2VyIGNvdWxkIGNhbmNlbCB0aGUgYmlvbWFzcyBjYWxjdWxhdGlvbi4gSW4gdGhhdCBjYXNlLCB5b3VyIGNhbGxiYWNrIHdvdWxkIGJlIGNhbGxlZFxuLy8gd2l0aCBhIHZhbGlkIG1ldGFib2xpY01hcEZpbGVuYW1lIGJ1dCBmaW5hbEJpb21hc3M9LTEgKGFuZCBlcnIgd291bGQgYmUgc2V0KS5cbmludGVyZmFjZSBGdWxsU3R1ZHlCaW9tYXNzVUlSZXN1bHRzQ2FsbGJhY2sge1xuICAgIChlcnI6c3RyaW5nLCBtZXRhYm9saWNNYXBJRD86bnVtYmVyLCBtZXRhYm9saWNNYXBGaWxlbmFtZT86c3RyaW5nLCBmaW5hbEJpb21hc3M/Om51bWJlcik6IHZvaWQ7XG59O1xuXG5jbGFzcyBGdWxsU3R1ZHlCaW9tYXNzVUkge1xuICAgIGNvbnN0cnVjdG9yKGNhbGxiYWNrOkZ1bGxTdHVkeUJpb21hc3NVSVJlc3VsdHNDYWxsYmFjaykge1xuICAgICAgICB2YXIgY2hvb3NlcjpTdHVkeU1ldGFib2xpY01hcENob29zZXIsIGNob29zZXJIYW5kbGVyOk1ldGFib2xpY01hcENob29zZXJSZXN1bHQ7XG4gICAgICAgIGNob29zZXJIYW5kbGVyID0gKGVycm9yOnN0cmluZyxcbiAgICAgICAgICAgICAgICBtZXRhYm9saWNNYXBJRD86bnVtYmVyLFxuICAgICAgICAgICAgICAgIG1ldGFib2xpY01hcEZpbGVuYW1lPzpzdHJpbmcsXG4gICAgICAgICAgICAgICAgYmlvbWFzc0NhbGN1bGF0aW9uPzpudW1iZXIpOnZvaWQgPT4ge1xuICAgICAgICAgICAgdmFyIHVpOkJpb21hc3NDYWxjdWxhdGlvblVJO1xuICAgICAgICAgICAgaWYgKGVycm9yKSB7XG4gICAgICAgICAgICAgICAgY2FsbGJhY2suY2FsbCh7fSwgZXJyb3IpO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChiaW9tYXNzQ2FsY3VsYXRpb24gPT09IC0xKSB7XG4gICAgICAgICAgICAgICAgLy8gVGhlIHN0dWR5IGhhcyBhIG1ldGFib2xpYyBtYXAsIGJ1dCBubyBiaW9tYXNzIGhhcyBiZWVuIGNhbGN1bGF0ZWQgZm9yIGl0IHlldC5cbiAgICAgICAgICAgICAgICAvLyBXZSBuZWVkIHRvIG1hdGNoIGFsbCBtZXRhYm9saXRlcyBzbyB0aGUgc2VydmVyIGNhbiBjYWxjdWxhdGlvbiBiaW9tYXNzLlxuICAgICAgICAgICAgICAgIHVpID0gbmV3IEJpb21hc3NDYWxjdWxhdGlvblVJKG1ldGFib2xpY01hcElELFxuICAgICAgICAgICAgICAgICAgICAoYmlvbWFzc0VycjpzdHJpbmcsIGZpbmFsQmlvbWFzc0NhbGN1bGF0aW9uPzpudW1iZXIpOnZvaWQgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgY2FsbGJhY2suY2FsbCh7fSwgYmlvbWFzc0VyciwgbWV0YWJvbGljTWFwSUQsIG1ldGFib2xpY01hcEZpbGVuYW1lLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGZpbmFsQmlvbWFzc0NhbGN1bGF0aW9uKTtcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGNhbGxiYWNrKG51bGwsIG1ldGFib2xpY01hcElELCBtZXRhYm9saWNNYXBGaWxlbmFtZSwgYmlvbWFzc0NhbGN1bGF0aW9uKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcbiAgICAgICAgLy8gRmlyc3QsIG1ha2Ugc3VyZSBhIG1ldGFib2xpYyBtYXAgaXMgYm91bmQgdG8gdGhlIHN0dWR5LlxuICAgICAgICBjaG9vc2VyID0gbmV3IFN0dWR5TWV0YWJvbGljTWFwQ2hvb3Nlcih0cnVlLCBjaG9vc2VySGFuZGxlcik7XG4gICAgfVxufVxuXG5cblxuIl19