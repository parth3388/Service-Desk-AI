"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import {
    FiHome,
    FiUpload,
    FiFileText,
    FiUsers,
    FiLogOut,
    FiX,
    FiUser
} from "react-icons/fi";

import { useAuth } from "../context/AuthContext";

export default function Sidebar({ user, isOpen, onClose }) {

    const pathname = usePathname();

    const router = useRouter();

    const { logout } = useAuth();

    const employeeMenu = [

        {
            name: "Dashboard",
            href: "/employee/dashboard",
            icon: <FiHome size={20} />
        },

        {
            name: "Upload & Analyze",
            href: "/employee/upload",
            icon: <FiUpload size={20} />
        },

        {
            name: "Reports",
            href: "/employee/reports",
            icon: <FiFileText size={20} />
        },

        {
            name: "Profile",
            href: "/profile",
            icon: <FiUser size={20} />
        }

    ];

    const managerMenu = [

        {
            name: "Dashboard",
            href: "/manager/dashboard",
            icon: <FiHome size={20} />
        },

        {
            name: "Employee Performance",
            href: "/manager/employees",
            icon: <FiUsers size={20} />
        },

        {
            name: "Company Reports",
            href: "/manager/reports",
            icon: <FiFileText size={20} />
        },

        {
            name: "Profile",
            href: "/profile",
            icon: <FiUser size={20} />
        }

    ];

    const menu =
        user?.role === "manager"
            ? managerMenu
            : employeeMenu;

    const handleLogout = () => {

        logout();

        router.replace("/login");

    };

    return (

        <>

            {/* Mobile overlay */}
            {

                isOpen && (

                    <div

                        onClick={onClose}

                        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm transition-opacity lg:hidden"

                    />

                )

            }

            <aside

                className={`fixed left-0 top-0 z-50 flex h-screen w-64 flex-col border-r border-slate-200 bg-white text-slate-700 shadow-xl transition-transform duration-300 ease-in-out
                lg:translate-x-0 lg:shadow-none
                ${isOpen ? "translate-x-0" : "-translate-x-full"}`}

            >

                {/* Logo */}

                <div className="flex items-center justify-between border-b border-slate-100 px-5 py-6">

                    <div className="flex items-center gap-2 select-none">

                        <Image
                            src="/logo-app.png"
                            alt="ShatarupaX"
                            width={624}
                            height={136}
                            priority
                            style={{ height: 32, width: "auto" }}
                            className="object-contain"
                        />

                    </div>

                    <button

                        onClick={onClose}

                        className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 lg:hidden"

                        aria-label="Close menu"

                    >

                        <FiX size={20} />

                    </button>

                </div>

                {/* Menu */}

                <nav className="flex-1 space-y-1.5 px-4 pt-6">

                    {

                        menu.map((item) => {

                            const active = pathname === item.href;

                            return (

                                <Link

                                    key={item.href}

                                    href={item.href}

                                    onClick={onClose}

                                    className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm transition-all duration-200
                                    ${
                                        active

                                            ? "bg-gradient-to-r from-blue-600 to-violet-600 font-semibold text-white shadow-md shadow-blue-600/20"

                                            : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                                    }`}

                                >

                                    <span className={active ? "text-white" : "text-slate-400"}>
                                        {item.icon}
                                    </span>

                                    <span>

                                        {item.name}

                                    </span>

                                </Link>

                            );

                        })

                    }

                </nav>

                {/* User + Logout */}

                <div className="border-t border-slate-100 p-4">

                    {
                        user && (
                            <div className="mb-3 flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2.5">
                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-violet-600 text-xs font-bold text-white">
                                    {
                                        user.full_name
                                            ?.split(" ")
                                            .map((w) => w[0])
                                            .slice(0, 2)
                                            .join("")
                                            .toUpperCase() || "?"
                                    }
                                </span>
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-semibold text-slate-800">
                                        {user.full_name}
                                    </p>
                                    <p className="text-xs text-slate-400 capitalize">
                                        {user.role}
                                    </p>
                                </div>
                            </div>
                        )
                    }

                    <button

                        onClick={handleLogout}

                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-50 py-3 text-sm font-semibold text-red-600 transition hover:bg-red-100"

                    >

                        <FiLogOut size={18} />

                        Logout

                    </button>

                </div>

            </aside>

        </>

    );

}
