# Adatbázis-migrációk

- Elnevezés: `NNNN_<név>.up.sql` és `NNNN_<név>.down.sql`, mindig párban; a `down` az `up` pontos visszafordítása.
- Futtató: az `erp_migrator` szerepkör alatt, a `platform.schema_migration` táblába naplóz (a „DB alapok" feladat készíti el).
- Titok, jelszó soha nem kerül migrációba; a bejelentkező szerepköröket a telepítő hozza létre generált titokkal.
- Elfogadás (CI): üres DB-n `up` → `down` → `up` hibátlanul lefut.
