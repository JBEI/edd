"use strict";

import "jquery";

$(() => {
    $(document).on("click", "#show-password", (e) => {
        e.preventDefault();
        const target = $(e.currentTarget);
        const hidingPassword = target.attr("aria-pressed") === "true";
        if (hidingPassword) {
            const show = $("#show-password-show").text().trim();
            const showLabel = $("#show-password-show-label").text().trim();
            const hiddenSR = $("#show-password-hidden-sr").text().trim();
            target.text(show).attr("aria-label", showLabel);
            $("#id_password").attr("type", "password");
            $("#password-text").text(hiddenSR);
        } else {
            const hide = $("#show-password-hide").text().trim();
            const hideLabel = $("#show-password-hide-label").text().trim();
            const shownSR = $("#show-password-shown-sr").text().trim();
            target.text(hide).attr("aria-label", hideLabel);
            $("#id_password").attr("type", "text");
            $("#password-text").text(shownSR);
        }
        target.attr("aria-pressed", hidingPassword ? "false" : "true");
        return false;
    });
});
