import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

type Theme = 'light' | 'dark';
const ThemeContext = createContext<{ theme: Theme; setTheme: (theme: Theme) => void } | null>(null);
const storedTheme = (): Theme | null => {
  try { const value = localStorage.getItem('caltrack.theme'); return value === 'light' || value === 'dark' ? value : null; }
  catch { return null; }
};
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreference] = useState<Theme | null>(storedTheme);
  const theme = preference || 'light';
  useEffect(() => {
    const sync = (event: StorageEvent) => { if (event.key === 'caltrack.theme' || event.key === null) setPreference(storedTheme()); };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0b1323' : '#f3f5fa');
  }, [theme]);
  const setTheme = (value: Theme) => {
    setPreference(value);
    try { localStorage.setItem('caltrack.theme', value); } catch { /* Keep the preference for this session. */ }
  };
  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

export function ThemeToggle() {
  const context = useContext(ThemeContext);
  if (!context) return null;
  return <div className="theme-switch" role="group" aria-label="Color theme">
    <span className="theme-switch-track" data-mode={context.theme} aria-hidden="true" />
    {(['light', 'dark'] as const).map((mode) => <button key={mode} type="button" aria-pressed={context.theme === mode}
      title={`Use ${mode} mode`} onClick={() => context.setTheme(mode)}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {mode === 'light' ? <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" /></>
          : <path d="M20.5 14A9 9 0 0 1 10 3.5 9 9 0 1 0 20.5 14Z" />}
      </svg><span>{mode === 'light' ? 'Light' : 'Dark'}</span>
    </button>)}
  </div>;
}
