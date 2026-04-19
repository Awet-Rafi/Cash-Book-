import React, { useState } from 'react';
import { 
  Settings as SettingsIcon, 
  Trash2, 
  User, 
  ShieldAlert, 
  AlertTriangle,
  X,
  LogOut,
  Mail,
  Building2,
  Save,
  CheckCircle2
} from 'lucide-react';
import { 
  doc, 
  deleteDoc, 
  collection, 
  query, 
  where, 
  updateDoc,
  getDocs 
} from 'firebase/firestore';
import { deleteUser, signOut } from 'firebase/auth';
import { db, auth } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';

const Settings = () => {
  const { user, businessId, businessName, refreshProfile } = useAuth();
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [newBusinessName, setNewBusinessName] = useState(businessName || '');
  const [isUpdatingName, setIsUpdatingName] = useState(false);
  const [updateSuccess, setUpdateSuccess] = useState(false);

  React.useEffect(() => {
    if (businessName) {
      setNewBusinessName(businessName);
    }
  }, [businessName]);

  const handleUpdateBusinessName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!businessId || !newBusinessName.trim()) return;

    setIsUpdatingName(true);
    setError(null);
    setUpdateSuccess(false);

    try {
      await updateDoc(doc(db, 'businesses', businessId), {
        name: newBusinessName.trim()
      });
      await refreshProfile();
      setUpdateSuccess(true);
      setTimeout(() => setUpdateSuccess(false), 3000);
    } catch (err: any) {
      setError(err.message || "Failed to update business name.");
    } finally {
      setIsUpdatingName(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!user) return;
    
    setIsDeleting(true);
    setError(null);
    
    try {
      const uid = user.uid;
      
      // 1. Delete user profile from Firestore
      await deleteDoc(doc(db, 'userProfiles', uid));
      
      // 2. Delete the Auth user
      // Note: This requires a recent login. If it fails, we'll tell the user to re-login.
      await deleteUser(user);
      
      // 3. Sign out (though deleteUser usually does this)
      await signOut(auth);
      
      window.location.href = '/';
    } catch (err: any) {
      if (err.code === 'auth/requires-recent-login') {
        setError("For security reasons, you must re-login before deleting your account.");
      } else {
        setError(err.message || "Failed to delete account. Please try again.");
      }
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-20">
      <div>
        <h1 className="text-3xl font-black text-gray-900 uppercase tracking-tighter italic flex items-center gap-3">
          <SettingsIcon className="w-8 h-8 text-indigo-600" />
          Account Settings
        </h1>
        <p className="text-gray-500 font-medium mt-1">Manage your personal profile and account security</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Profile Info */}
        <div className="md:col-span-2 space-y-6">
          <div className="bg-white rounded-3xl border border-gray-100 shadow-xl p-8">
            <h2 className="text-lg font-black text-gray-900 uppercase tracking-widest mb-6 flex items-center gap-2">
              <Building2 className="w-5 h-5 text-indigo-600" />
              Business Settings
            </h2>
            
            <form onSubmit={handleUpdateBusinessName} className="space-y-4">
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 block">
                  Business Name
                </label>
                <div className="flex gap-3">
                  <input 
                    type="text"
                    value={newBusinessName}
                    onChange={(e) => setNewBusinessName(e.target.value)}
                    className="flex-1 px-6 py-3 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-bold text-gray-900"
                    placeholder="Enter business name"
                    required
                  />
                  <button 
                    type="submit"
                    disabled={isUpdatingName || newBusinessName === businessName}
                    className="px-6 py-3 bg-indigo-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-indigo-700 transition-all disabled:opacity-50 flex items-center gap-2 shadow-lg shadow-indigo-100"
                  >
                    {isUpdatingName ? (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : updateSuccess ? (
                      <CheckCircle2 className="w-4 h-4" />
                    ) : (
                      <Save className="w-4 h-4" />
                    )}
                    {updateSuccess ? 'Saved' : 'Save'}
                  </button>
                </div>
              </div>
            </form>
          </div>

          <div className="bg-white rounded-3xl border border-gray-100 shadow-xl p-8">
            <h2 className="text-lg font-black text-gray-900 uppercase tracking-widest mb-6 flex items-center gap-2">
              <User className="w-5 h-5 text-indigo-600" />
              Profile Information
            </h2>
            
            <div className="space-y-6">
              <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-2xl">
                <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center text-white font-black text-2xl">
                  {user?.displayName?.[0] || user?.email?.[0]?.toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-black text-gray-400 uppercase tracking-widest">Display Name</p>
                  <p className="text-xl font-bold text-gray-900">{user?.displayName || 'Not Set'}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 border border-gray-100 rounded-2xl">
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Email Address</p>
                  <div className="flex items-center gap-2 text-gray-900 font-bold">
                    <Mail className="w-4 h-4 text-indigo-600" />
                    {user?.email}
                  </div>
                </div>
                <div className="p-4 border border-gray-100 rounded-2xl">
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Business Name</p>
                  <div className="flex items-center gap-2 text-gray-900 font-bold">
                    <Building2 className="w-4 h-4 text-indigo-600" />
                    {businessName || 'No Business Linked'}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-3xl border border-gray-100 shadow-xl p-8">
            <h2 className="text-lg font-black text-gray-900 uppercase tracking-widest mb-4 flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-indigo-600" />
              Security
            </h2>
            <p className="text-sm text-gray-500 mb-6">
              Your account is protected by your Google login and a security PIN for sensitive sections.
            </p>
            <button 
              onClick={() => signOut(auth)}
              className="px-6 py-3 bg-gray-100 text-gray-600 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-gray-200 transition-all flex items-center gap-2"
            >
              <LogOut className="w-4 h-4" />
              Sign Out from all devices
            </button>
          </div>
        </div>

        {/* Danger Zone */}
        <div className="space-y-6">
          <div className="bg-red-50 rounded-3xl border border-red-100 p-8">
            <h2 className="text-lg font-black text-red-600 uppercase tracking-widest mb-4 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              Danger Zone
            </h2>
            <p className="text-xs text-red-600/70 font-medium leading-relaxed mb-6">
              Deleting your account is permanent. All your profile data will be removed. Business data will remain if other users are linked to it.
            </p>
            <button 
              onClick={() => setDeleteConfirm(true)}
              className="w-full py-4 bg-red-600 text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-red-700 transition-all shadow-lg shadow-red-100 flex items-center justify-center gap-2"
            >
              <Trash2 className="w-4 h-4" />
              Delete Account
            </button>
          </div>
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
                onClick={() => setDeleteConfirm(false)}
                className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
              >
                <X className="w-6 h-6 text-gray-400" />
              </button>
            </div>
            
            <h3 className="text-2xl font-black text-gray-900 uppercase tracking-tighter italic mb-2">
              Final Warning
            </h3>
            <p className="text-gray-500 font-medium leading-relaxed mb-6">
              Are you absolutely sure? This will permanently delete your user profile. You will lose access to this business immediately.
            </p>

            {error && (
              <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-2xl text-red-600 text-xs font-bold">
                {error}
              </div>
            )}

            <div className="flex flex-col gap-3">
              <button 
                onClick={handleDeleteAccount}
                disabled={isDeleting}
                className="w-full py-4 bg-red-600 text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-red-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isDeleting ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    Yes, Delete My Account
                  </>
                )}
              </button>
              <button 
                onClick={() => setDeleteConfirm(false)}
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

export default Settings;
