import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Lock, AlertCircle, ShieldCheck, Mail, RefreshCcw } from 'lucide-react';
import * as bcrypt from 'bcryptjs';
import { doc, updateDoc } from 'firebase/firestore';
import { db, auth } from '../../lib/firebase';
import { sendPasswordResetEmail } from 'firebase/auth';

interface PinGateProps {
  children: React.ReactNode;
}

const PinGate: React.FC<PinGateProps> = ({ children }) => {
  const { businessPin, businessId, user, loading: authLoading, isPinUnlocked, setPinUnlocked } = useAuth();
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'enter' | 'reset' | 'setup'>('enter');
  const [resetStep, setResetStep] = useState<'request' | 'verify'>('request');
  const [newPin, setNewPin] = useState('');
  const [confirmNewPin, setConfirmNewPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  // If no PIN is set, force setup
  useEffect(() => {
    if (!authLoading) {
      if (businessPin === null) {
        setView('setup');
      } else {
        setView('enter');
      }
    }
  }, [businessPin, authLoading]);

  // Clear PIN when locked or view changes
  useEffect(() => {
    if (!isPinUnlocked) {
      setPin('');
      setNewPin('');
      setConfirmNewPin('');
      setError(null);
    }
  }, [isPinUnlocked, view]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!businessPin) {
      setView('setup');
      return;
    }

    const isValid = bcrypt.compareSync(pin, businessPin);
    if (isValid) {
      setPinUnlocked(true);
    } else {
      setError("Invalid PIN. Please try again.");
      setPin('');
    }
  };

  const handleSetupPin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!businessId) return;

    if (newPin.length < 4) {
      setError("PIN must be at least 4 digits");
      return;
    }

    if (newPin !== confirmNewPin) {
      setError("PINs do not match");
      return;
    }

    setLoading(true);
    try {
      const salt = bcrypt.genSaltSync(10);
      const hashedPin = bcrypt.hashSync(newPin, salt);

      await updateDoc(doc(db, 'businesses', businessId), {
        pin: hashedPin
      });

      setSuccess("Security PIN set successfully!");
      setTimeout(() => {
        setPinUnlocked(true);
      }, 1500);
    } catch (err: any) {
      setError(err.message || "Failed to set PIN.");
    } finally {
      setLoading(false);
    }
  };

  const handleResetRequest = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      if (user?.email) {
        await sendPasswordResetEmail(auth, user.email);
        setSuccess("A security verification email has been sent to your registered email address. For security, please follow the instructions in the email to verify your identity, then you can reset your PIN here.");
        setResetStep('verify');
      }
    } catch (err: any) {
      setError(err.message || "Failed to send reset email.");
    } finally {
      setLoading(false);
    }
  };

  const handlePinReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!businessId) return;

    if (newPin.length < 4) {
      setError("PIN must be at least 4 digits");
      return;
    }

    if (newPin !== confirmNewPin) {
      setError("PINs do not match");
      return;
    }

    setLoading(true);
    try {
      const salt = bcrypt.genSaltSync(10);
      const hashedPin = bcrypt.hashSync(newPin, salt);

      await updateDoc(doc(db, 'businesses', businessId), {
        pin: hashedPin
      });

      setSuccess("PIN reset successfully! You can now log in with your new PIN.");
      setTimeout(() => {
        setView('enter');
        setResetStep('request');
        setNewPin('');
        setConfirmNewPin('');
        setSuccess(null);
      }, 2000);
    } catch (err: any) {
      setError(err.message || "Failed to reset PIN.");
    } finally {
      setLoading(false);
    }
  };

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (isPinUnlocked) {
    return <>{children}</>;
  }

  return (
    <div className="flex items-center justify-center min-h-[60vh] p-4">
      <div className="max-w-md w-full bg-white rounded-3xl shadow-2xl border border-gray-100 overflow-hidden">
        <div className="bg-indigo-600 p-8 text-white text-center">
          <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Lock className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-2xl font-black uppercase tracking-tighter italic">Security Required</h2>
          <p className="text-indigo-100 text-sm font-medium mt-2">
            {view === 'enter' ? 'Please enter your security PIN to access this section.' : 
             view === 'setup' ? 'Set up a security PIN for your business.' :
             'Reset your security PIN.'}
          </p>
        </div>

        <div className="p-8">
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-2xl flex items-center gap-3 text-red-600 text-xs font-bold">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <p>{error}</p>
            </div>
          )}

          {success && (
            <div className="mb-6 p-4 bg-green-50 border border-green-100 rounded-2xl flex items-center gap-3 text-green-600 text-xs font-bold">
              <ShieldCheck className="w-4 h-4 shrink-0" />
              <p>{success}</p>
            </div>
          )}

          {view === 'enter' ? (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2 text-center">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Enter 4-6 Digit PIN</label>
                <input 
                  type="password"
                  required
                  autoFocus
                  autoComplete="off"
                  maxLength={6}
                  placeholder="••••"
                  className="w-full px-4 py-4 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-black text-2xl text-center tracking-[1em]"
                  value={pin}
                  onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
                />
              </div>

              <button 
                type="submit"
                className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100"
              >
                Unlock Section
              </button>

              <button 
                type="button"
                onClick={() => setView('reset')}
                className="w-full text-center text-[10px] font-black text-gray-400 uppercase tracking-widest hover:text-indigo-600 transition-colors"
              >
                Forgot Security PIN?
              </button>
            </form>
          ) : view === 'setup' ? (
            <form onSubmit={handleSetupPin} className="space-y-6">
              <p className="text-xs text-gray-500 leading-relaxed text-center mb-4">
                You haven't set a security PIN yet. Please set one now to protect your Inventory and Reports.
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Set PIN</label>
                  <input 
                    type="password"
                    required
                    autoComplete="off"
                    maxLength={6}
                    placeholder="••••"
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-bold text-center tracking-[0.5em]"
                    value={newPin}
                    onChange={e => setNewPin(e.target.value.replace(/\D/g, ''))}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Confirm</label>
                  <input 
                    type="password"
                    required
                    autoComplete="off"
                    maxLength={6}
                    placeholder="••••"
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-bold text-center tracking-[0.5em]"
                    value={confirmNewPin}
                    onChange={e => setConfirmNewPin(e.target.value.replace(/\D/g, ''))}
                  />
                </div>
              </div>

              <button 
                type="submit"
                disabled={loading}
                className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    Save & Unlock
                  </>
                )}
              </button>
            </form>
          ) : (
            <div className="space-y-6">
              {resetStep === 'request' ? (
                <div className="space-y-6">
                  <p className="text-xs text-gray-500 leading-relaxed text-center">
                    To reset your PIN, we need to verify your identity. We will send a security link to <strong>{user?.email}</strong>.
                  </p>
                  <button 
                    onClick={handleResetRequest}
                    disabled={loading}
                    className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {loading ? (
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>
                        <Mail className="w-4 h-4" />
                        Send Verification Email
                      </>
                    )}
                  </button>
                </div>
              ) : (
                <form onSubmit={handlePinReset} className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">New PIN</label>
                      <input 
                        type="password"
                        required
                        autoComplete="off"
                        maxLength={6}
                        placeholder="••••"
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-bold text-center tracking-[0.5em]"
                        value={newPin}
                        onChange={e => setNewPin(e.target.value.replace(/\D/g, ''))}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Confirm</label>
                      <input 
                        type="password"
                        required
                        autoComplete="off"
                        maxLength={6}
                        placeholder="••••"
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-bold text-center tracking-[0.5em]"
                        value={confirmNewPin}
                        onChange={e => setConfirmNewPin(e.target.value.replace(/\D/g, ''))}
                      />
                    </div>
                  </div>

                  <button 
                    type="submit"
                    disabled={loading}
                    className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {loading ? (
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>
                        <RefreshCcw className="w-4 h-4" />
                        Update Security PIN
                      </>
                    )}
                  </button>
                </form>
              )}

              <button 
                type="button"
                onClick={() => {
                  setView('enter');
                  setResetStep('request');
                  setError(null);
                  setSuccess(null);
                }}
                className="w-full text-center text-[10px] font-black text-gray-400 uppercase tracking-widest hover:text-indigo-600 transition-colors"
              >
                Back to Login
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PinGate;
