export async function copyText(text: string) {
  if (!text.trim()) return false;

  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // HTTP arba senesnė iOS — bandome fallback.
    }
  }

  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, text.length);
    const copied = document.execCommand("copy");
    document.body.removeChild(textarea);
    if (copied) return true;
  } catch {
    // Toliau bandome share.
  }

  return false;
}

export async function shareOrCopyText(text: string, title?: string) {
  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share({
        title: title ?? "Nuoroda",
        text: title ? `${title}\n${text}` : text,
        url: text,
      });
      return "shared" as const;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return "cancelled" as const;
    }
  }

  return (await copyText(text)) ? ("copied" as const) : ("failed" as const);
}
