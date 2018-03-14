
import * as $ from "jquery"
import { Options, default as RWS } from "reconnectingwebsocket"

const ReconnectingWebSocket = require('reconnecting-websocket');


module Notification {
    'use strict';

    export class NotificationMenu {

        socket: RWS;

        constructor(element: Element) {
            // TODO: attach events to page elements for interactions
            this.socket = new ReconnectingWebSocket('ws://edd.lvh.me/notify/', '', {
                automaticOpen: false
            });
        }

        connect() {
            this.socket.open();
        }

        display() {
            // TODO show the notifications
        }

        private opened(event) {
            console.log("NotificationMenu got open event");
        }

        private closed(event) {
            console.log("NotificationMenu got close event");
        }

        private receive(event) {
            //
        }
    }

}
