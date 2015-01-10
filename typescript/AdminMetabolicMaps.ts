/// <reference path="Utl.ts" />
/// <reference path="BiomassCalculationUI.ts" />

module AdminMetabolicMaps {

	export function onClickBiomassCalculation(mapID:number) {
		new BiomassCalculationUI(mapID, (err:string, finalBiomass?:number) => {
			// After the UI has been presented, if it's successful, reload this page.
			location.reload();
		});
	}

}
