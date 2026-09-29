import { useEffect, useRef } from 'react';

const leaveEvent = 'caltrack:before-leave-editor';
export function canLeaveEditor() {
  return window.dispatchEvent(new Event(leaveEvent, { cancelable: true }));
}

// Guard explicit in-app navigation and browser unload without writing sensitive drafts to storage.
export function useDraftGuard(dirty: boolean, saving: boolean, save: () => void) {
  const current = useRef({ dirty, saving, save });
  current.current = { dirty, saving, save };
  useEffect(() => {
    const guard = (event: Event) => {
      if (current.current.saving || (current.current.dirty && !window.confirm('You have unsaved changes. Leave without saving?'))) event.preventDefault();
    };
    const unload = (event: BeforeUnloadEvent) => {
      if (current.current.dirty || current.current.saving) { event.preventDefault(); event.returnValue = ''; }
    };
    const navigate = (event: MouseEvent) => {
      if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      const link = (event.target as Element)?.closest<HTMLAnchorElement>('a[href]');
      if (!link || link.target === '_blank' || link.hasAttribute('download')) return;
      const next = new URL(link.href, location.href);
      if (next.origin === location.origin && next.pathname === location.pathname && next.search === location.search) return;
      if (!canLeaveEditor()) { event.preventDefault(); event.stopPropagation(); }
    };
    const shortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        if (current.current.dirty && !current.current.saving) current.current.save();
      }
    };
    window.addEventListener(leaveEvent, guard);
    window.addEventListener('beforeunload', unload);
    window.addEventListener('keydown', shortcut);
    document.addEventListener('click', navigate, true);
    return () => {
      window.removeEventListener(leaveEvent, guard);
      window.removeEventListener('beforeunload', unload);
      window.removeEventListener('keydown', shortcut);
      document.removeEventListener('click', navigate, true);
    };
  }, []);
}
