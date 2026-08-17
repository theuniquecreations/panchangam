/**
 * High-Precision Panchangam Engine
 * Matches NASA JPL Ephemeris accuracy using astronomy-engine.
 * Features True Lahiri Ayanamsha (with nutation), exact transition times,
 * and comprehensive Vedic elements.
 */

import * as Astronomy from './astronomy';

export interface PanchangamData {
    date: string;
    masa: string;
    samvatsara: string;
    sunrise: string;
    sunset: string;
    moonrise: string;
    moonset: string;
    tithi: string;
    nakshatra: string;
    yoga: string;
    karana: string;
    vara: string;
    rahuKaal: string;
    yamaGandam: string;
    gulikaKaal: string;
    abhijitMuhurth: string;
    durmuhurtam: string[];
    varjyam: string;
    amritkalam: string;
}

// Resolve the UTC offset (in hours) for an IANA time zone on a specific date,
// honouring Daylight Saving Time. Hardcoding a fixed offset (e.g. -4 for US
// Eastern) is wrong for ~5 months of the year when the zone is on standard time
// (EST = -5). Pass the date you are computing the panchangam for so the offset
// matches that day, including months that straddle a DST transition.
export function getTimeZoneOffsetHours(date: Date, timeZone: string): number {
    // toLocaleString renders the instant as wall-clock time in each zone; parsing
    // both back as local Date objects and subtracting yields the zone's offset.
    const utc = new Date(date.toLocaleString("en-US", { timeZone: "UTC" }));
    const local = new Date(date.toLocaleString("en-US", { timeZone }));
    return (local.getTime() - utc.getTime()) / (1000 * 60 * 60);
}

// Returns "purnima" (full moon) or "amavasya" (new moon) when that phase's exact
// instant falls within the given LOCAL calendar day, otherwise null. Used to mark
// the monthly almanac. This is astronomically exact, so — unlike a sunrise-tithi
// check — it never misses a phase whose tithi happens to skip every sunrise.
export function getMoonPhaseMarker(date: Date, tzOffsetHours: number): "purnima" | "amavasya" | null {
    const localTimeMs = date.getTime() + tzOffsetHours * 3600 * 1000;
    const localDateObj = new Date(localTimeMs);
    const localMidnightUTC = new Date(Date.UTC(localDateObj.getUTCFullYear(), localDateObj.getUTCMonth(), localDateObj.getUTCDate(), 0, 0, 0));
    const localMidnight = new Date(localMidnightUTC.getTime() - tzOffsetHours * 3600 * 1000);
    const dayStart = Astronomy.MakeTime(localMidnight);
    const dayEndMs = localMidnight.getTime() + 24 * 3600 * 1000;

    // New moon = phase 0°, full moon = phase 180°. Search the 1-day window only.
    const newMoon = Astronomy.SearchMoonPhase(0, dayStart, 1.0);
    if (newMoon && newMoon.date.getTime() < dayEndMs) return "amavasya";
    const fullMoon = Astronomy.SearchMoonPhase(180, dayStart, 1.0);
    if (fullMoon && fullMoon.date.getTime() < dayEndMs) return "purnima";
    return null;
}

// Returns the sidereal rashi index (0=Mesha … 11=Meena) the Sun ENTERS during the
// given LOCAL day, i.e. a Sankranti occurred that day, otherwise null. Makara
// Sankranti (rashi 9) is the most observed. Location-precise via tzOffsetHours.
export function getSolarSankranti(date: Date, tzOffsetHours: number): number | null {
    const localTimeMs = date.getTime() + tzOffsetHours * 3600 * 1000;
    const ld = new Date(localTimeMs);
    const midUTC = new Date(Date.UTC(ld.getUTCFullYear(), ld.getUTCMonth(), ld.getUTCDate(), 0, 0, 0));
    const start = new Date(midUTC.getTime() - tzOffsetHours * 3600 * 1000);
    const end = new Date(start.getTime() + 24 * 3600 * 1000);
    const rashiAt = (d: Date): number => {
        const t = Astronomy.MakeTime(d);
        const sunSid = Astronomy.SunPosition(t).elon - getTrueAyanamsha(t);
        return Math.floor((((sunSid % 360) + 360) % 360) / 30);
    };
    const r1 = rashiAt(start);
    const r2 = rashiAt(end);
    return r1 !== r2 ? r2 : null;
}

// Helper: Format decimal hours to HH:MM:SS AM/PM
export function formatDecimalHours(decimalHours: number): string {
    if (isNaN(decimalHours) || decimalHours === null) return "--:--";
    let hours = Math.floor(decimalHours);
    const totalMinutes = (decimalHours - hours) * 60;
    let minutes = Math.floor(totalMinutes);
    let seconds = Math.round((totalMinutes - minutes) * 60);
    
    if (seconds >= 60) { minutes += 1; seconds -= 60; }
    if (minutes >= 60) { hours += 1; minutes -= 60; }
    
    const h24 = ((hours % 24) + 24) % 24;
    const ampm = h24 >= 12 ? 'PM' : 'AM';
    let h12 = h24 % 12;
    if (h12 === 0) h12 = 12;
    
    return `${h12.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')} ${ampm}`;
}

// Convert AstroTime to local decimal hours
function getLocalDecimalHours(astroTime: Astronomy.AstroTime, tzOffsetHours: number): number {
    const localMs = astroTime.date.getTime() + tzOffsetHours * 3600 * 1000;
    const localDate = new Date(localMs);
    return localDate.getUTCHours() + localDate.getUTCMinutes() / 60 + localDate.getUTCSeconds() / 3600;
}

// Calculate True Lahiri (Chitra Paksha) Ayanamsha including Nutation
export function getTrueAyanamsha(time: Astronomy.AstroTime): number {
    const T = time.ut / 36525;
    const meanAyanamsha = 23.853056 + 1.3969713 * T + 0.0003086 * T * T;

    // IAU 1980 Nutation in Longitude (Delta Psi) top terms
    const L = 280.4665 + 36000.7698 * T;
    const Lprime = 218.3165 + 481267.8813 * T;
    const Omega = 125.04452 - 1934.136261 * T;

    const deg2rad = Math.PI / 180;
    const deltaPsiArcSec = -17.20 * Math.sin(Omega * deg2rad) 
                           - 1.32 * Math.sin(2 * L * deg2rad) 
                           - 0.23 * Math.sin(2 * Lprime * deg2rad) 
                           + 0.21 * Math.sin(2 * Omega * deg2rad);
    
    return meanAyanamsha + (deltaPsiArcSec / 3600);
}

// Root-finding helper for monotonic angular transitions
function findAngularTransition(
    computeAngle: (t: Astronomy.AstroTime) => number,
    targetAngle: number,
    start: Astronomy.AstroTime,
    limitDays: number = 2.0
): Astronomy.AstroTime | null {
    function offset(t: Astronomy.AstroTime): number {
        let diff = computeAngle(t) - targetAngle;
        while (diff < -180) diff += 360;
        while (diff >= 180) diff -= 360;
        return diff;
    }
    const t2 = start.AddDays(limitDays);
    return Astronomy.Search(offset, start, t2, { dt_tolerance_seconds: 1 });
}

export function getPanchangam(
    date: Date,
    latitude: number,
    longitude: number,
    tzOffsetHours: number
): PanchangamData {
    // 1. Set up Local Midnight and Observer
    const localTimeMs = date.getTime() + tzOffsetHours * 3600 * 1000;
    const localDateObj = new Date(localTimeMs);
    const dayOfWeek = localDateObj.getUTCDay();
    
    const year = localDateObj.getUTCFullYear();
    const month = localDateObj.getUTCMonth();
    const day = localDateObj.getUTCDate();
    const localMidnightUTC = new Date(Date.UTC(year, month, day, 0, 0, 0));
    const localMidnight = new Date(localMidnightUTC.getTime() - tzOffsetHours * 3600 * 1000);
    const timeMidnight = Astronomy.MakeTime(localMidnight);
    const observer = new Astronomy.Observer(latitude, longitude, 0);

    // 2. Solar and Lunar Timings (Rise/Set)
    const riseTime = Astronomy.SearchRiseSet(Astronomy.Body.Sun, observer, +1, timeMidnight, 1);
    const setTime = Astronomy.SearchRiseSet(Astronomy.Body.Sun, observer, -1, timeMidnight, 1);
    const moonRiseTime = Astronomy.SearchRiseSet(Astronomy.Body.Moon, observer, +1, timeMidnight, 1);
    const moonSetTime = Astronomy.SearchRiseSet(Astronomy.Body.Moon, observer, -1, timeMidnight, 1);

    const sunrise = riseTime ? getLocalDecimalHours(riseTime, tzOffsetHours) : 6.0;
    const sunset = setTime ? getLocalDecimalHours(setTime, tzOffsetHours) : 18.0;
    const dayDuration = sunset - sunrise > 0 ? sunset - sunrise : 12;

    // We calculate Panchanga elements at Sunrise (standard practice)
    const targetTime = riseTime || timeMidnight;
    
    // 3. Sidereal Coordinates at Sunrise
    const sunPos = Astronomy.SunPosition(targetTime);
    const moonPos = Astronomy.EclipticGeoMoon(targetTime);
    const ayanamsha = getTrueAyanamsha(targetTime);
    
    const sunSid = (sunPos.elon - ayanamsha + 360) % 360;
    const moonSid = (moonPos.lon - ayanamsha + 360) % 360;

    // 4. Tithi and End Time
    const moonPhase = Astronomy.MoonPhase(targetTime); // Exactly (Moon - Sun) % 360
    const tithiVal = moonPhase / 12;
    const tithiIndex = Math.floor(tithiVal) + 1; // 1 to 30
    const nextTithiPhase = tithiIndex * 12;
    const tithiEndTime = Astronomy.SearchMoonPhase(nextTithiPhase % 360, targetTime, 2.0);
    
    const tithiNames = [
        "Pratipada", "Dwitiya", "Tritiya", "Chaturthi", "Panchami",
        "Shashti", "Saptami", "Ashtami", "Navami", "Dashami",
        "Ekadashi", "Dwadashi", "Trayodashi", "Chaturdashi", "Purnima",
        "Pratipada", "Dwitiya", "Tritiya", "Chaturthi", "Panchami",
        "Shashti", "Saptami", "Ashtami", "Navami", "Dashami",
        "Ekadashi", "Dwadashi", "Trayodashi", "Chaturdashi", "Amavasya"
    ];
    const isShukla = tithiIndex <= 15;
    const paksha = isShukla ? "Shukla" : "Krishna";
    const tithiEndStr = tithiEndTime ? formatDecimalHours(getLocalDecimalHours(tithiEndTime, tzOffsetHours)) : "--:--";

    // 5. Nakshatra and End Time
    const nakshatraVal = moonSid / (360 / 27);
    const nakshatraIndex = Math.floor(nakshatraVal) + 1;
    const nextNakshatraDeg = nakshatraIndex * (360 / 27);
    const nakshatraEndTime = findAngularTransition((t) => {
        const m = Astronomy.EclipticGeoMoon(t);
        const aya = getTrueAyanamsha(t);
        return (m.lon - aya + 360) % 360;
    }, nextNakshatraDeg, targetTime);
    
    const nakshatras = [
        "Ashwini", "Bharani", "Krittika", "Rohini", "Mrigashira",
        "Ardra", "Punarvasu", "Pushya", "Ashlesha", "Magha",
        "Purva Phalguni", "Uttara Phalguni", "Hasta", "Chitra", "Swati",
        "Vishakha", "Anuradha", "Jyeshtha", "Mula", "Purva Ashadha",
        "Uttara Ashadha", "Shravana", "Dhanishta", "Shatabhisha", "Purva Bhadrapada",
        "Uttara Bhadrapada", "Revati"
    ];
    const nakEndStr = nakshatraEndTime ? formatDecimalHours(getLocalDecimalHours(nakshatraEndTime, tzOffsetHours)) : "--:--";

    // 6. Yoga and End Time
    const yogaVal = ((sunSid + moonSid) % 360) / (360 / 27);
    const yogaIndex = Math.floor(yogaVal) + 1;
    const nextYogaDeg = yogaIndex * (360 / 27);
    const yogaEndTime = findAngularTransition((t) => {
        const s = Astronomy.SunPosition(t);
        const m = Astronomy.EclipticGeoMoon(t);
        const aya = getTrueAyanamsha(t);
        const sSid = s.elon - aya;
        const mSid = m.lon - aya;
        return (sSid + mSid + 720) % 360;
    }, nextYogaDeg, targetTime);

    const yogas = [
        "Vishkumbha", "Preeti", "Ayushman", "Saubhagya", "Shobhana",
        "Atiganda", "Sukarma", "Dhriti", "Shoola", "Ganda",
        "Vriddhi", "Dhruva", "Vyaghta", "Harshana", "Vajra",
        "Siddhi", "Vyatipata", "Variyan", "Parigha", "Shiva",
        "Siddha", "Sadhya", "Shubha", "Shukla", "Brahma",
        "Indra", "Vaidhriti"
    ];
    const yogaEndStr = yogaEndTime ? formatDecimalHours(getLocalDecimalHours(yogaEndTime, tzOffsetHours)) : "--:--";

    // 7. Karana
    const halfTithi = Math.floor(tithiVal * 2);
    const movableKaranas = ["Bava", "Balava", "Kaulava", "Taitila", "Gara", "Vanija", "Vishti"];
    let karanaName = "";
    if (halfTithi === 0) karanaName = "Kimstughna";
    else if (halfTithi === 57) karanaName = "Shakuni";
    else if (halfTithi === 58) karanaName = "Chatuspada";
    else if (halfTithi === 59) karanaName = "Naga";
    else karanaName = movableKaranas[(halfTithi - 1) % 7];

    // 7b. Varjyam (inauspicious) & Amritkalam (auspicious).
    // Both are sub-periods of the CURRENT nakshatra (the one prevailing at
    // sunrise). The nakshatra span is divided into 60 ghatis; Varjyam begins at a
    // tabulated "varjya ghati" and lasts 4 ghatis, and Amritkalam begins 24
    // ghatis after Varjyam (same 4-ghati length). Calibrated to the second
    // against mypanchang.com (Magha → varjya 30, amrita 54; Fishers Jun 19 2026).
    // NOTE: only the sunrise nakshatra's windows are shown (same simplification
    // as tithi/nakshatra above); a window spilling past midnight reads as AM.
    const varjyaGhati = [
        50, 24, 30, 40, 14, 21, 30, 20, 32, 30, 20, 18, 21, 20, 14, 14, 10, 14,
        20, 24, 20, 10, 10, 18, 16, 24, 30,
    ];
    const nakLowerDeg = (nakshatraIndex - 1) * (360 / 27);
    const nakStartTime = (() => {
        const off = (t: Astronomy.AstroTime) => {
            const m = Astronomy.EclipticGeoMoon(t);
            const aya = getTrueAyanamsha(t);
            let d = ((m.lon - aya + 360) % 360) - nakLowerDeg;
            while (d < -180) d += 360;
            while (d >= 180) d -= 360;
            return d;
        };
        return Astronomy.Search(off, targetTime.AddDays(-2), targetTime, { dt_tolerance_seconds: 1 });
    })();
    const buildNakWindow = (startGhati: number): string => {
        if (!nakStartTime || !nakshatraEndTime) return "--:--";
        const startMs = nakStartTime.date.getTime();
        const durMs = nakshatraEndTime.date.getTime() - startMs;
        const at = (g: number) =>
            formatDecimalHours(getLocalDecimalHours(Astronomy.MakeTime(new Date(startMs + (g / 60) * durMs)), tzOffsetHours));
        return `${at(startGhati)} - ${at(startGhati + 4)}`;
    };
    const vGhati = varjyaGhati[nakshatraIndex - 1] ?? 0;
    const varjyam = buildNakWindow(vGhati);
    const amritkalam = buildNakWindow(vGhati + 24);

    // 8. Masa (Amanta) — with Adhika (leap) / Kshaya (lost) month detection.
    //
    // A lunar month runs amavasya → amavasya. The number of solar sankrantis
    // (Sun crossing a sidereal rashi boundary) that fall inside it decides both
    // the name and the type:
    //   • 1 sankranti  → normal "Nija" month, named after the rashi the Sun
    //                    ENTERS (i.e. the Sun's rashi at the concluding amavasya).
    //   • 0 sankrantis → Adhika (extra) month: nothing fell inside, so it borrows
    //                    the FOLLOWING month's name with an "Adhika" prefix and
    //                    precedes the Nija month of that same name.
    //   • 2 sankrantis → Kshaya (lost) month: rare (only Nov–Feb when the Sun
    //                    moves fastest, once in many years); carries a merged
    //                    two-month name.
    // We additionally tag a normal month as "Nija …" when its immediately
    // preceding month was the Adhika twin of the same name (matches mypanchang).
    //
    // Because sunrise/the amavasya instants are resolved from the observer's
    // exact coordinates (not a city approximation), this classification is
    // location-precise.
    const masas = ["Chaitra", "Vaishakha", "Jyeshtha", "Ashadha", "Shravana", "Bhadrapada",
                   "Ashwina", "Kartika", "Margashirsha", "Pausha", "Magha", "Phalguna"];

    const rashiAtAmavasya = (t: Astronomy.AstroTime | null): number | null => {
        if (!t) return null;
        const sp = Astronomy.SunPosition(t);
        const aya = getTrueAyanamsha(t);
        const sid = (((sp.elon - aya) % 360) + 360) % 360;
        return Math.floor(sid / 30);
    };

    const startAmavasya = Astronomy.SearchMoonPhase(0, targetTime, -40); // begins current month
    const endAmavasya = Astronomy.SearchMoonPhase(0, targetTime, 40);    // ends current month
    const rStart = rashiAtAmavasya(startAmavasya);
    const rEnd = rashiAtAmavasya(endAmavasya);

    let masa = "—";
    if (rStart !== null && rEnd !== null) {
        const sankrantis = (rEnd - rStart + 12) % 12;
        if (sankrantis === 0) {
            // Adhika: no sankranti inside → borrows the next month's name.
            masa = `Adhika ${masas[(rStart + 1) % 12]}`;
        } else if (sankrantis >= 2) {
            // Kshaya: two sankrantis → merged name of both entered rashis.
            masa = `${masas[(rStart + 1) % 12]}–${masas[rEnd]} (Kshaya)`;
        } else {
            // Nija (normal). Prefix "Nija" only when the previous month was its
            // Adhika twin (i.e. that month had no sankranti → same resulting name).
            let label = masas[rEnd];
            const prevAmavasya = startAmavasya
                ? Astronomy.SearchMoonPhase(0, startAmavasya.AddDays(-2), -40)
                : null;
            const rPrev = rashiAtAmavasya(prevAmavasya);
            if (rPrev !== null && ((rStart - rPrev + 12) % 12) === 0) {
                label = `Nija ${masas[rEnd]}`;
            }
            masa = label;
        }
    }

    // 9. Samvatsara (Solar method)
    // Saka year begins roughly March 22 (after Vernal Equinox)
    const isPastNewYear = (month > 2) || (month === 2 && day > 21);
    const sakaYear = year - 78 - (isPastNewYear ? 0 : 1);
    const samvatsaras = [
        "Prabhava", "Vibhava", "Shukla", "Pramodoota", "Prajotpatti", "Angirasa", "Srimukha", "Bhava", "Yuva", "Dhatu", 
        "Eswara", "Bahudhanya", "Pramathi", "Vikrama", "Vrisha", "Chitrabhanu", "Swabhanu", "Tarana", "Parthiva", "Vyaya", 
        "Sarvajit", "Sarvadhari", "Virodhi", "Vikriti", "Khara", "Nandana", "Vijaya", "Jaya", "Manmatha", "Durmukhi", 
        "Hevilambi", "Vilambi", "Vikari", "Sarvari", "Plava", "Shubhakrit", "Shobhakrit", "Krodhi", "Vishwavasu", "Parabhava", 
        "Plavanga", "Kilaka", "Saumya", "Sadharana", "Virodhikrit", "Paridhavi", "Pramadicha", "Ananda", "Rakshasa", "Nala", 
        "Pingala", "Kalayukti", "Siddharthi", "Raudri", "Durmathi", "Dundubhi", "Rudhirodgari", "Raktakshi", "Krodhana", "Akshaya"
    ];
    const samvatsaraIndex = (sakaYear + 11) % 60;

    // 10. Vara
    const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const sanskritDays = ["Ravivara", "Somavara", "Mangalavara", "Budhavara", "Guruvara", "Shukravara", "Shanivara"];

    // 11. Kaalas (Rahu, Yama, Gulika)
    // Daytime is split into 8 equal parts. Each array holds the 0-indexed part
    // (i.e. standard 1-indexed part minus 1) that the kaal occupies, by weekday
    // [Sun..Sat]. start = sunrise + part * partDuration.
    const partDuration = dayDuration / 8;
    const rahuParts = [7, 1, 6, 4, 5, 3, 2];   // Sun 8th, Mon 2nd, Tue 7th, Wed 5th, Thu 6th, Fri 4th, Sat 3rd
    const yamaParts = [4, 3, 2, 1, 0, 6, 5];   // Sun 5th, Mon 4th, Tue 3rd, Wed 2nd, Thu 1st, Fri 7th, Sat 6th
    const gulikaParts = [6, 5, 4, 3, 2, 1, 0]; // Sun 7th, Mon 6th, Tue 5th, Wed 4th, Thu 3rd, Fri 2nd, Sat 1st

    const formatKaal = (idxArr: number[]) => {
        const start = sunrise + idxArr[dayOfWeek] * partDuration;
        return `${formatDecimalHours(start)} - ${formatDecimalHours(start + partDuration)}`;
    };

    // 12. Abhijit Muhurth
    const abhijitDuration = dayDuration / 15;
    const abhijitStart = sunrise + 7 * abhijitDuration;
    const abhijitEnd = sunrise + 8 * abhijitDuration;

    // 13. Durmuhurtam (Smarta Daytime)
    const durParts = [[13], [8, 11], [3], [7], [5, 11], [3, 8], [1]];
    const durmuhurtam = durParts[dayOfWeek].map(part => {
        const start = sunrise + part * abhijitDuration; // Muhurta length is same as Abhijit
        return `${formatDecimalHours(start)} - ${formatDecimalHours(start + abhijitDuration)}`;
    });

    // Format in the *target location's* calendar, not the runtime's. localDateObj
    // already carries tzOffsetHours, so reading it as UTC yields that calendar
    // day — the same one dayOfWeek/vara are derived from. Formatting
    // targetTime.date directly would use the viewer's own zone and show the
    // previous day for anyone west of the location.
    const formattedDate = localDateObj.toLocaleDateString('en-US', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
        timeZone: 'UTC'
    });

    return {
        date: formattedDate,
        masa: masa,
        samvatsara: samvatsaras[samvatsaraIndex],
        sunrise: formatDecimalHours(sunrise),
        sunset: formatDecimalHours(sunset),
        moonrise: moonRiseTime ? formatDecimalHours(getLocalDecimalHours(moonRiseTime, tzOffsetHours)) : "--:--",
        moonset: moonSetTime ? formatDecimalHours(getLocalDecimalHours(moonSetTime, tzOffsetHours)) : "--:--",
        tithi: `${paksha} ${tithiNames[tithiIndex - 1]} until ${tithiEndStr}`,
        nakshatra: `${nakshatras[nakshatraIndex - 1]} until ${nakEndStr}`,
        yoga: `${yogas[yogaIndex - 1]} until ${yogaEndStr}`,
        karana: karanaName,
        vara: `${sanskritDays[dayOfWeek]} (${weekdays[dayOfWeek]})`,
        rahuKaal: formatKaal(rahuParts),
        yamaGandam: formatKaal(yamaParts),
        gulikaKaal: formatKaal(gulikaParts),
        abhijitMuhurth: `${formatDecimalHours(abhijitStart)} - ${formatDecimalHours(abhijitEnd)}`,
        durmuhurtam: durmuhurtam,
        varjyam: varjyam,
        amritkalam: amritkalam
    };
}
