import { createRoot, Root } from "react-dom/client";
import * as React from "react";
import {
	Editor,
	MarkdownView,
	Notice,
	Plugin,
	TFile,
} from "obsidian";
import YouTube from "react-youtube";
import { MediaNoteApp } from "./components/media-note-app";
import { createClickHandlerPlugin } from "./viewPlugin";
import { DEFAULT_SETTINGS, MediaNotesSettingTab } from "./settings";
import { applyAnnotationToActiveNote, createOrUpdateMediaNote } from "./note";
import { parseTranscriptBlock } from "./transcript-block";
import type {
	AnnotationKind,
	AnnotationSelection,
	MediaNotesPluginSettings,
	PlayerHandle,
} from "./types";
import { formatTimestamp, parseTimestamp } from "./utils/time";
import { getYouTubeVideoId, normalizeYouTubeUrl } from "./youtube";
import { UrlPromptModal } from "./url-prompt-modal";

const MEDIA_CONTAINER_CLASS = "media-notes-container";
const MEDIA_LAYOUT_VERTICAL_CLASS = "media-notes-layout-vertical";
const MEDIA_LAYOUT_HORIZONTAL_CLASS = "media-notes-layout-horizontal";

interface MountedMediaNote {
	root: Root;
	host: HTMLElement;
	mediaLink: string;
	filePath: string;
	handle: PlayerHandle | null;
}

export { formatTimestamp };

export default class MediaNotesPlugin extends Plugin {
	settings!: MediaNotesPluginSettings;
	private mounted = new Map<string, MountedMediaNote>();

	async onload(): Promise<void> {
		await this.loadSettings();
		this.registerEditorExtension([
			createClickHandlerPlugin((timestamp) => this.handleTimestampClick(timestamp)),
		]);

		this.addSettingTab(new MediaNotesSettingTab(this.app, this));
		this.registerCommands();
		this.registerWorkspaceEvents();
		this.app.workspace.onLayoutReady(() => this.renderAllMediaViews());
	}

	onunload(): void {
		for (const playerId of this.mounted.keys()) {
			void this.unmountPlayer(playerId, true);
		}
	}

	async loadSettings(): Promise<void> {
		const loaded = (await this.loadData()) as Partial<MediaNotesPluginSettings> | null;
		this.settings = {
			...DEFAULT_SETTINGS,
			...loaded,
			mediaData: {
				...DEFAULT_SETTINGS.mediaData,
				...(loaded?.mediaData ?? {}),
			},
			preferredTranscriptLanguages: loaded?.preferredTranscriptLanguages ?? DEFAULT_SETTINGS.preferredTranscriptLanguages,
		};
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
		this.renderAllMediaViews(true);
	}

	private registerCommands(): void {
		this.addCommand({
			id: "create-or-update-media-note",
			name: "Create or update media note",
			checkCallback: (checking) => {
				const view = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (!view) {
					return false;
				}
				if (!checking) {
					new UrlPromptModal(this.app, (url) => {
						void this.createOrUpdateActiveNote(view, url);
					}).open();
				}
				return true;
			},
		});

		this.addCommand({
			id: "insert-media-timestamp",
			name: "Insert timestamp",
			editorCallback: (editor, ctx) => {
				if (ctx instanceof MarkdownView) {
					void this.insertTimestamp(editor, ctx);
				}
			},
		});

		this.addCommand({
			id: "toggle-play-pause",
			name: "Play or pause",
			editorCallback: (_editor, ctx) => {
				if (ctx instanceof MarkdownView) {
					void this.togglePlayPause(ctx);
				}
			},
		});

		this.addCommand({
			id: "toggle-horizontal-view",
			name: "Toggle horizontal or vertical split",
			editorCallback: (_editor, ctx) => {
				if (ctx instanceof MarkdownView) {
					this.toggleSplitMode(ctx);
				}
			},
		});

		this.addCommand({
			id: "seek-forward",
			name: "Fast forward",
			editorCallback: (_editor, ctx) => {
				if (ctx instanceof MarkdownView) {
					void this.seekBy(ctx, this.settings.seekSeconds, "seekForward");
				}
			},
		});

		this.addCommand({
			id: "seek-backwards",
			name: "Rewind",
			editorCallback: (_editor, ctx) => {
				if (ctx instanceof MarkdownView) {
					void this.seekBy(ctx, -this.settings.seekSeconds, "seekBackwards");
				}
			},
		});

		this.addCommand({
			id: "speed-up",
			name: "Speed up",
			editorCallback: (_editor, ctx) => {
				if (ctx instanceof MarkdownView) {
					void this.changeSpeed(ctx, 1);
				}
			},
		});

		this.addCommand({
			id: "slow-down",
			name: "Slow down",
			editorCallback: (_editor, ctx) => {
				if (ctx instanceof MarkdownView) {
					void this.changeSpeed(ctx, -1);
				}
			},
		});
	}

	private registerWorkspaceEvents(): void {
		this.registerEvent(
			this.app.workspace.on("layout-change", () => {
				this.renderAllMediaViews();
			})
		);
		this.registerEvent(
			this.app.workspace.on("file-open", () => {
				this.renderAllMediaViews();
			})
		);
		this.registerEvent(
			this.app.metadataCache.on("changed", (file) => {
				if (file instanceof TFile) {
					this.renderAllMediaViews();
				}
			})
		);
	}

	private async createOrUpdateActiveNote(view: MarkdownView, url: string): Promise<void> {
		const videoId = await createOrUpdateMediaNote(view, this.settings, url);
		if (videoId) {
			this.renderPlayerInView(view, true);
		}
	}

	private renderAllMediaViews(force = false): void {
		for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
			if (leaf.view instanceof MarkdownView) {
				this.renderPlayerInView(leaf.view, force);
			}
		}
	}

	private renderPlayerInView(markdownView: MarkdownView, force = false): void {
		const file = markdownView.file;
		if (!file) {
			return;
		}

		const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
		const mediaLink = mediaLinkFromFrontmatter(frontmatter);
		const existingHost = markdownView.containerEl.querySelector<HTMLElement>(`.${MEDIA_CONTAINER_CLASS}`);
		if (!mediaLink) {
			if (existingHost) {
				const existingId = existingHost.dataset.playerId;
				if (existingId) {
					void this.unmountPlayer(existingId, true);
				}
			}
			markdownView.containerEl.removeClass(MEDIA_LAYOUT_HORIZONTAL_CLASS);
			markdownView.containerEl.removeClass(MEDIA_LAYOUT_VERTICAL_CLASS);
			return;
		}

		const existingId = existingHost?.dataset.playerId;
		const existingMount = existingId ? this.mounted.get(existingId) : null;
		if (!force && existingMount && existingMount.mediaLink === mediaLink && existingMount.filePath === file.path) {
			return;
		}

		if (existingId) {
			void this.unmountPlayer(existingId, true);
		}

		const sourceView = markdownView.containerEl.querySelector<HTMLElement>(".markdown-source-view");
		if (!sourceView) {
			return;
		}

		const host = sourceView.createDiv({ cls: MEDIA_CONTAINER_CLASS });
		const playerId = createPlayerId();
		host.dataset.playerId = playerId;
		sourceView.prepend(host);
		this.applyLayoutClass(markdownView);

		const mediaId = getYouTubeVideoId(mediaLink) ?? mediaLink;
		const mediaData = this.settings.mediaData[mediaId] ?? this.settings.mediaData[mediaLink];
		const normalized = normalizeYouTubeUrl(mediaLink);
		const initSeconds = Math.round(mediaData?.lastTimestampSeconds ?? normalized?.startSeconds ?? 0);
		const autoplay = Boolean(normalized?.startSeconds && initSeconds === normalized.startSeconds);
		const content = markdownView.editor.getValue();
		const transcriptCues = parseTranscriptBlock(content)?.cues ?? [];

		const root = createRoot(host);
		this.mounted.set(playerId, {
			root,
			host,
			mediaLink,
			filePath: file.path,
			handle: null,
		});

		root.render(
			<MediaNoteApp
				playerId={playerId}
				mediaLink={mediaLink}
				transcriptCues={transcriptCues}
				settings={this.settings}
				initSeconds={initSeconds}
				autoplay={autoplay}
				onRegisterPlayer={(id, handle) => this.registerPlayerHandle(id, handle)}
				onUnregisterPlayer={(id) => this.unregisterPlayerHandle(id)}
				onAnnotate={(selection, kind) => this.annotateActiveTranscript(selection, kind)}
				onLoadTranscript={() => {
					void this.createOrUpdateActiveNote(markdownView, mediaLink);
				}}
			/>
		);
	}

	private applyLayoutClass(markdownView: MarkdownView): void {
		markdownView.containerEl.removeClass(MEDIA_LAYOUT_HORIZONTAL_CLASS);
		markdownView.containerEl.removeClass(MEDIA_LAYOUT_VERTICAL_CLASS);
		markdownView.containerEl.addClass(
			this.settings.defaultSplitMode === "Vertical" ? MEDIA_LAYOUT_VERTICAL_CLASS : MEDIA_LAYOUT_HORIZONTAL_CLASS
		);
	}

	private async unmountPlayer(playerId: string, saveTimestamp: boolean): Promise<void> {
		const mount = this.mounted.get(playerId);
		if (!mount) {
			return;
		}

		if (saveTimestamp) {
			await this.savePlayerTimestamp(playerId);
		}

		mount.root.unmount();
		mount.host.remove();
		this.mounted.delete(playerId);
	}

	private registerPlayerHandle(playerId: string, handle: PlayerHandle): void {
		const mount = this.mounted.get(playerId);
		if (mount) {
			mount.handle = handle;
		}
	}

	private unregisterPlayerHandle(playerId: string): void {
		const mount = this.mounted.get(playerId);
		if (mount) {
			mount.handle = null;
		}
	}

	private getActivePlayer(view: MarkdownView): MountedMediaNote | null {
		const host = view.containerEl.querySelector<HTMLElement>(`.${MEDIA_CONTAINER_CLASS}`);
		const playerId = host?.dataset.playerId;
		if (!playerId) {
			return null;
		}

		return this.mounted.get(playerId) ?? null;
	}

	private async savePlayerTimestamp(playerId: string): Promise<void> {
		const player = this.mounted.get(playerId);
		if (!player?.handle) {
			return;
		}

		const timestamp = await player.handle.getCurrentTime();
		const mediaId = getYouTubeVideoId(player.mediaLink);
		if (timestamp === null || !mediaId) {
			return;
		}

		this.settings.mediaData[mediaId] = {
			mediaLink: player.mediaLink,
			lastUpdated: new Date().toISOString(),
			lastTimestampSeconds: timestamp,
		};
		await this.saveData(this.settings);
	}

	private handleTimestampClick(timestamp: string): boolean | undefined {
		const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!activeView) {
			return undefined;
		}

		const player = this.getActivePlayer(activeView);
		if (!player?.handle) {
			return undefined;
		}

		const seconds = parseTimestamp(timestamp);
		if (seconds === null) {
			return undefined;
		}

		player.handle.seekTo(seconds);
		player.handle.showAction({ type: "timestampClick" });
		return true;
	}

	private async insertTimestamp(editor: Editor, view: MarkdownView): Promise<void> {
		const player = this.getActivePlayer(view);
		if (!player?.handle) {
			return;
		}

		const timestamp = await player.handle.getCurrentTime();
		if (timestamp === null) {
			return;
		}

		const offsetTimestamp = Math.max(0, timestamp - this.settings.timestampOffsetSeconds);
		let timestampSnippet = this.settings.timestampTemplate.replace("{ts}", formatTimestamp(offsetTimestamp));
		const videoUrl = await player.handle.getVideoUrl();
		if (videoUrl) {
			const fixedVideoUrl = new URL(videoUrl);
			fixedVideoUrl.searchParams.set("t", Math.floor(offsetTimestamp).toString());
			timestampSnippet = timestampSnippet.replace("{link}", fixedVideoUrl.toString());
		}
		editor.replaceSelection(timestampSnippet.replace(/\\n/g, "\n"));

		if (this.settings.pauseOnTimestampInsert) {
			const state = await player.handle.getPlayerState();
			if (state === YouTube.PlayerState.PLAYING) {
				player.handle.pause();
				player.handle.showAction({ type: "pause" });
			}
		}
	}

	private async togglePlayPause(view: MarkdownView): Promise<void> {
		const player = this.getActivePlayer(view);
		if (!player?.handle) {
			return;
		}

		const state = await player.handle.getPlayerState();
		if (state === YouTube.PlayerState.PLAYING) {
			player.handle.pause();
			player.handle.showAction({ type: "pause" });
			return;
		}

		player.handle.play();
		player.handle.showAction({ type: "play" });
	}

	private toggleSplitMode(view: MarkdownView): void {
		if (view.containerEl.hasClass(MEDIA_LAYOUT_VERTICAL_CLASS)) {
			view.containerEl.removeClass(MEDIA_LAYOUT_VERTICAL_CLASS);
			view.containerEl.addClass(MEDIA_LAYOUT_HORIZONTAL_CLASS);
			return;
		}

		view.containerEl.removeClass(MEDIA_LAYOUT_HORIZONTAL_CLASS);
		view.containerEl.addClass(MEDIA_LAYOUT_VERTICAL_CLASS);
	}

	private async seekBy(
		view: MarkdownView,
		secondsDelta: number,
		actionType: "seekForward" | "seekBackwards"
	): Promise<void> {
		const player = this.getActivePlayer(view);
		if (!player?.handle) {
			return;
		}

		const currentTime = await player.handle.getCurrentTime();
		if (currentTime === null) {
			return;
		}

		player.handle.seekTo(Math.max(0, currentTime + secondsDelta));
		player.handle.showAction({ type: actionType });
	}

	private async changeSpeed(view: MarkdownView, direction: 1 | -1): Promise<void> {
		const player = this.getActivePlayer(view);
		if (!player?.handle) {
			return;
		}

		const playbackRates = await player.handle.getAvailablePlaybackRates();
		const currentRate = await player.handle.getPlaybackRate();
		if (currentRate === null || playbackRates.length === 0) {
			return;
		}

		const currentRateIndex = Math.max(0, playbackRates.indexOf(currentRate));
		const nextRateIndex = Math.min(playbackRates.length - 1, Math.max(0, currentRateIndex + direction));
		const nextRate = playbackRates[nextRateIndex];
		player.handle.setPlaybackRate(nextRate);
		player.handle.showAction({ type: "setSpeed", speed: nextRate });
	}

	private annotateActiveTranscript(selection: AnnotationSelection, kind: AnnotationKind): void {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view) {
			new Notice("Open a media note before annotating transcript text.");
			return;
		}

		applyAnnotationToActiveNote(view.editor, selection, kind);
		this.renderPlayerInView(view, true);
	}
}

function mediaLinkFromFrontmatter(frontmatter: Record<string, unknown> | undefined): string | null {
	const mediaLink = frontmatter?.media_link ?? frontmatter?.media;
	return typeof mediaLink === "string" ? mediaLink : null;
}

function createPlayerId(): string {
	return `media-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
