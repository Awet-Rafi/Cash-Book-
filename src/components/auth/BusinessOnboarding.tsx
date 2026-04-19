import React, { useState } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { Box, AlertCircle, TrendingUp, Lock } from 'lucide-react';
import * as bcrypt from 'bcryptjs';

const BusinessOnboarding = ({ onComplete }: { onComplete: () => void }) => {
  const { user } = useAuth();
  const [businessName, setBusinessName] = useState('');
  const [description, setDescription] = useState('');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    if (!businessName.trim()) {
      setError("Business name is required");
      return;
    }

    if (!pin || pin.length < 4) {
      setError("PIN must be at least 4 digits");
      return;
    }

    if (pin !== confirmPin) {
      setError("PINs do not match");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const businessId = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2) + Date.now().toString(36);
      const now = new Date().toISOString();

      console.log("Starting onboarding for user:", user.uid);

      // Hash the PIN asynchronously to avoid blocking UI
      const hashedPin = await new Promise<string>((resolve, reject) => {
        bcrypt.genSalt(10, (err, salt) => {
          if (err) reject(err);
          bcrypt.hash(pin, salt, (err, hash) => {
            if (err) reject(err);
            resolve(hash);
          });
        });
      });

      // 1. Create Business
      console.log("Creating business document...");
      try {
        await setDoc(doc(db, 'businesses', businessId), {
          id: businessId,
          name: businessName.trim(),
          description: description.trim(),
          ownerId: user.uid,
          pin: hashedPin,
          createdAt: now
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `businesses/${businessId}`);
      }

      // 2. Create User Profile
      console.log("Creating user profile document...");
      try {
        await setDoc(doc(db, 'userProfiles', user.uid), {
          uid: user.uid,
          businessId: businessId,
          email: user.email,
          displayName: user.displayName || 'User'
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `userProfiles/${user.uid}`);
      }

      console.log("Onboarding successful, refreshing profile...");
      // Small delay to allow for propagation
      await new Promise(resolve => setTimeout(resolve, 800));
      await onComplete();
    } catch (err: any) {
      console.error("Onboarding error:", err);
      setError(err.message || "Failed to create business profile.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-xl w-full grid lg:grid-cols-2 bg-white rounded-3xl shadow-2xl overflow-hidden">
        <div className="p-8 lg:p-12 bg-indigo-600 text-white flex flex-col justify-between">
          <div>
            <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center mb-8">
              <Box className="w-7 h-7 text-white" />
            </div>
            <h1 className="text-3xl font-black mb-4 leading-tight uppercase tracking-tighter">Build Your Business Portfolio</h1>
            <p className="text-indigo-100 text-sm leading-relaxed">
              Welcome! Let's set up your business workspace. This will be the home for your inventory, sales, and financial reports.
            </p>
          </div>
          <div className="mt-12 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-xs font-bold">01</div>
              <p className="text-xs font-bold uppercase tracking-widest">Create Profile</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-xs font-bold">02</div>
              <p className="text-xs font-bold uppercase tracking-widest text-white">Security PIN</p>
            </div>
          </div>
        </div>
        <div className="p-8 lg:p-12 overflow-y-auto max-h-[90vh]">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Business Name</label>
              <input 
                type="text"
                required
                placeholder="e.g. Tekle's General Store"
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-bold"
                value={businessName}
                onChange={e => setBusinessName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Description (Optional)</label>
              <textarea 
                placeholder="What do you sell?"
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-medium h-20 resize-none"
                value={description}
                onChange={e => setDescription(e.target.value)}
              />
            </div>

            <div className="pt-4 border-t border-gray-100">
              <div className="flex items-center gap-2 mb-4">
                <Lock className="w-4 h-4 text-indigo-600" />
                <h3 className="text-xs font-black text-gray-900 uppercase tracking-widest">Security PIN</h3>
              </div>
              <p className="text-[10px] text-gray-500 mb-4 font-medium">This PIN will be required to access Inventory and Reports.</p>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Set PIN</label>
                  <input 
                    type="password"
                    required
                    maxLength={6}
                    placeholder="••••"
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-bold text-center tracking-[0.5em]"
                    value={pin}
                    onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Confirm PIN</label>
                  <input 
                    type="password"
                    required
                    maxLength={6}
                    placeholder="••••"
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-bold text-center tracking-[0.5em]"
                    value={confirmPin}
                    onChange={e => setConfirmPin(e.target.value.replace(/\D/g, ''))}
                  />
                </div>
              </div>
            </div>

            {error && (
              <div className="p-4 bg-red-50 border border-red-100 rounded-xl flex items-center gap-3 text-red-600 text-xs font-bold">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <p>{error}</p>
              </div>
            )}

            <button 
              type="submit"
              disabled={isSubmitting}
              className="w-full py-4 bg-indigo-600 text-white rounded-xl font-black text-sm uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  Complete Setup
                  <TrendingUp className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default BusinessOnboarding;
