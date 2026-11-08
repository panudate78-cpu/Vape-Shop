export const BRAND = {
  name: "Dr Cloud",
  suffix: "Chessington",
  fullName: "Dr Cloud Chessington",
  tagline: "Chessington's Vape & Mobile Store",
  description:
    "Dr Cloud Chessington — your local vape shop & mobile repair store on Bridge Road. E-liquids, pod systems, mods, coils & accessories with same-day Click & Collect.",
  phone: "07947 357934",
  phoneHref: "tel:+447947357934",
  address: {
    line1: "Unit 4, Bridge Road",
    line2: "",
    town: "Chessington",
    county: "Surrey",
    postcode: "KT9 2RT",
    country: "United Kingdom",
  },
  hours: [
    { days: "Monday – Saturday", time: "9:30am – 6:30pm" },
    { days: "Sunday", time: "10:00am – 4:00pm" },
  ],
  mapsUrl: "https://www.google.com/maps/search/?api=1&query=Dr+Cloud+Unit+4+Bridge+Rd+Chessington+KT9+2RT",
  email: "hello@drcloudchessington.co.uk",
};

export const fullAddress = `${BRAND.address.line1}, ${BRAND.address.town}, ${BRAND.address.county} ${BRAND.address.postcode}`;
