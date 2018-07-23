"use strict";

declare var EDDData: EDDData;

import * as Utl from "../modules/Utl";
import * as EDDEditable from "../modules/EDDEditableElement";
import * as StudyBase from "../modules/Study";
import * as EDDAuto from "../modules/EDDAutocomplete";


// TODO find out a way to do this in Typescript without relying on specific output targets
/* tslint:disable */
declare function require(name: string): any;  // avoiding warnings for require calls below
// as of JQuery UI 1.12, need to require each dependency individually
require('jquery-ui/themes/base/core.css');
require('jquery-ui/themes/base/menu.css');
require('jquery-ui/themes/base/button.css');
require('jquery-ui/themes/base/draggable.css');
require('jquery-ui/themes/base/resizable.css');
require('jquery-ui/themes/base/dialog.css');
require('jquery-ui/themes/base/tooltip.css');
require('jquery-ui/themes/base/theme.css');
require('jquery-ui/ui/widgets/button');
require('jquery-ui/ui/widgets/draggable');
require('jquery-ui/ui/widgets/resizable');
require('jquery-ui/ui/widgets/dialog');
require('jquery-ui/ui/widgets/tooltip');
// TODO find out a way to do this in Typescript without relying on specific output targets
/* tslint:enable */

let studyBaseUrl: URL = Utl.relativeURL('../');

function preparePermissions() {
    var user: EDDAuto.User, group: EDDAuto.Group;
    user = new EDDAuto.User({
        "container": $('#permission_user_box'),
    });
    group = new EDDAuto.Group({
        "container": $('#permission_group_box'),
    });

    // check public permission input on click
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
            var perm: any = {}, klass: any, auto: JQuery, token: string;
            auto = $('form#permissions').find('[name=class]:checked');
            klass = auto.val();
            perm.type = $(auto).siblings('select').val();
            perm[klass.toLowerCase()] = {'id': $(auto).siblings('input:hidden').val()};
            token = $('form#permissions').find('[name=csrfmiddlewaretoken]').val();
            $.ajax({
                'url': Utl.relativeURL('permissions/', studyBaseUrl).toString(),
                'type': 'POST',
                'data': {
                    'data': JSON.stringify([perm]),
                    'csrfmiddlewaretoken': token,
                },
                'success': (): void => {
                    // reset permission options
                    $('form#permissions').find('.autocomp_search')
                        .siblings('select')
                        .val('N');
                    // reset input
                    $('form#permissions').find('.autocomp_search').val('');

                    $('<div>').text('Permission Updated')
                        .addClass('success')
                        .appendTo($('form#permissions'))
                        .delay(2000)
                        .fadeOut(2000);
                },
                'error': (xhr, status, err): void => {
                    // reset permission options
                    $('form#permissions').find('.autocomp_search')
                        .siblings('select')
                        .val('N');
                    // reset input
                    $('form#permissions').find('.autocomp_search').val('');
                    $('<div>').text('Server Error: ' + err)
                        .addClass('bad')
                        .appendTo($('form#permissions'))
                        .delay(5000)
                        .fadeOut(2000);
                },
            });
            return false;
        })
        .find(':radio').trigger('change').end()
        .removeClass('off');
    // set style on inputs for permissions
    $('#permission_user_box').find('input')
        .insertBefore('#user_permission_options')
        .addClass('permissionUser');
    $('#permission_group_box').find('input')
        .insertBefore('#group_permission_options')
        .addClass('permissionGroup');
    $('#permission_public_box').addClass('permissionGroup');

    // Set up the Add Measurement to Assay modal
    $("#permissionsSection").dialog({
        "minWidth": 500,
        "autoOpen": false,
    });

    $("#addPermission").click(function () {
        $("#permissionsSection").removeClass('off').dialog("open");
        return false;
    });
}


export class EditableStudyDescription extends StudyBase.EditableStudyElement {

    minimumRows: number;

    constructor(inputElement: HTMLElement, style?: string) {
        super(inputElement, style);
        this.minimumRows = 4;
        this.formURL(Utl.relativeURL('setdescription/', studyBaseUrl).toString());
    }

    getValue(): string {
        return $(this.inputElement).val();
    }

    blankLabel(): string {
        return '(click to add description)';
    }
}


export class EditableStudyContact extends EDDEditable.EditableAutocomplete {

    constructor(inputElement: HTMLElement, style?: string) {
        super(inputElement, style);
        this.formURL(Utl.relativeURL('setcontact/', studyBaseUrl).toString());
    }

    canCommit(value): boolean {
        return '' !== value.trim();
    }

    getValue(): string {
        return $(this.inputElement).val();
    }
}


// Called when the page loads.
export function prepareIt() {
    this.attachmentIDs = null;
    this.attachmentsByID = null;
    this.prevDescriptionEditElement = null;

    let contactEdit = new EditableStudyContact($('#editable-study-contact').get()[0]);
    let descEdit = new EditableStudyDescription($('#editable-study-description').get()[0]);
    contactEdit.getValue();
    descEdit.getValue();

    $('#helpExperimentDescription').tooltip({
        'content': () => $('#helpExperimentDescription > .helpContent').html(),
        'items': '#helpExperimentDescription',
        'position': {
            'my': "right top",
            'at': "right bottom",
            'of': "#helpExperimentDescription",
        },
    });

    var helper = new Utl.FileDropZoneHelpers({
       pageRedirect: 'experiment-description',
    });

    Utl.FileDropZone.create({
        'elementId': "experimentDescDropZone",
        'url': Utl.relativeURL('describe/', studyBaseUrl),
        // must bind these functions; otherwise the function this will be the options object
        // here, instead of the helper object
        'processResponseFn': helper.fileReturnedFromServer.bind(helper),
        'processErrorFn': helper.fileErrorReturnedFromServer.bind(helper),
        'processWarningFn': helper.fileWarningReturnedFromServer.bind(helper),
    });

    Utl.Tabs.prepareTabs();

    $(window).on('load', preparePermissions);
}

// use JQuery ready event shortcut to call prepareIt when page is ready
$(prepareIt);
