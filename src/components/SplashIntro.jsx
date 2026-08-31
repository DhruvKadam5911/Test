import React, { useEffect, useRef, useState } from "react";
import SplashWheel from "./SplashWheel";
import { playSound as playWheelSound } from "./splash/wheelSound";
import SplashConstruct from "./SplashConstruct";
import { playSound as playConstructSound } from "./splash/constructSound";

/*
 * SplashIntro — picks an intro for the viewport, and owns the audio for it.
 *
 * Tablets and desktop get the construction intro: dots multiply, become the
 * anchor points of the letterforms, and the wordmark is drawn and filled in.
 * Phones get the wheel, which spins through the streaming services and pushes
 * through the logo — the horizontal lockup needs width to read, and a phone
 * does not have it.
 *
 * The variants own their own visuals, timeline and exit. This shell only
 * decides which one runs and handles the AudioContext, because the context has
 * to be created and scheduled inside a single effect (see below).
 */

// Tailwind's `md` — tablet portrait and up. At or above this the wordmark
// intro runs; below it (phones, and phones in landscape) the wheel does.
const WORDMARK_QUERY = "(min-width: 768px)";

export default function SplashIntro({ onDone }) {
  // Resolved once, on mount. Deliberately not reactive: a resize part-way
  // through would swap the whole intro mid-animation.
  const [useWordmark] = useState(
    () => window.matchMedia?.(WORDMARK_QUERY).matches ?? true
  );

  // The single AudioContext for this mount. Browsers cap concurrent contexts
  // (~6), so it is created once and closed on unmount rather than left to leak.
  const audioCtxRef = useRef(null);

  const playSoundRef = useRef(null);
  playSoundRef.current = useWordmark ? playConstructSound : playWheelSound;

  // Try for sound. The intro never waits on it.
  //
  // Browsers block audio on a domain the visitor has not interacted with, so
  // the context comes back suspended and there is nothing to play. That must
  // not stop the animation: gating it behind a "click to enable sound" prompt
  // meant a first-time visitor got a black screen and a permission dialog for
  // something they never asked for. The intro runs silently instead, and sound
  // returns on its own once the browser trusts the domain.
  //
  // The sound is scheduled inside this effect on purpose. StrictMode
  // double-invokes effects in dev; because the context is created and played
  // here, the discarded pass is torn down by the cleanup below before it can
  // be heard. Moving playback into the variant would schedule twice onto one
  // live context and double the soundtrack.
  useEffect(() => {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    audioCtxRef.current = ctx;

    if (ctx.state === "running") {
      playSoundRef.current(ctx);
    }
    // Suspended: leave it alone. Resuming later would start the soundtrack
    // from its beginning against visuals already part-way through, which reads
    // worse than no sound at all.

    return () => {
      audioCtxRef.current = null;
      ctx.close().catch(() => {});
    };
  }, []);

  return useWordmark ? <SplashConstruct onDone={onDone} /> : <SplashWheel onDone={onDone} />;
}
