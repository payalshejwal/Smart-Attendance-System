"use client";

import { auth, db } from "@/app/firebase-config";
import { onAuthStateChanged } from "firebase/auth";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface TimetableSlot {
  slotTime?: {
    startTime: string;
    endTime: string;
  };
  subjectId: string | null;
  teacherId: string | null;
}

interface DayTimetable {
  [key: string]: TimetableSlot;
}

interface DivisionTimetable {
  [key: string]: DayTimetable;
}

interface ClassData {
  name: string;
  divisions: Array<{
    id: string;
    name: string;
  }>;
  subjects: Array<{
    id: string;
    name: string;
    teachers?: {
      [key: string]: string;
    };
  }>;
  teachers?: {
    [key: string]: string;
  };
  timetable?: {
    [key: string]: DivisionTimetable;
  };
  createdAt?: string;
}

interface Teacher {
  name: string;
  surname: string;
}

// Default slot times based on your Firestore data
const DEFAULT_SLOT_TIMES: { [key: number]: { startTime: string; endTime: string } } = {
  1: { startTime: "10:00", endTime: "11:00" },
  2: { startTime: "11:00", endTime: "12:00" },
  3: { startTime: "12:45", endTime: "13:45" },
  4: { startTime: "13:45", endTime: "14:45" },
  5: { startTime: "15:00", endTime: "16:00" },
  6: { startTime: "16:00", endTime: "17:00" },
  7: { startTime: "17:00", endTime: "18:00" },
  8: { startTime: "18:00", endTime: "19:00" },
};

function StudentTimetable() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [studentData, setStudentData] = useState<any>(null);
  const [classData, setClassData] = useState<ClassData | null>(null);
  const [teachers, setTeachers] = useState<{[key: string]: Teacher}>({});
  const [loading, setLoading] = useState(true);
  const [currentWeek, setCurrentWeek] = useState(new Date());
  const [viewMode, setViewMode] = useState<"weekly" | "daily">("weekly");

  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const daysFull = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

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

  // Fetch student data
  const fetchStudentData = async (uid: string) => {
    try {
      const usersRef = collection(db, "Users");
      const q = query(usersRef, where("__name__", "==", uid));
      const snapshot = await getDocs(q);
      
      if (!snapshot.empty) {
        const userData = snapshot.docs[0].data();
        setStudentData(userData);
        await fetchClassData(userData.classId);
      } else {
        setLoading(false);
      }
    } catch (error) {
      console.error("Error fetching student data:", error);
      setLoading(false);
    }
  };

  // Fetch class data
  const fetchClassData = async (classId: string) => {
    try {
      const classDoc = await getDoc(doc(db, "Classes", classId));
      if (classDoc.exists()) {
        const data = classDoc.data() as ClassData;
        setClassData(data);
        await fetchTeachers(data);
      } else {
        setLoading(false);
      }
    } catch (error) {
      console.error("Error fetching class data:", error);
      setLoading(false);
    }
  };

  // Fetch teacher details with safe access
  const fetchTeachers = async (classData: ClassData) => {
    try {
      const teacherIds = new Set<string>();
      
      // Safe collection of teacher IDs from class teachers
      if (classData.teachers && typeof classData.teachers === 'object') {
        Object.values(classData.teachers).forEach(teacherId => {
          if (teacherId && typeof teacherId === 'string') {
            teacherIds.add(teacherId);
          }
        });
      }

      // Also check teachers in subjects
      if (classData.subjects && Array.isArray(classData.subjects)) {
        classData.subjects.forEach(subject => {
          if (subject && typeof subject === 'object' && subject.teachers) {
            Object.values(subject.teachers).forEach(teacherId => {
              if (teacherId && typeof teacherId === 'string') {
                teacherIds.add(teacherId);
              }
            });
          }
        });
      }

      // Also extract teacher IDs from timetable
      if (classData.timetable && typeof classData.timetable === 'object') {
        Object.values(classData.timetable).forEach(divisionTimetable => {
          if (divisionTimetable && typeof divisionTimetable === 'object') {
            Object.values(divisionTimetable).forEach(dayTimetable => {
              if (dayTimetable && typeof dayTimetable === 'object') {
                Object.values(dayTimetable).forEach(slot => {
                  if (slot && slot.teacherId && typeof slot.teacherId === 'string') {
                    teacherIds.add(slot.teacherId);
                  }
                });
              }
            });
          }
        });
      }

      // Fetch teacher details
      const teachersData: {[key: string]: Teacher} = {};
      const fetchPromises = Array.from(teacherIds).map(async (teacherId) => {
        try {
          const teacherDoc = await getDoc(doc(db, "Users", teacherId));
          if (teacherDoc.exists()) {
            const teacher = teacherDoc.data();
            teachersData[teacherId] = {
              name: teacher.name || "Unknown",
              surname: teacher.surname || "Teacher"
            };
          }
        } catch (error) {
          console.error(`Error fetching teacher ${teacherId}:`, error);
        }
      });

      await Promise.all(fetchPromises);
      setTeachers(teachersData);
    } catch (error) {
      console.error("Error fetching teachers:", error);
    } finally {
      setLoading(false);
    }
  };

  // Get subject name by ID with safe access
  const getSubjectName = (subjectId: string | null): string => {
    if (!subjectId || !classData || !classData.subjects) return "Free";
    
    try {
      const subject = classData.subjects.find(sub => sub && sub.id === subjectId);
      return subject?.name || "Unknown Subject";
    } catch (error) {
      console.error("Error getting subject name:", error);
      return "Unknown Subject";
    }
  };

  // Get teacher name by ID with safe access
  const getTeacherName = (teacherId: string | null): string => {
    if (!teacherId || !teachers[teacherId]) return "-";
    
    try {
      const teacher = teachers[teacherId];
      return `${teacher.name} ${teacher.surname}`;
    } catch (error) {
      console.error("Error getting teacher name:", error);
      return "-";
    }
  };

  // Get slot time with fallback to default
  const getSlotTime = (slot: TimetableSlot, slotNumber: number) => {
    if (slot.slotTime && slot.slotTime.startTime && slot.slotTime.endTime) {
      return slot.slotTime;
    }
    return DEFAULT_SLOT_TIMES[slotNumber] || { startTime: "00:00", endTime: "00:00" };
  };

  // Get current day's timetable with safe access
  const getCurrentDayTimetable = () => {
    if (!classData || !studentData || !classData.timetable || !studentData.divisionId) return null;
    
    try {
      const divisionTimetable = classData.timetable[studentData.divisionId];
      if (!divisionTimetable) return null;

      const today = new Date().getDay();
      const adjustedDay = today === 0 ? 5 : today - 1;
      const todayKey = days[adjustedDay];
      
      return divisionTimetable[todayKey] || null;
    } catch (error) {
      console.error("Error getting current day timetable:", error);
      return null;
    }
  };

  // Get slots for a specific day with safe access
  const getDaySlots = (day: string) => {
    if (!classData || !studentData || !classData.timetable || !studentData.divisionId) return [];
    
    try {
      const divisionTimetable = classData.timetable[studentData.divisionId];
      if (!divisionTimetable || !divisionTimetable[day]) return [];

      const dayTimetable = divisionTimetable[day];
      if (typeof dayTimetable !== 'object') return [];

      return Object.entries(dayTimetable)
        .filter(([key, value]) => 
          key && 
          value && 
          typeof value === 'object'
        )
        .sort(([a], [b]) => parseInt(a) - parseInt(b));
    } catch (error) {
      console.error("Error getting day slots:", error);
      return [];
    }
  };

  // Get all available slot numbers from the timetable
  const getAllSlotNumbers = (): number[] => {
    const slotNumbers = new Set<number>();
    
    if (!classData?.timetable?.[studentData?.divisionId]) return [1, 2, 3, 4, 5, 6, 7, 8];

    try {
      Object.values(classData.timetable[studentData.divisionId]).forEach(dayTimetable => {
        if (dayTimetable && typeof dayTimetable === 'object') {
          Object.keys(dayTimetable).forEach(slotNumber => {
            const num = parseInt(slotNumber);
            if (!isNaN(num)) {
              slotNumbers.add(num);
            }
          });
        }
      });
    } catch (error) {
      console.error("Error getting slot numbers:", error);
    }

    return Array.from(slotNumbers).sort((a, b) => a - b);
  };

  // Get sample slot for time display
  const getSampleSlot = (slotNumber: number): TimetableSlot | null => {
    if (!classData?.timetable?.[studentData?.divisionId]) return null;

    try {
      for (const day of days) {
        const dayTimetable = classData.timetable[studentData.divisionId]?.[day];
        if (dayTimetable?.[slotNumber]) {
          return dayTimetable[slotNumber];
        }
      }
    } catch (error) {
      console.error("Error getting sample slot:", error);
    }

    return null;
  };

  // Check if a slot is the current ongoing class
  const isCurrentSlot = (day: string, slot: TimetableSlot, slotNumber: number) => {
    try {
      const today = new Date();
      const currentDay = today.getDay();
      const adjustedCurrentDay = currentDay === 0 ? 5 : currentDay - 1;
      const currentDayKey = days[adjustedCurrentDay];

      if (day !== currentDayKey) return false;

      const now = today.getHours() * 60 + today.getMinutes();
      const slotTime = getSlotTime(slot, slotNumber);
      
      const [startHour, startMinute] = slotTime.startTime.split(':').map(Number);
      const [endHour, endMinute] = slotTime.endTime.split(':').map(Number);
      
      const startTime = startHour * 60 + startMinute;
      const endTime = endHour * 60 + endMinute;

      return now >= startTime && now <= endTime;
    } catch (error) {
      console.error("Error checking current slot:", error);
      return false;
    }
  };


  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          <p className="text-blue-600 text-sm mt-4">Loading your timetable...</p>
        </div>
      </div>
    );
  }

  const currentDayTimetable = getCurrentDayTimetable();
  const slotNumbers = getAllSlotNumbers();

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100 p-4">
      <div className="max-w-7xl mx-auto">
        
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-blue-800 mt-4">
            📅 Class Timetable
          </h1>
          <p className="text-blue-600 text-sm mt-2">
            {studentData ? `${studentData.className} ${studentData.divisionName}` : "Student Timetable"}
          </p>
        </div>

        {/* Today's Overview Card */}
        {currentDayTimetable && Object.keys(currentDayTimetable).length > 0 && (
          <div className="bg-white/90 border border-blue-200 rounded-xl p-6 shadow-sm mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-blue-800">Today's Schedule</h2>
              <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-sm font-medium">
                {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Object.entries(currentDayTimetable)
                .sort(([a], [b]) => parseInt(a) - parseInt(b))
                .map(([slotNumber, slot]) => {
                  const slotNum = parseInt(slotNumber);
                  const slotTime = getSlotTime(slot, slotNum);
                  
                  return (
                    <div 
                      key={slotNumber}
                      className={`border rounded-lg p-4 transition-all ${
                        isCurrentSlot(days[new Date().getDay() === 0 ? 5 : new Date().getDay() - 1], slot, slotNum)
                          ? "border-blue-500 bg-blue-50 shadow-md ring-2 ring-blue-200"
                          : "border-blue-200 bg-white"
                      }`}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <span className="font-semibold text-blue-700">
                          {slotTime.startTime} - {slotTime.endTime}
                        </span>
                        {isCurrentSlot(days[new Date().getDay() === 0 ? 5 : new Date().getDay() - 1], slot, slotNum) && (
                          <span className="bg-blue-500 text-white px-2 py-1 rounded-full text-xs font-bold animate-pulse">
                            Now
                          </span>
                        )}
                      </div>
                      <div className={`text-sm font-medium ${
                        slot.subjectId ? "text-blue-800" : "text-blue-500"
                      }`}>
                        {getSubjectName(slot.subjectId)}
                      </div>
                      {slot.teacherId && (
                        <div className="text-xs text-blue-600 mt-1">
                          {getTeacherName(slot.teacherId)}
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        {/* View Mode Toggle */}
        <div className="flex justify-between items-center mb-6">
          <div className="flex gap-2 bg-white/80 border border-blue-200 rounded-lg p-1">
            <button
              onClick={() => setViewMode("weekly")}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                viewMode === "weekly" 
                  ? "bg-blue-500 text-white" 
                  : "text-blue-600 hover:text-blue-700"
              }`}
            >
              Weekly View
            </button>
            <button
              onClick={() => setViewMode("daily")}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                viewMode === "daily" 
                  ? "bg-blue-500 text-white" 
                  : "text-blue-600 hover:text-blue-700"
              }`}
            >
              Daily View
            </button>
          </div>
          
          
        </div>

        {/* Weekly Timetable */}
        {viewMode === "weekly" && classData?.timetable && slotNumbers.length > 0 && (
          <div className="bg-white/80 border border-blue-200 rounded-xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-blue-50 border-b border-blue-200">
                    <th className="p-4 text-left text-blue-700 font-semibold">Time</th>
                    {days.map(day => (
                      <th key={day} className="p-4 text-center text-blue-700 font-semibold">
                        {day}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {slotNumbers.map(slotNumber => {
                    const sampleSlot = getSampleSlot(slotNumber);
                    const slotTime = sampleSlot ? getSlotTime(sampleSlot, slotNumber) : DEFAULT_SLOT_TIMES[slotNumber];

                    if (!slotTime) return null;

                    return (
                      <tr key={slotNumber} className="border-b border-blue-100 last:border-b-0">
                        <td className="p-4 text-sm text-blue-600 font-medium whitespace-nowrap">
                          {slotTime.startTime} - {slotTime.endTime}
                        </td>
                        {days.map(day => {
                          const daySlots = getDaySlots(day);
                          const slot = daySlots.find(([num]) => parseInt(num) === slotNumber);
                          
                          if (!slot) return (
                            <td key={day} className="p-4">
                              <div className="text-center text-blue-400 text-sm">-</div>
                            </td>
                          );

                          const [_, slotData] = slot;
                          const isCurrent = isCurrentSlot(day, slotData, slotNumber);

                          return (
                            <td key={day} className="p-4">
                              <div className={`text-center p-3 rounded-lg border transition-all ${
                                isCurrent
                                  ? "bg-blue-50 border-blue-300 ring-2 ring-blue-200"
                                  : slotData.subjectId
                                    ? "bg-white border-blue-200 hover:shadow-md"
                                    : "bg-blue-50/50 border-blue-100"
                              }`}>
                                <div className={`font-medium text-sm mb-1 ${
                                  slotData.subjectId ? "text-blue-800" : "text-blue-500"
                                }`}>
                                  {getSubjectName(slotData.subjectId)}
                                </div>
                                {slotData.teacherId && (
                                  <div className="text-xs text-blue-600 truncate">
                                    {getTeacherName(slotData.teacherId)}
                                  </div>
                                )}
                                {isCurrent && (
                                  <div className="mt-1">
                                    <span className="inline-block w-2 h-2 bg-blue-500 rounded-full animate-pulse"></span>
                                  </div>
                                )}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Daily Timetable */}
        {viewMode === "daily" && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {days.map(day => {
              const daySlots = getDaySlots(day);
              if (daySlots.length === 0) return null;

              return (
                <div key={day} className="bg-white/80 border border-blue-200 rounded-xl shadow-sm overflow-hidden">
                  <div className="bg-blue-50 border-b border-blue-200 p-4">
                    <h3 className="text-lg font-semibold text-blue-800 text-center">
                      {daysFull[days.indexOf(day)]}
                    </h3>
                  </div>
                  <div className="p-4 space-y-3">
                    {daySlots.map(([slotNumber, slot]) => {
                      const slotNum = parseInt(slotNumber);
                      const isCurrent = isCurrentSlot(day, slot, slotNum);
                      const slotTime = getSlotTime(slot, slotNum);
                      
                      return (
                        <div 
                          key={slotNumber}
                          className={`border rounded-lg p-3 transition-all ${
                            isCurrent
                              ? "border-blue-500 bg-blue-50 ring-2 ring-blue-200"
                              : "border-blue-200 bg-white hover:shadow-md"
                          }`}
                        >
                          <div className="flex justify-between items-start mb-2">
                            <span className="font-medium text-blue-700 text-sm">
                              {slotTime.startTime} - {slotTime.endTime}
                            </span>
                            {isCurrent && (
                              <span className="bg-blue-500 text-white px-2 py-1 rounded-full text-xs font-bold animate-pulse">
                                Ongoing
                              </span>
                            )}
                          </div>
                          <div className={`font-semibold ${
                            slot.subjectId ? "text-blue-800" : "text-blue-500"
                          }`}>
                            {getSubjectName(slot.subjectId)}
                          </div>
                          {slot.teacherId && (
                            <div className="text-sm text-blue-600 mt-1">
                              {getTeacherName(slot.teacherId)}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* No Data Message */}
        {(!classData || !classData.timetable || slotNumbers.length === 0) && !loading && (
          <div className="bg-white/80 border border-blue-200 rounded-xl p-8 text-center">
            <div className="text-blue-400 text-6xl mb-4">📅</div>
            <h3 className="text-lg font-semibold text-blue-800 mb-2">No Timetable Available</h3>
            <p className="text-blue-600 text-sm">
              The timetable for your class hasn't been set up yet.
            </p>
          </div>
        )}

        {/* Legend */}
        {(classData?.timetable && slotNumbers.length > 0) && (
          <div className="mt-6 bg-white/80 border border-blue-200 rounded-xl p-4">
            <h4 className="text-sm font-semibold text-blue-800 mb-3">Legend</h4>
            <div className="flex flex-wrap gap-4 text-sm">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-blue-500 rounded"></div>
                <span className="text-blue-600">Current Class</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-white border border-blue-300 rounded"></div>
                <span className="text-blue-600">Scheduled Class</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-blue-100 rounded"></div>
                <span className="text-blue-600">Free Period</span>
              </div>
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-center gap-3 mt-8">
          <button
            onClick={() => router.push("/")}
            className="bg-blue-500 text-white px-6 py-3 rounded-lg text-sm font-medium shadow-sm hover:bg-blue-600 transition-colors"
          >
            ← Back to Dashboard
          </button>
          <button
            onClick={() => router.push("/student/attendance")}
            className="bg-blue-100 text-blue-700 px-6 py-3 rounded-lg text-sm font-medium shadow-sm hover:bg-blue-200 transition-colors"
          >
            View Attendance
          </button>
        </div>
      </div>
    </div>
  );
}

export default StudentTimetable;