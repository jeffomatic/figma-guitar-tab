# figma-guitar-tab

A Figma plugin for creating guitar tablature and fretboard diagrams in design files.

The plugin converts user-provided ASCII notation into formatted Figma nodes (lines, text, and frames), and stores the source notation alongside render settings so a generated diagram can be re-edited later.

## Modes

The plugin has two modes, each occupying its own tab in the plugin UI:

- **Tab** (traditional tablature) — horizontal axis is time, vertical axis is guitar string.
- **Fretboard** (fretboard diagram) — horizontal axis is fret number, vertical axis is guitar string.

The bracketed names are the spec's terms; the bold ones are what the UI shows.
See [Naming and UI copy](docs/spec.md#naming-and-ui-copy).

Both modes support 4-, 6- and 7-string instruments — bass, guitar and seven-string guitar.
The string count comes from the number of lines in the source, and any other count is rejected rather than rendered.

## Documentation

| Document | Contents |
| --- | --- |
| [docs/examples.md](docs/examples.md) | Example sources for both modes, to paste into the plugin. |
| [docs/spec.md](docs/spec.md) | Normative product specification. The source of truth for behavior. |
| [AGENTS.md](AGENTS.md) | Engineering conventions for anyone (human or agent) writing code here. |

## Getting started

Requires Node 22.12+, [pnpm](https://pnpm.io), and the Figma **desktop** app — development plugins cannot be loaded in the browser.

```sh
pnpm install
pnpm build
```

Then, in the Figma desktop app: **Plugins → Development → Import plugin from manifest…** and choose this repo's `manifest.json`.
The plugin then appears under Plugins → Development → Guitar Tab.

`pnpm dev` rebuilds on change.
Figma does not hot-reload, so re-run the plugin from the menu (or ⌥⌘P to re-run the last plugin) after a rebuild.

## Editor setup

Formatting is handled by [oxfmt](https://oxc.rs/docs/guide/usage/formatter), which runs from this repo's own `node_modules`.
There is nothing to install globally.

**VS Code, Cursor, and other VS Code–based editors:** install the [Oxc extension](https://marketplace.visualstudio.com/items?itemName=oxc.oxc-vscode) (`oxc.oxc-vscode`).
The editor offers it the first time you open this folder, because it's listed in `.vscode/extensions.json`; otherwise search for "Oxc" in the Extensions panel.
`.vscode/settings.json` is checked in and already enables format-on-save for TypeScript and JavaScript, so once the extension is installed, saving a file formats it.
The extension runs `oxfmt --lsp` out of this project, so run `pnpm install` first or it has no formatter to talk to.
The same extension also surfaces oxlint's diagnostics inline.

**Any other editor:** run `pnpm format` before committing.
`pnpm check` fails on an unformatted file, so nothing unformatted gets far.

Only TypeScript and JavaScript are formatted.
Markdown, JSON, YAML, CSS and HTML are excluded in `.oxfmtrc.json` — prose here uses semantic line breaks, reflowing an ASCII example would change what it means, and the UI's HTML and CSS carry build markers and Tailwind directives.
Don't widen that list without reading the note in [AGENTS.md](AGENTS.md).

## Commands

| Command | Does |
| --- | --- |
| `pnpm build` | One-shot production build into `dist/` |
| `pnpm dev` | Same build, in watch mode |
| `pnpm format` | oxfmt, writing in place |
| `pnpm format:check` | oxfmt, reporting instead of writing |
| `pnpm typecheck` | `tsc` for each of `src/core`, `src/plugin` and `src/ui` |
| `pnpm lint` | oxlint, type-aware rules |
| `pnpm test` | Vitest, run once |
| `pnpm check` | format check + typecheck + lint + test. The gate for any change. |

## Layout

```
manifest.json          Figma plugin manifest
scripts/build.mjs      esbuild build: bundles both halves, compiles Tailwind, inlines the UI
src/core/              Pure TypeScript: parsing, layout, measurement, settings, diagnostics, plugin data, protocol types. No Figma, no React.
src/plugin/            The Figma sandbox half. Turns core's layout output into real nodes.
src/ui/                The React + Tailwind iframe.
docs/spec.md           Normative spec
docs/examples.md       Example sources for both modes
AGENTS.md              Engineering conventions
.oxfmtrc.json          Formatting options, and the file types deliberately left unformatted
.vscode/               Checked-in editor settings: format-on-save, and the Oxc extension recommendation
tsconfig.base.json     Shared compiler options; each area has its own tsconfig.json beside its code
.oxlintrc.json         Lint rules, type-aware
vitest.config.ts       Test discovery: src/**/*.test.ts, co-located with the code
pnpm-workspace.yaml    Allows esbuild's install script, which pnpm blocks by default
.editorconfig          Markdown stays semantically line-broken, never column-wrapped
```

See [AGENTS.md](AGENTS.md) for why the boundary between `core/` and `plugin/` is drawn where it is, and what must not cross it.
