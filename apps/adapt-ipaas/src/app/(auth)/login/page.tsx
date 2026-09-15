"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { useState } from "react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Login failed");
      } else {
        router.push("/");
        router.refresh();
      }
    } catch (err: any) {
      setError(err.message || "An error occurred during login.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8 sm:p-10 shadow-2xl rounded-xl border border-white/10 bg-[#2a2a45]">
      <div className="text-center mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-white mb-2">Welcome back</h1>
        <p className="text-sm text-[#a5a5c0]">
          Enter your email or username to sign in
        </p>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-md bg-red-500/10 border border-red-500/50 text-red-500 text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleLogin} className="space-y-4">
        <div className="space-y-1">
          <label
            htmlFor="email"
            className="text-sm font-medium leading-none text-[#e0e0f0]"
          >
            Email or Username
          </label>
          <input
            id="email"
            type="text"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@example.com"
            className="flex h-10 w-full rounded-md border border-white/10 bg-[#1b1b2f] px-3 py-2 text-sm text-white placeholder:text-[#a5a5c0]/50 focus:outline-none focus:border-[var(--color-accent-bright)] transition-colors"
            required
            disabled={loading}
          />
        </div>
        <div className="space-y-1">
          <label
            htmlFor="password"
            className="text-sm font-medium leading-none text-[#e0e0f0]"
          >
            Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="flex h-10 w-full rounded-md border border-white/10 bg-[#1b1b2f] px-3 py-2 text-sm text-white placeholder:text-[#a5a5c0]/50 focus:outline-none focus:border-[var(--color-accent-bright)] transition-colors"
            required
            disabled={loading}
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="ipaas-btn ipaas-btn-primary w-full h-10 mt-2 text-sm shadow-[0_4px_14px_0_rgba(124,58,237,0.39)] hover:shadow-[0_6px_20px_rgba(124,58,237,0.23)] hover:bg-[var(--color-accent-light)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Signing in..." : "Sign In"}
        </button>
      </form>

      <div className="text-center text-sm text-[#a5a5c0] mt-6">
        Don't have an account?{" "}
        <Link
          href="/register"
          className="text-[var(--color-accent-bright)] hover:text-white transition-colors font-medium"
        >
          Sign up
        </Link>
      </div>
    </div>
  );
}
