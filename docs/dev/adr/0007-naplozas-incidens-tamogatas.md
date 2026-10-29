# ADR-0007 – Hash-láncolt napló, incidensnapló, támogatási hozzáférés

Státusz: javasolt (T-0020) · Forrás: `docs/security/privacy/requirements.md` 5. pont (R4, R7, R11) · Részletek: `docs/dev/naplozas-es-kulonleges-adat.md`

## Kontextus
Személyes adaton végzett műveleteket, adminisztrációt és biztonsági eseményt utólag bizonyíthatóan kell tudni visszakeresni, anélkül hogy a napló maga személyes adat- vagy titokgyűjtemény lenne. A 72 órás bejelentési határidőt (GDPR 33.) az ügyfél adminjának kell látnia. A támogatási hozzáférés csak az ügyfél engedélyével, naplózva lehet.

## Döntés
1. **Egy napló, két osztály:** a `platform.audit_log` (már létezik, append-only) kategóriái: `access` (személyes rekord olvasás/írás/export/törlés), `admin` (jogosultság, bejelentkezés, beállítás, DSR- és megőrzési lépések), `security`, `support`. Egyetlen belépési pont: `AuditService.record()`; közvetlen INSERT tilos (ESLint + DB-szerepkör).
2. **Nincs érték a naplóban:** a `details` mezőt műveletenként sémával (zod, `.strict()`) validáljuk: csak azonosító, enum, szám, **mezőnevek** (nem értékek). Ismeretlen kulcs = hiba tesztben, éles futásban eldobás + `security` bejegyzés. A központi redaktor (policy 4.2) a technikai naplóra is él.
3. **Hash-lánc cégenként:** `seq` (hézagmentes, `pg_advisory_xact_lock(company)`), `prev_hash`, `hash = HMAC-SHA256(audit_key, prev_hash ‖ kanonikus JSON)`. HMAC-kulcs a `KeyProvider`-ből (ADR-0008), így DB-írási joggal a lánc nem újraszámolható. Napi **ellenőrzőpont** (`audit_anchor`: cég, seq, hash, aláírás) a workerben; az admin a felületen letölti, a mentés is tartalmazza. `GET /audit/verify` végigszámol és hibánál `security` bejegyzést + incidenst nyit.
4. **Append-only a DB-ben:** `erp_app`-nak nincs UPDATE/DELETE; BEFORE UPDATE/DELETE/TRUNCATE trigger is tilt. Havi partíció; a megőrzés (`naplo`, alap 1 év) csak egész partíció eldobásával, `platform.audit_prune()` SECURITY DEFINER függvénnyel, ami előbb `audit_anchor`-t ír az utolsó hash-sel (a lánc a lejárat után is ellenőrizhető).
5. **Szinkron, ugyanabban a tranzakcióban** ír (fail-closed): ha a naplózás nem sikerül, a művelet sem. Listanézet = egy `access` bejegyzés darabszámmal; részletnézet/export = rekordonként. Különleges adat: minden olvasás rekordonként.
6. **Olvasás:** csak `audit.log.read`/`verify`/`export` engedéllyel; a napló olvasása is naplózott.
7. **Incidensnapló** (`platform.incident`, `incident_event`): esemény, érintettek köre (becslés), kockázat (`none|low|high`), tudomásszerzés ideje (`awareness_at`), `authority_deadline_at = awareness_at + 72 h`, hatóság országonként (NAIH/UODO/ÚOOÚ), bejelentés ideje, intézkedés (szabad szöveg, személyes adat nélkül), státuszgép. Nyitás: kézzel (`incident.manage`) vagy szabálymotorból (sikertelen belépések, lánc-hiba, különleges adat tömeges olvasása, támogatási hozzáférés lejárat után, mentési hiba). Szabályküszöbök beállításból.
8. **Riasztás az ügyfél adminjának:** `security.alert_contacts` (telepítő-varázsló kötelezően kér ≥ 1 címzettet), e-mail az outboxon át **személyes adat nélkül** (típus, azonosító, határidő, link), + alkalmazáson belüli sáv, ami SMTP nélkül is megmarad. Határidő-emlékeztető 48/24/6 órával. Az incidens státuszváltása és a bejelentés ténye `admin` naplóbejegyzés.
9. **Támogatási hozzáférés** (`platform.support_grant`): az ügyfél admin hozza létre (név szerinti támogató, indok/jegyszám, hatókör, időtartam: alap 24 h, max 72 h). Egyszeri kód (256 bit, csak hash tárolt) → a támogató `actor_type=support` munkamenete kötelező TOTP-vel, a grant lejártakor megszűnik, az admin bármikor visszavonhatja. A hatókör **sosem** tartalmazhat `hr.special.*`, `platform.secret.*`, `platform.key.*` engedélyt; személyes adat alapból maszkolt (álnevesített) nézet, feloldás külön jelölőnégyzet + indok. Minden támogatói művelet `support` naplóbejegyzés `grant_id`-vel; indításkor és lejáratkor értesítés az adminnak; lezáráskor összesítő riport.

## Elvetett alternatívák
- Aszinkron/pufferelt naplózás: bejegyzés-vesztés lehetséges, a bizonyító erő sérül.
- Külső SIEM kötelezően: ellentmond a 30 perces, szakember nélküli telepítésnek (opcionális szinkron-export később).
- Csak SHA-256 lánc kulcs nélkül: DB-írási joggal újraszámolható.
- Állandó támogatói fiók: nem ügyfél-engedélyes.

## Következmények
+ Bizonyítható, értékmentes napló; a DPA 6. és 9. pontja teljesíthető.
− Az írási út tranzakciónként soros cégen belül (advisory lock); a terhelési teszt feladata a határ mérése.
− A HMAC-kulcs elvesztése esetén a lánc ellenőrizhetetlen; a kulcs a helyreállítási csomag része (ADR-0008).
