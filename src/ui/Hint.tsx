import { useEffect } from 'react';
import { useT } from './i18n';
import { ui, useUi } from './store';

/** "Tap a vapur" bubble that fades after 4 s (plan §4.2). */
export function Hint({ delayMs }: { delayMs: number }) {
  const t = useT();
  const show = useUi((s) => s.hint);
  useEffect(() => {
    const id = setTimeout(() => ui.set({ hint: false }), delayMs + 4000);
    return () => clearTimeout(id);
  }, [delayMs]);
  return (
    <div className={`hint ${show ? 'hint--show' : ''}`} style={{ animationDelay: `${delayMs}ms` }} aria-live="polite">
      👆 {t('tapHint')}
    </div>
  );
}
