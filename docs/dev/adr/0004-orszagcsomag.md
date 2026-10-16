# ADR-0004 – Országfüggő logika `CountryPack` interfész mögött

Státusz: elfogadva (T-0004) · Dátum: 2026-10-13

## Kontextus
HU most, PL (KSeF) és CZ a 2–3. hullámban; a magot nem szabad érinteniük (NF-7).

## Döntés
`src/shared/country/country-pack.ts` interfész: `taxIdValidator`, `vatRules`, `eInvoiceConnector` (opcionális), `retentionProfile`, `cashRounding`, `invoiceTemplateId`. A cég országkódja választja ki a csomagot. Az MVP-ben egy implementáció: `hu` (a NAV-csatoló a `nav-connector` modulban).

## Következmények
+ Új ország = új csomag + fordítás, maglogika változatlan.
− Az interfészt a T-0011 (NAV + KSeF feltárás) eredménye alapján az első KSeF-munka előtt felül kell vizsgálni.
