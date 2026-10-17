# Licenckulcs – formátum és offline ellenőrzés

Döntés: `docs/dev/architecture.md` 8. pont. Megvalósítás: „Licencellenőrzés és funkciókapcsolók" fejlesztői feladat.

## Formátum
JSON fájl, két mezővel: `payload` (base64url, kanonikus JSON) és `signature` (Ed25519, base64url a `payload` bájtjaira).

`payload` mezői:
| Mező | Példa | Jelentés |
|---|---|---|
| `licenseId` | `LIC-2026-000123` | egyedi azonosító |
| `customerTaxId` | `12345678-2-41` (kitalált) | a licencelt cég adószáma, a cégtörzsadattal egyeztetve |
| `edition` | `start` / `pro` / `enterprise` | kiadás |
| `features` | `["invoicing","inventory","nav"]` | funkciókapcsolók |
| `limits` | `{"users":5,"warehouses":2}` | felhasználó-/raktárlimit |
| `updatesUntil` | `2027-12-31` | frissítési jog vége (a futás nem áll le utána) |
| `issuedAt` | `2026-10-16T00:00:00Z` | kiállítás ideje (UTC) |

## Ellenőrzés
- A nyilvános kulcs az image-ben van; **nincs hazatelefonálás**, internet nélkül működik.
- Érvénytelen aláírás vagy hiányzó fájl → csak olvasási mód és adminisztrátori figyelmeztetés, adatvesztés nélkül.
- Újabb verzióra frissítés csak akkor, ha a kiadás dátuma ≤ `updatesUntil`.
- A privát aláírókulcs **soha nem kerül a repóba**; a licencgenerálás a termék kódján kívül, elzártan történik.
