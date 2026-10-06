"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";

export default function Logo({ height = 40, className = "" }) {
    const [imgError, setImgError] = useState(false);

    if (imgError) {
        return (
            <Link href="/" className={`flex items-center select-none ${className}`}>
                <div
                    style={{ width: height, height }}
                    className="flex items-center justify-center rounded-xl bg-blue-600 font-bold text-white"
                >
                    S
                </div>
            </Link>
        );
    }

    return (
        <Link href="/" className={`flex items-center select-none ${className}`}>
            <Image
                src="/Logo.png"
                alt="Shatarupax AI Labs"
                width={200}
                height={200}
                priority
                onError={() => setImgError(true)}
                style={{ height, width: "auto" }}
                className="object-contain"
            />
        </Link>
    );
}