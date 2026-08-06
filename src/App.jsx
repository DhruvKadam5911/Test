import React from 'react';
import { Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import WatchPage from './pages/WatchPage';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/watch/:videoId" element={<WatchPage />} />
    </Routes>
  );
}
