// ─────────────────────────────────────────────────────────────────────────
//  Everything personal lives here.
// ─────────────────────────────────────────────────────────────────────────
export const CONFIG = {
  // Her first name, as it should appear written in stars.
  name: '',

  // Local time of birth, "HH:MM" (24h, Istanbul time), or null if unknown.
  // When set, the story pauses at that exact minute.
  birthTime: '12:01',

  // 'auto' follows the phone's language (Turkish phone → Turkish), or force 'en' / 'tr'.
  lang: 'auto',

  // Date and place of birth.
  date: { year: 2002, month: 11, day: 19 },
  utcOffsetHours: 2, // Istanbul was on EET (UTC+2) in November 2002
  place: {
    // Galata Tower, looking out over the Bosphorus and the old city
    latitude: 41.0256,
    longitude: 28.9741,
    elevation: 100,
  },
};

// Handy for previewing: ?name=Ada&lang=tr&t=21:30
const q = new URLSearchParams(location.search);
if (q.get('name')) CONFIG.name = q.get('name').slice(0, 24);
if (q.get('lang')) CONFIG.lang = q.get('lang');
if (/^\d{1,2}:\d{2}$/.test(q.get('t') || '')) CONFIG.birthTime = q.get('t');

export const LANG =
  CONFIG.lang === 'tr' || CONFIG.lang === 'en'
    ? CONFIG.lang
    : (navigator.language || 'en').toLowerCase().startsWith('tr')
      ? 'tr'
      : 'en';

const STRINGS = {
  en: {
    title: 'Look up',
    introDate: '19 · 11 · 2002',
    introPlace: 'Istanbul',
    introTap: 'tap to look up',
    loading: 'gathering the stars…',
    skip: 'skip',
    s_place: 'Istanbul. 19 November 2002.',
    s_real: 'This is the real sky of that day — every star exactly where it was.',
    s_birthNight: (t) => `At ${t}, under these stars, you arrived.`,
    s_storm1: 'Before sunrise, it began to rain stars.',
    s_storm2: 'The Leonid meteor storm. Thousands of shooting stars an hour — there hasn’t been one like it since.',
    s_birthStorm: (t) => `And at ${t}, while the sky was falling, you arrived.`,
    s_sunrise: 'Then the sun came up on your very first day.',
    s_birthDay: (t, high) => (high ? `At ${t}, with the sun high over the city, you arrived.` : `At ${t}, you arrived.`),
    s_birthDay2: 'The stars were all still there, hidden behind the daylight.',
    s_birthDay3: 'And the Sun was standing at the gates of Scorpius — your sign.',
    s_moon: 'That night, a full moon rose over the Bosphorus.',
    s_saturn: 'Saturn kept watch beside Orion.',
    s_all: 'The whole sky turned up to welcome you.',
    happy: 'Happy Birthday',
    s_after: 'The universe has been celebrating you ever since.',
    hint: 'This sky is yours now.\nDrag to look around · tap a star\ntap the dark to make a wish',
    wish: 'make a wish',
    months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    cardinals: ['N', 'E', 'S', 'W'],
    constellation: 'Constellations',
    sound: 'Sound',
    replay: 'Replay',
    ev_storm: 'meteor storm',
    ev_birth: 'you',
    ev_full: 'full moon',
    star: 'Star',
    planet: 'Planet',
    inCon: (c) => `in ${c}`,
    mag: (m) => `magnitude ${m}`,
    moon: 'Moon',
    sun: 'Sun',
    moonLit: (p) => `${p}% illuminated`,
    moonFact: 'Full that night — and before dawn it slipped through the edge of Earth’s shadow, a faint penumbral eclipse.',
    planets: { Mercury: 'Mercury', Venus: 'Venus', Mars: 'Mars', Jupiter: 'Jupiter', Saturn: 'Saturn' },
    planetFacts: {
      Venus: 'The morning star, close to its most brilliant.',
      Saturn: 'A month from its closest approach, its rings tilted wide open.',
      Jupiter: 'The king of planets, rising late that evening.',
      Mars: 'Faint and far away that autumn, low in the dawn.',
      Mercury: 'Hiding in the glow of the Sun.',
    },
    stormNow: 'Leonid storm at its peak',
    noWebgl: 'Your browser can’t draw the sky, but the stars still say:',
  },
  tr: {
    title: 'Yukarı bak',
    introDate: '19 · 11 · 2002',
    introPlace: 'İstanbul',
    introTap: 'gökyüzüne bakmak için dokun',
    loading: 'yıldızlar toplanıyor…',
    skip: 'geç',
    s_place: 'İstanbul. 19 Kasım 2002.',
    s_real: 'Bu, o günün gerçek gökyüzü — her yıldız tam olduğu yerde.',
    s_birthNight: (t) => `Saat ${t}. Bu yıldızların altında sen geldin.`,
    s_storm1: 'Gün doğmadan önce gökten yıldız yağmaya başladı.',
    s_storm2: 'Leonid meteor fırtınası. Saatte binlerce kayan yıldız — o günden beri böylesi görülmedi.',
    s_birthStorm: (t) => `Ve saat ${t}. Gökten yıldızlar yağarken sen geldin.`,
    s_sunrise: 'Sonra güneş, senin ilk gününe doğdu.',
    s_birthDay: (t, high) => (high ? `Saat ${t}. Güneş şehrin tepesindeyken sen geldin.` : `Saat ${t}. Sen geldin.`),
    s_birthDay2: 'Yıldızlar hâlâ oradaydı, gün ışığının ardına saklanmış.',
    s_birthDay3: 'Ve Güneş, Akrep’in kapısında duruyordu — senin burcunda.',
    s_moon: 'O gece Boğaz’ın üzerinde dolunay yükseldi.',
    s_saturn: 'Satürn, Avcı’nın yanı başında nöbetteydi.',
    s_all: 'Bütün gökyüzü seni karşılamaya gelmişti.',
    happy: 'İyi ki doğdun',
    s_after: 'Evren o günden beri seni kutluyor.',
    hint: 'Bu gökyüzü artık senin.\nSürükleyerek gez · bir yıldıza dokun\ndilek tutmak için karanlığa dokun',
    wish: 'bir dilek tut',
    months: ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'],
    cardinals: ['K', 'D', 'G', 'B'],
    constellation: 'Takımyıldızlar',
    sound: 'Ses',
    replay: 'Baştan',
    ev_storm: 'meteor fırtınası',
    ev_birth: 'sen',
    ev_full: 'dolunay',
    star: 'Yıldız',
    planet: 'Gezegen',
    inCon: (c) => `${c} takımyıldızında`,
    mag: (m) => `parlaklık ${m} kadir`,
    moon: 'Ay',
    sun: 'Güneş',
    moonLit: (p) => `%${p} aydınlık`,
    moonFact: 'O gece dolunaydı — ve şafaktan önce Dünya’nın gölgesinin kıyısından geçti: belli belirsiz bir yarıgölge tutulması.',
    planets: { Mercury: 'Merkür', Venus: 'Venüs', Mars: 'Mars', Jupiter: 'Jüpiter', Saturn: 'Satürn' },
    planetFacts: {
      Venus: 'Sabah yıldızı, en parlak günlerine yakın.',
      Saturn: 'Dünya’ya en yakın konumuna bir ay kalmıştı; halkaları ardına kadar açıktı.',
      Jupiter: 'Gezegenlerin kralı, o akşam geç saatte doğuyordu.',
      Mars: 'O sonbahar sönük ve uzaktı; şafakta, ufka yakın.',
      Mercury: 'Güneş’in parıltısında saklanıyordu.',
    },
    stormNow: 'Leonid fırtınasının zirvesi',
    noWebgl: 'Tarayıcın gökyüzünü çizemiyor ama yıldızlar yine de diyor ki:',
  },
};

export const T = STRINGS[LANG];
