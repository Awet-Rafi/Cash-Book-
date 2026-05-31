import React, { useState, lazy, Suspense } from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AlertCircle, Loader2 } from 'lucide-react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';

// Lazy load feature components for performance
const Dashboard = lazy(() => import('./components/Dashboard'));
const Inventory = lazy(() => import('./components/Inventory'));
const POS = lazy(() => import('./components/POS'));
const Reports = lazy(() => import('./components/Reports'));
const Expenses = lazy(() => import('./components/Expenses'));
const CreditBook = lazy(() => import('./components/CreditBook'));
const CustomerLedger = lazy(() => import('./components/CustomerLedger'));
const CashBook = lazy(() => import('./components/CashBook'));
const InvoiceManager = lazy(() => import('./components/InvoiceManager'));
const ReceiptBook = lazy(() => import('./components/ReceiptBook'));
const OrderBook = lazy(() => import('./components/OrderBook'));
const StoreBook = lazy(() => import('./components/StoreBook'));
const AdminPanel = lazy(() => import('./components/AdminPanel'));
const Settings = lazy(() => import('./components/Settings'));

// Auth & Layout components (Keep static as they are usually needed immediately)
import Login from './components/auth/Login';
import BusinessOnboarding from './components/auth/BusinessOnboarding';
import WorkspacePicker from './components/auth/WorkspacePicker';
import Layout from './components/layout/Layout';

import PinGate from './components/auth/PinGate';

const ForceReset = () => {
  React.useEffect(() => {
    localStorage.clear();
    sessionStorage.clear();
    window.location.href = '/';
  }, []);
  return <div className="p-10 text-center">Resetting system...</div>;
};

// Error Boundary
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean, error: any }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
          <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 text-center border border-red-100">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-8 h-8 text-red-600" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Something went wrong</h1>
            <p className="text-gray-600 mb-6">
              {this.state.error?.message || "An unexpected error occurred."}
            </p>
            <button 
              onClick={() => window.location.reload()}
              className="w-full py-3 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 transition-colors"
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const AppContent = () => {
  const { user, loading, businessId, allBusinesses, refreshProfile } = useAuth();
  const [showOnboarding, setShowOnboarding] = useState(false);

  if (loading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-gray-50 dark:bg-gray-900 transition-colors">
        <div className="flex flex-col items-center gap-6">
          <div className="w-16 h-16 bg-black rounded-2xl flex items-center justify-center shadow-2xl border border-white/5 animate-pulse overflow-hidden">
            <svg viewBox="0 0 512 512" className="w-10 h-10">
              <defs>
                <linearGradient id="gold-refined" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" style={{stopColor:'#FDE68A',stopOpacity:1}} />
                  <stop offset="20%" style={{stopColor:'#B45309',stopOpacity:1}} />
                  <stop offset="50%" style={{stopColor:'#FDE68A',stopOpacity:1}} />
                  <stop offset="80%" style={{stopColor:'#92400E',stopOpacity:1}} />
                  <stop offset="100%" style={{stopColor:'#78350F',stopOpacity:1}} />
                </linearGradient>
              </defs>
              <g fill="url(#gold-refined)">
                <path d="M175 125h110c60 0 85 30 85 75s-25 75-85 75h-25v30c40 15 80 50 140 105-30-10-70-40-140-55v55 c0 20 15 25 35 25h15v15h-150v-15h15c20 0 35-5 35-25V165c0-20-15-25-35-25h-15v-15z M260 250c30 0 45-15 45-37s-15-37-45-37h-25v74h25z" />
                <path d="M140 230c100-15 150 40 300 180-80-40-140-90-300-35z" />
              </g>
            </svg>
          </div>
          <div className="flex flex-col items-center gap-2">
            <h1 className="text-xl font-black text-gray-900 dark:text-white tracking-widest uppercase italic">RAFI FINANCE</h1>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-[0.3em] flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-indigo-600 rounded-full animate-ping" />
              Securing System
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  // If user has no business, show onboarding
  if ((!businessId && allBusinesses.length === 0) || showOnboarding) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 p-4 lg:p-8 flex items-center justify-center">
        <div className="w-full max-w-4xl">
          <BusinessOnboarding onComplete={() => {
            refreshProfile();
            setShowOnboarding(false);
          }} />
          {showOnboarding && allBusinesses.length > 0 && (
            <button 
              onClick={() => setShowOnboarding(false)}
              className="mt-6 w-full text-center text-xs font-black text-gray-400 uppercase tracking-widest hover:text-indigo-600 transition-colors"
            >
              Cancel and Return to Selection
            </button>
          )}
        </div>
      </div>
    );
  }

  // If user has multiple businesses but none selected, show picker
  if (!businessId && allBusinesses.length > 0) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col">
        <WorkspacePicker onAddFirst={() => setShowOnboarding(true)} />
      </div>
    );
  }

  return (
    <Layout>
      <PinGate>
        <Suspense fallback={
          <div className="flex-1 flex items-center justify-center p-12">
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest italic animate-pulse">Initializing Component...</p>
            </div>
          </div>
        }>
          <Routes>
            <Route path="/" element={<POS />} />
            <Route path="/cash-book" element={<CashBook />} />
            <Route path="/credit-book" element={<CreditBook />} />
            <Route path="/ledger" element={<CustomerLedger />} />
            <Route path="/pos" element={<POS />} />
            <Route path="/expenses" element={<Expenses />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/inventory" element={<Inventory />} />
            <Route path="/order-book" element={<OrderBook />} />
            <Route path="/receipt-book" element={<ReceiptBook />} />
            <Route path="/invoices" element={<InvoiceManager />} />
            <Route path="/store-book" element={<StoreBook />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/admin" element={<AdminPanel />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/force-reset" element={<ForceReset />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </PinGate>
    </Layout>
  );
};

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <Router>
            <AppContent />
          </Router>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
