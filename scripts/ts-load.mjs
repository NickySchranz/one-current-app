/* Load the app's domain layer in plain Node.
 *
 * The domain is pure TypeScript with extensionless relative imports, which is
 * what Metro and tsc want and what `node --experimental-strip-types` cannot
 * resolve for VALUE imports (type-only ones vanish, so a file can look fine
 * until the first real import crosses a folder). Rather than bend the source
 * to suit one script, transpile the tree once into a temp dir and fix the
 * specifiers there.
 *
 * TypeScript is already a devDependency, so this pulls in nothing new.
 */
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const SRC = new URL("../src/domain", import.meta.url).pathname;
let out = null;

function build(dir, root) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      build(full, root);
      continue;
    }
    if (!entry.endsWith(".ts")) continue;
    const js = ts.transpileModule(readFileSync(full, "utf8"), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
    }).outputText;
    const dest = join(root, relative(SRC, full)).replace(/\.ts$/, ".mjs");
    mkdirSync(dirname(dest), { recursive: true });
    // `from "./types"` -> `from "./types.mjs"`; a trailing slash means /index.
    writeFileSync(
      dest,
      js.replace(/(from\s+")(\.[^"]*?)(")/g, (_m, a, spec, c) =>
        `${a}${spec}${spec.endsWith("/") ? "index.mjs" : ".mjs"}${c}`,
      ),
    );
  }
}

/** Import one domain module by its path under src/domain, e.g. "branches/logic". */
export function loadDomain(modulePath) {
  if (out === null) {
    out = mkdtempSync(join(tmpdir(), "one-current-domain-"));
    build(SRC, out);
  }
  const file = modulePath.endsWith(".mjs") ? modulePath : `${modulePath}.mjs`;
  return import(pathToFileURL(join(out, file)).href);
}
