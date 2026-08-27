/**
 * The "what leaves the app" list. These strings live in
 * src/domain/share/describe-fields.ts and are reached through t(line), so they
 * are dynamic keys: scripts/copy-lint.mjs holds a checklist of them.
 */
export const shareFields: Record<string, string> = {
  // about each thread
  "the name you gave the thread": "el nombre que le diste al hilo",
  "anything you wrote to describe it": "lo que hayas escrito para describirlo",
  "what kind of thread it is": "qué tipo de hilo es",
  "where it points (past, future, a person, your body…)":
    "hacia dónde apunta (pasado, futuro, una persona, tu cuerpo…)",
  "where it stands now": "cómo está ahora",
  "when it started": "cuándo empezó",
  "how you described when it started": "cómo describiste cuándo empezó",
  "when it was integrated": "cuándo se integró",
  "the feelings it held": "los sentimientos que sostenía",
  "what you said it makes you feel": "lo que dijiste que te hace sentir",
  "what you believed at the start, in your words":
    "lo que creías al principio, con tus palabras",
  "what you believe now, in your words": "lo que crees ahora, con tus palabras",
  "what you marked as still true and coming with you":
    "lo que marcaste como aún verdadero y que se viene contigo",
  "what you reclaimed when it integrated": "lo que recuperaste cuando se integró",
  "how much of it you said is in your hands": "cuánto dijiste que está en tus manos",
  "how many times it came back": "cuántas veces volvió",
  "what it is waiting on, and when to review it":
    "qué está esperando, y cuándo revisarlo",
  "every loudness rating you set, with its date":
    "cada nivel de volumen que marcaste, con su fecha",
  "what happened on it, day by day": "lo que pasó en él, día por día",
  "an internal reference for the thread": "una referencia interna del hilo",

  // about what happened
  "the words you gave a moment or a step": "las palabras que le diste a un momento o a un paso",
  "anything you wrote about a moment": "lo que hayas escrito sobre un momento",
  "what kind of moment it was": "qué tipo de momento fue",
  "how much you said a moment landed": "cuánto dijiste que te llegó un momento",
  "a belief a moment added, in your words":
    "una creencia que añadió un momento, con tus palabras",
  "whether a moment made the thread stronger, lighter or different":
    "si un momento dejó el hilo más fuerte, más ligero o distinto",
  "how long a step was meant to take": "cuánto se suponía que duraba un paso",
  "the standing instruction for a step": "la indicación fija de un paso",
  "the smallest version of a step": "la versión más pequeña de un paso",
  "what counted as finishing a step": "qué contaba como terminar un paso",
  "what a step carried with it": "lo que un paso llevaba consigo",
  "how the thread appeared inside a step": "cómo aparecía el hilo dentro de un paso",
  "how an integration ended": "cómo terminó una integración",
  "what you wrote when it resolved": "lo que escribiste cuando se resolvió",
  "what the thread went on to contribute": "en qué pasó a aportar el hilo",
  "what it now contributes, in your words": "qué aporta ahora, con tus palabras",
  "what you reclaimed": "lo que recuperaste",
  "what stayed true": "lo que siguió siendo verdad",
  "beliefs that aged out": "creencias que caducaron",
  "what you named as outside your control": "lo que nombraste como fuera de tu control",
  "what you released": "lo que soltaste",
  "tensions with other threads, and how they resolved":
    "tensiones con otros hilos, y cómo se resolvieron",
  "the date each thing happened": "la fecha de cada cosa que pasó",
  "what kind of record each one is": "qué tipo de registro es cada uno",

  // never included
  "words you wrote down to burn — those stay on this device":
    "las palabras que escribiste para quemar — esas se quedan en este dispositivo",
  "anything from threads you did not pick": "nada de los hilos que no marcaste",
  "your password, or anything from your account":
    "tu contraseña, ni nada de tu cuenta",
};
