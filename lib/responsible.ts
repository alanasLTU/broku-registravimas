import { responsibilities, RESPONSIBLE_OTHER } from "@/lib/constants";

export type ResponsibleParty = (typeof responsibilities)[number];

const legacyResponsibleMap: Record<string, ResponsibleParty> = {
  Boruna: "Baldų gamintojas",
  Klientas: RESPONSIBLE_OTHER,
  Neaišku: "Montuotojai",
};

export function normalizeResponsibleParty(value: string): ResponsibleParty {
  if (responsibilities.includes(value as ResponsibleParty)) return value as ResponsibleParty;
  return legacyResponsibleMap[value] ?? RESPONSIBLE_OTHER;
}

export function responsibleOtherText(responsible: string, assignee: string) {
  if (normalizeResponsibleParty(responsible) !== RESPONSIBLE_OTHER) return "";
  if (assignee && assignee !== "—") return assignee;
  if (responsible !== RESPONSIBLE_OTHER && !responsibilities.includes(responsible as ResponsibleParty)) return responsible;
  if (responsible === "Klientas") return "Klientas";
  return "";
}

export function responsibleDisplay(responsible: string, assignee: string) {
  const party = normalizeResponsibleParty(responsible);
  if (party === RESPONSIBLE_OTHER) {
    const other = responsibleOtherText(responsible, assignee);
    return other ? `${RESPONSIBLE_OTHER} · ${other}` : RESPONSIBLE_OTHER;
  }
  return party;
}

export function responsibleClassSlug(responsible: string) {
  return normalizeResponsibleParty(responsible)
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function buildResponsiblePayload(party: ResponsibleParty, otherText: string) {
  return {
    responsible: party,
    assignee: party === RESPONSIBLE_OTHER ? otherText.trim().slice(0, 120) : "",
  };
}
