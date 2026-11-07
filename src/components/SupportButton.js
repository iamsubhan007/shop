'use client';

import { usePathname } from 'next/navigation';
import { MessageCircle } from 'lucide-react';
import { useSite } from '@/context/SiteContext';

// Customer support chat (separate from the automatic owner order notifications).
export default function SupportButton() {
  const path = usePathname();
  const { settings } = useSite();
  if (path?.startsWith('/admin') || !settings?.shop.whatsapp) return null;
  const m = path?.match(/^\/orders\/([^/]+)/);
  const text = m ? 'Hello Haq Bahu Tandoor, I need help with my order.' : 'Hello Haq Bahu Tandoor, I have a question.';
  return (
    <a
      href={`https://wa.me/${settings.shop.whatsapp}?text=${encodeURIComponent(text)}`}
      target="_blank"
      rel="noreferrer"
      aria-label="Chat with us on WhatsApp"
      className="fixed bottom-4 right-4 z-40 w-13 h-13 p-3.5 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg flex items-center justify-center"
    >
      <MessageCircle size={24} />
    </a>
  );
}
