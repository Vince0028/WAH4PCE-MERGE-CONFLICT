'use client';
import { useState } from 'react';
import { signUpOrg, signInOrg } from '@/lib/supabase';

const FORMAT_OPTIONS = [
  {
    value: 'HL7V2' as const,
    label: 'HL7 v2.x',
    desc: 'Pipe-delimited message segments',
    className: 'selected-hl7v2',
    color: '#60a5fa',
  },
  {
    value: 'FHIR_R4' as const,
    label: 'FHIR R4',
    desc: 'JSON Bundle (PH Core)',
    className: 'selected-fhir',
    color: '#34d399',
  },
  {
    value: 'CDA_R2' as const,
    label: 'CDA R2',
    desc: 'XML Clinical Document',
    className: 'selected-cda',
    color: '#fbbf24',
  },
];

export default function LoginPage() {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [orgName, setOrgName] = useState('');
  const [orgCode, setOrgCode] = useState('');
  const [dataFormat, setDataFormat] = useState<'HL7V2' | 'FHIR_R4' | 'CDA_R2'>('HL7V2');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const result = await signInOrg(email, password);
    if (result.success) {
      window.location.href = '/';
    } else {
      setError(result.error || 'Login failed');
    }
    setLoading(false);
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    if (!orgName || !orgCode) {
      setError('Organization name and code are required');
      setLoading(false);
      return;
    }
    const result = await signUpOrg(email, password, orgName, orgCode, dataFormat);
    if (result.success) {
      setSuccess('Account created! You can now log in.');
      setMode('login');
    } else {
      setError(result.error || 'Signup failed');
    }
    setLoading(false);
  };

  return (
    <div className="login-container">
      <div className="login-card animate-fade-in">
        {/* Logo */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #7c3aed, #14b8a6)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
            </svg>
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">Health Data Exchange</h1>
            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Organization Portal — WAH4PCE ADAPT</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => { setMode('login'); setError(''); }}
            className={`tab-btn flex-1 ${mode === 'login' ? 'active' : ''}`}
          >
            Sign In
          </button>
          <button
            onClick={() => { setMode('signup'); setError(''); }}
            className={`tab-btn flex-1 ${mode === 'signup' ? 'active' : ''}`}
          >
            Register Organization
          </button>
        </div>

        {error && (
          <div className="mb-4 px-4 py-2.5 rounded-lg text-xs font-medium animate-fade-in" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171' }}>
            {error}
          </div>
        )}
        {success && (
          <div className="mb-4 px-4 py-2.5 rounded-lg text-xs font-medium animate-fade-in" style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', color: '#34d399' }}>
            {success}
          </div>
        )}

        {mode === 'login' ? (
          <form onSubmit={handleLogin}>
            <div className="space-y-4">
              <div>
                <label className="portal-label">Email</label>
                <input type="email" className="portal-input" value={email} onChange={e => setEmail(e.target.value)} placeholder="org@hospital.com" required />
              </div>
              <div>
                <label className="portal-label">Password</label>
                <input type="password" className="portal-input" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required />
              </div>
              <button type="submit" disabled={loading} className="portal-btn portal-btn-primary w-full py-2.5">
                {loading ? (
                  <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Signing in...</>
                ) : 'Sign In'}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleSignup}>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="portal-label">Organization Name</label>
                  <input type="text" className="portal-input" value={orgName} onChange={e => setOrgName(e.target.value)} placeholder="DOH iHOMIS Hospital" required />
                </div>
                <div>
                  <label className="portal-label">Org Code</label>
                  <input type="text" className="portal-input" value={orgCode} onChange={e => setOrgCode(e.target.value.toUpperCase())} placeholder="IHOMIS-001" required />
                </div>
              </div>
              <div>
                <label className="portal-label">Email</label>
                <input type="email" className="portal-input" value={email} onChange={e => setEmail(e.target.value)} placeholder="admin@hospital.com" required />
              </div>
              <div>
                <label className="portal-label">Password</label>
                <input type="password" className="portal-input" value={password} onChange={e => setPassword(e.target.value)} placeholder="Min. 6 characters" minLength={6} required />
              </div>

              {/* Data Format Selection */}
              <div>
                <label className="portal-label">Data Format</label>
                <p className="text-xs mb-3" style={{ color: 'var(--color-text-muted)' }}>Select your organization&apos;s health data format</p>
                <div className="grid grid-cols-3 gap-2">
                  {FORMAT_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setDataFormat(opt.value)}
                      className={`format-option ${dataFormat === opt.value ? opt.className : ''}`}
                    >
                      <div className="text-sm font-bold mb-0.5" style={{ color: dataFormat === opt.value ? opt.color : 'var(--color-text-primary)' }}>
                        {opt.label}
                      </div>
                      <div className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>{opt.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              <button type="submit" disabled={loading} className="portal-btn portal-btn-teal w-full py-2.5">
                {loading ? (
                  <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Registering...</>
                ) : 'Register Organization'}
              </button>
            </div>
          </form>
        )}

        <p className="text-xs text-center mt-5" style={{ color: 'var(--color-text-muted)' }}>
          WAH4PCE ADAPT LHIE Interoperability System
        </p>
      </div>
    </div>
  );
}
