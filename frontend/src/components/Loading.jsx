"use client";



export default function Loading({
    text = "Loading...",
    fullScreen = true,
    size = "md",
}) {
    const sizes = {
        sm: { spinner: "h-6 w-6 border-2", text: "text-sm" },
        md: { spinner: "h-10 w-10 border-[3px]", text: "text-base" },
        lg: { spinner: "h-14 w-14 border-4", text: "text-lg" },
    };

    const selectedSize = sizes[size] || sizes.md;

    const content = (
        <div className="flex flex-col items-center justify-center gap-4">
            <div
                className={`${selectedSize.spinner} animate-spin rounded-full border-slate-200 border-t-blue-600`}
                role="status"
                aria-label="Loading"
            />
            {text && (
                <p className={`${selectedSize.text} font-medium text-slate-500`}>
                    {text}
                </p>
            )}
        </div>
    );

    if (fullScreen) {
        return (
            <div className="flex min-h-screen w-full items-center justify-center bg-slate-100">
                {content}
            </div>
        );
    }

    return (
        <div className="flex w-full items-center justify-center py-12">
            {content}
        </div>
    );
}