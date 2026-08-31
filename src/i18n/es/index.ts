/**
 * Spanish (Spain) app copy, keyed by the English source strings.
 * A missing key simply falls back to English.
 */
import { common } from "./common";
import { wholeness } from "./wholeness";
import { timeline } from "./timeline";
import { quick } from "./quick";
import { inspection } from "./inspection";
import { history } from "./history";
import { paywall } from "./paywall";
import { auth } from "./auth";
import { tutorial } from "./tutorial";
import { sweep } from "./sweep";
import { summit } from "./summit";
import { shareFields } from "./share-fields";

export const es: Record<string, string> = {
  ...common,
  ...wholeness,
  ...timeline,
  ...quick,
  ...inspection,
  ...history,
  ...paywall,
  ...auth,
  ...tutorial,
  ...sweep,
  ...summit,
  ...shareFields,
};
