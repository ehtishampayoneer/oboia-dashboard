import './globals.css';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from '../context/AuthContext';
import { LanguageProvider } from '../context/LanguageContext';
import { CurrencyProvider } from '../context/CurrencyContext';

export const metadata = {
  title: 'OBOIA — Wallpaper Shop Management',
  description: 'Professional wallpaper business management platform',
  icons: {
    icon: '/favicon.ico',
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <LanguageProvider>
            <CurrencyProvider>
              {children}
              <Toaster
                position="top-right"
                toastOptions={{
                  duration: 4000,
                  style: {
                    background: '#15181D',
                    color: '#F5F5F5',
                    border: '1px solid #2A2D35',
                    borderRadius: '10px',
                    fontSize: '14px',
                  },
                  success: {
                    iconTheme: {
                      primary: '#22C55E',
                      secondary: '#15181D',
                    },
                  },
                  error: {
                    iconTheme: {
                      primary: '#EF4444',
                      secondary: '#15181D',
                    },
                  },
                }}
              />
            </CurrencyProvider>
          </LanguageProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
