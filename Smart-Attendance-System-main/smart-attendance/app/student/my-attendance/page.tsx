"use client";

import { auth, db } from "@/app/firebase-config";
import { onAuthStateChanged } from "firebase/auth";
import { collection, getDocs, query, where } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

interface Lecture {
  id: string;
  attendance: Array<{
    studentId: string;
    status?: string;
    timestamp?: any;
  }>;
  classId: string;
  divisionId: string;
  divisionName: string;
  createdAt: any;
  date: string;
  day: string;
  endTime: string;
  lectureName: string;
  sectionKey: string;
  slotNumber: string;
  startTime: string;
  subject: string;
  subjectId: string;
  teacherId: string;
}

interface SubjectStats {
  subject: string;
  subjectId: string;
  count: number;
  totalClasses: number;
  percentage: number;
}

interface AttendanceRecord {
  date: string;
  day: string;
  subject: string;
  startTime: string;
  endTime: string;
  status: string;
  teacherId: string;
  divisionName: string;
  lectureName: string;
}

function StudentAttendance() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [studentData, setStudentData] = useState<any>(null);
  const [subjectStats, setSubjectStats] = useState<SubjectStats[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"stats" | "history">("stats");
  const [filterSubject, setFilterSubject] = useState<string>("all");

  // Get current logged-in student
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        fetchStudentData(currentUser.uid);
      } else {
        router.push("/login");
      }
    });
    return () => unsubscribe();
  }, [router]);

  // Fetch student data from Users collection
  const fetchStudentData = async (uid: string) => {
    try {
      const usersRef = collection(db, "Users");
      const q = query(usersRef, where("__name__", "==", uid));
      const snapshot = await getDocs(q);
      
      if (!snapshot.empty) {
        const userData = snapshot.docs[0].data();
        setStudentData(userData);
        console.log("Student data loaded:", {
          name: `${userData.name} ${userData.surname}`,
          class: userData.className,
          division: userData.divisionName,
          classId: userData.classId
        });
      } else {
        console.error("No student data found for user:", uid);
      }
    } catch (error) {
      console.error("Error fetching student data:", error);
    }
  };

  // Calculate attendance statistics and records
  const calculateAttendance = useCallback(async () => {
    if (!user || !studentData) return;
    
    setLoading(true);
    try {
      const lecturesQuery = query(collection(db, "lectures"));
      const snapshot = await getDocs(lecturesQuery);

      const subjectMap = new Map<string, { present: number; total: number }>();
      const records: AttendanceRecord[] = [];

      let totalLecturesChecked = 0;
      let matchingLectures = 0;

      snapshot.docs.forEach((docSnap) => {
        totalLecturesChecked++;
        const data = docSnap.data() as Lecture;
        
        // Check if this lecture is for the student's class AND division
        const isSameClass = data.classId === studentData.classId;
        const isSameDivision = data.divisionName === studentData.divisionName;
        
        if (!isSameClass || !isSameDivision) {
          return;
        }

        matchingLectures++;

        // Count total classes for this subject
        const subjectKey = data.subjectId;
        const current = subjectMap.get(subjectKey) || { present: 0, total: 0 };
        current.total += 1;
        subjectMap.set(subjectKey, current);

        // Check if student attended this lecture
        const attendanceRecord = data.attendance?.find((a: any) => a.studentId === user.uid);
        if (attendanceRecord) {
          current.present += 1;
          subjectMap.set(subjectKey, current);

          // Add to attendance records
          records.push({
            date: data.date,
            day: data.day,
            subject: data.subject,
            startTime: data.startTime,
            endTime: data.endTime,
            status: attendanceRecord.status || "present",
            teacherId: data.teacherId,
            divisionName: data.divisionName,
            lectureName: data.lectureName
          });
        }
      });

      console.log(`Attendance calculation: Checked ${totalLecturesChecked} lectures, found ${matchingLectures} for ${studentData.divisionName} division`);

      // Convert to array and calculate percentages
      const statsArray: SubjectStats[] = Array.from(subjectMap, ([subjectId, { present, total }]) => ({
        subjectId,
        subject: getSubjectName(subjectId),
        count: present,
        totalClasses: total,
        percentage: total > 0 ? Math.round((present / total) * 100) : 0
      })).sort((a, b) => b.percentage - a.percentage);

      // Sort records by date (newest first)
      records.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      setSubjectStats(statsArray);
      setAttendanceRecords(records);
      
      console.log("Final attendance stats:", statsArray);
      console.log("Final attendance records:", records.length);
    } catch (error) {
      console.error("Error calculating attendance:", error);
    } finally {
      setLoading(false);
    }
  }, [user, studentData]);

  // Get subject name from subjectId
  const getSubjectName = (subjectId: string): string => {
    const subjectNames: { [key: string]: string } = {
      "1761462357197": "Cyber Security",
      "1761462340831": "Computer Graphics",
      "1761462349403": "Compiler Design",
      "1761462376823": "Management",
      "1761460660368": "ICT"
    };
    return subjectNames[subjectId] || `Subject (${subjectId})`;
  };

  // Format time for display
  const formatTimeForDisplay = (timeString: string) => {
    if (!timeString) return "";
    const time = new Date(`2000-01-01T${timeString}`);
    return time.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  // Format date for display
  const formatDateForDisplay = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  useEffect(() => {
    if (user && studentData) {
      calculateAttendance();
    }
  }, [user, studentData, calculateAttendance]);

  const totalClassesAttended = subjectStats.reduce((sum, stat) => sum + stat.count, 0);
  const totalPossibleClasses = subjectStats.reduce((sum, stat) => sum + stat.totalClasses, 0);
  const overallPercentage = totalPossibleClasses > 0 
    ? Math.round((totalClassesAttended / totalPossibleClasses) * 100) 
    : 0;

  const filteredRecords = filterSubject === "all" 
    ? attendanceRecords 
    : attendanceRecords.filter(record => 
        subjectStats.find(stat => stat.subject === record.subject)?.subjectId === filterSubject
      );

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          <p className="text-blue-600 text-sm mt-4">Loading your attendance data...</p>
          <p className="text-blue-400 text-xs mt-2">
            for {studentData?.divisionName} division
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100 p-4">
      <div className="max-w-6xl mx-auto">
        
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-blue-800 mt-4">
            📊 Attendance Overview
          </h1>
          <p className="text-blue-600 text-lg mt-2">
            {studentData ? `${studentData.name} ${studentData.surname}` : "Student"}
          </p>
          <p className="text-blue-500 text-sm">
            {studentData?.className} • Division {studentData?.divisionName}
          </p>
          
          {/* Division Badge */}
          <div className="mt-3 bg-blue-100 border border-blue-300 rounded-lg px-4 py-2 inline-block">
            <span className="text-blue-700 text-sm font-medium">
              🏫 Viewing attendance for: <strong>Division {studentData?.divisionName}</strong>
            </span>
          </div>
        </div>

        {/* Overall Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-white/90 border border-blue-200 rounded-xl p-6 shadow-sm text-center hover:shadow-md transition-shadow">
            <div className="text-3xl font-bold text-blue-700">{totalClassesAttended}</div>
            <div className="text-blue-600 text-sm font-medium">Classes Attended</div>
            <div className="text-blue-400 text-xs mt-1">Division {studentData?.divisionName}</div>
          </div>
          <div className="bg-white/90 border border-blue-200 rounded-xl p-6 shadow-sm text-center hover:shadow-md transition-shadow">
            <div className="text-3xl font-bold text-blue-700">{totalPossibleClasses}</div>
            <div className="text-blue-600 text-sm font-medium">Total Classes</div>
            <div className="text-blue-400 text-xs mt-1">Division {studentData?.divisionName}</div>
          </div>
          <div className="bg-white/90 border border-blue-200 rounded-xl p-6 shadow-sm text-center hover:shadow-md transition-shadow">
            <div className="text-3xl font-bold text-blue-700">{overallPercentage}%</div>
            <div className="text-blue-600 text-sm font-medium">Overall Attendance</div>
            <div className="text-blue-400 text-xs mt-1">Division {studentData?.divisionName}</div>
            <div className={`w-full mt-3 h-2 rounded-full ${
              overallPercentage >= 75 ? "bg-green-500" : 
              overallPercentage >= 50 ? "bg-yellow-500" : "bg-red-500"
            }`}></div>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white/80 border border-blue-200 rounded-xl shadow-sm mb-6">
          <div className="flex border-b border-blue-200">
            <button
              onClick={() => setActiveTab("stats")}
              className={`flex-1 py-4 text-sm font-medium transition-colors ${
                activeTab === "stats" 
                  ? "text-blue-700 border-b-2 border-blue-600 bg-blue-50" 
                  : "text-blue-500 hover:text-blue-600 hover:bg-blue-25"
              }`}
            >
              📈 Subject Statistics
            </button>
            <button
              onClick={() => setActiveTab("history")}
              className={`flex-1 py-4 text-sm font-medium transition-colors ${
                activeTab === "history" 
                  ? "text-blue-700 border-b-2 border-blue-600 bg-blue-50" 
                  : "text-blue-500 hover:text-blue-600 hover:bg-blue-25"
              }`}
            >
              📋 Attendance History
            </button>
          </div>

          <div className="p-6">
            {activeTab === "stats" ? (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-blue-800">
                    Subject-wise Attendance
                  </h3>
                  <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-xs font-medium">
                    Division {studentData?.divisionName}
                  </span>
                </div>
                
                {subjectStats.length === 0 ? (
                  <div className="text-center py-8">
                    <div className="text-blue-400 text-4xl mb-4">📊</div>
                    <p className="text-blue-500 text-sm">No attendance records found for your division.</p>
                    <p className="text-blue-400 text-xs mt-2">
                      You are in <strong>Division {studentData?.divisionName}</strong> - only lectures for your division are shown
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {subjectStats.map((stat, index) => (
                      <div key={stat.subjectId} className="bg-white border border-blue-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                        <div className="flex justify-between items-center mb-2">
                          <h4 className="font-semibold text-blue-800 text-lg">{stat.subject}</h4>
                          <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                            stat.percentage >= 75 ? "bg-green-100 text-green-700" : 
                            stat.percentage >= 50 ? "bg-yellow-100 text-yellow-700" : "bg-red-100 text-red-700"
                          }`}>
                            {stat.percentage}%
                          </span>
                        </div>
                        <div className="flex justify-between items-center mb-3 text-sm text-blue-600">
                          <span className="flex items-center gap-1">
                            <span className="font-medium">{stat.count}</span> of <span className="font-medium">{stat.totalClasses}</span> classes attended
                          </span>
                          <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded-full text-xs">
                            Rank: #{index + 1}
                          </span>
                        </div>
                        <div className="w-full bg-blue-100 rounded-full h-3">
                          <div 
                            className={`h-3 rounded-full transition-all duration-500 ${
                              stat.percentage >= 75 ? "bg-green-500" : 
                              stat.percentage >= 50 ? "bg-yellow-500" : "bg-red-500"
                            }`}
                            style={{ width: `${stat.percentage}%` }}
                          ></div>
                        </div>
                        <div className="flex justify-between text-xs text-blue-400 mt-1">
                          <span>0%</span>
                          <span>100%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div>
                <div className="flex justify-between items-center mb-4">
                  <div className="flex items-center gap-3">
                    <h3 className="text-lg font-semibold text-blue-800">
                      Attendance History
                    </h3>
                    <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-xs font-medium">
                      Division {studentData?.divisionName}
                    </span>
                  </div>
                  <select 
                    value={filterSubject}
                    onChange={(e) => setFilterSubject(e.target.value)}
                    className="border border-blue-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    <option value="all">All Subjects</option>
                    {subjectStats.map(stat => (
                      <option key={stat.subjectId} value={stat.subjectId}>
                        {stat.subject}
                      </option>
                    ))}
                  </select>
                </div>
                
                {filteredRecords.length === 0 ? (
                  <div className="text-center py-8">
                    <div className="text-blue-400 text-4xl mb-4">📝</div>
                    <p className="text-blue-500 text-sm">
                      {filterSubject === "all" 
                        ? "No attendance records found for your division." 
                        : "No attendance records found for this subject."}
                    </p>
                    <p className="text-blue-400 text-xs mt-2">
                      You are in <strong>Division {studentData?.divisionName}</strong> - only lectures for your division are shown
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredRecords.map((record, index) => (
                      <div key={index} className="bg-white border border-blue-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-3 flex-wrap">
                              <span className="font-semibold text-blue-800 text-lg">{record.subject}</span>
                              <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                                record.status === "present" 
                                  ? "bg-green-100 text-green-700" 
                                  : "bg-red-100 text-red-700"
                              }`}>
                                {record.status.charAt(0).toUpperCase() + record.status.slice(1)}
                              </span>
                              <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-xs font-medium">
                                Division {record.divisionName}
                              </span>
                            </div>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-blue-600">
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-blue-400">📅</span>
                                  <span>{formatDateForDisplay(record.date)}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-blue-400">🕒</span>
                                  <span>{formatTimeForDisplay(record.startTime)} - {formatTimeForDisplay(record.endTime)}</span>
                                </div>
                              </div>
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-blue-400">📚</span>
                                  <span>{record.day}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-blue-400">👨‍🏫</span>
                                  <span className="truncate">Teacher ID: {record.teacherId.substring(0, 8)}...</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Summary Section */}
        {subjectStats.length > 0 && (
          <div className="bg-white/80 border border-blue-200 rounded-xl p-6 mb-6">
            <h3 className="text-lg font-semibold text-blue-800 mb-4">📋 Attendance Summary</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <h4 className="font-medium text-blue-700 mb-2">Subjects Overview</h4>
                <div className="space-y-2">
                  {subjectStats.map(stat => (
                    <div key={stat.subjectId} className="flex justify-between items-center text-sm">
                      <span className="text-blue-600">{stat.subject}</span>
                      <span className="font-medium text-blue-700">{stat.count}/{stat.totalClasses} ({stat.percentage}%)</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h4 className="font-medium text-blue-700 mb-2">Overall Performance</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-blue-600">Best Subject:</span>
                    <span className="font-medium text-green-600">
                      {subjectStats[0]?.subject} ({subjectStats[0]?.percentage}%)
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-blue-600">Needs Improvement:</span>
                    <span className="font-medium text-red-600">
                      {subjectStats[subjectStats.length - 1]?.subject} ({subjectStats[subjectStats.length - 1]?.percentage}%)
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-blue-600">Total Records:</span>
                    <span className="font-medium text-blue-700">{attendanceRecords.length} classes</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-center gap-3">
          <button
            onClick={() => router.push("/")}
            className="bg-blue-500 text-white px-6 py-3 rounded-lg text-sm font-medium shadow-sm hover:bg-blue-600 transition-colors flex items-center gap-2"
          >
            ← Back to Dashboard
          </button>
          <button
            onClick={() => window.location.reload()}
            className="bg-blue-100 text-blue-700 px-6 py-3 rounded-lg text-sm font-medium shadow-sm hover:bg-blue-200 transition-colors flex items-center gap-2"
          >
            🔄 Refresh Data
          </button>
        </div>

        {/* Footer Info */}
        <div className="text-center mt-8">
          <p className="text-blue-400 text-xs">
            Showing attendance data for <strong>Division {studentData?.divisionName}</strong> only • 
            Last updated: {new Date().toLocaleString()}
          </p>
        </div>
      </div>
    </div>
  );
}

export default StudentAttendance;