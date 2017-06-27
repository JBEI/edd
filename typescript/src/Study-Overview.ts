/// <reference path="typescript-declarations.d.ts" />
/// <reference path="BiomassCalculationUI.ts" />
/// <reference path="Dragboxes.ts" />
/// <reference path="DataGrid.ts" />
/// <reference path="EDDAutocomplete.ts" />
/// <reference path="EDDEditableElement.ts" />
/// <reference path="Study.ts" />
/// <reference path="Utl.ts" />
/// <reference path="FileDropZone.ts" />

declare var EDDData:EDDData;


module StudyOverview {
    'use strict';

    var attachmentIDs: any;
    var attachmentsByID: any;
    var prevDescriptionEditElement: any;

    var fileUploadProgressBar: Utl.ProgressBar;
    //
    // We can have a valid metabolic map but no valid biomass calculation.
    // If they try to show carbon balance in that case, we'll bring up the UI to
    // calculate biomass for the specified metabolic map.
    export var metabolicMapID: any;
    export var metabolicMapName: any;
    export var biomassCalculation: number;

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
        var fileDropZoneHelper = new FileDropZone.FileDropZoneHelpers({
           pageRedirect: 'experiment-description',
           haveInputData: false,
        });

        Utl.FileDropZone.create({
            elementId: "templateDropZone",
            fileInitFn: fileDropZoneHelper.fileDropped.bind(fileDropZoneHelper),
            processRawFn: fileDropZoneHelper.fileRead.bind(fileDropZoneHelper),
            url: '/study/' + EDDData.currentStudyID + '/describe/',
            processResponseFn: fileDropZoneHelper.fileReturnedFromServer.bind(fileDropZoneHelper),
            processErrorFn: fileDropZoneHelper.fileErrorReturnedFromServer.bind(fileDropZoneHelper),
            processWarningFn: fileDropZoneHelper.fileWarningReturnedFromServer.bind(fileDropZoneHelper),
            progressBar: this.fileUploadProgressBar
        });

        Utl.Tabs.prepareTabs();

        $(window).on('load', preparePermissions);
    }
}
// use JQuery ready event shortcut to call prepareIt when page is ready
$(() => StudyOverview.prepareIt());
