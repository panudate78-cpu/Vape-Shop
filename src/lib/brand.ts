export const BRAND = {
  name: 'Dr Cloud',
  shortName: 'Dr Cloud',
  fullName: 'Dr Cloud Chessington',
  tagline: 'Vape & Mobile Store',
  address: {
    line1: 'Unit 4, Bridge Road',
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
  colors: { primary: 'teal', contrast: 'amber' },
  mapsQuery: 'Dr+Cloud+Unit+4+Bridge+Rd+Chessington+KT9+2RT',
  mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Dr+Cloud+Unit+4+Bridge+Rd+Chessington+KT9+2RT',
};

export const fullAddress = `${BRAND.address.line1}, ${BRAND.address.city} ${BRAND.address.postcode}`;
export const googleMapsUrl = BRAND.mapsUrl;
