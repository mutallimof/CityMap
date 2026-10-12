/** Deep links in the URL hash (#place=… #pier=… #guide=… #plan=…). Never throws: a broken link is ignored. */
export type DeepLink = { kind: 'place' | 'pier' | 'guide' | 'plan'; id: string };

export function parseDeepLink(hash: string): DeepLink | null {
  const m = /^#(place|pier|guide|plan)=(.+)$/.exec(hash);
  if (!m) return null;
  try {
    const id = decodeURIComponent(m[2]);
    return id ? { kind: m[1] as DeepLink['kind'], id } : null;
  } catch {
    return null; // cut-off / malformed percent escape (URIError)
  }
}
