import { isCommand, executeCommand } from "./registry.js";
import { showToast } from "../utils/toast.js";

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
                input.setSelectionRange(result.result.content.length, result.result.content.length);

                if (input.dispatchEvent) {
                    input.dispatchEvent(new Event("input"));
                }
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
