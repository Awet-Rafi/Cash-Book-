import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../../lib/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { cn } from '../../lib/utils';
import { 
  LayoutDashboard, 
  Package, 
  ShoppingCart, 
  BarChart3, 
  Receipt, 
  LogOut, 
  Menu, 
  DollarSign,
  Box,
  Wallet,
  User as UserIcon,
  Book,
  CreditCard,
  Truck,
  Lock,
  Settings,
  ShieldCheck
} from 'lucide-react';

const Layout = ({ children }: { children: React.ReactNode }) => {
  const { user, isAdmin, businessName, isPinUnlocked, setPinUnlocked } = useAuth();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const location = useLocation();

  const isProtectedRoute = location.pathname === '/inventory' || location.pathname === '/reports';

  const navItems = React.useMemo(() => {
    const items = [
      { name: 'Dashboard', path: '/', icon: LayoutDashboard },
      { name: 'Customer Ledger', path: '/ledger', icon: Book },
      { name: 'Cash Book', path: '/cash-book', icon: DollarSign },
      { name: 'Credit Book', path: '/credit-book', icon: CreditCard },
      { name: 'POS / Sales', path: '/pos', icon: ShoppingCart },
      { name: 'Expenses', path: '/expenses', icon: Wallet },
      { name: 'Inventory', path: '/inventory', icon: Package },
      { name: 'Order Book', path: '/order-book', icon: Truck },
      { name: 'Receipt Book', path: '/receipt-book', icon: Receipt },
      { name: 'Customers', path: '/customers', icon: UserIcon },
      { name: 'Reports', path: '/reports', icon: BarChart3 },
    ];

    if (isAdmin) {
      items.push({ name: 'Admin Panel', path: '/admin', icon: ShieldCheck });
    }

    items.push({ name: 'Settings', path: '/settings', icon: Settings });

    return items;
  }, [businessName, isAdmin]);

  const handleLogout = () => signOut(auth);

  const handleLock = () => {
    setPinUnlocked(false);
  };

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
              <h1 className="font-bold text-gray-900 leading-tight truncate max-w-[150px]">
                {businessName || 'Mini ERP'}
              </h1>
              <p className="text-xs text-gray-500 font-medium">Store Management</p>
            </div>
          </div>

          <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              const isProtected = item.path === '/inventory' || item.path === '/reports';
              
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setIsSidebarOpen(false)}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 group",
                    isActive 
                      ? "bg-indigo-50 text-indigo-700 shadow-sm shadow-indigo-100" 
                      : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                  )}
                >
                  <Icon className={cn("w-5 h-5", isActive ? "text-indigo-600" : "text-gray-400")} />
                  <span className="flex-1">{item.name}</span>
                  {isProtected && !isActive && (
                    <Lock className="w-3 h-3 text-gray-300 group-hover:text-indigo-400 transition-colors" />
                  )}
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
          <div className="flex items-center gap-4">
            <button 
              className="lg:hidden p-2 text-gray-600 hover:bg-gray-100 rounded-lg"
              onClick={() => setIsSidebarOpen(true)}
            >
              <Menu className="w-6 h-6" />
            </button>
            
            <h2 className="text-lg font-bold text-gray-900">
              {navItems.find(i => i.path === location.pathname)?.name || 'Mini ERP'}
            </h2>
          </div>

          <div className="flex items-center gap-4">
            {isProtectedRoute && isPinUnlocked && (
              <button 
                onClick={handleLock}
                className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-red-100 transition-all border border-red-100"
              >
                <Lock className="w-4 h-4" />
                Lock Section
              </button>
            )}
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

export default Layout;
