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
    <label className="flex items-center justify-between gap-3">
      <span className="text-neutral-600">{label}</span>
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
        className="w-20 rounded border border-neutral-300 px-2 py-1 text-right tabular-nums focus:border-neutral-500 focus:outline-none"
      />
    </label>
  );
}
