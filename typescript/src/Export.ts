import * as jQuery from "jquery";

export function setUp(): void {
    // add select/deselect controls
    $(".exportOptions > ul[id$=_meta]").each(function(i, ul) {
        const $ul = $(ul),
            css = { "float": "right", "padding-left": "1em" };
        $('<a href="#">')
            .text("Deselect All")
            .css(css)
            .on("click", () => {
                $ul.find(":checkbox").prop("checked", false);
                return false;
            })
            .appendTo($ul.prev("p"));
        $('<a href="#">')
            .text("Select All")
            .css(css)
            .on("click", () => {
                $ul.find(":checkbox").prop("checked", true);
                return false;
            })
            .appendTo($ul.prev("p"));
    });
    // click handler for disclose sections
    $(document).on("click", ".disclose .discloseLink", (e) => {
        $(e.target)
            .closest(".disclose")
            .toggleClass("discloseHide");
        return false;
    });
}

jQuery(setUp);
