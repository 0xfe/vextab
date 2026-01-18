// src/utils.ts
// Minimal utility helpers that replace lodash with focused, documented primitives.

// Shared collection type used by generic iteration helpers.
type Collection<T> = T[] | Record<string, T>;

/**
 * Return the last item of an array, or undefined for null/empty inputs.
 * This is a tiny, predictable helper used throughout the codebase.
 */
export function last<T>(items?: T[] | null): T | undefined {
  if (!items || items.length === 0) return undefined;
  return items[items.length - 1];
}

/**
 * Determine whether a value is "empty" by lodash-style rules.
 * - null/undefined → empty
 * - arrays/strings → length === 0
 * - objects → no own keys
 */
export function isEmpty(value: unknown): boolean {
  if (value == null) return true;
  if (Array.isArray(value) || typeof value === 'string') return value.length === 0;
  if (typeof value === 'object') return Object.keys(value as object).length === 0;
  return false;
}

/**
 * Iterate over an array or object with a simple callback signature.
 * This keeps call sites uniform without pulling in a full utility library.
 */
export function each<T>(collection: Collection<T> | null | undefined, iteratee: (value: T, key: string | number) => void): void {
  if (!collection) return;
  if (Array.isArray(collection)) {
    collection.forEach((value, index) => iteratee(value, index));
    return;
  }
  Object.keys(collection).forEach((key) => iteratee(collection[key], key));
}

/**
 * Alias for each() to preserve compatibility with lodash-style usage.
 */
export function forEach<T>(collection: Collection<T> | null | undefined, iteratee: (value: T, key: string | number) => void): void {
  each(collection, iteratee);
}

/**
 * Map a collection into an array of results.
 */
export function map<T, R>(collection: Collection<T> | null | undefined, iteratee: (value: T, key: string | number) => R): R[] {
  const results: R[] = []; // Collected mapping results.
  each(collection, (value, key) => results.push(iteratee(value, key)));
  return results;
}

/**
 * Merge object properties into a target object.
 * Design note: we intentionally skip null/undefined sources to keep call sites compact.
 */
export function extend<T extends object, U extends object>(target: T, ...sources: Array<U | null | undefined>): T & U {
  const validSources = sources.filter((source) => source != null) as U[]; // Defensive filter for optional params.
  return Object.assign(target, ...validSources);
}

/**
 * Return the own keys of an object or an empty array for nullish inputs.
 */
export function keys(value: object | null | undefined): string[] {
  return value ? Object.keys(value) : [];
}

/**
 * Return the own values of an object or an empty array for nullish inputs.
 */
export function values<T>(value: Record<string, T> | null | undefined): T[] {
  return value ? Object.values(value) : [];
}

/**
 * Safe hasOwnProperty wrapper.
 */
export function has(value: object | null | undefined, key: string): boolean {
  if (!value) return false;
  return Object.prototype.hasOwnProperty.call(value, key);
}

/**
 * Pick a subset of properties into a shallow clone.
 */
export function pick<T extends Record<string, any>>(value: T, ...props: string[]): Partial<T> {
  const result: Partial<T> = {}; // Accumulates selected properties.
  props.forEach((prop) => {
    if (has(value, prop)) {
      result[prop] = value[prop];
    }
  });
  return result;
}

/**
 * Create a new array sorted by a numeric iteratee.
 */
export function sortBy<T>(items: T[], iteratee: (value: T) => number): T[] {
  return items.slice().sort((a, b) => {
    const left = iteratee(a); // Numeric key for the left item.
    const right = iteratee(b); // Numeric key for the right item.
    return left - right;
  });
}

/**
 * Throttle a function so it runs at most once per `wait` milliseconds.
 * Design note: this mirrors lodash's trailing invocation behavior for the last call.
 */
export function throttle<T extends (...args: any[]) => void>(fn: T, wait: number): (...args: Parameters<T>) => void {
  let lastCall = 0; // Timestamp of the last executed call.
  let timeoutId: number | undefined; // Active timeout handle for trailing call.
  let pendingArgs: Parameters<T> | null = null; // Arguments captured for trailing call.

  return (...args: Parameters<T>) => {
    const now = Date.now(); // Current timestamp for throttling math.
    const remaining = wait - (now - lastCall); // Time left before we can invoke again.
    if (remaining <= 0) {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
        timeoutId = undefined;
      }
      lastCall = now;
      fn(...args);
      return;
    }
    pendingArgs = args;
    if (timeoutId !== undefined) return;
    timeoutId = window.setTimeout(() => {
      lastCall = Date.now(); // Use actual fire time for consistent spacing.
      timeoutId = undefined;
      if (pendingArgs) {
        fn(...pendingArgs);
        pendingArgs = null;
      }
    }, remaining);
  };
}

// Default export for compatibility with older lodash-style imports.
const utils = {
  last,
  isEmpty,
  each,
  forEach,
  map,
  extend,
  keys,
  values,
  has,
  pick,
  sortBy,
  throttle,
};

export default utils;
