"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import React, { useState, useEffect } from "react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [lockoutUntil, setLockoutUntil] = useState<number | null>(null);
  const [remainingTime, setRemainingTime] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");
  const router = useRouter();

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (lockoutUntil) {
      interval = setInterval(() => {
        const timeLeft = Math.ceil((lockoutUntil - Date.now()) / 1000);
        if (timeLeft <= 0) {
          setLockoutUntil(null);
          setRemainingTime(0);
          setAttempts(0);
          setErrorMessage("");
        } else {
          setRemainingTime(timeLeft);
        }
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [lockoutUntil]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (lockoutUntil) return;

    setLoading(true);
    setErrorMessage("");

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      if (res.ok) {
        router.push("/");
        router.refresh();
      } else {
        const data = await res.json();
        const newAttempts = attempts + 1;
        setAttempts(newAttempts);
        
        if (newAttempts >= 3) {
          setLockoutUntil(Date.now() + 10000);
          setErrorMessage("Too many failed attempts. Please try again in 10 seconds.");
        } else {
          setErrorMessage(data.error || `Invalid credentials. ${3 - newAttempts} attempts remaining.`);
        }
      }
    } catch (error) {
      const newAttempts = attempts + 1;
      setAttempts(newAttempts);
      if (newAttempts >= 3) {
        setLockoutUntil(Date.now() + 10000);
        setErrorMessage("Too many failed attempts. Please try again in 10 seconds.");
      } else {
        setErrorMessage(`An error occurred. ${3 - newAttempts} attempts remaining.`);
      }
    } finally {
      setLoading(false);
    }
  };

  const isLocked = lockoutUntil !== null;

  return (
    <div className="p-8 sm:p-10 shadow-xl rounded-none border border-slate-100 bg-white">
      <div className="text-center mb-8">
        <div className="w-48 h-32 mx-auto mb-2 flex items-center justify-center overflow-hidden">
           <Image src="/WAH_logo.png" alt="WAH Logo" width={300} height={300} className="object-contain scale-[2] mix-blend-multiply" priority />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-800 mb-2">Adapt System Portal</h1>
        <p className="text-sm text-slate-500 font-medium">
          Authorized personnel access only
        </p>
      </div>

      <form onSubmit={handleLogin} className="space-y-5">
        {errorMessage && (
          <div className="p-3 bg-red-50 text-red-600 text-sm font-medium border border-red-100 text-center">
            {errorMessage}
            {isLocked && remainingTime > 0 && (
              <span className="block mt-1 font-bold">{remainingTime}s</span>
            )}
          </div>
        )}
        
        <div className="space-y-1.5">
          <label
            htmlFor="email"
            className="text-sm font-semibold leading-none text-slate-700"
          >
            Staff Email or ID
          </label>
          <input
            id="email"
            type="text"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="e.g., staff@hospital.com"
            className="flex h-11 w-full rounded-none border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all disabled:opacity-50"
            required
            disabled={loading || isLocked}
          />
        </div>
        <div className="space-y-1.5">
          <label
            htmlFor="password"
            className="text-sm font-semibold leading-none text-slate-700"
          >
            Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="flex h-11 w-full rounded-none border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all disabled:opacity-50"
            required
            disabled={loading || isLocked}
          />
        </div>
        <button
          type="submit"
          disabled={loading || isLocked}
          className="w-full h-11 mt-4 text-sm font-bold text-white bg-blue-600 rounded-none shadow-sm hover:bg-blue-700 hover:shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
        >
          {loading ? "Authenticating..." : isLocked ? `Locked (${remainingTime}s)` : "Log in"}
        </button>
      </form>
    </div>
  );
}
