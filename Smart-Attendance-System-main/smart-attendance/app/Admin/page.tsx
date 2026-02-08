"use client";

import { db } from "@/app/firebase-config";
import { collection, getDocs } from "firebase/firestore";
import { useEffect, useState } from "react";

import {
  BookOpen,
  CheckCircle,
  ClipboardCheck,
  GraduationCap,
  User,
  Users,
} from "lucide-react";

/* ----------------- 📊 Stat Card Component ------------------ */
const StatCard = ({
  title,
  value,
  icon,
  color = "blue",
}: {
  title: string;
  value: number | string;
  icon?: React.ReactNode;
  color?: string;
}) => (
  <div className="bg-white rounded-2xl p-5 shadow-sm border border-blue-100 flex flex-col justify-between hover:shadow-md transition-all">
    <div className="flex justify-between items-center mb-2">
      <span className="text-gray-600 text-sm font-medium">{title}</span>
      <div className={`text-blue-600 text-xl`}>{icon}</div>
    </div>
    <h2 className="text-3xl font-semibold text-gray-800">{value}</h2>
  </div>
);

/* ----------------- 🧾 Lecture Table Component ------------------ */
const LectureTable = ({
  data,
}: {
  data: {
    lectureName: string;
    subject: string;
    divisionName: string;
    teacherId: string;
    present: number;
    total: number;
  }[];
}) => (
  <div className="bg-white rounded-2xl shadow-sm border border-blue-100 overflow-hidden mt-8">
    <div className="p-4 border-b border-blue-100 bg-blue-50">
      <h3 className="font-semibold text-blue-700 text-lg">
        📚 Today's Lectures
      </h3>
    </div>
    <table className="w-full text-sm">
      <thead className="bg-blue-600 text-white text-left">
        <tr>
          <th className="p-3">Lecture</th>
          <th className="p-3">Subject</th>
          <th className="p-3">Division</th>
          <th className="p-3">Teacher</th>
          <th className="p-3 text-center">Present</th>
          <th className="p-3 text-center">Total</th>
        </tr>
      </thead>
      <tbody>
        {data.length > 0 ? (
          data.map((lec, idx) => (
            <tr key={idx} className="border-b border-blue-100 hover:bg-blue-50">
              <td className="p-3">{lec.lectureName}</td>
              <td className="p-3">{lec.subject}</td>
              <td className="p-3">{lec.divisionName}</td>
              <td className="p-3">{lec.teacherId}</td>
              <td className="p-3 text-center text-green-600 font-semibold">
                {lec.present}
              </td>
              <td className="p-3 text-center text-gray-700">{lec.total}</td>
            </tr>
          ))
        ) : (
          <tr>
            <td colSpan={6} className="p-4 text-center text-gray-400">
              No lectures conducted today.
            </td>
          </tr>
        )}
      </tbody>
    </table>
  </div>
);

/* ----------------- 📈 Main Dashboard Page ------------------ */
export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [todayLectures, setTodayLectures] = useState<any[]>([]);
  const [stats, setStats] = useState({
    students: 0,
    teachers: 0,
    admins: 0,
    classes: 0,
    lecturesToday: 0,
    totalPresent: 0,
    totalAbsent: 0,
  });

  useEffect(() => {
    const fetchData = async () => {
      const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
      let totalPresent = 0;
      let totalAbsent = 0;

      // Users
      const usersSnap = await getDocs(collection(db, "Users"));
      const users = usersSnap.docs.map((d) => d.data() as any);
      const students = users.filter((u) => u.Role === "Student").length;
      const teachers = users.filter((u) => u.Role === "Teacher").length;
      const admins = users.filter((u) => u.Role === "Admin").length;

      // Classes
      const classesSnap = await getDocs(collection(db, "Classes"));
      const classes = classesSnap.docs.length;

      // Lectures (today only)
      const lecturesSnap = await getDocs(collection(db, "lectures"));
      const todaysLectures: any[] = [];

      lecturesSnap.docs.forEach((doc) => {
        const data = doc.data();
        if (data.date?.startsWith(today)) {
          let present = 0;
          let absent = 0;
          const att = data.attendance || [];
          att.forEach((a: any) => {
            if (a.status === "present") present++;
            else absent++;
          });
          totalPresent += present;
          totalAbsent += absent;

          todaysLectures.push({
            lectureName: data.lectureName || "Untitled Lecture",
            subject: data.subject || "-",
            divisionName: data.divisionName || "-",
            teacherId: data.teacherId || "-",
            present,
            total: att.length,
          });
        }
      });

      setStats({
        students,
        teachers,
        admins,
        classes,
        lecturesToday: todaysLectures.length,
        totalPresent,
        totalAbsent,
      });

      setTodayLectures(todaysLectures);
      setLoading(false);
    };

    fetchData();
  }, []);

  if (loading)
    return (
      <div className="flex items-center justify-center h-screen text-blue-700 text-xl font-semibold">
        Loading dashboard...
      </div>
    );

  return (
    <main className="min-h-screen bg-blue-50 p-8">
      {/* Header */}
      <header className="mb-10">
        <h1 className="text-3xl font-bold text-gray-800 mb-2">
          🎯 Today's Academic Dashboard
        </h1>
        <p className="text-gray-600">
          Analytics for{" "}
          <span className="font-medium text-blue-700">
            {new Date().toDateString()}
          </span>
        </p>
      </header>

      {/* Stats Section */}
      <section className="grid xl:grid-cols-6 md:grid-cols-3 sm:grid-cols-2 gap-6">
        <StatCard title="Students" value={stats.students} icon={<Users />} />
        <StatCard
          title="Teachers"
          value={stats.teachers}
          icon={<GraduationCap />}
        />
        <StatCard title="Admins" value={stats.admins} icon={<User />} />
        <StatCard title="Classes" value={stats.classes} icon={<BookOpen />} />
        <StatCard
          title="Lectures Today"
          value={stats.lecturesToday}
          icon={<ClipboardCheck />}
        />
        <StatCard
          title="Present Today"
          value={stats.totalPresent}
          icon={<CheckCircle />}
          color="green"
        />
      </section>

      {/* Lectures Table */}
      <LectureTable data={todayLectures} />

      {/* Attendance Summary */}
      <section className="mt-10 bg-white p-6 rounded-2xl shadow-sm border border-blue-100">
        <h3 className="text-lg font-semibold text-blue-700 mb-3">
          📈 Attendance Summary
        </h3>
        <p className="text-gray-600">
          Total <b>{stats.totalPresent + stats.totalAbsent}</b> attendance
          entries today —{" "}
          <span className="text-green-600 font-medium">
            {stats.totalPresent}
          </span>{" "}
          present and{" "}
          <span className="text-red-500 font-medium">{stats.totalAbsent}</span>{" "}
          absent.
        </p>
      </section>
    </main>
  );
}