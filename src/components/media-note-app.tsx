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

interface YouTubeInfoDelivery {
	currentTime?: number;
	duration?: number;
	playerState?: number;
}

interface WindowWithResizeObserver extends Window {
	ResizeObserver?: typeof ResizeObserver;
}

const YOUTUBE_PLAYER_STATE_ENDED = 0;
const YOUTUBE_PLAYER_STATE_PLAYING = 1;
const YOUTUBE_PLAYER_STATE_PAUSED = 2;

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
	const playerRef = React.useRef<YouTubePlayer | null>(null);
	const playerWindowRef = React.useRef<Window | null>(null);
	const playerFrameRef = React.useRef<HTMLDivElement>(null);
	const intervalRef = React.useRef<number | null>(null);
	const intervalWindowRef = React.useRef<Window | null>(null);
	const overlayTimerRef = React.useRef<number | null>(null);
	const overlayTimerWindowRef = React.useRef<Window | null>(null);
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

	const opts = React.useMemo<YouTubeProps["opts"]>(() => ({
		playerVars: {
			start: initSeconds,
			autoplay: autoplay ? 1 : 0,
			enablejsapi: 1,
		},
	}), []);

	const updateTimestampFromPlayer = React.useCallback((player: YouTubePlayer) => {
		void player.getCurrentTime().then((time: number) => {
			if (typeof time === "number") {
				setCurrentTime(time);
			}
		}).catch(() => undefined);
		void player.getPlayerState().then((state) => {
			setIsPlaying(isYouTubePlayingState(state));
		}).catch(() => undefined);
	}, []);

	const updateTimestamp = React.useCallback(() => {
		const player = getCurrentPlayer(playerRef, ytRef);
		if (player) {
			updateTimestampFromPlayer(player);
		}
	}, [updateTimestampFromPlayer]);

	const stopPolling = React.useCallback(() => {
		if (intervalRef.current !== null) {
			(intervalWindowRef.current ?? getElementWindow(playerFrameRef.current)).clearInterval(intervalRef.current);
			intervalRef.current = null;
			intervalWindowRef.current = null;
		}
	}, []);

	const startPolling = React.useCallback(() => {
		stopPolling();
		updateTimestamp();
		const timerWindow = getElementWindow(playerFrameRef.current);
		intervalWindowRef.current = timerWindow;
		intervalRef.current = timerWindow.setInterval(updateTimestamp, 500);
	}, [stopPolling, updateTimestamp]);

	const showAction = React.useCallback((action: PlayerAction) => {
		const timerWindow = getElementWindow(playerFrameRef.current);
		if (overlayTimerRef.current !== null) {
			(overlayTimerWindowRef.current ?? timerWindow).clearTimeout(overlayTimerRef.current);
		}
		setOverlay({ action, visible: true });
		overlayTimerWindowRef.current = timerWindow;
		overlayTimerRef.current = timerWindow.setTimeout(() => {
			setOverlay((current) => (current?.action === action ? { action, visible: false } : current));
		}, action.type === "setSpeed" ? 800 : 500);
	}, []);

	const resizePlayer = React.useCallback(() => {
		const frame = playerFrameRef.current;
		const player = getCurrentPlayer(playerRef, ytRef);
		if (!frame || !player) {
			return;
		}

		const width = Math.max(1, Math.round(frame.getBoundingClientRect().width));
		const height = Math.max(1, Math.round(width * 9 / 16));
		void player.setSize(width, height);
	}, []);

	const handle = React.useMemo<PlayerHandle>(() => ({
		async getCurrentTime() {
			const player = getCurrentPlayer(playerRef, ytRef);
			if (!player) {
				return null;
			}

			const time = await player.getCurrentTime();
			return typeof time === "number" ? time : null;
		},
		async getVideoUrl() {
			const player = getCurrentPlayer(playerRef, ytRef);
			if (!player) {
				return null;
			}

			const url = await player.getVideoUrl();
			return typeof url === "string" ? url : null;
		},
		async getPlayerState() {
			const player = getCurrentPlayer(playerRef, ytRef);
			if (!player) {
				return null;
			}

			const state = await player.getPlayerState();
			return typeof state === "number" ? state : null;
		},
		async getAvailablePlaybackRates() {
			const player = getCurrentPlayer(playerRef, ytRef);
			if (!player) {
				return [1];
			}

			const rates = await player.getAvailablePlaybackRates();
			return Array.isArray(rates) ? rates.filter((rate): rate is number => typeof rate === "number") : [1];
		},
		async getPlaybackRate() {
			const player = getCurrentPlayer(playerRef, ytRef);
			if (!player) {
				return null;
			}

			const rate = await player.getPlaybackRate();
			return typeof rate === "number" ? rate : null;
		},
		seekTo(seconds: number) {
			void getCurrentPlayer(playerRef, ytRef)?.seekTo(seconds, true);
			setCurrentTime(seconds);
		},
		play() {
			void getCurrentPlayer(playerRef, ytRef)?.playVideo();
		},
		pause() {
			void getCurrentPlayer(playerRef, ytRef)?.pauseVideo();
		},
		setPlaybackRate(rate: number) {
			void getCurrentPlayer(playerRef, ytRef)?.setPlaybackRate(rate);
		},
		showAction,
		resize() {
			resizePlayer();
		},
	}), [resizePlayer, showAction]);

	React.useEffect(() => {
		if (!videoId) {
			return;
		}

		onRegisterPlayer(playerId, handle);
		startPolling();
		return () => {
			stopPolling();
			playerRef.current = null;
			playerWindowRef.current = null;
			if (overlayTimerRef.current !== null) {
				(overlayTimerWindowRef.current ?? getElementWindow(playerFrameRef.current)).clearTimeout(overlayTimerRef.current);
				overlayTimerRef.current = null;
				overlayTimerWindowRef.current = null;
			}
			onUnregisterPlayer(playerId);
		};
	}, [handle, onRegisterPlayer, onUnregisterPlayer, playerId, startPolling, stopPolling, videoId]);

	React.useEffect(() => {
		const ownerWindow = getElementWindow(playerFrameRef.current);
		const handleMessage = (event: MessageEvent<unknown>): void => {
			const playerWindow = playerWindowRef.current;
			if (playerWindow && event.source !== playerWindow) {
				return;
			}

			const info = parseYouTubeInfoDelivery(event.data);
			if (!info) {
				return;
			}

			if (typeof info.currentTime === "number") {
				setCurrentTime(info.currentTime);
			}
			if (typeof info.duration === "number") {
				setDuration(info.duration);
			}
			if (typeof info.playerState === "number") {
				setIsPlaying(isYouTubePlayingState(info.playerState));
			}
		};

		ownerWindow.addEventListener("message", handleMessage);
		return () => ownerWindow.removeEventListener("message", handleMessage);
	}, []);

	React.useEffect(() => {
		const frame = playerFrameRef.current;
		if (!frame) {
			return undefined;
		}

		const ownerWindow = getElementWindow(frame);
		const ResizeObserverConstructor = getResizeObserverConstructor(ownerWindow);
		if (!ResizeObserverConstructor) {
			resizePlayer();
			return undefined;
		}

		const observer = new ResizeObserverConstructor(() => {
			resizePlayer();
		});
		observer.observe(frame);
		resizePlayer();

		return () => observer.disconnect();
	}, [resizePlayer, videoId]);

	React.useEffect(() => {
		if (!settings.autoScrollTranscript || !activeCue) {
			return;
		}

		const transcriptEl = transcriptRef.current;
		const cueEl = cueRefs.current.get(activeCue.id);
		if (transcriptEl && cueEl) {
			scrollCueIntoTranscript(transcriptEl, cueEl);
		}
	}, [activeCue?.id, settings.autoScrollTranscript]);

	if (!videoId) {
		return null;
	}

	return (
		<div className="media-notes-panel">
			<div className="media-notes-player-column">
				<div className="media-notes-player">
					<div ref={playerFrameRef} className="media-notes-player-frame">
						<YouTube
							ref={ytRef}
							className="media-notes-youtube"
							iframeClassName="media-notes-youtube-iframe"
							videoId={videoId}
							opts={opts}
							onReady={(event: YouTubeEvent) => {
								playerRef.current = event.target;
								void event.target.getIframe().then((iframe) => {
									playerWindowRef.current = iframe.contentWindow;
								}).catch(() => undefined);
								resizePlayer();
								updateTimestampFromPlayer(event.target);
								void event.target.getDuration().then((nextDuration: number) => {
									setDuration(nextDuration);
								});
							}}
							onPlay={(event: YouTubeEvent<number>) => {
								playerRef.current = event.target;
								setIsPlaying(true);
								startPolling();
								updateTimestampFromPlayer(event.target);
							}}
							onPause={(event: YouTubeEvent<number>) => {
								playerRef.current = event.target;
								setIsPlaying(false);
								updateTimestampFromPlayer(event.target);
							}}
							onEnd={(event: YouTubeEvent<number>) => {
								playerRef.current = event.target;
								setIsPlaying(false);
								updateTimestampFromPlayer(event.target);
							}}
							onStateChange={(event: YouTubeEvent<number>) => {
								playerRef.current = event.target;
								if (isYouTubePlayingState(event.data)) {
									setIsPlaying(true);
								} else if (isYouTubePausedState(event.data) || isYouTubeEndedState(event.data)) {
									setIsPlaying(false);
								}
								updateTimestampFromPlayer(event.target);
							}}
						/>
					</div>
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

function scrollCueIntoTranscript(container: HTMLDivElement, cueEl: HTMLLIElement): void {
	const containerRect = container.getBoundingClientRect();
	const cueRect = cueEl.getBoundingClientRect();
	const cueTop = cueRect.top - containerRect.top + container.scrollTop;
	const cueBottom = cueTop + cueEl.offsetHeight;
	const visibleTop = container.scrollTop;
	const visibleBottom = visibleTop + container.clientHeight;

	if (cueTop >= visibleTop && cueBottom <= visibleBottom) {
		return;
	}

	container.scrollTo({
		top: Math.max(0, cueTop - container.clientHeight * 0.35),
		behavior: "smooth",
	});
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

function getCurrentPlayer(
	playerRef: React.RefObject<YouTubePlayer | null>,
	ytRef: React.RefObject<YouTube>
): YouTubePlayer | null {
	return playerRef.current ?? ytRef.current?.getInternalPlayer() ?? ytRef.current?.internalPlayer ?? null;
}

function getElementWindow(element: Element | null): Window {
	return element?.ownerDocument.defaultView ?? activeWindow;
}

function getResizeObserverConstructor(ownerWindow: Window): typeof ResizeObserver | null {
	const resizeObserverWindow = ownerWindow as WindowWithResizeObserver;
	return resizeObserverWindow.ResizeObserver ?? null;
}

function parseYouTubeInfoDelivery(data: unknown): YouTubeInfoDelivery | null {
	const payload = parseMessagePayload(data);
	if (!isRecord(payload) || payload.event !== "infoDelivery" || !isRecord(payload.info)) {
		return null;
	}

	const currentTime = typeof payload.info.currentTime === "number" ? payload.info.currentTime : undefined;
	const duration = typeof payload.info.duration === "number" ? payload.info.duration : undefined;
	const playerState = typeof payload.info.playerState === "number" ? payload.info.playerState : undefined;
	if (currentTime === undefined && duration === undefined && playerState === undefined) {
		return null;
	}

	return { currentTime, duration, playerState };
}

function parseMessagePayload(data: unknown): unknown {
	if (typeof data !== "string") {
		return data;
	}

	try {
		return JSON.parse(data) as unknown;
	} catch {
		return null;
	}
}

function isYouTubePlayingState(state: unknown): boolean {
	return state === YOUTUBE_PLAYER_STATE_PLAYING;
}

function isYouTubePausedState(state: unknown): boolean {
	return state === YOUTUBE_PLAYER_STATE_PAUSED;
}

function isYouTubeEndedState(state: unknown): boolean {
	return state === YOUTUBE_PLAYER_STATE_ENDED;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}
