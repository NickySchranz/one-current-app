import { common } from "./common";
import { wholeness } from "./wholeness";
import { timeline } from "./timeline";
import { quick } from "./quick";
import { inspection } from "./inspection";
import { history } from "./history";
import { paywall } from "./paywall";
import { auth } from "./auth";

/**
 * Colombian Spanish app copy, keyed by the English source strings.
 * Distinct from the Spain dictionary: preterite past ("volvió", not
 * "ha vuelto"), "agregar" over "añadir", "jalar" for pulling, "qué tan"
 * over "cómo de", plus Colombian vocabulary (trasteo, pena, sin afán,
 * durazno, liviano). A missing key simply falls back to English.
 */
export const esCO: Record<string, string> = {
  ...common,
  ...wholeness,
  ...timeline,
  ...quick,
  ...inspection,
  ...history,
  ...paywall,
  ...auth,
};
