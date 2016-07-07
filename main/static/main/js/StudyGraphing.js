var StudyDGraphing;
StudyDGraphing = {
    Setup: function (graphdiv) {
        if (graphdiv) {
            this.graphDiv = $("#" + graphdiv);
        }
        else {
            this.graphDiv = $("#graphDiv");
        }
    },
    clearAllSets: function () {
        d3.selectAll("svg").remove();
    },
    addNewSet: function (newSet) {
        var buttons = StudyDGraphing.getButtonElement(this.graphDiv);
        var selector = StudyDGraphing.getSelectorElement(this.graphDiv);
        //group by tim
        d3.select(buttons[1])
            .on('click', function () {
            event.preventDefault();
            d3.select(selector[1]).style('display', 'none');
            d3.select(selector[2]).style('display', 'block');
            d3.select(selector[3]).style('display', 'none');
            d3.select(selector[4]).style('display', 'none');
            return false;
        });
        //line chart
        d3.select(buttons[0])
            .on('click', function () {
            event.preventDefault();
            d3.select(selector[1]).style('display', 'block');
            d3.select(selector[2]).style('display', 'none');
            d3.select(selector[3]).style('display', 'none');
            d3.select(selector[4]).style('display', 'none');
            return false;
        });
        //bar charts for each line entry
        d3.select(buttons[2])
            .on('click', function () {
            event.preventDefault();
            d3.select(selector[1]).style('display', 'none');
            d3.select(selector[2]).style('display', 'none');
            d3.select(selector[3]).style('display', 'block');
            d3.select(selector[4]).style('display', 'none');
            return false;
        });
        //group by assay
        d3.select(buttons[3])
            .on('click', function () {
            event.preventDefault();
            d3.select(selector[1]).style('display', 'none');
            d3.select(selector[2]).style('display', 'none');
            d3.select(selector[3]).style('display', 'none');
            d3.select(selector[4]).style('display', 'block');
            return false;
        });
        var data = EDDData; // main data
        var labels = names(data); // names of proteins..
        var barAssayObj = sortBarData(newSet);
        //create respective graphs
        createLineGraph(barAssayObj, selector[1], legend, make_x_axis, make_y_axis);
        createTimeGraph(barAssayObj, selector[2], legend, make_x_axis, make_y_axis);
        createSideBySide(newSet, labels, selector[3]);
        createAssayGraph(barAssayObj, selector[4]);
        if (!newSet.label) {
            $('#debug').text('Failed to fetch series.');
            return;
        }
    },
    /* this function takes in element and returns an array of selectors
    * [<div id=​"linechart">​</div>​, <div id=​"timeBar">​</div>​, <div id=​"single">​</div>​,
    * <div id=​"groupedAssay">​</div>​]
    */
    getButtonElement: function (element) {
        if (($(element).siblings().siblings()).size() < 7) {
            return $(element.siblings()[0]).find("button");
        }
        else {
            return $(element.siblings()[1]).find("button");
        }
    },
    // takes in graphDiv and returns array of 4 buttons
    getSelectorElement: function (element) {
        return element.siblings().siblings();
    }
};
