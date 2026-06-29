/**
 * phase4Schemas.smoke.test.js — Schema-declaration smoke tests for the Phase 4
 * additive model fields (Task 11.2).
 *
 * Validates: Requirements 2.1, 3.1, 4.4, 4.6
 *
 * These tests introspect the imported Mongoose models' compiled `.schema`
 * (paths + declared indexes) and instantiate documents to read field defaults.
 * No database connection is required: importing a model only registers it with
 * Mongoose and building `new Model()` applies defaults in-memory.
 *
 * Asserts:
 *  - Video schema declares the `{ title: "text", description: "text" }` text
 *    index (R2.1) and an `isHidden` path defaulting to false (R4.6).
 *  - Comment schema has `pinned` (default false), `pinnedAt` (default null), and
 *    `isHidden` (default false) paths (R3.1).
 *  - User schema has a `role` path with enum ["user","moderator","admin"] and
 *    default "user" (R4.4).
 */

import { describe, it, expect } from "vitest";
import { Video } from "../../models/video.model.js";
import { Comment } from "../../models/comment.model.js";
import { User } from "../../models/user.model.js";

describe("Phase 4 schema declarations — Video (R2.1, R4.6)", () => {
  it("declares the { title: 'text', description: 'text' } text index", () => {
    const indexes = Video.schema.indexes();
    // Each entry is [keys, options]; find the index whose keys mark both
    // title and description as text fields.
    const textIndex = indexes.find(
      ([keys]) => keys.title === "text" && keys.description === "text"
    );
    expect(textIndex).toBeTruthy();
  });

  it("has an isHidden path defaulting to false", () => {
    const path = Video.schema.path("isHidden");
    expect(path).toBeTruthy();
    expect(path.instance).toBe("Boolean");
    // defaultValue may be a function or a literal — assert the resolved default.
    expect(new Video().isHidden).toBe(false);
  });
});

describe("Phase 4 schema declarations — Comment (R3.1)", () => {
  it("has a pinned path defaulting to false", () => {
    const path = Comment.schema.path("pinned");
    expect(path).toBeTruthy();
    expect(path.instance).toBe("Boolean");
    expect(new Comment().pinned).toBe(false);
  });

  it("has a pinnedAt path defaulting to null", () => {
    const path = Comment.schema.path("pinnedAt");
    expect(path).toBeTruthy();
    expect(path.instance).toBe("Date");
    expect(new Comment().pinnedAt).toBeNull();
  });

  it("has an isHidden path defaulting to false", () => {
    const path = Comment.schema.path("isHidden");
    expect(path).toBeTruthy();
    expect(path.instance).toBe("Boolean");
    expect(new Comment().isHidden).toBe(false);
  });
});

describe("Phase 4 schema declarations — User (R4.4)", () => {
  it("has a role path with enum ['user','moderator','admin']", () => {
    const path = User.schema.path("role");
    expect(path).toBeTruthy();
    expect(path.instance).toBe("String");
    expect(path.enumValues).toEqual(["user", "moderator", "admin"]);
  });

  it("defaults role to 'user'", () => {
    expect(new User().role).toBe("user");
  });
});
