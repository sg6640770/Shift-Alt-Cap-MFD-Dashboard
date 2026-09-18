import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, Lock, Building2, Loader2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';


type Mode = 'signin' | 'signup' | 'reset';

export function LoginPage() {
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [partnerCode, setPartnerCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
    setResetSent(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    if (mode === 'reset') {
      try {
        const res = await fetch("https://shreyahubcredo.app.n8n.cloud/webhook-test/Reset-Link", {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email.trim() }),
        });

        if (!res.ok) {
          throw new Error(`Webhook responded with ${res.status}`);
        }

        setResetSent(true);
      } catch (err) {
        console.error('Reset link webhook failed:', err);
        setError('Something went wrong sending the reset link. Please try again.');
      } finally {
        setLoading(false);
      }
      return;
    }

    if (mode === 'signin') {
      const { error: err } = await signIn(email, password);
      if (err) {
        setError(err);
        setLoading(false);
      } else {
        navigate('/', { replace: true });
      }
    } else {
      // partnerCode is sent as-is (trimmed to null when blank). Whether it's
      // actually required depends on whether this becomes the first (admin)
      // account or a later (partner) one — that can only be decided server-side,
      // so we don't block submission here even if it's empty.
      const { error: err } = await signUp(email, password, partnerCode.trim() || null);
      if (err) {
        setError(err);
        setLoading(false);
      } else {
        setError(null);
        setLoading(false);
        setMode('signin');
        setEmail('');
        setPassword('');
        setPartnerCode('');
        alert('Account created successfully! Please sign in.');
      }
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-amber-50/40 px-4">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-2 mb-8">
          <img src="/brain.png" alt="BrainTree Capital" className="w-10 h-10 rounded-full object-cover" />
          <span className="text-xl font-bold text-gray-900">BrainTree Capital</span>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-amber-100 p-8">
          <h1 className="text-lg font-semibold text-gray-900 mb-1">
            {mode === 'signin' && 'Sign in to your account'}
            {mode === 'signup' && 'Create a new account'}
            {mode === 'reset' && 'Reset your password'}
          </h1>
          <p className="text-sm text-gray-500 mb-6">
            {mode === 'signin' && 'Enter your credentials to access the dashboard'}
            {mode === 'signup' && 'The first account created becomes the admin'}
            {mode === 'reset' && "Enter your email and we'll send you a reset link"}
          </p>

          {error && (
            <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {mode === 'reset' && resetSent ? (
            <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">
              Check your inbox for a password reset link.
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-10 pr-3 py-2.5 text-sm rounded-lg border border-gray-300 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none transition-colors"
                    placeholder="you@example.com"
                  />
                </div>
              </div>

              {mode !== 'reset' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="password"
                      required
                      minLength={6}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full pl-10 pr-3 py-2.5 text-sm rounded-lg border border-gray-300 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none transition-colors"
                      placeholder="••••••••"
                    />
                  </div>
                </div>
              )}

              {mode === 'signin' && (
                <div className="text-right -mt-2">
                  <button
                    type="button"
                    onClick={() => switchMode('reset')}
                    className="text-xs text-amber-600 hover:text-amber-700 font-medium"
                  >
                    Forgot password?
                  </button>
                </div>
              )}

              {mode === 'signup' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Partner Code
                    <span className="ml-1.5 text-xs font-normal text-gray-400">
                      (optional for the first account, required otherwise)
                    </span>
                  </label>
                  <div className="relative">
                    <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      value={partnerCode}
                      onChange={(e) => setPartnerCode(e.target.value.toUpperCase())}
                      className="w-full pl-10 pr-3 py-2.5 text-sm rounded-lg border border-gray-300 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none transition-colors"
                      placeholder="e.g. SHIFTALTCAP"
                    />
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 text-sm font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 disabled:opacity-60 transition-colors flex items-center justify-center gap-2"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                {mode === 'signin' && 'Sign In'}
                {mode === 'signup' && 'Create Account'}
                {mode === 'reset' && 'Send Reset Link'}
              </button>
            </form>
          )}

          <div className="mt-6 text-center text-sm text-gray-500">
            {mode === 'signin' && (
              <>
                Don&apos;t have an account?{' '}
                <button onClick={() => switchMode('signup')} className="text-amber-600 hover:text-amber-700 font-medium">
                  Sign up
                </button>
              </>
            )}
            {mode === 'signup' && (
              <>
                Already have an account?{' '}
                <button onClick={() => switchMode('signin')} className="text-amber-600 hover:text-amber-700 font-medium">
                  Sign in
                </button>
              </>
            )}
            {mode === 'reset' && (
              <button onClick={() => switchMode('signin')} className="text-amber-600 hover:text-amber-700 font-medium">
                Back to sign in
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
