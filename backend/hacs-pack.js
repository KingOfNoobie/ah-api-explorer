import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import archiver from "archiver";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HACS_ROOT = fs.existsSync(path.resolve(__dirname, "hacs"))
  ? path.resolve(__dirname, "hacs")
  : path.resolve(__dirname, "..", "hacs");

export function getHacsInfo() {
  const version = "2.0.0";
  const files = [
    "hacs.json",
    "custom_components/albert_heijn/manifest.json",
    "custom_components/albert_heijn/__init__.py",
    "custom_components/albert_heijn/api.py",
    "custom_components/albert_heijn/helpers.py",
    "custom_components/albert_heijn/binary_sensor.py",
    "custom_components/albert_heijn/button.py",
    "custom_components/albert_heijn/config_flow.py",
    "custom_components/albert_heijn/const.py",
    "custom_components/albert_heijn/coordinator.py",
    "custom_components/albert_heijn/sensor.py",
    "custom_components/albert_heijn/services.yaml",
    "custom_components/albert_heijn/strings.json",
    "www/ah-explorer-card.js",
  ];

  return {
    version,
    name: "Albert Heijn Explorer",
    domain: "albert_heijn",
    card: "ah-explorer-card",
    files,
    requirements: {
      homeassistant: "2023.8.0+",
      hacs: "HACS geïnstalleerd",
      login: "appie:// redirect URL bij AH inloggen",
    },
  };
}

export function createHacsZipStream() {
  if (!fs.existsSync(HACS_ROOT)) {
    throw new Error("HACS bronmap niet gevonden.");
  }

  const archive = archiver("zip", { zlib: { level: 9 } });
  archive.directory(HACS_ROOT, false);
  archive.finalize();
  return archive;
}
