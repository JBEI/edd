import * as $ from "jquery";
// including these here to make sure available on every page extending edd_base.html
import "jquery-ui/ui/effects/effect-bounce";
import "jquery-ui/ui/widgets/button";
import "jquery-ui/ui/widgets/dialog";
import "jquery-ui/ui/widgets/selectable";
import "jquery-ui/ui/widgets/sortable";
import "jquery-ui/ui/widgets/spinner";

import * as Notification from "../modules/Notification";

import "../modules/Styles";

export const notificationSocket = new Notification.NotificationSocket();

// called when the page loads
export function prepareIt() {
    // adding click handlers to close buttons on status messages
    $(document).on("click", ".statusMessage a.close", function(ev) {
        const link = $(this);
        const href = link.attr("close-href");
        const token = $(".statusMessage [name=csrfmiddlewaretoken]")
            .first()
            .val();
        ev.preventDefault();
        if (href) {
            $.post(href, { "csrfmiddlewaretoken": token }, function() {
                link.parent().fadeOut();
            });
        } else {
            link.parent().fadeOut();
        }
    });

    // adding handlers for notifications in menubar
    const menuElement = document.getElementById("notification-dropdown");
    const menu = new Notification.NotificationMenu(menuElement, notificationSocket);

    // Add a handler to auto-download messages with the "download" tag
    // This handler is somewhat special in that it uses the browser to parse the HTML message
    // content to extract the download link
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

// use JQuery ready event shortcut to call prepareIt when page is ready
$(prepareIt);
