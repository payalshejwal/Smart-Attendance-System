import { Suspense } from "react";
import StudentContent from "@/app/student/StudentContent";

export default function StudentPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-mint-100 via-emerald-100 to-teal-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600 mx-auto"></div>
          <p className="mt-4 text-emerald-700">Loading student dashboard...</p>
        </div>
      </div>
    }>
      <StudentContent />
    </Suspense>
  );
}