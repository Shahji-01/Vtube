/**
 * Integration test — SPA catch-all error path (Task 9.3).
 *
 * Feature: phase-2-quality-hardening
 * Validates: Requirement 2.3
 *
 * The SPA catch-all serves `client/dist/index.html` for any non-API route. When
 * the file-send operation fails, the handler must forward the failure to the
 * global error handler, producing an HTTP 500 Error_Response in the uniform
 * `{ statusCode, success: false, message, errors }` shape whose body excludes
 * file-system paths and the raw underlying error contents.
 *
 * Because `client/dist/index.html` exists in this environment (a normal request
 * would succeed with 200), we simulate the `sendFile` failure by stubbing
 * `express.response.sendFile` to invoke its completion callback with an error
 * carrying a file-system path and raw error text. This exercises the REAL app's
 * catch-all + global error handler.
 *
 * The app runs with NODE_ENV=production so the error handler never attaches a
 * stack trace (which would itself contain file-system paths) — matching the
 * production behavior the requirement guards.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import express from "express";
import { createApp } from "../../app.js";

// A distinctive fake error that includes a file-system path and raw error text.
// Neither substring may appear in the response body.
const FAKE_FS_PATH = "/var/secret/app/client/dist/index.html";
const RAW_ERROR_TEXT = `ENOENT: no such file or directory, open '${FAKE_FS_PATH}'`;

let sendFileSpy;
let originalNodeEnv;

beforeAll(() => {
  originalNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";

  // Force the catch-all's res.sendFile(filePath, callback) to fail by invoking
  // the provided callback with a path/error-bearing Error. Returns `this` to
  // mirror Express's chainable signature.
  sendFileSpy = vi
    .spyOn(express.response, "sendFile")
    .mockImplementation(function mockSendFile(...args) {
      const cb = args.find((arg) => typeof arg === "function");
      if (cb) cb(new Error(RAW_ERROR_TEXT));
      return this;
    });
});

afterAll(() => {
  sendFileSpy?.mockRestore();
  process.env.NODE_ENV = originalNodeEnv;
});

describe("SPA catch-all error path (integration)", () => {
  it("forwards a sendFile failure to a 500 uniform Error_Response without leaking internals", async () => {
    const app = createApp({ env: { NODE_ENV: "production" } });

    const res = await request(app).get("/some/spa/route");

    // HTTP 500 with the uniform Error_Response shape (Req 2.3).
    expect(res.status).toBe(500);
    expect(res.body).toEqual(
      expect.objectContaining({
        statusCode: 500,
        success: false,
        message: expect.any(String),
        errors: expect.any(Array),
      })
    );

    // The error handler confirmed sendFile was actually invoked (and failed).
    expect(sendFileSpy).toHaveBeenCalled();

    // No stack is leaked in production.
    expect(res.body).not.toHaveProperty("stack");

    // The body must exclude file-system paths and raw underlying error contents.
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain(FAKE_FS_PATH);
    expect(serialized).not.toContain("index.html");
    expect(serialized).not.toContain("ENOENT");
    expect(serialized).not.toContain(RAW_ERROR_TEXT);
  });
});
