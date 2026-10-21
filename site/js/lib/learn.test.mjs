import assert from "node:assert/strict";
import { test } from "node:test";

import { indexLearn, isLearned, nextPage, nextToLearn } from "./learn.js";

const data = {
  topics: [
    {
      slug: "a",
      name: "A",
      pages: [
        { path: "wiki/a/one.md", slug: "one", questions: ["A-001"] },
        { path: "wiki/a/two.md", slug: "two", questions: [] },
      ],
    },
    { slug: "b", name: "B", pages: [{ path: "wiki/b/three.md", slug: "three", questions: ["B-001"] }] },
  ],
};

const fakeStore = (learned) => ({ page: (path) => (learned.includes(path) ? { path, learned: 1 } : null) });

test("indexLearn flattens pages in wiki order with their topics", () => {
  const learn = indexLearn(data);
  assert.deepEqual(learn.pages.map((page) => `${page.topic}/${page.slug}`), ["a/one", "a/two", "b/three"]);
  assert.equal(learn.byKey.get("b/three").topicName, "B");
  assert.equal(learn.byPath.get("wiki/a/two.md").slug, "two");
  assert.deepEqual(indexLearn(null).pages, []);
});

test("nextPage continues into the next topic and ends after the last page", () => {
  const learn = indexLearn(data);
  assert.equal(nextPage(learn, learn.byKey.get("a/one")).slug, "two");
  assert.equal(nextPage(learn, learn.byKey.get("a/two")).slug, "three");
  assert.equal(nextPage(learn, learn.byKey.get("b/three")), null);
});

test("nextToLearn skips learned pages and pages without questions", () => {
  const learn = indexLearn(data);
  assert.equal(nextToLearn(learn, fakeStore([])).slug, "one");
  assert.equal(nextToLearn(learn, fakeStore(["wiki/a/one.md"])).slug, "three");
  assert.equal(nextToLearn(learn, fakeStore(["wiki/a/one.md", "wiki/b/three.md"])), null);
  assert.equal(isLearned(fakeStore(["wiki/a/one.md"]), learn.pages[0]), true);
});

test("pageHash builds reader routes", async () => {
  const { pageHash } = await import("./learn.js");
  const learn = indexLearn(data);
  assert.equal(pageHash(learn.pages[0]), "#/learn/a/one");
  assert.equal(pageHash(learn.pages[0], "ttl-semantics"), "#/learn/a/one/ttl-semantics");
});
