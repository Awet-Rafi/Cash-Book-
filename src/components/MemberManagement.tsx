import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, addDoc, deleteDoc, doc, updateDoc, serverTimestamp, orderBy } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { Member } from '../types';
import { cn } from '../lib/utils';
import { UserPlus, Shield, Trash2, Mail, Clock, X, Check, Users, ShieldCheck, ShieldAlert } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';

export default function MemberManagement() {
  const [members, setMembers] = useState<Member[]>([]);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);

  // Form State
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newMemberRole, setNewMemberRole] = useState<'admin' | 'operator' | 'viewer'>('viewer');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(query(collection(db, 'members'), orderBy('addedAt', 'desc')), (snapshot) => {
      const membersData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        addedAt: doc.data().addedAt?.toDate()?.toISOString() || new Date().toISOString()
      } as Member));
      setMembers(membersData);
      
      // Find current user's role
      const currentMember = membersData.find(m => m.email === auth.currentUser?.email);
      if (currentMember) {
        setCurrentUserRole(currentMember.role);
      } else if (auth.currentUser?.email === 'tekle.TAF@gmail.com') {
        setCurrentUserRole('admin');
      }
      
      setLoading(true);
      setLoading(false);
    });

    return () => unsub();
  }, []);

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemberName || !newMemberEmail || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await addDoc(collection(db, 'members'), {
        name: newMemberName,
        email: newMemberEmail.toLowerCase(),
        role: newMemberRole,
        addedAt: serverTimestamp()
      });
      setIsAddModalOpen(false);
      setNewMemberName('');
      setNewMemberEmail('');
      setNewMemberRole('viewer');
    } catch (error) {
      console.error("Error adding member:", error);
      alert("Failed to add member. Make sure you have admin permissions.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateRole = async (memberId: string, newRole: 'admin' | 'operator' | 'viewer') => {
    try {
      await updateDoc(doc(db, 'members', memberId), { role: newRole });
    } catch (error) {
      console.error("Error updating role:", error);
      alert("Failed to update role.");
    }
  };

  const handleDeleteMember = async (memberId: string) => {
    if (window.confirm('Are you sure you want to remove this member?')) {
      try {
        await deleteDoc(doc(db, 'members', memberId));
      } catch (error) {
        console.error("Error deleting member:", error);
        alert("Failed to delete member.");
      }
    }
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'admin': return <ShieldAlert className="w-4 h-4 text-red-500" />;
      case 'operator': return <ShieldCheck className="w-4 h-4 text-indigo-500" />;
      case 'viewer': return <Shield className="w-4 h-4 text-gray-500" />;
      default: return <Shield className="w-4 h-4 text-gray-500" />;
    }
  };

  const getRoleBadgeClass = (role: string) => {
    switch (role) {
      case 'admin': return 'bg-red-50 text-red-700 border-red-100';
      case 'operator': return 'bg-indigo-50 text-indigo-700 border-indigo-100';
      case 'viewer': return 'bg-gray-50 text-gray-700 border-gray-100';
      default: return 'bg-gray-50 text-gray-700 border-gray-100';
    }
  };

  if (loading) return <div className="animate-pulse space-y-4">
    <div className="h-12 bg-white rounded-xl border border-gray-100" />
    <div className="space-y-3">
      {[1,2,3].map(i => <div key={i} className="h-20 bg-white rounded-xl border border-gray-100" />)}
    </div>
  </div>;

  return (
    <div className="space-y-6 pb-24">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-gray-900 tracking-tight">Team Members</h2>
          <p className="text-sm text-gray-500 font-medium">Manage access and roles for your book</p>
        </div>
        <button 
          onClick={() => setIsAddModalOpen(true)}
          className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white font-black text-sm rounded-2xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
        >
          <UserPlus className="w-4 h-4" />
          Add Member
        </button>
      </div>

      <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-gray-50/50 border-b border-gray-100">
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Member</th>
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Role</th>
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Added On</th>
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {members.map((member) => (
                <tr key={member.id} className="hover:bg-gray-50/30 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 font-bold">
                        {member.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-bold text-gray-900">{member.name}</p>
                        <p className="text-xs text-gray-500 flex items-center gap-1">
                          <Mail className="w-3 h-3" />
                          {member.email}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${getRoleBadgeClass(member.role)} flex items-center gap-1.5`}>
                        {getRoleIcon(member.role)}
                        {member.role}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-xs text-gray-500 font-medium flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {format(new Date(member.addedAt), 'MMM dd, yyyy')}
                    </p>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <select 
                        value={member.role}
                        onChange={(e) => handleUpdateRole(member.id, e.target.value as any)}
                        className="text-[10px] font-bold bg-white border border-gray-200 rounded-lg px-2 py-1 outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="viewer">Viewer</option>
                        <option value="operator">Operator</option>
                        <option value="admin">Admin</option>
                      </select>
                      <button 
                        onClick={() => handleDeleteMember(member.id)}
                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {members.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center">
                    <div className="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-3">
                      <Users className="w-6 h-6 text-gray-300" />
                    </div>
                    <p className="text-sm font-bold text-gray-400">No team members added yet.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Member Modal */}
      <AnimatePresence>
        {isAddModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                <h3 className="text-lg font-black text-gray-900 tracking-tight">Add New Member</h3>
                <button onClick={() => setIsAddModalOpen(false)} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
              <form onSubmit={handleAddMember} className="p-6 space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Full Name</label>
                  <input 
                    required
                    type="text" 
                    placeholder="John Doe"
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-bold"
                    value={newMemberName}
                    onChange={e => setNewMemberName(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Email Address</label>
                  <input 
                    required
                    type="email" 
                    placeholder="john@example.com"
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-bold"
                    value={newMemberEmail}
                    onChange={e => setNewMemberEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Access Role</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['viewer', 'operator', 'admin'] as const).map((role) => (
                      <button
                        key={role}
                        type="button"
                        onClick={() => setNewMemberRole(role)}
                        className={cn(
                          "py-3 rounded-2xl border-2 text-[10px] font-black uppercase tracking-widest transition-all",
                          newMemberRole === role 
                            ? "bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-100" 
                            : "bg-white border-gray-100 text-gray-400 hover:border-indigo-200"
                        )}
                      >
                        {role}
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] text-gray-400 mt-2 font-medium">
                    {newMemberRole === 'admin' && 'Full access to all features and team management.'}
                    {newMemberRole === 'operator' && 'Can manage customers, sales, and payments.'}
                    {newMemberRole === 'viewer' && 'Read-only access to all records.'}
                  </p>
                </div>

                <div className="pt-4 flex gap-3">
                  <button 
                    type="button"
                    onClick={() => setIsAddModalOpen(false)}
                    className="flex-1 py-4 bg-gray-100 text-gray-700 rounded-2xl font-black text-sm hover:bg-gray-200 transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    disabled={isSubmitting || !newMemberName || !newMemberEmail}
                    className="flex-1 py-4 bg-indigo-600 text-white rounded-2xl font-black text-sm hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 disabled:opacity-50"
                  >
                    {isSubmitting ? 'Adding...' : 'Add Member'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
