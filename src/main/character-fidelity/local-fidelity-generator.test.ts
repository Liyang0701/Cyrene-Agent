import { describe, expect, it, vi } from "vitest";
import {
  createLocalFidelityGenerator,
  type LocalFidelityFetch,
} from "./local-fidelity-generator";

describe("local Character Fidelity generator", () => {
  it("uses the loopback Qwen-compatible endpoint without tools or cloud credentials", async () => {
    const fetchFn = vi.fn<LocalFidelityFetch>(async () => new Response(JSON.stringify({
      id: "cmpl-local-1",
      choices: [{ message: { content: "<think>hidden</think>\nうへ～、先生。" } }],
    }), { status: 200 }));
    const generate = createLocalFidelityGenerator({ fetchFn });

    await expect(generate({
      variant: "candidate",
      systemPrompt: "system",
      prompt: { id: "daily", category: "daily", mode: "chat", text: "今日は疲れた。" },
      model: {
        provider: "local",
        baseUrl: "http://127.0.0.1:8080/v1",
        model: "/Users/kano/Documents/local-llms/qwen3.5-9b/model",
        temperature: 0.7,
        maxTokens: 320,
      },
      seed: 42,
    })).resolves.toEqual({ text: "うへ～、先生。", requestId: "cmpl-local-1" });

    expect(fetchFn).toHaveBeenCalledWith(
      "http://127.0.0.1:8080/v1/chat/completions",
      expect.objectContaining({ method: "POST", headers: { "Content-Type": "application/json" } }),
    );
    const request = fetchFn.mock.calls[0];
    expect(request).toBeDefined();
    const body = JSON.parse(String(request?.[1]?.body)) as Record<string, unknown>;
    expect(body).toMatchObject({
      model: "/Users/kano/Documents/local-llms/qwen3.5-9b/model",
      stream: false,
      temperature: 0.7,
      max_tokens: 320,
      seed: 42,
    });
    expect(body).not.toHaveProperty("tools");
    expect(JSON.stringify(body)).toContain("/no_think");
  });

  it("refuses non-loopback model endpoints before sending any character content", async () => {
    const fetchFn = vi.fn();
    const generate = createLocalFidelityGenerator({ fetchFn });

    await expect(generate({
      variant: "baseline",
      systemPrompt: "system",
      prompt: { id: "daily", category: "daily", mode: "chat", text: "今日は疲れた。" },
      model: { provider: "local", baseUrl: "https://example.com/v1", model: "remote" },
      seed: 1,
    })).rejects.toThrow("Character Fidelity 只允许使用本机模型服务");
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
