"use client";

import { useState, useEffect, useRef } from "react";
import { auth, db } from "@/app/firebase-config";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { doc, setDoc, collection, getDocs, updateDoc, deleteDoc, writeBatch } from "firebase/firestore";
import { Pencil, Trash2, X, Plus, User, Mail, Phone, Calendar, GripVertical } from "lucide-react";

interface Admin {
  id: string;
  name: string;
  surname: string;
  email: string;
  mobile: string;
  createdAt: string;
  Role: string;
  order?: number; // Add order field for drag and drop
}

interface FormData {
  name: string;
  surname: string;
  email: string;
  mobile: string;
  password: string;
}

export default function TeacherManagementPage() {
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingTeacher, setEditingTeacher] = useState<Admin | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  
  const dragItem = useRef<number | null>(null);
  const dragNode = useRef<HTMLElement | null>(null);
  
  const [formData, setFormData] = useState<FormData>({
    name: "",
    surname: "",
    email: "",
    mobile: "",
    password: ""
  });

  useEffect(() => {
    fetchAdmins();
  }, []);

  const fetchAdmins = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, "Users"));
      const adminsList: Admin[] = [];
      querySnapshot.forEach((docItem) => {
        const data = docItem.data();
        if (data.Role === "Admin") {
          adminsList.push({ 
            id: docItem.id, 
            ...data,
            order: data.order || 0 // Default order to 0 if not set
          } as Admin);
        }
      });
      // Sort by order field
      const sortedAdmins = adminsList.sort((a, b) => (a.order || 0) - (b.order || 0));
      setAdmins(sortedAdmins);
    } catch (error) {
      console.error("Error fetching admins:", error);
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
      setMessage("Password is required for new admins");
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
        setMessage("Admin updated successfully!");
      } else {
        const userCredential = await createUserWithEmailAndPassword(
          auth,
          formData.email,
          formData.password
        );
        const uid = userCredential.user.uid;

        // Set order as the last position
        const newOrder = admins.length > 0 ? Math.max(...admins.map(a => a.order || 0)) + 1 : 0;

        await setDoc(doc(db, "Users", uid), {
          name: formData.name,
          surname: formData.surname,
          email: formData.email,
          mobile: formData.mobile,
          Role: "Admin",
          order: newOrder,
          createdAt: new Date().toISOString(),
        });
        setMessage("Admin added successfully!");
      }

      await fetchAdmins();
      setTimeout(() => resetForm(), 1500);
    } catch (error) {
      console.error("Error:", error);
      setMessage(error instanceof Error ? error.message : "An error occurred");
    }

    setLoading(false);
  };

  const handleDeleteTeacher = async (teacherId: string) => {
    if (!confirm("Are you sure you want to delete this Admin?")) return;

    try {
      await deleteDoc(doc(db, "Users", teacherId));
      setMessage("Admin deleted successfully!");
      await fetchAdmins();
      setTimeout(() => setMessage(""), 2000);
    } catch (error) {
      console.error("Error deleting admin:", error);
      setMessage(error instanceof Error ? error.message : "An error occurred");
    }
  };

  const startEdit = (admin: Admin) => {
    setEditingTeacher(admin);
    setFormData({
      name: admin.name,
      surname: admin.surname,
      email: admin.email,
      mobile: admin.mobile,
      password: ""
    });
    setShowForm(true);
  };

  // Drag and Drop Handlers
  const handleDragStart = (e: React.DragEvent, index: number) => {
    dragItem.current = index;
    dragNode.current = e.currentTarget as HTMLElement;
    setIsDragging(true);
    
    // Set drag image
    setTimeout(() => {
      if (dragNode.current) {
        dragNode.current.classList.add('dragging');
      }
    }, 0);
  };

  const handleDragEnter = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOverIndex(index);
    
    if (dragItem.current !== index) {
      setAdmins(prev => {
        const newAdmins = [...prev];
        const draggedItem = newAdmins[dragItem.current!];
        
        // Remove dragged item
        newAdmins.splice(dragItem.current!, 1);
        // Insert at new position
        newAdmins.splice(index, 0, draggedItem);
        
        dragItem.current = index;
        return newAdmins;
      });
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDragEnd = async () => {
    setIsDragging(false);
    setDragOverIndex(null);
    
    if (dragNode.current) {
      dragNode.current.classList.remove('dragging');
    }
    
    // Update order in database
    if (dragItem.current !== null) {
      try {
        const batch = writeBatch(db);
        
        admins.forEach((admin, index) => {
          const adminRef = doc(db, "Users", admin.id);
          batch.update(adminRef, { order: index });
        });
        
        await batch.commit();
        setMessage("Order updated successfully!");
        setTimeout(() => setMessage(""), 2000);
      } catch (error) {
        console.error("Error updating order:", error);
        setMessage("Error updating order");
        // Revert to original order
        await fetchAdmins();
      }
    }
    
    dragItem.current = null;
    dragNode.current = null;
  };

  const getDragStyle = (index: number) => {
    if (index === dragOverIndex) {
      return {
        transform: 'scale(1.02)',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        border: '2px solid #3b82f6',
        backgroundColor: '#f0f9ff'
      };
    }
    return {};
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-50 p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Admin Management</h1>
            <p className="text-sm text-gray-600 mt-1">
              {admins.length} Admin{admins.length !== 1 ? "s" : ""} registered
            </p>
          </div>
          {!showForm && (
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors shadow-sm text-sm font-medium"
            >
              <Plus size={16} />
              Add Admin
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
                  {editingTeacher ? "Edit Admin" : "Add New Admin"}
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
                  {loading ? "Processing..." : editingTeacher ? "Update Admin" : "Add Admin"}
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

        {/* Admins Table */}
        <div className="bg-white rounded-xl shadow-lg overflow-hidden border border-blue-100">
          <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-3">
            <h2 className="text-lg font-bold text-white">Admins List</h2>
            <p className="text-blue-100 text-sm mt-1">
              Drag and drop to reorder admins
            </p>
          </div>

          {admins.length === 0 ? (
            <div className="text-center py-12">
              <User size={48} className="mx-auto text-gray-300 mb-3" />
              <p className="text-gray-500 text-sm">No admins found</p>
              <p className="text-gray-400 text-xs mt-1">Add your first admin to get started</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-blue-50 border-b border-blue-100">
                  <tr>
                    <th className="w-10 px-2 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Drag
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Admin
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
                  {admins.map((admin, index) => (
                    <tr 
                      key={admin.id} 
                      draggable
                      onDragStart={(e) => handleDragStart(e, index)}
                      onDragEnter={(e) => handleDragEnter(e, index)}
                      onDragOver={handleDragOver}
                      onDragEnd={handleDragEnd}
                      style={getDragStyle(index)}
                      className="hover:bg-blue-50 transition-all duration-200 cursor-move bg-white"
                    >
                      <td className="px-2 py-3 text-center">
                        <div className="flex justify-center">
                          <GripVertical 
                            size={16} 
                            className="text-gray-400 hover:text-gray-600 cursor-grab active:cursor-grabbing" 
                          />
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">
                          {admin.name} {admin.surname}
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">ID: {admin.id.slice(0, 8)}...</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 text-gray-600 mb-1">
                          <Mail size={12} className="text-gray-400" />
                          <span className="text-xs">{admin.email}</span>
                        </div>
                        <div className="flex items-center gap-2 text-gray-600">
                          <Phone size={12} className="text-gray-400" />
                          <span className="text-xs">{admin.mobile}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 text-gray-600">
                          <Calendar size={12} className="text-gray-400" />
                          <span className="text-xs">
                            {new Date(admin.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-center gap-1">
                          <button
                            onClick={() => startEdit(admin)}
                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="Edit Admin"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            onClick={() => handleDeleteTeacher(admin.id)}
                            className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Delete Admin"
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

        {/* Drag and Drop Instructions */}
        <div className="mt-4 text-center">
          <p className="text-xs text-gray-500">
            💡 Drag and drop admins to reorder them. Changes are saved automatically.
          </p>
        </div>
      </div>

      <style jsx>{`
        .dragging {
          opacity: 0.6;
          transform: rotate(2deg);
          transition: transform 0.2s ease;
        }
      `}</style>
    </div>
  );
}