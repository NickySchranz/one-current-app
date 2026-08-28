/**
 * Testing affordances (fast clock, local Pro unlock, super-bonk fill, server
 * address override) are for development and review builds only. Production
 * builds hide them entirely; set EXPO_PUBLIC_SHOW_TESTING=1 to bring them
 * back in a special build.
 */
export const SHOW_TESTING = __DEV__ || process.env.EXPO_PUBLIC_SHOW_TESTING === "1";

/**
 * The testing panel (fast clock, Pro unlock, super-bonk fill, always-drop
 * tokens) exists ONLY in capture builds — the promo footage scripts drive the
 * app through it. Not even dev builds show it; export with
 * EXPO_PUBLIC_SHOW_TESTING=1 to get one.
 */
export const CAPTURE_TESTING = process.env.EXPO_PUBLIC_SHOW_TESTING === "1";
