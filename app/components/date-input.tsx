"use client";

import { useEffect, useId, useRef, useState } from "react";
import { formatLtLong, isoToLt, ltToIso } from "@/lib/date-format";

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
  const pickerRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(() => isoToLt(value));

  useEffect(() => {
    setText(isoToLt(value));
  }, [value]);

  function commit(nextText: string) {
    const iso = ltToIso(nextText);
    if (iso) {
      onChange(iso);
      setText(isoToLt(iso));
      return;
    }
    if (!nextText.trim()) {
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
          name={name}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder="dd.mm.yyyy"
          value={text}
          onChange={(event) => setText(event.target.value)}
          onBlur={() => commit(text)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commit(text);
            }
          }}
          required={required && !value}
          aria-describedby={value ? `${inputId}-hint` : undefined}
        />
        <button
          type="button"
          className="date-input-picker"
          onClick={() => pickerRef.current?.showPicker?.()}
          aria-label="Atidaryti kalendorių"
        >
          <span aria-hidden>📅</span>
        </button>
        <input
          ref={pickerRef}
          type="date"
          lang="lt-LT"
          className="date-input-native"
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
            setText(isoToLt(event.target.value));
          }}
          tabIndex={-1}
          aria-hidden
        />
      </div>
      {name ? <input type="hidden" name={name} value={value} /> : null}
      {value ? (
        <small id={`${inputId}-hint`} className="date-input-hint">{formatLtLong(value)}</small>
      ) : (
        <small className="date-input-hint">Formatas: dd.mm.yyyy</small>
      )}
    </div>
  );
}
