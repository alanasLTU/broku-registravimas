# Brokų registro programėlės perdavimas

Paruošta: 2026-08-25  
Perduodama versija: `2a4581d`

Šiame aplanke yra visas naujausios veikiančios programėlės pradinis kodas, duomenų bazės schema, migracijos ir diegimo failai. Pakete nėra realios veikiančios sistemos duomenų, įkeltų nuotraukų ar video, prisijungimo duomenų ir slaptų raktų.

## Technologijos

- TypeScript, React 19 ir Next.js App Router per `vinext`.
- Vite ir Cloudflare Worker vykdymo aplinka.
- Cloudflare D1 duomenų bazė, naudojama per Drizzle ORM.
- Cloudflare R2 nuotraukoms ir video saugoti.
- ChatGPT Sites tapatybės antraštės ir papildomas leidžiamų el. paštų sąrašas.

## Pagrindinės funkcijos

- Projektų kūrimas ir įsimenamas aktyvus projektas kiekviename įrenginyje.
- Keturi įrašų tipai: Brokas, Apimtis, Papildoma apimtis ir Užduotis.
- Keli trūkumų aprašymai prie vienos pozicijos.
- Iki 12 nuotraukų ir 3 video prie vieno įrašo.
- Fotografavimas, filmavimas, galerijos ir failų įkėlimas bei failų nutempimas.
- Nuotraukų žymėjimas: apibraukimas, rodyklė, laisvas piešimas, spalvos, linijos storis ir veiksmų atšaukimas.
- Atsakinga šalis, atsakingas asmuo, terminas, būsena ir prioritetas.
- Papildomos apimties užsakovas, kaina ir pastabos.
- Filtravimas, įrašų atranka, CSV eksportas ir spausdinama PDF ataskaita.
- Video nuorodos į PDF ataskaitą neįtraukiamos.

## Svarbiausi aplankai ir failai

- `app/page.tsx` – pagrindinė vartotojo sąsaja ir programėlės veiksmai.
- `app/components/photo-editor.tsx` – nuotraukų pažeidimų žymėjimo redaktorius.
- `app/api/` – projektų, įrašų, nuotraukų ir video API.
- `db/schema.ts` – D1 duomenų bazės lentelės.
- `drizzle/` – duomenų bazės migracijos; vykdyti eilės tvarka nuo `0000` iki `0002`.
- `lib/server.ts` – vartotojų prieiga, demonstraciniai pradiniai duomenys ir bendros serverio funkcijos.
- `lib/media-response.ts` – saugus nuotraukų bei video pateikimas iš R2.
- `.openai/hosting.json` – loginiai D1 (`DB`) ir R2 (`BUCKET`) susiejimai su ChatGPT Sites projektu.
- `worker/index.ts` – Cloudflare Worker pradinis taškas.
- `vite.config.ts` – vietinės kūrimo aplinkos ir Cloudflare susiejimų konfigūracija.

## Paleidimas kūrimo aplinkoje

Reikalavimai:

- Node.js `22.13.0` arba naujesnė versija.
- `npm`.
- Rekomenduojama Linux arba Windows su WSL2, nes projekto pagalbiniai scenarijai naudoja `bash`, `flock`, `curl` ir GNU `timeout`.

Veiksmai:

1. Išarchyvuoti ZIP failą.
2. Nukopijuoti `.env.example` į `.env.local` ir įrašyti leidžiamus naudotojų el. paštus.
3. Vykdyti `npm ci`.
4. Vykdyti `npm run dev`.
5. Prieš diegimą patikrinti `npm run lint` ir `npm run build`.

ChatGPT Sites aplinkoje D1 ir R2 ištekliai sukuriami bei prijungiami pagal `.openai/hosting.json`. Diegiant kitur būtina sukurti lygiaverčius Cloudflare išteklius ir Worker aplinkoje palikti tikslius susiejimų pavadinimus:

- D1 duomenų bazė – `DB`.
- R2 failų saugykla – `BUCKET`.

Sukūrus naują D1 duomenų bazę, jai reikia pritaikyti `drizzle/` aplanke esančias SQL migracijas eilės tvarka.

## Prieigos nustatymas

Kintamasis `APP_ALLOWED_EMAILS` priima vieną arba kelis kableliais atskirtus el. pašto adresus, pavyzdžiui:

```text
APP_ALLOWED_EMAILS=vardas@imone.lt,kolega@imone.lt
```

Jeigu sąrašas tuščias, serverio lygmeniu el. pašto apribojimas netaikomas. Produkcinėje aplinkoje rekomenduojama kartu palikti ir privačią svetainės prieigos politiką.

## Svarbu dėl esamų duomenų

Šis ZIP perduoda visą kodą, tačiau neperduoda:

- veikiančios D1 duomenų bazės įrašų;
- R2 saugomų nuotraukų ir video;
- svetainės prieigos politikos;
- aplinkos kintamųjų, slaptažodžių ar kitų prisijungimo duomenų;
- Git istorijos ir `node_modules` aplanko.

Jeigu kolega turi tęsti darbą su ta pačia veikiančia programėle ir jau sukauptais duomenimis, jam reikia suteikti prieigą prie esamo ChatGPT Sites projekto bei jo D1 ir R2 išteklių. Vien tik iš šio ZIP paleista nauja kopija turės naują, atskirą duomenų bazę ir failų saugyklą.

## Pradiniai demonstraciniai duomenys

Funkcija `ensureSeedData()` faile `lib/server.ts` į tuščią duomenų bazę įrašo kelis demonstracinius projektus ir įrašus. Kuriant visiškai naują produkcinę sistemą šiuos duomenis reikia pakeisti įmonės šablonais arba pašalinti prieš pirmą paleidimą.

## Rekomenduojamas perėmimo patikrinimas

1. Paleisti programėlę lokaliai.
2. Sukurti bandomąjį projektą ir visų keturių tipų įrašus.
3. Įkelti kelias nuotraukas ir vieną video.
4. Pažymėti nuotraukoje pažeidimą ir patikrinti, ar pažymėta versija rodoma ataskaitoje.
5. Patikrinti atsakingo asmens, termino ir būsenos išsaugojimą.
6. Sugeneruoti PDF bei CSV ataskaitas.
7. Tik tada prijungti arba perimti produkcinius D1 ir R2 išteklius.

