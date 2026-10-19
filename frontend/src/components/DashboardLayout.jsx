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

            <div className="min-h-screen lg:pl-64">

                {/* Fixed Navbar */}

                <Navbar

                    title={title}

                    user={user}

                    onMenuClick={() => setSidebarOpen((prev) => !prev)}

                />

                {/* Page Content */}

                <main className="min-h-screen overflow-x-auto px-5 pt-24 pb-8 lg:px-8 lg:pt-28">

                    {children}

                </main>

            </div>

        </div>

    );

}