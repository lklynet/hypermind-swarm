const commands = new Map();

export function registerCommand(command) {
    if (!command.name || !command.execute) {
        console.error("Invalid command: must have name and execute function");
        return;
    }
    commands.set(command.name.toLowerCase(), command);
}

export function getCommand(name) {
    return commands.get(name.toLowerCase());
}

export function getAllCommands() {
    return Array.from(commands.values());
}

export function parseCommand(text) {
    if (!text.startsWith("/")) return null;

    const parts = text.slice(1).split(" ");
    const name = parts[0].toLowerCase();
    const args = parts.slice(1).join(" ");

    return { name, args };
}

export async function executeCommand(text, context) {
    const parsed = parseCommand(text);
    if (!parsed) return { handled: false };

    const command = getCommand(parsed.name);
    if (!command) {
        return {
            handled: true,
            error: `Unknown command: /${parsed.name}. Type /help for available commands.`
        };
    }

    try {
        const result = await command.execute(parsed.args, context);
        return { handled: true, result };
    } catch (e) {
        console.error(`Command /${parsed.name} failed:`, e);
        return { handled: true, error: e.message };
    }
}

export function isCommand(text) {
    return text.startsWith("/");
}
