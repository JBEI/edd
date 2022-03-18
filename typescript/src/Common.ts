import "jquery";
// including these here to make sure available on every page extending edd_base.html
import "jquery-ui/ui/effects/effect-bounce";
import "jquery-ui/ui/widgets/button";
import "jquery-ui/ui/widgets/dialog";
import "jquery-ui/ui/widgets/selectable";
import "jquery-ui/ui/widgets/sortable";
import "jquery-ui/ui/widgets/spinner";

import * as Notification from "../modules/Notification";

import "../modules/Styles";

function buildMenu(
    menuElement: HTMLElement,
    socket: Notification.NotificationSocket,
): Notification.NotificationMenu {
    return new Notification.NotificationMenu(menuElement, socket);
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
    const menuElement = document.getElementById("notification-dropdown");
    if (menuElement instanceof HTMLElement) {
        const socket = new Notification.NotificationSocket();
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
}

// use JQuery ready event shortcut to call prepareIt when page is ready
$(prepareIt);
