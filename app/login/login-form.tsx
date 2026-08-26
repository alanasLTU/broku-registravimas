"use client";

import { FormEvent, useState } from "react";
import { SEED_STAFF_EMAIL, SEED_STAFF_PASSWORD } from "@/lib/seed-login";

export default function LoginForm({ invite, join }: { invite: string; join: string }) {
  const guestFlow = Boolean(invite || join);
  const [email, setEmail] = useState(guestFlow ? "" : SEED_STAFF_EMAIL);
  const [password, setPassword] = useState(guestFlow ? "" : SEED_STAFF_PASSWORD);
  const [status, setStatus] = useState<"idle" | "working" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === "working") return;
    setStatus("working");
    setMessage("");
    try {
      const prepare = await fetch("/api/auth/direct-login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const raw = await prepare.text();
      let prepared: { error?: string; access_token?: string; refresh_token?: string } = {};
      try {
        prepared = raw ? JSON.parse(raw) as typeof prepared : {};
      } catch {
        throw new Error("Serveris grąžino ne prisijungimo atsakymą. Perkraukite puslapį ir bandykite dar kartą.");
      }
      if (!prepare.ok) throw new Error(prepared.error || "Nepavyko prisijungti");
      if (prepared.access_token && prepared.refresh_token) {
        const { createBrowserSupabase } = await import("@/lib/supabase/client");
        const supabase = createBrowserSupabase();
        const { error } = await supabase.auth.setSession({
          access_token: prepared.access_token,
          refresh_token: prepared.refresh_token,
        });
        if (error) throw error;
      }
      const next = join
        ? `/?join=${encodeURIComponent(join)}`
        : invite
          ? `/?invite=${encodeURIComponent(invite)}`
          : "/";
      window.location.assign(next);
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Nepavyko prisijungti");
    }
  }

  return (
    <>
      {join ? <p className="login-invite">Kvietimas fiksuoti brokus objekte. Prisijungę automatiškai pateksite į projektą.</p> : null}
      {invite ? <p className="login-invite">Asmeninis kvietimas. Prisijunkite tuo pačiu el. paštu, kuriam nuoroda skirta.</p> : null}
      <form className="login-form" onSubmit={submit} noValidate>
        <label>
          <span>El. paštas</span>
          <input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" placeholder={guestFlow ? "jusu@imone.lt" : undefined} />
        </label>
        <label>
          <span>Slaptažodis</span>
          <input type="password" required minLength={6} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={guestFlow ? "new-password" : "current-password"} placeholder={guestFlow ? "Bent 6 simboliai" : undefined} />
        </label>
        <button className="primary-button" type="submit" disabled={status === "working"}>
          {status === "working" ? "Jungiamasi…" : guestFlow ? "Prisijungti / registruotis" : "Prisijungti"}
        </button>
        {message ? <p className="login-error">{message}</p> : null}
      </form>
    </>
  );
}
