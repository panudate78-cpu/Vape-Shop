export const BRAND = {
  name: 'Dr Cloud',
  shortName: 'Dr Cloud',
  fullName: 'Dr Cloud Chessington',
  tagline: 'The Mobile & Vape Store',
  address: {
    line1: 'Unit 4, Chessington North Railway Station',
    line2: 'Bridge Road',
    city: 'Chessington',
    postcode: 'KT9 2RT',
    country: 'UK',
  },
  phone: '07947 357934',
  phoneHref: 'tel:07947357934',
  email: 'info@drcloudchessington.co.uk',
  hours: [
    { day: 'Mon–Sat', time: '9:30am – 6:30pm' },
    { day: 'Sunday', time: '10:00am – 4:00pm' },
  ],
  colors: { primary: 'blue', contrast: 'amber' },
  mapsQuery: 'Dr+Cloud+Unit+4+Chessington+North+Railway+Station+Bridge+Road+Chessington+KT9+2RT',
  mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Dr+Cloud+Unit+4+Chessington+North+Railway+Station+Bridge+Road+Chessington+KT9+2RT',
};

// Full multi-line address for cards/footers/hero.
export const fullAddress = `${BRAND.address.line1}, ${BRAND.address.line2}, ${BRAND.address.city}, ${BRAND.address.postcode}`;
// Short single-line address for the thin top info bar (line1 + postcode is enough
// context for the info bar while still fitting on one line on mobile).
export const shortAddress = `${BRAND.address.line1}, ${BRAND.address.postcode}`;
export const googleMapsUrl = BRAND.mapsUrl;
