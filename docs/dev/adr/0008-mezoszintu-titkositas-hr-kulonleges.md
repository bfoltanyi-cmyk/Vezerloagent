# ADR-0008 – Mezőszintű titkosítás a HR-különleges adatra, kulcskezelés

Státusz: javasolt (T-0020), a kulcskezelési pontok CISO-jóváhagyásra várnak · Forrás: `requirements.md` 6. pont (R5)

## Kontextus
Betegszabadság (egészségi adat) és szakszervezeti tagdíj (szakszervezeti tagság) GDPR 9. cikk szerinti adat. Az adatbázis-hozzáférés (DBA, mentés, SQL-injekció) ne adja ki olvasható formában; a kulcs ne az adatbázisban legyen.

## Döntés
1. **Boríték-titkosítás, három szint:** KEK (kulcstár) → cégenkénti DEK-ek (`platform.data_key`: `key_id`, `company_id`, `purpose`, `status` active|decrypt_only|retired, `wrapped_key`, `created_at`) → mezők. DEK csomagolása AES-256-GCM-mel, AAD = `company_id|key_id|purpose`.
2. **Mező:** AES-256-GCM, 96 bites véletlen nonce, 128 bites tag. AAD = `company_id|tábla|oszlop|sor_id|key_id` (sorcserés/áthelyezéses támadás ellen). Tárolt formátum `bytea`: `0x01 ‖ key_id(16) ‖ nonce(12) ‖ ciphertext ‖ tag`. Nonce-ütközés ellen DEK-enként írásszámláló, 2^32 előtt kötelező forgatás.
3. **Hatókör (`hr` modul, `hr.special_record`):** nyílt oszlop csak `id`, `company_id`, `employee_id`, `kind`-nélkül; minden különleges tartalom (`kind` = betegszabadság/szakszervezeti levonás, időszak, jogcím) egyetlen `payload_enc`-ben. Diagnózis mező nincs, a séma és a DTO sem enged. Keresés/rendezés a titkosított tartalom szerint nincs (nincs blind index); csak `employee_id` szerint.
4. **Kulcstár (`KeyProvider` interfész, `src/shared/crypto/`):** MVP-implementáció `FileKeyProvider`: KEK a telepítő által generált, `0600` Docker secret/fájl (`ERP_KEK_FILE`), **nem** a DB-ben és **nem** ugyanabban a mentési csomagban, mint a DB-mentés. Cserélhető (KMS/HSM, SaaS-nál cégenkénti KEK) kódváltozás nélkül. A varázsló **helyreállítási csomagot** (KEK + audit HMAC-kulcs, jelszóval titkosítva) állíttat elő, és az ügyféltől megerősítést kér; nélküle a mentés visszaállítása után a különleges adat olvashatatlan.
5. **Forgatás:** (a) DEK-forgatás: új `active` kulcs, az újak azzal íródnak, a régi `decrypt_only`; worker újratitkosít (≤ 200 sor/lap, folytatható, `key_id` az oszlopban látszik), a régi kulcs akkor `retired`, ha nincs hivatkozó sor **és** lejárt a mentési megőrzés; (b) KEK-forgatás: csak a DEK-ek újracsomagolása (gyors). Ütemezés: ajánlott 12 havonta, kézi indítás `platform.key.rotate` engedéllyel, gyanú esetén azonnal. Minden forgatási lépés `admin` napló.
6. **Jogosultság:** `hr.special.read`, `hr.special.write` – **semelyik beépített szerepkörnek sincs** (az adminisztrátornak és HR-vezetőnek sem); csak egyedi szerepkörön át adható. Az engedély kiosztása `admin` napló + riasztás az adminnak; a kulcskezelés (`platform.key.rotate`) külön engedély, nem azonos a olvasással.
7. **Olvasás-naplózás:** minden dekódolás rekordonként `access` bejegyzés (fail-closed, ADR-0007), mielőtt a nyílt szöveg kikerül.
8. **Maszkolás alapból:** a lista és részlet API `masked: true` + `"•••"` értékeket ad; nyílt szöveg csak `GET …/{id}?reveal=true` + `hr.special.read` mellett. Riport/export: csak összesített (darabszám, nap), 5 alatti csoportméretnél `<5`; egyedi nyílt export nincs, kivéve az érintetti hozzáférési kérelem exportja (`privacy.dsr.export` **és** `hr.special.read`).
9. **Kódszintű védelem:** `Sensitive<T>` burkoló (`toJSON`/`toString` = maszk), a redaktor eltávolítja a naplókból, kivétel- és hibaüzenet nem tartalmazza; nyílt szöveg nem kerül gyorsítótárba, `payload` nem része az OpenAPI-példáknak.
10. **Törlés/megőrzés:** `hr_kulonleges` kategória (ADR-0006); lejáratkor sor törlése (nem anonimizálás). Korlátozott rekord csak `privacy.restricted.read`-del olvasható, ekkor is `hr.special.read` kell.

## Elvetett alternatívák
- pgcrypto/oszloptitkosítás DB-ben: a kulcs a DB-kapcsolaton át járna, a naplózás megkerülhető.
- Teljes lemeztitkosítás önmagában: nem véd DBA/SQLi ellen, nincs olvasás-naplózás.
- Per-munkavállaló kulcs (crypto-erase): bonyolult kulcsélet, az MVP-ben nem indokolt.

## Következmények
+ Mentés/dump önmagában nem fed fel különleges adatot.
− Keresés, SQL-riport a különleges tartalomra nem lehetséges (szándékos).
− Kulcsvesztés = adatvesztés: helyreállítási csomag és visszaállítási teszt kötelező.
