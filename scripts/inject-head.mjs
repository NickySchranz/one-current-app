/* Post-process the Expo web export: PWA manifest link, theme color, iOS icon,
   and a human title. Done here rather than through Expo's HTML templating so
   the result is deterministic regardless of SDK version.
   Usage: node scripts/inject-head.mjs [dist/index.html] */
import { readFileSync, writeFileSync } from "node:fs";

const file = process.argv[2] ?? "dist/index.html";
let html = readFileSync(file, "utf8");

const TITLE = "One Current";
const HEAD = [
  '<link rel="manifest" href="/manifest.webmanifest">',
  '<meta name="theme-color" content="#faf9f6">',
  '<link rel="apple-touch-icon" href="/apple-touch-icon.png">',
  '<meta name="apple-mobile-web-app-capable" content="yes">',
  '<meta name="apple-mobile-web-app-title" content="One Current">',
].join("");

if (html.includes('rel="manifest"')) {
  console.log("inject-head: manifest already present, leaving the file alone");
  process.exit(0);
}
html = html.includes("<title>")
  ? html.replace(/<title>[^<]*<\/title>/, `<title>${TITLE}</title>`)
  : html.replace("</head>", `<title>${TITLE}</title></head>`);
html = html.replace("</head>", `${HEAD}</head>`);
writeFileSync(file, html);
console.log(`inject-head: manifest + title written into ${file}`);
