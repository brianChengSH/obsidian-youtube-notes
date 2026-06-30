import { describe, expect, test } from "vitest";
import {
	annotateCueLine,
	annotateSelectedText,
	applyTranscriptAnnotation,
	wrapMarkdown,
} from "../annotation";

const NOTE = [
	"## Transcript",
	"<!-- media-notes:transcript:start videoId=abc123 source=youtube -->",
	"- [00:12](https://www.youtube.com/watch?v=abc123&t=12s) Hello world",
	"- [00:15](https://www.youtube.com/watch?v=abc123&t=15s) Next line",
	"<!-- media-notes:transcript:end -->",
].join("\n");

describe("Transcript annotations", () => {
	test("wraps full markdown once", () => {
		expect(wrapMarkdown("Hello", "bold")).toBe("**Hello**");
		expect(wrapMarkdown("**Hello**", "bold")).toBe("**Hello**");
		expect(wrapMarkdown("Hello", "highlight")).toBe("==Hello==");
	});

	test("annotates selected text inside a cue", () => {
		expect(annotateSelectedText("Hello world", "world", "bold")).toBe("Hello **world**");
		expect(annotateCueLine("- [00:12](url) Hello world", "highlight", "Hello")).toBe("- [00:12](url) ==Hello== world");
	});

	test("applies selected text annotation to the managed block", () => {
		const updated = applyTranscriptAnnotation(NOTE, {
			cueIds: ["cue-12000-0"],
			selectedText: "world",
		}, "bold");

		expect(updated).toContain("Hello **world**");
		expect(updated).toContain("Next line");
	});

	test("applies whole-line annotations across multiple cues", () => {
		const updated = applyTranscriptAnnotation(NOTE, {
			cueIds: ["cue-12000-0", "cue-15000-1"],
			selectedText: "Hello world Next line",
		}, "highlight");

		expect(updated).toContain("==Hello world==");
		expect(updated).toContain("==Next line==");
	});
});
