"use strict";

import "jquery";
import ReconnectingWebSocket from "reconnecting-websocket";

import { relativeURL } from "./url";

export interface Options {
    path?: string;
    stub?: boolean;
}

type WireMessage = [string, string[], any, number, string];
export interface Message {
    message: string;
    tags: string[];
    payload: any;
    time: Date;
    uuid: string;
}

interface Command {
    unread: number;
}
interface NoticeMessage extends Command {
    messages: WireMessage[];
}
interface NoticeDismiss extends Command {
    dismiss: string;
}

function contains(object: any, key: string): boolean {
    return Object.prototype.hasOwnProperty.call(object, key);
}

type DisplayCallback = (msgs: Message[], count: number) => void;
type TagAction = (message: Message) => void;

export class Socket {
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
            this.socket.onopen = (e) => this.opened(e);
            this.socket.onclose = (e) => this.closed(e);
            this.socket.onmessage = (e) => this.receive(e);
        }
    }

    markAllRead(): void {
        this.send({ "reset": true });
        this.resetMessages();
        this.updateSubscribers();
    }

    markRead(uuid: string): void {
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
        const url = relativeURL(path, new URL(window.location.origin));
        url.protocol = "https:" === url.protocol ? "wss:" : "ws:";
        return url;
    }

    private opened(event) {
        $.event.trigger("eddwsopened");
        return;
    }

    private closed(event) {
        $.event.trigger("eddwsclosed", [this.socket.retryCount]);
        return;
    }

    private receive(event: MessageEvent<string>) {
        const payload: Command = JSON.parse(event.data);
        if (contains(payload, "messages")) {
            this.processMessages(payload as NoticeMessage);
        } else if (contains(payload, "reset")) {
            this.resetMessages();
        } else if (contains(payload, "dismiss")) {
            this.dismissMessage(payload as NoticeDismiss);
        }
        this.updateSubscribers();
    }

    private dismissMessage(payload: NoticeDismiss) {
        delete this.messages[payload.dismiss];
        this.count = payload.unread;
    }

    private loadMessage(msg: WireMessage): Message {
        return {
            "message": msg[0],
            "tags": msg[1],
            "payload": msg[2],
            "time": new Date(msg[3] * 1000), // comes in sec instead of ms
            "uuid": msg[4],
        };
    }

    private processMessages(payload: NoticeMessage) {
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

export class Menu {
    badge: JQuery;
    dropdown: JQuery;
    messageList: JQuery;
    messageTemplate: JQuery;
    emptyMessage: JQuery;
    closeAll: JQuery;
    socket: Socket;

    constructor(element: HTMLElement, socket: Socket) {
        const menu = $(element);
        this.badge = menu.find(".badge");
        this.dropdown = menu.find(".dropdown-menu");
        this.messageList = menu.find(".message-list");
        this.messageTemplate = menu.find(".message").remove();
        this.emptyMessage = this.dropdown.find(".message-empty");
        this.closeAll = this.dropdown.find(".close-all");
        this.socket = socket;

        this.socket.subscribe(this.display.bind(this));
        this.dropdown.on("click", ".notification-close", this.markRead.bind(this));
        this.dropdown.on("click", ".close-all button", this.markAllRead.bind(this));
    }

    display(msgs: Message[], count: number): void {
        const empty = count === 0;
        this.messageList.find(".message").remove();
        this.emptyMessage.toggleClass("d-none", !empty);
        this.closeAll.toggleClass("d-none", empty).toggleClass("d-flex", !empty);
        if (count > 0) {
            this.badge.text(count.toString());
            $.map(msgs, (msg) => this.emptyMessage.before(this.processMessage(msg)));
        } else {
            this.badge.empty();
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
        const item = this.messageTemplate.clone();
        item.find(".message-text").html(message.message);
        item.removeClass("d-none").addClass("d-flex").data("uuid", message.uuid);
        return item;
    }
}
