"use client";

import { db } from "@/app/firebase-config";
import {
  collection,
  doc,
  onSnapshot,
  query,
  where,
  updateDoc,
  arrayUnion,
  arrayRemove,
  getDocs,
  orderBy,
} from "firebase/firestore";
import { useEffect, useState } from "react";
import { getAuth } from "firebase/auth";
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

interface Student {
  id: string;
  name: string;
  email: string;
  rollNumber?: string;
  role: string;
  classId?: string;
  divisionId?: string;
  divisionName?: string;
}

interface AttendanceRecord {
  studentId: string;
  studentName: string;
  rollNumber?: string;
  status: 'present' | 'absent';
  timestamp?: any;
}

interface Lecture {
  id: string;
  lectureName: string;
  subject: string;
  startTime: string;
  endTime: string;
  date: string;
  attendance: AttendanceRecord[];
  classId: string;
  subjectId: string;
  teacherId: string;
  divisionId: string;
  divisionName: string;
}

interface TimetableSlot {
  slotTime: {
    startTime: string;
    endTime: string;
  };
  subjectId: string;
  teacherId: string;
}

interface TimetableDay {
  [slotNumber: string]: TimetableSlot;
}

interface Timetable {
  [day: string]: TimetableDay;
}

interface ClassData {
  id: string;
  name: string;
  divisions: Array<{
    id: string;
    name: string;
  }>;
  subjects: Array<{
    id: string;
    name: string;
    teachers: {
      [divisionId: string]: string;
    };
  }>;
  timetable: {
    [divisionId: string]: Timetable;
  };
}

interface MonthlyAttendanceData {
  studentId: string;
  studentName: string;
  rollNumber?: string;
  attendance: {
    [lectureId: string]: 'present' | 'absent' | 'not-marked';
  };
  presentCount: number;
  totalCount: number;
  percentage: number;
}

interface LectureDate {
  date: string;
  day: string;
  lectures: Lecture[];
}

export default function TeacherAttendancePage() {
  const auth = getAuth();
  const [lectures, setLectures] = useState<Lecture[]>([]);
  const [selectedLecture, setSelectedLecture] = useState<Lecture | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [currentTeacherId, setCurrentTeacherId] = useState("");
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'mark' | 'monthly'>('mark');
  const [selectedMonth, setSelectedMonth] = useState<string>(new Date().toISOString().slice(0, 7));
  const [selectedSubject, setSelectedSubject] = useState<string>('');
  const [monthlyAttendance, setMonthlyAttendance] = useState<MonthlyAttendanceData[]>([]);
  const [monthlyLoading, setMonthlyLoading] = useState(false);
  const [availableSubjects, setAvailableSubjects] = useState<string[]>([]);
  const [classData, setClassData] = useState<ClassData | null>(null);
  const [lectureDates, setLectureDates] = useState<LectureDate[]>([]);

  // Days mapping
  const daysMap: { [key: string]: string } = {
    'Mon': 'Monday',
    'Tue': 'Tuesday',
    'Wed': 'Wednesday',
    'Thu': 'Thursday',
    'Fri': 'Friday',
    'Sat': 'Saturday',
    'Sun': 'Sunday'
  };

  // 🔹 Get current teacher ID
  useEffect(() => {
    const user = auth.currentUser;
    if (user) {
      setCurrentTeacherId(user.uid);
      console.log("Current Teacher ID:", user.uid);
    }
  }, [auth]);

  // 🔹 Fetch class data and timetable
  useEffect(() => {
    const fetchClassData = async () => {
      try {
        const classesQuery = query(collection(db, "Classes"));
        const classesSnapshot = await getDocs(classesQuery);
        
        if (!classesSnapshot.empty) {
          const classDoc = classesSnapshot.docs[0];
          const classData = {
            id: classDoc.id,
            ...classDoc.data()
          } as ClassData;
          
          setClassData(classData);
          console.log("Class data loaded:", classData);
        }
      } catch (error) {
        console.error("Error fetching class data:", error);
      }
    };

    fetchClassData();
  }, []);

  // 🔹 Fetch all lectures for the current teacher
  useEffect(() => {
    if (!currentTeacherId) return;

    console.log("Setting up lectures listener for teacher:", currentTeacherId);

    const q = query(
      collection(db, "lectures"),
      where("teacherId", "==", currentTeacherId),
      orderBy("date", "desc")
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const teacherLectures = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Lecture[];

      console.log("Teacher's lectures:", teacherLectures.length);
      setLectures(teacherLectures);
      
      // Extract unique subjects for dropdown
      const subjects = Array.from(new Set(teacherLectures.map(lecture => lecture.subject))).sort();
      setAvailableSubjects(subjects);
      if (subjects.length > 0 && !selectedSubject) {
        setSelectedSubject(subjects[0]);
      }

      // Group lectures by date
      const groupedByDate = teacherLectures.reduce((acc, lecture) => {
        const dateStr = new Date(lecture.date).toISOString().split('T')[0];
        if (!acc[dateStr]) {
          acc[dateStr] = [];
        }
        acc[dateStr].push(lecture);
        return acc;
      }, {} as { [key: string]: Lecture[] });

      // Convert to array and sort by date
      const datesArray: LectureDate[] = Object.entries(groupedByDate)
        .map(([date, lectures]) => ({
          date,
          day: new Date(date).toLocaleDateString('en-US', { weekday: 'long' }),
          lectures: lectures.sort((a, b) => a.startTime.localeCompare(b.startTime))
        }))
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      setLectureDates(datesArray);
      setLoading(false);
    }, (error) => {
      console.error("Error in lectures listener:", error);
      setLoading(false);
    });

    return unsubscribe;
  }, [currentTeacherId, selectedSubject]);

  // 🔹 Fetch students for the selected lecture's specific division
  const fetchStudents = async (lecture: Lecture) => {
    if (!lecture) return;
    
    setStudentsLoading(true);
    try {
      console.log("Fetching students for division:", {
        classId: lecture.classId,
        divisionId: lecture.divisionId,
        divisionName: lecture.divisionName
      });

      const studentsQuery = query(
        collection(db, "Users"),
        where("Role", "==", "Student"),
        where("classId", "==", lecture.classId),
        where("divisionId", "==", lecture.divisionId)
      );
      
      const studentsSnapshot = await getDocs(studentsQuery);
      const studentsData = studentsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Student[];

      console.log(`Found ${studentsData.length} students in division ${lecture.divisionName}`);
      setStudents(studentsData);

    } catch (error) {
      console.error("Error fetching students:", error);
      setStudents([]);
    } finally {
      setStudentsLoading(false);
    }
  };

  // 🔹 Load students when a lecture is selected
  useEffect(() => {
    if (selectedLecture) {
      console.log("Lecture selected, fetching students for division:", selectedLecture.divisionName);
      fetchStudents(selectedLecture);
    } else {
      setStudents([]);
    }
  }, [selectedLecture]);

  // 🔹 Generate monthly attendance report
  const generateMonthlyAttendance = async () => {
    if (!selectedSubject || !selectedMonth) return;

    setMonthlyLoading(true);
    try {
      const [year, month] = selectedMonth.split('-').map(Number);
      const startDate = new Date(year, month - 1, 1).toISOString().split('T')[0];
      const endDate = new Date(year, month, 0).toISOString().split('T')[0];

      console.log(`Generating monthly attendance for ${selectedSubject} in ${selectedMonth}`);
      console.log(`Date range: ${startDate} to ${endDate}`);

      // Filter lectures for the selected subject and month
      const monthlyLectures = lectures.filter(lecture => {
        const lectureDate = lecture.date.split('T')[0];
        return lecture.subject === selectedSubject && 
               lectureDate >= startDate && 
               lectureDate <= endDate;
      });

      console.log(`Found ${monthlyLectures.length} lectures for ${selectedSubject} in ${selectedMonth}`);

      if (monthlyLectures.length === 0) {
        setMonthlyAttendance([]);
        return;
      }

      // Get all students from the division
      const studentsQuery = query(
        collection(db, "Users"),
        where("Role", "==", "Student"),
        where("classId", "==", monthlyLectures[0].classId),
        where("divisionId", "==", monthlyLectures[0].divisionId)
      );
      
      const studentsSnapshot = await getDocs(studentsQuery);
      const allStudents = studentsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Student[];

      console.log(`Total students in division: ${allStudents.length}`);

      // Generate attendance data for each student
      const attendanceData: MonthlyAttendanceData[] = allStudents.map(student => {
        const studentAttendance: { [lectureId: string]: 'present' | 'absent' | 'not-marked' } = {};
        let presentCount = 0;

        monthlyLectures.forEach(lecture => {
          const attendanceRecord = lecture.attendance?.find(
            record => record.studentId === student.id
          );
          
          if (attendanceRecord) {
            studentAttendance[lecture.id] = attendanceRecord.status;
            if (attendanceRecord.status === 'present') {
              presentCount++;
            }
          } else {
            studentAttendance[lecture.id] = 'not-marked';
          }
        });

        const totalCount = monthlyLectures.length;

        return {
          studentId: student.id,
          studentName: student.name,
          rollNumber: student.rollNumber,
          attendance: studentAttendance,
          presentCount,
          totalCount,
          percentage: totalCount > 0 ? Math.round((presentCount / totalCount) * 100) : 0
        };
      });

      setMonthlyAttendance(attendanceData);
      console.log("Monthly attendance data generated:", attendanceData.length);

    } catch (error) {
      console.error("Error generating monthly attendance:", error);
      setMonthlyAttendance([]);
    } finally {
      setMonthlyLoading(false);
    }
  };

  // 🔹 Generate monthly attendance when subject or month changes
  useEffect(() => {
    if (activeTab === 'monthly' && selectedSubject && selectedMonth) {
      generateMonthlyAttendance();
    }
  }, [activeTab, selectedSubject, selectedMonth, lectures]);

  // 🔹 Format date for display
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  // 🔹 Format time for display
  const formatTime = (timeString: string) => {
    if (!timeString) return "";
    const time = new Date(`2000-01-01T${timeString}`);
    return time.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  // 🔹 Get day name from date
  const getDayName = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', { weekday: 'long' });
  };

  // 🔹 Get attendance status for a student in the selected lecture
  const getStudentAttendanceStatus = (studentId: string): 'present' | 'absent' | 'not-marked' => {
    if (!selectedLecture?.attendance) return 'not-marked';
    
    const attendanceRecord = selectedLecture.attendance.find(
      record => record.studentId === studentId
    );
    
    return attendanceRecord ? attendanceRecord.status : 'not-marked';
  };

  // 🔹 Create a safe attendance record (remove undefined values)
  const createSafeAttendanceRecord = (student: Student, status: 'present' | 'absent'): AttendanceRecord => {
    const record: AttendanceRecord = {
      studentId: student.id,
      studentName: student.name,
      status: status,
      timestamp: new Date()
    };
    
    if (student.rollNumber) {
      record.rollNumber = student.rollNumber;
    }
    
    return record;
  };

  // 🔹 MARK ATTENDANCE - WITH UI FIX
  const markAttendance = async (student: Student, status: 'present' | 'absent') => {
    if (!selectedLecture) return;

    setAttendanceLoading(true);
    try {
      const lectureRef = doc(db, "lectures", selectedLecture.id);
      const attendanceRecord = createSafeAttendanceRecord(student, status);

      const currentAttendance = selectedLecture.attendance || [];
      const existingRecordIndex = currentAttendance.findIndex(
        record => record.studentId === student.id
      );

      // Create updated attendance array
      let updatedAttendance;
      if (existingRecordIndex !== -1) {
        updatedAttendance = [...currentAttendance];
        updatedAttendance[existingRecordIndex] = attendanceRecord;
      } else {
        updatedAttendance = [...currentAttendance, attendanceRecord];
      }

      // Update Firestore
      await updateDoc(lectureRef, {
        attendance: updatedAttendance
      });

      // 🔹 FIX: Update local state immediately
      setSelectedLecture(prev => prev ? {
        ...prev,
        attendance: updatedAttendance
      } : null);

      // Also update lectures array for the selected lecture
      setLectures(prev => prev.map(lecture => 
        lecture.id === selectedLecture.id 
          ? { ...lecture, attendance: updatedAttendance }
          : lecture
      ));

      console.log(`Marked ${student.name} as ${status}`);

    } catch (error) {
      console.error("Error marking attendance:", error);
      alert("Error marking attendance. Please try again.");
    } finally {
      setAttendanceLoading(false);
    }
  };

  // 🔹 MARK ALL STUDENTS - WITH UI FIX
  const markAllStudents = async (status: 'present' | 'absent') => {
    if (!selectedLecture || students.length === 0) return;

    setAttendanceLoading(true);
    try {
      const lectureRef = doc(db, "lectures", selectedLecture.id);
      
      const newAttendanceRecords: AttendanceRecord[] = students.map(student => 
        createSafeAttendanceRecord(student, status)
      );

      // Update Firestore
      await updateDoc(lectureRef, {
        attendance: newAttendanceRecords
      });

      // 🔹 FIX: Update local state immediately
      setSelectedLecture(prev => prev ? {
        ...prev,
        attendance: newAttendanceRecords
      } : null);

      setLectures(prev => prev.map(lecture => 
        lecture.id === selectedLecture.id 
          ? { ...lecture, attendance: newAttendanceRecords }
          : lecture
      ));

      console.log(`Marked all ${students.length} students as ${status}`);
    } catch (error) {
      console.error("Error marking all attendance:", error);
      alert("Error marking attendance for all students. Please try again.");
    } finally {
      setAttendanceLoading(false);
    }
  };

  // 🔹 Get attendance statistics for a lecture
  const getAttendanceStats = (lecture: Lecture) => {
    const attendance = lecture.attendance || [];
    const presentCount = attendance.filter(record => record.status === 'present').length;
    const absentCount = attendance.filter(record => record.status === 'absent').length;
    const totalMarked = presentCount + absentCount;
    
    return { presentCount, absentCount, totalMarked };
  };

  // 🔹 Get unique lectures for monthly attendance table header
  const getMonthlyAttendanceLectures = () => {
    const [year, month] = selectedMonth.split('-').map(Number);
    const startDate = new Date(year, month - 1, 1).toISOString().split('T')[0];
    const endDate = new Date(year, month, 0).toISOString().split('T')[0];

    return lectures
      .filter(lecture => {
        const lectureDate = lecture.date.split('T')[0];
        return lecture.subject === selectedSubject && 
               lectureDate >= startDate && 
               lectureDate <= endDate;
      })
      .sort((a, b) => {
        // Sort by date, then by time
        const dateCompare = new Date(a.date).getTime() - new Date(b.date).getTime();
        if (dateCompare !== 0) return dateCompare;
        return a.startTime.localeCompare(b.startTime);
      });
  };

  // 🔹 Get subject name from ID
  const getSubjectName = (subjectId: string) => {
    if (!classData) return subjectId;
    const subject = classData.subjects.find(sub => sub.id === subjectId);
    return subject ? subject.name : subjectId;
  };

  // 🔹 EXPORT TO EXCEL FUNCTIONALITY - FIXED VERSION
  const exportToExcel = () => {
    if (activeTab === 'mark' && selectedLecture) {
      exportLectureToExcel();
    } else if (activeTab === 'monthly') {
      exportMonthlyToExcel();
    }
  };

  const exportLectureToExcel = () => {
    if (!selectedLecture) return;

    const worksheetData: (string | number)[][] = [
      ['Division:', selectedLecture.divisionName],
      ['Subject:', selectedLecture.subject],
      ['Lecture:', selectedLecture.lectureName],
      ['Date:', formatDate(selectedLecture.date)],
      ['Time:', `${formatTime(selectedLecture.startTime)} - ${formatTime(selectedLecture.endTime)}`],
      [], // Empty row
      ['Roll No.', 'Student Name', 'Email', 'Status']
    ];

    students.forEach(student => {
      const status = getStudentAttendanceStatus(student.id);
      worksheetData.push([
        student.rollNumber || 'N/A',
        student.name,
        student.email,
        status === 'present' ? 'Present' : status === 'absent' ? 'Absent' : 'Not Marked'
      ]);
    });

    // Add summary - FIXED: Convert numbers to strings
    const stats = getAttendanceStats(selectedLecture);
    worksheetData.push([]);
    worksheetData.push(['Summary:', '']);
    worksheetData.push(['Total Students:', students.length.toString()]);
    worksheetData.push(['Present:', stats.presentCount.toString()]);
    worksheetData.push(['Absent:', stats.absentCount.toString()]);
    worksheetData.push(['Not Marked:', (students.length - stats.totalMarked).toString()]);

    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
    
    // Style the header row
    if (!worksheet['!cols']) worksheet['!cols'] = [];
    worksheet['!cols'][0] = { width: 15 };
    worksheet['!cols'][1] = { width: 25 };
    worksheet['!cols'][2] = { width: 30 };
    worksheet['!cols'][3] = { width: 15 };

    XLSX.utils.book_append_sheet(workbook, worksheet, 'Attendance');
    XLSX.writeFile(workbook, `attendance_${selectedLecture.divisionName}_${selectedLecture.date.replace(/[/\\?%*:|"<>]/g, '-')}.xlsx`);
  };

  const exportMonthlyToExcel = () => {
    if (monthlyAttendance.length === 0) return;

    const monthlyLectures = getMonthlyAttendanceLectures();
    const worksheetData: (string | number)[][] = [
      ['Monthly Attendance Report'],
      ['Subject:', selectedSubject],
      ['Month:', selectedMonth],
      ['Division:', monthlyAttendance[0]?.rollNumber ? 'All' : monthlyLectures[0]?.divisionName || ''],
      [], // Empty row
    ];

    // Header row
    const header: (string | number)[] = ['Roll No.', 'Student Name'];
    monthlyLectures.forEach(lecture => {
      header.push(`${new Date(lecture.date).getDate()}/${new Date(lecture.date).getMonth() + 1}`);
    });
    header.push('Present', 'Total', 'Percentage');
    worksheetData.push(header);

    // Data rows
    monthlyAttendance.forEach(student => {
      const row: (string | number)[] = [
        student.rollNumber || 'N/A',
        student.studentName
      ];

      monthlyLectures.forEach(lecture => {
        const status = student.attendance[lecture.id];
        row.push(status === 'present' ? 'P' : status === 'absent' ? 'A' : '-');
      });

      row.push(
        student.presentCount,
        student.totalCount,
        `${student.percentage}%`
      );
      worksheetData.push(row);
    });

    // Summary - FIXED: Convert numbers to strings
    worksheetData.push([]);
    worksheetData.push(['Summary Statistics']);
    worksheetData.push(['Total Students:', monthlyAttendance.length.toString()]);
    worksheetData.push(['Total Lectures:', monthlyLectures.length.toString()]);
    worksheetData.push(['Good Attendance (≥75%):', monthlyAttendance.filter(s => s.percentage >= 75).length.toString()]);
    worksheetData.push(['Average Attendance (50-74%):', monthlyAttendance.filter(s => s.percentage >= 50 && s.percentage < 75).length.toString()]);
    worksheetData.push(['Poor Attendance (<50%):', monthlyAttendance.filter(s => s.percentage < 50).length.toString()]);

    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Monthly Attendance');
    XLSX.writeFile(workbook, `monthly_attendance_${selectedSubject}_${selectedMonth.replace(/[/\\?%*:|"<>]/g, '-')}.xlsx`);
  };

  // 🔹 EXPORT TO PDF FUNCTIONALITY
  const exportToPDF = () => {
    if (activeTab === 'mark' && selectedLecture) {
      exportLectureToPDF();
    } else if (activeTab === 'monthly') {
      exportMonthlyToPDF();
    }
  };

  const exportLectureToPDF = () => {
    if (!selectedLecture) return;

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const stats = getAttendanceStats(selectedLecture);

    // Title
    doc.setFontSize(16);
    doc.setTextColor(33, 85, 165);
    doc.text('ATTENDANCE REPORT', pageWidth / 2, 15, { align: 'center' });

    // Lecture Details
    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    let yPosition = 30;

    doc.text(`Division: ${selectedLecture.divisionName}`, 15, yPosition);
    doc.text(`Subject: ${selectedLecture.subject}`, 15, yPosition + 5);
    doc.text(`Lecture: ${selectedLecture.lectureName}`, 15, yPosition + 10);
    doc.text(`Date: ${formatDate(selectedLecture.date)}`, 15, yPosition + 15);
    doc.text(`Time: ${formatTime(selectedLecture.startTime)} - ${formatTime(selectedLecture.endTime)}`, 15, yPosition + 20);

    // Summary box
    doc.setFillColor(240, 249, 255);
    doc.rect(120, 25, 80, 25, 'F');
    doc.setTextColor(33, 85, 165);
    doc.setFontSize(12);
    doc.text('SUMMARY', 125, 32);
    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    doc.text(`Total Students: ${students.length}`, 125, 39);
    doc.text(`Present: ${stats.presentCount}`, 125, 44);
    doc.text(`Absent: ${stats.absentCount}`, 125, 49);

    // Table headers
    yPosition = 60;
    doc.setFillColor(33, 85, 165);
    doc.rect(15, yPosition, pageWidth - 30, 8, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.text('Roll No.', 20, yPosition + 6);
    doc.text('Student Name', 45, yPosition + 6);
    doc.text('Email', 100, yPosition + 6);
    doc.text('Status', pageWidth - 25, yPosition + 6, { align: 'right' });

    // Table rows
    yPosition += 15;
    doc.setTextColor(0, 0, 0);
    students.forEach((student, index) => {
      if (yPosition > 270) { // Add new page if needed
        doc.addPage();
        yPosition = 20;
      }

      const status = getStudentAttendanceStatus(student.id);
      const statusColor = status === 'present' ? [34, 197, 94] : 
                         status === 'absent' ? [239, 68, 68] : [107, 114, 128];

      doc.text(student.rollNumber || 'N/A', 20, yPosition);
      doc.text(student.name, 45, yPosition);
      doc.text(student.email, 100, yPosition);
      doc.setTextColor(statusColor[0], statusColor[1], statusColor[2]);
      doc.text(
        status === 'present' ? 'Present' : status === 'absent' ? 'Absent' : 'Not Marked',
        pageWidth - 20, 
        yPosition, 
        { align: 'right' }
      );
      doc.setTextColor(0, 0, 0);

      // Add line separator
      if (index < students.length - 1) {
        doc.setDrawColor(226, 232, 240);
        doc.line(15, yPosition + 4, pageWidth - 15, yPosition + 4);
      }

      yPosition += 10;
    });

    // Footer
    const footerY = doc.internal.pageSize.getHeight() - 10;
    doc.setFontSize(8);
    doc.setTextColor(128, 128, 128);
    doc.text(`Generated on ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}`, pageWidth / 2, footerY, { align: 'center' });

    doc.save(`attendance_${selectedLecture.divisionName}_${selectedLecture.date.replace(/[/\\?%*:|"<>]/g, '-')}.pdf`);
  };

  const exportMonthlyToPDF = () => {
    if (monthlyAttendance.length === 0) return;

    const doc = new jsPDF('landscape');
    const monthlyLectures = getMonthlyAttendanceLectures();
    const pageWidth = doc.internal.pageSize.getWidth();

    // Title
    doc.setFontSize(16);
    doc.setTextColor(33, 85, 165);
    doc.text('MONTHLY ATTENDANCE REPORT', pageWidth / 2, 15, { align: 'center' });

    // Details
    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    doc.text(`Subject: ${selectedSubject}`, 20, 25);
    doc.text(`Month: ${selectedMonth}`, 20, 32);
    doc.text(`Division: ${monthlyAttendance[0]?.rollNumber ? 'All' : monthlyLectures[0]?.divisionName}`, 20, 39);
    doc.text(`Total Students: ${monthlyAttendance.length}`, pageWidth - 60, 25, { align: 'right' });
    doc.text(`Total Lectures: ${monthlyLectures.length}`, pageWidth - 60, 32, { align: 'right' });

    // Prepare table data
    const headers = ['Roll No.', 'Student Name'];
    monthlyLectures.forEach(lecture => {
      headers.push(`${new Date(lecture.date).getDate()}/${new Date(lecture.date).getMonth() + 1}`);
    });
    headers.push('Present', 'Total', '%');

    const data = monthlyAttendance.map(student => {
      const row = [
        student.rollNumber || 'N/A',
        student.studentName
      ];

      monthlyLectures.forEach(lecture => {
        const status = student.attendance[lecture.id];
        row.push(status === 'present' ? 'P' : status === 'absent' ? 'A' : '-');
      });

      row.push(
        student.presentCount.toString(),
        student.totalCount.toString(),
        `${student.percentage}%`
      );
      return row;
    });

    // Generate table
    (doc as any).autoTable({
      head: [headers],
      body: data,
      startY: 45,
      theme: 'grid',
      headStyles: {
        fillColor: [33, 85, 165],
        textColor: 255,
        fontStyle: 'bold'
      },
      alternateRowStyles: {
        fillColor: [240, 249, 255]
      },
      styles: {
        fontSize: 8,
        cellPadding: 2
      },
      columnStyles: {
        0: { cellWidth: 20 },
        1: { cellWidth: 30 },
        ...Object.fromEntries(
          monthlyLectures.map((_, index) => [index + 2, { cellWidth: 8 }])
        ),
        [monthlyLectures.length + 2]: { cellWidth: 15 },
        [monthlyLectures.length + 3]: { cellWidth: 15 },
        [monthlyLectures.length + 4]: { cellWidth: 15 }
      }
    });

    // Summary statistics
    const finalY = (doc as any).lastAutoTable.finalY + 10;
    const goodCount = monthlyAttendance.filter(s => s.percentage >= 75).length;
    const avgCount = monthlyAttendance.filter(s => s.percentage >= 50 && s.percentage < 75).length;
    const poorCount = monthlyAttendance.filter(s => s.percentage < 50).length;

    doc.setFontSize(10);
    doc.setTextColor(33, 85, 165);
    doc.text('SUMMARY STATISTICS', 20, finalY);
    
    doc.setFontSize(8);
    doc.setTextColor(0, 0, 0);
    doc.text(`Good Attendance (≥75%): ${goodCount} students`, 20, finalY + 8);
    doc.text(`Average Attendance (50-74%): ${avgCount} students`, 20, finalY + 16);
    doc.text(`Poor Attendance (<50%): ${poorCount} students`, 20, finalY + 24);

    // Footer
    const footerY = doc.internal.pageSize.getHeight() - 10;
    doc.setFontSize(8);
    doc.setTextColor(128, 128, 128);
    doc.text(`Generated on ${new Date().toLocaleDateString()}`, pageWidth / 2, footerY, { align: 'center' });

    doc.save(`monthly_attendance_${selectedSubject}_${selectedMonth.replace(/[/\\?%*:|"<>]/g, '-')}.pdf`);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-100 to-indigo-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading your lectures...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-100 to-indigo-100 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-blue-800 mb-2">Attendance Management</h1>
          <p className="text-lg text-blue-600">Mark and manage student attendance by division</p>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white/80 border border-blue-200 rounded-xl p-4 shadow text-center">
            <h3 className="text-2xl font-bold text-blue-700">{lectures.length}</h3>
            <p className="text-gray-600">Total Lectures</p>
          </div>
          <div className="bg-white/80 border border-green-200 rounded-xl p-4 shadow text-center">
            <h3 className="text-2xl font-bold text-green-700">
              {lectures.reduce((acc, lecture) => acc + getAttendanceStats(lecture).presentCount, 0)}
            </h3>
            <p className="text-gray-600">Total Present</p>
          </div>
          <div className="bg-white/80 border border-red-200 rounded-xl p-4 shadow text-center">
            <h3 className="text-2xl font-bold text-red-700">
              {lectures.reduce((acc, lecture) => acc + getAttendanceStats(lecture).absentCount, 0)}
            </h3>
            <p className="text-gray-600">Total Absent</p>
          </div>
          <div className="bg-white/80 border border-purple-200 rounded-xl p-4 shadow text-center">
            <h3 className="text-2xl font-bold text-purple-700">
              {new Set(lectures.map(l => l.divisionId)).size}
            </h3>
            <p className="text-gray-600">Total Divisions</p>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="mb-6">
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex space-x-8">
              <button
                onClick={() => setActiveTab('mark')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'mark'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                📝 Mark Attendance
              </button>
              <button
                onClick={() => setActiveTab('monthly')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'monthly'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                📊 Monthly Report
              </button>
            </nav>
          </div>
        </div>

        {/* Export Buttons */}
        {(activeTab === 'mark' && selectedLecture) || (activeTab === 'monthly' && monthlyAttendance.length > 0) ? (
          <div className="mb-6 flex justify-end gap-4">
            <button
              onClick={exportToExcel}
              className="flex items-center gap-2 bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-lg transition-colors shadow-md"
            >
              📊 Export Excel
            </button>
            <button
              onClick={exportToPDF}
              className="flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg transition-colors shadow-md"
            >
              📄 Export PDF
            </button>
          </div>
        ) : null}

        {/* Tab Content */}
        {activeTab === 'mark' ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Lectures List - Grouped by Date */}
            <div className="lg:col-span-1">
              <div className="bg-white/70 border border-blue-200 rounded-xl p-6 shadow">
                <h2 className="text-xl font-semibold text-blue-700 mb-4">📅 Your Lectures by Date</h2>
                
                {lectureDates.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-gray-500">No lectures found for your account.</p>
                  </div>
                ) : (
                  <div className="space-y-4 max-h-96 overflow-y-auto">
                    {lectureDates.map((dateGroup) => (
                      <div key={dateGroup.date} className="border border-gray-200 rounded-lg">
                        <div className="bg-blue-50 px-3 py-2 border-b border-blue-200">
                          <h3 className="font-semibold text-blue-800 text-sm">
                            📅 {formatDate(dateGroup.date)}
                          </h3>
                          <p className="text-xs text-blue-600">
                            {dateGroup.day} • {dateGroup.lectures.length} lecture{dateGroup.lectures.length !== 1 ? 's' : ''}
                          </p>
                        </div>
                        <div className="p-2 space-y-2">
                          {dateGroup.lectures.map((lecture) => {
                            const stats = getAttendanceStats(lecture);
                            return (
                              <div
                                key={lecture.id}
                                className={`p-3 border rounded-lg cursor-pointer transition-all ${
                                  selectedLecture?.id === lecture.id
                                    ? 'border-blue-500 bg-blue-50 shadow-md'
                                    : 'border-gray-200 bg-white hover:shadow-md'
                                }`}
                                onClick={() => setSelectedLecture(lecture)}
                              >
                                <h4 className="font-semibold text-blue-800 text-sm mb-1">
                                  {lecture.subject}
                                </h4>
                                <div className="flex justify-between items-center text-xs mb-2">
                                  <span className="text-gray-500">
                                    {formatTime(lecture.startTime)} - {formatTime(lecture.endTime)}
                                  </span>
                                  <span className="bg-purple-100 text-purple-700 px-2 py-1 rounded text-xs">
                                    {lecture.divisionName}
                                  </span>
                                </div>
                                <div className="flex justify-between items-center text-xs">
                                  <span className="text-green-600">✓ {stats.presentCount}</span>
                                  <span className="text-red-600">✗ {stats.absentCount}</span>
                                  <span className="text-gray-500">
                                    {stats.totalMarked} marked
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Attendance Marking Section */}
            <div className="lg:col-span-2">
              {selectedLecture ? (
                <div className="bg-white/70 border border-blue-200 rounded-xl p-6 shadow">
                  <div className="flex justify-between items-start mb-6">
                    <div>
                      <h2 className="text-xl font-semibold text-blue-700 mb-1">
                        {selectedLecture.subject}
                      </h2>
                      <p className="text-gray-600">{selectedLecture.lectureName}</p>
                      <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                        <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded font-semibold">
                          🏫 {selectedLecture.divisionName}
                        </span>
                        <span>📅 {formatDate(selectedLecture.date)}</span>
                        <span>⏰ {formatTime(selectedLecture.startTime)} - {formatTime(selectedLecture.endTime)}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-gray-600">
                        <span className="text-green-600 font-semibold">
                          Present: {getAttendanceStats(selectedLecture).presentCount}
                        </span>
                        <span className="mx-2">•</span>
                        <span className="text-red-600 font-semibold">
                          Absent: {getAttendanceStats(selectedLecture).absentCount}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        Total marked: {getAttendanceStats(selectedLecture).totalMarked} / {students.length}
                      </div>
                    </div>
                  </div>

                  {studentsLoading ? (
                    <div className="text-center py-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
                      <p className="text-gray-500">Loading students for {selectedLecture.divisionName} division...</p>
                    </div>
                  ) : students.length === 0 ? (
                    <div className="text-center py-8">
                      <p className="text-gray-500 mb-2">No students found in {selectedLecture.divisionName} division.</p>
                      <p className="text-sm text-gray-400">
                        Make sure students are registered in:<br/>
                        • Class: {selectedLecture.classId}<br/>
                        • Division: {selectedLecture.divisionName} ({selectedLecture.divisionId})
                      </p>
                    </div>
                  ) : (
                    <>
                      {/* Division Info Header */}
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
                        <div className="flex justify-between items-center">
                          <div>
                            <h3 className="font-semibold text-blue-800">
                              Students in {selectedLecture.divisionName} Division
                            </h3>
                            <p className="text-sm text-blue-600">
                              Total: {students.length} students
                            </p>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => {
                                if (confirm(`Mark all ${students.length} students in ${selectedLecture.divisionName} as present?`)) {
                                  markAllStudents('present');
                                }
                              }}
                              disabled={attendanceLoading}
                              className="px-3 py-1 bg-green-500 text-white rounded text-sm hover:bg-green-600 disabled:opacity-50"
                            >
                              Mark All Present
                            </button>
                            <button
                              onClick={() => {
                                if (confirm(`Mark all ${students.length} students in ${selectedLecture.divisionName} as absent?`)) {
                                  markAllStudents('absent');
                                }
                              }}
                              disabled={attendanceLoading}
                              className="px-3 py-1 bg-red-500 text-white rounded text-sm hover:bg-red-600 disabled:opacity-50"
                            >
                              Mark All Absent
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Students List */}
                      <div className="max-h-96 overflow-y-auto">
                        <table className="w-full">
                          <thead className="bg-gray-50 sticky top-0">
                            <tr>
                              <th className="text-left p-3 text-sm font-semibold text-gray-700">Student</th>
                              <th className="text-left p-3 text-sm font-semibold text-gray-700">Roll No.</th>
                              <th className="text-center p-3 text-sm font-semibold text-gray-700">Status</th>
                              <th className="text-center p-3 text-sm font-semibold text-gray-700">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200">
                            {students.map((student) => {
                              const status = getStudentAttendanceStatus(student.id);
                              return (
                                <tr key={student.id} className="hover:bg-gray-50">
                                  <td className="p-3">
                                    <div>
                                      <div className="font-medium text-gray-900">{student.name}</div>
                                      <div className="text-xs text-gray-500">{student.email}</div>
                                    </div>
                                  </td>
                                  <td className="p-3 text-sm text-gray-600">
                                    {student.rollNumber || 'N/A'}
                                  </td>
                                  <td className="p-3 text-center">
                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                      status === 'present' 
                                        ? 'bg-green-100 text-green-800'
                                        : status === 'absent'
                                        ? 'bg-red-100 text-red-800'
                                        : 'bg-gray-100 text-gray-800'
                                    }`}>
                                      {status === 'present' && 'Present'}
                                      {status === 'absent' && 'Absent'}
                                      {status === 'not-marked' && 'Not Marked'}
                                    </span>
                                  </td>
                                  <td className="p-3 text-center">
                                    <div className="flex justify-center gap-2">
                                      <button
                                        onClick={() => markAttendance(student, 'present')}
                                        disabled={attendanceLoading}
                                        className={`px-3 py-1 text-xs rounded transition-colors ${
                                          status === 'present'
                                            ? 'bg-green-500 text-white'
                                            : 'bg-green-100 text-green-700 hover:bg-green-200'
                                        } disabled:opacity-50`}
                                      >
                                        Present
                                      </button>
                                      <button
                                        onClick={() => markAttendance(student, 'absent')}
                                        disabled={attendanceLoading}
                                        className={`px-3 py-1 text-xs rounded transition-colors ${
                                          status === 'absent'
                                            ? 'bg-red-500 text-white'
                                            : 'bg-red-100 text-red-700 hover:bg-red-200'
                                        } disabled:opacity-50`}
                                      >
                                        Absent
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <div className="bg-white/70 border border-blue-200 rounded-xl p-8 shadow text-center">
                  <div className="text-4xl mb-4">📊</div>
                  <h3 className="text-lg font-semibold text-gray-700 mb-2">Select a Lecture</h3>
                  <p className="text-gray-500">Choose a lecture from the list to mark attendance for that division</p>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Monthly Attendance Tab */
          <div className="bg-white/70 border border-blue-200 rounded-xl p-6 shadow">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold text-blue-700">📊 Monthly Attendance Report</h2>
              <div className="flex gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
                  <select
                    value={selectedSubject}
                    onChange={(e) => setSelectedSubject(e.target.value)}
                    className="border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {availableSubjects.map(subject => (
                      <option key={subject} value={subject}>{subject}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Month</label>
                  <input
                    type="month"
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    className="border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>

            {monthlyLoading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
                <p className="text-gray-500">Generating monthly attendance report...</p>
              </div>
            ) : monthlyAttendance.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-500">No attendance data found for {selectedSubject} in {selectedMonth}.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse border border-gray-300">
                  <thead>
                    <tr className="bg-gray-50">
                      <th 
                        rowSpan={2}
                        className="border border-gray-300 p-3 text-left font-semibold text-gray-700 sticky left-0 bg-gray-50 z-10"
                      >
                        Student
                      </th>
                      <th 
                        rowSpan={2}
                        className="border border-gray-300 p-3 text-left font-semibold text-gray-700 sticky left-0 bg-gray-50 z-10"
                      >
                        Roll No.
                      </th>
                      {getMonthlyAttendanceLectures().map(lecture => (
                        <th 
                          key={lecture.id} 
                          className="border border-gray-300 p-2 text-center font-semibold text-gray-700 text-xs"
                          colSpan={1}
                        >
                          <div>
                            {new Date(lecture.date).getDate()}
                            <br />
                            <span className="text-gray-500 font-normal">
                              {new Date(lecture.date).toLocaleDateString('en-US', { weekday: 'short' })}
                            </span>
                            <br />
                            <span className="text-gray-400 text-xs">
                              {formatTime(lecture.startTime)}
                            </span>
                          </div>
                        </th>
                      ))}
                      <th rowSpan={2} className="border border-gray-300 p-3 text-center font-semibold text-gray-700">
                        Present
                      </th>
                      <th rowSpan={2} className="border border-gray-300 p-3 text-center font-semibold text-gray-700">
                        Total
                      </th>
                      <th rowSpan={2} className="border border-gray-300 p-3 text-center font-semibold text-gray-700">
                        Percentage
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthlyAttendance.map((student) => (
                      <tr key={student.studentId} className="hover:bg-gray-50">
                        <td className="border border-gray-300 p-3 font-medium text-gray-900 sticky left-0 bg-white">
                          {student.studentName}
                        </td>
                        <td className="border border-gray-300 p-3 text-gray-600 sticky left-0 bg-white">
                          {student.rollNumber || 'N/A'}
                        </td>
                        {getMonthlyAttendanceLectures().map(lecture => (
                          <td key={lecture.id} className="border border-gray-300 p-2 text-center">
                            <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium ${
                              student.attendance[lecture.id] === 'present' 
                                ? 'bg-green-100 text-green-800'
                                : student.attendance[lecture.id] === 'absent'
                                ? 'bg-red-100 text-red-800'
                                : 'bg-gray-100 text-gray-800'
                            }`}>
                              {student.attendance[lecture.id] === 'present' ? 'P' : 
                               student.attendance[lecture.id] === 'absent' ? 'A' : '-'}
                            </span>
                          </td>
                        ))}
                        <td className="border border-gray-300 p-3 text-center text-green-600 font-semibold">
                          {student.presentCount}
                        </td>
                        <td className="border border-gray-300 p-3 text-center text-gray-600">
                          {student.totalCount}
                        </td>
                        <td className="border border-gray-300 p-3 text-center font-semibold">
                          <span className={
                            student.percentage >= 75 ? 'text-green-600' :
                            student.percentage >= 50 ? 'text-yellow-600' : 'text-red-600'
                          }>
                            {student.percentage}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                
                {/* Summary Statistics */}
                <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
                    <h3 className="text-lg font-semibold text-green-700">
                      {monthlyAttendance.filter(s => s.percentage >= 75).length}
                    </h3>
                    <p className="text-green-600">Good Attendance (≥75%)</p>
                  </div>
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-center">
                    <h3 className="text-lg font-semibold text-yellow-700">
                      {monthlyAttendance.filter(s => s.percentage >= 50 && s.percentage < 75).length}
                    </h3>
                    <p className="text-yellow-600">Average Attendance (50-74%)</p>
                  </div>
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
                    <h3 className="text-lg font-semibold text-red-700">
                      {monthlyAttendance.filter(s => s.percentage < 50).length}
                    </h3>
                    <p className="text-red-600">Poor Attendance (&lt;50%)</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}