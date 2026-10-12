import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const fixturesRoot = path.resolve(
  fileURLToPath(new URL(".", import.meta.url)),
  "../fixtures",
);

/** Lists the case directories of a fixture group (core, invalid, …). */
export function fixtureCases(group: string): string[] {
  return readdirSync(path.join(fixturesRoot, group), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

export function fixturePath(group: string, name: string, file: string): string {
  return path.join(fixturesRoot, group, name, file);
}

export function readFixtureJson(group: string, name: string, file: string): unknown {
  return JSON.parse(readFileSync(fixturePath(group, name, file), "utf8")) as unknown;
}

export function readFixtureText(group: string, name: string, file: string): string {
  return readFileSync(fixturePath(group, name, file), "utf8");
}
