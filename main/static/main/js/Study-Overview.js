// File last modified on: Wed Dec 21 2016 14:53:35  
/// <reference path="typescript-declarations.d.ts" />
/// <reference path="Utl.ts" />
/// <reference path="Dragboxes.ts" />
/// <reference path="DataGrid.ts" />
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
var StudyOverview;
(function (StudyOverview) {
    'use strict';
    var attachmentIDs;
    var attachmentsByID;
    var prevDescriptionEditElement;
    var activeDraggedFile;
    var fileUploadProgressBar;
    // Called when the page loads.
    function prepareIt() {
        this.attachmentIDs = null;
        this.attachmentsByID = null;
        this.prevDescriptionEditElement = null;
        this.metabolicMapID = -1;
        this.metabolicMapName = null;
        this.biomassCalculation = -1;
        new EditableStudyName($('#editable-study-name').get()[0]);
        new EDDEditable.EditableAutocomplete($('#editable-study-contact').get()[0]);
        new EditableStudyDescription($('#editable-study-description').get()[0]);
        // put the click handler at the document level, then filter to any link inside a .disclose
        $(document).on('click', '.disclose .discloseLink', function (e) {
            $(e.target).closest('.disclose').toggleClass('discloseHide');
            return false;
        });
        this.fileUploadProgressBar = new Utl.ProgressBar('fileUploadProgressBar');
        Utl.FileDropZone.create({
            elementId: "templateDropZone",
            fileInitFn: this.fileDropped.bind(this),
            processRawFn: this.fileRead.bind(this),
            url: '/study/' + EDDData.currentStudyID + '/parsetemplate/',
            processResponseFn: this.fileReturnedFromServer.bind(this),
            progressBar: this.fileUploadProgressBar
        });
        Utl.Tabs.prepareTabs();
        $(window).on('load', preparePermissions);
    }
    StudyOverview.prepareIt = prepareIt;
    // This is called upon receiving a response from a file upload operation, and unlike
    // fileRead(), is passed a processed result from the server as a second argument,
    // rather than the raw contents of the file.
    function fileReturnedFromServer(fileContainer, result) {
        //is this needed?
        $('#fileDropInfoSending').addClass('off');
        if (fileContainer.fileType == "xlsx") {
            this.clearDropZone();
        }
        var currentPath = window.location.pathname;
        var linesPathName = currentPath.slice(0, -8) + 'lines';
        //display success message
        $('#general').append('<div id="successLines" class="success" style="margin-bottom: 17px;">Successfully added ' + result['lines_created'] + ' lines! ' +
            'Redirecting you to <a style="vertical-align:top" href="/study/{{ study.slug }}/lines">Lines page</a></div>');
        //redirect to lines page
        setTimeout(function () {
            window.location.pathname = linesPathName;
        }, 3000);
    }
    StudyOverview.fileReturnedFromServer = fileReturnedFromServer;
    // Here, we take a look at the type of the dropped file and decide whether to
    // send it to the server, or process it locally.
    // We inform the FileDropZone of our decision by setting flags in the fileContiner object,
    // which will be inspected when this function returns.
    function fileDropped(fileContainer) {
        this.haveInputData = true;
        //processingFileCallback();
        var ft = fileContainer.fileType;
        // We'll signal the dropzone to upload this, and receive processed results.
        if (ft === 'xlsx') {
            fileContainer.skipProcessRaw = true;
            fileContainer.skipUpload = false;
        }
        // HPLC reports need to be sent for server-side processing
        if (!fileContainer.skipProcessRaw || !fileContainer.skipUpload) {
            this.showFileDropped(fileContainer);
        }
    }
    StudyOverview.fileDropped = fileDropped;
    // Reset and show the info box that appears when a file is dropped,
    // and reveal the text entry area.
    function showFileDropped(fileContainer) {
        var processingMessage = '';
        // Set the icon image properly
        $('#fileDropInfoIcon').removeClass('xml');
        $('#fileDropInfoIcon').removeClass('text');
        $('#fileDropInfoIcon').removeClass('excel');
        if (fileContainer.fileType === 'xml') {
            $('#fileDropInfoIcon').addClass('xml');
        }
        else if (fileContainer.fileType === 'xlsx') {
            $('#fileDropInfoIcon').addClass('excel');
        }
        else if (fileContainer.fileType === 'plaintext') {
            $('#fileDropInfoIcon').addClass('text');
        }
        $('#templateDropZone').addClass('off');
        $('#fileDropInfoArea').removeClass('off');
        $('#fileDropInfoSending').removeClass('off');
        $('#fileDropInfoName').text(fileContainer.file.name);
        if (!fileContainer.skipUpload) {
            processingMessage = 'Sending ' + Utl.JS.sizeToString(fileContainer.file.size) + ' To Server...';
            $('#fileDropInfoLog').empty();
        }
        else if (!fileContainer.skipProcessRaw) {
            processingMessage = 'Processing ' + Utl.JS.sizeToString(fileContainer.file.size) + '...';
            $('#fileDropInfoLog').empty();
        }
        $('#fileUploadMessage').text(processingMessage);
        this.activeDraggedFile = fileContainer;
    }
    StudyOverview.showFileDropped = showFileDropped;
    // This function is passed the usual fileContainer object, but also a reference to the
    // full content of the dropped file.
    function fileRead(fileContainer, result) {
        this.haveInputData = true;
    }
    StudyOverview.fileRead = fileRead;
    function preparePermissions() {
        var user, group;
        user = new EDDAuto.User({
            container: $('#permission_user_box')
        });
        group = new EDDAuto.Group({
            container: $('#permission_group_box')
        });
        $('form#permissions')
            .on('change', ':radio', function (ev) {
            var radio = $(ev.target);
            $('#permissions').find(':radio').each(function (i, r) {
                $(r).closest('span').find('.autocomp').prop('disabled', !$(r).prop('checked'));
            });
            if (radio.prop('checked')) {
                radio.closest('span').find('.autocomp:visible').focus();
            }
        })
            .on('submit', function (ev) {
            var perm = {}, klass, auto;
            auto = $('form#permissions').find('[name=class]:checked');
            klass = auto.val();
            perm.type = $('form#permissions').find('[name=type]').val();
            perm[klass.toLowerCase()] = { 'id': auto.closest('span').find('input:hidden').val() };
            $.ajax({
                'url': '/study/' + EDDData.currentStudyID + '/permissions/',
                'type': 'POST',
                'data': {
                    'data': JSON.stringify([perm]),
                    'csrfmiddlewaretoken': $('form#permissions').find('[name=csrfmiddlewaretoken]').val()
                },
                'success': function () {
                    console.log(['Set permission: ', JSON.stringify(perm)].join(''));
                    $('<div>').text('Set Permission').addClass('success')
                        .appendTo($('form#permissions')).delay(5000).fadeOut(2000);
                },
                'error': function (xhr, status, err) {
                    console.log(['Setting permission failed: ', status, ';', err].join(''));
                    $('<div>').text('Server Error: ' + err).addClass('bad')
                        .appendTo($('form#permissions')).delay(5000).fadeOut(2000);
                }
            });
            return false;
        })
            .find(':radio').trigger('change').end()
            .removeClass('off');
    }
    function onChangedMetabolicMap() {
        if (this.metabolicMapName) {
            // Update the UI to show the new filename for the metabolic map.
            $("#metabolicMapName").html(this.metabolicMapName);
        }
        else {
            $("#metabolicMapName").html('(none)');
        }
    }
    StudyOverview.onChangedMetabolicMap = onChangedMetabolicMap;
    // They want to select a different metabolic map.
    function onClickedMetabolicMapName() {
        var _this = this;
        var ui, callback = function (error, metabolicMapID, metabolicMapName, finalBiomass) {
            if (!error) {
                _this.metabolicMapID = metabolicMapID;
                _this.metabolicMapName = metabolicMapName;
                _this.biomassCalculation = finalBiomass;
                _this.onChangedMetabolicMap();
            }
            else {
                console.log("onClickedMetabolicMapName error: " + error);
            }
        };
        ui = new StudyMetabolicMapChooser(false, callback);
    }
    StudyOverview.onClickedMetabolicMapName = onClickedMetabolicMapName;
    // Base class for the non-autocomplete inline editing fields for the Study
    var EditableStudyElment = (function (_super) {
        __extends(EditableStudyElment, _super);
        function EditableStudyElment() {
            _super.apply(this, arguments);
        }
        EditableStudyElment.prototype.editAllowed = function () { return EDDData.currentStudyWritable; };
        EditableStudyElment.prototype.canCommit = function (value) { return EDDData.currentStudyWritable; };
        return EditableStudyElment;
    }(EDDEditable.EditableElement));
    StudyOverview.EditableStudyElment = EditableStudyElment;
    var EditableStudyName = (function (_super) {
        __extends(EditableStudyName, _super);
        function EditableStudyName() {
            _super.apply(this, arguments);
        }
        EditableStudyName.prototype.getValue = function () {
            return EDDData.Studies[EDDData.currentStudyID].name;
        };
        EditableStudyName.prototype.setValue = function (value) {
            EDDData.Studies[EDDData.currentStudyID].name = value;
        };
        return EditableStudyName;
    }(EditableStudyElment));
    StudyOverview.EditableStudyName = EditableStudyName;
    var EditableStudyDescription = (function (_super) {
        __extends(EditableStudyDescription, _super);
        function EditableStudyDescription(inputElement) {
            _super.call(this, inputElement);
            this.minimumRows = 4;
        }
        EditableStudyDescription.prototype.getValue = function () {
            return EDDData.Studies[EDDData.currentStudyID].description;
        };
        EditableStudyDescription.prototype.setValue = function (value) {
            EDDData.Studies[EDDData.currentStudyID].description = value;
        };
        EditableStudyDescription.prototype.blankLabel = function () {
            return '(click to add description)';
        };
        return EditableStudyDescription;
    }(EditableStudyElment));
    StudyOverview.EditableStudyDescription = EditableStudyDescription;
    var EditableStudyContact = (function (_super) {
        __extends(EditableStudyContact, _super);
        function EditableStudyContact() {
            _super.apply(this, arguments);
        }
        // Have to reproduce these here rather than using EditableStudyElment because the inheritance is different
        EditableStudyContact.prototype.editAllowed = function () { return EDDData.currentStudyWritable; };
        EditableStudyContact.prototype.canCommit = function (value) { return EDDData.currentStudyWritable; };
        EditableStudyContact.prototype.getValue = function () {
            return EDDData.Studies[EDDData.currentStudyID].contact;
        };
        EditableStudyContact.prototype.setValue = function (value) {
            EDDData.Studies[EDDData.currentStudyID].contact = value;
        };
        return EditableStudyContact;
    }(EDDEditable.EditableAutocomplete));
    StudyOverview.EditableStudyContact = EditableStudyContact;
})(StudyOverview || (StudyOverview = {}));
;
// use JQuery ready event shortcut to call prepareIt when page is ready
$(function () { return StudyOverview.prepareIt(); });
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiU3R1ZHktT3ZlcnZpZXcuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJTdHVkeS1PdmVydmlldy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxvREFBb0Q7QUFDcEQscURBQXFEO0FBQ3JELCtCQUErQjtBQUMvQixxQ0FBcUM7QUFDckMsb0NBQW9DOzs7Ozs7QUFJcEMsSUFBTyxhQUFhLENBaVJuQjtBQWpSRCxXQUFPLGFBQWEsRUFBQyxDQUFDO0lBQ2xCLFlBQVksQ0FBQztJQUViLElBQUksYUFBaUIsQ0FBQztJQUN0QixJQUFJLGVBQW1CLENBQUM7SUFDeEIsSUFBSSwwQkFBOEIsQ0FBQztJQUVuQyxJQUFJLGlCQUFzQixDQUFDO0lBRTNCLElBQUkscUJBQXNDLENBQUM7SUFVM0MsOEJBQThCO0lBQzlCO1FBRUksSUFBSSxDQUFDLGFBQWEsR0FBRyxJQUFJLENBQUM7UUFDMUIsSUFBSSxDQUFDLGVBQWUsR0FBRyxJQUFJLENBQUM7UUFDNUIsSUFBSSxDQUFDLDBCQUEwQixHQUFHLElBQUksQ0FBQztRQUV2QyxJQUFJLENBQUMsY0FBYyxHQUFHLENBQUMsQ0FBQyxDQUFDO1FBQ3pCLElBQUksQ0FBQyxnQkFBZ0IsR0FBRyxJQUFJLENBQUM7UUFDN0IsSUFBSSxDQUFDLGtCQUFrQixHQUFHLENBQUMsQ0FBQyxDQUFDO1FBRTdCLElBQUksaUJBQWlCLENBQUMsQ0FBQyxDQUFDLHNCQUFzQixDQUFDLENBQUMsR0FBRyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUMxRCxJQUFJLFdBQVcsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLENBQUMseUJBQXlCLENBQUMsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQzVFLElBQUksd0JBQXdCLENBQUMsQ0FBQyxDQUFDLDZCQUE2QixDQUFDLENBQUMsR0FBRyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUd4RSwwRkFBMEY7UUFDMUYsQ0FBQyxDQUFD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dUJBYWhDLENBQUE7QUFDTCxDQUFDLEVBalJNLGFBQWEsS0FBYixhQUFhLFFBaVJuQjtBQUFBLENBQUM7QUFHRix1RUFBdUU7QUFDdkUsQ0FBQyxDQUFDLGNBQU0sT0FBQSxhQUFhLENBQUMsU0FBUyxFQUFFLEVBQXpCLENBQXlCLENBQUMsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8vIEZpbGUgbGFzdCBtb2RpZmllZCBvbjogV2VkIERlYyAyMSAyMDE2IDE0OjUzOjM1ICBcbi8vLyA8cmVmZXJlbmNlIHBhdGg9XCJ0eXBlc2NyaXB0LWRlY2xhcmF0aW9ucy5kLnRzXCIgLz5cbi8vLyA8cmVmZXJlbmNlIHBhdGg9XCJVdGwudHNcIiAvPlxuLy8vIDxyZWZlcmVuY2UgcGF0aD1cIkRyYWdib3hlcy50c1wiIC8+XG4vLy8gPHJlZmVyZW5jZSBwYXRoPVwiRGF0YUdyaWQudHNcIiAvPlxuXG5kZWNsYXJlIHZhciBFREREYXRhOkVERERhdGE7XG5cbm1vZHVsZSBTdHVkeU92ZXJ2aWV3IHtcbiAgICAndXNlIHN0cmljdCc7XG5cbiAgICB2YXIgYXR0YWNobWVudElEczphbnk7XG4gICAgdmFyIGF0dGFjaG1lbnRzQnlJRDphbnk7XG4gICAgdmFyIHByZXZEZXNjcmlwdGlvbkVkaXRFbGVtZW50OmFueTtcblxuICAgIHZhciBhY3RpdmVEcmFnZ2VkRmlsZTogYW55O1xuXG4gICAgdmFyIGZpbGVVcGxvYWRQcm9ncmVzc0JhcjogVXRsLlByb2dyZXNzQmFyO1xuXG4gICAgLy8gV2UgY2FuIGhhdmUgYSB2YWxpZCBtZXRhYm9saWMgbWFwIGJ1dCBubyB2YWxpZCBiaW9tYXNzIGNhbGN1bGF0aW9uLlxuICAgIC8vIElmIHRoZXkgdHJ5IHRvIHNob3cgY2FyYm9uIGJhbGFuY2UgaW4gdGhhdCBjYXNlLCB3ZSdsbCBicmluZyB1cCB0aGUgVUkgdG8gXG4gICAgLy8gY2FsY3VsYXRlIGJpb21hc3MgZm9yIHRoZSBzcGVjaWZpZWQgbWV0YWJvbGljIG1hcC5cbiAgICBleHBvcnQgdmFyIG1ldGFib2xpY01hcElEOmFueTtcbiAgICBleHBvcnQgdmFyIG1ldGFib2xpY01hcE5hbWU6YW55O1xuICAgIGV4cG9ydCB2YXIgYmlvbWFzc0NhbGN1bGF0aW9uOm51bWJlcjtcblxuXG4gICAgLy8gQ2FsbGVkIHdoZW4gdGhlIHBhZ2UgbG9hZHMuXG4gICAgZXhwb3J0IGZ1bmN0aW9uIHByZXBhcmVJdCgpIHtcblxuICAgICAgICB0aGlzLmF0dGFjaG1lbnRJRHMgPSBudWxsO1xuICAgICAgICB0aGlzLmF0dGFjaG1lbnRzQnlJRCA9IG51bGw7XG4gICAgICAgIHRoaXMucHJldkRlc2NyaXB0aW9uRWRpdEVsZW1lbnQgPSBudWxsO1xuXG4gICAgICAgIHRoaXMubWV0YWJvbGljTWFwSUQgPSAtMTtcbiAgICAgICAgdGhpcy5tZXRhYm9saWNNYXBOYW1lID0gbnVsbDtcbiAgICAgICAgdGhpcy5iaW9tYXNzQ2FsY3VsYXRpb24gPSAtMTtcblxuICAgICAgICBuZXcgRWRpdGFibGVTdHVkeU5hbWUoJCgnI2VkaXRhYmxlLXN0dWR5LW5hbWUnKS5nZXQoKVswXSk7XG4gICAgICAgIG5ldyBFRERFZGl0YWJsZS5FZGl0YWJsZUF1dG9jb21wbGV0ZSgkKCcjZWRpdGFibGUtc3R1ZHktY29udGFjdCcpLmdldCgpWzBdKTtcbiAgICAgICAgbmV3IEVkaXRhYmxlU3R1ZHlEZXNjcmlwdGlvbigkKCcjZWRpdGFibGUtc3R1ZHktZGVzY3JpcHRpb24nKS5nZXQoKVswXSk7XG5cblxuICAgICAgICAvLyBwdXQgdGhlIGNsaWNrIGhhbmRsZXIgYXQgdGhlIGRvY3VtZW50IGxldmVsLCB0aGVuIGZpbHRlciB0byBhbnkgbGluayBpbnNpZGUgYSAuZGlzY2xvc2VcbiAgICAgICAgJChkb2N1bWVudCkub24oJ2NsaWNrJywgJy5kaXNjbG9zZSAuZGlzY2xvc2VMaW5rJywgKGUpID0+IHtcbiAgICAgICAgICAgICQoZS50YXJnZXQpLmNsb3Nlc3QoJy5kaXNjbG9zZScpLnRvZ2dsZUNsYXNzKCdkaXNjbG9zZUhpZGUnKTtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgdGhpcy5maWxlVXBsb2FkUHJvZ3Jlc3NCYXIgPSBuZXcgVXRsLlByb2dyZXNzQmFyKCdmaWxlVXBsb2FkUHJvZ3Jlc3NCYXInKTtcblxuICAgICAgICBVdGwuRmlsZURyb3Bab25lLmNyZWF0ZSh7XG4gICAgICAgICAgICBlbGVtZW50SWQ6IFwidGVtcGxhdGVEcm9wWm9uZVwiLFxuICAgICAgICAgICAgZmlsZUluaXRGbjogdGhpcy5maWxlRHJvcHBlZC5iaW5kKHRoaXMpLFxuICAgICAgICAgICAgcHJvY2Vzc1Jhd0ZuOiB0aGlzLmZpbGVSZWFkLmJpbmQodGhpcyksXG4gICAgICAgICAgICB1cmw6ICcvc3R1ZHkvJyArIEVERERhdGEuY3VycmVudFN0dWR5SUQgKyAnL3BhcnNldGVtcGxhdGUvJyxcbiAgICAgICAgICAgIHByb2Nlc3NSZXNwb25zZUZuOiB0aGlzLmZpbGVSZXR1cm5lZEZyb21TZXJ2ZXIuYmluZCh0aGlzKSxcbiAgICAgICAgICAgIHByb2dyZXNzQmFyOiB0aGlzLmZpbGVVcGxvYWRQcm9ncmVzc0JhclxuICAgICAgICB9KTtcblxuICAgICAgICBVdGwuVGFicy5wcmVwYXJlVGFicygpO1xuXG4gICAgICAgICQod2luZG93KS5vbignbG9hZCcsIHByZXBhcmVQZXJtaXNzaW9ucyk7XG4gICAgfVxuXG5cbiAgICAvLyBUaGlzIGlzIGNhbGxlZCB1cG9uIHJlY2VpdmluZyBhIHJlc3BvbnNlIGZyb20gYSBmaWxlIHVwbG9hZCBvcGVyYXRpb24sIGFuZCB1bmxpa2VcbiAgICAvLyBmaWxlUmVhZCgpLCBpcyBwYXNzZWQgYSBwcm9jZXNzZWQgcmVzdWx0IGZyb20gdGhlIHNlcnZlciBhcyBhIHNlY29uZCBhcmd1bWVudCxcbiAgICAvLyByYXRoZXIgdGhhbiB0aGUgcmF3IGNvbnRlbnRzIG9mIHRoZSBmaWxlLlxuICAgIGV4cG9ydCBmdW5jdGlvbiBmaWxlUmV0dXJuZWRGcm9tU2VydmVyKGZpbGVDb250YWluZXIsIHJlc3VsdCk6IHZvaWQge1xuICAgICAgICAvL2lzIHRoaXMgbmVlZGVkP1xuICAgICAgICAkKCcjZmlsZURyb3BJbmZvU2VuZGluZycpLmFkZENsYXNzKCdvZmYnKTtcblxuICAgICAgICBpZiAoZmlsZUNvbnRhaW5lci5maWxlVHlwZSA9PSBcInhsc3hcIikge1xuICAgICAgICAgICAgdGhpcy5jbGVhckRyb3Bab25lKCk7XG4gICAgICAgIH1cbiAgICAgICAgdmFyIGN1cnJlbnRQYXRoID0gd2luZG93LmxvY2F0aW9uLnBhdGhuYW1lO1xuICAgICAgICB2YXIgbGluZXNQYXRoTmFtZSA9IGN1cnJlbnRQYXRoLnNsaWNlKDAsIC04KSArICdsaW5lcyc7XG4gICAgICAgIC8vZGlzcGxheSBzdWNjZXNzIG1lc3NhZ2VcbiAgICAgICAgJCgnI2dlbmVyYWwnKS5hcHBlbmQoJzxkaXYgaWQ9XCJzdWNjZXNzTGluZXNcIiBjbGFzcz1cInN1Y2Nlc3NcIiBzdHlsZT1cIm1hcmdpbi1ib3R0b206IDE3cHg7XCI+U3VjY2Vzc2Z1bGx5IGFkZGVkICcgKyByZXN1bHRbJ2xpbmVzX2NyZWF0ZWQnXSArICcgbGluZXMhICcgK1xuICAgICAgICAgICAgJ1JlZGlyZWN0aW5nIHlvdSB0byA8YSBzdHlsZT1cInZlcnRpY2FsLWFsaWduOnRvcFwiIGhyZWY9XCIvc3R1ZHkve3sgc3R1ZHkuc2x1ZyB9fS9saW5lc1wiPkxpbmVzIHBhZ2U8L2E+PC9kaXY+Jyk7XG4gICAgICAgIC8vcmVkaXJlY3QgdG8gbGluZXMgcGFnZVxuICAgICAgICBzZXRUaW1lb3V0KGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHdpbmRvdy5sb2NhdGlvbi5wYXRobmFtZSA9IGxpbmVzUGF0aE5hbWU7XG4gICAgICAgIH0sIDMwMDApO1xuICAgIH1cblxuXG4gICAgLy8gSGVyZSwgd2UgdGFrZSBhIGxvb2sgYXQgdGhlIHR5cGUgb2YgdGhlIGRyb3BwZWQgZmlsZSBhbmQgZGVjaWRlIHdoZXRoZXIgdG9cbiAgICAvLyBzZW5kIGl0IHRvIHRoZSBzZXJ2ZXIsIG9yIHByb2Nlc3MgaXQgbG9jYWxseS5cbiAgICAvLyBXZSBpbmZvcm0gdGhlIEZpbGVEcm9wWm9uZSBvZiBvdXIgZGVjaXNpb24gYnkgc2V0dGluZyBmbGFncyBpbiB0aGUgZmlsZUNvbnRpbmVyIG9iamVjdCxcbiAgICAvLyB3aGljaCB3aWxsIGJlIGluc3BlY3RlZCB3aGVuIHRoaXMgZnVuY3Rpb24gcmV0dXJucy5cbiAgICBleHBvcnQgZnVuY3Rpb24gZmlsZURyb3BwZWQoZmlsZUNvbnRhaW5lcik6IHZvaWQge1xuICAgICAgICB0aGlzLmhhdmVJbnB1dERhdGEgPSB0cnVlO1xuICAgICAgICAvL3Byb2Nlc3NpbmdGaWxlQ2FsbGJhY2soKTtcbiAgICAgICAgdmFyIGZ0ID0gZmlsZUNvbnRhaW5lci5maWxlVHlwZTtcbiAgICAgICAgLy8gV2UnbGwgc2lnbmFsIHRoZSBkcm9wem9uZSB0byB1cGxvYWQgdGhpcywgYW5kIHJlY2VpdmUgcHJvY2Vzc2VkIHJlc3VsdHMuXG4gICAgICAgIGlmIChmdCA9PT0gJ3hsc3gnKSB7XG4gICAgICAgICAgICBmaWxlQ29udGFpbmVyLnNraXBQcm9jZXNzUmF3ID0gdHJ1ZTtcbiAgICAgICAgICAgIGZpbGVDb250YWluZXIuc2tpcFVwbG9hZCA9IGZhbHNlO1xuICAgICAgICB9XG4gICAgICAgIC8vIEhQTEMgcmVwb3J0cyBuZWVkIHRvIGJlIHNlbnQgZm9yIHNlcnZlci1zaWRlIHByb2Nlc3NpbmdcbiAgICAgICAgaWYgKCFmaWxlQ29udGFpbmVyLnNraXBQcm9jZXNzUmF3IHx8ICFmaWxlQ29udGFpbmVyLnNraXBVcGxvYWQpIHtcbiAgICAgICAgICAgIHRoaXMuc2hvd0ZpbGVEcm9wcGVkKGZpbGVDb250YWluZXIpO1xuICAgICAgICB9XG4gICAgfVxuXG5cbiAgICAvLyBSZXNldCBhbmQgc2hvdyB0aGUgaW5mbyBib3ggdGhhdCBhcHBlYXJzIHdoZW4gYSBmaWxlIGlzIGRyb3BwZWQsXG4gICAgLy8gYW5kIHJldmVhbCB0aGUgdGV4dCBlbnRyeSBhcmVhLlxuICAgIGV4cG9ydCBmdW5jdGlvbiBzaG93RmlsZURyb3BwZWQoZmlsZUNvbnRhaW5lcik6IHZvaWQge1xuICAgICAgICB2YXIgcHJvY2Vzc2luZ01lc3NhZ2U6c3RyaW5nID0gJyc7XG4gICAgICAgIC8vIFNldCB0aGUgaWNvbiBpbWFnZSBwcm9wZXJseVxuICAgICAgICAkKCcjZmlsZURyb3BJbmZvSWNvbicpLnJlbW92ZUNsYXNzKCd4bWwnKTtcbiAgICAgICAgJCgnI2ZpbGVEcm9wSW5mb0ljb24nKS5yZW1vdmVDbGFzcygndGV4dCcpO1xuICAgICAgICAkKCcjZmlsZURyb3BJbmZvSWNvbicpLnJlbW92ZUNsYXNzKCdleGNlbCcpO1xuICAgICAgICBpZiAoZmlsZUNvbnRhaW5lci5maWxlVHlwZSA9PT0gJ3htbCcpIHtcbiAgICAgICAgICAgICQoJyNmaWxlRHJvcEluZm9JY29uJykuYWRkQ2xhc3MoJ3htbCcpO1xuICAgICAgICB9IGVsc2UgaWYgKGZpbGVDb250YWluZXIuZmlsZVR5cGUgPT09ICd4bHN4Jykge1xuICAgICAgICAgICAgJCgnI2ZpbGVEcm9wSW5mb0ljb24nKS5hZGRDbGFzcygnZXhjZWwnKTtcbiAgICAgICAgfSBlbHNlIGlmIChmaWxlQ29udGFpbmVyLmZpbGVUeXBlID09PSAncGxhaW50ZXh0Jykge1xuICAgICAgICAgICAgJCgnI2ZpbGVEcm9wSW5mb0ljb24nKS5hZGRDbGFzcygndGV4dCcpO1xuICAgICAgICB9XG4gICAgICAgICQoJyN0ZW1wbGF0ZURyb3Bab25lJykuYWRkQ2xhc3MoJ29mZicpO1xuICAgICAgICAkKCcjZmlsZURyb3BJbmZvQXJlYScpLnJlbW92ZUNsYXNzKCdvZmYnKTtcbiAgICAgICAgJCgnI2ZpbGVEcm9wSW5mb1NlbmRpbmcnKS5yZW1vdmVDbGFzcygnb2ZmJyk7XG4gICAgICAgICQoJyNmaWxlRHJvcEluZm9OYW1lJykudGV4dChmaWxlQ29udGFpbmVyLmZpbGUubmFtZSlcblxuICAgICAgICBpZiAoIWZpbGVDb250YWluZXIuc2tpcFVwbG9hZCkge1xuICAgICAgICAgICAgcHJvY2Vzc2luZ01lc3NhZ2UgPSAnU2VuZGluZyAnICsgVXRsLkpTLnNpemVUb1N0cmluZyhmaWxlQ29udGFpbmVyLmZpbGUuc2l6ZSkgKyAnIFRvIFNlcnZlci4uLic7XG4gICAgICAgICAgICAkKCcjZmlsZURyb3BJbmZvTG9nJykuZW1wdHkoKTtcbiAgICAgICAgfSBlbHNlIGlmICghZmlsZUNvbnRhaW5lci5za2lwUHJvY2Vzc1Jhdykge1xuICAgICAgICAgICAgcHJvY2Vzc2luZ01lc3NhZ2UgPSAnUHJvY2Vzc2luZyAnICsgVXRsLkpTLnNpemVUb1N0cmluZyhmaWxlQ29udGFpbmVyLmZpbGUuc2l6ZSkgKyAnLi4uJztcbiAgICAgICAgICAgICQoJyNmaWxlRHJvcEluZm9Mb2cnKS5lbXB0eSgpO1xuICAgICAgICB9XG4gICAgICAgICQoJyNmaWxlVXBsb2FkTWVzc2FnZScpLnRleHQocHJvY2Vzc2luZ01lc3NhZ2UpO1xuICAgICAgICB0aGlzLmFjdGl2ZURyYWdnZWRGaWxlID0gZmlsZUNvbnRhaW5lcjtcbiAgICB9XG5cblxuICAgIC8vIFRoaXMgZnVuY3Rpb24gaXMgcGFzc2VkIHRoZSB1c3VhbCBmaWxlQ29udGFpbmVyIG9iamVjdCwgYnV0IGFsc28gYSByZWZlcmVuY2UgdG8gdGhlXG4gICAgLy8gZnVsbCBjb250ZW50IG9mIHRoZSBkcm9wcGVkIGZpbGUuXG4gICAgZXhwb3J0IGZ1bmN0aW9uIGZpbGVSZWFkKGZpbGVDb250YWluZXIsIHJlc3VsdCk6IHZvaWQge1xuICAgICAgICB0aGlzLmhhdmVJbnB1dERhdGEgPSB0cnVlO1xuICAgIH1cblxuXG4gICAgZnVuY3Rpb24gcHJlcGFyZVBlcm1pc3Npb25zKCkge1xuICAgICAgICB2YXIgdXNlcjogRUREQXV0by5Vc2VyLCBncm91cDogRUREQXV0by5Hcm91cDtcbiAgICAgICAgdXNlciA9IG5ldyBFRERBdXRvLlVzZXIoe1xuICAgICAgICAgICAgY29udGFpbmVyOiQoJyNwZXJtaXNzaW9uX3VzZXJfYm94JylcbiAgICAgICAgfSk7XG4gICAgICAgIGdyb3VwID0gbmV3IEVEREF1dG8uR3JvdXAoe1xuICAgICAgICAgICAgY29udGFpbmVyOiQoJyNwZXJtaXNzaW9uX2dyb3VwX2JveCcpXG4gICAgICAgIH0pO1xuXG4gICAgICAgICQoJ2Zvcm0jcGVybWlzc2lvbnMnKVxuICAgICAgICAgICAgLm9uKCdjaGFuZ2UnLCAnOnJhZGlvJywgKGV2OkpRdWVyeUlucHV0RXZlbnRPYmplY3QpOnZvaWQgPT4ge1xuICAgICAgICAgICAgICAgIHZhciByYWRpbzogSlF1ZXJ5ID0gJChldi50YXJnZXQpO1xuICAgICAgICAgICAgICAgICQoJyNwZXJtaXNzaW9ucycpLmZpbmQoJzpyYWRpbycpLmVhY2goKGk6IG51bWJlciwgcjogRWxlbWVudCk6IHZvaWQgPT4ge1xuICAgICAgICAgICAgICAgICAgICAkKHIpLmNsb3Nlc3QoJ3NwYW4nKS5maW5kKCcuYXV0b2NvbXAnKS5wcm9wKCdkaXNhYmxlZCcsICEkKHIpLnByb3AoJ2NoZWNrZWQnKSk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgaWYgKHJhZGlvLnByb3AoJ2NoZWNrZWQnKSkge1xuICAgICAgICAgICAgICAgICAgICByYWRpby5jbG9zZXN0KCdzcGFuJykuZmluZCgnLmF1dG9jb21wOnZpc2libGUnKS5mb2N1cygpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAub24oJ3N1Ym1pdCcsIChldjpKUXVlcnlFdmVudE9iamVjdCk6IGJvb2xlYW4gPT4ge1xuICAgICAgICAgICAgICAgIHZhciBwZXJtOiBhbnkgPSB7fSwga2xhc3M6IHN0cmluZywgYXV0bzogSlF1ZXJ5O1xuICAgICAgICAgICAgICAgIGF1dG8gPSAkKCdmb3JtI3Blcm1pc3Npb25zJykuZmluZCgnW25hbWU9Y2xhc3NdOmNoZWNrZWQnKTtcbiAgICAgICAgICAgICAgICBrbGFzcyA9IGF1dG8udmFsKCk7XG4gICAgICAgICAgICAgICAgcGVybS50eXBlID0gJCgnZm9ybSNwZXJtaXNzaW9ucycpLmZpbmQoJ1tuYW1lPXR5cGVdJykudmFsKCk7XG4gICAgICAgICAgICAgICAgcGVybVtrbGFzcy50b0xvd2VyQ2FzZSgpXSA9IHsgJ2lkJzogYXV0by5jbG9zZXN0KCdzcGFuJykuZmluZCgnaW5wdXQ6aGlkZGVuJykudmFsKCkgfTtcbiAgICAgICAgICAgICAgICAkLmFqYXgoe1xuICAgICAgICAgICAgICAgICAgICAndXJsJzogJy9zdHVkeS8nICsgRURERGF0YS5jdXJyZW50U3R1ZHlJRCArICcvcGVybWlzc2lvbnMvJyxcbiAgICAgICAgICAgICAgICAgICAgJ3R5cGUnOiAnUE9TVCcsXG4gICAgICAgICAgICAgICAgICAgICdkYXRhJzoge1xuICAgICAgICAgICAgICAgICAgICAgICAgJ2RhdGEnOiBKU09OLnN0cmluZ2lmeShbcGVybV0pLFxuICAgICAgICAgICAgICAgICAgICAgICAgJ2NzcmZtaWRkbGV3YXJldG9rZW4nOiAkKCdmb3JtI3Blcm1pc3Npb25zJykuZmluZCgnW25hbWU9Y3NyZm1pZGRsZXdhcmV0b2tlbl0nKS52YWwoKVxuICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICAnc3VjY2Vzcyc6ICgpOiB2b2lkID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKFsnU2V0IHBlcm1pc3Npb246ICcsIEpTT04uc3RyaW5naWZ5KHBlcm0pXS5qb2luKCcnKSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAkKCc8ZGl2PicpLnRleHQoJ1NldCBQZXJtaXNzaW9uJykuYWRkQ2xhc3MoJ3N1Y2Nlc3MnKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC5hcHBlbmRUbygkKCdmb3JtI3Blcm1pc3Npb25zJykpLmRlbGF5KDUwMDApLmZhZGVPdXQoMjAwMCk7XG4gICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgICdlcnJvcic6ICh4aHIsIHN0YXR1cywgZXJyKTogdm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhbJ1NldHRpbmcgcGVybWlzc2lvbiBmYWlsZWQ6ICcsIHN0YXR1cywgJzsnLCBlcnJdLmpvaW4oJycpKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICQoJzxkaXY+JykudGV4dCgnU2VydmVyIEVycm9yOiAnICsgZXJyKS5hZGRDbGFzcygnYmFkJylcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAuYXBwZW5kVG8oJCgnZm9ybSNwZXJtaXNzaW9ucycpKS5kZWxheSg1MDAwKS5mYWRlT3V0KDIwMDApO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIC5maW5kKCc6cmFkaW8nKS50cmlnZ2VyKCdjaGFuZ2UnKS5lbmQoKVxuICAgICAgICAgICAgLnJlbW92ZUNsYXNzKCdvZmYnKTtcbiAgICB9XG5cblxuICAgIGV4cG9ydCBmdW5jdGlvbiBvbkNoYW5nZWRNZXRhYm9saWNNYXAoKSB7XG4gICAgICAgIGlmICh0aGlzLm1ldGFib2xpY01hcE5hbWUpIHtcbiAgICAgICAgICAgIC8vIFVwZGF0ZSB0aGUgVUkgdG8gc2hvdyB0aGUgbmV3IGZpbGVuYW1lIGZvciB0aGUgbWV0YWJvbGljIG1hcC5cbiAgICAgICAgICAgICQoXCIjbWV0YWJvbGljTWFwTmFtZVwiKS5odG1sKHRoaXMubWV0YWJvbGljTWFwTmFtZSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAkKFwiI21ldGFib2xpY01hcE5hbWVcIikuaHRtbCgnKG5vbmUpJyk7XG4gICAgICAgIH1cbiAgICB9XG5cblxuICAgIC8vIFRoZXkgd2FudCB0byBzZWxlY3QgYSBkaWZmZXJlbnQgbWV0YWJvbGljIG1hcC5cbiAgICBleHBvcnQgZnVuY3Rpb24gb25DbGlja2VkTWV0YWJvbGljTWFwTmFtZSgpOnZvaWQge1xuICAgICAgICB2YXIgdWk6U3R1ZHlNZXRhYm9saWNNYXBDaG9vc2VyLFxuICAgICAgICAgICAgY2FsbGJhY2s6TWV0YWJvbGljTWFwQ2hvb3NlclJlc3VsdCA9IChlcnJvcjpzdHJpbmcsXG4gICAgICAgICAgICAgICAgbWV0YWJvbGljTWFwSUQ/Om51bWJlcixcbiAgICAgICAgICAgICAgICBtZXRhYm9saWNNYXBOYW1lPzpzdHJpbmcsXG4gICAgICAgICAgICAgICAgZmluYWxCaW9tYXNzPzpudW1iZXIpOnZvaWQgPT4ge1xuICAgICAgICAgICAgaWYgKCFlcnJvcikge1xuICAgICAgICAgICAgICAgIHRoaXMubWV0YWJvbGljTWFwSUQgPSBtZXRhYm9saWNNYXBJRDtcbiAgICAgICAgICAgICAgICB0aGlzLm1ldGFib2xpY01hcE5hbWUgPSBtZXRhYm9saWNNYXBOYW1lO1xuICAgICAgICAgICAgICAgIHRoaXMuYmlvbWFzc0NhbGN1bGF0aW9uID0gZmluYWxCaW9tYXNzO1xuICAgICAgICAgICAgICAgIHRoaXMub25DaGFuZ2VkTWV0YWJvbGljTWFwKCk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKFwib25DbGlja2VkTWV0YWJvbGljTWFwTmFtZSBlcnJvcjogXCIgKyBlcnJvcik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgICAgIHVpID0gbmV3IFN0dWR5TWV0YWJvbGljTWFwQ2hvb3NlcihmYWxzZSwgY2FsbGJhY2spO1xuICAgIH1cblxuXG4gICAgLy8gQmFzZSBjbGFzcyBmb3IgdGhlIG5vbi1hdXRvY29tcGxldGUgaW5saW5lIGVkaXRpbmcgZmllbGRzIGZvciB0aGUgU3R1ZHlcbiAgICBleHBvcnQgY2xhc3MgRWRpdGFibGVTdHVkeUVsbWVudCBleHRlbmRzIEVEREVkaXRhYmxlLkVkaXRhYmxlRWxlbWVudCB7XG5cbiAgICAgICAgZWRpdEFsbG93ZWQoKTogYm9vbGVhbiB7IHJldHVybiBFREREYXRhLmN1cnJlbnRTdHVkeVdyaXRhYmxlOyB9XG4gICAgICAgIGNhbkNvbW1pdCh2YWx1ZSk6IGJvb2xlYW4geyByZXR1cm4gRURERGF0YS5jdXJyZW50U3R1ZHlXcml0YWJsZTsgfVxuICAgIH1cblxuXG4gICAgZXhwb3J0IGNsYXNzIEVkaXRhYmxlU3R1ZHlOYW1lIGV4dGVuZHMgRWRpdGFibGVTdHVkeUVsbWVudCB7XG4gICAgICAgIGdldFZhbHVlKCk6c3RyaW5nIHtcbiAgICAgICAgICAgIHJldHVybiBFREREYXRhLlN0dWRpZXNbRURERGF0YS5jdXJyZW50U3R1ZHlJRF0ubmFtZTtcbiAgICAgICAgfVxuXG4gICAgICAgIHNldFZhbHVlKHZhbHVlKSB7XG4gICAgICAgICAgICBFREREYXRhLlN0dWRpZXNbRURERGF0YS5jdXJyZW50U3R1ZHlJRF0ubmFtZSA9IHZhbHVlO1xuICAgICAgICB9XG4gICAgfVxuXG5cbiAgICBleHBvcnQgY2xhc3MgRWRpdGFibGVTdHVkeURlc2NyaXB0aW9uIGV4dGVuZHMgRWRpdGFibGVTdHVkeUVsbWVudCB7XG5cbiAgICAgICAgY29uc3RydWN0b3IoaW5wdXRFbGVtZW50OiBIVE1MRWxlbWVudCkgeyAgICAgICAgXG4gICAgICAgICAgICBzdXBlcihpbnB1dEVsZW1lbnQpO1xuICAgICAgICAgICAgdGhpcy5taW5pbXVtUm93cyA9IDQ7XG4gICAgICAgIH1cblxuICAgICAgICBnZXRWYWx1ZSgpOnN0cmluZyB7XG4gICAgICAgICAgICByZXR1cm4gRURERGF0YS5TdHVkaWVzW0VERERhdGEuY3VycmVudFN0dWR5SURdLmRlc2NyaXB0aW9uO1xuICAgICAgICB9XG5cbiAgICAgICAgc2V0VmFsdWUodmFsdWUpIHtcbiAgICAgICAgICAgIEVERERhdGEuU3R1ZGllc1tFREREYXRhLmN1cnJlbnRTdHVkeUlEXS5kZXNjcmlwdGlvbiA9IHZhbHVlO1xuICAgICAgICB9XG5cbiAgICAgICAgYmxhbmtMYWJlbCgpOiBzdHJpbmcge1xuICAgICAgICAgICAgcmV0dXJuICcoY2xpY2sgdG8gYWRkIGRlc2NyaXB0aW9uKSc7XG4gICAgICAgIH1cbiAgICB9XG5cblxuICAgIGV4cG9ydCBjbGFzcyBFZGl0YWJsZVN0dWR5Q29udGFjdCBleHRlbmRzIEVEREVkaXRhYmxlLkVkaXRhYmxlQXV0b2NvbXBsZXRlIHtcblxuICAgICAgICAvLyBIYXZlIHRvIHJlcHJvZHVjZSB0aGVzZSBoZXJlIHJhdGhlciB0aGFuIHVzaW5nIEVkaXRhYmxlU3R1ZHlFbG1lbnQgYmVjYXVzZSB0aGUgaW5oZXJpdGFuY2UgaXMgZGlmZmVyZW50XG4gICAgICAgIGVkaXRBbGxvd2VkKCk6IGJvb2xlYW4geyByZXR1cm4gRURERGF0YS5jdXJyZW50U3R1ZHlXcml0YWJsZTsgfVxuICAgICAgICBjYW5Db21taXQodmFsdWUpOiBib29sZWFuIHsgcmV0dXJuIEVERERhdGEuY3VycmVudFN0dWR5V3JpdGFibGU7IH1cblxuICAgICAgICBnZXRWYWx1ZSgpOnN0cmluZyB7XG4gICAgICAgICAgICByZXR1cm4gRURERGF0YS5TdHVkaWVzW0VERERhdGEuY3VycmVudFN0dWR5SURdLmNvbnRhY3Q7XG4gICAgICAgIH1cblxuICAgICAgICBzZXRWYWx1ZSh2YWx1ZSkge1xuICAgICAgICAgICAgRURERGF0YS5TdHVkaWVzW0VERERhdGEuY3VycmVudFN0dWR5SURdLmNvbnRhY3QgPSB2YWx1ZTtcbiAgICAgICAgfVxuICAgIH1cbn07XG5cblxuLy8gdXNlIEpRdWVyeSByZWFkeSBldmVudCBzaG9ydGN1dCB0byBjYWxsIHByZXBhcmVJdCB3aGVuIHBhZ2UgaXMgcmVhZHlcbiQoKCkgPT4gU3R1ZHlPdmVydmlldy5wcmVwYXJlSXQoKSk7XG4iXX0=