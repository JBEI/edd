import * as $ from "jquery"
import { Options, default as RWS } from "reconnectingwebsocket"
import { Utl } from "./Utl"

// RWS above is the type; ReconnectingWebSocket is the constructor
const ReconnectingWebSocket = require('reconnecting-websocket');


export module Notification {
    'use strict';

    export interface Message {
        message: string;
        tags: string[];
        time: Date;
        uuid: string;
    }

    export interface DisplayCallback {
        (msgs: Message[], count: number): void;
    }

    export interface TagAction {
        /**
         * Callback interface for actions to take on a message display item based on its set tags.
         */
        (message: Message, item: JQuery): JQuery | void;
    }

    export class NotificationSocket {

        private socket: RWS;
        private messages: {[uuid: string]: Message}
        private count: number;
        private subscribers: DisplayCallback[];

        constructor(options?: any) {
            options = options || {};
            let path: string = options['path'] || 'ws/notify/';
            let notify_url: URL = this.buildWebsocketURL(path);

            this.messages = {};
            this.count = 0;
            this.subscribers = [];

            this.socket = new ReconnectingWebSocket(notify_url.toString());
            this.socket.onopen = this.opened.bind(this);
            this.socket.onclose = this.closed.bind(this);
            this.socket.onmessage = this.receive.bind(this);
        }

        markAllRead() {
            this.send({'reset': true});
            this.resetMessages();
            this.updateSubscribers();
        }

        markRead(uuid: string) {
            // keep UUID in messages map, but with null value
            if (this.messages.hasOwnProperty(uuid)) {
                this.messages[uuid] = null;
                --this.count;
            }
            this.send({'dismiss': uuid});
            this.updateSubscribers();
        }

        subscribe(callback: DisplayCallback): void {
            this.subscribers.push(callback);
        }

        private buildWebsocketURL(path: string): URL {
            let relativeURL = Utl.relativeURL(path, new URL(window.location.origin));
            relativeURL.protocol = ('https' === relativeURL.protocol ? 'wss' : 'ws');
            return relativeURL;
        }

        private opened(event) {
        }

        private closed(event) {
        }

        private receive(event) {
            const payload = JSON.parse(event.data);
            if (payload.hasOwnProperty('messages')) {
                this.processMessages(payload);
            } else if (payload.hasOwnProperty('reset')) {
                this.resetMessages();
            } else if (payload.hasOwnProperty('dismiss')) {
                this.dismissMessage(payload);
            }
            this.updateSubscribers();
        }

        private dismissMessage(payload) {
            delete this.messages[payload.dismiss];
            this.count = payload.unread;
        }

        private loadMessage(msg: any[]): Message {
            return {
                'message': msg[0],
                'tags': msg[1],
                'time': new Date(msg[2] * 1000),  // comes in sec instead of ms
                'uuid': msg[3]
            }
        }

        private processMessages(payload) {
            for (let msg of payload.messages) {
                const message = this.loadMessage(msg);
                // only add if not seen already; a message could arrive after it was
                // dismissed *in this window* but it will already have a key with null value
                if (!this.messages.hasOwnProperty(message.uuid)) {
                    this.messages[message.uuid] = message;
                }
            }
            this.count = payload.unread;
        }

        private resetMessages() {
            this.messages = {};
            this.count = 0;
        }

        private send(payload): void {
            this.socket.send(JSON.stringify(payload));
        }

        private updateSubscribers() {
            for (let sub of this.subscribers) {
                let msgList: Message[] = $.map(this.messages, (v) => v);
                msgList.sort((a, b) => a.time.getTime() - b.time.getTime());
                sub(msgList, this.count);
            }
        }
    }

    export class NotificationMenu {

        badge: JQuery;
        messageList: JQuery;
        emptyMessage: JQuery;
        socket: NotificationSocket;
        tagActions: {[tag: string]: TagAction}

        constructor(element: Element, socket: NotificationSocket) {
            let menu = $(element);
            this.badge = menu.find('.badge');
            this.messageList = menu.find('.dropdown-menu');
            this.emptyMessage = this.messageList.find('.message-empty').clone();
            this.socket = socket;
            this.tagActions = {};

            this.socket.subscribe(this.display.bind(this));
            this.messageList.on('click', 'li.message > .message-close', this.markRead.bind(this));
            this.messageList.on('click', 'li.close-all', this.markAllRead.bind(this));

            // bootstrap ends up loading twice, so every click fires two toggle events
            // this is adding a third toggle, until I can figure out where the first two are added
            menu.on('click', () => {
                let expanded = menu.hasClass('open');
                menu.toggleClass('open', !expanded).attr('aria-expanded', '' + !expanded);
            })
        }

        display(msgs: Message[], count: number) {
            this.messageList.empty();
            $.map(msgs, (msg) => this.messageList.append(this.processMessage(msg)));
            if (count) {
                this.badge.text('' + count);
                let closeAll = $('<li>').addClass('close-all');
                $('<span>').addClass('message-close').text('Mark All Read').appendTo(closeAll);
                closeAll.appendTo(this.messageList);
            } else {
                this.badge.empty();
                this.emptyMessage.appendTo(this.messageList);
            }
        }

        private markRead(event: JQueryMouseEventObject) {
            let message = $(event.target).closest('.message');
            this.socket.markRead(message.data('uuid'));
            return false;
        }

        private markAllRead(event: JQueryMouseEventObject) {
            this.socket.markAllRead();
            return false;
        }

        private processMessage(message: Message): JQuery | null {
            let item = $('<li>').addClass('message').data('uuid', message.uuid);
            $('<span>').addClass('message-text').html(message.message).appendTo(item);
            $('<span>').addClass('message-close glyphicon glyphicon-remove').appendTo(item);
            for (let callback of $.map(message.tags, (tag) => this.tagActions[tag])) {
                item = callback(message, item) || item;
            }
            return item;
        }
    }

}
