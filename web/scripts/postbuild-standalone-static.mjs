import { cpSync, existsSync, mkdirSync, readFileSync } from "fs";
import path from "path";

const projectRoot = process.cwd();
const nextDir = path.join(projectRoot, ".next");
const standaloneWebDir = path.join(nextDir, "standalone", "web");
const standaloneNextDir = path.join(standaloneWebDir, ".next");

function isIgnorableMissingFile(error) {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "ENOENT");
}

function copyTree(sourceDir, targetDir) {
  if (!existsSync(sourceDir)) {
    return;
  }

  mkdirSync(path.dirname(targetDir), { recursive: true });
  try {
    cpSync(sourceDir, targetDir, { recursive: true, force: true });
  } catch (error) {
    if (isIgnorableMissingFile(error)) {
      return;
    }
    throw error;
  }
}

function copyFile(sourcePath, targetPath) {
  if (!existsSync(sourcePath)) {
    return;
  }

  mkdirSync(path.dirname(targetPath), { recursive: true });
  try {
    cpSync(sourcePath, targetPath, { force: true });
  } catch (error) {
    if (isIgnorableMissingFile(error)) {
      return;
    }
    throw error;
  }
}

function copyRequiredServerFiles() {
  const manifestPath = path.join(nextDir, "required-server-files.json");
  if (!existsSync(manifestPath)) {
    return;
  }

  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const files = Array.isArray(manifest?.files) ? manifest.files : [];

  for (const relativePath of files) {
    if (typeof relativePath !== "string" || !relativePath.startsWith(".next/")) {
      continue;
    }

    const sourcePath = path.join(projectRoot, relativePath);
    const targetPath = path.join(standaloneWebDir, relativePath);

    if (existsSync(sourcePath)) {
      copyFile(sourcePath, targetPath);
    }
  }
}

copyRequiredServerFiles();

copyTree(
  path.join(nextDir, "server"),
  path.join(standaloneNextDir, "server"),
);

copyTree(
  path.join(nextDir, "static"),
  path.join(standaloneNextDir, "static"),
);

copyTree(
  path.join(projectRoot, "public"),
  path.join(standaloneWebDir, "public"),
);
