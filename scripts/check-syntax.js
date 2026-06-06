#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const directories = ["bin", "scripts", "src", "test"];
const files = [];

for (const directory of directories) {
  await collectJavaScript(path.join(root, directory), files);
}

let ok = true;
for (const file of files.sort()) {
  const result = spawnSync(process.execPath, ["--check", file], {
    cwd: root,
    encoding: "utf8"
  });

  if (result.status !== 0) {
    ok = false;
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
  }
}

if (!ok) {
  process.exitCode = 1;
} else {
  console.log(`Checked syntax for ${files.length} JavaScript file(s).`);
}

async function collectJavaScript(directory, output) {
  let entries;
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await collectJavaScript(fullPath, output);
    } else if (entry.isFile() && entry.name.endsWith(".js")) {
      output.push(fullPath);
    }
  }
}
