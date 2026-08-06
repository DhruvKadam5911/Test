export interface Creator {
  id: string;
  name: string;
  handle: string;
  avatar: string;
  followers: string;
  verified?: boolean;
  isLive?: boolean;
}

export interface Video {
  id: string;
  title: string;
  description: string;
  thumbnail: string;
  videoUrl?: string;
  duration?: string;
  category: string;
  creator: Creator;
  views: string;
  publishedAt: string;
  isLive?: boolean;
  viewersCount?: string;
  progress?: number; // 0 to 100 percentage for Continue Watching
  isOriginal?: boolean;
  tags?: string[];
  likeCount?: string;
}

export interface ChatMessage {
  id: string;
  user: string;
  avatar: string;
  message: string;
  timestamp: string;
  isMod?: boolean;
  isSubscriber?: boolean;
  badge?: string;
  color?: string;
}

export type PageView = 'home' | 'watch' | 'studio' | 'auth';
export type AuthMode = 'login' | 'signup';
export type WatchMode = 'live' | 'vod';
export type StudioTab = 'golive' | 'upload';
