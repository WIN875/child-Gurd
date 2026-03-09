// Calls the server-side API instead of Gemini directly from the browser
// This keeps the API key secure on the server

export async function compareFaces(image1Base64: string, image2Base64: string) {
  try {
    const res = await fetch("/api/compare-faces", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("token")}`,
      },
      body: JSON.stringify({ image1Base64, image2Base64 }),
    });

    if (!res.ok) throw new Error("Server error");

    const result = await res.json();
    return {
      confidence_score: result.confidence_score || 0,
      analysis: result.analysis || "No analysis provided.",
    };
  } catch (error) {
    console.error("AI Matching Error:", error);
    return {
      confidence_score: 0,
      analysis: "AI matching failed. Please check server logs.",
    };
  }
}
