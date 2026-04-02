/**
 * Shared date utility functions.
 * Extracted from calendar components to avoid duplication.
 */

/**
 * Parse a date string (YYYY-MM-DD or ISO datetime) into a local Date object
 * without timezone offset issues. Strips the time component if present and
 * constructs the Date using year/month/day to avoid UTC conversion.
 */
export function parseLocalDate(dateStr: string): Date {
    const str = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr;
    const [y, m, d] = str.split('-').map(Number);
    return new Date(y, m - 1, d);
}

// ─── Eastern Time helpers ────────────────────────────────────────────────────
// Reliable ET conversion using UTC offset math.
// Avoids toLocaleString/toLocaleDateString which can silently fall back to UTC
// on Node.js serverless runtimes (Vercel) with limited ICU data.

/** Returns true if the given date falls within US Eastern Daylight Time (EDT) */
function isEDT(date: Date): boolean {
    const year = date.getUTCFullYear();

    // DST starts: 2nd Sunday of March at 2 AM EST = 7 AM UTC
    const mar1Day = new Date(Date.UTC(year, 2, 1)).getUTCDay();
    const secondSunMar = Date.UTC(year, 2, 1 + ((7 - mar1Day) % 7) + 7);
    const dstStart = secondSunMar + 7 * 3600000;

    // DST ends: 1st Sunday of November at 2 AM EDT = 6 AM UTC
    const nov1Day = new Date(Date.UTC(year, 10, 1)).getUTCDay();
    const firstSunNov = Date.UTC(year, 10, 1 + ((7 - nov1Day) % 7));
    const dstEnd = firstSunNov + 6 * 3600000;

    const ts = date.getTime();
    return ts >= dstStart && ts < dstEnd;
}

/** Get UTC offset for Eastern Time: -4 (EDT) or -5 (EST) */
export function getETOffset(date: Date = new Date()): number {
    return isEDT(date) ? -4 : -5;
}

/** Convert a Date to a Date object adjusted to Eastern Time */
function toET(date: Date): Date {
    return new Date(date.getTime() + getETOffset(date) * 3600000);
}

/** Convert a Date to Eastern Time date string (YYYY-MM-DD) */
export function toETDateString(date: Date = new Date()): string {
    const et = toET(date);
    const y = et.getUTCFullYear();
    const m = String(et.getUTCMonth() + 1).padStart(2, '0');
    const d = String(et.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

/** Get the current hour in Eastern Time (0-23) */
export function getETHour(date: Date = new Date()): number {
    return toET(date).getUTCHours();
}

/** Get day of week in Eastern Time (0=Sun, 1=Mon, ..., 6=Sat) */
export function getETDayOfWeek(date: Date = new Date()): number {
    return toET(date).getUTCDay();
}

/** Get day of week name in Eastern Time */
export function getETDayName(date: Date = new Date()): string {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[getETDayOfWeek(date)];
}

/** Format a Date object's local components to YYYY-MM-DD.
 *  Safe replacement for toLocaleDateString('en-CA') which breaks on Vercel. */
export function formatDateStr(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

/** Format a Date to a human-readable ET string like "Monday, April 6, 2026" */
export function toETDisplayDate(date: Date = new Date()): string {
    const et = toET(date);
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const months = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];
    return `${days[et.getUTCDay()]}, ${months[et.getUTCMonth()]} ${et.getUTCDate()}, ${et.getUTCFullYear()}`;
}

/** Format a Date to a short ET display string like "Apr 6" */
export function toETShortDate(date: Date = new Date()): string {
    const et = toET(date);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[et.getUTCMonth()]} ${et.getUTCDate()}`;
}

/** Get the current minute in Eastern Time (0-59) */
export function getETMinute(date: Date = new Date()): number {
    return toET(date).getUTCMinutes();
}

/** Get yesterday's date string in Eastern Time (YYYY-MM-DD) */
export function getETYesterday(date: Date = new Date()): string {
    const et = toET(date);
    et.setUTCDate(et.getUTCDate() - 1);
    const y = et.getUTCFullYear();
    const m = String(et.getUTCMonth() + 1).padStart(2, '0');
    const d = String(et.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}
