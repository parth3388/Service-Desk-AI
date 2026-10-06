import test from "node:test";
import assert from "node:assert/strict";

import { getErrorMessage, isAuthFailure, normalizeApiDetail } from "../src/lib/apiError.mjs";

// The exact body FastAPI/Pydantic v2 returns for POST /contact with a bad email.
const CONTACT_422 = {
    detail: [
        {
            type: "value_error",
            loc: ["body", "email"],
            msg: "value is not a valid email address: An email address must have an @-sign.",
            input: "nope",
            ctx: { reason: "An email address must have an @-sign." }
        }
    ]
};

const axiosError = (status, data) => ({ isAxiosError: true, response: { status, data } });

test("a 422 validation array becomes a plain string (no React crash)", () => {
    const message = getErrorMessage(axiosError(422, CONTACT_422), "fallback");

    assert.equal(typeof message, "string");
    assert.match(message, /^email: value is not a valid email address/);
});

test("multiple validation errors are joined into one readable string", () => {
    const message = normalizeApiDetail([
        { loc: ["body", "name"], msg: "String should have at least 1 character" },
        { loc: ["body", "message"], msg: "String should have at most 5000 characters" }
    ]);

    assert.equal(typeof message, "string");
    assert.match(message, /name: String should have at least 1 character/);
    assert.match(message, /message: String should have at most 5000 characters/);
});

test("Pydantic 'Value error, ' prefixes are stripped (password policy messages)", () => {
    const message = normalizeApiDetail([
        { loc: ["body", "password"], msg: "Value error, Password must be at least 8 characters long." }
    ]);

    assert.equal(message, "password: Password must be at least 8 characters long.");
});

test("string details pass through unchanged", () => {
    assert.equal(getErrorMessage(axiosError(400, { detail: "Email already registered." })), "Email already registered.");
    assert.equal(
        getErrorMessage(axiosError(429, { detail: "Too many requests. Please try again in 30 seconds." })),
        "Too many requests. Please try again in 30 seconds."
    );
});

test("every shape of detail yields a string", () => {
    for (const detail of [undefined, null, 5, true, {}, [], [null], [{}], [{ msg: "" }], { msg: 5 }, "", "   "]) {
        const message = normalizeApiDetail(detail, "fallback");
        assert.equal(typeof message, "string", JSON.stringify(detail));
        assert.ok(message.length > 0);
    }
});

test("object details use msg / message", () => {
    assert.equal(normalizeApiDetail({ msg: "bad thing" }), "bad thing");
    assert.equal(normalizeApiDetail({ message: "other thing" }), "other thing");
});

test("no response: timeouts and network failures get specific messages", () => {
    assert.match(getErrorMessage({ isAxiosError: true, code: "ECONNABORTED" }), /timed out/);
    assert.match(getErrorMessage({ isAxiosError: true, request: {} }), /Unable to reach the server/);
});

test("fallback is used for empty errors and for blob bodies", () => {
    assert.equal(getErrorMessage(undefined, "fallback"), "fallback");
    assert.equal(getErrorMessage(axiosError(404, new Blob(["x"])), "fallback"), "fallback");
});

test("isAuthFailure is true only for 401/403, never for network or server errors", () => {
    assert.equal(isAuthFailure(axiosError(401, {})), true);
    assert.equal(isAuthFailure(axiosError(403, {})), true);
    assert.equal(isAuthFailure(axiosError(500, {})), false);
    assert.equal(isAuthFailure(axiosError(502, {})), false);
    assert.equal(isAuthFailure(axiosError(422, {})), false);
    assert.equal(isAuthFailure({ isAxiosError: true, request: {} }), false);
    assert.equal(isAuthFailure({ isAxiosError: true, code: "ECONNABORTED" }), false);
    assert.equal(isAuthFailure(undefined), false);
});
