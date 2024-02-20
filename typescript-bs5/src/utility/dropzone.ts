"use strict";

import * as d3 from "d3";
import "jquery";
import { default as Dropzone } from "dropzone";

import { findCSRFToken } from "./form";
import { relativeURL } from "./url";

/**
 * Shape of JSON data returned for errors and warnings in EDD.
 */
interface Fault {
    // required fault members
    /** Short string classifying the type of the Fault */
    category: string;
    /** String describing specific condition of the Fault */
    summary: string;
    // optional faults, specific to edd.describe uploads
    // see: server/edd/describe/importer.py#ImportErrorSummary
    /** (optional) defined, but not yet used. TODO: remove */
    corrective_action?: string;
    /** (optional) String adding details about values causing the Fault */
    details?: string;
    /** (optional) defined, but not yet used. TODO: remove */
    help_reference?: string;
    // optional faults, specific to edd.load uploads
    // see: server/edd/load/exceptions/core.py#MessagingMixin
    /** (optional) String adding details about values causing the Fault */
    detail?: string;
    /** (optional) String with URL to documentation re: the Fault */
    docs_link?: string;
    /** (optional) String describing how to resolve the Fault */
    resolution?: string;
    /**
     * (optional) Short string further classifying the type of the Fault.
     * NOTE: this seems overly complicated, and could be removed.
     */
    subcategory?: string;
}

/**
 * Shape of JSON data returned from EDD for Description file uploads.
 */
interface DescriptionResponse {
    // error-related possible response keys
    /** (optional) semi-sorted listing of serialized exceptions */
    errors?: Fault[];
    /** (optional) semi-sorted listing of serialized warnings */
    warnings?: Fault[];

    // dry-run-related possible response keys
    /** (optional) in a dry-run, count of lines to be created */
    count?: number;
    /** (optional) in a dry-run, array of name strings to be created */
    lines?: string[];

    // executed-run-related possible response keys
    /** (optional) after execution, count of assays created */
    assays_created?: number;
    /** (optional) after execution, count of lines created */
    lines_created?: number;
    /** (optional) after execution, total number of seconds needed to process data */
    runtime_seconds?: number;
    /** (optional) after execution, URL to redirect on success */
    success_redirect?: string;
}

type dzClickOption = boolean | string | HTMLElement | (string | HTMLElement)[];

function tryJSON(text: string): any {
    try {
        return JSON.parse(text);
    } catch {
        return undefined;
    }
}

/**
 * Common handling code for Dropzone events in both the Overview and Lines
 * (aka Experiment Description) pages. Manipulates DOM added in
 * server/main/templates/main/include/dropzone_messages.html
 */
export class DescriptionDropzone {
    /**
     * Remove all visible (non-template) alerts from the DOM.
     */
    static clearAlerts(): JQuery {
        const parent = $("#alert_placeholder");
        parent.children(".alert:visible").remove();
        $("#dismissAll").addClass("d-none");
        return parent;
    }

    /**
     * Helper method to run setup on the dropzone and messages elements.
     */
    static initialize(dropElement: JQuery, clickable?: dzClickOption): void {
        if (dropElement.length !== 1) {
            return;
        }
        const dropzone = new Dropzone(dropElement.addClass("dropzone").get(0), {
            "clickable": clickable === undefined ? true : clickable,
            "params": { "csrfmiddlewaretoken": findCSRFToken() },
            "timeout": 0,
            "url": dropElement.data("url"),
        });
        dropzone.on("sending", (file, xhr, formData) => {
            DescriptionDropzone.clearAlerts();
        });
        dropzone.on("error", (file, msg) => {
            dropzone.removeAllFiles();
            DescriptionDropzone.error(dropzone, file, tryJSON(file.xhr.response));
        });
        dropzone.on("success", (file) => {
            const response = tryJSON(file.xhr.response);
            dropzone.removeAllFiles();
            if (!response) {
                DescriptionDropzone.error(dropzone, file);
            } else if (response.warnings) {
                DescriptionDropzone.warning(file, response);
            } else {
                DescriptionDropzone.success(file, response);
            }
        });
        // listen for alert closes
        $(document).on("closed.bs.alert", "#alert_placeholder", (event) => {
            const parent = $("#alert_placeholder");
            const alert = $(event.target).closest(".alert");
            // if there's a next alert, focus it
            alert.next(".alert").focus();
            // if no alerts left, call clearAlerts to hide dismiss all button
            if (parent.children(".alert:visible").length === 0) {
                DescriptionDropzone.clearAlerts();
            }
        });
    }

    /**
     * Displays an alert message in the dropzone messages area.
     */
    static showMessage(
        title: string,
        message: string,
        alertType: "danger" | "warning",
    ): JQuery {
        const parent = $("#alert_placeholder");
        const template = parent.find(`.alert-${alertType}`).first();
        const alert = template.clone();
        alert.children("h4").text(title).after($("<p>").text(message));
        return alert.appendTo(parent).removeClass("d-none");
    }

    private static checkForStrainError(
        parent: JQuery,
        messages: Fault[],
        dropzone: Dropzone,
        file: Dropzone.DropzoneFile,
    ): void {
        const strainErrors = messages.filter(
            (fault) => fault.category.indexOf("ICE") >= 0,
        );
        // if only errors are in accessing ICE, allow Omit Strains button
        if (strainErrors && strainErrors.length === messages.length) {
            // reset dropzone to prepare for re-send
            dropzone.removeAllFiles();
            file.status = undefined;
            file.accepted = undefined;
            // show alerts
            DescriptionDropzone.showAlerts(
                parent,
                strainErrors,
                "warning",
                $("#iceError"),
            );
            // handle clicks on Cancel button(s)
            parent.find(".noOmitStrains").on("click", () => {
                DescriptionDropzone.clearAlerts();
                return false;
            });
            // handle clicks on Omit Strains button
            parent.find(".omitStrains").on("click", () => {
                if (typeof dropzone.options.url !== "string") {
                    throw new Error("Cannot omit strains with callback URL");
                }
                const url = relativeURL(dropzone.options.url);
                // remove alert from DOM so this can't be clicked again
                DescriptionDropzone.clearAlerts();
                // re-submit with parameter to ignore strain access errors
                url.searchParams.append("IGNORE_ICE_ACCESS_ERRORS", "true");
                dropzone.options.url = url.toString();
                dropzone.addFile(file);
                return false;
            });
        } else {
            // if any errors are not in accessing ICE, show all errors
            DescriptionDropzone.showAlerts(parent, messages, "danger");
            // if more than two errors, show the dismissAll button
            $("#dismissAll")
                .removeClass("d-none")
                .one("click", "button", () => {
                    DescriptionDropzone.clearAlerts();
                    return false;
                });
        }
    }

    /**
     * Callback handler for uploads with errors via Dropzone for Description files.
     */
    private static error(
        dropzone: Dropzone,
        file: Dropzone.DropzoneFile,
        response?: DescriptionResponse,
    ): void {
        const parent = DescriptionDropzone.clearAlerts();
        // handle errors based on HTTP status code
        const status = file.xhr.status;
        switch (status) {
            case 504: // Gateway Timeout
                DescriptionDropzone.show504Alert(parent);
                break;
            default:
                if (response) {
                    // normal response, show error and warning alerts
                    DescriptionDropzone.checkForStrainError(
                        parent,
                        response.errors || [],
                        dropzone,
                        file,
                    );
                    DescriptionDropzone.showAlerts(
                        parent,
                        response.warnings || [],
                        "warning",
                    );
                } else {
                    // if not a normal response, show unknown error alert
                    DescriptionDropzone.showUnknownAlert(parent);
                }
        }
    }

    private static redirect(response: DescriptionResponse): void {
        // wait for one second, then change the window location to the redirect URL
        window.setTimeout(() => {
            window.location.href = response.success_redirect;
        }, 1000);
    }

    private static show504Alert(parent: JQuery): void {
        const template = parent.find("#edd-504").clone();
        template.appendTo(parent).removeClass("d-none");
    }

    /**
     * Groups faults returned, and displays alerts for each category.
     */
    private static showAlerts(
        parent: JQuery,
        messages: Fault[],
        alertType: "danger" | "warning",
        template: JQuery = null,
    ): JQuery[] {
        const grouped = d3.group(messages, (m) => m.category);
        if (template === null) {
            template = parent.find(`.alert-${alertType}`).first();
        }
        return Array.from(grouped.entries()).map(([category, items]): JQuery => {
            const alert = template.clone();
            alert
                .children("h4")
                .text(category)
                .after(
                    items.map((fault) =>
                        $("<p>").text(`${fault.summary}: ${fault.details}`),
                    ),
                );
            return alert.appendTo(parent).removeClass("d-none");
        });
    }

    private static showUnknownAlert(parent: JQuery): void {
        const template = parent.find("#edd-500").clone();
        template.appendTo(parent).removeClass("d-none");
    }

    /**
     * Callback handler for successful uploads via Dropzone for Description files.
     */
    private static success(
        file: Dropzone.DropzoneFile,
        response: DescriptionResponse,
    ): void {
        DescriptionDropzone.clearAlerts();

        // display success message
        const p = $("<p>").text(`Success! ${response.lines_created} lines added!`);
        $("#linesAdded").removeClass("off").append(p);
        // redirect to the URL indicated in response
        DescriptionDropzone.redirect(response);
    }

    /**
     * Callback handler for uploads with warnings via Dropzone for Description files.
     */
    private static warning(
        file: Dropzone.DropzoneFile,
        response: DescriptionResponse,
    ): void {
        const parent = DescriptionDropzone.clearAlerts();

        // display success message
        const p = $("<p>").text(`Success! ${response.lines_created} lines added!`);
        $("#linesAdded").removeClass("off").append(p);
        // enable button to accept warnings
        const acceptButton = $("#acceptWarnings").on("click", "button", (): boolean => {
            DescriptionDropzone.redirect(response);
            return false;
        });

        // add alerts to the placeholder area
        const alerts = DescriptionDropzone.showAlerts(
            parent,
            response.warnings,
            "warning",
        );
        // place button in alert if there's only one, otherwise place above all alerts
        if (alerts.length === 1) {
            alerts[0].append(acceptButton);
        } else {
            parent.prepend(acceptButton);
        }
        acceptButton.removeClass("off").show();
    }
}
