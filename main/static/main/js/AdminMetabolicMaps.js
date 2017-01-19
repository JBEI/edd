/// <reference path="Utl.ts" />
/// <reference path="BiomassCalculationUI.ts" />
var AdminMetabolicMaps;
(function (AdminMetabolicMaps) {
    function onClickBiomassCalculation(mapID) {
        new BiomassCalculationUI(mapID, function (err, finalBiomass) {
            // After the UI has been presented, if it's successful, reload this page.
            location.reload();
        });
    }
    AdminMetabolicMaps.onClickBiomassCalculation = onClickBiomassCalculation;
})(AdminMetabolicMaps || (AdminMetabolicMaps = {}));
