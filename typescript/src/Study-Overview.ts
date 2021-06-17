"use strict";

import "jquery";

import { DescriptionDropzone } from "../modules/DescriptionDropzone";
import * as EDDAuto from "../modules/EDDAutocomplete";
import * as EDDEditable from "../modules/EDDEditableElement";
import * as StudyBase from "../modules/Study";
import * as Utl from "../modules/Utl";

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

    const permissionForm = $("form#permissions");
    permissionForm
        .on("submit", (event: JQuery.SubmitEvent): boolean => {
            const perm: any = {};
            const auto: JQuery = permissionForm.find("[name=class]:checked");
            const klass: string = auto.val() as string;
            const token: string = $("form#permissions")
                .find("[name=csrfmiddlewaretoken]")
                .val() as string;
            perm.type = $(auto).siblings("select").val();
            perm[klass.toLowerCase()] = {
                "id": $(auto).siblings("input:hidden").val(),
            };
            $.ajax({
                "url": permissionForm.attr("action"),
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

    canCommit(value: string): boolean {
        return "" !== value.trim();
    }

    getValue(): string {
        return $(this.inputElement).val() as string;
    }
}

// Called when the page loads.
function prepareIt() {
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

    const dropzoneDiv = $("#experimentDescDropZone");
    const url = dropzoneDiv.attr("data-url");
    Utl.FileDropZone.create({
        "elementId": "experimentDescDropZone",
        "url": url,
        "clickable": ".dz-browse-link",
        // must bind these functions; otherwise the function this will be the options object
        // here, instead of the helper object
        "processResponseFn": DescriptionDropzone.success,
        "processErrorFn": DescriptionDropzone.error,
        "processWarningFn": DescriptionDropzone.warning,
    });
    $(".dz-message").removeClass("hide");
    preparePermissions();
}

$(prepareIt);
