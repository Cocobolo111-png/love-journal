import type { Metadata } from 'next';
import { publishedJournal } from '@/lib/publication';
import './globals.css';
import './editorial.css';
import { AudioProvider } from '@/components/audio-provider';
export const metadata: Metadata = {
  title: publishedJournal ? '予你 · Our Little World' : 'Love Journal · Our Little World',
  description: '收藏日常、纪念日、心愿与一起走过的每一天。',
  icons: { icon: '/favicon.svg' },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body style={publishedJournal ? { '--journal-botanical-image': "url('/botanical-portal-warm.jpg')" } as React.CSSProperties : undefined}><AudioProvider>{children}</AudioProvider></body>
    </html>
  );
}
