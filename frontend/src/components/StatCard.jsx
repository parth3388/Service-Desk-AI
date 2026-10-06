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
            background: "bg-blue-100",
            text: "text-blue-700"
        },

        green: {
            background: "bg-green-100",
            text: "text-green-700"
        },

        orange: {
            background: "bg-orange-100",
            text: "text-orange-700"
        },

        red: {
            background: "bg-red-100",
            text: "text-red-700"
        },

        purple: {
            background: "bg-purple-100",
            text: "text-purple-700"
        }

    };

    const selectedColor =

        colors[color] || colors.blue;

    return (

        <div className="rounded-2xl bg-white p-6 shadow-md transition-all duration-300 hover:-translate-y-1 hover:shadow-xl">

            <div className="flex items-start justify-between gap-2">

                <div className="min-w-0 flex-1">

                    <p className="whitespace-nowrap text-sm font-medium text-slate-500">

                        {title}

                    </p>

                    <h2 className="mt-3 text-3xl font-bold text-slate-800">

                        {value}

                    </h2>

                </div>

                <div
                    className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${selectedColor.background}`}
                >

                    <div
                        className={`text-xl ${selectedColor.text}`}
                    >

                        {icon}

                    </div>

                </div>

            </div>

            <div className="mt-6 flex items-center text-sm text-slate-400">

                <FiArrowUpRight
                    className="mr-2"
                />

                Live Dashboard Statistics

            </div>

        </div>

    );

}