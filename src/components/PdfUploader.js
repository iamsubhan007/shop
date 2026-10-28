'use client';

import { useState } from 'react';

export default function PdfUploader({ onUploadSuccess, backendUrl, loading, setLoading }) {
  const [pdfFile, setPdfFile] = useState(null);

  const handlePdfUpload = async () => {
    if (!pdfFile) {
      alert('Please select a PDF file to upload.');
      return;
    }

    setLoading(true); // Propagate loading state up to parent
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
        if (onUploadSuccess) {
          onUploadSuccess(data.filename); // Notify parent of success
        }
        setPdfFile(null); // Clear file input
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

  return (
    <div className="bg-gray-50 p-6 rounded-lg shadow-sm mb-6 border border-gray-200">
      <h2 className="text-xl font-semibold text-gray-700 mb-4">Upload Restaurant Documents (PDFs)</h2>
      <p className="text-gray-600 mb-4">Please upload your restaurant's menu, FAQs, policies, etc., in PDF format to train the chatbot.</p>
      <div className="flex flex-col sm:flex-row items-start sm:items-center space-y-3 sm:space-y-0 sm:space-x-4">
        <input
          type="file"
          accept=".pdf"
          onChange={(e) => setPdfFile(e.target.files ? e.target.files[0] : null)}
          disabled={loading}
          className="block w-full text-sm text-gray-500
                     file:mr-4 file:py-2 file:px-4
                     file:rounded-full file:border-0
                     file:text-sm file:font-semibold
                     file:bg-blue-50 file:text-blue-700
                     hover:file:bg-blue-100"
        />
        <button
          onClick={handlePdfUpload}
          disabled={loading || !pdfFile}
          className="px-6 py-2 bg-green-600 text-white font-semibold rounded-md shadow-md
                     hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-opacity-75
                     disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors duration-200"
        >
          {loading ? 'Uploading...' : 'Train Chatbot with PDF'}
        </button>
      </div>
      {pdfFile && <p className="mt-3 text-sm text-gray-600">Selected file: <span className="font-medium">{pdfFile.name}</span></p>}
    </div>
  );
}