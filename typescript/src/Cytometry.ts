"use strict";

import * as jQuery from "jquery";

import * as Dropzone from "dropzone";

import * as EDDAuto from "../modules/EDDAutocomplete";
import * as Utl from "../modules/Utl";

import "../modules/Styles";

declare let EDDData;

(function ($) {
    EDDData = EDDData || {};
    let import_data = {};
    let stdSel = $("<div>");

    function fetchStudyInfo(id) {
        $.ajax({
            "url": ["/study", id, "edddata/"].join("/"),
            "type": "GET",
            "error": function (xhr, status, e) {
                // Hide all following steps
                $("#import_step_1").nextAll(".import_step").addClass("off");
            },
            "success": function (data) {
                EDDData = data;
                // Show step 2
                $("#import_step_2").removeClass("off");
            },
        });
    }

    function parseRawText(ev) {
        const rows = ($(ev.target).val() as string).split(/[ \r]*\n/);
        if (rows.length) {
            const comma = /\s*,\s*/;
            const tab = /\t/;
            const delim =
                rows[0].split(comma).length > rows[0].split(tab).length ? comma : tab;
            // pick out the data to a 2D array without label row/column
            import_data = rows.slice(1).map(function (row) {
                return row.split(delim).slice(1);
            });
            $("#id_data").val(JSON.stringify(import_data));
            interpretFirstRow(rows[0].split(delim).slice(1));
            interpretFirstColumn(rows.slice(1), delim);
            // Show step 3
            $("#import_step_3").removeClass("off");
        } else {
            // Hide all following steps if no data found
            $("#import_step_2").nextAll(".import_step").addClass("off");
        }
    }

    function interpretFirstRow(labels: string[]) {
        const inter_row = $("#id_first_row").empty();
        const table = $("<table>")
            .appendTo(inter_row)
            .wrap('<div class="disambiguationSection"></div>');
        const sel = $("<select>").addClass("column_disam");
        [
            ["-- Ignore Column --", ""],
            ["Signal Average for …", "avg"],
            ["Signal Std Deviation for …", "std"],
            ["Coefficient of Variance % for …", "cv"],
            ["Count", "count"],
            ["Viable %", "viab"],
            ["Metadata", "meta"],
            // TODO (histogram bin?, other statistics?)
        ].forEach(function (item) {
            $("<option>").text(item[0]).appendTo(sel).val(item[1]);
        });
        labels.forEach(function (label, i) {
            let tr, td;
            if (label.length) {
                $((tr = (table[0] as HTMLTableElement).insertRow())).data("i", i);
                td = tr.insertCell();
                $("<div>").text(label).appendTo(td);
                td = tr.insertCell();
                sel.clone()
                    .attr("name", "column" + i)
                    .data("i", i)
                    .appendTo(td);
                td = tr.insertCell(); // this cell gets filled depending on previous select
            }
        });
        table.on("change", "select.column_disam", function (ev) {
            const target = $(ev.target);
            const colId = target.data("i");
            const val = target.val();
            let auto = target.closest("td").next("td").empty();
            if (val === "meta") {
                auto = EDDAuto.BaseAuto.create_autocomplete(auto);
                auto.next().attr("name", "meta" + colId);
                const widget = new EDDAuto.MetadataType({
                    "container": auto.parent(),
                    "visibleInput": auto,
                    "hiddenInput": auto.next(),
                });
                widget.init();
                auto.focus();
            } else if (val === "avg") {
                auto = EDDAuto.BaseAuto.create_autocomplete(auto);
                auto.next().attr("name", "type" + colId);
                const widget = new EDDAuto.Phosphor({
                    "container": auto.parent(),
                    "visibleInput": auto,
                    "hiddenInput": auto.next(),
                });
                widget.init();
                auto.focus().toggleClass("autocomp_signal", val === "avg");
            } else if (val === "std" || val === "cv") {
                auto = $("<select>")
                    .addClass("column_std_disam")
                    .attr("name", val + colId)
                    .appendTo(auto);
                labels.forEach(function (label, i) {
                    if (i !== colId) {
                        $("<option>").text(label).appendTo(auto).val(i);
                    }
                });
            }
        });
    }

    function interpretFirstColumn(rows, delim) {
        const inter_col = $("#id_first_col").empty();
        const table = $("<table>")
            .appendTo(inter_col)
            .wrap('<div class="disambiguationSection"></div>');
        const assaySel = $("<select>").addClass("disamAssay");
        $("<option>")
            .text("(Create New Assay)")
            .appendTo(assaySel)
            .val("new")
            .prop("selected", true);
        $("<option>").text("Ignore").appendTo(assaySel).val("ignore");
        let optgroup = $("<optgroup>")
            .attr("label", "Existing Assays")
            .appendTo(assaySel);
        $.each(EDDData.Assays || {}, function (id, assay) {
            const protocol = EDDData.Protocols[assay.pid];
            if (protocol.name === "Flow Cytometry Characterization") {
                $("<option>").text(assay.name).appendTo(optgroup).val(id.toString());
            }
        });
        const lineSel = $("<select>").addClass("disamLine");
        $("<option>")
            .text("(Create New Line)")
            .appendTo(lineSel)
            .val("new")
            .prop("selected", true);
        optgroup = $("<optgroup>").attr("label", "Existing Lines").appendTo(lineSel);
        $.each(EDDData.Lines || {}, function (id, line) {
            $("<option>").text(line.name).appendTo(optgroup).val(id.toString());
        });
        stdSel = $("<select>")
            .prop("multiple", true)
            .attr("size", 8)
            .addClass("disamStd");
        rows.forEach((row, i) => {
            let tr, td;
            const index = row.search(delim);
            if (index > 0) {
                const label = row.substring(0, index);
                $("<option>").text(label).val(i.toString()).appendTo(stdSel);
                $((tr = (table[0] as HTMLTableElement).insertRow())).data("i", i);
                td = tr.insertCell();
                $("<div>").text(label).appendTo(td);
                td = tr.insertCell();
                $('<input type="hidden">')
                    .attr("name", "sample" + i)
                    .val(label)
                    .appendTo(td);
                assaySel
                    .clone()
                    .attr("name", "assay" + i)
                    .appendTo(td);
                td = $("<span>").text("for Line: ").appendTo(td);
                lineSel
                    .clone()
                    .attr("name", "line" + i)
                    .appendTo(td);
            }
        });
        // Only show the line selection if assay selection is "new"
        table.on("change", ".disamAssay", function (ev) {
            const target = $(ev.target);
            const val = target.val();
            target.next().toggleClass("off", val !== "new");
        });
    }

    function checkSubmit() {
        let ok = true;
        if ($("#id_create_study").prop("checked")) {
            ok = ok && checkHasValue($("#id_study-name"));
        } else {
            ok = ok && checkHasValue($("#id_study_1"));
        }
        ok =
            ok &&
            checkHasValue(
                $("#id_data"),
                "Could not parse this input! Email jbei-help@lbl.gov",
            );
        ok = ok && checkHasValue($("#id_time"));
        return !!ok;
    }

    function checkHasValue(jq: JQuery, message?: string): boolean {
        const val: string = jq.val() as string;
        if (!val || !val.trim()) {
            $("<div>")
                .addClass("errorMessage")
                .text(message || "This field is required.")
                .appendTo(jq)
                .wrap("<span>");
            return false;
        }
        return true;
    }

    $(function () {
        // http://stackoverflow.com/questions/22063612
        $.ajaxPrefilter(function (options, originalOptions, jqXHR) {
            jqXHR.setRequestHeader("X-CSRFToken", Utl.EDD.findCSRFToken());
        });
        const _textarea = $("#id_rawtext");
        const _dropzone = new Dropzone(_textarea[0], {
            "clickable": false,
            "url": "/utilities/cytometry/parse/",
        });
        _dropzone.on("success", function (file, response: any) {
            if (response.python_error) {
                window.alert(response.python_error);
            } else {
                _textarea.val(response.data).trigger("change");
            }
        });
        // set up study selection input
        const _auto = $("#id_study_0");
        EDDAuto.BaseAuto.initPreexisting(_auto);
        _auto.on("mcautocompleteselect", function (ev, ui) {
            if (ui.item) {
                fetchStudyInfo(ui.item.id);
            }
            _auto.blur();
        });
        // unhide the study creation form and toggle box
        $("#import_step_1").find(".off").removeClass("off");
        $("#id_create_study")
            .change(function (ev) {
                const checked = $(ev.target).prop("checked");
                $("#import_step_1").find(".edd-form :input").prop("disabled", !checked);
                $("#id_study_0").prop("disabled", checked);
                $("#import_step_2").toggleClass(
                    "off",
                    !(checked || (!checked && EDDData.Lines)),
                );
            })
            .trigger("change");
        // watch the input textarea for changes; delay call on paste events by 10ms
        _textarea
            .on("change", parseRawText)
            .on("paste", window.setTimeout.bind(window, parseRawText, 10));
        // Add a standard selection row for every column with type 'avg' + valid measurement type
        const stdRows = {};
        $("#id_first_row").on(
            "mcautocompleteselect",
            ".autocomp_signal",
            function (ev, ui) {
                let td;
                // there is enough to import at this point, make sure all steps are shown
                $(".import_step").removeClass("off");
                const target = $(ev.target);
                const targRow = target.closest("tr");
                const rowId = targRow.data("i");
                const table = $("#id_std_table");
                // if this row was previously added, remove the old one
                $(stdRows[rowId]).remove();
                const tr = (stdRows[rowId] = (
                    table[0] as HTMLTableElement
                ).insertRow());
                $((td = tr.insertCell())).addClass("top");
                const label = [ui.item.name, targRow.find("td > div").text()].join(
                    " - ",
                );
                $("<div>").text(label).appendTo(td);
                td = tr.insertCell();
                stdSel
                    .clone()
                    .attr("name", "standard" + rowId)
                    .appendTo(td);
            },
        );
        // Do basic validation before submit
        $("#import_form").on("submit", checkSubmit);
    });
})(jQuery);
