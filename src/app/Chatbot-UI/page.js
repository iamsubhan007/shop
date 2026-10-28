'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Upload, FileText, Bot, User, AlertCircle, ChevronDown, Link as LinkIcon } from 'lucide-react';

export default function ChatbotUIPage() {
  const [chatInput, setChatInput] = useState('');
  const [chatHistory, setChatHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pdfFile, setPdfFile] = useState(null);
  const chatHistoryRef = useRef(null);

  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

  // Scroll to bottom of chat history
  useEffect(() => {
    if (chatHistoryRef.current) {
      chatHistoryRef.current.scrollTop = chatHistoryRef.current.scrollHeight;
    }
  }, [chatHistory]);

  const handlePdfUpload = async () => {
    if (!pdfFile) {
      alert('Please select a PDF file to upload.');
      return;
    }

    setLoading(true);
    const formData = new FormData();
    formData.append('file', pdfFile);

    try {
      const response = await fetch(`${backendUrl}/upload-pdf/`, {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        const data = await response.json();
        alert(`Success: ${data.message}`);
        setChatHistory(prev => [...prev, {
          role: 'assistant',
          content: `Successfully loaded document: ${data.filename}. I can now answer questions based on its content.`,
          is_relevant: true
        }]);
        setPdfFile(null);
      } else {
        const errorData = await response.json();
        alert(`Error uploading PDF: ${errorData.detail || response.statusText}`);
      }
    } catch (error) {
      console.error('PDF upload failed:', error);
      alert('Failed to connect to the backend for PDF upload. Check console for details and ensure backend is running.');
    } finally {
      setLoading(false);
    }
  };

  const handleChatSubmit = async (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const userMessage = { role: 'user', content: chatInput };
    setChatHistory(prev => [...prev, userMessage]);
    setChatInput('');
    setLoading(true);

    try {
      const response = await fetch(`${backendUrl}/chat/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prompt: userMessage.content }),
      });

      if (response.ok) {
        const data = await response.json();
        const assistantMessage = {
          role: 'assistant',
          content: data.answer,
          sources: data.sources,
          rewritten_query: data.rewritten_query,
          is_relevant: data.is_relevant
        };
        setChatHistory(prev => [...prev, assistantMessage]);
      } else {
        const errorData = await response.json();
        const errorMessage = {
          role: 'assistant',
          content: `Error from chatbot: ${errorData.detail || response.statusText}`,
          is_relevant: false
        };
        setChatHistory(prev => [...prev, errorMessage]);
        console.error('Chat API error:', errorData);
      }
    } catch (error) {
      console.error('Chat request failed:', error);
      const errorMessage = {
        role: 'assistant',
        content: "I'm sorry, I am currently experiencing technical difficulties. Please try again in a moment. If the issue persists, kindly contact the restaurant owner.",
        is_relevant: false
      };
      setChatHistory(prev => [...prev, errorMessage]);
      alert('Failed to connect to the chatbot. Check console for details and ensure backend is running.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-56px)] bg-zinc-100 flex flex-col">

      {/* Page Header */}
      <div className="bg-zinc-950 px-6 py-6 text-center">
        <div className="flex items-center justify-center gap-2 mb-1">
          <div className="w-8 h-8 bg-red-700/20 rounded-full flex items-center justify-center">
            <Bot className="text-red-400" size={18} />
          </div>
          <h1 className="text-lg font-bold text-white">Restaurant AI Assistant</h1>
        </div>
        <p className="text-zinc-400 text-xs">Upload your menu PDF, then ask questions</p>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col max-w-3xl mx-auto w-full px-4 py-6 gap-4">

        {/* PDF Upload Card */}
        <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-zinc-100">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 bg-red-50 rounded-lg flex items-center justify-center">
                <Upload size={14} className="text-red-700" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-zinc-900">Upload Restaurant Documents</h2>
                <p className="text-xs text-zinc-400">PDF format — menu, FAQs, policies</p>
              </div>
            </div>
          </div>
          <div className="px-5 py-4">
            <div className="flex flex-col sm:flex-row gap-3">
              {/* File input styled */}
              <label className="flex-1 cursor-pointer">
                <div className={`flex items-center gap-2.5 px-4 py-2.5 border-2 border-dashed rounded-xl transition-colors
                  ${pdfFile ? 'border-red-400 bg-red-50' : 'border-zinc-200 bg-zinc-50 hover:border-zinc-300 hover:bg-zinc-100'}`}>
                  <FileText size={16} className={pdfFile ? 'text-red-600' : 'text-zinc-400'} />
                  <span className={`text-sm truncate ${pdfFile ? 'text-red-700 font-medium' : 'text-zinc-400'}`}>
                    {pdfFile ? pdfFile.name : 'Choose PDF file...'}
                  </span>
                </div>
                <input
                  type="file"
                  accept=".pdf"
                  onChange={(e) => setPdfFile(e.target.files ? e.target.files[0] : null)}
                  disabled={loading}
                  className="sr-only"
                />
              </label>

              <button
                onClick={handlePdfUpload}
                disabled={loading || !pdfFile}
                className="flex items-center justify-center gap-2 px-5 py-2.5 bg-red-700 hover:bg-red-600
                  text-white text-sm font-semibold rounded-xl shadow-sm
                  disabled:bg-zinc-300 disabled:text-zinc-500 disabled:cursor-not-allowed
                  transition-colors duration-150 flex-shrink-0"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload size={14} />
                    Train Chatbot
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Chat window */}
        <div className="flex-1 bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden flex flex-col">

          {/* Chat history */}
          <div
            ref={chatHistoryRef}
            className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[400px] max-h-[480px] bg-zinc-50/60"
          >
            {/* Welcome message */}
            {chatHistory.length === 0 && (
              <div className="flex flex-col items-center justify-center h-48 text-center">
                <div className="w-14 h-14 bg-red-50 rounded-2xl flex items-center justify-center mb-3">
                  <Bot size={28} className="text-red-700" />
                </div>
                <p className="text-sm font-medium text-zinc-700">Ready to help!</p>
                <p className="text-xs text-zinc-400 mt-1">Upload a PDF then ask questions about the restaurant</p>
              </div>
            )}

            {chatHistory.map((msg, index) => (
              <div
                key={index}
                className={`flex gap-2.5 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
              >
                {/* Avatar */}
                <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5
                  ${msg.role === 'user' ? 'bg-red-700' : 'bg-zinc-200'}`}>
                  {msg.role === 'user'
                    ? <User size={14} className="text-white" />
                    : <Bot size={14} className="text-zinc-600" />
                  }
                </div>

                {/* Bubble */}
                <div className={`max-w-[78%] flex flex-col gap-1`}>
                  <div className={`px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed break-words
                    ${msg.role === 'user'
                      ? 'bg-red-700 text-white rounded-tr-sm'
                      : 'bg-white border border-zinc-200 text-zinc-800 rounded-tl-sm shadow-sm'
                    }`}>
                    {msg.content}
                  </div>

                  {/* Fallback note */}
                  {msg.role === 'assistant' && msg.is_relevant === false && (
                    <div className="flex items-center gap-1.5 px-1">
                      <AlertCircle size={11} className="text-amber-500 flex-shrink-0" />
                      <p className="text-[10px] text-amber-600">
                        Fallback response — relevant info not found
                      </p>
                    </div>
                  )}

                  {/* Rewritten query (collapsed) */}
                  {msg.role === 'assistant' && msg.rewritten_query && (
                    <details className="cursor-pointer px-1">
                      <summary className="text-[10px] text-zinc-400 hover:text-zinc-600 transition-colors flex items-center gap-1 list-none">
                        <ChevronDown size={11} />
                        Rewritten query
                      </summary>
                      <p className="text-[10px] text-zinc-500 italic mt-1 pl-3 border-l-2 border-zinc-200">
                        {msg.rewritten_query}
                      </p>
                    </details>
                  )}

                  {/* Sources (collapsed) */}
                  {msg.role === 'assistant' && msg.sources && msg.sources.length > 0 && (
                    <details className="cursor-pointer px-1">
                      <summary className="text-[10px] text-zinc-400 hover:text-zinc-600 transition-colors flex items-center gap-1 list-none">
                        <LinkIcon size={10} />
                        {msg.sources.length} source{msg.sources.length !== 1 ? 's' : ''}
                      </summary>
                      <div className="mt-1.5 space-y-1.5 pl-2 border-l-2 border-blue-200">
                        {msg.sources.map((source, sIdx) => (
                          <div key={sIdx} className="text-[10px] text-zinc-500">
                            <span className="font-semibold text-blue-600">
                              {source.source_type === 'pdf' ? 'PDF' : 'Web'}:
                            </span>
                            {' '}{source.source_name} (Page: {source.page})
                            <p className="italic text-zinc-400 mt-0.5 line-clamp-2">{source.content_preview}</p>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              </div>
            ))}

            {/* Loading indicator */}
            {loading && (
              <div className="flex gap-2.5">
                <div className="w-7 h-7 rounded-full bg-zinc-200 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Bot size={14} className="text-zinc-600" />
                </div>
                <div className="bg-white border border-zinc-200 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
                  <div className="flex gap-1 items-center h-4">
                    <div className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
                    <div className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
                    <div className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce" />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Input bar */}
          <form onSubmit={handleChatSubmit} className="flex items-center gap-2 px-4 py-3 border-t border-zinc-100 bg-white">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Ask about the restaurant..."
              disabled={loading}
              className="flex-1 px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-full text-sm text-zinc-800
                placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600
                disabled:opacity-50 transition-all"
            />
            <button
              type="submit"
              disabled={loading || !chatInput.trim()}
              className="w-10 h-10 bg-red-700 hover:bg-red-600 text-white rounded-full flex items-center justify-center
                disabled:bg-zinc-300 disabled:cursor-not-allowed transition-colors shadow-sm flex-shrink-0"
              aria-label="Send message"
            >
              <Send size={16} />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}