"use client";

import {
    FiArrowUpRight
} from "react-icons/fi";

export default function StatCard({

    title,

    value,

    icon,

    color = "blue"

}) {

    const colors = {

        blue: {
            card: "from-blue-50 via-white to-blue-100/60 border-blue-100",
            badge: "bg-gradient-to-br from-blue-500 to-blue-600",
            text: "text-blue-700",
            blob: "bg-blue-300/40"
        },

        green: {
            card: "from-emerald-50 via-white to-emerald-100/60 border-emerald-100",
            badge: "bg-gradient-to-br from-emerald-500 to-emerald-600",
            text: "text-emerald-700",
            blob: "bg-emerald-300/40"
        },

        orange: {
            card: "from-orange-50 via-white to-orange-100/60 border-orange-100",
            badge: "bg-gradient-to-br from-orange-400 to-orange-500",
            text: "text-orange-700",
            blob: "bg-orange-300/40"
        },

        red: {
            card: "from-pink-50 via-white to-pink-100/60 border-pink-100",
            badge: "bg-gradient-to-br from-pink-500 to-rose-500",
            text: "text-pink-700",
            blob: "bg-pink-300/40"
        },

        purple: {
            card: "from-violet-50 via-white to-violet-100/60 border-violet-100",
            badge: "bg-gradient-to-br from-violet-500 to-purple-600",
            text: "text-violet-700",
            blob: "bg-violet-300/40"
        }

    };

    const selectedColor =

        colors[color] || colors.blue;

    return (

        <div className={`relative overflow-hidden rounded-2xl border bg-gradient-to-br p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg ${selectedColor.card}`}>

            <div className={`absolute -top-6 -right-6 h-24 w-24 rounded-full blur-2xl ${selectedColor.blob}`} />

            <div className="relative min-w-0">

                <p className="flex items-start gap-1.5 text-sm font-semibold text-slate-600">

                    <span className={`mt-0.5 shrink-0 ${selectedColor.text}`}>
                        <span className="text-xs">
                            {icon}
                        </span>
                    </span>

                    <span>{title}</span>

                </p>

                <h2 className="mt-3 text-3xl font-extrabold text-slate-900">

                    {value}

                </h2>

            </div>

            <div className={`relative mt-6 flex items-center text-sm font-medium ${selectedColor.text}`}>

                <FiArrowUpRight
                    className="mr-2"
                />

                Live Dashboard Statistics

            </div>

        </div>

    );

}