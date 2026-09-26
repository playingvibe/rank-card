/** `"m:ss"`, or `"h:mm:ss"` past an hour; `"0:00"` for invalid input. Lavalink reports ms. */
export function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return "0:00";

  const totalSeconds = Math.floor(ms / 1000);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);

  const pad = (n) => String(n).padStart(2, "0");

  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

export function formatTotalDuration(tracks) {
  return formatDuration(tracks.reduce((total, track) => total + (track.length ?? 0), 0));
}

/** A total in two units at most (`"48m"`, `"3h 24m"`, `"9d 11h"`), where a clock would be unreadable. */
export function formatListeningSpan(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return "0m";

  const totalMinutes = Math.floor(ms / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  return `${minutes}m`;
}

/** Accepts `"m:ss"`, `"h:mm:ss"`, `"90s"` or `"90"`. Milliseconds, or `null` if none match. */
export function parseDuration(input) {
  const trimmed = input.trim();

  if (/^\d+:\d{1,2}(:\d{1,2})?$/.test(trimmed)) {
    const parts = trimmed.split(":").map(Number);
    const [hours, minutes, seconds] = parts.length === 3 ? parts : [0, ...parts];
    if (minutes >= 60 || seconds >= 60) return null;
    return (hours * 3600 + minutes * 60 + seconds) * 1000;
  }

  const secondsMatch = /^(\d+(?:\.\d+)?)s?$/.exec(trimmed);
  return secondsMatch ? Math.round(Number(secondsMatch[1]) * 1000) : null;
}
