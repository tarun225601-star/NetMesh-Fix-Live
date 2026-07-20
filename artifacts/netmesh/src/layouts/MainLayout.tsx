import React from 'react';

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <main style={{ flex: 1, padding: '20px' }}>
        {children}
      </main>
    </div>
  );
}
