import DashboardLayout from "@/components/layout/DashboardLayout";

export default function ProfilePage() {
  return (
    <DashboardLayout>

      <div className="mb-8">
        <h1 className="text-4xl font-bold text-slate-900">
          Profile
        </h1>

        <p className="mt-2 text-slate-600">
          Manage your account information and activity.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Profile Card */}

        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm p-8">

          <h2 className="text-2xl font-semibold mb-6">
            Personal Information
          </h2>

          <div className="space-y-6">

            <div>
              <label className="block text-sm text-slate-500 mb-1">
                Full Name
              </label>

              <div className="text-lg font-medium">
                Parth
              </div>
            </div>

            <div>
              <label className="block text-sm text-slate-500 mb-1">
                Email Address
              </label>

              <div className="text-lg font-medium">
                parth@test.com
              </div>
            </div>

            <div>
              <label className="block text-sm text-slate-500 mb-1">
                Role
              </label>

              <div className="text-lg font-medium">
                Administrator
              </div>
            </div>

            <div>
              <label className="block text-sm text-slate-500 mb-1">
                Organization
              </label>

              <div className="text-lg font-medium">
                AI Service Desk
              </div>
            </div>

          </div>

        </div>

        {/* Stats */}

        <div className="space-y-6">

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">

            <p className="text-slate-500 text-sm">
              Total Uploads
            </p>

            <h3 className="text-3xl font-bold mt-2">
              24
            </h3>

          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">

            <p className="text-slate-500 text-sm">
              Reports Generated
            </p>

            <h3 className="text-3xl font-bold mt-2 text-blue-600">
              24
            </h3>

          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">

            <p className="text-slate-500 text-sm">
              Last Activity
            </p>

            <h3 className="text-lg font-semibold mt-2">
              Today
            </h3>

          </div>

        </div>

      </div>

    </DashboardLayout>
  );
}