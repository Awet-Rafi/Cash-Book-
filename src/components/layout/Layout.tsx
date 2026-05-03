import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../../lib/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { cn } from '../../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { 
  FileText,
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
  Book,
  CreditCard,
  Truck,
  Lock,
  Settings,
  ShieldCheck,
  Sun,
  Moon,
  Wifi,
  WifiOff,
  History as HistoryIcon,
  ChevronDown,
  ChevronRight
} from 'lucide-react';

const Layout = ({ children }: { children: React.ReactNode }) => {
  const { user, isAdmin, businessName, isPinUnlocked, setPinUnlocked } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    'Sales': true,
    'Reports': true,
  });
  const location = useLocation();
  const navigate = useNavigate();

  // Swipe detection state
  const [touchStart, setTouchStart] = useState<{ x: number, y: number } | null>(null);
  const [touchEnd, setTouchEnd] = useState<{ x: number, y: number } | null>(null);

  // Minimum swipe distance (in px)
  const minSwipeDistance = 50;

  const onTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null);
    setTouchStart({
      x: e.targetTouches[0].clientX,
      y: e.targetTouches[0].clientY
    });
  };

  const onTouchMove = (e: React.TouchEvent) => {
    setTouchEnd({
      x: e.targetTouches[0].clientX,
      y: e.targetTouches[0].clientY
    });
  };

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd || isSidebarOpen) return;
    
    const distanceX = touchStart.x - touchEnd.x;
    const distanceY = touchStart.y - touchEnd.y;
    const isLeftSwipe = distanceX > minSwipeDistance;
    const isRightSwipe = distanceX < -minSwipeDistance;

    // Only swipe if horizontal movement is greater than vertical movement
    if (Math.abs(distanceX) > Math.abs(distanceY)) {
      const cycleRoutes = ['/', '/ledger'];
      const currentPath = location.pathname === '/pos' ? '/' : location.pathname;
      const currentIdx = cycleRoutes.indexOf(currentPath);

      if (currentIdx !== -1) {
        if (isLeftSwipe) {
          // Next route
          const nextIdx = (currentIdx + 1) % cycleRoutes.length;
          navigate(cycleRoutes[nextIdx]);
        } else if (isRightSwipe) {
          // Previous route
          const prevIdx = (currentIdx - 1 + cycleRoutes.length) % cycleRoutes.length;
          navigate(cycleRoutes[prevIdx]);
        }
      }
    }
  };

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const isProtectedRoute = location.pathname === '/inventory' || location.pathname === '/reports' || location.pathname === '/dashboard';

  const navigationGroups = React.useMemo(() => {
    const groups = [
      {
        title: 'Sales',
        items: [
          { name: 'POS / Sales', path: '/', icon: ShoppingCart },
          { name: 'Customer Ledger', path: '/ledger', icon: Book },
          { name: 'Credit Sales', path: '/credit-book', icon: CreditCard },
          { name: 'Cash Book', path: '/cash-book', icon: DollarSign }
        ]
      },
      {
        title: 'Reports',
        items: [
          { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
          { name: 'Detailed Reports', path: '/reports', icon: BarChart3 }
        ]
      },
      {
        title: 'Finance',
        items: [
          { name: 'Expenses', path: '/expenses', icon: Wallet },
          { name: 'Receipts', path: '/receipt-book', icon: Receipt },
          { name: 'Orders', path: '/order-book', icon: Truck },
          { name: 'Invoice', path: '/invoices', icon: FileText }
        ]
      },
      {
        title: 'Inventory',
        items: [
          { name: 'Inventory', path: '/inventory', icon: Package },
          { name: 'Stock Movements', path: '/store-book', icon: HistoryIcon }
        ]
      },
      {
        title: 'Admin',
        items: [] as any[]
      }
    ];

    if (isAdmin) {
      groups.find(g => g.title === 'Admin')?.items.push({ name: 'Admin Panel', path: '/admin', icon: ShieldCheck });
    }
    groups.find(g => g.title === 'Admin')?.items.push({ name: 'Settings', path: '/settings', icon: Settings });

    return groups.filter(g => g.items.length > 0);
  }, [isAdmin]);

  // Expand the group that contains the active route
  useEffect(() => {
    const activeGroup = navigationGroups.find(g => 
      g.items.some(item => item.path === location.pathname)
    );
    if (activeGroup) {
      setExpandedGroups(prev => ({
        ...prev,
        [activeGroup.title]: true
      }));
    }
  }, [location.pathname, navigationGroups]);

  const toggleGroup = (title: string) => {
    setExpandedGroups(prev => ({
      ...prev,
      [title]: !prev[title]
    }));
  };

  const allNavItems = React.useMemo(() => 
    navigationGroups.flatMap(g => g.items), 
  [navigationGroups]);

  const handleLogout = () => signOut(auth);

  const handleLock = () => {
    setPinUnlocked(false);
  };

  return (
    <div className="h-screen bg-gray-50 dark:bg-gray-900 flex transition-colors duration-200">
      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden backdrop-blur-sm"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-50 w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 transform transition-transform duration-300 ease-in-out lg:relative lg:translate-x-0",
        isSidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="h-full flex flex-col">
          <div className="p-6 flex items-center gap-3 border-b border-gray-100 dark:border-gray-700">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-200 dark:shadow-indigo-900/20">
              <Box className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-gray-900 dark:text-white leading-tight truncate max-w-[150px]">
                {businessName || 'Mini ERP'}
              </h1>
              <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">Store Management</p>
            </div>
          </div>

          <nav className="flex-1 p-2 space-y-1 overflow-y-auto custom-scrollbar">
            {navigationGroups.map((group) => {
              const isExpanded = expandedGroups[group.title];
              const hasActiveChild = group.items.some((item: any) => item.path === location.pathname);

              return (
                <div key={group.title} className="space-y-0.5">
                  <button 
                    onClick={() => toggleGroup(group.title)}
                    className={cn(
                      "w-full flex items-center justify-between px-3 py-2 rounded-lg text-[11px] font-black uppercase tracking-[0.15em] transition-all hover:bg-gray-50 dark:hover:bg-gray-700/50",
                      hasActiveChild ? "text-indigo-600 dark:text-indigo-400" : "text-gray-400 dark:text-gray-500"
                    )}
                  >
                    <span>{group.title}</span>
                    {isExpanded ? (
                      <ChevronDown className="w-3 h-3" />
                    ) : (
                      <ChevronRight className="w-3 h-3" />
                    )}
                  </button>
                  
                  <AnimatePresence initial={false}>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.15, ease: "easeInOut" }}
                        className="overflow-hidden space-y-0.5"
                      >
                        {group.items.map((item: any) => {
                          const Icon = item.icon;
                          const isActive = location.pathname === item.path;
                          const isProtected = item.path === '/inventory' || item.path === '/reports' || item.path === '/dashboard';
                          
                          return (
                            <Link
                              key={item.path}
                              to={item.path}
                              onClick={() => setIsSidebarOpen(false)}
                              className={cn(
                                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 group relative overflow-hidden",
                                isActive 
                                  ? "bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400 shadow-sm" 
                                  : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50 hover:text-gray-900 dark:hover:text-white"
                              )}
                            >
                              {isActive && (
                                <motion.div 
                                  layoutId="sidebar-active-indicator"
                                  className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-600 dark:bg-indigo-400 rounded-r-full"
                                />
                              )}
                              <Icon className={cn("w-4 h-4", isActive ? "text-indigo-600 dark:text-indigo-400" : "text-gray-400 dark:text-gray-500")} />
                              <span className="flex-1 truncate">{item.name}</span>
                              {isProtected && !isActive && (
                                <Lock className="w-2.5 h-2.5 text-gray-300 dark:text-gray-600 group-hover:text-indigo-400 transition-colors" />
                              )}
                            </Link>
                          );
                        })}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </nav>

          <div className="p-2 border-t border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/20">
            <div className="flex items-center gap-3 px-3 py-2">
              <img 
                src={user?.photoURL || `https://ui-avatars.com/api/?name=${user?.displayName || 'User'}`} 
                alt="Profile" 
                className="w-8 h-8 rounded-full border border-gray-200 dark:border-gray-700"
                referrerPolicy="no-referrer"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-gray-900 dark:text-white truncate">{user?.displayName}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{isAdmin ? 'Administrator' : 'Staff'}</p>
              </div>
            </div>
            <button 
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-bold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all active:scale-[0.98]"
            >
              <LogOut className="w-5 h-5" />
              Sign Out
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main 
        className="flex-1 flex flex-col min-w-0 overflow-hidden"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <header className="h-12 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between px-3 lg:px-6 shrink-0 transition-colors">
          <div className="flex items-center gap-3">
            <button 
              className="lg:hidden p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              onClick={() => setIsSidebarOpen(true)}
            >
              <Menu className="w-5 h-5" />
            </button>
            
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">
              {allNavItems.find(i => i.path === location.pathname)?.name || 'Mini ERP'}
            </h2>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {location.pathname === '/' && (
              <>
                {isAdmin && (
                  <Link 
                    to="/admin"
                    className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-indigo-100 transition-all border border-indigo-100 dark:border-indigo-900/30"
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Admin</span>
                  </Link>
                )}
                <button 
                  onClick={handleLogout}
                  className="flex items-center gap-2 px-3 py-1.5 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-red-100 transition-all border border-red-100 dark:border-red-900/30"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Sign Out</span>
                </button>
              </>
            )}
            <button
              onClick={toggleTheme}
              className="p-1.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-all shadow-sm active:scale-95"
              aria-label="Toggle night mode"
            >
              {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
            </button>

            {isProtectedRoute && isPinUnlocked && (
              <button 
                onClick={handleLock}
                className="flex items-center gap-2 px-2 sm:px-3 py-1.5 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg text-[9px] sm:text-[10px] font-black uppercase tracking-widest hover:bg-red-100 transition-all border border-red-100 dark:border-red-900/30"
              >
                <Lock className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Lock Section</span>
              </button>
            )}
            <div className={cn(
              "hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-medium transition-colors",
              isOnline 
                ? "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border border-green-100 dark:border-green-900/30" 
                : "bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400 border border-orange-100 dark:border-orange-900/30"
            )}>
              <div className={cn(
                "w-1.5 h-1.5 rounded-full",
                isOnline ? "bg-green-500 animate-pulse" : "bg-orange-500"
              )} />
              {isOnline ? (
                <div className="flex items-center gap-1">
                  <Wifi className="w-2.5 h-2.5" />
                  <span>Online</span>
                </div>
              ) : (
                <div className="flex items-center gap-1">
                  <WifiOff className="w-2.5 h-2.5" />
                  <span>Offline</span>
                </div>
              )}
            </div>
          </div>
        </header>

        <div className={cn(
          "flex-1 flex flex-col min-w-0 transition-colors",
          location.pathname === '/' ? "h-full overflow-hidden" : "overflow-y-auto p-2 lg:p-4"
        )}>
          {children}
        </div>
      </main>
    </div>
  );
};

export default Layout;
