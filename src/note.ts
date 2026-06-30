import { Editor, getLanguage, MarkdownView, Notice } from "obsidian";
import { applyTranscriptAnnotation } from "./annotation";
import { fetchTranscriptForVideo, normalizeYouTubeUrl } from "./youtube";
import { serializeTranscriptBlock, upsertFrontmatterValues, upsertTranscriptBlock } from "./transcript-block";
import type { AnnotationKind, AnnotationSelection, MediaNotesPluginSettings } from "./types";

export async function createOrUpdateMediaNote(
	view: MarkdownView,
	settings: MediaNotesPluginSettings,
	url: string
): Promise<string | null> {
	const normalized = normalizeYouTubeUrl(url);
	if (!normalized) {
		new Notice("Enter a valid YouTube URL.");
		return null;
	}

	const editor = view.editor;
	const contentWithFrontmatter = upsertFrontmatterValues(editor.getValue(), {
		media_link: normalized.url,
		media_notes_video_id: normalized.videoId,
	});
	editor.setValue(contentWithFrontmatter);

	const languagePreferences = [
		...settings.preferredTranscriptLanguages,
		getLanguage(),
		"en",
	].filter((language, index, languages) => language.length > 0 && languages.indexOf(language) === index);

	try {
		const { cues, track } = await fetchTranscriptForVideo(normalized.url, languagePreferences);
		const block = serializeTranscriptBlock(
			normalized.videoId,
			normalized.url,
			settings.transcriptHeading,
			cues
		);
		editor.setValue(upsertTranscriptBlock(editor.getValue(), block));
		new Notice(`Transcript added (${track.languageCode}).`);
		return normalized.videoId;
	} catch (error) {
		const message = error instanceof Error ? error.message : "Transcript could not be loaded.";
		new Notice(message);
		return normalized.videoId;
	}
}

export function applyAnnotationToActiveNote(
	editor: Editor,
	selection: AnnotationSelection,
	kind: AnnotationKind
): void {
	const nextContent = applyTranscriptAnnotation(editor.getValue(), selection, kind);
	if (nextContent === editor.getValue()) {
		new Notice("Select transcript text first.");
		return;
	}

	editor.setValue(nextContent);
}
