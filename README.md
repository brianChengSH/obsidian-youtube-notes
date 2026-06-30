# Media Notes

Take timestamped notes with synced YouTube transcripts.

Media Notes turns the active Markdown file into a media note from a YouTube URL. It embeds the player above the note, loads the public transcript when available, keeps the transcript panel synced to playback, and lets you mark selected transcript text as bold or highlighted.

## Create or update a media note

Run the command `Create or update media note` while a Markdown note is open, then paste a YouTube URL.

The command updates the active note frontmatter:

```yaml
---
media_link: "https://www.youtube.com/watch?v=MFXWY8TqSWw"
media_notes_video_id: "MFXWY8TqSWw"
---
```

If the video has a public transcript, the command also inserts or replaces the managed transcript block:

```md
## Transcript
<!-- media-notes:transcript:start videoId=MFXWY8TqSWw source=youtube -->
- [00:12](https://www.youtube.com/watch?v=MFXWY8TqSWw&t=12s) Caption text
<!-- media-notes:transcript:end -->
```

If no public transcript is available, the note metadata is still updated and the plugin shows an error notice.

## Player and transcript

Media notes show an embedded YouTube player above the editor. Playback controls are available as commands, so you can assign your own hotkeys in the app settings:

- `Insert timestamp`
- `Play or pause`
- `Fast forward`
- `Rewind`
- `Speed up`
- `Slow down`
- `Toggle horizontal or vertical split`

The transcript panel scrolls to the active caption while the video plays. Pause the video, select transcript text, then use `Bold` or `Highlight` in the transcript toolbar to write Markdown formatting back into the note.

## Settings

Settings include seek duration, timestamp template and offset, default split layout, transcript language preferences, transcript heading, and transcript auto-scroll.

Transcript language selection prioritizes configured languages, then the app language, then English, then the first available caption track. Manual captions are preferred over auto-generated captions when the language score is the same.

## Bookmarklet

The legacy bookmarklet is still available for browser-based note creation, but transcript creation now happens through the in-app `Create or update media note` command.
