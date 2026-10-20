import * as turf from '@turf/turf';

export interface BuildingPolygon {
  id: string;
  name: string;
  coordinates: [number, number][]; // [lat, lng]
}

/**
 * Reálné půdorysy budov a bloků zástavby v exponovaných zónách Prahy
 * (Vinohradská, Ječná, Sokolská, Národní, I.P. Pavlova, Záhřebská, Americká, Bělehradská atd.)
 * pro spolehlivou prostorovou detekci kolizí line-offsetu s budovami.
 */
export const PRAGUE_BUILDINGS: BuildingPolygon[] = [
  // --- ZÁHŘEBSKÁ & AMERICKÁ & BĚLEHRADSKÁ (VINOHRADY) ---
  // Blok severně od Záhřebské (mezi Americkou a Záhřebskou směrem k Francouzské)
  {
    id: 'bld-zahrebska-north-americka',
    name: 'Blok Záhřebská / Americká sever (obytné domy Záhřebská 1-15)',
    coordinates: [
      [50.0754, 14.4382],
      [50.0752, 14.4394],
      [50.0738, 14.4385],
      [50.0740, 14.4376],
      [50.0754, 14.4382]
    ]
  },
  // Blok jižně od Záhřebské (mezi Záhřebskou, Americkou a Janou Masaryka)
  {
    id: 'bld-zahrebska-south-masarykova',
    name: 'Blok Záhřebská jih (Záhřebská 2-24 / Jana Masaryka)',
    coordinates: [
      [50.0733, 14.4385],
      [50.0725, 14.4398],
      [50.0715, 14.4394],
      [50.0718, 14.4384],
      [50.0733, 14.4385]
    ]
  },
  // Blok západně od Americké (kruhový objezd / náměstíčko Americká x Záhřebská)
  {
    id: 'bld-americka-zahrebska-west',
    name: 'Blok Americká x Záhřebská jihozápad (nárožní domy)',
    coordinates: [
      [50.0734, 14.4379],
      [50.0734, 14.4362],
      [50.0722, 14.4364],
      [50.0720, 14.4381],
      [50.0734, 14.4379]
    ]
  },
  // Blok severozápadně od Americké / Záhřebské (směrem k Londýnské)
  {
    id: 'bld-zahrebska-londynska-block',
    name: 'Blok Záhřebská / Londýnská (Záhřebská 25-45)',
    coordinates: [
      [50.0746, 14.4352],
      [50.0744, 14.4372],
      [50.0733, 14.4367],
      [50.0734, 14.4347],
      [50.0746, 14.4352]
    ]
  },
  // Blok východně od Bělehradské (mezi Tylovým náměstím a Bruselskou)
  {
    id: 'bld-belehradska-east-tylak',
    name: 'Blok Bělehradská východ (Tylovo náměstí - Bruselská)',
    coordinates: [
      [50.0744, 14.4323],
      [50.0743, 14.4345],
      [50.0729, 14.4340],
      [50.0731, 14.4326],
      [50.0744, 14.4323]
    ]
  },
  // Blok západně od Bělehradské (mezi Tylovým náměstím a Bruselskou)
  {
    id: 'bld-belehradska-west-lublanska',
    name: 'Blok Bělehradská západ (Lublaňská - tramvajová trať)',
    coordinates: [
      [50.0747, 14.4310],
      [50.0746, 14.4318],
      [50.0728, 14.4322],
      [50.0730, 14.4312],
      [50.0747, 14.4310]
    ]
  },
  // Blok Bělehradská / Šafaříkova (jih)
  {
    id: 'bld-belehradska-safarikova',
    name: 'Blok Bělehradská / Šafaříkova (Zeměpisný ústav / domy)',
    coordinates: [
      [50.0725, 14.4334],
      [50.0723, 14.4350],
      [50.0708, 14.4355],
      [50.0710, 14.4339],
      [50.0725, 14.4334]
    ]
  },
  // Blok Francouzská / Blanická / Jana Masaryka
  {
    id: 'bld-francouzska-blanicka',
    name: 'Blok Francouzská jih (Záhřebská - Jana Masaryka)',
    coordinates: [
      [50.0755, 14.4402],
      [50.0751, 14.4435],
      [50.0740, 14.4428],
      [50.0742, 14.4398],
      [50.0755, 14.4402]
    ]
  },
  // Blok Americká jih (Máchova - Havlíčkovy sady)
  {
    id: 'bld-americka-machova-grebovka',
    name: 'Blok Americká / Máchova (vstup Grébovka)',
    coordinates: [
      [50.0714, 14.4388],
      [50.0712, 14.4410],
      [50.0697, 14.4405],
      [50.0699, 14.4384],
      [50.0714, 14.4388]
    ]
  },

  // --- VINOHRADSKÁ KORIDOR ---
  {
    id: 'bld-vino-north-1',
    name: 'Blok Vinohradská sever (Český rozhlas)',
    coordinates: [
      [50.0792, 14.4335],
      [50.0805, 14.4332],
      [50.0803, 14.4368],
      [50.0790, 14.4370],
      [50.0792, 14.4335]
    ]
  },
  {
    id: 'bld-vino-south-1',
    name: 'Blok Vinohradská jih (Rubešova - Londýnská)',
    coordinates: [
      [50.0784, 14.4338],
      [50.0772, 14.4340],
      [50.0770, 14.4375],
      [50.0782, 14.4373],
      [50.0784, 14.4338]
    ]
  },

  // --- I.P. PAVLOVA / SOKOLSKÁ / LEGEROVA ---
  {
    id: 'bld-ipp-central',
    name: 'Blok mezi Sokolskou a Legerovou (I.P. Pavlova sever)',
    coordinates: [
      [50.0768, 14.4298],
      [50.0775, 14.4298],
      [50.0775, 14.4305],
      [50.0768, 14.4305],
      [50.0768, 14.4298]
    ]
  },

  // --- JEČNÁ & KARLOVO NÁMĚSTÍ ---
  {
    id: 'bld-jecna-north-1',
    name: 'Blok Ječná sever (Štěpánská)',
    coordinates: [
      [50.0762, 14.4235],
      [50.0770, 14.4238],
      [50.0768, 14.4265],
      [50.0760, 14.4262],
      [50.0762, 14.4235]
    ]
  },
  {
    id: 'bld-jecna-south-vfn',
    name: 'VFN Karlovo náměstí / Ječná jih',
    coordinates: [
      [50.0751, 14.4230],
      [50.0740, 14.4232],
      [50.0738, 14.4270],
      [50.0749, 14.4268],
      [50.0751, 14.4230]
    ]
  },
  {
    id: 'bld-karlak-faust',
    name: 'Faustův dům a 1. LF UK',
    coordinates: [
      [50.0745, 14.4190],
      [50.0735, 14.4192],
      [50.0737, 14.4215],
      [50.0747, 14.4212],
      [50.0745, 14.4190]
    ]
  },

  // --- NÁRODNÍ TŘÍDA ---
  {
    id: 'bld-narodni-quadrio',
    name: 'Quadrio / Národní třída',
    coordinates: [
      [50.0818, 14.4182],
      [50.0812, 14.4185],
      [50.0814, 14.4208],
      [50.0820, 14.4205],
      [50.0818, 14.4182]
    ]
  },
  {
    id: 'bld-narodni-vorsilky',
    name: 'Klášter voršilek / Nová scéna',
    coordinates: [
      [50.0828, 14.4140],
      [50.0835, 14.4142],
      [50.0833, 14.4170],
      [50.0825, 14.4168],
      [50.0828, 14.4140]
    ]
  }
];

// Dynamický registr budov
let dynamicBuildingList: BuildingPolygon[] = [...PRAGUE_BUILDINGS];

export function getAllBuildingPolygons(): BuildingPolygon[] {
  return dynamicBuildingList;
}

export function registerBuildingPolygons(buildings: BuildingPolygon[]): void {
  const existingIds = new Set(dynamicBuildingList.map(b => b.id));
  for (const b of buildings) {
    if (!existingIds.has(b.id)) {
      dynamicBuildingList.push(b);
      existingIds.add(b.id);
    }
  }
}

/**
 * 1. Detekce kolizí offsetu s budovami:
 * Zkontroluje, zda daná čára (v Leaflet [lat, lng]) protíná jakýkoliv polygon budovy
 * NEBO zda jakýkoliv její vrchol leží uvnitř polygonu budovy.
 */
export function checkLineIntersectsBuildings(
  lineCoords: [number, number][],
  buildings: BuildingPolygon[] = dynamicBuildingList
): boolean {
  if (!lineCoords || lineCoords.length < 2 || buildings.length === 0) return false;

  try {
    const turfCoords = lineCoords.map(([lat, lng]) => [lng, lat]);
    const line = turf.lineString(turfCoords);
    const lineBBox = turf.bbox(line); // [minLng, minLat, maxLng, maxLat]

    for (const b of buildings) {
      if (!b.coordinates || b.coordinates.length < 3) continue;

      // Rychlé filtrování přes Bounding Box
      let bMinLat = Infinity, bMaxLat = -Infinity;
      let bMinLng = Infinity, bMaxLng = -Infinity;
      for (const pt of b.coordinates) {
        if (pt[0] < bMinLat) bMinLat = pt[0];
        if (pt[0] > bMaxLat) bMaxLat = pt[0];
        if (pt[1] < bMinLng) bMinLng = pt[1];
        if (pt[1] > bMaxLng) bMaxLng = pt[1];
      }

      // Pokud se bounding boxy vůbec nepřekrývají, přeskočíme
      if (
        lineBBox[2] < bMinLng || lineBBox[0] > bMaxLng ||
        lineBBox[3] < bMinLat || lineBBox[1] > bMaxLat
      ) {
        continue;
      }

      const polyCoords = b.coordinates.map(([lat, lng]) => [lng, lat]);
      const first = polyCoords[0];
      const last = polyCoords[polyCoords.length - 1];
      if (first[0] !== last[0] || first[1] !== last[1]) {
        polyCoords.push([first[0], first[1]]);
      }

      const poly = turf.polygon([polyCoords]);

      // 1. Kontrola průsečíku linií s hranami budovy
      if (turf.booleanIntersects(line, poly)) {
        return true;
      }

      // 2. Kontrola, zda některý bod leží uvnitř budovy (např. linie uvnitř vnitrobloku)
      for (const pt of turfCoords) {
        if (turf.booleanPointInPolygon(turf.point(pt), poly)) {
          return true;
        }
      }
    }
  } catch {
    // V případě chyby bezpečně vracíme false
  }

  return false;
}
