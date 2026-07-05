import { showToast } from "../utils/toast.js";

const commands = new Map();

export function registerCommand(command) {
  if (!command.name || !command.execute) return;
  commands.set(command.name.toLowerCase(), command);
}

export function getAllCommands() {
  return Array.from(commands.values());
}

export function isCommand(text) {
  return text.startsWith("/");
}

export async function executeCommand(text, context) {
  if (!text.startsWith("/")) return { handled: false };

  const parts = text.slice(1).split(" ");
  const name = parts[0].toLowerCase();
  const args = parts.slice(1).join(" ");
  const command = commands.get(name);

  if (!command) {
    return {
      handled: true,
      error: `Unknown command: /${name}. Type /help for available commands.`,
    };
  }

  try {
    const result = await command.execute(args, context);
    return { handled: true, result };
  } catch (e) {
    console.error(`Command /${name} failed:`, e);
    return { handled: true, error: e.message };
  }
}

function isCommandPrefix(token, command) {
  if (!token.startsWith("/")) return false;
  const value = token.slice(1).toLowerCase();
  return value.length > 0 && command.startsWith(value);
}

export function isActionInput(content) {
  return getActionHighlightSpec(content).mode !== "none";
}

export function getActionHighlightSpec(content) {
  const value = content || "";
  const leadingWhitespaceLength = value.length - value.trimStart().length;
  const trimmed = value.trimStart();
  if (!trimmed) {
    return { mode: "none", prefixLength: 0 };
  }

  const firstToken = trimmed.split(/\s+/)[0];

  if (firstToken.startsWith("@")) {
    return {
      mode: "prefix",
      prefixLength: leadingWhitespaceLength + firstToken.length,
    };
  }

  if (isCommandPrefix(firstToken, "help")) {
    return {
      mode: "prefix",
      prefixLength: leadingWhitespaceLength + Math.min(5, firstToken.length),
    };
  }

  if (isCommandPrefix(firstToken, "gif")) {
    return { mode: "full", prefixLength: value.length };
  }

  return { mode: "none", prefixLength: 0 };
}

export async function handleCommandInput(input) {
  const content = input.value.trim();
  if (!content || !isCommand(content)) return false;

  try {
    const result = await executeCommand(content, { input });

    if (result.handled) {
      if (result.error) {
        showToast(result.error, "error");
      } else if (result.result?.type === "insert" && result.result.content) {
        const currentPos = input.selectionStart;
        const textAfter = input.value.substring(currentPos);

        input.value = result.result.content + textAfter;
        input.focus();
        input.setSelectionRange(
          result.result.content.length,
          result.result.content.length,
        );

        input.dispatchEvent(new Event("input"));
      } else if (result.result?.type === "info" && result.result.content) {
        showToast(result.result.content, "info");
        input.value = "";
      }
    }
    return true;
  } catch (e) {
    console.error("Command execution failed:", e);
    showToast(e.message || "Command failed", "error");
    return true;
  }
}
