"use strict";

export function relativeURL(path: string, base?: URL): URL {
    // Defining this to clean up boilerplate as TypeScript compiler requires URL constructor
    // to take only strings as both arguments, instead of a string and another URL.
    let baseStr = window.location.toString();
    if (base) {
        baseStr = base.toString();
    }
    return new URL(path, baseStr);
}
