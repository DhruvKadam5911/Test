import React, { useState, useRef, useEffect } from 'react';
import type { Video } from '../types';
import { 
  Play, 
  Pause, 
  Volume2, 
  VolumeX, 
  Maximize2, 
  Minimize2, 
  Settings, 
  Eye, 
  PictureInPicture2,
  Sparkles
} from 'lucide-react';

interface VideoPlayerProps {
  video: Video;
  isLive?: boolean;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({ video, isLive = false }) => {
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(0.8);
  const [progress, setProgress] = useState(32);
  const [quality, setQuality] = useState('1080p 60fps');
  const [showQualityMenu, setShowQualityMenu] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play().catch(() => {});
      }
    }
    setIsPlaying(!isPlaying);
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
    }
    setIsMuted(!isMuted);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (videoRef.current) {
      videoRef.current.volume = val;
    }
    setIsMuted(val === 0);
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  const handleMouseMove = () => {
    setControlsVisible(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
      if (isPlaying) setControlsVisible(false);
    }, 3500);
  };

  useEffect(() => {
    return () => {
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    };
  }, [isPlaying]);

  return (
    <div 
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => isPlaying && setControlsVisible(false)}
      className="relative w-full aspect-video bg-[#0A0A0B] rounded-lg overflow-hidden border border-[#2A262E] shadow-2xl group select-none"
    >
      {/* Video Content / Fallback Player */}
      <video
        ref={videoRef}
        src={video.videoUrl || "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4"}
        poster={video.thumbnail}
        autoPlay
        loop
        muted={isMuted}
        playsInline
        className="w-full h-full object-cover"
        onClick={togglePlay}
      />

      {/* Top Banner Overlay */}
      <div className={`absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/80 via-black/40 to-transparent flex items-center justify-between transition-opacity duration-300 ${controlsVisible || !isPlaying ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        <div className="flex items-center gap-3">
          {isLive || video.isLive ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#C1443B] text-white text-xs font-bold tracking-wider">
              <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
              LIVE STREAM
            </span>
          ) : (
            <span className="px-2.5 py-1 rounded bg-[#1D1A20]/80 backdrop-blur border border-[#2A262E] text-[#D9A441] text-xs font-semibold">
              ONION PLAYER
            </span>
          )}
          <h2 className="text-sm font-semibold text-[#F2EFEA] truncate max-w-md hidden sm:block">
            {video.title}
          </h2>
        </div>

        <div className="flex items-center gap-2">
          {isLive ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/60 backdrop-blur text-xs font-medium text-[#F2EFEA] border border-[#2A262E]">
              <Eye className="w-3.5 h-3.5 text-[#C1443B]" />
              {video.viewersCount || '14,892'} watching
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/60 backdrop-blur text-xs font-medium text-[#948E96] border border-[#2A262E]">
              <Sparkles className="w-3.5 h-3.5 text-[#D9A441]" />
              {video.views}
            </span>
          )}
        </div>
      </div>

      {/* Play/Pause Central Floating Overlay when paused */}
      {!isPlaying && (
        <div 
          onClick={togglePlay}
          className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-[2px] cursor-pointer"
        >
          <div className="w-16 h-16 rounded-full bg-[#C1443B] flex items-center justify-center text-white shadow-2xl transform scale-100 hover:scale-110 transition-transform">
            <Play className="w-7 h-7 fill-current ml-1" />
          </div>
        </div>
      )}

      {/* Bottom Controls Bar */}
      <div className={`absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/90 via-black/60 to-transparent transition-opacity duration-300 flex flex-col gap-2 ${controlsVisible || !isPlaying ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        
        {/* Timeline Scrubber */}
        {!isLive && (
          <div className="relative flex items-center group/scrubber cursor-pointer">
            <input 
              type="range" 
              min="0" 
              max="100" 
              value={progress}
              onChange={(e) => setProgress(Number(e.target.value))}
              className="w-full h-1 bg-[#2A262E] rounded-lg appearance-none cursor-pointer accent-[#C1443B]"
              aria-label="Video seek timeline"
            />
          </div>
        )}

        {/* Controls Button Row */}
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-3">
            
            {/* Play/Pause */}
            <button
              onClick={togglePlay}
              className="p-1.5 text-[#F2EFEA] hover:text-[#C1443B] transition-colors focus-visible:ring-1 focus-visible:ring-[#C1443B] rounded"
              aria-label={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current" />}
            </button>

            {/* Live indicator or Time display */}
            {isLive ? (
              <span className="flex items-center gap-1.5 text-xs text-[#C1443B] font-semibold tracking-wider">
                <span className="w-2 h-2 rounded-full bg-[#C1443B] animate-ping" />
                LIVE
              </span>
            ) : (
              <span className="text-xs text-[#948E96] font-mono">
                14:20 / {video.duration || '48:00'}
              </span>
            )}

            {/* Volume Control */}
            <div className="flex items-center gap-1.5 group/vol">
              <button 
                onClick={toggleMute}
                className="p-1.5 text-[#F2EFEA] hover:text-[#C1443B] transition-colors"
                aria-label={isMuted ? "Unmute" : "Mute"}
              >
                {isMuted || volume === 0 ? <VolumeX className="w-5 h-5 text-[#948E96]" /> : <Volume2 className="w-5 h-5" />}
              </button>
              <input 
                type="range" 
                min="0" 
                max="1" 
                step="0.05"
                value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
                className="w-16 h-1 bg-[#2A262E] rounded appearance-none cursor-pointer accent-[#C1443B]"
                aria-label="Volume slider"
              />
            </div>

          </div>

          {/* Right Action Icons: Quality Dropdown, PiP, Fullscreen */}
          <div className="flex items-center gap-2 relative">
            
            {/* Quality Selector */}
            <div className="relative">
              <button
                onClick={() => setShowQualityMenu(!showQualityMenu)}
                className="px-2 py-1 text-xs text-[#948E96] hover:text-[#F2EFEA] hover:bg-[#161418] rounded flex items-center gap-1 transition-colors border border-[#2A262E]"
                aria-label="Video quality menu"
              >
                <Settings className="w-3.5 h-3.5" />
                <span>{quality}</span>
              </button>

              {showQualityMenu && (
                <div className="absolute right-0 bottom-full mb-2 w-36 bg-[#161418] border border-[#2A262E] rounded-md shadow-2xl py-1 z-50">
                  {['4K UHD 60fps', '1440p 60fps', '1080p 60fps', '720p 60fps', 'Auto (1080p)'].map((q) => (
                    <button
                      key={q}
                      onClick={() => {
                        setQuality(q);
                        setShowQualityMenu(false);
                      }}
                      className={`w-full text-left px-3 py-1.5 text-xs font-medium transition-colors ${
                        quality === q ? 'text-[#C1443B] bg-[#1D1A20]' : 'text-[#948E96] hover:text-[#F2EFEA]'
                      }`}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Picture in Picture */}
            <button
              onClick={() => {
                if (videoRef.current && document.pictureInPictureEnabled) {
                  videoRef.current.requestPictureInPicture().catch(() => {});
                }
              }}
              className="p-1.5 text-[#948E96] hover:text-[#F2EFEA] transition-colors"
              title="Picture-in-Picture"
              aria-label="Picture in Picture"
            >
              <PictureInPicture2 className="w-4 h-4" />
            </button>

            {/* Fullscreen */}
            <button
              onClick={toggleFullscreen}
              className="p-1.5 text-[#948E96] hover:text-[#F2EFEA] transition-colors"
              title="Fullscreen"
              aria-label="Fullscreen"
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>

          </div>
        </div>
      </div>
    </div>
  );
};
