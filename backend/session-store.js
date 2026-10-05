import fs from "fs/promises";
import path from "path";

const DATA_DIR = process.env.DATA_DIR || "/data";
const SESSION_FILE = path.join(DATA_DIR, "session.json");

const defaultSession = () => ({
  accessToken: "",
  refreshToken: "",
  expiresAt: null,
  isAnonymous: false,
  member: null,
  updatedAt: null,
});

export async function loadSession() {
  try {
    const raw = await fs.readFile(SESSION_FILE, "utf8");
    return { ...defaultSession(), ...JSON.parse(raw) };
  } catch {
    return defaultSession();
  }
}

export async function saveSession(session) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const payload = {
    ...session,
    updatedAt: new Date().toISOString(),
  };
  await fs.writeFile(SESSION_FILE, JSON.stringify(payload, null, 2), "utf8");
  return payload;
}

export async function clearSession() {
  await saveSession(defaultSession());
}
