import { requestUrl } from "obsidian";
import type { TranscriptCue, TranscriptTrack } from "./types";
import { parseYouTubeTime } from "./utils/time";
import { decodeEntities, normalizeWhitespace } from "./utils/text";

interface NormalizedYouTubeUrl {
	videoId: string;
	url: string;
	startSeconds: number;
}

interface CaptionTrackJson {
	baseUrl?: unknown;
	languageCode?: unknown;
	name?: {
		simpleText?: unknown;
		runs?: Array<{ text?: unknown }>;
	};
	kind?: unknown;
}

interface InnerTubePlayerResponse {
	captions?: unknown;
	playabilityStatus?: {
		status?: unknown;
		reason?: unknown;
	};
}

interface Json3Segment {
	utf8?: unknown;
}

interface Json3Event {
	tStartMs?: unknown;
	dDurationMs?: unknown;
	segs?: Json3Segment[];
}

interface Json3Transcript {
	events?: Json3Event[];
}

const YOUTUBE_HEADERS = {
	"Accept-Language": "en-US,en;q=0.9",
	"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome Safari/537.36",
};

const INNERTUBE_API_KEY = "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8";
const INNERTUBE_PLAYER_URL = `https://www.youtube.com/youtubei/v1/player?key=${INNERTUBE_API_KEY}`;
const IOS_CLIENT_NAME = "IOS";
const IOS_CLIENT_VERSION = "20.10.38";
const IOS_USER_AGENT = "com.google.ios.youtube/20.10.38 (iPhone16,2; U; CPU iOS 17_5_1 like Mac OS X)";

export function getYouTubeVideoId(input: string): string | null {
	try {
		const url = new URL(input);
		const host = url.hostname.replace(/^www\./, "");

		if (host === "youtu.be") {
			return url.pathname.split("/").filter(Boolean)[0] ?? null;
		}

		if (host.endsWith("youtube.com")) {
			if (url.pathname === "/watch") {
				return url.searchParams.get("v");
			}

			const parts = url.pathname.split("/").filter(Boolean);
			if (parts[0] === "embed" || parts[0] === "shorts" || parts[0] === "live") {
				return parts[1] ?? null;
			}
		}
	} catch {
		return null;
	}

	return null;
}

export function normalizeYouTubeUrl(input: string): NormalizedYouTubeUrl | null {
	const videoId = getYouTubeVideoId(input);
	if (!videoId) {
		return null;
	}

	let startSeconds = 0;
	try {
		const url = new URL(input);
		startSeconds = parseYouTubeTime(url.searchParams.get("t") ?? url.searchParams.get("start"));
	} catch {
		startSeconds = 0;
	}

	const url = new URL("https://www.youtube.com/watch");
	url.searchParams.set("v", videoId);
	if (startSeconds > 0) {
		url.searchParams.set("t", String(Math.floor(startSeconds)));
	}

	return {
		videoId,
		url: url.toString(),
		startSeconds,
	};
}

export function transcriptUrlForTrack(track: TranscriptTrack): string {
	const url = new URL(track.baseUrl);
	url.searchParams.set("fmt", "json3");
	return url.toString();
}

export async function fetchTranscriptForVideo(
	videoUrl: string,
	preferredLanguages: string[]
): Promise<{ cues: TranscriptCue[]; track: TranscriptTrack }> {
	const normalized = normalizeYouTubeUrl(videoUrl);
	if (!normalized) {
		throw new Error("Enter a valid YouTube URL.");
	}

	let tracks = await fetchInnerTubeTranscriptTracks(normalized.videoId, preferredLanguages);
	if (tracks.length === 0) {
		const watchResponse = await requestUrl({ url: normalized.url, headers: YOUTUBE_HEADERS });
		tracks = extractTranscriptTracks(watchResponse.text);
	}

	if (tracks.length === 0) {
		throw new Error("No public transcript is available for this video.");
	}

	const track = chooseTranscriptTrack(tracks, preferredLanguages);
	const transcriptResponse = await requestUrl({
		url: transcriptUrlForTrack(track),
		headers: YOUTUBE_HEADERS,
		throw: false,
	});
	const cues = parseJson3Transcript(transcriptResponse.text);
	if (cues.length > 0) {
		return { cues, track };
	}

	const fallbackResponse = await requestUrl({
		url: track.baseUrl,
		headers: YOUTUBE_HEADERS,
		throw: false,
	});
	const fallbackCues = parseXmlTranscript(fallbackResponse.text);
	if (fallbackCues.length === 0) {
		if (transcriptResponse.text.length === 0 && fallbackResponse.text.length === 0) {
			throw new Error("Caption track found, but YouTube returned empty transcript data for this video.");
		}
		throw new Error("Transcript was found but could not be parsed.");
	}

	return { cues: fallbackCues, track };
}

export async function fetchInnerTubeTranscriptTracks(
	videoId: string,
	preferredLanguages: string[]
): Promise<TranscriptTrack[]> {
	const languageCode = preferredLanguages.map((language) => language.trim()).find(Boolean) ?? "en";
	const response = await requestUrl({
		url: INNERTUBE_PLAYER_URL,
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"User-Agent": IOS_USER_AGENT,
		},
		body: JSON.stringify({
			context: {
				client: {
					clientName: IOS_CLIENT_NAME,
					clientVersion: IOS_CLIENT_VERSION,
					hl: languageCode,
					gl: "US",
				},
			},
			videoId,
		}),
		throw: false,
	});

	const playerResponse = parseInnerTubePlayerResponse(response.text);
	if (!playerResponse) {
		return [];
	}

	const status = playerResponse.playabilityStatus?.status;
	if (typeof status === "string" && status !== "OK") {
		return [];
	}

	return extractTranscriptTracksFromPlayerResponse(playerResponse);
}

export function extractTranscriptTracks(html: string): TranscriptTrack[] {
	const playerResponse = extractPlayerResponse(html);
	const fromPlayerResponse = extractTranscriptTracksFromPlayerResponse(playerResponse);
	if (fromPlayerResponse.length > 0) {
		return fromPlayerResponse;
	}

	const captionTracksJson = extractBalancedValueAfterKey(html, "\"captionTracks\":", "[", "]");
	if (!captionTracksJson) {
		return [];
	}

	try {
		const parsed = JSON.parse(captionTracksJson) as unknown;
		return parseCaptionTracks(parsed);
	} catch {
		return [];
	}
}

export function extractTranscriptTracksFromPlayerResponse(playerResponse: unknown): TranscriptTrack[] {
	if (!isRecord(playerResponse)) {
		return [];
	}

	const captions = playerResponse.captions;
	if (!isRecord(captions)) {
		return [];
	}

	const renderer = captions.playerCaptionsTracklistRenderer;
	if (!isRecord(renderer)) {
		return [];
	}

	return parseCaptionTracks(renderer.captionTracks);
}

export function chooseTranscriptTrack(tracks: TranscriptTrack[], preferredLanguages: string[]): TranscriptTrack {
	const normalizedPreferences = preferredLanguages.flatMap(expandLanguagePreference);
	const preferences = normalizedPreferences.length > 0 ? normalizedPreferences : ["en"];

	return [...tracks].sort((left, right) => {
		const leftLanguage = languageScore(left.languageCode, preferences);
		const rightLanguage = languageScore(right.languageCode, preferences);
		if (leftLanguage !== rightLanguage) {
			return leftLanguage - rightLanguage;
		}

		const leftKind = left.kind === "manual" ? 0 : 1;
		const rightKind = right.kind === "manual" ? 0 : 1;
		return leftKind - rightKind;
	})[0];
}

export function parseJson3Transcript(text: string): TranscriptCue[] {
	try {
		const parsed = JSON.parse(text) as Json3Transcript;
		const events = Array.isArray(parsed.events) ? parsed.events : [];
		return events
			.map((event, index) => json3EventToCue(event, index))
			.filter((cue): cue is TranscriptCue => cue !== null);
	} catch {
		return [];
	}
}

export function parseXmlTranscript(text: string): TranscriptCue[] {
	const cues: TranscriptCue[] = [];
	const textRegex = /<text\b([^>]*)>([\s\S]*?)<\/text>/g;
	let match: RegExpExecArray | null = textRegex.exec(text);
	let index = 0;

	while (match) {
		const attributes = parseXmlAttributes(match[1]);
		const startSeconds = Number(attributes.start);
		const durationSeconds = Number(attributes.dur ?? 0);
		const cueText = normalizeWhitespace(decodeEntities(match[2]));

		if (!Number.isNaN(startSeconds) && cueText.length > 0) {
			cues.push({
				id: cueId(startSeconds, index),
				startSeconds,
				durationSeconds: Number.isNaN(durationSeconds) ? 0 : durationSeconds,
				text: cueText,
				markdownText: cueText,
			});
			index += 1;
		}

		match = textRegex.exec(text);
	}

	return cues;
}

function extractPlayerResponse(html: string): unknown {
	const key = "ytInitialPlayerResponse";
	const index = html.indexOf(key);
	if (index === -1) {
		return null;
	}

	const objectStart = html.indexOf("{", index);
	if (objectStart === -1) {
		return null;
	}

	const json = extractBalancedFrom(html, objectStart, "{", "}");
	if (!json) {
		return null;
	}

	try {
		return JSON.parse(json) as unknown;
	} catch {
		return null;
	}
}

function extractBalancedValueAfterKey(source: string, key: string, open: string, close: string): string | null {
	const keyIndex = source.indexOf(key);
	if (keyIndex === -1) {
		return null;
	}

	const start = source.indexOf(open, keyIndex + key.length);
	if (start === -1) {
		return null;
	}

	return extractBalancedFrom(source, start, open, close);
}

function extractBalancedFrom(source: string, start: number, open: string, close: string): string | null {
	let depth = 0;
	let inString = false;
	let escaping = false;

	for (let index = start; index < source.length; index += 1) {
		const char = source[index];
		if (inString) {
			if (escaping) {
				escaping = false;
			} else if (char === "\\") {
				escaping = true;
			} else if (char === "\"") {
				inString = false;
			}
			continue;
		}

		if (char === "\"") {
			inString = true;
			continue;
		}

		if (char === open) {
			depth += 1;
		} else if (char === close) {
			depth -= 1;
			if (depth === 0) {
				return source.slice(start, index + 1);
			}
		}
	}

	return null;
}

function parseCaptionTracks(value: unknown): TranscriptTrack[] {
	if (!Array.isArray(value)) {
		return [];
	}

	return value.flatMap((track): TranscriptTrack[] => {
		const parsed = captionTrackToTranscriptTrack(track as CaptionTrackJson);
		return parsed ? [parsed] : [];
	});
}

function captionTrackToTranscriptTrack(track: CaptionTrackJson): TranscriptTrack | null {
	if (typeof track.baseUrl !== "string" || typeof track.languageCode !== "string") {
		return null;
	}

	return {
		baseUrl: track.baseUrl,
		languageCode: track.languageCode,
		name: captionTrackName(track),
		kind: track.kind === "asr" ? "asr" : "manual",
	};
}

function captionTrackName(track: CaptionTrackJson): string {
	const name = track.name;
	if (!name) {
		return "";
	}

	if (typeof name.simpleText === "string") {
		return name.simpleText;
	}

	if (Array.isArray(name.runs)) {
		return name.runs
			.map((run) => (typeof run.text === "string" ? run.text : ""))
			.join("");
	}

	return "";
}

function json3EventToCue(event: Json3Event, index: number): TranscriptCue | null {
	if (typeof event.tStartMs !== "number") {
		return null;
	}

	const text = Array.isArray(event.segs)
		? normalizeWhitespace(event.segs.map((segment) => (typeof segment.utf8 === "string" ? segment.utf8 : "")).join(""))
		: "";

	if (!text) {
		return null;
	}

	const startSeconds = event.tStartMs / 1000;
	const durationSeconds = typeof event.dDurationMs === "number" ? event.dDurationMs / 1000 : 0;

	return {
		id: cueId(startSeconds, index),
		startSeconds,
		durationSeconds,
		text,
		markdownText: text,
	};
}

function parseXmlAttributes(value: string): Record<string, string> {
	const attributes: Record<string, string> = {};
	const attributeRegex = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)="([^"]*)"/g;
	let match: RegExpExecArray | null = attributeRegex.exec(value);

	while (match) {
		attributes[match[1]] = decodeEntities(match[2]);
		match = attributeRegex.exec(value);
	}

	return attributes;
}

function languageScore(languageCode: string, preferences: string[]): number {
	const normalized = languageCode.toLowerCase();
	const exactIndex = preferences.findIndex((preference) => normalized === preference.toLowerCase());
	if (exactIndex !== -1) {
		return exactIndex;
	}

	const base = normalized.split("-")[0];
	const baseIndex = preferences.findIndex((preference) => base === preference.toLowerCase().split("-")[0]);
	return baseIndex === -1 ? preferences.length + 1 : baseIndex + 0.5;
}

function expandLanguagePreference(languageCode: string): string[] {
	const trimmed = languageCode.trim();
	if (!trimmed) {
		return [];
	}

	const base = trimmed.split("-")[0];
	return base === trimmed ? [trimmed] : [trimmed, base];
}

function cueId(startSeconds: number, index: number): string {
	return `cue-${Math.round(startSeconds * 1000)}-${index}`;
}

function parseInnerTubePlayerResponse(text: string): InnerTubePlayerResponse | null {
	try {
		const parsed = JSON.parse(text) as unknown;
		return isRecord(parsed) ? parsed : null;
	} catch {
		return null;
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}
