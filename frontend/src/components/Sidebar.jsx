"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import {
    FiHome,
    FiUpload,
    FiFileText,
    FiUsers,
    FiLogOut,
    FiX,
    FiBarChart2
} from "react-icons/fi";

import Logo from "./Logo";
import { useAuth } from "../context/AuthContext";

export default function Sidebar({ user, isOpen, onClose }) {

    const pathname = usePathname();

    const router = useRouter();

    const { logout } = useAuth();

    const employeeMenu = [

        {
            name: "Call Audio",
            href: "/employee/dashboard",
            icon: <FiHome size={20} />
        },

        {
            name: "Uploaded Files",
            href: "/employee/upload",
            icon: <FiUpload size={20} />
        },

        {
            name: "Reports",
            href: "/employee/reports",
            icon: <FiFileText size={20} />
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
            name: "QA Calibration",
            href: "/manager/qa-calibration",
            icon: <FiBarChart2 size={20} />
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

            {

                isOpen && (

                    <div

                        onClick={onClose}

                        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm transition-opacity"

                    />

                )

            }

            <aside

                className={`fixed left-0 top-0 z-50 flex h-screen w-64 flex-col bg-slate-900 text-white shadow-2xl transition-transform duration-300 ease-in-out

                ${isOpen ? "translate-x-0" : "-translate-x-full"}`}

            >

                {/* Logo */}

                <div className="flex items-center justify-between border-b border-slate-700 p-6">

                    <div className="flex items-center gap-3 select-none">

                        <Logo height={36} />

                        <div className="leading-tight">

                            <p className="text-sm font-bold text-white">
                                Shatarupax
                            </p>

                            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                                AI Labs
                            </p>

                        </div>

                    </div>

                    <button

                        onClick={onClose}

                        className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-white"

                        aria-label="Close menu"

                    >

                        <FiX size={20} />

                    </button>

                </div>

                {/* Menu */}

                <div className="px-6 pt-6">

                    <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-500">

                        {user?.role === "manager"

                            ? "Manager Panel"

                            : "Employee Panel"}

                    </p>

                </div>

                <nav className="flex-1 px-4">

                    {

                        menu.map((item) => (

                            <Link

                                key={item.href}

                                href={item.href}

                                onClick={onClose}

                                className={`mb-2 flex items-center gap-3 rounded-xl px-4 py-3 transition-all duration-200

                                ${
                                    pathname === item.href

                                        ? "bg-blue-600 font-semibold text-white shadow-lg"

                                        : "text-slate-300 hover:bg-slate-800 hover:text-white"
                                }`}

                            >

                                {item.icon}

                                <span>

                                    {item.name}

                                </span>

                            </Link>

                        ))

                    }

                </nav>

                {/* User */}

                <div className="border-t border-slate-700 p-5">

                    <div className="mb-5 rounded-xl bg-slate-800 p-4">

                        <p className="truncate font-semibold">

                            {user?.full_name}

                        </p>

                        <p className="mt-1 text-xs capitalize text-slate-400">

                            {user?.email}

                        </p>

                        <span className="mt-3 inline-block rounded-full bg-blue-600 px-3 py-1 text-xs font-semibold">

                            {user?.role}

                        </span>

                    </div>

                    <button

                        onClick={handleLogout}

                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-600 py-3 font-medium transition hover:bg-red-700"

                    >

                        <FiLogOut size={18} />

                        Logout

                    </button>

                </div>

            </aside>

        </>

    );

}