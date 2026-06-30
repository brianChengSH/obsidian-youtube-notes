export function formatTimestamp(timestamp: number | undefined): string {
	if (timestamp === undefined || Number.isNaN(timestamp)) {
		return "";
	}

	const totalSeconds = Math.max(0, Math.floor(timestamp));
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds - hours * 3600) / 60);
	const seconds = totalSeconds - hours * 3600 - minutes * 60;
	const formattedSeconds = seconds < 10 ? `0${seconds}` : `${seconds}`;
	const formattedMinutes = minutes < 10 ? `0${minutes}` : `${minutes}`;

	return `${hours > 0 ? `${hours}:` : ""}${formattedMinutes}:${formattedSeconds}`;
}

export function parseTimestamp(timestamp: string): number | null {
	const parts = timestamp.split(":").map((part) => Number(part));
	if (parts.some((part) => Number.isNaN(part)) || parts.length < 1 || parts.length > 3) {
		return null;
	}

	if (parts.length === 3) {
		return parts[0] * 3600 + parts[1] * 60 + parts[2];
	}

	if (parts.length === 2) {
		return parts[0] * 60 + parts[1];
	}

	return parts[0];
}

export function parseYouTubeTime(value: string | null): number {
	if (!value) {
		return 0;
	}

	if (/^\d+$/.test(value)) {
		return Number(value);
	}

	const hoursMatch = value.match(/(\d+)h/);
	const minutesMatch = value.match(/(\d+)m/);
	const secondsMatch = value.match(/(\d+)s/);
	const hours = hoursMatch ? Number(hoursMatch[1]) : 0;
	const minutes = minutesMatch ? Number(minutesMatch[1]) : 0;
	const seconds = secondsMatch ? Number(secondsMatch[1]) : 0;

	return hours * 3600 + minutes * 60 + seconds;
}
