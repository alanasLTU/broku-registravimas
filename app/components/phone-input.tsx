"use client";

import { displayLtPhone, isEmptyLtPhone, sanitizeLtPhoneInput } from "@/lib/phone";

type Props = {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  className?: string;
  required?: boolean;
  autoComplete?: string;
};

export default function PhoneInput({ value, onChange, id, className, required, autoComplete = "tel" }: Props) {
  const display = displayLtPhone(value);

  return (
    <input
      id={id}
      type="tel"
      inputMode="numeric"
      autoComplete={autoComplete}
      className={className}
      value={display}
      required={required && isEmptyLtPhone(value)}
      onFocus={() => {
        if (isEmptyLtPhone(value)) onChange("");
      }}
      onChange={(event) => onChange(sanitizeLtPhoneInput(event.target.value))}
      onKeyDown={(event) => {
        if (event.key.length === 1 && /[a-zA-Z]/i.test(event.key)) event.preventDefault();
      }}
      onPaste={(event) => {
        event.preventDefault();
        const text = event.clipboardData.getData("text");
        onChange(sanitizeLtPhoneInput(text));
      }}
    />
  );
}
