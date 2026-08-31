/*
 * Soundtrack for the desktop construction intro.
 *
 * The beats are pinned to the visual stages in SplashConstruct.jsx: a tick as
 * each seed dot appears and again as they spread, a rising figure while the
 * outlines draw, and the chime on the moment the wireframe becomes solid. Keep
 * these offsets in step with the `T` table there.
 */

const SEED_TICKS = [0, 0.18, 0.32, 0.52]; // dots appearing, then spreading
const DRAW_AT = 1.12;
const SOLID_AT = 1.82;

export function playSound(ctx) {
  try {
    const t0 = ctx.currentTime + 0.05; // scheduler safety margin
    console.log(`[Audio Log] Construction intro scheduled from ${t0.toFixed(2)}s`);

    // Pre-generate white noise for the ticks and the impact transient
    const bufferSize = ctx.sampleRate * 2;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const noiseData = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) noiseData[i] = Math.random() * 2 - 1;

    // 1. Sub-bass swell holding under the whole build
    const subOsc = ctx.createOscillator();
    const subGain = ctx.createGain();
    subOsc.type = "sine";
    subOsc.frequency.setValueAtTime(65.4, t0); // C2
    subGain.gain.setValueAtTime(0, t0);
    subGain.gain.linearRampToValueAtTime(0.45, t0 + 0.6);
    subGain.gain.exponentialRampToValueAtTime(0.001, t0 + SOLID_AT + 0.3);
    subOsc.connect(subGain);
    subGain.connect(ctx.destination);
    subOsc.start(t0);
    subOsc.stop(t0 + SOLID_AT + 0.4);

    // 2. A short tick as each dot lands
    SEED_TICKS.forEach((offset, i) => {
      const time = t0 + offset;
      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuffer;

      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.setValueAtTime(1100 + i * 220, time);
      filter.Q.setValueAtTime(7, time);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, time);
      gain.gain.linearRampToValueAtTime(0.06, time + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.1);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      noise.start(time);
      noise.stop(time + 0.13);
    });

    // 3. Rising C major pentatonic figure across the draw — one note per letter
    const notes = [196.0, 220.0, 261.6, 329.6, 392.0]; // G3 A3 C4 E4 G4
    notes.forEach((freq, index) => {
      const noteTime = t0 + DRAW_AT + index * 0.11;

      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();

      // Detuned triangles for a soft, warm chorused tone
      osc1.type = "triangle";
      osc1.frequency.setValueAtTime(freq - 0.6, noteTime);
      osc2.type = "triangle";
      osc2.frequency.setValueAtTime(freq + 0.6, noteTime);

      filter.type = "lowpass";
      filter.frequency.setValueAtTime(600 + (index / (notes.length - 1)) * 1100, noteTime);

      gain.gain.setValueAtTime(0, noteTime);
      gain.gain.linearRampToValueAtTime(0.085, noteTime + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.24);

      osc1.connect(filter);
      osc2.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      osc1.start(noteTime);
      osc2.start(noteTime);
      osc1.stop(noteTime + 0.26);
      osc2.stop(noteTime + 0.26);
    });

    // 4. Chime on the moment the wireframe becomes the wordmark
    const hit = t0 + SOLID_AT;

    const delayNode = ctx.createDelay();
    delayNode.delayTime.setValueAtTime(0.16, hit);
    const feedback = ctx.createGain();
    feedback.gain.setValueAtTime(0.4, hit);
    delayNode.connect(feedback);
    feedback.connect(delayNode);

    const delayGain = ctx.createGain();
    delayGain.gain.setValueAtTime(0.35, hit);
    delayGain.gain.exponentialRampToValueAtTime(0.001, hit + 1.4);
    delayNode.connect(delayGain);
    delayGain.connect(ctx.destination);

    // C major chord (C5, E5, G5, C6) with 20ms strum offsets
    [
      { freq: 523.3, offset: 0.0 },
      { freq: 659.3, offset: 0.02 },
      { freq: 784.0, offset: 0.04 },
      { freq: 1046.5, offset: 0.06 },
    ].forEach((note) => {
      const time = hit + note.offset;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(note.freq, time);
      gain.gain.setValueAtTime(0, time);
      gain.gain.linearRampToValueAtTime(0.05, time + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.55);

      osc.connect(gain);
      gain.connect(ctx.destination);
      gain.connect(delayNode);
      osc.start(time);
      osc.stop(time + 0.7);
    });

    // Highpass noise transient for a crisp impact on the lock
    const transient = ctx.createBufferSource();
    transient.buffer = noiseBuffer;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.setValueAtTime(1400, hit);

    const transientGain = ctx.createGain();
    transientGain.gain.setValueAtTime(0, hit);
    transientGain.gain.linearRampToValueAtTime(0.14, hit + 0.01);
    transientGain.gain.exponentialRampToValueAtTime(0.001, hit + 0.12);

    transient.connect(hp);
    hp.connect(transientGain);
    transientGain.connect(ctx.destination);
    transientGain.connect(delayNode);
    transient.start(hit);
    transient.stop(hit + 0.15);

    console.log(`[Audio Log] Scheduled ${SEED_TICKS.length} ticks and a chime at ${SOLID_AT}s`);
  } catch (err) {
    console.error("Failed to run Web Audio synthesizers:", err);
  }
}
