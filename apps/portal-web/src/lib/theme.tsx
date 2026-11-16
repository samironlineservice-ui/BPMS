import { createContext, useContext, useEffect, useMemo, useState } from 'react';

type Mode = 'light' | 'dark' | 'system';
interface ThemeCtx { mode: Mode; resolved: 'light' | 'dark'; setMode: (m: Mode) => void; }
const Ctx = createContext<ThemeCtx>({ mode: 'system', resolved: 'light', setMode: () => {} });

const read = (): Mode => {
  try { return (localStorage.getItem('ads-theme') as Mode) || 'system'; } catch { return 'system'; }
};

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<Mode>(read);
  const [systemDark, setSystemDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const on = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  const resolved = mode === 'system' ? (systemDark ? 'dark' : 'light') : mode;
  useEffect(() => { document.documentElement.classList.toggle('dark', resolved === 'dark'); }, [resolved]);
  const value = useMemo<ThemeCtx>(() => ({
    mode, resolved,
    setMode: (m) => { setModeState(m); try { localStorage.setItem('ads-theme', m); } catch { /* storage yo'q */ } },
  }), [mode, resolved]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export const useTheme = () => useContext(Ctx);
