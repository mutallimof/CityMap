import { fileOfLine, isoDate, isoWeekday } from '../../sim/real';
import { toIstanbul } from '../../sim/time';
import type { TimetableFile } from '../../sim/timetable-data';
import { useT } from '../../ui/i18n';
import { services } from '../../ui/services';
import { useUi, type Lang } from '../../ui/store';

/** Whether a line runs on its real timetable today (else the simulated schedule). */
export function isReal(lineId: string): boolean {
  const { clock, getDay } = services();
  return getDay(toIstanbul(clock.now()).day).modes[lineId] === 'real';
}

/** Who runs a line: a private operator (its timetable file names it) or Şehir Hatları. */
export function operatorName(lineId: string): string {
  const { lineById, timetables } = services();
  const op = lineById.get(lineId)?.operator;
  if (!op) return 'Şehir Hatları';
  return timetables.find((f) => f.operator?.id === op)?.operator?.name ?? op;
}

/** "Official timetable" (Şehir Hatları) / "<Operator> timetable" (private operators) / "Simulated schedule". */
export function timetableLabel(lineId: string | undefined, real: boolean, lang: Lang, t: ReturnType<typeof useT>): string {
  if (!real) return t('simulated');
  const op = lineId && services().lineById.get(lineId)?.operator;
  if (!op) return t('liveTimetable');
  return lang === 'tr' ? `${operatorName(lineId)} tarifesi` : `${operatorName(lineId)} timetable`;
}

export function TimetableBadge({ real, lineId }: { real: boolean; lineId?: string }) {
  const t = useT();
  const lang = useUi((s) => s.lang);
  return <span className={`ttbadge ${real ? 'ttbadge--live' : ''}`}>{timetableLabel(lineId, real, lang, t)}</span>;
}

/** Source credit for real times of these lines (e.g. "Times: Şehir Hatları winter timetable 2026-27"), one per file. */
export function TimetableCredit({ lineIds }: { lineIds: string[] }) {
  const t = useT();
  const { timetables } = services();
  const files = [...new Set(lineIds.map((id) => fileOfLine(timetables, id)).filter((f): f is TimetableFile => !!f))];
  if (!files.length) return null;
  return (
    <small className="muted credit">
      {t('timetableCredit')}:{' '}
      {files.map((tt, i) => {
        const read = tt.operator && Object.values(tt.lines).map((l) => l.fetched ?? '').sort().at(-1);
        return (
          <span key={tt.source}>
            {i > 0 && ' · '}
            <a href={tt.url} target="_blank" rel="noreferrer">
              {tt.source}
            </a>
            {read && ` (${t('readOn')} ${isoDate(toIstanbul(Date.parse(read)).day)})`}
          </span>
        );
      })}
    </small>
  );
}

/**
 * A service day's "continuous service" windows (printed without times) at a pier, for lines running their
 * real timetable that day (a line on its simulated schedule — e.g. a holiday the source says nothing
 * about — claims nothing printed).
 */
export function continuousAt(pierId: string, day: number): { lineId: string; to: string; start: string; end: string }[] {
  const { lineById, timetables, getDay } = services();
  const wd = isoWeekday(day);
  const type = wd === 7 ? 'sunday' : wd === 6 ? 'saturday' : 'weekday';
  const out: { lineId: string; to: string; start: string; end: string }[] = [];
  for (const line of lineById.values()) {
    if (!line.stops.includes(pierId) || getDay(day).modes[line.id] !== 'real') continue;
    for (const c of fileOfLine(timetables, line.id)?.lines[line.id].continuous ?? []) if (c.stop === pierId && c.days.includes(type)) out.push({ lineId: line.id, to: c.to, start: c.start, end: c.end });
  }
  return out;
}
