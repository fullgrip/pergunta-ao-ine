import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
// Os testes usam uma pasta de snapshots vazia: os valores que a app guarda em .data/
// durante o uso real (ex.: «Consultar INE em lote») não podem mudar o resultado dos testes.
const snapshotDir = mkdtempSync(join(tmpdir(), "pergunta-ao-ine-testes-"));
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  test: { exclude: ["**/node_modules/**", "**/outputs/**", "**/.next/**", "**/work/**"], env: { INE_SNAPSHOT_DIR: snapshotDir } },
});
