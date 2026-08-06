import React, { useState } from 'react';
import type { ChatMessage } from '../types';
import { MOCK_CHAT_MESSAGES } from '../data/mockData';
import { OnionRingsIcon } from './OnionRingsIcon';
import { Send, Smile, MessageSquare, Info } from 'lucide-react';

export const LiveChat: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>(MOCK_CHAT_MESSAGES);
  const [newMessage, setNewMessage] = useState('');

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim()) return;

    const msg: ChatMessage = {
      id: `m-${Date.now()}`,
      user: 'You',
      avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?q=80&w=100&auto=format&fit=crop',
      message: newMessage.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isSubscriber: true,
      color: '#C1443B'
    };

    setMessages((prev) => [...prev, msg]);
    setNewMessage('');
  };

  return (
    <div className="bg-[#161418] border border-[#2A262E] rounded-lg h-full flex flex-col overflow-hidden shadow-xl">
      
      {/* Header */}
      <div className="px-4 py-3 bg-[#1D1A20] border-b border-[#2A262E] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <OnionRingsIcon size={16} className="text-[#C1443B]" />
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[#F2EFEA]">
            Stream Chat
          </h3>
        </div>
        <span className="text-[10px] text-[#948E96] font-mono flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-[#C1443B] animate-pulse" />
          Slow Mode (2s)
        </span>
      </div>

      {/* Chat Messages List */}
      <div className="flex-1 p-4 overflow-y-auto space-y-3 no-scrollbar min-h-[300px] max-h-[500px]">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-[#948E96]">
            <MessageSquare className="w-8 h-8 text-[#2A262E] mb-2" />
            <p className="text-xs font-medium text-[#F2EFEA]">No messages yet in this layer.</p>
            <p className="text-[11px] text-[#948E96] mt-1">Be the first to say hello to the stream community.</p>
          </div>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className="flex items-start gap-2.5 text-xs leading-relaxed group">
              <img 
                src={msg.avatar} 
                alt={msg.user}
                className="w-5 h-5 rounded-full object-cover shrink-0 mt-0.5"
              />
              <div className="flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {msg.isMod && (
                    <span className="px-1 py-0.2 rounded bg-[#C1443B]/20 text-[#C1443B] text-[9px] font-bold uppercase">
                      MOD
                    </span>
                  )}
                  {msg.isSubscriber && (
                    <span className="px-1 py-0.2 rounded bg-[#D9A441]/20 text-[#D9A441] text-[9px] font-bold uppercase">
                      SUB
                    </span>
                  )}
                  <span 
                    className="font-semibold text-[#F2EFEA] hover:underline cursor-pointer"
                    style={{ color: msg.color || '#F2EFEA' }}
                  >
                    {msg.user}
                  </span>
                  <span className="text-[10px] text-[#948E96]/60 ml-auto">
                    {msg.timestamp}
                  </span>
                </div>
                <p className="text-[#F2EFEA]/90 text-[12.5px] mt-0.5 break-words">
                  {msg.message}
                </p>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Rules Notice */}
      <div className="px-3 py-1.5 bg-[#0A0A0B]/60 border-t border-[#2A262E]/60 text-[10px] text-[#948E96] flex items-center gap-1.5">
        <Info className="w-3 h-3 text-[#D9A441] shrink-0" />
        <span className="truncate">Keep it respectful. Follow Onion community guidelines.</span>
      </div>

      {/* Input Form */}
      <form onSubmit={handleSendMessage} className="p-3 bg-[#1D1A20] border-t border-[#2A262E] flex items-center gap-2">
        <div className="relative flex-1">
          <input
            type="text"
            placeholder="Send a message..."
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            className="w-full bg-[#161418] border border-[#2A262E] rounded-md px-3 py-2 text-xs text-[#F2EFEA] placeholder-[#948E96] focus:outline-none focus:border-[#C1443B]"
          />
          <button
            type="button"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-[#948E96] hover:text-[#D9A441] transition-colors"
            title="Insert Emote"
          >
            <Smile className="w-4 h-4" />
          </button>
        </div>

        <button
          type="submit"
          disabled={!newMessage.trim()}
          className="p-2 rounded-md bg-[#C1443B] hover:bg-[#D64D43] disabled:opacity-40 disabled:hover:bg-[#C1443B] text-white transition-colors focus-visible:ring-1 focus-visible:ring-[#C1443B]"
          aria-label="Send Message"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
};
