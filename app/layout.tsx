import type { Metadata } from 'next';
import './globals.css';
import './editorial.css';
import { AudioProvider } from '@/components/audio-provider';
export const metadata: Metadata = {
  title: 'Love Journal · Our Little World',
  description: '收藏日常、纪念日、心愿与一起走过的每一天。',
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body><AudioProvider>{children}</AudioProvider></body>
    </html>
  );
}
