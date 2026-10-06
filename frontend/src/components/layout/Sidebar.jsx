"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import {
  MdDashboard,
  MdUploadFile,
  MdDescription,
  MdAnalytics,
  MdPerson,
  MdLogout,
} from "react-icons/md";

const menuItems = [
  {
    name: "Dashboard",
    icon: MdDashboard,
    href: "/dashboard",
  },
  {
    name: "Upload Call",
    icon: MdUploadFile,
    href: "/upload",
  },
  {
    name: "Reports",
    icon: MdDescription,
    href: "/reports",
  },
  {
    name: "Analytics",
    icon: MdAnalytics,
    href: "/analytics",
  },
  {
    name: "Profile",
    icon: MdPerson,
    href: "/profile",
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = () => {
    localStorage.removeItem("token");
    router.replace("/login");
  };

  return (
    <aside className="w-60 min-h-screen bg-slate-900 text-white flex flex-col">

      <div className="p-6 border-b border-slate-800">
        <h1 className="text-2xl font-bold">
          AI Service Desk
        </h1>
      </div>

      <nav className="flex-1 p-4">
        <ul className="space-y-2">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;

            return (
              <li key={item.name}>
                <Link
                  href={item.href}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg transition ${
                    isActive
                      ? "bg-blue-600 text-white"
                      : "hover:bg-slate-800 text-slate-300"
                  }`}
                >
                  <Icon size={22} />
                  <span>{item.name}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="p-4 border-t border-slate-800">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-4 py-3 w-full rounded-lg text-slate-300 hover:bg-red-600 hover:text-white transition duration-200"
        >
          <MdLogout size={22} />
          <span>Logout</span>
        </button>
      </div>

    </aside>
  );
}