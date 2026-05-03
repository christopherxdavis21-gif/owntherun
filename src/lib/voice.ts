/**
 * Tiny wrapper around the browser SpeechSynthesis API for run audio cues.
 * Plays through whatever audio device is connected (incl. Bluetooth headphones).
 *
 * Persists the user's mute preference in localStorage so it survives reloads.
 */

const MUTE_KEY = "catchup:voice-muted";

export function isVoiceMuted(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage?.getItem(MUTE_KEY) === "1";
}

export function setVoiceMuted(muted: boolean) {
  if (typeof window === "undefined") return;
  window.localStorage?.setItem(MUTE_KEY, muted ? "1" : "0");
  if (muted) cancelSpeech();
}

export function isVoiceSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function speak(
  text: string,
  opts: { priority?: "normal" | "high"; rate?: number } = {},
) {
  if (!isVoiceSupported() || isVoiceMuted() || !text) return;
  try {
    const synth = window.speechSynthesis;
    if (opts.priority === "high") synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = opts.rate ?? 1;
    u.pitch = 1;
    u.volume = 1;
    u.lang = "en-US";
    synth.speak(u);
  } catch {
    /* ignore */
  }
}

export function cancelSpeech() {
  if (!isVoiceSupported()) return;
  try {
    window.speechSynthesis.cancel();
  } catch {
    /* ignore */
  }
}

/**
 * iOS/Safari requires speechSynthesis to be "primed" by a user gesture before
 * subsequent programmatic calls work. Call this from a click/tap handler.
 */
export function primeVoice() {
  if (!isVoiceSupported() || isVoiceMuted()) return;
  try {
    const u = new SpeechSynthesisUtterance(" ");
    u.volume = 0;
    window.speechSynthesis.speak(u);
  } catch {
    /* ignore */
  }
}
