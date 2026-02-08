"use client";

import { db } from "@/app/firebase-config";
import { getAuth } from "firebase/auth";
import {
  addDoc,
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { useEffect, useState } from "react";

// Define TypeScript interfaces based on your timetable structure
interface Subject {
  id: string;
  name: string;
}

interface Division {
  id: string;
  name: string;
}

interface TimetableSlot {
  slotTime?: {
    startTime: string;
    endTime: string;
  };
  subjectId: string | null;
  teacherId: string | null;
}

interface DayTimetable {
  [slotKey: string]: TimetableSlot;
}

interface DivisionTimetable {
  [day: string]: DayTimetable;
}

interface ClassData {
  id: string;
  name: string;
  divisions: Division[];
  subjects: Subject[];
  timetable?: {
    [divisionId: string]: DivisionTimetable;
  };
}

interface Lecture {
  id: string;
  lectureName: string;
  subject: string;
  startTime: string;
  endTime: string;
  date: string;
  createdAt: any;
  attendance: any[];
  validQrId: string;
  qrGeneratedAt: any;
  classId: string;
  subjectId: string;
  teacherId: string;
  slotNumber: string;
  divisionId: string;
  divisionName: string;
  day: string;
}

interface ClassTimetable {
  classId: string;
  className: string;
  subjects: Subject[];
  divisions: {
    divisionId: string;
    divisionName: string;
    timetable: DayTimetable;
  }[];
}

export default function TeacherPage() {
  const router = useRouter();
  const auth = getAuth();

  const [todayClasses, setTodayClasses] = useState<Lecture[]>([]);
  const [qrCodeUrl, setQrCodeUrl] = useState("");
  const [selectedLecture, setSelectedLecture] = useState<Lecture | null>(null);
  const [currentValidQrId, setCurrentValidQrId] = useState("");
  const [qrTimer, setQrTimer] = useState(60);
  const [qrGenerationCount, setQrGenerationCount] = useState(0);
  const [isQrActive, setIsQrActive] = useState(false);
  const [currentTeacherId, setCurrentTeacherId] = useState("");
  const [loading, setLoading] = useState(true);
  const [currentDay, setCurrentDay] = useState("");
  const [activeTab, setActiveTab] = useState<string>("today");
  const [classTimetables, setClassTimetables] = useState<ClassTimetable[]>([]);
  const [allClassesData, setAllClassesData] = useState<ClassData[]>([]);

  const handleLogout = async () => {
    try {
      await auth.signOut();
      router.push("/login");
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };

  // Default slot times based on your timetable structure
  const DEFAULT_SLOT_TIMES: {
    [key: number]: { startTime: string; endTime: string };
  } = {
    1: { startTime: "10:00", endTime: "11:00" },
    2: { startTime: "11:00", endTime: "12:00" },
    3: { startTime: "12:45", endTime: "13:45" },
    4: { startTime: "13:45", endTime: "14:45" },
    5: { startTime: "15:00", endTime: "16:00" },
    6: { startTime: "16:00", endTime: "17:00" },
    7: { startTime: "17:00", endTime: "18:00" },
    8: { startTime: "18:00", endTime: "19:00" },
  };

  // 🔹 Get current teacher ID and current day
  useEffect(() => {
    const user = auth.currentUser;
    if (user) {
      setCurrentTeacherId(user.uid);

      // Get current day name (Mon, Tue, Wed, etc.)
      const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      const today = new Date();
      const dayIndex = today.getDay();
      const dayName = days[dayIndex];
      setCurrentDay(dayName);

      console.log("Current Teacher ID:", user.uid);
      console.log("Today is:", dayName);
    } else {
      console.log("No user logged in");
      setLoading(false);
    }
  }, [auth]);

  // 🔹 Get slot time with fallback to default
  const getSlotTime = (slot: TimetableSlot, slotNumber: number) => {
    if (slot.slotTime && slot.slotTime.startTime && slot.slotTime.endTime) {
      return slot.slotTime;
    }
    return (
      DEFAULT_SLOT_TIMES[slotNumber] || { startTime: "00:00", endTime: "00:00" }
    );
  };

  // 🔹 Get subject name from subject ID
  const getSubjectName = (subjectId: string, classId?: string): string => {
    if (!subjectId) return "No Subject";
    
    // First try to find in the specific class
    if (classId) {
      const classData = allClassesData.find(c => c.id === classId);
      if (classData) {
        const subject = classData.subjects?.find(sub => sub.id === subjectId);
        if (subject) return subject.name;
      }
    }
    
    // Fallback: search in all classes
    for (const classData of allClassesData) {
      const subject = classData.subjects?.find(sub => sub.id === subjectId);
      if (subject) return subject.name;
    }
    
    return `Subject-${subjectId}`;
  };

  // 🔹 Load all class data
  useEffect(() => {
    const loadAllClassesData = async () => {
      try {
        const classesQuery = query(collection(db, "Classes"));
        const classesSnapshot = await getDocs(classesQuery);
        const classesData = classesSnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as ClassData[];

        setAllClassesData(classesData);
        console.log("Loaded all classes data:", classesData.length);
      } catch (error) {
        console.error("Error loading classes data:", error);
      }
    };

    loadAllClassesData();
  }, []);

  // 🔹 Load all class timetables for the teacher
  useEffect(() => {
    if (!currentTeacherId || allClassesData.length === 0) return;

    const loadClassTimetables = async () => {
      try {
        const teacherTimetables: ClassTimetable[] = [];

        for (const classData of allClassesData) {
          if (!classData.timetable) continue;

          const classTimetable: ClassTimetable = {
            classId: classData.id,
            className: classData.name,
            subjects: classData.subjects || [],
            divisions: [],
          };

          // Process each division in the class
          for (const division of classData.divisions || []) {
            const divisionId = division.id;
            const divisionTimetable = classData.timetable[divisionId];

            if (!divisionTimetable) continue;

            // Check if this teacher has any classes in this division
            const hasTeacherClasses = Object.values(divisionTimetable).some(
              (dayTimetable: DayTimetable) =>
                Object.values(dayTimetable).some(
                  (slot) => slot.teacherId === currentTeacherId
                )
            );

            if (hasTeacherClasses) {
              classTimetable.divisions.push({
                divisionId,
                divisionName: division.name,
                timetable: divisionTimetable[currentDay] || {},
              });
            }
          }

          if (classTimetable.divisions.length > 0) {
            teacherTimetables.push(classTimetable);
          }
        }

        setClassTimetables(teacherTimetables);
        console.log("Teacher timetables:", teacherTimetables);
      } catch (error) {
        console.error("Error loading class timetables:", error);
      }
    };

    loadClassTimetables();
  }, [currentTeacherId, currentDay, allClassesData]);

  // 🔹 Automatically create lectures from timetable for current day and teacher
  useEffect(() => {
    if (!currentTeacherId || !currentDay || allClassesData.length === 0) return;

    const createLecturesFromTimetable = async () => {
      console.log("Creating lectures from timetable for:", currentDay);
      setLoading(true);

      const today = new Date();
      const todayDate = today.toISOString().split("T")[0];

      try {
        // Check if lectures already exist for today
        const existingLecturesQuery = query(
          collection(db, "lectures"),
          where("date", ">=", todayDate + "T00:00:00"),
          where("date", "<=", todayDate + "T23:59:59"),
          where("teacherId", "==", currentTeacherId)
        );

        const existingLecturesSnapshot = await getDocs(existingLecturesQuery);
        const existingLectures = existingLecturesSnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Lecture[];

        console.log("Existing lectures for today:", existingLectures.length);

        let lecturesCreated = 0;
        let totalSlotsProcessed = 0;

        for (const classData of allClassesData) {
          console.log("Processing class:", classData.name, classData.id);

          // Check if this class has timetable for current day
          if (!classData.timetable) {
            console.log("No timetable found for class:", classData.name);
            continue;
          }

          // Get all divisions from the class
          const divisions = classData.divisions || [];
          console.log(
            "Class divisions:",
            divisions.map((d) => d.name)
          );

          // Process each division in the class
          for (const division of divisions) {
            const divisionId = division.id;
            const divisionName = division.name;

            console.log(`Processing division: ${divisionName} (${divisionId})`);

            // Check if timetable exists for this division
            const divisionTimetable = classData.timetable[divisionId];
            if (!divisionTimetable) {
              console.log(`No timetable found for division ${divisionName}`);
              continue;
            }

            // Check if current day exists in division timetable
            if (!divisionTimetable[currentDay]) {
              console.log(
                `No ${currentDay} timetable for division ${divisionName}`
              );
              continue;
            }

            const dayTimetable = divisionTimetable[currentDay];
            console.log(
              `Found ${currentDay} timetable for division ${divisionName}:`,
              Object.keys(dayTimetable).length,
              "slots"
            );

            // Process each time slot for the current day
            for (const slotNumber in dayTimetable) {
              totalSlotsProcessed++;
              const slot = dayTimetable[slotNumber];
              const slotNum = parseInt(slotNumber);

              // Check if this slot belongs to current teacher and has subject
              if (slot.teacherId === currentTeacherId && slot.subjectId) {
                console.log(
                  `✅ Found matching slot for ${divisionName}: Slot ${slotNumber}`,
                  slot
                );

                // Get subject name using the helper function
                const subjectName = getSubjectName(slot.subjectId, classData.id);

                const className = classData.name || `Class-${classData.id}`;
                const slotTime = getSlotTime(slot, slotNum);
                const lectureName = `${className} - ${divisionName} - ${subjectName}`;

                // Create unique identifier for this lecture
                const lectureUniqueId = `${classData.id}_${divisionId}_${slotNumber}_${currentDay}_${todayDate}`;

                // Check if lecture already exists for this specific slot today
                const lectureExists = existingLectures.some(
                  (lecture) =>
                    lecture.classId === classData.id &&
                    lecture.divisionId === divisionId &&
                    lecture.slotNumber === slotNumber &&
                    lecture.day === currentDay
                );

                if (!lectureExists) {
                  // Create the lecture with division information
                  await addDoc(collection(db, "lectures"), {
                    lectureName,
                    subject: subjectName,
                    startTime: slotTime.startTime,
                    endTime: slotTime.endTime,
                    date: today.toISOString(),
                    createdAt: Timestamp.now(),
                    attendance: [],
                    validQrId: "",
                    qrGeneratedAt: null,
                    classId: classData.id,
                    subjectId: slot.subjectId,
                    teacherId: currentTeacherId,
                    slotNumber: slotNumber,
                    divisionId: divisionId,
                    divisionName: divisionName,
                    day: currentDay,
                    lectureUniqueId: lectureUniqueId,
                  });
                  lecturesCreated++;
                  console.log(
                    `🎉 Created lecture: ${lectureName} at ${slotTime.startTime}-${slotTime.endTime}`
                  );
                } else {
                  console.log(`⏩ Lecture already exists: ${lectureName}`);
                }
              } else {
                if (slot.teacherId && slot.subjectId) {
                  console.log(
                    `❌ Slot ${slotNumber} in ${divisionName} - Different teacher: ${slot.teacherId} (expected: ${currentTeacherId})`
                  );
                } else {
                  console.log(
                    `➖ Slot ${slotNumber} in ${divisionName} - No teacher or subject assigned`
                  );
                }
              }
            }
          }
        }

        console.log(
          `📊 Summary: Processed ${totalSlotsProcessed} slots, created ${lecturesCreated} new lectures`
        );

        // Now set up listener for today's classes
        setupTodayClassesListener();
      } catch (error) {
        console.error("❌ Error creating lectures from timetable:", error);
        setLoading(false);
      }
    };

    createLecturesFromTimetable();
  }, [currentTeacherId, currentDay, allClassesData]);

  // 🔹 Set up listener for today's classes
  const setupTodayClassesListener = () => {
    if (!currentTeacherId) return;

    const today = new Date();
    const todayDate = today.toISOString().split("T")[0];

    console.log("Setting up listener for today's classes...");

    const q = query(
      collection(db, "lectures"),
      where("teacherId", "==", currentTeacherId)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const todayLectures = snapshot.docs
          .filter((doc) => {
            const data = doc.data();
            const lectureDate = data.date
              ? data.date.split("T")[0]
              : data.createdAt?.toDate?.()?.toISOString().split("T")[0];
            return lectureDate === todayDate;
          })
          .map((doc) => ({
            id: doc.id,
            ...doc.data(),
          })) as Lecture[];

        // Sort lectures by start time
        todayLectures.sort((a, b) => {
          if (a.startTime < b.startTime) return -1;
          if (a.startTime > b.startTime) return 1;
          return 0;
        });

        console.log("📚 Today's lectures found:", todayLectures.length);
        console.log("Divisions covered:", [
          ...new Set(todayLectures.map((l) => l.divisionName)),
        ]);

        setTodayClasses(todayLectures);
        setLoading(false);
      },
      (error) => {
        console.error("Error in today's classes listener:", error);
        setLoading(false);
      }
    );

    return unsubscribe;
  };

  // 🔹 Generate unique QR ID
  const generateQrId = () => {
    return `qr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  };

  // 🔹 Generate QR Code for attendance with dynamic valid ID
  const generateQRCode = async (lecture: Lecture) => {
    // Check if QR was already generated for this lecture within last minute
    if (lecture.qrGeneratedAt) {
      const qrGeneratedTime = lecture.qrGeneratedAt.toDate();
      const currentTime = new Date();
      const timeDiff =
        (currentTime.getTime() - qrGeneratedTime.getTime()) / 1000;

      if (timeDiff < 60) {
        alert(
          `QR code was already generated for this lecture. Please wait ${Math.ceil(
            60 - timeDiff
          )} seconds before generating again.`
        );
        return;
      }
    }

    setSelectedLecture(lecture);
    setIsQrActive(true);
    setQrGenerationCount(0);

    // Generate initial QR ID
    const initialQrId = generateQrId();
    setCurrentValidQrId(initialQrId);

    // Update lecture with initial validQrId and generation time
    await updateDoc(doc(db, "lectures", lecture.id), {
      validQrId: initialQrId,
      qrGeneratedAt: Timestamp.now(),
      lastQrGeneration: Timestamp.now(),
    });

    await generateQrCodeImage(lecture.id, initialQrId);
    setQrGenerationCount(1);
    startQrTimer(lecture.id);
  };

  // 🔹 Generate QR Code Image
  const generateQrCodeImage = async (lectureId: string, qrId: string) => {
    const attendanceData = {
      lectureId: lectureId,
      qrId: qrId,
      timestamp: new Date().toISOString(),
    };

    const qrContent = `${
      window.location.origin
    }/student/?data=${encodeURIComponent(JSON.stringify(attendanceData))}`;

    try {
      const qrCodeDataUrl = await QRCode.toDataURL(qrContent);
      setQrCodeUrl(qrCodeDataUrl);
    } catch (err) {
      console.error("Error generating QR code:", err);
    }
  };

  // 🔹 Start timer to refresh QR code every 15 seconds (4 times total = 1 minute)
  const startQrTimer = (lectureId: string) => {
    setQrTimer(60);

    const timer = setInterval(async () => {
      setQrTimer((prev) => {
        if (prev <= 1) {
          // Time's up - stop generating QR codes
          clearInterval(timer);
          setIsQrActive(false);
          setCurrentValidQrId("");

          // Update lecture to remove valid QR code
          updateDoc(doc(db, "lectures", lectureId), {
            validQrId: "",
          });

          return 0;
        }

        // Generate new QR code every 15 seconds (at 45, 30, 15 seconds remaining)
        if (prev === 45 || prev === 30 || prev === 15) {
          if (qrGenerationCount < 4) {
            const newQrId = generateQrId();
            setCurrentValidQrId(newQrId);
            setQrGenerationCount((prevCount) => prevCount + 1);

            // Update lecture with new validQrId
            updateDoc(doc(db, "lectures", lectureId), {
              validQrId: newQrId,
            });

            // Generate new QR code
            generateQrCodeImage(lectureId, newQrId);
          }
        }

        return prev - 1;
      });
    }, 1000);

    // Store timer reference to clear later
    return timer;
  };

  // 🔹 Close QR modal and clear timers
  const closeQrModal = () => {
    setQrCodeUrl("");
    setSelectedLecture(null);
    setCurrentValidQrId("");
    setQrTimer(60);
    setQrGenerationCount(0);
    setIsQrActive(false);
  };

  // 🔹 Format time for display
  const formatTimeForDisplay = (timeString: string) => {
    if (!timeString) return "";
    const time = new Date(`2000-01-01T${timeString}`);
    return time.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  // 🔹 Check if QR can be generated for a lecture (within time range)
  const canGenerateQR = (lecture: Lecture) => {
    if (!lecture.startTime || !lecture.endTime) return true;

    const now = new Date();
    const currentTime = now.toTimeString().split(" ")[0].substring(0, 5);

    return currentTime >= lecture.startTime && currentTime <= lecture.endTime;
  };

  // 🔹 Get time status for display
  const getTimeStatus = (lecture: Lecture) => {
    if (!lecture.startTime || !lecture.endTime) return "No time set";

    const now = new Date();
    const currentTime = now.toTimeString().split(" ")[0].substring(0, 5);

    if (currentTime < lecture.startTime) {
      return `Starts at ${formatTimeForDisplay(lecture.startTime)}`;
    } else if (currentTime > lecture.endTime) {
      return "Class ended";
    } else {
      return `Ongoing until ${formatTimeForDisplay(lecture.endTime)}`;
    }
  };

  // 🔹 Get attendance count for a lecture
  const getAttendanceCount = (lecture: Lecture) => {
    return lecture.attendance ? lecture.attendance.length : 0;
  };

  // 🔹 Get full day name for display
  const getFullDayName = (shortDay: string) => {
    const dayMap: { [key: string]: string } = {
      Mon: "Monday",
      Tue: "Tuesday",
      Wed: "Wednesday",
      Thu: "Thursday",
      Fri: "Friday",
      Sat: "Saturday",
      Sun: "Sunday",
    };
    return dayMap[shortDay] || shortDay;
  };

  // 🔹 Render timetable for a specific class
  const renderClassTimetable = (classTimetable: ClassTimetable) => {
    return (
      <div className="space-y-6">
        {classTimetable.divisions.map((division) => (
          <div key={division.divisionId} className="bg-white/70 border border-blue-200 rounded-xl p-6 shadow">
            <h3 className="text-lg font-semibold text-blue-800 mb-4">
              Division {division.divisionName} - Today's Schedule
            </h3>
            
            {Object.keys(division.timetable).length === 0 ? (
              <p className="text-gray-500 text-center py-4">
                No classes scheduled for {division.divisionName} today
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {Object.entries(division.timetable).map(([slotNumber, slot]) => {
                  const slotNum = parseInt(slotNumber);
                  const slotTime = getSlotTime(slot, slotNum);
                  const isCurrentTeacher = slot.teacherId === currentTeacherId;
                  const subjectName = getSubjectName(slot.subjectId || "", classTimetable.classId);
                  
                  return (
                    <div
                      key={slotNumber}
                      className={`p-4 border rounded-lg ${
                        isCurrentTeacher
                          ? "bg-blue-50 border-blue-300 shadow-sm"
                          : "bg-gray-50 border-gray-200"
                      }`}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <span className="font-semibold text-blue-700">
                          Slot {slotNumber}
                        </span>
                        <span className={`px-2 py-1 rounded text-xs ${
                          isCurrentTeacher 
                            ? "bg-green-100 text-green-800" 
                            : "bg-gray-100 text-gray-600"
                        }`}>
                          {isCurrentTeacher ? "Your Class" : "Other Teacher"}
                        </span>
                      </div>
                      
                      <div className="space-y-2">
                        <p className="text-sm">
                          ⏰ {formatTimeForDisplay(slotTime.startTime)} - {formatTimeForDisplay(slotTime.endTime)}
                        </p>
                        
                        {slot.subjectId ? (
                          <p className="text-sm font-medium">
                            📚 {subjectName}
                          </p>
                        ) : (
                          <p className="text-sm text-gray-500">No subject assigned</p>
                        )}
                        
                        {isCurrentTeacher && slot.subjectId && (
                          <p className="text-xs text-green-600 font-semibold">
                            ✅ You are teaching this class
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-slate-50 to-blue-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4 text-gray-600">
            Loading your classes for {getFullDayName(currentDay)}...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-start bg-gradient-to-br from-blue-50 via-slate-50 to-blue-100 p-6">
      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-blue-800 mb-2">
          Teacher Dashboard
        </h1>
        <p className="text-lg text-blue-600">
          Today is {getFullDayName(currentDay)}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-6xl">
        <div className="bg-white/80 border border-blue-200 rounded-xl p-5 shadow text-center">
          <h3 className="text-2xl font-bold text-blue-700">
            {todayClasses.length}
          </h3>
          <p className="text-gray-600">Today's Lectures</p>
        </div>

        <div className="bg-white/80 border border-blue-200 rounded-xl p-5 shadow text-center">
          <h3 className="text-2xl font-bold text-blue-700">
            {getFullDayName(currentDay)}
          </h3>
          <p className="text-gray-600">Current Day</p>
        </div>

        <div className="bg-white/80 border border-blue-200 rounded-xl p-5 shadow text-center">
          <h3 className="text-2xl font-bold text-blue-700">
            {classTimetables.length}
          </h3>
          <p className="text-gray-600">Your Classes</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="w-full max-w-6xl mt-6">
        <div className="flex border-b border-blue-200 mb-6">
          <button
            onClick={() => setActiveTab("today")}
            className={`px-6 py-3 font-semibold transition-colors ${
              activeTab === "today"
                ? "text-blue-700 border-b-2 border-blue-700"
                : "text-gray-500 hover:text-blue-600"
            }`}
          >
            📚 Today's Classes
          </button>
          <button
            onClick={() => setActiveTab("timetable")}
            className={`px-6 py-3 font-semibold transition-colors ${
              activeTab === "timetable"
                ? "text-blue-700 border-b-2 border-blue-700"
                : "text-gray-500 hover:text-blue-600"
            }`}
          >
            🗓️ Class Timetable
          </button>
        </div>

        {/* Today's Classes Tab */}
        {activeTab === "today" && (
          <div className="bg-white/70 border border-blue-200 rounded-xl p-6 shadow">
            <h2 className="text-xl font-semibold text-blue-700 mb-4">
              📚 Today's Classes - {getFullDayName(currentDay)}
            </h2>

            {todayClasses.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-500 text-lg mb-2">
                  No classes scheduled for {getFullDayName(currentDay)}
                </p>
                <p className="text-sm text-gray-400">
                  Your timetable doesn't have any classes assigned to you today.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {todayClasses.map((lecture) => (
                  <div
                    key={lecture.id}
                    className="flex flex-col justify-between p-4 bg-white border border-blue-100 rounded-lg shadow-sm hover:shadow-md transition-shadow"
                  >
                    {/* Lecture Info */}
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-blue-800">
                        {lecture.lectureName}
                      </h3>
                      <p className="text-gray-600">{lecture.subject}</p>
                      <div className="mt-2 space-y-1">
                        <p className="text-sm text-blue-600 font-medium">
                          🏫 Division: {lecture.divisionName}
                        </p>
                        <p className="text-sm text-gray-500">
                          ⏰ Time: {formatTimeForDisplay(lecture.startTime)} -{" "}
                          {formatTimeForDisplay(lecture.endTime)}
                        </p>
                        <p
                          className={`text-sm ${
                            getTimeStatus(lecture).includes("Ongoing")
                              ? "text-green-600 font-semibold"
                              : getTimeStatus(lecture).includes("ended")
                              ? "text-red-600"
                              : "text-gray-600"
                          }`}
                        >
                          {getTimeStatus(lecture)}
                        </p>
                        <p className="text-sm text-gray-500">
                          📊 Attendance: {getAttendanceCount(lecture)} students
                        </p>
                      </div>
                    </div>

                    {/* Button */}
                    <div className="mt-3 flex flex-col gap-2">
                      {!canGenerateQR(lecture) ? (
                        <button
                          disabled
                          className="bg-gray-400 text-white px-4 py-2 rounded-lg font-semibold transition-colors flex items-center gap-2 cursor-not-allowed"
                        >
                          ⏳ Not in class time
                        </button>
                      ) : (
                        <button
                          onClick={() => generateQRCode(lecture)}
                          disabled={
                            lecture.qrGeneratedAt &&
                            new Date().getTime() -
                              lecture.qrGeneratedAt.toDate().getTime() <
                              60000
                          }
                          className={`px-4 py-2 rounded-lg font-semibold transition-colors flex items-center gap-2 ${
                            lecture.qrGeneratedAt &&
                            new Date().getTime() -
                              lecture.qrGeneratedAt.toDate().getTime() <
                              60000
                              ? "bg-gray-400 cursor-not-allowed"
                              : "bg-blue-500 hover:bg-blue-600 text-white"
                          }`}
                        >
                          {lecture.qrGeneratedAt &&
                          new Date().getTime() -
                            lecture.qrGeneratedAt.toDate().getTime() <
                            60000
                            ? `🔄 Available in ${Math.ceil(
                                (60000 -
                                  (new Date().getTime() -
                                    lecture.qrGeneratedAt.toDate().getTime())) /
                                  1000
                              )}s`
                            : "📱 Generate QR"}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Timetable Tab */}
        {activeTab === "timetable" && (
          <div className="space-y-6">
            {classTimetables.length === 0 ? (
              <div className="text-center py-8 bg-white/70 border border-blue-200 rounded-xl p-6">
                <p className="text-gray-500 text-lg mb-2">
                  No class timetables found for you
                </p>
                <p className="text-sm text-gray-400">
                  You are not assigned to any classes in the timetable.
                </p>
              </div>
            ) : (
              classTimetables.map((classTimetable) => (
                <div key={classTimetable.classId} className="bg-white/70 border border-blue-200 rounded-xl p-6 shadow">
                  <h2 className="text-xl font-semibold text-blue-700 mb-4">
                    🏫 {classTimetable.className} - {getFullDayName(currentDay)} Timetable
                  </h2>
                  {renderClassTimetable(classTimetable)}
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* QR Code Modal */}
      {qrCodeUrl && selectedLecture && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-lg p-6 w-full max-w-md border border-blue-200">
            <h3 className="text-2xl font-bold text-blue-700 mb-2">
              Attendance QR Code
            </h3>
            <p className="text-gray-600 mb-2">
              QR for{" "}
              <span className="font-semibold">
                {selectedLecture.lectureName}
              </span>
            </p>
            <div className="mb-4 space-y-1">
              <p className="text-sm text-gray-500">
                Subject: {selectedLecture.subject}
              </p>
              <p className="text-sm text-blue-600 font-medium">
                Division: {selectedLecture.divisionName}
              </p>
              <p className="text-sm text-gray-500">
                Time: {formatTimeForDisplay(selectedLecture.startTime)} -{" "}
                {formatTimeForDisplay(selectedLecture.endTime)}
              </p>
            </div>

            {/* Timer and QR Count Display */}
            <div className="mb-4 text-center">
              <div className="text-sm text-gray-600 mb-1">QR refreshes in:</div>
              <div className="text-lg font-bold text-blue-600">
                {qrTimer} seconds
              </div>
              <div className="text-sm text-gray-500 mt-2">
                QR Code {qrGenerationCount}/4 (Total 1 minute)
              </div>
            </div>

            <div className="flex justify-center mb-4">
              <img
                src={qrCodeUrl}
                alt="QR Code for Attendance"
                className="w-64 h-64 border border-gray-200 rounded-lg"
              />
            </div>

            <div className="text-center text-sm text-gray-500 mb-4">
              📱 Scan with phone camera (refreshes every 15 seconds)
            </div>

            <div className="flex justify-center">
              <button
                onClick={closeQrModal}
                className="px-4 py-2 rounded-md bg-gray-300 hover:bg-gray-400 transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Buttons */}
      <div className="flex gap-4 mt-6">
        <button
          onClick={handleLogout}
          className="bg-gradient-to-r from-blue-500 to-blue-600 text-white px-6 py-2 rounded-lg font-semibold shadow hover:scale-105 transition-transform"
        >
          Logout
        </button>
      </div>
    </div>
  );
}