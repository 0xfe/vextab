type Collection<T> = T[] | Record<string, T>;

export function last<T>(items?: T[] | null): T | undefined {
  if (!items || items.length === 0) return undefined;
  return items[items.length - 1];
}

export function isEmpty(value: unknown): boolean {
  if (value == null) return true;
  if (Array.isArray(value) || typeof value === 'string') return value.length === 0;
  if (typeof value === 'object') return Object.keys(value as object).length === 0;
  return false;
}

export function each<T>(collection: Collection<T> | null | undefined, iteratee: (value: T, key: string | number) => void): void {
  if (!collection) return;
  if (Array.isArray(collection)) {
    collection.forEach((value, index) => iteratee(value, index));
    return;
  }
  Object.keys(collection).forEach((key) => iteratee(collection[key], key));
}

export function forEach<T>(collection: Collection<T> | null | undefined, iteratee: (value: T, key: string | number) => void): void {
  each(collection, iteratee);
}

export function map<T, R>(collection: Collection<T> | null | undefined, iteratee: (value: T, key: string | number) => R): R[] {
  const results: R[] = [];
  each(collection, (value, key) => results.push(iteratee(value, key)));
  return results;
}

export function extend<T extends object, U extends object>(target: T, ...sources: Array<U | null | undefined>): T & U {
  const validSources = sources.filter((source) => source != null) as U[];
  return Object.assign(target, ...validSources);
}

export function keys(value: object | null | undefined): string[] {
  return value ? Object.keys(value) : [];
}

export function values<T>(value: Record<string, T> | null | undefined): T[] {
  return value ? Object.values(value) : [];
}

export function has(value: object | null | undefined, key: string): boolean {
  if (!value) return false;
  return Object.prototype.hasOwnProperty.call(value, key);
}

export function pick<T extends Record<string, any>>(value: T, ...props: string[]): Partial<T> {
  const result: Partial<T> = {};
  props.forEach((prop) => {
    if (has(value, prop)) {
      result[prop] = value[prop];
    }
  });
  return result;
}

export function sortBy<T>(items: T[], iteratee: (value: T) => number): T[] {
  return items.slice().sort((a, b) => {
    const left = iteratee(a);
    const right = iteratee(b);
    return left - right;
  });
}

export function throttle<T extends (...args: any[]) => void>(fn: T, wait: number): (...args: Parameters<T>) => void {
  let lastCall = 0;
  let timeoutId: number | undefined;
  let pendingArgs: Parameters<T> | null = null;

  return (...args: Parameters<T>) => {
    const now = Date.now();
    const remaining = wait - (now - lastCall);
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
      lastCall = Date.now();
      timeoutId = undefined;
      if (pendingArgs) {
        fn(...pendingArgs);
        pendingArgs = null;
      }
    }, remaining);
  };
}

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
