# Piaci rés: magyar KKV számlázás + készlet

Státusz: első vázlat (T-0001). Az árak és a piaci adatok **becslések a kutató ismeretei alapján, nincs élő forrásból ellenőrizve**. Értékesítés előtt a nyilvános árlistákat újra kell ellenőrizni.

## 1. Piaci szegmensek
| Szegmens | Jellemző megoldás | Fájdalom |
|---|---|---|
| Mikrovállalkozás, egyéni vállalkozó (1–3 fő) | Online számlázók (Számlázz.hu, Billingo, KIMLA) | Készlet nincs vagy gyenge; havidíj |
| Kisvállalkozás, kereskedő/webshop (3–25 fő) | Online számlázó + Excel; vagy helyi csomag (pl. Kulcs-Soft, RLB-Soft, Winweb) | Két rendszer, kézi átvezetés, elavult UI |
| Középvállalkozás (25–50+ fő) | Nagyobb ERP (pl. Microsoft Business Central, SAP B1, Opten/Profit-Soft) | Drága bevezetés, túlméretezett |

## 2. Versenytársak (nagy vonalakban)
| Termék | Típus | Erősség | Gyenge pont | Ár (becslés, ellenőrizendő) |
|---|---|---|---|---|
| Számlázz.hu | SaaS | Piacvezető, egyszerű, NAV kész, webshop-kapcsolatok | Készlet/raktár alapszintű, adat a felhőben, csomagváltás | ingyenes/kis csomag → néhány ezer Ft/hó |
| Billingo | SaaS | Szép UX, könyvelői hozzáférés | Készlet korlátos, funkciók csomaghoz kötve | néhány ezer Ft/hó |
| KIMLA / egyéb olcsó online | SaaS | Olcsó | Minimális funkció | ingyenes–olcsó |
| Kulcs-Soft, RLB-Soft, Winweb | Telepíthető | Raktár, pénztár, helyi adat | Régi felület, nehéz telepítés/frissítés | egyszeri licenc + éves támogatás (tízezres–százezres) |
| Business Central / SAP B1 | ERP | Teljes funkció | Drága, partnerfüggő bevezetés | magas, felhasználónként havi díj |

## 3. NAV Online Számla
- Kötelező: minden belföldi, adóalanynak és magánszemélynek kiállított számla adatát valós időben jelenteni kell (Áfa tv., 23/2014. NGM rendelet; XML, jelenleg 3.0 séma).
- Technikai felhasználó, aláírókulcs és cserekulcs szükséges; ezek **titkok**, titkosítva tároljuk, sosem naplózzuk.
- Magánszemély vevőnél a név és cím nem kerül az adatszolgáltatásba. Adatszolgáltatási napló kell (mi ment ki, mikor). ⚠ Jogászi ellenőrzés kell.
- Kötelező kezelni: elutasítás/hibaág újraküldés, tranzakció-státusz lekérdezés, sztornó/módosító számla, számlasorszám-folytonosság, offline/hibatűrő sor.
- Számlamegőrzés: 8 év (számviteli törvény) – a törlési kérésekkel való összhangot a privacy-hu szerepnek kell jóváhagynia.
- Teszt környezet (NAV sandbox) elérhető fejlesztéshez.

## 4. Gyenge pontok / rések
1. Az olcsó SaaS számlázók készlete gyenge (nincs több raktár, tételes/szériaszám, beszerzés, minimum készlet).
2. A telepíthető csomagok elavultak; hiányzik a modern, gyorsan telepíthető (Docker), saját szerveren futó megoldás azoknak, akik nem akarnak felhőt.
3. Adatszuverenitás: egyes KKV-k (könyvelők, gyártók, egészségügyi/jogi kisirodák) nem szeretnék a vevőadatot külső SaaS-ban tudni.
4. Nincs egységes HU-PL-CZ megoldás; a cseh/lengyel e-számlázás (KSeF, cseh szabályok) később bővítési lehetőség.
5. Webshop (Shoprenter, Shopify, WooCommerce) – készlet – számla kétirányú szinkron gyakran fizetős plusz vagy hiányos.
6. Könyvelői export (pl. Kulcs-Soft, Tárhely/NAV XML, CSV) gyakran kézi.

## 5. Javasolt első termékszelet: „Számla + Készlet Start"
Dobozos, Dockerrel telepíthető, saját szerveres modul, magyar KKV-knak (kereskedők, kisebb webshopok, szolgáltatók raktárral).

**Tartalom (MVP):**
- Partner- és cikktörzs, ÁFA-kulcsok, több raktár, készletmozgás (bevét, kiadás, leltár), minimum készlet riasztás.
- Számlázás: számla, díjbekérő, sztornó/módosító, sorszámkörök, PDF, e-mailes küldés.
- NAV Online Számla 3.0 integráció (küldés, státuszkövetés, hibás újraküldés, napló).
- Számla kiállítása automatikusan csökkenti a készletet.
- Alap riportok: készletérték, forgalom, ÁFA-összesítő; könyvelői export (CSV/XML).
- Szerepkörök, naplózás, mentés/visszaállítás, egyszerű Docker telepítő.

**Nem része az első szeletnek:** főkönyv, bérszámfejtés, gyártás, PL/CZ lokalizáció, webshop-kapcsolók (2. hullám).

**Pozicionálás:** „Egy rendszer a számlához és a raktárhoz, a te szervereden, NAV-kész, fél nap alatt telepítve."

**Árazási irány (javaslat, jóváhagyásra a pricing-analyst és tulajdonos):** egyszeri licenc + éves frissítés/támogatás; belépő csomag a számlázó SaaS-ok 2–3 éves díjának megfelelő szinten. Az árat versenytárs-ellenőrzés után kell rögzíteni.

## 6. Kockázatok
- NAV séma/szabályváltozás: folyamatos karbantartás, frissítési csatorna kell.
- Személyes adat (vevők, magánszemély): a privacy-hu előírásai szerint; számlák 8 éves megőrzése vs. törlés.
- Támogatási teher a dobozos telepítésnél: jó telepítő és dokumentáció.
- Erős, olcsó SaaS versenytársak: a megkülönböztetés a készlet + saját szerver.

## 7. Következő lépések
1. Versenytárs-árak és funkciók élő ellenőrzése (kutató).
2. PRD a fenti szeletre (product-manager).
3. NAV integráció jogászi/adatvédelmi átnézése (legal, privacy-hu).
