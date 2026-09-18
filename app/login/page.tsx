import { redirect } from "next/navigation";
import LoginForm from "./login-form";
import { lookupInviteToken } from "@/lib/invites";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { supabaseConfigured } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string; join?: string; error?: string; email?: string; hint?: string }>;
}) {
  const params = await searchParams;
  const configured = supabaseConfigured();
  const join = params.join ?? "";
  let invite = params.invite ?? "";
  let email = params.email ?? "";
  let hint = params.hint ?? "";
  let inviteStatus: "open" | "invalid" | "" = "";
  let inviteProjectName = "";
  const guestFlow = Boolean(invite || join);

  if (configured && invite && !hint) {
    const admin = createAdminSupabase();
    if (admin) {
      const lookup = await lookupInviteToken(admin, invite);
      if (lookup.status === "used" && lookup.email) {
        redirect(`/login?email=${encodeURIComponent(lookup.email)}&hint=invite_used`);
      }
      if (lookup.status === "invalid") {
        inviteStatus = "invalid";
        invite = "";
      } else if (lookup.status === "open") {
        inviteStatus = "open";
        email = lookup.email ?? email;
        inviteProjectName = lookup.projectName ?? "";
      }
    }
  }

  return (
    <main className="access-denied">
      <div>
        <span>DISTYLE</span>
        <h1>Darbų ir brokų registras</h1>
        {!configured ? (
          <p>Pirmiausia į `.env.local` įrašykite Supabase URL ir anon raktą. Instrukcija — SETUP.md.</p>
        ) : (
          <>
            {hint === "invite_used" ? (
              <p>Ši kvietimo nuoroda jau panaudota. Prisijunkite su el. paštu, kurį naudojote registruodamiesi, ir savo slaptažodžiu.</p>
            ) : guestFlow ? (
              <p>
                {inviteStatus === "open" ? (
                  <>
                    Kvietimas objektui{inviteProjectName ? <> <b>{inviteProjectName}</b></> : null}. Pirmą kartą sukurkite slaptažodį nurodytam el. paštui — nuoroda veikia <b>vieną kartą</b>.
                  </>
                ) : (
                  <>Kvietimas fiksuoti brokus objekte. Pirmą kartą sukurkite slaptažodį — kitą kartą užtenka prisijungti.</>
                )}
              </p>
            ) : (
              <p>Prisijunkite el. paštu ir slaptažodžiu. Nauji klientai / komanda: Argintas sukuria paskyrą arba atsiunčia objekto nuorodą — registracija vyksta be laiškų.</p>
            )}
            {inviteStatus === "invalid" ? (
              <p className="login-error">Kvietimo nuoroda nebegalioja. Paprašykite Distyle atsiųsti naują.</p>
            ) : null}
            {params.error ? <p className="login-error">{params.error}</p> : null}
            <LoginForm
              invite={invite}
              join={join}
              email={email}
              inviteStatus={inviteStatus}
              inviteProjectName={inviteProjectName}
              inviteUsed={hint === "invite_used"}
            />
            <noscript>
              <p className="login-error">Telefone reikia JavaScript. Jei mygtukas nereaguoja, perkraukite puslapį tame pačiame Wi‑Fi.</p>
            </noscript>
          </>
        )}
      </div>
    </main>
  );
}
