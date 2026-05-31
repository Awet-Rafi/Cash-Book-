import React from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Building2, ArrowRight, Plus } from 'lucide-react';
import { cn } from '../../lib/utils';

interface WorkspacePickerProps {
  onAddFirst?: () => void;
}

const WorkspacePicker: React.FC<WorkspacePickerProps> = ({ onAddFirst }) => {
  const { allBusinesses, switchBusiness, user } = useAuth();

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-4">
      <div className="max-w-2xl w-full">
        <div className="text-center mb-10">
          <h1 className="text-4xl font-black text-gray-900 dark:text-white uppercase tracking-tighter italic mb-4">
            Select Your Workspace
          </h1>
          <p className="text-gray-500 dark:text-gray-400 font-medium max-w-md mx-auto">
            Welcome back, <span className="text-indigo-600 dark:text-indigo-400 font-bold">{user?.displayName || 'User'}</span>! 
            Which system would you like to access today?
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {allBusinesses.map((business) => (
            <button
              key={business.id}
              onClick={() => switchBusiness(business.id)}
              className="group relative bg-white dark:bg-gray-800 p-6 rounded-3xl border border-gray-100 dark:border-gray-700 shadow-xl hover:shadow-2xl hover:border-indigo-100 dark:hover:border-indigo-900/30 transition-all text-left flex flex-col h-full"
            >
              <div className="w-14 h-14 bg-indigo-50 dark:bg-indigo-900/30 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <Building2 className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
              </div>
              
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                    {business.name}
                  </h3>
                  <span className={cn(
                    "px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest",
                    business.role === 'owner' ? "bg-indigo-600 text-white" : "bg-gray-100 dark:bg-gray-700 text-gray-500"
                  )}>
                    {business.role}
                  </span>
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2">
                  {business.description || 'Access your inventory, POS, and financial reports.'}
                </p>
              </div>

              <div className="mt-8 flex items-center gap-2 text-indigo-600 dark:text-indigo-400 font-black text-[10px] uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity">
                Enter System
                <ArrowRight className="w-3.5 h-3.5" />
              </div>
            </button>
          ))}

          <button
            onClick={onAddFirst}
            className="group bg-gray-50 dark:bg-gray-900/50 p-6 rounded-3xl border-2 border-dashed border-gray-200 dark:border-gray-800 hover:border-indigo-600 dark:hover:border-indigo-500 transition-all text-center flex flex-col items-center justify-center h-full min-h-[220px]"
          >
            <div className="w-12 h-12 bg-white dark:bg-gray-800 rounded-full flex items-center justify-center mb-4 shadow-sm group-hover:bg-indigo-600 group-hover:text-white transition-all">
              <Plus className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-widest">
              Add Another Shop
            </h3>
            <p className="text-xs text-gray-400 mt-2">Create a new business workspace</p>
          </button>
        </div>

        <p className="mt-12 text-center text-[10px] text-gray-400 font-bold uppercase tracking-[0.2em]">
          Each system is isolated and secured by its own PIN
        </p>
      </div>
    </div>
  );
};

export default WorkspacePicker;
