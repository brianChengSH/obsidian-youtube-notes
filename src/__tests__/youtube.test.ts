import { afterEach, describe, expect, test } from "vitest";
import { requestUrlCalls, resetRequestUrlMock, setRequestUrlMock } from "./mocks/obsidian";
import {
	chooseTranscriptTrack,
	extractTranscriptTracksFromPlayerResponse,
	extractTranscriptTracks,
	fetchTranscriptForVideo,
	getYouTubeVideoId,
	normalizeYouTubeUrl,
	parseJson3Transcript,
	parseXmlTranscript,
} from "../youtube";

afterEach(() => {
	resetRequestUrlMock();
});

describe("YouTube URL parsing", () => {
	test("extracts video ids from common URL shapes", () => {
		expect(getYouTubeVideoId("https://www.youtube.com/watch?v=abc123")).toBe("abc123");
		expect(getYouTubeVideoId("https://youtu.be/abc123?t=42")).toBe("abc123");
		expect(getYouTubeVideoId("https://www.youtube.com/shorts/abc123")).toBe("abc123");
		expect(getYouTubeVideoId("not a url")).toBeNull();
	});

	test("normalizes URLs and keeps start seconds", () => {
		expect(normalizeYouTubeUrl("https://youtu.be/abc123?t=1m2s")).toEqual({
			videoId: "abc123",
			url: "https://www.youtube.com/watch?v=abc123&t=62",
			startSeconds: 62,
		});
	});
});

describe("Transcript tracks", () => {
	test("extracts caption tracks from player response", () => {
		const html = `
			<script>
				var ytInitialPlayerResponse = {
					"captions": {
						"playerCaptionsTracklistRenderer": {
							"captionTracks": [
								{"baseUrl":"https://example.com/a","languageCode":"en","name":{"simpleText":"English"}},
								{"baseUrl":"https://example.com/b","languageCode":"zh-TW","kind":"asr","name":{"runs":[{"text":"Chinese"}]}}
							]
						}
					}
				};
			</script>
		`;

		expect(extractTranscriptTracks(html)).toEqual([
			{
				baseUrl: "https://example.com/a",
				languageCode: "en",
				name: "English",
				kind: "manual",
			},
			{
				baseUrl: "https://example.com/b",
				languageCode: "zh-TW",
				name: "Chinese",
				kind: "asr",
			},
		]);
	});

	test("prefers requested languages and manual tracks", () => {
		const selected = chooseTranscriptTrack([
			{ baseUrl: "https://example.com/en-auto", languageCode: "en", name: "English auto", kind: "asr" },
			{ baseUrl: "https://example.com/en", languageCode: "en", name: "English", kind: "manual" },
			{ baseUrl: "https://example.com/zh", languageCode: "zh-TW", name: "Chinese", kind: "manual" },
		], ["en"]);

		expect(selected.baseUrl).toBe("https://example.com/en");
	});

	test("extracts caption tracks from InnerTube iOS player responses", () => {
		const tracks = extractTranscriptTracksFromPlayerResponse({
			playabilityStatus: { status: "OK" },
			captions: {
				playerCaptionsTracklistRenderer: {
					captionTracks: [
						{
							baseUrl: "https://www.youtube.com/api/timedtext?v=7clJ8IH784Q&signature=signed",
							languageCode: "en",
							kind: "asr",
							name: { runs: [{ text: "English" }, { text: " (auto-generated)" }] },
						},
					],
				},
			},
		});

		expect(tracks).toEqual([
			{
				baseUrl: "https://www.youtube.com/api/timedtext?v=7clJ8IH784Q&signature=signed",
				languageCode: "en",
				name: "English (auto-generated)",
				kind: "asr",
			},
		]);
	});

	test("fetches transcript through InnerTube iOS player data before watch HTML", async () => {
		setRequestUrlMock(async (request) => {
			if (request.url.includes("/youtubei/v1/player")) {
				return {
					text: JSON.stringify({
						playabilityStatus: { status: "OK" },
						captions: {
							playerCaptionsTracklistRenderer: {
								captionTracks: [
									{
										baseUrl: "https://www.youtube.com/api/timedtext?v=7clJ8IH784Q&signature=signed&lang=en",
										languageCode: "en",
										kind: "asr",
										name: { simpleText: "English (auto-generated)" },
									},
								],
							},
						},
					}),
				};
			}

			if (request.url.includes("/api/timedtext") && request.url.includes("signature=signed")) {
				return {
					text: JSON.stringify({
						events: [
							{
								tStartMs: 10200,
								dDurationMs: 5600,
								segs: [{ utf8: "Mike " }, { utf8: "to clearly explain" }],
							},
						],
					}),
				};
			}

			throw new Error(`Unexpected request URL: ${request.url}`);
		});

		const result = await fetchTranscriptForVideo("https://www.youtube.com/watch?v=7clJ8IH784Q", ["en"]);

		expect(requestUrlCalls).toHaveLength(2);
		expect(requestUrlCalls[0]).toMatchObject({
			url: expect.stringContaining("/youtubei/v1/player"),
			method: "POST",
		});
		expect(requestUrlCalls[1].url).toContain("signature=signed");
		expect(requestUrlCalls[1].url).toContain("fmt=json3");
		expect(result.cues[0]).toMatchObject({
			startSeconds: 10.2,
			text: "Mike to clearly explain",
		});
		expect(result.track).toMatchObject({
			languageCode: "en",
			kind: "asr",
		});
	});
});

describe("Transcript parsing", () => {
	test("parses json3 transcript events", () => {
		const cues = parseJson3Transcript(JSON.stringify({
			events: [
				{ tStartMs: 12000, dDurationMs: 1800, segs: [{ utf8: "Hello " }, { utf8: "world" }] },
				{ tStartMs: 14000, segs: [{ utf8: "\n" }] },
			],
		}));

		expect(cues).toHaveLength(1);
		expect(cues[0]).toMatchObject({
			startSeconds: 12,
			durationSeconds: 1.8,
			text: "Hello world",
			markdownText: "Hello world",
		});
	});

	test("parses XML transcript text", () => {
		const cues = parseXmlTranscript('<transcript><text start="1.2" dur="2">Hello &amp; welcome</text></transcript>');

		expect(cues).toHaveLength(1);
		expect(cues[0]).toMatchObject({
			startSeconds: 1.2,
			durationSeconds: 2,
			text: "Hello & welcome",
		});
	});
});
