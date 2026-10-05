import { activateBonusOffer } from "./ah-client.js";
import { fetchDashboard } from "./dashboard.js";

export async function activateOffer(accessToken, { offerId, segmentId, startDate }) {
  if (!offerId || !segmentId || !startDate) {
    throw new Error("offerId, segmentId en startDate zijn verplicht.");
  }

  const result = await activateBonusOffer(accessToken, {
    offerId,
    segmentId,
    startDate,
  });

  const group = result?.bonusGroup || result?.product || result;
  return {
    offerId,
    status: group?.activationStatus || "ACTIVATED",
    title: group?.segmentDescription || group?.title || null,
  };
}

export async function activateAllActivatable(accessToken, source = "bonusbox") {
  const dashboard = await fetchDashboard(accessToken);
  const section = source === "personalBonus" ? dashboard.personalBonus : dashboard.bonusbox;
  const offers = section?.offers?.filter((offer) => offer.activatable) || [];
  const remaining =
    source === "bonusbox" ? section?.remainingActivations ?? offers.length : offers.length;
  const toActivate = offers.slice(0, remaining);

  const results = [];
  for (const offer of toActivate) {
    try {
      const result = await activateOffer(accessToken, {
        offerId: offer.offerId,
        segmentId: offer.segmentId,
        startDate: offer.startDate,
      });
      results.push({ ok: true, ...result });
    } catch (error) {
      results.push({
        ok: false,
        offerId: offer.offerId,
        title: offer.title,
        error: error.message,
      });
    }
  }

  return {
    source,
    total: toActivate.length,
    activated: results.filter((item) => item.ok).length,
    failed: results.filter((item) => !item.ok).length,
    results,
  };
}
