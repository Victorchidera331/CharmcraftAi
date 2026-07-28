import { buildOfflineCoachReply, coachSystemPrompt, normalizeCoachMemory, type CoachTurn } from "@/lib/coach-engine";

export const dynamic = "force-dynamic";

type CoachRequest = {
  prompt?: unknown;
  memory?: unknown;
  thread?: unknown;
};

function isThread(value: unknown): value is CoachTurn[] {
  return Array.isArray(value) && value.every((turn) => turn && typeof turn === "object" && typeof turn.text === "string" && typeof turn.role === "string");
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CoachRequest;
    const prompt = typeof body.prompt === "string" ? body.prompt.trim().slice(0, 2400) : "";
    const memory = normalizeCoachMemory(body.memory);
    const thread = isThread(body.thread) ? body.thread.slice(-12) : [];

    if (!prompt) return Response.json({ error: "A coaching prompt is required." }, { status: 400 });

    const offline = buildOfflineCoachReply(prompt, memory, thread);
    const apiKey = process.env.OPENAI_API_KEY;
    const baseUrl = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

    if (!apiKey) return Response.json({ reply: offline.reply, topic: offline.topic, source: "offline" });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);
    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          temperature: 0.78,
          max_tokens: 280,
          messages: [
            { role: "system", content: coachSystemPrompt(memory) },
            ...thread.slice(-8).map((turn) => ({ role: turn.role === "coach" ? "assistant" : "user", content: turn.text })),
            { role: "user", content: prompt },
          ],
        }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`LLM returned ${response.status}`);
      const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const reply = data.choices?.[0]?.message?.content?.trim();
      if (!reply) throw new Error("LLM response was empty");
      return Response.json({ reply: reply.slice(0, 2200), topic: offline.topic, source: "llm" });
    } catch (error) {
      console.error(error);
      return Response.json({ reply: offline.reply, topic: offline.topic, source: "offline" });
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Coach Victor is temporarily unavailable." }, { status: 500 });
  }
}
