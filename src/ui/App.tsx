import { useEffect, useMemo, useRef, useState } from "react";

import { rangeOf, type ParseError } from "../core/diagnostics";
import type { SelectionState } from "../core/protocol";
import {
  clampTablatureSettings,
  tablatureDefaults,
  type TablatureSettings,
} from "../core/settings";
import { parseTablature } from "../core/tablature/parse";
import { post, subscribe } from "./bridge";
import { DiagnosticList } from "./DiagnosticList";
import { NumberField } from "./NumberField";
import { SourceField } from "./SourceField";

const settingOrder: (keyof TablatureSettings)[] = [
  "noteGap",
  "stringGap",
  "rowGap",
  "fontSize",
  "strokeWeight",
];

export function App() {
  const [source, setSource] = useState("");
  const [settings, setSettings] = useState<TablatureSettings>(tablatureDefaults);
  const [selection, setSelection] = useState<SelectionState>({ kind: "none" });
  const [failure, setFailure] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    /**
     * An editable selection REPLACES the editor, discarding unsaved edits: a
     * frame's plugin data is the source of truth, and the plugin keeps no dirty
     * flag. Anything else leaves the editor alone, so a stray click on empty
     * canvas can't wipe a source being typed.
     */
    const load = (next: SelectionState): void => {
      if (next.kind !== "editable") return;
      setSource(next.diagram.source);
      setSettings(next.diagram.settings);
    };

    const unsubscribe = subscribe((message) => {
      switch (message.type) {
        case "init":
          // Last-used values, for a new diagram. A selected frame's own stored
          // settings win, which `load` applies after.
          setSettings(message.defaults.tablature);
          setSelection(message.selection);
          load(message.selection);
          return;
        case "selection":
          setSelection(message.selection);
          load(message.selection);
          return;
        case "render-done":
          setFailure(null);
          return;
        case "render-failed":
          setFailure(message.message);
          return;
      }
    });

    // Nothing is pushed to us before this; the sandbox waits for it because the
    // iframe may not have mounted yet.
    post({ type: "ui-ready" });
    return unsubscribe;
  }, []);

  // Parsed locally on every keystroke. Diagnostics are measurement-free, so
  // this predicts every render-failed without knowing anything about fonts, and
  // typing never waits on a round trip.
  const parse = useMemo(() => parseTablature(source), [source]);
  const settingDiagnostics = useMemo(
    () => clampTablatureSettings(settings).diagnostics,
    [settings],
  );

  const diagnostics = [...parse.diagnostics, ...settingDiagnostics];
  const blocked =
    diagnostics.some((error) => error.severity === "error") ||
    selection.kind === "unsupported-version";

  // An empty field is self-evidently empty: `empty-source` disables the button
  // but says nothing, as the spec asks.
  const shown = diagnostics.filter((error) => error.code !== "empty-source");

  const selectInSource = (error: ParseError): void => {
    const range = rangeOf(source, error);
    const node = textareaRef.current;
    if (!range || !node) return;
    node.focus();
    node.setSelectionRange(range.start, range.end);
  };

  return (
    <main className="flex h-screen flex-col gap-3 p-3 font-sans text-xs text-neutral-900">
      <SourceField value={source} onChange={setSource} textareaRef={textareaRef} />

      <DiagnosticList diagnostics={shown} onSelect={selectInSource} />

      {selection.kind === "unsupported-version" && (
        <p className="rounded bg-amber-50 px-2 py-1 text-amber-900">
          This diagram was made by a newer version of the plugin, so it can&rsquo;t be edited here.
          Deselect it to create a new one.
        </p>
      )}

      {failure !== null && <p className="rounded bg-red-100 px-2 py-1 text-red-900">{failure}</p>}

      <div className="flex flex-col gap-2">
        {settingOrder.map((name) => (
          <NumberField
            key={name}
            name={name}
            value={settings[name]}
            onChange={(value) => {
              setSettings((current) => ({ ...current, [name]: value }));
            }}
          />
        ))}
      </div>

      <div className="mt-auto flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => {
            post({ type: "close" });
          }}
          className="rounded px-3 py-1.5 text-neutral-600 hover:bg-neutral-100"
        >
          Close
        </button>
        <button
          type="button"
          disabled={blocked}
          onClick={() => {
            post({
              type: "render",
              diagram: { mode: "tablature", settings, source },
              // A render always acts on what is selected now, so editing a
              // frame then deselecting it makes a second one. By design.
              target:
                selection.kind === "editable"
                  ? { kind: "existing", frameId: selection.frameId }
                  : { kind: "new" },
            });
          }}
          className="rounded bg-neutral-900 px-3 py-1.5 font-medium text-white disabled:bg-neutral-300"
        >
          Render
        </button>
      </div>
    </main>
  );
}
