import type { Mode } from "../core/protocol";

interface Props {
  mode: Mode;
  onChange: (mode: Mode) => void;
}

/** UI labels from the spec's naming table: the tablature mode is "Tab". */
const tabs: { mode: Mode; label: string }[] = [
  { mode: "tablature", label: "Tab" },
  { mode: "fretboard", label: "Fretboard" },
];

export function ModeTabs({ mode, onChange }: Props) {
  return (
    <div role="tablist" className="flex gap-1 border-b border-neutral-200">
      {tabs.map((tab) => {
        const active = tab.mode === mode;
        return (
          <button
            key={tab.mode}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => {
              onChange(tab.mode);
            }}
            className={`-mb-px border-b-2 px-3 py-1.5 font-medium ${
              active
                ? "border-neutral-900 text-neutral-900"
                : "border-transparent text-neutral-500 hover:text-neutral-700"
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
