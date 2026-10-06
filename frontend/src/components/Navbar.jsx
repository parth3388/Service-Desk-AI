"use client";

import { useState } from "react";
import { FiUser, FiMenu } from "react-icons/fi";
import ProfileModal from "./ProfileModal";
import Logo from "./Logo";

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

            <header className="fixed left-0 right-0 top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white px-8 py-5 shadow-md">

                {/* Left */}

                <div className="flex items-center gap-5">

                    <button

                        onClick={onMenuClick}

                        className="rounded-lg p-2 text-slate-600 transition hover:bg-slate-100"

                        aria-label="Toggle menu"

                    >

                        <FiMenu size={24} />

                    </button>

                    <Logo height={44} />

                    <div className="hidden h-10 w-px bg-slate-200 sm:block" />

                    <div>

                        <h1 className="text-3xl font-bold text-slate-800">

                            {title}

                        </h1>

                        <p className="mt-1 text-sm text-slate-500">

                            {today}

                        </p>

                    </div>

                </div>

                {/* Right */}

                <div className="flex items-center gap-4">

                    <div className="text-right">

                        <h2 className="font-semibold text-slate-800">

                            {user?.full_name}

                        </h2>

                        <span className="inline-flex rounded-full bg-blue-100 px-3 py-1 text-xs font-medium capitalize text-blue-700">

                            {user?.role}

                        </span>

                    </div>

                    <button

                        onClick={() => setProfileOpen(true)}

                        className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-800 text-white shadow transition hover:bg-slate-700"

                        aria-label="Open profile"

                    >

                        <FiUser size={22} />

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