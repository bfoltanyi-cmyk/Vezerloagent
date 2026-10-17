# Az ERP adatvédelmi követelményei

Állapot: vázlat v1 (DPO · EU). Forrás: `docs/security/adatvedelem/README.md` (privacy_lookup). Munkasegédlet, nem jogi tanácsadás: a ⚠ pontokat kiadás előtt jogásznak (`legal`) kell jóváhagynia.

## 1. Szerepek és alapelv

- Dobozos, helyben telepített változatnál az **ügyfél az adatkezelő**, mi főszabályként nem látunk adatot (GDPR 28.).
- SaaS-üzemeltetésnél és támogatási hozzáférésnél **adatfeldolgozók** vagyunk: DPA, al-adatfeldolgozói lista, ügyfél-engedélyes és naplózott hozzáférés kell.
- Alapelv (GDPR 25.): legszűkebb jogosultság alapból, nem kötelező személyes mezők üresek, riportokban álnevesített nézet, tesztkörnyezetbe csak álnevesített adat.
- Minden személyes adatmezőnek van: **cél, jogalap, megőrzési kategória, érzékenységi besorolás** (PII / különleges). Ezt a séma metaadatként hordozza (lásd 8. pont), ebből generálódik az adatkezelési nyilvántartás.

## 2. Adatkategóriák és jogalapok modulonként

Jelölés: SZ = szerződés teljesítése (6.1.b), JK = jogi kötelezettség (6.1.c), JÉ = jogos érdek (6.1.f, érdekmérlegeléssel), HJ = hozzájárulás (6.1.a).

| Modul | Adatkategória | Jellemző mezők | Jogalap | Megőrzési kategória |
|---|---|---|---|---|
| Számlázás | Vevő (magánszemély, egyéni vállalkozó) | név, cím, adószám, e-mail | SZ + JK (Áfa tv., Sztv.) | `szamla` |
| Számlázás | Vevő kapcsolattartó (cég) | név, e-mail, telefon | JÉ | `kapcsolat` |
| Számlázás | Adatszolgáltatási napló (NAV/KSeF) | számlaazonosító, küldés ideje, státusz | JK | `szamla` |
| Készlet | Szállító és kapcsolattartó | név, elérhetőség, bankszámla | SZ, JÉ | `szerzodes`, `kapcsolat` |
| Készlet | Mozgás végző felhasználó | felhasználó-azonosító, időpont | JÉ (nyomonkövethetőség) | `naplo` |
| Könyvelés | Bizonylat- és főkönyvi partneradat | partnerazonosító, név, adószám | JK | `konyveles` |
| HR | Törzsadat | név, születési adat, cím, TAJ/PESEL/rodné číslo, adóazonosító | SZ + JK | `hr_torzs` |
| HR | Bérszámfejtés | bér, levonás, bankszámla | JK | `ber` |
| HR | **Különleges**: betegszabadság | távollét típusa, táppénz | JK + 9.2.b (munka- és társadalombiztosítási jog) | `hr_kulonleges` |
| HR | **Különleges**: szakszervezeti tagdíj | levonás jogcíme | 9.2.b | `hr_kulonleges` |
| HR | Jelenlét/belépés (opcionális, monitoring) | belépési idő | JÉ + előzetes tájékoztatás, DPIA | `jelenlet` |
| Enterprise: SSO/API | Felhasználói fiók, jogosultság | login, e-mail, szerepkör, IP | SZ, JÉ (biztonság) | `fiok`, `naplo` |
| CRM/marketing (ha van) | Hírlevél-feliratkozó | e-mail, hozzájárulás ideje, forrása, visszavonása | HJ (csatornánként) | hozzájárulás visszavonásáig + igazolás |
| Támogatás | Hibajegy, csatolt naplók | kapcsolattartó, logrészlet | SZ, JÉ | `tamogatas` |

Szabályok:
- Jogalapot **folyamatonként** tároljuk; a HJ csak marketinghez használható, visszavonható (7. cikk).
- Magánszemély vevőnél a NAV-adatszolgáltatás nem tartalmaz nevet és címet (HU) ⚠.
- Ügyféladat MI-/LLM-szolgáltatónak csak kifejezett beállítással és DPA-val mehet. MI-alapú HR-funkció csak CISO + DPO jóváhagyással (AI Act, magas kockázat ⚠).
- Gyermekadat: webes regisztrációnál korhatár HU/PL 16, CZ 15 év.

## 3. Érintetti kérelem funkció (GDPR 12–22.)

Követelmények (**M** = kötelező, **S** = kell, **C** = jó, ha van):

1. **M** Kérelemnyilvántartás: típus (hozzáférés, helyesbítés, törlés, korlátozás, hordozhatóság, tiltakozás), érintett azonosítása, beérkezés, felelős, státusz, döntés indoka.
2. **M** Határidő-figyelés: beérkezéstől 1 hónap; indokolt meghosszabbítás +2 hónap, az érintett értesítésével. Riasztás 10 és 3 nappal a lejárat előtt az ügyfél DPO-kapcsolattartójának.
3. **M** Személykeresés az összes modulban egységes `PersonDataProvider` felületen át (minden modul regisztrálja a saját személyes adatait: név, e-mail, adóazonosító, partnerazonosító szerint). Találat modulonként és rekordtípusonként.
4. **M** Export JSON és CSV formában (gépileg olvasható), az érintett saját adataival; harmadik személy adatai kimaradnak. Az exportot a rendszer naplózza.
5. **M** Helyesbítés: a modul saját jogosultságával, verziózott módosítással (régi érték a naplóban, ha jogi kötelezettség miatt szükséges).
6. **M** Korlátozás: `restricted` jelző, amely mellett az adat csak megőrzési célra olvasható, nem kerül riportba és exportba, és nem módosítható.
7. **M** Törlés: ha nincs fennálló megőrzési kötelezettség, törlés vagy visszafordíthatatlan anonimizálás; ha van (pl. számla), automatikusan **korlátozás** a megőrzési idő végéig, majd automatikus törlés (17.3.b). A döntés indoka a kérelemhez kerül.
8. **S** Tiltakozás (JÉ alapú kezelésnél) és hozzájárulás-visszavonás kezelése; visszavonás után a marketinglistáról azonnal törlés.
9. **S** Válaszlevél-sablonok (HU/PL/CZ) – kifelé menő szöveg, ügyfél hagyja jóvá.
10. **C** Automatizált döntés (22.): a termék nem hoz kizárólag automatizált, joghatású döntést; ha később mégis, külön DPIA.

Elfogadási feltétel: teszt-személy összes adata 1 kérelemből megtalálható és exportálható minden aktív modulban; törlés számlával rendelkező személynél korlátozást eredményez, nem törlést; a határidő-riasztás tesztelt.

## 4. Megőrzési profil-modell

- **Profil** = országonként (HU, PL, CZ) egy verziózott szabálykészlet; a telepítéskor a cég országa alapján aktiválódik, az ügyfél csak hosszabbíthatja (rövidíteni a törvényi minimum alá nem lehet).
- **Szabály** = (megőrzési kategória, időtartam, kezdőesemény, lejáratkori művelet: `delete` | `anonymize` | `review`, kézi jóváhagyás kell-e).
- Kezdőesemény: dokumentum kelte, üzleti év vége, beszámoló jóváhagyása, munkaviszony megszűnése.
- Lejárat: napi ütemezett feladat; előbb `restricted` állapot, majd művelet; minden művelet naplózott. Törlés előtti lista a jogosultnak (PL: kézi jóváhagyás kötelező, mert az elévülés megszakadhat).
- Jogi tartásra (hold) lehessen állítani rekordot, ez felfüggeszti a lejáratot.

Alapértékek (⚠ jogász ellenőrizze őket):

| Kategória | HU | PL | CZ |
|---|---|---|---|
| `szamla` (számla, áfa-bizonylat) | 8 év (Sztv. 169. §) | 5 év, a beszámoló jóváhagyását követő év elejétől (art. 74) | 10 év (DPH § 35) |
| `konyveles` (egyéb bizonylat, könyv) | 8 év | 5 év | 5 év; beszámoló 10 év |
| `ber` / adózási iratok | min. adóelévülés (5 év az évet követően), de ha hosszabb a 8 év, az | 5 év az adóév végétől | tisztázandó ⚠ |
| `hr_torzs` | munkaviszony + tisztázandó ⚠ | személyi akta 10 év (2019 után) | tisztázandó ⚠ |
| `hr_kulonleges` | a cél megszűnéséig, min. szükséges | ua. | ua. |
| `kapcsolat`, `tamogatas` | kapcsolat megszűnése + 1 év (javaslat) | ua. | ua. |
| `naplo` | 1 év (javaslat; DPO-val egyeztetve) | ua. | ua. |

Nyitott: a CZ bérszámfejtési és HR-megőrzési idők, valamint a HU/PL/CZ HR-aktákra vonatkozó pontos idők nincsenek a tudásbázisban; országos szakértők (`privacy-hu`, `privacy-pl`, `privacy-cz`) egészítsék ki.

## 5. Naplózás

- **Hozzáférési napló** személyes adatot tartalmazó rekordokra: ki, mikor, mit (rekordtípus, azonosító, művelet: olvasás/írás/export/törlés), honnan (IP/kliens). Különleges adatnál **minden olvasás** naplózott.
- **Adminisztrációs napló**: jogosultságváltozás, bejelentkezés, sikertelen kísérletek, export, érintetti kérelem lépései, megőrzési műveletek, támogatási hozzáférés.
- A napló **nem tartalmaz** személyes adat értéket (csak azonosítót), titkot, jelszót, tokent. Nem módosítható az alkalmazás felől (append-only, hash-lánc javasolt), csak naplózási jogosultsággal olvasható.
- Megőrzés: lásd a 4. pont; az ügyfél módosíthatja.
- Kiegészítő: **adatszolgáltatási napló** (NAV/KSeF: mi ment ki és mikor) és **incidensnapló** (GDPR 33.: esemény, érintettek köre, kockázat, bejelentés ideje, intézkedés). Biztonsági esemény jelzése az ügyfél adminisztrátorának, 72 órás bejelentési határidő nyomon követése; a hatóság felülete: NAIH / UODO / ÚOOÚ.

## 6. Különleges adatok kezelése (GDPR 9–10.)

- Különleges adat a HR-ben: betegszabadság/egészségi adat, szakszervezeti tagság. Biometrikus azonosítást a termék **nem** támogat. Büntetőjogi adat (erkölcsi bizonyítvány) csak a törvény által megengedett jelzéssel (`megfelelt/nem`), másolat nélkül.
- Külön jogosultság (`hr.special.read` / `hr.special.write`), alapból senkinek (a HR-vezetőnek sem) nincs.
- **Mezőszintű titkosítás** (AES-256-GCM, kulcs a telepítés kulcstárában, nem az adatbázisban; kulcsforgatás támogatott); az adatbázis-mentés is titkosított.
- Minden olvasás és írás naplózott; a riportokban, keresésben és exportban alapból maszkolt.
- Adattakarékosság: betegszabadságnál csak a távollét ténye és időtartama kell, diagnózis nem tárolható.
- Munkavállalói megfigyelés/jelenlét: csak dokumentált előzetes tájékoztatás után kapcsolható be (HU Mt. 9–11. §, PL tájékoztatási dátum rögzítése, CZ komoly ok és közvetlen tájékoztatás, ⚠); bekapcsoláskor DPIA-sablon jelenik meg és az ügyfél igazolja a kitöltést.

## 7. DPA-sablon váza (GDPR 28.3.)

Szerkezet (HU/PL/CZ nyelvű változat; kifelé menő dokumentum: outbound jóváhagyás + jogász ⚠):

1. Felek, szerepek (ügyfél = adatkezelő, Alicya Nexus = adatfeldolgozó; mikor: SaaS, támogatás, távoli hozzáférés).
2. Tárgy, időtartam, a kezelés jellege és célja.
3. Személyes adatok köre és az érintettek kategóriái (a 2. pont táblájából).
4. Kezelés kizárólag az ügyfél dokumentált utasítása szerint.
5. Titoktartás, a hozzáférők kötelezettsége.
6. Biztonsági intézkedések (melléklet; GDPR 32.: TLS, tárolási titkosítás, RBAC, napló, titkosított mentés, sérülékenységvizsgálat).
7. Al-adatfeldolgozók: lista, előzetes értesítés, kifogási jog; EU-n belüli tárhely; MI-szolgáltatók is a listán.
8. Segítségnyújtás érintetti kérelmeknél, DPIA-nál, hatósági egyeztetésnél.
9. Incidens: értesítés késedelem nélkül (cél: ≤ 24 óra az ügyfélnek, hogy az ügyfél a 72 órát tartani tudja).
10. Törlés vagy visszaadás a szolgáltatás végén; adatexport nyílt formátumban (Data Act, SaaS).
11. Audit és információ-szolgáltatás.
12. Harmadik országba továbbítás tilalma, kivéve megfelelőségi határozat/SCC alapján.
13. Felelősség, irányadó jog, hatóság (nemzeti melléklet: NAIH/UODO/ÚOOÚ).
- Mellékletek: A) adatkezelés leírása, B) biztonsági intézkedések, C) al-adatfeldolgozók, D) kapcsolattartók és DPO.

## 8. Termékkövetelmények összefoglalva (fejlesztésnek)

| # | Követelmény | Prioritás |
|---|---|---|
| R1 | Mezőszintű adatosztályozási metaadat (cél, jogalap, kategória, különleges) a sémában | M |
| R2 | Érintetti kérelem modul (3. pont) | M |
| R3 | Megőrzési motor és országprofilok (4. pont) | M |
| R4 | Hozzáférési és adminisztrációs napló (5. pont) | M |
| R5 | Mezőszintű titkosítás és külön jogosultság a HR-különleges adatra (6. pont) | M |
| R6 | Adatkezelési nyilvántartás generálása R1-ből (GDPR 30.) | S |
| R7 | Incidensnapló és riasztás az ügyfél adminjának | S |
| R8 | Álnevesítő eszköz teszt-/demóadathoz, riportnézet álnevesítve | S |
| R9 | Teljes adatexport nyílt formátumban (szolgáltatóváltás) | S |
| R10 | Hozzájárulás-nyilvántartás (marketing; idő, forrás, csatorna, visszavonás) | S |
| R11 | Támogatási hozzáférés: ügyfél-engedély + napló | S |

A DPIA szükségessége: jelenlét-/belépéskövetés és nagy léptékű HR-különleges adat esetén kötelező ügyféloldali DPIA-sablon (külön feladat a DPO-nál).
