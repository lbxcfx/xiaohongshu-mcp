import { mkdir, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const DEFAULT_LUX_BIN = "/home/lbx/go/bin/lux";

function getLuxBin() {
  return process.env.LUX_BIN || DEFAULT_LUX_BIN;
}

export async function downloadWithLux(input: {
  url: string;
  noteId: string;
  projectId: number;
}): Promise<string | undefined> {
  const outputDir = resolve(process.cwd(), ".data", "topic-hub-downloads", String(input.projectId));
  await mkdir(outputDir, { recursive: true });

  const luxBin = getLuxBin();
  await execFileAsync(
    luxBin,
    [
      "--output-path",
      outputDir,
      "--output-name",
      input.noteId,
      "--retry",
      "3",
      "--silent",
      input.url,
    ],
    {
      timeout: 25_000,
      maxBuffer: 1024 * 1024 * 4,
    }
  );

  const files = await readdir(outputDir);
  const matched = files
    .filter(file => file === input.noteId || file.startsWith(`${input.noteId}.`))
    .sort();

  if (matched.length === 0) return undefined;

  return resolve(outputDir, matched[0]);
}
