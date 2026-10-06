"use client";

import { FiX, FiLogOut, FiUser } from "react-icons/fi";
import { useAuth } from "../context/AuthContext";
import { useRouter } from "next/navigation";

export default function ProfileModal({ user, onClose }) {

    const { logout } = useAuth();

    const router = useRouter();

    const nameParts = (user?.full_name || "").trim().split(" ");

    const firstName = nameParts[0] || "";

    const lastName = nameParts.slice(1).join(" ") || "-";

    const handleLogout = () => {

        logout();

        router.replace("/login");

    };

    return (

        <>

            <div

                onClick={onClose}

                className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"

            />

            <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-8 shadow-2xl">

                <div className="mb-6 flex items-start justify-between">

                    <div>

                        <h2 className="text-xl font-bold text-slate-800">

                            My Profile

                        </h2>

                        <p className="mt-1 text-sm text-slate-500">

                            Manage your account information.

                        </p>

                    </div>

                    <button

                        onClick={onClose}

                        className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"

                    >

                        <FiX size={20} />

                    </button>

                </div>

                <div className="flex items-start gap-5">

                    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-slate-800 text-white">

                        <FiUser size={28} />

                    </div>

                    <div className="grid flex-1 grid-cols-2 gap-x-4 gap-y-4">

                        <div>

                            <p className="text-xs text-slate-400">

                                First Name

                            </p>

                            <p className="font-semibold text-slate-800">

                                {firstName}

                            </p>

                        </div>

                        <div>

                            <p className="text-xs text-slate-400">

                                Last Name

                            </p>

                            <p className="font-semibold text-slate-800">

                                {lastName}

                            </p>

                        </div>

                        <div className="col-span-2">

                            <p className="text-xs text-slate-400">

                                Email

                            </p>

                            <p className="font-semibold text-blue-600">

                                {user?.email}

                            </p>

                        </div>

                        <div className="col-span-2">

                            <p className="text-xs text-slate-400">

                                Role

                            </p>

                            <p className="font-semibold capitalize text-slate-800">

                                {user?.role}

                            </p>

                        </div>

                    </div>

                </div>

                <div className="mt-8 flex justify-end border-t border-slate-100 pt-6">

                    <button

                        onClick={handleLogout}

                        className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-5 py-2.5 font-semibold text-red-600 transition hover:bg-red-100"

                    >

                        <FiLogOut size={18} />

                        Log Out

                    </button>

                </div>

            </div>

        </>

    );

}