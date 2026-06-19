import { ReactNode, useState } from 'react';
import { CaretLeft, CaretRight } from '@phosphor-icons/react';
import { LAYOUT } from '../../lib/constants';

interface MainLayoutProps {
  sidebar: ReactNode;
  children: ReactNode;
}

export function MainLayout({ sidebar, children }: MainLayoutProps) {
  const [collapsed, setCollapsed] = useState(false);

  const sidebarWidth = collapsed ? 0 : LAYOUT.controlPanelWidth;

  return (
    <div
      className="flex"
      style={{ paddingTop: LAYOUT.navHeight, minHeight: '100vh' }}
    >
      {/* Sidebar */}
      <aside
        className="thin-scrollbar fixed left-0 overflow-y-auto bg-surface"
        style={{
          top: LAYOUT.navHeight,
          width: sidebarWidth,
          height: `calc(100vh - ${LAYOUT.navHeight}px)`,
          borderRight: collapsed ? 'none' : '1px solid var(--color-border)',
          transition:
            'width 300ms var(--ease-out-expo), border 300ms',
          overflow: collapsed ? 'hidden' : 'auto',
          zIndex: 'var(--z-sidebar)',
        }}
      >
        <div style={{ width: LAYOUT.controlPanelWidth, minWidth: LAYOUT.controlPanelWidth }}>
          {sidebar}
        </div>
      </aside>

      {/* Toggle button */}
      <button
        onClick={() => setCollapsed((c) => !c)}
        title={collapsed ? '展开侧边栏' : '收起侧边栏'}
        style={{
          position: 'fixed',
          top: `calc(${LAYOUT.navHeight}px + 50vh)`,
          left: collapsed ? 8 : sidebarWidth - 14,
          transform: 'translateY(-50%)',
          zIndex: 15,
          width: 22,
          height: 44,
          borderRadius: '0 8px 8px 0',
          border: '1px solid var(--color-border)',
          backgroundColor: 'var(--color-surface)',
          color: 'var(--color-ink-secondary)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: collapsed
            ? '0 1px 4px rgba(0,0,0,0.08)'
            : 'none',
          transition: 'left 300ms var(--ease-out-expo), box-shadow 200ms',
          padding: 0,
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.color = 'var(--color-ink)';
          (e.currentTarget as HTMLElement).style.backgroundColor =
            'var(--color-canvas)';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.color =
            'var(--color-ink-secondary)';
          (e.currentTarget as HTMLElement).style.backgroundColor =
            'var(--color-surface)';
        }}
      >
        {collapsed ? (
          <CaretRight size={12} weight="bold" />
        ) : (
          <CaretLeft size={12} weight="bold" />
        )}
      </button>

      {/* Main content */}
      <main
        className="flex-1 overflow-y-auto"
        style={{
          marginLeft: sidebarWidth,
          padding: '24px',
          minHeight: `calc(100vh - ${LAYOUT.navHeight}px)`,
          transition: 'margin-left 300ms var(--ease-out-expo)',
        }}
      >
        {children}
      </main>
    </div>
  );
}
