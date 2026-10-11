/**
 * Minimal robots.txt support (RFC 9309): groups by User-agent, Allow/Disallow with `*` and `$`,
 * longest match wins, Allow wins ties. Our agent token is matched case-insensitively; `*` applies
 * when no group names us.
 */
export interface Rules {
  allow: string[];
  disallow: string[];
  crawlDelay?: number;
}

export function parseRobots(txt: string, agent: string): Rules {
  const groups: { agents: string[]; rules: Rules }[] = [];
  let cur: { agents: string[]; rules: Rules } | null = null;
  let lastWasAgent = false;
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const val = m[2].trim();
    if (key === 'user-agent') {
      if (!cur || !lastWasAgent) {
        cur = { agents: [], rules: { allow: [], disallow: [] } };
        groups.push(cur);
      }
      cur.agents.push(val.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!cur) continue;
    if (key === 'allow' && val) cur.rules.allow.push(val);
    else if (key === 'disallow' && val) cur.rules.disallow.push(val);
    else if (key === 'crawl-delay' && Number(val) > 0) cur.rules.crawlDelay = Number(val);
  }
  const me = agent.toLowerCase();
  const mine = groups.filter((g) => g.agents.some((a) => a !== '*' && me.includes(a)));
  const chosen = mine.length ? mine : groups.filter((g) => g.agents.includes('*'));
  return chosen.reduce<Rules>(
    (acc, g) => ({ allow: [...acc.allow, ...g.rules.allow], disallow: [...acc.disallow, ...g.rules.disallow], crawlDelay: g.rules.crawlDelay ?? acc.crawlDelay }),
    { allow: [], disallow: [] },
  );
}

function matchLen(pattern: string, path: string): number {
  const anchored = pattern.endsWith('$');
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const re = new RegExp('^' + body.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + (anchored ? '$' : ''));
  return re.test(path) ? body.length : -1;
}

export function allowed(rules: Rules, pathAndQuery: string): boolean {
  let best = -1;
  let ok = true;
  for (const p of rules.disallow) {
    const n = matchLen(p, pathAndQuery);
    if (n > best) (best = n), (ok = false);
  }
  for (const p of rules.allow) {
    const n = matchLen(p, pathAndQuery);
    if (n >= best && n >= 0) (best = n), (ok = true);
  }
  return ok;
}
