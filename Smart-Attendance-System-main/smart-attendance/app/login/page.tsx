"use client";

import { auth, db } from "@/app/firebase-config";
import {
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
} from "firebase/auth";
import { doc, getDoc, serverTimestamp, updateDoc } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  // ✅ Unique Device ID (for student)
  const getDeviceId = () => {
    let id = localStorage.getItem("deviceId");
    if (!id) {
      id = Math.random().toString(36).substring(2) + Date.now();
      localStorage.setItem("deviceId", id);
    }
    return id;
  };

  // ✅ Auto Login Logic
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setLoading(false);
        return;
      }

      const userRef = doc(db, "Users", user.uid);
      const snap = await getDoc(userRef);

      if (snap.exists()) {
        const data = snap.data();
        const role = data.Role;
        const deviceId = data.deviceId;
        const currentDevice = getDeviceId();

        if (role === "Student" && deviceId && deviceId !== currentDevice) {
          await auth.signOut();
          setLoading(false);
          return;
        }

        // Redirect if already logged in ✅
        if (role === "Teacher") router.replace("/teacher");
        else if (role === "Student") router.replace("/student");
        else if (role === "Admin") router.replace("/Admin");
      }

      setLoading(false);
    });

    return () => unsub();
  }, [router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);

    try {
      const userCredential = await signInWithEmailAndPassword(
        auth,
        email,
        password
      );
      const user = userCredential.user;

      const userRef = doc(db, "Users", user.uid);
      const snap = await getDoc(userRef);

      if (!snap.exists()) {
        throw new Error("User record not found");
      }

      const data = snap.data();
      const role = data.Role;
      const storedDeviceId = data.deviceId;
      const currentDevice = getDeviceId();

      // ✅ Student device check
      if (role === "Student") {
        if (storedDeviceId && storedDeviceId !== currentDevice) {
          await auth.signOut();
          throw new Error("You are already logged in on another device!");
        }

        await updateDoc(userRef, {
          deviceId: currentDevice,
          lastActiveAt: serverTimestamp(),
        });
      }

      // ✅ Redirect by role
      if (role === "Teacher") router.push("/teacher");
      else if (role === "Student") router.push("/student");
      else if (role === "Admin") router.push("/Admin");
      else throw new Error("Invalid user role");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ✅ Forgot Password Handler
  const handleForgotPassword = async () => {
    setError("");
    setMessage("");

    if (!email) {
      setError("Please enter your email first to reset password.");
      return;
    }

    try {
      await sendPasswordResetEmail(auth, email, {
        url: "https://smart-attendance-system-pi.vercel.app/reset-password",
        handleCodeInApp: true,
      });

      setMessage("Password reset email sent! Check your inbox.");
    } catch (err: any) {
      setError(err.message);
    }
  };

  if (loading)
    return (
      <div className="flex justify-center items-center h-screen text-white">
        Loading...
      </div>
    );

  return (
    <div className="relative flex h-screen items-center justify-center overflow-hidden">
      <div
        className="hidden md:block absolute inset-0 bg-cover bg-center"
        style={{
          backgroundImage:
            "url('https://i.pinimg.com/1200x/e5/7e/32/e57e3206fa458c41ffe495f8823c4c58.jpg')",
        }}
      />
      <div
        className="md:hidden absolute inset-0 bg-cover bg-center"
        style={{
          backgroundImage:
            "url('https://i.pinimg.com/1200x/e7/3a/23/e73a232026ff37d37693d00cb2fde94b.jpg')",
        }}
      />

      <div className="absolute inset-0 bg-gradient-to-br from-blue-900/80 via-blue-700/70 to-blue-600/80" />

      <div className="relative bg-white/10 border border-white/20 shadow-2xl rounded-2xl p-8 w-[90%] max-w-sm text-white backdrop-blur-sm">
        <h2 className="text-3xl font-extrabold text-center mb-6 bg-gradient-to-r from-blue-200 to-white bg-clip-text text-transparent">
          Smart Attendance Login
        </h2>

        <form onSubmit={handleLogin} className="flex flex-col gap-5">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            className="w-full px-4 py-3 rounded-lg bg-white/20 border border-white/30 placeholder-white/70 text-white focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition-all"
          />

          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="w-full px-4 py-3 rounded-lg bg-white/20 border border-white/30 placeholder-white/70 text-white focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition-all"
          />

          {/* ✅ Forgot Password Link */}
          <button
            type="button"
            onClick={handleForgotPassword}
            className="text-sm text-blue-200 hover:text-blue-400 transition-all text-right"
          >
            Forgot Password?
          </button>

          {error && (
            <p className="text-red-300 text-sm text-center bg-red-500/20 py-2 rounded-lg">
              {error}
            </p>
          )}
          {message && (
            <p className="text-green-300 text-sm text-center bg-green-500/20 py-2 rounded-lg">
              {message}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-lg font-semibold transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
          >
            {loading ? "Signing In..." : "Sign In"}
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-blue-200 text-sm">
            Secure login for students, teachers, and administrators
          </p>
        </div>
      </div>
    </div>
  );
}
