export const LT_PHONE_PREFIX = "+370";

/** Normalizuoja į +370XXXXXXXX arba tuščią eilutę. */
export function sanitizeLtPhoneInput(raw: string) {
  const digits = raw.replace(/\D/g, "");
  let national = digits;
  if (national.startsWith("370")) national = national.slice(3);
  national = national.slice(0, 8);
  if (!national) return "";
  return `${LT_PHONE_PREFIX}${national}`;
}

export function displayLtPhone(value: string) {
  const normalized = sanitizeLtPhoneInput(value);
  return normalized || LT_PHONE_PREFIX;
}

export function isEmptyLtPhone(value: string) {
  return !sanitizeLtPhoneInput(value);
}
