import React from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import { AuthProvider, useAuth } from './contexts/AuthContext';

import Dashboard from './components/Dashboard';
import Inventory from './components/Inventory';
import POS from './components/POS';
import Reports from './components/Reports';
import Expenses from './components/Expenses';
import CreditBook from './components/CreditBook';
import CustomerLedger from './components/CustomerLedger';
import CashBook from './components/CashBook';
import Customers from './components/Customers';
import ReceiptBook from './components/ReceiptBook';
import OrderBook from './components/OrderBook';

// Auth & Layout components
import Login from './components/auth/Login';
import BusinessOnboarding from './components/auth/BusinessOnboarding';
import Layout from './components/layout/Layout';

import PinGate from './components/auth/PinGate';
import AdminPanel from './components/AdminPanel';
import Settings from './components/Settings';

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
  const { user, loading, businessId, refreshProfile } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-600 font-medium">Loading your system...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  if (!businessId) {
    return <BusinessOnboarding onComplete={refreshProfile} />;
  }

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/cash-book" element={<CashBook />} />
        <Route path="/credit-book" element={<CreditBook />} />
        <Route path="/ledger" element={<CustomerLedger />} />
        <Route path="/pos" element={<POS />} />
        <Route path="/expenses" element={<Expenses />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/inventory" element={<PinGate><Inventory /></PinGate>} />
        <Route path="/order-book" element={<OrderBook />} />
        <Route path="/receipt-book" element={<ReceiptBook />} />
        <Route path="/customers" element={<Customers />} />
        <Route path="/reports" element={<PinGate><Reports /></PinGate>} />
        <Route path="/admin" element={<AdminPanel />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
};

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <Router>
          <AppContent />
        </Router>
      </AuthProvider>
    </ErrorBoundary>
  );
}
