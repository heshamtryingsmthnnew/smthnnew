import 'katex/dist/katex.min.css';
import type { Metadata } from 'next';
import { Geist } from 'next/font/google';
import './globals.css';

const geist = Geist({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Ergo.',
  description: 'The answer, and the proof.',
  openGraph: {
    title: 'Ergo.',
    description: 'The answer, and the proof.',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geist.className} antialiased`}>{children}</body>
    </html>
  );
}
