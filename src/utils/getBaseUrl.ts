/**
 * Gets the base URL for the application
 * Prioritizes production URL from environment variable over window.location.origin
 * This ensures QR codes and share links always point to production domain
 */
export const getBaseUrl = (): string => {
  // Check if we have a production URL configured
  const productionUrl = import.meta.env.VITE_APP_URL;

  if (productionUrl) {
    // Remove trailing slash if present
    return productionUrl.replace(/\/$/, '');
  }

  // Fallback to current origin for local development
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }

  // Fallback for SSR or edge cases
  return 'https://meshfahem.com';
};

/**
 * Generates a join URL for a game
 * @param gameCode - The 6-digit game code
 * @returns Full URL to join the game
 */
export const getGameJoinUrl = (gameCode: string): string => {
  return `${getBaseUrl()}/join/${gameCode}`;
};
