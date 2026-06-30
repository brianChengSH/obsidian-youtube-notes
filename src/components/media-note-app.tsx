import * as React from "react";
import YouTube, { YouTubeEvent, YouTubeProps } from "react-youtube";
import type { YouTubePlayer } from "youtube-player/dist/types";
import type { AnnotationKind, AnnotationSelection, MediaNotesPluginSettings, PlayerAction, PlayerHandle, TranscriptCue } from "../types";
import { formatTimestamp } from "../utils/time";
import { getYouTubeVideoId } from "../youtube";

interface MediaNoteAppProps {
	playerId: string;
	mediaLink: string;
	transcriptCues: TranscriptCue[];
	settings: MediaNotesPluginSettings;
	initSeconds: number;
	autoplay: boolean;
	onRegisterPlayer: (playerId: string, handle: PlayerHandle) => void;
	onUnregisterPlayer: (playerId: string) => void;
	onAnnotate: (selection: AnnotationSelection, kind: AnnotationKind) => void;
	onLoadTranscript: () => void;
}

interface OverlayState {
	action: PlayerAction;
	visible: boolean;
}

export function MediaNoteApp({
	playerId,
	mediaLink,
	transcriptCues,
	settings,
	initSeconds,
	autoplay,
	onRegisterPlayer,
	onUnregisterPlayer,
	onAnnotate,
	onLoadTranscript,
}: MediaNoteAppProps): React.ReactElement | null {
	const videoId = getYouTubeVideoId(mediaLink);
	const ytRef = React.useRef<YouTube>(null);
	const intervalRef = React.useRef<number | null>(null);
	const overlayTimerRef = React.useRef<number | null>(null);
	const transcriptRef = React.useRef<HTMLDivElement>(null);
	const cueRefs = React.useRef<Map<string, HTMLLIElement>>(new Map());
	const [duration, setDuration] = React.useState(0);
	const [currentTime, setCurrentTime] = React.useState(initSeconds);
	const [isPlaying, setIsPlaying] = React.useState(false);
	const [overlay, setOverlay] = React.useState<OverlayState | null>(null);
	const [selection, setSelection] = React.useState<AnnotationSelection>({ cueIds: [], selectedText: "" });

	const activeCue = React.useMemo(() => {
		return findActiveCue(transcriptCues, currentTime);
	}, [currentTime, transcriptCues]);

	const updateTimestamp = React.useCallback(() => {
		const player = getInternalPlayer(ytRef);
		if (!player) {
			return;
		}

		void player.getCurrentTime().then((time: number) => {
			if (typeof time === "number") {
				setCurrentTime(time);
			}
		});
	}, []);

	const stopPolling = React.useCallback(() => {
		if (intervalRef.current !== null) {
			window.clearInterval(intervalRef.current);
			intervalRef.current = null;
		}
	}, []);

	const startPolling = React.useCallback(() => {
		stopPolling();
		updateTimestamp();
		intervalRef.current = window.setInterval(updateTimestamp, 500);
	}, [stopPolling, updateTimestamp]);

	const showAction = React.useCallback((action: PlayerAction) => {
		if (overlayTimerRef.current !== null) {
			window.clearTimeout(overlayTimerRef.current);
		}
		setOverlay({ action, visible: true });
		overlayTimerRef.current = window.setTimeout(() => {
			setOverlay((current) => (current?.action === action ? { action, visible: false } : current));
		}, action.type === "setSpeed" ? 800 : 500);
	}, []);

	const handle = React.useMemo<PlayerHandle>(() => ({
		async getCurrentTime() {
			const player = getInternalPlayer(ytRef);
			if (!player) {
				return null;
			}

			const time = await player.getCurrentTime();
			return typeof time === "number" ? time : null;
		},
		async getVideoUrl() {
			const player = getInternalPlayer(ytRef);
			if (!player) {
				return null;
			}

			const url = await player.getVideoUrl();
			return typeof url === "string" ? url : null;
		},
		async getPlayerState() {
			const player = getInternalPlayer(ytRef);
			if (!player) {
				return null;
			}

			const state = await player.getPlayerState();
			return typeof state === "number" ? state : null;
		},
		async getAvailablePlaybackRates() {
			const player = getInternalPlayer(ytRef);
			if (!player) {
				return [1];
			}

			const rates = await player.getAvailablePlaybackRates();
			return Array.isArray(rates) ? rates.filter((rate): rate is number => typeof rate === "number") : [1];
		},
		async getPlaybackRate() {
			const player = getInternalPlayer(ytRef);
			if (!player) {
				return null;
			}

			const rate = await player.getPlaybackRate();
			return typeof rate === "number" ? rate : null;
		},
		seekTo(seconds: number) {
			void getInternalPlayer(ytRef)?.seekTo(seconds, true);
			setCurrentTime(seconds);
		},
		play() {
			void getInternalPlayer(ytRef)?.playVideo();
		},
		pause() {
			void getInternalPlayer(ytRef)?.pauseVideo();
		},
		setPlaybackRate(rate: number) {
			void getInternalPlayer(ytRef)?.setPlaybackRate(rate);
		},
		showAction,
	}), [showAction]);

	React.useEffect(() => {
		onRegisterPlayer(playerId, handle);
			return () => {
				stopPolling();
				if (overlayTimerRef.current !== null) {
					window.clearTimeout(overlayTimerRef.current);
				}
				onUnregisterPlayer(playerId);
			};
	}, [handle, onRegisterPlayer, onUnregisterPlayer, playerId, stopPolling]);

	React.useEffect(() => {
		if (!settings.autoScrollTranscript || !activeCue) {
			return;
		}

		const cueEl = cueRefs.current.get(activeCue.id);
		cueEl?.scrollIntoView({ block: "nearest" });
	}, [activeCue, settings.autoScrollTranscript]);

	if (!videoId) {
		return null;
	}

	const opts: YouTubeProps["opts"] = {
		playerVars: {
			start: initSeconds,
			autoplay: autoplay ? 1 : 0,
		},
	};
	return (
		<div className="media-notes-panel">
			<div className="media-notes-player-column">
				<div className="media-notes-player">
					<YouTube
						ref={ytRef}
						className="media-notes-youtube"
						iframeClassName="media-notes-youtube-iframe"
						videoId={videoId}
						opts={opts}
						onReady={(event: YouTubeEvent) => {
							void event.target.getDuration().then((nextDuration: number) => {
								setDuration(nextDuration);
							});
						}}
						onStateChange={(event: YouTubeEvent<number>) => {
							if (event.data === 1) {
								setIsPlaying(true);
								startPolling();
							} else if (event.data === 2 || event.data === 0) {
								setIsPlaying(false);
								stopPolling();
								updateTimestamp();
							}
						}}
					/>
					<PlayerOverlay overlay={overlay} seekSeconds={settings.seekSeconds} />
					<div className={`media-notes-progress ${settings.displayProgressBar ? "" : "media-notes-hidden"}`}>
						<div className={`media-notes-current-time ${settings.displayTimestamp || isPlaying ? "" : "media-notes-hidden"}`}>
							{formatTimestamp(currentTime)}
						</div>
						<progress
							className="media-notes-progress-bar"
							value={Math.min(currentTime, duration)}
							max={duration > 0 ? duration : 1}
							aria-label="Playback progress"
						/>
					</div>
				</div>
			</div>
			<div className="media-notes-transcript-column">
				<div className="media-notes-transcript-toolbar">
					<button
						type="button"
						aria-label="Bold selected transcript text"
						onClick={() => onAnnotate(selection, "bold")}
					>
						Bold
					</button>
					<button
						type="button"
						aria-label="Highlight selected transcript text"
						onClick={() => onAnnotate(selection, "highlight")}
					>
						Highlight
					</button>
				</div>
				<div
					ref={transcriptRef}
					className="media-notes-transcript"
					role="list"
					aria-label="Video transcript"
					onMouseUp={() => setSelection(readTranscriptSelection(transcriptRef.current))}
					onKeyUp={() => setSelection(readTranscriptSelection(transcriptRef.current))}
				>
					{transcriptCues.length === 0 ? (
						<div className="media-notes-empty-transcript">
							<p>No transcript in this note.</p>
							<button
								type="button"
								aria-label="Load transcript"
								onClick={onLoadTranscript}
							>
								Load transcript
							</button>
						</div>
					) : (
						<ol className="media-notes-cue-list">
							{transcriptCues.map((cue) => (
								<li
									key={cue.id}
									ref={(element) => {
										if (element) {
											cueRefs.current.set(cue.id, element);
										} else {
											cueRefs.current.delete(cue.id);
										}
									}}
									className={`media-notes-cue ${activeCue?.id === cue.id ? "media-notes-cue-active" : ""}`}
									data-cue-id={cue.id}
									role="listitem"
								>
									<button
										type="button"
										className="media-notes-cue-time"
										aria-label={`Seek to ${formatTimestamp(cue.startSeconds)}`}
										onClick={() => {
											handle.seekTo(cue.startSeconds);
											handle.showAction({ type: "timestampClick" });
										}}
									>
										{formatTimestamp(cue.startSeconds)}
									</button>
									<span className="media-notes-cue-text">{renderAnnotatedText(cue.markdownText)}</span>
								</li>
							))}
						</ol>
					)}
				</div>
			</div>
		</div>
	);
}

function PlayerOverlay({
	overlay,
	seekSeconds,
}: {
	overlay: OverlayState | null;
	seekSeconds: number;
}): React.ReactElement | null {
	if (!overlay?.visible) {
		return null;
	}

	const { action } = overlay;
	let text = "";
	if (action.type === "play") {
		text = "Play";
	} else if (action.type === "pause") {
		text = "Pause";
	} else if (action.type === "seekForward") {
		text = `+${seekSeconds}s`;
	} else if (action.type === "seekBackwards") {
		text = `-${seekSeconds}s`;
	} else if (action.type === "setSpeed") {
		text = `${action.speed ?? 1}x`;
	} else {
		text = formatTimestamp(0);
	}

	return <div className="media-notes-overlay" role="status" aria-live="polite">{text}</div>;
}

function findActiveCue(cues: TranscriptCue[], currentTime: number): TranscriptCue | null {
	if (cues.length === 0) {
		return null;
	}

	for (let index = 0; index < cues.length; index += 1) {
		const cue = cues[index];
		const nextCue = cues[index + 1];
		const end = cue.durationSeconds > 0 ? cue.startSeconds + cue.durationSeconds : nextCue?.startSeconds ?? Number.POSITIVE_INFINITY;
		if (currentTime >= cue.startSeconds && currentTime < end) {
			return cue;
		}
	}

	return cues[cues.length - 1];
}

function readTranscriptSelection(container: HTMLDivElement | null): AnnotationSelection {
	if (!container) {
		return { cueIds: [], selectedText: "" };
	}

	const selection = container.ownerDocument.getSelection();
	if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
		return { cueIds: [], selectedText: "" };
	}

	const selectedText = selection.toString().trim();
	if (!selectedText) {
		return { cueIds: [], selectedText: "" };
	}

	const range = selection.getRangeAt(0);
	const cueIds: string[] = [];
	container.querySelectorAll<HTMLElement>(".media-notes-cue[data-cue-id]").forEach((cueEl) => {
		if (range.intersectsNode(cueEl)) {
			const cueId = cueEl.getAttribute("data-cue-id");
			if (cueId) {
				cueIds.push(cueId);
			}
		}
	});

	return { cueIds, selectedText };
}

function renderAnnotatedText(markdown: string): React.ReactNode[] {
	const nodes: React.ReactNode[] = [];
	let index = 0;
	let bold = false;
	let highlight = false;
	let buffer = "";

	const flush = (): void => {
		if (!buffer) {
			return;
		}

		const key = `${index}-${nodes.length}`;
		let node: React.ReactNode = buffer;
		if (highlight) {
			node = <mark key={`${key}-mark`}>{node}</mark>;
		}
		if (bold) {
			node = <strong key={`${key}-strong`}>{node}</strong>;
		}
		nodes.push(node);
		buffer = "";
	};

	while (index < markdown.length) {
		const marker = markdown.slice(index, index + 2);
		if (marker === "**") {
			flush();
			bold = !bold;
			index += 2;
			continue;
		}

		if (marker === "==") {
			flush();
			highlight = !highlight;
			index += 2;
			continue;
		}

		buffer += markdown[index];
		index += 1;
	}

	flush();
	return nodes;
}

function getInternalPlayer(ytRef: React.RefObject<YouTube>): YouTubePlayer | null {
	return ytRef.current?.getInternalPlayer() ?? ytRef.current?.internalPlayer ?? null;
}
