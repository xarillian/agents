import type { AutocompleteProvider, AutocompleteSuggestions } from "@earendil-works/pi-tui";

/** A bare `/name` with nothing typed after it, which is the only completion round that offers command names. */
const COMMAND_NAME_PREFIX = /^\/[^\s/]*$/;

/** Pi keeps its built-in commands whatever an extension registers, so a command a package supersedes can only be taken off the slash menu. */
export function hideCommand(current: AutocompleteProvider, name: string): AutocompleteProvider {
	return {
		triggerCharacters: current.triggerCharacters,
		getSuggestions: async (lines, line, column, options) =>
			withoutCommand(await current.getSuggestions(lines, line, column, options), name),
		applyCompletion: (lines, line, column, item, prefix) => current.applyCompletion(lines, line, column, item, prefix),
		shouldTriggerFileCompletion: (lines, line, column) => current.shouldTriggerFileCompletion?.(lines, line, column) ?? true,
	};
}

export function withoutCommand(suggestions: AutocompleteSuggestions | null, name: string): AutocompleteSuggestions | null {
	if (!suggestions || !COMMAND_NAME_PREFIX.test(suggestions.prefix)) return suggestions;

	const items = suggestions.items.filter((item) => item.value !== name);
	return items.length > 0 ? { ...suggestions, items } : null;
}
