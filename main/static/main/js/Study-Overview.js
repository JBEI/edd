/// <reference path="typescript-declarations.d.ts" />
/// <reference path="BiomassCalculationUI.ts" />
/// <reference path="Dragboxes.ts" />
/// <reference path="DataGrid.ts" />
/// <reference path="EDDAutocomplete.ts" />
/// <reference path="EDDEditableElement.ts" />
/// <reference path="Study.ts" />
/// <reference path="Utl.ts" />
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
    var actionPanelIsCopied = false;
    var fileUploadProgressBar;
    // This is called upon receiving a response from a file upload operation, and unlike
    // fileRead(), is passed a processed result from the server as a second argument,
    // rather than the raw contents of the file.
    function fileReturnedFromServer(fileContainer, result) {
        var currentPath = window.location.pathname;
        var linesPathName = currentPath.slice(0, currentPath.lastIndexOf('overview')) + 'experiment-description';
        $('<p>', {
            text: 'Success! ' + result['lines_created'] + ' lines added!',
            style: 'margin:auto'
        }).appendTo('#linesAdded');
        successfulRedirect(linesPathName);
    }
    StudyOverview.fileReturnedFromServer = fileReturnedFromServer;
    function fileWarningReturnedFromServer(fileContainer, result) {
        var currentPath = window.location.pathname;
        var newWarningAlert = $('.alert-warning').eq(0).clone();
        copyActionButtons();
        $('#acceptWarnings').find('.acceptWarnings').on('click', function (ev) {
            ev.preventDefault();
            ev.stopPropagation();
            window.location.reload();
            return false;
        });
        $('<p>', {
            text: 'Success! ' + result['lines_created'] + ' lines added!',
            style: 'margin:auto'
        }).appendTo('#linesAdded');
        //display success message
        $('#linesAdded').show();
        generateMessages('warnings', result.warnings, newWarningAlert);
        generateAcceptWarning();
    }
    StudyOverview.fileWarningReturnedFromServer = fileWarningReturnedFromServer;
    function successfulRedirect(linesPathName) {
        //redirect to lines page
        setTimeout(function () {
            window.location.pathname = linesPathName;
        }, 1000);
    }
    function copyActionButtons() {
        var original, copy, originalDismiss, copyDismiss, originalAcceptWarnings, copyAcceptWarnings;
        if (!actionPanelIsCopied) {
            original = $('#actionWarningBar');
            copy = original.clone().appendTo('#bottomBar').hide();
            // forward click events on copy to the original button
            copy.on('click', 'button', function (e) {
                original.find('#' + e.target.id).trigger(e);
            });
            originalDismiss = $('#dismissAll').find('.dismissAll');
            copyDismiss = originalDismiss.clone().appendTo('#bottomBar').hide();
            // forward click events on copy to the original button
            copyDismiss.on('click', 'button', function (e) {
                originalDismiss.trigger(e);
            });
            originalAcceptWarnings = $('#acceptWarnings').find('.acceptWarnings');
            copyAcceptWarnings = originalAcceptWarnings.clone().appendTo('#bottomBar').hide();
            // forward click events on copy to the original button
            copyAcceptWarnings.on('click', 'button', function (e) {
                originalAcceptWarnings.trigger(e);
            });
            actionPanelIsCopied = true;
        }
    }
    StudyOverview.copyActionButtons = copyActionButtons;
    // This is called upon receiving an errror in a file upload operation, and
    // is passed an unprocessed result from the server as a second argument.
    function fileErrorReturnedFromServer(fileContainer, xhr, url) {
        copyActionButtons();
        var parent = $('#alert_placeholder'), dismissAll = $('#dismissAll').find('.dismissAll'), linesPathName, currentPath;
        currentPath = window.location.pathname;
        linesPathName = currentPath.slice(0, currentPath.lastIndexOf('overview')) + 'experiment-description';
        // reset the drop zone here
        //parse xhr.response
        var obj, error, id;
        try {
            if (xhr.status === 504) {
                generate504Error();
            }
            obj = JSON.parse(xhr.response);
            var newWarningAlert = $('.alert-warning').eq(0).clone();
            var newErrorAlert = $('.alert-danger').eq(0).clone();
            if (obj.errors) {
                generateMessages('error', obj.errors, newErrorAlert);
            }
            if (obj.warnings) {
                generateMessages('error', obj.warnings, newWarningAlert);
            }
        }
        catch (e) {
            //if there is no backend error message or error (html response), show this
            var defaultError = {
                category: "",
                summary: "There was an error",
                details: "EDD administrators have been notified. Please try again later."
            };
            alertError(defaultError);
        }
        //if there is more than one alert and no dismiss all alert button, add a dismiss all alerts button
        if ($('.alert').length > 8 && !dismissAll.is(":visible")) {
            dismissAll.show();
        }
        //set up click handler events
        parent.find('.omitStrains').on('click', function (ev) {
            ev.preventDefault();
            ev.stopPropagation();
            var f = fileContainer.file;
            f.sendTo(currentPath.split('overview')[0] + 'describe/?IGNORE_ICE_RELATED_ERRORS=true');
            $('#iceError').hide();
            return false;
        });
        parent.find('.allowDuplicates').on('click', function (ev) {
            ev.preventDefault();
            ev.stopPropagation();
            var f = fileContainer.file;
            f.sendTo(currentPath.split('overview')[0] + 'describe/?ALLOW_DUPLICATE_NAMES=true');
            $('#duplicateError').hide();
            return false;
        });
        $('.noDuplicates, .noOmitStrains').on('click', function (ev) {
            ev.preventDefault();
            ev.stopPropagation();
            window.location.reload();
            return false;
        });
        //dismiss all alerts
        dismissAll.on('click', function (ev) {
            ev.preventDefault();
            ev.stopPropagation();
            parent.find('.close').click();
            window.location.reload();
            return false;
        });
        $('#acceptWarnings').find('.acceptWarnings').on('click', function (ev) {
            ev.preventDefault();
            ev.stopPropagation();
            successfulRedirect(linesPathName);
            return false;
        });
    }
    StudyOverview.fileErrorReturnedFromServer = fileErrorReturnedFromServer;
    function generateMessages(type, response, div) {
        var responseMessages = organizeMessages(response);
        for (var key in responseMessages) {
            alertMessage(key, responseMessages[key], div, type);
        }
    }
    function generateAcceptWarning() {
        var warningAlerts, acceptWarningButton, acceptWarningDiv;
        warningAlerts = $('.alert-warning:visible');
        acceptWarningDiv = $('#acceptWarnings').find('.acceptWarnings');
        if (warningAlerts.length === 1) {
            $(warningAlerts).append(acceptWarningDiv);
        }
        else {
            $('#alert_placeholder').prepend(acceptWarningDiv);
        }
        acceptWarningDiv.show();
    }
    function organizeMessages(responses) {
        var obj = {};
        responses.forEach(function (response) {
            if (response.category === "ICE-related Error") {
                // create dismissible error alert
                alertIceWarning(response);
            }
            else if (response.summary === "Duplicate assay names in the input" || response.summary === "Duplicate " +
                "line names in the input") {
                if ($('#duplicateError').length === 1) {
                    alertDuplicateError(response);
                }
            }
            else {
                var message = response.summary + ": " + response.details;
                if (obj.hasOwnProperty(response.category)) {
                    obj[response.category].push(message);
                }
                else {
                    obj[response.category] = [message];
                }
            }
        });
        return obj;
    }
    function generate504Error() {
        var response = {
            category: "",
            summary: "EDD timed out",
            details: "Please reload page and reupload file or try again later"
        };
        alertError(response);
    }
    function alertIceWarning(response) {
        var iceError = $('#iceError');
        response.category = "Warning! " + response.category;
        createAlertMessage(iceError, response);
    }
    function alertDuplicateError(response) {
        var duplicateElem = $('#duplicateError');
        createAlertMessage(duplicateElem, response);
    }
    function alertError(response) {
        var newErrorAlert = $('.alert-danger').eq(0).clone();
        createAlertMessage(newErrorAlert, response);
        clearDropZone();
    }
    function createAlertMessage(alertClone, response) {
        $(alertClone).children('h4').text(response.category);
        $(alertClone).children('p').text(response.summary + ": " + response.details);
        $('#alert_placeholder').append(alertClone);
        $(alertClone).show();
    }
    function alertMessage(subject, messages, newAlert, type) {
        if (type === "warnings") {
            $(newAlert).children('h4').text("Warning! " + subject);
        }
        else {
            $(newAlert).children('h4').text("Error! " + subject);
            clearDropZone();
        }
        messages.forEach(function (m) {
            var summary = $('<p>', {
                text: m,
                class: 'alertWarning',
            });
            $(newAlert).append(summary);
        });
        $('#alert_placeholder').append(newAlert);
        $(newAlert).show();
    }
    function clearDropZone() {
        $('#templateDropZone').removeClass('off');
        $('#fileDropInfoIcon').addClass('off');
        $('#fileDropInfoName').addClass('off');
        $('#fileDropInfoSending').addClass('off');
    }
    // Here, we take a look at the type of the dropped file and decide whether to
    // send it to the server, or process it locally.
    // We inform the FileDropZone of our decision by setting flags in the fileContainer object,
    // which will be inspected when this function returns.
    function fileDropped(fileContainer, iceError) {
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
            this.showFileDropped(fileContainer, iceError);
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
        //check public permission input on click
        $('#set_everyone_permission').on('click', function () {
            $('#permission_public').prop('checked', true);
        });
        $('#set_group_permission').on('click', function () {
            $('#permission_group').prop('checked', true);
        });
        $('#set_user_permission').on('click', function () {
            $('#permission_user').prop('checked', true);
        });
        $('form#permissions')
            .on('submit', function (ev) {
            var perm = {}, klass, auto;
            auto = $('form#permissions').find('[name=class]:checked');
            klass = auto.val();
            perm.type = $(auto).siblings('select').val();
            perm[klass.toLowerCase()] = { 'id': $(auto).siblings('input:hidden').val() };
            $.ajax({
                'url': '/study/' + EDDData.currentStudyID + '/permissions/',
                'type': 'POST',
                'data': {
                    'data': JSON.stringify([perm]),
                    'csrfmiddlewaretoken': $('form#permissions').find('[name=csrfmiddlewaretoken]').val()
                },
                'success': function () {
                    var permissionTarget;
                    console.log(['Set permission: ', JSON.stringify(perm)].join(''));
                    //reset permission options
                    $('form#permissions').find('.autocomp_search').siblings('select').val('N');
                    //reset input
                    $('form#permissions').find('.autocomp_search').val('');
                    $('<div>').text('Permission Updated').addClass('success')
                        .appendTo($('form#permissions')).delay(2000).fadeOut(2000);
                },
                'error': function (xhr, status, err) {
                    console.log(['Setting permission failed: ', status, ';', err].join(''));
                    //reset permission options
                    $('form#permissions').find('.autocomp_search').siblings('select').val('N');
                    //reset input
                    $('form#permissions').find('.autocomp_search').val('');
                    $('<div>').text('Server Error: ' + err).addClass('bad')
                        .appendTo($('form#permissions')).delay(5000).fadeOut(2000);
                }
            });
            return false;
        })
            .find(':radio').trigger('change').end()
            .removeClass('off');
        //set style on inputs for permissions
        $('#permission_user_box').find('input').insertBefore('#user_permission_options').addClass('permissionUser');
        $('#permission_group_box').find('input').insertBefore('#group_permission_options').addClass('permissionGroup');
        $('#permission_public_box').addClass('permissionGroup');
        // Set up the Add Measurement to Assay modal
        $("#permissionsSection").dialog({
            minWidth: 500,
            autoOpen: false
        });
        $("#addPermission").click(function () {
            $("#permissionsSection").removeClass('off').dialog("open");
            return false;
        });
        //TODO: remove this and fix bug
        $("#attachmentsSection a:contains('Delete')").hide();
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
    var EditableStudyDescription = (function (_super) {
        __extends(EditableStudyDescription, _super);
        function EditableStudyDescription(inputElement, style) {
            _super.call(this, inputElement, style);
            this.minimumRows = 4;
            this.formURL('/study/' + EDDData.currentStudyID + '/setdescription/');
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
    }(StudyBase.EditableStudyElement));
    StudyOverview.EditableStudyDescription = EditableStudyDescription;
    var EditableStudyContact = (function (_super) {
        __extends(EditableStudyContact, _super);
        function EditableStudyContact(inputElement, style) {
            _super.call(this, inputElement, style);
            this.formURL('/study/' + EDDData.currentStudyID + '/setcontact/');
        }
        // Have to reproduce these here rather than using EditableStudyElement because the inheritance is different
        EditableStudyContact.prototype.editAllowed = function () {
            return EDDData.currentStudyWritable;
        };
        EditableStudyContact.prototype.canCommit = function (value) {
            return EDDData.currentStudyWritable;
        };
        EditableStudyContact.prototype.getValue = function () {
            return EDDData.Studies[EDDData.currentStudyID].contact;
        };
        EditableStudyContact.prototype.setValue = function (value) {
            EDDData.Studies[EDDData.currentStudyID].contact = value;
        };
        return EditableStudyContact;
    }(EDDEditable.EditableAutocomplete));
    StudyOverview.EditableStudyContact = EditableStudyContact;
    // Called when the page loads.
    function prepareIt() {
        this.attachmentIDs = null;
        this.attachmentsByID = null;
        this.prevDescriptionEditElement = null;
        this.metabolicMapID = -1;
        this.metabolicMapName = null;
        this.biomassCalculation = -1;
        new EditableStudyContact($('#editable-study-contact').get()[0]);
        new EditableStudyDescription($('#editable-study-description').get()[0]);
        // put the click handler at the document level, then filter to any link inside a .disclose
        $(document).on('click', '.disclose .discloseLink', function (e) {
            $(e.target).closest('.disclose').toggleClass('discloseHide');
            return false;
        });
        $('#helpExperimentDescription').tooltip({
            content: function () {
                return $(this).prop('title');
            },
            position: { my: "left-10 center", at: "right center" },
            show: null,
            close: function (event, ui) {
                ui.tooltip.hover(function () {
                    $(this).stop(true).fadeTo(400, 1);
                }, function () {
                    $(this).fadeOut("400", function () {
                        $(this).remove();
                    });
                });
            }
        });
        this.fileUploadProgressBar = new Utl.ProgressBar('fileUploadProgressBar');
        Utl.FileDropZone.create({
            elementId: "templateDropZone",
            fileInitFn: this.fileDropped.bind(this),
            processRawFn: this.fileRead.bind(this),
            url: '/study/' + EDDData.currentStudyID + '/describe/',
            processResponseFn: this.fileReturnedFromServer.bind(this),
            processErrorFn: this.fileErrorReturnedFromServer.bind(this),
            processWarningFn: this.fileWarningReturnedFromServer.bind(this),
            progressBar: this.fileUploadProgressBar
        });
        Utl.Tabs.prepareTabs();
        $(window).on('load', preparePermissions);
    }
    StudyOverview.prepareIt = prepareIt;
})(StudyOverview || (StudyOverview = {}));
// use JQuery ready event shortcut to call prepareIt when page is ready
$(function () { return StudyOverview.prepareIt(); });
