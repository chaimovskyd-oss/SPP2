export const BLESSING_BACKGROUNDS = [
  "cream_elegant.png",
  "elegant_gold.png",
  "birthday_fun.png",
  "bar_mitzvah_blue.png",
  "army_soft.png",
  "army_clean.png",
  "love_soft.png",
  "blue_gold_clean.png",
  "calm_abstract.png",
  "pink_love_light.png",
  "warm_sunset.png",
  "sea_breeze.png",
  "soft_orange.png",
  "red_blue_gift.png",
  "modern_hadish_dark.png",
  "white_gold_luxury.png",
  "gold-frame-with-brown-watercolor-textured-frame-design-element.png",
  "leafy-rectangle-golden-frame-design-element.png",
  "abstract-frame-png-with-leaf-glitter.png",
  "png-rectangular-frame-pastel-watercolour-marble-design-gold-transparent-background.png",
  "png-square-frame-dark-watercolour-marble-design-gold-transparent-background.png",
  "white-png-frame-glitter-ocean-wave-background.png",
  "15967305_Watercolor_pink_flower_background_with_golden_frame.jpg",
  "2151918403.jpg",
  "11065247_736.jpg",
  "164919.jpg",
  "165502.jpg",
  "2871.jpg",
  "8524.jpg",
  "9771.jpg",
  "541.jpg",
  "12459205_job523-nunoon-06-a.jpg",
  "16265735_job524-namcha-03a.jpg",
  "16281629_rm121-jj-06-a.jpg",
  "2289298_7886.jpg",
  "35510807_v37-wit-52e-job129.jpg",
  "35806845_8320671.jpg",
  "36224370_job297-ploy-11c-pink-01.jpg",
  "36224418_job297-ploy-17c-pink-01.jpg",
  "417382333_39b2c15a-4ed5-4d69-b076-2e64e515558c.jpg",
  "417646520_84b6675a-5abf-467a-9766-bf7275bd5b02.jpg",
  "422299301_7406246c-4242-4f70-812e-815becd36cbb.jpg",
  "66819148_1_sep_9.jpg"
] as const;

export const BLESSING_FRAMES = [
  "gold_double.png",
  "red_corner.png",
  "blue_rounded.png",
  "green_rounded.png"
] as const;

export const BLESSING_FRAME_LABELS: Record<(typeof BLESSING_FRAMES)[number], string> = {
  "gold_double.png": "זהב כפול",
  "red_corner.png": "פינות אדומות",
  "blue_rounded.png": "כחול מעוגל",
  "green_rounded.png": "ירוק מעוגל"
};

export function blessingBackgroundUrl(filename: string): string {
  return `./assets/blessing-backgrounds/${filename}`;
}

export function blessingFrameUrl(filename: string): string {
  return `./assets/blessing-frames/${filename}`;
}
