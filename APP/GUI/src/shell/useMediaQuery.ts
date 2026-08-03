import { useEffect, useState } from 'react';

function readMatch(query: string): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia(query).matches;
}

function subscribeToQuery(media: MediaQueryList, syncMatch: () => void): () => void {
  if (typeof media.addEventListener === 'function') {
    const listener: EventListener = () => syncMatch();
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }
  const legacyListener = (() => syncMatch()) as (event: MediaQueryListEvent) => void;
  media.addListener(legacyListener);
  return () => media.removeListener(legacyListener);
}

/** Track a CSS media query in React so mobile shell behavior matches the live viewport. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => readMatch(query));

  useEffect(() => {
    const media = window.matchMedia(query);
    const syncMatch = () => setMatches(media.matches);
    syncMatch();
    return subscribeToQuery(media, syncMatch);
  }, [query]);

  return matches;
}
