/*
 * Flot plugin to order bars side by side.
 * 
 * Released under the MIT license by Benjamin BUFFET, 20-Sep-2010.
 *
 * This plugin is an alpha version.
 *
 * To activate the plugin you must specify the parameter "order" for the specific serie :
 *
 *  $.plot($("#placeholder"), [{ data: [ ... ], bars :{ order = null or integer }])
 *
 * If 2 series have the same order param, they are ordered by the position in the array;
 *
 * The plugin adjust the point by adding a value depanding of the barwidth
 * Exemple for 3 series (barwidth : 0.1) :
 *
 *          first bar décalage : -0.15
 *          second bar décalage : -0.05
 *          third bar décalage : 0.05
 *
 */

(function($){
    function init(plot) {
        var orderedBarSeries;
        var nbOfBarsToOrder;
        var isHorizontal = false;

        /*
         * This method add shift to x values
         */
        function reOrderBars(plot, series, datapoints) {
			var shiftedPoints = datapoints.points;

			// If the series doesn't need to be re-ordered, exit immediately
            if ((series.bars == null) || (!series.bars.show) || (series.bars.order == null)) {
             	return;
            }

			isHorizontal = checkIfGraphIsHorizontal(series);

			// Retrieve the bar series
			var pdata = plot.getData();

			// Get a set of bars that have an order defined and are meant to be shown.
			var retSeries = new Array();
			for (var i = 0; i < pdata.length; i++) {
				if (pdata[i].bars.order != null && pdata[i].bars.show) {
					retSeries.push(pdata[i]);
				}
			}

			// We're using a pseudo-object, as a key/value hash, to make sure we put only
			// one copy of each observed value on the allOrderValues array.
			var seenOrderValues = {};
			var allOrderValues = [];
			var orderSeen = 1;

			for (var i = 0; i < retSeries.length; i++) {
				var ord = retSeries[i].bars.order;
				if (typeof seenOrderValues[ord] == 'undefined') {
					seenOrderValues[ord] = orderSeen;
					orderSeen++;
					allOrderValues.push(ord);
				}
				retSeries[i].bars.orderIndex = seenOrderValues[ord];
			}

			nbOfBarsToOrder = allOrderValues.length;

			orderedBarSeries = retSeries;
			orderedBarSeries.sort(function(a,b){return a.bars.orderIndex - b.bars.orderIndex}); // Sort ascending

			if (nbOfBarsToOrder < 2) {
				return;
			}  

			var position = series.bars.orderIndex;

			var thisBarWidth = series.bars.barWidth;
			var decallage = 0;

			var centerBarShift = 0;
			var halfTheBars = Math.floor(nbOfBarsToOrder / 2);
            if ((nbOfBarsToOrder % 2) == 0) {
                centerBarShift = thisBarWidth/2;
				halfTheBars = Math.ceil(nbOfBarsToOrder / 2);
			}

			//console.log('order = ' + series.bars.order + ' orderIndex = ' + position + ' halfbars = ' + halfTheBars);

			// Is the bar to the left of the center position?
			if (position < halfTheBars) {
				decallage = -1*(centerBarShift+(thisBarWidth * (halfTheBars - position)));
			} else {
				decallage = centerBarShift + (thisBarWidth * ((position-1) - halfTheBars));
			}

			// Shift the data points
			var ps = datapoints.pointsize;
			var j = 0;
			//console.log('sd:' + series.data);
			for (var i = isHorizontal ? 1 : 0; i < shiftedPoints.length; i += ps) {
				var dxr = shiftedPoints[i] + decallage;
				// Adding the new x value in the series to be able to display the right tooltip value,
				// using the index 3 to not overide the third index.
				//console.log('dx:' + decallage + ' shiftedPoints[i]:' + shiftedPoints[i] +  ',' + shiftedPoints[i+1]);
				shiftedPoints[i] = dxr;
				// series.data[j][3] = dxr;
				j++;
			}

			datapoints.points = shiftedPoints;
        }
                
        function checkIfGraphIsHorizontal(serie) {
            if (serie.bars.horizontal) {
                return true;
            }
            return false;
        }

        plot.hooks.processDatapoints.push(reOrderBars);

    }

    var options = {
        series : {
            bars: {order: null} // or number/string
        }
    };

    $.plot.plugins.push({
        init: init,
        options: options,
        name: "orderBars",
        version: "0.2"
    });

})(jQuery)

