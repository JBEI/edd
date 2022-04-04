import "jquery";

export function setUp(): void {
    // add select/deselect controls
    $(".exportOptions div[id$=_meta]").each(function (i, div) {
        const $div = $(div);
        const $legend = $div.closest("fieldset").find("legend");
        const $announcements = $div.find(".announcements");

        $div.find("button.select-all").on("click", (event) => {
            event.preventDefault();
            $div.find(":checkbox").prop("checked", true);
            $announcements.text(`All fields selected, ${$legend.text()}`);
        });

        $div.find("button.deselect-all").on("click", (event) => {
            event.preventDefault();
            $div.find(":checkbox").prop("checked", false);
            $announcements.text(`All fields deselected, ${$legend.text()}`);
        });
    });

    // click handler for disclose sections
    $(document).on("click", ".disclose .discloseLink", (event) => {
        event.preventDefault();
        $(event.target).closest(".disclose").toggleClass("discloseHide");
    });
}

jQuery(setUp);
