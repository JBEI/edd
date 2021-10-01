// Tests of the Utl.ts module

import * as Utl from "../modules/Utl";

describe("Functionality of relativeURL", () => {
    test("Single relative argument yields URL relative to current page", () => {
        const rel = Utl.relativeURL("foobar").toString();
        expect(rel).toEqual("http://edd.lvh.me/foobar");
    });
    test("Relative argument with a different base", () => {
        const base = new URL("http://edd.lvh.me/nested/path/");
        const rel = Utl.relativeURL("foobar", base).toString();
        expect(rel).toEqual("http://edd.lvh.me/nested/path/foobar");
    });
    test("Single absolute argument yields URL absolute to current site", () => {
        const rel = Utl.relativeURL("/foobar").toString();
        expect(rel).toEqual("http://edd.lvh.me/foobar");
    });
    test("Absolute argument with a different base yields URL from other site", () => {
        const base = new URL("http://ice.lvh.me/folders/PERSONAL");
        const rel = Utl.relativeURL("/foobar", base).toString();
        expect(rel).toEqual("http://ice.lvh.me/foobar");
    });
});
