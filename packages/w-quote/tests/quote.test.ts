import assert from "node:assert/strict";
import test from "node:test";
import { withEllipses } from "../ellipsis.ts";
import { appendQuote, firstLine } from "../quote.ts";

const REPLY = [
	"The detector reads the final reply. source has three producers and zero consumers. Nothing in **Chorus** logs below `Warn`.",
	"",
	"- Keep the cache warm between runs",
	"1. Drop the cache: it costs 2 GiB",
].join("\n");

const quote = (selection: string) => withEllipses(selection, ["An older reply.", REPLY]);

test("a whole sentence, with or without its full stop, needs no ellipsis", () => {
	assert.equal(quote("source has three producers and zero consumers."), "source has three producers and zero consumers.");
	assert.equal(quote("Nothing in Chorus logs below Warn"), "Nothing in Chorus logs below Warn");
});

test("a fragment is marked where it was cut from its sentence", () => {
	assert.equal(quote("source has three producers"), "source has three producers…");
	assert.equal(quote("zero consumers."), "…zero consumers.");
	assert.equal(quote("three producers and"), "…three producers and…");
});

test("a list item or a clause after a colon begins where the quote begins", () => {
	assert.equal(quote("Keep the cache warm"), "Keep the cache warm…");
	assert.equal(quote("it costs 2 GiB"), "it costs 2 GiB");
});

test("markdown in the reply does not hide the match", () => {
	assert.equal(quote("in Chorus logs below Warn."), "…in Chorus logs below Warn.");
});

test("text found in no reply is quoted exactly as highlighted", () => {
	assert.equal(withEllipses("cargo build failed", [REPLY]), "cargo build failed");
});

test("into an empty editor the quote comes first, with a blank line left for the reply", () => {
	assert.equal(appendQuote("", "source has three producers."), "> source has three producers.\n\n");
});

test("after words already written the quote starts its own paragraph", () => {
	assert.equal(appendQuote("two things first:", "one"), "\n\n> one\n\n");
	assert.equal(appendQuote("before\n\n", "one"), "> one\n\n");
});

test("a highlight over several lines stays one quote, blank lines included", () => {
	assert.equal(appendQuote("", "The flow:\n\n1. parse"), "> The flow:\n>\n> 1. parse\n\n");
});

test("the offer shows the first line of a long highlight", () => {
	assert.equal(firstLine("one line\nand another"), "one line …");
});
