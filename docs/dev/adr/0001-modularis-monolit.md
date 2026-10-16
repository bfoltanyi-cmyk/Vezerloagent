# ADR-0001 – Moduláris monolit, PostgreSQL-alapú outbox, egy image két szerepben

Státusz: elfogadva (T-0004) · Dátum: 2026-10-13

## Kontextus
Dobozos termék, az ügyfél szerverén, szakember nélkül 30 perc alatt telepítve (PRD NF-2). Kevés felhasználó (≤ 10 egyidejű, NF-1), de szigorú tranzakciós integritás (NF-3).

## Döntés
- Egy NestJS alkalmazás, modulonként külön mappa és DB-séma; modulok csak `PublicService`-en és eseményen át beszélnek.
- Egy image, `APP_ROLE=api|worker`.
- Háttérsor és outbox PostgreSQL-táblában (`SKIP LOCKED`), nincs Redis/broker.
- ORM: TypeORM (MIT) entitásokhoz; migrációk kézzel írt SQL `up`/`down` párok.

## Következmények
+ Egyszerű telepítés, mentés (egy adatbázis), egy tranzakcióban több modul.
+ Később modul kiemelhető, mert a határ már adott.
− A határ betartása fegyelem: lint-szabály és kódátnézés kell (T-0013, T-0012).
