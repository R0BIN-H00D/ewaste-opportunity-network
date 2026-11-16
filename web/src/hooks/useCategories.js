import { useEffect, useState } from 'react';
import { categoryApi } from '../services/deviceApi';

let cache = null;
let inflight = null;

/** Categories change rarely, so they are fetched once per page load and shared. */
export function useCategories() {
  const [categories, setCategories] = useState(cache || []);
  useEffect(() => {
    if (cache) return undefined;
    let live = true;
    inflight = inflight || categoryApi.list().then((list) => (cache = list)).finally(() => (inflight = null));
    inflight.then((list) => live && setCategories(list)).catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  return categories;
}

export const _resetCategoriesCache = () => {
  cache = null;
  inflight = null;
};
