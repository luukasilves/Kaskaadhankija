/**
 * How often an open round page re-renders itself [E-10][N-01].
 *
 * A plain module, so the guide (a server module) and the `AutoRefresh` client
 * component can share the number: importing it from the client component would
 * hand a server component a client reference, not a number.
 */
export const AUTO_REFRESH_MS = 60_000;
