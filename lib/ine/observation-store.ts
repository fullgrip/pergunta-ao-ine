import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";

const SavedSchema = z.object({
  indicatorId: z.string().regex(/^\d{7}$/),
  territoryId: z.string().regex(/^[0-9A-Z]{2,7}$/),
  period: z.string().min(4),
  periodCode: z.string().regex(/^S7A\d{4}$/),
  value: z.number().finite(),
  displayValue: z.string(),
  sourceUrl: z.string().url().startsWith("https://www.ine.pt/"),
  extractedAt: z.string(),
  lastUpdated: z.string(),
  savedAt: z.string(),
  warnings: z.array(z.string()),
});
export type SavedObservation = z.infer<typeof SavedSchema>;

const directory = () => process.env.INE_SNAPSHOT_DIR ?? path.join(process.cwd(), ".data", "ine-snapshots");
function filePath(indicatorId: string, territoryId: string, periodCode: string) {
  if (!/^\d{7}$/.test(indicatorId) || !/^[0-9A-Z]{2,7}$/.test(territoryId) || !/^S7A\d{4}$/.test(periodCode)) {
    throw new Error("Identificadores inválidos para o snapshot.");
  }
  return path.join(directory(), `${indicatorId}-${territoryId}-${periodCode}.json`);
}

export async function readSavedObservation(indicatorId: string, territoryId: string, periodCode: string): Promise<SavedObservation | null> {
  try {
    const raw = await readFile(filePath(indicatorId, territoryId, periodCode), "utf8");
    const parsed = SavedSchema.parse(JSON.parse(raw));
    return parsed.indicatorId === indicatorId && parsed.territoryId === territoryId && parsed.periodCode === periodCode ? parsed : null;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    if (error instanceof z.ZodError || error instanceof SyntaxError) return null;
    throw error;
  }
}

export async function saveObservation(input: SavedObservation): Promise<SavedObservation> {
  const saved = SavedSchema.parse(input);
  const destination = filePath(saved.indicatorId, saved.territoryId, saved.periodCode);
  await mkdir(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(saved, null, 2), { encoding: "utf8", mode: 0o600 });
  await rename(temporary, destination);
  return saved;
}
