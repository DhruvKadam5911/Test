import React, { useState } from 'react';
import { Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import WatchPage from './pages/WatchPage';
import WheelDemo from './pages/WheelDemo';
import MusicPage from './pages/MusicPage';
import GenrePage from './pages/GenrePage';
import SplashIntro from './components/SplashIntro';

export default function App() {
  const [showSplash, setShowSplash] = useState(true);

  return (
    <>
      {showSplash && <SplashIntro onDone={() => setShowSplash(false)} />}
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/watch/:videoId" element={<WatchPage />} />
        <Route path="/music" element={<MusicPage />} />
        <Route path="/genre/:genre" element={<GenrePage />} />
        {/* Demo surface for PickerWheel — not linked from the app. */}
        <Route path="/wheel" element={<WheelDemo />} />
      </Routes>
    </>
  );
}
