/**
 * unit tests for AssayTableDataGraphing.js
 */

describe("prepare it", function () {

    describe("EDDATDGraphing", function() {
        it("calls the prepare it function", function () {
            spyOn(EDDATDGraphing, "Setup");
            EDDATDGraphing.Setup();
            expect(EDDATDGraphing.Setup).toHaveBeenCalled();
        });
    });
});
