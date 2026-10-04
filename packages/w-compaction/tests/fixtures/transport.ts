import assert from "node:assert/strict";
import { createAssistantMessageEventStream } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
	pi.on("session_start", () => {
		globalThis.fetch = async (url, options) => {
			assert.equal(String(url), "https://api.openai.com/v1/responses/compact");
			const body = JSON.parse(options!.body as string);
			assert.match(JSON.stringify(body.input), /8675309/);
			assert.doesNotMatch(JSON.stringify(body.input), /Recent work/);
			return process.env.W_COMPACTION_TEST_FAIL_NATIVE
				? new Response(null, { status: 503 })
				: Response.json({ output: [{ type: "compaction", encrypted_content: "test-native-state" }] });
		};
	});
	pi.registerProvider("openai", {
		apiKey: "test-key",
		api: "openai-responses",
		streamSimple(model, context) {
			assert.match(JSON.stringify(context), /8675309/);
			const stream = createAssistantMessageEventStream();
			stream.push({ type: "done", reason: "stop", message: {
				role: "assistant", provider: model.provider, api: model.api, model: model.id, timestamp: Date.now(),
				content: [{ type: "text", text: "A portable fallback summary preserving 8675309." }], stopReason: "stop",
				usage: { input: 10, output: 5, cacheRead: 0, cacheWrite: 0, totalTokens: 15,
					cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
			} });
			stream.end();
			return stream;
		},
	});
}
