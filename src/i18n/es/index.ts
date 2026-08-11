import { common } from "./common";
import { wholeness } from "./wholeness";
import { timeline } from "./timeline";
import { quick } from "./quick";
import { inspection } from "./inspection";
import { history } from "./history";
import { paywall } from "./paywall";
import { auth } from "./auth";

/**
 * Spanish app copy, keyed by the English source strings.
 * Split per feature; a missing key simply falls back to English.
 */
export const es: Record<string, string> = {
  ...common,
  ...wholeness,
  ...timeline,
  ...quick,
  ...inspection,
  ...history,
  ...paywall,
  ...auth,
};
