/// <reference path="typescript-declarations.d.ts" />
/// <reference path="Utl.ts" />
/// <reference path="Dragboxes.ts" />
/// <reference path="DataGrid.ts" />

declare var EDDData:EDDData;

module StudyOverview {
    'use strict';

    var attachmentIDs:any;
    var attachmentsByID:any;
    var prevDescriptionEditElement:any;

    var activeDraggedFile: any;

    var fileUploadProgressBar: Utl.ProgressBar;

    // We can have a valid metabolic map but no valid biomass calculation.
    // If they try to show carbon balance in that case, we'll bring up the UI to 
    // calculate biomass for the specified metabolic map.
    export var metabolicMapID:any;
    export var metabolicMapName:any;
    export var biomassCalculation:number;


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
            position: { my: "left-10 center", at: "right center" },
            show: null,
            close: function (event, ui:any) {
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
            url: '/study/' + EDDData.currentStudyID + '/define/',
            processResponseFn: this.fileReturnedFromServer.bind(this),
            progressBar: this.fileUploadProgressBar
        });

        Utl.Tabs.prepareTabs();

        $(window).on('load', preparePermissions);
    }


    // This is called upon receiving a response from a file upload operation, and unlike
    // fileRead(), is passed a processed result from the server as a second argument,
    // rather than the raw contents of the file.
    export function fileReturnedFromServer(fileContainer, result): void {

        var currentPath = window.location.pathname;
        var linesPathName = currentPath.slice(0, currentPath.lastIndexOf('overview')) + 'experiment-description';
        //display success message
        $('#general').append('<div id="successLines" class="success" style="margin-bottom: 17px;">Success! ' + result['lines_created'] + ' lines ' +
            'added! Redirecting to the experiment description page');

        //redirect to lines page
        setTimeout(function () {
            window.location.pathname = linesPathName;
        }, 2000);
    }


    // Here, we take a look at the type of the dropped file and decide whether to
    // send it to the server, or process it locally.
    // We inform the FileDropZone of our decision by setting flags in the fileContiner object,
    // which will be inspected when this function returns.
    export function fileDropped(fileContainer): void {
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


    // Reset and show the info box that appears when a file is dropped,
    // and reveal the text entry area.
    export function showFileDropped(fileContainer): void {
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
        $('#fileDropInfoName').text(fileContainer.file.name)

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
            container:$('#permission_user_box')
        });
        group = new EDDAuto.Group({
            container:$('#permission_group_box')
        });

        $('form#permissions')
            .on('change', ':radio', (ev:JQueryInputEventObject):void => {
                var radio: JQuery = $(ev.target);
                $('#permissions').find(':radio').each((i: number, r: Element): void => {
                    $(r).closest('span').find('.autocomp').prop('disabled', !$(r).prop('checked'));
                });
                if (radio.prop('checked')) {
                    radio.closest('span').find('.autocomp:visible').focus();
                }
            })
            .on('submit', (ev:JQueryEventObject): boolean => {
                var perm: any = {}, klass: string, auto: JQuery;
                auto = $('form#permissions').find('[name=class]:checked');
                klass = auto.val();
                perm.type = $('form#permissions').find('[name=type]').val();
                perm[klass.toLowerCase()] = { 'id':  auto.closest('.permission').find('input:hidden').val()};
                $.ajax({
                    'url': '/study/' + EDDData.currentStudyID + '/permissions/',
                    'type': 'POST',
                    'data': {
                        'data': JSON.stringify([perm]),
                        'csrfmiddlewaretoken': $('form#permissions').find('[name=csrfmiddlewaretoken]').val()
                    },
                    'success': (): void => {
                        console.log(['Set permission: ', JSON.stringify(perm)].join(''));
                        $('<div>').text('Set Permission').addClass('success')
                            .appendTo($('form#permissions')).delay(5000).fadeOut(2000);
                    },
                    'error': (xhr, status, err): void => {
                        console.log(['Setting permission failed: ', status, ';', err].join(''));
                        $('<div>').text('Server Error: ' + err).addClass('bad')
                            .appendTo($('form#permissions')).delay(5000).fadeOut(2000);
                    }
                });
                return false;
            })
            .find(':radio').trigger('change').end()
            .removeClass('off');
        //set style on inputs for permissions
        $('#permission_user_box').find('input').eq(1).addClass('permissionUser');
        $('#permission_group_box').find('input').eq(1).addClass('permissionGroup');
        $('#permission_public_box').addClass('permissionGroup');

        // Set up the Add Measurement to Assay modal
        $("#permissionsSection").dialog({
            minWidth: 500,
            autoOpen: false
        });

        $("#addPermission").click(function() {
           $("#permissionsSection").removeClass('off').dialog( "open" );
            return false;
        });
        //TODO: remove this and fix bug
        $( "#attachmentsSection a:contains('Delete')" ).hide()
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
    export function onClickedMetabolicMapName():void {
        var ui:StudyMetabolicMapChooser,
            callback:MetabolicMapChooserResult = (error:string,
                metabolicMapID?:number,
                metabolicMapName?:string,
                finalBiomass?:number):void => {
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


    export class EditableStudyDescription extends StudyBase.EditableStudyElment {

        constructor(inputElement: HTMLElement) {        
            super(inputElement);
            this.minimumRows = 4;
        }

        getFormURL(): string {
            return '/study/' + EDDData.currentStudyID + '/setdescription/';
        }

        getValue():string {
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

        // Have to reproduce these here rather than using EditableStudyElment because the inheritance is different
        editAllowed(): boolean { return EDDData.currentStudyWritable; }
        canCommit(value): boolean { return EDDData.currentStudyWritable; }

        getFormURL(): string {
            return '/study/' + EDDData.currentStudyID + '/setcontact/';
        }

        getValue():string {
            return EDDData.Studies[EDDData.currentStudyID].contact;
        }

        setValue(value) {
            EDDData.Studies[EDDData.currentStudyID].contact = value;
        }
    }
};


// use JQuery ready event shortcut to call prepareIt when page is ready
$(() => StudyOverview.prepareIt());
