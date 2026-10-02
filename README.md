# figma-guitar-tab

A Figma plugin for creating guitar tablature and fretboard diagrams in design files.

The plugin converts user-provided ASCII notation into formatted Figma nodes (lines, text, and frames), and stores the source notation alongside render settings so a generated diagram can be re-edited later.

## Modes

The plugin has two modes, each occupying its own tab in the plugin UI:

- **Tab** (traditional tablature) — horizontal axis is time, vertical axis is guitar string.
- **Fretboard** (fretboard diagram) — horizontal axis is fret number, vertical axis is guitar string.

The bracketed names are the spec's terms; the bold ones are what the UI shows.
See [Naming and UI copy](docs/spec.md#naming-and-ui-copy).

## Documentation

| Document | Contents |
| --- | --- |
| [docs/spec.md](docs/spec.md) | Normative product specification. The source of truth for behavior. |
| [AGENTS.md](AGENTS.md) | Engineering conventions for anyone (human or agent) writing code here. |

## Getting started

Requires Node 20+, [pnpm](https://pnpm.io), and the Figma **desktop** app — development plugins cannot be loaded in the browser.

```sh
pnpm install
pnpm build
```

Then, in the Figma desktop app: **Plugins → Development → Import plugin from manifest…** and choose this repo's `manifest.json`.
The plugin then appears under Plugins → Development → Guitar Tab.

`pnpm dev` rebuilds on change.
Figma does not hot-reload, so re-run the plugin from the menu (or ⌥⌘P to re-run the last plugin) after a rebuild.

## Commands

| Command | Does |
| --- | --- |
| `pnpm build` | One-shot production build into `dist/` |
| `pnpm dev` | Same build, in watch mode |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm lint` | oxlint, type-aware rules |
| `pnpm test` | Vitest, run once |
| `pnpm check` | typecheck + lint + test. The gate for any change. |

## Layout

```
manifest.json          Figma plugin manifest
scripts/build.mjs      esbuild build: bundles both halves, compiles Tailwind, inlines the UI
src/core/              Pure TypeScript. Parsing, layout, settings, protocol types. No Figma, no React.
src/plugin/            The Figma sandbox half. Turns core's layout output into real nodes.
src/ui/                The React + Tailwind iframe.
docs/spec.md           Normative spec
```

See [AGENTS.md](AGENTS.md) for why the boundary between `core/` and `plugin/` is drawn where it is, and what must not cross it.
