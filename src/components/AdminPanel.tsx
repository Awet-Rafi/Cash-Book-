import React, { useState, useEffect } from 'react';
import { 
  Users, 
  Trash2, 
  Search, 
  ShieldAlert, 
  Building2, 
  Mail, 
  Calendar,
  AlertTriangle,
  X
} from 'lucide-react';
import { 
  collection, 
  getDocs, 
  doc, 
  deleteDoc, 
  query, 
  where,
  getDoc
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';

interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  businessId: string;
  createdAt: any;
  role: string;
}

const AdminPanel = () => {
  const { isAdmin } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<UserProfile | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isAdmin) {
      fetchUsers();
    }
  }, [isAdmin]);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const querySnapshot = await getDocs(collection(db, 'userProfiles'));
      const usersData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as UserProfile[];
      setUsers(usersData);
    } catch (err: any) {
      setError(err.message || "Failed to fetch users");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = async (userToDelete: UserProfile) => {
    setIsDeleting(true);
    setError(null);
    try {
      // 1. Delete user profile
      await deleteDoc(doc(db, 'userProfiles', userToDelete.id));

      // 2. If they have a business, we might want to delete that too if they are the only user
      // For now, let's just delete the profile. In a real app, we'd use a Cloud Function
      // to also delete the Firebase Auth user, but we can't do that from client-side easily
      // without Admin SDK.
      
      setUsers(users.filter(u => u.id !== userToDelete.id));
      setDeleteConfirm(null);
    } catch (err: any) {
      setError(err.message || "Failed to delete user");
    } finally {
      setIsDeleting(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-4">
        <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mb-6">
          <ShieldAlert className="w-10 h-10 text-red-600" />
        </div>
        <h1 className="text-2xl font-black text-gray-900 uppercase tracking-tighter italic">Access Denied</h1>
        <p className="text-gray-500 mt-2 max-w-md">
          This section is restricted to system administrators only.
        </p>
      </div>
    );
  }

  const filteredUsers = users.filter(u => 
    u.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.displayName?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-8 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-gray-900 uppercase tracking-tighter italic flex items-center gap-3">
            <Users className="w-8 h-8 text-indigo-600" />
            User Management
          </h1>
          <p className="text-gray-500 font-medium mt-1">Manage and monitor all registered accounts</p>
        </div>

        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input 
            type="text"
            placeholder="Search users..."
            className="pl-12 pr-6 py-3 bg-white border border-gray-200 rounded-2xl w-full md:w-80 focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-medium shadow-sm"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-100 rounded-2xl flex items-center gap-3 text-red-600 text-sm font-bold animate-shake">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      <div className="bg-white rounded-3xl border border-gray-100 shadow-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50/50 border-b border-gray-100">
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">User</th>
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Business ID</th>
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Joined</th>
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-6 py-6"><div className="h-4 bg-gray-100 rounded w-32" /></td>
                    <td className="px-6 py-6"><div className="h-4 bg-gray-100 rounded w-24" /></td>
                    <td className="px-6 py-6"><div className="h-4 bg-gray-100 rounded w-20" /></td>
                    <td className="px-6 py-6"><div className="h-8 bg-gray-100 rounded w-8 ml-auto" /></td>
                  </tr>
                ))
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-20 text-center">
                    <div className="flex flex-col items-center gap-2 text-gray-400">
                      <Users className="w-12 h-12 opacity-20" />
                      <p className="font-bold uppercase tracking-widest text-xs">No users found</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50/50 transition-colors group">
                    <td className="px-6 py-6">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center text-indigo-600 font-black text-lg">
                          {user.displayName?.[0] || user.email?.[0]?.toUpperCase() || '?'}
                        </div>
                        <div>
                          <p className="font-bold text-gray-900">{user.displayName || 'Unnamed User'}</p>
                          <div className="flex items-center gap-1.5 text-xs text-gray-500 font-medium">
                            <Mail className="w-3 h-3" />
                            {user.email}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-6">
                      <div className="flex items-center gap-2 text-sm font-bold text-gray-600">
                        <Building2 className="w-4 h-4 text-gray-400" />
                        {user.businessId || 'No Business'}
                      </div>
                    </td>
                    <td className="px-6 py-6">
                      <div className="flex items-center gap-2 text-sm font-medium text-gray-500">
                        <Calendar className="w-4 h-4 text-gray-400" />
                        {user.createdAt?.toDate?.() ? user.createdAt.toDate().toLocaleDateString() : 'Unknown'}
                      </div>
                    </td>
                    <td className="px-6 py-6 text-right">
                      <button 
                        onClick={() => setDeleteConfirm(user)}
                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-[2.5rem] max-w-md w-full p-8 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-start mb-6">
              <div className="w-14 h-14 bg-red-100 rounded-2xl flex items-center justify-center">
                <AlertTriangle className="w-8 h-8 text-red-600" />
              </div>
              <button 
                onClick={() => setDeleteConfirm(null)}
                className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
              >
                <X className="w-6 h-6 text-gray-400" />
              </button>
            </div>
            
            <h3 className="text-2xl font-black text-gray-900 uppercase tracking-tighter italic mb-2">
              Delete Account?
            </h3>
            <p className="text-gray-500 font-medium leading-relaxed mb-8">
              Are you sure you want to delete the account for <strong className="text-gray-900">{deleteConfirm.email}</strong>? This action cannot be undone and will remove their profile from the system.
            </p>

            <div className="flex flex-col gap-3">
              <button 
                onClick={() => handleDeleteUser(deleteConfirm)}
                disabled={isDeleting}
                className="w-full py-4 bg-red-600 text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-red-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isDeleting ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    Confirm Deletion
                  </>
                )}
              </button>
              <button 
                onClick={() => setDeleteConfirm(null)}
                className="w-full py-4 bg-gray-100 text-gray-600 rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-gray-200 transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminPanel;
