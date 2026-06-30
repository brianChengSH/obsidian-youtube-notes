import type { AnnotationKind, AnnotationSelection } from "./types";
import { parseTranscriptBlock } from "./transcript-block";
import { stripTranscriptMarkdown } from "./utils/text";

export function applyTranscriptAnnotation(
	content: string,
	selection: AnnotationSelection,
	kind: AnnotationKind
): string {
	const block = parseTranscriptBlock(content);
	if (!block || selection.cueIds.length === 0) {
		return content;
	}

	const lines = content.split("\n");
	const selected = new Set(selection.cueIds);
	let cueIndex = 0;

	for (let lineIndex = block.startLine + 1; lineIndex < block.endLine; lineIndex += 1) {
		const line = lines[lineIndex];
		if (!line.trim().startsWith("- [")) {
			continue;
		}

		const cueId = `cue-${Math.round((block.cues[cueIndex]?.startSeconds ?? 0) * 1000)}-${cueIndex}`;
		if (selected.has(cueId)) {
			lines[lineIndex] = annotateCueLine(line, kind, selection.cueIds.length === 1 ? selection.selectedText : "");
		}
		cueIndex += 1;
	}

	return lines.join("\n");
}

export function annotateCueLine(line: string, kind: AnnotationKind, selectedText: string): string {
	const match = line.match(/^(\s*-\s+\[[^\]]+\]\([^)]+\)\s+)(.*)$/);
	if (!match) {
		return line;
	}

	const prefix = match[1];
	const markdownText = match[2];
	const nextMarkdown = selectedText.trim().length > 0
		? annotateSelectedText(markdownText, selectedText.trim(), kind)
		: wrapMarkdown(markdownText, kind);

	return `${prefix}${nextMarkdown}`;
}

export function annotateSelectedText(markdownText: string, selectedText: string, kind: AnnotationKind): string {
	const range = findMarkdownRangeForPlainText(markdownText, selectedText);
	if (!range) {
		return wrapMarkdown(markdownText, kind);
	}

	const before = markdownText.slice(0, range.start);
	const target = markdownText.slice(range.start, range.end);
	const after = markdownText.slice(range.end);
	return `${before}${wrapMarkdown(target, kind)}${after}`;
}

export function wrapMarkdown(markdownText: string, kind: AnnotationKind): string {
	const marker = kind === "bold" ? "**" : "==";
	const trimmed = markdownText.trim();
	if (trimmed.startsWith(marker) && trimmed.endsWith(marker)) {
		return markdownText;
	}

	const leading = markdownText.match(/^\s*/)?.[0] ?? "";
	const trailing = markdownText.match(/\s*$/)?.[0] ?? "";
	const core = markdownText.slice(leading.length, markdownText.length - trailing.length);
	if (!core) {
		return markdownText;
	}

	return `${leading}${marker}${core}${marker}${trailing}`;
}

function findMarkdownRangeForPlainText(
	markdownText: string,
	selectedText: string
): { start: number; end: number } | null {
	const mapping: number[] = [];
	let plain = "";
	let index = 0;

	while (index < markdownText.length) {
		const marker = markdownText.slice(index, index + 2);
		if (marker === "**" || marker === "==") {
			index += 2;
			continue;
		}

		mapping.push(index);
		plain += markdownText[index];
		index += 1;
	}

	const normalizedSelected = stripTranscriptMarkdown(selectedText);
	const plainIndex = plain.indexOf(normalizedSelected);
	if (plainIndex === -1 || normalizedSelected.length === 0) {
		return null;
	}

	const start = mapping[plainIndex];
	const end = mapping[plainIndex + normalizedSelected.length - 1] + 1;
	return { start, end };
}
