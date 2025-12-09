import fs from "fs";
import path from "path";

let cachedCookieHeader: string | null | undefined;

export function getCookieHeader(): string | undefined {
  if (cachedCookieHeader !== undefined) {
    return cachedCookieHeader ?? undefined;
  }

  const cookiesPath = path.resolve(process.cwd(), "cookies.txt");

  if (!fs.existsSync(cookiesPath)) {
    cachedCookieHeader = null;
    return undefined;
  }

  const lines = fs.readFileSync(cookiesPath, "utf8").split(/\r?\n/);
  const pairs: string[] = [];

  for (const line of lines) {
    if (!line || line.startsWith("#")) {
      continue;
    }

    const parts = line.split("\t");
    const name = parts[5];
    const value = parts[6];

    if (name && value) {
      pairs.push(`${name}=${value}`);
    }
  }

  const header = pairs.join("; ").trim();
  cachedCookieHeader = header.length > 0 ? header : null;
  return cachedCookieHeader ?? undefined;
}
