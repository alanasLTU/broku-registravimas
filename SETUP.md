# Brokų registras — ką pajungti (Vercel + nauja Supabase)

Nieko neveikia, kol nėra raktų. Kodas jau paruoštas Next.js / Vercel.

## 1. Supabase (nauja paskyra)

1. Sukuriame projektą EU (Frankfurt arba Ireland).
2. **SQL Editor** → New query → įklijuojame visą failą  
   `supabase/migrations/20260825120000_init.sql` → Run.
3. **Authentication → Providers → Email**: įjungti magic link / OTP.
4. **Authentication → URL Configuration**
   - Site URL: `http://localhost:3000` (produkcija `https://brokai.digroup.lt`)
   - Redirect URLs:
     - `http://localhost:3000/auth/callback`
     - `http://localhost:3000/**`
     - `https://<jūsų>.vercel.app/auth/callback`
     - `https://brokai.digroup.lt/auth/callback`
5. **Settings → API** nukopijuoti:
   - Project URL
   - `anon` `public` key
   - `service_role` (nebūtinas startui, nelaikyti fronte)

Pirmas prisijungęs el. paštas tampa **staff** (Distyle). Kiti — klientai, kol pakviesite į projektą.

Pakelti kolegą į staff (SQL):

```sql
update public.profiles set role = 'staff' where email = 'kolega@distyle.lt';
```

## 2. Lokaliai

`.env.local` projekto šaknyje:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

```
npm install
npm run dev
```

Atidaryti http://localhost:3000 → login → magic link.

## 3. Vercel

1. Importuoti Git repo (arba `vercel` CLI).
2. Tie patys env vars (Production + Preview).
3. Domain: `brokai.digroup.lt` → CNAME į `cname.vercel-dns.com`.
4. Supabase Redirect URLs papildyti produkcijos adresu.

## 4. Kaip naudoti

- Distyle mato visus projektus (startui įdėta **BURGA**).
- **Komanda** mygtukas: kviesti klientą el. paštu + kopijuoti `/login?invite=...` nuorodą. Klientas turi prisijungti **tuo pačiu** paštu.
- Jungiklis „klientas mato ir mūsų brokus“ — `clients_see_staff_records`.
- Klientas be to jungiklio mato tik **savo** įkeltus įrašus.
- Naujas įrašas: paskutinis projektas ir tipas įsimenami telefone.
- Privaloma: pavadinimas, patalpa, zona, aprašymas. Brokui — bent 1 nuotrauka.
- Limitai: 6 nuotraukos (10 MB) ir 1 video (40 MB). Failai keliami tiesiai į Supabase Storage (Vercel limito apeinama).

## 5. Odoo

Laukai `projects.odoo_project_id` ir `records.odoo_id` jau schemoje. Sinchronizacija — vėliau.
