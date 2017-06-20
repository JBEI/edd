/// <reference path="typescript-declarations.d.ts" />
/// <reference path="Utl.ts" />


module FileDropZone {

    export class FileDropZoneHelpers {
        
        haveInputData:boolean;
        pageRedirect: string;

        activeDraggedFile: any;
        actionPanelIsCopied: boolean;
        
        constructor(options:any) {
            this.haveInputData = options.haveInputData;
            this.pageRedirect = options.pageRedirect;
        }

        // This is called upon receiving a response from a file upload operation, and unlike
        // fileRead(), is passed a processed result from the server as a second argument,
        // rather than the raw contents of the file.
        fileReturnedFromServer(fileContainer, result):void {

            let currentPath = window.location.pathname;
            let linesPathName = currentPath.slice(0, currentPath.lastIndexOf('overview')) + 
                                this.pageRedirect;
            $('<p>', {
                text: 'Success! ' + result['lines_created'] + ' lines added!',
                style: 'margin:auto'
            }).appendTo('#linesAdded');

            $('#linesAdded').show();

            this.successfulRedirect(linesPathName)
        }

        fileWarningReturnedFromServer(fileContainer, result):void {
            let currentPath = window.location.pathname;
            let newWarningAlert = $('.alert-warning').eq(0).clone();
            let linesPathName = currentPath.slice(0, currentPath.lastIndexOf('overview')) + 
                                this.pageRedirect;
  
            this.copyActionButtons();

            $('#acceptWarnings').find('.acceptWarnings').on('click', (ev:JQueryMouseEventObject):boolean => {
                ev.preventDefault();
                ev.stopPropagation();
                this.successfulRedirect(linesPathName);
                return false;
            });

            $('<p>', {
                text: 'Success! ' + result['lines_created'] + ' lines added!',
                style: 'margin:auto'
            }).appendTo('#linesAdded');
            //display success message
            $('#linesAdded').show();
            this.generateMessages('warnings', result.warnings);
            this.generateAcceptWarning();
        }

        successfulRedirect(linesPathName):void {
            //redirect to lines page
            setTimeout(function () {
                window.location.pathname = linesPathName;
            }, 1000);
        }


        copyActionButtons() {
            let original:JQuery, copy:JQuery, originalDismiss:JQuery, copyDismiss:JQuery,
                originalAcceptWarnings:JQuery, copyAcceptWarnings:JQuery;
            if (!this.actionPanelIsCopied) {
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
                this.actionPanelIsCopied = true;
            }
        }

        // This is called upon receiving an errror in a file upload operation, and
        // is passed an unprocessed result from the server as a second argument.
        fileErrorReturnedFromServer(fileContainer, xhr):void {

            this.copyActionButtons();

            let parent:JQuery = $('#alert_placeholder'), dismissAll:JQuery = $('#dismissAll').find('.dismissAll'),
                linesPathName:string, currentPath:string;
            currentPath = window.location.pathname;
            linesPathName = currentPath.slice(0, currentPath.lastIndexOf('overview')) + 'experiment-description';
            // reset the drop zone here
            //parse xhr.response
            var obj, error, id;
            try {
                if (xhr.status === 504) {
                    this.generate504Error();
                }
                obj = JSON.parse(xhr.response);
                if (obj.errors) {
                    this.generateMessages('error', obj.errors)
                }
                if (obj.warnings) {
                    this.generateMessages('warnings', obj.warnings)
                }
            } catch (e) {
                //if there is no backend error message or error (html response), show this
                let defaultError = {
                    category: "",
                    summary: "There was an error",
                    details: "EDD administrators have been notified. Please try again later."
                };
                this.alertError(defaultError);
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

            parent.find('.allowDuplicates').on('click', (ev:JQueryMouseEventObject):boolean => {
                ev.preventDefault();
                ev.stopPropagation();
                var f = fileContainer.file;
                f.sendTo(currentPath.split('overview')[0] + 'describe/?ALLOW_DUPLICATE_NAMES=true');
                $('#duplicateError').hide();
                return false;
            });

            $('.noDuplicates, .noOmitStrains').on('click', (ev:JQueryMouseEventObject):boolean => {
                ev.preventDefault();
                ev.stopPropagation();
                window.location.reload();
                return false;
            });
            //dismiss all alerts
            dismissAll.on('click', (ev:JQueryMouseEventObject):boolean => {
                ev.preventDefault();
                ev.stopPropagation();
                parent.find('.close').click();
                window.location.reload();
                return false;
            });

            $('#acceptWarnings').find('.acceptWarnings').on('click', (ev:JQueryMouseEventObject):boolean => {
                ev.preventDefault();
                ev.stopPropagation();
                this.successfulRedirect(linesPathName);
                return false;
            });
        }

        generateMessages(type, response) {
            var responseMessages = this.organizeMessages(response);
            for (var key in responseMessages) {
                let div;
                if (type === 'error') {
                    div = $('.alert-danger').eq(0).clone();
                } else {
                    div = $('.alert-warning').eq(0).clone();
                }
                this.alertMessage(key, responseMessages[key], div, type)
            }
        }


        generateAcceptWarning():void {
            var warningAlerts:JQuery, acceptWarningDiv:JQuery;
            warningAlerts = $('.alert-warning:visible');
            acceptWarningDiv = $('#acceptWarnings').find('.acceptWarnings');
            if (warningAlerts.length === 1) {
                $(warningAlerts).append(acceptWarningDiv)
            } else {
                $('#alert_placeholder').prepend(acceptWarningDiv)
            }
            acceptWarningDiv.show();
        }

        organizeMessages(responses) {
            var obj = {};
            responses.forEach(function (response) {
                if (response.category === "ICE-related error") {
                    // create dismissible error alert
                    this.alertIceWarning(response);
                } else if (response.summary === "Duplicate assay names in the input" || response.summary === "Duplicate " +
                    "line names in the input") {
                    if ($('#duplicateError').length === 1) {
                        this.alertDuplicateError(response);
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

        generate504Error() {
            let response = {
                category: "",
                summary: "EDD timed out",
                details: "Please reload page and reupload file or try again later"
            };
            this.alertError(response)
        }

        alertIceWarning(response):void {
            let iceError = $('#iceError');
            response.category = "Warning! " + response.category;
            this.createAlertMessage(iceError, response);
        }

        alertDuplicateError(response):void {
            var duplicateElem = $('#duplicateError');
            this.createAlertMessage(duplicateElem, response)
        }


        alertError(response):void {
            var newErrorAlert = $('.alert-danger').eq(0).clone();
            this.createAlertMessage(newErrorAlert, response);
            this.clearDropZone();
        }

        createAlertMessage(alertClone, response) {
            $(alertClone).children('h4').text(response.category);
            $(alertClone).children('p').text(response.summary + ": " + response.details);
            $('#alert_placeholder').append(alertClone);
            $(alertClone).show();
        }


        alertMessage(subject, messages, newAlert, type):void {
            if (type === "warnings") {
                $(newAlert).children('h4').text("Warning! " + subject);
            } else {
                $(newAlert).children('h4').text("Error! " + subject);
                this.clearDropZone();
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

        clearDropZone():void {
            $('#templateDropZone').removeClass('off');
            $('#fileDropInfoIcon').addClass('off');
            $('#fileDropInfoName').addClass('off');
            $('#fileDropInfoSending').addClass('off');
        }


        // Here, we take a look at the type of the dropped file and decide whether to
        // send it to the server, or process it locally.
        // We inform the FileDropZone of our decision by setting flags in the fileContainer object,
        // which will be inspected when this function returns.
        fileDropped(fileContainer, iceError?:boolean):void {
            this.haveInputData = true;
            //processingFileCallback();
            var ft = fileContainer.fileType;
            // We'll signal the dropzone to upload this, and receive processed results.
            if (ft === 'xlsx') {
                fileContainer.skipProcessRaw = true;
                fileContainer.skipUpload = false;
            }
            // HPLC reports need to be sent for server-side processing
            // if (!fileContainer.skipProcessRaw || !fileContainer.skipUpload) {
            //     this.showFileDropped(fileContainer, iceError);
            // }
        }


        // Reset and show the info box that appears when a file is dropped,
        // and reveal the text entry area.
        showFileDropped(fileContainer):void {
            var processingMessage:string = '';
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
        fileRead(fileContainer, result):void {
            this.haveInputData = true;
        }
    }
}
