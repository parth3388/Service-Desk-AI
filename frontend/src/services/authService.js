import api from "./api";


/*
|--------------------------------------------------------------------------
| Authentication APIs
|--------------------------------------------------------------------------
*/


export const loginUser = async (credentials) => {

    const response = await api.post(
        "/auth/login",
        credentials,
        {
            headers: {
                "Content-Type":
                    "application/x-www-form-urlencoded",
            },
        }
    );

    return response.data;

};


export const registerUser = async (userData) => {

    const response = await api.post(
        "/auth/register",
        userData
    );

    return response.data;

};


export const resendVerification = async (email) => {

    const response = await api.post(
        "/auth/resend-verification",
        { email }
    );

    return response.data;

};


export const getProfile = async () => {

    const response = await api.get(
        "/auth/profile"
    );

    return response.data;

};