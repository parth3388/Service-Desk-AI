"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "../context/AuthContext";

export default function ProtectedRoute({

    children,

    requiredRole

}) {

    const router = useRouter();

    const {

        user,

        loading,

        isAuthenticated

    } = useAuth();

    useEffect(() => {

        if (loading) {

            return;

        }

        if (!isAuthenticated) {

            router.replace("/login");

            return;

        }

        if (

            requiredRole &&

            user?.role !== requiredRole

        ) {

            router.replace("/login");

        }

    }, [

        loading,

        isAuthenticated,

        requiredRole,

        router,

        user

    ]);

    if (loading) {

        return (

            <div className="flex h-screen items-center justify-center bg-slate-100">

                <div className="text-lg font-semibold">

                    Loading...

                </div>

            </div>

        );

    }

    if (!isAuthenticated) {

        return null;

    }

    if (

        requiredRole &&

        user?.role !== requiredRole

    ) {

        return null;

    }

    return children;

}