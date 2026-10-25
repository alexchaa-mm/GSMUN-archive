export const FINANCIAL_CITY_MINT_ASSETS = {
  foundation: {
    city: "https://cdn.mint.gg/glb/financial-city-v7-street-line-overlay-normalized-61829dc1381e78d9.glb",
    underlay: "https://cdn.mint.gg/glb/chamfered-ledger-plinth-normalized-32f36f487869ba04.glb",
  },
  infrastructure: {
    trafficSignals: "https://cdn.mint.gg/glb/intersection-traffic-signals-normalized-807561f2cc9d2f61.glb",
    streetlights: "https://cdn.mint.gg/glb/civic-streetlight-pair-normalized-9602c2a95fd0ccc1.glb",
  },
  income: {
    utilityCampus: "https://cdn.mint.gg/glb/power-and-utility-campus-normalized-fbf38e8fd9df76f5.glb",
    employmentBlocks: "https://cdn.mint.gg/glb/employment-blocks-normalized-e4ed7c284a7faa42.glb",
  },
  infill: {
    brickApartments: "https://cdn.mint.gg/glb/ledger-brick-corner-apartments-normalized-9624edc622f1c1c4.glb",
    limestoneOffices: "https://cdn.mint.gg/glb/civic-limestone-offices-normalized-c9a565f16064426c.glb",
    tealGlassTower: "https://cdn.mint.gg/glb/teal-glass-ledger-tower-normalized-6cb31f6a0ecf05cb.glb",
    copperMixedUse: "https://cdn.mint.gg/glb/copper-mixed-use-house-normalized-89d9d55342e038b8.glb",
    terracedResidences: "https://cdn.mint.gg/glb/terraced-ledger-residences-normalized-a14947f9c9e9ae4e.glb",
    hotel: "https://cdn.mint.gg/glb/metropolitan-hotel-block-normalized-85a0a774930c7624.glb",
    arcade: "https://cdn.mint.gg/glb/ledger-arcade-building-normalized-b6501a9b9f75965e.glb",
  },
  infillState: {
    deferred: [
      "https://cdn.mint.gg/glb/deferred-brick-apartments-normalized-790443bef2c2285c.glb",
      "https://cdn.mint.gg/glb/deferred-concrete-walk-up-normalized-d9ef9c1ccfb1fb2a.glb",
      "https://cdn.mint.gg/glb/deferred-budget-offices-normalized-573472019836f4b0.glb",
      "https://cdn.mint.gg/glb/deferred-residential-tower-normalized-c0dc3674dfb774f3.glb",
      "https://cdn.mint.gg/glb/deferred-terraced-residences-normalized-b1a28504e0ce6958.glb",
      "https://cdn.mint.gg/glb/deferred-ledger-arcade-normalized-fc2e4c6de4b9d331.glb",
    ],
    luxury: [
      "https://cdn.mint.gg/glb/luxury-brick-apartments-normalized-aa4e61414c127ed8.glb",
      "https://cdn.mint.gg/glb/luxury-limestone-residences-normalized-ab076357b89be3e6.glb",
      "https://cdn.mint.gg/glb/luxury-mixed-use-corner-normalized-0f8e56ee6175eeac.glb",
      "https://cdn.mint.gg/glb/luxury-glass-offices-normalized-b905ab5663e0587a.glb",
      "https://cdn.mint.gg/glb/luxury-residential-tower-normalized-bebe59d9612b4161.glb",
      "https://cdn.mint.gg/glb/luxury-boutique-hotel-normalized-9ba3728165e1d269.glb",
      "https://cdn.mint.gg/glb/luxury-terraced-residences-normalized-5dad7514eef11021.glb",
      "https://cdn.mint.gg/glb/luxury-ledger-arcade-normalized-771ccccf6590cf02.glb",
    ],
  },
  savings: {
    skyline: "https://cdn.mint.gg/glb/savings-skyline-family-normalized-aede25f0289b159e.glb",
    resiliencePark: "https://cdn.mint.gg/glb/resilience-park-normalized-e051c36e43503343.glb",
  },
  emergency: {
    hospital: "https://cdn.mint.gg/glb/teal-stone-infirmary-normalized-21dddd53a1e5c2d9.glb",
    fireStation: "https://cdn.mint.gg/glb/fire-and-rescue-station-normalized-3bc8388c1a6e13bf.glb",
  },
  pressure: {
    debtConstruction: "https://cdn.mint.gg/glb/debt-construction-family-normalized-c3d24c92d1fee3ff.glb",
    highInterest: "https://cdn.mint.gg/glb/high-interest-pressure-family-normalized-b05fdaeb9897824c.glb",
  },
  discretionary: {
    dining: "https://cdn.mint.gg/glb/dining-block-normalized-06cd66599b0b88de.glb",
    arts: "https://cdn.mint.gg/glb/arts-and-entertainment-block-normalized-417440aae9bd846e.glb",
  },
  future: {
    culturalLandmark: "https://cdn.mint.gg/glb/cultural-landmark-normalized-f51c4d906ad62f83.glb",
    district: "https://cdn.mint.gg/glb/future-district-modules-normalized-713b2dcb60974226.glb",
  },
  cityHall: {
    exterior: "https://cdn.mint.gg/glb/city-hall-exterior-normalized-80c2edc97d91de3f.glb",
  },
  vehicles: {
    navySedan: "https://cdn.mint.gg/glb/navy-compact-sedan-normalized-452a9bd80cf25ebc.glb",
    copperHatchback: "https://cdn.mint.gg/glb/copper-city-hatchback-normalized-04502312f913294f.glb",
    ivoryCrossover: "https://cdn.mint.gg/glb/ivory-electric-crossover-normalized-2208afb93c1da084.glb",
    tealMicroCar: "https://cdn.mint.gg/glb/teal-micro-car-normalized-efa4bbc1b8e2f8a6.glb",
    deliveryVan: "https://cdn.mint.gg/glb/muted-amber-delivery-van-normalized-e6238be115cab68e.glb",
    cityBus: "https://cdn.mint.gg/glb/charcoal-city-bus-normalized-03848c99d9083ecc.glb",
  },
} as const;

export const FINANCIAL_CITY_IMPORT_CONTRACT = {
  floorSurfaceY: 1,
  cityTargetSize: [176, 153] as const,
  cityTargetHeight: 1,
  underlayTargetSize: [184, 161] as const,
  underlayTargetHeight: 2.5,
  underlayTopY: -0.02,
  waterVerticalScale: 0.04,
  waterSurfaceClearance: -0.08,
  worldUp: [0, 1, 0] as const,
} as const;
