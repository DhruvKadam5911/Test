import React, { useEffect, useRef, useState } from "react";
import { colors } from "../theme";
import PickerWheel from "./PickerWheel";
import OnionMark from "./shared/OnionMark";
import { PLATFORMS } from "../data/platforms";

// The splash spins a wheel of streaming services and lands on Onion.
const TARGET = "Onion";
const START_INDEX = 1; // begin on the item after the target, so it has to travel
const SPINS = 1; // one full turn is plenty — more only lengthens the unreadable fast phase
const SPIN_MS = 2000; // spin-up and deceleration onto the target
// The mark renders at 0.37x its height (the crop's aspect), so 152 is
// about 56px wide — still clear of the item column at left: 92.
const MARK_HEIGHT = 152;
const MARK_SWAP_MS = 560; // arrow out, brand mark in with an overshoot
const ISOLATE_AFTER_MS = 380; // losing platforms clear away
const ZOOM_AFTER_MS = 620; // camera starts pushing through the lockup
const ZOOM_MS = 820;
const ZOOM_SCALE = 11;
const FADE_MS = 520; // background dropping away to reveal the app behind

/* ==========================================================================
   WEB AUDIO API SOUND GENERATION SYSTEM
   ========================================================================== */

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

function playIntroSound(ctx, { tickTimes, settleSec }) {
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

export default function SplashIntro({ onDone }) {
  const [visible, setVisible] = useState(true);

  // Audio context and interaction state
  const [started, setStarted] = useState(false);
  // Set once the wheel lands: swaps the arrow marker for the brand mark.
  const [settled, setSettled] = useState(false);
  const [isolate, setIsolate] = useState(false);
  const [zooming, setZooming] = useState(false);
  // Origin of the push, measured from the real lockup so the zoom comes
  // through the logo rather than the middle of an empty screen.
  const [zoomOrigin, setZoomOrigin] = useState("30% 50%");
  const stageRef = useRef(null);
  const markerRef = useRef(null);
  const [showOverlay, setShowOverlay] = useState(false);
  // The single AudioContext for this mount. Browsers cap concurrent contexts
  // (~6), so it is created once, reused by handleInteraction, and closed on
  // unmount rather than left to leak.
  const audioCtxRef = useRef(null);

  const targetIndex = Math.max(PLATFORMS.indexOf(TARGET), 0);

  const soundtrack = useRef(null);
  if (!soundtrack.current) {
    const forward = (((targetIndex - START_INDEX) % PLATFORMS.length) + PLATFORMS.length) % PLATFORMS.length;
    const distance = SPINS * PLATFORMS.length + forward;
    const settleSec = SPIN_MS / 1000;
    soundtrack.current = { tickTimes: crossingTimes(distance, settleSec, 9), settleSec };
  }

  // Detect autoplay permission
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
      playIntroSound(ctx, soundtrack.current);
    }

    // StrictMode double-invokes this in dev; tearing the context down here
    // means the discarded pass is silenced immediately and only the surviving
    // one is ever heard.
    return () => {
      audioCtxRef.current = null;
      ctx.close().catch(() => {});
    };
  }, []);

  const handleInteraction = () => {
    if (started) return;
    setShowOverlay(false);
    // The wheel spins regardless of whether audio can be resumed.
    setStarted(true);

    const ctx = audioCtxRef.current;
    if (!ctx) return;

    ctx
      .resume()
      .then(() => playIntroSound(ctx, soundtrack.current))
      .catch((err) => console.error("Failed to resume audio context:", err));
  };

  // The wheel drives the timeline: it reports when it has landed on Onion,
  // and only then does the splash hold, fade and hand over.
  const handleSettled = (activeEl) => {
    setSettled(true);

    // The lockup is the mark plus the landed name. Measure their union so the
    // push starts from its centre on any viewport, instead of a guessed
    // percentage that drifts as the layout changes.
    const stage = stageRef.current;
    const marker = markerRef.current;
    if (stage && activeEl && marker) {
      const base = stage.getBoundingClientRect();
      const a = marker.getBoundingClientRect();
      const b = activeEl.getBoundingClientRect();
      const cx = (Math.min(a.left, b.left) + Math.max(a.right, b.right)) / 2 - base.left;
      const cy = (Math.min(a.top, b.top) + Math.max(a.bottom, b.bottom)) / 2 - base.top;
      setZoomOrigin(`${cx}px ${cy}px`);
    }

    setTimeout(() => setIsolate(true), ISOLATE_AFTER_MS);
    setTimeout(() => {
      setZooming(true);
      setVisible(false);
    }, ZOOM_AFTER_MS);
    setTimeout(() => onDone?.(), ZOOM_AFTER_MS + ZOOM_MS);
  };

  return (
    <div
      onClick={handleInteraction}
      className={`fixed inset-0 ${showOverlay ? "cursor-pointer" : ""}`}
      style={{
        zIndex: 200,
        background: colors.bg,
        opacity: visible ? 1 : 0,
        // Delayed so the camera is already moving before the splash dissolves.
        transition: `opacity ${FADE_MS}ms ease ${zooming ? ZOOM_MS - FADE_MS : 0}ms`,
        pointerEvents: visible ? "auto" : "none",
      }}
    >
      {started && (
        <div
          ref={stageRef}
          style={{
            height: "100%",
            transform: zooming ? `scale(${ZOOM_SCALE})` : "scale(1)",
            transformOrigin: zoomOrigin,
            // Accelerating, like a camera pushing through the logo — an
            // ease-out here would read as the lockup drifting, not rushing.
            transition: `transform ${ZOOM_MS}ms cubic-bezier(.45,0,.9,.6)`,
            willChange: "transform",
          }}
        >
        <PickerWheel
          items={PLATFORMS}
          itemHeight={104}
          startAt={START_INDEX}
          stopAt={targetIndex}
          spins={SPINS}
          spinMs={SPIN_MS}
          onSettled={handleSettled}
          isolate={isolate}
          marker={
            // Arrow and mark are stacked in one fixed box so the swap cannot
            // reflow the names beside them. The box is sized to the mark, the
            // larger of the two.
            <span
              ref={markerRef}
              style={{
                position: "relative",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: MARK_HEIGHT * 0.37,
                height: MARK_HEIGHT,
              }}
            >
              <span
                style={{
                  position: "absolute",
                  opacity: settled ? 0 : 1,
                  transform: settled ? "translateX(-10px) scale(0.8)" : "translateX(0) scale(1)",
                  transition: "opacity 200ms ease, transform 200ms ease",
                }}
              >
                →
              </span>
              <OnionMark
                height={MARK_HEIGHT}
                style={{
                  position: "absolute",
                  opacity: settled ? 1 : 0,
                  // Overshoots slightly past full size before settling, which
                  // gives the mark a stamped-on feel rather than a fade-in.
                  transform: settled
                    ? "scale(1) translateY(0) rotate(0deg)"
                    : "scale(0.3) translateY(14px) rotate(-12deg)",
                  filter: settled ? "blur(0px)" : "blur(10px)",
                  transition: `opacity 240ms ease, filter 300ms ease, transform ${MARK_SWAP_MS}ms cubic-bezier(.34,1.56,.64,1)`,
                }}
              />
            </span>
          }
            style={{ height: "100%" }}
          />
        </div>
      )}

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
    </div>
  );
}
