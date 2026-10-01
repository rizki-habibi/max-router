import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

function shellQuote(value) {
  return "'" + String(value).replace(/'/g, "'\\''") + "'";
}

export async function execWithPassword(command, password = null) {
  if (process.platform === "win32" || !password) {
    return execAsync(command);
  }

  if (String(password).includes("\n")) {
    throw new Error("Invalid sudo password");
  }

  const child = execAsync("sudo -S -p '' sh -c " + shellQuote(command));
  const stdin = child.child?.stdin;
  if (stdin) {
    stdin.write(String(password) + "\n");
    stdin.end();
  }
  return child;
}
