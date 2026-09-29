import { useState } from 'react';

/**
 * Number input that lets the user type freely (including empty / "2.") and only
 * commits finite numbers. Shared by wizard steps.
 * When min/max are given, an out-of-range entry is flagged inline (the wizard's
 * validation still blocks Next; this just says why while typing).
 */
export default function NumberField({ label, value, onChange, min, max, step = 'any', unit, hint }) {
  const [text, setText] = useState(null); // null = not editing
  const shown = text ?? (Number.isFinite(value) ? String(value) : '');
  const n = shown === '' ? NaN : Number(shown);
  const tooLow = Number.isFinite(n) && min != null && n < Number(min);
  const tooHigh = Number.isFinite(n) && max != null && n > Number(max);
  const invalid = tooLow || tooHigh;
  const range = min != null && max != null ? `${min}–${max}` : min != null ? `at least ${min}` : `at most ${max}`;
  return (
    <label className="dw-field">
      <span>{label}{unit ? ` (${unit})` : ''}</span>
      <input
        type="number"
        inputMode="decimal"
        min={min}
        max={max}
        step={step}
        value={shown}
        className={invalid ? 'dw-invalid' : undefined}
        aria-invalid={invalid || undefined}
        onFocus={() => setText(shown)}
        onChange={(e) => {
          setText(e.target.value);
          if (e.target.value !== '' && Number.isFinite(Number(e.target.value))) onChange(Number(e.target.value));
        }}
        onBlur={() => setText(null)}
      />
      {invalid
        ? <em className="dw-hint dw-hint-bad">Allowed range: {range}{unit ? ` ${unit}` : ''}</em>
        : hint && <em className="dw-hint">{hint}</em>}
    </label>
  );
}
