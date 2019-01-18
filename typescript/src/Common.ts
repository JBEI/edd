import * as $ from "jquery";
import "bootstrap-loader";
import * as Notification from "../modules/Notification";

export const notificationSocket = new Notification.NotificationSocket();

// called when the page loads
export function prepareIt() {

    // adding click handlers to close buttons on status messages
    $(document).on('click', '.statusMessage a.close', function (ev) {
        var link = $(this),
            href = link.attr('close-href'),
            token = $('.statusMessage [name=csrfmiddlewaretoken]').first().val();
        ev.preventDefault();
        if (href) {
            $.post(href, {'csrfmiddlewaretoken': token}, function () {
                link.parent().fadeOut();
            });
        } else {
            link.parent().fadeOut();
        }
    });

    // adding handlers for notifications in menubar
    let menuElement = document.getElementById('notification-dropdown');
    let menu = new Notification.NotificationMenu(menuElement, notificationSocket);

    // Add a handler to auto-download messages with the "download" tag
    // This handler is somewhat special in that it uses the browser to parse the HTML message
    // content to extract the download link
    notificationSocket.addTagAction('download', (message) => {
        // only acting if the current document is active and focused
        if (document.hasFocus()) {
            let downloadLink = message.payload.url;
            // and only act if a link is found
            if (downloadLink) {
                notificationSocket.markRead(message.uuid);
                window.location.replace(downloadLink);
            }
        }
    });

    // as a stopgap, silence menubar-level user notifications resulting from progression
    // through the steps of the import process.  These notifications will eventually be valuable
    // once we have support for monitoring imports or resumption of a work-in-progress import
    notificationSocket.addTagAction('import-status-update', (message) => {
        notificationSocket.markRead(message.uuid);
    });
}

// use JQuery ready event shortcut to call prepareIt when page is ready
$(prepareIt);
