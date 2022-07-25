"use strict";

import "jquery";

$(() => {
    $("#show-password")
        .removeClass("d-none")
        .on("click", (e) => {
            e.preventDefault();
            const target = $(e.currentTarget);
            const mode = target.attr("aria-pressed") === "false" ? "On" : "Off";
            const icon = {
                "On": `<i class="fas fa-eye-slash"></i>`,
                "Off": `<i class="fas fa-eye"></i>`,
            };
            const pressed = { "On": "true", "Off": "false" };
            const type = { "On": "text", "Off": "password" };
            const label = target.data(`label${mode}`);
            target.attr("title", label).attr("aria-label", label).html(icon[mode]);
            $("#id_password").attr("type", type[mode]);
            $("#password-text").text(target.data(`sr${mode}`));
            target.attr("aria-pressed", pressed[mode]);
            return false;
        });
});
