import { EDDAuto } from "../modules/EDDAutocomplete"


module AdminSite {

    export function prepareIt() {
        EDDAuto.BaseAuto.initPreexisting();
        // this makes the autocomplete work like a dropdown box
        // fires off a search as soon as the element gains focus
        $(document).on('focus', '.autocomp', function (ev) {
            $(ev.target).addClass('autocomp_search').mcautocomplete('search');
        });
    }
}


// use JQuery ready event shortcut to call prepareIt when page is ready
$(AdminSite.prepareIt);
