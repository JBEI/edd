"use strict";

import * as $ from "jquery";

import ReconnectingWebSocket from "reconnecting-websocket";
import * as Utl from "./Utl";

export interface Options {
    path?: string;
    stub?: boolean;
}

export interface Message {
    message: string;
    tags: string[];
    payload: any;
    time: Date;
    uuid: string;
}

function contains(object: any, key: string): boolean {
    return Object.prototype.hasOwnProperty.call(object, key);
}

type DisplayCallback = (msgs: Message[], count: number) => void;
type TagAction = (message: Message) => void;

export class NotificationSocket {
    private socket: ReconnectingWebSocket;
    private messages: { [uuid: string]: Message };
    private count: number;
    private subscribers: DisplayCallback[];
    private tagActions: { [tag: string]: TagAction[] };

    constructor(options?: Options) {
        options = options || {};
        const path: string = options.path || "ws/notify/";
        const notify_url: URL = this.buildWebsocketURL(path);

        this.messages = {};
        this.count = 0;
        this.subscribers = [];
        this.tagActions = {};

        if (options.stub) {
            this.socket = null;
        } else {
            this.socket = new ReconnectingWebSocket(notify_url.toString());
            this.socket.onopen = this.opened.bind(this);
            this.socket.onclose = this.closed.bind(this);
            this.socket.onmessage = this.receive.bind(this);
        }
    }

    markAllRead() {
        this.send({ "reset": true });
        this.resetMessages();
        this.updateSubscribers();
    }

    markRead(uuid: string) {
        // keep UUID in messages map, but with null value
        if (contains(this.messages, uuid)) {
            this.messages[uuid] = null;
            --this.count;
        }
        this.send({ "dismiss": uuid });
        this.updateSubscribers();
    }

    subscribe(callback: DisplayCallback): void {
        this.subscribers.push(callback);
        this.updateSubscriber(callback);
    }

    /**
     * Registers a callback for any messages having the given tag.
     */
    addTagAction(tag: string, callback: TagAction): void {
        let actions: TagAction[] = [];
        if (contains(this.tagActions, tag)) {
            actions = this.tagActions[tag];
        } else {
            this.tagActions[tag] = actions;
        }

        actions.push(callback);
    }

    private buildWebsocketURL(path: string): URL {
        const relativeURL = Utl.relativeURL(path, new URL(window.location.origin));
        relativeURL.protocol = "https:" === relativeURL.protocol ? "wss:" : "ws:";
        return relativeURL;
    }

    private opened(event) {
        return;
    }

    private closed(event) {
        return;
    }

    private receive(event) {
        const payload = JSON.parse(event.data);
        if (contains(payload, "messages")) {
            this.processMessages(payload);
        } else if (contains(payload, "reset")) {
            this.resetMessages();
        } else if (contains(payload, "dismiss")) {
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
            "message": msg[0],
            "tags": msg[1],
            "payload": msg[2],
            "time": new Date(msg[3] * 1000), // comes in sec instead of ms
            "uuid": msg[4],
        };
    }

    private processMessages(payload) {
        for (const msg of payload.messages) {
            const message = this.loadMessage(msg);
            // only add if not seen already; a message could arrive after it was
            // dismissed *in this window* but it will already have a key with null value
            if (!contains(this.messages, message.uuid)) {
                this.messages[message.uuid] = message;
            }

            // notify listeners for specific tags
            for (const tag of message.tags) {
                $.map(this.tagActions[tag] || [], (callback) => callback(message));
            }
        }
        this.count = payload.unread;
    }

    private resetMessages() {
        // clear out local message list
        this.messages = {};
        this.count = 0;
        // request updated list from server
        this.send({ "fetch": true });
    }

    private send(payload): void {
        if (this.socket !== null) {
            this.socket.send(JSON.stringify(payload));
        }
    }

    private sortMessages(): Message[] {
        const msgList: Message[] = $.map(this.messages, (v) => v);
        msgList.sort((a, b) => a.time.getTime() - b.time.getTime());
        return msgList;
    }

    private updateSubscribers() {
        // notify all general subscribers of un-dismissed messages
        const messages = this.sortMessages();
        for (const sub of this.subscribers) {
            sub(messages, this.count);
        }
    }

    private updateSubscriber(callback: DisplayCallback) {
        const messages = this.sortMessages();
        callback(messages, this.count);
    }
}

export class NotificationMenu {
    badge: JQuery;
    messageList: JQuery;
    emptyMessage: JQuery;
    socket: NotificationSocket;

    constructor(element: HTMLElement, socket: NotificationSocket) {
        const menu = $(element);
        this.badge = menu.find(".badge");
        this.messageList = menu.find(".dropdown-menu");
        this.emptyMessage = this.messageList.find(".message-empty").clone();
        this.socket = socket;

        this.socket.subscribe(this.display.bind(this));
        this.messageList.on(
            "click",
            "li.message > .message-close",
            this.markRead.bind(this),
        );
        this.messageList.on("click", "li.close-all", this.markAllRead.bind(this));
    }

    display(msgs: Message[], count: number) {
        this.messageList.empty();
        $.map(msgs, (msg) => this.messageList.append(this.processMessage(msg)));
        if (count) {
            this.badge.text("" + count);
            const closeAll = $("<li>").addClass("close-all");
            $("<span>")
                .addClass("message-close")
                .text("Mark All Read")
                .appendTo(closeAll);
            closeAll.appendTo(this.messageList);
        } else {
            this.badge.empty();
            this.emptyMessage.appendTo(this.messageList);
        }
    }

    private markRead(event: JQueryMouseEventObject) {
        const message = $(event.target).closest(".message");
        this.socket.markRead(message.data("uuid"));
        return false;
    }

    private markAllRead(event: JQueryMouseEventObject) {
        this.socket.markAllRead();
        return false;
    }

    private processMessage(message: Message): JQuery | null {
        const item = $("<li>").addClass("message").data("uuid", message.uuid);
        $("<span>").addClass("message-text").html(message.message).appendTo(item);
        $("<span>").addClass("message-close fas fa-times").appendTo(item);
        return item;
    }
}
