"use client";

import { auth, db } from "@/app/firebase-config";
import { createUserWithEmailAndPassword } from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import {
  Calendar,
  ChevronDown,
  ChevronUp,
  Filter,
  Mail,
  Pencil,
  Phone,
  Plus,
  Trash2,
  Upload,
  User,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import * as XLSX from "xlsx";

interface Student {
  id: string;
  name: string;
  surname: string;
  email: string;
  mobile: string;
  createdAt: string;
  Role: string;
  classId?: string;
  className?: string;
  divisionId?: string;
  divisionName?: string;
}

interface FormData {
  name: string;
  surname: string;
  email: string;
  mobile: string;
  password: string;
  classId: string;
  divisionId: string;
}

interface Class {
  id: string;
  name: string;
  divisions: Division[];
}

interface Division {
  id: string;
  name: string;
}

interface ExcelStudent {
  "Student ID": string;
  "Full Name": string;
  "Class / Section": string;
  "Roll Number": string;
  Email: string;
  "Phone Number": string;
  "Admission Date": string;
  "Attendance (%)": number;
  "PRN no": string;
}

interface ClassGroup {
  classId: string;
  className: string;
  divisions: DivisionGroup[];
  expanded: boolean;
}

interface DivisionGroup {
  divisionId: string;
  divisionName: string;
  students: Student[];
  expanded: boolean;
}

export default function StudentManagementPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [selectedClassId, setSelectedClassId] = useState<string>("");
  const [availableDivisions, setAvailableDivisions] = useState<Division[]>([]);
  const [uploadingExcel, setUploadingExcel] = useState(false);
  const [classGroups, setClassGroups] = useState<ClassGroup[]>([]);
  const [filterClass, setFilterClass] = useState<string>("all");
  const [filterDivision, setFilterDivision] = useState<string>("all");
  const [showFilters, setShowFilters] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState<FormData>({
    name: "",
    surname: "",
    email: "",
    mobile: "",
    password: "",
    classId: "",
    divisionId: "",
  });

  useEffect(() => {
    fetchStudents();
    fetchClasses();
  }, []);

  useEffect(() => {
    // Update available divisions when class selection changes
    if (selectedClassId) {
      const selectedClass = classes.find((c) => c.id === selectedClassId);
      setAvailableDivisions(selectedClass?.divisions || []);

      // Reset division selection if the current selection is not available in the new class
      if (
        formData.divisionId &&
        !selectedClass?.divisions.find((d) => d.id === formData.divisionId)
      ) {
        setFormData((prev) => ({ ...prev, divisionId: "" }));
      }
    } else {
      setAvailableDivisions([]);
      setFormData((prev) => ({ ...prev, divisionId: "" }));
    }
  }, [selectedClassId, classes]);

  useEffect(() => {
    // Group students by class and division
    const grouped = groupStudentsByClassAndDivision(students);
    setClassGroups(grouped);
  }, [students, classes]);

  const fetchStudents = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, "Users"));
      const studentsList: Student[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        if (data.Role === "Student") {
          studentsList.push({ id: doc.id, ...data } as Student);
        }
      });
      setStudents(studentsList);
    } catch (error) {
      console.error("Error fetching students:", error);
    }
  };

  const fetchClasses = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, "Classes"));
      const classesList: Class[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        classesList.push({
          id: doc.id,
          name: data.name || "Unnamed Class",
          divisions: data.divisions || [],
        });
      });
      setClasses(classesList);
    } catch (error) {
      console.error("Error fetching classes:", error);
    }
  };

  const groupStudentsByClassAndDivision = (studentsList: Student[]): ClassGroup[] => {
    const classMap = new Map();
    
    // Initialize with all classes from the classes state
    classes.forEach(classItem => {
      const divisions: DivisionGroup[] = classItem.divisions.map(division => ({
        divisionId: division.id,
        divisionName: division.name,
        students: [],
        expanded: true
      }));
      
      // Add an "Unassigned" division for students without division
      divisions.push({
        divisionId: "unassigned",
        divisionName: "Unassigned",
        students: [],
        expanded: true
      });

      classMap.set(classItem.id, {
        classId: classItem.id,
        className: classItem.name,
        divisions: divisions,
        expanded: true
      });
    });

    // Add a class for students without class
    classMap.set("no-class", {
      classId: "no-class",
      className: "Unassigned Class",
      divisions: [{
        divisionId: "unassigned",
        divisionName: "Unassigned",
        students: [],
        expanded: true
      }],
      expanded: true
    });

    // Distribute students to their respective classes and divisions
    studentsList.forEach(student => {
      const classId = student.classId || "no-class";
      const divisionId = student.divisionId || "unassigned";
      
      if (!classMap.has(classId)) {
        // Create entry for class that exists in students but not in classes state
        classMap.set(classId, {
          classId: classId,
          className: student.className || "Unknown Class",
          divisions: [{
            divisionId: divisionId,
            divisionName: student.divisionName || "Unassigned",
            students: [],
            expanded: true
          }],
          expanded: true
        });
      }
      
      const classGroup = classMap.get(classId);
      let divisionGroup = classGroup.divisions.find((d: DivisionGroup) => d.divisionId === divisionId);
      
      if (!divisionGroup) {
        divisionGroup = {
          divisionId: divisionId,
          divisionName: student.divisionName || "Unassigned",
          students: [],
          expanded: true
        };
        classGroup.divisions.push(divisionGroup);
      }
      
      divisionGroup.students.push(student);
    });

    // Filter out empty classes and divisions, and sort
    const result = Array.from(classMap.values())
      .filter((classGroup: ClassGroup) => 
        classGroup.divisions.some((division: DivisionGroup) => division.students.length > 0)
      )
      .map((classGroup: ClassGroup) => ({
        ...classGroup,
        divisions: classGroup.divisions
          .filter((division: DivisionGroup) => division.students.length > 0)
          .sort((a: DivisionGroup, b: DivisionGroup) => a.divisionName.localeCompare(b.divisionName))
      }))
      .sort((a: ClassGroup, b: ClassGroup) => a.className.localeCompare(b.className));

    return result;
  };

  const toggleClassExpanded = (classId: string) => {
    setClassGroups(prev => 
      prev.map(classGroup => 
        classGroup.classId === classId 
          ? { ...classGroup, expanded: !classGroup.expanded }
          : classGroup
      )
    );
  };

  const toggleDivisionExpanded = (classId: string, divisionId: string) => {
    setClassGroups(prev => 
      prev.map(classGroup => 
        classGroup.classId === classId 
          ? { 
              ...classGroup, 
              divisions: classGroup.divisions.map(division =>
                division.divisionId === divisionId
                  ? { ...division, expanded: !division.expanded }
                  : division
              )
            }
          : classGroup
      )
    );
  };

  const resetForm = () => {
    setFormData({
      name: "",
      surname: "",
      email: "",
      mobile: "",
      password: "",
      classId: "",
      divisionId: "",
    });
    setSelectedClassId("");
    setAvailableDivisions([]);
    setEditingStudent(null);
    setShowForm(false);
    setMessage("");
  };

  const handleSubmit = async () => {
    if (
      !formData.name ||
      !formData.surname ||
      !formData.email ||
      !formData.mobile ||
      !formData.classId ||
      !formData.divisionId
    ) {
      setMessage("Please fill in all required fields");
      return;
    }

    if (!editingStudent && !formData.password) {
      setMessage("Password is required for new students");
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const selectedClass = classes.find((c) => c.id === formData.classId);
      const selectedDivision = availableDivisions.find(
        (d) => d.id === formData.divisionId
      );

      if (editingStudent) {
        const studentRef = doc(db, "Users", editingStudent.id);
        await updateDoc(studentRef, {
          name: formData.name,
          surname: formData.surname,
          email: formData.email,
          mobile: formData.mobile,
          classId: formData.classId,
          className: selectedClass?.name,
          divisionId: formData.divisionId,
          divisionName: selectedDivision?.name,
          updatedAt: new Date().toISOString(),
        });
        setMessage("Student updated successfully!");
      } else {
        const userCredential = await createUserWithEmailAndPassword(
          auth,
          formData.email,
          formData.password
        );
        const uid = userCredential.user.uid;

        await setDoc(doc(db, "Users", uid), {
          name: formData.name,
          surname: formData.surname,
          email: formData.email,
          mobile: formData.mobile,
          classId: formData.classId,
          className: selectedClass?.name,
          divisionId: formData.divisionId,
          divisionName: selectedDivision?.name,
          Role: "Student",
          createdAt: new Date().toISOString(),
        });
        setMessage("Student added successfully!");
      }

      await fetchStudents();
      setTimeout(() => resetForm(), 1500);
    } catch (error) {
      console.error("Error:", error);
      setMessage(error instanceof Error ? error.message : "An error occurred");
    }

    setLoading(false);
  };

  const handleDeleteStudent = async (studentId: string) => {
    if (!confirm("Are you sure you want to delete this student?")) return;

    try {
      await deleteDoc(doc(db, "Users", studentId));
      setMessage("Student deleted successfully!");
      await fetchStudents();
      setTimeout(() => setMessage(""), 2000);
    } catch (error) {
      console.error("Error deleting student:", error);
      setMessage(error instanceof Error ? error.message : "An error occurred");
    }
  };

  const startEdit = (student: Student) => {
    setEditingStudent(student);
    setFormData({
      name: student.name,
      surname: student.surname,
      email: student.email,
      mobile: student.mobile,
      password: "",
      classId: student.classId || "",
      divisionId: student.divisionId || "",
    });
    setSelectedClassId(student.classId || "");
    setShowForm(true);
  };

  const handleClassChange = (classId: string) => {
    setSelectedClassId(classId);
    setFormData((prev) => ({ ...prev, classId, divisionId: "" }));
  };

  // Handle Excel file upload
  const handleExcelUpload = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadingExcel(true);
    setMessage("");

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData: ExcelStudent[] = XLSX.utils.sheet_to_json(worksheet);

      let successCount = 0;
      let errorCount = 0;

      // Process each student from Excel
      for (const excelStudent of jsonData) {
        try {
          // Split full name into name and surname
          const fullName = excelStudent["Full Name"].trim();
          const nameParts = fullName.split(" ");
          const name = nameParts[0];
          const surname = nameParts.slice(1).join(" ") || "Student";

          const email = excelStudent["Email"];
          const mobile = excelStudent["Phone Number"].toString();

          // Generate default password
          const defaultPassword = "123456";

          // Get class name from Excel or use default
          const className = excelStudent["Class / Section"] || "BE CSE";

          // Always use division "A" as default
          const divisionName = "A";

          // Create user in Firebase Auth
          const userCredential = await createUserWithEmailAndPassword(
            auth,
            email,
            defaultPassword
          );
          const uid = userCredential.user.uid;

          // Create student document in Firestore
          await setDoc(doc(db, "Users", uid), {
            name: name,
            surname: surname,
            email: email,
            mobile: mobile,
            classId: "default-class", // Using default values
            className: className,
            divisionId: "default-division",
            divisionName: divisionName,
            Role: "Student",
            createdAt: new Date().toISOString(),
            // Additional fields from Excel
            studentId: excelStudent["Student ID"],
            rollNumber: excelStudent["Roll Number"],
            admissionDate: excelStudent["Admission Date"],
            attendance: excelStudent["Attendance (%)"],
            prnNo: excelStudent["PRN no"],
          });

          successCount++;
          console.log(`Successfully created student: ${fullName}`);
        } catch (error) {
          console.error(
            `Error creating student ${excelStudent["Full Name"]}:`,
            error
          );
          errorCount++;
        }
      }

      setMessage(
        `Excel import completed: ${successCount} students added, ${errorCount} errors`
      );

      // Refresh students list
      await fetchStudents();

      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (error) {
      console.error("Error processing Excel file:", error);
      setMessage("Error processing Excel file");
    } finally {
      setUploadingExcel(false);
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  const filteredClassGroups = classGroups.filter(classGroup => {
    if (filterClass === "all") return true;
    return classGroup.classId === filterClass;
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-50 p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Student Management
            </h1>
            <p className="text-sm text-gray-600 mt-1">
              {students.length} student{students.length !== 1 ? "s" : ""}{" "}
              enrolled across {classGroups.length} classes
            </p>
          </div>
          <div className="flex gap-2">
            {/* Hidden file input for Excel upload */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleExcelUpload}
              accept=".xlsx, .xls"
              className="hidden"
            />
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center gap-2 bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors shadow-sm text-sm font-medium"
            >
              <Filter size={16} />
              Filter
            </button>
            <button
              onClick={triggerFileInput}
              disabled={uploadingExcel}
              className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors shadow-sm text-sm font-medium disabled:opacity-50"
            >
              <Upload size={16} />
              {uploadingExcel ? "Uploading..." : "Upload Excel"}
            </button>
            {!showForm && (
              <button
                onClick={() => setShowForm(true)}
                className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors shadow-sm text-sm font-medium"
              >
                <Plus size={16} />
                Add Student
              </button>
            )}
          </div>
        </div>

        {/* Filters */}
        {showFilters && (
          <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 mb-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Filter by Class
                </label>
                <select
                  value={filterClass}
                  onChange={(e) => {
                    setFilterClass(e.target.value);
                    setFilterDivision("all");
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 text-sm"
                >
                  <option value="all">All Classes</option>
                  {classes.map((classItem) => (
                    <option key={classItem.id} value={classItem.id}>
                      {classItem.name}
                    </option>
                  ))}
                  <option value="no-class">Unassigned Class</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Filter by Division
                </label>
                <select
                  value={filterDivision}
                  onChange={(e) => setFilterDivision(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 text-sm"
                >
                  <option value="all">All Divisions</option>
                  {filterClass !== "all" && classes.find(c => c.id === filterClass)?.divisions.map((division) => (
                    <option key={division.id} value={division.id}>
                      {division.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Message Alert */}
        {message && (
          <div
            className={`mb-4 p-3 rounded-lg text-sm ${
              message.includes("successfully") || message.includes("completed")
                ? "bg-green-100 text-green-800 border border-green-300"
                : "bg-red-100 text-red-800 border border-red-300"
            }`}
          >
            {message}
          </div>
        )}

        {/* Form Modal */}
        {showForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl shadow-lg w-full max-w-md border border-gray-200">
              <div className="flex justify-between items-center p-4 border-b">
                <h2 className="text-lg font-semibold text-gray-900">
                  {editingStudent ? "Edit Student" : "Add New Student"}
                </h2>
                <button
                  onClick={resetForm}
                  className="p-1 hover:bg-gray-100 rounded-full transition-colors"
                >
                  <X size={20} className="text-gray-600" />
                </button>
              </div>

              <div className="p-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="text"
                    placeholder="First Name *"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 text-sm"
                  />
                  <input
                    type="text"
                    placeholder="Surname *"
                    value={formData.surname}
                    onChange={(e) =>
                      setFormData({ ...formData, surname: e.target.value })
                    }
                    className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 text-sm"
                  />
                </div>

                <input
                  type="email"
                  placeholder="Email *"
                  value={formData.email}
                  onChange={(e) =>
                    setFormData({ ...formData, email: e.target.value })
                  }
                  disabled={!!editingStudent}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-100 text-sm"
                />

                <input
                  type="text"
                  placeholder="Mobile Number *"
                  value={formData.mobile}
                  onChange={(e) =>
                    setFormData({ ...formData, mobile: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 text-sm"
                />

                {/* Class Dropdown */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Class *
                  </label>
                  <select
                    value={formData.classId}
                    onChange={(e) => handleClassChange(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 text-sm"
                  >
                    <option value="">Select Class</option>
                    {classes.map((classItem) => (
                      <option key={classItem.id} value={classItem.id}>
                        {classItem.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Division Dropdown */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Division *
                  </label>
                  <select
                    value={formData.divisionId}
                    onChange={(e) =>
                      setFormData({ ...formData, divisionId: e.target.value })
                    }
                    disabled={!formData.classId}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-100 text-sm"
                  >
                    <option value="">Select Division</option>
                    {availableDivisions.map((division) => (
                      <option key={division.id} value={division.id}>
                        {division.name}
                      </option>
                    ))}
                  </select>
                </div>

                {!editingStudent && (
                  <input
                    type="password"
                    placeholder="Password *"
                    value={formData.password}
                    onChange={(e) =>
                      setFormData({ ...formData, password: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 text-sm"
                  />
                )}
              </div>

              <div className="flex gap-2 p-4 border-t">
                <button
                  onClick={handleSubmit}
                  disabled={loading}
                  className="flex-1 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium disabled:opacity-50"
                >
                  {loading
                    ? "Processing..."
                    : editingStudent
                    ? "Update Student"
                    : "Add Student"}
                </button>
                <button
                  onClick={resetForm}
                  className="px-4 bg-gray-200 text-gray-700 py-2 rounded-lg hover:bg-gray-300 transition-colors text-sm font-medium"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Class-wise Students Display */}
        <div className="space-y-6">
          {filteredClassGroups.length === 0 ? (
            <div className="bg-white rounded-xl shadow-lg p-8 text-center">
              <User size={48} className="mx-auto text-gray-300 mb-3" />
              <p className="text-gray-500 text-sm">No students found</p>
              <p className="text-gray-400 text-xs mt-1">
                {filterClass !== "all" ? "Try changing your filters" : "Add your first student to get started"}
              </p>
            </div>
          ) : (
            filteredClassGroups.map((classGroup) => (
              <div key={classGroup.classId} className="bg-white rounded-xl shadow-lg overflow-hidden border border-gray-200">
                {/* Class Header */}
                <div 
                  className="bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-3 flex justify-between items-center cursor-pointer"
                  onClick={() => toggleClassExpanded(classGroup.classId)}
                >
                  <div>
                    <h2 className="text-lg font-bold text-white">{classGroup.className}</h2>
                    <p className="text-blue-100 text-sm">
                      {classGroup.divisions.reduce((total, division) => total + division.students.length, 0)} students
                      {" • "}
                      {classGroup.divisions.length} division{classGroup.divisions.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <button className="text-white p-1">
                    {classGroup.expanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                  </button>
                </div>

                {/* Divisions */}
                {classGroup.expanded && (
                  <div className="divide-y divide-gray-100">
                    {classGroup.divisions.map((division) => (
                      <div key={`${classGroup.classId}-${division.divisionId}`} className="bg-white">
                        {/* Division Header */}
                        <div 
                          className="px-4 py-3 bg-blue-50 border-b border-blue-100 flex justify-between items-center cursor-pointer"
                          onClick={() => toggleDivisionExpanded(classGroup.classId, division.divisionId)}
                        >
                          <div>
                            <h3 className="font-semibold text-gray-800">
                              Division {division.divisionName}
                            </h3>
                            <p className="text-gray-600 text-sm">
                              {division.students.length} student{division.students.length !== 1 ? 's' : ''}
                            </p>
                          </div>
                          <button className="text-gray-600 p-1">
                            {division.expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                          </button>
                        </div>

                        {/* Students Table */}
                        {division.expanded && (
                          <div className="overflow-x-auto">
                            {division.students.length === 0 ? (
                              <div className="text-center py-8 text-gray-500 text-sm">
                                No students in this division
                              </div>
                            ) : (
                              <table className="w-full text-sm">
                                <thead className="bg-gray-50 border-b border-gray-100">
                                  <tr>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                                      Student
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                                      Contact
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                                      Enrollment
                                    </th>
                                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider">
                                      Actions
                                    </th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200">
                                  {division.students.map((student) => (
                                    <tr
                                      key={student.id}
                                      className="hover:bg-blue-50 transition-colors"
                                    >
                                      <td className="px-4 py-3">
                                        <div className="font-medium text-gray-900">
                                          {student.name} {student.surname}
                                        </div>
                                        <div className="text-xs text-gray-500 mt-0.5">
                                          ID: {student.id.slice(0, 8)}...
                                        </div>
                                      </td>
                                      <td className="px-4 py-3">
                                        <div className="flex items-center gap-2 text-gray-600 mb-1">
                                          <Mail size={12} className="text-blue-400" />
                                          <span className="text-xs">{student.email}</span>
                                        </div>
                                        <div className="flex items-center gap-2 text-gray-600">
                                          <Phone size={12} className="text-blue-400" />
                                          <span className="text-xs">{student.mobile}</span>
                                        </div>
                                      </td>
                                      <td className="px-4 py-3">
                                        <div className="flex items-center gap-2 text-gray-600">
                                          <Calendar size={12} className="text-blue-400" />
                                          <span className="text-xs">
                                            {new Date(student.createdAt).toLocaleDateString()}
                                          </span>
                                        </div>
                                      </td>
                                      <td className="px-4 py-3">
                                        <div className="flex justify-center gap-1">
                                          <button
                                            onClick={() => startEdit(student)}
                                            className="p-1.5 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors"
                                            title="Edit student"
                                          >
                                            <Pencil size={14} />
                                          </button>
                                          <button
                                            onClick={() => handleDeleteStudent(student.id)}
                                            className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                            title="Delete student"
                                          >
                                            <Trash2 size={14} />
                                          </button>
                                        </div>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}