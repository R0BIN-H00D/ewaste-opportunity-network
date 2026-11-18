import { useLocation } from 'react-router-dom';

/**
 * Where the marketplace lives for the page being shown: inside the dashboard (so the side panel stays) for signed-in
 * people who opened it from there, otherwise the public address.
 */
export function marketplaceBase(pathname) {
  return pathname.startsWith('/dashboard') ? '/dashboard/marketplace' : '/marketplace';
}

export function useMarketplaceBase() {
  return marketplaceBase(useLocation().pathname);
}
