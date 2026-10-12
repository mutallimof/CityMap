import { classic } from './classic';
import type { DeepPartial, ThemeSpec } from './types';

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);

/** Deep merge: objects merge key by key, arrays and values replace. Never mutates its inputs. */
export function merge<T>(base: T, over: DeepPartial<T> | undefined): T {
  if (over === undefined) return base;
  if (!isObj(base) || !isObj(over)) return over as T;
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(over)) {
    if (v === undefined) continue;
    out[k] = isObj(v) && isObj(out[k]) ? merge(out[k], v as DeepPartial<unknown>) : v;
  }
  return out as T;
}

/** A theme = Classic + what it changes. `id`, `name`, `blurb` and `card` are required. */
export function defineTheme(t: DeepPartial<ThemeSpec> & Pick<ThemeSpec, 'id' | 'name' | 'blurb' | 'card'>): ThemeSpec {
  return merge<ThemeSpec>(classic, t as unknown as DeepPartial<ThemeSpec>);
}
