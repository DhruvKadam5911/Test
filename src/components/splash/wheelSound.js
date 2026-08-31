import { SPIN_MS, DISTANCE } from "./wheelTiming";

/* ==========================================================================
   WEB AUDIO API SOUND GENERATION SYSTEM
   ========================================================================== */

// The shell schedules audio inside the same effect that creates the
// AudioContext, so this has to be callable without the component.
export function playSound(ctx) {
  const settleSec = SPIN_MS / 1000;
  scheduleSound(ctx, { tickTimes: crossingTimes(DISTANCE, settleSec, 9), settleSec });
}

// easeOutCubic is y = 1-(1-p)^3, so the moment the wheel crosses a given item
// is p = 1-(1-y)^(1/3). That inverse is what lets the ticks land exactly on
// the items rather than on a guessed rhythm — as the wheel slows, so do they.
function crossingTimes(distance, spinSec, count) {
  const times = [];
  for (let k = Math.max(distance - count + 1, 1); k <= distance; k++) {
    times.push(spinSec * (1 - Math.cbrt(1 - k / distance)));
  }
  return times;
}

function scheduleSound(ctx, { tickTimes, settleSec }) {
  try {
    const startTime = ctx.currentTime + 0.05; // 50ms scheduler safety margin
    console.log(`[Audio Log] Intro audio scheduled from timeline base ${startTime.toFixed(2)}s`);

    // 1. Warm C2 sub-bass swell under the whole spin
    const subOsc = ctx.createOscillator();
    const subGain = ctx.createGain();
    subOsc.type = "sine";
    subOsc.frequency.setValueAtTime(65.4, startTime); // C2

    subGain.gain.setValueAtTime(0, startTime);
    subGain.gain.linearRampToValueAtTime(0.5, startTime + 0.5);
    subGain.gain.exponentialRampToValueAtTime(0.001, startTime + settleSec + 0.2);

    subOsc.connect(subGain);
    subGain.connect(ctx.destination);
    subOsc.start(startTime);
    subOsc.stop(startTime + settleSec + 0.3);

    // Pre-generate white noise for the ticks and the impact transient
    const bufferSize = ctx.sampleRate * 2;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const noiseData = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      noiseData[i] = Math.random() * 2 - 1;
    }

    // 2. A tick each time the wheel crosses an item. They thin out on their
    //    own as the wheel decelerates, which is what sells the landing.
    tickTimes.forEach((offset, i) => {
      const time = startTime + offset;
      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuffer;

      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.setValueAtTime(900 + i * 60, time);
      filter.Q.setValueAtTime(6, time);

      const gainNode = ctx.createGain();
      gainNode.gain.setValueAtTime(0, time);
      gainNode.gain.linearRampToValueAtTime(0.05, time + 0.006);
      gainNode.gain.exponentialRampToValueAtTime(0.001, time + 0.09);

      noise.connect(filter);
      filter.connect(gainNode);
      gainNode.connect(ctx.destination);

      noise.start(time);
      noise.stop(time + 0.12);
    });
    console.log(`[Audio Log] Scheduled ${tickTimes.length} wheel ticks`);

    // 3. Rising C major pentatonic arpeggio across the spin
    const arpeggio = [130.8, 146.8, 164.8, 196.0, 220.0, 261.6, 329.6, 392.0];
    arpeggio.forEach((freq, index) => {
      const noteTime = startTime + 0.1 + (index / arpeggio.length) * (settleSec - 0.4);

      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gainNode = ctx.createGain();

      // Detuned triangles for a soft, warm chorused tone
      osc1.type = "triangle";
      osc1.frequency.setValueAtTime(freq - 0.6, noteTime);
      osc2.type = "triangle";
      osc2.frequency.setValueAtTime(freq + 0.6, noteTime);

      filter.type = "lowpass";
      filter.frequency.setValueAtTime(300 + (index / (arpeggio.length - 1)) * 1100, noteTime);

      gainNode.gain.setValueAtTime(0, noteTime);
      gainNode.gain.linearRampToValueAtTime(0.09, noteTime + 0.04);
      gainNode.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.2);

      osc1.connect(filter);
      osc2.connect(filter);
      filter.connect(gainNode);
      gainNode.connect(ctx.destination);

      osc1.start(noteTime);
      osc2.start(noteTime);
      osc1.stop(noteTime + 0.22);
      osc2.stop(noteTime + 0.22);
    });

    // 4. Chime stab at the exact moment the wheel locks onto Onion
    const hitTime = startTime + settleSec;

    // Feedback delay line acting as the reverb tail
    const delayNode = ctx.createDelay();
    delayNode.delayTime.setValueAtTime(0.16, hitTime);
    const feedbackNode = ctx.createGain();
    feedbackNode.gain.setValueAtTime(0.4, hitTime);
    delayNode.connect(feedbackNode);
    feedbackNode.connect(delayNode);

    const delayGain = ctx.createGain();
    delayGain.gain.setValueAtTime(0.35, hitTime);
    delayGain.gain.exponentialRampToValueAtTime(0.001, hitTime + 1.4);
    delayNode.connect(delayGain);
    delayGain.connect(ctx.destination);

    // C major chime chord (C5, E5, G5, C6) with 20ms strum offsets
    [
      { freq: 523.3, offset: 0.0 },
      { freq: 659.3, offset: 0.02 },
      { freq: 784.0, offset: 0.04 },
      { freq: 1046.5, offset: 0.06 },
    ].forEach((note) => {
      const noteHitTime = hitTime + note.offset;
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(note.freq, noteHitTime);

      gainNode.gain.setValueAtTime(0, noteHitTime);
      gainNode.gain.linearRampToValueAtTime(0.05, noteHitTime + 0.02);
      gainNode.gain.exponentialRampToValueAtTime(0.001, noteHitTime + 0.55);

      osc.connect(gainNode);
      gainNode.connect(ctx.destination);
      gainNode.connect(delayNode);

      osc.start(noteHitTime);
      osc.stop(noteHitTime + 0.7);
    });

    // Highpass noise transient for a crisp impact on the lock
    const transient = ctx.createBufferSource();
    transient.buffer = noiseBuffer;
    const hpFilter = ctx.createBiquadFilter();
    hpFilter.type = "highpass";
    hpFilter.frequency.setValueAtTime(1400, hitTime);

    const transientGain = ctx.createGain();
    transientGain.gain.setValueAtTime(0, hitTime);
    transientGain.gain.linearRampToValueAtTime(0.15, hitTime + 0.01);
    transientGain.gain.exponentialRampToValueAtTime(0.001, hitTime + 0.12);

    transient.connect(hpFilter);
    hpFilter.connect(transientGain);
    transientGain.connect(ctx.destination);
    transientGain.connect(delayNode);

    transient.start(hitTime);
    transient.stop(hitTime + 0.15);
    console.log(`[Audio Log] Scheduled lock chime at ${settleSec.toFixed(2)}s`);
  } catch (err) {
    console.error("Failed to run Web Audio synthesizers:", err);
  }
}
