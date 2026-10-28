'use client';

import { useState, useRef, useEffect } from 'react';

export default function ChatWindow({ chatHistory, setChatHistory, backendUrl, loading, setLoading }) {
  const [chatInput, setChatInput] = useState('');
  const chatHistoryRef = useRef(null);

  // Scroll to bottom of chat history
  useEffect(() => {
    if (chatHistoryRef.current) {
      chatHistoryRef.current.scrollTop = chatHistoryRef.current.scrollHeight;
    }
  }, [chatHistory]);

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
    <div className="bg-white rounded-lg shadow-lg border border-gray-200">
      <div className="h-[450px] overflow-y-auto p-4 bg-gray-50 border-b border-gray-200" ref={chatHistoryRef}>
        {chatHistory.map((msg, index) => (
          <div
            key={index}
            className={`mb-4 p-3 rounded-lg max-w-[80%] shadow-sm text-sm break-words
              ${msg.role === 'user' ? 'bg-blue-100 ml-auto rounded-br-none' : 'bg-white mr-auto rounded-bl-none border border-gray-200'}`}
          >
            <strong className={`font-semibold ${msg.role === 'user' ? 'text-blue-800' : 'text-gray-800'}`}>
              {msg.role === 'user' ? 'You:' : 'Assistant:'}
            </strong>{' '}
            {msg.content}
            {msg.role === 'assistant' && msg.rewritten_query && (
              <details className="text-xs text-gray-600 mt-2 cursor-pointer">
                <summary className="font-medium hover:text-gray-800">Rewritten Query</summary>
                <p className="bg-gray-100 border-l-2 border-gray-300 pl-2 py-1 mt-1 rounded-sm italic">
                  {msg.rewritten_query}
                </p>
              </details>
            )}
            {msg.role === 'assistant' && msg.sources && msg.sources.length > 0 && (
              <details className="text-xs text-gray-600 mt-2 cursor-pointer">
                <summary className="font-medium hover:text-gray-800">Sources ({msg.sources.length})</summary>
                <div className="bg-gray-100 border-l-2 border-blue-400 pl-2 py-1 mt-1 rounded-sm">
                  {msg.sources.map((source, sIdx) => (
                    <div key={sIdx} className="mb-1 last:mb-0">
                      <strong className="text-blue-700">{source.source_type === 'pdf' ? '📄 PDF' : '🌐 Web'}:</strong>{' '}
                      {source.source_name} (Page: {source.page})
                      <br />
                      <span className="italic">{source.content_preview}</span>
                    </div>
                  ))}
                </div>
              </details>
            )}
            {msg.role === 'assistant' && msg.is_relevant === false && (
                <p className="text-xs text-red-600 mt-2 font-medium">
                    (Note: This response is a fallback as relevant information was not found or query was outside scope.)
                </p>
            )}
          </div>
        ))}
        {loading && (
          <div className="mb-4 p-3 rounded-lg max-w-[80%] shadow-sm text-sm bg-white mr-auto rounded-bl-none border border-gray-200">
            <strong className="font-semibold text-gray-800">Assistant:</strong> Thinking...
          </div>
        )}
      </div>

      <form onSubmit={handleChatSubmit} className="flex p-4 border-t border-gray-200 bg-white">
        <input
          type="text"
          value={chatInput}
          onChange={(e) => setChatInput(e.target.value)}
          placeholder="Ask a question about the restaurant..."
          disabled={loading}
          className="flex-grow p-3 border border-gray-300 rounded-full focus:ring-blue-500 focus:border-blue-500 text-base shadow-sm mr-3"
        />
        <button
          type="submit"
          disabled={loading}
          className="px-6 py-3 bg-blue-600 text-white font-semibold rounded-full shadow-md
                     hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-75
                     disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors duration-200"
        >
          Send
        </button>
      </form>
    </div>
  );
}