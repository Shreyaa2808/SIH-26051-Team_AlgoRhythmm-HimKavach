import { useState } from 'react';

/**
 * Number input that lets the user type freely (including empty / "2.") and only
 * commits finite numbers. Shared by wizard steps.
 */
export default function NumberField({ label, value, onChange, min, max, step = 'any', unit, hint }) {
  const [text, setText] = useState(null); // null = not editing
  const shown = text ?? (Number.isFinite(value) ? String(value) : '');
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
        onFocus={() => setText(shown)}
        onChange={(e) => {
          setText(e.target.value);
          if (e.target.value !== '' && Number.isFinite(Number(e.target.value))) onChange(Number(e.target.value));
        }}
        onBlur={() => setText(null)}
      />
      {hint && <em className="dw-hint">{hint}</em>}
    </label>
  );
}
