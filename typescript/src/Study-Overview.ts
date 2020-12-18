"use strict";

import * as $ from "jquery";

import * as EDDAuto from "../modules/EDDAutocomplete";
import * as EDDEditable from "../modules/EDDEditableElement";
import * as StudyBase from "../modules/Study";
import * as Utl from "../modules/Utl";

declare let window: StudyBase.EDDWindow;
const EDDData = window.EDDData || ({} as EDDData);

// TODO: fix hard-coded URL
const studyBaseUrl: URL = Utl.relativeURL("../");

function preparePermissions() {
    const user = new EDDAuto.User({
        "container": $("#permission_user_box"),
    });
    user.init();
    const group = new EDDAuto.Group({
        "container": $("#permission_group_box"),
    });
    group.init();

    // check public permission input on click
    $("#set_everyone_permission").on("click", function () {
        $("#permission_public").prop("checked", true);
    });
    $("#set_group_permission").on("click", function () {
        $("#permission_group").prop("checked", true);
    });
    $("#set_user_permission").on("click", function () {
        $("#permission_user").prop("checked", true);
    });

    $("form#permissions")
        .on("submit", (ev: JQueryEventObject): boolean => {
            const perm: any = {};
            const auto: JQuery = $("form#permissions").find("[name=class]:checked");
            const klass: string = auto.val() as string;
            const token: string = $("form#permissions")
                .find("[name=csrfmiddlewaretoken]")
                .val() as string;
            perm.type = $(auto).siblings("select").val();
            perm[klass.toLowerCase()] = {
                "id": $(auto).siblings("input:hidden").val(),
            };
            $.ajax({
                // TODO: fix hard-coded URL
                "url": Utl.relativeURL("permissions/", studyBaseUrl).toString(),
                "type": "POST",
                "data": {
                    "data": JSON.stringify([perm]),
                    "csrfmiddlewaretoken": token,
                },
                "success": (): void => {
                    // reset permission options
                    $("form#permissions")
                        .find(".autocomp_search")
                        .siblings("select")
                        .val("N");
                    // reset input
                    $("form#permissions").find(".autocomp_search").val("");

                    $("<div>")
                        .text("Permission Updated")
                        .addClass("success")
                        .appendTo($("form#permissions"))
                        .delay(2000)
                        .fadeOut(2000);
                },
                "error": (xhr, status, err): void => {
                    // reset permission options
                    $("form#permissions")
                        .find(".autocomp_search")
                        .siblings("select")
                        .val("N");
                    // reset input
                    $("form#permissions").find(".autocomp_search").val("");
                    $("<div>")
                        .text("Server Error: " + err)
                        .addClass("bad")
                        .appendTo($("form#permissions"))
                        .delay(5000)
                        .fadeOut(2000);
                },
            });
            return false;
        })
        .find(":radio")
        .trigger("change")
        .end()
        .removeClass("off");
    // set style on inputs for permissions
    $("#permission_user_box")
        .find("input")
        .insertBefore("#user_permission_options")
        .addClass("permissionUser");
    $("#permission_group_box")
        .find("input")
        .insertBefore("#group_permission_options")
        .addClass("permissionGroup");
    $("#permission_public_box").addClass("permissionGroup");

    // Set up the Add Measurement to Assay modal
    $("#permissionsSection").dialog({
        "minWidth": 500,
        "autoOpen": false,
    });

    $("#addPermission").click(function () {
        $("#permissionsSection").removeClass("off").dialog("open");
        return false;
    });
}

export class EditableStudyDescription extends StudyBase.EditableStudyElement {
    minimumRows: number;

    constructor(inputElement: HTMLElement, style?: string) {
        super(inputElement, style);
        this.minimumRows = 4;
        this.fieldName("description");
        this.formURL($(inputElement).parents("form").attr("data-rest"));
    }

    getValue(): string {
        return $(this.inputElement).val() as string;
    }

    blankLabel(): string {
        return "(click to add description)";
    }
}

export class EditableStudyContact extends EDDEditable.EditableAutocomplete {
    constructor(inputElement: HTMLElement, style?: string) {
        super(inputElement, style);
        this.fieldName("contact_id");
        this.formURL($(inputElement).parents("form").attr("data-rest"));
    }

    canCommit(value): boolean {
        return "" !== value.trim();
    }

    getValue(): string {
        return $(this.inputElement).val() as string;
    }
}

// Called when the page loads.
export function prepareIt() {
    const contact = $("#editable-study-contact").get()[0] as HTMLElement;
    const desc = $("#editable-study-description").get()[0] as HTMLElement;
    const contactEdit = new EditableStudyContact(contact);
    const descEdit = new EditableStudyDescription(desc);
    contactEdit.getValue();
    descEdit.getValue();

    $("#helpExperimentDescription").tooltip({
        "content": () => $("#helpExperimentDescription > .helpContent").html(),
        "items": "#helpExperimentDescription",
        "position": {
            "my": "right top",
            "at": "right bottom",
            "of": "#helpExperimentDescription",
        },
    });

    const helper = new Utl.FileDropZoneHelpers({
        // TODO: fix hard-coded URL
        "pageRedirect": "description/",
    });

    Utl.FileDropZone.create({
        "elementId": "experimentDescDropZone",
        // TODO: fix hard-coded URL
        "url": Utl.relativeURL("describe/", studyBaseUrl),
        // must bind these functions; otherwise the function this will be the options object
        // here, instead of the helper object
        "processResponseFn": helper.fileReturnedFromServer.bind(helper),
        "processErrorFn": helper.fileErrorReturnedFromServer.bind(helper),
        "processWarningFn": helper.fileWarningReturnedFromServer.bind(helper),
    });

    $(window).on("load", preparePermissions);
}

// wait for edddata event to begin processing page
$(document).on("edddata", prepareIt);
