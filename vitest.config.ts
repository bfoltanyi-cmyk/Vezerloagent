import { defineConfig } from "vitest/config";

// Csak a rendszer saját tesztjei; a product/ alatti, agentek írta kódnak saját tesztkörnyezete van.
export default defineConfig({ test: { include: ["test/**/*.test.ts"] } });
