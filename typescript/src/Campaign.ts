import * as $ from "jquery";
import "bootstrap-loader";


// called when the page loads
export function prepareIt() {
    $('.disclose').find('.discloseLink').on('click', disclose);
}

export function disclose() {
    $(this).closest('.disclose').toggleClass('discloseHide');
    return false;
}

// use JQuery ready event shortcut to call prepareIt when page is ready
$(prepareIt);
