import { useEffect, useState } from 'react';
import { useT } from '../ui/i18n';
import { useUi } from '../ui/store';
import { formatYear, onStories, pickSummary, storyFor } from './stories';

/**
 * "Story" in the place sheet: photo with credit, key facts (built, architect, style), a short
 * Wikipedia summary and a link to read more — credited per CC BY-SA.
 */
export function StorySection({ osm }: { osm: string }) {
  const t = useT();
  const lang = useUi((s) => s.lang);
  const [, force] = useState(0);
  useEffect(() => onStories(() => force((n) => n + 1)), []);
  const s = storyFor(osm);
  if (!s) return null;
  const sum = pickSummary(s, lang);
  const facts: [string, string][] = [];
  if (s.year !== null) facts.push([t('storyBuilt'), formatYear(s.year, lang)]);
  if (s.architects.length) facts.push([t('storyArchitect'), s.architects.map((a) => a[lang] || a.tr || a.en).join(', ')]);
  if (s.styles.length) facts.push([t('storyStyle'), s.styles.map((a) => a[lang] || a.tr || a.en).join(', ')]);
  return (
    <section className="story">
      <h3 className="section">✦ {t('story')}</h3>
      {s.photo && (
        <figure className="story__photo">
          <img src={s.photo.thumb} alt={s.name[lang] || s.name.tr} loading="lazy" decoding="async" />
          <figcaption>
            <a href={s.photo.page} target="_blank" rel="noopener noreferrer">
              {t('photo')}: {s.photo.artist}
            </a>{' '}
            ·{' '}
            {s.photo.licenseUrl ? (
              <a href={s.photo.licenseUrl} target="_blank" rel="noopener noreferrer">
                {s.photo.license}
              </a>
            ) : (
              s.photo.license
            )}{' '}
            · Wikimedia Commons
          </figcaption>
        </figure>
      )}
      {facts.length > 0 && (
        <dl className="facts story__facts">
          {facts.map(([k, v]) => (
            <div key={k} className="story__fact">
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      )}
      {sum && (
        <>
          <p className="story__text" lang={sum.lang}>
            {sum.text}
          </p>
          <p className="story__more">
            <a href={sum.url} target="_blank" rel="noopener noreferrer">
              {t('readMoreWikipedia')} ↗
            </a>
          </p>
          <small className="muted story__credit">
            {t('storyCredit')}{' '}
            <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener noreferrer">
              CC BY-SA 4.0
            </a>
            {sum.lang !== lang ? ` · ${lang === 'tr' ? 'İngilizce özet' : 'Summary in Turkish'}` : ''}
          </small>
        </>
      )}
    </section>
  );
}
