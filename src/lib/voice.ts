/**
 * Tiny wrapper around the browser SpeechSynthesis API for run audio cues.
 * Plays through whatever audio device is connected (incl. Bluetooth headphones).
 *
 * Persists the user's mute preference in localStorage so it survives reloads.
 *
 * Picks the best-sounding available system voice (e.g. Samantha / Ava on iOS,
 * Google US English on Android, Microsoft Aria on Windows) instead of
 * whatever low-quality default the browser picks first.
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

// Ordered list of preferred voice names by platform. First match wins.
// These are the natural-sounding voices shipped with modern OSes.
const PREFERRED_VOICES = [
  // iOS 17+ exposes Siri voices directly when available
  "Siri Voice 1",
  "Siri Voice 2",
  "Siri Voice 3",
  "Siri Voice 4",
  "Siri Female (en-US)",
  "Siri Male (en-US)",
  "Siri",
  // iOS / macOS — premium / enhanced voices that share the Siri TTS engine
  "Ava (Premium)",
  "Ava (Enhanced)",
  "Ava",
  "Zoe (Premium)",
  "Zoe (Enhanced)",
  "Evan (Premium)",
  "Evan (Enhanced)",
  "Nicky (Premium)",
  "Nicky (Enhanced)",
  "Samantha (Enhanced)",
  "Samantha",
  "Allison",
  "Susan",
  "Karen",
  "Moira",
  "Serena",
  "Daniel",
  // Android / Chrome
  "Google US English",
  "Google UK English Female",
  "Google UK English Male",
  // Windows
  "Microsoft Aria Online (Natural) - English (United States)",
  "Microsoft Jenny Online (Natural) - English (United States)",
  "Microsoft Zira - English (United States)",
];

let cachedVoice: SpeechSynthesisVoice | null = null;

function pickVoice(): SpeechSynthesisVoice | null {
  if (!isVoiceSupported()) return null;
  if (cachedVoice) return cachedVoice;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;

  // 1. Exact preference match
  for (const name of PREFERRED_VOICES) {
    const v = voices.find((x) => x.name === name);
    if (v) return (cachedVoice = v);
  }
  // 2. Any voice whose name suggests it's a high-quality / natural voice
  const natural = voices.find(
    (v) =>
      /en[-_]/i.test(v.lang) &&
      /(natural|enhanced|premium|neural|online)/i.test(v.name),
  );
  if (natural) return (cachedVoice = natural);
  // 3. Any English female-sounding default (usually clearer for cues)
  const female = voices.find(
    (v) => /en[-_]/i.test(v.lang) && /(female|samantha|karen|aria|jenny|zira|susan|allison)/i.test(v.name),
  );
  if (female) return (cachedVoice = female);
  // 4. Any en-US voice
  const enUs = voices.find((v) => /en[-_]US/i.test(v.lang));
  if (enUs) return (cachedVoice = enUs);
  // 5. First English voice
  const en = voices.find((v) => /^en/i.test(v.lang));
  return (cachedVoice = en ?? voices[0] ?? null);
}

// Voices load asynchronously in some browsers — refresh cache when ready.
if (typeof window !== "undefined" && "speechSynthesis" in window) {
  try {
    window.speechSynthesis.onvoiceschanged = () => {
      cachedVoice = null;
      pickVoice();
    };
  } catch {
    /* ignore */
  }
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
    const voice = pickVoice();
    if (voice) {
      u.voice = voice;
      u.lang = voice.lang;
    } else {
      u.lang = "en-US";
    }
    // Slightly slower + warmer than default = friendlier coach tone.
    u.rate = opts.rate ?? 0.95;
    u.pitch = 1.05;
    u.volume = 1;
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
    // Touch getVoices() inside the gesture so iOS populates the list.
    window.speechSynthesis.getVoices();
    pickVoice();
    const u = new SpeechSynthesisUtterance(" ");
    u.volume = 0;
    const voice = pickVoice();
    if (voice) u.voice = voice;
    window.speechSynthesis.speak(u);
  } catch {
    /* ignore */
  }
}
