"use client";

import { useEffect, useId, useState } from "react";
import { formatLtDateInput, formatLtLong, isoToLt, ltToIso } from "@/lib/date-format";

type Props = {
  value: string;
  onChange: (iso: string) => void;
  required?: boolean;
  id?: string;
  className?: string;
  name?: string;
};

export default function DateInput({ value, onChange, required, id, className, name }: Props) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const nativeId = `${inputId}-native`;
  const [text, setText] = useState(() => isoToLt(value));

  useEffect(() => {
    setText(isoToLt(value));
  }, [value]);

  function applyText(nextRaw: string) {
    const formatted = formatLtDateInput(nextRaw);
    setText(formatted);
    const iso = ltToIso(formatted);
    if (iso) {
      onChange(iso);
      setText(isoToLt(iso));
      return;
    }
    if (!formatted.trim()) onChange("");
  }

  function commit(nextText = text) {
    const formatted = formatLtDateInput(nextText);
    const iso = ltToIso(formatted);
    if (iso) {
      onChange(iso);
      setText(isoToLt(iso));
      return;
    }
    if (!formatted.trim()) {
      onChange("");
      setText("");
      return;
    }
    setText(isoToLt(value));
  }

  return (
    <div className={`date-input ${className ?? ""}`}>
      <div className="date-input-row">
        <input
          id={inputId}
          type="text"
          inputMode="text"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          enterKeyHint="done"
          placeholder="dd.mm.yyyy"
          value={text}
          onChange={(event) => applyText(event.target.value)}
          onBlur={() => commit(text)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commit(text);
            }
          }}
          required={required && !value}
          aria-describedby={`${inputId}-hint`}
        />
        <div className="date-input-picker-wrap">
          <span className="date-input-picker-icon" aria-hidden>📅</span>
          <input
            id={nativeId}
            type="date"
            lang="lt-LT"
            className="date-input-native"
            value={value}
            onChange={(event) => {
              onChange(event.target.value);
              setText(isoToLt(event.target.value));
            }}
            aria-label="Atidaryti kalendorių"
          />
        </div>
      </div>
      {name ? <input type="hidden" name={name} value={value} /> : null}
      {value ? (
        <small id={`${inputId}-hint`} className="date-input-hint">{formatLtLong(value)}</small>
      ) : (
        <small id={`${inputId}-hint`} className="date-input-hint">Įveskite dd.mm.yyyy arba paspauskite 📅</small>
      )}
    </div>
  );
}
