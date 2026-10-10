import { ICON_KINDS, type IconKind } from '../places/icons';
import { PlaceIcon } from '../places/ui/PlaceIcon';
import { useT, type StringKey } from './i18n';
import { ui, useUi } from './store';

const ROWS: IconKind[] = ICON_KINDS.filter((k) => k !== 'gallery' && k !== 'cinema');

/** What the map's icons mean — colour and shape per category, featured pins, open-now dot. */
export function Legend() {
  const open = useUi((s) => s.legend);
  const t = useT();
  if (!open) return null;
  return (
    <div className="legend" role="dialog" aria-label={t('legend')}>
      <div className="legend__head">
        <b>{t('legend')}</b>
        <button className="legend__close" onClick={() => ui.set({ legend: false })} aria-label={t('close')}>
          ×
        </button>
      </div>
      <ul className="legend__list">
        {ROWS.map((k) => (
          <li key={k}>
            <PlaceIcon icon={k} size={26} />
            <span>{t(`lg_${k}` as StringKey)}</span>
          </li>
        ))}
        <li>
          <span className="legend__feat">
            <PlaceIcon icon="restaurant" size={34} />
          </span>
          <span>{t('lg_featured')}</span>
        </li>
        <li>
          <span className="legend__open" />
          <span>{t('lg_open')}</span>
        </li>
      </ul>
      <small className="muted">{t('lg_shapes')}</small>
    </div>
  );
}
