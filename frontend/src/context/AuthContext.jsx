"use client";

import {
    createContext,
    useContext,
    useEffect,
    useState
} from "react";

import api from "../services/api";
import { isAuthFailure } from "../lib/apiError.mjs";

const AuthContext = createContext(null);


export function AuthProvider({ children }) {

    const [user, setUser] = useState(null);

    const [loading, setLoading] = useState(true);


    /*
    |--------------------------------------------------------------------------
    | Restore User Session
    |--------------------------------------------------------------------------
    */

    useEffect(() => {

        async function restoreSession() {

            try {

                const token = localStorage.getItem("token");

                if (!token) {
                    setLoading(false);
                    return;
                }

                const response = await api.get("/auth/profile");

                setUser(response.data.user);

            }

            catch (error) {

                if (isAuthFailure(error)) {

                    // The server said the session is bad (expired / deactivated).
                    localStorage.removeItem("token");
                    localStorage.removeItem("user");

                    setUser(null);

                }

                else {

                    // Network error, timeout or 5xx: the token may well be fine,
                    // so don't log the user out. Fall back to the cached profile
                    // saved at login; pages surface their own API errors.
                    try {

                        const cached = localStorage.getItem("user");

                        setUser(cached ? JSON.parse(cached) : null);

                    }

                    catch {

                        setUser(null);

                    }

                }

            }

            finally {

                setLoading(false);

            }

        }

        restoreSession();

    }, []);


    /*
    |--------------------------------------------------------------------------
    | Login
    |--------------------------------------------------------------------------
    */

    const login = (token, userData) => {

        localStorage.setItem(
            "token",
            token
        );

        localStorage.setItem(
            "user",
            JSON.stringify(userData)
        );

        setUser(userData);

    };


    /*
    |--------------------------------------------------------------------------
    | Logout
    |--------------------------------------------------------------------------
    */

    const logout = () => {

        localStorage.removeItem("token");

        localStorage.removeItem("user");

        setUser(null);

        window.location.href = "/login";

    };


    /*
    |--------------------------------------------------------------------------
    | Context Value
    |--------------------------------------------------------------------------
    */

    const value = {

        user,

        loading,

        login,

        logout,

        isAuthenticated: !!user,

        isManager:
            user?.role === "manager",

        isEmployee:
            user?.role === "employee"

    };


    return (

        <AuthContext.Provider value={value}>

            {children}

        </AuthContext.Provider>

    );

}


/*
|--------------------------------------------------------------------------
| Custom Hook
|--------------------------------------------------------------------------
*/

export function useAuth() {

    const context = useContext(AuthContext);

    if (!context) {

        throw new Error(
            "useAuth must be used inside AuthProvider."
        );

    }

    return context;

}