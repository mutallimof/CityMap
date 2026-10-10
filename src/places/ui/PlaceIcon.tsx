import { iconUrl, kindOfPlace, type IconKind } from '../icons';

/** The map's icon for a place, as an <img> (lists, sheets, search, legend). */
export function PlaceIcon({ kind, category, icon, size = 30 }: { kind?: string; category?: string; icon?: IconKind; size?: number }) {
  const k = icon ?? kindOfPlace(kind ?? '', category ?? '');
  return <img className="picon-img" src={iconUrl(k, size - 6)} width={size} height={size} alt="" aria-hidden />;
}
