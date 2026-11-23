import { test } from "node:test";
import assert from "node:assert/strict";

import { notesHash, parseRoute, questionsHash, sectionOf } from "./router.js";

test("parses the public site's routes", () => {
  assert.deepEqual(parseRoute(""), { name: "home" });
  assert.deepEqual(parseRoute("#/"), { name: "home" });
  assert.deepEqual(parseRoute("#/random"), { name: "random" });
  assert.deepEqual(parseRoute("#/notes"), { name: "notes", topic: null });
  assert.deepEqual(parseRoute("#/notes/reliability"), { name: "notes", topic: "reliability" });
  assert.deepEqual(parseRoute("#/notes/reliability/cache-aside"), {
    name: "reader",
    topic: "reliability",
    page: "cache-aside",
    anchor: null,
  });
  assert.deepEqual(parseRoute("#/notes/reliability/cache-aside/when-to-use"), {
    name: "reader",
    topic: "reliability",
    page: "cache-aside",
    anchor: "when-to-use",
  });
  assert.deepEqual(parseRoute("#/questions"), { name: "questions", topic: null });
  assert.deepEqual(parseRoute("#/questions/java"), { name: "questions", topic: "java" });
  assert.deepEqual(parseRoute("#REL-CA-002"), { name: "card", id: "REL-CA-002" });
});

test("accepts the full app's routes used by rendered pages and old links", () => {
  assert.deepEqual(parseRoute("#/learn/java/streams"), { name: "reader", topic: "java", page: "streams", anchor: null });
  assert.deepEqual(parseRoute("#/learn"), { name: "notes", topic: null });
  assert.deepEqual(parseRoute("#/practice/java"), { name: "questions", topic: "java" });
  assert.deepEqual(parseRoute("#/practice/all"), { name: "questions", topic: null });
  assert.deepEqual(parseRoute("#/today"), { name: "home" });
  assert.deepEqual(parseRoute("#/settings"), { name: "home" });
  assert.deepEqual(parseRoute("#/notes/%E0%A4%A"), { name: "home" });
});

test("highlights the matching tab", () => {
  assert.equal(sectionOf({ name: "reader" }), "notes");
  assert.equal(sectionOf({ name: "card" }), "questions");
  assert.equal(sectionOf({ name: "random" }), "random");
  assert.equal(sectionOf({ name: "home" }), "home");
});

test("builds hashes that round-trip", () => {
  assert.equal(notesHash("java"), "#/notes/java");
  assert.equal(notesHash("a b", "page", "sec"), "#/notes/a%20b/page/sec");
  assert.deepEqual(parseRoute(notesHash("a b", "page", "sec")), { name: "reader", topic: "a b", page: "page", anchor: "sec" });
  assert.equal(questionsHash(null), "#/questions");
  assert.equal(questionsHash("java"), "#/questions/java");
});
