import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { ChevronDown, Store, Plus, Check, Building2, LayoutGrid } from 'lucide-react';
import { cn } from '../../lib/utils';
import BusinessOnboarding from '../auth/BusinessOnboarding';

const BusinessSwitcher = () => {
  const { businessId, businessName, allBusinesses, switchBusiness, refreshProfile } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSwitch = async (id: string) => {
    if (id === businessId) {
      setIsOpen(false);
      return;
    }
    await switchBusiness(id);
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex items-center gap-1.5 sm:gap-2.5 pl-1 pr-2.5 sm:pl-1.5 sm:pr-4 py-1 sm:py-1.5 rounded-full transition-all duration-300 active:scale-95 group max-w-[140px] sm:max-w-none",
          isOpen 
            ? "bg-indigo-600 text-white shadow-lg shadow-indigo-200 dark:shadow-none" 
            : "bg-gray-50 dark:bg-gray-800/50 hover:bg-white dark:hover:bg-gray-800 border border-transparent hover:border-gray-200 dark:hover:border-gray-700 shadow-sm"
        )}
      >
        <div className={cn(
          "w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center transition-colors shrink-0",
          isOpen ? "bg-white/20" : "bg-indigo-600 text-white shadow-md shadow-indigo-100 dark:shadow-none"
        )}>
          <Store className="w-3 sm:w-3.5 h-3 sm:h-3.5" />
        </div>
        
        <div className="flex items-center gap-1 sm:gap-2 min-w-0">
          <span className={cn(
            "text-[10px] sm:text-xs font-black tracking-tight transition-colors truncate",
            isOpen ? "text-white" : "text-gray-900 dark:text-gray-100"
          )}>
            {businessName || 'Select'}
          </span>
          <ChevronDown className={cn(
            "w-3 h-3 sm:w-3.5 sm:h-3.5 transition-all duration-300 shrink-0",
            isOpen ? "text-white/70 rotate-180" : "text-gray-400 group-hover:text-gray-600"
          )} />
        </div>
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-3 w-64 sm:w-72 bg-white dark:bg-gray-800 rounded-2xl sm:rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.15)] border border-gray-100 dark:border-gray-700 overflow-hidden z-[100] animate-in fade-in zoom-in-95 slide-in-from-top-2 duration-300 origin-top-left">
          <div className="p-4 bg-gray-50/50 dark:bg-gray-900/20 border-b border-gray-100 dark:border-gray-700">
            <p className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-[0.25em] flex items-center gap-2">
              <span className="w-1 h-1 rounded-full bg-indigo-600 animate-pulse" />
              Workspaces
            </p>
          </div>

          <div className="p-2 space-y-1 max-h-[320px] overflow-y-auto custom-scrollbar">
            {allBusinesses.map((business) => (
                <button
                  key={business.id}
                  onClick={() => handleSwitch(business.id)}
                  className={cn(
                    "w-full flex items-center justify-between p-2 rounded-xl transition-all group",
                    business.id === businessId 
                      ? "bg-indigo-50 dark:bg-indigo-900/20" 
                      : "hover:bg-gray-50 dark:hover:bg-gray-700/50"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-8 h-8 rounded-lg flex items-center justify-center",
                      business.id === businessId ? "bg-indigo-600 text-white" : "bg-gray-100 dark:bg-gray-700 text-gray-400 group-hover:text-gray-600"
                    )}>
                      <Building2 className="w-4 h-4" />
                    </div>
                    <div className="text-left">
                      <div className="flex items-center gap-2">
                        <p className={cn(
                          "text-xs font-bold",
                          business.id === businessId ? "text-indigo-600 dark:text-indigo-400" : "text-gray-700 dark:text-gray-300"
                        )}>{business.name}</p>
                        <span className={cn(
                          "px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-widest",
                          business.role === 'owner' ? "bg-indigo-100 text-indigo-600" : "bg-gray-100 text-gray-500"
                        )}>
                          {business.role}
                        </span>
                      </div>
                      <p className="text-[10px] text-gray-400 line-clamp-1">{business.description || 'Global System'}</p>
                    </div>
                  </div>
                  {business.id === businessId && (
                    <Check className="w-4 h-4 text-indigo-600" />
                  )}
                </button>
              ))}
            </div>
          
          <button
            onClick={() => {
              setIsOpen(false);
              setShowAddModal(true);
            }}
            className="w-full flex items-center gap-3 p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors text-indigo-600 dark:text-indigo-400 border-t border-gray-50 dark:border-gray-700"
          >
            <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center">
              <Plus className="w-4 h-4" />
            </div>
            <span className="text-xs font-bold uppercase tracking-widest">Add New Shop</span>
          </button>
        </div>
      )}

      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4 overflow-y-auto">
          <div className="relative w-full max-w-2xl bg-white dark:bg-gray-900 rounded-3xl overflow-hidden shadow-2xl">
            <button 
              onClick={() => setShowAddModal(false)}
              className="absolute top-6 right-6 p-2 rounded-full bg-black/10 hover:bg-black/20 text-indigo-900 dark:text-white transition-colors z-[210] lg:text-indigo-900"
            >
              <Plus className="w-6 h-6 rotate-45" />
            </button>
            
            <div className="max-h-[90vh] overflow-y-auto">
              <BusinessOnboarding 
                onComplete={async () => {
                  await refreshProfile();
                  setShowAddModal(false);
                }} 
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BusinessSwitcher;
