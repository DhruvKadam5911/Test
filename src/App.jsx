import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import Home from './pages/Home';
import WatchPage from './pages/WatchPage';
import AuthPage from './pages/AuthPage';

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/watch/:videoId" element={<WatchPage />} />
        <Route path="/auth" element={<AuthPage />} />
      </Routes>
    </AuthProvider>
  );
}
