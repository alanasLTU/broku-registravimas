# AGENTS.md — Brokų registras (DISTYLE)

Šis failas agentams ir programuotojams: kas tai per projektas, kaip paleisti, kaip veikia auth, duomenys ir ko neliesti.

## Kas tai

Vidinė Distyle programėlė objektuose fiksuoti:

- **Brokas**
- **Apimtis**
- **Papildoma apimtis**
- **Užduotis**

Orientuota į telefoną vietoje (foto, video, greitas „Naujas“). Vėliau — Odoo modulis (laukuose jau yra `odoo_id` kabliai, sinchronizacijos nėra).

Planuojamas adresas: `brokai.distyle.lt` (Vercel custom domain). Git: `https://github.com/alanasLTU/broku-registravimas.git`

Sena versija buvo ChatGPT Sites + Cloudflare D1/R2 + vinext. **To nebenaudojame.**

## Stackas

- Next.js 16 App Router, React 19, Tailwind — hostas **Vercel**
- **Supabase**: Auth, Postgres + RLS, Storage (`record-media`)
- Failai keliami **iš naršyklės tiesiai į Storage** (ne per Vercel body), nes Vercel serverless turi mažą request limitą

Lokalus paleidimas:

```bash
npm install
# .env.local turi būti užpildytas
npx next dev --hostname 0.0.0.0 --port 3000
```

- Kompiuteris: `http://localhost:3000`
- Telefonas tame pačiame Wi‑Fi: `http://<LAN-IP>:3000` (pvz. `http://192.168.1.184:3000`)

## Aplinka (`.env.local`, necommitinti)

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

- `anon` — frontas ir serveris su RLS
- `service_role` — **tik serveris** (direct login, profilio sukūrimas). Niekada `NEXT_PUBLIC_` ir niekada į chatą
- Vercel Production: tie patys kintamieji + `NEXT_PUBLIC_APP_URL=https://...`
- Tiesioginis prisijungimas be laiško: `NODE_ENV !== production` **arba** `ALLOW_DIRECT_LOGIN=true`

Schema: visą failą paleisti Supabase SQL Editor’yje, jei nauja DB:

`supabase/migrations/20260825120000_init.sql`

Seed projektas SQL: **BURGA**, Kauno LEZ.

## Prisijungimas (dabartinė būsena)

Laiškai / magic link **kol kas nenaudojami** (Supabase paštas nepatikimas testuojant).

Kol kas: el. paštas + slaptažodis per `POST /api/auth/direct-login`.

Bendras Distyle testinis acc (keli žmonės / keli telefonai vienu metu):

- El. paštas: `alanas@digroup.lt`
- Slaptažodis: `Distyle`
- Kodas: `lib/seed-login.ts`

Sesijos **neanuliuojamos** kiekvieno login metu (slaptažodis neperrašomas, jei acc jau yra), kad keli įrenginiai liktų prisijungę.

**Svarbu middleware:** kelias `/api/auth/*` turi būti viešas (`lib/supabase/middleware.ts`). Jei uždarysi, loginas „persikraus“ ir liks login puslapyje, nes POST nukreipiamas į HTML `/login`.

Po prisijungimo: `createBrowserSupabase().auth.setSession(...)` ir redirect `/`.

Produkcijoje šį direct-login reikia išjungti arba palikti tik su `ALLOW_DIRECT_LOGIN` ir pakeisti slaptažodį.

Staff: `profiles.role = 'staff'`. Klientas: `client`. Pirmas profilis be staff gali būti pakeliamas `lib/auth.ts` (`requireUser` + service role). Seed acc visada keliamas į staff per direct-login.

SQL pakelti kitą žmogų:

```sql
update public.profiles set role = 'staff' where email = 'kolega@distyle.lt';
```

## Rolės ir projektai

| Rolė | Ką mato | Ką gali |
|------|---------|---------|
| **staff** (Distyle) | Visus projektus | Kurti projektus, kviesti klientus, visus įrašus, foto |
| **client** | Tik projektus, kuriuose yra `project_members` | Fiksuoti įrašus tame objekte |

Kliento kvietimas (staff): UI **Komanda** → el. paštas → nuoroda `/login?invite=<token>`. Tokenas saugo **vieną** `project_id`. Kito Distyle sukurto objekto klientas **nemato**, kol ten atskirai nepakviesite.

`projects.clients_see_staff_records`: jei įjungta, klientas mato ir Distyle (`origin = staff`) įrašus; jei ne — tik savo (`origin = client`).

RPC: `accept_project_invite(invite_token)`.

## Įrašų taisyklės (mobilus fiksavimas)

Srautas: **Naujas** → tipas → forma.

Įrenginyje `localStorage`:

- `broku-registras:active-project-id`
- `broku-registras:active-record-type`

Privaloma: pavadinimas (`title` = baldų pozicija), **patalpa**, **zona**, bent vienas aprašymas (`record_items`). **Brokui** — bent 1 nuotrauka.

Limitai (`lib/constants.ts`): 6 nuotraukos ≤ 10 MB, 1 video ≤ 40 MB. HEIC / tuščias MIME priimami per `lib/media.ts`.

Kodai: `BR-`, `AP-`, `PA-`, `UZ-` per RPC `next_record_code`.

## Duomenų modelis (Postgres)

- `profiles` — `id` = `auth.users.id`, `role` staff\|client
- `projects` — `clients_see_staff_records`, `odoo_project_id`
- `project_members`, `project_invites`
- `records` — tipas, title, room, zone, origin staff\|client, statusas, `odoo_id`
- `record_items`, `record_media` (`object_key` Storage), `record_events`

Storage kelias: `{project_id}/{record_id}/{file}`. Bucket privatus `record-media`.

RLS: `private.is_staff()`, `private.is_project_member(uuid)` — security definer, schema `private`.

## Svarbiausi failai

| Kelias | Paskirtis |
|--------|-----------|
| `app/page.tsx` | Pagrindinis UI (sąrašas, capture, drawer, ataskaitos, kvietimai) |
| `app/login/` | Prisijungimo forma |
| `app/api/auth/direct-login/route.ts` | Slaptažodžio loginas + seed acc |
| `app/api/register/route.ts` | Bootstrap: user, projektai, įrašai |
| `app/api/defects/` | CRUD įrašų + media metadata |
| `app/api/projects/route.ts` | Projektų kūrimas / `clientsSeeStaffRecords` |
| `app/api/invites/` | Kvietimai |
| `lib/auth.ts` | `requireUser`, profilio ensure |
| `lib/supabase/*` | SSR klientai, middleware, admin |
| `middleware.ts` | Sesija + apsaugoti maršrutai |
| `app/components/photo-editor.tsx` | Žymėjimas ant nuotraukos |

Senos `/api/photos` ir D1/R2 **išmestos**. UI vis dar vadina „defects“, DB lentelė — `records`.

## Agentų taisyklės

- Nekeisti ir necommitinti `.env.local`
- `service_role` nerašyti į klientinį kodą
- Direct-login ir seed slaptažodžio **nepalikti** kaip galutinio produkcijos auth
- Naują schemą dėti į `supabase/migrations/`, ne tik „rankinį SQL be failo“
- UI keičiant: mobilus srautas ir privalomi laukai (patalpa, zona, brokui foto) turi likti
- Odoo: nerašyti sinchronizacijos, kol nepaprašyta; naudoti esamus `odoo_*` laukus
- Git: commitinti tik kai paprašo vartotojas; force push į main — ne

## Žinomos duobės (jau kimštos)

1. Prisijungimas **prieš** SQL → nėra `profiles` → 401 → login ciklas. Sprendimas: `requireUser` + service role upsert, ir **nedaryti** `window.location = /login` iš `/api/register` 401.
2. Middleware blokuoja `/api/auth/direct-login` → fetch gauna HTML loginą, mygtukas „nieko nedaro“. Sprendimas: `/api/auth/` viešas.
3. `updateUserById({ password })` **kiekvieno** login metu išmeta kitas sesijas. Dabar slaptažodis keičiamas tik jei seed acc prisijungimas nepavyksta.
4. ZIP turėjo fake projektus (Vytenio ir t. t.) — į Supabase jų nėra, tik BURGA iš SQL + rankinis kūrimas per **+**.

## Vercel + DNS (kai darysime)

1. GitHub repo prijungti prie Vercel, framework Next.js
2. Env vars kaip `.env.local`
3. Domain `brokai.distyle.lt` → CNAME `cname.vercel-dns.com`
4. Supabase Redirect URLs papildyti produkcijos `/auth/callback` (kai vėl įjungsime laiškus)
