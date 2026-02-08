"use client";

import { useState, useEffect } from "react";
import { auth, db } from "@/app/firebase-config";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { doc, setDoc, collection, getDocs, updateDoc, deleteDoc } from "firebase/firestore";
import { Pencil, Trash2, X, Plus, User, Mail, Phone, Calendar } from "lucide-react";

interface Teacher {
  id: string;
  name: string;
  surname: string;
  email: string;
  mobile: string;
  createdAt: string;
  Role: string;
}

interface FormData {
  name: string;
  surname: string;
  email: string;
  mobile: string;
  password: string;
}

export default function TeacherManagementPage() {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingTeacher, setEditingTeacher] = useState<Teacher | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  
  const [formData, setFormData] = useState<FormData>({
    name: "",
    surname: "",
    email: "",
    mobile: "",
    password: ""
  });

  useEffect(() => {
    fetchTeachers();
  }, []);

  const fetchTeachers = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, "Users"));
      const teachersList: Teacher[] = [];
      querySnapshot.forEach((docItem) => {
        const data = docItem.data();
        if (data.Role === "Teacher") {
          teachersList.push({ id: docItem.id, ...data } as Teacher);
        }
      });
      setTeachers(teachersList);
    } catch (error) {
      console.error("Error fetching teachers:", error);
    }
  };

  const resetForm = () => {
    setFormData({
      name: "",
      surname: "",
      email: "",
      mobile: "",
      password: ""
    });
    setEditingTeacher(null);
    setShowForm(false);
    setMessage("");
  };

  const handleSubmit = async () => {
    if (!formData.name || !formData.surname || !formData.email || !formData.mobile) {
      setMessage("Please fill in all required fields");
      return;
    }

    if (!editingTeacher && !formData.password) {
      setMessage("Password is required for new teachers");
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      if (editingTeacher) {
        const teacherRef = doc(db, "Users", editingTeacher.id);
        await updateDoc(teacherRef, {
          name: formData.name,
          surname: formData.surname,
          email: formData.email,
          mobile: formData.mobile,
          updatedAt: new Date().toISOString(),
        });
        setMessage("Teacher updated successfully!");
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
          Role: "Teacher",
          createdAt: new Date().toISOString(),
        });
        setMessage("Teacher added successfully!");
      }

      await fetchTeachers();
      setTimeout(() => resetForm(), 1500);
    } catch (error) {
      console.error("Error:", error);
      setMessage(error instanceof Error ? error.message : "An error occurred");
    }

    setLoading(false);
  };

  const handleDeleteTeacher = async (teacherId: string) => {
    if (!confirm("Are you sure you want to delete this teacher?")) return;

    try {
      await deleteDoc(doc(db, "Users", teacherId));
      setMessage("Teacher deleted successfully!");
      await fetchTeachers();
      setTimeout(() => setMessage(""), 2000);
    } catch (error) {
      console.error("Error deleting teacher:", error);
      setMessage(error instanceof Error ? error.message : "An error occurred");
    }
  };

  const startEdit = (teacher: Teacher) => {
    setEditingTeacher(teacher);
    setFormData({
      name: teacher.name,
      surname: teacher.surname,
      email: teacher.email,
      mobile: teacher.mobile,
      password: ""
    });
    setShowForm(true);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-50 p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Teacher Management</h1>
            <p className="text-sm text-gray-600 mt-1">
              {teachers.length} teacher{teachers.length !== 1 ? "s" : ""} registered
            </p>
          </div>
          {!showForm && (
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors shadow-sm text-sm font-medium"
            >
              <Plus size={16} />
              Add Teacher
            </button>
          )}
        </div>

        {/* Message Alert */}
        {message && (
          <div
            className={`mb-4 p-3 rounded-lg text-sm ${
              message.includes("successfully")
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
            <div className="bg-white rounded-xl shadow-lg w-full max-w-md border border-blue-100">
              <div className="flex justify-between items-center p-4 border-b border-blue-100">
                <h2 className="text-lg font-semibold text-gray-900">
                  {editingTeacher ? "Edit Teacher" : "Add New Teacher"}
                </h2>
                <button
                  onClick={resetForm}
                  className="p-1 hover:bg-blue-50 rounded-full transition-colors"
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
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 text-sm"
                  />
                  <input
                    type="text"
                    placeholder="Surname *"
                    value={formData.surname}
                    onChange={(e) => setFormData({ ...formData, surname: e.target.value })}
                    className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 text-sm"
                  />
                </div>

                <input
                  type="email"
                  placeholder="Email *"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  disabled={!!editingTeacher}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-100 text-sm"
                />

                <input
                  type="text"
                  placeholder="Mobile Number *"
                  value={formData.mobile}
                  onChange={(e) => setFormData({ ...formData, mobile: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 text-sm"
                />

                {!editingTeacher && (
                  <input
                    type="password"
                    placeholder="Password *"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 text-sm"
                  />
                )}
              </div>

              <div className="flex gap-2 p-4 border-t border-blue-100">
                <button
                  onClick={handleSubmit}
                  disabled={loading}
                  className="flex-1 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium disabled:opacity-50"
                >
                  {loading ? "Processing..." : editingTeacher ? "Update Teacher" : "Add Teacher"}
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

        {/* Teachers Table */}
        <div className="bg-white rounded-xl shadow-lg overflow-hidden border border-blue-100">
          <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-3">
            <h2 className="text-lg font-bold text-white">Teachers List</h2>
          </div>

          {teachers.length === 0 ? (
            <div className="text-center py-12">
              <User size={48} className="mx-auto text-gray-300 mb-3" />
              <p className="text-gray-500 text-sm">No teachers found</p>
              <p className="text-gray-400 text-xs mt-1">Add your first teacher to get started</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-blue-50 border-b border-blue-100">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Teacher
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Contact
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Joined On
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-blue-100">
                  {teachers.map((teacher) => (
                    <tr key={teacher.id} className="hover:bg-blue-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">
                          {teacher.name} {teacher.surname}
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">ID: {teacher.id.slice(0, 8)}...</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 text-gray-600 mb-1">
                          <Mail size={12} className="text-gray-400" />
                          <span className="text-xs">{teacher.email}</span>
                        </div>
                        <div className="flex items-center gap-2 text-gray-600">
                          <Phone size={12} className="text-gray-400" />
                          <span className="text-xs">{teacher.mobile}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 text-gray-600">
                          <Calendar size={12} className="text-gray-400" />
                          <span className="text-xs">
                            {new Date(teacher.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-center gap-1">
                          <button
                            onClick={() => startEdit(teacher)}
                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="Edit teacher"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            onClick={() => handleDeleteTeacher(teacher.id)}
                            className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Delete teacher"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}