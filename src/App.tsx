import { useState } from 'react';
import type { PageView, Video } from './types';
import { HERO_ORIGINAL } from './data/mockData';
import { Navbar } from './components/Navbar';
import { Footer } from './components/Footer';
import { HomePage } from './pages/HomePage';
import { WatchPage } from './pages/WatchPage';
import { StudioPage } from './pages/StudioPage';
import { AuthPage } from './pages/AuthPage';

export function App() {
  const [activePage, setActivePage] = useState<PageView>('home');
  const [selectedVideo, setSelectedVideo] = useState<Video>(HERO_ORIGINAL);

  const handleSelectVideo = (video: Video) => {
    setSelectedVideo(video);
    setActivePage('watch');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-[#0A0A0B] text-[#F2EFEA] flex flex-col font-sans selection:bg-[#C1443B] selection:text-white">
      
      {/* Sticky Navigation Header */}
      <Navbar 
        activePage={activePage} 
        setActivePage={(page) => {
          setActivePage(page);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        onSearch={() => {
          setActivePage('home');
        }}
      />

      {/* Main View Router */}
      <main className="flex-1">
        {activePage === 'home' && (
          <HomePage 
            onSelectVideo={handleSelectVideo} 
          />
        )}

        {activePage === 'watch' && (
          <WatchPage 
            currentVideo={selectedVideo}
            onSelectVideo={handleSelectVideo}
          />
        )}

        {activePage === 'studio' && (
          <StudioPage />
        )}

        {activePage === 'auth' && (
          <AuthPage setActivePage={setActivePage} />
        )}
      </main>

      {/* Footer */}
      <Footer />
    </div>
  );
}

export default App;
