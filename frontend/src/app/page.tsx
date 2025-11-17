'use client';

import { useEffect, useState } from 'react';

export default function Home() {
  const [backendMessage, setBackendMessage] = useState('');

  useEffect(() => {
    const fetchBackend = async () => {
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/`);
        const data = await res.text(); // Use .json() if your backend sends JSON
        setBackendMessage(data);
      } catch (err) {
        console.error('Failed to fetch from backend:', err);
        setBackendMessage('Error connecting to backend');
      }
    };

    fetchBackend();
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center">
      <div>
        <h1 className="text-3xl font-bold mb-4">Frontend Connected</h1>
        <p className="text-lg">{backendMessage}</p>
      </div>
    </main>
  );
}
