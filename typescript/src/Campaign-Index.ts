"use strict";

import * as $ from "jquery";
import * as EDDAuto from "../modules/EDDAutocomplete";


// TODO find out a way to do this in Typescript without relying on specific output targets
/* tslint:disable */
declare function require(name: string): any;  // avoiding warnings for require calls below
// as of JQuery UI 1.12, need to require each dependency individually
require('jquery-ui/themes/base/core.css');
require('jquery-ui/themes/base/menu.css');
require('jquery-ui/themes/base/button.css');
require('jquery-ui/themes/base/draggable.css');
require('jquery-ui/themes/base/resizable.css');
require('jquery-ui/themes/base/dialog.css');
require('jquery-ui/themes/base/theme.css');
require('jquery-ui/ui/widgets/button');
require('jquery-ui/ui/widgets/draggable');
require('jquery-ui/ui/widgets/resizable');
require('jquery-ui/ui/widgets/dialog');
require('jquery-ui/ui/widgets/tooltip');
/* tslint:enable */


// Called when the page loads.
export function prepareIt() {
    EDDAuto.BaseAuto.initPreexisting();
    // this makes the autocomplete work like a dropdown box
    // fires off a search as soon as the element gains focus
    $(document).on('focus', '.autocomp', function (ev) {
        $(ev.target).addClass('autocomp_search').mcautocomplete('search');
    });

    let modal = $("#addCampaignModal");
    modal.dialog({
        "autoOpen": false,
        "minWidth": 600,
    });
    $("#addCampaignButton").click(() => {
        modal.removeClass("off").dialog("open");
        return false;
    });
}

// use JQuery ready event shortcut to call prepareIt when page is ready
$(prepareIt);
