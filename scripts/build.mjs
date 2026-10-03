// Builds both halves of the plugin.
//
// The sandbox bundle is an ordinary file. The UI is not: Figma loads it as one
// self-contained HTML document, so there is nothing for a <link> or <script
// src> to resolve against. Steps 2-4 below (bundle, compile CSS, inline both
// into the HTML shell) therefore always run as one unit.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import esbuild from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const p = (...parts) => resolve(root, ...parts);

const watch = process.argv.includes("--watch");

const pluginOptions = {
  entryPoints: [p("src/plugin/main.ts")],
  outfile: p("dist/plugin.js"),
  bundle: true,
  format: "iife",
  target: "es2020",
  logLevel: "silent",
};

const uiOptions = {
  entryPoints: [p("src/ui/main.tsx")],
  bundle: true,
  write: false,
  format: "iife",
  target: "es2022",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  logLevel: "silent",
};

/** Compile src/ui/index.css with Tailwind. */
async function compileCss() {
  const from = p("src/ui/index.css");
  const css = await readFile(from, "utf8");
  const result = await postcss([tailwind()]).process(css, { from });
  return result.css;
}

/**
 * Inline the UI script and the compiled CSS into the HTML shell.
 * `script` is the in-memory output of the UI bundle.
 */
async function writeUiHtml(script) {
  const [shell, css] = await Promise.all([readFile(p("src/ui/index.html"), "utf8"), compileCss()]);

  for (const marker of ["<!--STYLE-->", "<!--SCRIPT-->"]) {
    if (!shell.includes(marker)) throw new Error(`src/ui/index.html is missing ${marker}`);
  }

  const html = shell
    .replace("<!--STYLE-->", `<style>\n${css}\n</style>`)
    .replace("<!--SCRIPT-->", `<script>\n${script}\n</script>`);

  await mkdir(p("dist"), { recursive: true });
  await writeFile(p("dist/ui.html"), html, "utf8");
}

function uiScriptOf(result) {
  const out = result.outputFiles?.[0];
  if (!out) throw new Error("UI bundle produced no output");
  return out.text;
}

function report(label, error) {
  console.error(`${label} failed:\n${error.message ?? error}`);
}

if (watch) {
  // Reassembly is driven from the UI build's onEnd hook so that a change to a
  // .tsx file recompiles Tailwind too -- class names it has never seen before
  // are only discovered by rescanning the templates.
  const reassemble = {
    name: "reassemble-ui",
    setup(build) {
      build.onEnd(async (result) => {
        if (result.errors.length > 0) {
          report("UI bundle", result.errors[0]);
          return;
        }
        try {
          await writeUiHtml(uiScriptOf(result));
          console.log("rebuilt dist/ui.html");
        } catch (error) {
          report("dist/ui.html", error);
        }
      });
    },
  };

  const pluginLog = {
    name: "log-plugin",
    setup(build) {
      build.onEnd((result) => {
        if (result.errors.length > 0) report("sandbox bundle", result.errors[0]);
        else console.log("rebuilt dist/plugin.js");
      });
    },
  };

  const contexts = await Promise.all([
    esbuild.context({ ...pluginOptions, plugins: [pluginLog] }),
    esbuild.context({ ...uiOptions, plugins: [reassemble] }),
  ]);

  await Promise.all(contexts.map((context) => context.watch()));
  console.log("watching for changes");
} else {
  const [, uiResult] = await Promise.all([esbuild.build(pluginOptions), esbuild.build(uiOptions)]);
  await writeUiHtml(uiScriptOf(uiResult));
  console.log("built dist/plugin.js and dist/ui.html");
}
