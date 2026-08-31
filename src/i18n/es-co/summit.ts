/**
 * Summit-theme copy (Colombia). Keys are the theme's own English strings —
 * the values THEME_COPY (src/ui/theme-copy.ts) remaps to while summit is
 * active. Map/creation surfaces keep the warm tuteo with Colombian lexicon;
 * the cut flow uses usted, matching quick.ts's burn flow.
 */
export const summit: Record<string, string> = {
  // the rope prompts
  "Grab on!": "¡Agárrate, parce!",
  "Take hold!": "¡Cógela!",
  "This one's swaying — grab on.": "Esta se balancea — agárrala.",
  "Ready? Grab the rope.": "¿Listo? Agarra la cuerda.",

  // the summit party
  "You did it!": "¡Lo lograste, parce!",
  "Every rope handled. The summit is yours today.": "Cada cuerda atendida. Hoy la cumbre es tuya.",

  // the pill
  "Chalk!": "¡Magnesio!",
  "FULL SEND!": "¡DE UNA!",
  "Have Pip steady this rope": "Que Pip asegure esta cuerda",
  "Full send: Pip steadies every rope": "De una: Pip asegura todas las cuerdas",

  // the map + help
  "New rope": "Nueva cuerda",
  "This rope": "Esta cuerda",
  "coiled · {title}": "recogida · {title}",
  "Reading the ropes": "Cómo leer las cuerdas",
  "solid = active · curved back = integrated · thicker = louder · coiled ✓ = decided today":
    "sólida = activa · curva de vuelta = integrada · más gruesa = suena más duro · ✓ recogida = decidido hoy",
  "drag or scroll = move along the climb · along the dates = move faster":
    "arrastra o desplázate = moverse por la escalada · junto a las fechas = más rápido",
  "chalk = Pip steadies a rope, easing its loudness for today":
    "magnesio = Pip asegura una cuerda y suaviza su volumen por hoy",
  "When something begins pulling part of your attention away from the present, add it as a rope with the + button. You can integrate it when it has given you what it carries.":
    "Cuando algo empiece a llevarse parte de tu atención del presente, agrégalo como una cuerda con el botón +. Puedes integrarla cuando te haya dado lo que trae.",

  // wholeness chip + map a11y
  "{decided} of {active} open ropes already answered today.":
    "{decided} de {active} cuerdas abiertas ya respondidas hoy.",
  "Every open rope has its decision for today. Nothing more is asked of you.":
    "Cada cuerda abierta ya tiene su decisión de hoy. No se te pide nada más.",
  "{title} is currently the loudest rope.": "{title} es ahorita la cuerda que suena más duro.",
  "No ropes reach today.": "Ninguna cuerda llega a hoy.",
  "One rope reaches today.": "Una cuerda llega a hoy.",
  "{n} ropes reach today.": "{n} cuerdas llegan a hoy.",
  "One rope has been integrated and remains part of your history.":
    "Una cuerda fue integrada y sigue siendo parte de tu historia.",
  "{n} ropes have been integrated and remain part of your history.":
    "{n} cuerdas fueron integradas y siguen siendo parte de tu historia.",
  "Rope reaching today": "Cuerda que llega a hoy",
  "Currently activated rope": "Cuerda activada en este momento",
  "Explored rope, still active": "Cuerda explorada, todavía activa",
  "In tension with another rope": "En tensión con otra cuerda",

  // creation
  "Name the rope": "Nombra la cuerda",
  "Fix the rope": "Fija la cuerda",
  "The new rope taking shape": "La nueva cuerda tomando forma",
  "This resembles a rope you integrated before.": "Se parece a una cuerda que ya integraste.",

  // quick-action tray
  "What does this rope need from you now?": "¿Qué necesita esta cuerda de ti ahora?",
  "How loud is this rope right now?": "¿Qué tan fuerte suena esta cuerda en este momento?",
  "Understand this rope": "Entender esta cuerda",
  "What is true about this rope now?": "¿Qué es verdad sobre esta cuerda ahora?",
  "The rope you are answering": "La cuerda que estás respondiendo",
  "Your ropes today": "Tus cuerdas hoy",

  // integrated panel + integrate wizard
  "Integrated ropes": "Cuerdas integradas",
  "Now. Select to see integrated ropes.": "Ahora. Selecciona para ver las cuerdas integradas.",
  "No integrated ropes yet.": "Todavía no hay cuerdas integradas.",
  "When you integrate a rope it appears here — tap to revisit it on the timeline.":
    "Cuando integras una cuerda aparece acá — tócala para volver a verla en la línea de tiempo.",
  "Tap a rope to see where it rejoined your main line.":
    "Toca una cuerda para ver dónde volvió a unirse a tu línea principal.",
  "This rope is complete for now.": "Esta cuerda está completa por ahora.",
  "These ropes are complete for now.": "Estas cuerdas están completas por ahora.",
  "This rope is complete for now. If it returns, you can meet the new version of it.":
    "Esta cuerda está completa por ahora. Si vuelve, podrás encontrarte con su nueva versión.",
  "{n} ropes entering the present together": "{n} cuerdas entrando juntas en el presente",
  "This rope no longer exists.": "Esta cuerda ya no existe.",
  "These ropes are no longer available.": "Estas cuerdas ya no están disponibles.",

  // understand flow
  "Two points on the same rope: where it began, and where you actually are.":
    "Dos puntos de la misma cuerda: donde se abrió y donde estás en realidad.",
  "Tap what's true. Naming it is how the rope starts loosening.":
    "Toca lo que sea verdad. Nombrarlo es como la cuerda empieza a soltarse.",
  "What this rope makes you feel": "Qué te hace sentir esta cuerda",
  "What feels less available while this rope is active?":
    "¿Qué se siente menos disponible mientras esta cuerda está activa?",
  "What feels less available while this rope is active":
    "Qué se siente menos disponible mientras esta cuerda está activa",
  "Moments on this rope": "Momentos en esta cuerda",

  // the cut (usted, like the burn flow)
  "Cut it away": "Córtelo",
  "What falls with it?": "¿Qué cae con ella?",
  "Cut {item} loose": "Cortar {item}",
  "Take {item} back": "Recuperar {item}",
  "This rope will be gone from the app — completely. No line, no history. Only the lesson stays.":
    "Esta cuerda va a desaparecer de la aplicación — del todo. Sin línea, sin historial. Solo queda la lección.",
  "Cut the rope": "Corte la cuerda",
  "The lesson you carry up the mountain": "La lección que lleva montaña arriba",
  "The drop takes the weight. You keep this.": "La caída se lleva el peso. Usted se queda con esto.",
};
