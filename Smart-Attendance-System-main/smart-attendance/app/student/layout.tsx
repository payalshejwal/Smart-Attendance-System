"use client";

import { auth, db } from "@/app/firebase-config";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";
import {
  // HiBell,
  HiBookOpen,
  HiCalendar,
  HiChevronLeft,
  HiChevronRight,
  HiHome,
  HiLogout,
  HiMenu,
  HiX,
} from "react-icons/hi";

interface StudentLayoutProps {
  children: ReactNode;
}

export default function StudentLayout({ children }: StudentLayoutProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isDesktopMinimized, setIsDesktopMinimized] = useState(false);
  const [studentName, setStudentName] = useState("Student");
  const [studentInitials, setStudentInitials] = useState("S");

  // Use usePathname to get current path and set active link
  const pathname = usePathname();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const userDoc = await getDoc(doc(db, "Users", user.uid));
          if (userDoc.exists()) {
            const data = userDoc.data();
            if (data.Role === "Student") {
              const name = data.name || "Student";
              setStudentName(name);

              const nameParts = name.split(" ");
              const initials = nameParts
                .map((part: string) => part[0])
                .join("")
                .toUpperCase()
                .slice(0, 2);
              setStudentInitials(initials);
            } else {
              console.warn("Not a Student User!");
            }
          }
        } catch (error) {
          console.error("Error fetching student data:", error);
        }
      }
    });

    return () => unsubscribe();
  }, []);

  const navLinks = [
    { href: "/student", label: "Dashboard", icon: HiHome },
    {
      href: "/student/my-attendance",
      label: "My Attendance",
      icon: HiBookOpen,
    },
    { href: "/student/timetable", label: "Timetable", icon: HiCalendar },
    // { href: "/student/profile", label: "Profile", icon: HiUserCircle },
  ];

  return (
    <div className="flex h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-cyan-50 overflow-hidden">
      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 z-50 h-full flex flex-col transition-all duration-300 ease-in-out shadow-2xl backdrop-blur-xl
          md:static md:translate-x-0 md:opacity-100
          ${
            isSidebarOpen
              ? "translate-x-0 opacity-100 w-64"
              : "translate-x-[-100%] opacity-0 w-64"
          }
          ${isDesktopMinimized ? "md:w-16" : "md:w-64"}
          bg-gradient-to-b from-blue-900 via-blue-800 to-blue-700/95 rounded-r-xl`}
      >
        {/* Logo */}
        <div
          className={`px-4 py-3 border-b border-white/20 transition-all ${
            isDesktopMinimized ? "md:px-2" : ""
          } ${!isSidebarOpen ? "opacity-0" : "opacity-100"} md:opacity-100`}
        >
          <div
            className={`flex items-center gap-3 ${
              isDesktopMinimized ? "md:justify-center" : ""
            }`}
          >
            <div
              className={`rounded-xl bg-gradient-to-br from-blue-400 to-cyan-400 shadow-lg flex items-center justify-center
                ${
                  isDesktopMinimized ? "md:w-10 md:h-10" : "w-12 h-12"
                } text-xl animate-fadeIn`}
            >
              👨‍🎓
            </div>
            {!isDesktopMinimized && (
              <div>
                <h1 className="text-white font-bold text-lg leading-tight">
                  Student Panel
                </h1>
                <p className="text-blue-300 text-xs"></p>
              </div>
            )}
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex flex-col gap-1 flex-1 overflow-y-auto p-2">
          {navLinks.map((link) => {
            const Icon = link.icon;
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => {
                  setIsSidebarOpen(false);
                }}
                className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-300
                ${isDesktopMinimized ? "md:justify-center md:px-2" : ""}
                ${!isSidebarOpen ? "opacity-0" : "opacity-100"} md:opacity-100
                ${
                  isActive
                    ? "bg-gradient-to-r from-blue-400 to-cyan-400 text-white shadow-xl"
                    : "text-blue-100 hover:bg-blue-800/40 hover:text-white"
                }`}
                title={isDesktopMinimized ? link.label : ""}
              >
                <Icon className="text-lg flex-shrink-0" />
                {!isDesktopMinimized && (
                  <span className="truncate">{link.label}</span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* User Card */}
        <div
          className={`p-3 border-t border-white/20 ${
            isDesktopMinimized ? "md:p-2" : ""
          } ${!isSidebarOpen ? "opacity-0" : "opacity-100"} md:opacity-100`}
        >
          <div
            className={`flex items-center gap-2 mb-2 ${
              isDesktopMinimized ? "md:flex-col md:gap-1" : ""
            }`}
          >
            <div
              className={`rounded-full bg-gradient-to-br from-blue-300 to-cyan-300 text-blue-900 font-bold flex items-center justify-center
              ${
                isDesktopMinimized
                  ? "md:w-10 md:h-10 md:text-xs"
                  : "w-10 h-10 text-xs"
              } shadow-lg`}
            >
              {studentInitials}
            </div>
            {!isDesktopMinimized && (
              <div className="flex-1 min-w-0">
                <p className="text-white font-semibold text-xs truncate">
                  {studentName}
                </p>
                <p className="text-blue-300 text-[10px]">Student</p>
              </div>
            )}
          </div>
          <button
            onClick={() => signOut(auth)}
            className={`w-full flex items-center justify-center gap-1.5 rounded-xl bg-blue-700/50 hover:bg-blue-700 text-white text-xs font-medium transition-all
              ${
                isDesktopMinimized ? "md:px-2 md:py-1.5 px-3 py-2" : "px-3 py-2"
              }`}
          >
            <HiLogout className="text-sm" />
            {!isDesktopMinimized && <span>Logout</span>}
          </button>
        </div>
      </aside>

      {/* Mobile overlay */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Header + Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="flex items-center justify-between bg-white/90 backdrop-blur-xl px-3 py-2.5 border-b border-blue-200/50 shadow-sm">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="text-blue-700 text-xl md:hidden hover:bg-blue-100 p-1.5 rounded-lg transition-colors"
            >
              {isSidebarOpen ? <HiX /> : <HiMenu />}
            </button>

            <button
              onClick={() => setIsDesktopMinimized(!isDesktopMinimized)}
              className="hidden md:flex text-blue-700 text-lg hover:bg-blue-100 p-1.5 rounded-lg transition-colors"
            >
              {isDesktopMinimized ? <HiChevronRight /> : <HiChevronLeft />}
            </button>

            <h1 className="text-base md:text-lg font-bold text-blue-700">
              Student Dashboard
            </h1>
          </div>

          <div className="flex items-center gap-2">
            {/* <button className="relative p-1.5 rounded-lg hover:bg-blue-100 transition-colors">
              <HiBell className="text-lg text-blue-700" />
              <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 bg-red-500 rounded-full ring-1 ring-white"></span>
            </button> */}

            <div className="hidden md:flex items-center gap-1.5 pl-2 border-l border-blue-200">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-cyan-400 flex items-center justify-center text-white font-bold text-xs shadow">
                {studentInitials}
              </div>
              <div className="hidden lg:block">
                <p className="text-xs font-semibold text-blue-900 leading-tight">
                  {studentName}
                </p>
                <p className="text-[10px] text-blue-600">Student</p>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-auto">
          <div className="h-full">{children}</div>
        </main>
      </div>

      <style jsx global>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fadeIn {
          animation: fadeIn 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}
