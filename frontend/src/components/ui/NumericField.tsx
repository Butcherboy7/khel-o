'use client';

import { useEffect, useState } from 'react';
import { Input } from './Input';

/**
 * Numeric input that avoids the classic controlled-input leading-zero bug:
 * binding a native `<input type="number">` straight to a `number` piece of
 * state makes clearing the field to retype a value momentarily set
 * `e.target.value === ''`, `Number('')` coerces that to `0`, React snaps the
 * DOM back to "0" mid-edit, and the next keystrokes land next to that
 * phantom zero — so typing "10" after a clear ends up as "010"/"0010"
 * instead of replacing the value.
 *
 * This keeps its own text buffer so the user can freely clear/retype, only
 * ever committing a clean, leading-zero-stripped integer upward, and
 * clamping to [min, max] once a full number is present.
 */
export interface NumericFieldProps {
  label?: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  placeholder?: string;
  error?: string;
  disabled?: boolean;
}

export function NumericField({ label, value, onChange, min, max, placeholder, error, disabled }: NumericFieldProps) {
  const [raw, setRaw] = useState(String(value));

  // Keep the local buffer in sync with external changes (switching which
  // record is being edited, a sibling field's auto-fill recomputing this
  // one, etc). Every keystroke below commits an already-normalized string,
  // so this is a no-op during normal typing and never fights the caret.
  useEffect(() => {
    setRaw(String(value));
  }, [value]);

  const commit = (nextRaw: string) => {
    if (nextRaw === '') return; // let the user finish clearing/retyping first
    let n = Number(nextRaw);
    if (Number.isNaN(n)) return;
    if (min !== undefined) n = Math.max(min, n);
    if (max !== undefined) n = Math.min(max, n);
    onChange(n);
  };

  return (
    <Input
      label={label}
      type="text"
      inputMode="numeric"
      placeholder={placeholder}
      error={error}
      disabled={disabled}
      value={raw}
      onChange={(e) => {
        const digitsOnly = e.target.value.replace(/[^\d]/g, '');
        const stripped = digitsOnly.replace(/^0+(?=\d)/, '');
        setRaw(stripped);
        commit(stripped);
      }}
      onBlur={() => {
        if (raw === '') {
          const fallback = min ?? 0;
          setRaw(String(fallback));
          onChange(fallback);
        }
      }}
    />
  );
}
