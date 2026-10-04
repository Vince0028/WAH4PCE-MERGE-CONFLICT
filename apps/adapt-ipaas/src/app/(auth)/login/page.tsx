"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import React, { useState } from "react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    // Bypassing actual login as requested
    setTimeout(() => {
      router.push("/");
      router.refresh();
    }, 500);
  };

  return (
    <div className="p-8 sm:p-10 shadow-xl rounded-2xl border border-slate-100 bg-white">
      <div className="text-center mb-8">
        <div className="w-32 h-32 mx-auto mb-5 flex items-center justify-center">
           <Image src="/WAH_logo.png" alt="WAH Logo" width={128} height={128} className="object-contain" priority />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-800 mb-2">Adapt System Portal</h1>
        <p className="text-sm text-slate-500 font-medium">
          Authorized personnel access only
        </p>
      </div>

      <form onSubmit={handleLogin} className="space-y-5">
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
            className="flex h-11 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
            required
            disabled={loading}
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
            className="flex h-11 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
            required
            disabled={loading}
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full h-11 mt-4 text-sm font-bold text-white bg-blue-600 rounded-lg shadow-sm hover:bg-blue-700 hover:shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
        >
          {loading ? "Authenticating..." : "Log in"}
        </button>
      </form>
    </div>
  );
}
