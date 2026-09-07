export type EmailTemplate = "user_invite" | "record_assigned" | "record_updated";

export type EmailPayload = {
  to: string[];
  subject: string;
  html: string;
  text: string;
};

function appUrl() {
  return process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3001";
}

function layout(title: string, body: string) {
  return `<!DOCTYPE html>
<html lang="lt">
<head><meta charset="utf-8"><title>${title}</title></head>
<body style="margin:0;padding:0;background:#f4f6f5;font-family:Arial,Helvetica,sans-serif;color:#1f2a26;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f5;padding:24px 12px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e3e8e4;">
        <tr><td style="background:#1f4d3a;padding:20px 24px;">
          <div style="color:#ffffff;font-size:12px;letter-spacing:.12em;text-transform:uppercase;">DISTYLE</div>
          <div style="color:#ffffff;font-size:22px;font-weight:700;margin-top:6px;">${title}</div>
        </td></tr>
        <tr><td style="padding:24px;font-size:15px;line-height:1.6;">${body}</td></tr>
        <tr><td style="padding:0 24px 24px;color:#6e7974;font-size:12px;line-height:1.5;">
          Šis laiškas išsiųstas automatiškai iš Brokų registro.<br>
          Jei turite klausimų, susisiekite su projekto vadovu.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function button(label: string, href: string) {
  return `<p style="margin:24px 0 8px;">
    <a href="${href}" style="display:inline-block;background:#1f4d3a;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:700;">${label}</a>
  </p>`;
}

function fieldRows(rows: Array<{ label: string; value: string }>) {
  return rows.filter((row) => row.value).map((row) => `
    <tr>
      <td style="padding:8px 0;color:#69746f;font-size:13px;width:38%;vertical-align:top;">${row.label}</td>
      <td style="padding:8px 0;color:#1f2a26;font-size:14px;font-weight:600;">${row.value}</td>
    </tr>
  `).join("");
}

export function buildUserInviteEmail(input: {
  displayName: string;
  email: string;
  password: string;
  roleLabel: string;
}) {
  const loginUrl = `${appUrl()}/login`;
  const subject = "Jūsų prieiga prie Brokų registro";
  const text = [
    `Sveiki, ${input.displayName}!`,
    "",
    "Jums sukurta paskyra Brokų registre.",
    `El. paštas: ${input.email}`,
    `Laikinas slaptažodis: ${input.password}`,
    `Rolė: ${input.roleLabel}`,
    "",
    `Prisijungti: ${loginUrl}`,
    "",
    "Pirmą kartą prisijungę rekomenduojame pakeisti slaptažodį.",
  ].join("\n");
  const html = layout("Prisijungimo kvietimas", `
    <p>Sveiki, <strong>${input.displayName}</strong>!</p>
    <p>Jums sukurta paskyra <strong>Brokų registre</strong>. Naudokite šiuos duomenis prisijungimui:</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0 8px;">
      ${fieldRows([
        { label: "El. paštas", value: input.email },
        { label: "Laikinas slaptažodis", value: input.password },
        { label: "Rolė", value: input.roleLabel },
      ])}
    </table>
    ${button("Prisijungti prie sistemos", loginUrl)}
    <p style="margin-top:18px;color:#69746f;font-size:13px;">Pirmą kartą prisijungę rekomenduojame pakeisti slaptažodį.</p>
  `);
  return { subject, html, text };
}

export function buildRecordAssignedEmail(input: {
  projectName: string;
  code: string;
  recordType: string;
  title: string;
  room?: string;
  zone?: string;
  responsible: string;
  status: string;
  description?: string;
  loginUrl?: string;
}) {
  const loginUrl = input.loginUrl || `${appUrl()}/login`;
  const location = [input.room, input.zone].filter(Boolean).join(" · ");
  const subject = `${input.code} · ${input.projectName} · priskirta atsakomybė`;
  const text = [
    `Objektas: ${input.projectName}`,
    `Įrašas: ${input.code} (${input.recordType})`,
    `Pozicija: ${input.title}`,
    location ? `Vieta: ${location}` : "",
    `Atsakinga šalis: ${input.responsible}`,
    `Būsena: ${input.status}`,
    input.description ? `Aprašymas: ${input.description}` : "",
    "",
    `Peržiūrėti: ${loginUrl}`,
  ].filter(Boolean).join("\n");
  const html = layout("Priskirta atsakomybė", `
    <p>Jums priskirtas naujas įrašas objekte <strong>${input.projectName}</strong>.</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0 8px;">
      ${fieldRows([
        { label: "Kodas", value: input.code },
        { label: "Tipas", value: input.recordType },
        { label: "Pozicija", value: input.title },
        { label: "Vieta", value: location },
        { label: "Atsakinga šalis", value: input.responsible },
        { label: "Būsena", value: input.status },
        { label: "Aprašymas", value: input.description || "" },
      ])}
    </table>
    ${button("Atidaryti įrašą", loginUrl)}
  `);
  return { subject, html, text };
}

export async function sendEmail(payload: EmailPayload) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  if (!apiKey || !from) {
    console.info("[email:preview]", payload.subject, "→", payload.to.join(", "));
    return { sent: false, reason: "email_not_configured" as const, preview: payload };
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
    }),
  });
  if (!response.ok) {
    const text = await response.text();
    console.error("Resend error:", text);
    return { sent: false, reason: "send_failed" as const };
  }
  return { sent: true as const };
}
