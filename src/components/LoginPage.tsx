import React, { useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Building2,
  CheckCircle2,
  Eye,
  EyeOff,
  GraduationCap,
  Home,
  IdCard,
  Lock,
  LogOut,
  Mail,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  Users,
} from 'lucide-react';
import { DEMO_ACCOUNTS } from '../data/seedData';
import { useApp } from '../context/AppContext';

function CampusBannerHeader() {
  const [imgFailed, setImgFailed] = useState(false);

  return (
    <header className="relative w-full min-h-[160px] sm:min-h-[200px] py-8 sm:py-11 px-6 sm:px-10 bg-gradient-to-br from-blue-950 via-indigo-950 to-slate-950 overflow-hidden border-b border-slate-200 flex items-center">
      {!imgFailed && (
        <img
          src={`${import.meta.env.BASE_URL}assets/aistudio/image_2f658eee.png`}
          alt="PSNA College of Engineering and Technology campus building in Dindigul"
          referrerPolicy="no-referrer"
          onError={() => setImgFailed(true)}
          className="absolute inset-0 w-full h-full object-cover opacity-75"
        />
      )}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-r from-slate-950/80 via-blue-950/55 to-slate-950/75"
      />

      <div className="relative z-10 max-w-4xl mx-auto w-full flex flex-col sm:flex-row items-center justify-center text-center sm:text-left gap-4">
        <img
          src={`${import.meta.env.BASE_URL}assets/aistudio/image_c4857b41.png`}
          alt="PSNA College of Engineering and Technology crest and emblem"
          referrerPolicy="no-referrer"
          className="h-14 sm:h-16 w-auto max-w-full object-contain shrink-0 drop-shadow-md"
        />
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-semibold text-white tracking-tight truncate">
            PSNA Connect
          </h1>
          <p className="text-xs sm:text-sm text-blue-100 truncate">
            PSNA College of Engineering and Technology · Dindigul Campus Portal
          </p>
        </div>
      </div>
    </header>
  );
}

export function EmailVerificationScreen() {
  const {
    pendingVerification,
    authError,
    authNotice,
    loading,
    checkEmailVerification,
    resendVerificationEmail,
    verifyDemoEmailLink,
    logout,
  } = useApp();

  if (!pendingVerification) return null;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <CampusBannerHeader />
      <main className="flex-1 flex items-start justify-center p-4 sm:p-6">
        <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center shrink-0">
              <Mail className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Verify Your College Email</h2>
              <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                Portal access is locked until you verify your address:{' '}
                <span className="font-semibold text-slate-900">{pendingVerification.email}</span>
              </p>
            </div>
          </div>

          {pendingVerification.masterEntry && (
            <div className="rounded-xl bg-slate-50 border border-slate-200 p-3.5 text-xs space-y-1 text-slate-700">
              <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                <BadgeCheck className="w-4 h-4 text-blue-600" />
                <span>Verified Master Directory Match</span>
              </div>
              <div>
                Name: <span className="font-medium">{pendingVerification.masterEntry.name}</span> · ID:{' '}
                <span className="font-mono font-medium">
                  {pendingVerification.masterEntry.registerOrStaffId}
                </span>
              </div>
              <div>
                Department: <span className="font-medium">{pendingVerification.masterEntry.department}</span>
                {pendingVerification.masterEntry.className
                  ? ` · ${pendingVerification.masterEntry.className}`
                  : ''}
              </div>
              <div>
                Assigned Role:{' '}
                <span className="font-medium capitalize">
                  {pendingVerification.masterEntry.isWarden
                    ? `${pendingVerification.masterEntry.hostelType || 'Hostel'} Warden`
                    : pendingVerification.masterEntry.isHostel
                    ? `${pendingVerification.masterEntry.hostelType || 'Hostel'} Resident`
                    : pendingVerification.masterEntry.role}
                </span>
              </div>
            </div>
          )}

          {authError && (
            <div
              role="alert"
              className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-800"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
              <div className="flex-1 leading-snug">{authError}</div>
            </div>
          )}

          {authNotice && (
            <div
              role="status"
              className="flex items-start gap-2 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900"
            >
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
              <div className="flex-1 leading-snug">{authNotice}</div>
            </div>
          )}

          <div className="space-y-2 pt-1">
            {pendingVerification.mode === 'demo' ? (
              <button
                type="button"
                disabled={loading}
                onClick={verifyDemoEmailLink}
                className="w-full min-h-[42px] px-4 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-medium flex items-center justify-center gap-2 transition-colors"
              >
                <BadgeCheck className="w-4 h-4" />
                <span>Simulate Email Verification Link</span>
              </button>
            ) : (
              <button
                type="button"
                disabled={loading}
                onClick={checkEmailVerification}
                className="w-full min-h-[42px] px-4 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-medium flex items-center justify-center gap-2 transition-colors"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                <span>I&apos;ve Verified My Email — Continue</span>
              </button>
            )}

            <button
              type="button"
              disabled={loading}
              onClick={resendVerificationEmail}
              className="w-full min-h-[40px] px-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium flex items-center justify-center gap-2 transition-colors"
            >
              <Mail className="w-3.5 h-3.5" />
              <span>Resend Verification Link</span>
            </button>

            <button
              type="button"
              onClick={logout}
              className="w-full min-h-[40px] px-4 rounded-xl text-slate-600 hover:bg-slate-100 text-xs font-medium flex items-center justify-center gap-2 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out &amp; Return to Login</span>
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

export function DeactivatedAccountScreen() {
  const { currentUser, logout } = useApp();

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <CampusBannerHeader />
      <main className="flex-1 flex items-start justify-center p-4 sm:p-6">
        <div className="w-full max-w-md bg-white rounded-2xl border border-red-200 p-6 shadow-sm space-y-4 text-center">
          <div className="w-12 h-12 rounded-2xl bg-red-50 border border-red-200 flex items-center justify-center mx-auto">
            <ShieldAlert className="w-6 h-6 text-red-600" />
          </div>
          <div className="space-y-1.5">
            <h2 className="text-lg font-semibold text-slate-900">Account Deactivated</h2>
            <p className="text-xs text-slate-600 leading-relaxed">
              {currentUser ? `${currentUser.name}'s` : 'Your'} PSNA Connect account has been deactivated by College Management.
              All campus modules and data access are suspended until reactivated.
            </p>
          </div>
          <button
            type="button"
            onClick={logout}
            className="w-full min-h-[42px] px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium inline-flex items-center justify-center gap-2 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out</span>
          </button>
        </div>
      </main>
    </div>
  );
}

export function LoginPage() {
  const {
    loginDemoUser,
    loginWithEmail,
    signUpWithEmail,
    sendPasswordReset,
    loginWithGoogle,
    authError,
    authNotice,
    clearAuthError,
    clearAuthNotice,
    loading,
  } = useApp();

  const [mode, setMode] = useState<'signin' | 'signup' | 'forgot'>('signin');
  const [email, setEmail] = useState('');
  const [registerOrStaffId, setRegisterOrStaffId] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const switchMode = (next: 'signin' | 'signup' | 'forgot') => {
    setMode(next);
    setLocalError(null);
    clearAuthError();
    clearAuthNotice();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    clearAuthError();
    clearAuthNotice();

    if (mode === 'forgot') {
      await sendPasswordReset(email);
      return;
    }

    if (mode === 'signin') {
      await loginWithEmail(email, password);
      return;
    }

    if (password !== confirmPassword) {
      setLocalError('Passwords do not match.');
      return;
    }

    await signUpWithEmail(email, registerOrStaffId, password);
  };

  const roleIcon = (label: string) => {
    if (label.includes('Hostel Resident')) {
      return <Home className="w-4 h-4 text-indigo-600" />;
    }
    if (label.includes('Warden')) {
      return <ShieldCheck className="w-4 h-4 text-indigo-700" />;
    }
    switch (label) {
      case 'Student':
        return <GraduationCap className="w-4 h-4 text-blue-600" />;
      case 'Staff':
        return <UserCheck className="w-4 h-4 text-blue-700" />;
      default:
        return <Building2 className="w-4 h-4 text-slate-700" />;
    }
  };

  const displayedError = localError || authError;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <CampusBannerHeader />

      {/* Main Content: Centered Auth Form & Demo Switcher */}
      <main className="flex-1 flex items-start justify-center p-4 sm:p-6">
        <div className="w-full max-w-sm mx-auto space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5 shadow-sm space-y-3">
            <div>
              <h2 className="text-base sm:text-lg font-semibold text-slate-900 tracking-tight">
                {mode === 'signin'
                  ? 'Sign in to PSNA Connect'
                  : mode === 'signup'
                  ? 'Verified Campus Sign Up'
                  : 'Reset Campus Password'}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {mode === 'signin'
                  ? 'Sign in with verified college email, Google, or a demo role.'
                  : mode === 'signup'
                  ? 'Verify your @psnacet.edu.in email and Register No / Staff ID against Management records.'
                  : 'Enter your @psnacet.edu.in email to receive a password reset link.'}
              </p>
            </div>

            {/* Mode Toggle */}
            {mode !== 'forgot' && (
              <div className="grid grid-cols-2 gap-1 p-0.5 bg-slate-100 rounded-lg">
                <button
                  type="button"
                  onClick={() => switchMode('signin')}
                  className={`min-h-[32px] text-xs font-medium rounded-md transition-colors ${
                    mode === 'signin'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => switchMode('signup')}
                  className={`min-h-[32px] text-xs font-medium rounded-md transition-colors ${
                    mode === 'signup'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Verified Sign Up
                </button>
              </div>
            )}

            {displayedError && (
              <div
                role="alert"
                className="flex items-start gap-2 p-2.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800"
              >
                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-red-600" />
                <div className="flex-1 leading-snug">{displayedError}</div>
              </div>
            )}

            {authNotice && (
              <div
                role="status"
                className="flex items-start gap-2 p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-900"
              >
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5 text-emerald-600" />
                <div className="flex-1 leading-snug">{authNotice}</div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-2.5">
              {mode === 'signup' && (
                <div className="rounded-lg bg-blue-50/70 border border-blue-200 p-2.5 text-[11px] text-blue-950 leading-relaxed space-y-1">
                  <div className="font-semibold flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-blue-700 shrink-0" />
                    <span>Admin-Verified Onboarding</span>
                  </div>
                  <p>
                    Role, department, year, gender, and hostel eligibility are assigned automatically from Management&apos;s pre-approved directory. Email verification is required before sign-in.
                  </p>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  College Email Address
                </label>
                <div className="relative">
                  <Mail className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@psnacet.edu.in"
                    className="w-full h-9 pl-8.5 pr-3 rounded-lg border border-slate-200 bg-white text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                  />
                </div>
              </div>

              {mode === 'signup' && (
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Register Number / Staff ID
                  </label>
                  <div className="relative">
                    <IdCard className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      required
                      maxLength={32}
                      value={registerOrStaffId}
                      onChange={(e) => setRegisterOrStaffId(e.target.value.toUpperCase())}
                      placeholder="e.g. 921324104061 or PSNA-STF-015"
                      className="w-full h-9 pl-8.5 pr-3 rounded-lg border border-slate-200 bg-white text-xs font-mono uppercase text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                    />
                  </div>
                </div>
              )}

              {mode !== 'forgot' && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-medium text-slate-700">Password</label>
                    {mode === 'signin' && (
                      <button
                        type="button"
                        onClick={() => switchMode('forgot')}
                        className="text-[11px] font-medium text-blue-600 hover:text-blue-700"
                      >
                        Forgot password?
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <Lock className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={
                        mode === 'signin' ? 'Demo password: psna2026' : 'Minimum 6 characters'
                      }
                      className="w-full h-9 pl-8.5 pr-9 rounded-lg border border-slate-200 bg-white text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center text-slate-400 hover:text-slate-700"
                    >
                      {showPassword ? (
                        <EyeOff className="w-3.5 h-3.5" />
                      ) : (
                        <Eye className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>
              )}

              {mode === 'signup' && (
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Confirm Password
                  </label>
                  <div className="relative">
                    <Lock className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Re-enter password"
                      className="w-full h-9 pl-8.5 pr-3 rounded-lg border border-slate-200 bg-white text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                    />
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full h-9 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-xs font-medium flex items-center justify-center gap-1.5 transition-colors"
              >
                <span>
                  {mode === 'signin'
                    ? 'Sign In'
                    : mode === 'signup'
                    ? 'Verify & Send Activation Link'
                    : 'Send Password Reset Link'}
                </span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>

              {mode === 'forgot' && (
                <button
                  type="button"
                  onClick={() => switchMode('signin')}
                  className="w-full h-8 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back to Sign In</span>
                </button>
              )}
            </form>

            {mode === 'signup' && (
              <div className="rounded-lg bg-slate-50 border border-slate-200 p-2.5 text-[11px] text-slate-600 space-y-0.5">
                <div className="font-medium text-slate-800">Sample Pre-Approved Directory IDs (Test):</div>
                <div className="font-mono">921324104061 · anitha.cse@psnacet.edu.in</div>
                <div className="font-mono">921324106072 · rohan.ece@psnacet.edu.in</div>
                <div className="font-mono">PSNA-STF-015 · karthik.it@psnacet.edu.in</div>
              </div>
            )}

            <div className="relative flex items-center">
              <div className="flex-grow border-t border-slate-200" />
              <span className="mx-2.5 text-[11px] text-slate-400">or Cloud Firebase</span>
              <div className="flex-grow border-t border-slate-200" />
            </div>

            <button
              type="button"
              disabled={loading}
              onClick={loginWithGoogle}
              className="w-full h-9 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 text-xs font-medium flex items-center justify-center gap-2 transition-colors"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="#4285F4"
                  d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
                />
              </svg>
              <span>Sign in with Google</span>
            </button>
          </div>

          {/* 5-Role Quick Demo Account Switcher */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <div className="flex items-center justify-between mb-2.5">
              <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                <Users className="w-4 h-4 text-blue-600" />
                <span>Quick Demo-Account Switcher</span>
              </div>
              <span className="text-[11px] text-slate-500">1-click preview</span>
            </div>
            <div className="grid grid-cols-1 gap-1.5">
              {DEMO_ACCOUNTS.map((acc) => (
                <button
                  key={acc.uid}
                  type="button"
                  onClick={() => loginDemoUser(acc.uid)}
                  className="w-full min-h-[42px] px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50/40 text-left flex items-center justify-between gap-2.5 transition-colors group"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-7 h-7 rounded-md bg-slate-100 group-hover:bg-blue-100/70 flex items-center justify-center shrink-0 transition-colors">
                      {roleIcon(acc.label)}
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-slate-900 truncate">
                        {acc.label}
                      </div>
                      <div className="text-[11px] text-slate-500 truncate">{acc.subtitle}</div>
                    </div>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-600 shrink-0 transition-colors" />
                </button>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
