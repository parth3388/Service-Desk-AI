import test from "node:test";
import assert from "node:assert/strict";

import {
    ALLOWED_AUDIO_EXTENSIONS,
    ALLOWED_AUDIO_LABEL,
    AUDIO_ACCEPT,
    CONTACT_LIMITS,
    MAX_UPLOAD_MB,
    PASSWORD_MAX_BYTES,
    PASSWORD_MIN_LENGTH,
    validateAudioFiles,
    validateContactForm,
    validatePassword
} from "../src/lib/validation.mjs";

const file = (name, size = 1024) => ({ name, size });

// ---- password -------------------------------------------------------------

test("password policy constants match the backend (min 8, max 72 bytes)", () => {
    assert.equal(PASSWORD_MIN_LENGTH, 8);
    assert.equal(PASSWORD_MAX_BYTES, 72);
});

test("valid passwords are accepted", () => {
    assert.equal(validatePassword("a".repeat(8)), null);
    assert.equal(validatePassword("a".repeat(72)), null);
    assert.equal(validatePassword("Str0ng&Secret!"), null);
});

test("invalid passwords are rejected with a message", () => {
    for (const bad of ["", "        ", "short", "1234567", "a".repeat(73), "é".repeat(37), "a".repeat(100000), null, undefined]) {
        const error = validatePassword(bad);
        assert.equal(typeof error, "string", JSON.stringify(String(bad).slice(0, 12)));
    }
});

// ---- audio ------------------------------------------------------------------

test("the advertised formats are exactly what the backend accepts", () => {
    assert.deepEqual(ALLOWED_AUDIO_EXTENSIONS, [".mp3", ".wav", ".aac", ".m4a"]);
    assert.equal(ALLOWED_AUDIO_LABEL, "MP3, WAV, AAC, M4A");
    assert.equal(MAX_UPLOAD_MB, 100);
});

test("OGG and FLAC are not advertised anywhere", () => {
    assert.doesNotMatch(AUDIO_ACCEPT.toLowerCase(), /ogg|flac/);
    assert.doesNotMatch(ALLOWED_AUDIO_LABEL.toLowerCase(), /ogg|flac/);
    assert.ok(!AUDIO_ACCEPT.includes("audio/*"));
});

test("supported files pass, case-insensitively", () => {
    const { valid, errors } = validateAudioFiles([file("a.mp3"), file("B.WAV"), file("c.Aac"), file("d.m4a")]);

    assert.equal(valid.length, 4);
    assert.deepEqual(errors, []);
});

test("unsupported, empty and oversized files are reported and excluded", () => {
    const { valid, errors } = validateAudioFiles([
        file("ok.wav"),
        file("song.ogg"),
        file("song.flac"),
        file("noext"),
        file("empty.mp3", 0),
        file("huge.wav", MAX_UPLOAD_MB * 1024 * 1024 + 1)
    ]);

    assert.deepEqual(valid.map((f) => f.name), ["ok.wav"]);
    assert.equal(errors.length, 5);
    assert.match(errors[0], /song\.ogg: unsupported format/);
    assert.match(errors[3], /empty/);
    assert.match(errors[4], /too large/);
});

test("a file exactly at the size limit is accepted", () => {
    const { valid } = validateAudioFiles([file("edge.wav", MAX_UPLOAD_MB * 1024 * 1024)]);

    assert.equal(valid.length, 1);
});

test("an empty selection is handled", () => {
    assert.deepEqual(validateAudioFiles([]), { valid: [], errors: [] });
    assert.deepEqual(validateAudioFiles(undefined), { valid: [], errors: [] });
});

// ---- contact ----------------------------------------------------------------

const goodForm = { name: "Ann", email: "ann@example.com", phone: "", company: "", interest: "", message: "Hello" };

test("contact limits mirror the backend schema", () => {
    assert.deepEqual(CONTACT_LIMITS, { name: 100, phone: 30, company: 150, interest: 100, message: 5000 });
});

test("a valid contact form has no errors", () => {
    assert.deepEqual(validateContactForm(goodForm), {});
});

test("contact form catches what the backend would 422 on", () => {
    assert.ok(validateContactForm({ ...goodForm, name: "  " }).name);
    assert.ok(validateContactForm({ ...goodForm, email: "" }).email);
    assert.ok(validateContactForm({ ...goodForm, email: "a@b" }).email);       // passes <input type=email>, fails the server
    assert.ok(validateContactForm({ ...goodForm, message: "" }).message);
    assert.ok(validateContactForm({ ...goodForm, message: "x".repeat(5001) }).message);
    assert.ok(validateContactForm({ ...goodForm, name: "n".repeat(101) }).name);
    assert.ok(validateContactForm({ ...goodForm, phone: "1".repeat(31) }).phone);
    assert.ok(validateContactForm({ ...goodForm, company: "c".repeat(151) }).company);
    assert.ok(validateContactForm({ ...goodForm, interest: "i".repeat(101) }).interest);
});

test("contact form accepts values at the limits", () => {
    const form = { ...goodForm, name: "n".repeat(100), message: "m".repeat(5000), phone: "1".repeat(30) };

    assert.deepEqual(validateContactForm(form), {});
});
