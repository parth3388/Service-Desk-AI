"use client";

import { useState } from "react";
import Sidebar from "./Sidebar";
import Navbar from "./Navbar";
import { useAuth } from "../context/AuthContext";

export default function DashboardLayout({

    children,

    title

}) {

    const {

        user

    } = useAuth();

    const [sidebarOpen, setSidebarOpen] = useState(false);

    return (

        <div className="min-h-screen bg-slate-100">

            {/* Sidebar */}

            <Sidebar

                user={user}

                isOpen={sidebarOpen}

                onClose={() => setSidebarOpen(false)}

            />

            {/* Main Content */}

            <div className="min-h-screen">

                {/* Fixed Navbar */}

                <Navbar

                    title={title}

                    user={user}

                    onMenuClick={() => setSidebarOpen((prev) => !prev)}

                />

                {/* Page Content */}

                <main className="pt-28 px-8 pb-8 min-h-screen overflow-x-auto">

                    {children}

                </main>

            </div>

        </div>

    );

}