import type { SettingRange } from "../core/settings";
import { NumberField } from "./NumberField";

interface Props<T extends { [K in keyof T]: number }> {
  order: (keyof T)[];
  values: T;
  ranges: Record<keyof T, SettingRange>;
  labels: Record<keyof T, string>;
  onChange: (update: (current: T) => T) => void;
}

/** One number input per setting of one mode, in the given order, filled row by row. */
export function SettingsFields<T extends { [K in keyof T]: number }>({
  order,
  values,
  ranges,
  labels,
  onChange,
}: Props<T>) {
  return (
    // Two columns of stacked fields, so each label sits right above its input
    // instead of across the window from it.
    <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 rounded-lg bg-neutral-50 p-3 ring-1 ring-neutral-200 ring-inset">
      {order.map((name) => (
        <NumberField
          key={String(name)}
          label={labels[name]}
          range={ranges[name]}
          value={values[name]}
          onChange={(value) => {
            onChange((current) => ({ ...current, [name]: value }));
          }}
        />
      ))}
    </div>
  );
}
