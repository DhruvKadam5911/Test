/**
 * Audio FX Engine for Onion Music
 * 
 * Clean, single-source-of-truth audio effects architecture:
 * 1. Single audio graph instance (never recreated on re-renders).
 * 2. Unbroken HTML5 <audio> playbackRate & preservesPitch coordination.
 * 3. Studio-grade equalizer & spatial reverb DSP.
 */

export const FX_RATE_MIN = 0.5;
export const FX_RATE_MAX = 2.0;
export const FX_RATE_STEP = 0.05;

export const YT_ALLOWED_RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

export const DEFAULT_FX = {
  tempo: 1.0,
  pitch: 1.0,
  unhook: false,
  reverb: 0.0,
  preset: "studio",
};

export const FX_PRESETS = [
  { id: "studio", label: "Studio", tempo: 1.0, pitch: 1.0, reverb: 0.0, unhook: false },
  { id: "slowed_reverb", label: "🌙 Slowed", tempo: 0.88, pitch: Math.pow(2, -2.5 / 12), reverb: 0.45, unhook: true },
  { id: "nightcore", label: "⚡ Nightcore", tempo: 1.15, pitch: Math.pow(2, 3.5 / 12), reverb: 0.12, unhook: true },
  { id: "concert", label: "🏟️ 8D Hall", tempo: 1.0, pitch: 1.0, reverb: 0.55, unhook: false },
  { id: "bass_boost", label: "🔊 Bass", tempo: 1.0, pitch: 1.0, reverb: 0.0, unhook: false },
  { id: "vocal", label: "🎤 Vocal", tempo: 1.0, pitch: 1.0, reverb: 0.15, unhook: false },
];

export function clampFXRate(v) {
  const num = Number(v);
  if (!Number.isFinite(num)) return 1.0;
  return Math.min(FX_RATE_MAX, Math.max(FX_RATE_MIN, Math.round(num * 100) / 100));
}

export function semitonesFromPitch(pitch) {
  const semitones = Math.round(12 * Math.log2(pitch || 1.0));
  if (semitones > 0) return `+${semitones} st`;
  if (semitones < 0) return `${semitones} st`;
  return "0 st (Key)";
}

export function nearestYTRate(value) {
  const num = Number(value) || 1.0;
  return YT_ALLOWED_RATES.reduce((best, r) =>
    Math.abs(r - num) < Math.abs(best - num) ? r : best,
    YT_ALLOWED_RATES[0]
  );
}

function generateImpulseResponse(ctx, duration = 1.8, decay = 2.4) {
  const sampleRate = ctx.sampleRate;
  const length = Math.round(sampleRate * duration);
  const impulse = ctx.createBuffer(2, length, sampleRate);
  const left = impulse.getChannelData(0);
  const right = impulse.getChannelData(1);

  for (let i = 0; i < length; i++) {
    const t = i / sampleRate;
    const envelope = Math.exp(-t * decay);
    left[i] = (Math.random() * 2 - 1) * envelope;
    right[i] = (Math.random() * 2 - 1) * envelope;
  }
  return impulse;
}

// Module-level Singleton Audio Graph
let audioCtx = null;
let sourceNode = null;
let currentMediaEl = null;
let bassFilter = null;
let midFilter = null;
let trebleFilter = null;
let reverbNode = null;
let reverbDry = null;
let reverbWet = null;

function ensureAudioGraph(el) {
  if (typeof window === "undefined" || !el) return;

  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    audioCtx = new AudioContextClass();
  }

  if (audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }

  if (currentMediaEl !== el) {
    currentMediaEl = el;
    try {
      if (!el._fxSourceNode) {
        sourceNode = audioCtx.createMediaElementSource(el);
        el._fxSourceNode = sourceNode;
      } else {
        sourceNode = el._fxSourceNode;
      }

      if (!bassFilter) {
        bassFilter = audioCtx.createBiquadFilter();
        bassFilter.type = "lowshelf";
        bassFilter.frequency.value = 120;
        bassFilter.gain.value = 0;

        midFilter = audioCtx.createBiquadFilter();
        midFilter.type = "peaking";
        midFilter.frequency.value = 2400;
        midFilter.Q.value = 1.0;
        midFilter.gain.value = 0;

        trebleFilter = audioCtx.createBiquadFilter();
        trebleFilter.type = "highshelf";
        trebleFilter.frequency.value = 6000;
        trebleFilter.gain.value = 0;

        const postFilter = audioCtx.createGain();
        bassFilter.connect(midFilter);
        midFilter.connect(trebleFilter);
        trebleFilter.connect(postFilter);

        reverbNode = audioCtx.createConvolver();
        try {
          reverbNode.buffer = generateImpulseResponse(audioCtx, 1.8, 2.2);
        } catch {}

        reverbDry = audioCtx.createGain();
        reverbWet = audioCtx.createGain();
        reverbDry.gain.value = 1.0;
        reverbWet.gain.value = 0.0;

        postFilter.connect(reverbDry);
        postFilter.connect(reverbNode);
        reverbNode.connect(reverbWet);

        reverbDry.connect(audioCtx.destination);
        reverbWet.connect(audioCtx.destination);
      }

      try {
        sourceNode.disconnect();
      } catch {}
      sourceNode.connect(bassFilter);
    } catch (err) {
      console.warn("AudioFX node init notice:", err.message);
    }
  }
}

/**
 * Apply the full sound FX state to HTML5 <audio> and YouTube engines.
 */
export function applySoundFX(mediaEl, ytPlayer, fx) {
  try {
    const tempo = clampFXRate(fx?.tempo ?? 1.0);
    const pitch = clampFXRate(fx?.pitch ?? 1.0);
    const unhook = Boolean(fx?.unhook);
    const reverb = Math.max(0, Math.min(1, Number(fx?.reverb) || 0));
    const preset = fx?.preset || "studio";

    // 1. Apply to HTML5 Media Element
    if (mediaEl) {
      try {
        const activePlaybackRate = unhook
          ? (Math.abs(tempo - 1.0) >= 0.005 && Math.abs(pitch - 1.0) < 0.005 ? tempo : pitch)
          : pitch;

        const shouldPreservePitch = unhook && Math.abs(pitch - 1.0) < 0.005 && Math.abs(tempo - 1.0) >= 0.005;

        mediaEl.preservesPitch = shouldPreservePitch;
        if ("mozPreservesPitch" in mediaEl) mediaEl.mozPreservesPitch = shouldPreservePitch;
        if ("webkitPreservesPitch" in mediaEl) mediaEl.webkitPreservesPitch = shouldPreservePitch;

        mediaEl.playbackRate = activePlaybackRate;
        mediaEl.defaultPlaybackRate = activePlaybackRate;

        // Lazy-init DSP graph when presets or reverb are used
        if (reverb > 0 || preset !== "studio") {
          ensureAudioGraph(mediaEl);
          if (audioCtx) {
            const now = audioCtx.currentTime;
            if (reverbWet && reverbDry) {
              reverbWet.gain.setTargetAtTime(reverb * 0.85, now, 0.03);
              reverbDry.gain.setTargetAtTime(1.0 - reverb * 0.3, now, 0.03);
            }

            if (bassFilter && midFilter && trebleFilter) {
              switch (preset) {
                case "slowed_reverb":
                  bassFilter.gain.setTargetAtTime(6.0, now, 0.03);
                  midFilter.gain.setTargetAtTime(-1.0, now, 0.03);
                  trebleFilter.gain.setTargetAtTime(-3.0, now, 0.03);
                  break;
                case "nightcore":
                  bassFilter.gain.setTargetAtTime(1.5, now, 0.03);
                  midFilter.gain.setTargetAtTime(2.5, now, 0.03);
                  trebleFilter.gain.setTargetAtTime(4.5, now, 0.03);
                  break;
                case "concert":
                  bassFilter.gain.setTargetAtTime(3.0, now, 0.03);
                  midFilter.gain.setTargetAtTime(1.5, now, 0.03);
                  trebleFilter.gain.setTargetAtTime(2.0, now, 0.03);
                  break;
                case "bass_boost":
                  bassFilter.gain.setTargetAtTime(9.0, now, 0.03);
                  midFilter.gain.setTargetAtTime(0.0, now, 0.03);
                  trebleFilter.gain.setTargetAtTime(0.5, now, 0.03);
                  break;
                case "vocal":
                  bassFilter.gain.setTargetAtTime(-2.5, now, 0.03);
                  midFilter.gain.setTargetAtTime(5.0, now, 0.03);
                  trebleFilter.gain.setTargetAtTime(3.5, now, 0.03);
                  break;
                default:
                  bassFilter.gain.setTargetAtTime(0, now, 0.03);
                  midFilter.gain.setTargetAtTime(0, now, 0.03);
                  trebleFilter.gain.setTargetAtTime(0, now, 0.03);
                  break;
              }
            }
          }
        }
      } catch (err) {
        console.warn("applySoundFX media error:", err);
      }
    }

    // 2. Apply to YouTube Player Engine
    if (ytPlayer && typeof ytPlayer.setPlaybackRate === "function") {
      try {
        const applied = nearestYTRate(tempo);
        ytPlayer.setPlaybackRate(applied);
      } catch {}
    }
  } catch (err) {
    console.warn("applySoundFX overall error:", err);
  }
}

export function resumeAudioFXContext() {
  try {
    if (audioCtx && audioCtx.state === "suspended") {
      audioCtx.resume().catch(() => {});
    }
  } catch {}
}
