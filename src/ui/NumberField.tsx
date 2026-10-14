import type { SettingRange } from "../core/settings";

interface Props {
  label: string;
  range: SettingRange;
  value: number;
  onChange: (value: number) => void;
}

/**
 * The range and label come from the settings module, not from here. The
 * attributes keep the normal path clean; core clamps anyway, which covers a bug
 * in this file.
 */
export function NumberField({ label, range, value, onChange }: Props) {
  const { min, max, step } = range;

  return (
    <label className="flex flex-col gap-1">
      <span className="font-medium text-neutral-600">{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => {
          const next = event.currentTarget.valueAsNumber;
          // An emptied field reads as NaN; leave the last good value alone.
          if (Number.isFinite(next)) onChange(next);
        }}
        className="w-full rounded-md bg-white px-2 py-1.5 tabular-nums shadow-xs ring-1 ring-neutral-300 transition-shadow ring-inset outline-none hover:ring-neutral-400 focus:ring-2 focus:ring-neutral-900"
      />
    </label>
  );
}
