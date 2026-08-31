/**
 * Format a total-seconds value as a compact clock string. Hours are
 * included only when non-zero, so 75 -> "1:15" and 3930 -> "1:05:30".
 */
export const formatDuration = (totalSeconds) => {
  const total = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const ss = String(seconds).padStart(2, "0");
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${ss}`;
  }
  return `${minutes}:${ss}`;
};