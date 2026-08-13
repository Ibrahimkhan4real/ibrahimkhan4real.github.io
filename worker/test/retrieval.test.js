import test from "node:test";
import assert from "node:assert/strict";

import {
  detectIntents,
  freshContentToChunks,
  retrieveChunks,
} from "../src/retrieval.js";

const chunks = [
  {
    id: "profile-about",
    title: "About",
    text: "Ibrahim researches Monte Carlo Tree Search for predictive energy control.",
    source: "index.html",
  },
  {
    id: "profile-education",
    title: "Education",
    text: "PhD in Reinforcement Learning. Expected completion March 2028.",
    source: "index.html",
  },
  {
    id: "profile-contact",
    title: "Contact",
    text: "Email Ibrahim at khanm442@uni.coventry.ac.uk.",
    source: "index.html",
  },
  {
    id: "current-status",
    title: "Current status",
    text: "Old current work.",
    source: "_data/now.yml",
  },
];

const freshFeed = {
  live: {
    updated: "August 2026",
    content: "Working on smarter energy control and more reliable reinforcement learning.",
    projects: [],
  },
  posts: [
    {
      title: "Some projects I have made public",
      date: "2026-08-13T00:00:00+01:00",
      url: "https://example.com/projects/",
      content: "Public projects include RL for HVAC and an MCTS Tic-Tac-Toe game.",
    },
    {
      title: "An older research note",
      date: "2025-11-09T00:00:00+00:00",
      url: "https://example.com/older/",
      content: "A note about heat pump control.",
    },
  ],
};

test("detects common first-person PhD questions", () => {
  assert.ok(detectIntents("When will I graduate?").has("graduation"));
  assert.ok(detectIntents("What is my PhD about?").has("research-topic"));
});

test("pins education for a graduation question", () => {
  const results = retrieveChunks("When will I graduate?", [], chunks, 3);
  assert.equal(results[0].id, "profile-education");
});

test("pins both profile topic chunks for a research question", () => {
  const results = retrieveChunks("What is my research topic?", [], chunks, 3);
  assert.deepEqual(results.slice(0, 2).map((chunk) => chunk.id), [
    "profile-about",
    "profile-education",
  ]);
});

test("prefers the fresh Live update", () => {
  const fresh = freshContentToChunks(freshFeed);
  const results = retrieveChunks("What are you working on right now?", [], [...chunks, ...fresh], 3);
  assert.equal(results[0].id, "fresh-current-status");
  assert.match(results[0].text, /more reliable reinforcement learning/);
});

test("selects the newest blog post and searches its content", () => {
  const fresh = freshContentToChunks(freshFeed);
  const latest = retrieveChunks("What is your latest blog post about?", [], [...chunks, ...fresh], 3);
  assert.equal(latest[0].title, "Some projects I have made public");
  assert.equal(latest.length, 1);
  assert.match(latest[0].text, /latest Blog post.*Some projects I have made public/);

  const specific = retrieveChunks("Which blog mentions Tic-Tac-Toe?", [], [...chunks, ...fresh], 3);
  assert.equal(specific[0].title, "Some projects I have made public");
});

test("uses dates in filenames when old index chunks have no date field", () => {
  const oldIndexBlogs = [
    {
      id: "legacy-blog",
      title: "Welcome",
      source: "blog/posts/welcome-to-the-blog.md",
      text: "Welcome.",
    },
    {
      id: "dated-blog",
      title: "Research update",
      source: "_posts/2025-11-09-test-post.md",
      text: "Research update.",
    },
  ];

  const results = retrieveChunks("What is the latest blog post?", [], oldIndexBlogs, 1);
  assert.equal(results[0].id, "dated-blog");
});
