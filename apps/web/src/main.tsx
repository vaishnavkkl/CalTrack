import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { AuthProvider } from './app/AuthContext';
import { ToastProvider } from './app/ToastContext';
import App from './App';
import './index.css';
import './workspace.css';
import './theme.css';
import { ThemeProvider } from './app/ThemeContext';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider><BrowserRouter>
      <AuthProvider>
        <ToastProvider><App /></ToastProvider>
      </AuthProvider>
    </BrowserRouter></ThemeProvider>
  </StrictMode>
);
