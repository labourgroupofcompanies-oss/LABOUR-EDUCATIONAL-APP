import { useState, useEffect } from 'react';
import SchoolOnboarding from './components/SchoolOnboarding';
import LandingPage from './components/LandingPage';
import LoginPage from './components/Auth/LoginPage';
import HeadteacherDashboard from './components/Headteacher/HeadteacherDashboard';
import TeacherDashboard from './components/Teacher/TeacherDashboard';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { ToastContainer } from './components/Common/Toast';
import { ConfirmDialogContainer } from './components/Common/ConfirmDialog';
import { PromotionDialogContainer } from './components/Common/PromotionDialogs';
import { syncManager } from './services/syncManager';
import DeveloperPortal from './components/Developer/DeveloperPortal';
import AccountantDashboard from './components/Accountant/AccountantDashboard';
import ReloadPrompt from './components/Common/ReloadPrompt';
import OfflineIndicator from './components/Common/OfflineIndicator';
import ErrorBoundary from './components/Common/ErrorBoundary';
import './App.css';

/**
 * Main Router Component that handles Role-based Access and Auth status
 */
function AppRouter() {
  const { user, isAuthenticated, isLoading, hasSchool } = useAuth();
  const [view, setView] = useState<'intro' | 'onboarding' | 'login' | null>(null);
  const [initTimeout, setInitTimeout] = useState(false);

  // Safety timeout: If system doesn't initialize in 8 seconds, something is wrong
  useEffect(() => {
    const timer = setTimeout(() => {
      if (isLoading || hasSchool === null) {
        console.warn('System initialization taking longer than expected...');
        setInitTimeout(true);
      }
    }, 8000);
    return () => clearTimeout(timer);
  }, [isLoading, hasSchool]);

  // Request Storage Persistence to prevent browser from clearing data
  useEffect(() => {
    if (navigator.storage && navigator.storage.persist) {
      navigator.storage.persist().then(persistent => {
        if (persistent) {
          console.log("🔒 Storage Persistence: GURANTEED. Browser will not clear local data.");
        } else {
          console.info("ℹ️ Storage Persistence: BEST EFFORT. Browser may clear data if disk is very low. (Standard Behavior)");
        }
      });
    }
  }, []);


  // Initialize sync manager when school is available
  useEffect(() => {
    if (user?.schoolId) {
      syncManager.init(user.schoolId);
    } else {
      syncManager.stop();
    }
  }, [user?.schoolId]);

  // Sync view with auth and school status
  useEffect(() => {
    if ((!isLoading && hasSchool !== null) || initTimeout) {
      if (isAuthenticated) return;

      if (!view) {
        // If a secure invite token is present in the URL, route to onboarding.
        // Otherwise, always default to login. The developer account can login 
        // to generate the token.
        const searchParams = new URLSearchParams(window.location.search);
        const inviteToken = searchParams.get('invite');
        
        if (inviteToken) {
          setView('onboarding');
        } else {
          setView('login');
        }
      }
    }
  }, [isLoading, hasSchool, isAuthenticated, view, initTimeout]);

  // On logout: always redirect to login if a school is already registered.
  // Without this, the view could remain 'onboarding' from the initial load.
  useEffect(() => {
    if (!isAuthenticated && !isLoading && hasSchool) {
      setView('login');
    }
  }, [isAuthenticated, isLoading, hasSchool]);

  if ((isLoading || hasSchool === null) && !initTimeout) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f9fafb]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
          <p className="text-gray-500 font-bold animate-pulse">Initializing System...</p>
        </div>
      </div>
    );
  }

  // Authenticated Views (Dashboard Container)
  if (isAuthenticated && user) {
    return (
      <div className="min-h-screen md:p-4 lg:p-8 relative z-50">
        <ErrorBoundary name={`${user.role} Portal`}>
            {/* Headteacher → full school management dashboard */}
            {user.role?.toLowerCase() === 'headteacher' && <HeadteacherDashboard />}

            {/* Accountant → Full financial and payroll dashboard */}
            {user.role?.toLowerCase() === 'accountant' && <AccountantDashboard />}

            {/* Staff (teachers, general staff) → staff dashboard */}
            {(user.role?.toLowerCase() === 'staff' || user.role?.toLowerCase() === 'teacher') && <TeacherDashboard />}

            {/* Developer → Developer Portal command center */}
            {user.role?.toLowerCase() === 'developer' && <DeveloperPortal />}

            {/* Error State for unrecognized roles */}
            {!['headteacher', 'accountant', 'staff', 'teacher', 'developer'].includes(user.role?.toLowerCase() || '') && (
              <div className="flex items-center justify-center p-12 text-center bg-red-50 rounded-3xl border border-red-100 m-8">
                <div>
                  <i className="fas fa-user-shield text-4xl text-red-500 mb-4"></i>
                  <h2 className="text-xl font-bold text-red-600">Unauthorized Role</h2>
                  <p className="text-red-500">Your account role is not recognized. Please contact your headteacher.</p>
                </div>
              </div>
            )}
        </ErrorBoundary>
      </div>
    );
  }

  // Unauthenticated Views (Direct Render)
  if (view === 'intro') {
    return <LandingPage
      onStart={() => setView('onboarding')}
      onLogin={() => setView('login')}
    />;
  }

  if (view === 'onboarding') {
    return (
      <SchoolOnboarding 
        onComplete={() => {
          // Clear the invite param from URL after successful onboarding
          window.history.replaceState({}, document.title, window.location.pathname);
          window.location.reload();
        }} 
        onLogin={() => {
          window.history.replaceState({}, document.title, window.location.pathname);
          setView('login');
        }} 
      />
    );
  }

  // Default to Login
  return (
    <LoginPage
      onOnboardingStart={() => setView('onboarding')}
      showRegisterLink={false} // Hidden for security, only accessible via ?invite= link
    />
  );
}


function App() {
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    const handleError = (error: ErrorEvent) => {
      console.error('Fatal App Error:', error);
      setHasError(true);
    };
    window.addEventListener('error', handleError);
    return () => window.removeEventListener('error', handleError);
  }, []);

  if (hasError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-red-50 p-8 text-center">
        <div className="max-w-md bg-white p-10 rounded-[2.5rem] shadow-2xl border border-red-100">
          <i className="fas fa-exclamation-triangle text-5xl text-red-500 mb-6"></i>
          <h2 className="text-2xl font-black text-gray-900 mb-2">System Interruption</h2>
          <p className="text-gray-500 font-medium mb-8">A critical error occurred while initializing the interface.</p>
          <button
            onClick={() => window.location.reload()}
            className="w-full py-4 bg-primary text-white rounded-2xl font-bold hover:bg-blue-600 transition-all"
          >
            Attempt Re-entry
          </button>
        </div>
      </div>
    );
  }

  return (
    <AuthProvider>
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-purple-50 font-sans text-gray-900">
        <AppRouter />
        <ToastContainer />
        <ConfirmDialogContainer />
        <PromotionDialogContainer />
        <ReloadPrompt />
        <OfflineIndicator />
      </div>
    </AuthProvider>
  );
}

export default App;



