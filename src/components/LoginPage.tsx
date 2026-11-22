import React, { useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Building2,
  Eye,
  EyeOff,
  GraduationCap,
  Home,
  Lock,
  Mail,
  ShieldCheck,
  UserCheck,
  Users,
} from 'lucide-react';
import { DEMO_ACCOUNTS } from '../data/seedData';
import { useApp } from '../context/AppContext';
import { EffectiveRole } from '../types';

const DEPARTMENTS = [
  'Computer Science & Engineering',
  'Electronics & Communication',
  'Information Technology',
  'Mechanical Engineering',
  'Electrical & Electronics',
  'Civil Engineering',
];

export function LoginPage() {
  const {
    loginDemoUser,
    loginWithEmail,
    signUpWithEmail,
    loginWithGoogle,
    authError,
    clearAuthError,
    loading,
  } = useApp();

  const SIGNUP_ROLES: { id: EffectiveRole; label: string }[] = [
    { id: 'student', label: 'Student' },
    { id: 'hostel_resident', label: 'Hostel Resident' },
    { id: 'staff', label: 'Staff' },
    { id: 'warden', label: 'Warden' },
    { id: 'management', label: 'Management' },
  ];

  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [selectedRole, setSelectedRole] = useState<EffectiveRole>('student');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [department, setDepartment] = useState(DEPARTMENTS[0]);
  const [showPassword, setShowPassword] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);

  const selectedRoleLabel =
    SIGNUP_ROLES.find((r) => r.id === selectedRole)?.label || 'Student';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'signin') {
      await loginWithEmail(email, password);
    } else {
      await signUpWithEmail(name, email, password, department, selectedRole);
    }
  };

  const roleIcon = (label: string) => {
    switch (label) {
      case 'Student':
        return <GraduationCap className="w-4 h-4 text-blue-600" />;
      case 'Hostel Resident':
        return <Home className="w-4 h-4 text-indigo-600" />;
      case 'Staff':
        return <UserCheck className="w-4 h-4 text-blue-700" />;
      case 'Warden':
        return <ShieldCheck className="w-4 h-4 text-indigo-700" />;
      default:
        return <Building2 className="w-4 h-4 text-slate-700" />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Medium Top Campus Banner */}
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

      {/* Main Content: Centered Auth Form & Demo Switcher */}
      <main className="flex-1 flex items-start justify-center p-4 sm:p-6">
        <div className="w-full max-w-sm mx-auto space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5 shadow-sm space-y-3">
            <div>
              <h2 className="text-base sm:text-lg font-semibold text-slate-900 tracking-tight">
                {mode === 'signin'
                  ? 'Sign in to PSNA Connect'
                  : `Create ${selectedRoleLabel} Account`}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {mode === 'signin'
                  ? 'Sign in with email, Google, or a demo role.'
                  : 'Choose your role and register your campus account.'}
              </p>
            </div>

            {/* Mode Toggle */}
            <div className="grid grid-cols-2 gap-1 p-0.5 bg-slate-100 rounded-lg">
              <button
                type="button"
                onClick={() => {
                  setMode('signin');
                  clearAuthError();
                }}
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
                onClick={() => {
                  setMode('signup');
                  clearAuthError();
                }}
                className={`min-h-[32px] text-xs font-medium rounded-md transition-colors ${
                  mode === 'signup'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Sign Up (All Roles)
              </button>
            </div>

            {authError && (
              <div
                role="alert"
                className="flex items-start gap-2 p-2.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800"
              >
                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-red-600" />
                <div className="flex-1 leading-snug">{authError}</div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-2.5">
              {mode === 'signup' && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Account Role
                    </label>
                    <div className="grid grid-cols-2 gap-1.5">
                      {SIGNUP_ROLES.map((r) => {
                        const active = selectedRole === r.id;
                        return (
                          <button
                            key={r.id}
                            type="button"
                            onClick={() => setSelectedRole(r.id)}
                            className={`min-h-[32px] px-2.5 py-1 rounded-lg border text-xs font-medium text-left flex items-center gap-1.5 transition-colors ${
                              active
                                ? 'border-blue-600 bg-blue-50 text-blue-800'
                                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            {roleIcon(r.label)}
                            <span className="truncate">{r.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Full Name
                    </label>
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Subashree R"
                      className="w-full h-9 px-3 rounded-lg border border-slate-200 bg-white text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Department
                    </label>
                    <select
                      value={department}
                      onChange={(e) => setDepartment(e.target.value)}
                      className="w-full h-9 px-3 rounded-lg border border-slate-200 bg-white text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                    >
                      {DEPARTMENTS.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Email Address
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

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Password
                </label>
                <div className="relative">
                  <Lock className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={mode === 'signin' ? 'Demo password: psna2026' : 'Minimum 6 characters'}
                    className="w-full h-9 pl-8.5 pr-9 rounded-lg border border-slate-200 bg-white text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center text-slate-400 hover:text-slate-700"
                  >
                    {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full h-9 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-xs font-medium flex items-center justify-center gap-1.5 transition-colors"
              >
                <span>
                  {mode === 'signin' ? 'Sign In' : `Create ${selectedRoleLabel} Account`}
                </span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </form>

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
