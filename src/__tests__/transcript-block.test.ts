import { describe, expect, test } from "vitest";
import {
	parseTranscriptBlock,
	serializeTranscriptBlock,
	upsertFrontmatterValues,
	upsertTranscriptBlock,
} from "../transcript-block";

describe("Transcript block", () => {
	test("serializes and parses managed transcript blocks", () => {
		const block = serializeTranscriptBlock("abc123", "https://www.youtube.com/watch?v=abc123", "Transcript", [
			{
				id: "cue-12000-0",
				startSeconds: 12,
				durationSeconds: 2,
				text: "Hello world",
				markdownText: "Hello world",
			},
		]);

		expect(block).toContain("<!-- media-notes:transcript:start videoId=abc123 source=youtube -->");
		expect(block).toContain("- [00:12](https://www.youtube.com/watch?v=abc123&t=12s) Hello world");
		expect(parseTranscriptBlock(block)?.cues[0]).toMatchObject({
			id: "cue-12000-0",
			startSeconds: 12,
			text: "Hello world",
		});
	});

	test("upserts frontmatter values", () => {
		const content = "# Note";
		const updated = upsertFrontmatterValues(content, {
			media_link: "https://www.youtube.com/watch?v=abc123",
			media_notes_video_id: "abc123",
		});

		expect(updated).toContain('media_link: "https://www.youtube.com/watch?v=abc123"');
		expect(updated).toContain('media_notes_video_id: "abc123"');
		expect(updated).toContain("# Note");
	});

	test("replaces existing transcript block", () => {
		const original = [
			"# Note",
			"",
			"## Transcript",
			"<!-- media-notes:transcript:start videoId=old source=youtube -->",
			"- [00:01](https://www.youtube.com/watch?v=old&t=1s) Old",
			"<!-- media-notes:transcript:end -->",
		].join("\n");
		const nextBlock = serializeTranscriptBlock("new", "https://www.youtube.com/watch?v=new", "Transcript", [
			{ id: "cue-2000-0", startSeconds: 2, durationSeconds: 1, text: "New", markdownText: "New" },
		]);

		const updated = upsertTranscriptBlock(original, nextBlock);
		expect(updated).not.toContain("Old");
		expect(updated).toContain("New");
		expect(updated).toContain("videoId=new");
	});
});
