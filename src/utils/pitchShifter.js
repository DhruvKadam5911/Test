/**
 * Web Audio API Real-Time Pitch Shifter
 * Uses dual modulated delay lines with equal-power crossfading
 * to shift audio pitch seamlessly in real-time in the browser.
 */

export function createPitchShifter(audioContext) {
  const bufferTime = 0.100; // 100ms grain window
  const fadeTime = 0.050;   // 50ms crossfade

  // Input & Output gain nodes
  const input = audioContext.createGain();
  const output = audioContext.createGain();

  // Modulated Delay Nodes
  const delay1 = audioContext.createDelay(1.0);
  const delay2 = audioContext.createDelay(1.0);

  // Crossfade Gain Nodes
  const gain1 = audioContext.createGain();
  const gain2 = audioContext.createGain();

  // Create Modulation Buffers
  const sampleRate = audioContext.sampleRate;
  const length1 = Math.round(bufferTime * sampleRate);
  const length2 = Math.round((bufferTime - 2 * fadeTime) * sampleRate);
  const totalLength = length1 + length2;

  // 1. Sawtooth Delay Modulation Curve
  const delayBuffer = audioContext.createBuffer(1, totalLength, sampleRate);
  const delayData = delayBuffer.getChannelData(0);
  for (let i = 0; i < totalLength; i++) {
    delayData[i] = (i / totalLength) * bufferTime;
  }

  // 2. Windowed Fade Crossfade Curve
  const fadeBuffer = audioContext.createBuffer(1, totalLength, sampleRate);
  const fadeData = fadeBuffer.getChannelData(0);
  const fadeLen = Math.round(fadeTime * sampleRate);
  for (let i = 0; i < totalLength; i++) {
    if (i < fadeLen) {
      fadeData[i] = Math.sqrt(i / fadeLen);
    } else if (i < length1 - fadeLen) {
      fadeData[i] = 1;
    } else if (i < length1) {
      fadeData[i] = Math.sqrt((length1 - i) / fadeLen);
    } else {
      fadeData[i] = 0;
    }
  }

  // Modulation LFO Sources
  let delayLFO1 = null;
  let delayLFO2 = null;
  let fadeLFO1 = null;
  let fadeLFO2 = null;
  let isRunning = false;

  // Modulation Gain Nodes
  const modGain1 = audioContext.createGain();
  const modGain2 = audioContext.createGain();

  // Connect Audio Graph
  input.connect(delay1);
  input.connect(delay2);

  delay1.connect(gain1);
  delay2.connect(gain2);

  gain1.connect(output);
  gain2.connect(output);

  // Dry bypass gain for 1.0x pitch
  const dryGain = audioContext.createGain();
  dryGain.gain.value = 1.0;
  input.connect(dryGain);
  dryGain.connect(output);

  // Wet gain for pitch shifted signal
  const wetGain = audioContext.createGain();
  wetGain.gain.value = 0.0;
  gain1.disconnect(output);
  gain2.disconnect(output);
  gain1.connect(wetGain);
  gain2.connect(wetGain);
  wetGain.connect(output);

  function startLFOs() {
    if (isRunning) return;
    try {
      delayLFO1 = audioContext.createBufferSource();
      delayLFO1.buffer = delayBuffer;
      delayLFO1.loop = true;

      delayLFO2 = audioContext.createBufferSource();
      delayLFO2.buffer = delayBuffer;
      delayLFO2.loop = true;

      fadeLFO1 = audioContext.createBufferSource();
      fadeLFO1.buffer = fadeBuffer;
      fadeLFO1.loop = true;

      fadeLFO2 = audioContext.createBufferSource();
      fadeLFO2.buffer = fadeBuffer;
      fadeLFO2.loop = true;

      delayLFO1.connect(modGain1);
      modGain1.connect(delay1.delayTime);

      delayLFO2.connect(modGain2);
      modGain2.connect(delay2.delayTime);

      fadeLFO1.connect(gain1.gain);
      fadeLFO2.connect(gain2.gain);

      const now = audioContext.currentTime;
      delayLFO1.start(now);
      fadeLFO1.start(now);

      const halfPeriod = bufferTime;
      delayLFO2.start(now, halfPeriod);
      fadeLFO2.start(now, halfPeriod);

      isRunning = true;
    } catch (err) {
      console.warn("Failed to start PitchShifter LFOs:", err);
    }
  }

  function setPitch(pitchMultiplier) {
    const pitch = Math.max(0.25, Math.min(4.0, pitchMultiplier || 1.0));
    const isNormal = Math.abs(pitch - 1.0) < 0.01;

    if (isNormal) {
      // Direct dry bypass for 100% crystal clean uncolored original audio
      dryGain.gain.setValueAtTime(1.0, audioContext.currentTime);
      wetGain.gain.setValueAtTime(0.0, audioContext.currentTime);
      return;
    }

    if (!isRunning) {
      startLFOs();
    }

    // Crossfade to pitch-shifted wet signal
    dryGain.gain.setValueAtTime(0.0, audioContext.currentTime);
    wetGain.gain.setValueAtTime(1.0, audioContext.currentTime);

    const speed = pitch - 1.0;
    const lfoRate = Math.abs(speed);

    if (delayLFO1 && isRunning) {
      delayLFO1.playbackRate.setValueAtTime(lfoRate || 0.0001, audioContext.currentTime);
      delayLFO2.playbackRate.setValueAtTime(lfoRate || 0.0001, audioContext.currentTime);
      fadeLFO1.playbackRate.setValueAtTime(lfoRate || 0.0001, audioContext.currentTime);
      fadeLFO2.playbackRate.setValueAtTime(lfoRate || 0.0001, audioContext.currentTime);

      const modSign = speed >= 0 ? 1 : -1;
      modGain1.gain.setValueAtTime(modSign * bufferTime, audioContext.currentTime);
      modGain2.gain.setValueAtTime(modSign * bufferTime, audioContext.currentTime);
    }
  }

  return {
    input,
    output,
    setPitch,
  };
}
