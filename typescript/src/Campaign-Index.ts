"use strict";

import * as $ from "jquery";
import "jquery-ui/ui/widgets/dialog";

import * as EDDAuto from "../modules/EDDAutocomplete";

// Called when the page loads.
export function prepareIt() {
    EDDAuto.BaseAuto.initPreexisting();
    // this makes the autocomplete work like a dropdown box
    // fires off a search as soon as the element gains focus
    $(document).on("focus", ".autocomp", function(ev) {
        $(ev.target)
            .addClass("autocomp_search")
            .mcautocomplete("search");
    });

    const modal = $("#addCampaignModal");
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
