import { useEffect, useState } from 'react';
import { getHealth } from '../../services/api';

// Dev-only: shows whether the shared backend is reachable (P1-15).
export default function DevApiBanner() {
  const [state, setState] = useState({ status: 'checking' });

  useEffect(() => {
    let alive = true;
    getHealth()
      .then((r) => alive && setState({ status: 'ok', db: r.data?.db }))
      .catch(() => alive && setState({ status: 'down' }));
    return () => {
      alive = false;
    };
  }, []);

  if (!import.meta.env.DEV) return null;
  const text =
    state.status === 'checking' ? 'API: checking…' : state.status === 'ok' ? `API: online · DB ${state.db}` : 'API: unreachable';
  return (
    <div role="status" className="fixed bottom-3 left-3 z-50 glass-subtle px-3 py-1.5 text-xs text-ink dark:text-white">
      {text}
    </div>
  );
}
