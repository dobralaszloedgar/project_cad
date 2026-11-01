import { aiGuideText, AI_GUIDE_VERSION } from "@/assistant/guide";

export function GET() {
  return new Response(aiGuideText, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-AI-Guide-Version": AI_GUIDE_VERSION,
    },
  });
}
