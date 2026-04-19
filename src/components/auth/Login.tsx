import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  updateProfile, 
  sendPasswordResetEmail 
} from 'firebase/auth';
import { auth } from '../../lib/firebase';
import { 
  Box, 
  ShoppingCart, 
  Package, 
  BarChart3, 
  ShieldCheck, 
  AlertCircle, 
  Mail, 
  Lock, 
  User as UserIcon2 
} from 'lucide-react';

const Login = () => {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [view, setView] = useState<'login' | 'signup' | 'forgot-password'>('login');
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');

  const handleGoogleLogin = async () => {
    setError(null);
    setSuccess(null);
    setLoading(true);
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
      navigate('/', { replace: true });
    } catch (err: any) {
      if (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request' || err.code === 'auth/popup-blocked') {
        setLoading(false);
        return;
      }
      if (err.code === 'auth/network-request-failed') {
        setError("Network error: Please check your internet connection and ensure no ad-blockers are blocking Google services.");
        setLoading(false);
        return;
      }
      console.error("Login error:", err);
      setError(err.message || "Failed to sign in. Please try again.");
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    if (!email.trim()) {
      setError("Please enter your email address first.");
      setLoading(false);
      return;
    }

    try {
      await sendPasswordResetEmail(auth, email);
      setSuccess("Password reset email sent! Please check your inbox (and spam folder). Note: If you signed up with Google, you don't need a password reset.");
      setLoading(false);
    } catch (err: any) {
      console.error("Reset error:", err);
      let message = "Failed to send reset email. Please try again.";
      
      if (err.code === 'auth/user-not-found') {
        message = "No account found with this email address.";
      } else if (err.code === 'auth/invalid-email') {
        message = "Please enter a valid email address.";
      } else if (err.code === 'auth/too-many-requests') {
        message = "Too many requests. Please try again later.";
      } else if (err.message) {
        message = err.message;
      }
      
      setError(message);
      setLoading(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      if (view === 'signup') {
        if (!displayName.trim()) {
          throw new Error("Please enter your name");
        }
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(userCredential.user, { displayName });
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
      navigate('/', { replace: true });
    } catch (err: any) {
      console.error("Auth error:", err);
      let message = "Authentication failed. Please check your credentials.";
      
      if (err.code === 'auth/email-already-in-use') {
        message = "This email is already registered. We've switched you to the login screen.";
        setView('login');
      } else if (err.code === 'auth/network-request-failed') {
        message = "Network error: Please check your internet connection and ensure no ad-blockers are blocking Google services.";
      } else if (err.code === 'auth/weak-password') {
        message = "Password should be at least 6 characters.";
      } else if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        message = "Invalid email or password.";
      } else if (err.message) {
        message = err.message;
      }
      
      setError(message);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white flex flex-col-reverse lg:flex-row overflow-hidden">
      {/* Left Side: Branding & Value Prop (Bottom on mobile, Left on desktop) */}
      <div className="lg:w-1/2 bg-indigo-600 p-8 lg:p-16 flex flex-col justify-between text-white relative overflow-hidden shrink-0">
        <div className="absolute top-0 right-0 -translate-y-1/4 translate-x-1/4 w-96 h-96 bg-indigo-500 rounded-full blur-3xl opacity-50" />
        <div className="absolute bottom-0 left-0 translate-y-1/4 -translate-x-1/4 w-96 h-96 bg-indigo-700 rounded-full blur-3xl opacity-50" />
        
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-12">
            <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-xl">
              <Box className="w-7 h-7 text-indigo-600" />
            </div>
            <span className="text-2xl font-black tracking-tighter uppercase">Mini ERP</span>
          </div>

          <div className="max-w-md">
            <h1 className="text-5xl lg:text-7xl font-black mb-8 leading-[0.9] tracking-tighter uppercase italic">
              Empower Your <br />
              <span className="text-indigo-200">Business</span> <br />
              Growth
            </h1>
            <p className="text-indigo-100 text-lg font-medium leading-relaxed mb-12">
              The all-in-one platform for modern store management. Track inventory, manage sales, and grow your business with data-driven insights.
            </p>

            <div className="space-y-6">
              {[
                { icon: ShoppingCart, text: "Advanced POS & Sales Tracking" },
                { icon: Package, text: "Real-time Inventory Management" },
                { icon: BarChart3, text: "Comprehensive Financial Reports" },
                { icon: ShieldCheck, text: "Secure Multi-user Access" }
              ].map((feature, i) => (
                <div key={i} className="flex items-center gap-4 group">
                  <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center group-hover:bg-white/20 transition-colors">
                    <feature.icon className="w-5 h-5 text-indigo-200" />
                  </div>
                  <span className="font-bold text-sm uppercase tracking-widest">{feature.text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="relative z-10 mt-12 pt-8 border-t border-indigo-500/50 flex items-center justify-between">
          <div className="flex -space-x-3">
            {[1, 2, 3, 4].map(i => (
              <img 
                key={i}
                src={`https://i.pravatar.cc/100?img=${i + 10}`} 
                alt="User" 
                className="w-10 h-10 rounded-full border-2 border-indigo-600"
              />
            ))}
            <div className="w-10 h-10 rounded-full bg-indigo-500 border-2 border-indigo-600 flex items-center justify-center text-[10px] font-bold">
              +2k
            </div>
          </div>
          <p className="text-xs font-bold text-indigo-200 uppercase tracking-widest">Trusted by 2,000+ businesses</p>
        </div>
      </div>

      {/* Right Side: Auth Form */}
      <div className="lg:w-1/2 flex items-center justify-center p-8 lg:p-16 bg-gray-50 overflow-y-auto">
        <div className="max-w-md w-full py-8">
          <div className="mb-10">
            <h2 className="text-4xl font-black text-gray-900 mb-2 uppercase tracking-tighter italic">
              {view === 'login' ? 'Welcome Back' : view === 'signup' ? 'Get Started' : 'Reset Password'}
            </h2>
            <p className="text-gray-500 font-medium">
              {view === 'login' 
                ? 'Sign in to access your business dashboard.' 
                : view === 'signup'
                ? 'Create your account and start managing your business today.'
                : 'Enter your email to receive a password reset link.'}
            </p>
          </div>

          <div className="bg-white p-8 rounded-3xl shadow-xl shadow-gray-200/50 border border-gray-100">
            {error && (
              <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-2xl flex items-center gap-3 text-red-600 text-sm animate-in fade-in slide-in-from-top-2">
                <AlertCircle className="w-5 h-5 shrink-0" />
                <p className="font-bold">{error}</p>
              </div>
            )}

            {success && (
              <div className="mb-6 p-4 bg-green-50 border border-green-100 rounded-2xl flex items-center gap-3 text-green-600 text-sm animate-in fade-in slide-in-from-top-2">
                <ShieldCheck className="w-5 h-5 shrink-0" />
                <p className="font-bold">{success}</p>
              </div>
            )}

            {view === 'forgot-password' ? (
              <form onSubmit={handleForgotPassword} className="space-y-5">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Email Address</label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input 
                      required
                      type="email"
                      placeholder="name@company.com"
                      className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-bold text-sm"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                    />
                  </div>
                </div>

                <button 
                  type="submit"
                  disabled={loading}
                  className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 disabled:opacity-50 flex items-center justify-center"
                >
                  {loading ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    'Send Reset Link'
                  )}
                </button>

                <button 
                  type="button"
                  onClick={() => {
                    setView('login');
                    setError(null);
                    setSuccess(null);
                  }}
                  className="w-full text-center text-xs font-black text-indigo-600 uppercase tracking-widest hover:text-indigo-700 transition-colors"
                >
                  Back to Login
                </button>
              </form>
            ) : (
              <form onSubmit={handleEmailAuth} className="space-y-5">
                {view === 'signup' && (
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Full Name</label>
                    <div className="relative">
                      <UserIcon2 className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input 
                        required
                        type="text"
                        placeholder="John Doe"
                        className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-bold text-sm"
                        value={displayName}
                        onChange={e => setDisplayName(e.target.value)}
                      />
                    </div>
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Email Address</label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input 
                      required
                      type="email"
                      placeholder="name@company.com"
                      className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-bold text-sm"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between ml-1">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Password</label>
                    {view === 'login' && (
                      <button 
                        type="button"
                        onClick={() => {
                          setView('forgot-password');
                          setError(null);
                          setSuccess(null);
                        }}
                        className="text-[10px] font-black text-indigo-600 uppercase tracking-widest hover:text-indigo-700 transition-colors"
                      >
                        Forgot?
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input 
                      required
                      type="password"
                      placeholder="••••••••"
                      className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-bold text-sm"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                    />
                  </div>
                </div>

                <button 
                  type="submit"
                  disabled={loading}
                  className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 disabled:opacity-50 flex items-center justify-center"
                >
                  {loading ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    view === 'login' ? 'Sign In' : 'Create Account'
                  )}
                </button>
              </form>
            )}

            {view !== 'forgot-password' && (
              <>
                <div className="relative my-8">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gray-100"></div>
                  </div>
                  <div className="relative flex justify-center text-[10px] uppercase tracking-[0.3em] font-black text-gray-300">
                    <span className="bg-white px-4">Or continue with</span>
                  </div>
                </div>

                <button 
                  type="button"
                  onClick={handleGoogleLogin}
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-4 py-4 px-6 bg-white border-2 border-gray-100 rounded-2xl font-black text-gray-700 hover:bg-gray-50 hover:border-indigo-200 transition-all duration-300 group shadow-sm disabled:opacity-50"
                >
                  <img src="https://www.google.com/favicon.ico" alt="Google" className="w-6 h-6 group-hover:scale-110 transition-transform" />
                  <span className="uppercase tracking-widest text-xs">Google Account</span>
                </button>
              </>
            )}
          </div>

          <div className="mt-8 text-center">
            <p className="text-sm font-medium text-gray-500">
              {view === 'login' ? "Don't have an account?" : view === 'signup' ? "Already have an account?" : ""}
              {view !== 'forgot-password' && (
                <button 
                  type="button"
                  onClick={() => {
                    setView(view === 'login' ? 'signup' : 'login');
                    setError(null);
                    setSuccess(null);
                  }}
                  className="ml-2 text-indigo-600 font-black uppercase tracking-widest text-xs hover:text-indigo-700 transition-colors"
                >
                  {view === 'login' ? 'Sign Up' : 'Log In'}
                </button>
              )}
            </p>
          </div>

          <p className="mt-12 text-center text-[10px] font-bold text-gray-300 uppercase tracking-[0.2em] leading-relaxed">
            By continuing, you agree to our <br />
            <span className="text-gray-400">Terms of Service</span> & <span className="text-gray-400">Privacy Policy</span>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
