import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

function shellQuote(value: string): string {
  return "'" + String(value).replace(/'/g, "'\\''") + "'";
}

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

  return execAsync("sudo -S -p '' sh -c " + shellQuote(command), {
    input: String(password) + "\n",
  });
}
