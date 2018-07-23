import * as $ from "jquery";
import "bootstrap-loader";
import * as Notification from "../modules/Notification";

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
    let socket = new Notification.NotificationSocket();
    let menuElement = document.getElementById('notification-dropdown');
    let menu = new Notification.NotificationMenu(menuElement, socket);

    // add handler to auto-download messages with the download tag
    menu.tagActions.download = (message, item) => {
        // only acting if the current document is active and focused
        if (document.hasFocus()) {
            let downloadLink = item.find('a.download').attr('href');
            // and only act if a link is found
            if (downloadLink) {
                socket.markRead(message.uuid);
                window.location.replace(downloadLink);
            }
        }
        return item;
    };
}

// use JQuery ready event shortcut to call prepareIt when page is ready
$(prepareIt);
