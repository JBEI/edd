var StudyDGraphing:any;

declare var createLineGraph;
declare var createAssayGraph;
declare var createTimeGraph;
declare var objectSize;
declare var sortBarData;
declare var labels;
declare var createSideBySide;
declare var names;
declare var transformSingleLineItem;

StudyDGraphing = {

	Setup:function(graphdiv) {

		if (graphdiv) {
			this.graphDiv = $("#" + graphdiv);
		} else {
			this.graphDiv = $("#graphDiv");
        }
	},

	clearAllSets:function() {
		d3.selectAll("svg").remove();
	},

	addNewSet:function(newSet) {
        var count = StudyDGraphing.getElementIndex(this.graphDiv);
        var buttons = StudyDGraphing.getButtonElement(this.graphDiv);
        var selector = StudyDGraphing.getSelectorElement(this.graphDiv);
        d3.select(buttons[count + 1])
              .on('click', function() {
                      d3.select(selector [1]).style('display', 'none');
                      d3.select(selector [2]).style('display', 'block');
                      d3.select(selector [3]).style('display', 'none');
                      d3.select(selector [4]).style('display', 'none');
        });
        d3.select(buttons[count])
            .on('click', function() {
                      d3.select(selector[1]).style('display', 'block');
                      d3.select(selector[2]).style('display', 'none');
                      d3.select(selector[3]).style('display', 'none');
                      d3.select(selector[4]).style('display', 'none');
        });
        d3.select(buttons[count + 2])
            .on('click', function() {
                      d3.select(selector[1]).style('display', 'none');
                      d3.select(selector[2]).style('display', 'none');
                      d3.select(selector[3]).style('display', 'block');
                      d3.select(selector[4]).style('display', 'none');
        });
        //group by assay
        d3.select(buttons[count + 3])
            .on('click', function() {
                      d3.select(selector[1]).style('display', 'none');
                      d3.select(selector[2]).style('display', 'none');
                      d3.select(selector[3]).style('display', 'none');
                      d3.select(selector[4]).style('display', 'block');
        });

        var data = EDDData; // main data
        var labels = names(data); // names of proteins..
        var barAssayObj  = sortBarData(newSet);

        //create respective graphs
        createLineGraph(barAssayObj, selector[1]);
        createAssayGraph(barAssayObj, selector[2]);
        createTimeGraph(barAssayObj, selector[3]);
        createSideBySide(newSet, labels, selector[4]);
		
		if (!newSet.label) {
			$('#debug').text('Failed to fetch series.');
			return;
		}
	},

    //takes in element and returns an array of selectors
    // d3.select(this.graphDiv.siblings().siblings()[1], '.linechart')
    // [<div id=​"linechart">​</div>​, <div id=​"timeBar">​</div>​, <div id=​"single">​</div>​,
    // <div id=​"groupedAssay">​</div>​]
    getElementIndex:function (element) {
             if (($(element).siblings().siblings()).size() < 7) {
                 return 0;
             } else  {
                 return 1
             }
    },

    getButtonElement:function (element) {
        if (($(element).siblings().siblings()).size() < 7) {
            return $(element.siblings()[0]).find("button")
        } else {
            return $(element.siblings()[1]).find("button")
        }
    },
    // takes in graphDiv and returns array of 4 buttons

    getSelectorElement:function (element) {
        return element.siblings().siblings()
    }

    //d3.select(this.graphDiv.siblings().siblings()[3], '.timeBar')
};


