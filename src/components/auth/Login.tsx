import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  updateProfile, 
  sendPasswordResetEmail,
  sendEmailVerification 
} from 'firebase/auth';
import { auth } from '../../lib/firebase';
import { 
  Box, 
  AlertCircle, 
  ShieldCheck,
  ArrowRight,
  Github,
  Chrome
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
  const [rememberMe, setRememberMe] = useState(false);

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
      setError(err.message || "Failed to sign in with Google.");
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
      setSuccess("Password reset email sent! Please check your inbox.");
      setLoading(false);
    } catch (err: any) {
      setError(err.message || "Failed to send reset email.");
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
        await sendEmailVerification(userCredential.user);
        setSuccess("Account created! A verification email has been sent.");
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
      navigate('/', { replace: true });
    } catch (err: any) {
      setError(err.message || "Authentication failed.");
      setLoading(false);
    }
  };

  return (
    <div className="h-screen bg-white flex flex-col lg:flex-row overflow-hidden">
      {/* Left Side: Auth Form */}
      <div className="lg:w-[45%] flex flex-col p-6 lg:p-10 overflow-y-auto scrollbar-hide">
        {/* Logo */}
        <div className="flex items-center gap-3 mb-6 lg:mb-10 shrink-0">
          <div className="w-10 h-10 bg-black rounded-xl flex items-center justify-center shadow-lg border border-white/10 overflow-hidden">
            <svg viewBox="0 0 512 512" className="w-7 h-7">
              <defs>
                <linearGradient id="gold-login-refined" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" style={{stopColor:'#FDE68A',stopOpacity:1}} />
                  <stop offset="20%" style={{stopColor:'#B45309',stopOpacity:1}} />
                  <stop offset="50%" style={{stopColor:'#FDE68A',stopOpacity:1}} />
                  <stop offset="80%" style={{stopColor:'#92400E',stopOpacity:1}} />
                  <stop offset="100%" style={{stopColor:'#78350F',stopOpacity:1}} />
                </linearGradient>
              </defs>
              <g fill="url(#gold-login-refined)">
                <path d="M175 125h110c60 0 85 30 85 75s-25 75-85 75h-25v30c40 15 80 50 140 105-30-10-70-40-140-55v55 c0 20 15 25 35 25h15v15h-150v-15h15c20 0 35-5 35-25V165c0-20-15-25-35-25h-15v-15z M260 250c30 0 45-15 45-37s-15-37-45-37h-25v74h25z" />
                <path d="M140 230c100-15 150 40 300 180-80-40-140-90-300-35z" />
              </g>
            </svg>
          </div>
          <span className="text-xl font-black text-gray-900 tracking-tighter uppercase italic">RAFI</span>
        </div>

        <div className="max-w-md w-full mx-auto lg:mx-0 flex-1 flex flex-col justify-center">
          <div className="mb-4">
            <h2 className="text-3xl font-bold text-gray-900 mb-1">Welcome Back</h2>
            <p className="text-gray-500 font-medium text-sm">Please enter your details to sign in.</p>
          </div>

          {/* View Toggle Tabs */}
          <div className="flex border-b border-gray-100 mb-6 shrink-0">
            <button 
              onClick={() => setView('login')}
              className={`pb-3 px-2 text-sm font-bold transition-all relative ${view === 'login' ? 'text-gray-900' : 'text-gray-400'}`}
            >
              Login
              {view === 'login' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-gray-900" />}
            </button>
            <button 
              onClick={() => setView('signup')}
              className={`pb-3 px-8 text-sm font-bold transition-all relative ${view === 'signup' ? 'text-gray-900' : 'text-gray-400'}`}
            >
              Create Account
              {view === 'signup' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-gray-900" />}
            </button>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-100 rounded-xl flex items-center gap-3 text-red-600 text-xs animate-in fade-in slide-in-from-top-1">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <p className="font-bold">{error}</p>
            </div>
          )}

          {success && (
            <div className="mb-4 p-3 bg-green-50 border border-green-100 rounded-xl flex items-center gap-3 text-green-600 text-xs">
              <ShieldCheck className="w-4 h-4 shrink-0" />
              <p className="font-bold">{success}</p>
            </div>
          )}

          <div className="space-y-4">
            {view === 'forgot-password' ? (
              <form onSubmit={handleForgotPassword} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block ml-1">Email Address</label>
                  <input 
                    required
                    type="email"
                    placeholder="name@company.com"
                    className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:ring-4 focus:ring-gray-100 focus:border-gray-900 outline-none transition-all font-medium text-gray-900"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                  />
                </div>
                <button 
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 bg-[#006b44] text-white rounded-xl font-bold text-sm hover:bg-[#005a39] transition-all flex items-center justify-center gap-2 group"
                >
                  {loading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : 'Send Reset Link'}
                  {!loading && <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />}
                </button>
                <button 
                  type="button"
                  onClick={() => setView('login')}
                  className="w-full text-center text-xs font-bold text-gray-500 hover:text-gray-900 transition-colors"
                >
                  Back to Login
                </button>
              </form>
            ) : (
              <form onSubmit={handleEmailAuth} className="space-y-3">
                {view === 'signup' && (
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block ml-1">Full Name</label>
                    <input 
                      required
                      type="text"
                      placeholder="John Doe"
                      className="w-full px-4 py-2 bg-white border border-gray-200 rounded-xl focus:ring-4 focus:ring-gray-100 focus:border-gray-900 outline-none transition-all font-medium text-gray-900"
                      value={displayName}
                      onChange={e => setDisplayName(e.target.value)}
                    />
                  </div>
                )}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block ml-1">Email Address</label>
                  <input 
                    required
                    type="email"
                    placeholder="name@company.com"
                    className="w-full px-4 py-2 bg-white border border-gray-200 rounded-xl focus:ring-4 focus:ring-gray-100 focus:border-gray-900 outline-none transition-all font-medium text-gray-900"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block ml-1">Password</label>
                  <input 
                    required
                    type="password"
                    placeholder="••••••••"
                    className="w-full px-4 py-2 bg-white border border-gray-200 rounded-xl focus:ring-4 focus:ring-gray-100 focus:border-gray-900 outline-none transition-all font-medium text-gray-900"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                  />
                </div>

                {view === 'login' && (
                  <div className="flex items-center justify-between py-1">
                    <label className="flex items-center gap-2 cursor-pointer group">
                      <input 
                        type="checkbox" 
                        className="w-3.5 h-3.5 rounded border-gray-300 text-gray-900 focus:ring-gray-900"
                        checked={rememberMe}
                        onChange={e => setRememberMe(e.target.checked)}
                      />
                      <span className="text-xs font-medium text-gray-500 group-hover:text-gray-900 transition-colors">Remember me</span>
                    </label>
                    <button 
                      type="button"
                      onClick={() => setView('forgot-password')}
                      className="text-xs font-bold text-[#006b44] hover:text-[#005a39] transition-colors"
                    >
                      Forgot?
                    </button>
                  </div>
                )}

                <button 
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 bg-[#006b44] text-white rounded-xl font-bold text-sm hover:bg-[#005a39] transition-all flex items-center justify-center gap-2 group"
                >
                  {loading ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    view === 'login' ? 'Sign In' : 'Sign Up'
                  )}
                  {!loading && <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />}
                </button>
              </form>
            )}

            <div className="relative my-4">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-100"></div>
              </div>
              <div className="relative flex justify-center text-[10px] uppercase tracking-widest font-bold text-gray-400">
                <span className="bg-white px-4">Or continue with</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pb-2">
              <button 
                onClick={handleGoogleLogin}
                className="flex items-center justify-center gap-2 w-full py-2.5 bg-white border border-gray-200 rounded-xl font-bold text-gray-700 hover:bg-gray-50 transition-all font-sans text-xs"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.66l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                Google
              </button>
              <button className="flex items-center justify-center gap-2 w-full py-2.5 bg-white border border-gray-200 rounded-xl font-bold text-gray-700 hover:bg-gray-50 transition-all font-sans text-xs">
                <svg className="w-4 h-4" viewBox="0 0 384 512" fill="currentColor">
                  <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 21.8-88.5 21.8-11.4 0-51.1-19-81.6-19-47.5 0-101.4 34.5-123.8 81.3-17.7 37.1-11.5 125.7 36 211.5 14.4 25.8 44 65.6 77.4 65.6 28.5 0 35.4-18.7 70.8-18.7 34.6 0 41.2 18.7 70.7 18.7 35.8 0 62.1-36.9 76.7-65.6 24.3-44.6 34.5-88.3 34.7-90.5-.3-.2-67.4-26.2-67.7-106.5zm-38.6-180.7c16-20 26.8-47.8 23.8-75.6-23.9 1-52.9 16-72 38.3-17.1 19.8-31 46.4-26.2 75 25.4 2 52.8-16 74.4-37.7z"/>
                </svg>
                Apple
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Right Side: Branding & Image */}
      <div className="hidden lg:flex lg:w-[55%] bg-[#0f172a] relative overflow-hidden flex-col p-12">
        {/* Decorative elements */}
        <div className="absolute top-0 right-0 w-full h-full bg-gradient-to-br from-indigo-500/10 to-transparent pointer-events-none" />
        
        <div className="relative z-10 flex flex-col h-full">
          <div className="mb-8">
            <span className="inline-block px-3 py-1 bg-white/10 backdrop-blur-md rounded-lg text-emerald-400 text-[10px] font-bold tracking-wide border border-white/10 mb-6">
              Retail Excellence 2026
            </span>
            <h1 className="text-5xl font-bold text-white leading-tight tracking-tight mb-4">
              Manage Your <span className="text-emerald-400">Business</span> <br />
              <span className="text-emerald-400">Smarter</span>
            </h1>
            <p className="text-gray-400 text-base max-w-sm leading-relaxed font-medium">
              Everything you need to run your retail or hospitality business in one place. Real-time analytics and inventory tracking.
            </p>
          </div>

          {/* Product Mockup Container */}
          <div className="relative flex-1 mt-4">
            <div className="absolute top-8 left-0 w-full h-full bg-gradient-to-t from-[#0f172a] via-transparent to-transparent z-10" />
            
            {/* Tablet Mockup */}
            <div className="relative w-full max-w-2xl mx-auto aspect-[4/3] bg-gray-800 rounded-[2rem] p-3 shadow-2xl border-[10px] border-gray-900 transform translate-y-8 rotate-[-3deg] overflow-hidden">
              <div className="w-full h-full bg-[#0a0a0b] rounded-[1.25rem] overflow-hidden p-4">
                {/* Mock UI Content */}
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <div className="h-3 w-24 bg-white/10 rounded-full" />
                    <div className="h-6 w-6 bg-white/10 rounded-lg" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="h-24 bg-emerald-500/10 rounded-2xl border border-emerald-500/20" />
                    <div className="h-24 bg-white/5 rounded-2xl border border-white/10" />
                  </div>
                  <div className="h-32 bg-white/5 rounded-2xl border border-white/10" />
                </div>
              </div>
            </div>

            {/* Floating Revenue Card */}
            <div className="absolute top-0 right-4 z-20 bg-[#1e293b]/90 backdrop-blur-xl p-4 rounded-xl border border-white/10 shadow-2xl w-56 animate-in fade-in slide-in-from-right-10 duration-1000">
              <div className="flex justify-between items-start mb-2">
                <span className="text-gray-400 text-[10px] font-bold uppercase tracking-wider">Revenue</span>
                <div className="w-6 h-3 bg-emerald-500/20 rounded-full flex items-center justify-center">
                  <div className="w-1 h-1 bg-emerald-500 rounded-full mr-1" />
                </div>
              </div>
              <div className="text-2xl font-bold text-white mb-3">$24,592.00</div>
              <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 w-3/4 rounded-full" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
