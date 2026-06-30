const NAMED_ENTITIES: Record<string, string> = {
	amp: "&",
	quot: "\"",
	apos: "'",
	lt: "<",
	gt: ">",
	nbsp: " ",
};

export function decodeEntities(value: string): string {
	return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity: string) => {
		if (entity.startsWith("#x") || entity.startsWith("#X")) {
			const codePoint = Number.parseInt(entity.slice(2), 16);
			return Number.isNaN(codePoint) ? match : String.fromCodePoint(codePoint);
		}

		if (entity.startsWith("#")) {
			const codePoint = Number.parseInt(entity.slice(1), 10);
			return Number.isNaN(codePoint) ? match : String.fromCodePoint(codePoint);
		}

		return NAMED_ENTITIES[entity] ?? match;
	});
}

export function normalizeWhitespace(value: string): string {
	return value.replace(/\s+/g, " ").trim();
}

export function stripTranscriptMarkdown(markdown: string): string {
	return markdown.replace(/\*\*/g, "").replace(/==/g, "");
}
