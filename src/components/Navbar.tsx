import React, { useState } from 'react';
import type { PageView } from '../types';
import { OnionRingsIcon } from './OnionRingsIcon';
import { 
  Search, 
  Bell, 
  Video as VideoIcon, 
  User, 
  Menu, 
  X,
  Radio,
  Compass,
  Film
} from 'lucide-react';

interface NavbarProps {
  activePage: PageView;
  setActivePage: (page: PageView) => void;
  onSearch?: (query: string) => void;
}

export const Navbar: React.FC<NavbarProps> = ({ 
  activePage, 
  setActivePage,
  onSearch 
}) => {
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  const notifications = [
    { id: 1, title: 'Kaito Vex went live', subtitle: 'Midnight Synthwave Jam', time: '5m ago' },
    { id: 2, title: 'Onion Original Released', subtitle: 'SILO 2099 Episode 2 is now available', time: '1h ago' },
    { id: 3, title: 'Upload complete', subtitle: 'Your 4K video process finished rendering', time: '3h ago' }
  ];

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (onSearch) onSearch(searchQuery);
  };

  return (
    <header className="sticky top-0 z-50 bg-[#0A0A0B]/90 backdrop-blur-md border-b border-[#2A262E]/60 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        
        {/* Left: Brand Logo & Navigation */}
        <div className="flex items-center gap-8">
          <button 
            onClick={() => setActivePage('home')}
            className="flex items-center gap-2.5 group focus-visible:ring-2 focus-visible:ring-[#C1443B] rounded-sm p-1 transition-opacity"
            aria-label="onion home"
          >
            <div className="relative flex items-center justify-center">
              <OnionRingsIcon size={26} className="text-[#C1443B] group-hover:scale-110 transition-transform" />
            </div>
            <span className="font-display font-semibold text-2xl tracking-tight text-[#F2EFEA]">
              onion
            </span>
          </button>

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center gap-1 text-sm font-medium">
            <button
              onClick={() => setActivePage('home')}
              className={`px-3 py-1.5 rounded-md flex items-center gap-2 transition-colors ${
                activePage === 'home' 
                  ? 'text-[#F2EFEA] bg-[#161418]' 
                  : 'text-[#948E96] hover:text-[#F2EFEA] hover:bg-[#161418]/60'
              }`}
            >
              <Compass className="w-4 h-4 text-[#C1443B]" />
              <span>Browse</span>
            </button>

            <button
              onClick={() => setActivePage('watch')}
              className={`px-3 py-1.5 rounded-md flex items-center gap-2 transition-colors ${
                activePage === 'watch' 
                  ? 'text-[#F2EFEA] bg-[#161418]' 
                  : 'text-[#948E96] hover:text-[#F2EFEA] hover:bg-[#161418]/60'
              }`}
            >
              <Radio className="w-4 h-4 text-[#C1443B]" />
              <span className="flex items-center gap-1.5">
                Live
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#C1443B] animate-ping" />
              </span>
            </button>

            <button
              onClick={() => setActivePage('home')}
              className="px-3 py-1.5 rounded-md text-[#948E96] hover:text-[#F2EFEA] hover:bg-[#161418]/60 transition-colors flex items-center gap-2"
            >
              <Film className="w-4 h-4 text-[#D9A441]" />
              <span>Originals</span>
            </button>
          </nav>
        </div>

        {/* Right: Search, Notifications, Go Live CTA, Profile */}
        <div className="flex items-center gap-3">
          
          {/* Expandable Search Input */}
          <form onSubmit={handleSearchSubmit} className="relative flex items-center">
            {searchOpen ? (
              <div className="flex items-center bg-[#161418] border border-[#2A262E] rounded-md px-3 py-1.5 w-48 sm:w-64 transition-all">
                <Search className="w-4 h-4 text-[#948E96] shrink-0 mr-2" />
                <input
                  type="text"
                  placeholder="Search streams, shows..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-transparent text-sm text-[#F2EFEA] placeholder-[#948E96] focus:outline-none w-full"
                  autoFocus
                />
                <button 
                  type="button" 
                  onClick={() => setSearchOpen(false)}
                  className="text-[#948E96] hover:text-[#F2EFEA] ml-1"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setSearchOpen(true)}
                className="p-2 text-[#948E96] hover:text-[#F2EFEA] hover:bg-[#161418] rounded-md transition-colors"
                aria-label="Open search"
              >
                <Search className="w-5 h-5" />
              </button>
            )}
          </form>

          {/* Notifications Bell Dropdown */}
          <div className="relative">
            <button
              onClick={() => setNotificationsOpen(!notificationsOpen)}
              className="p-2 text-[#948E96] hover:text-[#F2EFEA] hover:bg-[#161418] rounded-md transition-colors relative"
              aria-label="Notifications"
            >
              <Bell className="w-5 h-5" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#C1443B]" />
            </button>

            {notificationsOpen && (
              <div className="absolute right-0 mt-2 w-80 bg-[#161418] border border-[#2A262E] rounded-lg shadow-2xl py-2 z-50">
                <div className="px-4 py-2 border-b border-[#2A262E] flex items-center justify-between">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-[#948E96]">Notifications</h4>
                  <span className="text-[10px] bg-[#C1443B]/20 text-[#C1443B] px-1.5 py-0.5 rounded font-medium">2 new</span>
                </div>
                <div className="divide-y divide-[#2A262E]/40 max-h-64 overflow-y-auto no-scrollbar">
                  {notifications.map((n) => (
                    <div key={n.id} className="px-4 py-3 hover:bg-[#1D1A20] transition-colors cursor-pointer flex gap-3">
                      <div className="mt-0.5">
                        <OnionRingsIcon size={14} className="text-[#C1443B]" />
                      </div>
                      <div className="flex-1">
                        <p className="text-xs font-medium text-[#F2EFEA]">{n.title}</p>
                        <p className="text-[11px] text-[#948E96] mt-0.5 line-clamp-1">{n.subtitle}</p>
                        <span className="text-[10px] text-[#948E96]/80 mt-1 block">{n.time}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Go Live / Creator Button */}
          <button
            onClick={() => setActivePage('studio')}
            className={`px-3.5 py-1.5 rounded-md font-medium text-xs sm:text-sm flex items-center gap-2 transition-all ${
              activePage === 'studio'
                ? 'bg-[#F2EFEA] text-[#0A0A0B]'
                : 'bg-[#C1443B] hover:bg-[#D64D43] text-white shadow-md'
            }`}
          >
            <VideoIcon className="w-4 h-4" />
            <span>Go Live</span>
          </button>

          {/* Auth / User Profile */}
          <button
            onClick={() => setActivePage('auth')}
            className="w-8 h-8 rounded-md bg-[#1D1A20] border border-[#2A262E] flex items-center justify-center text-[#F2EFEA] hover:border-[#C1443B] transition-colors overflow-hidden shrink-0"
            title="Account & Auth"
          >
            <img 
              src="https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?q=80&w=100&auto=format&fit=crop" 
              alt="User Avatar"
              className="w-full h-full object-cover"
            />
          </button>

          {/* Mobile Hamburger Toggle */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 text-[#948E96] hover:text-[#F2EFEA] hover:bg-[#161418] rounded-md"
            aria-label="Toggle Menu"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-[#2A262E] bg-[#0A0A0B] px-4 py-4 space-y-3">
          <button
            onClick={() => { setActivePage('home'); setMobileMenuOpen(false); }}
            className={`w-full text-left px-3 py-2 rounded-md font-medium text-sm flex items-center gap-3 ${
              activePage === 'home' ? 'bg-[#161418] text-[#F2EFEA]' : 'text-[#948E96]'
            }`}
          >
            <Compass className="w-4 h-4 text-[#C1443B]" /> Browse
          </button>
          <button
            onClick={() => { setActivePage('watch'); setMobileMenuOpen(false); }}
            className={`w-full text-left px-3 py-2 rounded-md font-medium text-sm flex items-center gap-3 ${
              activePage === 'watch' ? 'bg-[#161418] text-[#F2EFEA]' : 'text-[#948E96]'
            }`}
          >
            <Radio className="w-4 h-4 text-[#C1443B]" /> Live Streams
          </button>
          <button
            onClick={() => { setActivePage('studio'); setMobileMenuOpen(false); }}
            className={`w-full text-left px-3 py-2 rounded-md font-medium text-sm flex items-center gap-3 ${
              activePage === 'studio' ? 'bg-[#161418] text-[#F2EFEA]' : 'text-[#948E96]'
            }`}
          >
            <VideoIcon className="w-4 h-4 text-[#C1443B]" /> Creator Studio
          </button>
          <button
            onClick={() => { setActivePage('auth'); setMobileMenuOpen(false); }}
            className="w-full text-left px-3 py-2 rounded-md font-medium text-sm text-[#948E96] flex items-center gap-3"
          >
            <User className="w-4 h-4 text-[#D9A441]" /> Account / Auth
          </button>
        </div>
      )}
    </header>
  );
};
