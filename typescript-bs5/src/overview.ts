"use strict";

import "jquery";

import { DescriptionDropzone } from "./utility/dropzone";

function postAjax(form: JQuery): JQuery.AjaxSettings {
    return {
        "cache": false,
        "contentType": false,
        "data": new FormData(form[0] as HTMLFormElement),
        "processData": false,
        "type": "POST",
        "url": form.attr("action"),
    };
}

function setupDropzone(): void {
    const dropzoneDiv = $("#experimentDescDropZone");
    DescriptionDropzone.initialize(dropzoneDiv, ".dz-browse-link");
    $(".dz-message,.dz-browse-link").removeClass("d-none");
}

function switchStudyEditDisplay(): void {
    $("#edd-studyinfo-readonly,#edd-studyinfo-editable").toggleClass("d-none");
    $("#edd-studyinfo-edit").toggleClass("d-none");
}

function setupStudyEdit(): void {
    $(document).on(
        "click",
        "#edd-studyinfo-edit,#edd-studyinfo-cancel",
        switchStudyEditDisplay,
    );
    $(document).on("submit", "#edd-studyinfo-form", (ev) => {
        const form = $(ev.currentTarget);
        const buttons = $("#edd-studyinfo-update,#edd-studyinfo-saving");
        ev.preventDefault();
        if (ev.currentTarget.checkValidity()) {
            buttons.toggleClass("d-none").prop("disabled", true);
            $.ajax(postAjax(form))
                .done((fragment) => {
                    $("#edd-studyinfo-readonly").html(fragment);
                    switchStudyEditDisplay();
                })
                .fail((jqXHR) => {
                    $("#edd-studyinfo-editable").html(jqXHR.responseText);
                })
                .always(() => {
                    buttons.toggleClass("d-none").prop("disabled", false);
                });
        }
        return false;
    });
}

function setupPermissionEdit(): void {
    $("#edd-studyperm-editable").removeClass("d-none");
    $(document).on("submit", "#edd-studyperm-form", (ev) => {
        const form = $(ev.currentTarget);
        const buttons = $("#edd-studyperm-update,#edd-studyperm-saving");
        ev.preventDefault();
        if (ev.currentTarget.checkValidity()) {
            buttons.toggleClass("d-none").prop("disabled", true);
            $.ajax(postAjax(form))
                .done((fragment) => {
                    $("#edd-studyperm-readonly").html(fragment);
                })
                .fail((jqXHR) => {
                    $("#edd-studyperm-editable").html(jqXHR.responseText);
                })
                .always(() => {
                    buttons.toggleClass("d-none").prop("disabled", false);
                });
        }
        return false;
    });
    $(document).on("click", "#edd-studyperm-readonly .btn", (ev) => {
        const button = $(ev.currentTarget);
        const form = $("#edd-studyperm-form");
        // update #edd-studyperm-form with data attached to button
        const option = new Option(
            button.data("label"),
            JSON.stringify({
                "id": button.data("targetId"),
                "type": button.data("targetType"),
            }),
            true,
            true,
        );
        form.find("[name=who]").append(option).trigger("change");
        const level = button.data("level");
        if (level) {
            // if it's the edit button, focus the perm select
            form.find("[name=perm]").val(level).trigger("change").trigger("focus");
        } else if (button.data("remove")) {
            // if it's the delete button, trigger form submit
            form.find("[name=perm]").val("N").trigger("change");
            form.trigger("submit");
        }
    });
}

function setupAttachmentAdd(): void {
    $(document).on("submit", "#edd-attachment-form", (ev) => {
        const form = $(ev.currentTarget);
        const buttons = $("#edd-attachment-update,#edd-attachment-saving");
        ev.preventDefault();
        if (ev.currentTarget.checkValidity()) {
            buttons.toggleClass("d-none").prop("disabled", true);
            $.ajax(postAjax(form))
                .done((fragment) => {
                    $("#edd-attachments").html(fragment);
                })
                .fail((jqXHR) => {
                    $("#edd-add-attachment").html(jqXHR.responseText);
                })
                .always(() => {
                    buttons.toggleClass("d-none").prop("disabled", false);
                });
        }
        return false;
    });
}

function setupCommentAdd(): void {
    $(document).on("submit", "#edd-comment-form", (ev) => {
        const form = $(ev.currentTarget);
        const buttons = $("#edd-comment-update,#edd-comment-saving");
        ev.preventDefault();
        if (ev.currentTarget.checkValidity()) {
            buttons.toggleClass("d-none").prop("disabled", true);
            $.ajax(postAjax(form))
                .done((fragment) => {
                    $("#edd-comments").html(fragment);
                })
                .fail((jqXHR) => {
                    $("#edd-add-comment").html(jqXHR.responseText);
                })
                .always(() => {
                    buttons.toggleClass("d-none").prop("disabled", false);
                });
        }
        return false;
    });
}

$(() => {
    setupDropzone();
    setupStudyEdit();
    setupPermissionEdit();
    setupAttachmentAdd();
    setupCommentAdd();
});
