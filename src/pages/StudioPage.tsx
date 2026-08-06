import React, { useState } from 'react';
import type { StudioTab } from '../types';
import { OnionRingsIcon } from '../components/OnionRingsIcon';
import { 
  Radio, 
  Upload, 
  Eye, 
  EyeOff, 
  Copy, 
  Check, 
  TrendingUp, 
  Users, 
  FileVideo,
  Image as ImageIcon
} from 'lucide-react';

export const StudioPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<StudioTab>('golive');
  const [streamStatus, setStreamStatus] = useState<'offline' | 'live'>('offline');
  
  // Go Live form state
  const [showStreamKey, setShowStreamKey] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [streamTitle, setStreamTitle] = useState('Late Night Cyberpunk Modular Synth Jam');
  const [streamCategory, setStreamCategory] = useState('Music & Sound');

  // Upload form state
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadDesc, setUploadDesc] = useState('');
  const [uploadCategory, setUploadCategory] = useState('Sci-Fi & Cyber');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);

  const rawStreamKey = 'live_sk_89f3a9d20c18471b9e28a';
  const rtmpUrl = 'rtmp://ingest.onion.tv/live';

  const copyToClipboard = (text: string, type: 'key' | 'url') => {
    navigator.clipboard.writeText(text);
    if (type === 'key') {
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2000);
    } else {
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    }
  };

  const handleStartStream = () => {
    setStreamStatus(prev => prev === 'offline' ? 'live' : 'offline');
  };

  const handleSimulateUpload = (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadTitle) return;
    
    setIsUploading(true);
    setUploadProgress(10);
    
    const interval = setInterval(() => {
      setUploadProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setIsUploading(false);
          setUploadSuccess(true);
          return 100;
        }
        return prev + 25;
      });
    }, 400);
  };

  return (
    <div className="min-h-screen pb-16 bg-[#0A0A0B] text-[#F2EFEA]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        
        {/* Dashboard Title & Top Analytics Strip */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#2A262E]/60 pb-6">
          <div>
            <div className="flex items-center gap-2.5">
              <OnionRingsIcon size={22} className="text-[#C1443B]" />
              <h1 className="text-2xl font-bold tracking-tight text-[#F2EFEA]">
                Creator Studio
              </h1>
            </div>
            <p className="text-xs text-[#948E96] mt-1">
              Broadcast live or publish high-bitrate video on demand.
            </p>
          </div>

          {/* Quick Analytics Summary Strip */}
          <div className="grid grid-cols-3 gap-3 bg-[#161418] p-3 rounded-lg border border-[#2A262E]">
            <div className="px-3 border-r border-[#2A262E]/60">
              <div className="flex items-center gap-1.5 text-[11px] text-[#948E96]">
                <Users className="w-3.5 h-3.5 text-[#C1443B]" />
                <span>Followers</span>
              </div>
              <p className="text-sm font-semibold text-[#F2EFEA] mt-0.5">380,410</p>
            </div>

            <div className="px-3 border-r border-[#2A262E]/60">
              <div className="flex items-center gap-1.5 text-[11px] text-[#948E96]">
                <TrendingUp className="w-3.5 h-3.5 text-[#D9A441]" />
                <span>Total Views</span>
              </div>
              <p className="text-sm font-semibold text-[#F2EFEA] mt-0.5">2.4M</p>
            </div>

            <div className="px-3">
              <div className="flex items-center gap-1.5 text-[11px] text-[#948E96]">
                <Radio className="w-3.5 h-3.5 text-[#C1443B]" />
                <span>Status</span>
              </div>
              <p className="text-sm font-semibold mt-0.5 flex items-center gap-1.5">
                {streamStatus === 'live' ? (
                  <span className="text-[#C1443B] flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-[#C1443B] animate-ping" />
                    LIVE
                  </span>
                ) : (
                  <span className="text-[#948E96]">Offline</span>
                )}
              </p>
            </div>
          </div>
        </div>

        {/* Tab Switcher: "Go Live" vs "Upload Video" */}
        <div className="flex items-center gap-2 border-b border-[#2A262E]">
          <button
            onClick={() => setActiveTab('golive')}
            className={`px-5 py-3 text-sm font-semibold flex items-center gap-2 transition-all border-b-2 ${
              activeTab === 'golive'
                ? 'border-[#C1443B] text-[#F2EFEA]'
                : 'border-transparent text-[#948E96] hover:text-[#F2EFEA]'
            }`}
          >
            <Radio className="w-4 h-4 text-[#C1443B]" />
            <span>Go Live</span>
          </button>

          <button
            onClick={() => setActiveTab('upload')}
            className={`px-5 py-3 text-sm font-semibold flex items-center gap-2 transition-all border-b-2 ${
              activeTab === 'upload'
                ? 'border-[#C1443B] text-[#F2EFEA]'
                : 'border-transparent text-[#948E96] hover:text-[#F2EFEA]'
            }`}
          >
            <Upload className="w-4 h-4 text-[#D9A441]" />
            <span>Upload Video</span>
          </button>
        </div>

        {/* TAB 1: GO LIVE */}
        {activeTab === 'golive' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            
            {/* Left Column: Stream Settings & Credentials */}
            <div className="lg:col-span-7 space-y-6">
              
              {/* Credentials Box */}
              <div className="bg-[#161418] border border-[#2A262E] rounded-lg p-5 space-y-4">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-[#F2EFEA] flex items-center gap-2">
                  <OnionRingsIcon size={16} className="text-[#C1443B]" />
                  Stream Credentials (OBS / Streamlabs)
                </h3>

                {/* RTMP Server */}
                <div className="space-y-1.5">
                  <label className="text-xs text-[#948E96] font-medium">RTMP Ingest Server URL</label>
                  <div className="flex items-center bg-[#1D1A20] border border-[#2A262E] rounded-md px-3 py-2">
                    <input 
                      type="text" 
                      readOnly 
                      value={rtmpUrl} 
                      className="bg-transparent text-xs text-[#F2EFEA] font-mono flex-1 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => copyToClipboard(rtmpUrl, 'url')}
                      className="text-[#948E96] hover:text-[#F2EFEA] text-xs flex items-center gap-1 transition-colors ml-2"
                    >
                      {copiedUrl ? <Check className="w-3.5 h-3.5 text-[#C1443B]" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                {/* Stream Key */}
                <div className="space-y-1.5">
                  <label className="text-xs text-[#948E96] font-medium">Stream Key (Keep secret)</label>
                  <div className="flex items-center bg-[#1D1A20] border border-[#2A262E] rounded-md px-3 py-2">
                    <input 
                      type={showStreamKey ? 'text' : 'password'} 
                      readOnly 
                      value={rawStreamKey} 
                      className="bg-transparent text-xs text-[#F2EFEA] font-mono flex-1 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowStreamKey(!showStreamKey)}
                      className="text-[#948E96] hover:text-[#F2EFEA] p-1 mr-1"
                      title={showStreamKey ? "Hide key" : "Reveal key"}
                    >
                      {showStreamKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(rawStreamKey, 'key')}
                      className="text-[#948E96] hover:text-[#F2EFEA] text-xs flex items-center gap-1 transition-colors"
                    >
                      {copiedKey ? <Check className="w-3.5 h-3.5 text-[#C1443B]" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              </div>

              {/* Stream Title & Metadata Form */}
              <div className="bg-[#161418] border border-[#2A262E] rounded-lg p-5 space-y-4">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-[#F2EFEA]">
                  Stream Details
                </h3>

                <div className="space-y-1.5">
                  <label className="text-xs text-[#948E96] font-medium">Stream Title</label>
                  <input
                    type="text"
                    value={streamTitle}
                    onChange={(e) => setStreamTitle(e.target.value)}
                    className="w-full bg-[#1D1A20] border border-[#2A262E] rounded-md px-3 py-2 text-xs text-[#F2EFEA] focus:border-[#C1443B] focus:outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs text-[#948E96] font-medium">Category</label>
                  <select
                    value={streamCategory}
                    onChange={(e) => setStreamCategory(e.target.value)}
                    className="w-full bg-[#1D1A20] border border-[#2A262E] rounded-md px-3 py-2 text-xs text-[#F2EFEA] focus:border-[#C1443B] focus:outline-none"
                  >
                    <option value="Music & Sound">Music & Sound</option>
                    <option value="Gaming & Esports">Gaming & Esports</option>
                    <option value="IRL & Travel">IRL & Travel</option>
                    <option value="Tech & Code">Tech & Code</option>
                    <option value="Sci-Fi & Cyber">Sci-Fi & Cyber</option>
                  </select>
                </div>

                {/* Drag-and-Drop Thumbnail Upload */}
                <div className="space-y-1.5">
                  <label className="text-xs text-[#948E96] font-medium">Stream Cover Thumbnail</label>
                  <div className="border-2 border-dashed border-[#2A262E] hover:border-[#C1443B] rounded-lg p-6 flex flex-col items-center justify-center text-center cursor-pointer transition-colors bg-[#1D1A20]/40">
                    <ImageIcon className="w-8 h-8 text-[#948E96] mb-2" />
                    <p className="text-xs text-[#F2EFEA] font-medium">Click or drag image to upload thumbnail</p>
                    <p className="text-[10px] text-[#948E96] mt-1">16:9 ratio recommended (1920x1080)</p>
                  </div>
                </div>
              </div>

            </div>

            {/* Right Column: Stream Preview Window & Start Stream Action */}
            <div className="lg:col-span-5 space-y-6">
              
              <div className="bg-[#161418] border border-[#2A262E] rounded-lg p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-[#F2EFEA]">
                    Stream Preview
                  </h3>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    streamStatus === 'live' ? 'bg-[#C1443B] text-white animate-pulse' : 'bg-[#2A262E] text-[#948E96]'
                  }`}>
                    {streamStatus === 'live' ? 'LIVE' : 'OFFLINE'}
                  </span>
                </div>

                {/* Interactive Player Placeholder */}
                <div className="relative aspect-video bg-[#0A0A0B] rounded-md border border-[#2A262E] overflow-hidden flex flex-col items-center justify-center text-center p-4">
                  {streamStatus === 'live' ? (
                    <div className="relative w-full h-full">
                      <img 
                        src="https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?q=80&w=800&auto=format&fit=crop"
                        alt="Live Stream Feed"
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute top-2 left-2 bg-[#C1443B] text-white px-2 py-0.5 rounded text-[10px] font-bold">
                        14,892 VIEWERS
                      </div>
                    </div>
                  ) : (
                    <>
                      <Radio className="w-10 h-10 text-[#2A262E] mb-2 animate-pulse" />
                      <p className="text-xs text-[#F2EFEA] font-medium">Stream Offline</p>
                      <p className="text-[11px] text-[#948E96] mt-1 max-w-xs">
                        Start broadcasting from your streaming software or click the button below to simulate going live.
                      </p>
                    </>
                  )}
                </div>

                {/* Start / Stop Stream CTA */}
                <button
                  onClick={handleStartStream}
                  className={`w-full py-3 rounded-md font-semibold text-sm transition-all shadow-xl flex items-center justify-center gap-2 ${
                    streamStatus === 'live'
                      ? 'bg-[#1D1A20] hover:bg-[#2A262E] text-[#C1443B] border border-[#C1443B]'
                      : 'bg-[#C1443B] hover:bg-[#D64D43] text-white'
                  }`}
                >
                  <Radio className="w-4 h-4" />
                  <span>{streamStatus === 'live' ? 'End Broadcast' : 'Start Stream'}</span>
                </button>
              </div>

            </div>

          </div>
        )}

        {/* TAB 2: UPLOAD VIDEO */}
        {activeTab === 'upload' && (
          <div className="max-w-3xl mx-auto bg-[#161418] border border-[#2A262E] rounded-lg p-6 space-y-6">
            
            <div className="flex items-center gap-2.5 border-b border-[#2A262E] pb-4">
              <OnionRingsIcon size={20} className="text-[#D9A441]" />
              <h2 className="text-lg font-semibold text-[#F2EFEA]">Upload Video on Demand</h2>
            </div>

            {uploadSuccess ? (
              <div className="py-12 flex flex-col items-center justify-center text-center space-y-4">
                <div className="w-12 h-12 rounded-full bg-[#C1443B]/20 text-[#C1443B] flex items-center justify-center">
                  <Check className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-semibold text-[#F2EFEA]">Video Published Successfully!</h3>
                <p className="text-xs text-[#948E96] max-w-sm">
                  Your video is now processing in 4K UHD and will be available across Onion search and recommendations shortly.
                </p>
                <button
                  onClick={() => { setUploadSuccess(false); setUploadProgress(0); setUploadTitle(''); }}
                  className="px-4 py-2 bg-[#1D1A20] border border-[#2A262E] rounded-md text-xs font-medium text-[#F2EFEA] hover:bg-[#2A262E]"
                >
                  Upload Another Video
                </button>
              </div>
            ) : (
              <form onSubmit={handleSimulateUpload} className="space-y-5">
                
                {/* File Dropzone */}
                <div className="border-2 border-dashed border-[#2A262E] hover:border-[#C1443B] rounded-lg p-8 flex flex-col items-center justify-center text-center cursor-pointer bg-[#1D1A20]/30 transition-colors">
                  <FileVideo className="w-10 h-10 text-[#C1443B] mb-2" />
                  <p className="text-sm font-medium text-[#F2EFEA]">Drag and drop video files here</p>
                  <p className="text-xs text-[#948E96] mt-1">MP4, MOV, or MKV up to 50GB. 4K 60fps supported.</p>
                </div>

                {/* Form Inputs */}
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs text-[#948E96] font-medium">Video Title</label>
                    <input
                      type="text"
                      placeholder="e.g. Subterranean Quantum Signal Analysis"
                      value={uploadTitle}
                      onChange={(e) => setUploadTitle(e.target.value)}
                      className="w-full bg-[#1D1A20] border border-[#2A262E] rounded-md px-3 py-2 text-xs text-[#F2EFEA] focus:border-[#C1443B] focus:outline-none"
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs text-[#948E96] font-medium">Description</label>
                    <textarea
                      rows={3}
                      placeholder="Detail the technical aspects or story behind your video..."
                      value={uploadDesc}
                      onChange={(e) => setUploadDesc(e.target.value)}
                      className="w-full bg-[#1D1A20] border border-[#2A262E] rounded-md px-3 py-2 text-xs text-[#F2EFEA] focus:border-[#C1443B] focus:outline-none resize-none"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs text-[#948E96] font-medium">Category</label>
                    <select
                      value={uploadCategory}
                      onChange={(e) => setUploadCategory(e.target.value)}
                      className="w-full bg-[#1D1A20] border border-[#2A262E] rounded-md px-3 py-2 text-xs text-[#F2EFEA] focus:border-[#C1443B] focus:outline-none"
                    >
                      <option value="Sci-Fi & Cyber">Sci-Fi & Cyber</option>
                      <option value="Music & Sound">Music & Sound</option>
                      <option value="Tech & Code">Tech & Code</option>
                      <option value="Documentary">Documentary</option>
                    </select>
                  </div>
                </div>

                {/* Progress Bar when uploading */}
                {isUploading && (
                  <div className="space-y-1.5 pt-2">
                    <div className="flex justify-between text-xs text-[#948E96]">
                      <span>Uploading high bitrate master...</span>
                      <span className="font-mono text-[#C1443B]">{uploadProgress}%</span>
                    </div>
                    <div className="w-full h-2 bg-[#1D1A20] rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-[#C1443B] transition-all duration-300"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Submit CTA */}
                <button
                  type="submit"
                  disabled={isUploading || !uploadTitle}
                  className="w-full py-3 rounded-md bg-[#C1443B] hover:bg-[#D64D43] disabled:opacity-50 text-white font-semibold text-sm transition-all shadow-md flex items-center justify-center gap-2"
                >
                  <Upload className="w-4 h-4" />
                  <span>{isUploading ? 'Processing Video...' : 'Publish Video'}</span>
                </button>
              </form>
            )}

          </div>
        )}

      </div>
    </div>
  );
};
