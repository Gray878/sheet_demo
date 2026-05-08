import { ResultClient } from "@/src/components/ResultClient";

export default async function ResultPage({
  params
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  return <ResultClient sessionId={sessionId} />;
}
