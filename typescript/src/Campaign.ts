import * as $ from "jquery";
import "jquery-ui/ui/widgets/dialog";

// called when the page loads
export function prepareIt() {
    $(".disclose")
        .find(".discloseLink")
        .on("click", disclose);

    const modal = $("#addStudyModal");
    modal.dialog({ "minWidth": 600, "autoOpen": false });
    // if the form has errors listed, open the modal automatically
    if (modal.children(".alert").length > 0) {
        $(".errorlist").remove();
        modal.removeClass("off").dialog("open");
    }

    $("#addStudyButton").click(() => {
        modal.removeClass("off").dialog("open");
        return false;
    });
}

export function disclose() {
    $(this)
        .closest(".disclose")
        .toggleClass("discloseHide");
    return false;
}

// use JQuery ready event shortcut to call prepareIt when page is ready
$(prepareIt);
