"use strict";

import "bootstrap";
import "jquery";

import * as EDDAuto from "./utility/autocomplete";
import * as Notification from "./utility/notification";
import {
    handleChangeRequiredInput,
    handleInvalidRequiredInput,
    initializeInputsWithErrors,
} from "./utility/form";
import "./utility/style";

function buildMenu(
    menuElement: HTMLElement,
    socket: Notification.Socket,
): Notification.Menu {
    return new Notification.Menu(menuElement, socket);
}

// called when the page loads
function prepareIt(): void {
    // adding click handlers to close buttons on status messages
    $(document).on("click", ".statusMessage a.close", function (ev) {
        const link = $(this);
        const href = link.attr("close-href");
        const token = $(".statusMessage [name=csrfmiddlewaretoken]").first().val();
        ev.preventDefault();
        if (href) {
            $.post(href, { "csrfmiddlewaretoken": token }, function () {
                link.parent().fadeOut();
            });
        } else {
            link.parent().fadeOut();
        }
    });

    // adding handlers for notifications in menubar
    const menuElement = document.getElementById("notification-menu");
    if (menuElement instanceof HTMLElement) {
        const socket = new Notification.Socket();
        buildMenu(menuElement, socket);

        // Add a handler to auto-download messages with the "download" tag
        socket.addTagAction("download", (message) => {
            // only acting if the current document is active and focused
            if (document.hasFocus()) {
                const downloadLink = message.payload.url;
                // and only act if a link is found
                if (downloadLink) {
                    socket.markRead(message.uuid);
                    window.location.replace(downloadLink);
                }
            }
        });
        // Add a handler to check for repeated failed websocket connections
        // If a ping returns an un-authenticated status, reload to force login
        $(document).on("eddwsclosed", (event, count: number) => {
            // only send ping if multiple retries already failed
            if (count > 2) {
                $.get("/ping/").fail((xhr) => {
                    if (xhr.status === 403) {
                        // logged out, refresh the page
                        window.location.reload();
                    }
                });
            }
        });
    }

    // adding handlers for autocompletes
    EDDAuto.initSelect2();
    // adding handlers for required input validation
    $(document).on("blur input", "input[required]", handleChangeRequiredInput);
    // invalid event must be directly attached to elements
    $("input[required]").on("invalid", handleInvalidRequiredInput);
    // Set correct aria-invalid value for fields with server-set errors
    initializeInputsWithErrors($(".has-error input"));
}

// use JQuery ready event shortcut to call prepareIt when page is ready
$(prepareIt);
