import { App, Modal, Setting } from "obsidian";

export class UrlPromptModal extends Modal {
	private readonly onSubmit: (url: string) => void;

	constructor(app: App, onSubmit: (url: string) => void) {
		super(app);
		this.onSubmit = onSubmit;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("media-notes-url-modal");

		contentEl.createEl("h2", { text: "Create or update media note" });

		let value = "";
		const input = contentEl.createEl("input", {
			attr: {
				"aria-label": "YouTube URL",
				placeholder: "Paste a YouTube URL",
				type: "url",
			},
		});
		input.addClass("media-notes-url-input");
		input.focus();

		const submit = (): void => {
			const url = value.trim();
			if (!url) {
				return;
			}

			this.close();
			this.onSubmit(url);
		};

		input.addEventListener("input", () => {
			value = input.value;
		});
		input.addEventListener("keydown", (event) => {
			if (event.key === "Enter") {
				event.preventDefault();
				submit();
			}
		});

		new Setting(contentEl)
			.addButton((button) => {
				button
					.setButtonText("Create note")
					.setCta()
					.onClick(() => submit());
			});
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
