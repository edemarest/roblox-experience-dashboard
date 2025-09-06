import React from 'react';

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-root">
      <div className="sidebar">
        <div className="brand">Roblox Stats</div>
        <nav>
          <a href="/">Home</a>
          <a href="/universes">Universes</a>
          <a href="/radar">Radar</a>
          <a href="/admin">Admin</a>
        </nav>
      </div>
      <div className="main">
        {children}
      </div>
    </div>
  );
}
