"use strict";

import "jquery";
import { default as Dropzone } from "dropzone";
import ReconnectingWebSocket from "reconnecting-websocket";

import * as EDDAuto from "./utility/autocomplete";
import { findCSRFToken } from "./utility/form";
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

function redirect(url: string): void {
    window.setTimeout(() => {
        window.location.href = url;
    }, 250);
}

function replaceContent(parent: JQuery): (fragment: string) => void {
    return (fragment: string) => {
        parent.empty().append(fragment);
        EDDAuto.initSelect2(parent.find(".autocomp2"));
    };
}

function setupCommitProgress(): void {
    const parent = $("#edd-save-block");
    const path = parent.data("progressPath");
    if (path) {
        const socket = new ReconnectingWebSocket(buildWebsocketURL(path));
        const bar = parent.find(".progress-bar");
        const outer = bar.parent(".progress");
        socket.onmessage = (e) => {
            const payload = JSON.parse(e.data);
            const saved = payload.added + payload.updated;
            const fraction = saved / payload.resolved;
            const maxWidth = outer.width();
            const haveWidth = bar.width();
            const wantWidth = maxWidth * fraction;
            const delta = Math.floor(wantWidth - haveWidth);
            const percent = Math.floor(100 * fraction);
            bar.attr("aria-valuenow", percent).animate(
                { "width": `+=${delta}px` },
                { "duration": "fast", "easing": "linear", "queue": false },
            );
            if (payload.status === "Aborted") {
                bar.removeClass("progress-bar-animated progress-bar-striped");
                bar.addClass("bg-warning");
                bar.stop(true, true);
            } else if (payload.status === "Failed") {
                bar.removeClass("progress-bar-animated progress-bar-striped");
                bar.addClass("bg-danger");
                bar.stop(true, true);
            } else if (payload.status === "Completed") {
                bar.removeClass("progress-bar-animated progress-bar-striped");
                bar.addClass("bg-success");
                bar.stop(true, true).width("100%");
                redirect(parent.data("successRedirect"));
            }
        };
    }
}

function setupDropzone(): void {
    // if the current page has a dropzone, set it up
    const form = $("form.dropzone");
    if (form.length) {
        const options = { "params": { "csrfmiddlewaretoken": findCSRFToken() } };
        const dz = new Dropzone(form[0], options);
        dz.on("success", (file) => {
            try {
                const payload = JSON.parse(file.xhr?.response);
                // wait a bit, then change the window location to the redirect URL
                redirect(payload?.url);
            } catch {
                errorReload();
            }
        });
        dz.on("error", errorReload);
    }
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

function setupUploadProgress(): void {
    const parent = $("#edd-interpret-block");
    const path = parent.data("progressPath");
    if (path) {
        const socket = new ReconnectingWebSocket(buildWebsocketURL(path));
        socket.onmessage = (e) => {
            const payload = JSON.parse(e.data);
            const previous = parent.data("progressStatus");
            parent.find(".edd-upload-resolved").text(payload.resolved);
            parent.find(".edd-upload-unresolved").text(payload.unresolved);
            if (payload.status !== previous) {
                parent.data("progressStatus", payload.status);
                $.ajax(ajaxGet()).done(replaceContent(parent)).fail(errorReload);
            }
        };
    }
}

Dropzone.autoDiscover = false;
$(() => {
    setupDropzone();
    setupUploadProgress();
    setupFormNavigation();
    setupCommitProgress();
});
