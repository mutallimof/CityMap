/** App identity for scripts (names, URLs, User-Agent strings); one source: site.json at the repo root. */
import site from '../../site.json' with { type: 'json' };

export const APP_NAME: string = site.name;
export const SITE_URL: string = site.url;
export const REPO_URL: string = site.repo;
/** Product token of the polite scraper (robots.txt user-agent name). */
export const BOT_NAME = 'LivinIstanbulBot';

/** User-Agent for requests to public services: who we are and where to reach us. */
export const userAgent = (task: string, bot = false): string =>
  `${bot ? BOT_NAME : 'LivinIstanbul'}/0.1 (+${SITE_URL}; ${task}; contact: ${REPO_URL}/issues)`;
