import "jquery";
import "jquery-ui/ui/widgets/dialog";

// called when the page loads
function prepareIt(): void {
    $(".disclose").find(".discloseLink").on("click", disclose);
}

function disclose(): boolean {
    $(this).closest(".disclose").toggleClass("discloseHide");
    return false;
}

// use JQuery ready event shortcut to call prepareIt when page is ready
$(prepareIt);
