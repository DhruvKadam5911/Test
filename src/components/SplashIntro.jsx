import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { colors } from "../theme";

// Pixel bounds measured from public/logo.png (1024x512): the bulb+sprout icon
// occupies x:199-388. The wordmark is rendered as live text instead, so it can
// animate letter by letter rather than being cropped from the flattened image.
//
// "Netflix Sans" is Netflix's own proprietary, licensed typeface — it isn't
// distributed publicly, so we use Inter here instead: it's the site's
// existing brand font, rendered thin-weight (300) with a solid fill.
const SOURCE_W = 1024;
const SOURCE_H = 512;
const ICON_LEFT = 199;
const ICON_RIGHT = 388;
const ICON_HEIGHT = 190;
const WORD = "ONION";
const WORDMARK_FONT = "'Inter', system-ui, sans-serif";

/* ==========================================================================
   WEB AUDIO API SOUND GENERATION SYSTEM
   ========================================================================== */

function playIntroSound(ctx) {
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

    // 2. Trigger soft whoosh for each letter (starts at 900ms, delayed by i * 70ms)
    const letterDelays = [0, 70, 140, 210, 280];
    letterDelays.forEach((delayMs, i) => {
      const targetTime = startTime + 0.90 + delayMs / 1000;
      triggerWhoosh(targetTime, i);
    });

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

export default function SplashIntro({ onDone }) {
  const [src, setSrc] = useState(null);
  const [swooped, setSwooped] = useState(false);
  const [textOpen, setTextOpen] = useState(false);
  const [textIn, setTextIn] = useState(false);
  const [visible, setVisible] = useState(true);
  const [textWidth, setTextWidth] = useState(0);
  const measureRef = useRef(null);

  // Audio Context and interaction state
  const [started, setStarted] = useState(false);
  const [showOverlay, setShowOverlay] = useState(false);
  // The single AudioContext for this mount. Browsers cap concurrent contexts
  // (~6), so it is created once, reused by handleInteraction, and closed on
  // unmount rather than left to leak.
  const audioCtxRef = useRef(null);

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.src = "/logo.png";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;

      for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2];
        if (r > 220 && g > 220 && b > 220) {
          data[i + 3] = 0;
        } else if (r < 95 && g < 40 && b < 105) {
          data[i] = 243; data[i + 1] = 240; data[i + 2] = 245;
        }
      }

      ctx.putImageData(imageData, 0, 0);
      setSrc(canvas.toDataURL("image/png"));
    };
  }, []);

  // Measure the wordmark's real rendered width so the reveal container can
  // grow to an exact pixel value instead of guessing.
  useLayoutEffect(() => {
    if (measureRef.current) setTextWidth(measureRef.current.scrollWidth);
  }, []);

  // Detect Autoplay Permission
  useEffect(() => {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      setStarted(true);
      return;
    }

    const ctx = new AudioContextClass();
    audioCtxRef.current = ctx;

    if (ctx.state === "suspended") {
      // Autoplay is blocked — keep the context around so handleInteraction can
      // resume() this one instead of opening a second.
      setShowOverlay(true);
    } else {
      setStarted(true);
      playIntroSound(ctx);
    }

    // StrictMode double-invokes this in dev; tearing the context down here
    // means the discarded pass is silenced immediately and only the surviving
    // one is ever heard.
    return () => {
      audioCtxRef.current = null;
      ctx.close().catch(() => {});
    };
  }, []);

  // Visual Animation Timeline
  useEffect(() => {
    if (!started) return;

    // 1) icon swoops in centered on screen (text column is 0-width so far)
    const swoopTimer = setTimeout(() => setSwooped(true), 60);
    // 2) once it's landed, open the text column — the icon visibly slides
    //    left as the centered group widens to make room
    const openTimer = setTimeout(() => setTextOpen(true), 680);
    // 3) shortly after, the letters swoop in one by one into the opened space
    const textTimer = setTimeout(() => setTextIn(true), 900);
    const hideTimer = setTimeout(() => setVisible(false), 2650);
    const doneTimer = setTimeout(() => onDone?.(), 3100);

    return () => {
      clearTimeout(swoopTimer);
      clearTimeout(openTimer);
      clearTimeout(textTimer);
      clearTimeout(hideTimer);
      clearTimeout(doneTimer);
    };
  }, [started, onDone]);

  const handleInteraction = () => {
    if (started) return;
    setShowOverlay(false);
    // The visual timeline runs regardless of whether audio can be resumed.
    setStarted(true);

    const ctx = audioCtxRef.current;
    if (!ctx) return;

    ctx
      .resume()
      .then(() => playIntroSound(ctx))
      .catch((err) => console.error("Failed to resume audio context:", err));
  };

  const scale = ICON_HEIGHT / SOURCE_H;
  const imgWidth = SOURCE_W * scale;
  const iconLeftPx = ICON_LEFT * scale;
  const iconWidthPx = (ICON_RIGHT - ICON_LEFT) * scale;

  const letterStyle = (i) => ({
    display: "inline-block",
    fontFamily: WORDMARK_FONT,
    fontWeight: 300,
    fontSize: 68,
    lineHeight: 1,
    letterSpacing: "0.03em",
    color: colors.text,
    marginRight: i < WORD.length - 1 ? 8 : 0,
  });

  return (
    <div
      onClick={handleInteraction}
      className={`fixed inset-0 flex items-center justify-center ${showOverlay ? "cursor-pointer" : ""}`}
      style={{
        zIndex: 200,
        background: colors.bg,
        opacity: visible ? 1 : 0,
        transition: "opacity 450ms ease",
        pointerEvents: visible ? "auto" : "none",
      }}
    >
      <style>{`
        @keyframes onionSplashBob {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-6px); }
        }
      `}</style>

      {/* Subtle overlay to enable sound if autoplay is blocked */}
      {showOverlay && (
        <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center z-[210] transition-all duration-300">
          <div className="bg-[#181124]/90 border border-[#7C3FC4]/30 backdrop-blur-lg px-8 py-6 rounded-2xl flex flex-col items-center gap-4 shadow-2xl animate-pulse">
            <div className="w-16 h-16 rounded-full bg-[#7C3FC4]/25 flex items-center justify-center text-[#F3F0F5]">
              {/* Simple audio wave SVG icon */}
              <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>
              </svg>
            </div>
            <div className="text-center">
              <h3 className="font-semibold text-lg text-[#F3F0F5]">Onion TV</h3>
              <p className="text-xs text-[#F3F0F5]/70 mt-1">Click anywhere to play with sound</p>
            </div>
          </div>
        </div>
      )}

      {/* Hidden measurer — same letters/font/spacing, used only to read the
          wordmark's true pixel width before it's ever shown. */}
      <div
        ref={measureRef}
        aria-hidden="true"
        style={{ position: "absolute", visibility: "hidden", whiteSpace: "nowrap", top: -9999, left: -9999 }}
      >
        {WORD.split("").map((ch, i) => (
          <span key={i} style={letterStyle(i)}>{ch}</span>
        ))}
      </div>

      <div className="flex items-center" style={{ gap: textOpen ? 16 : 0, perspective: 700 }}>
        {/* Icon — swoops in centered, then the group widens as the text column
            opens, which visibly pushes the icon left. Settles into an idle bob. */}
        <div
          style={{
            height: ICON_HEIGHT,
            width: iconWidthPx,
            overflow: "hidden",
            position: "relative",
            transformStyle: "preserve-3d",
            transform: swooped
              ? "translateZ(0) rotateX(0deg) scale(1)"
              : "translateZ(-320px) rotateX(38deg) scale(2.8)",
            opacity: swooped ? 1 : 0,
            filter: swooped ? "blur(0px)" : "blur(16px)",
            transition:
              "transform 640ms cubic-bezier(.16,1,.3,1), opacity 260ms ease, filter 520ms ease",
            animation: swooped ? "onionSplashBob 2.2s ease-in-out 700ms infinite" : "none",
          }}
        >
          {src && (
            <img
              src={src}
              alt=""
              style={{
                position: "absolute",
                left: -iconLeftPx,
                top: 0,
                height: ICON_HEIGHT,
                width: imgWidth,
                maxWidth: "none",
              }}
            />
          )}
        </div>

        {/* Text column — grows from 0 to the wordmark's real width, which is
            what visually shifts the icon leftward; letters swoop in inside it. */}
        <div
          style={{
            width: textOpen ? textWidth : 0,
            overflow: "hidden",
            transition: "width 520ms cubic-bezier(.16,1,.3,1)",
          }}
        >
          <div className="flex" style={{ perspective: 400, width: textWidth }}>
            {WORD.split("").map((ch, i) => (
              <span
                key={i}
                style={{
                  ...letterStyle(i),
                  opacity: textIn ? 1 : 0,
                  filter: textIn ? "blur(0px)" : "blur(6px)",
                  transform: textIn
                    ? "scale(1) rotateX(0deg)"
                    : "scale(0.35) rotateX(55deg) translateY(10px)",
                  transition: `opacity 400ms ease ${i * 70}ms, filter 400ms ease ${i * 70}ms, transform 460ms cubic-bezier(.16,1,.3,1) ${i * 70}ms`,
                }}
              >
                {ch}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
