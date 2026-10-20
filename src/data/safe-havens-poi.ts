export type SafeHavenType = 'pharmacy' | 'police' | 'fuel' | 'metro';

export interface SafeHavenPOI {
  id: string;
  name: string;
  type: SafeHavenType;
  address: string;
  coords: [number, number]; // [lat, lng]
  is247: boolean;
  phone?: string;
  description: string;
}

export const PRAGUE_SAFE_HAVENS: SafeHavenPOI[] = [
  // 1. NONSTOP POHOTOVOSTNÍ LÉKÁRNY (24/7)
  {
    id: 'haven-pharm-palackeho',
    name: 'Lékárna Palackého (24/7 Nonstop)',
    type: 'pharmacy',
    address: 'Palackého 5, Praha 1',
    coords: [50.0816, 14.4239],
    is247: true,
    phone: '+420 224 946 982',
    description: 'Centrální nonstop pohotovostní lékárna v centru Prahy, personál 24/7.'
  },
  {
    id: 'haven-pharm-fnkv',
    name: 'FNKV Pohotovostní lékárna (24/7)',
    type: 'pharmacy',
    address: 'Šrobárova 50 (pavilon I), Praha 10 - Vinohrady',
    coords: [50.0754, 14.4751],
    is247: true,
    phone: '+420 267 162 250',
    description: 'Nemocniční lékárna ve Fakultní nemocnici Královské Vinohrady, střežený areál.'
  },
  {
    id: 'haven-pharm-vfn',
    name: 'VFN Karlovo náměstí Lékárna (24/7)',
    type: 'pharmacy',
    address: 'Karlovo nám. 32, Praha 2',
    coords: [50.0753, 14.4208],
    is247: true,
    phone: '+420 224 966 666',
    description: 'Pohotovostní lékárna Všeobecné fakultní nemocnice na Karlově náměstí.'
  },
  {
    id: 'haven-pharm-motol',
    name: 'FN Motol Pohotovostní lékárna (24/7)',
    type: 'pharmacy',
    address: 'V Úvalu 84, Praha 5',
    coords: [50.0729, 14.3432],
    is247: true,
    phone: '+420 224 435 736',
    description: 'Dětská i dospělá pohotovost a nepřetržitá lékárna FN Motol.'
  },
  {
    id: 'haven-pharm-thomayer',
    name: 'FTN Krč Lékárna (24/7)',
    type: 'pharmacy',
    address: 'Vídeňská 800, Praha 4',
    coords: [50.0275, 14.4623],
    is247: true,
    phone: '+420 261 083 490',
    description: 'Nonstop pohotovostní lékárna Thomayerovy nemocnice.'
  },
  {
    id: 'haven-pharm-bulovka',
    name: 'Nemocnice Na Bulovce Lékárna (24/7)',
    type: 'pharmacy',
    address: 'Budínova 2, Praha 8',
    coords: [50.1158, 14.4645],
    is247: true,
    phone: '+420 266 082 017',
    description: 'Pohotovostní lékárna v areálu Nemocnice Na Bulovce.'
  },

  // 2. SLUŽEBNY PČR A MĚSTSKÉ POLICIE (24/7)
  {
    id: 'haven-police-krakovska',
    name: 'Policie ČR – Krakovská (24/7)',
    type: 'police',
    address: 'Krakovská 11, Praha 1 - Nové Město',
    coords: [50.0792, 14.4290],
    is247: true,
    phone: '158',
    description: 'Obvodní oddělení PČR Nové Město u Václavského náměstí.'
  },
  {
    id: 'haven-police-wilsonova',
    name: 'Policie ČR – Hlavní nádraží (24/7)',
    type: 'police',
    address: 'Wilsonova 8, Praha 1',
    coords: [50.0831, 14.4352],
    is247: true,
    phone: '158',
    description: 'Nonstop oddělení policie přímo ve vestibulu Hlavního nádraží.'
  },
  {
    id: 'haven-police-korunni',
    name: 'Policie ČR – Korunní (24/7)',
    type: 'police',
    address: 'Korunní 98, Praha 10 - Vinohrady',
    coords: [50.0756, 14.4533],
    is247: true,
    phone: '158',
    description: 'Místní oddělení Policie ČR Vinohrady s nepřetržitou službou.'
  },
  {
    id: 'haven-police-vysehradska',
    name: 'Policie ČR – Vyšehradská (24/7)',
    type: 'police',
    address: 'Vyšehradská 51, Praha 2',
    coords: [50.0708, 14.4187],
    is247: true,
    phone: '158',
    description: 'Obvodní oddělení PČR Praha 2 - Nové Město.'
  },
  {
    id: 'haven-police-janovskeho',
    name: 'Policie ČR – Janovského (24/7)',
    type: 'police',
    address: 'Janovského 50, Praha 7 - Holešovice',
    coords: [50.1012, 14.4347],
    is247: true,
    phone: '158',
    description: 'Obvodní oddělení PČR Holešovice.'
  },
  {
    id: 'haven-police-mp-p2',
    name: 'Městská policie Praha 2 (24/7)',
    type: 'police',
    address: 'Perucká 11, Praha 2 - Vinohrady',
    coords: [50.0679, 14.4419],
    is247: true,
    phone: '156',
    description: 'Okrskové stanoviště Městské policie Praha 2 s nepřetržitým dohledem.'
  },
  {
    id: 'haven-police-mp-p1',
    name: 'Městská policie Praha 1 (24/7)',
    type: 'police',
    address: 'Loretánská 19, Praha 1 - Hradčany',
    coords: [50.0890, 14.3923],
    is247: true,
    phone: '156',
    description: 'Okrskové stanoviště Městské policie Praha 1.'
  },
  {
    id: 'haven-police-mp-p3',
    name: 'Městská policie Praha 3 (24/7)',
    type: 'police',
    address: 'Lupáčova 14, Praha 3 - Žižkov',
    coords: [50.0841, 14.4538],
    is247: true,
    phone: '156',
    description: 'Okrskové stanoviště Městské policie Praha 3.'
  },

  // 3. ČERPACÍ STANICE 24/7
  {
    id: 'haven-fuel-shell-vinohrady',
    name: 'Shell Vinohradská (24/7)',
    type: 'fuel',
    address: 'Vinohradská 174, Praha 3',
    coords: [50.0772, 14.4678],
    is247: true,
    phone: '+420 272 733 111',
    description: 'Osvětlená čerpací stanice s nepřetržitou obsluhou a kamerovým systémem.'
  },
  {
    id: 'haven-fuel-mol-sokolska',
    name: 'MOL Sokolská / I.P. Pavlova (24/7)',
    type: 'fuel',
    address: 'Sokolská 35, Praha 2',
    coords: [50.0732, 14.4300],
    is247: true,
    phone: '+420 224 266 110',
    description: 'Frekventovaná nepřetržitě otevřená stanice na magistrále.'
  },
  {
    id: 'haven-fuel-mol-argentinska',
    name: 'MOL Argentinská (24/7)',
    type: 'fuel',
    address: 'Argentinská 1, Praha 7 - Holešovice',
    coords: [50.1065, 14.4426],
    is247: true,
    phone: '+420 220 878 120',
    description: 'Osvětlená nonstop čerpací stanice v Holešovicích.'
  },
  {
    id: 'haven-fuel-omv-nusle',
    name: 'OMV Nuselská (24/7)',
    type: 'fuel',
    address: 'Nuselská 84, Praha 4 - Nusle',
    coords: [50.0592, 14.4452],
    is247: true,
    phone: '+420 241 740 555',
    description: 'Nonstop čerpací stanice OMV s prodejnou a zázemím.'
  },
  {
    id: 'haven-fuel-shell-vrchlickeho',
    name: 'Shell Vrchlického (24/7)',
    type: 'fuel',
    address: 'Vrchlického, Praha 5 - Košíře',
    coords: [50.0718, 14.3821],
    is247: true,
    phone: '+420 257 320 011',
    description: 'Nonstop osvětlená čerpací stanice Shell.'
  },

  // 4. OSVĚTLENÉ VESTIBULY METRA (DPP DOHLED A KAMERY)
  {
    id: 'haven-metro-miru',
    name: 'Metro A – Náměstí Míru (Vestibul)',
    type: 'metro',
    address: 'Náměstí Míru, Praha 2',
    coords: [50.0752, 14.4377],
    is247: true,
    description: 'Osvětlený vestibul stanice metra s dozorčím DPP a kamerovým dohledem MKS.'
  },
  {
    id: 'haven-metro-ippavlova',
    name: 'Metro C – I. P. Pavlova (Vestibul)',
    type: 'metro',
    address: 'I. P. Pavlova, Praha 2',
    coords: [50.0754, 14.4299],
    is247: true,
    description: 'Velmi frekventovaný, silně osvětlený dopravní uzel s dozorčí službou.'
  },
  {
    id: 'haven-metro-muzeum',
    name: 'Metro A/C – Muzeum (Vestibul)',
    type: 'metro',
    address: 'Václavské náměstí, Praha 1',
    coords: [50.0797, 14.4307],
    is247: true,
    description: 'Centrální přestupní stanice s vysokou koncentrací bezpečnostních složek.'
  },
  {
    id: 'haven-metro-mustek',
    name: 'Metro A/B – Můstek (Vestibul)',
    type: 'metro',
    address: 'Jungmannovo náměstí / Můstek, Praha 1',
    coords: [50.0838, 14.4239],
    is247: true,
    description: 'Kamerově 100% monitorovaný vestibul v pěší zóně.'
  },
  {
    id: 'haven-metro-florenc',
    name: 'Metro B/C – Florenc (Vestibul)',
    type: 'metro',
    address: 'Florenc, Praha 8',
    coords: [50.0905, 14.4390],
    is247: true,
    description: 'Dopravní terminál s nepřetržitou ostrahou a stanicí policie.'
  },
  {
    id: 'haven-metro-andel',
    name: 'Metro B – Anděl (Vestibul)',
    type: 'metro',
    address: 'Plzeňská / Nádražní, Praha 5',
    coords: [50.0708, 14.4036],
    is247: true,
    description: 'Hlídaný a živý vestibul stanice Anděl.'
  },
  {
    id: 'haven-metro-karlovo',
    name: 'Metro B – Karlovo náměstí (Vestibul)',
    type: 'metro',
    address: 'Karlovo náměstí / Resslova, Praha 2',
    coords: [50.0762, 14.4194],
    is247: true,
    description: 'Osvětlený vestibul metra s dohledem a pohotovostí.'
  },
  {
    id: 'haven-metro-jiriho',
    name: 'Metro A – Jiřího z Poděbrad (Vestibul)',
    type: 'metro',
    address: 'Náměstí Jiřího z Poděbrad, Praha 3',
    coords: [50.0778, 14.4501],
    is247: true,
    description: 'Modernizovaný, bezpečný a bezbariérový vestibul s dozorčím.'
  },
  {
    id: 'haven-metro-flora',
    name: 'Metro A – Flora (Vestibul)',
    type: 'metro',
    address: 'Vinohradská / Jičínská, Praha 3',
    coords: [50.0774, 14.4612],
    is247: true,
    description: 'Vestibul propojený s nákupním centrem s ostrahou.'
  },
  {
    id: 'haven-metro-vysehrad',
    name: 'Metro C – Vyšehrad (Vestibul)',
    type: 'metro',
    address: 'Kongresové centrum, Praha 4',
    coords: [50.0629, 14.4306],
    is247: true,
    description: 'Klidný a přehledný vestibul u Kongresového centra.'
  },
  {
    id: 'haven-metro-dejvicka',
    name: 'Metro A – Dejvická (Vestibul)',
    type: 'metro',
    address: 'Vítězné náměstí, Praha 6',
    coords: [50.0999, 14.3934],
    is247: true,
    description: 'Frekventovaný uzel Dejvice s dozorčí stanicí DPP.'
  }
];

export function getSafeHavenTypeLabel(type: SafeHavenType): string {
  switch (type) {
    case 'pharmacy':
      return 'Pohotovostní lékárna (24/7)';
    case 'police':
      return 'Služebna Policie (24/7)';
    case 'fuel':
      return 'Čerpací stanice (24/7)';
    case 'metro':
      return 'Střežený vestibul metra';
    default:
      return 'Nouzový úkryt';
  }
}

export function getSafeHavenIcon(type: SafeHavenType): string {
  switch (type) {
    case 'pharmacy':
      return '💊';
    case 'police':
      return '👮';
    case 'fuel':
      return '⛽';
    case 'metro':
      return '🚇';
    default:
      return '🛡️';
  }
}
