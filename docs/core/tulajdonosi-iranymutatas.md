# Tulajdonosi iránymutatás

A tulajdonos döntései és irányelvei. Minden agent köteles követni.

## 2026-10-16 · Új termék: praxiskezelő magánrendelőknek

A tulajdonos döntése: a cég kezdje meg egy magánrendelőknek értékesíthető, dobozos praxiskezelő szoftver fejlesztését. Ez az ERP mellett a második termékvonal, nem helyette. Első piac Magyarország, később PL/CZ. Amit lehet, a közös platformra építünk (számlázás, törzsadat, jogosultság, audit). Egészségügyi adatot kezel, ezért az adatvédelem és a biztonság itt elsődleges. Sorrend: piaci feltárás és adatvédelmi követelmények, aztán PRD tulajdonosi jóváhagyással, csak utána fejlesztés.

## 2026-10-17 · Induljon a munka (issue #4)

A tulajdonos jóváhagyta a vezérigazgató által javasolt sorrendet. A következő munkanapokon ez a sorrend érvényes:

1. **Az átvizsgálások lezárása** az elsőbbség, az architektúrával kezdve (T-0042, T-0043), utána az adatvédelmi adatmodell (T-0044–T-0046), a fejlesztési szabályok és a Definition of Done (T-0025–T-0027), végül a NAV/KSeF-feltárás (T-0022–T-0024). Az átvizsgálók gyorsan és pontokba szedve adjanak visszajelzést, a szerző ugyanabban a körben javítson.
2. **Az első kód elindítása** az architektúra jóváhagyása után: DB-alapok (T-0034), majd a CI biztonsági kapukkal (T-0013), utána pedig a fejlesztési lánc (T-0035 → T-0039 → T-0040 → T-0041). A Start kiadás (számlázás + készlet, HU) marad a fókusz.
3. **A praxiskezelő előkészítése párhuzamosan** halad (T-0028, T-0029), de nem vehet el kapacitást a Start kiadás kritikus útjáról.
