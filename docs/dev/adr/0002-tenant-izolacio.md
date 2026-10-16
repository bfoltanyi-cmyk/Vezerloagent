# ADR-0002 – Tenant-izoláció: `company_id` + PostgreSQL RLS

Státusz: elfogadva (T-0004) · Dátum: 2026-10-13

## Kontextus
Start/Pro egy céget kezel, az Enterprise többet (több adószám egy telepítésben). A részlegszabály minden táblán tenant-ellenőrzést kér.

## Döntés
- Minden üzleti tábla `company_id uuid NOT NULL` oszlopot kap (Start/Pro-ban is, egy céggel).
- Repository-szint: minden lekérdezés a kérés `AuthContext.companyId`-jére szűr.
- DB-szint: RLS-szabály `company_id = current_setting('app.company_id')::uuid`; a kérés tranzakciója elején `SET LOCAL app.company_id`.
- Az `erp_app` DB-szerepkör nem tulajdonosa a tábláknak (az RLS rá kötelezően érvényes).

## Következmények
+ Több cég licencváltással, migráció nélkül.
+ Kettős védelem IDOR ellen.
− Minden tranzakcióban kötelező a `SET LOCAL`; integrációs teszt ellenőrzi, hogy nélküle nincs sor.
