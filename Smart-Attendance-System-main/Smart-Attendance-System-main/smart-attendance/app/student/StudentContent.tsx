"use client";

import { auth, db } from "@/app/firebase-config";
import { onAuthStateChanged } from "firebase/auth";
import {
  Timestamp,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  updateDoc,
} from "firebase/firestore";
import { Html5QrcodeScanner } from "html5-qrcode";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

function StudentContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [user, setUser] = useState<any>(null);
  const [attendanceList, setAttendanceList] = useState<any[]>([]);
  const [todaysAttendance, setTodaysAttendance] = useState<any[]>([]);
  const [todaysClasses, setTodaysClasses] = useState<any[]>([]);
  const [nextClass, setNextClass] = useState<any>(null);
  const [attendanceStats, setAttendanceStats] = useState({
    totalClasses: 0,
    attendedClasses: 0,
    percentage: 0,
  });
  const [statusMessage, setStatusMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [studentData, setStudentData] = useState<any>(null);
  const [showQrScanner, setShowQrScanner] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [cameraInitialized, setCameraInitialized] = useState(false);
  const [subjects, setSubjects] = useState<Record<string, string>>({});

  const qrScannerRef = useRef<Html5QrcodeScanner | null>(null);

  // ✅ Get current logged-in student
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

  // ✅ Fetch student data including their class and division
  const fetchStudentData = async (userId: string) => {
    try {
      const studentRef = doc(db, "Users", userId);
      const studentSnap = await getDoc(studentRef);

      if (studentSnap.exists()) {
        const studentData = studentSnap.data();
        setStudentData(studentData);
      }
    } catch (error) {
      console.error("Error fetching student data:", error);
    }
  };

  // ✅ Fetch all subjects for name mapping
  const fetchSubjects = useCallback(async () => {
    try {
      const subjectsQuery = query(collection(db, "subjects"));
      const subjectsSnapshot = await getDocs(subjectsQuery);

      const subjectsMap: Record<string, string> = {};
      subjectsSnapshot.forEach((doc) => {
        subjectsMap[doc.id] = doc.data().name || "Unknown Subject";
      });

      setSubjects(subjectsMap);
    } catch (error) {
      console.error("Error fetching subjects:", error);
    }
  }, []);

  // ✅ Initialize QR Scanner
  const initializeQrScanner = async () => {
    if (qrScannerRef.current) {
      await qrScannerRef.current.clear();
      qrScannerRef.current = null;
    }

    try {
      setCameraInitialized(false);

      const scanner = new Html5QrcodeScanner(
        "qr-reader",
        {
          qrbox: { width: 250, height: 250 },
          fps: 10,
          aspectRatio: 1.0,
        },
        /* verbose= */ false
      );

      scanner.render(
        (decodedText) => {
          handleQrScanSuccess(decodedText);
        },
        (error) => {
          // Ignore common scanning errors
          if (!error?.includes("NotFoundException")) {
            console.log("QR Scanner:", error);
          }
        }
      );

      // Set a timeout to mark camera as initialized
      setTimeout(() => {
        setCameraInitialized(true);
      }, 1000);

      qrScannerRef.current = scanner;
    } catch (error) {
      console.error("Error initializing QR scanner:", error);
      setStatusMessage("❌ Failed to access camera. Please check permissions.");
      setCameraInitialized(true); // Still set to true to show the error state
    }
  };

  // ✅ Handle QR Scan Success
  const handleQrScanSuccess = async (decodedText: string) => {
    if (scanning) return;

    setScanning(true);
    setStatusMessage("📱 Processing QR code...");

    try {
      console.log("QR Code scanned:", decodedText);

      // Try to parse as URL first
      try {
        const url = new URL(decodedText);
        const dataParam = url.searchParams.get("data");

        if (dataParam) {
          const qrData = JSON.parse(decodeURIComponent(dataParam));
          await handleMarkAttendance(qrData.lectureId, qrData.qrId);
          return;
        }
      } catch (urlError) {
        console.log("Not a URL, trying direct parse");
      }

      // Try direct JSON parse for backward compatibility
      try {
        const qrData = JSON.parse(decodedText);
        if (qrData.lectureId && qrData.qrId) {
          await handleMarkAttendance(qrData.lectureId, qrData.qrId);
          return;
        }
      } catch (jsonError) {
        console.log("Not JSON format");
      }

      setStatusMessage(
        "❌ Invalid QR code format. Please scan a valid attendance QR code."
      );
    } catch (error) {
      console.error("QR scan error:", error);
      setStatusMessage("❌ Failed to process QR code. Please try again.");
    } finally {
      setTimeout(() => {
        setScanning(false);
        stopQrScanner();
      }, 2000);
    }
  };

  // ✅ Start QR Scanner
  const startQrScanner = async () => {
    setShowQrScanner(true);
    setScanning(false);
    setStatusMessage("📱 Point camera at QR code...");

    // Initialize scanner after modal is rendered
    setTimeout(() => {
      initializeQrScanner();
    }, 300);
  };

  // ✅ Stop QR Scanner
  const stopQrScanner = async () => {
    try {
      if (qrScannerRef.current) {
        await qrScannerRef.current.clear();
        qrScannerRef.current = null;
      }
    } catch (error) {
      console.log("Error stopping scanner:", error);
    } finally {
      setShowQrScanner(false);
      setScanning(false);
      setCameraInitialized(false);
    }
  };

  // ✅ Handle QR Data (auto attendance from URL)
  useEffect(() => {
    const dataParam = searchParams.get("data");
    if (dataParam && user) {
      try {
        const qrData = JSON.parse(decodeURIComponent(dataParam));
        handleMarkAttendance(qrData.lectureId, qrData.qrId);
      } catch (error) {
        console.error("Invalid QR data", error);
        setStatusMessage("❌ Invalid QR code. Please scan a valid QR code.");
      }
    }
  }, [searchParams, user]);
  // ✅ Fetch student's attendance history
  const fetchAttendanceHistory = useCallback(async () => {
    if (!user || !studentData) return;
    try {
      const q = query(collection(db, "lectures"));
      const snapshot = await getDocs(q);

      const studentAttendance: any[] = [];

      snapshot.docs.forEach((docSnap) => {
        const data = docSnap.data();

        if (data.attendance && data.divisionId === studentData.divisionId) {
          const found = data.attendance.find(
            (a: any) => a.studentId === user.uid && a.status === "present"
          );
          if (found) {
            studentAttendance.push({
              id: docSnap.id,
              lectureName: data.lectureName,
              subject: data.subject,
              subjectName: getSubjectName(data.subject),
              date: data.date,
              startTime: data.startTime,
              endTime: data.endTime,
              divisionName: data.divisionName,
              timestamp: found.timestamp,
              rollNumber: found.rollNumber,
              status: found.status,
              studentName: found.studentName,
            });
          }
        }
      });

      studentAttendance.sort((a, b) => {
        const timeA = a.timestamp?.toMillis?.() || new Date(a.date).getTime();
        const timeB = b.timestamp?.toMillis?.() || new Date(b.date).getTime();
        return timeB - timeA;
      });

      setAttendanceList(studentAttendance);
    } catch (error) {
      console.error("Error fetching attendance history:", error);
    }
  }, [user, studentData, subjects]);

  // ✅ Calculate attendance statistics
  const calculateAttendanceStats = useCallback(async () => {
    if (!user || !studentData) return;

    try {
      const q = query(collection(db, "lectures"));
      const snapshot = await getDocs(q);

      let totalClasses = 0;
      let attendedClasses = 0;

      snapshot.docs.forEach((docSnap) => {
        const data = docSnap.data();

        if (
          data.attendance &&
          data.divisionId === studentData.divisionId &&
          hasLecturePassed(data.date, data.endTime)
        ) {
          totalClasses++;

          const found = data.attendance.find(
            (a: any) => a.studentId === user.uid && a.status === "present"
          );
          if (found) {
            attendedClasses++;
          }
        }
      });

      const percentage =
        totalClasses > 0 ? (attendedClasses / totalClasses) * 100 : 0;

      setAttendanceStats({
        totalClasses,
        attendedClasses,
        percentage: Math.round(percentage * 100) / 100,
      });
    } catch (error) {
      console.error("Error calculating attendance stats:", error);
    }
  }, [user, studentData]);

  // ✅ Mark Attendance with QR validation
  const handleMarkAttendance = useCallback(
    async (lectureId: string, scannedQrId: string) => {
      if (!user) return;

      setLoading(true);
      setStatusMessage("");

      try {
        const lectureRef = doc(db, "lectures", lectureId);
        const lectureSnap = await getDoc(lectureRef);

        if (!lectureSnap.exists()) {
          setStatusMessage("❌ Lecture not found!");
          setLoading(false);
          return;
        }

        const lectureData = lectureSnap.data();
        const attendance = lectureData.attendance || [];

        // 🔹 Check if QR code is valid
        if (!lectureData.validQrId || lectureData.validQrId !== scannedQrId) {
          setStatusMessage(
            "❌ Invalid or expired QR code. Please scan the latest QR code."
          );
          setLoading(false);
          return;
        }

        // 🔹 Check if QR code was generated recently (within 20 seconds to be safe)
        const qrGeneratedAt = lectureData.qrGeneratedAt;
        if (qrGeneratedAt) {
          const now = Timestamp.now();
          const qrTime = qrGeneratedAt.toDate();
          const currentTime = now.toDate();
          const timeDiff = (currentTime.getTime() - qrTime.getTime()) / 1000;

          if (timeDiff > 20) {
            // 20 seconds window
            setStatusMessage(
              "❌ QR code has expired. Please ask your teacher for a new one."
            );
            setLoading(false);
            return;
          }
        }

        // Check division
        if (lectureData.divisionId !== studentData?.divisionId) {
          setStatusMessage("❌ This QR code is not for your division!");
          setLoading(false);
          return;
        }

        // Check if student already marked attendance
        const alreadyMarked = attendance.find(
          (a: any) => a.studentId === user.uid
        );

        if (alreadyMarked) {
          setStatusMessage("✅ Attendance already marked!");
        } else {
          // Create attendance record with the required structure
          const newAttendance = {
            rollNumber: studentData?.rollNumber || "",
            status: "present",
            studentId: user.uid,
            studentName: `${studentData?.name || ""} ${
              studentData?.surname || ""
            }`.trim(),
            timestamp: Timestamp.now(),
          };

          await updateDoc(lectureRef, {
            attendance: [...attendance, newAttendance],
          });

          setStatusMessage("🎉 Attendance marked successfully!");
          fetchAttendanceHistory();
          calculateAttendanceStats();
        }
      } catch (error) {
        console.error("Error marking attendance:", error);
        setStatusMessage("⚠️ Error marking attendance.");
      }

      setLoading(false);
    },
    [user, studentData, fetchAttendanceHistory, calculateAttendanceStats]
  );

  // ✅ Get subject name from subject ID
  const getSubjectName = (subjectId: string) => {
    return subjects[subjectId] || subjectId || "Unknown Subject";
  };

  // ✅ Helper function to check if lecture has passed
  const hasLecturePassed = (
    lectureDate: any,
    lectureEndTime: string
  ): boolean => {
    try {
      if (!lectureDate || !lectureEndTime) return false;

      let lectureDateTime: Date;

      if (lectureDate instanceof Timestamp) {
        lectureDateTime = lectureDate.toDate();
      } else if (typeof lectureDate === "string") {
        lectureDateTime = new Date(lectureDate);
      } else {
        return false;
      }

      const [hours, minutes] = lectureEndTime.split(":").map(Number);
      const lectureEndDateTime = new Date(lectureDateTime);
      lectureEndDateTime.setHours(hours, minutes, 0, 0);

      return lectureEndDateTime < new Date();
    } catch (error) {
      console.error("Error checking lecture time:", error);
      return false;
    }
  };

  // ✅ Fetch today's classes and next class
  const fetchTodaysClassesAndNextClass = useCallback(async () => {
    if (!user || !studentData) return;

    try {
      const today = new Date();
      const todayString = today.toISOString().split("T")[0];
      const currentTime =
        today.getHours().toString().padStart(2, "0") +
        ":" +
        today.getMinutes().toString().padStart(2, "0");

      const q = query(collection(db, "lectures"));
      const snapshot = await getDocs(q);

      const todaysClasses: any[] = [];

      snapshot.docs.forEach((docSnap) => {
        const data = docSnap.data();

        if (data.divisionId === studentData.divisionId) {
          const classItem = {
            id: docSnap.id,
            ...data,
            subjectName: getSubjectName(data.subject),
          };

          let classDate;
          if (data.date instanceof Timestamp) {
            classDate = data.date.toDate().toISOString().split("T")[0];
          } else if (typeof data.date === "string") {
            classDate = new Date(data.date).toISOString().split("T")[0];
          } else {
            return;
          }

          if (classDate === todayString) {
            todaysClasses.push(classItem);
          }
        }
      });

      todaysClasses.sort((a, b) => {
        if (a.startTime && b.startTime) {
          return a.startTime.localeCompare(b.startTime);
        }
        return 0;
      });

      setTodaysClasses(todaysClasses);

      const nextUpcomingClass = todaysClasses.find((cls) => {
        return cls.endTime && cls.endTime > currentTime;
      });

      setNextClass(nextUpcomingClass || null);
    } catch (error) {
      console.error("Error fetching today's classes:", error);
    }
  }, [user, studentData, subjects]);

  // ✅ Filter today's attendance from attendance history
  useEffect(() => {
    if (attendanceList.length > 0) {
      const today = new Date().toDateString();
      const filteredTodaysAttendance = attendanceList.filter((item) => {
        try {
          let attendanceDate;
          if (item.timestamp && item.timestamp.toDate) {
            attendanceDate = item.timestamp.toDate().toDateString();
          } else if (item.date) {
            attendanceDate = new Date(item.date).toDateString();
          } else {
            return false;
          }
          return attendanceDate === today;
        } catch (error) {
          return false;
        }
      });
      setTodaysAttendance(filteredTodaysAttendance);
    } else {
      setTodaysAttendance([]);
    }
  }, [attendanceList]);

  // ✅ Initialize all data when user and student data are available
  useEffect(() => {
    if (user && studentData) {
      fetchSubjects();
      fetchAttendanceHistory();
      calculateAttendanceStats();
      fetchTodaysClassesAndNextClass();
    }
  }, [
    user,
    studentData,
    fetchSubjects,
    fetchAttendanceHistory,
    calculateAttendanceStats,
    fetchTodaysClassesAndNextClass,
  ]);

  // Clean up scanner on unmount
  useEffect(() => {
    return () => {
      if (qrScannerRef.current) {
        qrScannerRef.current.clear().catch((error) => {
          console.log("Error cleaning up scanner:", error);
        });
      }
    };
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-blue-100 to-blue-200 p-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-blue-800 mb-2">
            🎓 Student Dashboard
          </h1>
          {studentData && (
            <div className="flex flex-wrap justify-center items-center gap-4 text-sm">
              <span className="text-gray-700 font-medium">
                {studentData.name} {studentData.surname}
              </span>
              <span className="text-blue-600 bg-blue-100 px-3 py-1 rounded-full">
                {studentData.className} • {studentData.divisionName}
              </span>
              <span className="text-gray-500 text-xs">
                ID: {user?.uid.substring(0, 8)}...
              </span>
            </div>
          )}
        </div>

        {/* Status Message */}
        {statusMessage && (
          <div
            className={`mb-6 p-4 rounded-lg text-center text-lg font-semibold ${
              statusMessage.includes("❌")
                ? "bg-red-100 border border-red-300 text-red-700"
                : statusMessage.includes("✅") || statusMessage.includes("🎉")
                ? "bg-green-100 border border-green-300 text-green-700"
                : "bg-yellow-100 border border-yellow-300 text-yellow-700"
            }`}
          >
            {statusMessage}
          </div>
        )}

        {/* QR Scanner Modal */}
        {showQrScanner && (
          <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl p-6 max-w-md w-full">
              <h3 className="text-xl font-bold text-center mb-4">
                📱 Scan QR Code
              </h3>

              <div className="relative rounded-lg overflow-hidden mb-4 min-h-[300px] flex items-center justify-center">
                <div id="qr-reader" className="w-full"></div>

                {/* Scanner overlay */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="border-2 border-white border-dashed w-64 h-64 rounded-lg"></div>
                </div>

                {/* Loading indicator */}
                {!cameraInitialized && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-white text-center">
                      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-2"></div>
                      <p>Initializing camera...</p>
                    </div>
                  </div>
                )}
              </div>

              <p className="text-center text-gray-600 mb-4">
                Point your camera at the QR code shown by your teacher
              </p>

              <button
                onClick={stopQrScanner}
                disabled={scanning}
                className="w-full bg-red-500 hover:bg-red-600 disabled:bg-gray-400 text-white py-3 rounded-lg font-semibold transition-colors"
              >
                {scanning ? "Processing..." : "Cancel Scan"}
              </button>
            </div>
          </div>
        )}

        {/* QR Scan Section */}
        <div className="bg-white/80 border border-blue-200 rounded-xl p-6 mb-6 text-center">
          <h2 className="text-xl font-semibold text-blue-800 mb-3">
            📱 QR Code Attendance
          </h2>
          <p className="text-gray-600 mb-4">
            Scan the QR code provided by your teacher to mark attendance
          </p>

          <button
            onClick={startQrScanner}
            disabled={loading || scanning}
            className="bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 disabled:from-gray-400 disabled:to-gray-500 text-white px-8 py-3 rounded-lg font-semibold shadow-lg hover:scale-105 transition-all duration-200 flex items-center justify-center gap-2 mx-auto"
          >
            <span>📷</span>
            {loading || scanning ? "Processing..." : "Scan QR Code"}
          </button>

          <div className="mt-4 text-sm text-blue-600 space-y-1">
            <p>✅ QR codes are valid for 15 seconds only</p>
            <p>✅ Camera permissions required</p>
            <p>✅ Works best in well-lit areas</p>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-white border border-blue-200 rounded-lg p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 font-medium">Attendance</p>
                <p className="text-2xl font-bold text-blue-800 mt-1">
                  {attendanceStats.percentage}%
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {attendanceStats.attendedClasses}/
                  {attendanceStats.totalClasses} classes
                </p>
              </div>
              <div className="w-12 h-12 bg-blue-50 rounded-full flex items-center justify-center">
                <span className="text-blue-600 font-bold">📊</span>
              </div>
            </div>
          </div>

          <div className="bg-white border border-blue-200 rounded-lg p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 font-medium">
                  Today's Classes
                </p>
                <p className="text-2xl font-bold text-blue-800 mt-1">
                  {todaysClasses.length}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {nextClass
                    ? "Ongoing Lecture: " + nextClass.startTime
                    : "No more classes"}
                </p>
              </div>
              <div className="w-12 h-12 bg-blue-50 rounded-full flex items-center justify-center">
                <span className="text-blue-600 font-bold">📅</span>
              </div>
            </div>
          </div>

          <div className="bg-white border border-blue-200 rounded-lg p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 font-medium">
                  Marked Today
                </p>
                <p className="text-2xl font-bold text-blue-800 mt-1">
                  {todaysAttendance.length}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  of {todaysClasses.length} classes
                </p>
              </div>
              <div className="w-12 h-12 bg-blue-50 rounded-full flex items-center justify-center">
                <span className="text-blue-600 font-bold">✅</span>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Today's Schedule */}
          <div className="bg-white border border-blue-200 rounded-lg p-4 shadow-sm">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-semibold text-blue-800">Today's Schedule</h3>
              <span className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded">
                {todaysClasses.length} classes
              </span>
            </div>

            <div className="space-y-3 max-h-80 overflow-y-auto">
              {todaysClasses.map((cls, index) => {
                const isNextClass = nextClass?.id === cls.id;
                const isMarked = todaysAttendance.some(
                  (att) => att.id === cls.id
                );

                return (
                  <div
                    key={cls.id}
                    className={`p-3 rounded-lg border ${
                      isNextClass
                        ? "border-blue-300 bg-blue-50"
                        : "border-gray-200 bg-gray-50"
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm text-gray-800">
                            {cls.lectureName || "Unnamed Lecture"}
                          </p>

                          {isMarked && (
                            <span className="text-xs bg-green-500 text-white px-2 py-1 rounded">
                              Present
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-600 mt-1">
                          {cls.subjectName || "No Subject"}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-blue-700">
                          {cls.startTime || "—"}
                        </p>
                        <p className="text-xs text-gray-500">
                          {cls.endTime || "—"}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}

              {todaysClasses.length === 0 && (
                <p className="text-gray-500 text-center py-4 text-sm">
                  No classes scheduled for today
                </p>
              )}
            </div>
          </div>

          {/* Recent Attendance */}
          <div className="bg-white border border-blue-200 rounded-lg p-4 shadow-sm">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-semibold text-blue-800">Recent Attendance</h3>
              <span className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded">
                {attendanceList.length} records
              </span>
            </div>

            <div className="space-y-3 max-h-80 overflow-y-auto">
              {attendanceList.slice(0, 8).map((attendance, index) => (
                <div
                  key={index}
                  className="p-3 rounded-lg border border-gray-200 bg-gray-50"
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <p className="font-medium text-sm text-gray-800">
                        {attendance.lectureName}
                      </p>
                      <p className="text-xs text-gray-600 mt-1">
                        {attendance.subjectName}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded">
                          {attendance.divisionName}
                        </span>
                        <span className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded">
                          Present
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-gray-700">
                        {attendance.timestamp
                          ?.toDate?.()
                          .toLocaleDateString() ||
                          new Date(attendance.date).toLocaleDateString()}
                      </p>
                      <p className="text-xs text-gray-500">
                        {attendance.startTime || "—"}
                      </p>
                    </div>
                  </div>
                </div>
              ))}

              {attendanceList.length === 0 && (
                <p className="text-gray-500 text-center py-4 text-sm">
                  No attendance history found
                </p>
              )}

              {attendanceList.length > 8 && (
                <button
                  onClick={() => {
                    /* Implement view all functionality */
                  }}
                  className="w-full text-center text-blue-600 hover:text-blue-800 text-sm font-medium py-2"
                >
                  View all {attendanceList.length} records →
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Logout Button */}
        <div className="text-center mt-8">
          <button
            onClick={() => {
              stopQrScanner();
              router.push("/login");
            }}
            className="bg-gradient-to-r from-blue-500 to-blue-600 text-white px-6 py-2 rounded-lg font-semibold shadow hover:scale-105 transition-transform"
          >
            Logout
          </button>
        </div>
      </div>
    </div>
  );
}

export default StudentContent;
