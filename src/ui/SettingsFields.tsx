import type { SettingRange } from "../core/settings";
import { NumberField } from "./NumberField";

interface Props<T extends { [K in keyof T]: number }> {
  order: (keyof T)[];
  values: T;
  ranges: Record<keyof T, SettingRange>;
  labels: Record<keyof T, string>;
  onChange: (update: (current: T) => T) => void;
}

/** One number input per setting of one mode, in the given order. */
export function SettingsFields<T extends { [K in keyof T]: number }>({
  order,
  values,
  ranges,
  labels,
  onChange,
}: Props<T>) {
  return (
    <div className="flex flex-col gap-2">
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
