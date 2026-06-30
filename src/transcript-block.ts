import type { TranscriptBlock, TranscriptCue } from "./types";
import { formatTimestamp, parseTimestamp } from "./utils/time";
import { stripTranscriptMarkdown } from "./utils/text";

const START_MARKER_PREFIX = "<!-- media-notes:transcript:start";
const END_MARKER = "<!-- media-notes:transcript:end -->";

export function serializeTranscriptBlock(
	videoId: string,
	sourceUrl: string,
	heading: string,
	cues: TranscriptCue[]
): string {
	const lines = [
		`## ${heading.trim() || "Transcript"}`,
		`${START_MARKER_PREFIX} videoId=${videoId} source=youtube -->`,
		...cues.map((cue) => serializeCueLine(sourceUrl, cue)),
		END_MARKER,
	];

	return lines.join("\n");
}

export function parseTranscriptBlock(content: string): TranscriptBlock | null {
	const lines = content.split("\n");
	const startLine = lines.findIndex((line) => line.trim().startsWith(START_MARKER_PREFIX));
	if (startLine === -1) {
		return null;
	}

	const endLine = lines.findIndex((line, index) => index > startLine && line.trim() === END_MARKER);
	if (endLine === -1) {
		return null;
	}

	const startMarker = lines[startLine];
	const videoId = markerAttribute(startMarker, "videoId") ?? "";
	const cueLines = lines.slice(startLine + 1, endLine);
	const cues = cueLines.flatMap((line, index): TranscriptCue[] => {
		const cue = parseCueLine(line, index);
		return cue ? [cue] : [];
	});

	return {
		videoId,
		sourceUrl: cues[0] ? cueUrlFromLine(cueLines[0]) ?? "" : "",
		cues,
		startLine,
		endLine,
	};
}

export function upsertTranscriptBlock(content: string, block: string): string {
	const lines = content.split("\n");
	const existing = parseTranscriptBlock(content);
	if (!existing) {
		const trimmed = content.replace(/\s+$/g, "");
		return `${trimmed}${trimmed.length > 0 ? "\n\n" : ""}${block}\n`;
	}

	const replaceStartLine = existing.startLine > 0 && /^#{1,6}\s+\S/.test(lines[existing.startLine - 1])
		? existing.startLine - 1
		: existing.startLine;
	const before = lines.slice(0, replaceStartLine);
	const after = lines.slice(existing.endLine + 1);
	return [...before, ...block.split("\n"), ...after].join("\n").replace(/\s+$/g, "\n");
}

export function serializeCueLine(sourceUrl: string, cue: TranscriptCue): string {
	const url = new URL(sourceUrl);
	url.searchParams.set("t", `${Math.floor(cue.startSeconds)}s`);
	return `- [${formatTimestamp(cue.startSeconds)}](${url.toString()}) ${cue.markdownText}`;
}

export function parseCueLine(line: string, index: number): TranscriptCue | null {
	const match = line.match(/^\s*-\s+\[([0-9:]+)\]\(([^)]*)\)\s*(.*)$/);
	if (!match) {
		return null;
	}

	const startSeconds = parseTimestamp(match[1]);
	if (startSeconds === null) {
		return null;
	}

	const markdownText = match[3].trim();
	const text = stripTranscriptMarkdown(markdownText);

	return {
		id: `cue-${Math.round(startSeconds * 1000)}-${index}`,
		startSeconds,
		durationSeconds: 0,
		text,
		markdownText,
	};
}

export function upsertFrontmatterValues(
	content: string,
	values: Record<string, string>
): string {
	const serialized = Object.entries(values).map(([key, value]) => `${key}: ${quoteYamlString(value)}`);

	if (!content.startsWith("---\n")) {
		return `---\n${serialized.join("\n")}\n---\n\n${content.replace(/^\s+/, "")}`;
	}

	const endIndex = content.indexOf("\n---", 4);
	if (endIndex === -1) {
		return content;
	}

	const frontmatter = content.slice(4, endIndex).split("\n");
	const rest = content.slice(endIndex);
	const nextFrontmatter = [...frontmatter];

	for (const [key, value] of Object.entries(values)) {
		const index = nextFrontmatter.findIndex((line) => line.trim().startsWith(`${key}:`));
		const line = `${key}: ${quoteYamlString(value)}`;
		if (index === -1) {
			nextFrontmatter.push(line);
		} else {
			nextFrontmatter[index] = line;
		}
	}

	return `---\n${nextFrontmatter.join("\n")}${rest}`;
}

function markerAttribute(marker: string, attribute: string): string | null {
	const match = marker.match(new RegExp(`${attribute}=([^\\s>]+)`));
	return match ? match[1] : null;
}

function cueUrlFromLine(line: string): string | null {
	const match = line.match(/^\s*-\s+\[[^\]]+\]\(([^)]*)\)/);
	return match ? match[1] : null;
}

function quoteYamlString(value: string): string {
	return `"${value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"")}"`;
}
