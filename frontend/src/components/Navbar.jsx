"use client";

import { useState } from "react";
import Image from "next/image";
import { FiUser, FiMenu, FiCalendar, FiChevronDown } from "react-icons/fi";
import ProfileModal from "./ProfileModal";

export default function Navbar({

    title,

    user,

    onMenuClick

}) {

    const [profileOpen, setProfileOpen] = useState(false);

    const today = new Date().toLocaleDateString(

        "en-IN",

        {

            weekday: "long",

            day: "numeric",

            month: "long",

            year: "numeric"

        }

    );

    return (

        <>

            <header className="fixed top-0 right-0 left-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4 shadow-sm lg:left-64 lg:px-8 lg:py-5">

                {/* Left */}

                <div className="flex items-center gap-4">

                    <button

                        onClick={onMenuClick}

                        className="rounded-lg p-2 text-slate-600 transition hover:bg-slate-100 lg:hidden"

                        aria-label="Toggle menu"

                    >

                        <FiMenu size={22} />

                    </button>

                    <div className="lg:hidden">
                        <Image
                            src="/logo-app.png"
                            alt="ShatarupaX"
                            width={624}
                            height={136}
                            style={{ height: 26, width: "auto" }}
                            className="object-contain"
                        />
                    </div>

                    <div className="hidden h-9 w-px bg-slate-200 lg:block" />

                    <div>

                        <h1 className="text-xl font-bold text-slate-800 lg:text-2xl">

                            {title}

                        </h1>

                        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500 lg:text-sm">

                            <FiCalendar size={13} />

                            {today}

                        </p>

                    </div>

                </div>

                {/* Right */}

                <div className="flex items-center gap-3">

                    <div className="hidden text-right sm:block">

                        <h2 className="text-sm font-semibold text-slate-800">

                            {user?.full_name}

                        </h2>

                        <span className="inline-flex rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium capitalize text-blue-700">

                            {user?.role}

                        </span>

                    </div>

                    <button

                        onClick={() => setProfileOpen(true)}

                        className="flex items-center gap-1 rounded-full p-1 text-slate-400 transition hover:bg-slate-100"

                        aria-label="Open profile"

                    >

                        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-800 text-white shadow">

                            <FiUser size={18} />

                        </span>

                        <FiChevronDown size={16} className="hidden sm:block" />

                    </button>

                </div>

            </header>

            {

                profileOpen && (

                    <ProfileModal

                        user={user}

                        onClose={() => setProfileOpen(false)}

                    />

                )

            }

        </>

    );

}
