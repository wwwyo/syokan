/**
 * The port the global install listens on, shared by the server (bind) and the CLI
 * (base URL / lazy-spawn), so the two can never disagree about where syokan lives.
 *
 * Deliberately clear of vite's 5173 (and 4173 preview / the 5174+ walk it takes when
 * occupied): syokan is a long-lived background server, so squatting a port that frontend
 * dev servers reach for first would silently push every other project onto a fallback port.
 */
export const DEFAULT_PORT = 5773;

export const DEFAULT_BASE_URL = `http://localhost:${DEFAULT_PORT}`;
