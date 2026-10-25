import { describe, expect, it } from 'vitest';
import { allowed, parseRobots } from './robots';

const txt = `
User-agent: *
Disallow: /admin
Disallow: /*.pdf$
Allow: /admin/public
Crawl-delay: 5

User-agent: BadBot
Disallow: /
`;

describe('robots.txt', () => {
  const r = parseRobots(txt, 'LivinIstanbulBot/0.1');
  it('applies the * group to us', () => {
    expect(allowed(r, '/etkinlikler')).toBe(true);
    expect(allowed(r, '/admin/x')).toBe(false);
    expect(allowed(r, '/admin/public/a')).toBe(true);
    expect(allowed(r, '/file.pdf')).toBe(false);
    expect(allowed(r, '/file.pdf?x')).toBe(true);
    expect(r.crawlDelay).toBe(5);
  });
  it('a group naming the agent wins over *', () => {
    expect(allowed(parseRobots(txt, 'BadBot'), '/etkinlikler')).toBe(false);
  });
  it('empty robots allows everything', () => {
    expect(allowed(parseRobots('', 'x'), '/anything')).toBe(true);
  });
});
