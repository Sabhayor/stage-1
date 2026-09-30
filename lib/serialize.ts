/**
 * Tiny helpers for normalising values coming out of the database.
 *
 * Both adapters may return `Date` objects (timestamptz) so every repository
 * funnels values through these mappers to guarantee a single JSON shape
 * (`ISO-8601` strings) regardless of driver.
 */

export function toIso(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function requireIso(value: Date | string): string {
  const iso = toIso(value);
  if (!iso) throw new Error(`Unable to serialise timestamp: ${String(value)}`);
  return iso;
}

export function hasOwn<T extends object>(value: T, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}
