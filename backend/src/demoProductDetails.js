'use strict';
// How each demo product is doing, part by part, for the "About this device" box on its page. Used by the demo seed, and by
// `npm run seed:productdetails` to fill in demo products that were created before these details existed.
const ok = { power: 'works_normally', ports: 'all_work', water: 'none' };

const DEMO_PRODUCT_DETAILS = {
  'Lenovo ThinkPad X230, 8 GB RAM, 256 GB SSD': {
    conditionDetails: { ...ok, screen: 'no_damage', battery: 'holds_well', body: 'scratched_or_dented', charging: 'normal', sound: 'works', camera: 'works' },
    conditionNote: 'Light wear on the palm rest and the lid. The original charger is included.',
  },
  'iPhone 7, 32 GB, new battery': {
    conditionDetails: { ...ok, screen: 'no_damage', battery: 'holds_well', body: 'like_new', charging: 'normal', sound: 'works', camera: 'works' },
    conditionNote: 'Original screen and a brand new battery. Factory reset and ready to use. A charging cable is included, but no box.',
  },
  'Dell 24-inch full HD monitor': {
    conditionDetails: { ...ok, screen: 'no_damage', body: 'scratched_or_dented', sound: 'works' },
    conditionNote: 'One tiny mark on the stand, shown in the photos. HDMI and DisplayPort cables are included.',
  },
  'Samsung Galaxy Tab A 8-inch': {
    conditionDetails: { ...ok, screen: 'no_damage', battery: 'holds_well', body: 'scratched_or_dented', charging: 'normal', sound: 'works', camera: 'works' },
    conditionNote: 'The screen was replaced. Battery health is about 85%. A few scratches on the back.',
  },
  'HP LaserJet printer': {
    conditionDetails: { ...ok, body: 'scratched_or_dented' },
    conditionNote: 'New toner fitted and the rollers cleaned. It printed 500 test pages without a problem.',
  },
  'Wireless keyboard and mouse combo': {
    conditionDetails: { ...ok, battery: 'holds_well', body: 'like_new' },
    conditionNote: 'New batteries are included, and so is the USB receiver. Every key and both mouse buttons were tested.',
  },
};

module.exports = { DEMO_PRODUCT_DETAILS };
