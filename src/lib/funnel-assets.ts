const cdnFunnelBaseUrl = "https://cdn.gandalfpuzzle.com/temp/funnel";
const betterMeImageHost = "image-service.betterme.world";

function cdnUrlForImageId(imageId: string) {
  return `${cdnFunnelBaseUrl}/${imageId.replace(/\.webp$/, "")}.webp`;
}

export function funnelAssetUrl(url: string | null | undefined) {
  if (!url) return url ?? null;

  try {
    const parsed = new URL(url);
    if (parsed.hostname === "cdn.gandalfpuzzle.com") {
      return cdnUrlForImageId(parsed.pathname.split("/").at(-1) ?? "");
    }
    if (parsed.hostname !== betterMeImageHost) return url;

    const imageId = parsed.pathname.split("/").filter(Boolean).at(-1);
    return imageId ? cdnUrlForImageId(imageId) : url;
  } catch {
    return url;
  }
}
