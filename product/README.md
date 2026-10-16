# A termék: dobozos ERP magyar, lengyel és cseh KKV-knak

Moduláris monolit (NestJS + PostgreSQL + React), Docker Compose telepítő. Első szelet: számlázás + készlet + NAV Online Számla.
Architektúra: `docs/dev/architecture.md`, döntések: `docs/dev/adr/`, kódszabályok és DoD: `docs/dev/conventions.md`.

| Könyvtár | Tartalom |
|---|---|
| `backend/src/main.ts`, `app.module.ts` | belépési pont; `APP_ROLE=api|worker` |
| `backend/src/modules/<modul>/` | platform, licensing, masterdata, inventory, invoicing, nav-connector, reports |
| `backend/src/shared/` | money, auth (alapból tiltó guard), config, country (országcsomag), privacy, health |
| `frontend/` | React SPA, i18n (`src/i18n/hu.json`) |
| `db/migrations/` | `NNNN_<név>.up.sql` / `.down.sql` párok |
| `installer/` | `docker-compose.yml`, `.env.example` (titok nélkül) |
| `licensing/` | licencformátum és offline ellenőrzés |

Szabály: modul más modul tábláját nem éri el, csak a publikus szolgáltatását vagy eseményét.
Futtatás: `cd backend && npm test`, `cd frontend && npm test`.
