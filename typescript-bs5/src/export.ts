import "jquery";

function toggleCheckboxes(checked, event) {
    const button = $(event.currentTarget);
    const fieldset = button.closest("fieldset");
    fieldset.find(":checkbox").prop("checked", checked);
    // TODO: this isn't the greatest i18n; should have widget generate this
    fieldset
        .find(".announcements")
        .text(button.data("announcement") + " " + fieldset.find("legend").text());
    event.preventDefault();
    event.stopPropagation();
    return false;
}

function setupCheckboxToggles(): void {
    const parent = $(".exportOptions");
    parent.on("click", "button.select-all", (e) => {
        return toggleCheckboxes(true, e);
    });
    parent.on("click", "button.deselect-all", (e) => {
        return toggleCheckboxes(false, e);
    });
}

$(() => {
    setupCheckboxToggles();
});
