import React from "react";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-[#1b1b2f]">
      <div className="w-full max-w-md mx-4">
        {children}
      </div>
    </div>
  );
}
