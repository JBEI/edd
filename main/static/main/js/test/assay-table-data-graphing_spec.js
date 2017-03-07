/**
 * unit tests for AssayTableDataGraphing.js
 */

describe("EDDATDGraphing", function () {

    describe("EDDATDGraphing", function() {
        it("calls the setup it function", function () {
            spyOn(EDDATDGraphing, "Setup");
            EDDATDGraphing.Setup();
            expect(EDDATDGraphing.Setup).toHaveBeenCalled();
        });
    });
});
