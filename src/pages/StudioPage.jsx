import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Search, Bell, Upload, User, FileVideo, Check } from "lucide-react";
import { colors, displayFont, bodyFont } from "../theme";
import SmallRing from "../components/shared/SmallRing";

export default function StudioPage() {
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [success, setSuccess] = useState(false);

  const handleSimulateUpload = (e) => {
    e.preventDefault();
    if (!uploadTitle) return;
    setUploading(true);
    setSuccess(false);
    let p = 0;
    const interval = setInterval(() => {
      p += 25;
      setProgress(p);
      if (p >= 100) {
        clearInterval(interval);
        setUploading(false);
        setSuccess(true);
      }
    }, 400);
  };

  return (
    <div style={{ background: colors.bg, minHeight: "100vh", fontFamily: bodyFont, color: colors.text }}>
      
      {/* Navigation */}
      <nav className="flex items-center justify-between px-6 md:px-10 py-4 sticky top-0 z-20"
        style={{ background: "linear-gradient(to bottom, rgba(10,10,11,0.95), rgba(10,10,11,0))" }}>
        <div className="flex items-center gap-8">
          <Link to="/" style={{ fontFamily: displayFont, fontSize: 22, fontWeight: 600, color: colors.text, textDecoration: "none", letterSpacing: 0.3 }}>onion</Link>
          <div className="hidden md:flex items-center gap-6">
            <Link to="/" style={{ fontSize: 13.5, fontWeight: 500, color: colors.textMuted, textDecoration: "none" }}>Browse</Link>
            <Link to="/" style={{ fontSize: 13.5, fontWeight: 500, color: colors.textMuted, textDecoration: "none" }}>Originals</Link>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <Search size={17} color={colors.textMuted} style={{ cursor: "pointer" }} />
          <Bell size={17} color={colors.textMuted} style={{ cursor: "pointer" }} className="hidden md:block" />
          <Link to="/studio" style={{ textDecoration: "none" }}>
            <button style={{ fontFamily: bodyFont, fontSize: 12.5, fontWeight: 600, color: colors.bg, background: colors.accent, border: "none", borderRadius: 4, padding: "7px 13px", cursor: "pointer" }}>Upload</button>
          </Link>
          <Link to="/auth" style={{ textDecoration: "none" }}>
            <div style={{ width: 28, height: 28, borderRadius: "50%", background: colors.bgCard, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <User size={14} color={colors.textMuted} />
            </div>
          </Link>
        </div>
      </nav>

      {/* Upload Studio Container */}
      <div className="px-6 md:px-10 py-8 max-w-3xl mx-auto space-y-8">
        
        {/* Header */}
        <div className="pb-6" style={{ borderBottom: `1px solid ${colors.ring}` }}>
          <div className="flex items-center gap-2">
            <SmallRing />
            <h1 style={{ fontFamily: displayFont, fontSize: 28, fontWeight: 600, color: colors.text }}>Creator Studio</h1>
          </div>
          <p style={{ fontSize: 13, color: colors.textMuted, marginTop: 4 }}>Publish high-bitrate 4K video master files to Onion streaming.</p>
        </div>

        {/* Upload Form Box */}
        <div className="p-6 rounded-md space-y-6" style={{ background: colors.bgElevated, border: `1px solid ${colors.ring}` }}>
          
          {success ? (
            <div className="py-10 flex flex-col items-center justify-center text-center space-y-3">
              <div style={{ width: 44, height: 44, borderRadius: "50%", background: "rgba(193,68,59,0.2)", display: "flex", alignItems: "center", justifyCenter: "center" }}>
                <Check size={22} color={colors.accent} />
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, color: colors.text }}>Video Published Successfully!</div>
              <div style={{ fontSize: 12, color: colors.textMuted, maxWidth: 360 }}>
                Your master video has been processed in 4K UHD and is now available in search and recommendations.
              </div>
              <button 
                onClick={() => { setSuccess(false); setProgress(0); setUploadTitle(""); }}
                style={{ marginTop: 12, padding: "8px 16px", borderRadius: 4, background: colors.bgCard, border: `1px solid ${colors.ring}`, color: colors.text, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}
              >
                Upload Another Video
              </button>
            </div>
          ) : (
            <form onSubmit={handleSimulateUpload} className="space-y-4">
              
              <div className="p-8 border-2 border-dashed rounded-md flex flex-col items-center justify-center text-center cursor-pointer" style={{ borderColor: colors.ring, background: colors.bgCard }}>
                <FileVideo size={36} color={colors.accent} className="mb-2" />
                <div style={{ fontSize: 13, fontWeight: 600, color: colors.text }}>Drag & drop video files here</div>
                <div style={{ fontSize: 11, color: colors.textMuted, marginTop: 2 }}>MP4, MOV, or MKV up to 50GB supported</div>
              </div>

              <div className="space-y-1">
                <label style={{ fontSize: 12, color: colors.textMuted }}>Title</label>
                <input 
                  type="text" 
                  placeholder="e.g. Undertow Season 1 Master"
                  value={uploadTitle}
                  onChange={(e) => setUploadTitle(e.target.value)}
                  style={{ width: "100%", background: colors.bgCard, border: `1px solid ${colors.ring}`, borderRadius: 4, padding: "8px 12px", fontSize: 12, color: colors.text, outline: "none" }}
                  required
                />
              </div>

              {uploading && (
                <div className="space-y-1 pt-2">
                  <div className="flex justify-between text-xs" style={{ color: colors.textMuted }}>
                    <span>Processing file...</span>
                    <span style={{ color: colors.accent, fontWeight: 700 }}>{progress}%</span>
                  </div>
                  <div className="w-full h-1.5 rounded" style={{ background: colors.bgCard }}>
                    <div className="h-full rounded" style={{ width: `${progress}%`, background: colors.accent, transition: "width 300ms ease" }} />
                  </div>
                </div>
              )}

              <button 
                type="submit" 
                disabled={uploading || !uploadTitle}
                className="flex items-center justify-center gap-2"
                style={{ width: "100%", padding: 12, borderRadius: 4, background: colors.accent, border: "none", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", opacity: uploading || !uploadTitle ? 0.5 : 1 }}
              >
                <Upload size={14} />
                <span>{uploading ? "Uploading..." : "Publish Video"}</span>
              </button>
            </form>
          )}

        </div>

      </div>

    </div>
  );
}
