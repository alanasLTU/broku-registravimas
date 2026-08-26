"use client";

import { responsibilities, RESPONSIBLE_OTHER } from "@/lib/constants";
import type { ResponsibleParty } from "@/lib/responsible";

type ResponsiblePickerProps = {
  party: ResponsibleParty;
  otherText: string;
  onPartyChange: (party: ResponsibleParty) => void;
  onOtherTextChange: (value: string) => void;
  partyLabel?: string;
  otherLabel?: string;
  otherPlaceholder?: string;
  idPrefix?: string;
};

export default function ResponsiblePicker({
  party,
  otherText,
  onPartyChange,
  onOtherTextChange,
  partyLabel = "Atsakingas",
  otherLabel = "Kita — nurodykite",
  otherPlaceholder = "Pvz., klientas, subrangovas",
  idPrefix = "responsible",
}: ResponsiblePickerProps) {
  return (
    <>
      <label>
        <span>{partyLabel}</span>
        <select
          id={`${idPrefix}-party`}
          value={party}
          onChange={(event) => onPartyChange(event.target.value as ResponsibleParty)}
        >
          {responsibilities.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      </label>
      {party === RESPONSIBLE_OTHER && (
        <label>
          <span>{otherLabel}</span>
          <input
            id={`${idPrefix}-other`}
            value={otherText}
            onChange={(event) => onOtherTextChange(event.target.value)}
            placeholder={otherPlaceholder}
          />
        </label>
      )}
    </>
  );
}
