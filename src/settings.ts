import { App, PluginSettingTab, Setting } from "obsidian";
import type MediaNotesPlugin from "./main";
import type { MediaNotesPluginSettings } from "./types";

export const DEFAULT_SETTINGS: MediaNotesPluginSettings = {
	seekSeconds: 10,
	defaultSplitMode: "Horizontal",
	pauseOnTimestampInsert: false,
	displayProgressBar: true,
	displayTimestamp: true,
	timestampOffsetSeconds: 6,
	timestampTemplate: "[{ts}]({link})\n",
	preferredTranscriptLanguages: [],
	autoScrollTranscript: true,
	transcriptHeading: "Transcript",
	mediaData: {},
};

export class MediaNotesSettingTab extends PluginSettingTab {
	plugin: MediaNotesPlugin;

	constructor(app: App, plugin: MediaNotesPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.addClass("media-notes-settings");

		new Setting(containerEl).setName("Playback").setHeading();

		new Setting(containerEl)
			.setName("Default split view")
			.setDesc("Choose the player layout used when a media note opens.")
			.addDropdown((dropdown) => {
				dropdown
					.addOptions({
						Horizontal: "Horizontal",
						Vertical: "Vertical",
					})
					.setValue(this.plugin.settings.defaultSplitMode)
					.onChange((value) => {
						this.plugin.settings.defaultSplitMode = value === "Vertical" ? "Vertical" : "Horizontal";
						void this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("Rewind and fast forward seconds")
			.setDesc("Number of seconds to move when using seek commands.")
			.addSlider((slider) => {
				slider
					.setLimits(1, 60, 1)
					.setValue(this.plugin.settings.seekSeconds)
					.onChange((value) => {
						this.plugin.settings.seekSeconds = value;
						void this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("Pause media when inserting timestamp")
			.setDesc("Pause playback after the timestamp command inserts text.")
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.pauseOnTimestampInsert)
					.onChange((value) => {
						this.plugin.settings.pauseOnTimestampInsert = value;
						void this.plugin.saveSettings();
					});
			});

		new Setting(containerEl).setName("Timestamps").setHeading();

		new Setting(containerEl)
			.setName("Timestamp offset seconds")
			.setDesc("Number of seconds to subtract when inserting a timestamp.")
			.addSlider((slider) => {
				slider
					.setLimits(0, 60, 1)
					.setValue(this.plugin.settings.timestampOffsetSeconds)
					.onChange((value) => {
						this.plugin.settings.timestampOffsetSeconds = value;
						void this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("Timestamp template")
			.setDesc("Markdown template. Use {ts}, {link}, and \\n for a new line.")
			.addText((text) => {
				text
					.setValue(this.plugin.settings.timestampTemplate)
					.onChange((value) => {
						this.plugin.settings.timestampTemplate = value;
						void this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("Show progress bar")
			.setDesc("Display elapsed playback progress below the video.")
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.displayProgressBar)
					.onChange((value) => {
						this.plugin.settings.displayProgressBar = value;
						void this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("Always display current timestamp")
			.setDesc("Keep the current player timestamp visible while playing.")
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.displayTimestamp)
					.onChange((value) => {
						this.plugin.settings.displayTimestamp = value;
						void this.plugin.saveSettings();
					});
			});

		new Setting(containerEl).setName("Transcript").setHeading();

		new Setting(containerEl)
			.setName("Preferred transcript languages")
			.setDesc("Comma-separated language codes, such as en or zh.")
			.addText((text) => {
				text
					.setPlaceholder("Enter language codes")
					.setValue(this.plugin.settings.preferredTranscriptLanguages.join(", "))
					.onChange((value) => {
						this.plugin.settings.preferredTranscriptLanguages = value
							.split(",")
							.map((part) => part.trim())
							.filter((part) => part.length > 0);
						void this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("Transcript heading")
			.setDesc("Heading inserted before the managed transcript block.")
			.addText((text) => {
				text
					.setValue(this.plugin.settings.transcriptHeading)
					.onChange((value) => {
						this.plugin.settings.transcriptHeading = value.trim() || DEFAULT_SETTINGS.transcriptHeading;
						void this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("Auto-scroll transcript")
			.setDesc("Scroll the transcript panel to the active caption during playback.")
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.autoScrollTranscript)
					.onChange((value) => {
						this.plugin.settings.autoScrollTranscript = value;
						void this.plugin.saveSettings();
					});
			});
	}
}
