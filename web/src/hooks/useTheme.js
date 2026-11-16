import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { setTheme } from '../store/uiSlice';

export function useTheme() {
  const theme = useSelector((s) => s.ui.theme);
  const dispatch = useDispatch();

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    try {
      localStorage.setItem('theme', theme);
    } catch {
      /* storage may be unavailable */
    }
  }, [theme]);

  return { theme, toggle: () => dispatch(setTheme(theme === 'dark' ? 'light' : 'dark')) };
}
