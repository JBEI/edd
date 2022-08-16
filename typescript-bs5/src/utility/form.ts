"use strict";

import "jquery";

export function findCSRFToken(): string {
    return ($("input[name=csrfmiddlewaretoken]").val() as string) || "";
}

export function initializeInputsWithErrors(inputs: JQuery): void {
    inputs.each((index, input) => {
        input.setAttribute("aria-invalid", "true");
    });
}

export function handleChangeRequiredInput(event: JQueryEventObject): void {
    const input = event.target as HTMLInputElement;
    input.setAttribute("aria-invalid", "false");
    input.setCustomValidity("");
    input.checkValidity();
}

// Override the default HTML validation messages so that the field name
// and additional context is announced to users of assistive technology.
export function handleInvalidRequiredInput(event: JQueryEventObject): void {
    const $input = $(event.target);
    const input = event.target as HTMLInputElement;
    if (input.validity.customError) {
        // if already reporting a customized error, skip doing anything
        return;
    } else if (input.validity.valueMissing || input.validity.patternMismatch) {
        const elementValidity = $input.data("validationText");
        const id = $input.attr("id");
        const labelText = $(`label[for=${id}]`).text();
        if (elementValidity) {
            // prefer text added to element with i18n
            input.setCustomValidity(elementValidity);
        } else if (labelText) {
            // fall back to assumed English with label
            input.setCustomValidity(`${labelText} required.`);
        }
        input.setAttribute("aria-invalid", "true");
    }
}
