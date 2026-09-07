const assert = require("node:assert/strict");
const test = require("node:test");
const {
  computeGrowthMetrics,
  nextFridayAt20,
  weekKey,
} = require("../src/modules/growth");

test("les semaines et le vendredi sont calculés dans le fuseau de Paris", () => {
  const wednesday = new Date("2026-09-02T18:00:00.000Z");
  assert.equal(weekKey(wednesday), "2026-08-31");
  assert.equal(nextFridayAt20(wednesday).toISOString(), "2026-09-04T18:00:00.000Z");
});

test("les indicateurs mesurent activité, onboarding, rétention et sources", () => {
  const now = new Date("2026-09-02T18:00:00.000Z").getTime();
  const day = 24 * 60 * 60_000;
  const iso = (value) => new Date(value).toISOString();
  const metrics = computeGrowthMetrics({
    members: {
      a: {
        joinedAt: iso(now - 10 * day),
        lastActivityAt: iso(now - 2 * day),
        onboardingAt: null,
        source: "tiktok",
        leftAt: null,
        bot: false,
      },
      b: {
        joinedAt: iso(now - 5 * day),
        lastActivityAt: iso(now),
        onboardingAt: iso(now - 4 * day),
        source: "youtube",
        leftAt: null,
        bot: false,
      },
      c: {
        joinedAt: iso(now - 20 * day),
        lastActivityAt: null,
        onboardingAt: null,
        source: "partenaires",
        leftAt: null,
        bot: false,
      },
      bot: {
        joinedAt: iso(now - 20 * day),
        lastActivityAt: iso(now),
        source: "tiktok",
        bot: true,
      },
    },
  }, now);

  assert.equal(metrics.trackedMembers, 3);
  assert.equal(metrics.active7Days, 2);
  assert.equal(metrics.recentJoins, 3);
  assert.equal(metrics.onboardingRate, 33);
  assert.equal(metrics.retentionRate, 50);
  assert.equal(metrics.retentionSample, 2);
  assert.deepEqual(metrics.bySource, { tiktok: 1, youtube: 1, partenaires: 1 });
});
