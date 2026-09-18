export function errorMessage(error: unknown, fallback = "Netikėta serverio klaida") {
  let message = fallback;
  if (error instanceof Error && error.message) message = error.message;
  else if (typeof error === "object" && error && "message" in error) {
    const raw = (error as { message?: unknown }).message;
    if (typeof raw === "string" && raw.trim()) message = raw;
  }

  const lower = message.toLowerCase();
  if (lower.includes("notes") && lower.includes("schema cache")) {
    return "Duomenų bazėje trūksta SF komentaro stulpelio. Supabase SQL Editor paleiskite migraciją invoices.notes (žr. AGENTS.md).";
  }
  if (lower.includes("could not find") && lower.includes("column") && lower.includes("invoices")) {
    return "Duomenų bazės schema pasenusi — paleiskite naujausią Supabase migraciją ir palaukite ~1 min.";
  }

  return message === fallback && error instanceof Error ? error.message || fallback : message;
}
