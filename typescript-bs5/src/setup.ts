"use strict";

import "jquery";
import ReconnectingWebSocket from "reconnecting-websocket";

import * as EDDAuto from "./utility/autocomplete";
import { relativeURL } from "./utility/url";

function ajaxGet(url?: string): JQuery.AjaxSettings {
    if (url === undefined) {
        url = window.location.href;
    }
    return {
        "cache": false,
        "contentType": false,
        "processData": false,
        "type": "GET",
        "url": url,
    };
}

function buildWebsocketURL(path: string) {
    const url = relativeURL(path, new URL(window.location.origin));
    url.protocol = "https:" === url.protocol ? "wss:" : "ws:";
    return url.toString();
}

function errorReload() {
    window.location.reload();
}

function replaceContent(parent: JQuery): (fragment: string) => void {
    return (fragment: string) => {
        parent.empty().append(fragment);
        EDDAuto.initSelect2(parent.find(".autocomp2"));
    };
}

function setupFormNavigation(): void {
    const parent = $("#edd-interpret-block");
    parent.on("click", "#edd-form-nav a", (e) => {
        const url = $(e.currentTarget).attr("href");
        e.preventDefault();
        e.stopPropagation();
        $.ajax(ajaxGet(url)).done(replaceContent(parent)).fail(errorReload);
        return false;
    });
}

function setupSaveProgress(): void {
    const parent = $("#edd-setup-save");
    const path = parent.data("progressPath");
    if (path) {
        const socket = new ReconnectingWebSocket(buildWebsocketURL(path));
        const bar = parent.find(".progress-bar");
        const outer = bar.parent(".progress");
        socket.onmessage = (e) => {
            const payload = JSON.parse(e.data);
            const previous = parent.data("progressStatus");
            const fraction = payload.saved.records / payload.resolved;
            const maxWidth = outer.width();
            const haveWidth = bar.width();
            const wantWidth = maxWidth * fraction;
            const delta = Math.floor(wantWidth - haveWidth);
            const percent = Math.floor(100 * fraction);
            bar.attr("aria-valuenow", percent).animate(
                { "width": `+=${delta}px` },
                { "duration": "fast", "easing": "linear", "queue": false },
            );
            if (payload.status === "Done") {
                bar.removeClass("progress-bar-animated progress-bar-striped");
                bar.addClass("bg-success");
                bar.stop(true, true).width("100%");
                window.setTimeout(() => {
                    window.location.href = parent.data("successRedirect");
                }, 250);
            } else if (payload.status !== previous) {
                parent.data("progressStatus", payload.status);
                $.ajax(ajaxGet()).done(replaceContent(parent)).fail(errorReload);
            }
        };
    }
}

function setupUploadProgress(): void {
    const parent = $("#edd-setup-progress");
    const path = parent.data("progressPath");
    if (path) {
        const socket = new ReconnectingWebSocket(buildWebsocketURL(path));
        socket.onmessage = (e) => {
            const payload = JSON.parse(e.data);
            const previous = parent.data("progressStatus");
            parent.find(".edd-setup-resolved").text(payload.resolved);
            parent.find(".edd-setup-unresolved").text(payload.unresolved);
            if (payload.status !== previous) {
                parent.data("progressStatus", payload.status);
                $.ajax(ajaxGet()).done(replaceContent(parent)).fail(errorReload);
            }
        };
    }
}

$(() => {
    setupSaveProgress();
    setupUploadProgress();
    setupFormNavigation();
});
