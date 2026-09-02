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
 *   └─── [Smooth Overlap-Add Pitch Shifter] ────┴──> [Spatial Reverb Convolver & Mixer] ──> output
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

  // Master Buses
  const input = audioContext.createGain();
  const output = audioContext.createGain();

  // 1. Equalizer Bank
  const bassShelf = audioContext.createBiquadFilter();
  bassShelf.type = "lowshelf";
  bassShelf.frequency.value = 110;
  bassShelf.gain.value = 0;

  const midPeak = audioContext.createBiquadFilter();
  midPeak.type = "peaking";
  midPeak.frequency.value = 2400;
  midPeak.Q.value = 1.0;
  midPeak.gain.value = 0;

  const trebleShelf = audioContext.createBiquadFilter();
  trebleShelf.type = "highshelf";
  trebleShelf.frequency.value = 6000;
  trebleShelf.gain.value = 0;

  input.connect(bassShelf);
  bassShelf.connect(midPeak);
  midPeak.connect(trebleShelf);

  // 2. Crossfader: Clean Direct Path vs Pitch-Shift Path
  const cleanPath = audioContext.createGain();
  const pitchPath = audioContext.createGain();
  cleanPath.gain.value = 1.0;
  pitchPath.gain.value = 0.0;

  trebleShelf.connect(cleanPath);

  // 3. Smooth Overlap-Add Pitch Shift Delay Engine
  const GRAIN_SIZE = 0.090; // 90ms optimal grain size for musical clarity
  const grainSamples = Math.round(GRAIN_SIZE * sampleRate);

  // Ramp modulation buffer (linear ramp from 0 to GRAIN_SIZE)
  const rampBuffer = audioContext.createBuffer(1, grainSamples, sampleRate);
  const rampData = rampBuffer.getChannelData(0);
  for (let i = 0; i < grainSamples; i++) {
    rampData[i] = (i / grainSamples) * GRAIN_SIZE;
  }

  // Triangular Window Buffer (anti-clicking crossfade)
  const windowBuffer = audioContext.createBuffer(1, grainSamples, sampleRate);
  const winData = windowBuffer.getChannelData(0);
  for (let i = 0; i < grainSamples; i++) {
    winData[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / grainSamples));
  }

  // Delay Tap 1
  const delay1 = audioContext.createDelay(1.0);
  const gain1 = audioContext.createGain();
  gain1.gain.value = 0;
  trebleShelf.connect(delay1);
  delay1.connect(gain1);
  gain1.connect(pitchPath);

  // Delay Tap 2
  const delay2 = audioContext.createDelay(1.0);
  const gain2 = audioContext.createGain();
  gain2.gain.value = 0;
  trebleShelf.connect(delay2);
  delay2.connect(gain2);
  gain2.connect(pitchPath);

  // LFO modulators
  const modGain1 = audioContext.createGain();
  const modGain2 = audioContext.createGain();
  modGain1.connect(delay1.delayTime);
  modGain2.connect(delay2.delayTime);

  let rampSource1 = null;
  let rampSource2 = null;
  let winSource1 = null;
  let winSource2 = null;
  let isPitchRunning = false;

  function startPitchEngine(pitch) {
    try {
      rampSource1?.stop();
      rampSource2?.stop();
      winSource1?.stop();
      winSource2?.stop();
    } catch {}

    const now = audioContext.currentTime;
    const speed = pitch - 1.0;
    const rate = Math.max(0.005, Math.abs(speed));
    const sign = speed >= 0 ? 1 : -1;

    modGain1.gain.setValueAtTime(sign * GRAIN_SIZE, now);
    modGain2.gain.setValueAtTime(sign * GRAIN_SIZE, now);

    rampSource1 = audioContext.createBufferSource();
    rampSource1.buffer = rampBuffer;
    rampSource1.loop = true;
    rampSource1.playbackRate.value = rate;

    rampSource2 = audioContext.createBufferSource();
    rampSource2.buffer = rampBuffer;
    rampSource2.loop = true;
    rampSource2.playbackRate.value = rate;

    winSource1 = audioContext.createBufferSource();
    winSource1.buffer = windowBuffer;
    winSource1.loop = true;
    winSource1.playbackRate.value = rate;

    winSource2 = audioContext.createBufferSource();
    winSource2.buffer = windowBuffer;
    winSource2.loop = true;
    winSource2.playbackRate.value = rate;

    rampSource1.connect(modGain1);
    rampSource2.connect(modGain2);
    winSource1.connect(gain1.gain);
    winSource2.connect(gain2.gain);

    const halfPeriod = (GRAIN_SIZE / rate) / 2;
    rampSource1.start(now);
    winSource1.start(now);
    rampSource2.start(now, halfPeriod);
    winSource2.start(now, halfPeriod);

    isPitchRunning = true;
  }

  // 4. Spatial Reverb & Ambience Mixer
  const reverbConvolver = audioContext.createConvolver();
  try {
    reverbConvolver.buffer = generateImpulseResponse(audioContext, 1.8, 2.2);
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
    const pitch = Math.max(0.4, Math.min(2.5, pitchMultiplier || 1.0));
    currentPitch = pitch;
    const now = audioContext.currentTime;

    const isNormal = Math.abs(pitch - 1.0) < 0.01;

    if (isNormal) {
      // Clean zero-latency bypass path
      cleanPath.gain.setTargetAtTime(1.0, now, 0.015);
      pitchPath.gain.setTargetAtTime(0.0, now, 0.015);
      return;
    }

    if (!isPitchRunning) {
      startPitchEngine(pitch);
    } else {
      const speed = pitch - 1.0;
      const rate = Math.max(0.005, Math.abs(speed));
      const sign = speed >= 0 ? 1 : -1;

      try {
        rampSource1.playbackRate.setTargetAtTime(rate, now, 0.015);
        rampSource2.playbackRate.setTargetAtTime(rate, now, 0.015);
        winSource1.playbackRate.setTargetAtTime(rate, now, 0.015);
        winSource2.playbackRate.setTargetAtTime(rate, now, 0.015);
        modGain1.gain.setTargetAtTime(sign * GRAIN_SIZE, now, 0.015);
        modGain2.gain.setTargetAtTime(sign * GRAIN_SIZE, now, 0.015);
      } catch {
        startPitchEngine(pitch);
      }
    }

    cleanPath.gain.setTargetAtTime(0.0, now, 0.015);
    pitchPath.gain.setTargetAtTime(1.0, now, 0.015);
  }

  function setReverb(amount) {
    const amt = Math.max(0, Math.min(1.0, amount || 0));
    currentReverb = amt;
    const now = audioContext.currentTime;

    reverbWet.gain.setTargetAtTime(amt * 0.8, now, 0.03);
    reverbDry.gain.setTargetAtTime(1.0 - amt * 0.25, now, 0.03);
  }

  function setEffectPreset(presetName) {
    currentEffect = presetName || "clean";
    const now = audioContext.currentTime;

    switch (presetName) {
      case "slowed_reverb":
        setReverb(0.42);
        bassShelf.gain.setTargetAtTime(5.0, now, 0.03);
        midPeak.gain.setTargetAtTime(-1.0, now, 0.03);
        trebleShelf.gain.setTargetAtTime(-2.5, now, 0.03);
        break;

      case "nightcore":
        setReverb(0.10);
        bassShelf.gain.setTargetAtTime(1.5, now, 0.03);
        midPeak.gain.setTargetAtTime(2.0, now, 0.03);
        trebleShelf.gain.setTargetAtTime(3.5, now, 0.03);
        break;

      case "concert":
        setReverb(0.55);
        bassShelf.gain.setTargetAtTime(3.0, now, 0.03);
        midPeak.gain.setTargetAtTime(1.5, now, 0.03);
        trebleShelf.gain.setTargetAtTime(2.0, now, 0.03);
        break;

      case "bass_boost":
        setReverb(0.0);
        bassShelf.gain.setTargetAtTime(8.0, now, 0.03);
        midPeak.gain.setTargetAtTime(0.0, now, 0.03);
        trebleShelf.gain.setTargetAtTime(0.5, now, 0.03);
        break;

      case "vocal":
        setReverb(0.10);
        bassShelf.gain.setTargetAtTime(-2.0, now, 0.03);
        midPeak.gain.setTargetAtTime(4.0, now, 0.03);
        trebleShelf.gain.setTargetAtTime(3.0, now, 0.03);
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

  // Initialize
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
