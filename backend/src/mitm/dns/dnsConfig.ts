import { exec } from "node:child_process";
import { spawn } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

export async function execWithPassword(
  command: string,
  password: string | null = null,
): Promise<{ stdout: string; stderr: string }> {
  if (process.platform === "win32" || !password) {
    return execAsync(command);
  }

  if (String(password).includes("\n")) {
    throw new Error("Invalid sudo password");
  }

  return new Promise((resolve, reject) => {
    const child = spawn("sudo", ["-S", "-p", "", "sh", "-c", command], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });
    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(stderr || `sudo command failed with exit code ${code}`));
      }
    });

    child.stdin.write(String(password) + "\n");
    child.stdin.end();
  });
}
