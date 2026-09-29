import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { Icon } from './Icon';

const ToastContext = createContext<(message: string, tone?: 'success' | 'error') => void>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ message: string; tone: string } | null>(null);
  const notify = useMemo(() => (message: string, tone: 'success' | 'error' = 'success') => {
    setToast({ message, tone });
    window.setTimeout(() => setToast(null), 3200);
  }, []);
  return (
    <ToastContext.Provider value={notify}>
      {children}
      {toast && <div className={`toast toast-${toast.tone}`}><Icon name={toast.tone === 'success' ? 'check' : 'info'} />{toast.message}</div>}
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
