/// <reference path="typescript-declarations.d.ts" />
/// <reference path="BiomassCalculationUI.ts" />
/// <reference path="Dragboxes.ts" />
/// <reference path="DataGrid.ts" />
/// <reference path="EDDAutocomplete.ts" />
/// <reference path="EDDEditableElement.ts" />
/// <reference path="Study.ts" />
/// <reference path="Utl.ts" />

declare var EDDData:EDDData;


module StudyOverview {
    'use strict';

    var attachmentIDs: any;
    var attachmentsByID: any;
    var prevDescriptionEditElement: any;

    var activeDraggedFile: any;
    var actionPanelIsCopied = false;

    var fileUploadProgressBar: Utl.ProgressBar;

    // We can have a valid metabolic map but no valid biomass calculation.
    // If they try to show carbon balance in that case, we'll bring up the UI to
    // calculate biomass for the specified metabolic map.
    export var metabolicMapID: any;
    export var metabolicMapName: any;
    export var biomassCalculation: number;

    // This is called upon receiving a response from a file upload operation, and unlike
    // fileRead(), is passed a processed result from the server as a second argument,
    // rather than the raw contents of the file.
    export function fileReturnedFromServer(fileContainer, result): void {

        let currentPath = window.location.pathname;
        let linesPathName = currentPath.slice(0, currentPath.lastIndexOf('overview')) + 'experiment-description';
        $('<p>', {
            text: 'Success! ' + result['lines_created'] + ' lines added!',
            style: 'margin:auto'
        }).appendTo('#linesAdded');

        $('#linesAdded').show();
        
        successfulRedirect(linesPathName)
    }

    export function fileWarningReturnedFromServer(fileContainer, result): void {
        let currentPath = window.location.pathname;
        let newWarningAlert = $('.alert-warning').eq(0).clone();
        let linesPathName = currentPath.slice(0, currentPath.lastIndexOf('overview')) + 'experiment-description';

        copyActionButtons();

        $('#acceptWarnings').find('.acceptWarnings').on('click',(ev:JQueryMouseEventObject):boolean => {
            ev.preventDefault();
            ev.stopPropagation();
            successfulRedirect(linesPathName);
            return false;
        });

        $('<p>', {
            text: 'Success! ' + result['lines_created'] + ' lines added!',
            style: 'margin:auto'
        }).appendTo('#linesAdded');
        //display success message
        $('#linesAdded').show();
        generateMessages('warnings', result.warnings);
        generateAcceptWarning();
    }

    function successfulRedirect(linesPathName): void {
        //redirect to lines page
        setTimeout(function () {
            window.location.pathname = linesPathName;
        }, 1000);
    }


    export function copyActionButtons() {
        let original:JQuery, copy:JQuery, originalDismiss:JQuery, copyDismiss:JQuery,
            originalAcceptWarnings: JQuery, copyAcceptWarnings: JQuery;
        if (!actionPanelIsCopied) {
            original = $('#actionWarningBar');
            copy = original.clone().appendTo('#bottomBar').hide();
            // forward click events on copy to the original button
            copy.on('click', 'button', (e) => {
                original.find('#' + e.target.id).trigger(e);
            });
            originalDismiss = $('#dismissAll').find('.dismissAll');
            copyDismiss = originalDismiss.clone().appendTo('#bottomBar').hide();
            // forward click events on copy to the original button
            copyDismiss.on('click', 'button', (e) => {
                originalDismiss.trigger(e);
            });
            originalAcceptWarnings = $('#acceptWarnings').find('.acceptWarnings');
            copyAcceptWarnings = originalAcceptWarnings.clone().appendTo('#bottomBar').hide();
            // forward click events on copy to the original button
            copyAcceptWarnings.on('click', 'button', (e) => {
                originalAcceptWarnings.trigger(e);
            });
            actionPanelIsCopied = true;
        }
    }

    // This is called upon receiving an errror in a file upload operation, and
    // is passed an unprocessed result from the server as a second argument.
    export function fileErrorReturnedFromServer(fileContainer, xhr): void {

        copyActionButtons();

        let parent: JQuery = $('#alert_placeholder'), dismissAll: JQuery = $('#dismissAll').find('.dismissAll'),
            linesPathName: string, currentPath: string;
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
            if (obj.errors) {
                generateMessages('error', obj.errors)
            }
            if (obj.warnings) {
                generateMessages('warnings', obj.warnings)
            }
        } catch (e) {
            //if there is no backend error message or error (html response), show this
            let defaultError = {
                category: "",
                summary: "There was an error",
                details: "EDD administrators have been notified. Please try again later."
            };
            alertError(defaultError);
        }
        //add a dismiss all alerts button
        if ($('.alert').length > 8 && !dismissAll.is(":visible")) {
            dismissAll.show();
        }

        //set up click handler events
        parent.find('.omitStrains').on('click', (ev:JQueryMouseEventObject):boolean => {
            ev.preventDefault();
            ev.stopPropagation();
            var f = fileContainer.file;
            f.sendTo(currentPath.split('overview')[0] + 'describe/?IGNORE_ICE_RELATED_ERRORS=true');
            $('#iceError').hide();
            return false;
        });

        parent.find('.allowDuplicates').on('click',(ev:JQueryMouseEventObject):boolean => {
            ev.preventDefault();
            ev.stopPropagation();
            var f = fileContainer.file;
            f.sendTo(currentPath.split('overview')[0] + 'describe/?ALLOW_DUPLICATE_NAMES=true');
            $('#duplicateError').hide();
            return false;
        });

        $('.noDuplicates, .noOmitStrains').on('click',(ev:JQueryMouseEventObject):boolean => {
            ev.preventDefault();
            ev.stopPropagation();
            window.location.reload();
            return false;
        });
        //dismiss all alerts
        dismissAll.on('click',(ev:JQueryMouseEventObject):boolean => {
            ev.preventDefault();
            ev.stopPropagation();
            parent.find('.close').click();
            window.location.reload();
            return false;
        });

        $('#acceptWarnings').find('.acceptWarnings').on('click',(ev:JQueryMouseEventObject):boolean => {
            ev.preventDefault();
            ev.stopPropagation();
            successfulRedirect(linesPathName);
            return false;
        });
    }

    function generateMessages(type, response) {
        var responseMessages = organizeMessages(response);
        for (var key in responseMessages) {
            let div;
            if (type === 'error') {
                div = $('.alert-danger').eq(0).clone();
            } else {
                div = $('.alert-warning').eq(0).clone();
            }
            alertMessage(key, responseMessages[key], div, type)
        }
    }


    function generateAcceptWarning(): void {
        var warningAlerts: JQuery, acceptWarningDiv: JQuery;
        warningAlerts = $('.alert-warning:visible');
        acceptWarningDiv = $('#acceptWarnings').find('.acceptWarnings');
        if (warningAlerts.length === 1) {
            $(warningAlerts).append(acceptWarningDiv)
        } else {
            $('#alert_placeholder').prepend(acceptWarningDiv)
        }
        acceptWarningDiv.show();
    }

    function organizeMessages(responses) {
        var obj = {};
        responses.forEach(function (response) {
            if (response.category === "ICE-related error") {
                // create dismissible error alert
                alertIceWarning(response);
            } else if (response.summary === "Duplicate assay names in the input" || response.summary === "Duplicate " +
                "line names in the input") {
                if ($('#duplicateError').length === 1) {
                    alertDuplicateError(response);
                }
            }
            else {
                var message = response.summary + ": " + response.details;

                if (obj.hasOwnProperty(response.category)) {
                    obj[response.category].push(message);
                } else {
                    obj[response.category] = [message]
                }
             }
        });
        return obj;
    }

    function generate504Error() {
        let response = {
            category: "",
            summary: "EDD timed out",
            details: "Please reload page and reupload file or try again later"
        };
        alertError(response)
    }

    function alertIceWarning(response): void {
        let iceError = $('#iceError');
        response.category = "Warning! " + response.category;
        createAlertMessage(iceError, response);
    }

    function alertDuplicateError(response): void {
        var duplicateElem = $('#duplicateError');
        createAlertMessage(duplicateElem, response)
    }


    function alertError(response): void {
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



    function alertMessage(subject, messages, newAlert, type): void {
        if (type === "warnings") {
            $(newAlert).children('h4').text("Warning! " + subject);
        } else {
            $(newAlert).children('h4').text("Error! " + subject);
            clearDropZone();
        }
        messages.forEach(function (m) {
            var summary = $('<p>', {
                text: m,
                class: 'alertWarning',
            });
            $(newAlert).append(summary)
        });
        $('#alert_placeholder').append(newAlert);
        $(newAlert).show();
    }

    function clearDropZone(): void {
        $('#templateDropZone').removeClass('off');
        $('#fileDropInfoIcon').addClass('off');
        $('#fileDropInfoName').addClass('off');
        $('#fileDropInfoSending').addClass('off');
    }


    // Here, we take a look at the type of the dropped file and decide whether to
    // send it to the server, or process it locally.
    // We inform the FileDropZone of our decision by setting flags in the fileContainer object,
    // which will be inspected when this function returns.
    export function fileDropped(fileContainer, iceError?: boolean): void {
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


    // Reset and show the info box that appears when a file is dropped,
    // and reveal the text entry area.
    export function showFileDropped(fileContainer): void {
        var processingMessage: string = '';
        // Set the icon image properly
        $('#fileDropInfoIcon').removeClass('xml');
        $('#fileDropInfoIcon').removeClass('text');
        $('#fileDropInfoIcon').removeClass('excel');
        if (fileContainer.fileType === 'xml') {
            $('#fileDropInfoIcon').addClass('xml');
        } else if (fileContainer.fileType === 'xlsx') {
            $('#fileDropInfoIcon').addClass('excel');
        } else if (fileContainer.fileType === 'plaintext') {
            $('#fileDropInfoIcon').addClass('text');
        }
        $('#templateDropZone').addClass('off');
        $('#fileDropInfoArea').removeClass('off');
        $('#fileDropInfoSending').removeClass('off');
        $('#fileDropInfoName').text(fileContainer.file.name);

        if (!fileContainer.skipUpload) {
            processingMessage = 'Sending ' + Utl.JS.sizeToString(fileContainer.file.size) + ' To Server...';
            $('#fileDropInfoLog').empty();
        } else if (!fileContainer.skipProcessRaw) {
            processingMessage = 'Processing ' + Utl.JS.sizeToString(fileContainer.file.size) + '...';
            $('#fileDropInfoLog').empty();
        }
        $('#fileUploadMessage').text(processingMessage);
        this.activeDraggedFile = fileContainer;
    }


    // This function is passed the usual fileContainer object, but also a reference to the
    // full content of the dropped file.
    export function fileRead(fileContainer, result): void {
        this.haveInputData = true;
    }


    function preparePermissions() {
        var user: EDDAuto.User, group: EDDAuto.Group;
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
            .on('submit', (ev: JQueryEventObject): boolean => {
                var perm: any = {}, klass: string, auto: JQuery;
                auto = $('form#permissions').find('[name=class]:checked');
                klass = auto.val();
                perm.type = $(auto).siblings('select').val();
                perm[klass.toLowerCase()] = {'id': $(auto).siblings('input:hidden').val()};
                $.ajax({
                    'url': '/study/' + EDDData.currentStudyID + '/permissions/',
                    'type': 'POST',
                    'data': {
                        'data': JSON.stringify([perm]),
                        'csrfmiddlewaretoken': $('form#permissions').find('[name=csrfmiddlewaretoken]').val()
                    },
                    'success': (): void => {
                        var permissionTarget;
                        console.log(['Set permission: ', JSON.stringify(perm)].join(''));
                        //reset permission options
                        $('form#permissions').find('.autocomp_search').siblings('select').val('N');
                        //reset input
                        $('form#permissions').find('.autocomp_search').val('');

                        $('<div>').text('Permission Updated').addClass('success')
                            .appendTo($('form#permissions')).delay(2000).fadeOut(2000);
                    },
                    'error': (xhr, status, err): void => {
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
        $("#attachmentsSection a:contains('Delete')").hide()
    }


    export function onChangedMetabolicMap() {
        if (this.metabolicMapName) {
            // Update the UI to show the new filename for the metabolic map.
            $("#metabolicMapName").html(this.metabolicMapName);
        } else {
            $("#metabolicMapName").html('(none)');
        }
    }


    // They want to select a different metabolic map.
    export function onClickedMetabolicMapName(): void {
        var ui: StudyMetabolicMapChooser,
            callback: MetabolicMapChooserResult = (error: string,
                                                   metabolicMapID?: number,
                                                   metabolicMapName?: string,
                                                   finalBiomass?: number): void => {
                if (!error) {
                    this.metabolicMapID = metabolicMapID;
                    this.metabolicMapName = metabolicMapName;
                    this.biomassCalculation = finalBiomass;
                    this.onChangedMetabolicMap();
                } else {
                    console.log("onClickedMetabolicMapName error: " + error);
                }
            };
        ui = new StudyMetabolicMapChooser(false, callback);
    }


    export class EditableStudyDescription extends StudyBase.EditableStudyElement {

        minimumRows: number;

        constructor(inputElement: HTMLElement, style?: string) {
            super(inputElement, style);
            this.minimumRows = 4;
            this.formURL('/study/' + EDDData.currentStudyID + '/setdescription/')
        }

        getValue(): string {
            return EDDData.Studies[EDDData.currentStudyID].description;
        }

        setValue(value) {
            EDDData.Studies[EDDData.currentStudyID].description = value;
        }

        blankLabel(): string {
            return '(click to add description)';
        }
    }


    export class EditableStudyContact extends EDDEditable.EditableAutocomplete {

        constructor(inputElement: HTMLElement, style?: string) {
            super(inputElement, style);
            this.formURL('/study/' + EDDData.currentStudyID + '/setcontact/');
        }

        // Have to reproduce these here rather than using EditableStudyElement because the inheritance is different
        editAllowed(): boolean {
            return EDDData.currentStudyWritable;
        }

        canCommit(value): boolean {
            return EDDData.currentStudyWritable;
        }

        getValue(): string {
            return EDDData.Studies[EDDData.currentStudyID].contact;
        }

        setValue(value) {
            EDDData.Studies[EDDData.currentStudyID].contact = value;
        }
    }


    // Called when the page loads.
    export function prepareIt() {

        this.attachmentIDs = null;
        this.attachmentsByID = null;
        this.prevDescriptionEditElement = null;

        this.metabolicMapID = -1;
        this.metabolicMapName = null;
        this.biomassCalculation = -1;

        new EditableStudyContact($('#editable-study-contact').get()[0]);
        new EditableStudyDescription($('#editable-study-description').get()[0]);

        // put the click handler at the document level, then filter to any link inside a .disclose
        $(document).on('click', '.disclose .discloseLink', (e) => {
            $(e.target).closest('.disclose').toggleClass('discloseHide');
            return false;
        });

        $('#helpExperimentDescription').tooltip({
            content: function () {
                return $(this).prop('title');
            },
            position: {my: "left-10 center", at: "right center"},
            show: null,
            close: function (event, ui: any) {
                ui.tooltip.hover(
                    function () {
                        $(this).stop(true).fadeTo(400, 1);
                    },
                    function () {
                        $(this).fadeOut("400", function () {
                            $(this).remove();
                        })
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
}
// use JQuery ready event shortcut to call prepareIt when page is ready
$(() => StudyOverview.prepareIt());
