export type SplitMode = "Horizontal" | "Vertical";

export type AnnotationKind = "bold" | "highlight";

export interface TranscriptCue {
	id: string;
	startSeconds: number;
	durationSeconds: number;
	text: string;
	markdownText: string;
}

export interface TranscriptTrack {
	languageCode: string;
	name: string;
	kind: "manual" | "asr";
	baseUrl: string;
}

export interface TranscriptBlock {
	videoId: string;
	sourceUrl: string;
	cues: TranscriptCue[];
	startLine: number;
	endLine: number;
}

export interface MediaDataEntry {
	mediaLink: string;
	lastUpdated: string;
	lastTimestampSeconds: number;
}

export interface MediaNotesPluginSettings {
	seekSeconds: number;
	timestampTemplate: string;
	timestampOffsetSeconds: number;
	displayProgressBar: boolean;
	displayTimestamp: boolean;
	pauseOnTimestampInsert: boolean;
	defaultSplitMode: SplitMode;
	preferredTranscriptLanguages: string[];
	autoScrollTranscript: boolean;
	transcriptHeading: string;
	mediaData: Record<string, MediaDataEntry>;
}

export interface AnnotationSelection {
	cueIds: string[];
	selectedText: string;
}

export interface PlayerAction {
	type: "timestampClick" | "seekForward" | "seekBackwards" | "play" | "pause" | "setSpeed";
	speed?: number;
}

export interface PlayerHandle {
	getCurrentTime(): Promise<number | null>;
	getVideoUrl(): Promise<string | null>;
	getPlayerState(): Promise<number | null>;
	getAvailablePlaybackRates(): Promise<number[]>;
	getPlaybackRate(): Promise<number | null>;
	seekTo(seconds: number): void;
	play(): void;
	pause(): void;
	setPlaybackRate(rate: number): void;
	showAction(action: PlayerAction): void;
	resize(): void;
}
