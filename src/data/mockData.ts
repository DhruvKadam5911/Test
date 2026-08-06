import type { Video, ChatMessage } from '../types';

export const HERO_ORIGINAL: Video = {
  id: 'original-silo-2099',
  title: 'SILO 2099: Subterranean Shift',
  description: 'In a fractured city built downward into the earth, a rogue atmospheric engineer uncovers illegal quantum signal arrays broadcasting from the forgotten 40th subterranean ring level.',
  thumbnail: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?q=80&w=1600&auto=format&fit=crop',
  videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4',
  duration: '48m',
  category: 'Sci-Fi / Original',
  isOriginal: true,
  creator: {
    id: 'onion-studios',
    name: 'Onion Originals',
    handle: '@onionoriginals',
    avatar: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=200&auto=format&fit=crop',
    followers: '2.4M',
    verified: true,
  },
  views: '1.2M views',
  publishedAt: '2 days ago',
  tags: ['Cyberpunk', 'Dystopian', '4K UHD', 'Dolby Atmos', 'Onion Exclusive'],
  likeCount: '142K'
};

export const LIVE_NOW_VIDEOS: Video[] = [
  {
    id: 'live-cyber-synth',
    title: 'Midnight Synthwave Jam & Live Coding Modular Rigs',
    description: 'Building custom generative audio patches in Max/MSP live with realtime visuals.',
    thumbnail: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?q=80&w=800&auto=format&fit=crop',
    isLive: true,
    viewersCount: '14,892',
    category: 'Music & Audio',
    creator: {
      id: 'kaito-wave',
      name: 'Kaito Vex',
      handle: '@kaitovex',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=200&auto=format&fit=crop',
      followers: '380K',
      verified: true
    },
    views: '14.8K live',
    publishedAt: 'Started 2h ago',
    tags: ['Live Music', 'Synthwave', 'Modular']
  },
  {
    id: 'live-speedrun-zero',
    title: 'World Record Attempt: NeoTokyo 2088 Any% No Glitches',
    description: 'Pacing for sub-45 minute run. Final boss route optimization.',
    thumbnail: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=800&auto=format&fit=crop',
    isLive: true,
    viewersCount: '8,410',
    category: 'Gaming',
    creator: {
      id: 'apex-run',
      name: 'ApexSpeed',
      handle: '@apexspeed',
      avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=200&auto=format&fit=crop',
      followers: '195K',
      verified: true
    },
    views: '8.4K live',
    publishedAt: 'Started 45m ago',
    tags: ['Speedrun', 'Hardcore', 'Ranked']
  },
  {
    id: 'live-tokyo-walk',
    title: 'Rainy Night Shibuya Alley Exploration & Ramen Secrets',
    description: 'Binaural audio stroll through hidden alleyways of Tokyo in 4K high bitrate.',
    thumbnail: 'https://images.unsplash.com/photo-1503899036084-c55cdd92da26?q=80&w=800&auto=format&fit=crop',
    isLive: true,
    viewersCount: '22,105',
    category: 'IRL / Travel',
    creator: {
      id: 'tokyo-drift',
      name: 'Sora Lens',
      handle: '@soralens',
      avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?q=80&w=200&auto=format&fit=crop',
      followers: '920K',
      verified: true
    },
    views: '22.1K live',
    publishedAt: 'Started 3h ago',
    tags: ['IRL', 'Tokyo', 'ASMR Audio']
  },
  {
    id: 'live-ai-future',
    title: 'Building Autonomous Drone Swarms with Rust & Embedded Linux',
    description: 'Refactoring telemetry parsing pipeline for low latency mesh communication.',
    thumbnail: 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?q=80&w=800&auto=format&fit=crop',
    isLive: true,
    viewersCount: '5,630',
    category: 'Tech & Code',
    creator: {
      id: 'byte-master',
      name: 'Dr. Elena Vance',
      handle: '@elenavance',
      avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?q=80&w=200&auto=format&fit=crop',
      followers: '410K',
      verified: true
    },
    views: '5.6K live',
    publishedAt: 'Started 1h ago',
    tags: ['Rust', 'Robotics', 'Hardware']
  }
];

export const CONTINUE_WATCHING_VIDEOS: Video[] = [
  {
    id: 'cw-quantum-arch',
    title: 'Architectures of Tomorrow: The Orbital Ring Colony',
    description: 'Deep dive into structural tension mechanics and rotational gravity systems.',
    thumbnail: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=800&auto=format&fit=crop',
    duration: '52m',
    progress: 68,
    category: 'Documentary',
    creator: {
      id: 'horizon-doc',
      name: 'Horizon Cosmos',
      handle: '@horizoncosmos',
      avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?q=80&w=200&auto=format&fit=crop',
      followers: '640K',
      verified: true
    },
    views: '450K views',
    publishedAt: '3 days ago'
  },
  {
    id: 'cw-deep-sea',
    title: 'Abyssal Trench Expedition: Unmapped Hydrothermal Vents',
    description: 'High-definition subsea footage captured at 6,000 meters below sea level.',
    thumbnail: 'https://images.unsplash.com/photo-1682687220063-4742bd7fd538?q=80&w=800&auto=format&fit=crop',
    duration: '1h 14m',
    progress: 35,
    category: 'Exploration',
    creator: {
      id: 'ocean-deep',
      name: 'Nautilus Lab',
      handle: '@nautiluslab',
      avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?q=80&w=200&auto=format&fit=crop',
      followers: '880K',
      verified: true
    },
    views: '890K views',
    publishedAt: '1 week ago'
  },
  {
    id: 'cw-lofi-space',
    title: 'Orbital Station Radio — 24/7 Deep Space Ambient Beats',
    description: 'Chilled analog synthesizer soundscapes for focus and late night coding.',
    thumbnail: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?q=80&w=800&auto=format&fit=crop',
    duration: '3h 30m',
    progress: 88,
    category: 'Music',
    creator: {
      id: 'orbit-sound',
      name: 'Astral Freq',
      handle: '@astralfreq',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=200&auto=format&fit=crop',
      followers: '1.1M',
      verified: true
    },
    views: '3.2M views',
    publishedAt: '2 weeks ago'
  },
  {
    id: 'cw-cyberpunk-cinema',
    title: 'The Aesthetic of Chrome: Cinema Analysis of Neo-Noir',
    description: 'Deconstructing visual lighting, volumetric smoke, and high contrast color grading.',
    thumbnail: 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?q=80&w=800&auto=format&fit=crop',
    duration: '32m',
    progress: 15,
    category: 'Film & Media',
    creator: {
      id: 'cine-frame',
      name: 'Frame Analysis',
      handle: '@frameanalysis',
      avatar: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?q=80&w=200&auto=format&fit=crop',
      followers: '310K',
      verified: false
    },
    views: '120K views',
    publishedAt: '4 days ago'
  }
];

export const TRENDING_VIDEOS: Video[] = [
  {
    id: 'tr-onion-chronicles',
    title: 'ONION ORIGINALS: The Inner Core (Episode 1)',
    description: 'When the central atmosphere node flickers, an underground technician realizes the surface world was never abandoned.',
    thumbnail: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?q=80&w=1200&auto=format&fit=crop',
    duration: '56m',
    category: 'Onion Original',
    isOriginal: true,
    creator: {
      id: 'onion-studios',
      name: 'Onion Originals',
      handle: '@onionoriginals',
      avatar: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=200&auto=format&fit=crop',
      followers: '2.4M',
      verified: true
    },
    views: '2.8M views',
    publishedAt: 'Yesterday',
    tags: ['4K', 'HDR', 'Original Series']
  },
  {
    id: 'tr-ghost-protocol',
    title: 'Zero-Day Vulnerabilities in Quantum Satellite Networks',
    description: 'A comprehensive investigation into dark satellite downlinks and cryptographic exploits.',
    thumbnail: 'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?q=80&w=1200&auto=format&fit=crop',
    duration: '42m',
    category: 'Cybersecurity',
    creator: {
      id: 'null-pointer',
      name: 'NullSec Research',
      handle: '@nullsec',
      avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?q=80&w=200&auto=format&fit=crop',
      followers: '750K',
      verified: true
    },
    views: '1.4M views',
    publishedAt: '5 days ago'
  },
  {
    id: 'tr-iceland-volcano',
    title: 'Inside the Magma Chamber: Drone FPV Thermal Descent',
    description: 'Flying specialized heat-shielded FPV drones directly into active volcanic fissures in Iceland.',
    thumbnail: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?q=80&w=1200&auto=format&fit=crop',
    duration: '28m',
    category: 'Extreme Outdoor',
    creator: {
      id: 'pyro-flight',
      name: 'Thermal Drones',
      handle: '@thermaldrones',
      avatar: 'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?q=80&w=200&auto=format&fit=crop',
      followers: '530K',
      verified: true
    },
    views: '980K views',
    publishedAt: '6 days ago'
  },
  {
    id: 'tr-ai-filmmaking',
    title: 'Generative Cinema: Short Sci-Fi Film Created in 72 Hours',
    description: 'Combining neural rendering engines, procedural audio, and synthetic voices into a seamless short film.',
    thumbnail: 'https://images.unsplash.com/photo-1634017839464-5c339ebe3cb4?q=80&w=1200&auto=format&fit=crop',
    duration: '18m',
    category: 'AI Cinema',
    creator: {
      id: 'synth-film',
      name: 'Neuron Motion',
      handle: '@neuronmotion',
      avatar: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?q=80&w=200&auto=format&fit=crop',
      followers: '420K',
      verified: true
    },
    views: '2.1M views',
    publishedAt: '1 week ago'
  }
];

export const MOCK_CHAT_MESSAGES: ChatMessage[] = [
  {
    id: 'm-1',
    user: 'CyberSamurai',
    avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?q=80&w=100&auto=format&fit=crop',
    message: 'The reverb routing on that lead synth sound is incredible 🔥',
    timestamp: '21:04',
    isSubscriber: true,
    color: '#D9A441'
  },
  {
    id: 'm-2',
    user: 'FluxDev',
    avatar: 'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?q=80&w=100&auto=format&fit=crop',
    message: 'What buffer size are you running on the DSP interface right now?',
    timestamp: '21:04',
    isMod: true,
    color: '#C1443B'
  },
  {
    id: 'm-3',
    user: 'Aetheria',
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?q=80&w=100&auto=format&fit=crop',
    message: 'Just joined! Is this patch built from scratch tonight?',
    timestamp: '21:05',
    color: '#948E96'
  },
  {
    id: 'm-4',
    user: 'KaitoVex_Official',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=100&auto=format&fit=crop',
    message: 'Yes! 64-sample buffer, locked at 96kHz. Glad you all like the spatial delay node!',
    timestamp: '21:05',
    isMod: true,
    isSubscriber: true,
    color: '#C1443B'
  },
  {
    id: 'm-5',
    user: 'ZeroLatency',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=100&auto=format&fit=crop',
    message: 'Onion stream bitrate looking crisp at 1440p 60fps',
    timestamp: '21:06',
    isSubscriber: true,
    color: '#F2EFEA'
  }
];

export const CATEGORIES = [
  'All Content',
  'Onion Originals',
  'Live Streams',
  'Sci-Fi & Cyber',
  'Gaming & Esports',
  'Music & Sound',
  'Tech & Code',
  'Documentary'
];
