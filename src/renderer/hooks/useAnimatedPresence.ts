import { useEffect, useState } from 'react';

export type AnimatedPresenceState = 'open' | 'closed';

export function useAnimatedPresence(open: boolean, durationMs = 200) {
  const [isMounted, setMounted] = useState(open);
  const [state, setState] = useState<AnimatedPresenceState>(open ? 'open' : 'closed');

  useEffect(() => {
    if (open) {
      setMounted(true);
      setState('open');
      return undefined;
    }

    setState('closed');

    if (!isMounted) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setMounted(false);
    }, durationMs);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [durationMs, isMounted, open]);

  return { isMounted, state };
}
