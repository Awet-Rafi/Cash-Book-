import React, { useState, useEffect, createContext, useContext } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation, Navigate } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Package, 
  ShoppingCart, 
  BarChart3, 
  Receipt, 
  Settings, 
  LogOut, 
  Menu, 
  X,
  Plus,
  Search,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Box,
  Wallet,
  User as UserIcon,
  Book,
  CreditCard,
  Users
} from 'lucide-react';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut, User } from 'firebase/auth';
import { collection, onSnapshot, query, orderBy, limit, getDocFromServer, doc, where } from 'firebase/firestore';
import { auth, db } from './lib/firebase';
import { cn, formatCurrency } from './lib/utils';
import { Product, Sale, Expense } from './types';

// Components (to be implemented in separate files or below)
import Dashboard from './components/Dashboard';
import Inventory from './components/Inventory';
import POS from './components/POS';
import Reports from './components/Reports';
import Expenses from './components/Expenses';
import CreditBook from './components/CreditBook';
import CashBook from './components/CashBook';
import Customers from './components/Customers';
import ReceiptBook from './components/ReceiptBook';
import MemberManagement from './components/MemberManagement';

// Auth Context
interface AuthContextType {
  user: User | null;
  loading: boolean;
  isAdmin: boolean;
  role: 'admin' | 'operator' | 'viewer';
}

const AuthContext = createContext<AuthContextType>({ 
  user: null, 
  loading: true, 
  isAdmin: false,
  role: 'viewer'
});

export const useAuth = () => useContext(AuthContext);

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

const Layout = ({ children }: { children: React.ReactNode }) => {
  const { user, isAdmin } = useAuth();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const location = useLocation();

  const navItems = [
    { name: 'Credit Book', path: '/', icon: CreditCard },
    { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
    { name: 'POS / Sales', path: '/pos', icon: ShoppingCart },
    { name: 'Inventory', path: '/inventory', icon: Package },
    { name: 'Cash Book', path: '/cash-book', icon: DollarSign },
    { name: 'Receipt Book', path: '/receipt-book', icon: Receipt },
    { name: 'Customers', path: '/customers', icon: UserIcon },
    { name: 'Team Members', path: '/members', icon: Users },
    { name: 'Expenses', path: '/expenses', icon: Wallet },
    { name: 'Reports', path: '/reports', icon: BarChart3 },
  ];

  const handleLogout = () => signOut(auth);

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-200 transform transition-transform duration-300 ease-in-out lg:relative lg:translate-x-0",
        isSidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="h-full flex flex-col">
          <div className="p-6 flex items-center gap-3 border-b border-gray-100">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center">
              <Box className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-gray-900 leading-tight">Mini ERP</h1>
              <p className="text-xs text-gray-500 font-medium">Store Management</p>
            </div>
          </div>

          <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setIsSidebarOpen(false)}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200",
                    isActive 
                      ? "bg-indigo-50 text-indigo-700 shadow-sm shadow-indigo-100" 
                      : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                  )}
                >
                  <Icon className={cn("w-5 h-5", isActive ? "text-indigo-600" : "text-gray-400")} />
                  {item.name}
                </Link>
              );
            })}
          </nav>

          <div className="p-4 border-t border-gray-100">
            <div className="flex items-center gap-3 px-4 py-3 mb-2">
              <img 
                src={user?.photoURL || `https://ui-avatars.com/api/?name=${user?.displayName || 'User'}`} 
                alt="Profile" 
                className="w-8 h-8 rounded-full border border-gray-200"
                referrerPolicy="no-referrer"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">{user?.displayName}</p>
                <p className="text-xs text-gray-500 truncate">{isAdmin ? 'Administrator' : 'Staff'}</p>
              </div>
            </div>
            <button 
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
            >
              <LogOut className="w-5 h-5" />
              Sign Out
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 lg:px-8 shrink-0">
          <button 
            className="lg:hidden p-2 text-gray-600 hover:bg-gray-100 rounded-lg"
            onClick={() => setIsSidebarOpen(true)}
          >
            <Menu className="w-6 h-6" />
          </button>
          
          <div className="flex-1 lg:flex-none">
            <h2 className="text-lg font-bold text-gray-900">
              {navItems.find(i => i.path === location.pathname)?.name || 'Mini ERP'}
            </h2>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-gray-100 rounded-full text-xs font-medium text-gray-600">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              Live System
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 lg:p-8">
          {children}
        </div>
      </main>
    </div>
  );
};

const Login = () => {
  const handleLogin = () => {
    const provider = new GoogleAuthProvider();
    signInWithPopup(auth, provider).catch(console.error);
  };

  return (
    <div className="min-h-screen bg-indigo-600 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-2xl overflow-hidden">
        <div className="p-8 text-center bg-gray-50 border-b border-gray-100">
          <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-indigo-200">
            <Box className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Mini ERP System</h1>
          <p className="text-gray-500">Manage your store inventory, sales, and reports in one place.</p>
        </div>
        <div className="p-8">
          <button 
            onClick={handleLogin}
            className="w-full flex items-center justify-center gap-3 py-4 px-6 bg-white border-2 border-gray-200 rounded-xl font-bold text-gray-700 hover:bg-gray-50 hover:border-indigo-300 transition-all duration-200 group"
          >
            <img src="https://www.google.com/favicon.ico" alt="Google" className="w-5 h-5" />
            Sign in with Google
          </button>
          <p className="mt-6 text-center text-xs text-gray-400">
            By signing in, you agree to our terms and conditions.
          </p>
        </div>
      </div>
    </div>
  );
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoading(false);
    });

    // Test connection
    const testConnection = async () => {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if(error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration.");
        }
      }
    };
    testConnection();

    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-500 font-medium animate-pulse">Initializing System...</p>
        </div>
      </div>
    );
  }

  // Define a guest user if not logged in
  const activeUser = user || {
    displayName: 'Guest Administrator',
    email: 'guest@example.com',
    photoURL: null,
    uid: 'guest-uid'
  } as any;

  return (
    <AuthContext.Provider value={{ user: activeUser, loading, isAdmin: true, role: 'admin' }}>
      <ErrorBoundary>
        <Router>
          <Layout>
            <Routes>
              <Route path="/" element={<CreditBook />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/inventory" element={<Inventory />} />
              <Route path="/pos" element={<POS />} />
              <Route path="/cash-book" element={<CashBook />} />
              <Route path="/receipt-book" element={<ReceiptBook />} />
              <Route path="/customers" element={<Customers />} />
              <Route path="/members" element={<MemberManagement />} />
              <Route path="/expenses" element={<Expenses />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Layout>
        </Router>
      </ErrorBoundary>
    </AuthContext.Provider>
  );
}
