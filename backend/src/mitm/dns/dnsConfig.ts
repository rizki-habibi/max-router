import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

function shellQuote(value: string): string {
  return "'" + value.replace(/'/g, "'\\''") + "'";
}

export async function execWithPassword(
  command: string,
  password?: string | null,
): Promise<{ stdout: string; stderr: string }> {
  if (process.platform === "win32" || !password) {
    return execAsync(command);
  }

  const quotedCommand = shellQuote(command);
  const child = execAsync("sudo -S -p '' sh -c " + quotedCommand);

  const stdin = (child as any).child?.stdin;
  if (stdin) {
    stdin.write(String(password) + "\n");
    stdin.end();
  }

  return child;
}
