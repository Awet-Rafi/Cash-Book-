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
  CheckCircle2,
  Plus,
  ArrowRight,
  ShieldCheck,
  UserPlus,
  UserMinus,
  Loader2
} from 'lucide-react';
import { 
  doc, 
  deleteDoc, 
  collection, 
  query, 
  where, 
  updateDoc,
  getDocs,
  setDoc,
  arrayUnion,
  arrayRemove 
} from 'firebase/firestore';
import { deleteUser, signOut } from 'firebase/auth';
import { db, auth } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { cn } from '../lib/utils';

const Settings = () => {
  const { user, businessId, businessName, allBusinesses, switchBusiness, refreshProfile } = useAuth();
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [newBusinessName, setNewBusinessName] = useState(businessName || '');
  const [isUpdatingName, setIsUpdatingName] = useState(false);
  const [updateSuccess, setUpdateSuccess] = useState(false);

  const [editingBusinessId, setEditingBusinessId] = useState<string | null>(null);
  const [tempBusinessNames, setTempBusinessNames] = useState<Record<string, string>>({});

  const [staffEmail, setStaffEmail] = useState('');
  const [isAddingStaff, setIsAddingStaff] = useState(false);
  const [staffProfiles, setStaffProfiles] = useState<any[]>([]);
  const [isLoadingStaff, setIsLoadingStaff] = useState(false);

  const activeBusiness = allBusinesses.find(b => b.id === businessId);
  const isOwner = activeBusiness?.role === 'owner';

  React.useEffect(() => {
    if (businessId && isOwner) {
      fetchStaffProfiles();
    }
  }, [businessId, isOwner]);

  const fetchStaffProfiles = async () => {
    if (!activeBusiness?.staffUids || activeBusiness.staffUids.length === 0) {
      setStaffProfiles([]);
      return;
    }

    setIsLoadingStaff(true);
    try {
      const q = query(collection(db, 'userProfiles'), where('uid', 'in', activeBusiness.staffUids));
      const snaps = await getDocs(q);
      setStaffProfiles(snaps.docs.map(d => d.data()));
    } catch (err) {
      console.error("Error fetching staff profiles:", err);
    } finally {
      setIsLoadingStaff(false);
    }
  };

  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!businessId || !staffEmail.trim() || !isOwner) return;

    setIsAddingStaff(true);
    setError(null);
    try {
      // 1. Find user by email
      const q = query(collection(db, 'userProfiles'), where('email', '==', staffEmail.trim()));
      const snaps = await getDocs(q);
      
      if (snaps.empty) {
        throw new Error("User with this email not found. They must sign in to the app at least once first.");
      }

      const staffUid = snaps.docs[0].id;

      if (staffUid === user?.uid) {
        throw new Error("You are already the owner of this business.");
      }

      // 2. Add to business staffUids
      await updateDoc(doc(db, 'businesses', businessId), {
        staffUids: arrayUnion(staffUid)
      });

      setStaffEmail('');
      await refreshProfile();
      await fetchStaffProfiles();
    } catch (err: any) {
      setError(err.message || "Failed to add staff member.");
    } finally {
      setIsAddingStaff(false);
    }
  };

  const handleRemoveStaff = async (staffUid: string) => {
    if (!businessId || !isOwner) return;

    try {
      await updateDoc(doc(db, 'businesses', businessId), {
        staffUids: arrayRemove(staffUid)
      });
      await refreshProfile();
      await fetchStaffProfiles();
    } catch (err: any) {
      setError(err.message || "Failed to remove staff member.");
    }
  };

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

  const handleUpdateOtherBusinessName = async (id: string) => {
    const name = tempBusinessNames[id];
    if (!name || !name.trim()) return;

    setIsUpdatingName(true);
    try {
      await updateDoc(doc(db, 'businesses', id), {
        name: name.trim()
      });
      await refreshProfile();
      setEditingBusinessId(null);
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
        <h1 className="text-3xl font-black text-gray-900 dark:text-white uppercase tracking-tighter italic flex items-center gap-3">
          <SettingsIcon className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
          Account Settings
        </h1>
        <p className="text-gray-500 dark:text-gray-400 font-medium mt-1">Manage your personal profile and account security</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Profile Info */}
        <div className="md:col-span-2 space-y-6">
          {/* All Accounts / Shops */}
          <div className="bg-white dark:bg-gray-800 rounded-3xl border border-gray-100 dark:border-gray-700 shadow-xl p-8">
            <h2 className="text-lg font-black text-gray-900 dark:text-white uppercase tracking-widest mb-6 flex items-center gap-2">
              <Building2 className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              Manage Your Accounts / Shops
            </h2>
            
            <div className="space-y-4">
              {allBusinesses.map((business) => (
                <div key={business.id} className={cn(
                  "p-4 rounded-2xl border transition-all",
                  business.id === businessId 
                    ? "bg-indigo-50/50 dark:bg-indigo-900/10 border-indigo-100 dark:border-indigo-900/30 ring-1 ring-indigo-200 dark:ring-indigo-900/50" 
                    : "bg-gray-50/30 dark:bg-gray-900/10 border-gray-100 dark:border-gray-700 hover:border-gray-200 dark:hover:border-gray-600"
                )}>
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1">
                      {editingBusinessId === business.id ? (
                        <div className="flex gap-2">
                          <input 
                            type="text"
                            value={tempBusinessNames[business.id] ?? business.name}
                            onChange={(e) => setTempBusinessNames(prev => ({ ...prev, [business.id]: e.target.value }))}
                            className="flex-1 px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-bold dark:text-white"
                            autoFocus
                          />
                          <button 
                            onClick={() => handleUpdateOtherBusinessName(business.id)}
                            className="px-4 py-2 bg-indigo-600 text-white rounded-xl font-bold text-xs uppercase"
                          >
                            Save
                          </button>
                        </div>
                      ) : (
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-black text-gray-900 dark:text-white">{business.name}</p>
                            <span className={cn(
                              "px-2 py-0.5 text-[8px] font-black uppercase rounded-full tracking-widest",
                              business.role === 'owner' ? "bg-indigo-600 text-white" : "bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-400"
                            )}>
                              {business.role}
                            </span>
                            {business.id === businessId && (
                              <span className="px-2 py-0.5 bg-green-600 text-white text-[8px] font-black uppercase rounded-full tracking-widest">Active</span>
                            )}
                          </div>
                          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">{business.description || 'Global System'}</p>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {editingBusinessId !== business.id && business.role === 'owner' && (
                        <button 
                          onClick={() => {
                            setEditingBusinessId(business.id);
                            setTempBusinessNames(prev => ({ ...prev, [business.id]: business.name }));
                          }}
                          className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-white dark:hover:bg-gray-800 rounded-lg transition-all"
                        >
                          <SettingsIcon className="w-4 h-4" />
                        </button>
                      )}
                      {business.id !== businessId && (
                        <button 
                          onClick={() => switchBusiness(business.id)}
                          className="p-2 text-indigo-600 dark:text-indigo-400 hover:bg-white dark:hover:bg-gray-800 rounded-lg transition-all flex items-center gap-2 text-[10px] font-black uppercase tracking-widest"
                        >
                          Switch
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <p className="mt-6 text-[10px] text-gray-400 font-bold uppercase tracking-widest text-center italic">
              Switching accounts refreshes the system to your selected shop's data
            </p>
          </div>

          {/* Business Info - Only for Owners */}
          {isOwner && (
            <div className="bg-white dark:bg-gray-800 rounded-3xl border border-gray-100 dark:border-gray-700 shadow-xl p-8">
              <h2 className="text-lg font-black text-gray-900 dark:text-white uppercase tracking-widest mb-6 flex items-center gap-2">
                <Building2 className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                Active Shop Settings
              </h2>
              
              <form onSubmit={handleUpdateBusinessName} className="space-y-4">
                <div>
                  <label className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2 block">
                    Update Display Name
                  </label>
                  <div className="flex gap-3">
                    <input 
                      type="text"
                      value={newBusinessName}
                      onChange={(e) => setNewBusinessName(e.target.value)}
                      className="flex-1 px-6 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-bold text-gray-900 dark:text-white"
                      placeholder="Enter business name"
                      required
                    />
                    <button 
                      type="submit"
                      disabled={isUpdatingName || newBusinessName === businessName}
                      className="px-6 py-3 bg-indigo-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-indigo-700 transition-all disabled:opacity-50 flex items-center gap-2 shadow-lg shadow-indigo-100 dark:shadow-none"
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
          )}

          {/* Staff Management - Only for Owners */}
          {isOwner && (
            <div className="bg-white dark:bg-gray-800 rounded-3xl border border-gray-100 dark:border-gray-700 shadow-xl p-8">
              <h2 className="text-lg font-black text-gray-900 dark:text-white uppercase tracking-widest mb-6 flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                Staff Access Control
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                Add employees to "<strong>{businessName}</strong>" so they can manage sales and inventory.
              </p>

              <form onSubmit={handleAddStaff} className="mb-8">
                <div className="flex gap-3">
                  <div className="flex-1 relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input 
                      type="email"
                      value={staffEmail}
                      onChange={(e) => setStaffEmail(e.target.value)}
                      placeholder="Employee's Email Address"
                      className="w-full pl-11 pr-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none font-bold dark:text-white"
                      disabled={isAddingStaff}
                      required
                    />
                  </div>
                  <button 
                    type="submit"
                    disabled={isAddingStaff || !staffEmail.trim()}
                    className="px-6 py-3 bg-indigo-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-indigo-700 transition-all disabled:opacity-50 flex items-center gap-2"
                  >
                    {isAddingStaff ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                    Add Staff
                  </button>
                </div>
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-3 italic">
                  Note: The employee must have signed into the system once before you can add them.
                </p>
              </form>

              <div className="space-y-3">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-4">Authorized Staff Members ({staffProfiles.length})</p>
                
                {isLoadingStaff ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
                  </div>
                ) : staffProfiles.length > 0 ? (
                  staffProfiles.map((staff) => (
                    <div key={staff.uid} className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-900/50 rounded-2xl border border-gray-100 dark:border-gray-700">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-indigo-100 dark:bg-indigo-900/30 rounded-xl flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-bold">
                          {staff.displayName?.[0] || staff.email?.[0]?.toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-gray-900 dark:text-white">{staff.displayName}</p>
                          <p className="text-[10px] text-gray-400 font-bold">{staff.email}</p>
                        </div>
                      </div>
                      <button 
                        onClick={() => handleRemoveStaff(staff.uid)}
                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/10 rounded-lg transition-all"
                        title="Remove Access"
                      >
                        <UserMinus className="w-4 h-4" />
                      </button>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-12 border-2 border-dashed border-gray-100 dark:border-gray-700 rounded-[2rem]">
                    <User className="w-12 h-12 text-gray-200 dark:text-gray-700 mx-auto mb-3" />
                    <p className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest leading-loose">No staff members added yet</p>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="bg-white dark:bg-gray-800 rounded-3xl border border-gray-100 dark:border-gray-700 shadow-xl p-8">
            <h2 className="text-lg font-black text-gray-900 dark:text-white uppercase tracking-widest mb-6 flex items-center gap-2">
              <User className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              Profile Information
            </h2>
            
            <div className="space-y-6">
              <div className="flex items-center gap-4 p-4 bg-gray-50 dark:bg-gray-900/50 rounded-2xl">
                <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center text-white font-black text-2xl">
                  {user?.displayName?.[0] || user?.email?.[0]?.toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">Display Name</p>
                  <p className="text-xl font-bold text-gray-900 dark:text-white">{user?.displayName || 'Not Set'}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 border border-gray-100 dark:border-gray-700 rounded-2xl">
                  <p className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-1">Email Address</p>
                  <div className="flex items-center gap-2 text-gray-900 dark:text-white font-bold">
                    <Mail className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                    {user?.email}
                  </div>
                </div>
                <div className="p-4 border border-gray-100 dark:border-gray-700 rounded-2xl">
                  <p className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-1">Business Name</p>
                  <div className="flex items-center gap-2 text-gray-900 dark:text-white font-bold">
                    <Building2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                    {businessName || 'No Business Linked'}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-3xl border border-gray-100 dark:border-gray-700 shadow-xl p-8">
            <h2 className="text-lg font-black text-gray-900 dark:text-white uppercase tracking-widest mb-4 flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              Security
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
              Your account is protected by your Google login and a security PIN for sensitive sections.
            </p>
            <button 
              onClick={() => signOut(auth)}
              className="px-6 py-3 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-gray-200 dark:hover:bg-gray-600 transition-all flex items-center gap-2"
            >
              <LogOut className="w-4 h-4" />
              Sign Out from all devices
            </button>
          </div>
        </div>

        {/* Danger Zone */}
        <div className="space-y-6">
          <div className="bg-red-50 dark:bg-red-900/10 rounded-3xl border border-red-100 dark:border-red-900/30 p-8">
            <h2 className="text-lg font-black text-red-600 dark:text-red-400 uppercase tracking-widest mb-4 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              Danger Zone
            </h2>
            <p className="text-xs text-red-600/70 dark:text-red-400/70 font-medium leading-relaxed mb-6">
              Deleting your account is permanent. All your profile data will be removed. Business data will remain if other users are linked to it.
            </p>
            <button 
              onClick={() => setDeleteConfirm(true)}
              className="w-full py-4 bg-red-600 text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-red-700 transition-all shadow-lg shadow-red-100 dark:shadow-none flex items-center justify-center gap-2"
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
          <div className="bg-white dark:bg-gray-800 rounded-[2.5rem] max-w-md w-full p-8 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-start mb-6">
              <div className="w-14 h-14 bg-red-100 dark:bg-red-900/30 rounded-2xl flex items-center justify-center">
                <AlertTriangle className="w-8 h-8 text-red-600 dark:text-red-400" />
              </div>
              <button 
                onClick={() => setDeleteConfirm(false)}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors"
              >
                <X className="w-6 h-6 text-gray-400 dark:text-gray-500" />
              </button>
            </div>
            
            <h3 className="text-2xl font-black text-gray-900 dark:text-white uppercase tracking-tighter italic mb-2">
              Final Warning
            </h3>
            <p className="text-gray-500 dark:text-gray-400 font-medium leading-relaxed mb-6">
              Are you absolutely sure? This will permanently delete your user profile. You will lose access to this business immediately.
            </p>

            {error && (
              <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/30 border border-red-100 dark:border-red-900/50 rounded-2xl text-red-600 dark:text-red-400 text-xs font-bold">
                {error}
              </div>
            )}

            <div className="flex flex-col gap-3">
              <button 
                onClick={handleDeleteAccount}
                disabled={isDeleting}
                className="w-full py-4 bg-red-600 text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-red-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50 shadow-lg shadow-red-100 dark:shadow-none"
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
                className="w-full py-4 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-gray-200 dark:hover:bg-gray-600 transition-all"
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
