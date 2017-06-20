/// <reference path="typescript-declarations.d.ts" />
/// <reference path="Utl.ts" />
var FileDropZone;
(function (FileDropZone) {
    var FileDropZoneHelpers = (function () {
        function FileDropZoneHelpers(options) {
            this.haveInputData = options.haveInputData;
            this.pageRedirect = options.pageRedirect;
        }
        // This is called upon receiving a response from a file upload operation, and unlike
        // fileRead(), is passed a processed result from the server as a second argument,
        // rather than the raw contents of the file.
        FileDropZoneHelpers.prototype.fileReturnedFromServer = function (fileContainer, result) {
            var currentPath = window.location.pathname;
            var linesPathName = currentPath.slice(0, currentPath.lastIndexOf('overview')) +
                this.pageRedirect;
            $('<p>', {
                text: 'Success! ' + result['lines_created'] + ' lines added!',
                style: 'margin:auto'
            }).appendTo('#linesAdded');
            $('#linesAdded').show();
            this.successfulRedirect(linesPathName);
        };
        FileDropZoneHelpers.prototype.fileWarningReturnedFromServer = function (fileContainer, result) {
            var _this = this;
            var currentPath = window.location.pathname;
            var newWarningAlert = $('.alert-warning').eq(0).clone();
            var linesPathName = currentPath.slice(0, currentPath.lastIndexOf('overview')) +
                this.pageRedirect;
            this.copyActionButtons();
            $('#acceptWarnings').find('.acceptWarnings').on('click', function (ev) {
                ev.preventDefault();
                ev.stopPropagation();
                _this.successfulRedirect(linesPathName);
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
        };
        FileDropZoneHelpers.prototype.successfulRedirect = function (linesPathName) {
            //redirect to lines page
            setTimeout(function () {
                window.location.pathname = linesPathName;
            }, 1000);
        };
        FileDropZoneHelpers.prototype.copyActionButtons = function () {
            var original, copy, originalDismiss, copyDismiss, originalAcceptWarnings, copyAcceptWarnings;
            if (!this.actionPanelIsCopied) {
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
                this.actionPanelIsCopied = true;
            }
        };
        // This is called upon receiving an errror in a file upload operation, and
        // is passed an unprocessed result from the server as a second argument.
        FileDropZoneHelpers.prototype.fileErrorReturnedFromServer = function (fileContainer, xhr) {
            var _this = this;
            this.copyActionButtons();
            var parent = $('#alert_placeholder'), dismissAll = $('#dismissAll').find('.dismissAll'), linesPathName, currentPath;
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
                    this.generateMessages('error', obj.errors);
                }
                if (obj.warnings) {
                    this.generateMessages('warnings', obj.warnings);
                }
            }
            catch (e) {
                //if there is no backend error message or error (html response), show this
                var defaultError = {
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
                _this.successfulRedirect(linesPathName);
                return false;
            });
        };
        FileDropZoneHelpers.prototype.generateMessages = function (type, response) {
            var responseMessages = this.organizeMessages(response);
            for (var key in responseMessages) {
                var div = void 0;
                if (type === 'error') {
                    div = $('.alert-danger').eq(0).clone();
                }
                else {
                    div = $('.alert-warning').eq(0).clone();
                }
                this.alertMessage(key, responseMessages[key], div, type);
            }
        };
        FileDropZoneHelpers.prototype.generateAcceptWarning = function () {
            var warningAlerts, acceptWarningDiv;
            warningAlerts = $('.alert-warning:visible');
            acceptWarningDiv = $('#acceptWarnings').find('.acceptWarnings');
            if (warningAlerts.length === 1) {
                $(warningAlerts).append(acceptWarningDiv);
            }
            else {
                $('#alert_placeholder').prepend(acceptWarningDiv);
            }
            acceptWarningDiv.show();
        };
        FileDropZoneHelpers.prototype.organizeMessages = function (responses) {
            var obj = {};
            responses.forEach(function (response) {
                if (response.category === "ICE-related error") {
                    // create dismissible error alert
                    this.alertIceWarning(response);
                }
                else if (response.summary === "Duplicate assay names in the input" || response.summary === "Duplicate " +
                    "line names in the input") {
                    if ($('#duplicateError').length === 1) {
                        this.alertDuplicateError(response);
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
        };
        FileDropZoneHelpers.prototype.generate504Error = function () {
            var response = {
                category: "",
                summary: "EDD timed out",
                details: "Please reload page and reupload file or try again later"
            };
            this.alertError(response);
        };
        FileDropZoneHelpers.prototype.alertIceWarning = function (response) {
            var iceError = $('#iceError');
            response.category = "Warning! " + response.category;
            this.createAlertMessage(iceError, response);
        };
        FileDropZoneHelpers.prototype.alertDuplicateError = function (response) {
            var duplicateElem = $('#duplicateError');
            this.createAlertMessage(duplicateElem, response);
        };
        FileDropZoneHelpers.prototype.alertError = function (response) {
            var newErrorAlert = $('.alert-danger').eq(0).clone();
            this.createAlertMessage(newErrorAlert, response);
            this.clearDropZone();
        };
        FileDropZoneHelpers.prototype.createAlertMessage = function (alertClone, response) {
            $(alertClone).children('h4').text(response.category);
            $(alertClone).children('p').text(response.summary + ": " + response.details);
            $('#alert_placeholder').append(alertClone);
            $(alertClone).show();
        };
        FileDropZoneHelpers.prototype.alertMessage = function (subject, messages, newAlert, type) {
            if (type === "warnings") {
                $(newAlert).children('h4').text("Warning! " + subject);
            }
            else {
                $(newAlert).children('h4').text("Error! " + subject);
                this.clearDropZone();
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
        };
        FileDropZoneHelpers.prototype.clearDropZone = function () {
            $('#templateDropZone').removeClass('off');
            $('#fileDropInfoIcon').addClass('off');
            $('#fileDropInfoName').addClass('off');
            $('#fileDropInfoSending').addClass('off');
        };
        // Here, we take a look at the type of the dropped file and decide whether to
        // send it to the server, or process it locally.
        // We inform the FileDropZone of our decision by setting flags in the fileContainer object,
        // which will be inspected when this function returns.
        FileDropZoneHelpers.prototype.fileDropped = function (fileContainer, iceError) {
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
        };
        // Reset and show the info box that appears when a file is dropped,
        // and reveal the text entry area.
        FileDropZoneHelpers.prototype.showFileDropped = function (fileContainer) {
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
        };
        // This function is passed the usual fileContainer object, but also a reference to the
        // full content of the dropped file.
        FileDropZoneHelpers.prototype.fileRead = function (fileContainer, result) {
            this.haveInputData = true;
        };
        return FileDropZoneHelpers;
    }());
    FileDropZone.FileDropZoneHelpers = FileDropZoneHelpers;
})(FileDropZone || (FileDropZone = {}));
