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

export let notificationSocket = new Notification.NotificationSocket({ "stub": true });

function buildMenu(menuElement: HTMLElement): Notification.NotificationMenu {
    return new Notification.NotificationMenu(menuElement, notificationSocket);
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
        notificationSocket = new Notification.NotificationSocket();
        buildMenu(menuElement);

        // Add a handler to auto-download messages with the "download" tag
        notificationSocket.addTagAction("download", (message) => {
            // only acting if the current document is active and focused
            if (document.hasFocus()) {
                const downloadLink = message.payload.url;
                // and only act if a link is found
                if (downloadLink) {
                    notificationSocket.markRead(message.uuid);
                    window.location.replace(downloadLink);
                }
            }
        });
    }
}

// use JQuery ready event shortcut to call prepareIt when page is ready
$(prepareIt);
