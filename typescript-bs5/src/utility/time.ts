"use strict";

/**
 * Given a date in seconds (with a possible fractional part), in the
 * UNIX/POSIX epoch, return a string formatted in the manner of:
 * "Dec 21 2012, 11:45am", with exceptions for "Today" and "Yesterday",
 * e.g. "Yesterday, 3:12pm".
 */
export function timestampToToday(timestamp: number): string {
    if (!timestamp || timestamp < 1) {
        return `<span class="text-muted">N/A</span>`;
    }
    const time: Date = new Date(Math.round(timestamp * 1000));
    const now: Date = new Date();
    const yesterday: Date = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    let day_str: string;
    if (
        time.getFullYear() === now.getFullYear() &&
        time.getMonth() === now.getMonth() &&
        time.getDate() === now.getDate()
    ) {
        day_str = "Today";
    } else if (
        time.getFullYear() === yesterday.getFullYear() &&
        time.getMonth() === yesterday.getMonth() &&
        time.getDate() === yesterday.getDate()
    ) {
        day_str = "Yesterday";
    } else if (time.getFullYear() === now.getFullYear()) {
        day_str = new Intl.DateTimeFormat("en-US", {
            "month": "short",
            "day": "numeric",
        }).format(time);
    } else {
        day_str = new Intl.DateTimeFormat("en-US", {
            "month": "short",
            "day": "numeric",
            "year": "numeric",
        }).format(time);
    }
    const time_str = new Intl.DateTimeFormat("en-US", {
        "hour": "numeric",
        "minute": "numeric",
    }).format(time);
    return `${day_str}, ${time_str}`;
}

/**
 * Given a ISO date string in yyyy-mm-ddThh:MM:ss.SSSSSSZ format, convert
 * to a string relative to "Today", as in #timestampToToday().
 */
export function utcToToday(utc: string): string {
    let timestamp: number;
    // pattern for yyyy-mm-ddThh:MM:ss.SSSSSSZ ISO date string
    const iso_pattern =
        /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.?(\d{1,6})?Z$/;
    const match = iso_pattern.exec(utc);
    if (match) {
        // get rid of overall match, we don't care
        match.shift();
        // convert strings to numbers
        const values = match.map((v) => parseInt(v, 10));
        // Date uses 0-based months, so decrement month
        values[1]--;
        timestamp = Date.UTC(
            values[0], // year
            values[1], // month
            values[2], // day
            values[3], // hour
            values[4], // minute
            values[5], // second
        );
        // the timestampToToday expects seconds, not milliseconds
        timestamp /= 1000;
        return timestampToToday(timestamp);
    }
    return timestampToToday(null);
}
