import { registerCommand, getAllCommands } from "./handler.js";
import { showModal } from "../utils/modal.js";

registerCommand({
    name: "help",
    description: "Show all available commands",
    execute: async (args, context) => {
        const commands = getAllCommands();
        const listHtml = `
            <ul class="command-list">
                ${commands.map(cmd => `
                    <li>
                        <span class="cmd-name">/${cmd.name}</span>
                        <span class="cmd-desc">${cmd.description || 'No description'}</span>
                    </li>
                `).join('')}
            </ul>
        `;

        showModal({
            title: "Available Commands",
            content: listHtml
        });

        if (context && context.input) {
            context.input.value = "";
        }

        return { handled: true };
    },
});
