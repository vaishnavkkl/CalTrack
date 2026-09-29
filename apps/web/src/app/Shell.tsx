import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { useAuth } from './AuthContext';
import { Icon } from './Icon';
import { initials } from './format';
import { ThemeToggle } from './ThemeContext';
import { ZoomControl } from './ZoomControl';

const titles: Record<string, { title: string; subtitle: string }> = {
  '/dashboard': { title: 'Overview', subtitle: 'One view from RFO discovery through response approval' },
  '/opportunities': { title: 'Find RFOs', subtitle: 'Technology opportunities from your connected sources' },
  '/bid-decisions': { title: 'Prepare bids', subtitle: 'Qualify RFOs and publish clear sourcing briefs' },
  '/talent-sourcing': { title: 'Candidates', subtitle: 'Source candidates against approved role requirements' },
  '/response-review': { title: 'Responses', subtitle: 'Complete documentation and control final response approval' },
  '/portal-controls': { title: 'Source registry', subtitle: 'Manage collection sources and connector health' },
  '/collection-jobs': { title: 'Collection activity', subtitle: 'Track source runs, changes, and warnings' },
  '/settings': { title: 'Settings', subtitle: 'Tune relevance and account preferences' },
};

export function Shell() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [search, setSearch] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const pageIcon = ({ '/dashboard': 'dashboard', '/opportunities': 'search', '/bid-decisions': 'briefcase', '/talent-sourcing': 'users', '/response-review': 'checklist', '/portal-controls': 'portal', '/collection-jobs': 'jobs', '/settings': 'settings' } as Record<string, string>)[location.pathname] || 'dashboard';
  const meta = titles[location.pathname] || titles['/dashboard'];
  const isManagement = user?.role === 'super_admin';
  const navigation = [
    { to: '/opportunities', label: 'Find RFOs', icon: 'search', show: isManagement },
    { to: '/bid-decisions', label: 'Prepare bids', icon: 'briefcase', show: isManagement },
    { to: '/response-review', label: 'Responses', icon: 'checklist', show: isManagement },
    { to: '/talent-sourcing', label: 'Candidates', icon: 'users', show: true },
    { to: '/dashboard', label: 'Overview', icon: 'dashboard', show: true },

  ].filter((item) => item.show);

  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', focusSearch);
    return () => window.removeEventListener('keydown', focusSearch);
  }, []);

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    if (search.trim()) navigate(`/opportunities?q=${encodeURIComponent(search.trim())}`);
  };

  return (
    <div className="app-shell"><a className="skip-link" href="#main-content">Skip to content</a>
      {menuOpen && <button className="nav-scrim" onClick={() => setMenuOpen(false)} aria-label="Close navigation" />}
      <aside className={`sidebar ${menuOpen ? 'sidebar-open' : ''}`}>
        <div className="brand-lockup brand-lockup-light">
          <div className="brand-mark"><img src="/caltrack-mark.svg" alt="" /></div>
          <div><strong>CalTrack</strong><small>Procurement intelligence</small></div>
        </div>
        <div className="nav-section-label">WORKSPACE</div>
        <nav aria-label="Main navigation">
          {navigation.map((item) => (
            <NavLink key={item.to} to={item.to} onClick={() => setMenuOpen(false)}
              className={({ isActive }) => isActive ? 'nav-link nav-link-active' : 'nav-link'}>
              <Icon name={item.icon} /><span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
        {isManagement && <details className="workspace-tools" open={['/settings', '/portal-controls', '/collection-jobs'].includes(location.pathname) || undefined}>
          <summary>Workspace settings</summary>
          <NavLink className="nav-link" to="/portal-controls" onClick={() => setMenuOpen(false)}><Icon name="portal" />Sources</NavLink>
          <NavLink className="nav-link" to="/collection-jobs" onClick={() => setMenuOpen(false)}><Icon name="jobs" />Collection history</NavLink>
          <NavLink className="nav-link" to="/settings" onClick={() => setMenuOpen(false)}><Icon name="settings" />Preferences</NavLink>
        </details>}
        <div className="sidebar-source">
          <div className="source-head">YOUR WORKSPACE</div>
          <strong>{isManagement ? 'Bid manager' : 'Sourcing member'}</strong>
          <small>{user?.role === 'sourcing_user' ? 'Approved briefs only' : 'Full bid-flow visibility'}</small>
        </div>
        <div className="sidebar-user">
          <div className="avatar">{initials(user?.email)}</div>
          <div><strong>{user?.displayName || 'CalTrack account'}</strong><small>@{user?.username || user?.email}</small></div>
          <button title="Sign out" onClick={() => void logout()}><Icon name="logout" size={17} /></button>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <button className="menu-button" aria-label="Open navigation" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}><Icon name="menu" /></button>
          <div className="page-title"><h1><Icon name={pageIcon} size={21} />{meta.title}</h1><p>{meta.subtitle}</p></div>
          {isManagement && <form className="global-search" onSubmit={submitSearch}>
            <Icon name="search" /><input ref={searchRef} value={search} onChange={(event) => setSearch(event.target.value)}
              aria-label="Search RFOs" placeholder="Search RFOs…" /><kbd>Ctrl K</kbd>
          </form>}
          <ZoomControl /><ThemeToggle />
          <div className="top-avatar">{initials(user?.email)}</div>
        </header>
        <main id="main-content" className="page-content">
            <Outlet /></main>
      </div>
    </div>
  );
}
