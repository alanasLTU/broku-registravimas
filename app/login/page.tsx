import LoginForm from "./login-form";
import { supabaseConfigured } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ invite?: string; join?: string; error?: string; email?: string }> }) {
  const params = await searchParams;
  const configured = supabaseConfigured();
  const guestFlow = Boolean(params.invite || params.join);

  return (
    <main className="access-denied">
      <div>
        <span>DISTYLE</span>
        <h1>Darbų ir brokų registras</h1>
        {!configured ? (
          <p>Pirmiausia į `.env.local` įrašykite Supabase URL ir anon raktą. Instrukcija — SETUP.md.</p>
        ) : (
          <>
            {guestFlow ? (
              <p>Pirmas kartas: įveskite <b>savo el. paštą</b> ir slaptažodį (bent 6 simboliai). Jei paskyros dar nėra — ji bus sukurta iš karto, be el. pašto patvirtinimo. Kitą kartą jungkitės tuo pačiu acc.</p>
            ) : (
              <p>Prisijunkite el. paštu ir slaptažodžiu. Nauji klientai / komanda: Argintas sukuria paskyrą arba atsiunčia objekto nuorodą — registracija vyksta be laiškų.</p>
            )}
            {params.error ? <p className="login-error">{params.error}</p> : null}
            <LoginForm invite={params.invite ?? ""} join={params.join ?? ""} email={params.email ?? ""} />
            <noscript>
              <p className="login-error">Telefone reikia JavaScript. Jei mygtukas nereaguoja, perkraukite puslapį tame pačiame Wi‑Fi.</p>
            </noscript>
          </>
        )}
      </div>
    </main>
  );
}
