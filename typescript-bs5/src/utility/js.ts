"use strict";

/**
 * Order-agnostic check on whether two arrays contain the same elements.
 */
export function arrayEquivalent(a: any[], b: any[]): boolean {
    const combined: Set<any> = new Set<any>([...(a || []), ...(b || [])]);
    return combined.size === a?.length && combined.size === b?.length;
}

/**
 * A shorter alias for `Object.prototype.hasOwnProperty.call(obj, name)`.
 * Used in place of calling `obj.hasOwnProperty(name)` to account for
 * danger of the prototype method being replaced on `obj`.
 */
export function hasOwnProp(obj: unknown, name: string): boolean {
    return Object.prototype.hasOwnProperty.call(obj, name);
}

/**
 * Tests if a property on two objects are equal.
 */
export function propertyEqual(a: unknown, b: unknown, name: string): boolean {
    // guard against undefined/null inputs
    a = a || {};
    b = b || {};
    return hasOwnProp(a, name) && hasOwnProp(b, name) && a[name] === b[name];
}
