/**
 * Studio-Grade Web Audio DSP & Acoustic Engine
 * 
 * Pipeline:
 * input
 *   │
 *   ▼
 * [Acoustic Equalizer Bank: Low-Shelf + Mid-Peak + High-Shelf]
 *   │
 *   ├─── Direct Path (when pitch == 1.0) ────────┐
 *   │                                            │
 *   └─── [4-OLA Granular Pitch Shifter Engine] ──┴──> [Spatial Reverb Convolver & Mixer] ──> output
 *        (when pitch != 1.0)
 */

function generateImpulseResponse(audioContext, duration = 1.8, decay = 2.4) {
  const sampleRate = audioContext.sampleRate;
  const length = Math.round(sampleRate * duration);
  const impulse = audioContext.createBuffer(2, length, sampleRate);
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

export function createPitchShifter(audioContext) {
  const sampleRate = audioContext.sampleRate;

  // Master Busses
  const input = audioContext.createGain();
  const output = audioContext.createGain();

  // 1. Equalizer Bank
  const bassShelf = audioContext.createBiquadFilter();
  bassShelf.type = "lowshelf";
  bassShelf.frequency.value = 120; // Deep sub-bass
  bassShelf.gain.value = 0;

  const midPeak = audioContext.createBiquadFilter();
  midPeak.type = "peaking";
  midPeak.frequency.value = 2400; // Vocal presence
  midPeak.Q.value = 1.0;
  midPeak.gain.value = 0;

  const trebleShelf = audioContext.createBiquadFilter();
  trebleShelf.type = "highshelf";
  trebleShelf.frequency.value = 6000; // Air & brilliance
  trebleShelf.gain.value = 0;

  input.connect(bassShelf);
  bassShelf.connect(midPeak);
  midPeak.connect(trebleShelf);

  // 2. Pitch Shifter / Clean Crossfader
  const cleanPath = audioContext.createGain();
  const pitchPath = audioContext.createGain();
  cleanPath.gain.value = 1.0;
  pitchPath.gain.value = 0.0;

  trebleShelf.connect(cleanPath);

  // 3. 4-Phase Overlap-Add Granular Engine
  const antiCombFilter = audioContext.createBiquadFilter();
  antiCombFilter.type = "lowpass";
  antiCombFilter.frequency.value = 18000;
  antiCombFilter.Q.value = 0.707;

  trebleShelf.connect(antiCombFilter);

  const NUM_GRAINS = 4;
  const BASE_GRAIN_TIME = 0.080; // 80ms optimized for clear vocal & bass response without phase distortion
  const grainSamples = Math.round(BASE_GRAIN_TIME * sampleRate);

  // Hanning window fade buffer for seamless overlap-add crossfading
  const fadeBuffer = audioContext.createBuffer(1, grainSamples, sampleRate);
  const fadeData = fadeBuffer.getChannelData(0);
  for (let i = 0; i < grainSamples; i++) {
    fadeData[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / grainSamples));
  }

  // Pitch-down delay buffer: delay increases from 0 to BASE_GRAIN_TIME
  const delayDownBuffer = audioContext.createBuffer(1, grainSamples, sampleRate);
  const downData = delayDownBuffer.getChannelData(0);
  for (let i = 0; i < grainSamples; i++) {
    downData[i] = (i / grainSamples) * BASE_GRAIN_TIME;
  }

  // Pitch-up delay buffer: delay decreases from BASE_GRAIN_TIME down to 0
  const delayUpBuffer = audioContext.createBuffer(1, grainSamples, sampleRate);
  const upData = delayUpBuffer.getChannelData(0);
  for (let i = 0; i < grainSamples; i++) {
    upData[i] = (1 - i / grainSamples) * BASE_GRAIN_TIME;
  }

  const delayNodes = [];
  const grainGains = [];
  const delayLFOs = [];
  const fadeLFOs = [];

  for (let i = 0; i < NUM_GRAINS; i++) {
    const delay = audioContext.createDelay(1.0);
    const gain = audioContext.createGain();

    delay.delayTime.value = 0;
    gain.gain.value = 0;

    antiCombFilter.connect(delay);
    delay.connect(gain);
    gain.connect(pitchPath);

    delayNodes.push(delay);
    grainGains.push(gain);
  }

  let isPitchEngineStarted = false;

  function startPitchEngine() {
    if (isPitchEngineStarted) return;
    try {
      const now = audioContext.currentTime;
      const phaseOffset = BASE_GRAIN_TIME / NUM_GRAINS;

      for (let i = 0; i < NUM_GRAINS; i++) {
        const dLFO = audioContext.createBufferSource();
        dLFO.buffer = delayDownBuffer;
        dLFO.loop = true;

        const fLFO = audioContext.createBufferSource();
        fLFO.buffer = fadeBuffer;
        fLFO.loop = true;

        dLFO.connect(delayNodes[i].delayTime);
        fLFO.connect(grainGains[i].gain);

        const offsetTime = i * phaseOffset;
        dLFO.start(now, offsetTime);
        fLFO.start(now, offsetTime);

        delayLFOs.push(dLFO);
        fadeLFOs.push(fLFO);
      }

      isPitchEngineStarted = true;
    } catch (err) {
      console.warn("Pitch engine start notice:", err);
    }
  }

  // 4. Spatial Reverb & Ambience Mixer
  const reverbConvolver = audioContext.createConvolver();
  try {
    reverbConvolver.buffer = generateImpulseResponse(audioContext, 2.0, 2.2);
  } catch {}

  const postPitchBus = audioContext.createGain();
  cleanPath.connect(postPitchBus);
  pitchPath.connect(postPitchBus);

  const reverbDry = audioContext.createGain();
  const reverbWet = audioContext.createGain();
  reverbDry.gain.value = 1.0;
  reverbWet.gain.value = 0.0;

  postPitchBus.connect(reverbDry);
  postPitchBus.connect(reverbConvolver);
  reverbConvolver.connect(reverbWet);

  reverbDry.connect(output);
  reverbWet.connect(output);

  let currentPitch = 1.0;
  let currentReverb = 0.0;
  let currentEffect = "clean";

  function setPitch(pitchMultiplier) {
    const pitch = Math.max(0.25, Math.min(4.0, pitchMultiplier || 1.0));
    currentPitch = pitch;
    const now = audioContext.currentTime;

    const isNormalKey = Math.abs(pitch - 1.0) < 0.005;

    if (isNormalKey) {
      // Direct clean path (zero delay processing)
      cleanPath.gain.setTargetAtTime(1.0, now, 0.02);
      pitchPath.gain.setTargetAtTime(0.0, now, 0.02);
      return;
    }

    if (!isPitchEngineStarted) {
      startPitchEngine();
    }

    // Granular pitch shift path
    cleanPath.gain.setTargetAtTime(0.0, now, 0.02);
    pitchPath.gain.setTargetAtTime(1.0, now, 0.02);

    const speed = pitch - 1.0;
    const lfoRate = Math.max(0.01, Math.abs(speed));
    const isPitchUp = speed >= 0;

    for (let i = 0; i < NUM_GRAINS; i++) {
      if (delayLFOs[i]) {
        // Swap buffer cleanly if direction changed:
        if (isPitchUp && delayLFOs[i].buffer !== delayUpBuffer) {
          delayLFOs[i].buffer = delayUpBuffer;
        } else if (!isPitchUp && delayLFOs[i].buffer !== delayDownBuffer) {
          delayLFOs[i].buffer = delayDownBuffer;
        }
        delayLFOs[i].playbackRate.setTargetAtTime(lfoRate, now, 0.02);
        fadeLFOs[i].playbackRate.setTargetAtTime(lfoRate, now, 0.02);
      }
    }
  }

  function setReverb(amount) {
    const amt = Math.max(0, Math.min(1.0, amount || 0));
    currentReverb = amt;
    const now = audioContext.currentTime;

    reverbWet.gain.setTargetAtTime(amt * 0.85, now, 0.03);
    reverbDry.gain.setTargetAtTime(1.0 - amt * 0.3, now, 0.03);
  }

  function setEffectPreset(presetName) {
    currentEffect = presetName || "clean";
    const now = audioContext.currentTime;

    switch (presetName) {
      case "slowed_reverb":
        setReverb(0.45);
        bassShelf.gain.setTargetAtTime(5.5, now, 0.03);
        midPeak.gain.setTargetAtTime(-1.0, now, 0.03);
        trebleShelf.gain.setTargetAtTime(-2.5, now, 0.03);
        break;

      case "nightcore":
        setReverb(0.12);
        bassShelf.gain.setTargetAtTime(1.5, now, 0.03);
        midPeak.gain.setTargetAtTime(2.0, now, 0.03);
        trebleShelf.gain.setTargetAtTime(4.0, now, 0.03);
        break;

      case "concert":
        setReverb(0.58);
        bassShelf.gain.setTargetAtTime(3.0, now, 0.03);
        midPeak.gain.setTargetAtTime(1.5, now, 0.03);
        trebleShelf.gain.setTargetAtTime(2.0, now, 0.03);
        break;

      case "bass_boost":
        setReverb(0.0);
        bassShelf.gain.setTargetAtTime(8.5, now, 0.03); // +8.5 dB Punchy Sub-Bass!
        midPeak.gain.setTargetAtTime(0.0, now, 0.03);
        trebleShelf.gain.setTargetAtTime(0.5, now, 0.03);
        break;

      case "vocal":
        setReverb(0.12);
        bassShelf.gain.setTargetAtTime(-2.5, now, 0.03);
        midPeak.gain.setTargetAtTime(4.5, now, 0.03); // +4.5 dB Vocal Clarity!
        trebleShelf.gain.setTargetAtTime(3.5, now, 0.03);
        break;

      case "clean":
      default:
        setReverb(0.0);
        bassShelf.gain.setTargetAtTime(0, now, 0.03);
        midPeak.gain.setTargetAtTime(0, now, 0.03);
        trebleShelf.gain.setTargetAtTime(0, now, 0.03);
        break;
    }
  }

  // Initialize defaults
  setEffectPreset("clean");
  setPitch(1.0);
  setReverb(0.0);

  return {
    input,
    output,
    setPitch,
    setReverb,
    setEffectPreset,
    get pitch() {
      return currentPitch;
    },
    get reverb() {
      return currentReverb;
    },
    get effect() {
      return currentEffect;
    },
  };
}
