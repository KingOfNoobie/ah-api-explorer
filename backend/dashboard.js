import {
  ahGet,
  getAirmilesBalance,
  getMember,
  getPurchaseStampBalance,
  getPurchaseStampTransactions,
  getReceipts,
} from "./ah-client.js";
import { getBonusMonday, parseBonusOffers } from "./bonus-utils.js";

async function safeLoad(name, loader) {
  try {
    const data = await loader();
    return { ok: true, data };
  } catch (error) {
    return {
      ok: false,
      error: error.message || "Kon gegevens niet ophalen",
      status: error.status || null,
    };
  }
}

function hasPremiumMembership(member) {
  return Array.isArray(member?.memberships) && member.memberships.includes("PREMIUM");
}

function buildBonusboxSection(data, member) {
  if (!data) return null;

  const offers = parseBonusOffers(data);
  const isPremium = hasPremiumMembership(member);
  const maxActivations = data.maxActivations ?? (isPremium ? 10 : 5);
  const activatedCount = offers.filter((offer) => offer.activated).length;

  return {
    title: data.sectionDescription || "Bonusbox",
    maxActivations,
    activatedCount,
    activatableCount: offers.filter((offer) => offer.activatable).length,
    remainingActivations: Math.max(0, maxActivations - activatedCount),
    isPremium,
    offers,
  };
}

export async function fetchDashboard(accessToken) {
  const bonusDate = getBonusMonday();
  const appHeaders = { "x-application": "AHWEBSHOP" };

  const member = await safeLoad("member", () => getMember(accessToken));
  const hasAirmilesCard = Boolean(
    member.ok &&
      member.data?.loyaltyCards?.some((card) => card.type === "AM")
  );

  const [
    airmiles,
    koopzegels,
    koopzegelTransactions,
    stampPrograms,
    bonusbox,
    personalBonus,
    spotlight,
    shoppingList,
    receipts,
  ] = await Promise.all([
    safeLoad("airmiles", () =>
      getAirmilesBalance(accessToken, { hasAirmilesCard })
    ),
    safeLoad("koopzegels", () => getPurchaseStampBalance(accessToken)),
    safeLoad("koopzegelTransactions", () => getPurchaseStampTransactions(accessToken)),
    safeLoad("stampPrograms", () =>
      ahGet(accessToken, "/mobile-services/stamps/v3/programs", {
        query: { returnFinishedCampaigns: "false" },
        headers: appHeaders,
      })
    ),
    safeLoad("bonusbox", () =>
      ahGet(accessToken, "/mobile-services/bonuspage/v1/choose-and-activate", {
        query: { bonusStartDate: bonusDate },
      })
    ),
    safeLoad("personalBonus", () =>
      ahGet(accessToken, "/mobile-services/bonuspage/v2/section/personal", {
        query: { date: bonusDate },
      })
    ),
    safeLoad("spotlight", () =>
      ahGet(accessToken, "/mobile-services/bonuspage/v2/section/spotlight", {
        query: { date: bonusDate },
      })
    ),
    safeLoad("shoppingList", () =>
      ahGet(accessToken, "/mobile-services/shoppinglist/v2/items")
    ),
    safeLoad("receipts", () => getReceipts(accessToken)),
  ]);

  return {
    fetchedAt: new Date().toISOString(),
    bonusWeek: bonusDate,
    isPremium: hasPremiumMembership(member.ok ? member.data : null),
    member: member.ok ? member.data : null,
    errors: {
      member: member.ok ? null : member.error,
      airmiles: airmiles.ok ? null : airmiles.error,
      koopzegels: koopzegels.ok ? null : koopzegels.error,
      koopzegelTransactions: null,
      stampPrograms: stampPrograms.ok ? null : stampPrograms.error,
      bonusbox: bonusbox.ok ? null : bonusbox.error,
      personalBonus: personalBonus.ok ? null : personalBonus.error,
      spotlight: spotlight.ok ? null : spotlight.error,
      shoppingList: shoppingList.ok ? null : shoppingList.error,
      receipts: receipts.ok ? null : receipts.error,
    },
    airmiles: airmiles.ok ? airmiles.data : null,
    koopzegels: koopzegels.ok ? koopzegels.data : null,
    koopzegelTransactions: koopzegelTransactions.ok
      ? (Array.isArray(koopzegelTransactions.data) ? koopzegelTransactions.data : [])
      : [],
    stampPrograms: stampPrograms.ok
      ? (Array.isArray(stampPrograms.data) ? stampPrograms.data : [])
      : [],
    bonusbox: bonusbox.ok
      ? buildBonusboxSection(bonusbox.data, member.ok ? member.data : null)
      : null,
    personalBonus: personalBonus.ok
      ? {
          title: personalBonus.data?.sectionDescription || "Persoonlijke Bonus",
          offers: parseBonusOffers(personalBonus.data),
        }
      : null,
    spotlight: spotlight.ok
      ? {
          title: spotlight.data?.sectionDescription || "Bonus spotlight",
          offers: parseBonusOffers(spotlight.data),
        }
      : null,
    shoppingList: shoppingList.ok ? shoppingList.data?.items || [] : [],
    receipts: receipts.ok
      ? (Array.isArray(receipts.data) ? receipts.data : []).slice(0, 8)
      : [],
  };
}
