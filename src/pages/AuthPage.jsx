import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { colors, bodyFont, displayFont } from "../theme";
import OnionLogo from "../components/shared/OnionLogo";
import RingMotif from "../components/shared/RingMotif";

export default function AuthPage() {
  const navigate = useNavigate();
  const { login, signup, isLoggedIn } = useAuth();
  
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (isLoggedIn) {
    navigate("/");
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (isSignUp) {
        await signup(email, username, password);
      } else {
        await login(email, password);
      }
      navigate("/");
    } catch (err) {
      setError(err.message || "Authentication failed. Please check your inputs.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ background: colors.bg, minHeight: "100vh", fontFamily: bodyFont, color: colors.text }} className="relative flex flex-col justify-between overflow-hidden">
      
      {/* Ambient background ring motif */}
      <RingMotif size={700} opacity={0.3} style={{ position: "absolute", top: -150, left: -200, pointerEvents: "none" }} />
      
      {/* Header */}
      <header className="px-6 md:px-10 py-6 relative z-10">
        <Link to="/" style={{ textDecoration: "none" }}>
          <OnionLogo height={58} />
        </Link>
      </header>

      {/* Main Auth Form Container */}
      <main className="flex-1 flex items-center justify-center px-6 py-12 relative z-10">
        <div 
          className="w-full max-w-md p-8 md:p-10 rounded-xl space-y-6"
          style={{ background: colors.bgElevated, border: `1px solid ${colors.ring}`, boxShadow: "0 12px 32px rgba(0,0,0,0.5)" }}
        >
          <div className="text-center space-y-2">
            <h1 style={{ fontFamily: displayFont, fontSize: 28, fontWeight: 600, color: colors.text }}>
              {isSignUp ? "Create an Account" : "Sign In to Onion"}
            </h1>
            <p style={{ fontSize: 13.5, color: colors.textMuted }}>
              {isSignUp ? "Unlimited ad-free VOD streaming" : "Welcome back. Stream your favorite originals."}
            </p>
          </div>

          {/* Inline Error Message */}
          {error && (
            <div className="p-3 rounded text-xs font-medium border" style={{ background: "rgba(220, 38, 38, 0.12)", color: "#FCA5A5", borderColor: "rgba(220, 38, 38, 0.3)" }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: colors.textMuted, display: "block", marginBottom: 6 }}>
                Email address
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                style={{ width: "100%", background: "rgba(255,255,255,0.05)", border: `1px solid ${colors.ring}`, color: colors.text, padding: "11px 14px", borderRadius: 6, fontSize: 14, outline: "none" }}
              />
            </div>

            {isSignUp && (
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: colors.textMuted, display: "block", marginBottom: 6 }}>
                  Username
                </label>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="onionfan"
                  style={{ width: "100%", background: "rgba(255,255,255,0.05)", border: `1px solid ${colors.ring}`, color: colors.text, padding: "11px 14px", borderRadius: 6, fontSize: 14, outline: "none" }}
                />
              </div>
            )}

            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: colors.textMuted, display: "block", marginBottom: 6 }}>
                Password
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                style={{ width: "100%", background: "rgba(255,255,255,0.05)", border: `1px solid ${colors.ring}`, color: colors.text, padding: "11px 14px", borderRadius: 6, fontSize: 14, outline: "none" }}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded font-bold text-sm transition-transform duration-180 hover:scale-[1.02]"
              style={{ background: colors.accent, color: "#fff", border: "none", cursor: loading ? "wait" : "pointer", opacity: loading ? 0.7 : 1, marginTop: 8 }}
            >
              {loading ? "Processing..." : isSignUp ? "Create Account" : "Sign In"}
            </button>
          </form>

          {/* Toggle between Sign In and Sign Up */}
          <div className="pt-2 text-center text-xs" style={{ color: colors.textMuted }}>
            {isSignUp ? "Already have an account?" : "New to Onion?"}{" "}
            <button
              onClick={() => { setIsSignUp(!isSignUp); setError(""); }}
              style={{ color: colors.accentLight, fontWeight: 600, background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}
            >
              {isSignUp ? "Sign in now" : "Sign up free"}
            </button>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="px-6 md:px-10 py-6 border-t text-center text-xs" style={{ borderColor: colors.ring, color: colors.textMuted }}>
        © 2026 Onion VOD Platform. All rights reserved.
      </footer>
    </div>
  );
}
