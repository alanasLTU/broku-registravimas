import LoginForm from "./login-form";
import { supabaseConfigured } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ invite?: string; join?: string; error?: string }> }) {
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
              <p>Prisijunkite su <b>savo el. paštu</b> ir slaptažodžiu (bent 6 simboliai). Jei paskyros dar nėra — ji bus sukurta automatiškai.</p>
            ) : (
              <p>Prisijunkite su <b>alanas@digroup.lt</b> / <b>Distyle</b>. Tas pats prisijungimas tinka keliems telefonams vienu metu.</p>
            )}
            {params.error ? <p className="login-error">{params.error}</p> : null}
            <LoginForm invite={params.invite ?? ""} join={params.join ?? ""} />
            <noscript>
              <p className="login-error">Telefone reikia JavaScript. Jei mygtukas nereaguoja, perkraukite puslapį tame pačiame Wi‑Fi.</p>
            </noscript>
          </>
        )}
      </div>
    </main>
  );
}
