import React, { useState } from 'react';
import { Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import WatchPage from './pages/WatchPage';
import SplashIntro from './components/SplashIntro';

export default function App() {
  const [showSplash, setShowSplash] = useState(true);

  return (
    <>
      {showSplash && <SplashIntro onDone={() => setShowSplash(false)} />}
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/watch/:videoId" element={<WatchPage />} />
      </Routes>
    </>
  );
}
