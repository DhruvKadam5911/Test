import React, { useState } from 'react';
import type { AuthMode, PageView } from '../types';
import { OnionRingsIcon } from '../components/OnionRingsIcon';
import { OnionHeroRings } from '../components/OnionHeroRings';
import { Lock, Mail, User, ArrowRight, Check } from 'lucide-react';

interface AuthPageProps {
  setActivePage: (page: PageView) => void;
}

export const AuthPage: React.FC<AuthPageProps> = ({ setActivePage }) => {
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitted(true);
    setTimeout(() => {
      setActivePage('home');
    }, 1200);
  };

  return (
    <div className="relative min-h-[calc(100vh-4rem)] flex items-center justify-center bg-[#0A0A0B] py-12 px-4 overflow-hidden">
      
      {/* Signature Concentric Ring Background Motif */}
      <OnionHeroRings opacity={0.12} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none" />

      {/* Centered Auth Card */}
      <div className="relative z-10 w-full max-w-md bg-[#161418] border border-[#2A262E] rounded-xl p-8 shadow-2xl space-y-6">
        
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center p-3 rounded-full bg-[#1D1A20] border border-[#2A262E] mb-1">
            <OnionRingsIcon size={28} className="text-[#C1443B]" />
          </div>
          <h1 className="font-display font-semibold text-2xl text-[#F2EFEA] tracking-tight">
            {mode === 'login' ? 'Welcome back to onion' : 'Create your onion account'}
          </h1>
          <p className="text-xs text-[#948E96]">
            {mode === 'login' 
              ? 'Enter your credentials to access your library and streams.' 
              : 'Join the next generation dark minimal streaming platform.'}
          </p>
        </div>

        {isSubmitted ? (
          <div className="py-8 flex flex-col items-center justify-center text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-[#C1443B]/20 text-[#C1443B] flex items-center justify-center">
              <Check className="w-6 h-6" />
            </div>
            <p className="text-sm font-semibold text-[#F2EFEA]">
              {mode === 'login' ? 'Logging in...' : 'Account created successfully!'}
            </p>
            <p className="text-xs text-[#948E96]">Redirecting to your feed...</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            
            {/* Username input for Signup */}
            {mode === 'signup' && (
              <div className="space-y-1.5">
                <label className="text-xs text-[#948E96] font-medium">Username</label>
                <div className="relative flex items-center">
                  <User className="w-4 h-4 text-[#948E96] absolute left-3 pointer-events-none" />
                  <input
                    type="text"
                    required
                    placeholder="e.g. kaitovex"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full bg-[#1D1A20] border border-[#2A262E] rounded-md pl-9 pr-3 py-2 text-xs text-[#F2EFEA] placeholder-[#948E96] focus:border-[#C1443B] focus:outline-none"
                  />
                </div>
              </div>
            )}

            {/* Email field */}
            <div className="space-y-1.5">
              <label className="text-xs text-[#948E96] font-medium">Email address</label>
              <div className="relative flex items-center">
                <Mail className="w-4 h-4 text-[#948E96] absolute left-3 pointer-events-none" />
                <input
                  type="email"
                  required
                  placeholder="name@domain.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-[#1D1A20] border border-[#2A262E] rounded-md pl-9 pr-3 py-2 text-xs text-[#F2EFEA] placeholder-[#948E96] focus:border-[#C1443B] focus:outline-none"
                />
              </div>
            </div>

            {/* Password field */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label className="text-xs text-[#948E96] font-medium">Password</label>
                {mode === 'login' && (
                  <button 
                    type="button" 
                    onClick={() => alert('Password reset link sent to your email.')}
                    className="text-[11px] text-[#C1443B] hover:underline"
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <div className="relative flex items-center">
                <Lock className="w-4 h-4 text-[#948E96] absolute left-3 pointer-events-none" />
                <input
                  type="password"
                  required
                  placeholder="••••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-[#1D1A20] border border-[#2A262E] rounded-md pl-9 pr-3 py-2 text-xs text-[#F2EFEA] placeholder-[#948E96] focus:border-[#C1443B] focus:outline-none"
                />
              </div>
            </div>

            {/* Terms checkbox for Signup */}
            {mode === 'signup' && (
              <div className="flex items-start gap-2 pt-1">
                <input
                  type="checkbox"
                  id="terms"
                  required
                  checked={agreeTerms}
                  onChange={(e) => setAgreeTerms(e.target.checked)}
                  className="mt-0.5 rounded border-[#2A262E] bg-[#1D1A20] text-[#C1443B] focus:ring-0 cursor-pointer"
                />
                <label htmlFor="terms" className="text-[11px] text-[#948E96] cursor-pointer leading-tight">
                  I agree to the Onion Terms of Service and Privacy Policy.
                </label>
              </div>
            )}

            {/* Submit CTA */}
            <button
              type="submit"
              className="w-full py-2.5 rounded-md bg-[#C1443B] hover:bg-[#D64D43] text-white font-semibold text-xs transition-all shadow-md flex items-center justify-center gap-2 mt-2 focus-visible:ring-2 focus-visible:ring-[#C1443B]"
            >
              <span>{mode === 'login' ? 'Log In' : 'Create Account'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        )}

        {/* Footer Mode Switcher */}
        <div className="border-t border-[#2A262E] pt-4 text-center text-xs text-[#948E96]">
          {mode === 'login' ? (
            <p>
              Don't have an onion account?{' '}
              <button
                type="button"
                onClick={() => setMode('signup')}
                className="text-[#F2EFEA] font-medium hover:text-[#C1443B] underline underline-offset-4 ml-1 transition-colors"
              >
                Sign up
              </button>
            </p>
          ) : (
            <p>
              Already have an account?{' '}
              <button
                type="button"
                onClick={() => setMode('login')}
                className="text-[#F2EFEA] font-medium hover:text-[#C1443B] underline underline-offset-4 ml-1 transition-colors"
              >
                Log in
              </button>
            </p>
          )}
        </div>

      </div>
    </div>
  );
};
