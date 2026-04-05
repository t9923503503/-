import { cpSync, existsSync, mkdirSync } from "fs";
import path from "path";

const projectRoot = process.cwd();
const standaloneWebDir = path.join(projectRoot, ".next", "standalone", "web");

function copyTree(sourceDir, targetDir) {
  if (!existsSync(sourceDir)) {
    return;
  }

  mkdirSync(path.dirname(targetDir), { recursive: true });
  cpSync(sourceDir, targetDir, { recursive: true, force: true });
}

copyTree(
  path.join(projectRoot, ".next", "static"),
  path.join(standaloneWebDir, ".next", "static"),
);

copyTree(
  path.join(projectRoot, "public"),
  path.join(standaloneWebDir, "public"),
);
