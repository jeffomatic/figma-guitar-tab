import { useEffect, useMemo, useRef, useState } from "react";

import { checkDiagram, hasErrors } from "../core/diagram";
import { rangeOf, type ParseError } from "../core/diagnostics";
import type { Diagram, Mode, SelectionState } from "../core/protocol";
import {
  fretboardDefaults,
  fretboardLabels,
  fretboardRanges,
  tablatureDefaults,
  tablatureLabels,
  tablatureRanges,
  type FretboardSettings,
  type TablatureSettings,
} from "../core/settings";
import { post, subscribe } from "./bridge";
import { DiagnosticList } from "./DiagnosticList";
import { ModeTabs } from "./ModeTabs";
import { OptionsFold } from "./OptionsFold";
import { SettingsFields } from "./SettingsFields";
import { SourceField } from "./SourceField";

const tablatureOrder: (keyof TablatureSettings)[] = [
  "noteGap",
  "stringGap",
  "rowGap",
  "fontSize",
  "strokeWeight",
];

const fretboardOrder: (keyof FretboardSettings)[] = [
  "fretGapWidth",
  "stringGap",
  "fontSize",
  "strokeWeight",
  "leadingFrets",
  "trailingFrets",
];

const placeholders: Record<Mode, string> = {
  tablature: "e|-------\nB|---3---\nG|-------",
  fretboard: "3\n3\n0\n0\n2\n3",
};

export function App() {
  // Each mode keeps its own source and settings, so switching tabs never loses
  // what the other one holds.
  const [mode, setMode] = useState<Mode>("tablature");
  const [sources, setSources] = useState<Record<Mode, string>>({ tablature: "", fretboard: "" });
  const [tablatureSettings, setTablatureSettings] = useState<TablatureSettings>(tablatureDefaults);
  const [fretboardSettings, setFretboardSettings] = useState<FretboardSettings>(fretboardDefaults);
  const [selection, setSelection] = useState<SelectionState>({ kind: "none" });
  const [failure, setFailure] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mainRef = useRef<HTMLElement>(null);

  // The window hugs the form. Observed rather than computed, so a tab switch, a
  // diagnostic appearing, or the textarea being dragged taller all resize it.
  useEffect(() => {
    const node = mainRef.current;
    if (!node) return;
    const observer = new ResizeObserver(() => {
      post({ type: "resize", height: node.getBoundingClientRect().height });
    });
    observer.observe(node);
    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    /**
     * An editable selection REPLACES its mode's editor, discarding unsaved
     * edits, and switches to that mode: a frame's plugin data is the source of
     * truth, and the plugin keeps no dirty flag. The other mode's editor is left
     * alone, and so is everything when nothing editable is selected, so a stray
     * click on empty canvas can't wipe a source being typed.
     */
    const load = (next: SelectionState): void => {
      if (next.kind !== "editable") return;
      const { diagram } = next;
      setMode(diagram.mode);
      setSources((current) => ({ ...current, [diagram.mode]: diagram.source }));
      if (diagram.mode === "tablature") setTablatureSettings(diagram.settings);
      else setFretboardSettings(diagram.settings);
    };

    const unsubscribe = subscribe((message) => {
      switch (message.type) {
        case "init":
          // Last-used values, for a new diagram. A selected frame's own stored
          // settings win, which `load` applies after.
          setTablatureSettings(message.defaults.tablature);
          setFretboardSettings(message.defaults.fretboard);
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

  const source = sources[mode];
  const setSource = (next: string): void => {
    setSources((current) => ({ ...current, [mode]: next }));
  };

  const diagram = useMemo<Diagram>(
    () =>
      mode === "tablature"
        ? { mode, settings: tablatureSettings, source }
        : { mode, settings: fretboardSettings, source },
    [mode, source, tablatureSettings, fretboardSettings],
  );

  // Checked locally on every keystroke, for the active mode only. Diagnostics
  // are measurement-free, so this predicts every render-failed without knowing
  // anything about fonts, and typing never waits on a round trip.
  const { diagnostics } = useMemo(() => checkDiagram(diagram), [diagram]);

  const blocked = hasErrors(diagnostics) || selection.kind === "unsupported-version";

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
    // Sized by its content, never by the window: the window follows this
    // element, so filling the window would leave nothing to measure.
    <main ref={mainRef} className="flex flex-col gap-3 p-3 font-sans text-xs text-neutral-900">
      <ModeTabs
        mode={mode}
        onChange={(next) => {
          // A failure belongs to the diagram that was sent, not to this tab.
          setFailure(null);
          setMode(next);
        }}
      />

      <SourceField
        value={source}
        placeholder={placeholders[mode]}
        onChange={setSource}
        textareaRef={textareaRef}
      />

      <DiagnosticList diagnostics={shown} onSelect={selectInSource} />

      {selection.kind === "unsupported-version" && (
        <p className="rounded bg-amber-50 px-2 py-1 text-amber-900">
          This diagram was made by a newer version of the plugin, so it can&rsquo;t be edited here.
          Deselect it to create a new one.
        </p>
      )}

      {failure !== null && <p className="rounded bg-red-100 px-2 py-1 text-red-900">{failure}</p>}

      <OptionsFold>
        {mode === "tablature" ? (
          <SettingsFields
            order={tablatureOrder}
            values={tablatureSettings}
            ranges={tablatureRanges}
            labels={tablatureLabels}
            onChange={setTablatureSettings}
          />
        ) : (
          <SettingsFields
            order={fretboardOrder}
            values={fretboardSettings}
            ranges={fretboardRanges}
            labels={fretboardLabels}
            onChange={setFretboardSettings}
          />
        )}
      </OptionsFold>

      <div className="flex items-center justify-end gap-2">
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
              diagram,
              // A render always acts on what is selected now, so editing a
              // frame then deselecting it makes a second one -- and rendering
              // from the other tab converts the selected frame. By design.
              target:
                selection.kind === "editable"
                  ? { kind: "existing", frameId: selection.frameId }
                  : { kind: "new" },
            });
          }}
          className="rounded bg-blue-600 px-3 py-1.5 font-medium text-white enabled:hover:bg-blue-700 disabled:bg-blue-300"
        >
          Render
        </button>
      </div>
    </main>
  );
}
