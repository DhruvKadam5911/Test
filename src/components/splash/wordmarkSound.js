import { WORD, LETTER_STAGGER } from "./wordmarkTiming";

/* ==========================================================================
   WEB AUDIO API SOUND GENERATION SYSTEM
   ========================================================================== */

export function playSound(ctx) {
  try {
    const startTime = ctx.currentTime + 0.05; // 50ms scheduler safety margin
    console.log(`[Audio Log] Initializing warm, uplifting C Major intro audio at timeline base: ${startTime.toFixed(2)}s`);

    // 1. Warm C2 sub-bass swell (~65.4Hz, sine oscillator, fade in over 0.5s)
    const subOsc = ctx.createOscillator();
    const subGain = ctx.createGain();
    subOsc.type = "sine";
    subOsc.frequency.setValueAtTime(65.4, startTime); // C2 (~65.4Hz)
    
    subGain.gain.setValueAtTime(0, startTime);
    subGain.gain.linearRampToValueAtTime(0.5, startTime + 0.5);
    subGain.gain.exponentialRampToValueAtTime(0.001, startTime + 1.6);
    
    subOsc.connect(subGain);
    subGain.connect(ctx.destination);
    subOsc.start(startTime);
    subOsc.stop(startTime + 1.7);
    console.log("[Audio Log] Scheduled C2 Sub-Bass Swell at 0.00s");

    // Pre-generate white noise buffer for whooshes and transients
    const bufferSize = ctx.sampleRate * 2;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const noiseData = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      noiseData[i] = Math.random() * 2 - 1;
    }

    // Helper to trigger a soft whoosh (filtered white noise, short attack/decay)
    const triggerWhoosh = (time, index) => {
      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuffer;

      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.setValueAtTime(300, time);
      filter.frequency.exponentialRampToValueAtTime(1500, time + 0.2);
      filter.Q.setValueAtTime(2.0, time);

      const gainNode = ctx.createGain();
      gainNode.gain.setValueAtTime(0, time);
      gainNode.gain.linearRampToValueAtTime(0.06, time + 0.04);
      gainNode.gain.exponentialRampToValueAtTime(0.001, time + 0.22);

      noise.connect(filter);
      filter.connect(gainNode);
      gainNode.connect(ctx.destination);

      noise.start(time);
      noise.stop(time + 0.25);
      console.log(`[Audio Log] Scheduled Letter ${index} Whoosh at ${(time - startTime).toFixed(3)}s`);
    };

    // 2. One soft whoosh per letter, landing as that letter is drawn. The
    //    writing starts at 900ms and steps by LETTER_STAGGER, so the strokes
    //    and the sound stay locked together.
    for (let i = 0; i < WORD.length; i++) {
      const targetTime = startTime + 0.90 + (i * LETTER_STAGGER) / 1000;
      triggerWhoosh(targetTime, i);
    }

    // 3. Warm rising C Major Pentatonic synth arpeggio (positive, uplifting feel)
    // Notes: C3 (130.8Hz), D3 (146.8Hz), E3 (164.8Hz), G3 (196.0Hz), A3 (220.0Hz), C4 (261.6Hz), E4 (329.6Hz), G4 (392.0Hz)
    const arpeggioNotes = [
      { delay: 0.1, freq: 130.8 },
      { delay: 0.3, freq: 146.8 },
      { delay: 0.5, freq: 164.8 },
      { delay: 0.7, freq: 196.0 },
      { delay: 0.9, freq: 220.0 },
      { delay: 1.1, freq: 261.6 },
      { delay: 1.3, freq: 329.6 },
      { delay: 1.5, freq: 392.0 },
    ];

    arpeggioNotes.forEach((note, index) => {
      const noteTime = startTime + note.delay;
      
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gainNode = ctx.createGain();

      // Detuned triangle oscillators for a soft, warm chorused tone
      osc1.type = "triangle";
      osc1.frequency.setValueAtTime(note.freq - 0.6, noteTime);

      osc2.type = "triangle";
      osc2.frequency.setValueAtTime(note.freq + 0.6, noteTime);

      filter.type = "lowpass";
      const cutoff = 300 + (index / (arpeggioNotes.length - 1)) * 1100;
      filter.frequency.setValueAtTime(cutoff, noteTime);

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
      console.log(`[Audio Log] Scheduled C-Major Arpeggio Note ${index} (${note.freq}Hz) at ${(noteTime - startTime).toFixed(2)}s`);
    });

    // 4. Bright, warm C Major chime hit/stab (starts at 1.64s when the wordmark locks)
    const hitTime = startTime + 1.64;

    // Feedback Delay Line acting as the Reverb/Space Tail
    const delayNode = ctx.createDelay();
    delayNode.delayTime.setValueAtTime(0.16, hitTime);
    
    const feedbackNode = ctx.createGain();
    feedbackNode.gain.setValueAtTime(0.40, hitTime);

    delayNode.connect(feedbackNode);
    feedbackNode.connect(delayNode);

    const delayGain = ctx.createGain();
    delayGain.gain.setValueAtTime(0.35, hitTime);
    delayGain.gain.exponentialRampToValueAtTime(0.001, hitTime + 1.4); // Natural decay over ~1.4s

    delayNode.connect(delayGain);
    delayGain.connect(ctx.destination);

    // Uplifting C Major chime chord (C5, E5, G5, C6) with 20ms strum delays
    const chimeChord = [
      { freq: 523.3, offset: 0.00 }, // C5
      { freq: 659.3, offset: 0.02 }, // E5
      { freq: 784.0, offset: 0.04 }, // G5
      { freq: 1046.5, offset: 0.06 }, // C6
    ];

    chimeChord.forEach(note => {
      const noteHitTime = hitTime + note.offset;
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();

      osc.type = "sine"; // Sine chimes for a warm, clean glass-like chime
      osc.frequency.setValueAtTime(note.freq, noteHitTime);

      gainNode.gain.setValueAtTime(0, noteHitTime);
      gainNode.gain.linearRampToValueAtTime(0.05, noteHitTime + 0.02);
      gainNode.gain.exponentialRampToValueAtTime(0.001, noteHitTime + 0.55);

      osc.connect(gainNode);
      gainNode.connect(ctx.destination);
      gainNode.connect(delayNode); // Feed into space delay tail

      osc.start(noteHitTime);
      osc.stop(noteHitTime + 0.7);
    });

    // Highpass quick noise transient for crisp impact
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
    transientGain.connect(delayNode); // Feed into space delay tail

    transient.start(hitTime);
    transient.stop(hitTime + 0.15);
    console.log("[Audio Log] Scheduled C-Major Strum Chime + Reverb at 1.64s");

  } catch (err) {
    console.error("Failed to run Web Audio synthesizers:", err);
  }
}
