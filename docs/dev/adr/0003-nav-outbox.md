# ADR-0003 – E-számla beküldés tranzakciós outboxon át

Státusz: elfogadva (T-0004) · Dátum: 2026-10-13

## Kontextus
A számlázás nem állhat le NAV-elérhetetlenség miatt (NAV-3, NF-8, AC-6), de egy kiállított számla sem veszhet el a beküldésből.

## Döntés
- A kiállítási tranzakció a `platform.outbox` táblába ír egy `InvoiceIssued`/`InvoiceCorrected` sort (ugyanabban a tranzakcióban, mint a számla).
- A worker `SELECT … FOR UPDATE SKIP LOCKED`-del veszi fel, átadja a `EInvoiceConnector`-nak; hibánál exponenciális várakozás (30 s → max. 1 óra), 24 óra után „beavatkozás kell" státusz és adminriasztás.
- A csatoló idempotens (NAV: ugyanarra a számlára futó tranzakció lekérdezése újraküldés előtt).
- A NAV-státusz a `nav.nav_submission` táblában él, nem a változatlan számlán.

## Következmények
+ Legalább egyszeri kézbesítés, dupla beküldés ellen idempotencia.
+ Ugyanez a minta szolgálja a KSeF-et és az értesítéseket.
− A státusz késleltetve frissül; a felület ezt jelzi.
