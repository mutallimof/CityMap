import { toIstanbul } from '../../sim/time';
import { useT } from '../../ui/i18n';
import { services } from '../../ui/services';

/** Whether a line runs on its real timetable today (else the simulated schedule). */
export function isReal(lineId: string): boolean {
  const { clock, getDay } = services();
  return getDay(toIstanbul(clock.now()).day).modes[lineId] === 'real';
}

/** "Official timetable" / "Simulated schedule" label for a line. */
export function TimetableBadge({ real }: { real: boolean }) {
  const t = useT();
  return <span className={`ttbadge ${real ? 'ttbadge--live' : ''}`}>{t(real ? 'liveTimetable' : 'simulated')}</span>;
}

/** Source credit for real times (e.g. "Times: Şehir Hatları winter timetable 2026-27"). */
export function TimetableCredit() {
  const t = useT();
  const tt = services().timetables;
  if (!tt) return null;
  return (
    <small className="muted credit">
      {t('timetableCredit')}:{' '}
      <a href={tt.url} target="_blank" rel="noreferrer">
        {tt.source}
      </a>
    </small>
  );
}
