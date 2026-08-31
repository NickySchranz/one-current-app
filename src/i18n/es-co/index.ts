/**
 * Colombian Spanish app copy, keyed by the English source strings.
 * Distinct from the Spain dictionary: preterite past ("volvió", not
 * "ha vuelto"), "agregar" over "añadir", "jalar" for pulling, "qué tan"
 * over "cómo de", plus Colombian vocabulary (trasteo, pena, sin afán,
 * durazno, liviano, quiubo, de una). A missing key falls back to English.
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

export const esCO: Record<string, string> = {
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
