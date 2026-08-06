import React, { createContext, useContext, useState, useEffect } from "react";
import api from "../api/client";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => {
    try {
      return localStorage.getItem("onion_token") || null;
    } catch {
      return null;
    }
  });

  const [user, setUser] = useState(() => {
    try {
      const savedUser = localStorage.getItem("onion_user");
      return savedUser ? JSON.parse(savedUser) : null;
    } catch {
      return null;
    }
  });

  const saveAuth = (newToken, newUser) => {
    setToken(newToken);
    setUser(newUser);
    try {
      if (newToken) localStorage.setItem("onion_token", newToken);
      else localStorage.removeItem("onion_token");

      if (newUser) localStorage.setItem("onion_user", JSON.stringify(newUser));
      else localStorage.removeItem("onion_user");
    } catch (e) {
      console.warn("Storage not available:", e);
    }
  };

  const login = async (email, password) => {
    const data = await api.post("/auth/login", { email, password });
    saveAuth(data.token, data.user);
    return data;
  };

  const signup = async (email, username, password) => {
    const data = await api.post("/auth/signup", { email, username, password });
    saveAuth(data.token, data.user);
    return data;
  };

  const logout = () => {
    saveAuth(null, null);
  };

  return (
    <AuthContext.Provider value={{ token, user, isLoggedIn: Boolean(token), login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

export default AuthContext;
