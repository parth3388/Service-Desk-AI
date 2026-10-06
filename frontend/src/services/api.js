import axios from "axios";

const api = axios.create({
    baseURL:
        process.env.NEXT_PUBLIC_API_URL ||
        "http://127.0.0.1:8000",

    timeout: 30000,

    headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
    },
});


/*
|--------------------------------------------------------------------------
| Request Interceptor
|--------------------------------------------------------------------------
*/

api.interceptors.request.use(

    (config) => {

        if (typeof window !== "undefined") {

            const token = localStorage.getItem("token");

            if (token) {
                config.headers.Authorization = `Bearer ${token}`;
            }

        }

        return config;
    },

    (error) => Promise.reject(error)

);


/*
|--------------------------------------------------------------------------
| Response Interceptor
|--------------------------------------------------------------------------
*/

api.interceptors.response.use(

    (response) => response,

    (error) => {

        // If the FAILED request was the login request itself, don't
        // force-redirect — just let the LoginPage show the error message
        // (e.g. "Invalid email or password", "Please verify your email").
        // Without this check, a wrong password on the login page would
        // immediately reload the page to /login, wiping the error out
        // before the user could ever read it.
        const isLoginRequest =
            error.config &&
            error.config.url &&
            error.config.url.includes("/auth/login");

        if (
            error.response &&
            error.response.status === 401 &&
            !isLoginRequest
        ) {

            if (typeof window !== "undefined") {

                localStorage.removeItem("token");
                localStorage.removeItem("user");

                window.location.href = "/login";
            }
        }

        return Promise.reject(error);
    }

);


export default api;