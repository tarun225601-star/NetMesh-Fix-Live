import React from 'react';

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      minHeight: '100vh',
      position: 'relative'
    }}>
      {/* Main Content Area */}
      <main style={{ flex: 1, padding: '20px' }}>
        {children}
      </main>
      
      {/* Footer Area */}
      <footer style={{ 
        padding: '20px', 
        display: 'flex', 
        justifyContent: 'center', 
        gap: '20px', 
        borderTop: '1px solid #ccc',
        backgroundColor: '#f9f9f9',
        marginTop: 'auto'
      }}>
        <a href="https://www.youtube.com" target="_blank" rel="noopener noreferrer">
          <img src="https://cdn-icons-png.flaticon.com/512/1384/1384060.png" alt="YouTube" width="30" height="30" />
        </a>
        <a href="https://www.instagram.com" target="_blank" rel="noopener noreferrer">
          <img src="https://cdn-icons-png.flaticon.com/512/1384/1384063.png" alt="Instagram" width="30" height="30" />
        </a>
      </footer>
    </div>
  );
}
