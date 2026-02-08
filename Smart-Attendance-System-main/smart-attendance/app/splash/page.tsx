"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function SplashScreen() {
  const router = useRouter();

  useEffect(() => {
    const timer = setTimeout(() => {
      router.push("/login"); // Redirect after 3 seconds
    }, 3000);
    return () => clearTimeout(timer);
  }, [router]);

  return (
    <div className="relative flex h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-blue-900 via-blue-700 to-blue-600">
      {/* Background Glow */}
      <div className="absolute inset-0 bg-gradient-to-tr from-blue-500/30 via-transparent to-blue-400/30 blur-3xl animate-pulse" />

      {/* Floating Logo Circle */}
      <div className="absolute w-72 h-72 bg-blue-400/10 rounded-full blur-3xl animate-pulse-slow" />

      {/* Center Content */}
      <div className="relative text-center">
        <h1 className="text-5xl md:text-6xl font-extrabold bg-gradient-to-r from-blue-200 via-blue-100 to-white bg-clip-text text-transparent drop-shadow-[0_0_25px_rgba(59,130,246,0.6)]">
          Smart Attendance System
        </h1>

        <p className="text-blue-100 mt-4 text-lg md:text-xl font-light tracking-wide">
          Transforming College Attendance with Smartness & Accuracy 🎓
        </p>

        {/* Elegant Loader */}
        <div className="mt-10 flex justify-center">
          <div className="w-12 h-12 border-4 border-t-transparent border-blue-300 rounded-full animate-spin" />
        </div>
      </div>

      <style jsx global>{`
        @keyframes pulse-slow {
          0%,
          100% {
            opacity: 0.3;
          }
          50% {
            opacity: 0.6;
          }
        }
        .animate-pulse-slow {
          animation: pulse-slow 3s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }
      `}</style>
    </div>
  );
}
