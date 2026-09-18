import { createAdminSupabase } from "@/lib/supabase/admin";
import { INVOICE_CATEGORY_LABELS } from "@/lib/constants";
import { loadFirstPhotoByRecordId } from "@/lib/digest-media";
import { buildInvoicesDigestPdf, buildRecordsDigestPdf } from "@/lib/digest-pdf";
import { sendEmail } from "@/lib/email-templates";
import { formatMoneyFromCents, mapInvoice, sumInvoiceTotals, type InvoiceRow } from "@/lib/invoices";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  return header === `Bearer ${secret}`;
}

function yesterdayWindowVilnius() {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Vilnius",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const todayParts = formatter.formatToParts(now);
  const get = (type: string) => todayParts.find((part) => part.type === type)?.value ?? "01";
  const today = new Date(`${get("year")}-${get("month")}-${get("day")}T00:00:00+03:00`);
  const start = new Date(today);
  start.setDate(start.getDate() - 1);
  const end = new Date(today);
  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    label: new Intl.DateTimeFormat("lt-LT", { timeZone: "Europe/Vilnius", dateStyle: "long" }).format(start),
  };
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminSupabase();
  if (!admin) {
    return Response.json({ error: "Admin client not configured" }, { status: 500 });
  }
  const window = yesterdayWindowVilnius();

  const [{ data: records }, { data: invoices }] = await Promise.all([
    admin
      .from("records")
      .select("id, code, title, record_type, project_id, created_by_name, created_by_email, created_at, projects(name)")
      .gte("created_at", window.startIso)
      .lt("created_at", window.endIso)
      .is("parent_record_id", null),
    admin
      .from("invoices")
      .select("*, projects(name)")
      .gte("created_at", window.startIso)
      .lt("created_at", window.endIso),
  ]);

  const recordRows = records ?? [];
  const invoiceRows = (invoices ?? []).map((row) => mapInvoice(row as InvoiceRow));
  if (!recordRows.length && !invoiceRows.length) {
    return Response.json({ ok: true, sent: 0, reason: "empty_day" });
  }

  const projectIds = [...new Set([
    ...recordRows.map((row) => row.project_id),
    ...invoiceRows.map((row) => row.projectId),
  ])];

  const { data: projectContacts } = await admin
    .from("project_contacts")
    .select("project_id, role, notify_email, profile_id, contacts(name, email), profiles(email, display_name)")
    .in("project_id", projectIds)
    .in("role", ["project_manager", "coordinator"]);

  type Recipient = { email: string; name: string; projectIds: Set<string> };
  const recipients = new Map<string, Recipient>();

  for (const row of projectContacts ?? []) {
    if (!row.notify_email) continue;
    const profile = row.profiles as { email?: string; display_name?: string } | null;
    const contact = row.contacts as { email?: string; name?: string } | null;
    const email = profile?.email?.trim() || contact?.email?.trim() || "";
    if (!email) continue;
    const existing = recipients.get(email.toLowerCase()) ?? {
      email,
      name: profile?.display_name || contact?.name || email,
      projectIds: new Set<string>(),
    };
    existing.projectIds.add(row.project_id);
    recipients.set(email.toLowerCase(), existing);
  }

  let sent = 0;

  const recordPhotos = recordRows.length
    ? await loadFirstPhotoByRecordId(admin, recordRows.map((row) => row.id))
    : new Map();

  if (recordRows.length) {
    for (const recipient of recipients.values()) {
      const sections = projectIds
        .filter((projectId) => recipient.projectIds.has(projectId))
        .map((projectId) => {
          const projectRecords = recordRows.filter((row) => row.project_id === projectId);
          if (!projectRecords.length) return null;
          const project = projectRecords[0]?.projects as { name?: string } | null;
          return {
            projectName: project?.name ?? "Projektas",
            entries: projectRecords.map((row) => {
              const photo = recordPhotos.get(row.id);
              return {
                line: `${row.code} · ${row.record_type} · ${row.title} (${row.created_by_name || row.created_by_email || "—"})`,
                image: photo ? { bytes: photo.bytes, mimeType: photo.mimeType } : undefined,
              };
            }),
          };
        })
        .filter(Boolean) as Array<{ projectName: string; entries: Array<{ line: string; image?: { bytes: Uint8Array; mimeType: string } }> }>;
      if (!sections.length) continue;
      const entryCount = sections.reduce((acc, section) => acc + section.entries.length, 0);
      const pdf = await buildRecordsDigestPdf({ dateLabel: window.label, sections });
      const html = `<p>Sveiki, ${recipient.name}!</p><p>Vakar (${window.label}) objektuose užregistruota <strong>${entryCount}</strong> pozicijų.</p>`;
      const result = await sendEmail({
        to: [recipient.email],
        subject: `Dienos suvestinė · įrašai · ${window.label}`,
        html,
        text: `Vakar užregistruota ${entryCount} pozicijų.`,
        attachments: [{ filename: `irrasai-${window.label.replace(/\s+/g, "-")}.pdf`, content: pdf.toString("base64") }],
      });
      if (result.sent) sent += 1;
    }
  }

  if (invoiceRows.length) {
    const sections = projectIds.map((projectId) => {
      const projectInvoices = invoiceRows.filter((row) => row.projectId === projectId);
      if (!projectInvoices.length) return null;
      const projectName = (invoices ?? []).find((row) => row.project_id === projectId)?.projects as { name?: string } | null;
      const totals = sumInvoiceTotals(projectInvoices);
      return {
        projectName: projectName?.name ?? "Projektas",
        lines: projectInvoices.map((row) => `${row.supplierName} ${row.invoiceNumber} · ${INVOICE_CATEGORY_LABELS[row.category]} · ${row.chargedToLabel} · ${row.amountIncVat} €`),
        totalIncVatCents: totals.incVat,
      };
    }).filter(Boolean) as Array<{ projectName: string; lines: string[]; totalIncVatCents: number }>;

    const grandTotal = sumInvoiceTotals(invoiceRows);
    const pdf = await buildInvoicesDigestPdf({
      dateLabel: window.label,
      sections,
      grandTotalIncVatCents: grandTotal.incVat,
    });

    const digestRecipients = new Set<string>();
    for (const recipient of recipients.values()) digestRecipients.add(recipient.email);
    if (!digestRecipients.size) {
      const { data: staffProfiles } = await admin.from("profiles").select("email").in("role", ["admin", "staff"]);
      for (const profile of staffProfiles ?? []) {
        if (profile.email?.trim()) digestRecipients.add(profile.email.trim());
      }
    }

    for (const email of digestRecipients) {
      const html = `<p>Sąskaitų suvestinė už ${window.label}.</p><p>Iš viso su PVM: <strong>${formatMoneyFromCents(grandTotal.incVat)} €</strong></p>`;
      const result = await sendEmail({
        to: [email],
        subject: `Dienos suvestinė · sąskaitos · ${window.label}`,
        html,
        text: `Sąskaitų suvestinė. Viso su PVM: ${formatMoneyFromCents(grandTotal.incVat)} €`,
        attachments: [{ filename: `saskaitos-${window.label.replace(/\s+/g, "-")}.pdf`, content: pdf.toString("base64") }],
      });
      if (result.sent) sent += 1;
    }
  }

  return Response.json({ ok: true, sent, records: recordRows.length, invoices: invoiceRows.length });
}
