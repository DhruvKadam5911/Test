import React, { useEffect, useRef, useState } from "react";
import { colors } from "../theme";
import SplashWheel from "./SplashWheel";
import { playSound as playWheelSound } from "./splash/wheelSound";
import SplashWordmark from "./SplashWordmark";
import { playSound as playWordmarkSound } from "./splash/wordmarkSound";

/*
 * SplashIntro — picks an intro for the viewport, and owns the audio for it.
 *
 * Desktop keeps the original wordmark intro: the mark swoops in and "onion" is
 * written beside it. Phones and tablets get the wheel, which spins through the
 * streaming services and pushes through the logo into the app — it reads far
 * better in a narrow portrait frame than a wide horizontal lockup does.
 *
 * The variants own their own visuals, timeline and exit. This shell only
 * decides which one runs and handles the AudioContext, because the context has
 * to be created and scheduled inside a single effect (see below).
 */

// Tailwind's `lg`. At or above this the wordmark intro runs.
const DESKTOP_QUERY = "(min-width: 1024px)";

export default function SplashIntro({ onDone }) {
  // Resolved once, on mount. Deliberately not reactive: a resize part-way
  // through would swap the whole intro mid-animation.
  const [isDesktop] = useState(
    () => window.matchMedia?.(DESKTOP_QUERY).matches ?? true
  );

  const [started, setStarted] = useState(false);
  const [showOverlay, setShowOverlay] = useState(false);
  // The single AudioContext for this mount. Browsers cap concurrent contexts
  // (~6), so it is created once, reused by handleInteraction, and closed on
  // unmount rather than left to leak.
  const audioCtxRef = useRef(null);

  const playSoundRef = useRef(null);
  playSoundRef.current = isDesktop ? playWordmarkSound : playWheelSound;

  // Detect autoplay permission.
  //
  // The sound is scheduled inside this effect on purpose. StrictMode
  // double-invokes effects in dev; because the context is created and played
  // here, the discarded pass is torn down by the cleanup below before it can
  // be heard. Moving playback into the variant would schedule twice onto one
  // live context and double the soundtrack.
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
      playSoundRef.current(ctx);
    }

    return () => {
      audioCtxRef.current = null;
      ctx.close().catch(() => {});
    };
  }, []);

  const handleInteraction = () => {
    if (started) return;
    setShowOverlay(false);
    // The intro runs regardless of whether audio can be resumed.
    setStarted(true);

    const ctx = audioCtxRef.current;
    if (!ctx) return;

    ctx
      .resume()
      .then(() => playSoundRef.current(ctx))
      .catch((err) => console.error("Failed to resume audio context:", err));
  };

  // Waiting on a click: hold a plain black field so the intro is not already
  // playing behind the prompt.
  if (!started) {
    return (
      <div
        onClick={handleInteraction}
        className="fixed inset-0 cursor-pointer"
        style={{ zIndex: 200, background: colors.bg }}
      >
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

  return isDesktop ? <SplashWordmark onDone={onDone} /> : <SplashWheel onDone={onDone} />;
}
