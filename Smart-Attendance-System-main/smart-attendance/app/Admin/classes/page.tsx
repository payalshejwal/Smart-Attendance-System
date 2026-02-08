"use client";
import React, { useState, useEffect } from 'react';
import { Plus, Trash2, X, ChevronDown, ChevronRight, Search } from 'lucide-react';
import { db } from '@/app/firebase-config';
import { collection, getDocs, addDoc, deleteDoc, doc, updateDoc, query, where } from 'firebase/firestore';

// Define TypeScript interfaces
interface Teacher {
  id: string;
  name: string;
  surname: string;
  Role: string;
  [key: string]: unknown; // For other potential fields
}

interface Division {
  id: string;
  name: string;
}

interface Subject {
  id: string;
  name: string;
  teachers: {
    [divisionId: string]: string | null;
  };
}

interface Class {
  id: string;
  name: string;
  divisions: Division[];
  subjects: Subject[];
  createdAt: string;
}

export default function ClassesManager() {
  const [classes, setClasses] = useState<Class[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [isAddingClass, setIsAddingClass] = useState(false);
  const [newClassName, setNewClassName] = useState('');
  const [expandedClass, setExpandedClass] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async (): Promise<void> => {
    try {
      setLoading(true);
      await Promise.all([loadTeachers(), loadClasses()]);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadTeachers = async (): Promise<void> => {
    try {
      const usersRef = collection(db, 'Users');
      const q = query(usersRef, where('Role', '==', 'Teacher'));
      const querySnapshot = await getDocs(q);
      const teachersList = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Teacher[];
      setTeachers(teachersList);
    } catch (error) {
      console.error('Error loading teachers:', error);
    }
  };

  const loadClasses = async (): Promise<void> => {
    try {
      const classesRef = collection(db, 'Classes');
      const querySnapshot = await getDocs(classesRef);
      const classesList = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Class[];
      setClasses(classesList);
    } catch (error) {
      console.error('Error loading classes:', error);
    }
  };

  const addClass = async (): Promise<void> => {
    if (newClassName.trim()) {
      try {
        const newClass = {
          name: newClassName,
          divisions: [],
          subjects: [],
          createdAt: new Date().toISOString()
        };
        const docRef = await addDoc(collection(db, 'Classes'), newClass);
        setClasses(prev => [...prev, { id: docRef.id, ...newClass }]);
        setNewClassName('');
        setIsAddingClass(false);
      } catch (error) {
        console.error('Error adding class:', error);
      }
    }
  };

  const deleteClass = async (classId: string): Promise<void> => {
    if (confirm('Delete this class and all its data?')) {
      try {
        await deleteDoc(doc(db, 'Classes', classId));
        setClasses(prev => prev.filter(c => c.id !== classId));
      } catch (error) {
        console.error('Error deleting class:', error);
      }
    }
  };

  const addDivision = async (classId: string): Promise<void> => {
    const classData = classes.find(c => c.id === classId);
    if (!classData) return;

    const divisionLetter = String.fromCharCode(65 + classData.divisions.length);
    const newDivision = { id: Date.now().toString(), name: divisionLetter };
    
    try {
      const updatedDivisions = [...classData.divisions, newDivision];
      const updatedSubjects = classData.subjects.map(subject => ({
        ...subject,
        teachers: {
          ...subject.teachers,
          [newDivision.id]: null
        }
      }));

      await updateDoc(doc(db, 'Classes', classId), {
        divisions: updatedDivisions,
        subjects: updatedSubjects
      });

      setClasses(prev => prev.map(c => 
        c.id === classId 
          ? { ...c, divisions: updatedDivisions, subjects: updatedSubjects }
          : c
      ));
    } catch (error) {
      console.error('Error adding division:', error);
    }
  };

  const deleteDivision = async (classId: string, divisionId: string): Promise<void> => {
    if (confirm('Delete this division?')) {
      const classData = classes.find(c => c.id === classId);
      if (!classData) return;
      
      try {
        const updatedDivisions = classData.divisions.filter(d => d.id !== divisionId);
        const updatedSubjects = classData.subjects.map(subject => {
          const { [divisionId]: removed, ...remainingTeachers } = subject.teachers;
          return {
            ...subject,
            teachers: remainingTeachers
          };
        });

        await updateDoc(doc(db, 'Classes', classId), {
          divisions: updatedDivisions,
          subjects: updatedSubjects
        });

        setClasses(prev => prev.map(c => 
          c.id === classId 
            ? { ...c, divisions: updatedDivisions, subjects: updatedSubjects }
            : c
        ));
      } catch (error) {
        console.error('Error deleting division:', error);
      }
    }
  };

  const addSubject = async (classId: string, subjectName: string): Promise<void> => {
    if (subjectName.trim()) {
      const classData = classes.find(c => c.id === classId);
      if (!classData) return;
      
      try {
        const newSubject: Subject = {
          id: Date.now().toString(),
          name: subjectName,
          teachers: classData.divisions.reduce((acc, div) => {
            acc[div.id] = null;
            return acc;
          }, {} as { [divisionId: string]: string | null })
        };

        const updatedSubjects = [...classData.subjects, newSubject];

        await updateDoc(doc(db, 'Classes', classId), {
          subjects: updatedSubjects
        });

        setClasses(prev => prev.map(c => 
          c.id === classId 
            ? { ...c, subjects: updatedSubjects }
            : c
        ));
      } catch (error) {
        console.error('Error adding subject:', error);
      }
    }
  };

  const deleteSubject = async (classId: string, subjectId: string): Promise<void> => {
    const classData = classes.find(c => c.id === classId);
    if (!classData) return;
    
    try {
      const updatedSubjects = classData.subjects.filter(s => s.id !== subjectId);

      await updateDoc(doc(db, 'Classes', classId), {
        subjects: updatedSubjects
      });

      setClasses(prev => prev.map(c => 
        c.id === classId 
          ? { ...c, subjects: updatedSubjects }
          : c
      ));
    } catch (error) {
      console.error('Error deleting subject:', error);
    }
  };

  const assignTeacher = async (
    classId: string, 
    subjectId: string, 
    divisionId: string, 
    teacherId: string | null
  ): Promise<void> => {
    const classData = classes.find(c => c.id === classId);
    if (!classData) return;
    
    try {
      const updatedSubjects = classData.subjects.map(s => {
        if (s.id === subjectId) {
          return {
            ...s,
            teachers: {
              ...s.teachers,
              [divisionId]: teacherId
            }
          };
        }
        return s;
      });

      await updateDoc(doc(db, 'Classes', classId), {
        subjects: updatedSubjects
      });

      setClasses(prev => prev.map(c => 
        c.id === classId 
          ? { ...c, subjects: updatedSubjects }
          : c
      ));
    } catch (error) {
      console.error('Error assigning teacher:', error);
    }
  };

  const QuickAddSubject = ({ classId }: { classId: string }) => {
    const [name, setName] = useState('');

    const handleAddSubject = (): void => {
      if (name.trim()) {
        addSubject(classId, name);
        setName('');
      }
    };

    const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>): void => {
      if (e.key === 'Enter') {
        handleAddSubject();
      }
    };

    return (
      <div className="flex gap-1">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Subject name"
          className="flex-1 px-2 py-1 text-sm border border-blue-300 rounded focus:outline-none focus:border-blue-500"
          onKeyPress={handleKeyPress}
        />
        <button
          onClick={handleAddSubject}
          className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded text-sm"
        >
          Add
        </button>
      </div>
    );
  };

  const filteredClasses = classes.filter(c => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-blue-50 flex items-center justify-center">
        <div className="text-blue-600 font-medium">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-blue-50 p-2 sm:p-4">
      <div className="max-w-7xl mx-auto">
        {/* Compact Header */}
        <div className="bg-white rounded-lg shadow-sm p-3 sm:p-4 mb-3 border border-blue-200">
          <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
            <h1 className="text-xl sm:text-2xl font-bold text-blue-700">Classes Management</h1>
            <div className="flex gap-2">
              <div className="relative flex-1 sm:flex-initial">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search..."
                  className="w-full sm:w-48 pl-8 pr-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
                />
              </div>
              {!isAddingClass ? (
                <button
                  onClick={() => setIsAddingClass(true)}
                  className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1.5 rounded-lg flex items-center gap-1 text-sm whitespace-nowrap"
                >
                  <Plus className="w-4 h-4" />
                  Add Class
                </button>
              ) : (
                <div className="flex gap-1 flex-1 sm:flex-initial">
                  <input
                    type="text"
                    value={newClassName}
                    onChange={(e) => setNewClassName(e.target.value)}
                    placeholder="Class name"
                    className="flex-1 sm:w-32 px-2 py-1.5 text-sm border border-blue-300 rounded-lg focus:outline-none focus:border-blue-500"
                    onKeyPress={(e) => e.key === 'Enter' && addClass()}
                    autoFocus
                  />
                  <button
                    onClick={addClass}
                    className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => {
                      setIsAddingClass(false);
                      setNewClassName('');
                    }}
                    className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-2 py-1.5 rounded-lg"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Classes Grid */}
        {filteredClasses.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm p-8 text-center border border-blue-200">
            <p className="text-gray-500">No classes found. Add your first class to get started.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {filteredClasses.map((classItem) => (
              <div key={classItem.id} className="bg-white rounded-lg shadow-sm border border-blue-200 overflow-hidden">
                {/* Class Header - Compact */}
                <div className="bg-blue-500 p-2 sm:p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <button
                        onClick={() => setExpandedClass(expandedClass === classItem.id ? null : classItem.id)}
                        className="text-white hover:bg-white/20 p-1 rounded flex-shrink-0"
                      >
                        {expandedClass === classItem.id ? (
                          <ChevronDown className="w-5 h-5" />
                        ) : (
                          <ChevronRight className="w-5 h-5" />
                        )}
                      </button>
                      <h2 className="text-base sm:text-lg font-bold text-white truncate">{classItem.name}</h2>
                      <div className="hidden sm:flex items-center gap-1 flex-shrink-0">
                        <span className="bg-white/20 text-white px-2 py-0.5 rounded-full text-xs">
                          {classItem.divisions.length}D
                        </span>
                        <span className="bg-white/20 text-white px-2 py-0.5 rounded-full text-xs">
                          {classItem.subjects.length}S
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => deleteClass(classItem.id)}
                      className="text-white hover:bg-red-500/80 p-1.5 rounded flex-shrink-0"
                      title="Delete Class"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Collapsed View - Show summary */}
                {expandedClass !== classItem.id && (
                  <div className="p-2 sm:p-3 text-xs sm:text-sm text-gray-600">
                    <div className="flex flex-wrap gap-2">
                      <span>Divisions: {classItem.divisions.map(d => d.name).join(', ') || 'None'}</span>
                      <span className="text-gray-400">|</span>
                      <span>{classItem.subjects.length} Subject{classItem.subjects.length !== 1 ? 's' : ''}</span>
                    </div>
                  </div>
                )}

                {/* Expanded View */}
                {expandedClass === classItem.id && (
                  <div className="p-2 sm:p-3">
                    {/* Divisions - Inline */}
                    <div className="mb-3">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-sm font-semibold text-gray-700">Divisions</h3>
                        <button
                          onClick={() => addDivision(classItem.id)}
                          className="bg-blue-100 hover:bg-blue-200 text-blue-700 px-2 py-1 rounded text-xs flex items-center gap-1"
                        >
                          <Plus className="w-3 h-3" />
                          Add
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {classItem.divisions.length === 0 ? (
                          <span className="text-xs text-gray-400 italic">No divisions</span>
                        ) : (
                          classItem.divisions.map((division) => (
                            <div
                              key={division.id}
                              className="bg-blue-100 text-blue-700 px-2 py-1 rounded flex items-center gap-1 text-xs"
                            >
                              <span className="font-medium">{division.name}</span>
                              <button
                                onClick={() => deleteDivision(classItem.id, division.id)}
                                className="hover:bg-red-200 rounded p-0.5"
                              >
                                <X className="w-3 h-3 text-red-600" />
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    {/* Subjects & Teachers - Compact Table */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-sm font-semibold text-gray-700">Subjects & Teachers</h3>
                      </div>

                      <QuickAddSubject classId={classItem.id} />

                      {classItem.subjects.length > 0 && classItem.divisions.length > 0 ? (
                        <div className="mt-2 overflow-x-auto -mx-2 sm:mx-0">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="bg-blue-50">
                                <th className="border border-blue-200 p-1.5 text-left font-medium text-gray-700 sticky left-0 bg-blue-50 z-10">
                                  Subject
                                </th>
                                {classItem.divisions.map((division) => (
                                  <th
                                    key={division.id}
                                    className="border border-blue-200 p-1.5 text-center font-medium text-gray-700 whitespace-nowrap"
                                  >
                                    Div {division.name}
                                  </th>
                                ))}
                                <th className="border border-blue-200 p-1.5 w-8"></th>
                              </tr>
                            </thead>
                            <tbody>
                              {classItem.subjects.map((subject) => (
                                <tr key={subject.id} className="hover:bg-blue-50/50">
                                  <td className="border border-blue-200 p-1.5 font-medium text-gray-700 sticky left-0 bg-white z-10">
                                    {subject.name}
                                  </td>
                                  {classItem.divisions.map((division) => (
                                    <td key={division.id} className="border border-blue-200 p-1">
                                      <select
                                        value={subject.teachers[division.id] || ''}
                                        onChange={(e) =>
                                          assignTeacher(
                                            classItem.id,
                                            subject.id,
                                            division.id,
                                            e.target.value || null
                                          )
                                        }
                                        className="w-full px-1.5 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:border-blue-500"
                                      >
                                        <option value="">Select</option>
                                        {teachers.map((teacher) => (
                                          <option key={teacher.id} value={teacher.id}>
                                            {teacher.name} {teacher.surname}
                                          </option>
                                        ))}
                                      </select>
                                    </td>
                                  ))}
                                  <td className="border border-blue-200 p-1 text-center">
                                    <button
                                      onClick={() => deleteSubject(classItem.id, subject.id)}
                                      className="text-red-600 hover:bg-red-100 p-1 rounded"
                                      title="Delete Subject"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <p className="text-xs text-gray-400 italic mt-2 text-center py-2">
                          {classItem.divisions.length === 0
                            ? 'Add divisions first'
                            : 'No subjects yet'}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}