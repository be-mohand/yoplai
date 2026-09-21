import http from "node:http";

const server = http.createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/v1/chat/completions") {
    response.writeHead(404).end();
    return;
  }

  let body = "";
  for await (const chunk of request) body += chunk;
  const payload = JSON.parse(body);
  const isTitle = payload.messages?.some(
    (message) => message.role === "system" && message.content?.includes("3-6 word title")
  );
  const content = isTitle ? '"Quarterly Budget Planning."' : "Here is a concise budget plan.";

  if (payload.stream) {
    response.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
    });
    response.write(`data: ${JSON.stringify({
      id: "chatcmpl-e2e",
      object: "chat.completion.chunk",
      created: 1,
      model: payload.model,
      choices: [{ index: 0, delta: { role: "assistant", content }, finish_reason: null }],
    })}\n\n`);
    response.write(`data: ${JSON.stringify({
      id: "chatcmpl-e2e",
      object: "chat.completion.chunk",
      created: 1,
      model: payload.model,
      choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
    })}\n\n`);
    response.end("data: [DONE]\n\n");
    return;
  }

  response.writeHead(200, { "content-type": "application/json" });
  response.end(JSON.stringify({
    id: "chatcmpl-e2e",
    object: "chat.completion",
    created: 1,
    model: payload.model,
    choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
    usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 },
  }));
});

server.listen(4199, "127.0.0.1", () => console.log("mock-openai 4199"));
