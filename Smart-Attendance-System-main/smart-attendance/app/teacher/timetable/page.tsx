"use client";
import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Clock, Search, Save, X, Eye, EyeOff, RotateCcw, Calendar, Users } from 'lucide-react';
import { db } from '@/app/firebase-config';
import { collection, getDocs, doc, updateDoc, getDoc, query, where } from 'firebase/firestore';

// Types
interface Teacher {
  id: string;
  name: string;
  surname: string;
}

interface Subject {
  id: string;
  name: string;
  teachers: {
    [divisionId: string]: string | null;
  };
}

interface Division {
  id: string;
  name: string;
}

interface TimetableEntry {
  subjectId: string | null;
  teacherId: string | null;
  slotTime?: {
    startTime: string;
    endTime: string;
  };
}

interface TimetableDay {
  [timeSlotId: string]: TimetableEntry;
}

interface Timetable {
  [divisionId: string]: {
    [day: string]: TimetableDay;
  };
}

interface Class {
  id: string;
  name: string;
  divisions: Division[];
  subjects: Subject[];
  timetable?: Timetable;
}

interface TimeSlot {
  id: string;
  startTime: string;
  endTime: string;
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAYS_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DEFAULT_TIME_SLOTS: TimeSlot[] = [
  { id: '1', startTime: '10:00', endTime: '11:00' },
  { id: '2', startTime: '11:00', endTime: '12:00' },
  { id: '3', startTime: '12:45', endTime: '13:45' },
  { id: '4', startTime: '13:45', endTime: '14:45' },
  { id: '5', startTime: '15:00', endTime: '16:00' },
  { id: '6', startTime: '16:00', endTime: '17:00' },
];

export default function TimetableManager() {
  const [classes, setClasses] = useState<Class[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [selectedClass, setSelectedClass] = useState<string>('');
  const [selectedDivision, setSelectedDivision] = useState<string>('');
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>(DEFAULT_TIME_SLOTS);
  const [timetable, setTimetable] = useState<Timetable>({});
  const [isAddingTimeSlot, setIsAddingTimeSlot] = useState(false);
  const [newTimeSlot, setNewTimeSlot] = useState({ startTime: '', endTime: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showSubjectsPanel, setShowSubjectsPanel] = useState(false);
  const [activeDay, setActiveDay] = useState<string>('Mon');
  const [viewMode, setViewMode] = useState<'grid' | 'day'>('grid');

  // Load initial data
  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async (): Promise<void> => {
    try {
      setLoading(true);
      await Promise.all([loadClasses(), loadTeachers()]);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
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

  // Initialize timetable structure
  const initializeTimetable = (): Timetable => {
    const initialTimetable: Timetable = {};
    
    if (selectedClass && selectedDivision) {
      const classData = classes.find(c => c.id === selectedClass);
      classData?.divisions.forEach(division => {
        initialTimetable[division.id] = DAYS.reduce((acc, day) => {
          acc[day] = timeSlots.reduce((timeAcc, slot) => {
            timeAcc[slot.id] = { 
              subjectId: null, 
              teacherId: null,
              slotTime: {
                startTime: slot.startTime,
                endTime: slot.endTime
              }
            };
            return timeAcc;
          }, {} as TimetableDay);
          return acc;
        }, {} as { [day: string]: TimetableDay });
      });
    }
    
    return initialTimetable;
  };

  // Load timetable when class and division are selected
  useEffect(() => {
    if (selectedClass && selectedDivision) {
      loadTimetable();
    }
  }, [selectedClass, selectedDivision]);

  const loadTimetable = async (): Promise<void> => {
    if (!selectedClass || !selectedDivision) return;

    try {
      const classDoc = await getDoc(doc(db, 'Classes', selectedClass));
      const classData = classDoc.data() as Class;
      
      if (classData?.timetable && classData.timetable[selectedDivision]) {
        // Ensure all timetable entries have slot time data
        const updatedTimetable = { ...classData.timetable };
        
        Object.keys(updatedTimetable).forEach(divisionId => {
          Object.keys(updatedTimetable[divisionId]).forEach(day => {
            Object.keys(updatedTimetable[divisionId][day]).forEach(timeSlotId => {
              const slot = timeSlots.find(s => s.id === timeSlotId);
              if (slot && !updatedTimetable[divisionId][day][timeSlotId].slotTime) {
                updatedTimetable[divisionId][day][timeSlotId].slotTime = {
                  startTime: slot.startTime,
                  endTime: slot.endTime
                };
              }
            });
          });
        });
        
        setTimetable(updatedTimetable);
      } else {
        // Initialize empty timetable with slot times
        const initialTimetable = initializeTimetable();
        setTimetable(initialTimetable);
      }
    } catch (error) {
      console.error('Error loading timetable:', error);
      // Initialize empty timetable on error
      const initialTimetable = initializeTimetable();
      setTimetable(initialTimetable);
    }
  };

  const getAvailableSubjects = useCallback((): Subject[] => {
    if (!selectedClass) return [];
    const classData = classes.find(c => c.id === selectedClass);
    return classData?.subjects || [];
  }, [selectedClass, classes]);

  const getTeacherForSubject = useCallback((subjectId: string): string | null => {
    if (!selectedClass || !selectedDivision) return null;
    const classData = classes.find(c => c.id === selectedClass);
    const subject = classData?.subjects.find(s => s.id === subjectId);
    return subject?.teachers[selectedDivision] || null;
  }, [selectedClass, selectedDivision, classes]);

  // Handle subject selection for a time slot
  const handleSubjectChange = (day: string, timeSlotId: string, subjectId: string): void => {
    const teacherId = subjectId ? getTeacherForSubject(subjectId) : null;
    const slot = timeSlots.find(s => s.id === timeSlotId);
    
    setTimetable(prev => ({
      ...prev,
      [selectedDivision]: {
        ...prev[selectedDivision],
        [day]: {
          ...prev[selectedDivision]?.[day],
          [timeSlotId]: {
            subjectId: subjectId || null,
            teacherId,
            slotTime: slot ? {
              startTime: slot.startTime,
              endTime: slot.endTime
            } : undefined
          }
        }
      }
    }));
  };

  const clearTimeSlot = (day: string, timeSlotId: string): void => {
    const slot = timeSlots.find(s => s.id === timeSlotId);
    
    setTimetable(prev => ({
      ...prev,
      [selectedDivision]: {
        ...prev[selectedDivision],
        [day]: {
          ...prev[selectedDivision]?.[day],
          [timeSlotId]: { 
            subjectId: null, 
            teacherId: null,
            slotTime: slot ? {
              startTime: slot.startTime,
              endTime: slot.endTime
            } : undefined
          }
        }
      }
    }));
  };

  const clearDay = (day: string): void => {
    if (confirm(`Clear all classes for ${DAYS_FULL[DAYS.indexOf(day)]}?`)) {
      setTimetable(prev => ({
        ...prev,
        [selectedDivision]: {
          ...prev[selectedDivision],
          [day]: timeSlots.reduce((acc, slot) => {
            acc[slot.id] = { 
              subjectId: null, 
              teacherId: null,
              slotTime: {
                startTime: slot.startTime,
                endTime: slot.endTime
              }
            };
            return acc;
          }, {} as TimetableDay)
        }
      }));
    }
  };

  // Enhanced time slot management
  const addTimeSlot = (): void => {
    if (newTimeSlot.startTime && newTimeSlot.endTime) {
      const newSlot: TimeSlot = {
        id: Date.now().toString(),
        startTime: newTimeSlot.startTime,
        endTime: newTimeSlot.endTime
      };
      setTimeSlots(prev => [...prev, newSlot]);
      
      // Add the new time slot to all days in the timetable with slot time
      setTimetable(prev => {
        const updated = { ...prev };
        Object.keys(updated).forEach(divisionId => {
          Object.keys(updated[divisionId]).forEach(day => {
            updated[divisionId][day][newSlot.id] = { 
              subjectId: null, 
              teacherId: null,
              slotTime: {
                startTime: newSlot.startTime,
                endTime: newSlot.endTime
              }
            };
          });
        });
        return updated;
      });
      
      setNewTimeSlot({ startTime: '', endTime: '' });
      setIsAddingTimeSlot(false);
    }
  };

  const deleteTimeSlot = (timeSlotId: string): void => {
    if (timeSlots.length <= 1) {
      alert('Cannot delete the last time slot');
      return;
    }

    setTimeSlots(prev => prev.filter(slot => slot.id !== timeSlotId));
    
    // Remove the time slot from all days in the timetable
    setTimetable(prev => {
      const updated = { ...prev };
      Object.keys(updated).forEach(divisionId => {
        Object.keys(updated[divisionId]).forEach(day => {
          delete updated[divisionId][day][timeSlotId];
        });
      });
      return updated;
    });
  };

  // Update slot times when time slots are modified
  useEffect(() => {
    if (selectedDivision && Object.keys(timetable).length > 0) {
      setTimetable(prev => {
        const updated = { ...prev };
        Object.keys(updated).forEach(divisionId => {
          Object.keys(updated[divisionId]).forEach(day => {
            Object.keys(updated[divisionId][day]).forEach(timeSlotId => {
              const slot = timeSlots.find(s => s.id === timeSlotId);
              if (slot) {
                updated[divisionId][day][timeSlotId].slotTime = {
                  startTime: slot.startTime,
                  endTime: slot.endTime
                };
              }
            });
          });
        });
        return updated;
      });
    }
  }, [timeSlots, selectedDivision]);

  // Function to assign subject to multiple slots programmatically
  const assignSubjectToMultipleSlots = (
    subjectId: string, 
    slots: { day: string; timeSlotId: string }[]
  ): void => {
    const teacherId = getTeacherForSubject(subjectId);
    
    setTimetable(prev => {
      const updated = { ...prev };
      slots.forEach(({ day, timeSlotId }) => {
        if (updated[selectedDivision]?.[day]?.[timeSlotId]) {
          const slot = timeSlots.find(s => s.id === timeSlotId);
          updated[selectedDivision][day][timeSlotId] = { 
            subjectId, 
            teacherId,
            slotTime: slot ? {
              startTime: slot.startTime,
              endTime: slot.endTime
            } : undefined
          };
        }
      });
      return updated;
    });
  };

  // Function to check subject frequency
  const getSubjectFrequency = (subjectId: string): { [day: string]: number } => {
    const frequency: { [day: string]: number } = {};
    
    DAYS.forEach(day => {
      frequency[day] = Object.values(timetable[selectedDivision]?.[day] || {})
        .filter(entry => entry.subjectId === subjectId)
        .length;
    });
    
    return frequency;
  };

  const saveTimetable = async (): Promise<void> => {
    if (!selectedClass) return;

    try {
      setSaving(true);
      const classRef = doc(db, 'Classes', selectedClass);
      await updateDoc(classRef, {
        timetable: timetable
      });
      alert('Timetable saved successfully!');
    } catch (error) {
      console.error('Error saving timetable:', error);
      alert('Error saving timetable');
    } finally {
      setSaving(false);
    }
  };

  const getSubjectName = (subjectId: string | null): string => {
    if (!subjectId) return '';
    const subject = getAvailableSubjects().find(s => s.id === subjectId);
    return subject?.name || '';
  };

  const getTeacherName = (teacherId: string | null): string => {
    if (!teacherId) return '';
    const teacher = teachers.find(t => t.id === teacherId);
    return teacher ? `${teacher.name} ${teacher.surname}` : '';
  };

  const getSlotTimeDisplay = (entry: TimetableEntry): string => {
    if (entry.slotTime) {
      return `${entry.slotTime.startTime} - ${entry.slotTime.endTime}`;
    }
    
    // Fallback to timeSlots array if slotTime is not available
    const slot = timeSlots.find(s => 
      s.startTime === entry.slotTime?.startTime && 
      s.endTime === entry.slotTime?.endTime
    );
    return slot ? `${slot.startTime} - ${slot.endTime}` : '';
  };

  const getSubjectInitials = (subjectName: string): string => {
    return subjectName
      .split(' ')
      .map(word => word.charAt(0).toUpperCase())
      .join('')
      .substring(0, 3);
  };

  const filteredSubjects = getAvailableSubjects().filter(subject =>
    subject.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-mint-600 font-medium">Loading timetable data...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-2">
      <div className="max-w-7xl mx-auto">
        {/* Compact Header */}
        <div className="bg-white rounded-lg shadow-xs p-3 mb-2 border border-mint-200">
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-mint-600" />
                <h1 className="text-lg font-bold text-mint-700">Timetable Manager</h1>
              </div>
              
              <div className="flex gap-2">
                <button
                  onClick={saveTimetable}
                  disabled={saving || !selectedClass || !selectedDivision}
                  className="bg-teal-500 hover:bg-teal-600 text-white px-3 py-1.5 rounded-lg flex items-center gap-1 text-sm"
                >
                  <Save className="w-4 h-4 text-white" />
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>

            {/* Selection Row */}
            <div className="flex flex-col sm:flex-row gap-2">
              <select
                value={selectedClass}
                onChange={(e) => {
                  setSelectedClass(e.target.value);
                  setSelectedDivision('');
                }}
                className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-mint-500"
              >
                <option value="">Select Class</option>
                {classes.map(cls => (
                  <option key={cls.id} value={cls.id}>{cls.name}</option>
                ))}
              </select>

              <select
                value={selectedDivision}
                onChange={(e) => setSelectedDivision(e.target.value)}
                disabled={!selectedClass}
                className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-mint-500 disabled:opacity-50"
              >
                <option value="">Select Division</option>
                {classes.find(c => c.id === selectedClass)?.divisions.map(div => (
                  <option key={div.id} value={div.id}>Div {div.name}</option>
                ))}
              </select>

              <div className="flex gap-1">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`px-2 py-1.5 rounded-lg text-sm ${
                    viewMode === 'grid' 
                      ? 'bg-mint-500 text-white' 
                      : 'bg-gray-100 text-gray-700'
                  }`}
                >
                  Grid
                </button>
                <button
                  onClick={() => setViewMode('day')}
                  className={`px-2 py-1.5 rounded-lg text-sm ${
                    viewMode === 'day' 
                      ? 'bg-mint-500 text-white' 
                      : 'bg-gray-100 text-gray-700'
                  }`}
                >
                  Day View
                </button>
              </div>
            </div>
          </div>
        </div>

        {!selectedClass || !selectedDivision ? (
          <div className="bg-white rounded-lg shadow-xs p-6 text-center border border-mint-200">
            <Clock className="w-12 h-12 text-gray-400 mx-auto mb-3" />
            <h3 className="text-lg font-medium text-gray-700 mb-2">Select Class and Division</h3>
            <p className="text-gray-500 text-sm">Choose a class and division to start managing the timetable.</p>
          </div>
        ) : (
          <div className="gap-2">
            {/* Timetable Grid with Dropdowns */}
            <div>
              {viewMode === 'grid' ? (
                <div className="bg-white rounded-lg shadow-xs border border-mint-200 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-gray-50">
                          <th className="w-16 p-1 border border-gray-200 font-medium text-gray-700 text-center sticky left-0 bg-gray-50 z-10">
                            Time
                          </th>
                          {DAYS.map(day => (
                            <th key={day} className="p-1 border border-gray-200 font-medium text-gray-700 text-center relative group">
                              <div className="flex items-center justify-center gap-1">
                                <span>{day}</span>
                                <button
                                  onClick={() => clearDay(day)}
                                  className="opacity-0 group-hover:opacity-100 text-red-500 hover:bg-red-100 rounded p-0.5 transition-opacity"
                                  title={`Clear ${DAYS_FULL[DAYS.indexOf(day)]}`}
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {timeSlots.map(slot => (
                          <tr key={slot.id} className="hover:bg-gray-50/50">
                            <td className="p-1 border border-gray-200 text-center font-mono bg-gray-50 sticky left-0 z-10 text-[10px]">
                              {slot.startTime}-<br/>{slot.endTime}
                            </td>
                            {DAYS.map(day => (
                              <td key={day} className="p-1 border border-gray-200 min-w-[120px]">
                                <div className={`p-1 rounded ${
                                  timetable[selectedDivision]?.[day]?.[slot.id]?.subjectId
                                    ? 'bg-mint-50 border border-mint-200'
                                    : 'bg-gray-50 hover:bg-gray-100'
                                } transition-colors`}>
                                  <select
                                    value={timetable[selectedDivision]?.[day]?.[slot.id]?.subjectId || ''}
                                    onChange={(e) => handleSubjectChange(day, slot.id, e.target.value)}
                                    className="w-full p-1 text-xs border border-gray-300 rounded focus:outline-none focus:border-mint-500 bg-white"
                                  >
                                    <option value="">-- Select Subject --</option>
                                    {getAvailableSubjects().map(subject => (
                                      <option key={subject.id} value={subject.id}>
                                        {subject.name}
                                      </option>
                                    ))}
                                  </select>
                                  
                                  {timetable[selectedDivision]?.[day]?.[slot.id]?.subjectId && (
                                    <div className="mt-1 space-y-1">
                                      <div className="flex items-center gap-1 text-[10px] text-gray-600">
                                        <Users className="w-3 h-3" />
                                        <span className="truncate">
                                          {getTeacherName(timetable[selectedDivision]?.[day]?.[slot.id]?.teacherId)}
                                        </span>
                                      </div>
                                      <div className="flex items-center justify-between">
                                        <div className="text-[9px] text-gray-500 font-mono">
                                          {getSlotTimeDisplay(timetable[selectedDivision]?.[day]?.[slot.id]!)}
                                        </div>
                                        <button
                                          onClick={() => clearTimeSlot(day, slot.id)}
                                          className="text-red-500 hover:bg-red-100 rounded p-0.5 flex-shrink-0"
                                          title="Clear slot"
                                        >
                                          <X className="w-3 h-3" />
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                // Day View with Dropdowns
                <div className="bg-white rounded-lg shadow-xs border border-mint-200 p-4">
                  <div className="flex gap-2 mb-4 overflow-x-auto">
                    {DAYS.map(day => (
                      <button
                        key={day}
                        onClick={() => setActiveDay(day)}
                        className={`px-4 py-2 rounded-lg text-sm whitespace-nowrap ${
                          activeDay === day
                            ? 'bg-mint-500 text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {DAYS_FULL[DAYS.indexOf(day)]}
                      </button>
                    ))}
                  </div>

                  <div className="space-y-3">
                    {timeSlots.map(slot => (
                      <div key={slot.id} className="flex items-start gap-4 p-3 border border-gray-200 rounded-lg hover:bg-gray-50">
                        <div className="w-24 font-mono text-sm text-gray-600 bg-gray-100 px-3 py-2 rounded text-center">
                          {slot.startTime}-{slot.endTime}
                        </div>
                        
                        <div className="flex-1">
                          <div className={`p-3 rounded-lg ${
                            timetable[selectedDivision]?.[activeDay]?.[slot.id]?.subjectId
                              ? 'bg-mint-50 border border-mint-200'
                              : 'bg-gray-50'
                          }`}>
                            <select
                              value={timetable[selectedDivision]?.[activeDay]?.[slot.id]?.subjectId || ''}
                              onChange={(e) => handleSubjectChange(activeDay, slot.id, e.target.value)}
                              className="w-full p-2 text-sm border border-gray-300 rounded focus:outline-none focus:border-mint-500 bg-white"
                            >
                              <option value="">-- Select Subject --</option>
                              {getAvailableSubjects().map(subject => (
                                <option key={subject.id} value={subject.id}>
                                  {subject.name}
                                </option>
                              ))}
                            </select>
                            
                            {timetable[selectedDivision]?.[activeDay]?.[slot.id]?.subjectId && (
                              <div className="mt-2 space-y-2">
                                <div className="flex items-center gap-2 text-sm text-gray-600">
                                  <Users className="w-4 h-4" />
                                  <span>
                                    Teacher: {getTeacherName(timetable[selectedDivision]?.[activeDay]?.[slot.id]?.teacherId)}
                                  </span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <div className="text-xs text-gray-500 font-mono">
                                    {getSlotTimeDisplay(timetable[selectedDivision]?.[activeDay]?.[slot.id]!)}
                                  </div>
                                  <button
                                    onClick={() => clearTimeSlot(activeDay, slot.id)}
                                    className="text-red-500 hover:bg-red-100 rounded p-1"
                                  >
                                    <X className="w-4 h-4" />
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Quick Actions Footer */}
              <div className="mt-3 bg-white rounded-lg shadow-xs border border-mint-200 p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 bg-mint-100 border border-mint-200 rounded"></div>
                      <span className="text-gray-600">Scheduled Class</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 bg-gray-100 border border-gray-300 rounded"></div>
                      <span className="text-gray-600">Empty Slot</span>
                    </div>
                  </div>
                  
                  <div className="flex gap-2">
                    {/* Time Slots Management */}
                    <div className="flex items-center gap-2">
                      {!isAddingTimeSlot ? (
                        <button
                          onClick={() => setIsAddingTimeSlot(true)}
                          className="bg-mint-500 hover:bg-mint-600 text-white px-3 py-1.5 rounded-lg flex items-center gap-1 text-sm"
                        >
                          <Plus className="w-4 h-4" />
                          Add Time Slot
                        </button>
                      ) : (
                        <div className="flex items-center gap-2 bg-mint-50 p-2 rounded-lg">
                          <div className="grid grid-cols-2 gap-2">
                            <input
                              type="time"
                              value={newTimeSlot.startTime}
                              onChange={(e) => setNewTimeSlot(prev => ({ ...prev, startTime: e.target.value }))}
                              className="px-2 py-1 text-sm border border-mint-300 rounded focus:outline-none focus:border-mint-500"
                            />
                            <input
                              type="time"
                              value={newTimeSlot.endTime}
                              onChange={(e) => setNewTimeSlot(prev => ({ ...prev, endTime: e.target.value }))}
                              className="px-2 py-1 text-sm border border-mint-300 rounded focus:outline-none focus:border-mint-500"
                            />
                          </div>
                          <div className="flex gap-1">
                            <button
                              onClick={addTimeSlot}
                              className="bg-mint-500 hover:bg-mint-600 text-white p-1 rounded"
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setIsAddingTimeSlot(false)}
                              className="bg-gray-200 hover:bg-gray-300 p-1 rounded"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    <button
                      onClick={() => {
                        if (confirm('Clear entire timetable?')) {
                          const emptyTimetable = initializeTimetable();
                          setTimetable(emptyTimetable);
                        }
                      }}
                      className="bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 rounded-lg text-sm flex items-center gap-1"
                    >
                      <RotateCcw className="w-4 h-4" />
                      Clear All
                    </button>
                  </div>
                </div>

                {/* Current Time Slots */}
                <div className="mt-3 pt-3 border-t border-gray-200">
                  <h4 className="text-sm font-medium text-gray-700 mb-2">Current Time Slots:</h4>
                  <div className="flex flex-wrap gap-2">
                    {timeSlots.map((slot) => (
                      <div key={slot.id} className="flex items-center gap-2 px-3 py-1 border border-gray-300 rounded-full bg-white">
                        <Clock className="w-3 h-3 text-gray-500" />
                        <span className="text-sm font-mono">
                          {slot.startTime}-{slot.endTime}
                        </span>
                        {timeSlots.length > 1 && (
                          <button
                            onClick={() => deleteTimeSlot(slot.id)}
                            className="text-red-500 hover:bg-red-100 rounded-full p-1"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}